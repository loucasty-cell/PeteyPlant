/**
 * usePeteyStore.ts — Zustand state for the Petey Plant R3F shell.
 *
 * HARD RULES enforced here, not in UI copy:
 * - Streaks come ONLY from biophysical check-ins (VPD check, 90-degree
 *   pot rotation, leaf dusting, abaxial spider-mite check). Watering
 *   never advances a streak.
 * - Watering unlocks ONLY when substrate_trough_vwc <=
 *   critical_depletion_vwc. While locked, waterPlant() is a no-op that
 *   reports the lock reason (root O2 porosity protection).
 */

import { create } from 'zustand';
import {
  computeHealthIndex,
  computeNetPhotosynthesis,
  computeVpd,
  desiccationRiskFromTrough,
  diagnose,
  hypoxiaRiskFromAfp,
  pathwayWaterScalar,
  ppfdToDli,
  simulateHydration,
  vpdStatus,
  type Diagnosis,
  type VpdStatus,
} from '../lib/biophysicsEngine';
import {
  PRELOADED_SPECIES,
  type PathologyCode,
  type SpeciesRecord,
} from '../types/botanical';

export type CheckinType = 'vpd' | 'rotation' | 'dusting' | 'mite';

export interface EnvState {
  airTempC: number;
  relativeHumidityPct: number;
  ppfd: number;
  wateringIntervalDays: number;
}

export interface PlantRuntime {
  /** ISO date (YYYY-MM-DD) of the last watering. */
  lastWateredDay: string;
  /** VWC immediately after the last watering (approx. field capacity). */
  wateredVwc: number;
}

/** Days between two ISO dates (UTC, date-only). */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Defense-in-depth fallback for any species without a recorded
 * runtime: watered today at field capacity. All preloaded species have
 * DEFAULT_RUNTIME entries, so this is unreachable today — but a missing
 * runtime must never crash computeLiveMetrics. */
export function fallbackRuntime(species: SpeciesRecord): PlantRuntime {
  return { lastWateredDay: todayIso(), wateredVwc: species.params.fieldCapacityVwc };
}

/** Default runtime per species: staggered watering ages for a lively demo. */
const DEFAULT_RUNTIME: Record<string, PlantRuntime> = {
  'ARA-MON-DEL-001': { lastWateredDay: daysAgoIso(3), wateredVwc: 0.45 },
  'MAR-GOE-MAK-001': { lastWateredDay: daysAgoIso(2), wateredVwc: 0.55 },
  'ASP-DRA-TRI-001': { lastWateredDay: daysAgoIso(14), wateredVwc: 0.25 },
  'MOR-FIC-LYR-001': { lastWateredDay: daysAgoIso(5), wateredVwc: 0.4 },
};

/** Every intermediate value behind the headline metrics, so the UI can
 * render the full derivation chain instead of just final numbers. */
export interface Derivation {
  esAirKpa: number;
  eaKpa: number;
  leafTempC: number;
  dewPointC: number;
  tempScalar: number;
  incidentPpfd: number;
  alphaEff: number;
  aMaxEff: number;
  aGross: number;
  rd: number;
  photoinhibitionFactor: number;
  isPhotoinhibited: boolean;
  leafAreaM2: number;
  pathwayScalar: number;
  peakVwc: number;
  dailyVwcDrop: number;
}

export interface LiveMetrics {
  vpdAirKpa: number;
  vpdLeafKpa: number;
  vpdStatus: VpdStatus;
  dli: number;
  aNet: number;
  gsRatio: number;
  dailyEtMl: number;
  meanVwc: number;
  troughVwc: number;
  airFilledPorosity: number;
  hypoxiaRisk: number;
  desiccationRisk: number;
  optimalIntervalDays: number;
  optimalDoseMl: number;
  healthIndex: number;
  predictedLeaves: number;
  diagnoses: Diagnosis[];
  primaryPathology: PathologyCode;
  wateringLocked: boolean;
  lockReason: string;
  daysUntilWater: number;
  derivation: Derivation;
}

/**
 * Pure live-metrics computation from species physics + environment +
 * watering runtime. The 3D rig, HUD, quest path, and diagnostic sheet all
 * read this one function, so they can never disagree.
 */
