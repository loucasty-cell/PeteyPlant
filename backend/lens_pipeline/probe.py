"""Offline Stage 0 for already-reviewed development photos and frozen embeddings."""
import argparse
import json
from pathlib import Path

import numpy as np

from .manifest import SYMPTOMS, fingerprint, read_jsonl
from .symptoms import fit_linear_probe, symptom_metrics

FOLDS = 5


def connected_groups(rows):
    parent = {}

    def root(key):
        while parent.setdefault(key, key) != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    for row in rows:
        plant = root(("plant", row["plant_instance_id"]))
        cluster = root(("cluster", row["cluster_id"]))
        parent[max(plant, cluster)] = min(plant, cluster)
    roots = [root(("plant", row["plant_instance_id"])) for row in rows]
    indexes = {key: index for index, key in enumerate(sorted(set(roots)))}
    return np.asarray([indexes[key] for key in roots])


def audited_inputs(rows, embeddings):
    if not rows or any(row.get("split") not in {"train", "val"} for row in rows):
        raise ValueError("Stage 0 needs a development-only manifest with train/val rows")
    required_ids = ("id", "source_id", "plant_instance_id", "cluster_id")
    for row in rows:
        if any(not isinstance(row.get(field), str) or not row[field].strip() for field in required_ids):
            raise ValueError("missing image, source, physical plant or cluster ID")
        if (row.get("domain") != "indoor" or row.get("rights_review") != "approved"
                or row.get("human_reviewed") is not True or row.get("original") is not True):
            raise ValueError(f"{row['id']}: Stage 0 requires reviewed and rights-approved original indoor photos")
        labels = row.get("symptoms")
        if not isinstance(labels, dict) or set(labels) != set(SYMPTOMS) or any(
            type(value) is not int or value not in {-1, 0, 1} for value in labels.values()
        ):
            raise ValueError(f"{row['id']}: expected eight explicitly annotated or unknown symptom labels")
        if labels["healthy"] == 1 and any(labels[label] == 1 for label in SYMPTOMS[1:]):
            raise ValueError(f"{row['id']}: healthy conflicts with a positive symptom")
    rows = sorted(rows, key=lambda row: row["id"])
    ids = {row["id"] for row in rows}
    if any(not isinstance(row.get("id"), str) for row in embeddings):
        raise ValueError("every embedding requires a string image ID")
    by_id = {row["id"]: row.get("embedding") for row in embeddings}
    if len(ids) != len(rows) or len(embeddings) != len(by_id) or set(by_id) != ids:
        raise ValueError("embeddings must cover every development image ID exactly once")
    values = [by_id[row["id"]] for row in rows]
    dimensions = len(values[0]) if isinstance(values[0], list) else 0
    max_value = float(np.finfo(np.float32).max)
    if dimensions == 0 or any(
        not isinstance(vector, list) or len(vector) != dimensions or any(
            type(number) not in {float, int} or not -max_value <= number <= max_value for number in vector
        ) for vector in values
    ):
        raise ValueError("embeddings must have a common nonempty finite numeric shape")
    features = np.asarray(values, dtype=np.float32)
    norms = np.linalg.norm(features.astype(np.float64), axis=1, keepdims=True)
    if not np.isfinite(features).all() or (norms == 0).any():
        raise ValueError("embeddings must be finite float32 vectors with a nonzero norm")
    targets = np.asarray([[row["symptoms"][label] for label in SYMPTOMS] for row in rows])
    return rows, (features / norms).astype(np.float32), targets


def stratified_folds(groups, targets, seed):
    """Greedily balance whole groups by image count and annotated class counts."""
    unique = np.unique(groups)
    if len(unique) < FOLDS:
        raise ValueError("five-fold evaluation requires at least five independent in-domain groups")
    vectors = np.stack([
        np.r_[mask.sum(), (targets[mask] == 1).sum(axis=0), (targets[mask] == 0).sum(axis=0)]
        for group in unique if (mask := groups == group).any()
    ])
    expected = np.maximum(vectors.sum(axis=0) / FOLDS, 1)
    normalized = vectors / expected
    generator = np.random.default_rng(seed)
    order = sorted(generator.permutation(len(unique)), key=lambda index: -np.linalg.norm(normalized[index]))
    loads = np.zeros((FOLDS, vectors.shape[1]))
    assignments = {}
    tie_order = generator.permutation(FOLDS)
    for position, group_index in enumerate(order):
        vector = normalized[group_index]
        if position < FOLDS:
            fold = tie_order[position]
        else:
            delta = np.square(loads + vector - 1).sum(axis=1) - np.square(loads - 1).sum(axis=1)
            fold = tie_order[np.argmin(delta[tie_order])]
        loads[fold] += vector
        assignments[unique[group_index]] = int(fold)
    return np.asarray([assignments[group] for group in groups])


