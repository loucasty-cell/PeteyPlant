"""Per-class symptom calibration on OOF rows and conformal sets on a separate split."""

import math

import numpy as np

from .manifest import SYMPTOMS

RARE_SYMPTOMS = {"spots_lesions_rot", "pest_damage_signs"}


def _validated(logits, labels):
    logits, labels = np.asarray(logits, dtype=float), np.asarray(labels)
    if (
        logits.ndim != 2 or logits.shape != labels.shape or logits.shape[1] != len(SYMPTOMS)
        or not np.isfinite(logits).all() or not np.isin(labels, [-1, 0, 1]).all()
    ):
        raise ValueError("expected finite logits and eight masked symptom labels per row")
    return logits, labels


def _probability(logits, temperature):
    return 1 / (1 + np.exp(-np.clip(logits / temperature, -700, 700)))


def fit_symptom_policy(oof_logits, oof_labels):
    """Fit temperatures and F-score thresholds using only out-of-fold predictions."""
    logits, labels = _validated(oof_logits, oof_labels)
    policies = {}
    for index, symptom in enumerate(SYMPTOMS):
        known = labels[:, index] != -1
        truth = labels[known, index] == 1
        support = int(truth.sum())
        if not support or support == len(truth):
            policies[symptom] = None
            continue
        values = logits[known, index]
        signed = np.where(truth, -values, values)
        temperatures = np.geomspace(.1, 10, 81)
        temperature = min(temperatures, key=lambda value: np.logaddexp(0, signed / value).mean())
        scores = _probability(values, temperature)
        order = np.argsort(-scores, kind="stable")
        ranked = scores[order]
        endpoints = np.r_[np.flatnonzero(np.diff(ranked)), len(ranked) - 1]
        true_positives = np.cumsum(truth[order])[endpoints]
        beta_squared = 4 if symptom in RARE_SYMPTOMS else 1
        f_scores = (1 + beta_squared) * true_positives / (beta_squared * support + endpoints + 1)
        best = int(np.argmax(f_scores))
        policies[symptom] = {
            "temperature": float(temperature),
            "threshold": float(ranked[endpoints[best]]),
            "positive_support": support,
            "annotated": int(known.sum()),
            "f_beta": int(math.sqrt(beta_squared)),
        }
    return policies


def fit_conformal(calibration_logits, calibration_labels, policies, alpha=.05):
    """Fit a per-label marginal set on a group-disjoint calibration partition."""
    logits, labels = _validated(calibration_logits, calibration_labels)
    if not 0 < alpha < 1:
        raise ValueError("alpha must be strictly between zero and one")
    quantiles = {}
    for index, symptom in enumerate(SYMPTOMS):
        policy = policies[symptom]
        if policy is None:
            quantiles[symptom] = None
            continue
        known = labels[:, index] != -1
        truth = labels[known, index]
        scores = _probability(logits[known, index], policy["temperature"])
        errors = np.sort(np.where(truth == 1, 1 - scores, scores))
        rank = math.ceil((len(errors) + 1) * (1 - alpha))
        quantiles[symptom] = {
            "quantile": float(errors[rank - 1]) if rank <= len(errors) else 1.,
            "annotated": len(errors),
            "alpha": alpha,
        }
    return quantiles


def conformal_set(logit, policy, fitted):
    """Return the supported labels; ambiguous or empty sets require abstention."""
    if policy is None or fitted is None:
        return (0, 1)
    if not np.isfinite(logit):
        raise ValueError("invalid symptom logit")
    p = float(_probability(logit, policy["temperature"]))
    q = fitted["quantile"]
    return tuple(label for label, error in enumerate((p, 1 - p)) if error <= q)
