"""Structured extraction into GoldenPlantRecord, with phylogenetic fallback.

When cultivar metrics are missing, impute from GENUS_DEFAULTS first, then
from the native Koppen-Geiger biome table (BIOME_DEFAULTS), then from a
global houseplant fallback. Every imputed field is recorded and costs
0.05 confidence.
"""
from __future__ import annotations

from .taxonomy_resolver import GENUS_TO_FAMILY, normalize, resolve

try:
    from data.seed_10k_species import FAMILY_TO_ARCHETYPE
except Exception:  # pragma: no cover - extractor usable standalone
    FAMILY_TO_ARCHETYPE = {}

try:
    from models.schemas import GoldenPlantRecord
except Exception:  # pragma: no cover - direct module import fallback
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from models.schemas import GoldenPlantRecord

# Genus -> care defaults (moisture %, VPD kPa, lux, soil pH).
GENUS_DEFAULTS: dict[str, dict] = {
    "Monstera": {"min_soil_moisture_pct": 30.0, "max_soil_moisture_pct": 70.0,
                 "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.4,
                 "min_lux": 800.0, "optimal_lux": 3000.0, "soil_ph_range": [5.5, 7.0]},
    "Dracaena": {"min_soil_moisture_pct": 10.0, "max_soil_moisture_pct": 40.0,
                 "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.8,
                 "min_lux": 500.0, "optimal_lux": 3000.0, "soil_ph_range": [6.0, 7.5]},
    "Goeppertia": {"min_soil_moisture_pct": 40.0, "max_soil_moisture_pct": 80.0,
                   "ideal_vpd_min_kpa": 0.5, "ideal_vpd_max_kpa": 1.0,
                   "min_lux": 500.0, "optimal_lux": 2000.0, "soil_ph_range": [5.5, 6.5]},
    "Ficus": {"min_soil_moisture_pct": 30.0, "max_soil_moisture_pct": 65.0,
              "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.4,
              "min_lux": 1000.0, "optimal_lux": 4000.0, "soil_ph_range": [6.0, 7.0]},
    "Echeveria": {"min_soil_moisture_pct": 10.0, "max_soil_moisture_pct": 35.0,
                  "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.8,
                  "min_lux": 2000.0, "optimal_lux": 8000.0, "soil_ph_range": [6.0, 7.5]},
    "Cereus": {"min_soil_moisture_pct": 5.0, "max_soil_moisture_pct": 25.0,
               "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 2.2,
               "min_lux": 3000.0, "optimal_lux": 10000.0, "soil_ph_range": [6.0, 7.5]},
    "Echinopsis": {"min_soil_moisture_pct": 5.0, "max_soil_moisture_pct": 25.0,
                   "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 2.2,
                   "min_lux": 3000.0, "optimal_lux": 10000.0, "soil_ph_range": [6.0, 7.5]},
    "Nephrolepis": {"min_soil_moisture_pct": 40.0, "max_soil_moisture_pct": 80.0,
                    "ideal_vpd_min_kpa": 0.5, "ideal_vpd_max_kpa": 1.0,
                    "min_lux": 500.0, "optimal_lux": 2000.0, "soil_ph_range": [5.5, 6.5]},
    "Phalaenopsis": {"min_soil_moisture_pct": 25.0, "max_soil_moisture_pct": 60.0,
                     "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.3,
                     "min_lux": 800.0, "optimal_lux": 3000.0, "soil_ph_range": [5.5, 6.5]},
    "Dionaea": {"min_soil_moisture_pct": 50.0, "max_soil_moisture_pct": 90.0,
                "ideal_vpd_min_kpa": 0.5, "ideal_vpd_max_kpa": 1.0,
                "min_lux": 2000.0, "optimal_lux": 8000.0, "soil_ph_range": [4.0, 5.5]},
    "Haworthiopsis": {"min_soil_moisture_pct": 10.0, "max_soil_moisture_pct": 35.0,
                      "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.8,
                      "min_lux": 1500.0, "optimal_lux": 6000.0, "soil_ph_range": [6.0, 7.5]},
    "Epipremnum": {"min_soil_moisture_pct": 25.0, "max_soil_moisture_pct": 65.0,
                   "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.4,
                   "min_lux": 500.0, "optimal_lux": 2500.0, "soil_ph_range": [6.0, 7.0]},
}

# Genus -> most likely native Koppen-Geiger biome (used when biome is absent).
GENUS_BIOME: dict[str, str] = {
    "Monstera": "Af", "Goeppertia": "Af", "Dracaena": "Aw", "Ficus": "Af",
    "Echeveria": "BSh", "Cereus": "BWh", "Echinopsis": "BWh",
    "Nephrolepis": "Af", "Phalaenopsis": "Af", "Dionaea": "Cfa",
    "Haworthiopsis": "BSh", "Epipremnum": "Af", "Yucca": "BWh",
    "Dypsis": "Af", "Chamaedorea": "Am",
}

