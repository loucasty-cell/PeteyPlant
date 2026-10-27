/**
 * biophysicsEngine.ts — TypeScript port of the Petey Plant biophysical
 * differential engine (backend/services/petey_muse_botanical_engine.py,
 * v2.4.0, integrated verbatim into the backend).
 *
 * This port follows the INSTALLED MODULE exactly, so the client-side
 * what-if simulator agrees numerically with backend triage/forecast.
 * The user's pasted spec summary differs from the module in several
 * places; where they disagree, the module wins. Documented deviations
 * from the pasted spec:
 *  - Stomatal conductance is driven by VPD_air (module), not VPD_leaf;
 *    gs floor 0.10 (not 0.08), linear decay factor 0.90 (not 0.92).
 *  - Temperature scalar floor is 0.0 (not 0.05) and cuts out at
 *    t_upper_stress_c (not upper + 4).
 *  - gs and temperature scale the INCIDENT PPFD before the hyperbola
 *    (module); they do not scale A_max.
 *  - Photoinhibition is a linear decay max(0, 1 - 0.0005 * excess)
 *    applied to A_gross (module), not an exp curve with a 0.25 floor.
 *  - ET = VPD_air * Kc * pathway * leaf_area * 1000 * 0.9 (module),
 *    leaf_area = max(0.02, leaves * 0.008); CAM scalar 0.60 (not 0.32),
 *    facultative C3/CAM 0.75; there is no DLI term in ET.
 *  - Air-filled porosity is computed from PEAK VWC (module), not mean.
 *  - Sunlight mapping is the module's 9-entry table (low 45, medium /
 *    indirect 150, high / direct / full sun 450); the pasted spec's
 *    extra entries (shade 30, bright indirect 240, etc.) are not in
 *    the module.
 *  - Diagnosis severities/confidences and the health-index weights
 *    (0.40 photo / 0.30 risk / 0.30 pathology) follow the module's
 *    dataset builder; predicted leaves = max(0, A_net) * 0.15.
 *  - Logit offset is tau * log(count / total + 1e-12), subtracted
 *    from the raw logit at inference (module adapter).
 *
 * Everything here is closed-form and dependency-free so the what-if
 * simulator runs at 60fps entirely on the client, offline.
 */

import type { PathologyCode } from '../types/botanical';

/* ------------------------------------------------------------------ */
/* VPD — Magnus-Tetens (verified bit-identical to the module)          */
/* ------------------------------------------------------------------ */

export interface VpdResult {
  airTempC: number;
  leafTempC: number;
  rhPct: number;
  esAirKpa: number;
  eaKpa: number;
  vpdAirKpa: number;
  vpdLeafKpa: number;
  dewPointC: number;
}

const MAGNUS_A = 17.27;
const MAGNUS_B = 237.3;

function saturationVaporPressure(tempC: number): number {
  return 0.61078 * Math.exp((MAGNUS_A * tempC) / (tempC + MAGNUS_B));
}

/**
 * Magnus-Tetens saturation vapor pressure, actual vapor pressure, and
 * VPD for bulk air and for the leaf surface (leaf assumed 0.8 C cooler
 * via transpirational evaporative cooling).
 */
export function computeVpd(
  airTempC: number,
  rhPct: number,
  leafTempOffsetC = -0.8,
): VpdResult {
  const rh = Math.max(1, Math.min(100, rhPct));
  const esAir = saturationVaporPressure(airTempC);
  const ea = esAir * (rh / 100);
  const vpdAir = Math.max(0, esAir - ea);

  const leafTempC = airTempC + leafTempOffsetC;
  const esLeaf = saturationVaporPressure(leafTempC);
  const vpdLeaf = Math.max(0, esLeaf - ea);

  // Magnus dew-point approximation: T_d = B * gamma / (A - gamma).
  const gamma = Math.log(Math.max(ea, 1e-9) / 0.61078);
  const dewPointC = (MAGNUS_B * gamma) / (MAGNUS_A - gamma);

  return {
    airTempC,
    leafTempC,
    rhPct: rh,
    esAirKpa: round(esAir, 4),
    eaKpa: round(ea, 4),
    vpdAirKpa: round(vpdAir, 4),
    vpdLeafKpa: round(vpdLeaf, 4),
    dewPointC: round(dewPointC, 2),
  };
}

