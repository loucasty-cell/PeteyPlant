"""Deterministic ReAct loop (local fallback reasoning).

Same response shapes as a real LLM call would produce: each trace step has
thought, tool_name, tool_args, tool_observation, latency_ms, muse_model_id.
Tools are real functions, not stubs.

Per-step latency is MEASURED with time.perf_counter() around each
dispatch in run_triage (compliance GAP-3 / audit H4): latency_ms is the
measured integer milliseconds (0 = sub-millisecond, honestly measured,
not a fabricated constant). latency_ms_total is the measured total,
floored at the slowest step only to absorb rounding.

Deliberate tool-signature deviations from the spec (compliance GAP-4,
documented rather than hidden):
  * search_botanical_rag accepts optional symptoms (folded into the
    RAG query text) — spec's symptoms parameter, implemented.
  * run_timeseries_moisture_forecast accepts lat/lon/pot_material/ac_on.
  * mutate_watering_schedule is a PROPOSAL: it returns the proposed
    next_water_iso / interval but does not write the plant store; the
    main.py triage endpoint applies the proposal to the stored plant
    when it is not locked. This split is deliberate (the endpoint owns
    persistence and the lock check).
  * synthesize_petey_avatar / dispatch_duolingo_guilt_quest derive
    mood/pathology/urgency/headline from the plant state rather than
    accepting caller-supplied headline/dialogue overrides; the registry
    schemas describe the implemented signatures.
  * diagnose_engine_pathology runs the botanical engine's deterministic
    differential triage BEFORE the schedule/avatar/guilt steps, so care
    advice is generated after ground-truth pathology context exists.
    Species with no engine node return available=false, never an error.
"""
from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any, List, Optional

from config import MUSE_MODEL_ID
from data.seed_10k_species import SPECIES
from services.botanical_engine_adapter import (
    diagnose_plant,
    is_cam_cluster_species,
    thirst_threshold_pct,
)
from services.muse_creative import build_avatar_prompt, rig_params_for_state
from services.rag_engine import build_temporal_context, search_species
from services.timeseries_vpd import (
    effective_vpd,
    fetch_weather,
    forecast_moisture_days,
    pot_factor,
)
from services.tool_registry import ANALYSIS_PROFILE, build_evidence, dispatch, store_evidence

# Tool registry, populated at module level so tools are discoverable.
TOOLS = {}


def _register(fn):
    TOOLS[fn.__name__] = fn
    return fn


@_register
def search_botanical_rag(query: str, symptoms: Optional[List[str]] = None) -> str:
    """RAG search; optional symptoms refine the query text."""
    search_text = query
    if symptoms:
        search_text = f"{query} {' '.join(str(s) for s in symptoms)}"
    ranked = search_species(search_text, SPECIES)
    top = ranked[0] if ranked else None
    if not top:
        return "No species found."
    return f"{top['species'].common_name} ({top['species'].scientific_name}): {top['care_chunk']}"


@_register
def run_timeseries_moisture_forecast(
    plant: dict, days: int = 7, lat=None, lon=None,
    pot_material=None, ac_on: bool = False,
) -> str:
    theta = float(plant.get("moisture_pct", 50.0))
    sp = next((s for s in SPECIES if s.scientific_name == plant.get("species_scientific_name")), None)
    k = sp.crop_coeff_k if sp else 0.8
    lux_opt = sp.optimal_lux if sp else 2500.0
    alpha = pot_factor(pot_material if pot_material is not None else plant.get("pot_material"))
    if lat is not None and lon is not None:
        # Live weather when reachable; fetch_weather degrades to the
        # deterministic offline fallback (source recorded in the output).
        wx = fetch_weather(lat, lon)
        vpd = effective_vpd(float(wx["vpd_kpa"]), ac_on=bool(ac_on))
        lux = float(wx["lux"])
        source = wx["source"]
    else:
        vpd = effective_vpd(float(plant.get("vpd_kpa", 1.0)), ac_on=bool(ac_on))
        lux = float(plant.get("lux", 1500.0))
        source = "plant_telemetry"
    # 24 hourly steps per day (moisture_step is hourly).
    forecast = forecast_moisture_days(theta, k, alpha, vpd, lux, lux_opt, days=days)
    return (f"7-day moisture forecast: {forecast}; final {forecast[-1]}% "
            f"(from {plant.get('moisture_pct')}%). Weather source: {source}.")


