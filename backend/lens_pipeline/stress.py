"""Offline checks on scored photos and synthetic, evaluation-only image variants."""

import argparse
from io import BytesIO
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .evaluation import file_sha256
from .manifest import SPLITS, read_jsonl


def _records_by_id(records):
    keyed = {}
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("records must be JSON-style objects")
        image_id = record.get("id")
        if not isinstance(image_id, str) or not image_id.strip() or image_id in keyed:
            raise ValueError("records require unique, nonempty image IDs")
        keyed[image_id] = record
    return keyed


def _unit_vectors(records, ids):
    vectors = np.asarray([records[image_id].get("embedding") for image_id in ids], dtype=np.float64)
    if vectors.ndim != 2 or not vectors.shape[1] or not np.isfinite(vectors).all():
        raise ValueError("embeddings must be finite vectors with a fixed nonzero dimension")
    scales = np.max(np.abs(vectors), axis=1, keepdims=True)
    if (scales == 0).any():
        raise ValueError("zero-length embeddings cannot be compared")
    vectors /= scales
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def embedding_leakage(rows, embeddings, batch_size=512):
    """Compare each test image against every training image at the fixed 0.95 gate."""
    if type(batch_size) is not int or batch_size <= 0:
        raise ValueError("batch size must be a positive integer")
    manifest = _records_by_id(rows)
    if any(row.get("split") not in SPLITS for row in manifest.values()):
        raise ValueError("manifest rows must belong to train, val or test")
    splits = {
        split: sorted(image_id for image_id, row in manifest.items() if row["split"] == split)
        for split in SPLITS
    }
    train_ids, test_ids = splits["train"], splits["test"]
    if not train_ids or not test_ids:
        raise ValueError("embedding leakage audit requires both train and test images")

    by_id = _records_by_id(embeddings)
    if set(by_id) != set(train_ids) | set(test_ids):
        raise ValueError("embeddings must cover every train and test ID exactly once")
    group_keys = ("plant_instance_id", "cluster_id")
    for image_id in manifest:
        if any(
            not isinstance(manifest[image_id].get(key), str) or not manifest[image_id][key].strip()
            for key in group_keys
        ):
            raise ValueError(f"{image_id}: plant-instance and duplicate-cluster IDs are required")

    train = _unit_vectors(by_id, train_ids)
    test = _unit_vectors(by_id, test_ids)
    if train.shape[1] != test.shape[1]:
        raise ValueError("train and test embedding dimensions differ")

    scores = np.full(len(test), -np.inf)
    indices = np.zeros(len(test), dtype=int)
    for test_start in range(0, len(test), batch_size):
        window = slice(test_start, test_start + batch_size)
        samples = test[window]
        positions = np.arange(len(samples))
        for train_start in range(0, len(train), batch_size):
            similarities = np.clip(samples @ train[train_start:train_start + batch_size].T, -1.0, 1.0)
            nearest = similarities.argmax(axis=1)
            nearest_scores = similarities[positions, nearest]
            better = nearest_scores > scores[window]
            scores[window][better] = nearest_scores[better]
            indices[window][better] = train_start + nearest[better]

    matches = []
    for test_index in np.flatnonzero(scores >= .95):
        test_id, train_id = test_ids[test_index], train_ids[indices[test_index]]
        matches.append({
            "test_id": test_id,
            "train_id": train_id,
            "cosine": float(scores[test_index]),
            **{f"test_{key}": manifest[test_id][key] for key in group_keys},
            **{f"train_{key}": manifest[train_id][key] for key in group_keys},
        })
    matches.sort(key=lambda row: (-row["cosine"], row["test_id"]))
    group_reviews = {}
    for key in group_keys:
        test_groups = {manifest[image_id][key] for image_id in test_ids}
        groups_by_split = {
            name: {manifest[image_id][key] for image_id in images}
            for name, images in splits.items()
        }
        shared = {
            f"{left}_{right}": sorted(groups_by_split[left] & groups_by_split[right])
            for left, right in (("train", "val"), ("train", "test"), ("val", "test"))
        }
        group_reviews[key] = {
            "test_total": len(test_groups),
            "test_flagged": len({match[f"test_{key}"] for match in matches}),
            "shared_ids_by_split_pair": shared,
        }

    histogram, edges = np.histogram(scores, bins=np.linspace(-1, 1, 21))
    count = len(matches)
    return {
        "train_images": len(train_ids),
        "test_images": len(test_ids),
        "flagged_test_images": count,
        "flagged_fraction": count / len(test_ids),
        "cosine_threshold": .95,
        "maximum_flagged_fraction": .01,
        "ok": count * 100 <= len(test_ids) and not any(
            ids for review in group_reviews.values() for ids in review["shared_ids_by_split_pair"].values()
        ),
        "nearest_cosine": {
            **{f"p{q}": float(np.percentile(scores, q)) for q in (50, 95, 99)},
            "max": float(scores.max()),
            "histogram": {"counts": histogram.tolist(), "edges": edges.tolist()},
        },
        "groups": group_reviews,
        "nearest_pairs_for_review": matches,
    }