export function computeLiveMetrics(
  species: SpeciesRecord,
  env: EnvState,
  runtime: PlantRuntime,
): LiveMetrics {
  const p = species.params;
  const vpd = computeVpd(env.airTempC, env.relativeHumidityPct);
  const dli = ppfdToDli(env.ppfd, 12);
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
    env.ppfd,
    env.airTempC,
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
    species.pot_volume_liters,
    p.fieldCapacityVwc,
    species.watering_amount_ml,
    env.wateringIntervalDays,
    species.leaf_count,
    vpd.vpdAirKpa,
    species.photosynthetic_pathway,
  );

  // Live trough: deplete from the last watering toward the cycle trough.
  // Daily depletion (VWC/day) = daily ET / pot volume.
  const potVolMl = Math.max(250, species.pot_volume_liters * 1000);
  const dailyDepletionVwc = hydro.dailyEtMl / potVolMl;
  const daysSinceWater = daysBetween(runtime.lastWateredDay, todayIso());
  const liveTrough = Math.max(
    p.permanentWiltingPointVwc,
    runtime.wateredVwc - dailyDepletionVwc * daysSinceWater,
  );
  // Live mean sits between the post-water peak and the live trough.
  const liveMean = Math.min(
    p.porosityFraction,
    Math.max(liveTrough, 0.5 * (runtime.wateredVwc + liveTrough)),
  );
  const liveAfp = Math.max(0, p.porosityFraction - liveMean);

  // Live (right-now) risks from the runtime state, using the module's
  // risk formulas; the cycle hydro result above feeds ET, interval,
  // and dose recommendations only.
  const liveHypoxiaRisk = hypoxiaRiskFromAfp(
    liveAfp,
    p.airFilledPorosityMin,
    p.hypoxiaRotSusceptibility,
  );
  const liveDesiccationRisk = desiccationRiskFromTrough(
    liveTrough,
    p.criticalDepletionVwc,
    p.permanentWiltingPointVwc,
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
      hypoxiaRisk: liveHypoxiaRisk,
      ppfd: env.ppfd,
      fertilizerEcMsCm: species.fertilizer_ec_ms_cm,
    },
  );
  const health = computeHealthIndex(
    photo.aNetUmolM2S,
    p.aMaxUmolM2S,
    liveHypoxiaRisk,
    liveDesiccationRisk,
    diagnoses.length > 0 ? diagnoses[0].severityScore : 0,
  );

  const wateringLocked = liveTrough > p.criticalDepletionVwc;
  const daysUntilWater =
    dailyDepletionVwc > 0
      ? Math.max(0, (liveTrough - p.criticalDepletionVwc) / dailyDepletionVwc)
      : 0;

  const derivation: Derivation = {
    esAirKpa: vpd.esAirKpa,
    eaKpa: vpd.eaKpa,
    leafTempC: vpd.leafTempC,
    dewPointC: vpd.dewPointC,
    tempScalar: photo.thermalEfficiencyRatio,
    // Display-consistent incident PPFD: built from the ROUNDED gs/temp
    // the UI shows, so incident = PPFD × gₛ × temp holds on screen.
    incidentPpfd:
      Math.round(env.ppfd * photo.stomatalConductanceRatio * photo.thermalEfficiencyRatio * 100) /
      100,
    alphaEff: Math.round(p.quantumYieldAlpha * p.variegationPenalty * 10000) / 10000,
    aMaxEff: Math.round(p.aMaxUmolM2S * p.variegationPenalty * 100) / 100,
    aGross: photo.aGrossUmolM2S,
    rd: photo.rdUmolM2S,
    photoinhibitionFactor: photo.photoinhibitionFactor,
    isPhotoinhibited: photo.isPhotoinhibited,
    leafAreaM2: Math.max(0.02, species.leaf_count * 0.008),
    pathwayScalar: pathwayWaterScalar(species.photosynthetic_pathway),
    peakVwc: hydro.peakVwc,
    dailyVwcDrop: Math.round((hydro.dailyEtMl / potVolMl) * 100000) / 100000,
  };

  return {
    vpdAirKpa: vpd.vpdAirKpa,
    vpdLeafKpa: vpd.vpdLeafKpa,
    vpdStatus: vpdStatus(vpd.vpdLeafKpa, p.vpdOptMinKpa, p.vpdStomatalClosureKpa),
    derivation,
    dli: Math.round(dli * 1000) / 1000,
    aNet: photo.aNetUmolM2S,
    gsRatio: photo.stomatalConductanceRatio,
    dailyEtMl: hydro.dailyEtMl,
    meanVwc: Math.round(liveMean * 10000) / 10000,
    troughVwc: Math.round(liveTrough * 10000) / 10000,
    airFilledPorosity: Math.round(liveAfp * 10000) / 10000,
    hypoxiaRisk: Math.round(liveHypoxiaRisk * 10000) / 10000,
    desiccationRisk: Math.round(liveDesiccationRisk * 10000) / 10000,
    optimalIntervalDays: hydro.optimalIntervalDays,
    optimalDoseMl: hydro.optimalDoseMl,
    healthIndex: health.healthIndex,
    predictedLeaves: health.predicted30dNewLeaves,
    diagnoses,
    primaryPathology: diagnoses.length > 0 ? diagnoses[0].code : 'HOMEOSTASIS_OPTIMAL',
    wateringLocked,
    lockReason: wateringLocked
      ? `Root O2 porosity at ${Math.round(liveAfp * 100)}% — do NOT water for ${daysUntilWater.toFixed(1)} days to prevent Pythium hypoxia`
      : '',
    daysUntilWater,
  };
}

