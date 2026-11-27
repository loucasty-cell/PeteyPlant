from datetime import datetime, timedelta, timezone
import uuid

from data.seed_10k_species import SPECIES
from services import garden as G
from services.care_policy import AssessmentInput


def _ideal_status_for(species_id: str, now: datetime) -> tuple[str, dict]:
    pid = uuid.uuid4()
    obs = AssessmentInput(
        soil="dry",
        inspection_depth="recommended",
        drainage="yes",
        standing_water="no",
        captured_at=now - timedelta(hours=1),
        based_on=None,
    )
    plant = {
        "id": str(pid),
        "name": species_id,
        "species_id": species_id,
        "drainage": "yes",
        "created_at": (now - timedelta(days=60)).isoformat(),
        "container_volume_ml": None,
        "potting_mix": None,
        "checkup_reset_id": None,
        "checkup_reset_after": None,
    }
    hist = [{
        "id": str(uuid.uuid4()),
        "kind": "dry",
        "occurred_at": (now - timedelta(hours=1)).isoformat(),
        "checkup": obs.model_dump_json(),
    }]
    view = G.plant_view(plant, hist, now)
    assess = G.assess_for(plant, pid, obs, hist, now)
    return view["status"], {"code": assess.code, "explanation": assess.explanation, "view": view}


def test_all_verified_species_reach_ready_and_unverified_stay_details():
    now = datetime.now(timezone.utc)
    verified = [s.scientific_name for s in SPECIES if G.verified_care_source(s)]
    unverified = [s.scientific_name for s in SPECIES if not G.verified_care_source(s)]
    ready = []
    blocked = []

    for sid in verified:
        status, info = _ideal_status_for(sid, now)
        if status == "ready":
            ready.append(sid)
        else:
            blocked.append((sid, status, info["code"]))

    details_only = [sid for sid in unverified if _ideal_status_for(sid, now)[0] == "details"]
    insufficient_for_verified = [
        sid for sid in verified
        if _ideal_status_for(sid, now)[1]["code"] == "INSUFFICIENT_EVIDENCE"
    ]
    insufficient_for_unverified = [
        sid for sid in unverified
        if _ideal_status_for(sid, now)[1]["code"] == "INSUFFICIENT_EVIDENCE"
    ]
    assert len(SPECIES) == 79
    assert len(verified) == 31
    assert len(unverified) == 48
    assert len(details_only) == 48
    assert blocked == [], f"Blocked verified species ({len(blocked)}): {blocked[:5]}"
    assert len(ready) == 31
    assert insufficient_for_verified == []
    assert len(insufficient_for_unverified) == 48
