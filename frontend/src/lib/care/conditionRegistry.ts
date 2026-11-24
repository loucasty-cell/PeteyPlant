/**
 * Typed Condition-State Presentation Registry (Petey Plant Core Intelligence).
 *
 * Grounded strictly in the real backend status identifiers audited across:
 * 1. `backend/services/garden.py` (5 persistent garden care statuses)
 * 2. `backend/services/plant_health.py` (3 triage statuses + 8 symptom identifiers)
 * 3. `backend/services/petey_muse_botanical_engine.py` (7 biophysical diagnostic codes)
 * 4. `backend/services/timeseries_ml.py` (3 timeseries anomaly identifiers)
 * 5. `backend/services/muse_creative.py` & `backend/main.py` (4 expression/brake states)
 *
 * Design rules:
 * - Separates physical/estimated condition, recommended action, severity, notification
 *   priority, and companion expression. Never collapses these into one health percentage.
 * - Unknown or unrecognized backend status identifiers ALWAYS map to a safe, neutral
 *   fallback (`unknown`) — never treated as healthy.
 * - Never invents backend status identifiers.
 */

import type { PalMood } from '../../components/garden/PalCharacter';
import type { CompanionAnimationId } from '../three/speciesAssetRegistry';

export type ConditionSeverity = 'routine' | 'upcoming' | 'moderate' | 'high' | 'urgent' | 'unknown';
export type ConditionActionability =
  | 'water_now'
  | 'water_later'
  | 'do_not_water'
  | 'check_soil_first'
  | 'inspect_plant'
  | 'isolate_and_inspect'
  | 'adjust_environment'
  | 'info_required'
  | 'no_action_needed';

export type NotificationEligibility = 'none' | 'routine' | 'priority' | 'urgent';

export type ConditionDomain =
  | 'garden_care'
  | 'health_triage'
  | 'owner_symptom'
  | 'botanical_engine'
  | 'timeseries_anomaly'
  | 'biophysics_state'
  | 'fallback';

export type PosturePreset =
  | 'upright_relaxed'
  | 'attentive_lean'
  | 'thirsty_droop'
  | 'cautious_hold'
  | 'stress_restrained'
  | 'low_energy_rest'
  | 'questioning_tilt';

export interface ConditionPresentation {
  /** Exact backend status / diagnostic / symptom identifier */
  id: string;
  domain: ConditionDomain;
  label: string;
  severity: ConditionSeverity;
  actionability: ConditionActionability;
  companionMood: PalMood;
  animationPreset: CompanionAnimationId;
  posturePreset: PosturePreset;
  /** Grounded deterministic companion line (concise, calm, non-guilt-inducing) */
  companionMessage: string;
  /** Factual care instruction template */
  careInstruction: string;
  notificationEligibility: NotificationEligibility;
  /** Plain-text accessible alternative when 3D is unavailable or for screen readers */
  accessibleText: string;
  /** Static rendering description for 2D/no-WebGL mode */
  staticFallbackLabel: string;
}

