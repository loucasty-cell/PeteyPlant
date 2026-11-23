"""Run python -m lens_pipeline from backend with private, versioned input files."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

from services.lens_model import InferenceSpec, LocalLensModel

from .evaluation import evaluate, file_sha256, fit_policy, make_batch, validate_policy
from .manifest import audit, read_jsonl


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_report(path, payload):
    with Path(path).open("x", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False, allow_nan=False)
        handle.write("\n")


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("audit", "predict", "calibrate", "evaluate"))
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--images", required=True)
    parser.add_argument("--taxonomy", required=True, help="JSON array of permitted species IDs")
    parser.add_argument("--output", required=True, help="new JSON file")
    parser.add_argument("--predictions")
    parser.add_argument("--artifact")
    parser.add_argument("--model-config", help="JSON with labels, input_height, input_width, mean, std")
    parser.add_argument("--policy", help="frozen validation policy")
    parser.add_argument("--split", choices=("val", "test"), help="prediction partition")
    args = parser.parse_args()

    rows = read_jsonl(args.manifest)
    taxonomy = read_json(args.taxonomy)
    if not isinstance(taxonomy, list) or not all(isinstance(label, str) for label in taxonomy):
        parser.error("taxonomy must be a JSON array of species IDs")
    integrity = audit(rows, args.images, taxonomy)
    if args.command == "audit":
        write_report(args.output, integrity)
        return 0 if integrity["ok"] else 1
    if not integrity["ok"]:
        parser.error("dataset failed integrity checks. Run audit and review its report")
    if not all((args.artifact, args.model_config)):
        parser.error("predict, calibrate and evaluate require artifact and model config")

    model = read_json(args.model_config)
    keys = ("labels", "input_height", "input_width", "mean", "std")
    config = {key: model[key] for key in keys}
    labels = config["labels"]
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        parser.error("model labels must be a JSON array of output IDs")
    artifact_hash = file_sha256(args.artifact)
    evidence = {
        "artifact_sha256": artifact_hash,
        "manifest_sha256": integrity["manifest_sha256"],
        "decoded_images_sha256": integrity["decoded_images_sha256"],
        **config,
    }
    spec = InferenceSpec(
        **config, artifact_sha256=artifact_hash, temperature=1, acceptance_threshold=1, margin=1,
    )
    if args.command == "predict":
        if not args.split:
            parser.error("predict requires --split")
        model = LocalLensModel(Path(args.artifact).read_bytes(), spec)
        predictions = []
        for row in rows:
            if row["split"] == args.split:
                with Image.open(Path(args.images) / row["path"]) as original:
                    logits = model.logits(ImageOps.exif_transpose(original).convert("RGB"))
                predictions.append({
                    "id": row["id"], "artifact_sha256": artifact_hash, "labels": labels,
                    "logits": logits.tolist(),
                })
        with Path(args.output).open("x", encoding="utf-8") as handle:
            for prediction in predictions:
                handle.write(json.dumps(prediction, allow_nan=False) + "\n")
        return 0

    if not args.predictions:
        parser.error("calibrate and evaluate require --predictions")
    predictions = read_jsonl(args.predictions)
    split = "val" if args.command == "calibrate" else "test"
    if args.command == "evaluate":
        if not args.policy:
            parser.error("evaluate requires the validation policy")
        policy = read_json(args.policy)
        for key, value in evidence.items():
            if policy.get(key) != value:
                parser.error(f"frozen validation policy differs in {key}")
        validate_policy(policy, integrity)
    truths, logits, groups = make_batch(rows, predictions, split, labels, artifact_hash)
    if args.command == "calibrate":
        targets = {"accepted_precision": .98, "coverage": .80, "unknown_false_acceptance": .05}
        policy = fit_policy(truths, logits, labels, targets)
        write_report(args.output, {**evidence, **policy, "split": split})
        return 0 if policy["validation_passed"] else 1

    report = evaluate(truths, logits, groups, labels, policy)
    report.update({
        **evidence, "split": split, "policy_sha256": file_sha256(args.policy),
        **{key: policy[key] for key in ("temperature", "acceptance_threshold", "margin")},
    })
    write_report(args.output, report)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(str(error)) from error
