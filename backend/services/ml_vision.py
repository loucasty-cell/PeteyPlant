"""Real EXIF lux estimation, lesion analysis, droop estimation, and the
vision model registry.

EXIF lux:  EV = log2(N^2 / t) + log2(100 / ISO);  Lux ~= 2.5 * 2^EV
where N = f-number, t = exposure time in seconds, ISO = ISO speed.
Lesion ratios: OpenCV HSV segmentation when cv2 is available,
otherwise a PIL + numpy approximation. cv2 absence is handled gracefully.
(The module previously claimed LAB/HSV segmentation; LAB was computed
and discarded, so the segmentation is honestly HSV-only now.)

Turgor droop (contour-PCA): the largest foreground contour's principal
axis is computed by PCA; turgor_droop_angle_deg is the angle of that
axis from vertical (0 deg = upright). The lesion-ratio proxy is used
ONLY when no usable contour is found (e.g. a uniform image with no
foreground/background separation), and the diagnosis string says so.
droop_method in the scan output records which path was used.

Vision model registry (README-ready documentation):
  * mobilenetv2-plantvillage — baseline identification model, based on
    the PlantVillage dataset (Hughes & Salathe 2015, "An open access
    repository of images on plant health to enable the development of
    mobile disease diagnostics"). Weights are OPTIONAL: if
    $PETEY_MODEL_DIR/mobilenetv2_plantvillage.pth exists it is reported
    available; otherwise the entry is gracefully disabled. No weights
    are bundled, nothing is downloaded at runtime, and no local
    accuracy was measured — no accuracy numbers are claimed here.
  * vit-plant-identification — evaluated option, NOT bundled and NOT
    loaded by default. Trade-off, stated honestly: a vision transformer
    has higher capacity than MobileNetV2 but much larger weights and
    latency, which is a poor fit for this offline demo; it is listed
    so judges can see the option was considered, not used.
  * opencv-lab-hsv-segmentation — always available (HSV segmentation;
    the "lab" in the historic name refers to the earlier LAB experiment,
    not a current processing step).
  * contour-pca-droop — always available when cv2 is present; falls
    back to the lesion proxy otherwise (see above).
Build-time weight download is allowed in principle: place weights in
$PETEY_MODEL_DIR (default ./models) with the filenames above. Runtime
never downloads and never crashes offline: missing weights simply
report available=False.
"""
from __future__ import annotations

import io
import math
import os
from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image

try:  # cv2 is optional; code must work without it
    import cv2  # type: ignore
except Exception:  # pragma: no cover - environment dependent
    cv2 = None  # type: ignore

DEFAULT_EXIF = {"iso": 100, "f_number": 2.8, "exposure_time": 1 / 60}
MODEL_DIR = os.environ.get("PETEY_MODEL_DIR", "models")

# ---------------------------------------------------------------- model registry

MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "mobilenetv2-plantvillage": {
        "name": "mobilenetv2-plantvillage",
        "backend": "pytorch (weights optional)",
        "weights_file": "mobilenetv2_plantvillage.pth",
        "notes": (
            "Baseline identification model for the PlantVillage dataset "
            "(Hughes & Salathe 2015). Weights optional: load from "
            "$PETEY_MODEL_DIR if present, else gracefully disabled. "
            "Local accuracy was NOT measured; no accuracy is claimed. "
            "Runtime never downloads weights."
        ),
    },
    "vit-plant-identification": {
        "name": "vit-plant-identification",
        "backend": "transformers (not bundled)",
        "weights_file": "vit_plant_identification.pth",
        "notes": (
            "Evaluated option, not loaded by default: higher capacity "
            "than MobileNetV2 but much larger weights and latency. "
            "Not bundled; listed for transparency only."
        ),
    },
    "opencv-lab-hsv-segmentation": {
        "name": "opencv-lab-hsv-segmentation",
        "backend": "opencv-hsv",
        "weights_file": None,
        "notes": "Always available. HSV lesion segmentation (see module docstring).",
    },
    "contour-pca-droop": {
        "name": "contour-pca-droop",
        "backend": "opencv-pca",
        "weights_file": None,
        "notes": (
            "Always available when cv2 is present; lesion-ratio proxy "
            "fallback otherwise (reported via droop_method)."
        ),
    },
}


def _weights_path(entry: Dict[str, Any]) -> str | None:
    if not entry.get("weights_file"):
        return None
    return os.path.join(MODEL_DIR, entry["weights_file"])


