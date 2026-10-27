"""Pytest suite for Petey Plant backend (run from backend/ directory)."""
import io
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from PIL import Image

from main import app
from services.ml_vision import estimate_lux
from services.timeseries_vpd import (
    check_emergency_brake,
    moisture_step,
    saturation_vapor_pressure,
    vapour_pressure_deficit,
)

client = TestClient(app)


def test_vpd_math():
    es = saturation_vapor_pressure(25.0)
    assert abs(es - 3.17) < 0.02
    vpd = vapour_pressure_deficit(25.0, 50.0)
    assert abs(vpd - 1.58) < 0.02


def test_moisture_decay_monotonic_and_clamped():
    theta = 80.0
    prev = theta
    for _ in range(10):
        theta = moisture_step(theta, 0.8, 1.0, 1.2, 2000.0, 3000.0)
        assert theta <= prev  # monotonic decrease without watering
        assert 0.0 <= theta <= 100.0
        prev = theta
    assert moisture_step(5.0, 5.0, 1.0, 5.0, 10000.0, 1000.0) == 0.0
    assert moisture_step(95.0, 0.1, 1.0, 0.1, 100.0, 3000.0, watered_amount=50.0) == 100.0


def test_exif_lux_math():
    # ISO 100, f/2.8, 1/60s: EV = log2(7.84/ (1/60)) + log2(1) = log2(470.4) ~= 8.88
    ev, lux = estimate_lux(100, 2.8, 1 / 60)
    assert abs(ev - math.log2(2.8 ** 2 / (1 / 60))) < 1e-9
    assert abs(lux - 2.5 * (2 ** ev)) < 1e-6
    assert lux > 1000


def test_emergency_brake():
    assert check_emergency_brake([0.3, 0.3, 0.3, 0.3]) is True
    assert check_emergency_brake([1.0, 0.3, 0.3, 0.3]) is False
    assert check_emergency_brake([0.3, 0.3, 0.3]) is False
    assert check_emergency_brake([0.3, 0.3, 0.3, 0.3, 0.3, 1.2]) is True


def test_react_trace_shape():
    resp = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["agent_trace"]) >= 3
    required = {"thought", "tool_name", "tool_args", "tool_observation", "latency_ms", "muse_model_id"}
    for step in body["agent_trace"]:
        assert required.issubset(step.keys())
    tool_names = [s["tool_name"] for s in body["agent_trace"]]
    assert "search_botanical_rag" in tool_names
    assert "run_timeseries_moisture_forecast" in tool_names


def test_headers_middleware():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers["X-Model-Provider"] == "Meta-Muse-Open-Weights"
    assert "X-Muse-Model-ID" in resp.headers
    assert "X-Muse-Creative-Model" in resp.headers


def test_health_and_plants():
    assert client.get("/health").json()["status"] == "ok"
    plants = client.get("/api/v1/plants").json()["plants"]
    ids = {p["id"] for p in plants}
    assert {"monty-monstera", "callie-calathea", "serpentina-snake"}.issubset(ids)
    callie = next(p for p in plants if p["id"] == "callie-calathea")
    assert callie["watering_locked"] is True
    assert len(callie["history"]) == 30


def test_water_locked_and_unlocked():
    locked = client.post("/api/v1/plants/callie-calathea/water").json()
    assert locked["watered"] is False and locked["locked"] is True
    assert "root-rot" in locked["message"].lower() or "root rot" in locked["message"].lower()
    ok = client.post("/api/v1/plants/serpentina-snake/water").json()
    assert ok["watered"] is True and ok["locked"] is False


def test_scan_no_exif_does_not_crash():
    img = Image.new("RGB", (64, 64), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    resp = client.post("/api/v1/scan", files={"file": ("leaf.png", buf.getvalue(), "image/png")})
    assert resp.status_code == 200
    body = resp.json()
    assert "lux" in body and "lesion_ratios" in body
    assert 0 <= body["lesion_ratios"]["healthy_chlorophyll_ratio"] <= 100


def test_forecast_weather_source_offline_forced(monkeypatch):
    """With the weather host unreachable, triage must record the offline
    fallback as the weather source (not a hardcoded claim)."""
    import services.timeseries_vpd as tv
    monkeypatch.setattr(tv, "OPEN_METEO_BASE_URL", "http://127.0.0.1:9")
    resp = client.post("/api/v1/agent/triage",
                       json={"plant_id": "monty-monstera", "lat": 40.7, "lon": -74.0})
    assert resp.status_code == 200
    fc = next(s for s in resp.json()["agent_trace"]
              if s["tool_name"] == "run_timeseries_moisture_forecast")
    assert "offline_fallback" in fc["tool_observation"]
    assert any("fallback weather" in lim for lim in fc["limitations"])


def test_forecast_weather_source_telemetry_without_coords():
    """Without lat/lon, the forecast honestly reports plant telemetry."""
    resp = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"})
    assert resp.status_code == 200
    fc = next(s for s in resp.json()["agent_trace"]
              if s["tool_name"] == "run_timeseries_moisture_forecast")
    assert "plant_telemetry" in fc["tool_observation"]
    assert any("telemetry" in lim for lim in fc["limitations"])
