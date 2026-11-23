"""Deterministic observation scenarios for the public plant-health route."""

from itertools import product
import re

import pytest
from fastapi.testclient import TestClient

from main import app

ROOT = "/api/v1/plant-health/triage"
IMMEDIATE_WATERING = re.compile(r"\b(?:water now|water thoroughly|give it water|add (?:more )?water)\b")
AMBIGUOUS_SIGNS = [
    ("wilting_turgor_loss",),
    ("chlorosis_yellowing",),
    ("wilting_turgor_loss", "chlorosis_yellowing"),
    ("wilting_turgor_loss", "chlorosis_yellowing", "pest_damage_signs"),
    ("healthy", "wilting_turgor_loss", "spots_lesions_rot", "etiolation_light_stress"),
]
SCENARIOS = list(product(
    AMBIGUOUS_SIGNS,
    ("unknown", "wet", "dry", "moist"),
    ("unknown", "yes", "no"),
    ("unknown", "yes"),
))


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("symptoms,soil,drainage,spread", SCENARIOS)
def test_moisture_failure_modes(client, symptoms, soil, drainage, spread):
    response = client.post(ROOT, json={
        "symptoms": symptoms, "soil": soil, "drainage": drainage, "spread": spread,
    })
    assert response.status_code == 200
    result = response.json()
    assert result["evidence_type"] == "owner_observations"
    assert result["status"] != "no_visible_issue"
    assert len(result["follow_up"]) <= 2
    assert len({source["url"] for source in result["sources"]}) == len(result["sources"]) > 0
    assert all(source["url"].startswith("https://") for source in result["sources"])
    assert all(set(cause) == {"label", "reason"} for cause in result["possible_causes"])

    advice = " ".join(result["steps"])
    assert not IMMEDIATE_WATERING.search(advice.lower())
    causes = {cause["label"] for cause in result["possible_causes"]}
    if soil == "unknown":
        assert result["status"] == "needs_observation"
        assert "soil" in result["follow_up"]
        assert "Possible moisture stress" in causes
    elif soil == "wet":
        assert result["steps"][0].startswith("Hold off on adding water.")
        assert "Possible excess moisture" in causes
        assert "Possible dry mix stress" not in causes
    elif soil == "dry":
        assert "Possible dry mix stress" in causes
        assert "Possible excess moisture" not in causes
        assert "guidance for your species" in advice and "make sure the pot drains" in advice
    else:
        assert not {"Possible excess moisture", "Possible dry mix stress"} & causes
    if spread == "yes":
        assert "horticulture extension service or plant clinic" in advice


@pytest.mark.parametrize("symptoms", [
    (), ("healthy",), ("spots_lesions_rot",), ("pest_damage_signs",),
    ("etiolation_light_stress",), ("mechanical_or_senescence",),
])
def test_wet_mix_in_non_wilting_cases(client, symptoms):
    result = client.post(ROOT, json={"symptoms": symptoms, "soil": "wet"}).json()
    assert result["steps"][0].startswith("Hold off on adding water.")
    assert not IMMEDIATE_WATERING.search(" ".join(result["steps"]).lower())


def test_visible_pest_signs_take_priority_over_no_stress(client):
    result = client.post(ROOT, json={"symptoms": ["healthy"], "pests": "seen"}).json()
    assert result["status"] == "next_steps"
    assert result["steps"][0] == "Separate this plant from the rest of your collection."
    assert "Possible pest activity" in {cause["label"] for cause in result["possible_causes"]}


def test_observation_and_validation_boundaries(client):
    assert client.post(ROOT, json={}).json()["status"] == "needs_observation"
    healthy = client.post(ROOT, json={"symptoms": ["healthy"]}).json()
    assert healthy["status"] == "no_visible_issue"
    assert healthy["possible_causes"] == []
    assert client.post(ROOT, json={"symptoms": ["overwatered"]}).status_code == 422
    assert client.post(ROOT, json={"vision_confidence": 0.98}).status_code == 422
