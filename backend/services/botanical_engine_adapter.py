"""Adapter binding petey_muse_botanical_engine v2.4.0 to the Petey Plant backend.

The engine module itself is saved verbatim (its own project header intact) and
is pure stdlib. This adapter is the ONLY place that translates between engine
types (TaxonomicSpeciesNode, VPDResult, HydrationBalanceResult, StressDiagnosis)
and backend types (Species records, PlantState dicts, vision outputs).

Honesty rules enforced here:
- Engine numbers are MODEL PARAMETERS, never field-verified care facts. The
  adapter never writes into a Species record's verified_* fields.
- The PlantNet logit adjustment follows the engine's own definition:
  adjusted_logit = logit - tau * log(pi_y + eps). The stored offset
  tau*log(pi_y) is negative for rare classes, so subtracting it BOOSTS them.
  The integration table's "add plantnet_logit_offset" is implemented as
  score - offset * leaf_prior, i.e. the engine formula weighted by the leaf
  organ prior; the calibration block reports both numbers so the sign is
  auditable. No neural inference runs offline — this is a calibration
  integration point, not a live model.
- lux -> PPFD uses the documented approximation PPFD = lux * 0.0185
  (indoor daylight spectrum). It is labeled approximate wherever surfaced.
"""

from __future__ import annotations

import dataclasses
from typing import Any, Dict, List, Optional, Union

from services.petey_muse_botanical_engine import (
    BiophysicalDifferentialEngine,
    PlantNet300KAdapter,
    TaxonomicSpeciesNode,
    build_master_botanical_knowledge_graph,
)

ENGINE_GRAPH: Dict[str, TaxonomicSpeciesNode] = build_master_botanical_knowledge_graph()
ENGINE = BiophysicalDifferentialEngine()
PLANTNET = PlantNet300KAdapter()

# Approximate indoor daylight conversion (documented approximation, not measured).
LUX_TO_PPFD = 0.0185

# Default thirst threshold (percent soil moisture) for non-CAM-cluster species.
# This matches the pre-engine guilt/sitter threshold so behaviour is unchanged
# for every species except CLUSTER_C CAM succulents.
DEFAULT_THIRST_THRESHOLD_PCT = 30.0

# Accepted-name (lowercase) + optional cultivar -> taxon_code. Synonym keys are
# the seed's accepted names; cultivar keys are matched on the record's cultivar
# field when present (Thai Constellation is the only cultivar node).
_NAME_TO_TAXON: Dict[str, str] = {
    "monstera deliciosa": "ARA-MON-DEL-001",
    # Full cultivar accepted name (seed record scientific_name) -> cultivar node.
    "monstera deliciosa 'thai constellation'": "ARA-MON-DEL-002",
    "goeppertia makoyana": "MAR-GOE-MAK-001",
    "dracaena trifasciata": "ASP-DRA-TRI-001",
    "zamioculcas zamiifolia": "ARA-ZAM-ZAM-001",
    "ficus lyrata": "MOR-FIC-LYR-001",
    "phalaenopsis aphrodite": "ORC-PHA-APH-001",
    "peperomia obtusifolia": "PIP-PEP-OBT-001",
    "spathiphyllum wallisii": "ARA-SPA-WAL-001",
    "crassula ovata": "CRA-CRA-OVA-001",
}
_CULTIVAR_TO_TAXON: Dict[str, str] = {
    "thai constellation": "ARA-MON-DEL-002",
}


def taxon_for_species(
    scientific_name: str, cultivar: Optional[str] = None
) -> Optional[TaxonomicSpeciesNode]:
    """Resolve a seed scientific name (+ optional cultivar) to an engine node."""
    if cultivar:
        node_code = _CULTIVAR_TO_TAXON.get(cultivar.strip().lower())
        if node_code:
            return ENGINE_GRAPH[node_code]
    code = _NAME_TO_TAXON.get(scientific_name.strip().lower())
    return ENGINE_GRAPH[code] if code else None


def _record_get(record: Any, key: str, default: Any = None) -> Any:
    if record is None:
        return default
    if isinstance(record, dict):
        return record.get(key, default)
    return getattr(record, key, default)


def cluster_for_species(record: Any) -> Optional[str]:
    """Care cluster id for a Species record (engine field first, else taxon map)."""
    cluster = _record_get(record, "engine_care_cluster_id")
    if cluster:
        return cluster
    node = taxon_for_species(
        str(_record_get(record, "scientific_name", "") or ""),
        _record_get(record, "cultivar"),
    )
    return node.care_cluster_id if node else None


def is_cam_cluster_species(record: Any) -> bool:
    """True only for CLUSTER_C CAM-succulent xerophytes."""
    return cluster_for_species(record) == "CLUSTER_C"


