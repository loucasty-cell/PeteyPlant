from pathlib import Path
import re

from services.garden import SpeciesCatalog, verified_care_source


def test_dev_preview_species_match_species_catalog_and_advice_status():
    garden_api = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "gardenApi.ts"
    text = garden_api.read_text(encoding="utf-8")
    match = re.search(r"const DEV_PREVIEW_SPECIES:[^=]*=\s*\[(.*?)\];", text, re.DOTALL)
    assert match is not None, "Could not locate DEV_PREVIEW_SPECIES in gardenApi.ts"
    pairs = re.findall(r"id:\s*'([^']+)'.*?advice_status:\s*'(verified|none)'", match.group(1), re.DOTALL)
    assert len(pairs) == 8
    for species_id, preview_status in pairs:
        species = SpeciesCatalog.get(species_id)
        assert species is not None, f"Preview species missing from SpeciesCatalog: {species_id}"
        expected = "verified" if verified_care_source(species) is not None else "none"
        assert preview_status == expected, f"Preview advice_status drift for {species_id}: {preview_status} != {expected}"
