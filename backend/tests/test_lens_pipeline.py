import hashlib

import numpy as np
import pytest
from PIL import Image

from lens_pipeline.evaluation import evaluate, fit_policy, make_batch
from lens_pipeline.manifest import UNKNOWN, audit
from lens_pipeline.symptoms import masked_asymmetric_loss, symptom_metrics


def manifest_row(image_id, split):
    return {
        "id": image_id, "path": image_id + ".png", "source_url": "https://example.com/photos",
        "source_id": "fixture", "creator": "test generator", "license": "fixture only",
        "rights_review": "approved", "plant_instance_id": image_id, "cluster_id": image_id,
        "species_id": "Monstera deliciosa", "split": split, "domain": "indoor",
        "original": True, "human_reviewed": True,
    }


def test_audit_checks_bytes_and_groups(tmp_path):
    rng = np.random.default_rng(33)
    splits = ["train", "val", "test"]
    rows = [manifest_row(split, split) for split in splits]
    for row in rows:
        pixels = rng.integers(0, 255, (180, 180, 3), dtype=np.uint8)
        Image.fromarray(pixels).save(tmp_path / row["path"])
    report = audit(rows, tmp_path, ["Monstera deliciosa"])
    assert report["ok"], report["errors"]
    (tmp_path / "test.png").write_bytes((tmp_path / "train.png").read_bytes())
    rows[2]["plant_instance_id"] = rows[0]["plant_instance_id"]
    rows[2]["cluster_id"] = rows[0]["cluster_id"]
    failures = " ".join(audit(rows, tmp_path, ["Monstera deliciosa"])["errors"])
    for expected in ("exact image duplicate", "near duplicate", "plant_instance_id crosses", "cluster_id crosses"):
        assert expected in failures


def test_predictions_match_holdout_ids_and_hash():
    rows = [manifest_row("heldout", "test")]
    labels = ["Monstera deliciosa", "Epipremnum aureum"]
    artifact = hashlib.sha256(b"fixture").hexdigest()
    predictions = [{"id": "heldout", "labels": labels, "artifact_sha256": artifact, "logits": [2, 1]}]
    truths, logits, groups = make_batch(rows, predictions, "test", labels, artifact)
    assert truths.tolist() == [0]
    assert logits.tolist() == [[2, 1]]
    assert groups.tolist() == [0]
    with pytest.raises(ValueError, match="every test ID"):
        make_batch(rows, predictions * 2, "test", labels, artifact)
    with pytest.raises(ValueError, match="mismatched"):
        make_batch(rows, predictions, "test", labels[::-1], artifact)


def test_calibration_requires_unknowns_and_reports_false_accepts():
    labels = ["Monstera deliciosa", "Epipremnum aureum", UNKNOWN]
    logits = np.array([[3, 0, 0], [0, 3, 0], [0, 0, 3], [3, 0, 0]], dtype=float)
    targets = {"accepted_precision": .98, "coverage": .80, "unknown_false_acceptance": .05}
    with pytest.raises(ValueError, match="unknown"):
        fit_policy(np.array([0, 1]), logits[:2], labels, targets)
    policy = fit_policy(np.array([0, 1, -1]), logits[:3], labels, targets)
    assert policy["validation_passed"]
    result = evaluate(np.array([0, 1, -1, -1]), logits, np.arange(4), labels, policy)
    assert result["accepted_precision"] == 2 / 3
    assert result["coverage"] == 1
    assert result["unknown_false_acceptance"] == .5


def test_unknown_symptoms_mask_gradient_and_metrics():
    torch = pytest.importorskip("torch")
    logits = torch.tensor([[100., -100., 2.]], requires_grad=True)
    target = torch.tensor([[1, 0, -1]])
    loss = masked_asymmetric_loss(logits, target)
    loss.backward()
    assert torch.isfinite(loss)
    assert logits.grad[0, 2] == 0
    annotations = np.full((3, 8), -1)
    annotations[:2, 0] = [1, 0]
    scores = np.full((3, 8), .5)
    scores[:, 0] = [.9, .1, 1]
    report = symptom_metrics(annotations, scores, [.5] * 8)
    assert report["classes"]["healthy"]["annotated"] == 2
    assert report["classes"]["healthy"]["ap"] == 1
    assert report["evaluable_classes"] == 1


def test_symptom_calibration_masks_unknown_and_favors_rare_recall():
    from lens_pipeline.manifest import SYMPTOMS
    from lens_pipeline.symptom_calibration import conformal_set, fit_conformal, fit_symptom_policy

    labels = np.full((5, len(SYMPTOMS)), -1)
    logits = np.zeros(labels.shape)
    column = SYMPTOMS.index("pest_damage_signs")
    labels[:4, column] = [1, 1, 0, 0]
    logits[:, column] = [5, -1, 2, -2, 100]
    policies = fit_symptom_policy(logits, labels)
    policy = policies["pest_damage_signs"]
    assert policy["f_beta"] == 2
    assert policy["annotated"] == 4
    assert policy["positive_support"] == 2
    assert policies["healthy"] is None
    held_calibration = fit_conformal(logits, labels, policies, alpha=.05)
    assert held_calibration["pest_damage_signs"]["quantile"] == 1
    assert conformal_set(100, policy, held_calibration["pest_damage_signs"]) == (0, 1)
    assert conformal_set(100, None, None) == (0, 1)


def test_boundary_precision_does_not_treat_repeated_photos_as_independent():
    labels = ["Monstera deliciosa", "Epipremnum aureum"]
    photos = 200
    result = evaluate(
        np.zeros(photos, dtype=int), np.tile([6., 0.], (photos, 1)),
        np.arange(photos) // 2, labels,
        {"temperature": 1, "acceptance_threshold": .8, "margin": .1},
    )
    assert result["accepted_precision"] == 1
    assert result["accepted_precision_ci95"] is None
    assert result["accepted_total"] == 200
    assert result["accepted_groups"] == result["clean_accepted_groups"] == 100
    assert result["clean_group_lower95"] == pytest.approx(.9736572792168257)

    from services.lens_statistics import clean_group_lower95
    assert clean_group_lower95(132, 132) < .98 <= clean_group_lower95(133, 133)
    assert clean_group_lower95(0, 100) == 0
    assert clean_group_lower95(0, 0) is None