# Koppen-Geiger biome -> care defaults.
# Af/Am: tropical rainforest/monsoon -> high humidity, high moisture floor,
#   low VPD, moderate light. BWh: hot desert -> low water, high light, high VPD.
BIOME_DEFAULTS: dict[str, dict] = {
    "Af": {"min_soil_moisture_pct": 40.0, "max_soil_moisture_pct": 80.0,
           "ideal_vpd_min_kpa": 0.5, "ideal_vpd_max_kpa": 1.0,
           "min_lux": 500.0, "optimal_lux": 2000.0, "soil_ph_range": [5.5, 6.5]},
    "Am": {"min_soil_moisture_pct": 40.0, "max_soil_moisture_pct": 80.0,
           "ideal_vpd_min_kpa": 0.5, "ideal_vpd_max_kpa": 1.1,
           "min_lux": 500.0, "optimal_lux": 2500.0, "soil_ph_range": [5.5, 6.5]},
    "Aw": {"min_soil_moisture_pct": 30.0, "max_soil_moisture_pct": 65.0,
           "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.4,
           "min_lux": 800.0, "optimal_lux": 3000.0, "soil_ph_range": [6.0, 7.0]},
    "BWh": {"min_soil_moisture_pct": 5.0, "max_soil_moisture_pct": 25.0,
            "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 2.2,
            "min_lux": 3000.0, "optimal_lux": 10000.0, "soil_ph_range": [6.0, 7.5]},
    "BSh": {"min_soil_moisture_pct": 10.0, "max_soil_moisture_pct": 35.0,
            "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.8,
            "min_lux": 2000.0, "optimal_lux": 8000.0, "soil_ph_range": [6.0, 7.5]},
    "Cfa": {"min_soil_moisture_pct": 30.0, "max_soil_moisture_pct": 65.0,
            "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.4,
            "min_lux": 1000.0, "optimal_lux": 4000.0, "soil_ph_range": [6.0, 7.0]},
    "Cfb": {"min_soil_moisture_pct": 30.0, "max_soil_moisture_pct": 70.0,
            "ideal_vpd_min_kpa": 0.6, "ideal_vpd_max_kpa": 1.2,
            "min_lux": 800.0, "optimal_lux": 3000.0, "soil_ph_range": [5.5, 7.0]},
}

GLOBAL_DEFAULTS: dict = {
    "min_soil_moisture_pct": 30.0, "max_soil_moisture_pct": 60.0,
    "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.4,
    "min_lux": 800.0, "optimal_lux": 3000.0, "soil_ph_range": [5.5, 7.0],
}

METRIC_FIELDS = ["min_soil_moisture_pct", "max_soil_moisture_pct",
                 "ideal_vpd_min_kpa", "ideal_vpd_max_kpa",
                 "min_lux", "optimal_lux", "soil_ph_range"]


def _pick(raw: dict, *keys):
    for k in keys:
        if raw.get(k) is not None:
            return raw[k]
    return None


def _as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def extract_golden_record(raw_dict: dict) -> GoldenPlantRecord:
    """Normalize a raw dict (scraper record or seed Species) into a golden record."""
    raw = dict(raw_dict or {})
    raw_name = _pick(raw, "scientific_name", "accepted_name", "name") or ""
    resolved = resolve(raw_name)
    accepted = resolved["accepted_name"] or raw_name
    # Boundary validation: a nameless record must fail loudly, not become
    # a junk golden record stored under an empty PRIMARY KEY (which
    # would also collapse every junk row into one).
    if not accepted or not accepted.strip():
        raise ValueError("extract_golden_record requires a scientific name")
    genus = accepted.split()[0] if accepted else None
    family = _pick(raw, "family") or resolved["family"] or GENUS_TO_FAMILY.get(genus or "")
    biome = _pick(raw, "native_biome_koppen", "biome", "koppen") or GENUS_BIOME.get(genus or "")
    archetype = _pick(raw, "archetype_rig_id", "archetype") or ""
    if not archetype and family and family in FAMILY_TO_ARCHETYPE:
        archetype = FAMILY_TO_ARCHETYPE[family]
    if not archetype:
        archetype = "01_fenestrated_aroid"

    synonyms = list(resolved.get("synonyms") or [])
    for extra in _as_list(_pick(raw, "synonyms")):
        if extra and normalize(extra) != normalize(accepted) and extra not in synonyms:
            synonyms.append(extra)

    values: dict = {}
    imputed: list[str] = []
    genus_defaults = GENUS_DEFAULTS.get(genus or "", {})
    biome_defaults = BIOME_DEFAULTS.get(biome or "", {})
    for field in METRIC_FIELDS:
        val = _pick(raw, field)
        if val is not None:
            values[field] = val
        elif field in genus_defaults:
            values[field] = genus_defaults[field]
            imputed.append(field)
        elif field in biome_defaults:
            values[field] = biome_defaults[field]
            imputed.append(field)
        else:
            values[field] = GLOBAL_DEFAULTS[field]
            imputed.append(field)

    base_conf = raw.get("confidence")
    try:
        base_conf = float(base_conf) if base_conf is not None else 0.95
    except (TypeError, ValueError):
        base_conf = 0.95
    # Resolver confidence caps the base when the name itself was a synonym.
    if resolved["method"] in ("full_name_synonym", "genus_synonym"):
        base_conf = min(base_conf, resolved["confidence"])
    confidence = max(0.2, round(min(1.0, base_conf - 0.05 * len(imputed)), 4))

    sources = _as_list(_pick(raw, "sources", "source"))
    if not sources:
        sources = ["seed" if "crop_coeff_k" in raw else "scraper"]

    return GoldenPlantRecord(
        scientific_name=str(raw_name),
        accepted_name=accepted,
        synonyms=synonyms,
        family=family,
        genus=genus,
        native_biome_koppen=biome,
        archetype_rig_id=archetype,
        min_soil_moisture_pct=values["min_soil_moisture_pct"],
        max_soil_moisture_pct=values["max_soil_moisture_pct"],
        ideal_vpd_min_kpa=values["ideal_vpd_min_kpa"],
        ideal_vpd_max_kpa=values["ideal_vpd_max_kpa"],
        min_lux=values["min_lux"],
        optimal_lux=values["optimal_lux"],
        soil_ph_range=list(values["soil_ph_range"]),
        pet_toxicity=bool(_pick(raw, "pet_toxicity") or False),
        common_pathogens=_as_list(_pick(raw, "common_pathogens", "pathogens")),
        sources=sources,
        confidence=confidence,
        imputed_fields=imputed,
    )
