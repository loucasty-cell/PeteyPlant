"""Tests use invented vectors, scores and pixels to verify the stress harness."""

import json
import subprocess
import sys

import numpy as np
from PIL import Image
import pytest

from lens_pipeline.stress import SEVERITIES, embedding_leakage, ood_metrics, perturb_image


def element(image_id, split, plant_id=None, cluster_id=None):
    return {
        "id": image_id,
        "split": split,
        "plant_instance_id": plant_id or f"plant-{image_id}",
        "cluster_id": cluster_id or f"cluster-{image_id}",
    }


def vector(image_id, *values):
    return {"id": image_id, "embedding": list(values)}


def test_leakage_reports_unique_images_and_group_support_across_batches():
    rows = [
        element("train-a", "train"),
        element("train-b", "train"),
        element("train-c", "train"),
        element("hit-1", "test", "same-plant"),
        element("hit-2", "test", "same-plant"),
        element("miss", "test"),
    ]
    vectors = [
        vector("train-a", 1, 0),
        vector("train-b", 0, 1),
        vector("train-c", -1, 0),
        vector("hit-1", 0, 2),
        vector("hit-2", 0, 1),
        vector("miss", 1, -1),
    ]
    report = embedding_leakage(rows, vectors, batch_size=1)
    assert report == embedding_leakage(reversed(rows), reversed(vectors), batch_size=4)
    assert report["train_images"] == 3
    assert report["test_images"] == 3
    assert report["flagged_test_images"] == 2
    assert report["flagged_fraction"] == pytest.approx(2 / 3)
    assert report["groups"]["plant_instance_id"]["test_total"] == 2
    assert report["groups"]["plant_instance_id"]["test_flagged"] == 1
    assert report["nearest_cosine"]["max"] == pytest.approx(1)
    assert sum(report["nearest_cosine"]["histogram"]["counts"]) == 3
    assert {pair["train_id"] for pair in report["nearest_pairs_for_review"]} == {"train-b"}
    assert report["ok"] is False


@pytest.mark.parametrize(("test_count", "passed"), [(99, False), (100, True), (101, True)])
def test_leakage_gate_counts_the_entire_test_split(test_count, passed):
    rows = [element("train", "train")] + [element(f"test-{i}", "test") for i in range(test_count)]
    vectors = [vector("train", 1, 0), vector("test-0", 1, 0)]
    vectors += [vector(f"test-{i}", 0, 1) for i in range(1, test_count)]
    report = embedding_leakage(rows, vectors)
    assert report["flagged_fraction"] == pytest.approx(1 / test_count)
    assert report["ok"] is passed


def test_already_known_cross_split_ids_fail_independently_of_embeddings():
    rows = [
        element("tr", "train", plant_id="shared"),
        element("v", "val", plant_id="shared", cluster_id="vandt"),
        element("t", "test", cluster_id="vandt"),
    ]
    report = embedding_leakage(rows, [vector("tr", 1, 0), vector("t", 0, 1)])
    assert not report["ok"]
    assert report["flagged_test_images"] == 0
    assert report["groups"]["plant_instance_id"]["shared_ids_by_split_pair"]["train_val"] == ["shared"]
    assert report["groups"]["cluster_id"]["shared_ids_by_split_pair"]["val_test"] == ["vandt"]


@pytest.mark.parametrize("broken", [
    [],
    [vector("tr", 1, 0), vector("tr", 1, 0)],
    [vector("tr", 0, 0), vector("t", 1, 0)],
    [vector("tr", 1, 0), vector("t", float("nan"), 0)],
    [vector("tr", 1, 0), vector("t", 1, 0, 0)],
])
def test_leakage_rejects_incomplete_or_invalid_embeddings(broken):
    with pytest.raises(ValueError):
        embedding_leakage([element("tr", "train"), element("t", "test")], broken)


def score(image_id, plant, value):
    return {"id": image_id, "is_plant": plant, "plant_score": value}


def test_ood_reports_hand_calculated_metrics_and_false_acceptance():
    report = ood_metrics([
        score("top-plant", True, .9),
        score("toy", False, .8),
        score("next-plant", True, .7),
        score("chair", False, .6),
    ])
    assert report["positive_class"] == "real_plant"
    assert report["plant_images"] == report["nonplant_images"] == 2
    assert report["auroc"] == pytest.approx(.75)
    assert report["aupr_average_precision"] == pytest.approx(5 / 6)
    assert report["fpr_at_95_tpr"] == pytest.approx(.5)
    assert report["attained_tpr"] == pytest.approx(1)
    assert report["threshold_at_95_tpr"] == pytest.approx(.7)
    assert report["worst_false_acceptances"] == [{"id": "toy", "plant_score": .8}]
    assert not report["minimum_300_negatives_met"]


