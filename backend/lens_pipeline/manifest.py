"""Audit a frozen, rights-reviewed manifest against the actual photo bytes."""

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageOps

SPLITS = ("train", "val", "test")
SYMPTOMS = (
    "healthy", "chlorosis_yellowing", "necrosis_brown_tips_edges",
    "spots_lesions_rot", "wilting_turgor_loss", "pest_damage_signs",
    "etiolation_light_stress", "mechanical_or_senescence",
)
UNKNOWN = "__unknown__"


def read_jsonl(path):
    rows = []
    for number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        record = json.loads(line)
        if not isinstance(record, dict):
            raise ValueError(f"{path}:{number}: expected a JSON object")
        rows.append(record)
    if not rows:
        raise ValueError(f"{path}: no records")
    return rows


def fingerprint(rows):
    canonical = json.dumps(rows, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def photo_fingerprints(path):
    with Image.open(path) as raw:
        if raw.format not in {"JPEG", "PNG", "WEBP"} or getattr(raw, "n_frames", 1) != 1:
            raise ValueError("expected a single JPEG, PNG or WebP image")
        if raw.width * raw.height > 25_000_000:
            raise ValueError("image exceeds the 25-megapixel audit limit")
        image = ImageOps.exif_transpose(raw).convert("RGB")
        if min(image.size) < 160 or max(image.size) / min(image.size) > 3.5:
            raise ValueError("image dimensions fall outside the audit limits")
        pixels = image.tobytes()
        size = f"{image.width}x{image.height}:".encode()
        exact = hashlib.sha256(size + pixels).hexdigest()
        thumbnail = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
        samples = thumbnail.tobytes()
        difference = 0
        for y in range(8):
            for x in range(8):
                index = y * 9 + x
                difference = (difference << 1) | (samples[index] > samples[index + 1])
        return exact, difference


def audit(rows, image_root, species):
    """Return reproducible counts and errors. Pairs use decoded orientation and dHash."""
    image_root = Path(image_root).resolve()
    species = set(species)
    required = (
        "id", "path", "source_url", "creator", "license", "rights_review",
        "source_id", "plant_instance_id", "cluster_id", "split", "species_id", "domain",
    )
    ids = set()
    groups, clusters, exact_hashes = {}, {}, {}
    signatures, errors, digest_rows = [], [], []
    counts, split_groups, support = Counter(), defaultdict(set), defaultdict(Counter)
    symptoms = defaultdict(Counter)
    for row in rows:
        label = row.get("id", "<missing id>")
        missing = [key for key in required if not isinstance(row.get(key), str) or not row[key].strip()]
        if missing:
            errors.append(f"{label}: missing or invalid {', '.join(missing)}")
            continue
        if label in ids:
            errors.append(f"{label}: duplicate record ID")
        ids.add(label)
        split = row["split"]
        if split not in SPLITS:
            errors.append(f"{label}: invalid split {split}")
            continue
        if row["rights_review"] != "approved":
            errors.append(f"{label}: rights review is required")
        if row.get("original") is not True:
            errors.append(f"{label}: only original photos belong in the frozen manifest")
        if split in {"val", "test"} and (
            row.get("human_reviewed") is not True or row["domain"] != "indoor"
        ):
            errors.append(f"{label}: evaluation requires human-reviewed indoor originals")
        if row["species_id"] != UNKNOWN and row["species_id"] not in species:
            errors.append(f"{label}: species ID is outside the selected taxonomy")

        annotations = row.get("symptoms")
        if annotations is not None:
            if not isinstance(annotations, dict) or set(annotations) != set(SYMPTOMS) or any(
                type(value) is not int or value not in {-1, 0, 1} for value in annotations.values()
            ):
                errors.append(f"{label}: symptoms must use all eight labels and values -1, 0 or 1")
            elif annotations["healthy"] == 1 and any(annotations[key] == 1 for key in SYMPTOMS[1:]):
                errors.append(f"{label}: healthy conflicts with a positive symptom")
            else:
                for key, value in annotations.items():
                    if value == 1:
                        symptoms[split][key] += 1

        for key, seen in (("plant_instance_id", groups), ("cluster_id", clusters)):
            previous = seen.setdefault(row[key], split)
            if previous != split:
                errors.append(f"{label}: {key} crosses {previous} and {split}")

        counts[split] += 1
        split_groups[split].add(row["plant_instance_id"])
        support[split][row["species_id"]] += 1
        try:
            path = (image_root / row["path"]).resolve()
            if not path.is_relative_to(image_root):
                raise ValueError("image path escapes the dataset root")
            exact, difference = photo_fingerprints(path)
        except (OSError, ValueError, Image.DecompressionBombError) as error:
            errors.append(f"{label}: {error}")
            continue
        previous_id = exact_hashes.setdefault(exact, label)
        if previous_id != label:
            errors.append(f"{label}: exact image duplicate of {previous_id}")
        for other, other_split, other_hash in signatures:
            if other_split != split and (other_hash ^ difference).bit_count() <= 6:
                errors.append(f"{label}: cross-split near duplicate candidate {other}")
        signatures.append((label, split, difference))
        digest_rows.append({"id": label, "decoded_sha256": exact})

    for split in SPLITS:
        if not counts[split]:
            errors.append(f"missing {split} records")
    return {
        "ok": not errors,
        "manifest_sha256": fingerprint(sorted(rows, key=lambda row: str(row.get("id", "")))),
        "decoded_images_sha256": fingerprint(sorted(digest_rows, key=lambda row: row["id"])),
        "images": dict(counts),
        "physical_plants": {key: len(value) for key, value in split_groups.items()},
        "species_support": {key: dict(value) for key, value in support.items()},
        "positive_symptom_images": {key: dict(value) for key, value in symptoms.items()},
        "errors": errors,
    }
