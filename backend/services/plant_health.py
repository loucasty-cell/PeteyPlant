"""Translate reported houseplant observations into practical next checks."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/v1/plant-health", tags=["plant health"])

Symptom = Literal[
    "healthy",
    "chlorosis_yellowing",
    "necrosis_brown_tips_edges",
    "spots_lesions_rot",
    "wilting_turgor_loss",
    "pest_damage_signs",
    "etiolation_light_stress",
    "mechanical_or_senescence",
]
FollowUp = Literal["soil", "drainage", "pests", "light", "spread"]


class Observations(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symptoms: list[Symptom] = Field(default_factory=list, max_length=8)
    soil: Literal["unknown", "dry", "moist", "wet"] = "unknown"
    drainage: Literal["unknown", "yes", "no"] = "unknown"
    pests: Literal["unknown", "seen", "none_seen"] = "unknown"
    light: Literal["unknown", "low", "bright_indirect", "strong_direct"] = "unknown"
    spread: Literal["unknown", "yes", "no"] = "unknown"


class PossibleCause(BaseModel):
    label: str
    reason: str


class Source(BaseModel):
    title: str
    url: str


class Triage(BaseModel):
    status: Literal["needs_observation", "next_steps", "no_visible_issue"]
    headline: str
    summary: str
    possible_causes: list[PossibleCause] = Field(default_factory=list)
    steps: list[str]
    follow_up: list[FollowUp] = Field(default_factory=list)
    sources: list[Source]
    evidence_type: Literal["owner_observations"] = "owner_observations"


DIAGNOSIS = Source(
    title="Diagnose indoor plant problems · University of Maryland Extension",
    url="https://extension.umd.edu/resource/diagnose-indoor-plant-problems",
)
WATER = Source(
    title="Watering indoor plants · University of Maryland Extension",
    url="https://extension.umd.edu/resource/watering-indoor-plants",
)
ROOTS = Source(
    title="Root rots of indoor plants · University of Maryland Extension",
    url="https://extension.umd.edu/resource/root-rots-indoor-plants",
)
PESTS = Source(
    title="Managing insects on indoor plants · University of Minnesota Extension",
    url="https://extension.umn.edu/garden-and-home/yard-and-garden/yard-and-garden-insects/insects-on-indoor-plants",
)
SPOTS = Source(
    title="Fungal leaf spots on indoor plants · University of Maryland Extension",
    url="https://extension.umd.edu/resource/fungal-leaf-spots-indoor-plants",
)
LIGHT = Source(
    title="Lighting for indoor plants · University of Maryland Extension",
    url="https://extension.umd.edu/resource/lighting-indoor-plants",
)
ENVIRONMENT = Source(
    title="Diagnosing environmental houseplant problems · Iowa State University Extension",
    url="https://yardandgarden.extension.iastate.edu/how-to/diagnosing-houseplant-problems-improper-environmental-conditions",
)
EXPERT = Source(
    title="Photographing plant problems for an expert · University of Maryland Extension",
    url="https://extension.umd.edu/resource/tips-submitting-photos-ask-extension",
)

HOLD_WATER_STEP = "Hold off on adding water. Empty any standing water from the saucer or outer pot."

EXPERT_STEP = (
    "Take a photo of the whole plant and close-ups of both sides of affected leaves. "
    "Share them and your care history with a local horticulture extension service or plant clinic."
)


@router.post("/triage", response_model=Triage)
def triage(observations: Observations) -> Triage:
    signs = set(observations.symptoms) - {"healthy"}
    wet_steps = [HOLD_WATER_STEP] if observations.soil == "wet" else []
    wet_sources = [WATER] if wet_steps else []
    if not signs and observations.pests != "seen":
        if observations.spread == "yes":
            return Triage(
                status="needs_observation",
                headline="Show what’s getting worse",
                summary="You reported that the issue is spreading. Select the changes you can see on the plant.",
                steps=[*wet_steps, EXPERT_STEP],
                sources=[*wet_sources, EXPERT],
            )
        if "healthy" in observations.symptoms:
            return Triage(
                status="no_visible_issue",
                headline="No visible stress reported",
                summary="Keep your usual care checks and look for changes in new growth.",
                steps=wet_steps or ["Check the potting mix before deciding to water."],
                sources=[WATER],
            )
        return Triage(
            status="needs_observation",
            headline="Start with what you see",
            summary="Pick any changes you can see to get a focused next check.",
            steps=[*wet_steps, "Look at new and old leaves, both leaf surfaces, and stems."],
            sources=[*wet_sources, DIAGNOSIS],
        )

    causes: list[PossibleCause] = []
    steps: list[str] = wet_steps
    follow_up: list[FollowUp] = []
    sources: list[Source] = wet_sources

    if observations.spread == "yes":
        steps.append("Move the plant away from nearby plants while you check the spreading damage.")
        sources.append(DIAGNOSIS)

    if observations.pests == "seen":
        causes.append(PossibleCause(label="Possible pest activity", reason="You saw signs of pests."))
        if observations.spread != "yes":
            steps.append("Separate this plant from the rest of your collection.")
        steps.append("Check nearby plants. Look under leaves and where each leaf joins the stem.")
        steps.append("Identify the pest before choosing a treatment. For a small infestation on sturdy leaves, wiping off visible pests with a damp cloth is a first option.")
        sources.append(PESTS)
    elif "pest_damage_signs" in signs:
        causes.append(PossibleCause(label="Possible pest damage", reason="Stippling or other surface marks can come from pests. A close inspection can narrow it down."))
        steps.append("Look under leaves and along stems for moving insects, fine webbing, cottony clusters, or raised bumps.")
        sources.append(PESTS)
        if observations.pests == "unknown":
            follow_up.append("pests")

    if signs & {"wilting_turgor_loss", "chlorosis_yellowing", "necrosis_brown_tips_edges"}:
        sources.append(WATER)
        if observations.soil == "unknown":
            causes.append(PossibleCause(label="Possible moisture stress", reason="Similar leaf symptoms can occur when potting mix is too dry or stays too wet."))
            steps.append("Feel the potting mix below the surface before deciding whether to water.")
            follow_up.append("soil")
        elif observations.soil == "wet":
            causes.append(PossibleCause(label="Possible excess moisture", reason="You reported wet mix. Mix that stays wet can damage roots and contribute to yellowing or wilting."))
            if "wilting_turgor_loss" in signs:
                steps.append("If the plant keeps wilting while the mix stays wet, ask a plant clinic to check for root damage or rot.")
                sources.append(ROOTS)
        elif observations.soil == "moist":
            steps.append("Check again before watering. If the plant keeps wilting while the mix stays moist, ask a plant clinic to check the roots and growing conditions.")
            sources.append(DIAGNOSIS)
        else:
            causes.append(PossibleCause(label="Possible dry mix stress", reason="You reported dry mix. The amount of drying a plant tolerates depends on the species and potting mix."))
            steps.append("Check the watering guidance for your species and make sure the pot drains before deciding whether to water.")

        if observations.drainage == "no":
            steps.append("Check whether the plant sits inside a removable pot with holes. Clear any standing water in the outer pot. A draining inner pot helps prevent water buildup.")
            sources.append(ENVIRONMENT)
        elif observations.drainage == "unknown" and observations.soil in {"dry", "wet"}:
            follow_up.append("drainage")

    if "spots_lesions_rot" in signs:
        causes.append(PossibleCause(label="Possible leaf injury or disease", reason="Spots can come from growing conditions or a leaf infection. New or expanding spots are worth investigating."))
        steps.append("Give the leaves room for air to circulate and avoid splashing water onto them.")
        sources.extend((DIAGNOSIS, SPOTS))
        if observations.spread == "unknown":
            follow_up.append("spread")

    if signs & {"etiolation_light_stress", "necrosis_brown_tips_edges", "spots_lesions_rot", "chlorosis_yellowing"}:
        if observations.light == "low" and signs & {"etiolation_light_stress", "chlorosis_yellowing"}:
            causes.append(PossibleCause(label="Possible low light stress", reason="You reported low light. Pale leaves or stretched growth can develop when the plant gets too little light."))
            steps.append("Check your plant’s light preference. If it needs more light, move it gradually and compare the next leaves it grows.")
            sources.append(LIGHT)
        elif observations.light == "strong_direct" and signs & {"etiolation_light_stress", "necrosis_brown_tips_edges", "spots_lesions_rot"}:
            causes.append(PossibleCause(label="Possible sun injury", reason="You reported strong direct sun. Scorch often appears on the side facing the window, especially after a move."))
            steps.append("Check whether damage is concentrated on the sun-facing side and compare the location with your plant’s light needs.")
            sources.append(LIGHT)
        elif observations.light == "unknown" and "etiolation_light_stress" in signs:
            follow_up.append("light")
            steps.append("Note whether the plant sits in a dim spot or receives strong direct sun, and look for stretched growth or pale patches.")
            sources.append(LIGHT)

    if "mechanical_or_senescence" in signs and observations.spread != "yes":
        causes.append(PossibleCause(label="Possible older-leaf aging or local damage", reason="An isolated tear or one aging leaf deserves a different check from damage moving to new growth."))
        steps.append("Watch whether the change stays on the same leaf and whether new leaves are affected.")
        sources.append(ENVIRONMENT)

    if observations.spread == "yes":
        steps.append(EXPERT_STEP)
        sources.append(EXPERT)
    elif observations.spread == "unknown" and observations.pests != "seen" and not follow_up:
        follow_up.append("spread")

    if not steps:
        steps.append("Compare affected leaves with healthy new growth. Take a photo so you can see whether the problem changes.")
        sources.append(EXPERT)

    return Triage(
        status="needs_observation" if follow_up else "next_steps",
        headline="A few checks can narrow it down" if follow_up else "What to do next",
        summary="These steps use what you reported. Several plant problems can look alike.",
        possible_causes=causes,
        steps=steps,
        follow_up=follow_up[:2],
        sources=list({source.url: source for source in sources}.values()),
    )