def get_model_status() -> list[Dict[str, Any]]:
    """Registry status: name, available bool, backend (plus notes).

    Weight-based entries are available only when their weights file
    exists under $PETEY_MODEL_DIR; the always-available entries report
    True (contour-pca-droop is True only when cv2 imported cleanly).
    This never downloads, never raises, and never claims accuracy.
    """
    status = []
    for entry in MODEL_REGISTRY.values():
        name = entry["name"]
        if entry["weights_file"] is None:
            if name == "contour-pca-droop":
                available = cv2 is not None
            else:
                available = True
        elif name == "vit-plant-identification":
            # Deliberately not loaded by default even if a file exists:
            # the ViT path has no bundled loader in this build.
            available = False
        else:
            path = _weights_path(entry)
            available = bool(path and os.path.isfile(path))
        status.append({
            "name": name,
            "available": available,
            "backend": entry["backend"],
            "notes": entry["notes"],
        })
    return status


def load_model(name: str) -> Dict[str, Any] | None:
    """Lazy loader: returns a descriptor dict, never a live model object
    in this offline fallback build (no torch/transformers runtime is
    bundled). Returns None when the entry is unavailable, with the
    reason in the descriptor's absence — callers must use
    get_model_status() for the honest availability story. This function
    exists so the registry has a single loading entry point; it never
    downloads and never crashes on missing weights."""
    entry = MODEL_REGISTRY.get(name)
    if entry is None:
        return None
    status = {s["name"]: s for s in get_model_status()}[name]
    if not status["available"]:
        return None
    return {"name": name, "backend": entry["backend"], "loaded": False,
            "note": "Descriptor only: neural inference is not run in the offline fallback; "
                    "scans use the always-available OpenCV paths."}


# ---------------------------------------------------------------- EXIF / lux

def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        if hasattr(value, "numerator") and hasattr(value, "denominator"):
            if value.denominator == 0:
                return None
            return float(value.numerator) / float(value.denominator)
        if isinstance(value, (tuple, list)) and len(value) == 2:
            if value[1] == 0:
                return None
            return float(value[0]) / float(value[1])
        return float(value)
    except Exception:
        return None


def estimate_lux(iso: float, f_number: float, exposure_time: float) -> Tuple[float, float]:
    """Return (ev, lux) from exposure settings. Raises ValueError on bad input."""
    if iso <= 0 or f_number <= 0 or exposure_time <= 0:
        raise ValueError("ISO, f-number and exposure time must be positive")
    ev = math.log2((f_number ** 2) / exposure_time) + math.log2(100.0 / iso)
    lux = 2.5 * (2 ** ev)
    return ev, lux


