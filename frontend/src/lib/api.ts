/**
 * api.ts — thin client for the live Petey Plant FastAPI backend.
 *
 * Every call is optional: the shell runs fully offline on the local
 * biophysics engine, and any failed request simply returns null so the
 * UI falls back to local state. No request is ever required for the
 * what-if simulator, the 3D rig, or the quest path to work.
 *
 * Wrapped endpoints only (contract verified against backend/main.py):
 *  GET  /health
 *  GET  /api/v1/plants
 *  GET  /api/v1/plants/{plant_id}
 *  GET  /api/v1/plants/{plant_id}/forecast
 *  POST /api/v1/plants/{plant_id}/water
 *  POST /api/v1/agent/triage { plant_id, symptoms? }
 *  GET  /api/v1/quiz
 * The backend also offers species, scan, sitter, shield, and tools
 * endpoints; they are not wrapped here because the shell does not use
 * them yet — adding a wrapper without a caller would be dead code.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface BackendHealth {
  status: string;
  service: string;
  model_provider?: string;
  model_id?: string;
  creative_model?: string;
  fallback?: boolean;
}

export interface BackendPlant {
  id: string;
  name: string;
  species_common_name: string;
  species_scientific_name: string;
  family: string;
  hp: number;
  xp: number;
  level: number;
  streak_days: number;
  moisture_pct: number;
  vpd_kpa: number;
  watering_locked: boolean;
  lock_reason?: string | null;
  next_water_iso: string;
  mood: string;
  expression?: string;
  droop_angle_deg: number;
  particle_effect: string;
}

export interface TriageTraceStep {
  thought: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_observation: string;
  latency_ms: number;
  muse_model_id: string;
}

export interface TriageResult {
  plant_id: string;
  muse_model_id: string;
  summary: string;
  agent_trace: TriageTraceStep[];
  actions: Record<string, unknown>;
  telemetry: Record<string, unknown>;
}

export const api = {
  health: () => request<BackendHealth>('/health'),
  plants: () => request<{ plants: BackendPlant[] }>('/api/v1/plants'),
  plant: (id: string) => request<BackendPlant>(`/api/v1/plants/${id}`),
  forecast: (id: string) =>
    request<Record<string, unknown>>(`/api/v1/plants/${id}/forecast`),
  water: (id: string) =>
    request<Record<string, unknown>>(`/api/v1/plants/${id}/water`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  triage: (plantId: string, symptoms?: string[]) =>
    request<TriageResult>('/api/v1/agent/triage', {
      method: 'POST',
      body: JSON.stringify({ plant_id: plantId, symptoms: symptoms ?? [] }),
    }),
  quiz: () => request<Record<string, unknown>>('/api/v1/quiz'),
};

export const API_BASE_URL = API_URL;
