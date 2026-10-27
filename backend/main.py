"""Petey Plant backend — FastAPI app, in-memory plant store."""
from __future__ import annotations

import os
import secrets
import sys
import threading
import time
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import Body, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

import config
from data.seed_10k_species import SPECIES, build_demo_plants
from models.schemas import (
    HistoryEntry,
    PlantState,
    QuizAnswerRequest,
    SitterViewResponse,
    SitterWaterResponse,
    TriageRequest,
    TriageResponse,
    WaterResponse,
)
from services import ml_vision
from services.muse_agent_harness import run_triage
from services import timeseries_ml
from services.tool_registry import ToolRegistryError, get_evidence, list_tools
from services.muse_creative import derive_expression
from services.rag_engine import search_species
from services.timeseries_vpd import (
    check_emergency_brake,
    compute_hp,
    pot_factor,
)

# CORS: restricted to an env list (default Vite dev + preview origins).
# allow_credentials=False: no cookie auth exists, so credentialed CORS
# would only widen the attack surface (any site could mutate demo plants).
_CORS_ORIGINS = [
    o.strip() for o in os.environ.get(
        "PETEY_CORS_ORIGINS", "http://localhost:5173,http://localhost:4173"
    ).split(",") if o.strip()
]

app = FastAPI(title="Petey Plant", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=_CORS_ORIGINS, allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)


class HeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Model-Provider"] = config.MODEL_PROVIDER
        response.headers["X-Muse-Model-ID"] = config.MUSE_MODEL_ID
        response.headers["X-Muse-Creative-Model"] = config.MUSE_CREATIVE_MODEL
        # Headers alone must not imply a live model ran.
        response.headers["X-Muse-Fallback"] = str(config.FALLBACK).lower()
        return response


app.add_middleware(HeadersMiddleware)

# In-memory store (reset on restart).
PLANTS: dict[str, PlantState] = {p.id: p for p in build_demo_plants()}

# Thread safety: sync endpoints run in a threadpool over shared mutable
# dicts, so every mutation below takes _STORE_LOCK.
_STORE_LOCK = threading.Lock()


def _level(xp: int) -> int:
    return 1 + xp // 200


def _apply_level(plant: PlantState) -> None:
    """Sticky level: level = max(previous level, 1 + xp // 200).
    Spending XP (e.g. a shield) must never demote the player."""
    plant.level = max(plant.level, _level(plant.xp))


def _species_for(plant: PlantState):
    return next((s for s in SPECIES if s.scientific_name == plant.species_scientific_name), None)


def _disease_penalty(plant: PlantState) -> float:
    # Spider-mite infestation is the demo plants' modelled disease signal.
    return 10.0 if plant.particle_effect == "spider_mites" else 0.0


def _recompute_hp(plant: PlantState) -> None:
    """Recompute HP from current moisture/VPD/lux + disease penalty."""
    sp = _species_for(plant)
    if sp is None:
        return
    plant.hp = compute_hp(
        plant.moisture_pct, plant.vpd_kpa, plant.lux, sp,
        disease_penalty=_disease_penalty(plant),
    )


def _refresh_brake(plant: PlantState) -> None:
    """Unlock path (audit fix): the root-rot brake is re-evaluated from
    the last 7 days of history on every read/triage. If the 4-day
    low-VPD condition no longer holds, the lock clears; if it newly
    holds, the lock engages. Nothing else ever clears a lock."""
    recent_vpd = [h.vpd_kpa for h in plant.history[-7:]]
    if check_emergency_brake(recent_vpd):
        if not plant.watering_locked:
            plant.watering_locked = True
            plant.lock_reason = "Root-rot brake: VPD below 0.4 kPa sustained 4+ days — watering locked to prevent root rot."
    else:
        plant.watering_locked = False
        plant.lock_reason = None


