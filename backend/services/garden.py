"""Persistent, private-by-token gardens for the local single-device app."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, StringConstraints, UUID4

from data.seed_10k_species import SPECIES

router = APIRouter(prefix="/api/v1/garden", tags=["garden"])
GardenKey = Annotated[UUID4, Header(alias="X-Petey-Garden")]
SpeciesCatalog = {species.scientific_name: species for species in SPECIES}
DRAINAGE = Literal["yes", "no", "unknown"]
CARE_KIND = Literal["dry", "moist", "unsure", "watered"]
GUIDED_SPECIES = {
    "Monstera deliciosa": "Check whether the top quarter to one-third of the mix is dry.",
    "Epipremnum aureum": "Check whether the potting mix has dried out between waterings.",
}


class NewPlant(BaseModel):
    id: UUID4
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    species_id: str | None = None
    drainage: DRAINAGE = "unknown"


class CareAction(BaseModel):
    id: UUID4
    kind: CARE_KIND


@contextmanager
def database():
    path = os.getenv("PETEY_GARDEN_DB") or str(Path(__file__).resolve().parents[1] / "garden.sqlite")
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA foreign_keys = ON")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS garden_plants (
                garden TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
                species_id TEXT, drainage TEXT NOT NULL, created_at TEXT NOT NULL,
                PRIMARY KEY (garden, id)
            );
            CREATE TABLE IF NOT EXISTS garden_care (
                garden TEXT NOT NULL, plant TEXT NOT NULL, id TEXT NOT NULL,
                kind TEXT NOT NULL, occurred_at TEXT NOT NULL,
                PRIMARY KEY (garden, plant, id),
                FOREIGN KEY (garden, plant) REFERENCES garden_plants (garden, id)
            );
        """)
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
        """SELECT id, kind, occurred_at FROM garden_care WHERE garden = ? AND plant = ?
        ORDER BY rowid DESC""", (garden, plant_id),
    ).fetchall()


def watered_check_delay(history):
    """Move the default check by one day after two consistent observed cycles."""
    watering_times = [index for index, event in enumerate(history) if event["kind"] == "watered"]
    if len(watering_times) < 3:
        return 3

    delays = []
    for newer, older in zip(watering_times[:2], watering_times[1:3]):
        started = datetime.fromisoformat(history[older]["occurred_at"])
        ended = datetime.fromisoformat(history[newer]["occurred_at"])
        observations = [event for event in reversed(history[newer + 1:older]) if event["kind"] != "unsure"]
        if not observations or observations[-1]["kind"] != "dry":
            return 3

        last_dry = datetime.fromisoformat(observations[-1]["occurred_at"])
        if not timedelta(0) <= ended - last_dry < timedelta(days=1):
            return 3

        first_dry_index = next(index for index, event in enumerate(observations) if event["kind"] == "dry")
        moist_observations = observations[:first_dry_index]
        if not moist_observations or any(event["kind"] == "moist" for event in observations[first_dry_index:]):
            return 3

        last_moist = datetime.fromisoformat(moist_observations[-1]["occurred_at"])
        first_dry = datetime.fromisoformat(observations[first_dry_index]["occurred_at"])
        if not started < last_moist < first_dry <= ended:
            return 3
        if first_dry - started <= timedelta(days=2):
            delays.append(2)
        elif last_moist - started >= timedelta(days=3):
            delays.append(4)
        else:
            return 3

    return delays[0] if delays[0] == delays[1] else 3


def plant_view(plant, history, timestamp):
    species = SpeciesCatalog.get(plant["species_id"])
    check = GUIDED_SPECIES.get(plant["species_id"])
    verified = bool(
        species and species.verified_watering
        and species.verification_status.get("watering") == "verified"
        and species.verification_sources.get("watering")
    )
    source = species.verification_sources["watering"] if verified else None
    last = history[0] if history else None
    kind = last["kind"] if last else None
    due = datetime.fromisoformat(plant["created_at"])
    check_delay = 3
    if kind == "watered" and verified and check and plant["drainage"] == "yes":
        check_delay = watered_check_delay(history)
    if kind in ("moist", "watered", "dry"):
        days = {"moist": 1, "watered": check_delay, "dry": 1}
        due = datetime.fromisoformat(last["occurred_at"]) + timedelta(days=days[kind])

    watering_suggested = bool(
        kind == "dry" and verified and check and plant["drainage"] == "yes" and timestamp < due
    )
    if watering_suggested:
        status = "ready"
        message = "You reported dry mix and a pot with drainage. Water thoroughly and let the excess drain."
    elif kind == "moist" and timestamp < due:
        status = "wait"
        message = "You reported that the mix is still moist. Check again later."
    elif kind == "watered" and timestamp < due:
        status = "rest"
        if check_delay != 3:
            message = "Your last two watering cycles shifted the estimated check date. Feel the mix at your next check."
        else:
            message = "Watering is in your care history. Give your plant time before the next check."
    elif kind == "dry" and timestamp < due:
        status = "details"
        message = (
            "Check how the pot drains before deciding whether to water."
            if plant["drainage"] != "yes"
            else "Check this plant’s care guidance before deciding whether to water."
        )
    elif kind == "unsure":
        status = "check"
        message = "Take another look when you can. If you’re still unsure, hold off on watering."
    else:
        status = "check"
        message = check or "Feel the potting mix and note which parts are dry or moist."

    return {
        "id": plant["id"], "name": plant["name"], "species_id": plant["species_id"],
        "common_name": species.common_name if species else None,
        "drainage": plant["drainage"], "status": status, "message": message,
        "check_prompt": check or "Feel the potting mix and note whether it feels dry or moist.",
        "next_check_at": None if watering_suggested else due.isoformat(),
        "watering_guidance": species.verified_watering if verified else None,
        "watering_source": source,
        "history": [dict(row) for row in history],
    }


@router.get("/species")
def garden_species():
    return sorted(
        ({"id": species.scientific_name, "name": species.common_name, "cultivar": species.cultivar}
         for species in SPECIES),
        key=lambda item: (item["name"].casefold(), item["id"]),
    )


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
    if payload.species_id is not None and payload.species_id not in SpeciesCatalog:
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


@router.post("/plants/{plant_id}/care")
def record_care(plant_id: UUID4, payload: CareAction, garden: GardenKey):
    key, plant_id, event_id = str(garden), str(plant_id), str(payload.id)
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        plant = owned_plant(db, key, plant_id)
        history = history_for(db, key, plant_id)
        prior = next((event for event in history if event["id"] == event_id), None)
        if prior is not None and prior["kind"] != payload.kind:
            raise HTTPException(409, "This care entry was already saved with a different answer.")
        timestamp = now()
        if prior is None:
            db.execute(
                "INSERT INTO garden_care VALUES (?, ?, ?, ?, ?)",
                (key, plant_id, event_id, payload.kind, timestamp.isoformat()),
            )
            history = history_for(db, key, plant_id)
        return plant_view(plant, history, timestamp)