/** HUD status for the VPD shield. Only the three spec states are used. */
export type VpdStatus = 'OPTIMAL TRANSPIRATION' | 'FUNGAL RISK' | 'STOMATAL CLOSURE';

export function vpdStatus(
  vpdLeafKpa: number,
  vpdOptMinKpa: number,
  vpdStomatalClosureKpa: number,
): VpdStatus {
  if (vpdLeafKpa < vpdOptMinKpa) return 'FUNGAL RISK';
  if (vpdLeafKpa >= vpdStomatalClosureKpa) return 'STOMATAL CLOSURE';
  return 'OPTIMAL TRANSPIRATION';
}

/* ------------------------------------------------------------------ */
/* Light: PPFD / DLI                                                   */
/* ------------------------------------------------------------------ */

/** DLI (mol/m^2/day) = PPFD (umol/m^2/s) * hours * 3600 / 1e6. */
export function ppfdToDli(ppfd: number, photoperiodHours = 12): number {
  return ppfd * photoperiodHours * 0.0036;
}

/**
 * Deterministic crosswalk from qualitative sunlight labels to PPFD/DLI,
 * exactly as in the module (substring match, first key in table order
 * wins; unknown labels default to medium indoor light).
 */
export function mapSunlightToPpfdDli(sunlightLabel: string): { ppfd: number; dli: number } {
  const label = sunlightLabel.trim().toLowerCase();
  const mapping: Array<[string, [number, number]]> = [
    ['low', [45.0, 1.94]],
    ['low sunlight', [45.0, 1.94]],
    ['medium', [150.0, 6.48]],
    ['part shade', [150.0, 6.48]],
    ['medium light', [150.0, 6.48]],
    ['indirect', [150.0, 6.48]],
    ['high', [450.0, 19.44]],
    ['direct', [450.0, 19.44]],
    ['full sun', [450.0, 19.44]],
  ];
  for (const [key, value] of mapping) {
    if (label.includes(key)) return { ppfd: value[0], dli: value[1] };
  }
  return { ppfd: 150.0, dli: 6.48 };
}

/* ------------------------------------------------------------------ */
/* Photosynthesis — non-rectangular hyperbola (module-faithful)        */
/* ------------------------------------------------------------------ */

export interface PhotoParams {
  lcpPpfd: number;
  lspPpfd: number;
  quantumYieldAlpha: number;
  aMaxUmolM2S: number;
  darkRespirationRd: number;
  variegationPenalty: number;
}

export interface ThermoParams {
  tBaseC: number;
  tOptMinC: number;
  tOptMaxC: number;
  tUpperStressC: number;
  vpdOptMaxKpa: number;
  vpdStomatalClosureKpa: number;
}

export interface PhotoResult {
  aGrossUmolM2S: number;
  rdUmolM2S: number;
  aNetUmolM2S: number;
  stomatalConductanceRatio: number;
  thermalEfficiencyRatio: number;
  photoinhibitionFactor: number;
  isPhotoinhibited: boolean;
  isBelowLcp: boolean;
}

/**
 * Module algorithm: gs scalar from VPD_air (1.0 below optimum, linear
 * decay to 0.10 at closure); cardinal temperature scalar (0.0 outside
 * [base, upper]); incident PPFD = PPFD * gs * temp fed into the
 * non-rectangular hyperbola (theta = 0.75); linear photoinhibition
 * decay of A_gross above LSP; Q10 = 2.0 dark respiration from 25 C.
 * A_net = A_gross - R_d.
 */
