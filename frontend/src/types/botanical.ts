/**
 * botanical.ts — canonical Petey Plant data structures.
 *
 * The three core types below are reproduced exactly as specified by the
 * user. common_name is the first common name of the APG IV record.
 * Species physics (SpeciesParams) are ported from
 * petey_muse_botanical_engine.py v2.4.0 and attached to each record so
 * the client-side simulator and the 3D rig share one source of truth.
 */

export type CareClusterId =
  | 'CLUSTER_A_TROPICAL_AROID_HEMIEPIPHYTE'
  | 'CLUSTER_B_HYGROPHILIC_UNDERSTORY_CALATHEA_FERN'
  | 'CLUSTER_C_CAM_SUCCULENT_XEROPHYTE'
  | 'CLUSTER_D_HIGH_DLI_WOODY_FICUS_STRELITZIA'
  | 'CLUSTER_E_AERATED_EPIPHYTE_ORCHID_BROMELIAD';

export type PathologyCode =
  | 'HOMEOSTASIS_OPTIMAL'
  | 'BIOTIC_ACARI_TETRANYCHUS'
  | 'BIOTIC_OOMYCETE_PYTHIUM'
  | 'ABIOTIC_FLUORIDE_TIP_NECROSIS'
  | 'ABIOTIC_OSMOTIC_SALT_TOXICITY'
  | 'ABIOTIC_NEGATIVE_CARBON_ETIOLATION'
  | 'ABIOTIC_PSII_PHOTOINHIBITION';

export interface ProprietaryBotanicalRecord {
  record_id: string;
  taxon_code: string;
  plantnet_species_id: number;
  scientific_name: string;
  common_name: string;
  family: string;
  photosynthetic_pathway:
    | 'C3_CALVIN_BENSON'
    | 'CRASSULACEAN_ACID_METABOLISM'
    | 'FACULTATIVE_C3_CAM_SWITCHING';
  care_cluster_id: CareClusterId;
  toxicity_mechanism: string;
  height_cm: number;
  leaf_count: number;
  pot_volume_liters: number;
  air_temp_c: number;
  relative_humidity_pct: number;
  vpd_air_kpa: number;
  vpd_leaf_kpa: number;
  ppfd_umol_m2_s: number;
  dli_mol_m2_d: number;
  watering_amount_ml: number;
  watering_interval_days: number;
  daily_evapotranspiration_ml: number;
  substrate_mean_vwc: number;
  substrate_trough_vwc: number;
  air_filled_porosity: number;
  hypoxia_rot_risk_score: number;
  desiccation_wilt_risk_score: number;
  recommended_interval_days: number;
  recommended_dose_ml: number;
  a_net_umol_m2_s: number;
  stomatal_conductance_ratio: number;
  fertilizer_ec_ms_cm: number;
  predicted_30d_new_leaves: number;
  physiological_health_index: number;
  primary_pathology_code: PathologyCode;
  plantnet_logit_offset: number;
}

/** Short badge labels for the five physiological guilds. */
export const CLUSTER_META: Record<
  CareClusterId,
  { short: string; guild: string; blurb: string }
> = {
  CLUSTER_A_TROPICAL_AROID_HEMIEPIPHYTE: {
    short: 'Tropical Aroid',
    guild: 'Alismatales Hemiepiphyte Homeostasis',
    blurb: 'Chunky aroid mix, high air-filled porosity, steady tropical moisture.',
  },
  CLUSTER_B_HYGROPHILIC_UNDERSTORY_CALATHEA_FERN: {
    short: 'Hygrophilic Understory',
    guild: 'Zingiberales Understory Homeostasis',
    blurb: 'Moisture-retentive humus, low light, fluoride-sensitive leaves.',
  },
  CLUSTER_C_CAM_SUCCULENT_XEROPHYTE: {
    short: 'CAM Succulent',
    guild: 'Asparagales Xerophyte Homeostasis',
    blurb: 'Mineral grit, deep drying cycles, night-time carbon fixation.',
  },
  CLUSTER_D_HIGH_DLI_WOODY_FICUS_STRELITZIA: {
    short: 'High-DLI Woody',
    guild: 'Rosales Woody Homeostasis',
    blurb: 'Big light appetite, deep structural roots, loamy interior mix.',
  },
  CLUSTER_E_AERATED_EPIPHYTE_ORCHID_BROMELIAD: {
    short: 'Aerated Epiphyte',
    guild: 'Asparagales Epiphyte Homeostasis',
    blurb: 'Bark and sphagnum, velamen roots, air around every root.',
  },
};

