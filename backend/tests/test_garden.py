from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from main import app
from services import garden

ROOT = "/api/v1/garden"


@pytest.fixture
def clock(tmp_path, monkeypatch):
    monkeypatch.setenv("PETEY_GARDEN_DB", str(tmp_path / "garden.sqlite"))
    clock = [datetime(2026, 11, 24, 8, tzinfo=timezone.utc)]
    monkeypatch.setattr(garden, "now", lambda: clock[0])
    return clock


def add(client, key, plant_id, species="Monstera deliciosa", drainage="yes", name="Monty"):
    return client.post(ROOT + "/plants", headers=key, json={
        "id": plant_id, "name": name, "species_id": species, "drainage": drainage,
    })


def care(client, key, plant_id, kind, event_id=None):
    return client.post(ROOT + f"/plants/{plant_id}/care", headers=key, json={
        "id": event_id or str(uuid4()), "kind": kind,
    })


def save_dry_checkup(client, key, plant_id):
    path = ROOT + f"/plants/{plant_id}"
    revision = client.get(path + "/checkup", headers=key).json()["based_on"]
    return client.post(path + f"/assessments/{uuid4()}/confirm", headers=key, json={
        "soil": "dry", "inspection_depth": "recommended", "standing_water": "no",
        "based_on": revision, "captured_at": garden.now().isoformat(),
    })


def test_plant_and_care_survive_new_requests_without_duplicate_entries(clock):
    key = {"X-Petey-Garden": str(uuid4())}
    plant_id, another_id, event_id = (str(uuid4()) for _ in range(3))
    with TestClient(app) as client:
        assert add(client, key, plant_id).json()["status"] == "check"
        assert add(client, key, plant_id).status_code == 200
        assert add(client, key, plant_id, name="Another name").status_code == 409
        assert add(client, key, another_id, name="Window Monstera").status_code == 200
        wet = care(client, key, plant_id, "moist").json()
        assert wet["status"] == "wait"
        assert datetime.fromisoformat(wet["next_check_at"]) == clock[0] + timedelta(days=1)
    with TestClient(app) as client:
        saved = client.get(ROOT + "/plants", headers=key).json()
        assert [(p["id"], p["status"]) for p in saved] == [(plant_id, "wait"), (another_id, "check")]
        clock[0] += timedelta(days=1)
        assert client.get(ROOT + "/plants", headers=key).json()[0]["status"] == "check"
        dry = save_dry_checkup(client, key, plant_id).json()
        assert dry["status"] == "ready"
        assert dry["watering_source"].startswith("https://")
        first = care(client, key, plant_id, "watered", event_id).json()
        assert first["status"] == "rest"
        assert care(client, key, plant_id, "watered", event_id).json() == first
        assert care(client, key, plant_id, "moist", event_id).status_code == 409
    with TestClient(app) as client:
        saved = client.get(ROOT + "/plants", headers=key).json()
        assert [event["kind"] for event in saved[0]["history"]] == ["watered", "dry", "moist"]
        assert saved[1]["history"] == []


@pytest.mark.parametrize(("species", "drainage"), [(None, "yes"), ("Monstera deliciosa", "unknown"), ("Dracaena trifasciata", "yes")])
def test_dry_alone_cannot_trigger_watering_without_supported_context(clock, species, drainage):
    key = {"X-Petey-Garden": str(uuid4())}
    plant_id = str(uuid4())
    with TestClient(app) as client:
        assert add(client, key, plant_id, species, drainage).status_code == 200
        assert care(client, key, plant_id, "dry").json()["status"] == "details"
        assert care(client, key, plant_id, "unsure").json()["status"] == "check"


def test_private_gardens_and_cors(clock):
    owner = {"X-Petey-Garden": str(uuid4())}
    other = {"X-Petey-Garden": str(uuid4())}
    plant_id = str(uuid4())
    with TestClient(app) as client:
        assert len(client.get(ROOT + "/species").json()) == 79
        assert add(client, owner, plant_id, "bogus").status_code == 422
        assert add(client, owner, plant_id).status_code == 200
        assert client.get(ROOT + "/plants").status_code == 422
        assert client.get(ROOT + "/plants", headers=other).json() == []
        assert care(client, other, plant_id, "watered").status_code == 404
        preflight = client.options(ROOT + "/plants", headers={
            "Origin": "http://localhost:5174",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-petey-garden,content-type",
        })
        assert preflight.headers["access-control-allow-origin"] == "http://localhost:5174"