export function computeNetPhotosynthesis(
  photo: PhotoParams,
  thermo: ThermoParams,
  ppfd: number,
  airTempC: number,
  vpdAirKpa: number,
): PhotoResult {
  let gsScalar: number;
  if (vpdAirKpa <= thermo.vpdOptMaxKpa) {
    gsScalar = 1.0;
  } else if (vpdAirKpa >= thermo.vpdStomatalClosureKpa) {
    gsScalar = 0.1;
  } else {
    const span = thermo.vpdStomatalClosureKpa - thermo.vpdOptMaxKpa;
    gsScalar = 1.0 - 0.9 * ((vpdAirKpa - thermo.vpdOptMaxKpa) / Math.max(span, 1e-9));
  }

  let tempScalar: number;
  if (airTempC <= thermo.tBaseC || airTempC >= thermo.tUpperStressC) {
    tempScalar = 0.0;
  } else if (thermo.tOptMinC <= airTempC && airTempC <= thermo.tOptMaxC) {
    tempScalar = 1.0;
  } else if (airTempC < thermo.tOptMinC) {
    tempScalar = (airTempC - thermo.tBaseC) / Math.max(thermo.tOptMinC - thermo.tBaseC, 1e-9);
  } else {
    tempScalar =
      (thermo.tUpperStressC - airTempC) / Math.max(thermo.tUpperStressC - thermo.tOptMaxC, 1e-9);
  }

  const theta = 0.75;
  const alpha = photo.quantumYieldAlpha * photo.variegationPenalty;
  const aMax = photo.aMaxUmolM2S * photo.variegationPenalty;
  const incident = ppfd * gsScalar * tempScalar;

  const discriminant = Math.max(
    0,
    (alpha * incident + aMax) ** 2 - 4 * theta * alpha * incident * aMax,
  );
  let aGross = (alpha * incident + aMax - Math.sqrt(discriminant)) / (2 * theta);

  const isPhotoinhibited = ppfd > photo.lspPpfd;
  let photoinhibitionFactor = 1.0;
  if (isPhotoinhibited) {
    const excess = ppfd - photo.lspPpfd;
    photoinhibitionFactor = Math.max(0, 1 - 0.0005 * excess);
    aGross *= photoinhibitionFactor;
  }

  const rd = photo.darkRespirationRd * 2 ** ((airTempC - 25) / 10);
  const aNet = aGross - rd;

  return {
    aGrossUmolM2S: round(aGross, 4),
    rdUmolM2S: round(rd, 4),
    aNetUmolM2S: round(aNet, 4),
    stomatalConductanceRatio: round(gsScalar, 4),
    thermalEfficiencyRatio: round(tempScalar, 4),
    photoinhibitionFactor: round(photoinhibitionFactor, 4),
    isPhotoinhibited,
    isBelowLcp: ppfd < photo.lcpPpfd,
  };
}

/* ------------------------------------------------------------------ */
/* Substrate hydration balance (module-faithful)                       */
/* ------------------------------------------------------------------ */

export type PhotosyntheticPathwayKey =
  | 'C3_CALVIN_BENSON'
  | 'CRASSULACEAN_ACID_METABOLISM'
  | 'FACULTATIVE_C3_CAM_SWITCHING'
  | 'C4';

export interface HydroParams {
  porosityFraction: number;
  airFilledPorosityMin: number;
  fieldCapacityVwc: number;
  criticalDepletionVwc: number;
  permanentWiltingPointVwc: number;
  hypoxiaRotSusceptibility: number;
  cropCoefficientKc: number;
}

export interface HydroResult {
  dailyEtMl: number;
  peakVwc: number;
  meanVwc: number;
  troughVwc: number;
  airFilledPorosity: number;
  hypoxiaRotRiskScore: number;
  desiccationWiltRiskScore: number;
  optimalIntervalDays: number;
  optimalDoseMl: number;
}

export function pathwayWaterScalar(pathway: PhotosyntheticPathwayKey): number {
  switch (pathway) {
    case 'CRASSULACEAN_ACID_METABOLISM':
      return 0.6;
    case 'FACULTATIVE_C3_CAM_SWITCHING':
      return 0.75;
    case 'C4':
      return 0.9;
    default:
      return 1.0;
  }
}

/** Module risk formulas, reusable for live (runtime) states too. */
export function hypoxiaRiskFromAfp(
  airFilledPorosity: number,
  airFilledPorosityMin: number,
  susceptibility: number,
): number {
  if (airFilledPorosity >= airFilledPorosityMin) return 0;
  const deficit = airFilledPorosityMin - airFilledPorosity;
  return Math.min(1, (deficit / Math.max(airFilledPorosityMin, 1e-9)) * susceptibility);
}

export function desiccationRiskFromTrough(
  troughVwc: number,
  criticalDepletionVwc: number,
  permanentWiltingPointVwc: number,
): number {
  if (troughVwc >= criticalDepletionVwc) return 0;
  if (troughVwc <= permanentWiltingPointVwc) return 1;
  const span = criticalDepletionVwc - permanentWiltingPointVwc;
  return 1 - (troughVwc - permanentWiltingPointVwc) / Math.max(span, 1e-9);
}

