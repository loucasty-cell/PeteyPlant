/**
 * Core Product Care Intelligence Adapter (Petey Plant).
 *
 * Translates real backend `GardenPlant` (and optional future engine fields when present)
 * into structured, honest presentation view-models answering the 7 core owner questions:
 *   1. Does my plant need attention?
 *   2. What should I do?
 *   3. When should I do it?
 *   4. How much water is appropriate? (NEVER fabricates mL precision if backend lacks it!)
 *   5. Why is this recommended?
 *   6. How reliable is the assessment?
 *   7. What information is missing?
 *
 * Also implements:
 * - Smart Watering Lifecycle states (action_recorded / reassessment_pending — never false recovery)
 * - Deterministic Companion Communication templates (grounded strictly in engine data)
 * - Alert priority & acknowledgement tracking (distinct from resolving plant conditions)
 * - Notification preferences & quiet hours helpers (honest about in-session browser scope)
 */

import type { CareEventKind, CareKind, GardenPlant } from '../gardenApi';
import { formatWeatherReading, type LiveWeatherState } from '../weatherService';
import {
  getConditionPresentation,
  resolveMultipleConditions,
  severityRank,
  type ConditionActionability,
  type ConditionPresentation,
  type ConditionSeverity,
} from './conditionRegistry';

export type WaterVolumeUnit = 'ml' | 'fl_oz';

export type DataProvenance =
  | 'measured'
  | 'user_reported'
  | 'engine_estimated'
  | 'verified_species_reference'
  | 'unknown';

export type AssessmentFreshness = 'fresh' | 'aging' | 'stale' | 'no_observations';
export type AssessmentReliability = 'verified_observation' | 'estimated_schedule' | 'limited_data' | 'unknown';

export type CareLifecyclePhase =
  | 'awaiting_observation'
  | 'recommendation_active'
  | 'action_recorded_reassessment_pending'
  | 'condition_unchanged'
  | 'additional_attention_required';

/**
 * Optional forward-compatible fields that future backend engine versions may return
 * alongside the current `GardenPlant` contract. Never manufactured on the frontend.
 */
export interface OptionalEngineWateringFields {
  recommended_water_ml?: number | null;
  recommended_water_min_ml?: number | null;
  recommended_water_max_ml?: number | null;
  earliest_water_at?: string | null;
  latest_water_at?: string | null;
  assessment_confidence?: number | null;
}

export type ExtendedGardenPlant = GardenPlant & OptionalEngineWateringFields;

export interface WateringIntelligenceModel {
  plantId: string;
  needsAttention: boolean;
  urgency: ConditionSeverity;
  actionType: ConditionActionability;
  /** Short headline answering "What should I do?" */
  actionHeadline: string;
  /** Timing summary answering "When should I do it?" */
  timingSummary: string;
  /** Exact or qualitative water volume guidance (never invented mL) */
  volumeGuidance: {
    hasQuantitativeVolume: boolean;
    formattedAmount: string | null;
    qualitativeText: string;
    limitationNote: string | null;
  };
  /** Grounded explanation answering "Why is this recommended?" */
  rationale: string;
  environmentalContext: string;
  previousCareSummary: string;
  /** Reliability & freshness answering "How reliable is the assessment?" */
  reliability: AssessmentReliability;
  reliabilityLabel: string;
  freshness: AssessmentFreshness;
  freshnessLabel: string;
  lastObservationAt: string | null;
  /** Explicitly enumerated missing info answering "What information is missing?" */
  missingInformation: string[];
  /** Multi-condition list (primary first) */
  activeConditions: ConditionPresentation[];
  primaryCondition: ConditionPresentation;
  /** Deterministic companion speech grounded strictly in engine output */
  companionSpeech: {
    message: string;
    recommendation: string;
    reason: string;
    primaryActionLabel: string;
    uncertaintyNote: string | null;
  };
  lifecyclePhase: CareLifecyclePhase;
  lifecycleBanner: string | null;
}

export interface PlantAlertItem {
  /** Stable fingerprint tied to plant + status + latest history id so acknowledgement stays accurate */
  fingerprint: string;
  plantId: string;
  plantName: string;
  speciesLabel: string;
  severity: ConditionSeverity;
  headline: string;
  reason: string;
  actionLabel: string;
  deepLinkHash: string;
  isEmergency: boolean;
  acknowledged: boolean;
  assessmentTimestamp: string | null;
}

