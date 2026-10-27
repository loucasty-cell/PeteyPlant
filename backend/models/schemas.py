"""Strict Pydantic v2 models for Petey Plant."""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


class Species(BaseModel):
    scientific_name: str
    common_name: str
    family: str
    archetype_rig_id: str
    crop_coeff_k: float = Field(ge=0, le=5)
    min_soil_moisture_pct: float = Field(ge=0, le=100)
    max_soil_moisture_pct: float = Field(ge=0, le=100)
    ideal_vpd_min_kpa: float = Field(ge=0)
    ideal_vpd_max_kpa: float = Field(ge=0)
    min_lux: float = Field(ge=0)
    optimal_lux: float = Field(ge=0)
    soil_ph_range: List[float] = Field(min_length=2, max_length=2)
    pet_toxicity: bool
    common_pathogens: List[str] = Field(default_factory=list)
    # --- Botanical honesty fields (added by the botanical audit) ---
    # common_pathogens is retained under its historic name because code
    # reads it (rag_engine.care_chunk); per the audit it actually lists
    # "common pests & diseases (unverified per species)" — pests and
    # diseases are mixed in the values, and the per-species entries are
    # unverified. Do not present them as sourced facts.
    # toxicity_note / toxicity_confidence qualify the bare pet_toxicity
    # bool: a False must never be read as a safety guarantee where the
    # note says otherwise (mescaline, disputed, mild-GI, unverified).
    toxicity_note: str = ""
    toxicity_confidence: str = "unverified"
    # toxicity_status is the user-facing safety verdict. "verified_toxic"
    # / "verified_safe" only when a source confirms it for this species;
    # "unverified" means: do NOT assume safe (see scope-3 merge rules).
    toxicity_status: str = "unverified"
    cultivar: str = ""
    notes: str = ""
    # --- Verified qualitative data block (scope-3 merge) ---
    # These fields carry source-verified QUALITATIVE guidance from
    # verified_species.json. They never replace the numeric model
    # parameters above, which remain approximate game-model parameters.
    # Any field that was UNVERIFIED in the source is left as None here
    # (never filled with a plausible value).
    verified_common_names: Optional[List[str]] = None
    verified_light: Optional[str] = None
    verified_watering: Optional[str] = None
    verified_soil_moisture: Optional[str] = None
    verified_humidity: Optional[str] = None
    verified_temperature: Optional[str] = None
    verified_pests_diseases: Optional[List[str]] = None
    verified_family: Optional[str] = None
    verification_sources: Dict[str, str] = Field(default_factory=dict)
    verification_notes: str = ""
    verification_status: Dict[str, str] = Field(default_factory=dict)
    # --- Botanical engine parameters (petey_muse_botanical_engine v2.4.0) ---
    # These are MODEL PARAMETERS from the engine's 10-node knowledge graph,
    # NOT field-verified care facts. They sit alongside — never overwriting —
    # the verified_* block above, and they never fill a UNVERIFIED field.
    # Records without an engine node keep every field at its empty default.
    engine_taxon_code: str = ""
    engine_plantnet_species_id: int = 0
    engine_care_cluster_id: str = ""
    engine_photosynthetic_pathway: str = ""
    engine_life_form: str = ""
    engine_root_architecture: str = ""
    engine_substrate: str = ""
    engine_toxicity_mechanism: str = ""
    engine_photobiology: Dict[str, float] = Field(default_factory=dict)
    engine_thermodynamics: Dict[str, float] = Field(default_factory=dict)
    engine_hydraulics: Dict[str, object] = Field(default_factory=dict)
    engine_npk_ratio: List[int] = Field(default_factory=list)
    engine_source: str = ""
    engine_notes: str = ""

    @model_validator(mode="after")
    def _check_ranges(self):
        if self.min_soil_moisture_pct > self.max_soil_moisture_pct:
            raise ValueError("min_soil_moisture_pct must be <= max_soil_moisture_pct")
        if self.ideal_vpd_min_kpa > self.ideal_vpd_max_kpa:
            raise ValueError("ideal_vpd_min_kpa must be <= ideal_vpd_max_kpa")
        if len(self.soil_ph_range) == 2 and self.soil_ph_range[0] > self.soil_ph_range[1]:
            raise ValueError("soil_ph_range must be ascending")
        return self


class Quest(BaseModel):
    id: str
    title: str
    description: str
    xp_reward: int = Field(ge=0)
    completed: bool = False


class HistoryEntry(BaseModel):
    date_iso: str
    moisture_pct: float
    vpd_kpa: float
    temp_c: float
    rh_pct: float
    lux: float
    watered: bool