const REGISTRY_ENTRIES: ConditionPresentation[] = [
  /* ---------- 1. Persistent Garden Care Statuses (`backend/services/garden.py`) ---------- */
  {
    id: 'ready',
    domain: 'garden_care',
    label: 'Ready to water',
    severity: 'moderate',
    actionability: 'water_now',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'thirsty_droop',
    companionMessage: 'My potting mix felt dry on your last check — I’m ready for a drink.',
    careInstruction: 'Water thoroughly until excess drains out the bottom, then empty any standing saucer water.',
    notificationEligibility: 'priority',
    accessibleText: 'Ready to water based on your dry potting mix report and confirmed pot drainage.',
    staticFallbackLabel: 'Needs watering now',
  },
  {
    id: 'check',
    domain: 'garden_care',
    label: 'Check soil first',
    severity: 'upcoming',
    actionability: 'check_soil_first',
    companionMood: 'curious',
    animationPreset: 'idle',
    posturePreset: 'attentive_lean',
    companionMessage: 'It’s time to check how my potting mix feels before deciding whether to water.',
    careInstruction: 'Touch the potting mix below the surface and record whether it feels dry, still moist, or unsure.',
    notificationEligibility: 'routine',
    accessibleText: 'Estimated soil check is due. Confirm potting mix moisture before watering.',
    staticFallbackLabel: 'Soil check due',
  },
  {
    id: 'wait',
    domain: 'garden_care',
    label: 'Hold off — still moist',
    severity: 'routine',
    actionability: 'do_not_water',
    companionMood: 'relieved',
    animationPreset: 'resting',
    posturePreset: 'cautious_hold',
    companionMessage: 'My potting mix is still holding moisture, so let’s hold off on watering.',
    careInstruction: 'Do not water yet. Empty any standing saucer water and recheck the mix later.',
    notificationEligibility: 'none',
    accessibleText: 'Do not water right now. You recently reported moist potting mix.',
    staticFallbackLabel: 'Hold watering (mix moist)',
  },
  {
    id: 'rest',
    domain: 'garden_care',
    label: 'Resting after watering',
    severity: 'routine',
    actionability: 'water_later',
    companionMood: 'happy',
    animationPreset: 'resting',
    posturePreset: 'upright_relaxed',
    companionMessage: 'Watering is logged in my care history. No watering needed until my next check.',
    careInstruction: 'No watering needed right now. Check the potting mix again around the next estimated check date.',
    notificationEligibility: 'none',
    accessibleText: 'Watering was logged recently. Plant is resting until the next estimated soil check.',
    staticFallbackLabel: 'Resting — no action due',
  },
  {
    id: 'details',
    domain: 'garden_care',
    label: 'More information needed',
    severity: 'high',
    actionability: 'info_required',
    companionMood: 'curious',
    animationPreset: 'idle',
    posturePreset: 'questioning_tilt',
    companionMessage: 'I need a bit more detail about my pot drainage or species guidance before watering.',
    careInstruction: 'Verify whether the inner pot has drainage holes and review species watering guidance before watering.',
    notificationEligibility: 'priority',
    accessibleText: 'Additional pot drainage or species details are needed before Petey can recommend watering.',
    staticFallbackLabel: 'Drainage or species check required',
  },

  /* ---------- 2. Plant Health Triage Statuses (`backend/services/plant_health.py`) ---------- */
  {
    id: 'needs_observation',
    domain: 'health_triage',
    label: 'Additional observation requested',
    severity: 'moderate',
    actionability: 'info_required',
    companionMood: 'curious',
    animationPreset: 'idle',
    posturePreset: 'questioning_tilt',
    companionMessage: 'A quick extra check on my soil, light, or leaves will help narrow down what’s going on.',
    careInstruction: 'Complete the follow-up observation checks before making major care changes.',
    notificationEligibility: 'routine',
    accessibleText: 'More owner observations are needed to narrow down possible causes.',
    staticFallbackLabel: 'Follow-up observation needed',
  },
  {
    id: 'next_steps',
    domain: 'health_triage',
    label: 'Care checks recommended',
    severity: 'moderate',
    actionability: 'inspect_plant',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'attentive_lean',
    companionMessage: 'Based on what you noticed, there are a few practical checks we should do next.',
    careInstruction: 'Follow the prioritized inspection steps from your latest condition check.',
    notificationEligibility: 'priority',
    accessibleText: 'Practical care steps are ready based on your reported plant observations.',
    staticFallbackLabel: 'Actionable checks ready',
  },
  {
    id: 'no_visible_issue',
    domain: 'health_triage',
    label: 'No visible stress reported',
    severity: 'routine',
    actionability: 'no_action_needed',
    companionMood: 'happy',
    animationPreset: 'idle',
    posturePreset: 'upright_relaxed',
    companionMessage: 'No visible stress was reported in your last check — let’s keep up our regular routine.',
    careInstruction: 'Continue routine soil checks and watch new growth for any future changes.',
    notificationEligibility: 'none',
    accessibleText: 'Owner reported no visible issues during the latest condition check.',
    staticFallbackLabel: 'No visible stress reported',
  },

  /* ---------- 3. Owner-Reported Symptom Identifiers (`backend/services/plant_health.py`) ---------- */
  {
    id: 'healthy',
    domain: 'owner_symptom',
    label: 'No visible issue',
    severity: 'routine',
    actionability: 'no_action_needed',
    companionMood: 'happy',
    animationPreset: 'idle',
    posturePreset: 'upright_relaxed',
    companionMessage: 'Everything looked steady on your visual check.',
    careInstruction: 'Keep checking the potting mix before watering.',
    notificationEligibility: 'none',
    accessibleText: 'No visible issue reported.',
    staticFallbackLabel: 'No visible issue',
  },
  {
    id: 'chlorosis_yellowing',
    domain: 'owner_symptom',
    label: 'Yellowing leaves',
    severity: 'moderate',
    actionability: 'inspect_plant',
    companionMood: 'concerned',
    animationPreset: 'idle',
    posturePreset: 'stress_restrained',
    companionMessage: 'Some leaves are yellowing — let’s check soil moisture and light before watering.',
    careInstruction: 'Check below-surface potting mix moisture, pot drainage, and light level before watering.',
    notificationEligibility: 'routine',
    accessibleText: 'Yellowing leaves reported; check soil moisture, drainage, and light.',
    staticFallbackLabel: 'Yellowing leaves reported',
  },
  {
    id: 'necrosis_brown_tips_edges',
    domain: 'owner_symptom',
    label: 'Brown tips or edges',
    severity: 'moderate',
    actionability: 'adjust_environment',
    companionMood: 'concerned',
    animationPreset: 'idle',
    posturePreset: 'stress_restrained',
    companionMessage: 'Brown leaf tips or edges can point to dry air, inconsistent watering, or strong direct sun.',
    careInstruction: 'Check potting mix consistency, window sun intensity, and indoor humidity.',
    notificationEligibility: 'routine',
    accessibleText: 'Brown leaf tips or edges reported; review watering consistency and light exposure.',
    staticFallbackLabel: 'Brown tips/edges reported',
  },
  {
    id: 'spots_lesions_rot',
    domain: 'owner_symptom',
    label: 'Leaf spots, lesions, or soft tissue',
    severity: 'high',
    actionability: 'isolate_and_inspect',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'cautious_hold',
    companionMessage: 'Spotted or soft areas deserve a close look — keep my leaves dry and give them airflow.',
    careInstruction: 'Avoid wetting foliage, increase airflow, and monitor whether spots expand to new leaves.',
    notificationEligibility: 'priority',
    accessibleText: 'Spots, damaged patches, or soft tissue reported; avoid leaf moisture and check spread.',
    staticFallbackLabel: 'Spots or soft tissue reported',
  },
  {
    id: 'wilting_turgor_loss',
    domain: 'owner_symptom',
    label: 'Drooping or wilting',
    severity: 'high',
    actionability: 'check_soil_first',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'thirsty_droop',
    companionMessage: 'My leaves are drooping — please check whether the mix is dry or staying soggy first.',
    careInstruction: 'Feel deep into the potting mix before watering; wilting in wet mix can signal root stress.',
    notificationEligibility: 'priority',
    accessibleText: 'Drooping or wilting reported; check potting mix before watering to distinguish dryness from root stress.',
    staticFallbackLabel: 'Wilting — check soil first',
  },
  {
    id: 'pest_damage_signs',
    domain: 'owner_symptom',
    label: 'Possible pest signs',
    severity: 'high',
    actionability: 'isolate_and_inspect',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'stress_restrained',
    companionMessage: 'Check under my leaves and along my stems for pests, and give nearby plants some space.',
    careInstruction: 'Separate from nearby plants and inspect leaf undersides and stem joints for insects or webbing.',
    notificationEligibility: 'priority',
    accessibleText: 'Possible pest damage signs reported; isolate plant and inspect leaf undersides.',
    staticFallbackLabel: 'Pest inspection needed',
  },
  {
    id: 'etiolation_light_stress',
    domain: 'owner_symptom',
    label: 'Pale or stretched growth',
    severity: 'moderate',
    actionability: 'adjust_environment',
    companionMood: 'curious',
    animationPreset: 'idle',
    posturePreset: 'attentive_lean',
    companionMessage: 'I may be reaching for light or getting uneven sun — let’s check my window spot.',
    careInstruction: 'Compare current window brightness against species light preferences and adjust gradually.',
    notificationEligibility: 'routine',
    accessibleText: 'Pale or stretched growth reported; review light exposure.',
    staticFallbackLabel: 'Light stress check',
  },
  {
    id: 'mechanical_or_senescence',
    domain: 'owner_symptom',
    label: 'Older leaf aging or tear',
    severity: 'routine',
    actionability: 'no_action_needed',
    companionMood: 'idle',
    animationPreset: 'idle',
    posturePreset: 'upright_relaxed',
    companionMessage: 'One aging leaf or physical bump is often normal — just watch that new growth stays steady.',
    careInstruction: 'Monitor whether the change stays limited to that leaf while new leaves emerge cleanly.',
    notificationEligibility: 'none',
    accessibleText: 'Isolated tear or older leaf senescence reported; monitor new growth.',
    staticFallbackLabel: 'Isolated leaf wear',
  },

  /* ---------- 4. Biophysical Differential Engine Codes (`petey_muse_botanical_engine.py`) ---------- */
  {
    id: 'HOMEOSTASIS_OPTIMAL',
    domain: 'botanical_engine',
    label: 'Stable conditions (model)',
    severity: 'routine',
    actionability: 'no_action_needed',
    companionMood: 'happy',
    animationPreset: 'idle',
    posturePreset: 'upright_relaxed',
    companionMessage: 'Model parameters are within a comfortable range right now.',
    careInstruction: 'Maintain normal observation cadence; no corrective intervention indicated.',
    notificationEligibility: 'none',
    accessibleText: 'Engine model indicates parameters within expected species bounds.',
    staticFallbackLabel: 'Within model range',
  },
  {
    id: 'BIOTIC_OOMYCETE_PYTHIUM',
    domain: 'botanical_engine',
    label: 'High root-rot risk (hypoxic soil)',
    severity: 'urgent',
    actionability: 'do_not_water',
    companionMood: 'concerned',
    animationPreset: 'resting',
    posturePreset: 'cautious_hold',
    companionMessage: 'My roots are at risk from prolonged wet soil — please pause watering and improve airflow.',
    careInstruction: 'Do not water. Empty standing water, maximize drainage and airflow, and inspect roots if wilting continues.',
    notificationEligibility: 'urgent',
    accessibleText: 'Urgent overwatering and root-rot risk flagged by biophysical model. Pause watering.',
    staticFallbackLabel: 'Root-rot risk — hold watering',
  },
  {
    id: 'BIOTIC_ACARI_TETRANYCHUS',
    domain: 'botanical_engine',
    label: 'Hot-dry spider mite risk',
    severity: 'high',
    actionability: 'isolate_and_inspect',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'stress_restrained',
    companionMessage: 'Dry air makes me vulnerable to mites — check under my leaves for fine webbing.',
    careInstruction: 'Inspect undersides of leaves for stippling or fine webbing and moderate excessively dry air.',
    notificationEligibility: 'priority',
    accessibleText: 'Biophysical model flags elevated spider mite risk under dry air conditions.',
    staticFallbackLabel: 'Elevated dry-air pest risk',
  },
  {
    id: 'ABIOTIC_FLUORIDE_TIP_NECROSIS',
    domain: 'botanical_engine',
    label: 'Water-mineral tip sensitivity',
    severity: 'moderate',
    actionability: 'adjust_environment',
    companionMood: 'curious',
    animationPreset: 'idle',
    posturePreset: 'stress_restrained',
    companionMessage: 'Minerals in tap water can crisp my leaf tips — filtered or rainwater helps.',
    careInstruction: 'Consider switching to filtered, distilled, or rainwater if brown leaf tips appear.',
    notificationEligibility: 'routine',
    accessibleText: 'Model flags sensitivity to fluoride or dissolved minerals in tap water.',
    staticFallbackLabel: 'Mineral tip sensitivity',
  },
  {
    id: 'ABIOTIC_OSMOTIC_SALT_TOXICITY',
    domain: 'botanical_engine',
    label: 'Fertilizer salt buildup risk',
    severity: 'moderate',
    actionability: 'adjust_environment',
    companionMood: 'concerned',
    animationPreset: 'idle',
    posturePreset: 'stress_restrained',
    companionMessage: 'Excess fertilizer salts can stress roots — pause feeding and flush only when the mix dries.',
    careInstruction: 'Hold fertilizer applications and watch for white mineral crust on the soil surface.',
    notificationEligibility: 'routine',
    accessibleText: 'Model flags elevated fertilizer salt concentration risk.',
    staticFallbackLabel: 'Salt buildup risk',
  },
  {
    id: 'ABIOTIC_NEGATIVE_CARBON_ETIOLATION',
    domain: 'botanical_engine',
    label: 'Insufficient light (low PPFD)',
    severity: 'moderate',
    actionability: 'adjust_environment',
    companionMood: 'curious',
    animationPreset: 'idle',
    posturePreset: 'low_energy_rest',
    companionMessage: 'Light levels look dim for steady growth — a brighter indirect spot would help.',
    careInstruction: 'Move gradually closer to an unobstructed window with bright indirect light.',
    notificationEligibility: 'routine',
    accessibleText: 'Model flags low light below species maintenance range.',
    staticFallbackLabel: 'Low light flagged',
  },
  {
    id: 'ABIOTIC_PSII_PHOTOINHIBITION',
    domain: 'botanical_engine',
    label: 'Excessive direct light / heat stress',
    severity: 'high',
    actionability: 'adjust_environment',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'stress_restrained',
    companionMessage: 'Direct sun is intense right now — filter the light or step me slightly back from the glass.',
    careInstruction: 'Filter direct midday sun with a sheer curtain or shift slightly back from hot window glass.',
    notificationEligibility: 'priority',
    accessibleText: 'Model flags excessive light intensity risking leaf scorch or heat stress.',
    staticFallbackLabel: 'High light / heat stress',
  },

  /* ---------- 5. Timeseries ML Anomalies & Brake States (`timeseries_ml.py`, `main.py`, `muse_creative.py`) ---------- */
  {
    id: 'soil_stuck_wet',
    domain: 'timeseries_anomaly',
    label: 'Soil staying wet too long',
    severity: 'high',
    actionability: 'do_not_water',
    companionMood: 'concerned',
    animationPreset: 'resting',
    posturePreset: 'cautious_hold',
    companionMessage: 'My soil has stayed above ideal moisture for several days — hold off on watering.',
    careInstruction: 'Do not water. Confirm drainage holes are clear and allow soil aeration before rechecking.',
    notificationEligibility: 'priority',
    accessibleText: 'Timeseries anomaly: potting mix remained above species maximum moisture for 3+ days.',
    staticFallbackLabel: 'Soil stuck wet — hold water',
  },
  {
    id: 'vpd_spike',
    domain: 'timeseries_anomaly',
    label: 'Sudden dry-air / VPD spike',
    severity: 'moderate',
    actionability: 'check_soil_first',
    companionMood: 'curious',
    animationPreset: 'sway',
    posturePreset: 'stress_restrained',
    companionMessage: 'The air got noticeably drier recently — my potting mix may dry faster than usual.',
    careInstruction: 'Check potting mix moisture slightly earlier than usual and keep away from heating or AC vents.',
    notificationEligibility: 'routine',
    accessibleText: 'Timeseries anomaly: sudden spike in vapor pressure deficit (dry air).',
    staticFallbackLabel: 'Dry-air spike detected',
  },
  {
    id: 'missed_watering',
    domain: 'timeseries_anomaly',
    label: 'Overdue for soil check & water',
    severity: 'high',
    actionability: 'check_soil_first',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'thirsty_droop',
    companionMessage: 'It’s been a while since my last watering and my mix looks low — please check my soil.',
    careInstruction: 'Check the potting mix immediately and water thoroughly if dry and well-draining.',
    notificationEligibility: 'priority',
    accessibleText: 'Timeseries anomaly: multiple days since watering with moisture below species minimum.',
    staticFallbackLabel: 'Overdue watering check',
  },
  {
    id: 'watering_locked',
    domain: 'biophysics_state',
    label: 'Watering locked (root-rot brake)',
    severity: 'urgent',
    actionability: 'do_not_water',
    companionMood: 'concerned',
    animationPreset: 'resting',
    posturePreset: 'cautious_hold',
    companionMessage: 'Watering is paused by the root-rot safety brake until humidity and soil dry out.',
    careInstruction: 'Do not water. Let the substrate dry and increase air circulation around the pot.',
    notificationEligibility: 'urgent',
    accessibleText: 'Emergency root-rot brake active: watering is locked until conditions dry.',
    staticFallbackLabel: 'Watering locked — do not water',
  },
  {
    id: 'root-rot ghost',
    domain: 'biophysics_state',
    label: 'Severe overwatering stress',
    severity: 'urgent',
    actionability: 'do_not_water',
    companionMood: 'concerned',
    animationPreset: 'resting',
    posturePreset: 'cautious_hold',
    companionMessage: 'Too much moisture has built up — pause watering right away and check my roots.',
    careInstruction: 'Stop watering immediately, drain standing water, and inspect root health.',
    notificationEligibility: 'urgent',
    accessibleText: 'Severe overwatering risk state; stop watering and inspect drainage.',
    staticFallbackLabel: 'Overwatering stress',
  },
  {
    id: 'parched cactus',
    domain: 'biophysics_state',
    label: 'Severe dehydration stress',
    severity: 'urgent',
    actionability: 'check_soil_first',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'thirsty_droop',
    companionMessage: 'My mix is very dry — check my soil and give me a slow, thorough soak if confirmed.',
    careInstruction: 'Confirm the mix is dry throughout, then water slowly until water exits the drainage holes.',
    notificationEligibility: 'urgent',
    accessibleText: 'Severe dehydration state; confirm dry soil and water thoroughly.',
    staticFallbackLabel: 'Severe dehydration state',
  },
  {
    id: 'wilted',
    domain: 'biophysics_state',
    label: 'Wilted / low vigor',
    severity: 'high',
    actionability: 'check_soil_first',
    companionMood: 'concerned',
    animationPreset: 'sway',
    posturePreset: 'thirsty_droop',
    companionMessage: 'I’m losing firmness — check my potting mix first before adding water.',
    careInstruction: 'Inspect both potting mix moisture and drainage before deciding whether to water or dry out.',
    notificationEligibility: 'priority',
    accessibleText: 'Wilted state; inspect soil moisture and drainage before acting.',
    staticFallbackLabel: 'Wilted — inspect mix',
  },
];

