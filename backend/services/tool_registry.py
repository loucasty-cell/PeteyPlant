"""Declared tool registry + REA-style evidence records for Petey Plant.

Method note (honest provenance): this module borrows the *evidence
pattern* documented for morluto/rea — canonical Evidence records where
every tool result carries a structured (normalized) result, an
evidence_id, an always-present analysis_profile, explicit limitations
and coverage, retained session bundles, and a strict error contract —
and applies it to Petey's own agent tools and data-pipeline entry
points. REA itself is a reverse-engineering toolkit, NOT a botanical
knowledge base; all botanical knowledge here still comes from Petey's
own data_pipeline sources (seed species index, taxonomy resolver,
extractor defaults). No REA code or data is used.

Error contract:
  - "invalid_request": unknown tool, args failing the declared schema,
    or an unknown evidence_id on lookup. Raised as ToolRegistryError
    (HTTP layer maps it to 409 for evidence_integrity_mismatch, 404
    otherwise, with the code in the body).
  - "evidence_integrity_mismatch": a retained evidence record whose
    stored integrity hash no longer matches its normalized result
    (i.e. the bundle was tampered with after capture). Retrieval
    verifies the hash and raises this code instead of returning data.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from config import MODEL_PROVIDER, MUSE_MODEL_ID

REGISTRY_VERSION = "1.0.0"
ANALYSIS_PROFILE = {
    "profile": "local-deterministic-fallback",
    "provider": MODEL_PROVIDER,
    "model_id": MUSE_MODEL_ID,
    "reasoning": "deterministic local fallback; no live model call",
}


class ToolRegistryError(Exception):
    """Strict error contract: code is 'invalid_request' or
    'evidence_integrity_mismatch'."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


def _invalid(message: str) -> ToolRegistryError:
    return ToolRegistryError("invalid_request", message)


# ---------------------------------------------------------------- schemas
# JSON-schema-ish dicts: properties map name -> {type, description,
# optional minimum/maximum}. "required" lists required properties.
# "any_of_required" lists groups where at least one member must be present.

def _schema(name: str, description: str, properties: dict,
            required: list[str] | None = None,
            any_of_required: list[list[str]] | None = None) -> dict:
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object", "properties": properties,
            "required": list(required or []),
            "any_of_required": any_of_required or [],
        },
        "output_schema": {"type": "object", "description": "Structured tool result (see normalized_observation)."},
        "version": REGISTRY_VERSION,
    }


TOOL_DEFINITIONS: dict[str, dict] = {
    "search_botanical_rag": _schema(
        "search_botanical_rag",
        "Search the local species index for care guidance matching a query.",
        {"query": {"type": "string", "description": "Free-text species/care query (blank queries are rejected)."},
         "symptoms": {"type": "array", "description": "Optional symptom strings folded into the RAG query text."}},
        required=["query"]),
    "run_timeseries_moisture_forecast": _schema(
        "run_timeseries_moisture_forecast",
        "Forecast soil moisture over N days from current telemetry (deterministic local model; 24 hourly steps per day).",
        {"plant": {"type": "object", "description": "Plant state dict (or resolved from plant_id + context)."},
         "plant_id": {"type": "string", "description": "Plant id; must match the plant object's id when both are given."},
         "days": {"type": "integer", "description": "Forecast horizon in days.", "minimum": 1, "maximum": 30},
         "lat": {"type": "number", "description": "Optional latitude for live/fallback weather lookup (-90..90)."},
         "lon": {"type": "number", "description": "Optional longitude for live/fallback weather lookup (-180..180)."},
         "pot_material": {"type": "string", "description": "Pot material drying factor (terracotta 1.25, plastic 1.0, ceramic 0.9, metal 1.1, fabric 1.3)."},
         "ac_on": {"type": "boolean", "description": "Air conditioning on: raises effective VPD by 10%."}},
        any_of_required=[["plant", "plant_id"]]),
    "mutate_watering_schedule": _schema(
        "mutate_watering_schedule",
        "Propose a new watering interval / next-water date (no-op when the root-rot brake is locked). "
        "This is a PROPOSAL: the tool does not write the plant store; the triage endpoint applies it.",
        {"plant": {"type": "object"},
         "plant_id": {"type": "string"},
         "interval_days": {"type": "integer", "minimum": 1, "maximum": 30},
         "next_water_iso": {"type": "string", "description": "Optional explicit next-water date overriding interval_days."}},
        any_of_required=[["plant", "plant_id"]]),
    "synthesize_petey_avatar": _schema(
        "synthesize_petey_avatar",
        "Build an avatar prompt + rig parameters for a plant mood/pathology.",
        {"plant": {"type": "object"},
         "plant_id": {"type": "string"},
         "mood": {"type": "string", "description": "Plant mood, e.g. happy, thirsty, sick."},
         "pathology": {"type": "string", "description": "Visible condition, e.g. healthy vibrant leaves."}},
        any_of_required=[["plant", "plant_id"]]),
    "dispatch_duolingo_guilt_quest": _schema(
        "dispatch_duolingo_guilt_quest",
        "Dispatch a Duolingo-style guilt quest for a plant's current state.",
        {"plant": {"type": "object"}, "plant_id": {"type": "string"}},
        any_of_required=[["plant", "plant_id"]]),
    "diagnose_engine_pathology": _schema(
        "diagnose_engine_pathology",
        "Differential pathology triage from petey_muse_botanical_engine v2.4.0: "
        "runs the engine's 5-code differential diagnosis (spider mites, Pythium, "
        "fluoride necrosis, salt toxicity, etiolation/photoinhibition) over live "
        "telemetry plus the substrate hydration simulation. Deterministic "
        "ground-truth context, produced before care advice. Returns "
        "available=false for species with no engine node.",
        {"plant": {"type": "object"}, "plant_id": {"type": "string"}},
        any_of_required=[["plant", "plant_id"]]),
    "taxonomy_resolve": _schema(
        "taxonomy_resolve",
        "Data-pipeline entry point: resolve a botanical name to its accepted name, family, synonyms and confidence.",
        {"name": {"type": "string", "description": "Raw botanical name, possibly a synonym."}},
        required=["name"]),
    "extract_golden_record": _schema(
        "extract_golden_record",
        "Data-pipeline entry point: normalize a raw scraper/seed record into a GoldenPlantRecord, imputing missing metrics.",
        {"raw": {"type": "object", "description": "Raw record dict."},
         "record": {"type": "object", "description": "Alias for raw."}},
        any_of_required=[["raw", "record"]]),
}


