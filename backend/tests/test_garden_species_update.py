import uuid
from fastapi.testclient import TestClient

import main


def test_patch_plant_species_and_drainage_resolves_details_loop(monkeypatch, tmp_path):
    monkeypatch.setenv("PETEY_GARDEN_DB", str(tmp_path / f"patch-{uuid.uuid4()}.sqlite"))
    client = TestClient(main.app)
    headers = {"X-Petey-Garden": str(uuid.uuid4())}
    other_headers = {"X-Petey-Garden": str(uuid.uuid4())}
    pid = str(uuid.uuid4())

    created = client.post(
        "/api/v1/garden/plants",
        headers=headers,
        json={"id": pid, "name": "Mystery", "species_id": None, "drainage": "unknown"},
    )
    assert created.status_code == 200

    dry_quick = client.post(
        f"/api/v1/garden/plants/{pid}/care",
        headers=headers,
        json={"id": str(uuid.uuid4()), "kind": "dry"},
    )
    assert dry_quick.status_code == 200
    assert dry_quick.json()["status"] == "details"
    assert "Identify this plant" in dry_quick.json()["message"]

    # Wrong owner is rejected with 404, bogus species with 422.
    assert client.patch(f"/api/v1/garden/plants/{pid}", headers=other_headers, json={"drainage": "yes"}).status_code == 404
    assert client.patch(f"/api/v1/garden/plants/{pid}", headers=headers, json={"species_id": "Not a plant"}).status_code == 422

    patched = client.patch(
        f"/api/v1/garden/plants/{pid}",
        headers=headers,
        json={"species_id": "Monstera deliciosa", "drainage": "yes"},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["species_id"] == "Monstera deliciosa"
    assert body["drainage"] == "yes"
    assert body["status"] == "details"
    assert body["watering_source"].startswith("https://")
    assert body["history"][0]["kind"] == "dry"
