"""Sync app metadata from published expansion character specs."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DESTINATION = ROOT / "frontend/src/lib/three/speciesExpansion.json"


def main():
    assets = []
    for path in sorted((ROOT / "assets/characters").glob("*/spec.json")):
        spec = json.loads(path.read_text(encoding="utf-8"))
        if "stageScale" not in spec or spec["status"] != "INTEGRATED":
            continue
        for field in ("source", "runtime", "thumbnail"):
            if not (ROOT / spec[field]).is_file():
                raise ValueError(f"{path}: missing {field}")
        asset = {field: spec[field] for field in (
            "speciesId", "acceptedName", "commonName", "design", "stageScale", "fallback",
        )}
        assets.append({"assetId": spec["id"], **asset})
    if len({asset["speciesId"] for asset in assets}) != len(assets):
        raise ValueError("Duplicate Garden species in expansion assets")
    DESTINATION.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Registered {len(assets)} expansion companions")


if __name__ == "__main__":
    main()

