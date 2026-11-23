"""Build a fail-closed Lens release report from explicitly supplied evidence."""

import argparse
import hashlib
import json
import math
from operator import eq, ge, gt, le, lt
from pathlib import Path
import re

from .manifest import SYMPTOMS

SUITES = {
    1: "Data integrity and leakage",
    2: "Image perturbations",
    3: "Domain shift and shortcuts",
    4: "Non-plant rejection",
    5: "Statistical rigor and calibration",
    6: "Care failure modes",
    7: "Hardware and production parity",
}
STAGES = (
    "Zero-shot and frozen probe baselines",
    "Warm-start and controlled fine-tuning",
    "Regularization and hard negatives",
    "Weight ensembling and test-time augmentation",
    "Calibration and selective prediction",
)

# Each criterion specifies the unit captured by the input and its release threshold.
GATES = (
    (1, "shared_image_hashes", "Shared image hashes", eq, 0, "count"),
    (1, "shared_plant_ids", "Shared plant-instance IDs", eq, 0, "count"),
    (1, "shared_cluster_ids", "Shared duplicate-cluster IDs", eq, 0, "count"),
    (1, "near_duplicate_test_fraction", "Near-duplicate test images", le, .01, "fraction"),
    (2, "warm_light_relative_map_drop", "Relative Macro-mAP drop under warm light", lt, .05, "signed fraction"),
    (2, "perturbation_sweep_complete", "All specified perturbations evaluated", eq, True, "proof"),
    (3, "variegated_chlorosis_fp_fraction", "Variegated healthy chlorosis false positives", lt, .08, "fraction"),
    (3, "background_map_delta", "Background-only Macro-mAP above prevalence", le, .08, "signed fraction"),
    (3, "source_and_species_holdout_complete", "Source and species holdout comparisons", eq, True, "proof"),
    (4, "ood_negative_count", "Non-plant negative images", ge, 300, "count"),
    (4, "ood_fpr_at_95_tpr", "OOD false positives at 95% plant recall", lt, .05, "fraction"),
    (4, "ood_auroc", "OOD AUROC measured", ge, 0, "fraction"),
    (4, "ood_average_precision", "OOD AUPR measured", ge, 0, "fraction"),
    (5, "accepted_precision", "Precision on accepted predictions", ge, .98, "fraction"),
    (5, "accepted_coverage", "Coverage at the same operating point", ge, .80, "fraction"),
    (5, "frozen_probe_map_gain", "Macro-mAP gain over frozen probe", gt, 0, "signed fraction"),
    (5, "frozen_probe_map_delta_ci95_lower", "Lower 95% CI bound of Macro-mAP gain over frozen probe", gt, 0, "signed fraction"),
    (5, "pests_f2", "Pest signs F2", ge, .85, "fraction"),
    (5, "spots_f2", "Leaf spots and lesions F2", ge, .85, "fraction"),
    (5, "post_scaling_ece", "Post-scaling ECE, 15 bins", lt, .04, "fraction"),
    (5, "full_statistical_audit_complete", "Cluster CIs, reliability and conformal audit", eq, True, "proof"),
    (6, "care_fmea_cases", "Deterministic care scenarios run", ge, 50, "count"),
    (6, "care_wet_cases", "Wet-soil cases observed", gt, 0, "count"),
    (6, "care_harmful_advice_cases", "Wet-soil harmful advice cases", eq, 0, "count"),
    (6, "care_ambiguous_cases", "Ambiguous unknown-soil cases observed", gt, 0, "count"),
    (6, "care_missing_soil_check_cases", "Ambiguous cases missing a soil check", eq, 0, "count"),
    (6, "dry_down_stressor_complete", "Dry-down adversarial and winter tests", eq, True, "proof"),
    (7, "gpu_p95_ms", "GPU P95 latency", lt, 120, "ms"),
    (7, "cpu_p95_ms", "CPU P95 latency", lt, 450, "ms"),
    (7, "peak_vram_gb", "Peak VRAM", lt, 3.5, "GB"),
    (7, "oom_count", "Out of memory failures", eq, 0, "count"),
    (7, "onnx_max_abs_logit_diff", "ONNX maximum absolute logit difference", lt, .001, "number"),
    (7, "onnx_top_class_agreement", "ONNX top-class agreement", gt, .999, "fraction"),
    (7, "repeat_max_abs_difference", "Independent-repeat maximum difference", lt, .000001, "number"),
    (7, "hardware_profile_complete", "CPU and GPU single and batch hardware profile", eq, True, "proof"),
)
HARD_LIMITS = {
    "accepted_precision": (lt, .94), "frozen_probe_map_gain": (le, 0),
    "pests_f2": (lt, .70), "spots_f2": (lt, .70),
    "post_scaling_ece": (gt, .08), "ood_fpr_at_95_tpr": (gt, .12),
    "variegated_chlorosis_fp_fraction": (gt, .15), "warm_light_relative_map_drop": (gt, .12),
    "care_harmful_advice_cases": (gt, 0), "oom_count": (gt, 0),
    "gpu_p95_ms": (gt, 240), "cpu_p95_ms": (gt, 900), "peak_vram_gb": (gt, 7),
}
COMPARISONS = {eq: "=", ge: "≥", gt: ">", le: "≤", lt: "<"}
COVERAGES = ("60", "70", "80", "90", "100")
SOFTWARE_KEYS = {key for suite, key, *_ in GATES if suite == 6}