@_register
def diagnose_engine_pathology(plant: dict) -> dict:
    """Differential pathology triage from the botanical engine (v2.4.0).

    Deterministic ground-truth context for the triage agent, produced BEFORE
    any care advice is generated. Returns available=false (not an error) for
    species with no engine node, so triage keeps working for all species.
    """
    species = next(
        (s for s in SPECIES if s.scientific_name == plant.get("species_scientific_name")),
        None,
    )
    result = diagnose_plant(plant, species) if species is not None else None
    if result is None:
        return {
            "available": False,
            "reason": (
                f"no engine node for {plant.get('species_scientific_name')!r}; "
                "differential pathology unavailable, triage proceeds on classical signals"
            ),
            "source": "petey_muse_botanical_engine v2.4.0 parameters",
        }
    return result


@_register
def mutate_watering_schedule(
    plant: dict, interval_days: int = 3, next_water_iso: Optional[str] = None,
) -> dict:
    """PROPOSAL ONLY (see module docstring): returns the proposed schedule;
    the endpoint persists it. No-op when the root-rot brake is locked."""
    if plant.get("watering_locked"):
        return {"interval_days": interval_days, "next_water_iso": plant.get("next_water_iso"),
                "changed": False, "reason": "watering locked by root-rot brake"}
    nxt = next_water_iso or (date.today() + timedelta(days=interval_days)).isoformat()
    return {"interval_days": interval_days, "next_water_iso": nxt, "changed": True}


@_register
def synthesize_petey_avatar(plant: dict, mood: str, pathology: str) -> dict:
    prompt = build_avatar_prompt(
        plant.get("species_common_name", "Plant"),
        plant.get("archetype_rig_id", ""),
        mood, pathology, plant.get("pot_type", "round"),
    )
    rig = rig_params_for_state(plant.get("hp", 50), plant.get("moisture_pct", 50), mood, pathology)
    return {"avatar_prompt": prompt, "rig_params": rig}


GUILT_LINES: dict[str, list[str]] = {
    "overwatered": [
        "{name} is literally swimming and has filed a formal complaint with the puddle union. Put. The watering can. DOWN. 🛑💧",
        "{name} just whispered 'I am not a fish' and honestly? Valid. No more water until the soil dries, bestie.",
        "BREAKING: local plant drowns in attention. {name} is wearing a tiny raincoat and judging you. Let it dry out!",
    ],
    "thirsty": [
        "{name} is so thirsty it just tried to drink your coffee. One sip of water and it will forgive you. Probably. 💧😭",
        "{name} has been dramatically wilting in the corner like it's auditioning for a soap opera. Water. Now. Please.",
        "Plot twist: {name} is not 'fine'. {name} is parched, dramatic, and one missed watering away from a full telenovela arc.",
    ],
    "sick": [
        "{name} is sick and has taken to bed (the pot). It left you a tiny note: 'I believed in you and also please check my leaves.' 🥀",
        "SOS from {name}: 'I am unwell, I am wilted, I am somehow still rooting for you.' Wipe those leaves, hero.",
        "{name} just coughed (botanically) and said 'this is fine' while visibly not fine. Help. Please. With feeling.",
    ],
    "thriving": [
        "{name} is THRIVING and has told every plant on the windowsill about you. Keep the streak alive or face the group chat. 🌟",
        "{name} is glowing, growing, and low-key showing off. Do NOT break this streak — {name} has already bragged about you.",
        "Certified plant-parent moment: {name} is flourishing and doing a tiny happy leaf dance. Encore? Encore.",
    ],
    "neglected": [
        "{name} missed you SO much it started a podcast about abandonment. Episode 1: 'Where Did My Human Go?' 🎙️🥀",
        "{name} here, passive-aggressively photosynthesizing. 'Oh, you're back? I hadn't noticed. I was busy surviving.'",
        "Duolingo owl just texted {name} asking for tips. {name} replied: 'my human ghosts me and I still grow. Anyway.'",
    ],
}


