"""Lightweight embedding-free search over species care guides.

No model downloads. Token-overlap / TF-IDF-style ranking over care-guide
text generated from the structured species fields.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import List

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> List[str]:
    return _TOKEN_RE.findall((text or "").lower())


def _toxicity_text(species) -> str:
    """Never render a bare False as 'pet-safe'. Species whose toxicity
    is unverified say so explicitly; verified species state the verdict."""
    status = getattr(species, "toxicity_status", "unverified")
    # A True bool is a positive toxicity claim (the safe direction to
    # surface); a False bool is only "safe" when explicitly verified.
    if getattr(species, "pet_toxicity", False) or status == "verified_toxic":
        return "Pet toxic: yes"
    if status == "verified_safe":
        return "Pet toxicity: verified non-toxic for this species"
    return "Pet toxicity: unverified — do not assume safe"


def care_chunk(species) -> str:
    base = (
        f"{species.common_name} ({species.scientific_name}), family {species.family}. "
        f"Keep soil moisture between {species.min_soil_moisture_pct}% and "
        f"{species.max_soil_moisture_pct}%. Ideal VPD "
        f"{species.ideal_vpd_min_kpa}-{species.ideal_vpd_max_kpa} kPa. "
        f"Light: minimum {species.min_lux} lux, optimal {species.optimal_lux} lux. "
        f"Soil pH {species.soil_ph_range[0]}-{species.soil_ph_range[1]}. "
        f"{_toxicity_text(species)}. "
        f"Watch for: {', '.join(species.common_pathogens) or 'none commonly reported'}. "
        f"Watering sensitivity (crop coefficient k={species.crop_coeff_k})."
    )
    # Verified qualitative guidance (scope-3 merge): numeric model
    # parameters above stay approximate; where a species carries
    # source-verified qualitative text, cite it here instead of
    # letting the numbers speak alone. UNVERIFIED fields are None and
    # are never rendered.
    verified = []
    if getattr(species, "verified_light", None):
        verified.append(f"Verified light guidance: {species.verified_light}.")
    if getattr(species, "verified_watering", None):
        verified.append(f"Verified watering guidance: {species.verified_watering}.")
    if getattr(species, "verified_soil_moisture", None):
        verified.append(f"Verified soil-moisture guidance: {species.verified_soil_moisture}.")
    if getattr(species, "verified_humidity", None):
        verified.append(f"Verified humidity guidance: {species.verified_humidity}.")
    if getattr(species, "verified_temperature", None):
        verified.append(f"Verified temperature guidance: {species.verified_temperature}.")
    if getattr(species, "verified_pests_diseases", None):
        verified.append(
            f"Verified pests/diseases to watch: {', '.join(species.verified_pests_diseases)}.")
    if getattr(species, "verification_notes", None):
        verified.append(f"Verification notes: {species.verification_notes}.")
    if verified:
        base += " " + " ".join(verified)
    return base


def search_species(query: str, species_list) -> List[dict]:
    """Ranked species + care chunk for a query (empty query returns all, scored 0)."""
    q_tokens = _tokens(query)
    # Document frequencies for an IDF-style weight.
    docs = []
    for sp in species_list:
        text = f"{sp.common_name} {sp.scientific_name} {sp.family} {sp.archetype_rig_id} {care_chunk(sp)}"
        docs.append(_tokens(text))
    df = Counter()
    for toks in docs:
        for t in set(toks):
            df[t] += 1
    n = max(1, len(docs))
    ranked = []
    for sp, toks in zip(species_list, docs):
        counts = Counter(toks)
        score = 0.0
        for qt in q_tokens:
            if counts.get(qt):
                idf = math.log((n + 1) / (df[qt] + 1)) + 1.0
                score += counts[qt] * idf
        hay = " ".join(toks)
        if query and query.strip().lower() in hay:
            score += 5.0
        ranked.append({"species": sp, "score": round(float(score), 4), "care_chunk": care_chunk(sp)})
    if q_tokens:
        ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked


def build_temporal_context(history) -> dict:
    """14-day summary: moisture slope, VPD spikes, missed waterings, turgor trend."""
    last = list(history)[-14:] if history else []
    if not last:
        return {
            "days": 0,
            "moisture_slope_per_day": 0.0,
            "vpd_spikes": 0,
            "missed_waterings": 0,
            "turgor_trend": "stable",
            "summary": "No history available.",
        }
    xs = list(range(len(last)))
    ys = [float(h["moisture_pct"] if isinstance(h, dict) else h.moisture_pct) for h in last]
    n = len(last)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs) or 1.0
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    vpds = [float(h["vpd_kpa"] if isinstance(h, dict) else h.vpd_kpa) for h in last]
    spikes = sum(1 for v in vpds if v > 1.5 or v < 0.4)
    missed = sum(
        1
        for h in last
        if not (h["watered"] if isinstance(h, dict) else h.watered)
        and (h["moisture_pct"] if isinstance(h, dict) else h.moisture_pct) < 30
    )
    if slope > 0.5:
        trend = "improving"
    elif slope < -0.5:
        trend = "declining"
    else:
        trend = "stable"
    summary = (
        f"Over the last {n} days moisture changed {slope:+.2f}%/day "
        f"(turgor trend: {trend}), with {spikes} VPD spike day(s) and "
        f"{missed} missed-watering day(s) (dry and unwatered)."
    )
    return {
        "days": n,
        "moisture_slope_per_day": round(float(slope), 4),
        "vpd_spikes": spikes,
        "missed_waterings": missed,
        "turgor_trend": trend,
        "summary": summary,
    }