@pytest.mark.parametrize(("cycles", "expected_days"), [
    ([(1, 1.5), (1, 2)], 2),
    ([(3, 4), (4, 5)], 4),
    ([(1, 2), (3, 4)], 3),
    ([(1, 2)], 3),
    ([(None, 2), (None, 2)], 3),
])
def test_adaptive_check_uses_two_consistent_bounded_observed_cycles(clock, cycles, expected_days):
    key = {"X-Petey-Garden": str(uuid4())}
    plant_id = str(uuid4())
    with TestClient(app) as client:
        assert add(client, key, plant_id).status_code == 200
        assert care(client, key, plant_id, "watered").json()["status"] == "rest"
        for moist_day, dry_day in cycles:
            started = clock[0]
            if moist_day is not None:
                clock[0] = started + timedelta(days=moist_day)
                assert care(client, key, plant_id, "moist").json()["status"] == "wait"
            clock[0] = started + timedelta(days=dry_day)
            assert save_dry_checkup(client, key, plant_id).json()["status"] == "ready"
            clock[0] += timedelta(minutes=10)
            result = care(client, key, plant_id, "watered").json()

        due = clock[0] + timedelta(days=expected_days)
        assert datetime.fromisoformat(result["next_check_at"]) == due
        assert ("last two watering cycles" in result["message"]) == (expected_days != 3)
        assert result["status"] == "rest"

        clock[0] = due + timedelta(days=5)
        result = client.get(ROOT + "/plants", headers=key).json()[0]
        assert result["status"] == "check"
        assert datetime.fromisoformat(result["next_check_at"]) == due


@pytest.mark.parametrize(("species", "drainage"), [
    ("Monstera deliciosa", "yes"), ("Monstera deliciosa", "no"),
    (None, "yes"), ("Dracaena trifasciata", "yes"),
])
def test_moist_snoozes_and_missed_checks_do_not_authorize_watering(clock, species, drainage):
    key = {"X-Petey-Garden": str(uuid4())}
    plant_id = str(uuid4())
    with TestClient(app) as client:
        assert add(client, key, plant_id, species=species, drainage=drainage).status_code == 200
        care(client, key, plant_id, "watered")
        for unused in range(5):
            clock[0] += timedelta(days=1)
            result = care(client, key, plant_id, "moist").json()
            assert result["status"] == "wait"
            assert datetime.fromisoformat(result["next_check_at"]) == clock[0] + timedelta(days=1)
        clock[0] += timedelta(days=10)
        result = client.get(ROOT + "/plants", headers=key).json()[0]
        assert result["status"] == "check"
        assert len(result["history"]) == 6
        result = care(client, key, plant_id, "watered").json()
        assert result["status"] == "rest"
        assert datetime.fromisoformat(result["next_check_at"]) == clock[0] + timedelta(days=3)


def test_repeated_dry_records_do_not_replace_conflicting_or_stale_observations(clock):
    key = {"X-Petey-Garden": str(uuid4())}
    plant_id = str(uuid4())
    with TestClient(app) as client:
        assert add(client, key, plant_id).status_code == 200
        care(client, key, plant_id, "watered")
        for conflict in (True, False):
            clock[0] += timedelta(days=1)
            care(client, key, plant_id, "moist")
            clock[0] += timedelta(hours=4)
            save_dry_checkup(client, key, plant_id)
            if conflict:
                clock[0] += timedelta(hours=4)
                care(client, key, plant_id, "moist")
                clock[0] += timedelta(hours=4)
                save_dry_checkup(client, key, plant_id)
                clock[0] += timedelta(minutes=15)
            else:
                clock[0] += timedelta(days=1)
            result = care(client, key, plant_id, "watered").json()
        assert datetime.fromisoformat(result["next_check_at"]) == clock[0] + timedelta(days=3)