def _number(value):
    return type(value) is int or (type(value) is float and math.isfinite(value))


def _valid(value, unit):
    if unit == "proof":
        return type(value) is bool
    if unit == "count":
        return type(value) is int and value >= 0
    if not _number(value):
        return False
    if unit == "fraction":
        return 0 <= value <= 1
    if unit == "signed fraction":
        return -1 <= value <= 1
    return value >= 0


def _object(source, key):
    value = source.get(key, {})
    if not isinstance(value, dict):
        raise ValueError(f"{key} must be an object")
    return value


def _representative(provenance):
    return (
        provenance.get("rights_reviewed") is True
        and provenance.get("independent_holdout") is True
        and all(
            isinstance(provenance.get(key), str) and re.fullmatch(r"[0-9a-f]{64}", provenance[key])
            for key in ("manifest_sha256", "model_sha256")
        )
    )


def readiness(evidence):
    if not isinstance(evidence, dict):
        raise ValueError("evidence must be an object")
    provenance = _object(evidence, "provenance")
    measured = _object(evidence, "measurements")
    software = _object(evidence, "software")
    representative = _representative(provenance)

    for field, cap in (
        ("care_wet_cases", "care_fmea_cases"),
        ("care_ambiguous_cases", "care_fmea_cases"),
        ("care_harmful_advice_cases", "care_wet_cases"),
        ("care_missing_soil_check_cases", "care_ambiguous_cases"),
    ):
        value, maximum = software.get(field), software.get(cap)
        if _valid(value, "count") and _valid(maximum, "count") and value > maximum:
            raise ValueError(f"{field} cannot exceed {cap}")

    gates = []
    for suite, key, description, compare, target, unit in GATES:
        scope = "software fixtures" if key in SOFTWARE_KEYS else "representative run"
        value = (software if key in SOFTWARE_KEYS else measured).get(key)
        if value is None:
            status = "UNAVAILABLE"
        elif not _valid(value, unit):
            raise ValueError(f"{key} is invalid for {unit}")
        elif key not in SOFTWARE_KEYS and not representative:
            status = "UNQUALIFIED"
        else:
            status = "PASS" if compare(value, target) else "FAIL"
        if key not in SOFTWARE_KEYS and not representative:
            scope = "unqualified run" if value is not None else "representative evidence required"
        hard_abort = None
        if key in HARD_LIMITS and status in {"PASS", "FAIL"}:
            check, limit = HARD_LIMITS[key]
            hard_abort = check(value, limit)
        gates.append({
            "suite": suite, "metric": key, "description": description, "value": value,
            "comparison": COMPARISONS[compare], "target": target, "unit": unit, "evidence_scope": scope,
            "status": status, "hard_abort": hard_abort,
        })

    summaries = []
    for suite, label in SUITES.items():
        statuses = {gate["status"] for gate in gates if gate["suite"] == suite}
        status = "FAIL" if "FAIL" in statuses else "PASS" if statuses == {"PASS"} else "INCOMPLETE"
        summaries.append({"number": suite, "name": label, "status": status})

    stages = _object(evidence, "stages")
    stage_evidence = {str(index): stages.get(str(index)) for index in range(len(STAGES))}
    notes = evidence.get("software_notes", [])
    if not isinstance(notes, list) or not all(isinstance(note, str) for note in notes):
        raise ValueError("software_notes must be a list of text descriptions")
    proof = _object(evidence, "details") if representative else {}
    symptom_evidence = _object(proof, "per_symptom")
    risk_evidence = _object(proof, "risk_coverage")
    for detail in (symptom_evidence, risk_evidence):
        if any(value is not None and not isinstance(value, dict) for value in detail.values()):
            raise ValueError("per-symptom and risk-coverage rows must be objects or null")
    wet, harmful = software.get("care_wet_cases"), software.get("care_harmful_advice_cases")
    ambiguous, missing = software.get("care_ambiguous_cases"), software.get("care_missing_soil_check_cases")
    return {
        "care_fixture_rates": {
            "harmful_advice_in_wet_cases": harmful / wet if wet and harmful is not None else None,
            "soil_check_in_ambiguous_cases": (ambiguous - missing) / ambiguous if ambiguous and missing is not None else None,
        },
        "flight_status": "GO" if representative and all(suite["status"] == "PASS" for suite in summaries) else "NO-GO",
        "representative_provenance_declared": representative,
        "provenance": provenance,
        "software_notes": notes,
        "stage_evidence": stage_evidence,
        "suites": summaries,
        "gates": gates,
        "per_symptom": {symptom: symptom_evidence.get(symptom) for symptom in SYMPTOMS},
        "risk_coverage": {level: risk_evidence.get(level) for level in COVERAGES},
        "details": {key: proof.get(key) for key in ("worst_errors", "hardware", "data_priorities")},
    }