/** Engine physics for one species, ported from the botanical engine nodes. */
export interface SpeciesParams {
  taxonCode: string;
  apgIvClade: string;
  apgIvOrder: string;
  substrate: string;
  porosityFraction: number;
  airFilledPorosityMin: number;
  fieldCapacityVwc: number;
  criticalDepletionVwc: number;
  permanentWiltingPointVwc: number;
  hypoxiaRotSusceptibility: number;
  phMin: number;
  phMax: number;
  ecTargetMsCm: number;
  ecBurnThresholdMsCm: number;
  fluorideBoronSensitive: boolean;
  cropCoefficientKc: number;
  lcpPpfd: number;
  optimalPpfdMin: number;
  optimalPpfdMax: number;
  lspPpfd: number;
  dliOptimalMin: number;
  dliOptimalMax: number;
  quantumYieldAlpha: number;
  aMaxUmolM2S: number;
  darkRespirationRd: number;
  variegationPenalty: number;
  tBaseC: number;
  tOptMinC: number;
  tOptMaxC: number;
  tUpperStressC: number;
  tChillingInjuryC: number;
  vpdOptMinKpa: number;
  vpdOptMaxKpa: number;
  vpdStomatalClosureKpa: number;
  npkRatio: [number, number, number];
  /** 12-rig procedural archetype label used by the 3D stage. */
  archetype: 'fenestrated' | 'ellipse' | 'sword' | 'broad';
  /** Chimeral variegation params (Thai Constellation) where relevant. */
  thaiConstellation?: {
    lcpPpfd: number;
    optimalPpfdMin: number;
    optimalPpfdMax: number;
    lspPpfd: number;
    dliOptimalMin: number;
    dliOptimalMax: number;
    quantumYieldAlpha: number;
    aMaxUmolM2S: number;
    darkRespirationRd: number;
    variegationPenalty: number;
    vpdOptMinKpa: number;
    vpdOptMaxKpa: number;
    vpdStomatalClosureKpa: number;
    fieldCapacityVwc: number;
    criticalDepletionVwc: number;
    ecTargetMsCm: number;
    ecBurnThresholdMsCm: number;
    hypoxiaRotSusceptibility: number;
    cropCoefficientKc: number;
  };
  /** Whether the rendered plant shows chimeral cream variegation. */
  variegated: boolean;
}

/** A pre-loaded record = the snapshot record + its engine physics. */
export interface SpeciesRecord extends ProprietaryBotanicalRecord {
  params: SpeciesParams;
}

/* ------------------------------------------------------------------ */
/* Species physics ported from petey_muse_botanical_engine.py          */
/* ------------------------------------------------------------------ */

