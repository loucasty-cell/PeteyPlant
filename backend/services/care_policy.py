"""Deterministic watering decisions from the evidence received by Garden Checkup."""

from datetime import datetime, timedelta
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, UUID4

DRAINAGE = Literal["yes", "no", "unknown"]
SOIL = Literal["dry", "moist", "wet", "unknown"]
DEPTH = Literal["recommended", "surface", "unknown"]
Question = Literal["soil", "inspection_depth", "drainage", "standing_water"]
DecisionCode = Literal[
    "HOLD_WATER", "CHECK_SOIL", "CHECK_DRAINAGE",
    "WATER_IF_APPROPRIATE", "INSUFFICIENT_EVIDENCE",
]

CHECKUP_MAX_AGE = timedelta(hours=1)
GENERAL_WATERING_SOURCE = "https://extension.umd.edu/resource/watering-indoor-plants"


class CheckupObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    soil: SOIL = "unknown"
    inspection_depth: DEPTH = "unknown"
    standing_water: DRAINAGE = "unknown"
    drainage: DRAINAGE = "unknown"


class AssessmentInput(CheckupObservation):
    based_on: UUID4 | None
    captured_at: AwareDatetime


class CheckupContext(BaseModel):
    plant_id: UUID4
    name: str
    species_id: str | None
    drainage: DRAINAGE
    check_prompt: str
    based_on: UUID4 | None


class Evidence(BaseModel):
    category: Literal["OWNER_OBSERVED", "SOURCE_VERIFIED", "HISTORICAL_RECORD"]
    field: str
    value: str
    plant_id: UUID4
    observed_at: datetime | None = None
    method: str | None = None
    limitations: str | None = None


class AssessmentResult(BaseModel):
    code: DecisionCode
    headline: str
    explanation: str
    next_step: str
    source: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    question: Question | None = None
    valid_until: datetime | None = None


def hold_water(observation: CheckupObservation, saved_drainage: DRAINAGE) -> AssessmentResult | None:
    """Surface observed wetness immediately, even when other context is missing."""
    if observation.standing_water == "yes":
        return AssessmentResult(
            code="HOLD_WATER",
            headline="Hold off on watering",
            explanation="You reported standing water in the saucer or outer pot.",
            next_step="Empty the standing water and let the pot drain. Check the mix before adding more water.",
            source=GENERAL_WATERING_SOURCE,
            question="drainage" if observation.drainage == saved_drainage == "unknown" else None,
        )
    if observation.soil in {"wet", "moist"}:
        question: Question | None = None
        if observation.soil == "wet":
            if observation.standing_water == "unknown":
                question = "standing_water"
            elif observation.drainage == saved_drainage == "unknown":
                question = "drainage"
        return AssessmentResult(
            code="HOLD_WATER",
            headline="Hold off on watering",
            explanation=f"You reported that the potting mix is still {observation.soil}.",
            next_step="Check for water in the saucer or outer pot. Empty any standing water and check the mix again later.",
            source=GENERAL_WATERING_SOURCE,
            question=question,
        )
    return None


def validate_watering(
    observation: CheckupObservation, saved_drainage: DRAINAGE, source: str | None,
) -> AssessmentResult | None:
    """Reject a watering proposal when the observation lacks any required evidence."""
    blocked = hold_water(observation, saved_drainage)
    if blocked:
        return blocked
    if observation.soil != "dry":
        return AssessmentResult(
            code="CHECK_SOIL", headline="Check the potting mix",
            explanation="No current dryness observation was reported.",
            next_step="Feel the mix at the suggested depth before deciding whether to water.",
            source=source, question="soil",
        )
    if source is None:
        return AssessmentResult(
            code="INSUFFICIENT_EVIDENCE", headline="Check this plant’s care needs",
            explanation="This saved plant doesn’t have a verified watering policy in Petey.",
            next_step="Confirm the species or check a trusted care guide for it before watering.",
        )
    if observation.inspection_depth != "recommended":
        return AssessmentResult(
            code="CHECK_SOIL", headline="Check below the surface",
            explanation="The reported dryness doesn’t establish what the mix feels like at the recommended depth.",
            next_step="Check the mix at the depth shown for your plant before deciding whether to water.",
            source=source, question="inspection_depth",
        )
    if "no" in (observation.drainage, saved_drainage) or "yes" not in (observation.drainage, saved_drainage):
        return AssessmentResult(
            code="CHECK_DRAINAGE", headline="Check how the pot drains",
            explanation="The current or saved pot information doesn’t establish that water can drain freely.",
            next_step="Look for drainage holes in the inner pot before adding water.",
            source=GENERAL_WATERING_SOURCE,
            question="drainage" if observation.drainage == "unknown" else None,
        )
    if observation.standing_water != "no":
        return AssessmentResult(
            code="CHECK_DRAINAGE", headline="Look for standing water",
            explanation="The saucer or outer pot hasn’t been checked for standing water.",
            next_step="Look underneath the inner pot before deciding whether to water.",
            source=GENERAL_WATERING_SOURCE, question="standing_water",
        )
    return None


def assess_watering(
    observation: CheckupObservation, plant_id: UUID4, saved_drainage: DRAINAGE,
    source: str | None, reported_at: datetime,
) -> AssessmentResult:
    result = validate_watering(observation, saved_drainage, source)
    if result is None:
        result = AssessmentResult(
            code="WATER_IF_APPROPRIATE", headline="The mix is ready for watering",
            explanation="You reported dry mix at the recommended depth, with drainage and no standing water.",
            next_step="If the mix still feels dry, water thoroughly and let the excess drain.",
            source=source,
        )
    result.valid_until = reported_at + CHECKUP_MAX_AGE
    result.evidence = [
        Evidence(
            category="OWNER_OBSERVED", field=field, value=value, plant_id=plant_id,
            observed_at=reported_at, method="Garden Checkup",
            limitations="Qualitative report from the owner.",
        )
        for field, value in observation.model_dump().items()
        if field in CheckupObservation.model_fields and value != "unknown"
    ]
    if saved_drainage != "unknown":
        result.evidence.append(Evidence(
            category="HISTORICAL_RECORD", field="saved_drainage",
            value=saved_drainage, plant_id=plant_id, method="Saved plant setup",
        ))
    if result.source:
        result.evidence.append(Evidence(
            category="SOURCE_VERIFIED", field="watering_guide",
            value=result.source, plant_id=plant_id,
        ))
    return result