def score_partition(features, targets, train_mask, eval_mask, epochs, seed):
    import torch

    training = targets[train_mask]
    trained = (training == 1).any(axis=0) & (training == 0).any(axis=0)
    if not trained.any():
        raise ValueError("the probe partition has no symptom with both positive and negative training labels")
    training = np.where(trained, training, -1)
    head = fit_linear_probe(features[train_mask], training, seed=seed, epochs=epochs)
    with torch.inference_mode():
        inputs = torch.nn.functional.normalize(torch.from_numpy(features[eval_mask]), dim=1)
        logits = head(inputs)
        scores = torch.sigmoid(logits).numpy()
    unsupported = [label for label, ok in zip(SYMPTOMS, trained) if not ok]
    return np.where(trained, targets[eval_mask], -1), scores, logits.numpy(), unsupported


def metrics_for(targets, scores):
    metrics = symptom_metrics(targets, scores, np.full(len(SYMPTOMS), 0.5))
    metrics["unsupported_classes"] = [name for name, result in metrics["classes"].items() if result["ap"] is None]
    return metrics


def label_support(targets):
    return {
        label: {"positive": int((targets[:, index] == 1).sum()), "annotated": int((targets[:, index] != -1).sum())}
        for index, label in enumerate(SYMPTOMS)
    }


def run_probe(rows, embeddings, ood_source, *, seed=2026, epochs=15, include_oof=False):
    if epochs <= 0 or seed < 0:
        raise ValueError("epochs must be positive and seed must be nonnegative")
    rows, vectors, targets = audited_inputs(rows, embeddings)
    groups = connected_groups(rows)
    ood = np.asarray([row["source_id"] == ood_source for row in rows])
    if not ood.any():
        raise ValueError("the specified OOD source has no reviewed indoor records")
    connected_ood = np.isin(groups, groups[ood])
    in_domain = ~connected_ood
    folds = np.full(len(rows), -1, dtype=int)
    folds[in_domain] = stratified_folds(groups[in_domain], targets[in_domain], seed)
    out_of_fold_targets, out_of_fold_scores, fold_reports, predictions = [], [], [], []
    for index in range(FOLDS):
        train = in_domain & (folds != index)
        observe = folds == index
        labels, scores, logits, unsupported = score_partition(vectors, targets, train, observe, epochs, seed)
        if include_oof:
            supported = [label not in unsupported for label in SYMPTOMS]
            predictions.extend({
                "id": rows[row_index]["id"], "fold": index, "labels": list(SYMPTOMS),
                "logits": values.tolist(), "training_support": supported,
            } for row_index, values in zip(np.flatnonzero(observe), logits))
        fold_reports.append({
            "fold": index, "train_images": int(train.sum()), "validation_images": int(observe.sum()),
            "train_groups": int(np.unique(groups[train]).size), "validation_groups": int(np.unique(groups[observe]).size),
            "heldout_label_support": label_support(targets[observe]),
            "training_unsupported_classes": unsupported, "metrics": metrics_for(labels, scores),
        })
        out_of_fold_targets.append(labels)
        out_of_fold_scores.append(scores)
    ood_targets, ood_scores, _, ood_unsupported = score_partition(vectors, targets, in_domain, ood, epochs, seed)
    report = {
        "stage": "frozen_embedding_linear_probe", "evaluation_only": True, "seed": seed, "epochs": epochs,
        "development_manifest_sha256": fingerprint(rows),
        "embeddings_sha256": fingerprint(sorted(embeddings, key=lambda row: row["id"])),
        "assignment_sha256": fingerprint([
            {"id": row["id"], "group": int(group), "fold": int(fold)} for row, group, fold in zip(rows, groups, folds)
        ]),
        "in_domain_images": int(in_domain.sum()), "in_domain_groups": int(np.unique(groups[in_domain]).size),
        "quarantined_cross_source_images": int((connected_ood & ~ood).sum()),
        "validation_folds": fold_reports,
        "out_of_fold": metrics_for(np.concatenate(out_of_fold_targets), np.concatenate(out_of_fold_scores)),
        "out_of_domain": {
            "source_id": ood_source, "images": int(ood.sum()), "groups": int(np.unique(groups[ood]).size),
            "heldout_label_support": label_support(targets[ood]),
            "training_unsupported_classes": ood_unsupported, "metrics": metrics_for(ood_targets, ood_scores),
        },
    }
    if include_oof:
        report["oof_predictions"] = sorted(predictions, key=lambda row: row["id"])
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="Development-only reviewed JSONL manifest, excluding test")
    parser.add_argument("--embeddings", required=True, help="JSONL with an id and a frozen embedding vector per image")
    parser.add_argument("--ood-source", required=True, help="Reviewed indoor source_id reserved from all training")
    parser.add_argument("--seed", default=2026, type=int)
    parser.add_argument("--epochs", default=15, type=int)
    parser.add_argument("--oof-output", type=Path, help="Write in-domain raw out-of-fold logits to a new JSONL file")
    args = parser.parse_args()
    try:
        report = run_probe(read_jsonl(args.manifest), read_jsonl(args.embeddings), args.ood_source,
                           seed=args.seed, epochs=args.epochs, include_oof=args.oof_output is not None)
        if args.oof_output is not None:
            with args.oof_output.open("x", encoding="utf-8") as output:
                for record in report.pop("oof_predictions"):
                    output.write(json.dumps(record, allow_nan=False) + "\n")
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