export const MONSTERA_PARAMS: SpeciesParams = {
  taxonCode: 'ARA-MON-DEL-001',
  apgIvClade: 'Monocots',
  apgIvOrder: 'Alismatales',
  substrate: 'AROID_MIX_ORCHID_BARK_PUMICE_COIR',
  porosityFraction: 0.7,
  airFilledPorosityMin: 0.15,
  fieldCapacityVwc: 0.45,
  criticalDepletionVwc: 0.22,
  permanentWiltingPointVwc: 0.11,
  hypoxiaRotSusceptibility: 0.68,
  phMin: 5.5,
  phMax: 7.0,
  ecTargetMsCm: 1.2,
  ecBurnThresholdMsCm: 2.5,
  fluorideBoronSensitive: false,
  cropCoefficientKc: 0.82,
  lcpPpfd: 20,
  optimalPpfdMin: 150,
  optimalPpfdMax: 400,
  lspPpfd: 800,
  dliOptimalMin: 3.0,
  dliOptimalMax: 8.0,
  quantumYieldAlpha: 0.085,
  aMaxUmolM2S: 28.0,
  darkRespirationRd: 1.2,
  variegationPenalty: 1.0,
  tBaseC: 10,
  tOptMinC: 18,
  tOptMaxC: 28,
  tUpperStressC: 35,
  tChillingInjuryC: 10,
  vpdOptMinKpa: 0.5,
  vpdOptMaxKpa: 1.2,
  vpdStomatalClosureKpa: 2.0,
  npkRatio: [20, 20, 20],
  archetype: 'fenestrated',
  thaiConstellation: {
    lcpPpfd: 32,
    optimalPpfdMin: 200,
    optimalPpfdMax: 500,
    lspPpfd: 700,
    dliOptimalMin: 4.0,
    dliOptimalMax: 10.0,
    quantumYieldAlpha: 0.063,
    aMaxUmolM2S: 20.7,
    darkRespirationRd: 1.1,
    variegationPenalty: 0.74,
    vpdOptMinKpa: 0.5,
    vpdOptMaxKpa: 1.1,
    vpdStomatalClosureKpa: 1.9,
    fieldCapacityVwc: 0.42,
    criticalDepletionVwc: 0.2,
    ecTargetMsCm: 1.0,
    ecBurnThresholdMsCm: 2.2,
    hypoxiaRotSusceptibility: 0.72,
    cropCoefficientKc: 0.76,
  },
  variegated: true,
};

export const GOEPPERTIA_PARAMS: SpeciesParams = {
  taxonCode: 'MAR-GOE-MAK-001',
  apgIvClade: 'Monocots',
  apgIvOrder: 'Zingiberales',
  substrate: 'COCO_COIR_PEAT_VERMICULITE_COMPOST',
  porosityFraction: 0.6,
  airFilledPorosityMin: 0.1,
  fieldCapacityVwc: 0.55,
  criticalDepletionVwc: 0.35,
  permanentWiltingPointVwc: 0.18,
  hypoxiaRotSusceptibility: 0.45,
  phMin: 5.5,
  phMax: 6.5,
  ecTargetMsCm: 0.8,
  ecBurnThresholdMsCm: 1.8,
  fluorideBoronSensitive: true,
  cropCoefficientKc: 0.9,
  lcpPpfd: 15,
  optimalPpfdMin: 75,
  optimalPpfdMax: 200,
  lspPpfd: 400,
  dliOptimalMin: 1.5,
  dliOptimalMax: 4.0,
  quantumYieldAlpha: 0.075,
  aMaxUmolM2S: 18.0,
  darkRespirationRd: 0.9,
  variegationPenalty: 1.0,
  tBaseC: 15,
  tOptMinC: 18,
  tOptMaxC: 26,
  tUpperStressC: 32,
  tChillingInjuryC: 15,
  vpdOptMinKpa: 0.3,
  vpdOptMaxKpa: 0.8,
  vpdStomatalClosureKpa: 1.5,
  npkRatio: [10, 10, 10],
  archetype: 'ellipse',
  variegated: false,
};

