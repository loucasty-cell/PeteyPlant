"""Regression tests for the petey_muse_botanical_engine v2.4.0 integration.

Covers: VPD-leaf math, photosynthesis curve sanity, hydration balance
regimes, all 5 differential pathology triggers (both branches of the
light-stress code), PlantNet logit-offset math, cluster-aware watering
alert suppression, and dataset-merge integrity. Engine numbers are asserted
as MODEL PARAMETERS, never as field-verified facts.
"""
import io

import pytest
from PIL import Image

from data.seed_10k_species import SPECIES
from services.botanical_engine_adapter import (
    calibrate_vision_scores,
    game_moisture_to_vwc,
    hydration_for_plant,
    is_cam_cluster_species,
    is_premature_watering_alert,
    plantnet_calibration,
    thirst_threshold_pct,
)
from services.ml_vision import analyze_image
from services.muse_agent_harness import diagnose_engine_pathology, guilt_state_for, run_triage
from services.petey_muse_botanical_engine import (
    BiophysicalDifferentialEngine,
    PlantNet300KAdapter,
    build_master_botanical_knowledge_graph,
)

ENGINE = BiophysicalDifferentialEngine()
GRAPH = build_master_botanical_knowledge_graph()
ADAPTER = PlantNet300KAdapter()

MONSTERA = GRAPH["ARA-MON-DEL-001"]
MAKOYANA = GRAPH["MAR-GOE-MAK-001"]
DRACAENA = GRAPH["ASP-DRA-TRI-001"]


def _hydration(node, **over):
    kw = dict(air_temp_c=25.0, rh_percent=55.0, ppfd_umol_m2_s=150.0,
              pot_volume_l=4.0, initial_vwc=0.40, watering_dose_ml=250.0,
              watering_interval_days=7)
    kw.update(over)
    return ENGINE.simulate_substrate_hydration_balance(node, **kw)


def _codes(node, vpd, ppfd, hydration, **kw):
    diags = ENGINE.diagnose_biotic_and_abiotic_stressors(node, vpd, ppfd, hydration, **kw)
    return [d.diagnostic_code for d in diags]


# ---------------------------------------------------------------- VPD-leaf math
def test_vpd_leaf_below_air_and_dew_point_sane():
    v = ENGINE.compute_vpd_air_and_leaf(25.0, 55.0)
    assert v.vpd_air_kpa > 0
    # Leaf is 0.8 C cooler by default, so leaf VPD is below air VPD.
    assert 0 < v.vpd_leaf_kpa < v.vpd_air_kpa
    assert v.leaf_temp_c == pytest.approx(24.2)
    assert 10.0 < v.dew_point_c < 25.0
    # Saturation rises with temperature: hotter air at same RH -> higher VPD.
    v_hot = ENGINE.compute_vpd_air_and_leaf(30.0, 55.0)
    assert v_hot.vpd_air_kpa > v.vpd_air_kpa


def test_vpd_rejects_out_of_range_humidity():
    with pytest.raises(ValueError):
        ENGINE.compute_vpd_air_and_leaf(25.0, 120.0)


# ---------------------------------------------------------------- Photosynthesis
def test_photosynthesis_curve_sanity():
    # A_net rises with light, is negative below the light compensation point,
    # and flags photoinhibition above the light saturation point.
    a_dark = ENGINE.compute_net_photosynthesis(MONSTERA, 5.0, 25.0, 1.0)
    a_low = ENGINE.compute_net_photosynthesis(MONSTERA, 150.0, 25.0, 1.0)
    a_high = ENGINE.compute_net_photosynthesis(MONSTERA, 400.0, 25.0, 1.0)
    a_blast = ENGINE.compute_net_photosynthesis(MONSTERA, 1000.0, 25.0, 1.0)
    assert a_dark.is_below_lcp and a_dark.a_net_umol_m2_s < 0
    assert 0 < a_low.a_net_umol_m2_s < a_high.a_net_umol_m2_s
    assert a_blast.is_photoinhibited and not a_high.is_photoinhibited
    # Stomatal closure: extreme VPD suppresses photosynthesis at same light.
    a_dry = ENGINE.compute_net_photosynthesis(MONSTERA, 400.0, 25.0, 3.0)
    assert a_dry.a_net_umol_m2_s < a_high.a_net_umol_m2_s
    assert a_dry.stomatal_conductance_scalar < 1.0
    # Variegated cultivar photosynthesizes less than the species type.
    thai = GRAPH["ARA-MON-DEL-002"]
    a_thai = ENGINE.compute_net_photosynthesis(thai, 400.0, 25.0, 1.0)
    assert a_thai.a_net_umol_m2_s < a_high.a_net_umol_m2_s