/**
 * One watering cycle: dose raises VWC instantly (capped at porosity),
 * ET drains it linearly. Air-filled porosity is measured at PEAK VWC.
 * Optimal interval is clamped to [1, 30] days; optimal dose refills
 * from critical depletion to field capacity + 15% leaching.
 */
export function simulateHydration(
  hydro: HydroParams,
  potVolumeLiters: number,
  initialVwc: number,
  wateringAmountMl: number,
  wateringIntervalDays: number,
  leafCount: number,
  vpdAirKpa: number,
  pathway: PhotosyntheticPathwayKey,
): HydroResult {
  const soilVolumeMl = potVolumeLiters * 1000;
  const leafAreaM2 = Math.max(0.02, leafCount * 0.008);
  const dailyEtMl =
    vpdAirKpa * hydro.cropCoefficientKc * pathwayWaterScalar(pathway) * leafAreaM2 * 1000 * 0.9;

  const peakVwc = Math.min(
    hydro.porosityFraction,
    initialVwc + wateringAmountMl / soilVolumeMl,
  );
  const troughVwc = Math.max(
    0,
    peakVwc - (dailyEtMl * wateringIntervalDays) / soilVolumeMl,
  );
  const meanVwc = (peakVwc + troughVwc) / 2;
  const airFilledPorosity = Math.max(0, hydro.porosityFraction - peakVwc);

  const hypoxiaRisk = hypoxiaRiskFromAfp(
    airFilledPorosity,
    hydro.airFilledPorosityMin,
    hydro.hypoxiaRotSusceptibility,
  );
  const desiccationRisk = desiccationRiskFromTrough(
    troughVwc,
    hydro.criticalDepletionVwc,
    hydro.permanentWiltingPointVwc,
  );

  const dailyVwcDrop = dailyEtMl / soilVolumeMl;
  let optimalIntervalDays: number;
  if (dailyVwcDrop > 1e-9) {
    optimalIntervalDays = Math.round(
      (hydro.fieldCapacityVwc - hydro.criticalDepletionVwc) / dailyVwcDrop,
    );
  } else {
    optimalIntervalDays = 14;
  }
  optimalIntervalDays = Math.max(1, Math.min(optimalIntervalDays, 30));
  const optimalDoseMl = Math.round(
    (hydro.fieldCapacityVwc - hydro.criticalDepletionVwc) * soilVolumeMl * 1.15,
  );

  return {
    dailyEtMl: round(dailyEtMl, 2),
    peakVwc: round(peakVwc, 4),
    meanVwc: round(meanVwc, 4),
    troughVwc: round(troughVwc, 4),
    airFilledPorosity: round(airFilledPorosity, 4),
    hypoxiaRotRiskScore: round(hypoxiaRisk, 4),
    desiccationWiltRiskScore: round(desiccationRisk, 4),
    optimalIntervalDays,
    optimalDoseMl,
  };
}

/* ------------------------------------------------------------------ */
/* Differential pathology triage (module-faithful)                     */
/* ------------------------------------------------------------------ */

export interface DiagParams {
  lcpPpfd: number;
  lspPpfd: number;
  ecBurnThresholdMsCm: number;
  fluorideBoronSensitive: boolean;
}

export interface Diagnosis {
  code: PathologyCode;
  agent: string;
  category:
    | 'BIOTIC_PEST'
    | 'BIOTIC_PATHOGEN'
    | 'ABIOTIC_TOXICITY'
    | 'ABIOTIC_NUTRIENT_STRESS'
    | 'ABIOTIC_PHOTOBIOLOGY';
  /** Module confidence for this determination. */
  probability: number;
  /** Module severity score; diagnoses sort descending by this. */
  severityScore: number;
  mechanism: string;
  mobility?: 'PHLOEM_MOBILE_OLD_LEAVES_FIRST' | 'PHLOEM_IMMOBILE_NEW_LEAVES_FIRST';
}

export interface DiagnosisInput {
  vpdAirKpa: number;
  hypoxiaRisk: number;
  ppfd: number;
  fertilizerEcMsCm: number;
  tapWaterFluoridePpm?: number;
}