export const DRACAENA_PARAMS: SpeciesParams = {
  taxonCode: 'ASP-DRA-TRI-001',
  apgIvClade: 'Monocots',
  apgIvOrder: 'Asparagales',
  substrate: 'PUMICE_CALCINED_CLAY_COARSE_SAND_75PCT',
  porosityFraction: 0.8,
  airFilledPorosityMin: 0.25,
  fieldCapacityVwc: 0.25,
  criticalDepletionVwc: 0.05,
  permanentWiltingPointVwc: 0.02,
  hypoxiaRotSusceptibility: 0.95,
  phMin: 5.5,
  phMax: 7.5,
  ecTargetMsCm: 0.9,
  ecBurnThresholdMsCm: 2.0,
  fluorideBoronSensitive: true,
  cropCoefficientKc: 0.35,
  lcpPpfd: 10,
  optimalPpfdMin: 50,
  optimalPpfdMax: 300,
  lspPpfd: 600,
  dliOptimalMin: 1.0,
  dliOptimalMax: 6.0,
  quantumYieldAlpha: 0.055,
  aMaxUmolM2S: 12.0,
  darkRespirationRd: 0.4,
  variegationPenalty: 1.0,
  tBaseC: 12,
  tOptMinC: 18,
  tOptMaxC: 30,
  tUpperStressC: 38,
  tChillingInjuryC: 10,
  vpdOptMinKpa: 0.8,
  vpdOptMaxKpa: 2.0,
  vpdStomatalClosureKpa: 2.8,
  npkRatio: [10, 10, 10],
  archetype: 'sword',
  variegated: false,
};

export const FICUS_PARAMS: SpeciesParams = {
  taxonCode: 'MOR-FIC-LYR-001',
  apgIvClade: 'Rosids',
  apgIvOrder: 'Rosales',
  substrate: 'BALANCED_PEAT_PINE_BARK_PERLITE',
  porosityFraction: 0.65,
  airFilledPorosityMin: 0.12,
  fieldCapacityVwc: 0.4,
  criticalDepletionVwc: 0.2,
  permanentWiltingPointVwc: 0.1,
  hypoxiaRotSusceptibility: 0.6,
  phMin: 6.0,
  phMax: 7.0,
  ecTargetMsCm: 1.5,
  ecBurnThresholdMsCm: 2.8,
  fluorideBoronSensitive: false,
  cropCoefficientKc: 0.95,
  lcpPpfd: 30,
  optimalPpfdMin: 250,
  optimalPpfdMax: 800,
  lspPpfd: 1500,
  dliOptimalMin: 5.0,
  dliOptimalMax: 16.0,
  quantumYieldAlpha: 0.09,
  aMaxUmolM2S: 32.0,
  darkRespirationRd: 1.4,
  variegationPenalty: 1.0,
  tBaseC: 12,
  tOptMinC: 18,
  tOptMaxC: 30,
  tUpperStressC: 38,
  tChillingInjuryC: 12,
  vpdOptMinKpa: 0.5,
  vpdOptMaxKpa: 1.5,
  vpdStomatalClosureKpa: 2.2,
  npkRatio: [24, 8, 16],
  archetype: 'broad',
  variegated: false,
};

/* ------------------------------------------------------------------ */
/* Pre-loaded records — snapshots computed with the engine itself      */
/* ------------------------------------------------------------------ */

import {
  computeHealthIndex,
  computeLogitOffset,
  computeNetPhotosynthesis,
  computeVpd,
  diagnose,
  ppfdToDli,
  simulateHydration,
} from '../lib/biophysicsEngine';

export interface RecordSeed {
  params: SpeciesParams;
  plantnetSpeciesId: number;
  scientificName: string;
  commonName: string;
  family: string;
  pathway: ProprietaryBotanicalRecord['photosynthetic_pathway'];
  careClusterId: CareClusterId;
  toxicityMechanism: string;
  heightCm: number;
  leafCount: number;
  potVolumeLiters: number;
  airTempC: number;
  relativeHumidityPct: number;
  ppfd: number;
  wateringAmountMl: number;
  wateringIntervalDays: number;
  fertilizerEcMsCm: number;
  /** Engine adapter default estimate (see PlantNet300KAdapter). */
  estimated300kImages?: number;
}

