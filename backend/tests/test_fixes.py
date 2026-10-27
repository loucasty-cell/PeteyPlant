"""Tests for the backend fix + upgrade batch (H1-H4, mediums, upgrades,
audit scope-2, botanical corrections, verified-species merge).

All tests restore shared in-memory state they mutate, because the app
uses a process-global plant store.
"""
import io
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import main
from data.seed_10k_species import SPECIES, build_demo_plants
from data_pipeline.taxonomy_resolver import resolve
from models.schemas import HistoryEntry
from services import ml_vision, timeseries_ml
from services.ml_vision import lesion_ratios
from services.muse_agent_harness import run_timeseries_moisture_forecast
from services.rag_engine import care_chunk
from services.timeseries_vpd import (
    fetch_weather,
    forecast_moisture_days,
    offline_fallback_weather,
    pot_factor,
    vapour_pressure_deficit,
)
from services.tool_registry import ToolRegistryError, dispatch, validate_args

client = TestClient(main.app)
TODAY = date.today().isoformat()


def _plant(pid):
    return main.PLANTS[pid]


def _save(pid):
    p = _plant(pid)
    return {
        "hp": p.hp, "xp": p.xp, "level": p.level, "streak_days": p.streak_days,
        "moisture_pct": p.moisture_pct, "mulch_shields": p.mulch_shields,
        "next_water_iso": p.next_water_iso,
        "watering_interval_days": p.watering_interval_days,
        "last_watered_date": p.last_watered_date,
        "history": list(p.history), "watering_locked": p.watering_locked,
        "lock_reason": p.lock_reason, "quiz_correct_count": p.quiz_correct_count,
        "particle_effect": p.particle_effect, "droop_angle_deg": p.droop_angle_deg,
        # STRESS FIX: vpd_kpa was missing here, so test_hp_drops_after_
        # neglect_state_change_via_triage leaked vpd_kpa=0.1 onto Monty
        # for the rest of the suite — later waters appended low-VPD
        # history and tripped the root-rot brake mid-race. Telemetry
        # fields must round-trip through snapshots like everything else.
        "vpd_kpa": p.vpd_kpa, "lux": p.lux,
    }


def _restore(pid, snap):
    p = _plant(pid)
    for k, v in snap.items():
        setattr(p, k, v)
    main._refresh_expression(p)


# ---------------------------------------------------------------- H1: HP moves

def test_hp_changes_after_watering_thirsty_plant():
    snap = _save("monty-monstera")
    try:
        p = _plant("monty-monstera")
        p.moisture_pct = 10.0  # far below Monstera min 30
        p.last_watered_date = None
        hp_before = None
        main._recompute_hp(p)
        hp_before = p.hp
        assert hp_before < 100
        client.post("/api/v1/plants/monty-monstera/water")
        assert _plant("monty-monstera").hp > hp_before
    finally:
        _restore("monty-monstera", snap)


def test_hp_drops_after_neglect_state_change_via_triage():
    snap = _save("monty-monstera")
    try:
        p = _plant("monty-monstera")
        p.moisture_pct = 5.0
        p.vpd_kpa = 0.1
        hp_seed = p.hp
        resp = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"})
        assert resp.status_code == 200
        assert _plant("monty-monstera").hp != hp_seed
        assert _plant("monty-monstera").hp < 100
    finally:
        _restore("monty-monstera", snap)


# ---------------------------------------------------------------- H2: triage persistence

def test_triage_persists_next_water():
    snap = _save("monty-monstera")
    try:
        resp = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"})
        assert resp.status_code == 200
        nxt = resp.json()["actions"]["next_water_iso"]
        plant = client.get("/api/v1/plants/monty-monstera").json()
        assert plant["next_water_iso"] == nxt
        assert plant["watering_interval_days"] == resp.json()["actions"]["watering_interval_days"]
    finally:
        _restore("monty-monstera", snap)


def test_triage_does_not_persist_when_locked():
    snap = _save("callie-calathea")
    try:
        before = _plant("callie-calathea").next_water_iso
        resp = client.post("/api/v1/agent/triage", json={"plant_id": "callie-calathea"})
        assert resp.status_code == 200
        assert _plant("callie-calathea").next_water_iso == before
    finally:
        _restore("callie-calathea", snap)


# ---------------------------------------------------------------- H3: sitter tokens

