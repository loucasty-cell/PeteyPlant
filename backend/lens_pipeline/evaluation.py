"""Fit abstention on validation, then evaluate the frozen rule on a named split."""

import hashlib
import re
from functools import lru_cache
from pathlib import Path

import numpy as np

from services.lens_statistics import clean_group_lower95
from services.lens_taxonomy import LAUNCH_SPECIES, map_label

from .manifest import UNKNOWN


def file_sha256(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def make_batch(rows, predictions, split, labels, artifact_sha256):
    labels = tuple(labels)
    if len(labels) < 2 or len(set(labels)) != len(labels):
        raise ValueError("at least two unique output labels are required")
    if not re.fullmatch(r"[0-9a-f]{64}", artifact_sha256):
        raise ValueError("invalid artifact SHA-256")
    selected = {row["id"]: row for row in rows if row["split"] == split}
    by_id = {row.get("id"): row for row in predictions}
    if not selected or len(predictions) != len(by_id) or set(selected) != set(by_id):
        raise ValueError(f"predictions must cover every {split} ID exactly once")
    supported = serving_labels(labels)
    indexes = {label: index for index, label in enumerate(supported) if label is not None}
    truths, logits, groups = [], [], []
    parent = {}

    def find(group):
        while parent.setdefault(group, group) != group:
            parent[group] = parent[parent[group]]
            group = parent[group]
        return group

    for row in selected.values():
        plant = find(("plant", row["plant_instance_id"]))
        cluster = find(("cluster", row["cluster_id"]))
        parent[cluster] = plant
    for image_id, row in sorted(selected.items()):
        prediction = by_id[image_id]
        if prediction.get("artifact_sha256") != artifact_sha256 or prediction.get("labels") != list(labels):
            raise ValueError(f"{image_id}: mismatched classifier hash or output label order")
        values = prediction.get("logits")
        if not isinstance(values, list) or len(values) != len(labels) or not all(
            type(value) in {int, float} and np.isfinite(value) for value in values
        ):
            raise ValueError(f"{image_id}: invalid logits")
        if row["species_id"] != UNKNOWN and row["species_id"] not in indexes:
            raise ValueError(f"{image_id}: known species missing from classifier label order")
        truths.append(-1 if row["species_id"] == UNKNOWN else indexes[row["species_id"]])
        logits.append(values)
        groups.append(find(("plant", row["plant_instance_id"])))
    ids = {group: index for index, group in enumerate(sorted(set(groups)))}
    return np.asarray(truths), np.asarray(logits), np.asarray([ids[group] for group in groups])


def probabilities(logits, temperature):
    shifted = (logits - logits.max(axis=1, keepdims=True)) / temperature
    values = np.exp(shifted)
    return values / values.sum(axis=1, keepdims=True)


@lru_cache(maxsize=64)
def serving_labels(labels):
    keys = [map_label(label).species_key for label in labels]
    return tuple(key if key in LAUNCH_SPECIES else None for key in keys)


def decisions(scores, labels, threshold, margin):
    order = np.argsort(-scores, axis=1, kind="stable")
    top = order[:, 0]
    top_scores = scores[np.arange(len(scores)), top]
    runner_up = scores[np.arange(len(scores)), order[:, 1]]
    supported = np.asarray([label is not None for label in serving_labels(tuple(labels))])[top]
    return order, top_scores, supported & (top_scores >= threshold) & (top_scores - runner_up >= margin)


def fit_policy(truths, logits, labels, targets):
    known = truths >= 0
    if not known.any() or known.all():
        raise ValueError("validation requires both in-scope photos and unknown examples")
    temperatures = np.geomspace(0.1, 10, 81)
    known_rows = np.arange(known.sum())
    temperature = min(temperatures, key=lambda value: -np.log(np.clip(
        probabilities(logits[known], value)[known_rows, truths[known]], 1e-15, 1,
    )).mean())
    scores = probabilities(logits, temperature)
    order, top_scores, supported = decisions(scores, labels, 0, 0)
    gaps = top_scores - scores[np.arange(len(scores)), order[:, 1]]
    correct = order[:, 0] == truths
    best = None
    for threshold in np.linspace(.25, 1, 76):
        for margin in (0.0, .05, .1, .15, .2, .3):
            accepted = supported & (top_scores >= threshold) & (gaps >= margin)
            total = accepted.sum()
            if not total:
                continue
            precision = (correct & accepted).sum() / total
            coverage = (accepted & known).sum() / known.sum()
            unknown_false = accepted[~known].mean()
            if (
                precision < targets["accepted_precision"]
                or coverage < targets["coverage"]
                or unknown_false >= targets["unknown_false_acceptance"]
            ):
                continue
            ranking = (coverage, precision, -unknown_false)
            if best is None or ranking > best[0]:
                best = ranking, threshold, margin
    return {
        "temperature": float(temperature),
        "acceptance_threshold": float(best[1]) if best else None,
        "margin": float(best[2]) if best else None,
        "targets": targets,
        "validation_passed": best is not None,
    }


def ratio(numerator, denominator):
    return float(numerator / denominator) if denominator else None


def bootstrap_ci(groups, numerator, denominator):
    group_count = int(groups.max()) + 1
    hits = np.bincount(groups, weights=numerator, minlength=group_count)
    totals = np.bincount(groups, weights=denominator, minlength=group_count)
    if np.count_nonzero(totals) < 2 or np.all(hits == totals) or not np.any(hits):
        return None
    generator = np.random.default_rng(2026)
    estimates = []
    for _ in range(1000):
        draw = generator.integers(group_count, size=group_count)
        total = totals[draw].sum()
        if total:
            estimates.append(hits[draw].sum() / total)
    if not estimates:
        return None
    lower, upper = np.percentile(estimates, [2.5, 97.5]).tolist()
    return [lower, upper] if lower < upper else None


def evaluate(truths, logits, groups, labels, policy):
    scores = probabilities(logits, policy["temperature"])
    order, top_scores, accepted = decisions(
        scores, labels, policy["acceptance_threshold"], policy["margin"],
    )
    known = truths >= 0
    correct = order[:, 0] == truths
    accepted_correct = accepted & correct
    accepted_group_count = len(set(groups[accepted]))
    clean_accepted_groups = accepted_group_count - len(set(groups[accepted & ~correct]))
    top3 = known & (order[:, :3] == truths[:, None]).any(axis=1)
    reliability = []
    for index in range(15):
        bucket = known & (np.minimum((top_scores * 15).astype(int), 14) == index)
        count = int(bucket.sum())
        if count:
            reliability.append({
                "bin": index,
                "count": count,
                "confidence": float(top_scores[bucket].mean()),
                "accuracy": float(correct[bucket].mean()),
            })
    n_known = int(known.sum())
    one_hot = np.eye(len(labels))[truths[known]]
    metrics = {
        "accepted_precision": (accepted_correct, accepted),
        "coverage": (accepted & known, known),
        "unknown_false_acceptance": (accepted & ~known, ~known),
        "known_top1": (correct, known),
        "known_top3": (top3, known),
    }
    report = {
        "heldout_known": n_known,
        "heldout_unknown": int((~known).sum()),
        "physical_groups": int(np.unique(groups).size),
        "heldout_known_groups": int(np.unique(groups[known]).size),
        "heldout_unknown_groups": int(np.unique(groups[~known]).size),
        "ece_bins": 15,
        "accepted_total": int(accepted.sum()),
        "accepted_correct": int(accepted_correct.sum()),
        "accepted_groups": accepted_group_count,
        "clean_accepted_groups": clean_accepted_groups,
        "clean_group_lower95": clean_group_lower95(clean_accepted_groups, accepted_group_count),
        "known_brier": float(np.square(scores[known] - one_hot).sum(axis=1).mean()) if n_known else None,
        "ece": ratio(sum(
            bucket["count"] * abs(bucket["confidence"] - bucket["accuracy"])
            for bucket in reliability
        ), n_known),
        "reliability_bins": reliability,
        "per_species": {},
    }
    for metric, (numerator, denominator) in metrics.items():
        report[metric] = ratio(numerator.sum(), denominator.sum())
        report[metric + "_ci95"] = bootstrap_ci(groups, numerator, denominator)
    for index, label in enumerate(serving_labels(tuple(labels))):
        truth = truths == index
        seen = int(truth.sum())
        if label is not None:
            report["per_species"][label] = {
                "images": seen, "groups": int(np.unique(groups[truth]).size),
                "top1_recall": ratio((truth & correct).sum(), seen),
                "accepted": int((truth & accepted).sum()),
            }
    report["known_support_by_species"] = {key: value["images"] for key, value in report["per_species"].items()}
    supported_top = np.asarray([key is not None for key in serving_labels(tuple(labels))])[order[:, 0]]
    ranked = np.argsort(-top_scores[supported_top], kind="stable")
    ranked_scores = top_scores[supported_top][ranked]
    ranked_correct = correct[supported_top][ranked]
    endpoints = np.r_[np.flatnonzero(np.diff(ranked_scores)) + 1, len(ranked)] if len(ranked) else []
    curve = [
        {"coverage_all": int(end) / len(truths), "precision": float(ranked_correct[:end].mean())}
        for end in endpoints
    ]
    report["risk_coverage_all_photos"] = {
        "curve": curve,
        "maximum_coverage": ratio(len(ranked), len(truths)),
        "aurc_to_maximum_coverage": float(sum(
            (point["coverage_all"] - (curve[index - 1]["coverage_all"] if index else 0))
            * (1 - point["precision"])
            for index, point in enumerate(curve)
        )) if curve else None,
    }
    return report


def validate_policy(policy, audit):
    if policy.get("validation_passed") is not True:
        raise ValueError("no operating point passed the validation targets")
    for key in ("manifest_sha256", "decoded_images_sha256"):
        if policy.get(key) != audit[key]:
            raise ValueError(f"dataset differs from the frozen validation policy ({key})")
    for field, lower, upper in (
        ("temperature", 0.01, 100), ("acceptance_threshold", 0, 1), ("margin", 0, 1),
    ):
        value = policy.get(field)
        if type(value) not in {int, float} or not lower <= value <= upper:
            raise ValueError(f"invalid {field}")