export interface NotificationPreferences {
  enabled: boolean;
  routineReminders: boolean;
  urgentOnly: boolean;
  quietHoursEnabled: boolean;
  /** 0-23 local hour */
  quietStartHour: number;
  /** 0-23 local hour */
  quietEndHour: number;
}

const PREF_STORAGE_KEY = 'petey-notification-prefs-v1';
const ACK_STORAGE_KEY = 'petey-alert-acks-v1';
const UNIT_STORAGE_KEY = 'petey-water-unit-v1';

const ML_PER_FL_OZ = 29.5735;

export function formatWaterVolume(ml: number, unit: WaterVolumeUnit): string {
  if (!Number.isFinite(ml) || ml <= 0) return '—';
  if (unit === 'fl_oz') {
    const oz = ml / ML_PER_FL_OZ;
    return `${oz >= 10 ? Math.round(oz) : oz.toFixed(1)} fl oz`;
  }
  return `${Math.round(ml)} mL`;
}

export function formatWaterVolumeRange(minMl: number, maxMl: number, unit: WaterVolumeUnit): string {
  return `${formatWaterVolume(minMl, unit)} – ${formatWaterVolume(maxMl, unit)}`;
}

export function readWaterUnitPreference(): WaterVolumeUnit {
  try {
    return localStorage.getItem(UNIT_STORAGE_KEY) === 'fl_oz' ? 'fl_oz' : 'ml';
  } catch {
    return 'ml';
  }
}

export function saveWaterUnitPreference(unit: WaterVolumeUnit): void {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, unit);
  } catch {
    // Ignore storage errors
  }
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabled: false,
  routineReminders: true,
  urgentOnly: false,
  quietHoursEnabled: true,
  quietStartHour: 21,
  quietEndHour: 8,
};

export function readNotificationPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage restrictions
  }
}

export function isWithinQuietHours(prefs: NotificationPreferences, nowHour: number): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const h = ((Math.floor(nowHour) % 24) + 24) % 24;
  const start = ((Math.floor(prefs.quietStartHour) % 24) + 24) % 24;
  const end = ((Math.floor(prefs.quietEndHour) % 24) + 24) % 24;
  if (start === end) return false;
  if (start < end) {
    return h >= start && h < end;
  }
  // Overnight span (e.g., 21:00 -> 08:00)
  return h >= start || h < end;
}

export function readAcknowledgedAlerts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ACK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function acknowledgeAlertFingerprint(fingerprint: string): Record<string, string> {
  const next = { ...readAcknowledgedAlerts(), [fingerprint]: new Date().toISOString() };
  try {
    localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage restrictions
  }
  return next;
}