def test_forged_sitter_token_rejected_both_endpoints():
    assert client.get("/api/v1/sitter/monty-monstera?token=forged-token").status_code == 401
    resp = client.post("/api/v1/sitter/monty-monstera/water", json={"token": "forged-token"})
    assert resp.status_code == 401
    assert client.get("/api/v1/sitter/monty-monstera").status_code == 401


def test_issued_sitter_token_works_and_tokens_differ():
    t1 = client.post("/api/v1/plants/monty-monstera/sitter").json()["sitter_token"]
    t2 = client.post("/api/v1/plants/monty-monstera/sitter").json()["sitter_token"]
    assert t1 and t2 and t1 != t2  # unguessable, not deterministic
    view = client.get(f"/api/v1/sitter/monty-monstera?token={t1}")
    assert view.status_code == 200 and view.json()["plant_name"] == "Monty"
    # Wrong-plant token is rejected too.
    assert client.get(f"/api/v1/sitter/serpentina-snake?token={t1}").status_code == 401


# ---------------------------------------------------------------- H4: real latency

def test_per_step_latency_measured():
    body = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"}).json()
    latencies = [s["latency_ms"] for s in body["agent_trace"]]
    assert all(isinstance(v, int) and v >= 0 for v in latencies)
    assert body["telemetry"]["latency_ms_total"] >= max(latencies)


# ---------------------------------------------------------------- Mediums

def test_fetch_weather_fallback_with_unreachable_host(monkeypatch):
    import services.timeseries_vpd as tv
    monkeypatch.setattr(tv, "OPEN_METEO_BASE_URL", "http://127.0.0.1:9")
    wx = fetch_weather(40.7, -74.0)
    assert wx["source"] == "offline_fallback"
    assert wx["lux_estimated"] is True  # fixed estimate, never a live reading


def test_pot_material_and_ac_change_forecast():
    plant = {"id": "x", "moisture_pct": 60.0, "species_scientific_name": "Monstera deliciosa",
             "vpd_kpa": 1.0, "lux": 2500.0, "pot_material": "terracotta"}
    terra = run_timeseries_moisture_forecast(plant, days=7)
    ceramic = run_timeseries_moisture_forecast({**plant, "pot_material": "ceramic"}, days=7)
    assert terra != ceramic
    no_ac = run_timeseries_moisture_forecast(plant, days=7, ac_on=False)
    ac = run_timeseries_moisture_forecast(plant, days=7, ac_on=True)
    assert ac != no_ac  # AC raises effective VPD -> faster drying
    assert pot_factor("terracotta") == 1.25 and pot_factor("ceramic") == 0.9
    assert pot_factor("plastic") == 1.0 and pot_factor("metal") == 1.1
    assert pot_factor("fabric") == 1.3 and pot_factor("stone") == 1.0


def test_rag_symptoms_accepted_and_in_registry():
    out = dispatch("search_botanical_rag", {"query": "monstera", "symptoms": ["yellow leaves"]})
    assert isinstance(out, str) and "Monstera" in out
    from services.tool_registry import lookup_tool
    props = lookup_tool("search_botanical_rag")["input_schema"]["properties"]
    assert "symptoms" in props
    # Schedule mutation accepts an explicit next_water_iso (proposal).
    plant = {"id": "x", "watering_locked": False}
    res = dispatch("mutate_watering_schedule",
                   {"plant_id": "x", "interval_days": 3, "next_water_iso": "2030-01-01"},
                   plant=plant)
    assert res["next_water_iso"] == "2030-01-01"


def test_once_per_day_watering_guard():
    snap = _save("monty-monstera")
    try:
        p = _plant("monty-monstera")
        p.last_watered_date = None
        xp0, streak0 = p.xp, p.streak_days
        for _ in range(3):
            resp = client.post("/api/v1/plants/monty-monstera/water").json()
            assert resp["watered"] is True
        assert _plant("monty-monstera").xp - xp0 == 20
        assert _plant("monty-monstera").streak_days - streak0 == 1
    finally:
        _restore("monty-monstera", snap)