const REGISTRY_MAP = new Map<string, ConditionPresentation>(
  REGISTRY_ENTRIES.map((entry) => [entry.id, entry]),
);

/** Safe neutral fallback for any unrecognized or missing backend status identifier. */
export const UNKNOWN_CONDITION_PRESENTATION: ConditionPresentation = {
  id: 'unknown',
  domain: 'fallback',
  label: 'Condition unknown',
  severity: 'unknown',
  actionability: 'info_required',
  companionMood: 'curious',
  animationPreset: 'idle',
  posturePreset: 'questioning_tilt',
  companionMessage: 'I don’t have enough verified information about my current state yet.',
  careInstruction: 'Inspect the potting mix and leaves, then record a fresh observation before watering.',
  notificationEligibility: 'routine',
  accessibleText: 'Plant condition is unknown or unrecognized. Record a fresh observation before acting.',
  staticFallbackLabel: 'Condition unknown — check plant',
};

export function getConditionPresentation(statusId: string | null | undefined): ConditionPresentation {
  if (!statusId) return UNKNOWN_CONDITION_PRESENTATION;
  const direct = REGISTRY_MAP.get(statusId);
  if (direct) return direct;
  const normalized = statusId.trim();
  return REGISTRY_MAP.get(normalized) ?? {
    ...UNKNOWN_CONDITION_PRESENTATION,
    id: normalized || 'unknown',
    label: 'Unrecognized status — verify plant',
    accessibleText: `Received unrecognized status "${normalized}". Treating safely as unknown until you check the plant.`,
  };
}

export function resolveMultipleConditions(statusIds: readonly (string | null | undefined)[]): ConditionPresentation[] {
  const seen = new Set<string>();
  const resolved: ConditionPresentation[] = [];
  for (const raw of statusIds) {
    if (!raw) continue;
    const item = getConditionPresentation(raw);
    if (!seen.has(item.id)) {
      seen.add(item.id);
      resolved.push(item);
    }
  }
  if (resolved.length === 0) return [UNKNOWN_CONDITION_PRESENTATION];
  return resolved.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export function severityRank(severity: ConditionSeverity): number {
  switch (severity) {
    case 'urgent':
      return 0;
    case 'high':
      return 1;
    case 'moderate':
      return 2;
    case 'upcoming':
      return 3;
    case 'unknown':
      return 4;
    case 'routine':
      return 5;
  }
}

export function getRegisteredConditionCount(): number {
  return REGISTRY_ENTRIES.length;
}