def list_tools() -> list[dict]:
    """Registry catalog (what GET /api/v1/agent/tools returns)."""
    return [dict(v) for v in TOOL_DEFINITIONS.values()]


def lookup_tool(name: str) -> dict:
    if name not in TOOL_DEFINITIONS:
        raise _invalid(f"unknown tool: {name!r}")
    return TOOL_DEFINITIONS[name]


# ---------------------------------------------------------------- validation

_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: (isinstance(v, (int, float)) and not isinstance(v, bool)),
    "boolean": lambda v: isinstance(v, bool),
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
}


def validate_args(tool_name: str, args: dict) -> dict:
    """Validate args against the declared schema; raise invalid_request
    on any failure. Returns the args unchanged on success.

    Hardening: unknown keys are rejected (no silent ignores), blank
    RAG queries are rejected (an empty query previously returned a
    spurious top hit), lat/lon are range-checked, and an empty plant
    dict is rejected as an invalid plant.
    """
    definition = lookup_tool(tool_name)
    schema = definition["input_schema"]
    if not isinstance(args, dict):
        raise _invalid(f"args for {tool_name} must be an object")
    for key in args:
        if key not in schema["properties"]:
            raise _invalid(f"unknown argument {key!r} for tool {tool_name!r}")
    for req in schema["required"]:
        if req not in args or args[req] is None:
            raise _invalid(f"missing required argument {req!r} for tool {tool_name!r}")
    if tool_name == "search_botanical_rag" and isinstance(args.get("query"), str) \
            and not args["query"].strip():
        raise _invalid("query must not be blank for tool 'search_botanical_rag'")
    # Type checks BEFORE range checks: the old order range-checked lat/lon
    # first, so lat="abc" raised a raw TypeError from the comparison
    # instead of the declared invalid_request error.
    for key, spec in schema["properties"].items():
        if key not in args or args[key] is None:
            continue
        checker = _TYPE_CHECKS.get(spec["type"])
        if checker and not checker(args[key]):
            raise _invalid(
                f"argument {key!r} for tool {tool_name!r} must be {spec['type']}, "
                f"got {type(args[key]).__name__}")
        if "minimum" in spec and args[key] < spec["minimum"]:
            raise _invalid(f"argument {key!r} for tool {tool_name!r} is below minimum {spec['minimum']}")
        if "maximum" in spec and args[key] > spec["maximum"]:
            raise _invalid(f"argument {key!r} for tool {tool_name!r} exceeds maximum {spec['maximum']}")
    if args.get("lat") is not None and not (-90 <= args["lat"] <= 90):
        raise _invalid("lat must be in -90..90")
    if args.get("lon") is not None and not (-180 <= args["lon"] <= 180):
        raise _invalid("lon must be in -180..180")
    if "plant" in args and args["plant"] is not None and args["plant"] == {}:
        raise _invalid("plant must not be an empty dict")
    for group in schema["any_of_required"]:
        if not any(g in args and args[g] is not None for g in group):
            raise _invalid(
                f"tool {tool_name!r} requires one of {group}")
    return args


# ---------------------------------------------------------------- evidence

def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def make_evidence_id(tool_name: str, tool_args: dict, normalized: Any) -> str:
    """Stable deterministic id: same tool + args + result -> same id."""
    digest = hashlib.sha256(
        f"{tool_name}\n{_canonical(tool_args)}\n{_canonical(normalized)}".encode()
    ).hexdigest()[:24]
    return f"ev-{digest}"


def _integrity_hash(normalized: Any) -> str:
    return hashlib.sha256(_canonical(normalized).encode()).hexdigest()


