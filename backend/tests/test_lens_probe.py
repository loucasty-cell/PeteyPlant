"""Offline development probe tests, using synthetic symptom labels and embeddings."""
from copy import deepcopy

import numpy as np
import pytest

from lens_pipeline.manifest import SYMPTOMS
from lens_pipeline.probe import audited_inputs, connected_groups, run_probe, stratified_folds


@pytest.fixture
def development():
    rows, embeddings = [], []
    for index in range(12):
        source = "novel-nursery" if index >= 10 else "development-nursery"
        for view in range(2):
            image_id = f"synthetic-{index:02}-{view}"
            positive = (index + view) % 2
            labels = dict.fromkeys(SYMPTOMS, -1)
            labels["healthy"] = 1 - positive
            labels["chlorosis_yellowing"] = positive
            rows.append({
                "id": image_id, "source_id": source, "plant_instance_id": f"plant-{index}",
                "cluster_id": f"cluster-{index}-{view}", "split": "train" if index < 8 else "val",
                "symptoms": labels, "domain": "indoor", "rights_review": "approved",
                "human_reviewed": True, "original": True,
            })
            embeddings.append({"id": image_id, "embedding": [1, positive + 0.1, 0.1 * index]})
    # A shared duplicate cluster ties a development plant to the unseen source.
    rows[18]["cluster_id"] = rows[20]["cluster_id"]
    return rows, embeddings


def test_connectivity_is_transitive_and_independent_of_input_order(development):
    rows, _ = development
    components = connected_groups(rows)
    assert components[18] == components[19] == components[20] == components[21]
    assert components[17] != components[20]
    assert np.array_equal(components, connected_groups(rows[::-1])[::-1])
    targets = np.array([[row["symptoms"][name] for name in SYMPTOMS] for row in rows])
    first = stratified_folds(components, targets, 2026)
    assert set(first) == set(range(5))
    assert np.array_equal(first, stratified_folds(components, targets, 2026))
    assert all(len(np.unique(first[components == group])) == 1 for group in set(components))


@pytest.mark.parametrize("alteration", ["test", "missing", "duplicate", "extra", "unreviewed", "zero_vector", "nan"])
def test_probe_refuses_unreviewed_or_incomplete_development_inputs(development, alteration):
    rows, embeddings = deepcopy(development)
    if alteration == "test":
        rows[0]["split"] = "test"
    elif alteration == "missing":
        embeddings.pop()
    elif alteration == "duplicate":
        embeddings.append(embeddings[0])
    elif alteration == "extra":
        embeddings.append({"id": "never-seen", "embedding": [1, 2, 3]})
    elif alteration == "unreviewed":
        rows[0]["human_reviewed"] = False
    elif alteration == "zero_vector":
        embeddings[0]["embedding"] = [0, 0, 0]
    else:
        embeddings[0]["embedding"] = [1, float("nan"), 0]
    with pytest.raises(ValueError):
        audited_inputs(rows, embeddings)


def test_stage_zero_scores_synthetic_data_and_quarantines_connected_ood(development):
    pytest.importorskip("torch")
    rows, embeddings = development
    report = run_probe(rows, embeddings, "novel-nursery", seed=5, epochs=1, include_oof=True)
    assert report["evaluation_only"] is True
    assert report["in_domain_images"] == 18
    assert report["in_domain_groups"] == 9
    assert report["quarantined_cross_source_images"] == 2
    assert report["out_of_domain"]["images"] == 4
    assert report["out_of_domain"]["groups"] == 2
    assert len(report["validation_folds"]) == 5
    assert sum(fold["validation_images"] for fold in report["validation_folds"]) == 18
    assert all(fold["validation_groups"] + fold["train_groups"] == 9 for fold in report["validation_folds"])
    assert report["out_of_fold"]["evaluable_classes"] == 2
    assert report["out_of_domain"]["metrics"]["evaluable_classes"] == 2
    assert "pest_damage_signs" in report["out_of_domain"]["training_unsupported_classes"]
    predictions = report["oof_predictions"]
    assert [record["id"] for record in predictions] == [row["id"] for row in rows[:18]]
    assert all(len(record["logits"]) == len(SYMPTOMS) for record in predictions)
    assert all(sum(record["training_support"]) == 2 for record in predictions)
    assert run_probe(rows[::-1], embeddings[::-1], "novel-nursery", seed=5, epochs=1, include_oof=True) == report
