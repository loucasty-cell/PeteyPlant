"""Advanced time-series ML for Petey Plant — offline, numpy-only, no downloads.

All formulas are documented in the docstrings below. Inputs are daily
history entries (dicts or objects with moisture_pct / vpd_kpa /
watered / date_iso attributes). Nothing here calls the network.

1. Decomposition (decompose_series)
   -------------------------------
   Over the last 14-30 days (the window is the last min(30, len) days,
   requiring at least 7 days of data):
     trend_t      = centered 7-day moving average of moisture
                    (mean of moisture[t-3..t+3], truncated at the edges).
     seasonal_d   = mean over the window of (moisture_t - trend_t) for
                    all t with t % 7 == d, recentered so the 7 seasonal
                    values sum to 0. This is the weekly (7-day) seasonal
                    component: watering weeks repeat on a 7-day cycle.
     residual_t   = moisture_t - trend_t - seasonal_{t % 7}.

2. Multi-day forecast with uncertainty bands (forecast_moisture)
   ------------------------------------------------------------
   Daily moisture is stepped with 24 HOURLY moisture_step iterations
   per day (see timeseries_vpd.forecast_moisture_days — the step is
   hourly, so one call per day would understate decay ~24x).
     mean_d  = forecast moisture on day d.
     lower_d = clamp(mean_d - 1.96 * sigma * sqrt(d), 0, 100)
     upper_d = clamp(mean_d + 1.96 * sigma * sqrt(d), 0, 100)
   where sigma is the residual standard deviation from the
   decomposition (passed in, or estimated from the history residuals),
   d is 1-based, and 1.96 is the normal 95% factor. Bands widen with
   sqrt(d) because forecast error accumulates with horizon.

3. Anomaly detection (detect_anomalies)
   -------------------------------------
   - soil-stuck-wet: moisture above the species max for 3+ consecutive days.
   - vpd-spike: a day's VPD > (mean + 2*std) of the previous 7 days' VPD
     (requires 7 prior days; std uses the population formula, and a
     zero-std window cannot spike).
   - missed-watering: 3+ days since the last watered entry while the
     latest moisture is below the species min.

4. Root-rot risk (root_rot_risk)
   ------------------------------
   Over the last 14 days (or fewer if less history exists):
     low_vpd_frac = fraction of days with VPD < 0.4 kPa
     wet_frac     = fraction of days with moisture > species max
     duration     = min(1, longest run of consecutive VPD < 0.4 days / 7)
     risk = round(100 * (0.4*low_vpd_frac + 0.4*wet_frac + 0.2*duration))
   Rationale: sustained damp air (low VPD) + wet soil + duration are
   the three documented root-rot drivers; weights sum to 1. A plant
   with two dry weeks at ideal VPD scores 0; a plant soaked for two
   weeks at VPD 0.3 scores 100.

5. Watering recommendation (recommend_watering)
   --------------------------------------------
   next_water = the first forecast day whose mean moisture crosses
   below the species min; reason names that day and the crossing value.
   If no forecast day crosses the min, the recommendation is to recheck
   after the forecast horizon — never a static timer.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, List, Optional

from services.timeseries_vpd import forecast_moisture_days

# ---------------------------------------------------------------- helpers


def _get(entry: Any, field: str, default: Any = None) -> Any:
    if isinstance(entry, dict):
        return entry.get(field, default)
    return getattr(entry, field, default)


def _moisture(entry: Any) -> float:
    return float(_get(entry, "moisture_pct", 0.0))


def _vpd(entry: Any) -> float:
    return float(_get(entry, "vpd_kpa", 0.0))


def _watered(entry: Any) -> bool:
    return bool(_get(entry, "watered", False))


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / len(values))


# ---------------------------------------------------------------- 1. decomposition


def decompose_series(history: List[Any]) -> dict:
    """Centered-MA trend + 7-day seasonal + residual (see module docstring).

    Uses the last min(30, len(history)) days; requires >= 7 days.
    Returns {"dates", "trend", "seasonal" (7 values), "residuals",
    "residual_std", "days"}. Seasonal values sum to ~0 by construction.
    """
    window = list(history)[-30:]
    n = len(window)
    if n < 7:
        raise ValueError("decompose_series requires at least 7 days of history")
    moisture = [_moisture(h) for h in window]
    dates = [str(_get(h, "date_iso", "")) for h in window]
    trend: List[float] = []
    for t in range(n):
        lo, hi = max(0, t - 3), min(n, t + 4)
        trend.append(round(_mean(moisture[lo:hi]), 4))
    detrended = [moisture[t] - trend[t] for t in range(n)]
    seasonal = []
    for d in range(7):
        group = [detrended[t] for t in range(n) if t % 7 == d]
        seasonal.append(_mean(group) if group else 0.0)
    center = _mean(seasonal)
    seasonal = [round(s - center, 4) for s in seasonal]
    residuals = [round(moisture[t] - trend[t] - seasonal[t % 7], 4) for t in range(n)]
    return {
        "dates": dates,
        "trend": trend,
        "seasonal": seasonal,
        "residuals": residuals,
        "residual_std": round(_std(residuals), 4),
        "days": n,
    }


# ---------------------------------------------------------------- 2. forecast + bands


def forecast_moisture(
    theta_start: float,
    k_species: float,
    alpha_pot: float,
    vpd_kpa: float,
    lux: float,
    lux_opt: float,
    days: int = 7,
    residual_std: float = 0.0,
    start_date: Optional[date] = None,
) -> List[dict]:
    """Forecast mean + 95% bands (see module docstring)."""
    means = forecast_moisture_days(
        theta_start, k_species, alpha_pot, vpd_kpa, lux, lux_opt, days=days
    )
    start = start_date or date.today()
    out = []
    for i, mean in enumerate(means, start=1):
        band = 1.96 * float(residual_std) * math.sqrt(i)
        out.append({
            "date": (start + timedelta(days=i)).isoformat(),
            "moisture_pct": round(mean, 1),
            "lower": round(max(0.0, mean - band), 1),
            "upper": round(min(100.0, mean + band), 1),
        })
    return out


# ---------------------------------------------------------------- 3. anomalies


def detect_anomalies(history: List[Any], species) -> List[dict]:
    """Soil-stuck-wet / VPD-spike / missed-watering anomalies (see docstring)."""
    anomalies: List[dict] = []
    if not history:
        return anomalies
    window = list(history)
    # Soil stuck wet: any run of 3+ days above species max.
    run = 0
    run_start = 0
    for i, h in enumerate(window):
        if _moisture(h) > species.max_soil_moisture_pct:
            if run == 0:
                run_start = i
            run += 1
        else:
            if run >= 3:
                anomalies.append({
                    "type": "soil_stuck_wet",
                    "days": run,
                    "detail": f"Moisture above species max ({species.max_soil_moisture_pct}%) "
                              f"for {run} consecutive days.",
                    "start_date": str(_get(window[run_start], "date_iso", "")),
                })
            run = 0
    if run >= 3:
        anomalies.append({
            "type": "soil_stuck_wet",
            "days": run,
            "detail": f"Moisture above species max ({species.max_soil_moisture_pct}%) "
                      f"for {run} consecutive days.",
            "start_date": str(_get(window[run_start], "date_iso", "")),
        })
    # VPD spike: daily VPD > rolling 7-day prior mean + 2 std.
    vpds = [_vpd(h) for h in window]
    for i in range(7, len(vpds)):
        prior = vpds[i - 7:i]
        mu, sd = _mean(prior), _std(prior)
        if sd > 0 and vpds[i] > mu + 2 * sd:
            anomalies.append({
                "type": "vpd_spike",
                "date": str(_get(window[i], "date_iso", "")),
                "vpd_kpa": vpds[i],
                "detail": f"VPD {vpds[i]} kPa exceeds prior 7-day mean {mu:.2f} + 2 std ({sd:.2f}).",
            })
    # Missed watering: 3+ days since last watered, moisture below min.
    days_since = 0
    for h in reversed(window):
        if _watered(h):
            break
        days_since += 1
    else:
        days_since = len(window)
    latest = _moisture(window[-1])
    if days_since >= 3 and latest < species.min_soil_moisture_pct:
        anomalies.append({
            "type": "missed_watering",
            "days_since_watered": days_since,
            "moisture_pct": latest,
            "detail": f"No watering for {days_since} days while moisture ({latest}%) "
                      f"is below species min ({species.min_soil_moisture_pct}%).",
        })
    return anomalies


# ---------------------------------------------------------------- 4. root-rot risk


def root_rot_risk(history: List[Any], species) -> int:
    """0-100 root-rot risk (formula in the module docstring)."""
    window = list(history)[-14:]
    if not window:
        return 0
    low_vpd_frac = sum(1 for h in window if _vpd(h) < 0.4) / len(window)
    wet_frac = sum(1 for h in window if _moisture(h) > species.max_soil_moisture_pct) / len(window)
    longest = run = 0
    for h in window:
        if _vpd(h) < 0.4:
            run += 1
            longest = max(longest, run)
        else:
            run = 0
    duration = min(1.0, longest / 7.0)
    return int(round(100 * (0.4 * low_vpd_frac + 0.4 * wet_frac + 0.2 * duration)))


# ---------------------------------------------------------------- 5. recommendation


def recommend_watering(forecast_days: List[dict], species_min_moisture: float) -> dict:
    """Next-water date = first forecast day crossing below species min."""
    for day in forecast_days:
        if day["moisture_pct"] < species_min_moisture:
            return {
                "next_water_iso": day["date"],
                "reason": (
                    f"Forecast moisture crosses below species minimum "
                    f"({species_min_moisture}%) on {day['date']} "
                    f"(forecast {day['moisture_pct']}%)."
                ),
            }
    if forecast_days:
        last = forecast_days[-1]
        return {
            "next_water_iso": last["date"],
            "reason": (
                f"Forecast moisture stays above species minimum "
                f"({species_min_moisture}%) through {last['date']} "
                f"(forecast {last['moisture_pct']}%); recheck after the forecast horizon."
            ),
        }
    return {
        "next_water_iso": date.today().isoformat(),
        "reason": "No forecast available; recheck soon.",
    }
