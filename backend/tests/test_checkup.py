from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from itertools import product
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from main import app
from services import garden
from services.care_policy import CheckupObservation, assess_watering

ROOT = "/api/v1/garden/plants"
NOW = datetime(2026, 11, 24, 8, tzinfo=timezone.utc)
REPORTED_DRY = {"soil": "dry", "inspection_depth": "recommended", "standing_water": "no"}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    database = tmp_path / "garden.sqlite"
    monkeypatch.setenv("PETEY_GARDEN_DB", str(database))
    clock = [NOW]
    monkeypatch.setattr(garden, "now", lambda: clock[0])
    return database, clock, {"X-Petey-Garden": str(uuid4())}


def create(client, key, species="Monstera deliciosa", drainage="yes", name="Monty"):
    plant = str(uuid4())
    response = client.post(ROOT, headers=key, json={
        "id": plant, "species_id": species, "drainage": drainage, "name": name,
    })
    assert response.status_code == 200
    return f"{ROOT}/{plant}"


def snapshot(client, path, key, **fields):
    context = client.get(path + "/checkup", headers=key)
    assert context.status_code == 200
    return {"based_on": context.json()["based_on"], "captured_at": garden.now().isoformat(), **fields}


def save(client, path, key, data, identifier=None):
    return client.post(path + f"/assessments/{identifier or uuid4()}/confirm", headers=key, json=data)


def test_wet_preview_is_read_only_and_save_persists_only_the_selected_plant(setup):
    _, _, key = setup
    with TestClient(app) as client:
        first = create(client, key)
        second = create(client, key, name="Kitchen Monstera")
        data = snapshot(client, second, key, soil="wet")
        result = client.post(second + "/assessments", headers=key, json=data)
        assert result.status_code == 200
        result = result.json()
        assert result["code"] == "HOLD_WATER"
        assert result["question"] == "standing_water"
        assert result["valid_until"] == "2026-11-24T09:00:00Z"
        assert result["source"].startswith("https://")
        assert result["evidence"][0]["plant_id"] == second.rsplit("/", 1)[1]
        assert result["evidence"][0]["category"] == "OWNER_OBSERVED"
        assert result["evidence"][0]["observed_at"] == "2026-11-24T08:00:00Z"
        assert all(not plant["history"] for plant in client.get(ROOT, headers=key).json())
        event_id = str(uuid4())
        confirmation = save(client, second, key, data, event_id)
        assert confirmation.status_code == 200
        assert confirmation.json()["status"] == "wait"
        assert save(client, second, key, data, event_id).json() == confirmation.json()
        assert save(client, second, key, {**data, "soil": "dry"}, event_id).status_code == 409
    with TestClient(app) as client:
        plants = client.get(ROOT, headers=key).json()
        assert plants[0]["id"] == first.rsplit("/", 1)[1]
        assert plants[0]["history"] == []
        assert plants[1]["status"] == "wait"
        assert [item["kind"] for item in plants[1]["history"]] == ["wet"]
        assert plants[1]["history"][0]["observation"] == {
            "soil": "wet", "inspection_depth": "unknown", "standing_water": "unknown", "drainage": "unknown",
            "captured_at": NOW.isoformat(),
        }


@pytest.mark.parametrize(("species", "drainage", "fields", "code", "question"), [
    ("Monstera deliciosa", "yes", REPORTED_DRY, "WATER_IF_APPROPRIATE", None),
    ("Monstera deliciosa", "yes", {"soil": "dry", "inspection_depth": "surface"}, "CHECK_SOIL", "inspection_depth"),
    ("Monstera deliciosa", "yes", {"soil": "wet", "inspection_depth": "recommended"}, "HOLD_WATER", "standing_water"),
    ("Dracaena trifasciata", "yes", {"soil": "wet"}, "HOLD_WATER", "standing_water"),
    ("Epipremnum aureum", "yes", {"soil": "wet"}, "HOLD_WATER", "standing_water"),
    (None, "unknown", {}, "CHECK_SOIL", "soil"),
    (None, "yes", REPORTED_DRY, "INSUFFICIENT_EVIDENCE", None),
    ("Monstera deliciosa", "yes", {**REPORTED_DRY, "standing_water": "yes"}, "HOLD_WATER", None),
    ("Monstera deliciosa", "yes", {**REPORTED_DRY, "standing_water": "unknown"}, "CHECK_DRAINAGE", "standing_water"),
    ("Monstera deliciosa", "unknown", REPORTED_DRY, "CHECK_DRAINAGE", "drainage"),
    ("Monstera deliciosa", "no", {**REPORTED_DRY, "drainage": "yes"}, "CHECK_DRAINAGE", None),
])
def test_decision_and_adaptive_question(setup, species, drainage, fields, code, question):
    _, _, key = setup
    with TestClient(app) as client:
        path = create(client, key, species=species, drainage=drainage)
        data = snapshot(client, path, key, **fields)
        result = client.post(path + "/assessments", headers=key, json=data)
        assert result.status_code == 200
        assert (result.json()["code"], result.json()["question"]) == (code, question)