# ---------------------------------------------------------------- Hydration
def test_hydration_interval_dose_and_regimes():
    h = _hydration(MONSTERA)
    assert 1 <= h.optimal_watering_interval_days <= 30
    assert h.optimal_watering_dose_ml > 0
    assert h.substrate_trough_vwc <= h.substrate_peak_vwc
    # Hypoxia regime: near-saturated substrate + heavy frequent watering.
    h_wet = _hydration(MONSTERA, initial_vwc=0.69, watering_dose_ml=800.0,
                       watering_interval_days=2, rh_percent=80.0)
    assert h_wet.hypoxia_rot_risk_score > 0.30
    assert "REDUCE_DOSE" in h_wet.recommended_action
    # Desiccation regime: tiny dose, long interval, dry air.
    h_dry = _hydration(MONSTERA, initial_vwc=0.25, watering_dose_ml=50.0,
                       watering_interval_days=14, rh_percent=30.0, air_temp_c=30.0)
    assert h_dry.desiccation_wilt_risk_score > 0.30
    assert "INCREASE_DOSE" in h_dry.recommended_action
    # CAM succulent stretches a longer interval than a hygrophilic calathea
    # under identical conditions (lower Kc x CAM pathway scalar).
    h_cam = _hydration(DRACAENA)
    h_cal = _hydration(MAKOYANA)
    assert h_cam.optimal_watering_interval_days > h_cal.optimal_watering_interval_days


def test_game_moisture_maps_to_available_water_fraction():
    # 0% -> wilting point, 100% -> field capacity; a moist demo plant
    # (65.6%) lands mid-band, NOT above field capacity (no false hypoxia).
    assert game_moisture_to_vwc(0.0, MONSTERA) == pytest.approx(0.11)
    assert game_moisture_to_vwc(100.0, MONSTERA) == pytest.approx(0.45)
    assert game_moisture_to_vwc(65.6, MONSTERA) == pytest.approx(0.11 + 0.656 * 0.34)
    plant = _triage_plant("Monstera deliciosa", "Monstera", 65.6)
    hyd = hydration_for_plant(plant, _species("Monstera deliciosa"))
    assert hyd["hypoxia_rot_risk_score"] == pytest.approx(0.0)
    assert hyd["desiccation_wilt_risk_score"] == pytest.approx(0.0)


# ---------------------------------------------------------------- Pathology
def test_pathology_spider_mites_high_vpd():
    codes = _codes(MONSTERA, 1.8, 150.0, _hydration(MONSTERA))
    assert "BIOTIC_ACARI_TETRANYCHUS" in codes
    assert "BIOTIC_ACARI_TETRANYCHUS" not in _codes(MONSTERA, 1.0, 150.0, _hydration(MONSTERA))


def test_pathology_pythium_hypoxia():
    h_wet = _hydration(MONSTERA, initial_vwc=0.69, watering_dose_ml=800.0,
                       watering_interval_days=2, rh_percent=80.0)
    assert "BIOTIC_OOMYCETE_PYTHIUM" in _codes(MONSTERA, 1.0, 150.0, h_wet)


def test_pathology_fluoride_tip_necrosis_only_when_sensitive():
    h = _hydration(MAKOYANA)
    assert "ABIOTIC_FLUORIDE_TIP_NECROSIS" in _codes(
        MAKOYANA, 0.6, 150.0, h, tap_water_fluoride_ppm=0.7)
    assert "ABIOTIC_FLUORIDE_TIP_NECROSIS" not in _codes(
        MAKOYANA, 0.6, 150.0, h, tap_water_fluoride_ppm=0.0)
    # Monstera is not fluoride-sensitive: same tap water, no diagnosis.
    assert "ABIOTIC_FLUORIDE_TIP_NECROSIS" not in _codes(
        MONSTERA, 0.6, 150.0, _hydration(MONSTERA), tap_water_fluoride_ppm=0.7)


def test_pathology_salt_toxicity_above_burn_threshold():
    h = _hydration(MONSTERA)
    assert "ABIOTIC_OSMOTIC_SALT_TOXICITY" in _codes(
        MONSTERA, 1.0, 150.0, h, fertilizer_ec_ms_cm=3.0)
    assert "ABIOTIC_OSMOTIC_SALT_TOXICITY" not in _codes(
        MONSTERA, 1.0, 150.0, h, fertilizer_ec_ms_cm=1.0)


def test_pathology_light_stress_both_branches():
    h = _hydration(MONSTERA)
    assert "ABIOTIC_NEGATIVE_CARBON_ETIOLATION" in _codes(MONSTERA, 1.0, 5.0, h)
    assert "ABIOTIC_PSII_PHOTOINHIBITION" in _codes(MONSTERA, 1.0, 1000.0, h)
    assert _codes(MONSTERA, 1.0, 150.0, h) == ["HOMEOSTASIS_OPTIMAL"]