def guilt_state_for(plant: dict) -> str:
    """Classify a plant into a guilt-copy state (thirsty / overwatered / sick / thriving / neglected).

    Thirst is cluster-aware: CLUSTER_C CAM succulents count as thirsty only
    below the engine's critical-depletion VWC (5-8%), so a CAM plant at 20%
    moisture never gets a premature 'thirsty' guilt quest. All other species
    keep the 30% threshold, and mood words only trigger thirst for non-CAM
    plants. Order and all other states are unchanged.
    """
    if plant.get("watering_locked"):
        return "overwatered"
    hp = float(plant.get("hp", 50))
    if hp >= 80:
        return "thriving"
    if hp <= 30:
        return "sick"
    species = next(
        (s for s in SPECIES if s.scientific_name == plant.get("species_scientific_name")),
        None,
    )
    threshold = thirst_threshold_pct(species) if species is not None else 30.0
    cam = is_cam_cluster_species(species) if species is not None else False
    if float(plant.get("moisture_pct", 50)) < threshold or (
        str(plant.get("mood", "")).lower() in ("thirsty", "dry") and not cam
    ):
        return "thirsty"
    if int(plant.get("streak_days", 0)) == 0:
        return "neglected"
    return "neglected"


@_register
def dispatch_duolingo_guilt_quest(plant: dict) -> dict:
    state = guilt_state_for(plant)
    lines = GUILT_LINES[state]
    # Deterministic variety per plant: hash of the plant id picks the line.
    idx = sum(ord(c) for c in str(plant.get("id", ""))) % len(lines)
    name = plant.get("name") or "Petey"
    return {
        "quest": {
            "id": f"guilt-{plant.get('id')}",
            "title": f"{name} misses you!",
            "description": lines[idx].format(name=name),
            "xp_reward": 30, "completed": False,
        }
    }


def _normalize(observation: Any) -> Any:
    """Structured form of an observation. Strings become {"text": ...};
    dict results are kept as-is so the trace stays machine-readable."""
    return observation if isinstance(observation, dict) else {"text": str(observation)}


_LIMITATIONS = {
    "search_botanical_rag": ["local species index only; no live botanical source queried"],
    "run_timeseries_moisture_forecast": ["fallback weather: deterministic local model, no live forecast"],
    "mutate_watering_schedule": ["proposed schedule only; applied to the plant record by the triage endpoint, not written by the tool itself"],
    "synthesize_petey_avatar": ["procedural avatar prompt; no image model call in local fallback"],
    "dispatch_duolingo_guilt_quest": ["deterministic guilt copy; no live model call"],
}