def test_checkup_matrix_only_authorizes_supported_dry_depth_and_drainage():
    plant_id = uuid4()
    combinations = product(
        ("dry", "moist", "wet", "unknown"),
        ("recommended", "surface", "unknown"),
        ("yes", "no", "unknown"),
        ("yes", "no", "unknown"),
        ("yes", "no", "unknown"),
        (None, "https://plants.ces.ncsu.edu/plants/monstera-deliciosa/"),
    )
    counted = 0
    for soil, depth, standing, drainage, saved_drainage, source in combinations:
        result = assess_watering(
            CheckupObservation(soil=soil, inspection_depth=depth, standing_water=standing, drainage=drainage),
            plant_id, saved_drainage, source, NOW,
        )
        permitted = (
            soil == "dry" and depth == "recommended" and standing == "no" and source is not None
            and "yes" in (drainage, saved_drainage) and "no" not in (drainage, saved_drainage)
        )
        assert (result.code == "WATER_IF_APPROPRIATE") == permitted
        if soil in {"wet", "moist"} or standing == "yes":
            assert result.code == "HOLD_WATER"
        counted += 1
    assert counted == 648


@pytest.mark.parametrize("unexpected", [
    {"indoor_temperature": -400}, {"indoor_humidity": 0},
    {"outside_weather": {"temperature_c": 24, "humidity": 95}}, {"vpd": 0.05},
    {"photo_confidence": 1}, {"sensor_observed_at": "2000-01-01T00:00:00Z"},
    {"soil_moisture_pct": 15},
])
def test_unsupported_or_simulation_evidence_is_rejected(setup, unexpected):
    _, _, key = setup
    with TestClient(app) as client:
        path = create(client, key)
        data = snapshot(client, path, key, **REPORTED_DRY, **unexpected)
        assert client.post(path + "/assessments", headers=key, json=data).status_code == 422
        assert save(client, path, key, data).status_code == 422


def test_new_watering_invalidates_earlier_dry_preview_and_can_be_honestly_logged(setup):
    _, clock, key = setup
    with TestClient(app) as client:
        path = create(client, key)
        held = snapshot(client, path, key, soil="wet")
        assert save(client, path, key, held).json()["status"] == "wait"
        stale = snapshot(client, path, key, **REPORTED_DRY)
        assert client.post(path + "/assessments", headers=key, json=stale).json()["code"] == "WATER_IF_APPROPRIATE"
        clock[0] += timedelta(minutes=5)
        watered_id = str(uuid4())
        recorded = client.post(path + "/care", headers=key, json={"id": watered_id, "kind": "watered"})
        assert recorded.json()["status"] == "rest"
        assert save(client, path, key, stale).status_code == 409
        assert client.post(path + "/assessments", headers=key, json=stale).status_code == 409
        assert save(client, path, key, {**stale, "based_on": watered_id}).status_code == 409
        assert [event["kind"] for event in client.get(ROOT, headers=key).json()[0]["history"]] == ["watered", "wet"]


def test_expired_and_legacy_dry_records_cannot_authorize_watering(setup):
    _, clock, key = setup
    with TestClient(app) as client:
        path = create(client, key)
        legacy = client.post(path + "/care", headers=key, json={"id": str(uuid4()), "kind": "dry"})
        assert legacy.json()["status"] == "details"
        assert save(client, path, key, snapshot(client, path, key, **REPORTED_DRY)).json()["status"] == "ready"
        clock[0] += timedelta(days=1)
        assert client.get(ROOT, headers=key).json()[0]["status"] == "check"