export function clearAlertAcknowledgement(fingerprint: string): Record<string, string> {
  const next = { ...readAcknowledgedAlerts() };
  delete next[fingerprint];
  try {
    localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage restrictions
  }
  return next;
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function describeCareKind(kind: CareEventKind): string {
  switch (kind) {
    case 'wet':
      return 'Reported wet potting mix';
    case 'dry':
      return 'Reported dry potting mix';
    case 'moist':
      return 'Reported moist potting mix';
    case 'unsure':
      return 'Soil check inconclusive';
    case 'watered':
      return 'Watering logged';
  }
}

function evaluateFreshness(lastEventIso: string | null, nowMs: number): {
  freshness: AssessmentFreshness;
  label: string;
} {
  if (!lastEventIso) {
    return {
      freshness: 'no_observations',
      label: 'No observations recorded yet',
    };
  }
  const ts = new Date(lastEventIso).getTime();
  if (!Number.isFinite(ts)) {
    return { freshness: 'stale', label: 'Timestamp unavailable' };
  }
  const ageHours = Math.max(0, (nowMs - ts) / 3_600_000);
  if (ageHours < 48) {
    return {
      freshness: 'fresh',
      label: ageHours < 1 ? 'Updated just now' : `Updated ${Math.round(ageHours)}h ago`,
    };
  }
  const ageDays = Math.floor(ageHours / 24);
  if (ageDays <= 10) {
    return {
      freshness: 'aging',
      label: `Last logged ${ageDays}d ago (${SHORT_DATE.format(new Date(ts))})`,
    };
  }
  return {
    freshness: 'stale',
    label: `Stale observation (${ageDays}d ago) — recheck recommended`,
  };
}

/**
 * Computes the complete Watering Intelligence presentation model for an individual plant.
 * Never fabricates milliliter volumes, measured sensor values, or instant recovery.
 */
export function buildWateringIntelligence(
  plant: ExtendedGardenPlant,
  options?: {
    weather?: LiveWeatherState | null;
    unit?: WaterVolumeUnit;
    nowMs?: number;
    justRecordedAction?: { plantId: string; kind: CareKind } | null;
  },
): WateringIntelligenceModel {
  const unit = options?.unit ?? 'ml';
  const nowMs = options?.nowMs ?? Date.now();
  const weather = options?.weather ?? null;
  const recentAction = options?.justRecordedAction?.plantId === plant.id ? options.justRecordedAction : null;

  const observedConditions = plant.active_conditions ?? [];
  const hasStandingWater = observedConditions.includes('standing_water');
  const hasSpecificHold = hasStandingWater || observedConditions.includes('wet_potting_mix');
  const rawStatuses: string[] = plant.status === 'wait' && hasSpecificHold ? [] : [plant.status];
  if (plant.watering_locked && !hasStandingWater) {
    rawStatuses.push('watering_locked');
  }
  rawStatuses.push(...observedConditions);
  const activeConditions = resolveMultipleConditions(rawStatuses);
  const primaryCondition = activeConditions[0];

  const lastEvent = plant.history[0] ?? null;
  const lastObservationAt = plant.assessment_updated_at ?? lastEvent?.occurred_at ?? null;
  const { freshness, label: freshnessLabel } = evaluateFreshness(lastObservationAt, nowMs);

  // Enumerate genuine missing information
  const missingInformation: string[] = [];
  if (!plant.species_id) {
    missingInformation.push('Species not identified (using conservative general houseplant guidance).');
  }
  if (plant.drainage === 'unknown') {
    missingInformation.push('Pot drainage holes unknown — confirm drainage before thorough watering.');
  }
  if (plant.history.length === 0) {
    missingInformation.push('No soil moisture checks logged yet for this individual plant.');
  } else if (freshness === 'stale') {
    missingInformation.push('Last recorded observation is over 10 days old; touch the potting mix to refresh.');
  }
  if (!plant.watering_guidance) {
    missingInformation.push('No verified species watering reference on file for this species.');
  }

  // Timing window (honest distinction between suggested now vs estimated check date)
  let timingSummary = 'Check when convenient';
  if (plant.watering_locked) {
    timingSummary = 'Recheck drainage and potting mix before watering';
  } else if (plant.earliest_water_at && plant.latest_water_at) {
    timingSummary = `Window: ${SHORT_DATE.format(new Date(plant.earliest_water_at))} – ${SHORT_DATE.format(
      new Date(plant.latest_water_at),
    )}`;
  } else if (plant.status === 'ready') {
    timingSummary = 'Today — dry potting mix reported';
  } else if (plant.status === 'wait') {
    timingSummary = plant.next_check_at
      ? `Hold watering · Est. recheck ${SHORT_DATE.format(new Date(plant.next_check_at))}`
      : 'Hold watering · Recheck in 1–2 days';
  } else if (plant.status === 'rest') {
    timingSummary = plant.next_check_at
      ? `No watering needed · Est. next check ${SHORT_DATE.format(new Date(plant.next_check_at))}`
      : 'Resting after recent watering';
  } else if (plant.status === 'details') {
    timingSummary = 'Before watering — verify pot drainage & guidance';
  } else if (plant.next_check_at) {
    const dueMs = new Date(plant.next_check_at).getTime();
    timingSummary =
      dueMs <= nowMs
        ? 'Due now (estimated check date reached)'
        : `Estimated check ${SHORT_DATE.format(new Date(dueMs))}`;
  }

  // Water volume: ONLY render numeric mL / fl oz if the backend actually supplied it!
  let formattedAmount: string | null = null;
  let hasQuantitativeVolume = false;
  if (
    typeof plant.recommended_water_min_ml === 'number' &&
    typeof plant.recommended_water_max_ml === 'number' &&
    plant.recommended_water_min_ml > 0 &&
    plant.recommended_water_max_ml >= plant.recommended_water_min_ml
  ) {
    hasQuantitativeVolume = true;
    formattedAmount = formatWaterVolumeRange(plant.recommended_water_min_ml, plant.recommended_water_max_ml, unit);
  } else if (typeof plant.recommended_water_ml === 'number' && plant.recommended_water_ml > 0) {
    hasQuantitativeVolume = true;
    formattedAmount = formatWaterVolume(plant.recommended_water_ml, unit);
  }

  const volumeGuidance = {
    hasQuantitativeVolume,
    formattedAmount,
    qualitativeText:
      plant.watering_locked || plant.status === 'wait'
        ? '0 mL — Hold off on watering.'
        : plant.status === 'rest'
          ? 'No watering needed right now.'
          : plant.drainage === 'no'
            ? 'Pot lacks drainage holes — water sparingly only when deeply dry so water never pools.'
            : 'Qualitative guidance only: water thoroughly until excess exits drainage holes, then empty the saucer.',
    limitationNote:
      hasQuantitativeVolume || plant.watering_locked || plant.status === 'wait' || plant.status === 'rest'
        ? null
        : 'Petey has no verified milliliter estimate for this plant. Follow its care guidance and check how the pot drains.',
  };

  // Reliability assessment (separated from condition severity!)
  let reliability: AssessmentReliability = 'estimated_schedule';
  let reliabilityLabel = 'Estimated check schedule (not a live soil sensor)';
  if (primaryCondition.domain === 'fallback') {
    reliability = 'unknown';
    reliabilityLabel = 'Unknown status — manual inspection required';
  } else if (freshness === 'fresh' && hasSpecificHold) {
    reliability = 'verified_observation';
    reliabilityLabel = 'Based on your recent observation';
  } else if (plant.history.length === 0 || plant.drainage === 'unknown' || !plant.species_id) {
    reliability = 'limited_data';
    reliabilityLabel = 'Limited plant data — confirm by touching potting mix';
  } else if (freshness === 'fresh' && (lastEvent?.kind === 'dry' || lastEvent?.kind === 'moist')) {
    reliability = 'verified_observation';
    reliabilityLabel = 'Based on your recent observation';
  } else if (freshness === 'stale') {
    reliability = 'limited_data';
    reliabilityLabel = 'Stale history — touch potting mix for a fresh check';
  }

  // Previous care summary
  const previousCareSummary = lastEvent
    ? `${describeCareKind(lastEvent.kind)} on ${SHORT_DATE.format(new Date(lastEvent.occurred_at))}`
    : 'No previous soil checks or waterings logged yet.';

  // Environmental context (clearly labeled as local outdoor weather context, NOT indoor sensor telemetry)
  const environmentalContext = weather?.source === 'google-weather'
    ? [
        `${weather.locationLabel} outdoors`,
        formatWeatherReading(weather.temperatureC, '°C'),
        formatWeatherReading(weather.relativeHumidity, '% RH'),
        weather.conditionLabel,
      ].filter(Boolean).join(' · ') + `. ${weather.careContext}`
    : 'Live outdoor weather is unavailable. Check the potting mix directly.';

  // Smart watering lifecycle phase (NEVER declare physical recovery right after pressing "Log watering")
  let lifecyclePhase: CareLifecyclePhase = 'recommendation_active';
  let lifecycleBanner: string | null = null;
  if (recentAction?.kind === 'watered') {
    lifecyclePhase = 'action_recorded_reassessment_pending';
    lifecycleBanner =
      'Watering action recorded in care history. Reassessment pending — physical recovery is confirmed only on future observations.';
  } else if (recentAction && recentAction.kind === 'unsure') {
    lifecyclePhase = 'awaiting_observation';
    lifecycleBanner = 'Inconclusive check logged. Hold off on watering until you can confirm mix moisture.';
  } else if (recentAction && (recentAction.kind === 'dry' || recentAction.kind === 'moist')) {
    lifecyclePhase = plant.status === 'details' ? 'additional_attention_required' : 'recommendation_active';
    lifecycleBanner = 'Observation saved and care recommendation refreshed from backend rules.';
  } else if (plant.status === 'details' || primaryCondition.severity === 'urgent' || primaryCondition.severity === 'high') {
    lifecyclePhase = 'additional_attention_required';
  } else if (plant.history.length === 0 || plant.status === 'check') {
    lifecyclePhase = 'awaiting_observation';
  }

  const needsAttention =
    Boolean(plant.watering_locked) ||
    plant.status === 'ready' ||
    plant.status === 'check' ||
    plant.status === 'details' ||
    primaryCondition.severity === 'urgent' ||
    primaryCondition.severity === 'high' ||
    primaryCondition.domain === 'fallback';

  // Grounded headline answering "What should I do?"
  let actionHeadline = primaryCondition.label;
  if (plant.watering_locked) {
    actionHeadline = 'Do not water yet';
  } else if (plant.status === 'ready') {
    actionHeadline = 'Water now';
  } else if (plant.status === 'wait') {
    actionHeadline = 'Do not water yet';
  } else if (plant.status === 'rest') {
    actionHeadline = 'No watering needed';
  } else if (plant.status === 'check') {
    actionHeadline = 'Check potting mix first';
  } else if (plant.status === 'details') {
    actionHeadline =
      plant.species_id === null
        ? 'Identify this plant to get advice'
        : 'Confirm drainage & care details first';
  }

  const primaryActionLabel =
    plant.status === 'ready' && !plant.watering_locked
      ? 'Log watering'
      : plant.status === 'check'
        ? 'Record soil condition'
        : plant.status === 'details'
          ? 'Run condition check'
          : 'Check potting mix';

  const uncertaintyNote =
    missingInformation.length > 0
      ? missingInformation[0]
      : reliability === 'estimated_schedule'
        ? 'Check dates are estimates — always confirm by feeling the mix before watering.'
        : null;

  return {
    plantId: plant.id,
    needsAttention,
    urgency: primaryCondition.severity,
    actionType: plant.watering_locked ? 'do_not_water' : primaryCondition.actionability,
    actionHeadline,
    timingSummary,
    volumeGuidance,
    rationale: plant.lock_reason || plant.message || primaryCondition.careInstruction,
    environmentalContext,
    previousCareSummary,
    reliability,
    reliabilityLabel,
    freshness,
    freshnessLabel,
    lastObservationAt,
    missingInformation,
    activeConditions,
    primaryCondition,
    companionSpeech: {
      message: primaryCondition.companionMessage,
      recommendation: actionHeadline,
      reason: plant.lock_reason || plant.message || primaryCondition.careInstruction,
      primaryActionLabel,
      uncertaintyNote,
    },
    lifecyclePhase,
    lifecycleBanner,
  };
}

/**
 * Prioritizes owned plants strictly by documented urgency / actionability rules
 * (urgent brake/risk -> ready to water -> details/info required -> soil check due -> wait/rest).
 */
export function sortPlantsByActionPriority<T extends ExtendedGardenPlant>(plants: readonly T[]): T[] {
  const rank = (p: ExtendedGardenPlant): number => {
    if (p.watering_locked) return 0;
    const cond = getConditionPresentation(p.status);
    const sev = severityRank(cond.severity);
    if (p.status === 'ready') return 1;
    if (p.status === 'details') return 2;
    if (p.status === 'check') return 3;
    if (p.status === 'wait') return 4;
    if (p.status === 'rest') return 5;
    return 3 + sev;
  };
  return [...plants].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Generates condition-driven alerts for all plants requiring attention or confirmation.
 * Acknowledging an alert marks it acknowledged without pretending the plant condition is resolved.
 */
export function buildPlantAlerts(
  plants: readonly ExtendedGardenPlant[],
  acknowledgedMap: Record<string, string>,
): PlantAlertItem[] {
  const sorted = sortPlantsByActionPriority(plants);
  const alerts: PlantAlertItem[] = [];

  for (const plant of sorted) {
    const intel = buildWateringIntelligence(plant);
    if (!intel.needsAttention) continue;
    const latestEventId = plant.history[0]?.id ?? 'none';
    const fingerprint = `${plant.id}:${plant.status}:${plant.watering_locked ? 'locked' : 'open'}:${latestEventId}`;
    alerts.push({
      fingerprint,
      plantId: plant.id,
      plantName: plant.name,
      speciesLabel: plant.species_id ?? plant.common_name ?? 'Unidentified houseplant',
      severity: intel.urgency,
      headline: intel.actionHeadline,
      reason: intel.rationale,
      actionLabel: intel.companionSpeech.primaryActionLabel,
      deepLinkHash: `?plant=${encodeURIComponent(plant.id)}&action=care`,
      isEmergency: intel.urgency === 'urgent',
      acknowledged: Boolean(acknowledgedMap[fingerprint]),
      assessmentTimestamp: intel.lastObservationAt,
    });
  }

  return alerts;
}

/* ==========================================================================
   Hydration Cart — Safety-First Watering Round Domain Logic
   ========================================================================== */

export type HydrationEligibility = 'eligible' | 'check_first' | 'blocked' | 'resting';

export interface HydrationCartSummary {
  count: number;
  quantitativeCount: number;
  qualitativeCount: number;
  formattedVolumeTotal: string | null;
  volumeSummaryLabel: string;
  drainageCautionCount: number;
}

/**
 * Determines whether a plant is safely eligible to enter a watering round (Hydration Cart).
 * Still-moist (`wait`) and root-rot-locked plants are strictly blocked; unverified plants
 * require a soil check first so owners never water blindly.
 */
export function getHydrationEligibility(plant: ExtendedGardenPlant): HydrationEligibility {
  if (plant.watering_locked || plant.status === 'wait') return 'blocked';
  if (plant.status === 'ready') return 'eligible';
  if (plant.status === 'check' || plant.status === 'details') return 'check_first';
  return 'resting';
}

/**
 * Keeps only cart plant IDs that still exist and remain safely eligible (`ready` & unlocked).
 */
export function filterEligibleCartIds(
  cartIds: readonly string[],
  plants: readonly ExtendedGardenPlant[],
): string[] {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const id of cartIds) {
    if (seen.has(id)) continue;
    const plant = byId.get(id);
    if (plant && getHydrationEligibility(plant) === 'eligible') {
      seen.add(id);
      valid.push(id);
    }
  }
  return valid;
}

/**
 * Summarizes queued Hydration Cart plants strictly from real backend fields.
 * NEVER fabricates milliliter totals when backend volume fields are absent.
 */
export function buildHydrationCartSummary(
  cartPlants: readonly ExtendedGardenPlant[],
  unit: WaterVolumeUnit = 'ml',
): HydrationCartSummary {
  let quantitativeCount = 0;
  let qualitativeCount = 0;
  let totalMinMl = 0;
  let totalMaxMl = 0;
  let hasRange = false;
  let drainageCautionCount = 0;

  for (const plant of cartPlants) {
    if (plant.drainage === 'no' || plant.drainage === 'unknown') {
      drainageCautionCount += 1;
    }

    if (
      typeof plant.recommended_water_min_ml === 'number' &&
      typeof plant.recommended_water_max_ml === 'number' &&
      plant.recommended_water_min_ml > 0 &&
      plant.recommended_water_max_ml >= plant.recommended_water_min_ml
    ) {
      quantitativeCount += 1;
      totalMinMl += plant.recommended_water_min_ml;
      totalMaxMl += plant.recommended_water_max_ml;
      if (plant.recommended_water_max_ml > plant.recommended_water_min_ml) {
        hasRange = true;
      }
    } else if (typeof plant.recommended_water_ml === 'number' && plant.recommended_water_ml > 0) {
      quantitativeCount += 1;
      totalMinMl += plant.recommended_water_ml;
      totalMaxMl += plant.recommended_water_ml;
    } else {
      qualitativeCount += 1;
    }
  }

  let formattedVolumeTotal: string | null = null;
  if (quantitativeCount > 0) {
    formattedVolumeTotal = hasRange
      ? formatWaterVolumeRange(totalMinMl, totalMaxMl, unit)
      : formatWaterVolume(totalMinMl, unit);
  }

  let volumeSummaryLabel = 'None queued';
  if (cartPlants.length > 0) {
    if (quantitativeCount === 0) {
      volumeSummaryLabel = 'Qualitative (no mL estimate)';
    } else if (qualitativeCount === 0 && formattedVolumeTotal) {
      volumeSummaryLabel = formattedVolumeTotal;
    } else if (formattedVolumeTotal) {
      volumeSummaryLabel = `${formattedVolumeTotal} + ${qualitativeCount} qualitative`;
    }
  }

  return {
    count: cartPlants.length,
    quantitativeCount,
    qualitativeCount,
    formattedVolumeTotal,
    volumeSummaryLabel,
    drainageCautionCount,
  };
}