def build_evidence(tool_name: str, tool_args: dict, normalized: Any,
                   raw: Any = None, limitations: list[str] | None = None,
                   coverage: dict | None = None) -> dict:
    """Build a canonical Evidence record. raw_observation is null unless
    there is a distinct upstream representation (local fallback: none)."""
    evidence_id = make_evidence_id(tool_name, tool_args, normalized)
    record = {
        "evidence_id": evidence_id,
        "tool_name": tool_name,
        "tool_args": tool_args,
        "normalized_result": normalized,
        "raw_result": raw,
        "analysis_profile": dict(ANALYSIS_PROFILE),
        "limitations": list(limitations or []),
        "coverage": coverage or {"scope": tool_name, "status": "complete"},
        "integrity_sha256": _integrity_hash(normalized),
    }
    return record


# In-memory session bundle (reset on restart, as specified).
EVIDENCE_BUNDLE: dict[str, dict] = {}


# Bounded bundle: keep only the latest 500 evidence records (FIFO eviction).
EVIDENCE_BUNDLE_MAX = 500


def store_evidence(record: dict) -> dict:
    EVIDENCE_BUNDLE[record["evidence_id"]] = record
    while len(EVIDENCE_BUNDLE) > EVIDENCE_BUNDLE_MAX:
        EVIDENCE_BUNDLE.pop(next(iter(EVIDENCE_BUNDLE)))
    return record


def get_evidence(evidence_id: str) -> dict:
    """Retrieve a retained record, verifying integrity first."""
    record = EVIDENCE_BUNDLE.get(evidence_id)
    if record is None:
        raise _invalid(f"unknown evidence_id: {evidence_id!r}")
    if _integrity_hash(record["normalized_result"]) != record.get("integrity_sha256"):
        raise ToolRegistryError(
            "evidence_integrity_mismatch",
            f"retained record {evidence_id!r} no longer matches its integrity hash")
    return record


def get_evidence_bundle() -> list[dict]:
    return list(EVIDENCE_BUNDLE.values())


# ---------------------------------------------------------------- dispatch

def _resolve_plant(args: dict, plant: dict | None) -> dict:
    """Resolve the plant for a tool call, without mislabeling.

    If args carry both plant_id and a plant object, the object's id
    must equal plant_id (else invalid_request). If only plant_id is
    given with no plant object/context, raise invalid_request — the
    registry cannot resolve an id against a store it does not own,
    and silently proceeding would mislabel another plant's data.
    """
    candidate = args.get("plant") or plant
    plant_id = args.get("plant_id")
    if candidate is None:
        raise _invalid("a plant dict (or plant context) is required for this tool")
    if isinstance(candidate, dict) and not candidate:
        raise _invalid("plant must not be an empty dict")
    if plant_id is not None and isinstance(candidate, dict):
        if candidate.get("id") != plant_id:
            raise _invalid(
                f"plant_id {plant_id!r} does not match plant object id "
                f"{candidate.get('id')!r}")
    return candidate


def dispatch(tool_name: str, args: dict, plant: dict | None = None) -> Any:
    """Validate args against the registry, then call the real tool.
    Unknown tools raise invalid_request and never crash the caller."""
    validate_args(tool_name, args)
    if tool_name == "search_botanical_rag":
        from services.muse_agent_harness import search_botanical_rag
        return search_botanical_rag(args["query"], symptoms=args.get("symptoms"))
    if tool_name == "run_timeseries_moisture_forecast":
        from services.muse_agent_harness import run_timeseries_moisture_forecast
        return run_timeseries_moisture_forecast(_resolve_plant(args, plant), days=args.get("days", 7), lat=args.get("lat"), lon=args.get("lon"), pot_material=args.get("pot_material"), ac_on=args.get("ac_on", False))
    if tool_name == "mutate_watering_schedule":
        from services.muse_agent_harness import mutate_watering_schedule
        return mutate_watering_schedule(_resolve_plant(args, plant), interval_days=args.get("interval_days", 3), next_water_iso=args.get("next_water_iso"))
    if tool_name == "synthesize_petey_avatar":
        from services.muse_agent_harness import synthesize_petey_avatar
        p = _resolve_plant(args, plant)
        return synthesize_petey_avatar(p, args.get("mood", p.get("mood", "happy")),
                                       args.get("pathology", "healthy vibrant leaves"))
    if tool_name == "dispatch_duolingo_guilt_quest":
        from services.muse_agent_harness import dispatch_duolingo_guilt_quest
        return dispatch_duolingo_guilt_quest(_resolve_plant(args, plant))
    if tool_name == "diagnose_engine_pathology":
        from services.muse_agent_harness import diagnose_engine_pathology
        return diagnose_engine_pathology(_resolve_plant(args, plant))
    if tool_name == "taxonomy_resolve":
        from data_pipeline.taxonomy_resolver import resolve
        return resolve(args["name"])
    if tool_name == "extract_golden_record":
        from data_pipeline.muse_extractor import extract_golden_record
        raw = args.get("raw") if args.get("raw") is not None else args.get("record")
        record = extract_golden_record(raw)
        return record.model_dump()
    raise _invalid(f"unknown tool: {tool_name!r}")