def test_checkup_requires_ownership_and_actual_observations(setup):
    _, _, owner = setup
    other = {"X-Petey-Garden": str(uuid4())}
    with TestClient(app) as client:
        path = create(client, owner)
        assert client.get(path + "/checkup", headers=other).status_code == 404
        assert client.post(path + "/assessments", headers=other, json={"based_on": None, "soil": "wet", "captured_at": NOW.isoformat()}).status_code == 404
        assert save(client, path, other, {"based_on": None, "soil": "wet", "captured_at": NOW.isoformat()}).status_code == 404
        assert save(client, path, owner, {"based_on": None, "inspection_depth": "recommended", "captured_at": NOW.isoformat()}).status_code == 422
        assert client.get(ROOT, headers=owner).json()[0]["history"] == []


def test_concurrent_confirmations_from_same_revision_cannot_overwrite_one_another(setup):
    _, _, key = setup
    with TestClient(app) as client:
        path = create(client, key)
        data = snapshot(client, path, key, soil="wet")
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(save, client, path, key, data) for _ in range(2)]
        assert sorted(future.result().status_code for future in futures) == [200, 409]
        assert len(client.get(ROOT, headers=key).json()[0]["history"]) == 1


def test_legacy_database_is_upgraded_without_losing_saved_plant_or_care(setup):
    path, _, key = setup
    garden_id = key["X-Petey-Garden"]
    plant_id, care_id = (str(uuid4()) for _ in range(2))
    with sqlite3.connect(path) as database:
        database.executescript("""
            CREATE TABLE garden_plants (garden TEXT, id TEXT, name TEXT, species_id TEXT, drainage TEXT,
                 created_at TEXT, PRIMARY KEY (garden, id));
            CREATE TABLE garden_care (garden TEXT, plant TEXT, id TEXT, kind TEXT, occurred_at TEXT,
                 PRIMARY KEY (garden, plant, id));
        """)
        database.execute("INSERT INTO garden_plants VALUES (?, ?, ?, ?, ?, ?)", (
            garden_id, plant_id, "Old Monstera", "Monstera deliciosa", "yes", NOW.isoformat(),
        ))
        database.execute("INSERT INTO garden_care VALUES (?, ?, ?, ?, ?)", (
            garden_id, plant_id, care_id, "dry", NOW.isoformat(),
        ))
    with TestClient(app) as client:
        plants = client.get(ROOT, headers=key).json()
        assert [(plant["id"], plant["status"]) for plant in plants] == [(plant_id, "details")]
        assert plants[0]["history"] == [{"id": care_id, "kind": "dry", "occurred_at": NOW.isoformat()}]
    with sqlite3.connect(path) as database:
        assert database.execute("PRAGMA user_version").fetchone()[0] == 1


def test_capture_age_is_enforced_without_losing_exact_late_retries(setup):
    _, clock, key = setup
    with TestClient(app) as client:
        path = create(client, key)
        data = snapshot(client, path, key, **REPORTED_DRY)
        saved_id = str(uuid4())
        clock[0] += timedelta(hours=1)
        assert client.post(path + "/assessments", headers=key, json=data).status_code == 200
        saved = save(client, path, key, data, saved_id)
        assert saved.status_code == 200
        assert saved.json()["watering_advice_expires_at"] == (NOW + timedelta(days=1)).isoformat()
        clock[0] += timedelta(seconds=1)
        assert save(client, path, key, data, saved_id).status_code == 200
        stale = {**data, "based_on": saved_id}
        assert client.post(path + "/assessments", headers=key, json=stale).status_code == 409
        assert save(client, path, key, stale).status_code == 409
        future = {**stale, "captured_at": (clock[0] + timedelta(minutes=3)).isoformat()}
        clamped = client.post(path + "/assessments", headers=key, json=future)
        assert clamped.status_code == 200
        assert datetime.fromisoformat(clamped.json()["valid_until"]) == clock[0] + timedelta(hours=1)
        clock[0] = NOW + timedelta(days=1)
        after_expiry = client.get(ROOT, headers=key).json()[0]
        assert (after_expiry["status"], after_expiry["watering_advice_expires_at"]) == ("check", None)