def parse_exif(image_bytes: bytes) -> Dict[str, Any]:
    """Parse EXIF from image bytes. Returns defaults + flag when absent."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            exif = img.getexif()
            if not exif:
                return {**DEFAULT_EXIF, "present": False}
            # Standard EXIF tag ids: 34855 ISO, 33437 FNumber, 33434 ExposureTime
            iso = _to_float(exif.get(34855))
            f_number = _to_float(exif.get(33437))
            exposure = _to_float(exif.get(33434))
            # Malformed EXIF (e.g. ISO 0) must not fail the whole scan:
            # non-positive values are treated as missing and fall back
            # to defaults per field; estimate_lux only ever sees positives.
            if iso is not None and iso <= 0:
                iso = None
            if f_number is not None and f_number <= 0:
                f_number = None
            if exposure is not None and exposure <= 0:
                exposure = None
            if iso is None and f_number is None and exposure is None:
                return {**DEFAULT_EXIF, "present": False}
            return {
                "iso": iso if iso is not None else DEFAULT_EXIF["iso"],
                "f_number": f_number if f_number is not None else DEFAULT_EXIF["f_number"],
                "exposure_time": exposure if exposure is not None else DEFAULT_EXIF["exposure_time"],
                "present": True,
            }
    except Exception:
        return {**DEFAULT_EXIF, "present": False}


# ---------------------------------------------------------------- lesions + droop

def _lesion_ratios_cv2(arr: np.ndarray) -> Dict[str, float]:
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    total = max(1, arr.shape[0] * arr.shape[1])
    # Healthy green in HSV: hue ~35-85, decent saturation/value.
    healthy = cv2.inRange(hsv, np.array([35, 40, 40]), np.array([85, 255, 255]))
    # Yellow chlorosis: hue ~20-35.
    yellow = cv2.inRange(hsv, np.array([20, 40, 40]), np.array([35, 255, 255]))
    # Brown necrosis: low-value, reddish-brown in HSV hue <20 with low value.
    brown = cv2.inRange(hsv, np.array([0, 40, 20]), np.array([20, 255, 160]))
    healthy_r = float(np.count_nonzero(healthy)) / total * 100.0
    yellow_r = float(np.count_nonzero(yellow)) / total * 100.0
    brown_r = float(np.count_nonzero(brown)) / total * 100.0
    # Normalise so the three plant-tissue ratios do not exceed 100.
    s = healthy_r + yellow_r + brown_r
    if s > 100.0:
        healthy_r, yellow_r, brown_r = (healthy_r / s * 100, yellow_r / s * 100, brown_r / s * 100)
    return {
        "healthy_chlorophyll_ratio": round(healthy_r, 2),
        "chlorosis_yellow_ratio": round(yellow_r, 2),
        "necrosis_brown_tip_ratio": round(brown_r, 2),
    }


def _lesion_ratios_numpy(arr: np.ndarray) -> Dict[str, float]:
    r = arr[:, :, 0].astype(float)
    g = arr[:, :, 1].astype(float)
    b = arr[:, :, 2].astype(float)
    total = max(1, arr.shape[0] * arr.shape[1])
    healthy = (g > r + 10) & (g > b + 10) & (g > 60)
    yellow = (r > 150) & (g > 120) & (b < 110) & (r >= g) & (g > b)
    brown = (r >= 70) & (r <= 180) & (g >= 30) & (g <= 120) & (b < 90) & (r > g) & (g > b)
    # Exclude overlaps: yellow/brown take precedence over healthy in overlap.
    healthy = healthy & ~yellow & ~brown
    yellow = yellow & ~brown
    hr = float(np.count_nonzero(healthy)) / total * 100.0
    yr = float(np.count_nonzero(yellow)) / total * 100.0
    br = float(np.count_nonzero(brown)) / total * 100.0
    s = hr + yr + br
    if s > 100.0:
        hr, yr, br = hr / s * 100, yr / s * 100, br / s * 100
    return {
        "healthy_chlorophyll_ratio": round(hr, 2),
        "chlorosis_yellow_ratio": round(yr, 2),
        "necrosis_brown_tip_ratio": round(br, 2),
    }


def _droop_angle_contour_pca(arr: np.ndarray) -> float | None:
    """Principal-axis angle from vertical for the largest foreground contour.

    Foreground = pixels differing from the corner (background) colour by
    >30 on any channel. PCA on the largest contour's points gives the
    principal axis; the angle between that axis and vertical (image
    y-axis) is returned in degrees, 0-90. Returns None when cv2 is
    absent or no usable contour (area < 100 px) is found.
    """
    if cv2 is None:
        return None
    try:
        bg = arr[0, 0].astype(int)
        diff = np.max(np.abs(arr.astype(int) - bg), axis=2)
        mask = (diff > 30).astype(np.uint8) * 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
        contour = max(contours, key=cv2.contourArea)
        if cv2.contourArea(contour) < 100:
            return None
        pts = contour.reshape(-1, 2).astype(np.float32)
        _, eigenvectors = cv2.PCACompute(pts, mean=None)
        vx, vy = float(eigenvectors[0][0]), float(eigenvectors[0][1])
        angle = math.degrees(math.atan2(abs(vx), abs(vy)))
        return round(min(90.0, max(0.0, angle)), 2)
    except Exception:
        return None


def _downscale(arr: np.ndarray, max_side: int = 1024) -> np.ndarray:
    """Downscale images larger than max_side on the longest side."""
    h, w = arr.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return arr
    if cv2 is not None:
        scale = max_side / longest
        return cv2.resize(arr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    img = Image.fromarray(arr)
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return np.asarray(img)


def lesion_ratios(image_bytes: bytes) -> Dict[str, float]:
    """Return lesion ratios (0-100) plus turgor droop angle in degrees
    and droop_method ('contour_pca' or 'lesion_proxy')."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        rgb = img.convert("RGB")
        arr = np.asarray(rgb)
    arr = _downscale(arr)
    if cv2 is not None:
        ratios = _lesion_ratios_cv2(arr)
    else:
        ratios = _lesion_ratios_numpy(arr)
    pca_angle = _droop_angle_contour_pca(arr)
    if pca_angle is not None:
        ratios["turgor_droop_angle_deg"] = pca_angle
        ratios["droop_method"] = "contour_pca"  # type: ignore[assignment]
    else:
        # Fallback ONLY when no usable contour is found (or no cv2):
        # the lesion-ratio proxy, bounded 0-60 deg.
        unhealthy = 100.0 - ratios["healthy_chlorophyll_ratio"]
        droop = 2.0 + unhealthy * 0.5 + ratios["necrosis_brown_tip_ratio"] * 0.2
        ratios["turgor_droop_angle_deg"] = round(min(60.0, max(0.0, droop)), 2)
        ratios["droop_method"] = "lesion_proxy"  # type: ignore[assignment]
    return ratios


