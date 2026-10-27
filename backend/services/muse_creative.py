"""Deterministic, style-locked avatar prompt builder (no image generation).

No image files are generated or stored by this module.
"""
from __future__ import annotations

TEMPLATE = (
    "Flat vector Duolingo character design of a cute cartoon {species} ({archetype}), "
    "{mood} expression, {pathology}, vibrant clean outlines, expressive oversized eyes, "
    "seated in a {pot_type} pot, isolated background, game UI asset"
)


def build_avatar_prompt(
    species_name: str,
    archetype: str,
    mood_state: str,
    pathology_visual_modifier: str,
    pot_type: str,
) -> str:
    """Build the exact style-locked template prompt."""
    return TEMPLATE.format(
        species=species_name,
        archetype=archetype,
        mood=mood_state,
        pathology=pathology_visual_modifier,
        pot_type=pot_type,
    )


def derive_expression(hp: float, moisture: float, mood: str = "",
                      min_moisture: float | None = None,
                      max_moisture: float | None = None) -> dict:
    """Neglect-state expression derivation driven by telemetry.

    HP <= 30 and moisture above the species max  -> "root-rot ghost"
    HP <= 30 and moisture below the species min  -> "parched cactus"
    HP <= 30 otherwise                           -> "wilted"
    Otherwise the expression is just the mood. Neglect states force a
    low saturation (~0.5) and a high droop, plus their particle effect.
    """
    hp = max(0.0, min(100.0, float(hp)))
    moisture = float(moisture)
    if hp <= 30 and max_moisture is not None and moisture > max_moisture:
        return {"expression": "root-rot ghost", "particle_effect": "raincoat",
                "color_saturation": 0.5, "droop_angle_deg": 45.0}
    if hp <= 30 and min_moisture is not None and moisture < min_moisture:
        return {"expression": "parched cactus", "particle_effect": "sweat_drops",
                "color_saturation": 0.5, "droop_angle_deg": 45.0}
    if hp <= 30:
        return {"expression": "wilted", "particle_effect": "sweat_drops",
                "color_saturation": 0.5, "droop_angle_deg": 40.0}
    return {"expression": mood or "happy", "particle_effect": None,
            "color_saturation": None, "droop_angle_deg": None}


def rig_params_for_state(hp: float, moisture: float, mood: str, pathology: str,
                         min_moisture: float | None = None,
                         max_moisture: float | None = None) -> dict:
    """Rig params for a plant state. particleEffect is one of the four allowed values."""
    hp = max(0.0, min(100.0, float(hp)))
    droop = round(max(0.0, min(60.0, (100.0 - hp) * 0.5)), 2)
    # Bouncier when healthy, stiffer/slower when sick.
    stiffness = round(0.3 + (hp / 100.0) * 0.7, 2)
    saturation = round(0.5 + (hp / 100.0) * 0.5, 2)
    # Neglect states override saturation/droop.
    neglect = derive_expression(hp, moisture, mood, min_moisture, max_moisture)
    if hp <= 30:
        saturation = neglect["color_saturation"]
        droop = max(droop, neglect["droop_angle_deg"])
    p = (pathology or "").lower()
    m = (mood or "").lower()
    if "mite" in p or "spider" in p:
        effect = "spider_mites"
    elif "overwater" in p or "root rot" in p or "root-rot" in p or "drowning" in m or "locked" in p:
        effect = "raincoat"
    elif moisture < 30 or "dry" in p or "thirst" in m:
        effect = "sweat_drops"
    elif hp >= 80:
        effect = "sparkles"
    else:
        effect = "sweat_drops"
    if hp <= 30 and neglect["particle_effect"]:
        effect = neglect["particle_effect"]
    return {
        "droopAngle": droop,
        "bounceStiffness": stiffness,
        "colorSaturation": saturation,
        "particleEffect": effect,
    }
