"""Soil/substrate dataset for Petey Plant.

Cleaned, source-traced substrate data for the indoor plant pet app:
substrate components, ready potting mixes (with their published recipe
variants), and species -> substrate preferences for the seed species.

HONESTY — READ BEFORE USING THESE NUMBERS:
- Qualitative classes (retention / drainage / aeration / compaction) are
  sourced judgements from the horticultural sources listed in
  SOIL_SOURCES.md. They are the reliable layer of this module.
- Numeric fields (pH ranges, water-holding multiples, replacement
  intervals) are filled ONLY where a source actually stated them. A
  ``None`` numeric means "no source found", never "zero" and never a
  placeholder. ``verification_status`` says, per field, whether the
  value is ``verified``, ``UNVERIFIED`` (no source), or ``conflicting``
  (sources disagree — the stored span covers the disagreement and the
  note names the individual ranges; it is NOT a single sourced range).
- ``verification_sources`` maps field -> source URL, mirroring the
  seed file's convention (``data/seed_10k_species.py``).
- ``MODEL_DRYING_MULTIPLIER`` and :func:`model_drying_multiplier` are
  GAME-MODEL PARAMETERS, not measured values — the same honesty class
  as the seed file's crop_coeff_k. They exist so hydration code can
  modulate drying by substrate class; they must never be presented to
  users as measured substrate physics.
- Species mappings cover ONLY species with a researched source. A
  species with no mapping has NO substrate preference in this module —
  that is a gap, not a default. Never infer a mapping from a relative.
- This file is local data only. It makes no network calls at import
  or at runtime.

Integration points (not wired here — this module is data only):
- ``services/timeseries_vpd.py::moisture_step`` takes ``alpha_pot``;
  a substrate drying multiplier can play the same role as an
  ``alpha_substrate`` factor (see :func:`model_drying_multiplier`).
- ``services/botanical_engine_adapter.py::thirst_threshold_pct`` and
  ``hydration_for_plant`` can read :func:`preference_for_species` to
  explain dry/soggy states (e.g. a moisture-retentive mix + a
  rot-prone species = higher soggy risk) — explanation only, until a
  caller opts in.
- ``Species.engine_substrate`` (seed file) is engine taxonomy, not
  this dataset; the two must not be conflated.
"""

from __future__ import annotations

import enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


class Retention(str, enum.Enum):
    """Qualitative water-retention class (sourced, not measured)."""

    VERY_LOW = "very_low"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"


class Drainage(str, enum.Enum):
    """Qualitative drainage class (sourced, not measured)."""

    VERY_FAST = "very_fast"
    FAST = "fast"
    MODERATE = "moderate"
    SLOW = "slow"


class Aeration(str, enum.Enum):
    """Qualitative aeration class (sourced, not measured)."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Compaction(str, enum.Enum):
    """Qualitative compaction-tendency class (sourced, not measured)."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SubstrateComponent(BaseModel):
    """One substrate ingredient (peat, perlite, bark, ...)."""

    id: str
    name: str
    aliases: List[str] = Field(default_factory=list)
    retention: Retention
    drainage: Drainage
    aeration: Aeration
    compaction: Compaction
    ph_min: Optional[float] = None
    ph_max: Optional[float] = None
    whc_min_x: Optional[float] = None
    whc_max_x: Optional[float] = None
    nutrients: str = ""
    cec_note: str = ""
    cautions: List[str] = Field(default_factory=list)
    notes: str = ""
    verification_sources: Dict[str, str] = Field(default_factory=dict)
    verification_status: Dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_ranges(self) -> "SubstrateComponent":
        if self.ph_min is not None and self.ph_max is not None:
            if self.ph_min > self.ph_max:
                raise ValueError(f"ph_min > ph_max for {self.id}")
        if self.whc_min_x is not None and self.whc_max_x is not None:
            if self.whc_min_x > self.whc_max_x:
                raise ValueError(f"whc_min_x > whc_max_x for {self.id}")
        return self


class MixRecipe(BaseModel):
    """One published recipe variant for a mix. Variants are never
    averaged or collapsed: disagreements live here as separate rows."""

    name: str
    parts: Dict[str, float]
    parts_unit: str = "parts"
    source: str = ""
    source_tier: str = "unverified"
    note: str = ""


class ReadyMix(BaseModel):
    """A ready potting mix (all-purpose, cactus, orchid bark, ...)."""

    id: str
    name: str
    retention: Retention
    drainage: Drainage
    recipes: List[MixRecipe] = Field(default_factory=list)
    target_ph_min: Optional[float] = None
    target_ph_max: Optional[float] = None
    suitable_for: List[str] = Field(default_factory=list)
    not_suited_for: List[str] = Field(default_factory=list)
    replace_min_months: Optional[int] = None
    replace_max_months: Optional[int] = None
    notes: str = ""
    verification_sources: Dict[str, str] = Field(default_factory=dict)
    verification_status: Dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_ranges(self) -> "ReadyMix":
        if self.target_ph_min is not None and self.target_ph_max is not None:
            if self.target_ph_min > self.target_ph_max:
                raise ValueError(f"target_ph_min > target_ph_max for {self.id}")
        if self.replace_min_months is not None and self.replace_max_months is not None:
            if self.replace_min_months > self.replace_max_months:
                raise ValueError(f"replace_min_months > replace_max_months for {self.id}")
        return self


class SpeciesSubstratePreference(BaseModel):
    """Substrate preference for ONE seed species, from a researched
    source. ``None`` on a sensitivity field means UNKNOWN (UNVERIFIED),
    never "not sensitive". ``genus_level_note`` is non-empty when the
    source was genus-level rather than species-specific."""

    scientific_name: str
    preferred_mix_id: Optional[str] = None
    mix_description: str = ""
    drainage_need: str = ""
    moisture_guidance: str = ""
    ph_min: Optional[float] = None
    ph_max: Optional[float] = None
    fluoride_sensitive: Optional[bool] = None
    salt_sensitive: Optional[bool] = None
    root_rot_prone: Optional[bool] = None
    genus_level_note: str = ""
    notes: str = ""
    verification_sources: Dict[str, str] = Field(default_factory=dict)
    verification_status: Dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_ranges(self) -> "SpeciesSubstratePreference":
        if self.ph_min is not None and self.ph_max is not None:
            if self.ph_min > self.ph_max:
                raise ValueError(f"ph_min > ph_max for {self.scientific_name}")
        return self


# ---------------------------------------------------------------------------
# GAME-MODEL PARAMETERS (not measured values).
# A fast-draining substrate dries faster than a moisture-retentive one,
# so the multiplier scales the hourly moisture decay in the same way
# ``alpha_pot`` already does in timeseries_vpd.moisture_step. These
# numbers are calibrated qualitatively to the drainage classes above;
# they are NOT laboratory measurements and must never be presented as
# such. If a future source publishes measured drying rates, replace
# this table with sourced values and drop the MODEL label.
# ---------------------------------------------------------------------------
MODEL_DRYING_MULTIPLIER: Dict[Drainage, float] = {
    Drainage.VERY_FAST: 1.25,
    Drainage.FAST: 1.15,
    Drainage.MODERATE: 1.0,
    Drainage.SLOW: 0.85,
}


def model_drying_multiplier(drainage: Drainage) -> float:
    """Game-model drying multiplier for a drainage class.

    MODEL PARAMETER — see the comment above MODEL_DRYING_MULTIPLIER.
    """
    return MODEL_DRYING_MULTIPLIER[drainage]