export const PATHOLOGY_META: Record<
  PathologyCode,
  { label: string; blurb: string; fix: string }
> = {
  HOMEOSTASIS_OPTIMAL: {
    label: 'Optimal homeostasis',
    blurb: 'No stress signature detected. Carbon, water, and light are in balance.',
    fix: 'Keep the current routine — no intervention needed.',
  },
  BIOTIC_ACARI_TETRANYCHUS: {
    label: 'Two-spotted spider mites',
    blurb: 'High VPD accelerates the mite life cycle while leaf turgor drops.',
    fix: 'Raise humidity, shower the abaxial leaf surfaces, and isolate the plant.',
  },
  BIOTIC_OOMYCETE_PYTHIUM: {
    label: 'Pythium / Phytophthora root rot',
    blurb: 'Root-zone hypoxia forces root fermentation, attracting motile zoospores.',
    fix: 'Stop watering, increase drainage and air-filled porosity, and let the substrate dry.',
  },
  ABIOTIC_FLUORIDE_TIP_NECROSIS: {
    label: 'Fluoride / boron tip necrosis',
    blurb: 'Fluoride travels via xylem to leaf margins and inhibits enolase.',
    fix: 'Switch to rainwater or distilled water and flush the substrate.',
  },
  ABIOTIC_OSMOTIC_SALT_TOXICITY: {
    label: 'Osmotic salt toxicity',
    blurb: 'Substrate solute potential falls below root potential, desiccating fine root hairs.',
    fix: 'Leach the pot thoroughly with low-EC water and pause fertiliser.',
  },
  ABIOTIC_NEGATIVE_CARBON_ETIOLATION: {
    label: 'Sub-compensation etiolation',
    blurb: 'PPFD is below the light compensation point, so respiration exceeds photosynthesis.',
    fix: 'Move the plant closer to bright indirect light.',
  },
  ABIOTIC_PSII_PHOTOINHIBITION: {
    label: 'PSII photoinhibition',
    blurb: 'Excess excitation energy generates singlet oxygen, bleaching chlorophyll.',
    fix: 'Pull the plant back from direct sun into bright indirect light.',
  },
};

/**
 * Deterministic differential pathology engine, following the module:
 * five codes, module severity formulas and confidences, ranked by
 * severity descending. Empty result means HOMEOSTASIS_OPTIMAL.
 */
