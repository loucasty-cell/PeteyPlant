from datetime import datetime, timedelta, timezone
import uuid
import pytest
from fastapi.testclient import TestClient

import main


def _setup_plant(monkeypatch, tmp_path):
    db_path = tmp_path / f"clock-{uuid.uuid4()}.sqlite"
    monkeypatch.setenv("PETEY_GARDEN_DB", str(db_path))
    client = TestClient(main.app)
    headers = {"X-Petey-Garden": str(uuid.uuid4())}
    pid = str(uuid.uuid4())
    resp = client.post(
        "/api/v1/garden/plants",
        headers=headers,
        json={"id": pid, "name": "Monstera", "species_id": "Monstera deliciosa", "drainage": "yes"},
    )
    assert resp.status_code == 200
    return client, headers, pid


def test_future_clock_skew_is_clamped_to_server_now(monkeypatch, tmp_path):
    client, headers, pid = _setup_plant(monkeypatch, tmp_path)
    ctx = client.get(f"/api/v1/garden/plants/{pid}/checkup", headers=headers).json()
    aid = str(uuid.uuid4())
    skewed_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    body = {
        "soil": "dry",
        "inspection_depth": "recommended",
        "drainage": "yes",
        "standing_water": "no",
        "based_on": ctx["based_on"],
        "captured_at": skewed_at,
    }
    resp = client.post(f"/api/v1/garden/plants/{pid}/assessments/{aid}/confirm", headers=headers, json=body)
    assert resp.status_code == 200
    saved = resp.json()["history"][0]
    assert datetime.fromisoformat(saved["observation"]["captured_at"]) <= datetime.fromisoformat(saved["occurred_at"])


def test_stale_and_out_of_order_observations_still_reject_409(monkeypatch, tmp_path):
    client, headers, pid = _setup_plant(monkeypatch, tmp_path)
    ctx = client.get(f"/api/v1/garden/plants/{pid}/checkup", headers=headers).json()
    stale_body = {
        "soil": "dry",
        "inspection_depth": "recommended",
        "drainage": "yes",
        "standing_water": "no",
        "based_on": ctx["based_on"],
        "captured_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
    }
    resp_stale = client.post(f"/api/v1/garden/plants/{pid}/assessments", headers=headers, json=stale_body)
    assert resp_stale.status_code == 409

    aid = str(uuid.uuid4())
    valid_body = {**stale_body, "captured_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}
    resp_ok = client.post(f"/api/v1/garden/plants/{pid}/assessments/{aid}/confirm", headers=headers, json=valid_body)
    assert resp_ok.status_code == 200

    ctx2 = client.get(f"/api/v1/garden/plants/{pid}/checkup", headers=headers).json()
    older_body = {
        **valid_body,
        "based_on": ctx2["based_on"],
        "captured_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
    }
    resp_older = client.post(f"/api/v1/garden/plants/{pid}/assessments", headers=headers, json=older_body)
    assert resp_older.status_code == 409