def _step(thought: str, tool_name: str, tool_args: dict, observation: Any,
         limitations=None, latency_ms: int = 0) -> dict:
    """Trace step: all legacy keys are kept verbatim, plus REA-style
    evidence fields. tool_observation stays the human-readable string
    form of normalized_observation; raw_observation is null because the
    local fallback has no distinct upstream representation. When a caller
    passes limitations, they replace the static per-tool default so the
    record describes what actually happened (e.g. live vs fallback weather).

    Coverage honesty: status is "partial" when the observation shows an
    incomplete run — no species found, offline-fallback weather, or
    plant-telemetry-only forecast — and "complete" only for fully
    successful runs.
    """
    normalized = _normalize(observation)
    obs_text = str(observation)
    partial_markers = ("No species found", "offline_fallback", "plant_telemetry")
    coverage_status = "partial" if any(m in obs_text for m in partial_markers) else "complete"
    evidence = store_evidence(build_evidence(
        tool_name, tool_args, normalized, raw=None,
        limitations=limitations if limitations is not None else _LIMITATIONS.get(tool_name, []),
        coverage={"scope": tool_name, "status": coverage_status}))
    return {
        "thought": thought,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "tool_observation": observation if isinstance(observation, str) else str(observation),
        "latency_ms": int(latency_ms),
        "muse_model_id": MUSE_MODEL_ID,
        "evidence_id": evidence["evidence_id"],
        "normalized_observation": normalized,
        "raw_observation": None,
        "limitations": evidence["limitations"],
        "coverage": evidence["coverage"],
        "analysis_profile": dict(ANALYSIS_PROFILE),
    }


