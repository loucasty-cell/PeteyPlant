"""VPD, moisture-decay and weather logic (all real, no placeholders).

Forecast time-step note (audit fix): moisture_step is an HOURLY step
(theta_t is one hour of decay). A multi-day forecast must therefore
apply 24 hourly iterations per forecast day; calling it once per day
understates decay by roughly 24x. forecast_moisture_days() does this
correctly and is the single place forecasts should step moisture.
The spec formula itself is unchanged.
"""
from __future__ import annotations

import math
import os
from typing import List, Optional

import httpx

# Overridable for offline verification: set OPEN_METEO_BASE_URL to an
# unreachable host (e.g. http://127.0.0.1:9) to force the offline fallback.
OPEN_METEO_BASE_URL = os.environ.get(
    "OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1/forecast"
)

# Pot-material drying factors (app constants, NOT measured data — they
# encode the qualitative fact that porous pots dry faster). Unlisted
# materials (e.g. "stone") default to 1.0. Documented here per the
# triage-input fix: terracotta 1.25, plastic 1.0, ceramic 0.9,
# metal 1.1, fabric 1.3.
POT_FACTORS: dict[str, float] = {
    "terracotta": 1.25,
    "plastic": 1.0,
    "ceramic": 0.9,
    "metal": 1.1,
    "fabric": 1.3,
}


def pot_factor(pot_material: Optional[str]) -> float:
    """Drying factor for a pot material; 1.0 for unknown/unlisted materials."""
    if not pot_material:
        return 1.0
    return POT_FACTORS.get(str(pot_material).strip().lower(), 1.0)


def effective_vpd(vpd_kpa: float, ac_on: bool = False) -> float:
    """Air-conditioned air is drier: ac_on=True raises effective VPD by
    10% (documented modelling assumption, not a measured constant)."""
    return vpd_kpa * 1.10 if ac_on else vpd_kpa


def saturation_vapor_pressure(temp_c: float) -> float:
    """es in kPa: 0.61078 * exp(17.27*T / (T + 237.3)).

    Guard: at T == -237.3 the denominator is zero; below that the
    Magnus formula is physically meaningless, so return 0.0 instead of
    raising ZeroDivisionError.
    """
    denom = temp_c + 237.3
    if abs(denom) < 1e-9 or temp_c < -237.3:
        return 0.0
    return 0.61078 * math.exp(17.27 * temp_c / denom)


def vapour_pressure_deficit(temp_c: float, rh_pct: float) -> float:
    # Clamp RH to its physical range so out-of-range inputs cannot
    # produce negative or >es VPD values.
    rh = max(0.0, min(100.0, float(rh_pct)))
    es = saturation_vapor_pressure(temp_c)
    return es * (1.0 - rh / 100.0)


# Backwards/forwards-compatible alias (VPD spelling).
vpd = vapour_pressure_deficit


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def moisture_step(
    theta_prev: float,
    k_species: float,
    alpha_pot: float,
    vpd_kpa: float,
    lux: float,
    lux_opt: float,
    watered_amount: float = 0.0,
) -> float:
    """HOURLY moisture decay:
    theta_t = clamp(theta_{t-1} - (k * alpha * VPD_t * Lux_t/Lux_opt) + W_t, 0, 100)
    """
    lux_opt = lux_opt if lux_opt > 0 else 1.0
    decay = k_species * alpha_pot * vpd_kpa * (lux / lux_opt)
    return clamp(theta_prev - decay + watered_amount)


def forecast_moisture_days(
    theta_start: float,
    k_species: float,
    alpha_pot: float,
    vpd_kpa: float,
    lux: float,
    lux_opt: float,
    days: int = 7,
) -> List[float]:
    """Multi-day forecast: 24 HOURLY moisture_step iterations per day,
    using that day's VPD/lux throughout the day. Returns one rounded
    moisture value per day."""
    theta = float(theta_start)
    out: List[float] = []
    for _ in range(days):
        for _ in range(24):
            theta = moisture_step(theta, k_species, alpha_pot, vpd_kpa, lux, lux_opt)
        out.append(round(theta, 1))
    return out


def check_emergency_brake(vpd_history_kpa: List[float], threshold: float = 0.4, days: int = 4) -> bool:
    """True when VPD < threshold for `days` or more consecutive days.

    Sustained low VPD means persistently damp air / soggy conditions, so
    watering is locked by the root-rot brake.
    """
    run = 0
    for v in vpd_history_kpa:
        if v < threshold:
            run += 1
            if run >= days:
                return True
        else:
            run = 0
    return False


def offline_fallback_weather(lat: Optional[float], lon: Optional[float]) -> dict:
    """Deterministic offline fallback; never raises. Varies gently with lat.

    VPD is computed from the ROUNDED temperature (the value actually
    reported), not the unrounded intermediate, so temp/vpd are consistent.
    lux is a FIXED ESTIMATE (1200.0), not a live reading — Open-Meteo's
    current-conditions endpoint does not report illuminance, so no live
    lux value is available in either path; lux_estimated flags this.
    """
    base = 22.0
    if lat is not None:
        base = 22.0 - abs(lat) * 0.05
    temp = round(base, 1)
    return {
        "temp_c": temp,
        "rh_pct": 55.0,
        "vpd_kpa": round(vapour_pressure_deficit(temp, 55.0), 4),
        "lux": 1200.0,
        "lux_estimated": True,
        "source": "offline_fallback",
    }


def fetch_weather(lat: Optional[float], lon: Optional[float]) -> dict:
    """Open-Meteo fetch with a 5s timeout and deterministic offline fallback.

    Never fails at import or request time: any error returns the fallback.
    lux is a FIXED ESTIMATE in both paths (see offline_fallback_weather);
    it is never presented as a live sensor reading.
    """
    if lat is None or lon is None:
        return offline_fallback_weather(lat, lon)
    try:
        url = (
            f"{OPEN_METEO_BASE_URL}"
            f"?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m"
        )
        resp = httpx.get(url, timeout=5.0)
        resp.raise_for_status()
        cur = resp.json().get("current", {})
        temp = float(cur.get("temperature_2m", 22.0))
        rh = float(cur.get("relative_humidity_2m", 55.0))
        return {
            "temp_c": temp,
            "rh_pct": rh,
            "vpd_kpa": round(vapour_pressure_deficit(temp, rh), 4),
            "lux": 1200.0,
            "lux_estimated": True,
            "source": "open-meteo",
        }
    except Exception:
        return offline_fallback_weather(lat, lon)


def compute_hp(
    moisture_pct: float,
    vpd_kpa: float,
    lux: float,
    species,
    disease_penalty: float = 0.0,
) -> int:
    """HP from moisture/VPD/lux within species bounds + disease penalties, 0-100."""
    score = 100.0
    if moisture_pct < species.min_soil_moisture_pct:
        score -= (species.min_soil_moisture_pct - moisture_pct) * 1.2
    elif moisture_pct > species.max_soil_moisture_pct:
        score -= (moisture_pct - species.max_soil_moisture_pct) * 1.5
    if vpd_kpa < species.ideal_vpd_min_kpa:
        score -= (species.ideal_vpd_min_kpa - vpd_kpa) * 20.0
    elif vpd_kpa > species.ideal_vpd_max_kpa:
        score -= (vpd_kpa - species.ideal_vpd_max_kpa) * 20.0
    if lux < species.min_lux:
        score -= 15.0
    elif lux < species.optimal_lux * 0.5:
        score -= 5.0
    score -= disease_penalty
    return int(clamp(round(score), 0, 100))