# ---------------------------------------------------------------- Logit offset
def test_logit_offset_math_and_organ_priors():
    # Offsets are negative log-priors: rarer classes get a bigger boost when
    # the engine formula (logit - offset) is applied.
    off_rare = ADAPTER.compute_logit_adjusted_prior(60)
    off_mid = ADAPTER.compute_logit_adjusted_prior(250)
    off_common = ADAPTER.compute_logit_adjusted_prior(400)
    assert off_rare < off_mid < off_common < 0
    cal = plantnet_calibration("Dracaena trifasciata", train_image_count=60)
    assert cal["available"] is True
    assert cal["leaf_prior"] == pytest.approx(0.68)
    assert cal["leaf_weighted_adjustment"] == pytest.approx(-off_rare * 0.68)
    # Orchids are flower-heavy; other houseplants are leaf-heavy.
    orchid = plantnet_calibration("Phalaenopsis aphrodite")
    assert orchid["organ_priors"]["leaf"] == pytest.approx(0.30)
    assert orchid["organ_priors"]["flower"] == pytest.approx(0.52)
    # CC-BY / CC-BY-NC split sums to the train count; unmapped -> None.
    assert cal["cc_by_image_count"] + cal["cc_by_nc_image_count"] == 60
    assert plantnet_calibration("Goeppertia orbifolia") is None
    # Calibrated scores shift UP by the leaf-weighted adjustment (rare boost).
    out = calibrate_vision_scores({"healthy": 50.0}, "Dracaena trifasciata",
                                  train_image_count=60)
    assert out["scores"]["healthy"] == pytest.approx(50.0 + cal["leaf_weighted_adjustment"])