def thirst_threshold_pct(record: Any) -> float:
    """Soil-moisture percent below which a plant counts as thirsty.

    CLUSTER_C CAM succulents use the engine's critical-depletion VWC (5-8%),
    so a CAM plant at 20% moisture is NOT thirsty and must never trigger a
    premature watering alert. All other species keep the 30% threshold.
    """
    if not is_cam_cluster_species(record):
        return DEFAULT_THIRST_THRESHOLD_PCT
    hydraulics = _record_get(record, "engine_hydraulics") or {}
    critical = hydraulics.get("critical_depletion_vwc") if isinstance(hydraulics, dict) else None
    if critical is None:
        node = taxon_for_species(
            str(_record_get(record, "scientific_name", "") or ""),
            _record_get(record, "cultivar"),
        )
        if node is not None:
            critical = node.hydraulics.critical_depletion_vwc
    if critical is not None:
        return round(float(critical) * 100.0, 2)
    return DEFAULT_THIRST_THRESHOLD_PCT


def is_premature_watering_alert(record: Any, moisture_pct: float) -> bool:
    """True when a watering alert would fire early for a CAM-cluster plant."""
    if not is_cam_cluster_species(record):
        return False
    return float(moisture_pct) >= thirst_threshold_pct(record)


def lux_to_ppfd(lux: float) -> float:
    """Approximate PPFD from lux (indoor daylight spectrum). Documented approx."""
    return float(lux) * LUX_TO_PPFD


def plantnet_calibration(
    scientific_name: str,
    cultivar: Optional[str] = None,
    train_image_count: int = 250,
) -> Optional[Dict[str, Any]]:
    """PlantNet-300K calibration block for one species, or None if unmapped."""
    node = taxon_for_species(scientific_name, cultivar)
    if node is None:
        return None
    meta = PLANTNET.build_species_vision_metadata(node, train_image_count, node.plantnet_species_id)
    leaf_prior = meta.organ_priors.get("leaf", 0.0)
    # Engine formula: adjusted = logit - offset; offset is negative for rare
    # classes, so the leaf-weighted adjustment below is a positive boost.
    leaf_weighted_adjustment = -meta.logit_adjustment_offset * leaf_prior
    return {
        "available": True,
        "taxon_code": node.taxon_code,
        "care_cluster_id": node.care_cluster_id,
        "plantnet_species_id": node.plantnet_species_id,
        "train_image_count": train_image_count,
        "logit_offset": meta.logit_adjustment_offset,
        "organ_priors": dict(meta.organ_priors),
        "leaf_prior": leaf_prior,
        "leaf_weighted_adjustment": leaf_weighted_adjustment,
        "is_long_tail_class": meta.is_long_tail_class,
        "cc_by_image_count": meta.cc_by_image_count,
        "cc_by_nc_image_count": meta.cc_by_nc_image_count,
        "licensing_note": (
            "CC-BY images are permissive for commercial features; CC-BY-NC images "
            "are non-commercial only and are kept separate by the adapter."
        ),
        "inference_note": (
            "Calibration integration point only: no neural inference runs offline. "
            "Adjusted scores are classical-vision scores shifted by the leaf-weighted "
            "logit adjustment; they are not PlantNet model outputs."
        ),
    }


def calibrate_vision_scores(
    scores: Dict[str, float],
    scientific_name: str,
    cultivar: Optional[str] = None,
    train_image_count: int = 250,
) -> Dict[str, Any]:
    """Apply the leaf-weighted PlantNet logit adjustment to vision scores.

    Returns {"scores": adjusted, "calibration": block | None}. When the species
    has no engine node, scores pass through unchanged with calibration None.
    """
    calibration = plantnet_calibration(scientific_name, cultivar, train_image_count)
    if calibration is None:
        return {"scores": dict(scores), "calibration": None}
    adjustment = calibration["leaf_weighted_adjustment"]
    return {
        "scores": {k: round(float(v) + adjustment, 4) for k, v in scores.items()},
        "calibration": calibration,
    }


def game_moisture_to_vwc(moisture_pct: float, node: TaxonomicSpeciesNode) -> float:
    """Map the game's 0-100 soil-moisture percent onto engine VWC.

    The game percent is NOT a VWC fraction (demo plants sit at 65-79%, while
    field capacity is 0.22-0.55 VWC) — feeding it raw would flag every moist
    plant as hypoxic. The game percent is interpreted as the plant-available
    water fraction: 0% = permanent wilting point, 100% = field capacity.
    VWC = wilting + fraction x (field capacity - wilting), clamped to
    [0, porosity]. This mapping is documented wherever it is used.
    """
    hyd = node.hydraulics
    fraction = max(0.0, min(1.0, float(moisture_pct) / 100.0))
    vwc = hyd.permanent_wilting_point_vwc + fraction * (
        hyd.field_capacity_vwc - hyd.permanent_wilting_point_vwc)
    return max(0.0, min(vwc, hyd.porosity_fraction))