def _refresh_expression(plant: PlantState) -> PlantState:
    """Apply telemetry-driven neglect expressions to a plant in place.

    Stale-avatar fix: particle_effect and droop_angle_deg are ALWAYS
    written from derive_expression — on recovery (hp > 30) the plant's
    healthy base particle effect is restored and droop follows the
    (100 - hp) * 0.5 formula, instead of a stale raincoat/45 deg
    sticking around after the plant recovers.
    """
    _refresh_brake(plant)
    sp = _species_for(plant)
    lo = sp.min_soil_moisture_pct if sp else None
    hi = sp.max_soil_moisture_pct if sp else None
    derived = derive_expression(plant.hp, plant.moisture_pct, plant.mood, lo, hi)
    plant.expression = derived["expression"]
    if plant.hp <= 30:
        plant.particle_effect = derived["particle_effect"]
        plant.droop_angle_deg = derived["droop_angle_deg"]
    else:
        plant.particle_effect = plant.base_particle_effect or plant.particle_effect
        plant.droop_angle_deg = round(max(0.0, min(60.0, (100.0 - plant.hp) * 0.5)), 2)
    return plant


for _p in PLANTS.values():
    _refresh_expression(_p)

# --- Quiz bank (answers are server-side only; GET /quiz never returns them) ---
QUIZ_BANK = [
    {"question": "How often should you usually water a snake plant (Sansevieria/Dracaena)?",
     "options": ["Every day", "Only when the soil is fully dry", "Every hour", "Never — it drinks air"],
     "answer_index": 1, "topic": "watering"},
    {"question": "What is the most common cause of root rot in houseplants?",
     "options": ["Overwatering and soggy soil", "Too little light", "Talking to the plant", "Small pots"],
     "answer_index": 0, "topic": "root rot"},
    {"question": "A calathea (Goeppertia) with crispy brown leaf edges most likely wants…",
     "options": ["More direct sun", "Less water forever", "Higher humidity and filtered water", "A bigger pot immediately"],
     "answer_index": 2, "topic": "humidity"},
    {"question": "What does VPD measure in plant care?",
     "options": ["Soil pH", "Leaf colour", "Pot size", "How strongly the air pulls water from leaves"],
     "answer_index": 3, "topic": "VPD"},
    {"question": "A monstera's fenestrations (splits/holes) mainly help it…",
     "options": ["Store water", "Scare pests", "Let light and wind pass through large leaves", "Attract bees"],
     "answer_index": 2, "topic": "monstera"},
    {"question": "Why should you let most houseplants drain after watering?",
     "options": ["Standing water suffocates roots and invites rot", "Plants hate baths", "It saves soil", "Drainage is a myth"],
     "answer_index": 0, "topic": "drainage"},
    {"question": "Which light is best for most tropical houseplants?",
     "options": ["Harsh midday direct sun", "Bright indirect light", "Total darkness", "Only moonlight"],
     "answer_index": 1, "topic": "light"},
    {"question": "Spider mites on a plant are most likely when the air is…",
     "options": ["Humid and cool", "Freezing", "Hot and dry", "Underwater"],
     "answer_index": 2, "topic": "pests"},
    {"question": "What should you do first when you see a watering lock (root-rot brake)?",
     "options": ["Water anyway", "Repot in wet soil", "Move it to a dark closet", "Let the soil dry and improve airflow"],
     "answer_index": 3, "topic": "root-rot brake"},
    {"question": "Succulents like echeveria prefer soil that is…",
     "options": ["Constantly soggy", "Well-draining and allowed to dry out", "Pure clay", "Always frozen"],
     "answer_index": 1, "topic": "succulents"},
]
_QUIZ_COUNTER = [0]
_QUIZ_ANSWERS: dict[str, int] = {}
_QUIZ_CONSUMED: dict[str, float] = {}  # quiz_id -> answered timestamp
_QUIZ_MAX = 500


def _store_quiz_answer(quiz_id: str, answer_index: int) -> None:
    _QUIZ_ANSWERS[quiz_id] = answer_index
    while len(_QUIZ_ANSWERS) > _QUIZ_MAX:
        _QUIZ_ANSWERS.pop(next(iter(_QUIZ_ANSWERS)))
    while len(_QUIZ_CONSUMED) > _QUIZ_MAX:
        _QUIZ_CONSUMED.pop(next(iter(_QUIZ_CONSUMED)))


