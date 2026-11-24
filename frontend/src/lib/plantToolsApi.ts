import { checkBackendAvailable } from './gardenApi';

export interface LensCapability {
  status: 'available' | 'unavailable';
  model_version: string | null;
  taxonomy_version: string;
  message: string;
}

export interface LensCandidate {
  species_key: string | null;
  original_label: string;
  scientific_name: string | null;
  common_name: string | null;
  taxonomic_rank: 'species' | 'genus' | 'unknown';
  confidence: number | null;
}

export interface LensResult {
  request_id: string;
  model_version: string | null;
  taxonomy_version: string;
  status: 'possible_matches' | 'need_another_photo' | 'unavailable';
  candidates: LensCandidate[];
  another_photo_recommended: boolean;
  limitations: string[];
  fallback_used: boolean;
}

export const symptoms = {
  healthy: 'No visible issue',
  chlorosis_yellowing: 'Yellowing leaves',
  necrosis_brown_tips_edges: 'Brown tips or edges',
  spots_lesions_rot: 'Spots, damaged patches, or soft tissue',
  wilting_turgor_loss: 'Drooping or wilting',
  pest_damage_signs: 'Webbing, residue, or insect damage',
  etiolation_light_stress: 'Pale, stretched growth',
  mechanical_or_senescence: 'A tear or an older leaf declining',
} as const;

export type PlantSymptom = keyof typeof symptoms;

export interface HealthObservations {
  symptoms: PlantSymptom[];
  soil: 'unknown' | 'dry' | 'moist' | 'wet';
  drainage: 'unknown' | 'yes' | 'no';
  pests: 'unknown' | 'seen' | 'none_seen';
  light: 'unknown' | 'low' | 'bright_indirect' | 'strong_direct';
  spread: 'unknown' | 'yes' | 'no';
}

export type HealthContext = Exclude<keyof HealthObservations, 'symptoms'>;

export interface HealthResult {
  status: 'needs_observation' | 'next_steps' | 'no_visible_issue';
  headline: string;
  summary: string;
  possible_causes: { label: string; reason: string }[];
  steps: string[];
  follow_up: HealthContext[];
  sources: { title: string; url: string }[];
  evidence_type: 'owner_observations';
}

const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function request<T>(path: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  if (!base) {
    const online = await checkBackendAvailable(signal);
    if (!online) {
      throw new Error(
        'Petey’s backend service is currently offline. Start the FastAPI backend on port 8000 to run live triage or photo identification.',
      );
    }
  }
  const response = await fetch(`${base}/api/v1${path}`, { ...init, signal });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === 'string' ? error.detail : 'Petey couldn’t complete this request. Try again.');
  }
  return response.json() as Promise<T>;
}

export const plantToolsApi = {
  async lensStatus(signal: AbortSignal): Promise<LensCapability> {
    const online = await checkBackendAvailable(signal);
    if (!online) {
      return {
        status: 'unavailable',
        model_version: null,
        taxonomy_version: 'unavailable',
        message: 'Photo identification is offline while the FastAPI backend is not running. You can still test the camera or search manually by species name.',
      };
    }
    return request<LensCapability>('/lens/status', signal);
  },
  identify: (photo: Blob, signal: AbortSignal) => request<LensResult>('/lens/identify', signal, {
    method: 'POST',
    headers: { 'Content-Type': photo.type },
    body: photo,
  }),
  triage: (observations: HealthObservations, signal: AbortSignal) => request<HealthResult>('/plant-health/triage', signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(observations),
  }),
};