def test_shield_buy_keeps_level():
    snap = _save("serpentina-snake")
    try:
        p = _plant("serpentina-snake")
        p.xp, p.level = 820, 5
        resp = client.post("/api/v1/plants/serpentina-snake/shield/buy").json()
        assert resp["success"] is True and resp["xp"] == 720
        assert resp["level"] == 5  # would be 4 under 1 + xp // 200
    finally:
        _restore("serpentina-snake", snap)


def _synthetic_leaf(angle_deg, size=200):
    img = Image.new("RGB", (size, size), color=(255, 255, 255))
    leaf = Image.new("RGB", (size, size), color=(255, 255, 255))
    d = ImageDraw.Draw(leaf)
    d.rectangle([90, 20, 110, 180], fill=(34, 139, 34))
    if angle_deg:
        leaf = leaf.rotate(angle_deg, expand=False, fillcolor=(255, 255, 255))
    buf = io.BytesIO()
    leaf.save(buf, format="PNG")
    return buf.getvalue()


def test_droop_contour_pca_upright_vs_rotated():
    up = lesion_ratios(_synthetic_leaf(0))
    assert up["droop_method"] == "contour_pca"
    assert up["turgor_droop_angle_deg"] < 10
    rot = lesion_ratios(_synthetic_leaf(30))
    assert rot["droop_method"] == "contour_pca"
    assert 15 < rot["turgor_droop_angle_deg"] < 45
    assert rot["turgor_droop_angle_deg"] > up["turgor_droop_angle_deg"]


