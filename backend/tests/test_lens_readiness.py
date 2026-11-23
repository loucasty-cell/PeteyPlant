"""Check readiness bookkeeping, using deliberately artificial passing data where labeled."""

import json
import subprocess
import sys

import pytest

from lens_pipeline.readiness import GATES, SOFTWARE_KEYS, markdown, readiness


def gate(report, key):
    return next(item for item in report["gates"] if item["metric"] == key)


def test_empty_release_has_all_seven_incomplete_suites_and_no_fake_zeros():
    report = readiness({})
    assert report["flight_status"] == "NO-GO"
    assert [item["number"] for item in report["suites"]] == list(range(1, 8))
    assert {item["status"] for item in report["suites"]} == {"INCOMPLETE"}
    assert all(item["status"] == "UNAVAILABLE" and item["value"] is None for item in report["gates"])
    assert len(report["per_symptom"]) == 8
    assert set(report["stage_evidence"]) == set(map(str, range(5)))


def test_fixture_counts_cannot_pass_the_full_gate_or_set_empirical_precision():
    report = readiness({
        "measurements": {"accepted_precision": .99, "accepted_coverage": .80, "cpu_p95_ms": 1319},
        "software": {
            "care_fmea_cases": 126, "care_wet_cases": 36, "care_harmful_advice_cases": 0,
            "care_ambiguous_cases": 30, "care_missing_soil_check_cases": 0,
        },
        "software_notes": ["Fixture safety report"],
    })
    assert gate(report, "care_harmful_advice_cases")["status"] == "PASS"
    assert gate(report, "dry_down_stressor_complete")["status"] == "UNAVAILABLE"
    assert gate(report, "accepted_precision")["status"] == "UNQUALIFIED"
    cpu = gate(report, "cpu_p95_ms")
    assert cpu["status"] == "UNQUALIFIED" and cpu["value"] == 1319 and cpu["hard_abort"] is None
    assert report["care_fixture_rates"] == {
        "harmful_advice_in_wet_cases": 0, "soil_check_in_ambiguous_cases": 1,
    }
    assert report["flight_status"] == "NO-GO"
    text = markdown(report)
    assert "FLIGHT STATUS — NO-GO" in text
    assert "Fixture safety report" in text
    assert "UNQUALIFIED" in text
    assert "1319 ms" in text


def mock_complete_evidence():
    # The source hashes and measurements are invented fixtures to exercise gate semantics.
    evidence = {
        "provenance": {
            "rights_reviewed": True, "independent_holdout": True,
            "manifest_sha256": "a" * 64, "model_sha256": "b" * 64,
        },
        "measurements": {}, "software": {},
    }
    for _, key, _, compare, target, unit in GATES:
        measure = evidence["software" if key in SOFTWARE_KEYS else "measurements"]
        value = target
        if compare.__name__ == "lt":
            value /= 2
        elif compare.__name__ == "gt":
            value += 1 if unit == "count" else .00001
        measure[key] = value
    return evidence


def test_go_requires_every_gate_and_qualified_provenance():
    evidence = mock_complete_evidence()
    report = readiness(evidence)
    assert report["flight_status"] == "GO"
    assert {suite["status"] for suite in report["suites"]} == {"PASS"}
    evidence["provenance"]["independent_holdout"] = False
    assert readiness(evidence)["flight_status"] == "NO-GO"


@pytest.mark.parametrize(("key", "value", "hard"), [
    ("warm_light_relative_map_drop", .05, False),
    ("warm_light_relative_map_drop", .13, True),
    ("post_scaling_ece", .04, False),
    ("accepted_precision", .93, True),
    ("frozen_probe_map_gain", 0, True),
    ("ood_negative_count", 299, None),
    ("gpu_p95_ms", 120, False),
])
def test_strict_threshold_failure_is_distinct_from_hard_abort_and_absent(key, value, hard):
    evidence = mock_complete_evidence()
    evidence["measurements"][key] = value
    report = readiness(evidence)
    assert report["flight_status"] == "NO-GO"
    assert gate(report, key)["status"] == "FAIL"
    assert gate(report, key)["hard_abort"] is hard
    del evidence["measurements"][key]
    assert gate(readiness(evidence), key)["status"] == "UNAVAILABLE"


@pytest.mark.parametrize("software", [
    {"care_fmeA_cases": 1, "care_wet_cases": True},
    {"care_fmea_cases": 100, "care_wet_cases": 101},
    {"care_wet_cases": 0, "care_harmful_advice_cases": 1},
])
def test_invalid_count_is_a_configuration_error(software):
    with pytest.raises(ValueError):
        readiness({"software": software})


def test_cli_emits_both_files_and_nonzero_for_no_go(tmp_path):
    json_path = tmp_path / "telemetry.json"
    markdown_path = tmp_path / "FLIGHT_READINESS_REPORT.md"
    result = subprocess.run([
        sys.executable, "-m", "lens_pipeline.readiness",
        "--json", str(json_path), "--markdown", str(markdown_path),
    ], capture_output=True, check=False)
    assert result.returncode == 1
    report = json.loads(json_path.read_text(encoding="utf-8"))
    assert report["flight_status"] == "NO-GO"
    assert markdown_path.read_text(encoding="utf-8") == markdown(report)