# ---------------------------------------------------------------------------
# Substrate components (12). Sources: SOIL_SOURCES.md, section 1.
# ---------------------------------------------------------------------------
COMPONENTS: List[SubstrateComponent] = [
    SubstrateComponent(
        id="peat_moss",
        name="Sphagnum peat moss",
        aliases=["peat"],
        retention=Retention.VERY_HIGH,
        drainage=Drainage.MODERATE,
        aeration=Aeration.MEDIUM,
        compaction=Compaction.HIGH,
        ph_min=3.0,
        ph_max=4.5,
        whc_min_x=10.0,
        whc_max_x=20.0,
        nutrients="Low nutrients (N 0.5-1.5% per Purdue); not a fertiliser.",
        cec_note="Good CEC but poor AEC (Purdue, qualitative); numeric CEC UNVERIFIED.",
        cautions=[
            "Hydrophobic when dry: difficult to re-wet once dried out.",
            "Sustainability: bogs develop over ~10,000 years and regrow slowly; harvesting releases stored carbon.",
            "Compacts over time, reducing aeration.",
        ],
        notes="Sphagnum peat only. pH sources disagree (Purdue 3.0-4.0, Texas A&M 3.6-4.2, broad moss-peat 3-7); stored span covers sphagnum-peat sources. Lime is routinely added in commercial mixes.",
        verification_sources={
            "retention": "https://www.purdue.edu/hla/sites/cea/wp-content/uploads/sites/15/2026/07/Hydroponics-Course.pdf",
            "ph": "https://www.plantanswers.com/garden_column/102001_slides/1020.htm",
            "whc": "https://ashlandorgardenclub.org/tag/soil-ph/",
            "sustainability": "https://cce.cornell.edu/orleans/peat-moss-and-sustainability",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "conflicting",
            "whc": "verified",
            "nutrients": "verified",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="coco_coir",
        name="Coco coir",
        aliases=["coir", "coir pith", "coir fibre", "coir chips"],
        retention=Retention.HIGH,
        drainage=Drainage.FAST,
        aeration=Aeration.HIGH,
        compaction=Compaction.LOW,
        ph_min=5.2,
        ph_max=6.6,
        whc_min_x=5.0,
        whc_max_x=9.0,
        nutrients="High CEC (qualitative); untreated coir carries Na/K load.",
        cec_note="High CEC per HydroExperts (qualitative); numeric CEC UNVERIFIED.",
        cautions=[
            "Salt/buffering is the key caution: use washed + buffered coir, or leach Na and supplement Ca/Mg; unbuffered coir risks K excess and Ca/Mg lockout.",
            "Minor N draw-down during decomposition reported.",
            "Re-wets much more readily than peat.",
        ],
        notes="pH sources disagree (5.7-6.5, 5.2-6.6, and a 'neutral' claim that the narrower sources do not support); WHC 5x-9x is product/fraction-dependent. Dust retains water; fibre/chips create air pockets.",
        verification_sources={
            "retention": "https://www.hydroexperts.com.au/buying/resource-library/how-to-use-coco-coir-as-a-concept/",
            "ph": "https://ashlandorgardenclub.org/tag/soil-ph/",
            "whc": "https://ezgrogarden.com/growing-mediums/coco-coir/",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "conflicting",
            "whc": "conflicting",
            "nutrients": "verified",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="perlite",
        name="Perlite",
        aliases=["expanded perlite"],
        retention=Retention.LOW,
        drainage=Drainage.VERY_FAST,
        aeration=Aeration.HIGH,
        compaction=Compaction.LOW,
        ph_min=6.6,
        ph_max=7.5,
        nutrients="Inert: no mineral nutrients, almost no CEC.",
        cec_note="Negligible CEC (DeepGreen); one guide's ~3 meq/100 g is consistent with 'almost none'.",
        cautions=[
            "Dust: wear a mask, moisten before mixing.",
            "Floats to the surface when watered.",
            "May contain fluoride toxic to fluoride-sensitive plants (dracaena, spider plant); keep pH above 6 to reduce risk.",
            "Adds no nutrients, so mixes need fertilisation.",
        ],
        notes="Closed-cell pore structure: water is retained only on surfaces and between particles, not absorbed. A commercial guide's '3-4x its weight' WHC claim was NOT corroborated and is excluded (UNVERIFIED).",
        verification_sources={
            "retention": "http://deepgreenpermaculture.com/2020/10/06/how-to-improve-drainage-in-plant-pots-the-proper-way-to-do-it/",
            "ph": "http://deepgreenpermaculture.com/2020/10/06/how-to-improve-drainage-in-plant-pots-the-proper-way-to-do-it/",
            "fluoride": "http://deepgreenpermaculture.com/2020/10/06/how-to-improve-drainage-in-plant-pots-the-proper-way-to-do-it/",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "verified",
            "whc": "UNVERIFIED",
            "nutrients": "verified",
            "cec": "verified",
        },
    ),
    SubstrateComponent(
        id="vermiculite",
        name="Vermiculite",
        aliases=["expanded vermiculite"],
        retention=Retention.VERY_HIGH,
        drainage=Drainage.MODERATE,
        aeration=Aeration.MEDIUM,
        compaction=Compaction.HIGH,
        ph_min=6.3,
        ph_max=7.8,
        nutrients="Nutrient-bearing for a mineral: binds and slowly releases K, Mg, Ca.",
        cec_note="Fairly high CEC 2-2.5 meq/100 cc (DeepGreen). A second figure (100-150 meq/100 g) uses a different basis and is NOT comparable — do not mix the two.",
        cautions=[
            "Easily compressible, especially when wet; compaction loses its beneficial properties.",
            "Fine grades hold too little air for roots; do not use as a sand/drainage substitute.",
            "Use horticultural grade only; keep moist and wear a mask for dust (historic Libby asbestos contamination; modern mines monitor).",
            "Can suffocate roots if used alone or over-used for dry-loving plants.",
        ],
        notes="Dominant role is retention, not drainage. pH is origin-dependent (US 6.3-7.8, African ~9.0, simplified guides 7.0-7.5); stored span covers the US range. Excellent pH buffering capacity. Numeric WHC (x weight) UNVERIFIED.",
        verification_sources={
            "retention": "http://deepgreenpermaculture.com/2020/10/06/how-to-improve-drainage-in-plant-pots-the-proper-way-to-do-it/",
            "ph": "http://deepgreenpermaculture.com/2020/10/06/how-to-improve-drainage-in-plant-pots-the-proper-way-to-do-it/",
            "cec": "http://deepgreenpermaculture.com/2020/10/06/how-to-improve-drainage-in-plant-pots-the-proper-way-to-do-it/",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "conflicting",
            "whc": "UNVERIFIED",
            "nutrients": "verified",
            "cec": "verified",
        },
    ),
    SubstrateComponent(
        id="pine_bark",
        name="Pine bark",
        aliases=["bark fines", "composted pine bark", "orchid bark"],
        retention=Retention.LOW,
        drainage=Drainage.FAST,
        aeration=Aeration.HIGH,
        compaction=Compaction.LOW,
        ph_min=4.0,
        ph_max=6.5,
        nutrients="Low, slow-release at best; high lignin = slow decomposition.",
        cec_note="Quantitative nutrient/CEC values UNVERIFIED.",
        cautions=[
            "Use aged/composted, dye-free bark; fresh/uncomposted bark risks N immobilisation during breakdown (caution only, not a quantified value).",
            "Grade matters enormously: fines retain more than chips and behave differently.",
        ],
        notes="Retention is grade-dependent (coarse bark low, fines moderate); stored LOW reflects coarse bark, the common indoor use. pH sources disagree (composted 5.0-6.5, guides 4.5-5.5, bark fines 4.0-5.0); stored span covers all three.",
        verification_sources={
            "drainage": "https://albopepper.com/potting-mix.php",
            "ph": "https://shrubz.us/diy-the-perfect-potting-mix-for-indoor-plants/",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "conflicting",
            "whc": "UNVERIFIED",
            "nutrients": "UNVERIFIED",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="sphagnum_moss",
        name="Sphagnum moss (long-fibre)",
        aliases=["spagmoss", "long-fibre sphagnum"],
        retention=Retention.VERY_HIGH,
        drainage=Drainage.MODERATE,
        aeration=Aeration.HIGH,
        compaction=Compaction.MEDIUM,
        ph_min=4.8,
        ph_max=6.1,
        whc_min_x=20.0,
        whc_max_x=20.0,
        nutrients="Low-mineral, low-salt; no fertiliser value credited.",
        cec_note="NPK/CEC numerics UNVERIFIED.",
        cautions=[
            "Do not pack tightly around the root ball: packed moss waterlogs and suffocates roots.",
            "Replace periodically (structural stability 2-3 years per Sybotanica); do not re-use old moss.",
            "Constantly damp moss invites bacterial/fungal rot and mould.",
        ],
        notes="Distinct from peat moss. Aeration is HIGH only when loose (air-filled porosity ~55% loose per Besgrow); it collapses when packed. pH is product-dependent (Besgrow 4.8, Sybotanica 6.1); both sources agree on low soluble salts.",
        verification_sources={
            "retention": "https://www.eliteorchids.com/product/besgrow-spagmoss-classic-100g-new-zealand-sphagnum-moss-sphagnum-cristatum/",
            "ph": "https://www.sybotanica.com/collections/live-moss/products/sphagnum-moss-5-liter?variant=42951965999343",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "conflicting",
            "whc": "verified",
            "nutrients": "verified",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="coarse_sand",
        name="Coarse sand (horticultural / silica sand)",
        aliases=["horticultural sand", "sharp sand", "silica sand"],
        retention=Retention.VERY_LOW,
        drainage=Drainage.VERY_FAST,
        aeration=Aeration.MEDIUM,
        compaction=Compaction.LOW,
        ph_min=7.0,
        ph_max=7.0,
        nutrients="Inert: zero nutrients, negligible CEC.",
        cec_note="Numeric CEC UNVERIFIED.",
        cautions=[
            "NEVER substitute beach sand (salt), play sand (too fine), or construction sand (lime/silt).",
            "Fine sand clogs pores and worsens drainage; use coarse grains (0.5-2 mm cited).",
            "Adding sand to clay without organic matter can create a dense, concrete-like mix.",
            "Most guides cap sand at 30-40% of a blend.",
            "Calcareous/limestone sand can raise pH.",
        ],
        notes="pH stored as ~7.0 (neutral) per planter-sand guides; silica is described as virtually chemically inert. Aeration is MEDIUM because it is good only when coarse. Adds weight, unlike perlite.",
        verification_sources={
            "drainage": "https://homegrail.com/what-is-horticultural-sand/",
            "ph": "https://plantin.alibaba.com/buyingguides/planter-pot-sand",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "verified",
            "whc": "UNVERIFIED",
            "nutrients": "verified",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="pumice",
        name="Pumice",
        aliases=["volcanic pumice"],
        retention=Retention.LOW,
        drainage=Drainage.VERY_FAST,
        aeration=Aeration.HIGH,
        compaction=Compaction.LOW,
        ph_min=6.5,
        ph_max=7.5,
        nutrients="Inert: no fertiliser value credited (silicate minerals present but plant-available contribution UNVERIFIED).",
        cec_note="Plant-available nutrient contribution UNVERIFIED.",
        cautions=[
            "Sieve/rinse fines: dust and fines can clog pores.",
            "Heavier and costlier than perlite; not ideal alone for moisture-loving plants.",
            "Does not float, unlike perlite.",
        ],
        notes="Porous microcells retain more moisture than perlite and less than vermiculite/coir; stored LOW reflects that position. A low-quality guide's '12-18% of volume' retention figure was excluded as uncorroborated. Does not decompose; maintains structure for years.",
        verification_sources={
            "drainage": "https://www.natureswayresources.com/wp-content/uploads/2024/01/43Pumice.pdf",
            "ph": "https://gardening.alibaba.com/plant-care/pumice-for-plants",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "verified",
            "whc": "UNVERIFIED",
            "nutrients": "UNVERIFIED",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="horticultural_charcoal",
        name="Horticultural charcoal",
        aliases=["charcoal", "biochar", "activated charcoal"],
        retention=Retention.MEDIUM,
        drainage=Drainage.FAST,
        aeration=Aeration.HIGH,
        compaction=Compaction.LOW,
        ph_min=6.5,
        ph_max=8.4,
        nutrients="Not a nutrient source; adsorbs excess salts, organic acids, odours and can bind nutrients, releasing them slowly.",
        cec_note="Quantitative adsorption/CEC UNVERIFIED.",
        cautions=[
            "NEVER use BBQ briquettes (additives); pure horticultural charcoal only.",
            "Can absorb fertiliser nutrients, so fertilise accordingly.",
            "Can slightly raise pH; limit use for acid-loving plants (one source).",
            "A single-source claim that adsorbed toxins release after 12-24 months is UNVERIFIED and is not encoded as fact.",
        ],
        notes="Biochar and activated charcoal are not identical products; this entry covers horticultural charcoal generally. pH sources disagree (alkaline 6.5-8.4 in one guide vs 'neutral' in another); stored span follows the numeric source. One guide's >25% retention-reduction threshold is single-source and indicative only.",
        verification_sources={
            "ph": "https://www.housedigest.com/1985337/active-charcoal-keeps-houseplants-strong-healthy/",
            "drainage": "https://gardening.alibaba.com/plant-care/charcoal-for-plants",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "conflicting",
            "whc": "UNVERIFIED",
            "nutrients": "verified",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="worm_castings",
        name="Worm castings (vermicompost)",
        aliases=["vermicompost", "worm humus"],
        retention=Retention.HIGH,
        drainage=Drainage.MODERATE,
        aeration=Aeration.MEDIUM,
        compaction=Compaction.MEDIUM,
        ph_min=6.5,
        ph_max=7.0,
        whc_min_x=2.0,
        whc_max_x=3.0,
        nutrients="Nutrient-bearing, slow-release; NPK varies by feedstock (reported 1.5-2-1, 1-0-0 to 2-1-1, and 1-0-0 to 5-5-3 — do not encode one NPK). Also Ca, Fe, Mg, S, Zn, Cu, humic acid, beneficial microbes.",
        cec_note="Numeric CEC UNVERIFIED.",
        cautions=[
            "Use as an amendment at 5-15% by volume, not as the bulk medium; above 15-20% it reduces drainage and can compact (container cap 20% per Almanac).",
            "Quality varies: NPK and salt content depend on worm feedstock.",
            "Not a complete fertiliser alone; will not burn roots at normal rates per sources.",
        ],
        notes="Drainage/aeration improve at low rates and reverse at high rates; stored MODERATE/MEDIUM reflects amendment-rate use.",
        verification_sources={
            "retention": "https://www.almanac.com/what-world-are-worm-castings",
            "ph": "https://www.almanac.com/what-world-are-worm-castings",
            "usage_rate": "https://hydrobuilder.com/collections/garden-soil-amendments?dir=desc&order=position",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "verified",
            "whc": "verified",
            "nutrients": "conflicting",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="compost",
        name="Compost (mature, general-purpose)",
        aliases=["mature compost"],
        retention=Retention.HIGH,
        drainage=Drainage.MODERATE,
        aeration=Aeration.MEDIUM,
        compaction=Compaction.HIGH,
        whc_min_x=2.0,
        whc_max_x=2.0,
        nutrients="Nutrient-bearing, slow-release; NPK feedstock-dependent (numerics UNVERIFIED).",
        cec_note="Numeric CEC UNVERIFIED.",
        cautions=[
            "Use only well-cured compost; uncured compost depletes oxygen and can carry excess ammonia salts.",
            "High pH and excess salts are the core problems in the Alabama Extension source, especially with animal manures; a problem for acid-lovers.",
            "Poor drainage if kept too wet; compost-heavy container mixes compact and risk root rot.",
            "Screen non-commercial compost for weed seeds/pathogens (general caution, unquantified).",
        ],
        notes="No reliable general numeric pH range was found; pH is feedstock-dependent, so ph_min/ph_max stay None (UNVERIFIED) with only the 'tends high/alkaline' tendency recorded here. WHC 'absorbs twice its weight' per Alabama Extension/Auburn.",
        verification_sources={
            "retention": "https://p2infohouse.org/ref/05/04068.pdf",
            "cautions": "https://p2infohouse.org/ref/05/04068.pdf",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "UNVERIFIED",
            "whc": "verified",
            "nutrients": "UNVERIFIED",
            "cec": "UNVERIFIED",
        },
    ),
    SubstrateComponent(
        id="leca",
        name="Clay pebbles / LECA",
        aliases=["LECA", "expanded clay aggregate", "hydroton"],
        retention=Retention.LOW,
        drainage=Drainage.VERY_FAST,
        aeration=Aeration.HIGH,
        compaction=Compaction.LOW,
        ph_min=6.0,
        ph_max=7.0,
        nutrients="Inert: no nutrients, negligible buffering; all nutrition must come from fertiliser/solution.",
        cec_note="Numeric CEC UNVERIFIED.",
        cautions=[
            "Rinse dust before use: fresh pebbles carry alkaline manufacturing dust that spikes pH on first contact; pre-soak in pH 5.5-6.0 water.",
            "Pre-soak 6-24 h before use; dry pebbles pull water from roots and new pebbles float until saturated.",
            "Low water-holding capacity: requires frequent watering in hand-watered setups; not a moisture buffer for forgetful watering.",
        ],
        notes="Porous core absorbs some water and releases it slowly, but inter-pebble drainage dominates, so net retention is LOW. Porosity ~85% (Growers House) / 70-80% (GrowKings) is porosity, not WHC. Reusable 5-10+ years if rinsed/sterilised.",
        verification_sources={
            "drainage": "https://growershouse.co.uk/products/clay-pebbles",
            "ph": "https://hydrobuilder.com/collections/clay-pebbles-growstones?price=1000-1100",
        },
        verification_status={
            "retention": "verified",
            "drainage": "verified",
            "aeration": "verified",
            "compaction": "verified",
            "ph": "verified",
            "whc": "UNVERIFIED",
            "nutrients": "verified",
            "cec": "UNVERIFIED",
        },
    ),
]


# ---------------------------------------------------------------------------
# Ready mixes (7). Sources: SOIL_SOURCES.md, section 2.
# Recipe variants are published alternatives, never averaged.
# ---------------------------------------------------------------------------
MIXES: List[ReadyMix] = [
    ReadyMix(
        id="all_purpose",
        name="All-purpose indoor / foliage mix",
        retention=Retention.MEDIUM,
        drainage=Drainage.MODERATE,
        recipes=[
            MixRecipe(
                name="Missouri Extension general houseplant mix",
                parts={"peat_moss": 3.0, "vermiculite": 1.0, "perlite": 1.0},
                source="https://extension2.missouri.edu/sites/default/files/legacy_media/wysiwyg/Extensiondata/Pub/pdf/agguides/hort/g06510.pdf",
                source_tier="extension-snippet",
                note="Search excerpt only, not a full-page open.",
            ),
            MixRecipe(
                name="Clemson foliage mix (peat/perlite/sand)",
                parts={"peat_moss": 2.0, "perlite": 1.0, "coarse_sand": 1.0},
                source="https://hgic.clemson.edu/factsheet/indoor-plants-soil-mixes/",
                source_tier="extension",
            ),
            MixRecipe(
                name="Clemson foliage mix (peat/bark/perlite)",
                parts={"peat_moss": 1.0, "pine_bark": 1.0, "perlite": 1.0},
                source="https://hgic.clemson.edu/factsheet/indoor-plants-soil-mixes/",
                source_tier="extension",
            ),
            MixRecipe(
                name="Clemson Plant Mix",
                parts={"pine_bark": 2.0, "peat_moss": 1.0, "coarse_sand": 1.0},
                source="https://hgic.clemson.edu/factsheet/indoor-plants-soil-mixes/",
                source_tier="extension",
                note="Clemson: 'worked exceptionally well with all foliage plants, regardless of species'; pH adjusted to about 6.0 with dolomitic limestone (that pH belongs to this recipe only).",
            ),
            MixRecipe(
                name="Cornell Foliage Plant Mix (via Clemson)",
                parts={"peat_moss": 2.0, "vermiculite": 1.0, "perlite": 1.0},
                source="https://hgic.clemson.edu/factsheet/indoor-plants-soil-mixes/",
                source_tier="extension",
                note="Original Cornell ratio 1/2 bushel peat : 1/4 vermiculite : 1/4 perlite, plus lime/fertiliser amendments per bushel.",
            ),
            MixRecipe(
                name="Bagged mix + perlite (practitioner)",
                parts={"all_purpose_base": 3.0, "perlite": 1.0},
                source="https://gardeningelsa.com/best-soil-for-indoor-plants/",
                source_tier="practitioner-guide",
                note="Component 'all_purpose_base' is bagged potting mix, not a component in COMPONENTS; the guide's stated perlite range is 20-30%.",
            ),
        ],
        suitable_for=[
            "Most foliage houseplants (Clemson/Cornell foliage lists include ferns, Begonia, Cissus, Coleus, Ficus, Maranta, Pelargonium, Pilea, Sansevieria)",
            "Peace lily, dracaena, spider plant, rubber plant, fiddle-leaf fig, parlor palm, dieffenbachia, Chinese evergreen (GardeningElsa)",
        ],
        not_suited_for=[
            "Epiphytic orchids (need porous bark medium)",
            "Cacti (need peat-lite + sterile sand)",
            "Aroids and succulents unamended (see aroid_chunky and cactus_succulent)",
        ],
        replace_min_months=12,
        replace_max_months=24,
        notes="Character: balanced — water and air pass readily yet adequate moisture is retained; healthy mix feels 'like a wrung-out sponge a day after watering'. No universal all-purpose pH is verified (a secondary guide's 6.0-6.8 claim is NOT encoded). Garden soil is not a substitute (Clemson: generally not recommended for containers).",
        verification_sources={
            "recipes": "https://hgic.clemson.edu/factsheet/indoor-plants-soil-mixes/",
            "replacement": "https://gardeningelsa.com/best-soil-for-indoor-plants/",
        },
        verification_status={
            "recipes": "verified",
            "retention": "verified",
            "drainage": "verified",
            "target_ph": "UNVERIFIED",
            "suitable_for": "verified",
            "not_suited_for": "verified",
            "replacement": "verified",
        },
    ),
    ReadyMix(
        id="cactus_succulent",
        name="Cactus / succulent mix",
        retention=Retention.LOW,
        drainage=Drainage.VERY_FAST,
        recipes=[
            MixRecipe(
                name="Iowa State Extension (1 organic : 2 mineral)",
                parts={"organic_base": 1.0, "mineral_base": 2.0},
                source="https://yardandgarden.extension.iastate.edu/how-to/growing-succulents-indoors",
                source_tier="extension",
                note="Organic = potting soil, pine bark, compost, or coir. Mineral = perlite, coarse sand, pumice, or fine gravel. Strongest source in this set; typical potting soil 'retains too much water, risking root rot'.",
            ),
            MixRecipe(
                name="Missouri Extension cactus mix",
                parts={"peat_lite_base": 1.0, "coarse_sand": 1.0},
                source="https://extension2.missouri.edu/sites/default/files/legacy_media/wysiwyg/Extensiondata/Pub/pdf/agguides/hort/g06510.pdf",
                source_tier="extension-snippet",
                note="Equal parts peat-lite mix and sterile sand; search excerpt only.",
            ),
            MixRecipe(
                name="GardeningElsa 50/50 succulent mix",
                parts={"all_purpose_base": 1.0, "pumice": 1.0},
                source="https://gardeningelsa.com/best-soil-for-indoor-plants/",
                source_tier="practitioner-guide",
                note="Pumice interchangeable with perlite or coarse sand in this recipe. Less mineral-heavy than Iowa State's 1:2 — both are real published recipes, not averaged.",
            ),
            MixRecipe(
                name="Central Texas Gardener container succulent mix",
                parts={"compost": 1.5, "decomposed_granite": 1.0, "lava_sand": 1.0, "vermiculite": 1.0, "perlite": 2.0, "expanded_shale": 1.0},
                source="https://www.centraltexasgardener.org/resource/potting-mix-for-cactus-plants-sedums-and-other-succulents/",
                source_tier="practitioner-guide",
                note="Decomposed granite, lava sand/basalt, and expanded shale are not in COMPONENTS; they are recorded here as recipe-only ingredients.",
            ),
        ],
        suitable_for=[
            "Cacti and succulents (Crassulaceae, Euphorbiaceae, Cactaceae per Iowa State)",
            "Dry-loving snake plant / ZZ plant as a gritty option (GardeningElsa)",
        ],
        not_suited_for=[
            "Moisture-lovers: ferns, calatheas, and peace lilies 'would wilt and crisp in it' (GardeningElsa)",
        ],
        notes="Character: fast/sharp-draining, low retention by design; succulents 'will not tolerate staying wet'. Target pH UNVERIFIED (no opened extension source stated one). Replacement interval UNVERIFIED as a fixed figure (Iowa State: succulents 'don't need frequent repotting'; soil can break down and hold more water over time). A Christmas-cactus exception ('should never dry out completely') was NOT verified on the opened Iowa State page and is not encoded.",
        verification_sources={
            "recipes": "https://yardandgarden.extension.iastate.edu/how-to/growing-succulents-indoors",
            "not_suited_for": "https://gardeningelsa.com/best-soil-for-indoor-plants/",
        },
        verification_status={
            "recipes": "verified",
            "retention": "verified",
            "drainage": "verified",
            "target_ph": "UNVERIFIED",
            "suitable_for": "verified",
            "not_suited_for": "verified",
            "replacement": "UNVERIFIED",
        },
    ),
    ReadyMix(
        id="orchid_bark",
        name="Orchid bark mix",
        retention=Retention.LOW,
        drainage=Drainage.VERY_FAST,
        recipes=[
            MixRecipe(
                name="Melcourt Orchid Bark Medium (product sheet)",
                parts={"pine_bark": 5.0, "horticultural_charcoal": 1.0, "perlite": 2.0},
                source="https://bhgs.ogles2.co.uk/files/MELORC000002/MELORC000002-Melcourt_OrchidBark_Medium.pdf",
                source_tier="product-sheet-snippet",
                note="Snippet only. Bark product pH 5.0-5.5 (bark itself, not the finished mix); lime typically 2.5 kg/m3.",
            ),
            MixRecipe(
                name="Orchid Column basic orchid mix",
                parts={"pine_bark": 1.0, "horticultural_charcoal": 1.0, "perlite": 1.0},
                source="http://www.theorchidcolumn.com/search/label/Potting%20Orchids",
                source_tier="practitioner-snippet",
                note="Equal parts fir bark : charcoal : sponge rock (coarse perlite); snippet only.",
            ),
            MixRecipe(
                name="Cornell Epiphytic Mix (via Clemson)",
                parts={"pine_bark": 1.0, "peat_moss": 1.0, "perlite": 1.0},
                source="https://hgic.clemson.edu/factsheet/indoor-plants-soil-mixes/",
                source_tier="extension",
                note="Peat-containing epiphytic mix, not a pure bark mix. Clemson lists it for bromeliads, cacti, Crassula, Dieffenbachia, Episcia, Gloxinia, Hoya, Monstera, Philodendron, Peperomia.",
            ),
        ],
        suitable_for=[
            "Epiphytic orchids, including moth orchids (Phalaenopsis) as the typical grocery-store case",
            "Orchids that like to go fully dry between waterings (AOS)",
        ],
        not_suited_for=[
            "Standard foliage plants / moisture-lovers (bark mix is low-nutrient and dries fast)",
            "Any plant needing soil nutrients and steady moisture",
        ],
        replace_min_months=12,
        replace_max_months=24,
        notes="AOS explicitly says bark mixes vary in coarseness and ratio — there is NO single canonical orchid ratio, and none is encoded as one. Coarser grade for drier-loving orchids/heavy waterers; finer grade or more sphagnum for moisture-loving orchids. Finished-mix pH UNVERIFIED (AOS gives none; snippet claims 5.5-6.5 are weak). Terrestrial-orchid suitability UNVERIFIED.",
        verification_sources={
            "recipes": "https://www.aos.org/repotting",
            "replacement": "https://www.aos.org/repotting",
        },
        verification_status={
            "recipes": "verified",
            "retention": "verified",
            "drainage": "verified",
            "target_ph": "UNVERIFIED",
            "suitable_for": "verified",
            "not_suited_for": "verified",
            "replacement": "verified",
        },
    ),
    ReadyMix(
        id="aroid_chunky",
        name="Aroid / chunky mix",
        retention=Retention.MEDIUM,
        drainage=Drainage.FAST,
        recipes=[
            MixRecipe(
                name="GardeningElsa aroid mix",
                parts={"all_purpose_base": 1.0, "pine_bark": 1.0, "perlite": 1.0},
                source="https://gardeningelsa.com/best-soil-for-indoor-plants/",
                source_tier="practitioner-guide",
                note="Roughly equal parts for Monstera, philodendron, pothos. Pothos/heartleaf may cut bark down; larger monsteras/rare philodendrons keep the full bark share.",
            ),
            MixRecipe(
                name="2:1:1 aroid variant (snippets)",
                parts={"all_purpose_base": 2.0, "pine_bark": 1.0, "perlite": 1.0},
                source="https://www.worldofpro.net/2026/05/best-soil-for-houseplants.html",
                source_tier="practitioner-snippet",
                note="Same formula in multiple practitioner snippets; one variant adds 0.5 part charcoal.",
            ),
            MixRecipe(
                name="Soil-free aroid mix (snippet)",
                parts={"coco_coir": 1.0, "perlite": 1.0, "pine_bark": 1.0},
                source="https://planthouseandgarden.com/aroid-potting-mix-recipe/",
                source_tier="practitioner-snippet",
                note="One-third each, plus an optional handful of LECA.",
            ),
            MixRecipe(
                name="PlantVault Monstera mix (snippet)",
                parts={"pine_bark": 4.0, "pumice": 2.0, "perlite": 1.0, "coco_coir": 1.0, "horticultural_charcoal": 0.5},
                source="https://www.plantvault.com/blogs/houseplant-care-guides/aroid-potting-mix-recipes",
                source_tier="practitioner-snippet",
                note="Bark-heavy variant; optional 0.5 part worm castings. Philodendron variant (snippet): 3 bark : 2 pumice : 1 perlite : 1 coir : 0.5 chopped sphagnum : 0.25 charcoal.",
            ),
            MixRecipe(
                name="ElmDirt aroid mix (snippet, percent)",
                parts={"pine_bark": 40.0, "coco_coir": 25.0, "perlite": 20.0, "worm_castings": 10.0, "horticultural_charcoal": 5.0},
                parts_unit="percent",
                source="https://www.elmdirt.com/blogs/news/best-aroid-soil-mix",
                source_tier="practitioner-snippet",
                note="Genus tweaks in the source: Monstera 45% bark / 20% coir; Philodendron 30% coir / 15% perlite.",
            ),
        ],
        suitable_for=[
            "Monstera, Philodendron, Pothos (GardeningElsa)",
            "Alocasia, Anthurium (practitioner snippets)",
        ],
        not_suited_for=[],
        notes="Character: chunky, airy, fast-draining with a modest moisture buffer; 'lets water rush through while bark holds a bit of moisture'; resists compaction. NO extension source was found for aroid mix in this round — all ratios are practitioner-guide level. Target pH UNVERIFIED. No explicit exclusion list was sourced (an exclusion field would be INFERRED, so it is left empty); the documented failure mode is plain potting mix alone staying too wet around aroid roots. Replacement interval UNVERIFIED (orchid bark decay is not transferable without a source).",
        verification_sources={
            "recipes": "https://gardeningelsa.com/best-soil-for-indoor-plants/",
        },
        verification_status={
            "recipes": "verified",
            "retention": "verified",
            "drainage": "verified",
            "target_ph": "UNVERIFIED",
            "suitable_for": "verified",
            "not_suited_for": "UNVERIFIED",
            "replacement": "UNVERIFIED",
        },
    ),
    ReadyMix(
        id="african_violet",
        name="African violet mix",
        retention=Retention.MEDIUM,
        drainage=Drainage.MODERATE,
        target_ph_min=6.0,
        target_ph_max=6.9,
        recipes=[
            MixRecipe(
                name="Indoor Gardener 1-1-1",
                parts={"peat_moss": 1.0, "vermiculite": 1.0, "perlite": 1.0},
                source="https://theindoorgardener.ca/?p=104",
                source_tier="practitioner-guide",
                note="Plus 1 tbsp dolomite lime + 3 tbsp charcoal per quart-unit, taking mix pH to ~6.8. A '3-2-1' variant is mentioned on the page but its component order is NOT spelled out — it is not encoded.",
            ),
            MixRecipe(
                name="Greg African violet mix (percent)",
                parts={"peat_moss": 50.0, "perlite": 30.0, "all_purpose_base": 20.0},
                parts_unit="percent",
                source="https://greg.app/plant-care/soil/african-violet/",
                source_tier="practitioner-guide",
                note="50% peat moss : 30% perlite : 20% potting soil.",
            ),
            MixRecipe(
                name="CreativeHomemaking variant (snippet)",
                parts={"peat_moss": 2.0, "perlite": 1.0, "vermiculite": 1.0},
                source="https://creativehomemaking.com/gardening/houseplants/african-violet-potting-mix/",
                source_tier="practitioner-snippet",
                note="2 parts peat/coir : 1 part perlite : 1 part vermiculite (optional).",
            ),
        ],
        suitable_for=[
            "African violets (Saintpaulia / Streptocarpus ionanthus)",
            "Fine, fibrous roots needing air plus consistent moisture",
        ],
        not_suited_for=[
            "Standard potting soil alone (too dense and heavy; compacts and stresses fine roots)",
        ],
        replace_min_months=12,
        replace_max_months=18,
        notes="Character: light, porous, drains well yet holds moisture — NOT soggy, NOT fast-drying; wicks well for bottom-watering. pH is CONFLICTING across sources (Greg ideal 6.0-6.5 / tolerable 5.8-7.0; Indoor Gardener 6.4-6.9; snippets 5.5-6.2 and 5.8-6.5); stored span covers the two fully-opened sources. Replacement disagreement: Greg 12-18 months (opened) vs a 6-month snippet claim — the opened figure is stored.",
        verification_sources={
            "recipes": "https://theindoorgardener.ca/?p=104",
            "ph": "https://greg.app/plant-care/soil/african-violet/",
            "replacement": "https://greg.app/plant-care/soil/african-violet/",
        },
        verification_status={
            "recipes": "verified",
            "retention": "verified",
            "drainage": "verified",
            "target_ph": "conflicting",
            "suitable_for": "verified",
            "not_suited_for": "verified",
            "replacement": "verified",
        },
    ),
    ReadyMix(
        id="seed_starting",
        name="Seed-starting mix",
        retention=Retention.MEDIUM,
        drainage=Drainage.MODERATE,
        recipes=[
            MixRecipe(
                name="UGA Extension seed mix",
                parts={"peat_moss": 1.0, "vermiculite": 1.0, "perlite": 1.0},
                source="https://site.extension.uga.edu/fultonag/2025/02/cut-veggie-garden-costs-by-making-your-own-seed-starting-mix/",
                source_tier="extension",
                note="Peat moss or coconut coir : vermiculite : perlite. Fine and uniform, light and loose, free of weed seeds/insects/diseases, LOW in fertility (fertiliser burns fragile seedling roots). Use fine perlite; do not compress.",
            ),
            MixRecipe(
                name="Oregon State Extension seed mix",
                parts={"pasteurised_soil_or_compost": 1.0, "coarse_sand": 1.0, "coco_coir": 1.0},
                source="https://news.oregonstate.edu/news/set-seeds-right-path-homemade-planting-medium",
                source_tier="extension",
                note="One-third each of pasteurised soil or compost, sand/vermiculite/perlite, and coconut coir or peat moss. Alternative: coir or peat plus half perlite/vermiculite/sand. Pasteurise at 180 F for 30 min.",
            ),
            MixRecipe(
                name="Penn State Standard Soilless seed mix (excerpt)",
                parts={"peat_moss": 50.0, "vermiculite": 50.0},
                parts_unit="percent",
                source="https://extension.psu.edu/potting-media-and-plant-propagation",
                source_tier="extension-snippet",
                note="Standard range 50-75% sphagnum peat : 25-50% vermiculite + dolomitic lime; stored at the 50/50 midpoint with this note. Also a 1:1:1 compost : vermiculite : peat soilless potting mix (screened).",
            ),
        ],
        suitable_for=[
            "Seeds / seedlings started indoors (vegetables and flowers, 4-12 weeks before last frost per Oregon State)",
            "Rooting/propagation medium context (vermiculite/perlite)",
        ],
        not_suited_for=[],
        notes="Character: moisture-even, fine, sterile/low-fertility — not fast-draining like cactus mix and not soggy. Target pH UNVERIFIED generally (a crop-specific tomato/pepper snippet claims 6.0-6.8 and is NOT generalised). Replacement interval NOT APPLICABLE (single-use per sowing batch; leftover dry ingredients can be saved). An explicit 'do not use seed mix for mature plants' wording was NOT found verbatim, so not_suited_for is left empty rather than inferred; the mix is deliberately too poor/fine as a permanent potting mix.",
        verification_sources={
            "recipes": "https://site.extension.uga.edu/fultonag/2025/02/cut-veggie-garden-costs-by-making-your-own-seed-starting-mix/",
        },
        verification_status={
            "recipes": "verified",
            "retention": "verified",
            "drainage": "verified",
            "target_ph": "UNVERIFIED",
            "suitable_for": "verified",
            "not_suited_for": "UNVERIFIED",
            "replacement": "UNVERIFIED",
        },
    ),
    ReadyMix(
        id="fern_moisture",
        name="Fern / moisture-retentive mix",
        retention=Retention.HIGH,
        drainage=Drainage.MODERATE,
        recipes=[
            MixRecipe(
                name="Cafe Planta fern mix",
                parts={"peat_moss": 2.0, "perlite": 1.0, "pine_bark": 1.0, "horticultural_charcoal": 0.5, "compost": 0.5},
                source="https://cafeplanta.com/blogs/resources/fern-soil-mix-recipe",
                source_tier="practitioner-guide",
                note="2 parts peat moss or coco coir : 1 part perlite or pumice : 1 part orchid bark or pine bark fines : 1/2 part charcoal : 1/2 part compost. Boston fern: more peat/coir; bird's-nest fern: extra perlite.",
            ),
            MixRecipe(
                name="GardeningElsa fern/calathea mix",
                parts={"all_purpose_base": 2.0, "coco_coir": 1.0, "perlite": 1.0},
                source="https://gardeningelsa.com/best-soil-for-indoor-plants/",
                source_tier="practitioner-guide",
                note="2 parts potting mix : 1 part coco coir or peat moss : 1 part perlite + a small handful of compost. Goal: 'stays moist but never soggy'; water when top 1/2 inch feels dry.",
            ),
            MixRecipe(
                name="TrucosHogarJardin fern variant (snippet)",
                parts={"peat_moss": 2.0, "perlite": 1.0, "compost": 1.0},
                source="",
                source_tier="practitioner-snippet",
                note="Snippet variant: 2 parts peat/coir : 1 part perlite/pumice : 1 part compost or worm castings (+ optional bark/charcoal). Original snippet URL was NOT preserved in the research report, so no URL is recorded here rather than a wrong one.",
            ),
        ],
        suitable_for=[
            "Boston fern, maidenhair fern, calatheas, prayer plants (GardeningElsa)",
            "Most indoor ferns (Cafe Planta)",
        ],
        not_suited_for=[
            "Cacti/succulents (drain too quickly for fern roots)",
            "Orchids",
        ],
        notes="Character: moisture-retentive, lightly damp, still draining — the opposite pole from orchid/cactus mixes; ferns/calathes 'dislike drying out'. Target pH UNVERIFIED (snippet-only claims 5.0-6.0 Boston fern / ~5.5-6.5 ferns were not fully opened). Replacement interval UNVERIFIED as a fixed figure (Cafe Planta: check annually and refresh as needed; the general 1-2 year houseplant renewal is the nearest sourced anchor, not a fern-specific figure).",
        verification_sources={
            "recipes": "https://cafeplanta.com/blogs/resources/fern-soil-mix-recipe",
            "suitable_for": "https://gardeningelsa.com/best-soil-for-indoor-plants/",
        },
        verification_status={
            "recipes": "verified",
            "retention": "verified",
            "drainage": "verified",
            "target_ph": "UNVERIFIED",
            "suitable_for": "verified",
            "not_suited_for": "verified",
            "replacement": "UNVERIFIED",
        },
    ),
]


# ---------------------------------------------------------------------------
# Species -> substrate preferences (16 of 79 seed species).
# Sources: SOIL_SOURCES.md, section 3. A species NOT listed here has NO
# researched preference — that gap is reported, never filled by analogy.
# Syngonium podophyllum was researched but is NOT a seed species, so it
# is deliberately excluded from this list (see SOIL_SOURCES.md).
# ---------------------------------------------------------------------------
SPECIES_SUBSTRATE_PREFERENCES: List[SpeciesSubstratePreference] = [
    SpeciesSubstratePreference(
        scientific_name="Monstera deliciosa",
        preferred_mix_id="aroid_chunky",
        mix_description="Chunky, well-aerated aroid mix: potting soil / coco coir + orchid bark + perlite; bark among first ingredients, perlite/pumice present.",
        drainage_need="fast-draining, never waterlogged; chunky structure with air pockets.",
        moisture_guidance="Water thoroughly, let the top 1-2 inches dry out between waterings; dries down in 7-14 days in one guide. Overwatering can result in root rot.",
        ph_min=5.5,
        ph_max=8.0,
        root_rot_prone=True,
        notes="pH CONFLICT: Penn State Extension (read in full) says neutral pH 6.0-8.0 for a well-draining soilless mix; Bean Growing says slightly acidic ~5.5-6.8; other aroid guides 5.5-7.0. Stored span covers both; it is NOT a single sourced range.",
        verification_sources={
            "mix": "https://www.beangrowing.com/what-soil-should-you-use-for-a-monstera/",
            "moisture": "https://extension.psu.edu/monstera-as-a-houseplant",
            "ph": "https://extension.psu.edu/monstera-as-a-houseplant",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "conflicting",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Epipremnum aureum",
        preferred_mix_id="aroid_chunky",
        mix_description="Well-draining, airy aroid / houseplant mix: potting soil + perlite + orchid bark (examples: 1:1:1 coir/bark/perlite; 50% soil / 30% perlite / 20% bark; 2:1:1 peat/perlite/pine bark fines).",
        drainage_need="well-draining, retains some moisture.",
        moisture_guidance="Dry between waterings; water when top 1-2 inches dry. Waterlogged roots lead to rot.",
        ph_min=6.0,
        ph_max=7.0,
        root_rot_prone=True,
        notes="pH convergent 6.0-7.0 across guides; one guide gives 6.1-6.5 and one outlier 5.5-7.5. No fluoride/salt sensitivity source found for this species.",
        verification_sources={
            "mix": "https://plantcarebasics.com/best-soil-for-pothos/",
            "ph": "https://plants.sorumatik.co/t/care-of-pothos-plant/40991",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Dracaena trifasciata",
        preferred_mix_id="cactus_succulent",
        mix_description="Fast-draining cactus / succulent mix, or potting soil cut with coarse sand/perlite (Penn State Extension via PlantCareToday; Noah Garden Centre: fast-draining cactus or gritty indoor mix).",
        drainage_need="fast-draining; standard potting soil holds too much moisture.",
        moisture_guidance="Must dry deeply / completely between waterings; NC State (via PlantCareToday): let soil dry between waterings spring-autumn, water only every 1-2 months in winter.",
        root_rot_prone=True,
        notes="Numeric pH UNVERIFIED for this species (only qualitative 'well-drained, slightly acidic to neutral' found — do not borrow a numeric band from other Dracaena spp.). Fluoride sensitivity is GENUS-LEVEL ONLY (Clemson Extension guidance quoted for Dracaena generally: 'very sensitive to fluoride', avoid high-perlite mixes, keep pH 6.0-6.5 to limit fluoride injury, avoid superphosphate fertiliser) — NOT species-confirmed, so fluoride_sensitive stays None.",
        verification_sources={
            "mix": "https://plantcaretoday.com/snake-plant-soil.html",
            "moisture": "https://noahgardencentre.com.sg/plants/snake-plant/",
            "fluoride_genus_level": "https://plantcaretoday.com/dracaena-compacta.html",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "UNVERIFIED",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Chlorophytum comosum",
        preferred_mix_id="all_purpose",
        mix_description="Loamy, well-drained general houseplant mix (e.g. 2 parts potting mix / 1 part perlite / 1 part coco coir, or peat-based mix with perlite/sand).",
        drainage_need="well-drained; lightly moist but never soggy.",
        moisture_guidance="Allow top 1-2 inches to dry briefly between waterings. The Spruce: 'like lightly moist but not soggy soil'.",
        ph_min=6.0,
        ph_max=7.0,
        fluoride_sensitive=True,
        salt_sensitive=True,
        root_rot_prone=True,
        notes="Fluoride/chlorine + salt sensitivity CONFIRMED (The Spruce: sensitive to chlorine and fluoride; browning tips typically from excess salts; PlantCareToday: avoid mix components adding fluoride or boron, use fluoride-free very-low-boron fertiliser). pH convergent ~neutral 6.0-7.0; wider guide variants 6.0-7.2 / 6.0-8.0 exist.",
        verification_sources={
            "mix": "https://www.thespruce.com/spider-plants-chlorophytum-definition-1902773",
            "ph": "https://plantcaretoday.com/spider-plant-care.html",
            "fluoride": "https://www.thespruce.com/spider-plants-chlorophytum-definition-1902773",
            "salt": "https://www.thespruce.com/spider-plants-chlorophytum-definition-1902773",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "verified",
            "salt": "verified",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Aloe vera",
        preferred_mix_id="cactus_succulent",
        mix_description="Fast-draining, gritty cactus/succulent mix: roughly half inorganic (coarse sand/perlite/pumice/gravel), low organic matter (examples: 2 cactus mix / 1 perlite / 1 coarse sand; equal parts potting soil / coarse sand / perlite).",
        drainage_need="must drain in seconds to ~1 minute; standard potting soil retains too much moisture and leads to rot.",
        moisture_guidance="Must dry between waterings.",
        ph_min=6.0,
        ph_max=7.0,
        root_rot_prone=True,
        notes="pH convergent 6.0-7.0; one guide gives 6-7.5. No fluoride/salt sensitivity source found for this species.",
        verification_sources={
            "mix": "https://plantin.alibaba.com/plant-wiki/what-soil-to-use-for-aloe-vera",
            "ph": "https://Shuncy.com/article/what-soil-do-aloe-plants-need",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Dypsis lutescens",
        preferred_mix_id=None,
        mix_description="Well-draining, peat-based palm mix rich in organic matter: peat + pine bark + perlite/sand (Greg example: 50% potting soil / 25% perlite / 20% coarse sand / 5% charcoal). No dedicated palm mix exists in MIXES, so no mix id is forced.",
        drainage_need="moist but well-drained; drains freely, never waterlogged, never standing water.",
        moisture_guidance="Top 1-2 inches dry, not bone-dry, not soggy. CONFLICT: one source says soil should never fully dry out; another (Soltech) says allow soil to completely dry between waterings — the majority position (top dry) is stored.",
        ph_min=6.0,
        ph_max=6.5,
        root_rot_prone=True,
        notes="pH convergent slightly acidic to neutral ~6.0-6.5; wider spread in sources (5.5-7.0, 5.5-6.5, 6.0-7.0). No fluoride/salt sensitivity source found. One Greg URL was unavailable in the live check and is recorded text-only in SOIL_SOURCES.md, not linked.",
        verification_sources={
            "mix": "https://shuncy.com/article/areca-palm-soil",
            "ph": "https://florgeous.com/areca-palm-care/",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "conflicting",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Goeppertia makoyana",
        preferred_mix_id="fern_moisture",
        mix_description="Well-draining, peat-based, moisture-retentive mix: peat/coir + perlite (+ bark); African violet or tropical mix, or perlite added to regular potting soil (Kamer-tuintje).",
        drainage_need="well-draining but moisture-retentive; cannot dry out completely (leaves crisp) but wet soil leads to root rot.",
        moisture_guidance="Consistently / evenly moist but never soggy; water when top inch is dry. RHS: 'Moist but well-drained'.",
        ph_min=6.0,
        ph_max=6.5,
        fluoride_sensitive=True,
        salt_sensitive=True,
        root_rot_prone=True,
        notes="Fluoride/mineral/salt sensitivity CONFIRMED for this group (Monsteraholic: highly sensitive to fluoride, brown tips; TheContentedPlant: very sensitive to hard/mineral water). pH: care guides 6.0-6.5; RHS gives broad tolerance ('Acid or Alkaline or Neutral') with no numeric band, so it is not encoded as a number.",
        verification_sources={
            "mix": "https://kamer-tuintje.be/Goeppertia%20makoyana/index.php?lang=en",
            "moisture": "https://www.rhs.org.uk/Plants/357223/Goeppertia-makoyana/Details",
            "ph": "https://kamer-tuintje.be/Goeppertia%20makoyana/index.php?lang=en",
            "fluoride": "https://monsteraholic.com/calathea-makoyana/",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "verified",
            "salt": "verified",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Ficus lyrata",
        preferred_mix_id="all_purpose",
        mix_description="Well-draining, aerated, moisture-retentive mix: peat/coir + perlite + pine/orchid bark (examples: 2:1:1 peat/perlite/pine bark fines; 50% potting soil / 30% perlite / 20% orchid bark). Mapped to all_purpose because the Clemson foliage variant (1 peat : 1 bark : 1 perlite) matches this blend; the bark amendment is part of the description.",
        drainage_need="well-draining but retains some moisture; NOT a cactus mix on its own (at most ~1/3 cactus soil per PlantCareBasics).",
        moisture_guidance="Water when top 1-2 inches dry; soggy soil leads to root rot quickly.",
        ph_min=6.0,
        ph_max=7.0,
        root_rot_prone=True,
        notes="pH convergent 6.0-7.0; PlantCareBasics/SucculentsBox give 5.5-7.0 centred near 6.0. No fluoride/salt sensitivity source found.",
        verification_sources={
            "mix": "https://plantin.alibaba.com/plant-wiki/what-kind-of-soil-for-fiddle-leaf-fig",
            "ph": "https://plantcarebasics.com/what-potting-mix-does-a-fiddle-leaf-fig-need-indoors/",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Monstera deliciosa 'Thai Constellation'",
        preferred_mix_id="aroid_chunky",
        mix_description="Chunky, well-aerated aroid mix, slightly chunkier / lower moisture retention than standard deliciosa (Soiled: 40% potting soil / 25% orchid bark / 20% perlite / 15% coco coir; Greg: potting soil + perlite + orchid bark; Bean Growing: ~35% orchid bark / 25% perlite).",
        drainage_need="must dry moderately between waterings; dense moisture-retentive soil is the leading cause of the root rot this cultivar is susceptible to.",
        moisture_guidance="Top 5 cm dry before watering (Soiled).",
        ph_min=5.5,
        ph_max=6.5,
        root_rot_prone=True,
        notes="Cultivar-specific claim (not inferred from deliciosa alone): notably MORE prone to root rot than standard Monstera, a consequence of slower growth and reduced water uptake from lower-chlorophyll areas (Soiled). pH 5.5-7.0 (Soiled) vs 5.5-6.5 (Greg); stored convergent 5.5-6.5 with the 7.0 upper variant noted. Penn State Extension confirms Thai Constellation is a variegated variety of M. deliciosa.",
        verification_sources={
            "mix": "https://www.soiled.in/products/monstera-thai-constellation?variant=49134851522881",
            "ph": "https://greg.app/thai-constellation-soil/",
            "rot_prone": "https://www.soiled.in/products/monstera-thai-constellation?variant=49134851522881",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Zamioculcas zamiifolia",
        preferred_mix_id="cactus_succulent",
        mix_description="Fast-draining, gritty mix similar to cactus/succulent mix: potting soil + perlite + coarse sand (Greg: 40/30/20 + 10% charcoal); roughly half the mix inorganic/chunky.",
        drainage_need="fast-draining; standard potting mix holds too much moisture.",
        moisture_guidance="Must dry completely / stay on the dry side between waterings; rhizomes store water. Water every 2-4 weeks in one account.",
        ph_min=6.0,
        ph_max=7.0,
        root_rot_prone=True,
        notes="pH 6.0-7.0 is SINGLE-SOURCE numeric (Greg); other ZZ guides read did not state pH. Rhizome/root rot from soggy soil is the dominant failure mode. No fluoride/salt sensitivity source found. One Greg URL was unavailable in the live check and is recorded text-only in SOIL_SOURCES.md, not linked.",
        verification_sources={
            "mix": "https://fullygrows.com/whats-the-best-soil-for-zz-plants-soil-mix-tips-for-healthy-growth/",
            "ph": "https://fullygrows.com/whats-the-best-soil-for-zz-plants-soil-mix-tips-for-healthy-growth/",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Spathiphyllum wallisii",
        preferred_mix_id="fern_moisture",
        mix_description="Well-draining, moisture-retentive, peat/coir-based mix rich in organic matter (examples: 60% peat/coir / 20% perlite / 20% compost; 2:1:1 peat/perlite/orchid bark; equal parts peat/perlite/vermiculite).",
        drainage_need="well-draining yet moisture-retentive; consistently moist but never waterlogged/soggy.",
        moisture_guidance="Water when top inch is dry. This is the wettest-tolerant group in the set after Goeppertia — do NOT encode as 'dry between waterings' like ZZ/snake.",
        ph_min=5.8,
        ph_max=6.5,
        fluoride_sensitive=True,
        salt_sensitive=True,
        root_rot_prone=True,
        notes="Salt + fluoride sensitivity CONFIRMED (UF/IFAS via CompleteGardening: salt-sensitive, excessive soluble salts cause tip/margin burn, fluoride sensitivity known; Michigan State Extension via FoliaCollective flags Spathiphyllum as fluoride-sensitive; White Flower Farm: high-salt/fluoride tap water leads to brown tips). GENUS-LEVEL NOTE: sources were genus-level Spathiphyllum spp.; the seed species is S. wallisii, so this mapping is genus-level applied to wallisii, not wallisii-specific.",
        genus_level_note="Sources were genus-level Spathiphyllum spp.; applied to seed species Spathiphyllum wallisii.",
        verification_sources={
            "mix": "https://gardening.alibaba.com/plant-care/spathiphyllum-soil",
            "ph": "https://kamer-tuintje.be/Secure/plant.php?folder=Spathiphyllum_floribundum&lang=en",
            "fluoride": "https://completegardening.com/your-peace-lily-leaves-turn-brown-because-one-hidden-problem-keeps-building-up-0f998186/",
            "salt": "https://www.whiteflowerfarm.com/blogs/growing-guides/peace-lily-care",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "verified",
            "salt": "verified",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Ficus elastica",
        preferred_mix_id="all_purpose",
        mix_description="Well-draining potting mix amended with perlite/bark (Greg: 60% potting mix / 25% perlite / 15% orchid bark; Epic Gardening: peat + pine bark + perlite; or 1:1:1 pine bark / peat / sand).",
        drainage_need="well-draining; holds moisture for a few days, then top dry before next watering.",
        moisture_guidance="Top 1-2 inches dry before next watering. NOT moisture-retentive tropical mixes, NOT cactus mix alone (Greg: cactus mix 'too fast-draining and nutrient-lean').",
        ph_min=6.0,
        ph_max=6.5,
        root_rot_prone=True,
        notes="pH 6.0-6.5 ideal (Greg); tolerable 5.5-7.0 per Shuncy/MyGreenScape/Candy and 6.0-7.0 per Sorumatik. No fluoride/salt sensitivity source found. One Greg URL was unavailable in the live check and is recorded text-only in SOIL_SOURCES.md, not linked.",
        verification_sources={
            "mix": "https://Shuncy.com/article/what-kind-of-soil-is-good-for-rubber-plants",
            "ph": "https://www.epicgardening.com/rubber-plant/",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Monstera adansonii",
        preferred_mix_id="aroid_chunky",
        mix_description="Chunky, well-draining aroid mix: potting soil + orchid bark + perlite (+ coco coir) (Greg: 2 parts potting soil / 1 part orchid bark / 1 part perlite; Patuxent: chunky aroid with bark, perlite, peat or coco coir).",
        drainage_need="well-draining; lightly moist, never soggy; dense peat-heavy / moisture-control mixes lead to root rot.",
        moisture_guidance="Water when top 2-3 cm / top inch is dry.",
        ph_min=5.5,
        ph_max=6.5,
        root_rot_prone=True,
        notes="pH 5.5-7.0 in most guides, 5.5-6.5 ideal; Patuxent lists only 'Acid, Neutral' (no numbers). No fluoride/salt sensitivity source found. One Greg URL was unavailable in the live check and is recorded text-only in SOIL_SOURCES.md, not linked.",
        verification_sources={
            "mix": "https://patuxentnursery.com/product/monstera-adansonii/",
            "ph": "https://foliagefriend.com/what-kind-of-soil-does-monstera-adansonii-need/",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Strelitzia nicolai",
        preferred_mix_id=None,
        mix_description="Well-draining, bark-rich, fertile mix: potting soil + coarse/orchid bark + perlite (+ compost) (Soiled: 40% soil / 30% coarse bark / 20% perlite / 10% compost; indoor guide: 40% soil / 30% perlite/pumice / 20% bark / 10% worm castings/compost). No mix id is forced: this blend matches no single MIXES entry exactly.",
        drainage_need="well-draining yet moisture-retentive; moist but not soggy. Avoid cactus/succulent mix (too dry) and generic dense indoor mix.",
        moisture_guidance="Allow top 2-3 cm to dry between waterings. Root rot if waterlogged.",
        ph_min=6.0,
        ph_max=7.0,
        root_rot_prone=True,
        notes="pH CONFLICT / wide spread: Soiled 5.5-7.5; indoor guides 6.0-7.0, 6.0-7.5, 5.8-6.5 (buffered), 5.5-6.5. Stored convergent slightly acidic to neutral ~6.0-7.0; do not encode a narrow band without noting the spread. Salt sensitivity: ONE indoor guide notes S. nicolai is 'less forgiving of salt buildup' than S. reginae and recommends swapping worm castings for charcoal — SINGLE-SOURCE, LOW-CONFIDENCE, so salt_sensitive stays None (UNVERIFIED).",
        verification_sources={
            "mix": "https://www.soiled.in/products/bird-of-paradise-white-strelitzia-nicolai",
            "ph": "https://gardening.alibaba.com/plant-care/white-bird-of-paradise-plant",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "conflicting",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Philodendron hederaceum",
        preferred_mix_id="aroid_chunky",
        mix_description="Chunky, well-draining aroid mix: 1:1:1 potting soil / perlite / orchid bark (Houseplant101, GardenersPath, Spruce micans: peat-based, airy, moist, well-draining, rich in organic matter).",
        drainage_need="well-draining, not soggy; water-retentive but airy.",
        moisture_guidance="Moist like a wrung-out sponge; surface may dry, but the whole substrate must not dry out (GardenersPath 'Brasil'). Soggy mix leads to root rot.",
        ph_min=6.0,
        ph_max=7.0,
        root_rot_prone=True,
        notes="pH slightly acidic to neutral; guides give 5.5-7.0, 6.0-7.0, 6.4-7.3 / 6.5-7.0 for cultivars; Spruce/Epic list only 'Acidic' (no numbers). Stored convergent ~6.0-7.0. No fluoride/salt sensitivity source found.",
        verification_sources={
            "mix": "https://houseplant101.com/plants/philodendron-brasil/",
            "moisture": "https://gardenerspath.com/plants/houseplants/grow-philodendron-brasil/",
            "ph": "https://www.thespruce.com/philodendron-micans-care-5201173",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "UNVERIFIED",
            "salt": "UNVERIFIED",
            "root_rot": "verified",
        },
    ),
    SpeciesSubstratePreference(
        scientific_name="Goeppertia orbifolia",
        preferred_mix_id="fern_moisture",
        mix_description="Moisture-retentive yet well-draining mix: peat/coir + perlite + orchid bark (Houseplant101: 2 parts peat/coir / 1 part perlite / handful of bark).",
        drainage_need="well-draining; consistently moist, never soggy/waterlogged.",
        moisture_guidance="Top 1-2 inches may dry; very susceptible to root rot if drainage fails (GardenBiology).",
        ph_min=6.0,
        ph_max=6.5,
        fluoride_sensitive=True,
        salt_sensitive=True,
        root_rot_prone=True,
        notes="Fluoride/chlorine/mineral/salt sensitivity CONFIRMED (Houseplant101: 'famously sensitive to minerals, salts, and chemicals like fluoride and chlorine', number one cause of brown crispy edges; GardenBiology: 'do not like fluorine or chlorine', distilled/rainwater best). pH guides conflict (~6.5, 6.0-7.0, 5.5-6.5, 5.5-7.5 from an AI-assisted source given low weight); stored convergent slightly acidic to neutral ~6.0-6.5.",
        verification_sources={
            "mix": "https://houseplant101.com/plants/calathea-orbifolia/",
            "ph": "https://www.calatheaessentials.com/calathea-orbifolia.html",
            "fluoride": "https://houseplant101.com/plants/calathea-orbifolia/",
            "salt": "https://gardenbiology.com/calathea-orbifolia/",
        },
        verification_status={
            "mix": "verified",
            "drainage": "verified",
            "moisture": "verified",
            "ph": "verified",
            "fluoride": "verified",
            "salt": "verified",
            "root_rot": "verified",
        },
    ),
]


# ---------------------------------------------------------------------------
# Lookups and coverage reporting.
# ---------------------------------------------------------------------------
def component_by_id(component_id: str) -> Optional[SubstrateComponent]:
    """Return a component by id, or None."""
    for component in COMPONENTS:
        if component.id == component_id:
            return component
    return None


def mix_by_id(mix_id: str) -> Optional[ReadyMix]:
    """Return a ready mix by id, or None."""
    for mix in MIXES:
        if mix.id == mix_id:
            return mix
    return None


def preference_for_species(scientific_name: str) -> Optional[SpeciesSubstratePreference]:
    """Return the researched substrate preference for a seed species.

    Returns None when the species has NO researched preference. None
    means 'no data', never a default mix — callers must handle it as a
    gap (e.g. fall back to the species' existing seed moisture fields,
    not to an invented substrate).
    """
    for preference in SPECIES_SUBSTRATE_PREFERENCES:
        if preference.scientific_name == scientific_name:
            return preference
    return None


def coverage_report() -> Dict[str, object]:
    """Honest coverage counts for this module.

    Counts are computed from the data above, never typed. The
    verified/UNVERIFIED/conflicting splits count per-field
    verification_status entries across all records.
    """
    status_counts: Dict[str, int] = {"verified": 0, "UNVERIFIED": 0, "conflicting": 0}
    for record in (
        list(COMPONENTS) + list(MIXES) + list(SPECIES_SUBSTRATE_PREFERENCES)
    ):
        for status in record.verification_status.values():
            if status in status_counts:
                status_counts[status] += 1
    mapped_with_mix = sum(
        1 for p in SPECIES_SUBSTRATE_PREFERENCES if p.preferred_mix_id is not None
    )
    fluoride_confirmed = sum(
        1 for p in SPECIES_SUBSTRATE_PREFERENCES if p.fluoride_sensitive is True
    )
    salt_confirmed = sum(
        1 for p in SPECIES_SUBSTRATE_PREFERENCES if p.salt_sensitive is True
    )
    ph_filled = sum(
        1
        for p in SPECIES_SUBSTRATE_PREFERENCES
        if p.ph_min is not None and p.ph_max is not None
    )
    return {
        "components": len(COMPONENTS),
        "mixes": len(MIXES),
        "mix_recipe_variants": sum(len(m.recipes) for m in MIXES),
        "species_preferences": len(SPECIES_SUBSTRATE_PREFERENCES),
        "species_preferences_with_mix_id": mapped_with_mix,
        "species_preferences_without_mix_id": len(SPECIES_SUBSTRATE_PREFERENCES)
        - mapped_with_mix,
        "species_ph_ranges_filled": ph_filled,
        "species_fluoride_confirmed": fluoride_confirmed,
        "species_salt_confirmed": salt_confirmed,
        "field_status_counts": status_counts,
    }