def ood_metrics(records):
    """Score plant-vs-nonplant detection from a dedicated plant score, higher means plant."""
    rows = _records_by_id(records)
    if any(
        type(row.get("is_plant")) is not bool or type(row.get("plant_score")) not in {int, float}
        or not 0 <= row["plant_score"] <= 1
        for row in rows.values()
    ):
        raise ValueError("each image requires an is_plant boolean and a plant_score between 0 and 1")
    ranked = sorted(rows.values(), key=lambda row: (-row["plant_score"], row["id"]))
    positives = sum(row["is_plant"] for row in ranked)
    negatives = len(ranked) - positives
    if not positives or not negatives:
        raise ValueError("OOD metrics require both plant positives and non-plant negatives")

    scores = np.asarray([row["plant_score"] for row in ranked])
    truth = np.asarray([row["is_plant"] for row in ranked])
    threshold_ends = np.r_[np.flatnonzero(scores[:-1] != scores[1:]), len(scores) - 1]
    true_positives = np.cumsum(truth)[threshold_ends]
    false_positives = threshold_ends + 1 - true_positives
    recall = true_positives / positives
    fpr = false_positives / negatives
    precision = true_positives / (threshold_ends + 1)
    selected = int(np.flatnonzero(true_positives * 100 >= positives * 95)[0])
    threshold = float(scores[threshold_ends[selected]])
    false_acceptances = [
        {"id": row["id"], "plant_score": row["plant_score"]}
        for row in ranked if not row["is_plant"] and row["plant_score"] >= threshold
    ]
    return {
        "positive_class": "real_plant",
        "plant_images": positives,
        "nonplant_images": negatives,
        "plant_prevalence": positives / len(ranked),
        "minimum_300_negatives_met": negatives >= 300,
        "auroc": float(np.sum(np.diff(np.r_[0, fpr]) * (np.r_[0, recall[:-1]] + recall) / 2)),
        "aupr_average_precision": float(np.sum(np.diff(np.r_[0, recall]) * precision)),
        "fpr_at_95_tpr": float(fpr[selected]),
        "attained_tpr": float(recall[selected]),
        "threshold_at_95_tpr": threshold,
        "false_accepted": int(false_positives[selected]),
        "worst_false_acceptances": false_acceptances[:10],
    }


# A camera/software approximation using RGB gains, without a measured illuminant or sensor response.
WARM_GAINS = (1.25, .83, .45)
SEVERITIES = {
    "warm_2700k_approximation": (.2, .4, .6, .8, 1.0),
    "underexposure_ev": (-.3, -.6, -.9, -1.2, -1.5),
    "overexposure_ev": (.3, .6, .9, 1.2, 1.5),
    "motion_blur_px": (3, 5, 7, 9, 11),
    "defocus_blur_px": (1, 2, 3, 4, 5),
    "jpeg_quality": (80, 60, 50, 40, 20),
    "synthetic_occlusion_fraction": (.15, .225, .30, .375, .45),
}


