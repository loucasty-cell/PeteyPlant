"""Offline multi-label metrics and a frozen-embedding probe for symptom research."""

import numpy as np

from .manifest import SYMPTOMS


def masked_asymmetric_loss(logits, targets, gamma_neg=3.0, clip=0.05):
    """Unknown (-1) labels contribute neither loss nor gradient."""
    import torch
    from torch.nn import functional as F

    known = targets != -1
    positive = targets == 1
    positive_loss = F.softplus(-logits)
    negative_probability = (torch.sigmoid(-logits) + clip).clamp(max=1.0, min=1e-8)
    negative_loss = -(1.0 - negative_probability).pow(gamma_neg) * negative_probability.log()
    loss = torch.where(positive, positive_loss, negative_loss)
    return (loss * known).sum() / known.sum().clamp(min=1)


def fit_linear_probe(features, targets, seed=2026, epochs=15):
    """Train a reference head against already-audited, frozen embeddings."""
    import torch

    features = np.asarray(features, dtype=np.float32)
    targets = np.asarray(targets)
    if features.ndim != 2 or not len(features) or not np.isfinite(features).all():
        raise ValueError("probe inputs must be a nonempty finite embedding matrix")
    if targets.shape != (len(features), len(SYMPTOMS)) or not np.isin(targets, [-1, 0, 1]).all():
        raise ValueError("expected an eight-class masked target row per image")
    if not (targets == 1).any() or not (targets == 0).any():
        raise ValueError("probe requires annotated positives and negatives")

    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(seed)
        matrix = torch.nn.functional.normalize(torch.from_numpy(features), dim=1)
        target = torch.from_numpy(targets)
        head = torch.nn.Linear(matrix.shape[1], len(SYMPTOMS))
        optimizer = torch.optim.AdamW(head.parameters(), lr=0.005, weight_decay=0.02)
        shuffle = torch.Generator().manual_seed(seed)
        for _ in range(epochs):
            for batch in torch.randperm(len(matrix), generator=shuffle).split(64):
                optimizer.zero_grad()
                loss = masked_asymmetric_loss(head(matrix[batch]), target[batch])
                loss.backward()
                optimizer.step()
        return head.eval()


def symptom_metrics(targets, scores, thresholds):
    """Unknown labels are masked independently per class, including calibration."""
    targets, scores, thresholds = map(np.asarray, (targets, scores, thresholds))
    if (
        targets.ndim != 2 or targets.shape != scores.shape or targets.shape[1] != len(SYMPTOMS)
        or thresholds.shape != (len(SYMPTOMS),) or not np.isin(targets, [-1, 0, 1]).all()
        or not ((scores >= 0) & (scores <= 1)).all()
        or not ((thresholds >= 0) & (thresholds <= 1)).all()
    ):
        raise ValueError("invalid targets, probabilities or thresholds")

    output = {}
    for index, label in enumerate(SYMPTOMS):
        annotated = targets[:, index] != -1
        truth = targets[annotated, index] == 1
        probability = scores[annotated, index]
        positive = int(truth.sum())
        if not len(truth) or not positive or positive == len(truth):
            output[label] = {"positive": positive, "annotated": len(truth), "ap": None, "f1": None, "f2": None}
            continue
        ranked = np.argsort(-probability)
        edges = np.r_[np.flatnonzero(np.diff(probability[ranked])), len(ranked) - 1]
        true_positives = np.cumsum(truth[ranked])[edges]
        average_precision = (np.diff(np.r_[0, true_positives]) * true_positives / (edges + 1)).sum() / positive
        predicted = probability >= thresholds[index]
        hit = int((predicted & truth).sum())
        false_positive = int((predicted & ~truth).sum())
        missed = positive - hit
        bins = np.minimum((probability * 15).astype(int), 14)
        gaps = [
            (int(bucket.sum()), abs(float(truth[bucket].mean() - probability[bucket].mean())))
            for slot in np.unique(bins) if (bucket := bins == slot).any()
        ]
        output[label] = {
            "positive": positive, "annotated": len(truth), "ap": float(average_precision),
            "f1": 2 * hit / (2 * hit + missed + false_positive),
            "f2": 5 * hit / (5 * hit + 4 * missed + false_positive),
            "threshold": float(thresholds[index]),
            "ece": sum(count * gap for count, gap in gaps) / len(truth),
            "mce": max(gap for _, gap in gaps),
            "brier": float(np.square(probability - truth).mean()),
        }
    available = [row["ap"] for row in output.values() if row["ap"] is not None]
    return {
        "macro_map": float(np.mean(available)) if available else None,
        "evaluable_classes": len(available),
        "classes": output,
    }
