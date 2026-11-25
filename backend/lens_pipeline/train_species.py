"""Fit a Petey species head on a frozen, pinned OpenPlants ViT backbone."""

import argparse
import json
import platform
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image, ImageOps

from services.lens_taxonomy import LAUNCH_SPECIES

from .evaluation import evaluate, file_sha256, fit_policy, make_batch
from .manifest import UNKNOWN, audit, read_jsonl

MODEL = "domai-tb/OpenPlants-Identification-ViT-Base-Patch16-224"
REVISION = "30794da002827ad922366fe88840c5a2d8a4a31d"
LABELS = tuple(sorted(LAUNCH_SPECIES))
IMAGE_SIZE = 224
TARGETS = {"accepted_precision": .98, "coverage": .80, "unknown_false_acceptance": .05}


def audited_development(manifest, image_root, labels=LABELS):
    rows = sorted(read_jsonl(manifest), key=lambda row: str(row.get("id", "")))
    # Refuse a holdout manifest before opening any image paths.
    if any(row.get("split") not in {"train", "val"} for row in rows):
        raise ValueError("species training requires a train/val-only development manifest")
    if any(row.get("human_reviewed") is not True or row.get("domain") != "indoor" for row in rows):
        raise ValueError("development rows must be human-reviewed indoor originals")
    integrity = audit(rows, image_root, labels, splits=("train", "val"))
    if not integrity["ok"]:
        raise ValueError("development audit failed: " + "; ".join(integrity["errors"][:12]))
    for split in ("train", "val"):
        missing = set(labels) - set(integrity["species_support"][split])
        if missing:
            raise ValueError(f"{split} is missing supported species: {', '.join(sorted(missing))}")
    if UNKNOWN not in integrity["species_support"]["val"]:
        raise ValueError("validation needs reviewed unknown or nonplant photos for abstention calibration")
    return rows, integrity


def open_photo(image_root, row):
    with Image.open(Path(image_root) / row["path"]) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def pixels(image, size=IMAGE_SIZE):
    """Match the pinned OpenPlants preprocessor and Lens's runtime resize."""
    rgb = np.asarray(image.resize((size, size), Image.Resampling.BILINEAR), dtype=np.float32)
    rgb = (rgb / np.float32(255) - np.float32(.5)) / np.float32(.5)
    return np.ascontiguousarray(rgb.transpose(2, 0, 1))


def cls_features(backbone, tensor):
    return backbone(pixel_values=tensor).last_hidden_state[:, 0, :]


def embed_known_and_validation(backbone, image_root, rows, batch_size, device):
    import torch

    result = []
    with torch.inference_mode():
        for start in range(0, len(rows), batch_size):
            arrays = [pixels(open_photo(image_root, row)) for row in rows[start:start + batch_size]]
            features = cls_features(backbone, torch.from_numpy(np.stack(arrays)).to(device))
            if not torch.isfinite(features).all():
                raise ValueError("the backbone produced nonfinite embeddings")
            result.append(features.cpu())
    return torch.cat(result)


def train_head(features, targets, class_count, *, seed, epochs, batch_size, learning_rate):
    import torch

    generator = torch.Generator().manual_seed(seed)
    with torch.random.fork_rng(devices=[]):
        torch.random.default_generator.manual_seed(seed)
        head = torch.nn.Linear(features.shape[1], class_count)
    optimizer = torch.optim.AdamW(head.parameters(), lr=learning_rate, weight_decay=.01)
    losses = []
    for _ in range(epochs):
        total = 0.0
        for indexes in torch.randperm(len(features), generator=generator).split(batch_size):
            optimizer.zero_grad()
            loss = torch.nn.functional.cross_entropy(head(features[indexes]), targets[indexes])
            if not torch.isfinite(loss):
                raise ValueError("training produced nonfinite loss")
            loss.backward()
            optimizer.step()
            total += loss.item() * len(indexes)
        losses.append(total / len(features))
    return head.eval(), losses