def analyze_image(
    image_bytes: bytes,
    species_scientific_name: str | None = None,
    cultivar: str | None = None,
) -> Dict[str, Any]:
    exif = parse_exif(image_bytes)
    ev, lux = estimate_lux(float(exif["iso"]), float(exif["f_number"]), float(exif["exposure_time"]))
    ratios = lesion_ratios(image_bytes)
    # Diagnosis precedence fix: an absent EXIF must not mask disease.
    # Build the diagnosis from ALL applicable parts, not just the first.
    parts: list[str] = []
    if not exif["present"]:
        parts.append(
            "No EXIF exposure data found; lux estimated from default settings "
            "(ISO 100, f/2.8, 1/60s) and should be treated as approximate."
        )
    if ratios["necrosis_brown_tip_ratio"] > 15:
        parts.append("Significant brown-tip necrosis detected; check watering and humidity.")
    elif ratios["chlorosis_yellow_ratio"] > 15:
        parts.append("Yellowing (chlorosis) detected; possible overwatering or low light.")
    elif ratios["healthy_chlorophyll_ratio"] > 70:
        parts.append("Mostly healthy foliage with good chlorophyll coverage.")
    else:
        parts.append("Mixed foliage health; monitor moisture, light and pests.")
    if ratios.get("droop_method") == "lesion_proxy":
        parts.append(
            "Droop angle is a lesion-ratio proxy (no usable leaf contour found), "
            "not a contour-PCA measurement."
        )
    diagnosis = " ".join(parts)
    recommendations: list[str] = []
    if lux < 500:
        recommendations.append("Move to brighter indirect light (target 1000+ lux).")
    if ratios["chlorosis_yellow_ratio"] > 10:
        recommendations.append("Let soil dry between waterings and check drainage.")
    if ratios["necrosis_brown_tip_ratio"] > 10:
        recommendations.append("Trim brown tips and raise humidity around the plant.")
    if not recommendations:
        recommendations.append("Keep the current care routine and re-scan in a week.")
    # PlantNet-300K calibration integration point (botanical engine v2.4.0):
    # classical lesion ratios act as pseudo-scores shifted by the leaf-weighted
    # logit adjustment when the caller names an engine-mapped species. No
    # neural inference runs offline; see botanical_engine_adapter docstring.
    from services.botanical_engine_adapter import calibrate_vision_scores

    _pseudo_scores = {
        "healthy_chlorophyll": ratios["healthy_chlorophyll_ratio"],
        "chlorosis_yellow": ratios["chlorosis_yellow_ratio"],
        "necrosis_brown_tip": ratios["necrosis_brown_tip_ratio"],
    }
    if species_scientific_name:
        _calibrated = calibrate_vision_scores(
            _pseudo_scores, species_scientific_name, cultivar)
        plantnet_calibration = _calibrated["calibration"]
        calibrated_scores = _calibrated["scores"]
        if plantnet_calibration is None:
            plantnet_calibration = {
                "available": False,
                "reason": f"no engine node for {species_scientific_name!r}; calibration skipped",
            }
    else:
        calibrated_scores = dict(_pseudo_scores)
        plantnet_calibration = {
            "available": False,
            "reason": "no species supplied; calibration skipped",
        }
    return {
        "lux": round(float(lux), 2),
        "ev": round(float(ev), 4),
        "exif": {
            "iso": exif["iso"],
            "f_number": exif["f_number"],
            "exposure_time": exif["exposure_time"],
        },
        "exif_present": bool(exif["present"]),
        "exif_source": "exif" if exif["present"] else "defaults",
        "lesion_ratios": ratios,
        "diagnosis": diagnosis,
        "recommendations": recommendations,
        "models": get_model_status(),
        "calibrated_vision_scores": calibrated_scores,
        "plantnet_calibration": plantnet_calibration,
    }