class PlantState(BaseModel):
    id: str
    name: str
    species_common_name: str
    species_scientific_name: str
    family: str
    archetype_rig_id: str
    pot_material: str
    pot_type: str
    hp: int = Field(ge=0, le=100)
    xp: int = Field(ge=0)
    level: int = Field(ge=1)
    streak_days: int = Field(ge=0)
    mulch_shields: int = Field(ge=0)
    moisture_pct: float = Field(ge=0, le=100)
    vpd_kpa: float = Field(ge=0)
    lux: float = Field(ge=0)
    watering_locked: bool = False
    lock_reason: Optional[str] = None
    next_water_iso: str
    mood: str
    expression: str = ""
    quiz_correct_count: int = Field(default=0, ge=0)
    droop_angle_deg: float
    particle_effect: str
    quests: List[Quest] = Field(default_factory=list)
    history: List[HistoryEntry] = Field(default_factory=list)
    # Once-per-day watering guard + triage-interval reconciliation.
    last_watered_date: Optional[str] = None
    watering_interval_days: int = Field(default=3, ge=1, le=30)
    # Healthy particle effect to restore on recovery from a neglect
    # state (see main._refresh_expression). Defaults to the seeded
    # particle_effect when not given explicitly.
    base_particle_effect: str = ""

    @model_validator(mode="after")
    def _default_expression_to_mood(self):
        # Expression defaults to mood when no neglect state applies.
        if not self.expression:
            self.expression = self.mood
        if not self.base_particle_effect:
            self.base_particle_effect = self.particle_effect
        # Sticky level: level never regresses below 1 + xp // 200, but
        # may be higher (shield spending must not demote a player).
        if self.level < 1 + self.xp // 200:
            raise ValueError("level is inconsistent with xp (level < 1 + xp // 200)")
        return self


class GoldenPlantRecord(BaseModel):
    """Golden record produced by the data pipeline (see data_pipeline/).

    All care-metric fields are optional/nullable so that imputation is
    representable: a missing metric is None until the extractor fills it
    from a genus/biome default and names it in imputed_fields.
    """

    scientific_name: str
    accepted_name: str = ""
    synonyms: List[str] = Field(default_factory=list)
    family: Optional[str] = None
    genus: Optional[str] = None
    native_biome_koppen: Optional[str] = None
    archetype_rig_id: str = ""
    min_soil_moisture_pct: Optional[float] = None
    max_soil_moisture_pct: Optional[float] = None
    ideal_vpd_min_kpa: Optional[float] = None
    ideal_vpd_max_kpa: Optional[float] = None
    min_lux: Optional[float] = None
    optimal_lux: Optional[float] = None
    soil_ph_range: Optional[List[float]] = None
    pet_toxicity: bool = False
    common_pathogens: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    confidence: float = Field(default=1.0, ge=0, le=1)
    imputed_fields: List[str] = Field(default_factory=list)


class TriageRequest(BaseModel):
    plant_id: str
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    pot_material: Optional[str] = None
    ac_on: bool = False
    symptoms: Optional[List[str]] = None


class AgentTraceStep(BaseModel):
    thought: str
    tool_name: str
    tool_args: dict
    tool_observation: str
    latency_ms: int
    muse_model_id: str
    # REA-style evidence fields (optional so legacy payloads still validate).
    evidence_id: str = ""
    normalized_observation: dict = Field(default_factory=dict)
    raw_observation: Optional[dict] = None
    limitations: List[str] = Field(default_factory=list)
    coverage: dict = Field(default_factory=dict)
    analysis_profile: dict = Field(default_factory=dict)


class TriageResponse(BaseModel):
    plant_id: str
    muse_model_id: str
    summary: str
    agent_trace: List[AgentTraceStep]
    actions: dict
    telemetry: dict


class WaterResponse(BaseModel):
    plant_id: str
    watered: bool
    moisture_pct: float
    message: str
    locked: bool


class SitterResponse(BaseModel):
    plant_id: str
    sitter_token: str
    quest_checklist: List[str]
    xp_reward: int
    instructions: str


class SitterViewResponse(BaseModel):
    plant_id: str
    plant_name: str
    mood: str
    expression: str
    watering_locked: bool
    instructions: str
    quest_checklist: List[str]
    xp_reward: int
    sitter_xp: int


class SitterWaterResponse(BaseModel):
    plant_id: str
    watered: bool
    locked: bool
    sitter_xp_awarded: int
    message: str
    moisture_pct: float


class QuizAnswerRequest(BaseModel):
    quiz_id: str
    plant_id: str
    selected_index: int