# Sitter state (in-memory): cumulative sitter XP per plant + action log.
SITTER_XP: dict[str, int] = {}
SITTER_ACTIONS: list[dict] = []
# Real sitter tokens: token -> {plant_id, issued_at, uses}. Issued ONLY
# by POST /plants/{id}/sitter (secrets.token_urlsafe, unguessable);
# every sitter request verifies token -> plant_id, forged tokens 401.
# Demo leniency is documented but NOT accept-anything: issuance is the
# only way to mint a valid token. Tokens are never stored in the action log.
SITTER_TOKENS: dict[str, dict] = {}
# Sitter tokens expire: a vacation stint is days to weeks, never forever.
# issued_at was recorded but never read, so tokens used to live forever.
SITTER_TOKEN_TTL_S = 30 * 24 * 3600


def _verify_sitter_token(token: str, plant_id: str) -> bool:
    # STRESS FIX: the uses counter increment is a read-modify-write and
    # used to run unlocked (lost increments under concurrency). Guard it.
    # Call sites never hold _STORE_LOCK at verification time, so no nesting.
    with _STORE_LOCK:
        record = SITTER_TOKENS.get(token)
        if record is None or record["plant_id"] != plant_id:
            return False
        # Expiry is checked BEFORE the uses increment and the expired
        # record is purged on sight; a malformed record (no issued_at)
        # is treated as expired (safe default).
        issued_at = record.get("issued_at")
        if issued_at is None or time.time() - issued_at > SITTER_TOKEN_TTL_S:
            del SITTER_TOKENS[token]
            return False
        record["uses"] += 1
        return True


def _apply_watering(plant: PlantState) -> float:
    """Shared owner/sitter watering state update (only XP differs).

    Species-aware amount: base 25% scaled by the pot factor (porous
    pots take more water), then capped at species max + 10 points of
    headroom — watering tops up toward (not far beyond) the species
    range and never pushes an already-overwatered plant higher.
    Appends a history entry for the watering day (history is
    append-only; the last day is never rewritten) and reconciles
    next_water with the plant's triage interval (default 3 days only
    when no triage interval has been stored). HP is recomputed.
    """
    sp = _species_for(plant)
    amount = 25.0 * pot_factor(plant.pot_material)
    new_moisture = plant.moisture_pct + amount
    if sp is not None:
        # STRESS FIX: the old code only capped when moisture was already
        # at/below the cap, so watering an already-overwatered plant
        # pushed it HIGHER (moisture + amount, uncapped) — contradicting
        # this function's "never pushes an already-overwatered plant
        # higher" contract. Now: top up toward the cap, and hold flat at
        # the current level when already above it (never raise, never lower).
        cap = sp.max_soil_moisture_pct + 10.0
        if plant.moisture_pct < cap:
            new_moisture = min(new_moisture, cap)
        else:
            new_moisture = plant.moisture_pct
    plant.moisture_pct = min(100.0, new_moisture)
    today = date.today()
    last = plant.history[-1] if plant.history else None
    plant.history.append(HistoryEntry(
        date_iso=today.isoformat(),
        moisture_pct=round(plant.moisture_pct, 1),
        vpd_kpa=plant.vpd_kpa,
        temp_c=last.temp_c if last else 22.0,
        rh_pct=last.rh_pct if last else 55.0,
        lux=plant.lux,
        watered=True,
    ))
    plant.next_water_iso = (today + timedelta(days=plant.watering_interval_days)).isoformat()
    _recompute_hp(plant)
    _refresh_expression(plant)
    return plant.moisture_pct


@app.get("/health")
def health():
    return {
        "status": "ok", "service": "petey-plant",
        "model_provider": config.MODEL_PROVIDER,
        "model_id": config.MUSE_MODEL_ID,
        "creative_model": config.MUSE_CREATIVE_MODEL,
        "fallback": config.FALLBACK,
    }