interface PeteyState {
  species: SpeciesRecord[];
  activeSpeciesId: string;
  env: EnvState;
  xp: number;
  streakDays: number;
  lastCheckinDay: string | null;
  checkinsToday: CheckinType[];
  completedQuests: string[];
  runtimeBySpecies: Record<string, PlantRuntime>;
  /** Epoch ms of the last irrigation burst (drives 3D droplets + jump). */
  irrigationBurstAt: number | null;
  diagnosticOpen: boolean;
  activeQuest: string | null;

  selectSpecies: (id: string) => void;
  setEnv: (patch: Partial<EnvState>) => void;
  /** Returns 'credited' | 'already-done' (check-ins are once per type per day). */
  completeCheckin: (type: CheckinType) => 'credited' | 'already-done';
  /** Returns ok=false with the lock reason when watering is not allowed. */
  waterPlant: () => { ok: boolean; reason: string };
  completeQuest: (questId: string) => void;
  setDiagnosticOpen: (open: boolean) => void;
  setActiveQuest: (questId: string | null) => void;
}

export const CHECKIN_XP = 25;
export const WATER_XP = 10;

export const usePeteyStore = create<PeteyState>()((set, get) => ({
  species: PRELOADED_SPECIES,
  activeSpeciesId: PRELOADED_SPECIES[0].taxon_code,
  env: {
    airTempC: 23.5,
    relativeHumidityPct: 55,
    ppfd: 240,
    wateringIntervalDays: 7,
  },
  xp: 0,
  streakDays: 0,
  lastCheckinDay: null,
  checkinsToday: [],
  completedQuests: [],
  runtimeBySpecies: DEFAULT_RUNTIME,
  irrigationBurstAt: null,
  diagnosticOpen: false,
  activeQuest: null,

  selectSpecies: (id) => set({ activeSpeciesId: id }),

  setEnv: (patch) => set((s) => ({ env: { ...s.env, ...patch } })),

  completeCheckin: (type) => {
    const s = get();
    const today = todayIso();
    // New day: reset the per-type ledger (streak accounting below).
    const todays = s.lastCheckinDay === today ? s.checkinsToday : [];
    if (todays.includes(type)) return 'already-done';

    let streakDays = s.streakDays;
    if (s.lastCheckinDay === null) {
      streakDays = 1;
    } else if (s.lastCheckinDay === today) {
      streakDays = s.streakDays; // later check-ins same day: XP only, no streak gain
    } else if (daysBetween(s.lastCheckinDay, today) === 1) {
      streakDays = s.streakDays + 1;
    } else {
      streakDays = 1; // missed days break the streak (Duolingo rule)
    }

    set({
      xp: s.xp + CHECKIN_XP,
      streakDays,
      lastCheckinDay: today,
      checkinsToday: [...todays, type],
      completedQuests: s.completedQuests.includes(`checkin-${type}`)
        ? s.completedQuests
        : [...s.completedQuests, `checkin-${type}`],
    });
    return 'credited';
  },

  waterPlant: () => {
    const s = get();
    const species =
      s.species.find((sp) => sp.taxon_code === s.activeSpeciesId) ?? s.species[0];
    const runtime =
      s.runtimeBySpecies[species.taxon_code] ??
      DEFAULT_RUNTIME[species.taxon_code] ??
      fallbackRuntime(species);
    const metrics = computeLiveMetrics(species, s.env, runtime);
    if (metrics.wateringLocked) {
      return { ok: false, reason: metrics.lockReason };
    }
    const newRuntime: PlantRuntime = {
      lastWateredDay: todayIso(),
      wateredVwc: species.params.fieldCapacityVwc,
    };
    set({
      runtimeBySpecies: { ...s.runtimeBySpecies, [species.taxon_code]: newRuntime },
      xp: s.xp + WATER_XP,
      irrigationBurstAt: Date.now(),
      completedQuests: s.completedQuests.includes('irrigation')
        ? s.completedQuests
        : [...s.completedQuests, 'irrigation'],
    });
    return { ok: true, reason: '' };
  },

  completeQuest: (questId) =>
    set((s) => ({
      completedQuests: s.completedQuests.includes(questId)
        ? s.completedQuests
        : [...s.completedQuests, questId],
    })),

  setDiagnosticOpen: (open) => set({ diagnosticOpen: open }),
  setActiveQuest: (questId) => set({ activeQuest: questId }),
}));

/** Convenience selector: the active species record. */
export function useActiveSpecies(): SpeciesRecord {
  const species = usePeteyStore((s) => s.species);
  const activeSpeciesId = usePeteyStore((s) => s.activeSpeciesId);
  return species.find((sp) => sp.taxon_code === activeSpeciesId) ?? species[0];
}

/** Convenience selector: live metrics for the active species. */
export function useLiveMetrics(): LiveMetrics {
  const species = useActiveSpecies();
  const env = usePeteyStore((s) => s.env);
  const runtimeBySpecies = usePeteyStore((s) => s.runtimeBySpecies);
  const runtime =
    runtimeBySpecies[species.taxon_code] ??
    DEFAULT_RUNTIME[species.taxon_code] ??
    fallbackRuntime(species);
  return computeLiveMetrics(species, env, runtime);
}