function buildRecord(seed: RecordSeed): SpeciesRecord {
  const p = seed.params;
  const vpd = computeVpd(seed.airTempC, seed.relativeHumidityPct);
  const dli = ppfdToDli(seed.ppfd, 12);
  const photo = computeNetPhotosynthesis(
    {
      lcpPpfd: p.lcpPpfd,
      lspPpfd: p.lspPpfd,
      quantumYieldAlpha: p.quantumYieldAlpha,
      aMaxUmolM2S: p.aMaxUmolM2S,
      darkRespirationRd: p.darkRespirationRd,
      variegationPenalty: p.variegationPenalty,
    },
    {
      tBaseC: p.tBaseC,
      tOptMinC: p.tOptMinC,
      tOptMaxC: p.tOptMaxC,
      tUpperStressC: p.tUpperStressC,
      vpdOptMaxKpa: p.vpdOptMaxKpa,
      vpdStomatalClosureKpa: p.vpdStomatalClosureKpa,
    },
    seed.ppfd,
    seed.airTempC,
    vpd.vpdAirKpa,
  );
  const hydro = simulateHydration(
    {
      porosityFraction: p.porosityFraction,
      airFilledPorosityMin: p.airFilledPorosityMin,
      fieldCapacityVwc: p.fieldCapacityVwc,
      criticalDepletionVwc: p.criticalDepletionVwc,
      permanentWiltingPointVwc: p.permanentWiltingPointVwc,
      hypoxiaRotSusceptibility: p.hypoxiaRotSusceptibility,
      cropCoefficientKc: p.cropCoefficientKc,
    },
    seed.potVolumeLiters,
    p.fieldCapacityVwc,
    seed.wateringAmountMl,
    seed.wateringIntervalDays,
    seed.leafCount,
    vpd.vpdAirKpa,
    seed.pathway,
  );
  const diagnoses = diagnose(
    {
      lcpPpfd: p.lcpPpfd,
      lspPpfd: p.lspPpfd,
      ecBurnThresholdMsCm: p.ecBurnThresholdMsCm,
      fluorideBoronSensitive: p.fluorideBoronSensitive,
    },
    {
      vpdAirKpa: vpd.vpdAirKpa,
      hypoxiaRisk: hydro.hypoxiaRotRiskScore,
      ppfd: seed.ppfd,
      fertilizerEcMsCm: seed.fertilizerEcMsCm,
    },
  );
  const health = computeHealthIndex(
    photo.aNetUmolM2S,
    p.aMaxUmolM2S,
    hydro.hypoxiaRotRiskScore,
    hydro.desiccationWiltRiskScore,
    diagnoses.length > 0 ? diagnoses[0].severityScore : 0,
  );

  return {
    record_id: `PETEY-R3F-${p.taxonCode}`,
    taxon_code: p.taxonCode,
    plantnet_species_id: seed.plantnetSpeciesId,
    scientific_name: seed.scientificName,
    common_name: seed.commonName,
    family: seed.family,
    photosynthetic_pathway: seed.pathway,
    care_cluster_id: seed.careClusterId,
    toxicity_mechanism: seed.toxicityMechanism,
    height_cm: seed.heightCm,
    leaf_count: seed.leafCount,
    pot_volume_liters: seed.potVolumeLiters,
    air_temp_c: seed.airTempC,
    relative_humidity_pct: seed.relativeHumidityPct,
    vpd_air_kpa: vpd.vpdAirKpa,
    vpd_leaf_kpa: vpd.vpdLeafKpa,
    ppfd_umol_m2_s: seed.ppfd,
    dli_mol_m2_d: Math.round(dli * 1000) / 1000,
    watering_amount_ml: seed.wateringAmountMl,
    watering_interval_days: seed.wateringIntervalDays,
    daily_evapotranspiration_ml: hydro.dailyEtMl,
    substrate_mean_vwc: hydro.meanVwc,
    substrate_trough_vwc: hydro.troughVwc,
    air_filled_porosity: hydro.airFilledPorosity,
    hypoxia_rot_risk_score: hydro.hypoxiaRotRiskScore,
    desiccation_wilt_risk_score: hydro.desiccationWiltRiskScore,
    recommended_interval_days: hydro.optimalIntervalDays,
    recommended_dose_ml: hydro.optimalDoseMl,
    a_net_umol_m2_s: photo.aNetUmolM2S,
    stomatal_conductance_ratio: photo.stomatalConductanceRatio,
    fertilizer_ec_ms_cm: seed.fertilizerEcMsCm,
    predicted_30d_new_leaves: health.predicted30dNewLeaves,
    physiological_health_index: health.healthIndex,
    primary_pathology_code: diagnoses.length > 0 ? diagnoses[0].code : 'HOMEOSTASIS_OPTIMAL',
    plantnet_logit_offset: computeLogitOffset(seed.estimated300kImages ?? 250),
    params: p,
  };
}