def run_triage(plant: dict, lat=None, lon=None, pot_material=None, ac_on: bool = False,
               symptoms: Optional[List[str]] = None) -> dict:
    """Execute RAG -> forecast -> engine pathology -> schedule -> avatar -> guilt.

    Each dispatch is timed with time.perf_counter(); the measured
    milliseconds are recorded on that step (no fabricated constants).
    The engine pathology step runs BEFORE any care advice (schedule,
    avatar, guilt) so those steps are generated after deterministic
    ground-truth pathology context exists.
    """
    trace: List[dict] = []
    t0 = time.perf_counter()

    def _timed_dispatch(tool_name: str, args: dict, plant_ctx: dict | None = None):
        start = time.perf_counter()
        result = dispatch(tool_name, args, plant=plant_ctx)
        return result, int(round((time.perf_counter() - start) * 1000))

    # 1. RAG — dispatched through the declared registry (validated args).
    q = f"{plant.get('species_common_name')} {plant.get('species_scientific_name')} care"
    rag_args = {"query": q}
    if symptoms:
        rag_args["symptoms"] = list(symptoms)
    obs, ms = _timed_dispatch("search_botanical_rag", rag_args)
    trace.append(_step("I need species care guidance before acting.", "search_botanical_rag", rag_args, obs, latency_ms=ms))
    # 2. Forecast — lat/lon flow through so the weather source is real
    # (live Open-Meteo when reachable, deterministic fallback otherwise);
    # pot_material and ac_on flow through to the moisture model.
    forecast_args = {"plant_id": plant.get("id"), "days": 7, "lat": lat, "lon": lon,
                     "pot_material": pot_material if pot_material is not None else plant.get("pot_material"),
                     "ac_on": bool(ac_on)}
    obs2, ms = _timed_dispatch("run_timeseries_moisture_forecast", forecast_args, plant)
    if "offline_fallback" in obs2:
        forecast_limits = ["fallback weather: deterministic local model, no live forecast"]
    elif "open-meteo" in obs2:
        forecast_limits = ["live weather: Open-Meteo current conditions"]
    else:
        forecast_limits = ["forecast from stored plant telemetry; no live weather call"]
    trace.append(_step("Forecast moisture to decide whether watering is due.", "run_timeseries_moisture_forecast", forecast_args, obs2, limitations=forecast_limits, latency_ms=ms))
    # 3. Engine differential pathology — deterministic ground-truth context
    # BEFORE care advice. For species with no engine node this returns
    # available=false and triage proceeds on classical signals.
    pathology_args = {"plant_id": plant.get("id")}
    obs_path, ms = _timed_dispatch("diagnose_engine_pathology", pathology_args, plant)
    trace.append(_step("Run the engine's differential pathology triage as ground-truth context before any care advice.", "diagnose_engine_pathology", pathology_args, obs_path, latency_ms=ms))
    # 4. Schedule mutation (proposal; the endpoint persists it).
    # Cluster-aware interval: CLUSTER_C CAM succulents are not 'due' until
    # soil moisture falls below the engine's critical-depletion VWC, so a
    # CAM plant at 20% moisture gets the normal 4-day interval, never a
    # premature 2-day alert. All other species keep the 30% threshold.
    _triage_species = next(
        (s for s in SPECIES if s.scientific_name == plant.get("species_scientific_name")), None)
    _thirst_at = thirst_threshold_pct(_triage_species) if _triage_species is not None else 30.0
    interval = 2 if float(plant.get("moisture_pct", 50)) < _thirst_at else 4
    obs3, ms = _timed_dispatch("mutate_watering_schedule", {"plant_id": plant.get("id"), "interval_days": interval}, plant)
    trace.append(_step("Adjust the watering schedule based on the forecast and the engine pathology context.", "mutate_watering_schedule", {"plant_id": plant.get("id"), "interval_days": interval}, obs3, latency_ms=ms))
    # 5. Avatar
    pathology = "spider mites visible on leaves" if plant.get("particle_effect") == "spider_mites" else (
        "overwatered drooping leaves" if plant.get("watering_locked") else "healthy vibrant leaves")
    mood = plant.get("mood", "happy")
    obs4, ms = _timed_dispatch("synthesize_petey_avatar", {"plant_id": plant.get("id"), "mood": mood, "pathology": pathology}, plant)
    trace.append(_step("Synthesize an avatar reflecting the plant's current state.", "synthesize_petey_avatar", {"plant_id": plant.get("id"), "mood": mood, "pathology": pathology}, obs4, latency_ms=ms))
    # 6. Guilt quest
    obs5, ms = _timed_dispatch("dispatch_duolingo_guilt_quest", {"plant_id": plant.get("id")}, plant)
    trace.append(_step("Dispatch a Duolingo-style guilt quest to keep the user engaged.", "dispatch_duolingo_guilt_quest", {"plant_id": plant.get("id")}, obs5, latency_ms=ms))
    temporal = build_temporal_context(plant.get("history", []))
    summary = (
        f"{plant.get('name')} ({plant.get('species_common_name')}) is {mood} with HP "
        f"{plant.get('hp')}. {temporal['summary']} {obs2} "
        f"Next water: {obs3.get('next_water_iso')}."
    )
    if plant.get("watering_locked"):
        summary += " Watering is locked by the root-rot brake; do not water yet."
    if isinstance(obs_path, dict) and obs_path.get("available"):
        summary += (
            f" Engine pathology: {obs_path.get('primary_pathology_code')} "
            f"(severity {obs_path.get('severity_score', 0):.2f})."
        )
        _hyd = obs_path.get("hydration", {})
        if _hyd:
            summary += (
                f" Engine hydration: interval {_hyd.get('optimal_watering_interval_days')}d, "
                f"dose {_hyd.get('optimal_watering_dose_ml', 0):.0f}ml, "
                f"hypoxia risk {_hyd.get('hypoxia_rot_risk_score', 0):.2f}, "
                f"desiccation risk {_hyd.get('desiccation_wilt_risk_score', 0):.2f}."
            )
    actions = {
        "next_water_iso": obs3.get("next_water_iso"),
        "watering_interval_days": obs3.get("interval_days"),
        "avatar_prompt": obs4["avatar_prompt"],
        "rig_params": obs4["rig_params"],
        "quest": obs5["quest"],
        "forecast": obs2,
        "temporal_context": temporal,
        "engine_pathology": obs_path,
        "engine_hydration": obs_path.get("hydration") if isinstance(obs_path, dict) else None,
    }
    total_ms = int(round((time.perf_counter() - t0) * 1000))
    slowest = max((s["latency_ms"] for s in trace), default=0)
    total_ms = max(total_ms, slowest)  # rounding must not make total < slowest step
    return {"summary": summary, "agent_trace": trace, "actions": actions, "latency_ms_total": total_ms}
