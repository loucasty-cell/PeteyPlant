import argparse
import json
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from lens_pipeline.manifest import UNKNOWN
from lens_pipeline.train_species import LABELS, MODEL, REVISION, audited_development, run, train_head


def test_training_rejects_holdout_before_opening_images(tmp_path):
    manifest = tmp_path / "holdout.jsonl"
    manifest.write_text('{"id":"untouched", "split":"test", "path":"unused.png"}\n', encoding="utf-8")
    with pytest.raises(ValueError, match="train/val-only"):
        audited_development(manifest, tmp_path / "not-present")


def test_head_training_seed_is_reproducible():
    torch = pytest.importorskip("torch")
    x = torch.tensor([[1., 0.], [2., 0.], [0., 1.], [0., 2.]])
    y = torch.tensor([0, 0, 1, 1])
    options = {"seed": 6, "epochs": 8, "batch_size": 4, "learning_rate": .05}
    head, losses = train_head(x, y, 2, **options)
    repeated, repeated_losses = train_head(x, y, 2, **options)
    assert losses == repeated_losses
    assert torch.equal(head(x), repeated(x))
    assert losses[-1] < losses[0]


def test_audited_development_training_exports_runtime_compatible_toy_model(tmp_path, monkeypatch):
    pytest.importorskip("torch")
    pytest.importorskip("onnx")
    pytest.importorskip("onnxruntime")
    transformers = pytest.importorskip("transformers")
    rng = np.random.default_rng(39)
    rows = []
    for split, labels in (("train", LABELS), ("val", (*LABELS, UNKNOWN))):
        for species in labels:
            image_id = f"image-{len(rows)}"
            path = f"{image_id}.png"
            Image.fromarray(rng.integers(0, 256, (160, 160, 3), dtype=np.uint8)).save(tmp_path / path)
            rows.append({
                "id": image_id, "path": path, "species_id": species, "split": split, "domain": "indoor",
                "plant_instance_id": image_id, "cluster_id": image_id, "source_id": "toy-fixtures",
                "source_url": "https://example.invalid/toy", "creator": "pytest", "license": "test-only",
                "rights_review": "approved", "human_reviewed": True, "original": True,
            })
    manifest = tmp_path / "development.jsonl"
    shared = {**rows[-1], "plant_instance_id": rows[0]["plant_instance_id"]}
    manifest.write_text("\n".join(map(json.dumps, [*rows[:-1], shared])), encoding="utf-8")
    with pytest.raises(ValueError, match="plant_instance_id crosses"):
        audited_development(manifest, tmp_path)
    manifest.write_text("\n".join(map(json.dumps, rows)), encoding="utf-8")

    model = transformers.ViTModel(transformers.ViTConfig(
        image_size=224, patch_size=112, hidden_size=8, num_hidden_layers=1,
        num_attention_heads=2, intermediate_size=16, attn_implementation="eager",
    ))

    def load(model_id, **kwargs):
        assert model_id == MODEL
        assert kwargs["revision"] == REVISION and kwargs["local_files_only"]
        assert kwargs["use_safetensors"] and not kwargs["trust_remote_code"]
        return SimpleNamespace(vit=model)

    monkeypatch.setattr(transformers.AutoModelForImageClassification, "from_pretrained", load)
    output = tmp_path / "fixture-run"
    args = argparse.Namespace(
        manifest=manifest, images=tmp_path, run_dir=output, seed=44, epochs=2,
        learning_rate=.01, batch_size=4, device="cpu", export_onnx=True, allow_download=False,
    )
    run(args)
    report = json.loads((output / "training-report.json").read_text(encoding="utf-8"))
    assert report["scope"] == "development_only"
    assert report["training_examples"] == len(LABELS)
    assert "test" not in report["audit"]["images"]
    assert report["onnx_single_example_max_abs_logit_error"] < .0001
    assert (output / "species.onnx").exists()
    with np.load(output / "head.npz", allow_pickle=False) as head:
        assert head["weight"].shape == (len(LABELS), 8)
    with pytest.raises(ValueError, match="must be new"):
        run(args)
