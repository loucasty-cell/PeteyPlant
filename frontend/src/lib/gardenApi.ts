export type Drainage = 'yes' | 'no' | 'unknown';
export type CareKind = 'dry' | 'moist' | 'unsure' | 'watered';

export interface GardenSpecies {
  id: string;
  name: string;
  cultivar: string;
}

export interface PlantDraft {
  id: string;
  name: string;
  species_id: string | null;
  drainage: Drainage;
}

export interface GardenPlant extends PlantDraft {
  common_name: string | null;
  status: 'check' | 'ready' | 'wait' | 'rest' | 'details';
  message: string;
  check_prompt: string;
  next_check_at: string | null;
  watering_guidance: string | null;
  watering_source: string | null;
  history: { id: string; kind: CareKind; occurred_at: string }[];
}

const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const keyName = 'petey-garden-key-v1';

function gardenKey() {
  const existing = localStorage.getItem(keyName);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(keyName, created);
  return created;
}

async function request<T>(path: string, payload?: object, signal?: AbortSignal): Promise<T> {
  const headers = new Headers({ 'X-Petey-Garden': gardenKey() });
  if (payload) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${base}/api/v1/garden${path}`, {
    headers,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === 'string' ? error.detail : 'Petey couldn’t reach your garden.');
  }
  return response.json() as Promise<T>;
}

export const gardenApi = {
  plants: (signal?: AbortSignal) => request<GardenPlant[]>('/plants', undefined, signal),
  species: (signal?: AbortSignal) => request<GardenSpecies[]>('/species', undefined, signal),
  create: (draft: PlantDraft) => request<GardenPlant>('/plants', draft),
  record: (plantId: string, action: { id: string; kind: CareKind }) =>
    request<GardenPlant>(`/plants/${plantId}/care`, action),
};