def _plant_telemetry(plant: Dict[str, Any]) -> Dict[str, float]:
    """Air temp / RH / VPD / lux / interval from a PlantState dict.

    Prefers the newest history entry's sensor values, then the live plant
    fields, then documented defaults (22 C, 55% RH, 150 PPFD-equivalent lux).
    """
    history = plant.get("history") or []
    last = history[-1] if history else {}
    temp_c = float(last.get("temp_c", 22.0))
    rh_pct = float(last.get("rh_percent", last.get("rh_pct", 55.0)))
    vpd_kpa = float(plant.get("vpd_kpa", 0.0) or 0.0)
    if vpd_kpa <= 0.0:
        vpd_kpa = ENGINE.compute_vpd_air_and_leaf(temp_c, rh_pct).vpd_air_kpa
    lux = float(plant.get("lux", 0.0) or 0.0)
    ppfd = lux_to_ppfd(lux) if lux > 0 else 150.0
    interval = int(plant.get("watering_interval_days", 3) or 3)
    return {
        "temp_c": temp_c, "rh_pct": rh_pct, "vpd_kpa": vpd_kpa,
        "lux": lux, "ppfd": ppfd, "interval_days": interval,
    }


def _node_for_record(species_record: Any) -> Optional[TaxonomicSpeciesNode]:
    taxon_code = _record_get(species_record, "engine_taxon_code")
    if taxon_code and taxon_code in ENGINE_GRAPH:
        return ENGINE_GRAPH[taxon_code]
    return taxon_for_species(
        str(_record_get(species_record, "scientific_name", "") or ""),
        _record_get(species_record, "cultivar"),
    )


def _simulate_for_plant(plant: Dict[str, Any], node: TaxonomicSpeciesNode):
    """Shared engine simulation: returns (result dataclass, telemetry dict)."""
    tel = _plant_telemetry(plant)
    result = ENGINE.simulate_substrate_hydration_balance(
        node,
        tel["temp_c"], tel["rh_pct"], tel["ppfd"],
        pot_volume_l=4.0,
        initial_vwc=game_moisture_to_vwc(float(plant.get("moisture_pct", 50.0)), node),
        watering_dose_ml=250.0,
        watering_interval_days=tel["interval_days"],
    )
    tel["initial_vwc"] = game_moisture_to_vwc(float(plant.get("moisture_pct", 50.0)), node)
    tel["initial_vwc_mapping"] = "game moisture % as plant-available water fraction (0%=wilting, 100%=field capacity)"
    return result, tel


def hydration_for_plant(
    plant: Dict[str, Any], species_record: Any
) -> Optional[Dict[str, Any]]:
    """Engine substrate-hydration simulation for one plant, or None if unmapped."""
    node = _node_for_record(species_record)
    if node is None:
        return None
    result, tel = _simulate_for_plant(plant, node)
    out = dataclasses.asdict(result)
    out["taxon_code"] = node.taxon_code
    out["care_cluster_id"] = node.care_cluster_id
    out["inputs"] = tel
    out["inputs"]["ppfd_source"] = "lux*0.0185 approximation" if tel["lux"] > 0 else "default 150.0"
    return out


def diagnose_plant(
    plant: Dict[str, Any],
    species_record: Any,
    fertilizer_ec_ms_cm: float = 1.0,
    tap_water_fluoride_ppm: float = 0.7,
) -> Optional[Dict[str, Any]]:
    """Differential pathology triage for one plant, or None if unmapped.

    Runs the engine's 5-code differential diagnosis over the plant's live
    telemetry + hydration simulation and returns the ranked determinations
    with the primary code/mechanism first — deterministic ground-truth context
    for the triage agent, produced BEFORE any care advice is generated.
    """
    node = _node_for_record(species_record)
    if node is None:
        return None
    hyd_result, tel = _simulate_for_plant(plant, node)
    hydration = hydration_for_plant(plant, species_record)
    if hydration is None:
        return None
    diagnoses = ENGINE.diagnose_biotic_and_abiotic_stressors(
        node, tel["vpd_kpa"], tel["ppfd"], hyd_result,
        fertilizer_ec_ms_cm=fertilizer_ec_ms_cm,
        tap_water_fluoride_ppm=tap_water_fluoride_ppm,
    )
    primary = diagnoses[0]
    return {
        "available": True,
        "taxon_code": node.taxon_code,
        "care_cluster_id": node.care_cluster_id,
        "primary_pathology_code": primary.diagnostic_code,
        "physiological_mechanism": primary.physiological_mechanism,
        "severity_score": primary.severity_score,
        "confidence": primary.confidence,
        "action_prescription": primary.action_prescription,
        "diagnostics": [dataclasses.asdict(d) for d in diagnoses],
        "hydration": hydration,
        "inputs": tel,
        "source": "petey_muse_botanical_engine v2.4.0 parameters",
    }
