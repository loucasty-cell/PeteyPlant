from fastapi.testclient import TestClient

import main


def test_garden_species_exposes_advice_status_and_sorts_verified_first():
    client = TestClient(main.app)
    resp = client.get("/api/v1/garden/species")
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 84
    assert all(entry["advice_status"] in {"verified", "none"} for entry in entries)
    verified = [entry for entry in entries if entry["advice_status"] == "verified"]
    assert len(verified) == 31
    # Verified entries appear before unverified entries.
    statuses = [entry["advice_status"] for entry in entries]
    assert statuses == ["verified"] * 31 + ["none"] * 53