def export_verified_onnx(backbone, head, sample, model_config, directory):
    import torch

    from services.lens_model import InferenceSpec, LocalLensModel

    class SpeciesClassifier(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.backbone = backbone
            self.head = head

        def forward(self, pixels_tensor):
            return self.head(cls_features(self.backbone, pixels_tensor))

    path = directory / "species.onnx"
    model = SpeciesClassifier().cpu().eval()
    tensor = torch.from_numpy(pixels(sample, size=model_config["input_width"])[None])
    with torch.no_grad():
        expected = model(tensor).numpy()[0]
        torch.onnx.export(model, (tensor,), str(path), opset_version=17, dynamo=False,
                          input_names=["pixel_values"], output_names=["logits"])
    checksum = file_sha256(path)
    config = InferenceSpec(**model_config, artifact_sha256=checksum, temperature=1,
                           acceptance_threshold=1, margin=1)
    actual = LocalLensModel(path.read_bytes(), config).logits(sample)
    np.testing.assert_allclose(actual, expected, rtol=1e-4, atol=1e-4)
    return checksum, float(np.max(np.abs(actual - expected)))


def run(args):
    if args.epochs <= 0 or args.batch_size <= 0 or not 0 <= args.seed <= 2**32 - 1:
        raise ValueError("epochs and batch size must be positive and seed must be a 32-bit unsigned integer")
    if not np.isfinite(args.learning_rate) or args.learning_rate <= 0:
        raise ValueError("learning rate must be finite and positive")
    run_dir = Path(args.run_dir).resolve()
    if run_dir.exists() or not run_dir.parent.is_dir():
        raise ValueError("run directory must be new and its parent directory must exist")
    rows, integrity = audited_development(args.manifest, args.images)
    train = [row for row in rows if row["split"] == "train" and row["species_id"] != UNKNOWN]
    val = [row for row in rows if row["split"] == "val"]
    import torch
    from transformers import AutoModelForImageClassification

    if args.device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA was requested but PyTorch cannot access it")
    model = AutoModelForImageClassification.from_pretrained(
        MODEL, revision=REVISION, use_safetensors=True, trust_remote_code=False,
        local_files_only=not args.allow_download, attn_implementation="eager",
    )
    backbone = model.vit.requires_grad_(False).eval().to(args.device)
    features = embed_known_and_validation(backbone, args.images, train + val, args.batch_size, args.device)
    targets = torch.tensor([LABELS.index(row["species_id"]) for row in train], dtype=torch.long)
    head, losses = train_head(features[:len(train)], targets, len(LABELS), seed=args.seed,
                              epochs=args.epochs, batch_size=args.batch_size, learning_rate=args.learning_rate)
    with torch.inference_mode():
        validation_logits = head(features[len(train):]).tolist()
    model_config = {
        "labels": list(LABELS), "input_width": IMAGE_SIZE, "input_height": IMAGE_SIZE,
        "mean": [.5, .5, .5], "std": [.5, .5, .5],
    }
    with TemporaryDirectory(prefix=".petey-training-", dir=run_dir.parent) as tmp:
        stage = Path(tmp) / "ready"
        stage.mkdir()
        with (stage / "head.npz").open("wb") as file:
            np.savez(file, weight=head.weight.detach().numpy(), bias=head.bias.detach().numpy())
        checkpoint_sha = file_sha256(stage / "head.npz")
        if args.export_onnx:
            artifact_sha, parity = export_verified_onnx(
                backbone, head, open_photo(args.images, val[0]), model_config, stage,
            )
        else:
            artifact_sha, parity = None, None
        predictions = [{"id": row["id"], "labels": list(LABELS),
                        "artifact_sha256": checkpoint_sha, "logits": logits}
                       for row, logits in zip(val, validation_logits)]
        gt, logits, groups = make_batch(rows, predictions, "val", LABELS, checkpoint_sha)
        policy = fit_policy(gt, logits, LABELS, TARGETS)
        report = {
            "scope": "development_only", "backbone": MODEL, "revision": REVISION,
            "model_license_as_listed": "Apache-2.0", "frozen_backbone": True,
            "device": args.device, "platform": platform.platform(),
            "device_name": torch.cuda.get_device_name() if args.device == "cuda" else platform.processor(),
            "torch_version": torch.__version__, "transformers_version": version("transformers"),
            "seed": args.seed, "optimizer": "AdamW", "weight_decay": .01, "augmentation": "none",
            "epochs": args.epochs, "batch_size": args.batch_size, "learning_rate": args.learning_rate,
            "model_config": model_config, "audit": integrity, "training_examples": len(train),
            "training_cross_entropy": losses, "head_sha256": checkpoint_sha,
            "onnx_sha256": artifact_sha, "onnx_single_example_max_abs_logit_error": parity,
            "exploratory_validation_policy": policy,
            "policy_fit_validation_metrics": evaluate(gt, logits, groups, LABELS, policy)
            if policy["validation_passed"] else None,
        }
        for name, data in (("training-report.json", report), ("model-config.json", model_config)):
            (stage / name).write_text(json.dumps(data, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        stage.rename(run_dir)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="Audited train/val-only JSONL")
    parser.add_argument("--images", required=True, help="Private directory with the original photos")
    parser.add_argument("--run-dir", required=True, help="New output directory")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--learning-rate", type=float, default=.001)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--allow-download", action="store_true", help="Allow fetching the pinned public backbone")
    parser.add_argument("--export-onnx", action="store_true", help="Export and check a full-image ONNX candidate")
    args = parser.parse_args()
    try:
        run(args)
    except (ValueError, OSError, ImportError, RuntimeError, AssertionError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