def test_ood_threshold_keeps_ties_and_reaches_exact_95_percent():
    records = [score(f"plant-{i}", True, .8) for i in range(19)]
    records += [score("plant-low", True, .3), score("tied-toy", False, .8), score("bed", False, .1)]
    report = ood_metrics(records)
    assert report["attained_tpr"] == pytest.approx(.95)
    assert report["threshold_at_95_tpr"] == pytest.approx(.8)
    assert report["fpr_at_95_tpr"] == pytest.approx(.5)
    tie_only = ood_metrics([score("plant", True, .5), score("toy", False, .5)])
    assert tie_only["auroc"] == pytest.approx(.5)
    assert tie_only["aupr_average_precision"] == pytest.approx(.5)
    assert tie_only["fpr_at_95_tpr"] == pytest.approx(1)


@pytest.mark.parametrize("records", [
    [],
    [score("p", True, .9)],
    [score("p", True, .9), score("q", False, float("nan"))],
    [score("p", True, .9), score("q", False, 1.1)],
    [{"id": "p", "is_plant": True, "top_species_score": .9}],
])
def test_ood_requires_explicit_finite_plant_scores_on_both_classes(records):
    with pytest.raises(ValueError):
        ood_metrics(records)


@pytest.fixture
def textured_image():
    return Image.fromarray(np.random.default_rng(333).integers(50, 205, size=(123, 143, 3), dtype=np.uint8))


@pytest.mark.parametrize("kind", SEVERITIES)
def test_synthetic_perturbations_are_repeatable_and_keep_input_intact(kind, textured_image):
    original_bytes = textured_image.tobytes()
    first = perturb_image(textured_image, kind, 4, seed=15)
    second = perturb_image(textured_image, kind, 4, seed=15)
    assert first.size == textured_image.size
    assert first.mode == "RGB"
    assert first.tobytes() == second.tobytes()
    assert first.tobytes() != original_bytes
    assert textured_image.tobytes() == original_bytes


def test_warm_and_exposure_transforms_have_expected_direction():
    sample = Image.new("RGB", (100, 100), (128, 128, 128))
    r, g, b = perturb_image(sample, "warm_2700k_approximation", 5).getpixel((0, 0))
    assert r > 128 > g > b
    darker = perturb_image(sample, "underexposure_ev", 5).getpixel((0, 0))
    brighter = perturb_image(sample, "overexposure_ev", 5).getpixel((0, 0))
    assert darker[0] < 128 < brighter[0]
    assert len(set(darker)) == len(set(brighter)) == 1


def test_seeded_occlusion_masks_approximately_30_percent_and_respects_exif():
    sample = Image.new("RGB", (200, 100), (128, 128, 128))
    sample.getexif()[274] = 6
    first = perturb_image(sample, "synthetic_occlusion_fraction", 3, seed=1)
    second = perturb_image(sample, "synthetic_occlusion_fraction", 3, seed=2)
    assert first.size == (100, 200)
    assert second.size == first.size
    mask = np.any(np.asarray(first) != 128, axis=2)
    assert mask.mean() == pytest.approx(.30, abs=.01)
    assert first.tobytes() != second.tobytes()


def test_cli_returns_nonzero_for_leakage_and_keeps_report(tmp_path):
    manifest, embeddings, report = [tmp_path / name for name in ("dataset.jsonl", "embed.jsonl", "report.json")]
    for path, records in [
        (manifest, [element("p1", "train"), element("p2", "test")]),
        (embeddings, [vector("p1", 0, 1), vector("p2", 0, 1)]),
    ]:
        path.write_text("\n".join(map(json.dumps, records)), encoding="utf8")
    command = [
        sys.executable, "-m", "lens_pipeline.stress", "leakage", "--manifest", str(manifest),
        "--embeddings", str(embeddings), "--embedding-model", "synthetic-vectors-test-fixture", "--output", str(report),
    ]
    result = subprocess.run(command, capture_output=True, check=False)
    assert result.returncode == 1
    payload = json.loads(report.read_text(encoding="utf8"))
    assert payload["declared_embedding_model"] == "synthetic-vectors-test-fixture"
    assert payload["flagged_test_images"] == payload["test_images"] == 1
    assert subprocess.run(command, capture_output=True, check=False).returncode == 1
    assert json.loads(report.read_text(encoding="utf8")) == payload