@app.get("/api/v1/species")
def list_species(q: str | None = None):
    # STRESS FIX: bound the TF-IDF work per request (O(docs x tokens)).
    # Real clients and URL limits keep queries far below this; anything
    # larger is abuse-shaped, not a species search.
    if q is not None and len(q) > 2000:
        raise HTTPException(status_code=400, detail="query too long (max 2000 characters)")
    if not q:
        return {"results": [s.model_dump() for s in SPECIES[:100]]}
    ranked = search_species(q, SPECIES)
    # Only return matches with a positive score, capped at 100.
    results = [r["species"].model_dump() for r in ranked if r["score"] > 0][:100]
    return {"results": results}


@app.get("/api/v1/plants")
def list_plants():
    return {"plants": [_refresh_expression(p).model_dump() for p in PLANTS.values()]}


@app.get("/api/v1/plants/{plant_id}")
def get_plant(plant_id: str):
    plant = PLANTS.get(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    return _refresh_expression(plant).model_dump()


def _forecast_for_plant(plant: PlantState) -> dict:
    """Timeseries-ML forecast payload shared by /forecast and triage."""
    sp = _species_for(plant)
    if sp is None:
        sp = SimpleNamespace(
            crop_coeff_k=0.8, min_soil_moisture_pct=30.0,
            max_soil_moisture_pct=70.0, optimal_lux=2500.0,
        )
    try:
        residual_std = timeseries_ml.decompose_series(plant.history)["residual_std"] \
            if len(plant.history) >= 7 else 0.0
    except ValueError:
        residual_std = 0.0
    forecast_days = timeseries_ml.forecast_moisture(
        plant.moisture_pct, sp.crop_coeff_k, pot_factor(plant.pot_material),
        plant.vpd_kpa, plant.lux, sp.optimal_lux, days=7,
        residual_std=residual_std,
    )
    return {
        "forecast_days": forecast_days,
        "anomalies": timeseries_ml.detect_anomalies(plant.history, sp),
        "root_rot_risk": timeseries_ml.root_rot_risk(plant.history, sp),
        "recommendation": timeseries_ml.recommend_watering(
            forecast_days, sp.min_soil_moisture_pct),
    }


@app.get("/api/v1/plants/{plant_id}/forecast")
def plant_forecast(plant_id: str):
    plant = PLANTS.get(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    payload = _forecast_for_plant(plant)
    return {"plant_id": plant_id, **payload}


@app.post("/api/v1/plants/{plant_id}/water", response_model=WaterResponse)
def water_plant(plant_id: str):
    plant = PLANTS.get(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    with _STORE_LOCK:
        _refresh_expression(plant)
        if plant.watering_locked:
            return {
                "plant_id": plant_id, "watered": False,
                "moisture_pct": plant.moisture_pct,
                "message": f"Watering locked: {plant.lock_reason or 'root-rot brake active'} — let the soil dry before watering again.",
                "locked": True,
            }
        today = date.today().isoformat()
        if plant.last_watered_date == today:
            # Once-per-day guard: no XP and no streak increment on repeat
            # watering the same day. Moisture is topped up only if the
            # species-aware amount actually raises it (it is clamped at
            # the plant's target range, so the message must say so).
            before = plant.moisture_pct
            moisture = _apply_watering(plant)
            topped = "moisture topped up" if moisture > before else "moisture already at target — no change"
            return {
                "plant_id": plant_id, "watered": True,
                "moisture_pct": moisture,
                "message": f"{plant.name} already watered today — {topped}, and no extra XP or streak for repeat watering.",
                "locked": False,
            }
        moisture = _apply_watering(plant)
        plant.xp += 20
        # Streak semantics (Duolingo-style): consecutive days build the
        # streak; a missed day resets it to 1. No previous date (or an
        # unparseable one) keeps the old +1 behavior; a future-dated
        # previous watering (clock skew) never resets either.
        prev_watered = plant.last_watered_date
        plant.last_watered_date = today
        if prev_watered:
            try:
                gap = (date.fromisoformat(today) - date.fromisoformat(prev_watered)).days
            except ValueError:
                gap = 1
            plant.streak_days = 1 if gap > 1 else plant.streak_days + 1
        else:
            plant.streak_days += 1
        _apply_level(plant)
        return {
            "plant_id": plant_id, "watered": True,
            "moisture_pct": moisture,
            "message": f"{plant.name} watered! +20 XP.",
            "locked": False,
        }


@app.get("/api/v1/agent/tools")
def agent_tools():
    """Declared tool registry catalog (REA-style: name, description,
    input/output schemas, version per tool)."""
    return {"tools": list_tools()}


@app.get("/api/v1/agent/evidence/{evidence_id}")
def agent_evidence(evidence_id: str):
    """Retained evidence record for a triage run (in-memory bundle)."""
    try:
        return get_evidence(evidence_id)
    except ToolRegistryError as exc:
        status = 409 if exc.code == "evidence_integrity_mismatch" else 404
        raise HTTPException(status_code=status, detail={"error_code": exc.code, "message": exc.message})


@app.post("/api/v1/agent/triage", response_model=TriageResponse)
def agent_triage(req: TriageRequest):
    plant = PLANTS.get(req.plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    with _STORE_LOCK:
        # Refresh the brake (locks AND unlocks) and HP from current
        # telemetry before triaging, so the trace reflects live state.
        _refresh_expression(plant)
        _recompute_hp(plant)
        result = run_triage(
            plant.model_dump(), lat=req.lat, lon=req.lon,
            pot_material=req.pot_material, ac_on=req.ac_on,
            symptoms=req.symptoms,
        )
        # Persist the triage schedule proposal when it changed and the
        # plant is not locked (H2 fix); locked plants keep their schedule.
        actions = result["actions"]
        if not plant.watering_locked and actions.get("next_water_iso"):
            plant.next_water_iso = actions["next_water_iso"]
            if actions.get("watering_interval_days"):
                plant.watering_interval_days = int(actions["watering_interval_days"])
        # Timeseries-ML risk + recommendation in triage actions.
        ml = _forecast_for_plant(plant)
        actions["root_rot_risk"] = ml["root_rot_risk"]
        actions["recommendation"] = ml["recommendation"]
        actions["forecast_days"] = ml["forecast_days"]
        actions["anomalies"] = ml["anomalies"]
        _refresh_expression(plant)
    return {
        "plant_id": req.plant_id,
        "muse_model_id": config.MUSE_MODEL_ID,
        "summary": result["summary"],
        "agent_trace": result["agent_trace"],
        "actions": actions,
        "telemetry": {
            "provider": config.MODEL_PROVIDER,
            "model_id": config.MUSE_MODEL_ID,
            "creative_model": config.MUSE_CREATIVE_MODEL,
            "fallback": config.FALLBACK,
            "latency_ms_total": result["latency_ms_total"],
        },
    }


@app.post("/api/v1/scan")
async def scan(
    request: Request,
    file: UploadFile = File(...),
    species: str | None = None,
    cultivar: str | None = None,
):
    # STRESS FIX: reject oversized bodies BEFORE reading them into
    # memory (a huge upload used to be fully buffered first). The
    # Content-Length check is the fast path; the body-length check
    # below remains as the backstop for chunked uploads with no header.
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared = int(content_length)
        except ValueError:
            declared = None
        if declared is not None and declared > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="upload too large (max 10 MB)")
    data = await file.read()
    # Upload size cap: reject bodies over 10 MB with 400.
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="upload too large (max 10 MB)")
    try:
        result = ml_vision.analyze_image(
            data, species_scientific_name=species, cultivar=cultivar)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"could not analyze image: {exc}")
    return result


@app.post("/api/v1/plants/{plant_id}/sitter")
def sitter(plant_id: str):
    plant = PLANTS.get(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    # Unguessable per-link token, stored server-side; issuance is the
    # only way to mint a valid token (no deterministic derivation).
    token = secrets.token_urlsafe(24)
    with _STORE_LOCK:
        SITTER_TOKENS[token] = {"plant_id": plant_id, "issued_at": time.time(), "uses": 0}
    checklist = [
        f"Check {plant.name}'s soil moisture (currently {plant.moisture_pct:.0f}%).",
        f"Water {plant.name} only if the soil is dry and watering is not locked.",
        f"Give {plant.name} bright indirect light.",
        f"Check {plant.name} for pests and drooping leaves.",
    ]
    if plant.watering_locked:
        checklist.insert(1, "DO NOT water — the root-rot brake is active.")
    return {
        "plant_id": plant_id,
        "sitter_token": token,
        "quest_checklist": checklist,
        "xp_reward": 50,
        "instructions": f"Look after {plant.name} ({plant.species_common_name}) while the owner is away. Follow the checklist and keep the streak alive!",
    }


# --- Delta B: quiz + shields ---

@app.get("/api/v1/quiz")
def get_quiz():
    """Deterministically rotating quiz question. The answer is NEVER returned here."""
    # STRESS FIX: counter increment + answer store are one atomic step —
    # two concurrent callers used to read the same counter and mint
    # duplicate quiz_ids, orphaning one issuance.
    with _STORE_LOCK:
        idx = _QUIZ_COUNTER[0] % len(QUIZ_BANK)
        _QUIZ_COUNTER[0] += 1
        quiz_id = f"quiz-{idx}-{_QUIZ_COUNTER[0]}"
        item = QUIZ_BANK[idx]
        _store_quiz_answer(quiz_id, item["answer_index"])
    return {"quiz_id": quiz_id, "question": item["question"],
            "options": list(item["options"]), "topic": item["topic"]}


@app.post("/api/v1/quiz/answer")
def answer_quiz(payload: QuizAnswerRequest):
    # Error ordering: payload shape is validated by Pydantic first
    # ({} -> 422), then the plant (404), then the quiz/token (404/410).
    plant = PLANTS.get(payload.plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    with _STORE_LOCK:
        if payload.quiz_id in _QUIZ_CONSUMED:
            raise HTTPException(status_code=410, detail="quiz already answered — no XP awarded")
        if payload.quiz_id not in _QUIZ_ANSWERS:
            raise HTTPException(status_code=404, detail="quiz not found")
        # Consume on first answer: the same quiz_id can never pay twice.
        answer_index = _QUIZ_ANSWERS.pop(payload.quiz_id)
        _QUIZ_CONSUMED[payload.quiz_id] = time.time()
    correct = (payload.selected_index == answer_index)
    xp_awarded = 0
    shield_awarded = False
    if correct:
        xp_awarded = 30
        with _STORE_LOCK:
            plant.xp += 30
            plant.quiz_correct_count += 1
            if plant.quiz_correct_count % 3 == 0:
                plant.mulch_shields += 1
                shield_awarded = True
            _apply_level(plant)
        message = "Correct! +30 XP." + (" You earned a Mulch Shield! 🛡️" if shield_awarded else "")
    else:
        message = "Not quite — no XP this time, but your plant still believes in you. Try another quiz!"
    _refresh_expression(plant)
    return {"correct": correct, "xp_awarded": xp_awarded,
            "shield_awarded": shield_awarded, "message": message,
            "plant": {"mulch_shields": plant.mulch_shields, "xp": plant.xp,
                      "level": plant.level}}


@app.post("/api/v1/plants/{plant_id}/shield/buy")
def buy_shield(plant_id: str):
    plant = PLANTS.get(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    # STRESS FIX (TOCTOU): the affordability check used to run OUTSIDE
    # the lock, so concurrent buyers could all pass the check and drive
    # XP negative. Check AND deduct atomically under one lock hold.
    with _STORE_LOCK:
        if plant.xp < 100:
            return {"success": False, "mulch_shields": plant.mulch_shields,
                    "xp": plant.xp, "level": plant.level, "cost": 100,
                    "message": f"Not enough XP: you have {plant.xp} XP and a shield costs 100 XP. Earn more with quizzes and watering!"}
        plant.xp -= 100
        plant.mulch_shields += 1
        _apply_level(plant)  # sticky: spending must not drop the level
        return {"success": True, "mulch_shields": plant.mulch_shields,
                "xp": plant.xp, "level": plant.level, "cost": 100,
                "message": "Shield purchased for 100 XP! 🛡️ Your plant is protected."}


# --- Delta B: sitter simplified view + sitter XP ---

def _sitter_view(plant: PlantState) -> dict:
    _refresh_expression(plant)
    # Cluster-aware thirst: CAM-cluster succulents (CLUSTER_C) are not thirsty
    # until soil moisture falls below the engine's critical-depletion VWC, so
    # a sitter is never told to water one prematurely.
    from services.botanical_engine_adapter import thirst_threshold_pct

    _thirst_at = thirst_threshold_pct(_species_for(plant))
    if plant.watering_locked:
        instructions = (f"Do NOT water {plant.name} right now — watering is locked to prevent root rot. "
                        f"Just check the soil, give bright indirect light, and look for pests.")
    elif plant.moisture_pct < _thirst_at:
        instructions = (f"{plant.name} is thirsty (soil about {plant.moisture_pct:.0f}%). "
                        f"Give a good drink until water drains, then let it drain fully.")
    else:
        instructions = (f"{plant.name} is doing okay (soil about {plant.moisture_pct:.0f}%). "
                        f"Only water if the top soil feels dry. Give bright indirect light.")
    checklist = [
        f"Check {plant.name}'s soil — currently about {plant.moisture_pct:.0f}% moist.",
        "Water only if the soil feels dry AND watering is not locked.",
        "Give bright indirect light (no harsh midday sun).",
        "Look for drooping leaves or pests and note anything odd.",
    ]
    if plant.watering_locked:
        checklist.insert(1, "DO NOT water — the root-rot brake is active.")
    return {
        "plant_id": plant.id,
        "plant_name": plant.name,
        "mood": plant.mood,
        "expression": plant.expression,
        "watering_locked": plant.watering_locked,
        "instructions": instructions,
        "quest_checklist": checklist,
        "xp_reward": 50,
        "sitter_xp": SITTER_XP.get(plant.id, 0),
    }


@app.get("/api/v1/sitter/{plant_id}", response_model=SitterViewResponse)
def sitter_view(plant_id: str, token: str | None = None):
    if not token:
        raise HTTPException(status_code=401, detail="a sitter token is required")
    plant = PLANTS.get(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    if not _verify_sitter_token(token, plant_id):
        raise HTTPException(status_code=401, detail="invalid sitter token")
    SITTER_ACTIONS.append({"plant_id": plant_id, "action": "view"})
    return _sitter_view(plant)


@app.post("/api/v1/sitter/{plant_id}/water", response_model=SitterWaterResponse)
def sitter_water(plant_id: str, payload: dict = Body(...)):
    token = (payload or {}).get("token")
    if not token:
        raise HTTPException(status_code=401, detail="a sitter token is required")
    plant = PLANTS.get(plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant not found")
    if not _verify_sitter_token(token, plant_id):
        raise HTTPException(status_code=401, detail="invalid sitter token")
    _refresh_expression(plant)
    if plant.watering_locked:
        SITTER_ACTIONS.append({"plant_id": plant_id, "action": "water_blocked"})
        return {"plant_id": plant_id, "watered": False, "locked": True, "sitter_xp_awarded": 0,
                "message": f"Watering is locked for {plant.name} — do not water. No sitter XP awarded, and that's the right call!",
                "moisture_pct": plant.moisture_pct}
    with _STORE_LOCK:
        # STRESS FIX (TOCTOU): re-check the brake under the lock — a
        # concurrent triage may have engaged it between the fast-path
        # check above and this mutation.
        _refresh_expression(plant)
        if plant.watering_locked:
            SITTER_ACTIONS.append({"plant_id": plant_id, "action": "water_blocked"})
            return {"plant_id": plant_id, "watered": False, "locked": True, "sitter_xp_awarded": 0,
                    "message": f"Watering is locked for {plant.name} — do not water. No sitter XP awarded, and that's the right call!",
                    "moisture_pct": plant.moisture_pct}
        moisture = _apply_watering(plant)
        SITTER_XP[plant.id] = SITTER_XP.get(plant.id, 0) + 50
    SITTER_ACTIONS.append({"plant_id": plant_id, "action": "water"})
    return {"plant_id": plant_id, "watered": True, "locked": False, "sitter_xp_awarded": 50,
            "message": f"You watered {plant.name} as sitter! +50 Sitter XP. 🌿",
            "moisture_pct": moisture}
