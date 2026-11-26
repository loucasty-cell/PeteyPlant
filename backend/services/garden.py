"""Persistent, private-by-token gardens for the local single-device app."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, UUID4

from data.seed_10k_species import SPECIES
from services.care_policy import (
    AssessmentInput, AssessmentResult, CHECKUP_MAX_AGE, CheckupContext, DRAINAGE, assess_watering, validate_watering,
)

router = APIRouter(prefix="/api/v1/garden", tags=["garden"])
GardenKey = Annotated[UUID4, Header(alias="X-Petey-Garden")]
SpeciesCatalog = {species.scientific_name: species for species in SPECIES}
# Identity-only entries support Garden without inventing simulation parameters or care data.
GARDEN_IDENTITIES = {
    "Alocasia micholitziana": "Green Velvet Alocasia",  # Kew: 84208-1
    "Begonia maculata": "Polka Dot Begonia",  # Kew: 105130-1
    "Ceropegia woodii": "String of Hearts",  # Kew: 95848-1
    "Schlumbergera truncata": "Thanksgiving Cactus",  # Kew: 229597-2
    "Syngonium podophyllum": "Arrowhead Plant",  # Kew: 89152-1
}
CARE_KIND = Literal["dry", "moist", "unsure", "watered"]
SCHEMA_VERSION = 2
CHECKUP_CLOCK_SKEW = timedelta(minutes=2)
GUIDED_SPECIES = {
    "Monstera deliciosa": "Check whether the top quarter to one-third of the mix is dry.",
    "Epipremnum aureum": "Check whether the potting mix has dried out between waterings.",
}


class NewPlant(BaseModel):
    id: UUID4
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    species_id: str | None = None
    drainage: DRAINAGE = "unknown"


class PlantUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] | None = None
    species_id: str | None = None
    drainage: DRAINAGE | None = None
    container_volume_ml: Annotated[int, Field(strict=True, ge=1, le=1_000_000)] | None = None
    potting_mix: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None = None


class CareAction(BaseModel):
    id: UUID4
    kind: CARE_KIND


def migrate(db):
    """Apply additive schema changes under one write lock."""
    if db.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION:
        return
    with db:
        db.execute("BEGIN IMMEDIATE")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1, SCHEMA_VERSION):
            raise RuntimeError(f"Unsupported garden schema version: {version}")
        if version == 0:
            db.execute("""
                CREATE TABLE IF NOT EXISTS garden_plants (
                    garden TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
                    species_id TEXT, drainage TEXT NOT NULL, created_at TEXT NOT NULL,
                    PRIMARY KEY (garden, id)
                )
            """)
            db.execute("""
                CREATE TABLE IF NOT EXISTS garden_care (
                    garden TEXT NOT NULL, plant TEXT NOT NULL, id TEXT NOT NULL,
                    kind TEXT NOT NULL, occurred_at TEXT NOT NULL,
                    PRIMARY KEY (garden, plant, id),
                    FOREIGN KEY (garden, plant) REFERENCES garden_plants (garden, id)
                )
            """)
            db.execute("ALTER TABLE garden_care ADD COLUMN checkup TEXT")
        if version < 2:
            db.execute("ALTER TABLE garden_plants ADD COLUMN container_volume_ml INTEGER")
            db.execute("ALTER TABLE garden_plants ADD COLUMN potting_mix TEXT")
            db.execute("PRAGMA user_version = 2")


@contextmanager
def database():
    path = os.getenv("PETEY_GARDEN_DB") or str(Path(__file__).resolve().parents[1] / "garden.sqlite")
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA foreign_keys = ON")
        migrate(db)
        with db:
            yield db
    finally:
        db.close()

def now():
    return datetime.now(timezone.utc)


def owned_plant(db, garden, plant_id):
    plant = db.execute(
        "SELECT * FROM garden_plants WHERE garden = ? AND id = ?", (garden, plant_id),
    ).fetchone()
    if plant is None:
        raise HTTPException(404, "Plant not found.")
    return plant


def history_for(db, garden, plant_id):
    return db.execute(
        """SELECT id, kind, occurred_at, checkup FROM garden_care WHERE garden = ? AND plant = ?
        ORDER BY rowid DESC""", (garden, plant_id),
    ).fetchall()


def timed_soil_state(event):
    # Legacy dry entries have no inspection depth. They remain in the permanent history.
    kind = event["kind"]
    if kind not in {"dry", "moist", "wet"}:
        return None
    observation = AssessmentInput.model_validate_json(event["checkup"]) if event["checkup"] else None
    if kind == "dry" and (
        not observation or observation.inspection_depth != "recommended" or observation.standing_water == "yes"
    ):
        return None
    committed_at = datetime.fromisoformat(event["occurred_at"])
    observed_at = min(committed_at, observation.captured_at) if observation else committed_at
    return ("moist" if kind == "wet" else kind, observed_at)


def watered_check_delay(history):
    """Move the default check by one day after two consistent observed cycles."""
    watering_times = [index for index, event in enumerate(history) if event["kind"] == "watered"]
    if len(watering_times) < 3:
        return 3

    delays = []
    for newer, older in zip(watering_times[:2], watering_times[1:3]):
        started = datetime.fromisoformat(history[older]["occurred_at"])
        ended = datetime.fromisoformat(history[newer]["occurred_at"])
        observations = [
            state for event in reversed(history[newer + 1:older])
            if (state := timed_soil_state(event)) is not None
        ]
        if not observations or observations[-1][0] != "dry":
            return 3

        last_dry = observations[-1][1]
        if not timedelta(0) <= ended - last_dry < timedelta(days=1):
            return 3

        first_dry_index = next(index for index, (state, _) in enumerate(observations) if state == "dry")
        moist_observations = observations[:first_dry_index]
        if not moist_observations or any(state == "moist" for state, _ in observations[first_dry_index:]):
            return 3

        last_moist = moist_observations[-1][1]
        first_dry = observations[first_dry_index][1]
        if not started < last_moist < first_dry <= ended:
            return 3
        if first_dry - started <= timedelta(days=2):
            delays.append(2)
        elif last_moist - started >= timedelta(days=3):
            delays.append(4)
        else:
            return 3

    return delays[0] if delays[0] == delays[1] else 3


def verified_care_source(species):
    if (
        species and species.verified_watering
        and species.verification_status.get("watering") == "verified"
        and species.verification_sources.get("watering")
    ):
        return species.verification_sources["watering"]
    return None


def check_prompt_for(species, species_id, source):
    if not source:
        return None
    return (
        GUIDED_SPECIES.get(species_id)
        or (species.verified_soil_moisture if species else None)
        or (species.verified_watering if species else None)
    )


def serialized_event(row):
    data = {key: row[key] for key in ("id", "kind", "occurred_at")}
    if row["checkup"] is not None:
        assessment = AssessmentInput.model_validate_json(row["checkup"])
        data["observation"] = assessment.model_dump(exclude={"based_on"})
    return data


def plant_view(plant, history, timestamp):
    species = SpeciesCatalog.get(plant["species_id"])
    source = verified_care_source(species)
    check = check_prompt_for(species, plant["species_id"], source)
    last = history[0] if history else None
    kind = last["kind"] if last else None
    due = datetime.fromisoformat(plant["created_at"])
    check_delay = 3
    observation = AssessmentInput.model_validate_json(last["checkup"]) if last and last["checkup"] else None
    standing = bool(observation and observation.standing_water == "yes")
    if kind == "watered" and source and plant["drainage"] == "yes":
        check_delay = watered_check_delay(history)
    last_at = datetime.fromisoformat(last["occurred_at"]) if last else None
    observed_at = min(last_at, observation.captured_at) if observation else last_at
    if observed_at and (kind in {"moist", "wet", "watered", "dry"} or standing):
        due = observed_at + timedelta(days=check_delay if kind == "watered" else 1)
    fresh = last_at is not None and last_at <= timestamp < due
    active_conditions = []
    if fresh and standing:
        active_conditions.append("standing_water")
    if fresh and kind == "wet":
        active_conditions.append("wet_potting_mix")
    watering_locked = fresh and standing

    watering_suggested = bool(
        kind == "dry" and fresh and source and observation
        and validate_watering(observation, plant["drainage"], source) is None
    )
    if watering_suggested:
        status = "ready"
        message = "You reported dry mix at the recommended depth and a pot with drainage. If it still feels dry, water thoroughly and let the excess drain."
    elif fresh and (kind in {"moist", "wet"} or standing):
        status = "wait"
        if standing:
            message = "Hold off on watering. Empty standing water from the saucer or outer pot."
        elif kind == "wet":
            message = "Hold off on watering. You reported wet mix. Check the saucer or outer pot for standing water."
        else:
            message = "You reported that the mix is still moist. Check again later."
    elif kind == "watered" and fresh:
        status = "rest"
        if check_delay != 3:
            message = "Your last two watering cycles shifted the estimated check date. Feel the mix at your next check."
        else:
            message = "Watering is in your care history. Give your plant time before the next check."
    elif kind == "dry" and fresh:
        status = "details"
        if plant["species_id"] is None:
            message = "Identify this plant in its profile to get species-specific advice."
        elif source is None:
            message = "This species doesn’t have a verified watering policy yet. Check its care guide or pot drainage before watering."
        elif plant["drainage"] != "yes":
            message = "Check how the pot drains before deciding whether to water."
        else:
            message = "Use Checkup to verify the soil at the recommended depth, drainage and standing water before watering."
    elif kind == "unsure":
        status = "check"
        message = "Take another look when you can. If you’re still unsure, hold off on watering."
    else:
        status = "check"
        message = check or "Feel the potting mix and note which parts are dry or moist."

    return {
        "id": plant["id"], "name": plant["name"], "species_id": plant["species_id"],
        "common_name": species.common_name if species else GARDEN_IDENTITIES.get(plant["species_id"]),
        "drainage": plant["drainage"], "status": status, "message": message,
        "container_volume_ml": plant["container_volume_ml"],
        "potting_mix": plant["potting_mix"],
        "check_prompt": check or "Feel the potting mix and note whether it feels dry or moist.",
        "next_check_at": None if watering_suggested else due.isoformat(),
        "watering_advice_expires_at": due.isoformat() if watering_suggested else None,
        "watering_guidance": species.verified_watering if source else None,
        "watering_source": source,
        "active_conditions": active_conditions,
        "assessment_updated_at": observed_at.isoformat() if observed_at and kind != "watered" else None,
        "watering_locked": watering_locked,
        "lock_reason": message if watering_locked else None,
        "history": [serialized_event(row) for row in history],
    }


@router.get("/species")
def garden_species():
    entries = [
        {
            "id": species.scientific_name,
            "name": species.common_name,
            "cultivar": species.cultivar,
            "advice_status": "verified" if verified_care_source(species) else "none",
        }
        for species in SPECIES
    ]
    entries.extend(
        {"id": key, "name": name, "cultivar": "", "advice_status": "none"}
        for key, name in GARDEN_IDENTITIES.items()
        if key not in SpeciesCatalog
    )
    return sorted(entries, key=lambda item: (item["advice_status"] != "verified", item["name"].casefold(), item["id"]))


@router.get("/plants")
def list_plants(garden: GardenKey):
    key = str(garden)
    with database() as db:
        plants = db.execute(
            "SELECT * FROM garden_plants WHERE garden = ? ORDER BY rowid", (key,),
        ).fetchall()
        timestamp = now()
        return [plant_view(plant, history_for(db, key, plant["id"]), timestamp) for plant in plants]


@router.post("/plants")
def create_plant(payload: NewPlant, garden: GardenKey):
    if payload.species_id is not None and payload.species_id not in SpeciesCatalog and payload.species_id not in GARDEN_IDENTITIES:
        raise HTTPException(422, "Choose a species from the catalog or select ‘I’m not sure’.")
    key, plant_id = str(garden), str(payload.id)
    with database() as db:
        db.execute(
            """INSERT INTO garden_plants (garden, id, name, species_id, drainage, created_at)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (garden, id) DO NOTHING""",
            (key, plant_id, payload.name, payload.species_id, payload.drainage, now().isoformat()),
        )
        plant = owned_plant(db, key, plant_id)
        if (plant["name"], plant["species_id"], plant["drainage"]) != (
            payload.name, payload.species_id, payload.drainage,
        ):
            raise HTTPException(409, "This plant was already saved with different details.")
        return plant_view(plant, history_for(db, key, plant_id), now())


@router.patch("/plants/{plant_id}")
def update_plant(plant_id: UUID4, payload: PlantUpdate, garden: GardenKey):
    fields = payload.model_fields_set
    if "name" in fields and payload.name is None:
        raise HTTPException(422, "Plant name cannot be empty.")
    if "drainage" in fields and payload.drainage is None:
        raise HTTPException(422, "Drainage must be yes, no, or unknown.")
    if "species_id" in fields and payload.species_id is not None:
        if payload.species_id not in SpeciesCatalog and payload.species_id not in GARDEN_IDENTITIES:
            raise HTTPException(422, "Choose a species from the catalog or select ‘I’m not sure’.")
    key, plant_key = str(garden), str(plant_id)
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        plant = owned_plant(db, key, plant_key)
        name = payload.name if "name" in fields else plant["name"]
        species_id = payload.species_id if "species_id" in fields else plant["species_id"]
        drainage = payload.drainage if "drainage" in fields else plant["drainage"]
        container_volume_ml = payload.container_volume_ml if "container_volume_ml" in fields else plant["container_volume_ml"]
        potting_mix = payload.potting_mix if "potting_mix" in fields else plant["potting_mix"]
        db.execute(
            """UPDATE garden_plants SET name = ?, species_id = ?, drainage = ?, container_volume_ml = ?,
            potting_mix = ? WHERE garden = ? AND id = ?""",
            (name, species_id, drainage, container_volume_ml, potting_mix, key, plant_key),
        )
        updated = owned_plant(db, key, plant_key)
        return plant_view(updated, history_for(db, key, plant_key), now())


@router.post("/plants/{plant_id}/care")
def record_care(plant_id: UUID4, payload: CareAction, garden: GardenKey):
    key, plant_id, event_id = str(garden), str(plant_id), str(payload.id)
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        plant = owned_plant(db, key, plant_id)
        history = history_for(db, key, plant_id)
        prior = next((event for event in history if event["id"] == event_id), None)
        if prior is not None and (prior["kind"] != payload.kind or prior["checkup"] is not None):
            raise HTTPException(409, "This care entry was already saved with a different answer.")
        timestamp = now()
        if prior is None:
            db.execute(
                "INSERT INTO garden_care (garden, plant, id, kind, occurred_at) VALUES (?, ?, ?, ?, ?)",
                (key, plant_id, event_id, payload.kind, timestamp.isoformat()),
            )
            history = history_for(db, key, plant_id)
        return plant_view(plant, history, timestamp)


def assess_for(plant, plant_id, payload):
    source = verified_care_source(SpeciesCatalog.get(plant["species_id"]))
    return assess_watering(payload, plant_id, plant["drainage"], source, payload.captured_at)


def verify_snapshot(history, payload, timestamp):
    current = history[0]["id"] if history else None
    requested = str(payload.based_on) if payload.based_on is not None else None
    if current != requested:
        raise HTTPException(409, "This plant’s care history changed. Reopen Checkup to use its latest information.")
    if payload.captured_at > timestamp:
        payload = payload.model_copy(update={"captured_at": timestamp})
    elapsed = timestamp - payload.captured_at
    if elapsed > CHECKUP_MAX_AGE:
        raise HTTPException(409, "This observation’s time is out of date. Recheck your plant and start a fresh Checkup.")
    if history:
        last = history[0]
        latest = datetime.fromisoformat(last["occurred_at"])
        if last["checkup"]:
            latest = min(latest, AssessmentInput.model_validate_json(last["checkup"]).captured_at)
        if payload.captured_at < latest:
            raise HTTPException(409, "This observation came before the latest care update. Recheck your plant.")
    return payload


def _same_checkup_retry(prior, payload: AssessmentInput) -> bool:
    if not prior["checkup"]:
        return False
    saved = AssessmentInput.model_validate_json(prior["checkup"])
    if saved == payload:
        return True
    # Clamped future device clocks store server time; allow exact-field retries from the skewed clock.
    return (
        saved.model_dump(exclude={"captured_at"}) == payload.model_dump(exclude={"captured_at"})
        and str(saved.captured_at.isoformat()) == str(prior["occurred_at"])
        and payload.captured_at >= saved.captured_at
    )


@router.get("/plants/{plant_id}/checkup", response_model=CheckupContext)
def checkup_context(plant_id: UUID4, garden: GardenKey):
    key = str(garden)
    with database() as db:
        db.execute("BEGIN")
        plant = owned_plant(db, key, str(plant_id))
        history = history_for(db, key, str(plant_id))
        source = verified_care_source(SpeciesCatalog.get(plant["species_id"]))
        prompt = (
            check_prompt_for(SpeciesCatalog.get(plant["species_id"]), plant["species_id"], source)
            or "Feel the mix below the surface and note what you can tell."
        )
        return CheckupContext(
            plant_id=plant_id, name=plant["name"], species_id=plant["species_id"],
            drainage=plant["drainage"], check_prompt=prompt, based_on=history[0]["id"] if history else None,
        )


@router.post("/plants/{plant_id}/assessments", response_model=AssessmentResult)
def preview_assessment(plant_id: UUID4, payload: AssessmentInput, garden: GardenKey):
    key = str(garden)
    with database() as db:
        db.execute("BEGIN")
        plant = owned_plant(db, key, str(plant_id))
        payload = verify_snapshot(history_for(db, key, str(plant_id)), payload, now())
        return assess_for(plant, plant_id, payload)


@router.post("/plants/{plant_id}/assessments/{assessment_id}/confirm")
def confirm_assessment(plant_id: UUID4, assessment_id: UUID4, payload: AssessmentInput, garden: GardenKey):
    key, plant_key, event_id = str(garden), str(plant_id), str(assessment_id)
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        plant = owned_plant(db, key, plant_key)
        history = history_for(db, key, plant_key)
        prior = next((event for event in history if event["id"] == event_id), None)
        timestamp = now()
        if prior is not None:
            if not _same_checkup_retry(prior, payload):
                raise HTTPException(409, "This observation was already saved with different answers.")
            return plant_view(plant, history, timestamp)
        payload = verify_snapshot(history, payload, timestamp)
        encoded = payload.model_dump_json()
        result = assess_for(plant, plant_id, payload)
        if not any(item.category == "OWNER_OBSERVED" and item.field != "inspection_depth" for item in result.evidence):
            raise HTTPException(422, "Add an observation before saving Checkup.")
        kind = "unsure" if payload.soil == "unknown" else payload.soil
        db.execute(
            """INSERT INTO garden_care (garden, plant, id, kind, occurred_at, checkup)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (key, plant_key, event_id, kind, timestamp.isoformat(), encoded),
        )
        return plant_view(plant, history_for(db, key, plant_key), timestamp)