def test_droop_falls_back_to_proxy_without_contour():
    img = Image.new("RGB", (64, 64), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    ratios = lesion_ratios(buf.getvalue())
    assert ratios["droop_method"] == "lesion_proxy"


# ---------------------------------------------------------------- Upgrade 1: timeseries_ml

def _hist(moistures, vpds=None, watered=None):
    out = []
    for i, m in enumerate(moistures):
        out.append({"date_iso": (date.today() - timedelta(days=len(moistures) - 1 - i)).isoformat(),
                    "moisture_pct": m,
                    "vpd_kpa": (vpds[i] if vpds else 1.0),
                    "watered": (watered[i] if watered else False)})
    return out


def _species_for_test():
    return next(s for s in SPECIES if s.scientific_name == "Monstera deliciosa")


def test_ml_decomposition():
    hist = _hist([80.0 - i for i in range(30)])
    dec = timeseries_ml.decompose_series(hist)
    assert dec["days"] == 30 and len(dec["trend"]) == 30 and len(dec["seasonal"]) == 7
    assert abs(sum(dec["seasonal"])) < 0.5  # seasonal recentered to sum ~0
    assert dec["residual_std"] >= 0


def test_ml_forecast_bands_widen():
    days = timeseries_ml.forecast_moisture(60.0, 0.8, 1.0, 1.0, 2500.0, 3000.0,
                                           days=7, residual_std=2.0)
    assert len(days) == 7
    for d in days:
        assert d["lower"] <= d["moisture_pct"] <= d["upper"]
    widths = [d["upper"] - d["lower"] for d in days]
    assert widths[-1] > widths[0]


def test_ml_anomalies_and_root_rot():
    sp = _species_for_test()
    wet = _hist([90.0] * 10, vpds=[1.0] * 10)
    assert any(a["type"] == "soil_stuck_wet" for a in timeseries_ml.detect_anomalies(wet, sp))
    spike = _hist([50.0] * 8, vpds=[0.9, 1.0, 1.1, 1.0, 0.9, 1.1, 1.0, 2.5])
    assert any(a["type"] == "vpd_spike" for a in timeseries_ml.detect_anomalies(spike, sp))
    missed = _hist([20.0] * 5, watered=[True, False, False, False, False])
    assert any(a["type"] == "missed_watering" for a in timeseries_ml.detect_anomalies(missed, sp))
    rot = _hist([90.0] * 14, vpds=[0.3] * 14)
    assert timeseries_ml.root_rot_risk(rot, sp) >= 80
    healthy = _hist([50.0] * 14, vpds=[1.2] * 14)
    assert timeseries_ml.root_rot_risk(healthy, sp) == 0


def test_ml_recommendation_from_forecast():
    fc = [{"date": "2030-01-02", "moisture_pct": 40.0},
          {"date": "2030-01-03", "moisture_pct": 25.0}]
    rec = timeseries_ml.recommend_watering(fc, 30.0)
    assert rec["next_water_iso"] == "2030-01-03" and "crosses" in rec["reason"]
    rec2 = timeseries_ml.recommend_watering(fc, 10.0)
    assert rec2["next_water_iso"] == "2030-01-03" and "stays above" in rec2["reason"]


def test_forecast_endpoint_and_triage_ml_actions():
    body = client.get("/api/v1/plants/monty-monstera/forecast").json()
    assert len(body["forecast_days"]) == 7
    assert all("lower" in d and "upper" in d for d in body["forecast_days"])
    assert isinstance(body["anomalies"], list)
    assert 0 <= body["root_rot_risk"] <= 100
    assert body["recommendation"]["next_water_iso"] and body["recommendation"]["reason"]
    triage = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"}).json()
    assert "root_rot_risk" in triage["actions"] and "recommendation" in triage["actions"]


# ---------------------------------------------------------------- Upgrade 2: model registry

def test_scan_models_block():
    img = Image.new("RGB", (64, 64), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    body = client.post("/api/v1/scan", files={"file": ("leaf.png", buf.getvalue(), "image/png")}).json()
    names = {m["name"] for m in body["models"]}
    assert names == {"mobilenetv2-plantvillage", "vit-plant-identification",
                     "opencv-lab-hsv-segmentation", "contour-pca-droop"}
    by_name = {m["name"]: m for m in body["models"]}
    assert by_name["mobilenetv2-plantvillage"]["available"] is False  # no weights dir
    assert by_name["vit-plant-identification"]["available"] is False  # not loaded by default
    assert by_name["opencv-lab-hsv-segmentation"]["available"] is True
    assert all("backend" in m for m in body["models"])


# ---------------------------------------------------------------- GAP-5: config validation

def test_config_validation_valid_and_invalid(monkeypatch):
    import importlib
    import config as cfg
    monkeypatch.setenv("MUSE_MODEL_ID", "not-a-muse-model")
    monkeypatch.setenv("MUSE_CREATIVE_MODEL", "muse-wonder")
    importlib.reload(cfg)
    assert cfg.MUSE_MODEL_ID == "muse-glimmer-30b"  # fallback + warning
    assert cfg.MUSE_CREATIVE_MODEL == "muse-wonder"  # valid value kept
    monkeypatch.delenv("MUSE_MODEL_ID")
    monkeypatch.delenv("MUSE_CREATIVE_MODEL")
    importlib.reload(cfg)
    assert cfg.MUSE_MODEL_ID == "muse-glimmer-30b"


# ---------------------------------------------------------------- Scope 2: forecast step, unlock, quiz, avatar, watering

def test_forecast_uses_hourly_steps():
    days = forecast_moisture_days(60.0, 0.8, 1.0, 1.0, 3000.0, 3000.0, days=1)
    assert abs(days[0] - 40.8) < 0.6  # 24 * 0.8%/hr, not 1 * 0.8%
    plant = {"id": "x", "moisture_pct": 65.0, "species_scientific_name": "Monstera deliciosa",
             "vpd_kpa": 1.1, "lux": 2500.0, "pot_material": "terracotta"}
    out = run_timeseries_moisture_forecast(plant, days=7)
    assert "final" in out


def test_watering_lock_unlocks_when_vpd_recovers():
    snap = _save("callie-calathea")
    try:
        p = _plant("callie-calathea")
        assert p.watering_locked is True
        p.history = [h.model_copy(update={"vpd_kpa": 1.2}) for h in p.history]
        body = client.get("/api/v1/plants/callie-calathea").json()
        assert body["watering_locked"] is False and body["lock_reason"] is None
    finally:
        _restore("callie-calathea", snap)
        _plant("callie-calathea").watering_locked = True
        _plant("callie-calathea").lock_reason = snap["lock_reason"]


def test_quiz_answer_consumed_once():
    snap = _save("serpentina-snake")
    try:
        q = client.get("/api/v1/quiz").json()
        bank = next(b for b in main.QUIZ_BANK if b["question"] == q["question"])
        payload = {"quiz_id": q["quiz_id"], "plant_id": "serpentina-snake",
                   "selected_index": bank["answer_index"]}
        first = client.post("/api/v1/quiz/answer", json=payload).json()
        assert first["correct"] is True and first["xp_awarded"] == 30
        xp_after = _plant("serpentina-snake").xp
        second = client.post("/api/v1/quiz/answer", json=payload)
        assert second.status_code == 410
        assert _plant("serpentina-snake").xp == xp_after
        assert client.post("/api/v1/quiz/answer", json={}).status_code == 422
    finally:
        _restore("serpentina-snake", snap)


def test_avatar_recovers_from_neglect():
    snap = _save("monty-monstera")
    try:
        p = _plant("monty-monstera")
        p.hp, p.moisture_pct = 20, 90.0
        body = client.get("/api/v1/plants/monty-monstera").json()
        assert body["expression"] == "root-rot ghost" and body["droop_angle_deg"] == 45.0
        p.hp, p.moisture_pct = 90, 50.0
        body = client.get("/api/v1/plants/monty-monstera").json()
        assert body["droop_angle_deg"] < 45.0
        assert body["particle_effect"] == "spider_mites"  # healthy base restored
    finally:
        _restore("monty-monstera", snap)


def test_watering_semantics_species_pot_history_interval():
    s_monty, s_serp = _save("monty-monstera"), _save("serpentina-snake")
    try:
        for pid in ("monty-monstera", "serpentina-snake"):
            p = _plant(pid)
            p.moisture_pct = 20.0
            p.last_watered_date = None
        len0 = len(_plant("monty-monstera").history)
        client.post("/api/v1/plants/monty-monstera/water")
        client.post("/api/v1/plants/serpentina-snake/water")
        # Terracotta (1.25) out-waters stone (1.0) from the same start.
        assert _plant("monty-monstera").moisture_pct > _plant("serpentina-snake").moisture_pct
        # History appended, not rewritten.
        assert len(_plant("monty-monstera").history) == len0 + 1
        assert _plant("monty-monstera").history[-1].watered is True
        # Triage interval reconciliation: set interval, water, check date.
        p = _plant("monty-monstera")
        p.watering_interval_days = 5
        p.last_watered_date = None
        client.post("/api/v1/plants/monty-monstera/water")
        assert p.next_water_iso == (date.today() + timedelta(days=5)).isoformat()
    finally:
        _restore("monty-monstera", s_monty)
        _restore("serpentina-snake", s_serp)


def test_sitter_water_shares_owner_state_not_owner_xp():
    snap = _save("serpentina-snake")
    try:
        p = _plant("serpentina-snake")
        p.moisture_pct = 20.0
        xp0, len0 = p.xp, len(p.history)
        token = client.post("/api/v1/plants/serpentina-snake/sitter").json()["sitter_token"]
        resp = client.post("/api/v1/sitter/serpentina-snake/water", json={"token": token}).json()
        assert resp["plant_id"] == "serpentina-snake" and resp["locked"] is False
        assert resp["watered"] is True and resp["sitter_xp_awarded"] == 50
        assert _plant("serpentina-snake").xp == xp0  # owner XP untouched
        assert len(_plant("serpentina-snake").history) == len0 + 1
    finally:
        _restore("serpentina-snake", snap)
        main.SITTER_XP["serpentina-snake"] = 0


def test_cors_restricted():
    pre = client.options("/api/v1/plants", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET"})
    assert pre.headers.get("access-control-allow-origin") == "http://localhost:5173"
    evil = client.options("/api/v1/plants", headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "GET"})
    assert evil.headers.get("access-control-allow-origin") != "https://evil.example"


def test_registry_plant_id_resolution():
    plant = {"id": "a", "moisture_pct": 50.0}
    with pytest.raises(ToolRegistryError):
        dispatch("run_timeseries_moisture_forecast", {"plant_id": "b"}, plant=plant)
    with pytest.raises(ToolRegistryError):
        dispatch("run_timeseries_moisture_forecast", {"plant_id": "a"})
    with pytest.raises(ToolRegistryError):
        dispatch("run_timeseries_moisture_forecast", {"plant_id": "a", "plant": {}})


def test_store_lock_and_evidence_cap_exist():
    import threading
    from services import tool_registry
    # threading.Lock is a factory, so check behaviour, not isinstance.
    assert type(main._STORE_LOCK) is type(threading.Lock())
    assert main._STORE_LOCK.acquire(blocking=False) is True
    main._STORE_LOCK.release()
    for i in range(505):
        tool_registry.store_evidence(tool_registry.build_evidence(
            "search_botanical_rag", {"query": f"cap-{i}"}, {"text": "x"}))
    assert len(tool_registry.EVIDENCE_BUNDLE) <= 500


def test_registry_validation_hardening():
    for bad in ({"query": "x", "bogus": 1}, {"query": "   "}, {"query": "x", "lat": 999},
                {"query": "x", "lon": -200}):
        # search schema rejects unknown/blank; lat/lon checked for forecast args
        tool = "search_botanical_rag" if "query" in bad and "lat" not in bad and "lon" not in bad else "run_timeseries_moisture_forecast"
        args = dict(bad)
        if tool == "run_timeseries_moisture_forecast":
            args.setdefault("plant_id", "x")
        with pytest.raises(ToolRegistryError):
            validate_args(tool, args)
    # Empty-dict plant rejected at dispatch time too.
    with pytest.raises(ToolRegistryError):
        dispatch("dispatch_duolingo_guilt_quest", {"plant": {}})


def test_scan_honesty_exif_and_combined_diagnosis_and_size_cap():
    # No-EXIF + disease ratios: both messages must appear.
    img = Image.new("RGB", (64, 64), color=(150, 75, 0))  # brown
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    body = client.post("/api/v1/scan", files={"file": ("leaf.png", buf.getvalue(), "image/png")}).json()
    assert body["exif_present"] is False
    assert "approximate" in body["diagnosis"] and "necrosis" in body["diagnosis"]
    # Oversize upload rejected.
    big = client.post("/api/v1/scan", files={"file": ("big.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")})
    assert big.status_code == 400


def test_cv2_numpy_lesion_agreement():
    if ml_vision.cv2 is None:
        pytest.skip("cv2 not installed")
    arr = np.zeros((90, 90, 3), dtype=np.uint8)
    arr[:, :30] = (34, 139, 34)      # healthy green
    arr[:, 30:60] = (255, 255, 0)    # yellow
    arr[:, 60:] = (150, 75, 0)       # brown
    cv2_r = ml_vision._lesion_ratios_cv2(arr)
    np_r = ml_vision._lesion_ratios_numpy(arr)
    for key in ("healthy_chlorophyll_ratio", "chlorosis_yellow_ratio", "necrosis_brown_tip_ratio"):
        assert abs(cv2_r[key] - np_r[key]) <= 5.0


def test_vpd_math_fixes():
    assert vapour_pressure_deficit(25.0, 150.0) == vapour_pressure_deficit(25.0, 100.0)
    assert vapour_pressure_deficit(-237.3, 50.0) == 0.0  # no ZeroDivisionError
    wx = offline_fallback_weather(40.7, -74.0)
    assert wx["temp_c"] == 20.0
    assert wx["vpd_kpa"] == round(vapour_pressure_deficit(20.0, 55.0), 4)


def test_fallback_header_on_health_and_404():
    health = client.get("/health")
    assert health.headers["X-Muse-Fallback"] == "true"
    missing = client.get("/api/v1/plants/no-such-plant")
    assert missing.status_code == 404
    assert missing.headers["X-Muse-Fallback"] == "true"
    assert missing.headers["X-Model-Provider"] == "Meta-Muse-Open-Weights"


def test_coverage_partial_for_fallback_forecast():
    body = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"}).json()
    fc = next(s for s in body["agent_trace"]
              if s["tool_name"] == "run_timeseries_moisture_forecast")
    assert fc["coverage"]["status"] == "partial"  # plant telemetry, no weather coords


# ---------------------------------------------------------------- Botanical corrections

def test_fern_families_are_real_families():
    by_sci = {s.scientific_name: s for s in SPECIES}
    assert by_sci["Nephrolepis exaltata"].family == "Nephrolepidaceae"
    assert by_sci["Asplenium nidus"].family == "Aspleniaceae"
    assert by_sci["Davallia fejeensis"].family == "Davalliaceae"
    assert by_sci["Cyrtomium falcatum"].family == "Dryopteridaceae"
    assert not any(s.family == "Polypodiopsida" for s in SPECIES)


def test_tradescantia_toxic_and_juniper_disputed():
    by_sci = {s.scientific_name: s for s in SPECIES}
    assert by_sci["Tradescantia zebrina"].pet_toxicity is True
    juniper = by_sci["Juniperus procumbens"]
    assert juniper.toxicity_confidence == "disputed" and juniper.toxicity_note


def test_resolver_no_blanket_genus_moves():
    assert resolve("Scindapsus pictus")["accepted_name"] == "Scindapsus pictus"
    assert resolve("Philodendron hederaceum")["accepted_name"] == "Philodendron hederaceum"
    assert resolve("Sansevieria trifasciata")["accepted_name"] == "Dracaena trifasciata"
    assert resolve("Calathea orbifolia")["accepted_name"] == "Goeppertia orbifolia"
    assert resolve("Peperomia hope")["accepted_name"] == "Peperomia tetraphylla"
    assert resolve("Peperomia hope")["cultivar"] == "Hope"
    assert resolve("Senecio rowleyanus")["accepted_name"] == "Curio rowleyanus"
    # Every seed genus resolves to a real family (no None for seed species).
    for sp in SPECIES:
        assert resolve(sp.scientific_name)["family"] is not None, sp.scientific_name


def test_demo_plants_use_accepted_names():
    plants = {p.id: p for p in build_demo_plants()}
    assert plants["callie-calathea"].species_scientific_name == "Goeppertia orbifolia"
    assert plants["serpentina-snake"].species_scientific_name == "Dracaena trifasciata"
    assert plants["monty-monstera"].species_scientific_name == "Monstera deliciosa"


# ---------------------------------------------------------------- Verified merge

def test_seed_count_and_verified_coverage():
    # 79, not 76: the botanical-engine merge added 3 records (Thai
    # Constellation cultivar, Goeppertia makoyana, Phalaenopsis aphrodite).
    # The verified-carrying count (31) is unchanged by the merge.
    assert len(SPECIES) == 79
    merged = [s for s in SPECIES if s.verification_sources]
    assert len(merged) == 31
    for sp in merged:
        for field, status in sp.verification_status.items():
            if status == "verified":
                assert sp.verification_sources.get(field, "").startswith("http"), (sp.scientific_name, field)


def test_unverified_fields_never_filled():
    by_sci = {s.scientific_name: s for s in SPECIES}
    attr = {"humidity": "verified_humidity", "temperature": "verified_temperature",
            "common_names": "verified_common_names"}
    cases = [
        ("Aloe vera", "humidity"), ("Aloe vera", "temperature"),
        ("Goeppertia orbifolia", "common_names"),
        ("Chamaedorea elegans", "temperature"), ("Crassula ovata", "humidity"),
        ("Dracaena marginata", "temperature"),
        ("Dracaena trifasciata", "humidity"), ("Dracaena trifasciata", "temperature"),
        ("Echeveria elegans", "humidity"), ("Echeveria elegans", "temperature"),
        ("Epipremnum aureum", "humidity"), ("Epipremnum aureum", "temperature"),
        ("Ficus benjamina", "humidity"), ("Ficus benjamina", "temperature"),
        ("Maranta leuconeura", "temperature"), ("Spathiphyllum wallisii", "humidity"),
    ]
    for sci, field in cases:
        sp = by_sci[sci]
        assert getattr(sp, attr[field]) is None, (sci, field)
        assert sp.verification_status[field] == "UNVERIFIED", (sci, field)
    # Pet-toxicity UNVERIFIED pair: status unverified, never rendered as safe.
    for sci in ("Haworthiopsis fasciata", "Maranta leuconeura"):
        sp = by_sci[sci]
        assert sp.toxicity_status == "unverified"
        assert sp.verification_status["pet_toxicity"] == "UNVERIFIED"
        assert "unverified — do not assume safe" in care_chunk(sp)


def test_nephrolepis_conflict_recorded_not_overwritten():
    sp = next(s for s in SPECIES if s.scientific_name == "Nephrolepis exaltata")
    assert sp.family == "Nephrolepidaceae"
    assert sp.verified_family == "Polypodiaceae"
    assert "Dryopteridaceae" in sp.notes and "Polypodiaceae" in sp.notes


def test_rag_cites_verified_guidance():
    sp = next(s for s in SPECIES if s.scientific_name == "Monstera deliciosa")
    chunk = care_chunk(sp)
    assert "Verified light guidance" in chunk
    body = client.get("/api/v1/species?q=zz").json()
    assert any(r["scientific_name"] == "Zamioculcas zamiifolia" for r in body["results"])
