"""Tests for the declared tool registry + REA-style evidence records."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from main import app
from services.tool_registry import (
    ANALYSIS_PROFILE,
    ToolRegistryError,
    build_evidence,
    dispatch,
    get_evidence,
    list_tools,
    lookup_tool,
    make_evidence_id,
    validate_args,
)

client = TestClient(app)

EXPECTED_TOOLS = {
    "search_botanical_rag", "run_timeseries_moisture_forecast",
    "mutate_watering_schedule", "synthesize_petey_avatar",
    "dispatch_duolingo_guilt_quest", "taxonomy_resolve",
    "extract_golden_record",
}


def test_registry_catalog_covers_all_tools():
    tools = list_tools()
    names = {t["name"] for t in tools}
    assert EXPECTED_TOOLS.issubset(names)
    for tool in tools:
        assert tool["description"]
        assert tool["input_schema"]["type"] == "object"
        assert "properties" in tool["input_schema"]
        assert tool["output_schema"]
        assert tool["version"]


def test_registry_lookup_unknown_tool_is_invalid_request():
    try:
        lookup_tool("no_such_tool")
    except ToolRegistryError as exc:
        assert exc.code == "invalid_request"
    else:
        raise AssertionError("expected ToolRegistryError")


def test_schema_validation_rejects_bad_args():
    for bad in ({}, {"query": 42}, {"query": None}):
        try:
            validate_args("search_botanical_rag", bad)
        except ToolRegistryError as exc:
            assert exc.code == "invalid_request"
        else:
            raise AssertionError(f"expected rejection for {bad!r}")
    # Valid args pass through unchanged.
    assert validate_args("search_botanical_rag", {"query": "monstera"}) == {"query": "monstera"}
    # Pipeline tools: missing name / missing raw record rejected.
    try:
        validate_args("taxonomy_resolve", {})
        raise AssertionError("expected rejection")
    except ToolRegistryError as exc:
        assert exc.code == "invalid_request"
    try:
        dispatch("taxonomy_resolve", {"name": 123})
        raise AssertionError("expected rejection")
    except ToolRegistryError as exc:
        assert exc.code == "invalid_request"


def test_dispatch_unknown_tool_never_crashes():
    try:
        dispatch("definitely_not_a_tool", {})
        raise AssertionError("expected rejection")
    except ToolRegistryError as exc:
        assert exc.code == "invalid_request"


def test_dispatch_pipeline_tools():
    resolved = dispatch("taxonomy_resolve", {"name": "Sansevieria trifasciata"})
    assert resolved["accepted_name"] == "Dracaena trifasciata"
    record = dispatch("extract_golden_record", {"raw": {"scientific_name": "Monstera deliciosa"}})
    assert record["accepted_name"] == "Monstera deliciosa"
    assert record["imputed_fields"]  # genus/biome defaults fill missing metrics


def test_evidence_id_stable_and_deterministic():
    eid1 = make_evidence_id("search_botanical_rag", {"query": "x"}, {"text": "y"})
    eid2 = make_evidence_id("search_botanical_rag", {"query": "x"}, {"text": "y"})
    eid3 = make_evidence_id("search_botanical_rag", {"query": "z"}, {"text": "y"})
    assert eid1 == eid2 and eid1 != eid3 and eid1.startswith("ev-")


def test_evidence_record_shape():
    rec = build_evidence("search_botanical_rag", {"query": "x"}, {"text": "y"},
                         limitations=["local index only"],
                         coverage={"scope": "search_botanical_rag", "status": "complete"})
    assert rec["raw_result"] is None
    assert rec["analysis_profile"] == ANALYSIS_PROFILE
    assert rec["limitations"] == ["local index only"]
    assert rec["coverage"]["status"] == "complete"
    assert rec["integrity_sha256"]


def test_triage_trace_backward_compat_plus_evidence():
    resp = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["agent_trace"]) >= 3
    required = {"thought", "tool_name", "tool_args", "tool_observation", "latency_ms", "muse_model_id"}
    for step in body["agent_trace"]:
        assert required.issubset(step.keys())
        assert step["evidence_id"].startswith("ev-")
        assert isinstance(step["limitations"], list)
        assert step["coverage"]["status"] in ("complete", "partial")
        assert step["analysis_profile"]  # always present
        assert step["raw_observation"] is None
        assert step["normalized_observation"]
        # tool_observation stays the human-readable string form.
        assert isinstance(step["tool_observation"], str)
    # Evidence ids are stable: re-running the same triage yields the same ids.
    resp2 = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"})
    ids1 = [s["evidence_id"] for s in body["agent_trace"]]
    ids2 = [s["evidence_id"] for s in resp2.json()["agent_trace"]]
    assert ids1 == ids2


def test_tools_endpoint():
    resp = client.get("/api/v1/agent/tools")
    assert resp.status_code == 200
    names = {t["name"] for t in resp.json()["tools"]}
    assert EXPECTED_TOOLS.issubset(names)


def test_evidence_endpoint_roundtrip_and_unknown():
    triage = client.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"}).json()
    eid = triage["agent_trace"][0]["evidence_id"]
    rec = client.get(f"/api/v1/agent/evidence/{eid}")
    assert rec.status_code == 200
    body = rec.json()
    assert body["evidence_id"] == eid
    assert body["normalized_result"]
    assert body["analysis_profile"]
    assert "limitations" in body and "coverage" in body
    missing = client.get("/api/v1/agent/evidence/ev-doesnotexist")
    assert missing.status_code == 404
    assert missing.json()["detail"]["error_code"] == "invalid_request"


def test_evidence_integrity_mismatch_detected():
    from services import tool_registry
    rec = build_evidence("search_botanical_rag", {"query": "x"}, {"text": "original"})
    tool_registry.store_evidence(rec)
    # Tamper after capture: integrity check must refuse the record.
    tool_registry.EVIDENCE_BUNDLE[rec["evidence_id"]]["normalized_result"] = {"text": "tampered"}
    try:
        get_evidence(rec["evidence_id"])
        raise AssertionError("expected integrity mismatch")
    except ToolRegistryError as exc:
        assert exc.code == "evidence_integrity_mismatch"