def test_vision_calibration_field_in_scan_output():
    img = Image.new("RGB", (64, 64), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    body = analyze_image(buf.getvalue(), species_scientific_name="Dracaena trifasciata")
    assert body["plantnet_calibration"]["available"] is True
    assert body["plantnet_calibration"]["organ_priors"]["leaf"] == pytest.approx(0.68)
    assert body["plantnet_calibration"]["taxon_code"] == "ASP-DRA-TRI-001"
    assert body["calibrated_vision_scores"]["healthy_chlorophyll"] > 0
    no_species = analyze_image(buf.getvalue())
    assert no_species["plantnet_calibration"]["available"] is False
    unknown = analyze_image(buf.getvalue(), species_scientific_name="Not a plant")
    assert unknown["plantnet_calibration"]["available"] is False


# ---------------------------------------------------------------- Cluster alerts
def _species(name, cultivar=""):
    for s in SPECIES:
        if s.scientific_name == name and s.cultivar == cultivar:
            return s
    raise AssertionError(name)


def test_cluster_aware_thresholds_and_alert_suppression():
    dracaena = _species("Dracaena trifasciata")
    monstera = _species("Monstera deliciosa")
    assert is_cam_cluster_species(dracaena) is True
    assert is_cam_cluster_species(monstera) is False
    # Engine critical depletion for Dracaena is 0.05 VWC -> 5% threshold.
    assert thirst_threshold_pct(dracaena) == pytest.approx(5.0)
    assert thirst_threshold_pct(monstera) == pytest.approx(30.0)
    assert is_premature_watering_alert(dracaena, 20.0) is True
    assert is_premature_watering_alert(dracaena, 4.0) is False
    assert is_premature_watering_alert(monstera, 20.0) is False


def test_guilt_state_never_thirsty_for_cam_at_20pct():
    cam = {"species_scientific_name": "Dracaena trifasciata", "moisture_pct": 20.0,
           "hp": 60, "mood": "thriving", "streak_days": 5}
    assert guilt_state_for(cam) != "thirsty"
    twin = dict(cam, species_scientific_name="Monstera deliciosa")
    assert guilt_state_for(twin) == "thirsty"
    # A genuinely dry CAM plant (below critical depletion) is still thirsty.
    assert guilt_state_for(dict(cam, moisture_pct=4.0)) == "thirsty"


def _triage_plant(species_sci, species_common, moisture):
    return {
        "id": "test-plant", "name": "Testy", "species_common_name": species_common,
        "species_scientific_name": species_sci, "family": "Asparagaceae",
        "archetype_rig_id": "08_upright_sword", "pot_material": "plastic",
        "pot_type": "round", "hp": 60, "xp": 100, "level": 1, "streak_days": 5,
        "mulch_shields": 0, "moisture_pct": moisture, "vpd_kpa": 1.0, "lux": 1500.0,
        "watering_locked": False, "lock_reason": None, "next_water_iso": "2026-10-27",
        "mood": "okay", "expression": "okay", "quiz_correct_count": 0,
        "droop_angle_deg": 0.0, "particle_effect": "", "quests": [],
        "history": [{"date_iso": "2026-10-26", "moisture_pct": moisture, "vpd_kpa": 1.0,
                     "temp_c": 25.0, "rh_pct": 55.0, "lux": 1500.0, "watered": False}],
        "last_watered_date": None, "watering_interval_days": 3,
        "base_particle_effect": "",
    }


def test_triage_trace_has_pathology_step_and_cam_interval():
    result = run_triage(_triage_plant("Dracaena trifasciata", "Snake Plant", 20.0))
    trace = result["agent_trace"]
    assert len(trace) == 6
    assert [s["tool_name"] for s in trace] == [
        "search_botanical_rag", "run_timeseries_moisture_forecast",
        "diagnose_engine_pathology", "mutate_watering_schedule",
        "synthesize_petey_avatar", "dispatch_duolingo_guilt_quest"]
    # Pathology step precedes the schedule step; its evidence is attached.
    path_step = trace[2]
    assert path_step["evidence_id"]
    path = result["actions"]["engine_pathology"]
    assert path["available"] is True
    assert path["primary_pathology_code"]
    assert path["physiological_mechanism"]
    hyd = result["actions"]["engine_hydration"]
    assert hyd["optimal_watering_interval_days"] >= 1
    assert hyd["optimal_watering_dose_ml"] > 0
    assert 0.0 <= hyd["hypoxia_rot_risk_score"] <= 1.0
    assert 0.0 <= hyd["desiccation_wilt_risk_score"] <= 1.0
    # CAM plant at 20% moisture: normal 4-day interval, never premature 2-day.
    assert result["actions"]["watering_interval_days"] == 4
    twin = run_triage(_triage_plant("Monstera deliciosa", "Monstera", 20.0))
    assert twin["actions"]["watering_interval_days"] == 2
    assert twin["actions"]["engine_pathology"]["available"] is True


def test_triage_pathology_unavailable_for_unmapped_species():
    result = run_triage(_triage_plant("Goeppertia orbifolia", "Orbifolia Prayer Plant", 50.0))
    assert result["actions"]["engine_pathology"]["available"] is False
    assert result["actions"]["engine_hydration"] is None
    assert len(result["agent_trace"]) == 6  # trace shape unchanged


def test_registry_pathology_tool_dispatch():
    plant = _triage_plant("Crassula ovata", "Jade Plant", 30.0)
    out = diagnose_engine_pathology(plant)
    assert out["available"] is True
    assert out["care_cluster_id"] == "CLUSTER_C"
    assert out["taxon_code"] == "CRA-CRA-OVA-001"


# ---------------------------------------------------------------- Merge integrity
def test_merge_stats_and_no_verified_overwrite():
    assert len(SPECIES) == 79
    engine_records = [s for s in SPECIES if s.engine_taxon_code]
    assert len(engine_records) == 10
    assert all(s.engine_source == "petey_muse_botanical_engine v2.4.0 parameters"
               for s in engine_records)
    # Original Monstera record keeps its verified block byte-for-byte in spirit.
    mont = _species("Monstera deliciosa")
    assert mont.verified_light == "Moderate brightness but not direct sunlight"
    assert mont.verification_status.get("light") == "verified"
    assert mont.verified_temperature is not None
    # UNVERIFIED markers survive the merge (Dracaena humidity/temperature).
    drac = _species("Dracaena trifasciata")
    assert drac.verified_humidity is None and drac.verified_temperature is None
    assert drac.verification_status["humidity"] == "UNVERIFIED"
    assert drac.verification_status["temperature"] == "UNVERIFIED"
    # Verified-carrying count unchanged at 31.
    assert len([s for s in SPECIES if s.verification_sources]) == 31
    # New records carry no verified data at all.
    for s in (_species("Goeppertia makoyana"), _species("Phalaenopsis aphrodite"),
              _species("Monstera deliciosa 'Thai Constellation'", "Thai Constellation")):
        assert s.verified_light is None and s.verification_status == {}
        assert s.verification_sources == {}
        assert s.toxicity_status == "unverified"
    # Thai Constellation is a distinct record under its full accepted name
    # (the engine node's wcvp_accepted_name), so the species record is unique
    # and name-keyed stores (KB primary key) never collapse the two rows.
    assert len([s for s in SPECIES if s.scientific_name == "Monstera deliciosa"]) == 1
    thai = _species("Monstera deliciosa 'Thai Constellation'", "Thai Constellation")
    assert thai.engine_taxon_code == "ARA-MON-DEL-002"
    assert thai.engine_photobiology["variegation_chlorophyll_Penalty"] == pytest.approx(0.74)
    assert thai.engine_care_cluster_id == "CLUSTER_A"
    # Engine numbers never leak into the numeric game-model parameters.
    assert mont.crop_coeff_k == pytest.approx(0.8)
    assert mont.min_soil_moisture_pct == pytest.approx(30.0)