def perturb_image(original, kind, severity, seed=2026):
    """Create one synthetic evaluation image without mutating or saving the original."""
    if kind not in SEVERITIES:
        raise ValueError(f"unknown synthetic perturbation: {kind}")
    if type(severity) is not int or not 1 <= severity <= 5:
        raise ValueError("severity must be an integer from 1 to 5")
    amount = SEVERITIES[kind][severity - 1]
    image = ImageOps.exif_transpose(original).convert("RGB")
    if kind == "jpeg_quality":
        compressed = BytesIO()
        image.save(compressed, "JPEG", quality=amount)
        with Image.open(compressed) as degraded:
            return degraded.convert("RGB")
    if kind == "defocus_blur_px":
        return image.filter(ImageFilter.GaussianBlur(amount))
    if kind == "motion_blur_px":
        kernel = np.zeros((amount, amount), dtype=np.float32)
        kernel[amount // 2] = 1 / amount
        return Image.fromarray(cv2.filter2D(np.asarray(image), -1, kernel))

    if kind == "synthetic_occlusion_fraction":
        width, height = image.size
        mask_width = max(1, round(width * amount ** .5))
        mask_height = max(1, round(height * amount ** .5))
        generator = np.random.default_rng(seed)
        x = int(generator.integers(0, width - mask_width + 1))
        y = int(generator.integers(0, height - mask_height + 1))
        image.paste((104, 82, 67), (x, y, x + mask_width, y + mask_height))
        return image

    srgb = np.asarray(image, dtype=np.float32) / 255
    linear = np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)
    if kind == "warm_2700k_approximation":
        linear *= 1 + amount * (np.asarray(WARM_GAINS) - 1)
    else:
        linear *= 2 ** amount
    linear = np.clip(linear, 0, 1)
    srgb = np.where(linear <= .0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - .055)
    return Image.fromarray(np.rint(srgb * 255).astype(np.uint8))


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    leakage = commands.add_parser("leakage")
    leakage.add_argument("--manifest", required=True, help="Frozen manifest JSONL")
    leakage.add_argument("--embeddings", required=True, help="JSONL with id and embedding for every train/test image")
    leakage.add_argument("--embedding-model", required=True, help="Embedding model and revision, as provided by the evaluator")
    leakage.add_argument("--output", required=True, help="New JSON report")
    ood = commands.add_parser("ood")
    ood.add_argument("--scores", required=True, help="JSONL with id, is_plant and dedicated plant_score")
    ood.add_argument("--detector", required=True, help="Plant detector and revision, as provided by the evaluator")
    ood.add_argument("--output", required=True, help="New JSON report")
    perturb = commands.add_parser("perturb")
    perturb.add_argument("--image", required=True)
    perturb.add_argument("--kind", choices=tuple(SEVERITIES), required=True)
    perturb.add_argument("--severity", type=int, choices=range(1, 6), required=True)
    perturb.add_argument("--seed", type=int, default=2026)
    perturb.add_argument("--output", required=True, help="New synthetic evaluation PNG")
    args = parser.parse_args()

    if args.command == "perturb":
        with Image.open(args.image) as original:
            perturbed = perturb_image(original, args.kind, args.severity, args.seed)
        with Path(args.output).open("xb") as handle:
            perturbed.save(handle, "PNG")
        return 0
    if args.command == "leakage":
        report = embedding_leakage(read_jsonl(args.manifest), read_jsonl(args.embeddings))
        report.update({
            "manifest_file_sha256": file_sha256(args.manifest),
            "embedding_file_sha256": file_sha256(args.embeddings),
            "declared_embedding_model": args.embedding_model,
        })
    else:
        report = ood_metrics(read_jsonl(args.scores))
        report.update({
            "scores_file_sha256": file_sha256(args.scores),
            "declared_detector": args.detector,
        })
    with Path(args.output).open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
    return 1 if args.command == "leakage" and not report["ok"] else 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from error