/**
 * Four pre-loaded APG IV species records. Snapshot values are computed
 * with the engine itself from sane indoor starting conditions, so the
 * records are numerically consistent with the live simulator.
 */
export const PRELOADED_SPECIES: SpeciesRecord[] = [
  buildRecord({
    params: MONSTERA_PARAMS,
    plantnetSpeciesId: 1392475,
    scientificName: 'Monstera deliciosa Liebm.',
    commonName: 'Swiss Cheese Plant',
    family: 'Araceae',
    pathway: 'C3_CALVIN_BENSON',
    careClusterId: 'CLUSTER_A_TROPICAL_AROID_HEMIEPIPHYTE',
    toxicityMechanism: 'INSOLUBLE_CA_OXALATE_NEEDLE_RAPHIDES',
    heightCm: 62,
    leafCount: 14,
    potVolumeLiters: 6,
    airTempC: 23.5,
    relativeHumidityPct: 55,
    ppfd: 240,
    wateringAmountMl: 320,
    wateringIntervalDays: 7,
    fertilizerEcMsCm: 1.4,
  }),
  buildRecord({
    params: GOEPPERTIA_PARAMS,
    plantnetSpeciesId: 1418920,
    scientificName: 'Goeppertia makoyana (E.Morren) Borchs. & S.Suarez',
    commonName: 'Peacock Plant',
    family: 'Marantaceae',
    pathway: 'C3_CALVIN_BENSON',
    careClusterId: 'CLUSTER_B_HYGROPHILIC_UNDERSTORY_CALATHEA_FERN',
    toxicityMechanism: 'NON_TOXIC_BIOSAFE',
    heightCm: 38,
    leafCount: 18,
    potVolumeLiters: 4,
    airTempC: 22,
    relativeHumidityPct: 60,
    ppfd: 150,
    wateringAmountMl: 280,
    wateringIntervalDays: 6,
    fertilizerEcMsCm: 0.8,
  }),
  buildRecord({
    params: DRACAENA_PARAMS,
    plantnetSpeciesId: 1364012,
    scientificName: 'Dracaena trifasciata (Prain) Mabb.',
    commonName: 'Snake Plant',
    family: 'Asparagaceae',
    pathway: 'CRASSULACEAN_ACID_METABOLISM',
    careClusterId: 'CLUSTER_C_CAM_SUCCULENT_XEROPHYTE',
    toxicityMechanism: 'STEROIDAL_SAPONINS_GI_IRRITANT',
    heightCm: 74,
    leafCount: 9,
    potVolumeLiters: 4,
    airTempC: 24,
    relativeHumidityPct: 45,
    ppfd: 200,
    wateringAmountMl: 180,
    wateringIntervalDays: 14,
    fertilizerEcMsCm: 0.9,
  }),
  buildRecord({
    params: FICUS_PARAMS,
    plantnetSpeciesId: 1358702,
    scientificName: 'Ficus lyrata Warb.',
    commonName: 'Fiddle-Leaf Fig',
    family: 'Moraceae',
    pathway: 'C3_CALVIN_BENSON',
    careClusterId: 'CLUSTER_D_HIGH_DLI_WOODY_FICUS_STRELITZIA',
    toxicityMechanism: 'PROTEOLYTIC_FICIN_FURANOCOUMARIN_SAP',
    heightCm: 120,
    leafCount: 22,
    potVolumeLiters: 8.5,
    airTempC: 23,
    relativeHumidityPct: 50,
    ppfd: 400,
    wateringAmountMl: 500,
    wateringIntervalDays: 8,
    fertilizerEcMsCm: 1.6,
  }),
];