export function diagnose(params: DiagParams, input: DiagnosisInput): Diagnosis[] {
  const diagnostics: Diagnosis[] = [];
  const fluoridePpm = input.tapWaterFluoridePpm ?? 0.7;

  if (input.vpdAirKpa > 1.45) {
    diagnostics.push({
      code: 'BIOTIC_ACARI_TETRANYCHUS',
      agent: 'Tetranychus urticae (Two-Spotted Spider Mite)',
      category: 'BIOTIC_PEST',
      probability: 0.72,
      severityScore: round(Math.min(1, (input.vpdAirKpa - 1.45) / 1.0), 4),
      mechanism:
        'High VPD (>1.45 kPa) desiccates leaf boundary layer and accelerates Tetranychus urticae reproduction; stippling chlorosis precedes webbing.',
    });
  }

  if (input.hypoxiaRisk > 0.3) {
    diagnostics.push({
      code: 'BIOTIC_OOMYCETE_PYTHIUM',
      agent: 'Pythium / Phytophthora spp. + Bradysia Fungus Gnats',
      category: 'BIOTIC_PATHOGEN',
      probability: 0.81,
      severityScore: round(input.hypoxiaRisk, 4),
      mechanism:
        'Air-filled porosity below the species hypoxia floor suffocates roots; anaerobic exudates recruit Pythium zoospores and collapse cortex tissue.',
    });
  }

  if (params.fluorideBoronSensitive && fluoridePpm > 0.3) {
    diagnostics.push({
      code: 'ABIOTIC_FLUORIDE_TIP_NECROSIS',
      agent: 'Fluoride / Boron Transpiration Stream Accumulation',
      category: 'ABIOTIC_TOXICITY',
      mobility: 'PHLOEM_IMMOBILE_NEW_LEAVES_FIRST',
      probability: 0.88,
      severityScore: round(Math.min(1, (fluoridePpm - 0.3) / 0.7), 4),
      mechanism:
        'Fluoride accumulates at leaf margins via transpiration stream; sensitive taxa lack vacuolar sequestration, causing marginal necrosis.',
    });
  }

  if (input.fertilizerEcMsCm > params.ecBurnThresholdMsCm) {
    diagnostics.push({
      code: 'ABIOTIC_OSMOTIC_SALT_TOXICITY',
      agent: 'Rhizosphere Hypertonicity (Excess EC)',
      category: 'ABIOTIC_NUTRIENT_STRESS',
      mobility: 'PHLOEM_MOBILE_OLD_LEAVES_FIRST',
      probability: 0.84,
      severityScore: round(
        Math.min(1, (input.fertilizerEcMsCm - params.ecBurnThresholdMsCm) / 1.0),
        4,
      ),
      mechanism:
        'Root-zone EC above the burn threshold reverses the water potential gradient, causing plasmolysis and marginal leaf burn (fertilizer burn).',
    });
  }

  if (input.ppfd < params.lcpPpfd) {
    diagnostics.push({
      code: 'ABIOTIC_NEGATIVE_CARBON_ETIOLATION',
      agent: 'Sub-Compensation Point Auxin Internode Elongation',
      category: 'ABIOTIC_PHOTOBIOLOGY',
      probability: 0.79,
      severityScore: round(
        Math.min(1, (params.lcpPpfd - input.ppfd) / params.lcpPpfd),
        4,
      ),
      mechanism:
        'PPFD below the light compensation point means respiration exceeds photosynthesis; internodes elongate and leaves pale (etiolation).',
    });
  } else if (input.ppfd > params.lspPpfd) {
    diagnostics.push({
      code: 'ABIOTIC_PSII_PHOTOINHIBITION',
      agent: 'Reactive Oxygen Species (ROS) D1 Protein Bleaching',
      category: 'ABIOTIC_PHOTOBIOLOGY',
      probability: 0.76,
      severityScore: round(
        Math.min(1, (input.ppfd - params.lspPpfd) / params.lspPpfd),
        4,
      ),
      mechanism:
        'PPFD above the light saturation point overwhelms PSII repair; excess excitation energy generates reactive oxygen species and bleaching.',
    });
  }

  diagnostics.sort((a, b) => b.severityScore - a.severityScore);
  return diagnostics;
}

/* ------------------------------------------------------------------ */
/* PlantNet-300K logit adjustment + health index (module builder)      */
/* ------------------------------------------------------------------ */

/**
 * Adapter offset tau * log(pi_y + eps), SUBTRACTED from the raw class
 * logit at inference (adjusted_logit = logit - offset). Counters the
 * long-tail skew so rare indoor species are not crushed by head classes.
 */
export function computeLogitOffset(
  classSampleCount: number,
  tau = 1.0,
  totalDatasetImages = 306_146,
): number {
  const piY = classSampleCount / Math.max(totalDatasetImages, 1);
  return round(tau * Math.log(piY + 1e-12), 6);
}

/**
 * Physiological Health Index (0-100) and 30-day new-leaf prediction,
 * exactly as the module's dataset builder: 0.40 photo term +
 * 0.30 risk term + 0.30 pathology term; leaves = max(0, A_net) * 0.15.
 * primarySeverity is 0 when the diagnosis is HOMEOSTASIS_OPTIMAL.
 */
export function computeHealthIndex(
  aNetUmolM2S: number,
  aMaxUmolM2S: number,
  hypoxiaRisk: number,
  desiccationRisk: number,
  primarySeverity: number,
): { healthIndex: number; predicted30dNewLeaves: number } {
  const photoTerm = Math.max(0, Math.min(1, aNetUmolM2S / Math.max(aMaxUmolM2S, 1e-9)));
  const riskTerm = 1 - Math.max(hypoxiaRisk, desiccationRisk);
  const pathTerm = 1 - primarySeverity;
  const healthIndex = 100 * (0.4 * photoTerm + 0.3 * riskTerm + 0.3 * pathTerm);
  const predicted30dNewLeaves = Math.max(0, aNetUmolM2S) * 0.15;
  return {
    healthIndex: round(healthIndex, 2),
    predicted30dNewLeaves: round(predicted30dNewLeaves, 2),
  };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