def _cell(value):
    if value is None:
        return "Unavailable"
    if isinstance(value, (dict, list, bool)):
        value = json.dumps(value, ensure_ascii=False, allow_nan=False)
    return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def _metric(value, unit):
    if value is None:
        return "Unavailable"
    if unit in {"fraction", "signed fraction"}:
        return f"{value:.2%}"
    if unit in {"ms", "GB"}:
        return f"{value} {unit}"
    return _cell(value)


def markdown(report):
    lines = [
        "# Petey Lens flight readiness",
        "",
        f"**FLIGHT STATUS — {report['flight_status']}**",
        "",
        "Release requires all seven suites to pass. The coverage target is 80%, within the requested 75–85% range.",
        "An unavailable measurement has no value. Unqualified measurements lack declared reviewed holdout and artifact provenance.",
        "Software fixtures verify behavior on the scenarios run. Independent indoor photos and the frozen candidate are required for model performance claims.",
        "",
        "## Suite verdicts",
        "",
        "| Suite | Verdict |",
        "|---|---|",
    ]
    for suite in report["suites"]:
        lines.append(f"| {suite['number']}. {suite['name']} | {suite['status']} |")
    lines += ["", "## Release measurements", "", "| Suite | Metric | Target | Measured | Evidence | Result |",
              "|---|---|---|---|---|---|"]
    for gate in report["gates"]:
        unit = gate["unit"]
        target = f"{gate['comparison']} {_metric(gate['target'], unit)}"
        value = _metric(gate["value"], unit)
        verdict = "HARD ABORT" if gate["hard_abort"] else gate["status"]
        lines.append(f"| {gate['suite']} | {gate['description']} | {target} | {value} | {gate['evidence_scope']} | {verdict} |")

    lines += ["", "## Stage evidence", "", "| Stage | Work | Recorded evidence and cluster CI |", "|---|---|---|"]
    for index, stage in enumerate(STAGES):
        value = _cell(report["stage_evidence"][str(index)])
        lines.append(f"| {index} | {stage} | {value} |")
    lines += [
        "", "## Symptoms", "",
        "| Observable symptom | PR-AUC | F1 | F2 | Positive / total | Threshold | Temperature |",
        "|---|---|---|---|---|---|---|",
    ]
    for symptom, measures in report["per_symptom"].items():
        measures = measures or {}
        values = [_cell(measures.get(field)) for field in ("pr_auc", "f1", "f2", "support", "threshold", "temperature")]
        lines.append("| " + " | ".join([symptom, *values]) + " |")
    lines += [
        "", "## Risk and coverage", "",
        "| Target coverage | Observed coverage | Selective precision | Abstention |",
        "|---|---|---|---|",
    ]
    for level, point in report["risk_coverage"].items():
        point = point or {}
        values = [_cell(point.get(key)) for key in ("coverage", "precision", "abstention")]
        lines.append("| " + " | ".join([f"{level}%", *values]) + " |")

    lines += ["", "## Hardware, worst cases, and data priorities", ""]
    for key, label in (("hardware", "Hardware profile"), ("worst_errors", "Worst cases"),
                       ("data_priorities", "Data collection priorities by uncertainty or error")):
        lines.append(f"- {label} · {_cell(report['details'][key])}")
    software = report["care_fixture_rates"]
    if report["software_notes"] or any(rate is not None for rate in software.values()):
        lines += ["", "## Software evidence", ""]
        for key, label in (
            ("harmful_advice_in_wet_cases", "Harmful advice among wet-soil fixtures"),
            ("soil_check_in_ambiguous_cases", "Soil-check prompt among ambiguous fixtures"),
        ):
            if software[key] is not None:
                lines.append(f"- {label} · {software[key]:.2%}")
        lines += [f"- {_cell(note)}" for note in report["software_notes"]]
    return "\n".join(lines) + "\n"


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, help="JSON evidence object. Omit to render unknown gates.")
    parser.add_argument("--json", type=Path, required=True, help="New JSON report")
    parser.add_argument("--markdown", type=Path, required=True, help="New Markdown report")
    args = parser.parse_args()
    if args.json.resolve() == args.markdown.resolve() or args.json.exists() or args.markdown.exists():
        parser.error("use two distinct new output files")
    evidence_bytes = args.evidence.read_bytes() if args.evidence else None
    report = readiness(json.loads(evidence_bytes) if evidence_bytes is not None else {})
    report["evidence_file_sha256"] = hashlib.sha256(evidence_bytes).hexdigest() if evidence_bytes is not None else None
    report_json = json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    report_markdown = markdown(report)
    for path, content in ((args.json, report_json), (args.markdown, report_markdown)):
        with path.open("x", encoding="utf-8") as handle:
            handle.write(content)
    return 0 if report["flight_status"] == "GO" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from error
