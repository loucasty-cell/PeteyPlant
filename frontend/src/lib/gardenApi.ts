export type Drainage = 'yes' | 'no' | 'unknown';
export type CareKind = 'dry' | 'moist' | 'unsure' | 'watered';

export type CareEventKind = CareKind | 'wet';

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
  watering_advice_expires_at?: string | null;
  watering_guidance: string | null;
  watering_source: string | null;
  history: { id: string; kind: CareEventKind; occurred_at: string; observation?: Omit<CheckupInput, 'based_on'> | null }[];
}

export interface CheckupInput {
  soil: 'dry' | 'moist' | 'wet' | 'unknown';
  inspection_depth: 'recommended' | 'surface' | 'unknown';
  standing_water: Drainage;
  drainage: Drainage;
  based_on: string | null;
  captured_at: string;
}

export type CheckupQuestion = Exclude<keyof CheckupInput, 'based_on' | 'captured_at'>;

export interface CheckupContext {
  plant_id: string;
  name: string;
  species_id: string | null;
  drainage: Drainage;
  check_prompt: string;
  based_on: string | null;
}

export interface CheckupResult {
  code: 'HOLD_WATER' | 'CHECK_SOIL' | 'CHECK_DRAINAGE' | 'WATER_IF_APPROPRIATE' | 'INSUFFICIENT_EVIDENCE';
  headline: string;
  explanation: string;
  next_step: string;
  source: string | null;
  evidence: { category: string; field: string; value: string }[];
  question: CheckupQuestion | null;
  valid_until: string;
}

export class GardenRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class BackendUnavailableError extends Error {
  readonly kind = 'backend_unavailable' as const;
  constructor(message = 'Could not reach the Petey Plant backend service.') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const keyName = 'petey-garden-key-v1';
const previewFlagKey = 'petey-dev-preview-mode-v1';
const previewStoreKey = 'petey-dev-preview-plants-v1';

let cachedBackendStatus: { available: boolean; checkedAt: number } | null = null;
let inFlightBackendProbe: Promise<boolean> | null = null;

/**
 * Checks whether the Petey Plant FastAPI backend is reachable via the same-origin
 * dev proxy probe without triggering browser CORS or network errors when offline.
 */
export async function checkBackendAvailable(signal?: AbortSignal, force = false): Promise<boolean> {
  if (base || import.meta.env.PROD) return true;
  if (!force && cachedBackendStatus && Date.now() - cachedBackendStatus.checkedAt < 5_000) {
    return cachedBackendStatus.available;
  }
  if (!inFlightBackendProbe) {
    inFlightBackendProbe = (async () => {
      try {
        const res = await fetch('/api/backend-status', {
          signal: AbortSignal.timeout(2500),
        });
        if (!res.ok) {
          cachedBackendStatus = { available: false, checkedAt: Date.now() };
          return false;
        }
        const data = (await res.json().catch(() => null)) as { available?: boolean } | null;
        const available = Boolean(data?.available);
        cachedBackendStatus = { available, checkedAt: Date.now() };
        return available;
      } catch {
        cachedBackendStatus = { available: false, checkedAt: Date.now() };
        return false;
      } finally {
        inFlightBackendProbe = null;
      }
    })();
  }
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return inFlightBackendProbe;
}

export function resetBackendStatusCache(): void {
  cachedBackendStatus = null;
}

interface PreviewSpeciesGuide {
  id: string;
  name: string;
  cultivar: string;
  checkPrompt: string;
  cadenceDays: number;
  guidance: string;
  source: string;
}

/**
 * Curated development-preview catalog mirroring the 8 flagship species in the
 * backend database. Used ONLY when the user explicitly activates development
 * preview mode — never activated silently in production.
 */
const DEV_PREVIEW_SPECIES: PreviewSpeciesGuide[] = [
  {
    id: 'Monstera deliciosa',
    name: 'Monstera',
    cultivar: '',
    checkPrompt: 'Check whether the top quarter to one-third of the potting mix feels dry.',
    cadenceDays: 7,
    guidance:
      'Water thoroughly when the top 25–35% of potting mix has dried, allowing excess water to drain freely. Avoid leaving the pot standing in saucer water.',
    source: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=276548',
  },
  {
    id: 'Epipremnum aureum',
    name: 'Golden Pothos',
    cultivar: '',
    checkPrompt: 'Feel the top 2 inches of potting mix — pothos prefers drying partly between drinks.',
    cadenceDays: 7,
    guidance:
      'Allow the top 1–2 inches of potting mix to dry between waterings. Water until it drains through the bottom holes, then empty the saucer.',
    source: 'https://plants.ces.ncsu.edu/plants/epipremnum-aureum/',
  },
  {
    id: 'Dracaena trifasciata',
    name: 'Snake Plant',
    cultivar: '',
    checkPrompt: 'Check deep into the pot — snake plants need the mix to dry nearly all the way through.',
    cadenceDays: 14,
    guidance:
      'Let the potting mix dry almost completely between waterings, especially in cooler or lower-light months. Overwatering quickly leads to rhizome rot.',
    source: 'https://plants.ces.ncsu.edu/plants/dracaena-trifasciata/',
  },
  {
    id: 'Chlorophytum comosum',
    name: 'Spider Plant',
    cultivar: '',
    checkPrompt: 'Touch the top inch of potting mix to see if it feels lightly dry.',
    cadenceDays: 6,
    guidance:
      'Keep evenly moist during active spring/summer growth, letting just the top inch dry before watering again. Reduce frequency slightly in winter.',
    source: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=281919',
  },
  {
    id: 'Aloe vera',
    name: 'Aloe Vera',
    cultivar: '',
    checkPrompt: 'Make sure the gritty mix feels completely dry before watering.',
    cadenceDays: 14,
    guidance:
      'Soak thoroughly only after the potting mix has dried completely throughout the pot. Fast-draining succulent mix and drainage holes are essential.',
    source: 'https://plants.ces.ncsu.edu/plants/aloe-vera/',
  },
  {
    id: 'Dypsis lutescens',
    name: 'Areca Palm',
    cultivar: '',
    checkPrompt: 'Check if the top inch of mix has just dried while deeper soil stays lightly damp.',
    cadenceDays: 6,
    guidance:
      'Water when the top inch of potting mix dries out. Areca palms prefer lightly moist, well-aerated mix and dislike sitting in soggy soil.',
    source: 'https://www.rhs.org.uk/plants/187250/chrysalidocarpus-lutescens/details',
  },
  {
    id: 'Goeppertia makoyana',
    name: 'Peacock Plant',
    cultivar: '',
    checkPrompt: 'Check the top inch — prayer plants like evenly damp (never waterlogged) mix.',
    cadenceDays: 5,
    guidance:
      'Keep potting mix lightly and evenly moist, watering when the surface begins to dry. Use filtered or rainwater if leaf tips brown easily.',
    source: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=282638',
  },
  {
    id: 'Ficus lyrata',
    name: 'Fiddle-Leaf Fig',
    cultivar: '',
    checkPrompt: 'Check the top 2 inches of potting mix — water only when dry to the second knuckle.',
    cadenceDays: 8,
    guidance:
      'Water deeply once the top 2 inches of mix feel dry. Consistent bright indirect light and good drainage prevent leaf drop and root stress.',
    source: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=282756',
  },
];

export function isPreviewMode(): boolean {
  try {
    return sessionStorage.getItem(previewFlagKey) === '1';
  } catch {
    return false;
  }
}

export function setPreviewMode(enabled: boolean): void {
  try {
    if (enabled) {
      sessionStorage.setItem(previewFlagKey, '1');
    } else {
      sessionStorage.removeItem(previewFlagKey);
    }
  } catch {
    // Ignore storage access restrictions
  }
}

function hoursFromNowIso(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function guideFor(speciesId: string | null): PreviewSpeciesGuide | undefined {
  if (!speciesId) return undefined;
  return DEV_PREVIEW_SPECIES.find((item) => item.id === speciesId);
}

function buildPreviewStarterPlants(): GardenPlant[] {
  const monstera = DEV_PREVIEW_SPECIES[0];
  const pothos = DEV_PREVIEW_SPECIES[1];
  const snake = DEV_PREVIEW_SPECIES[2];
  const spider = DEV_PREVIEW_SPECIES[3];
  const calathea = DEV_PREVIEW_SPECIES[6];

  return [
    {
      id: 'preview-window-monstera',
      name: 'Window Monstera',
      species_id: monstera.id,
      common_name: monstera.name,
      drainage: 'yes',
      status: 'check',
      message: monstera.checkPrompt,
      check_prompt: monstera.checkPrompt,
      next_check_at: hoursFromNowIso(-2),
      watering_guidance: monstera.guidance,
      watering_source: monstera.source,
      history: [{ id: 'preview-evt-1', kind: 'watered', occurred_at: hoursFromNowIso(-24 * 6) }],
    },
    {
      id: 'preview-sunny-snake',
      name: 'Sunny Snake',
      species_id: snake.id,
      common_name: snake.name,
      drainage: 'yes',
      status: 'ready',
      message: 'You noted dry mix on your last check. Water thoroughly and let the pot drain.',
      check_prompt: snake.checkPrompt,
      next_check_at: null,
      watering_guidance: snake.guidance,
      watering_source: snake.source,
      history: [{ id: 'preview-evt-2', kind: 'dry', occurred_at: hoursFromNowIso(-5) }],
    },
    {
      id: 'preview-desk-pothos',
      name: 'Desk Pothos',
      species_id: pothos.id,
      common_name: pothos.name,
      drainage: 'yes',
      status: 'rest',
      message: 'Watering was logged recently. Give the mix a few days before checking again.',
      check_prompt: pothos.checkPrompt,
      next_check_at: hoursFromNowIso(24 * 4),
      watering_guidance: pothos.guidance,
      watering_source: pothos.source,
      history: [
        { id: 'preview-evt-3', kind: 'dry', occurred_at: hoursFromNowIso(-48) },
        { id: 'preview-evt-4', kind: 'watered', occurred_at: hoursFromNowIso(-47) },
      ],
    },
    {
      id: 'preview-shelf-spider',
      name: 'Kitchen Spider',
      species_id: spider.id,
      common_name: spider.name,
      drainage: 'no',
      status: 'details',
      message: 'This pot has no drainage holes. Check deeper in the mix before adding water.',
      check_prompt: spider.checkPrompt,
      next_check_at: hoursFromNowIso(18),
      watering_guidance: spider.guidance,
      watering_source: spider.source,
      history: [{ id: 'preview-evt-5', kind: 'unsure', occurred_at: hoursFromNowIso(-12) }],
    },
    {
      id: 'preview-bath-calathea',
      name: 'Bath Calathea',
      species_id: calathea.id,
      common_name: calathea.name,
      drainage: 'yes',
      status: 'wait',
      message: 'Potting mix still feels moist. Hold off on watering and empty any standing saucer water.',
      check_prompt: calathea.checkPrompt,
      next_check_at: hoursFromNowIso(42),
      watering_guidance: calathea.guidance,
      watering_source: calathea.source,
      history: [{ id: 'preview-evt-6', kind: 'moist', occurred_at: hoursFromNowIso(-6) }],
    },
  ];
}

function readPreviewPlants(): GardenPlant[] {
  try {
    const raw = sessionStorage.getItem(previewStoreKey);
    if (raw) {
      const parsed = JSON.parse(raw) as GardenPlant[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore storage read errors
  }
  const seeded = buildPreviewStarterPlants();
  writePreviewPlants(seeded);
  return seeded;
}

function writePreviewPlants(plants: GardenPlant[]) {
  sessionStorage.setItem(previewStoreKey, JSON.stringify(plants));
}

function applyPreviewCare(plant: GardenPlant, action: { id: string; kind: CareKind }): GardenPlant {
  const guide = guideFor(plant.species_id);
  const cadence = guide?.cadenceDays ?? 7;
  const alreadyRecorded = plant.history.some((entry) => entry.id === action.id);
  const history = alreadyRecorded
    ? plant.history
    : [{ id: action.id, kind: action.kind, occurred_at: new Date().toISOString() }, ...plant.history];

  if (action.kind === 'dry') {
    const ready = plant.drainage === 'yes' && Boolean(guide);
    return {
      ...plant,
      status: ready ? 'ready' : 'details',
      message: ready
        ? 'Preview: dry mix and drainage reported.'
        : 'Check drainage and identify the species before deciding whether to water.',
      next_check_at: hoursFromNowIso(24),
      watering_advice_expires_at: ready ? hoursFromNowIso(24) : null,
      history,
    };
  }
  if (action.kind === 'moist') {
    return {
      ...plant,
      status: 'wait',
      message: 'Hold off on watering. Empty any standing saucer water and check the mix again in a couple of days.',
      next_check_at: hoursFromNowIso(48),
      history,
    };
  }
  if (action.kind === 'unsure') {
    return {
      ...plant,
      status: 'details',
      message: 'Lift the pot to gauge its weight or test with a clean wooden skewer before deciding to water.',
      next_check_at: hoursFromNowIso(24),
      history,
    };
  }
  return {
    ...plant,
    status: 'rest',
    message: `Watering logged (preview estimate: check again in about ${cadence} days).`,
    next_check_at: hoursFromNowIso(cadence * 24),
    history,
  };
}

function gardenKey() {
  const existing = localStorage.getItem(keyName);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(keyName, created);
  return created;
}

async function request<T>(path: string, payload?: object, signal?: AbortSignal): Promise<T> {
  if (!base) {
    const online = await checkBackendAvailable(signal);
    if (!online) {
      throw new BackendUnavailableError(
        'Petey couldn’t connect to the garden service on the backend. Start the FastAPI backend server or enable local development preview.',
      );
    }
  }
  const headers = new Headers({ 'X-Petey-Garden': gardenKey() });
  if (payload) headers.set('Content-Type', 'application/json');
  const timeoutSignal = AbortSignal.timeout(4000);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/garden${path}`, {
      headers,
      signal: combined,
      ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {}),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new BackendUnavailableError(
      'Petey couldn’t connect to the garden service on the backend. Start the backend server or enable local development preview.',
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new GardenRequestError(response.status, typeof error?.detail === 'string' ? error.detail : 'Petey couldn’t reach your garden.');
  }
  return response.json() as Promise<T>;
}

export const gardenApi = {
  checkup: (plantId: string, signal?: AbortSignal) => request<CheckupContext>(`/plants/${plantId}/checkup`, undefined, signal),
  assess: (plantId: string, input: CheckupInput, signal?: AbortSignal) => request<CheckupResult>(`/plants/${plantId}/assessments`, input, signal),
  confirm: (plantId: string, assessmentId: string, input: CheckupInput, signal?: AbortSignal) =>
    request<GardenPlant>(`/plants/${plantId}/assessments/${assessmentId}/confirm`, input, signal),

  async plants(signal?: AbortSignal): Promise<GardenPlant[]> {
    if (isPreviewMode()) return readPreviewPlants();
    return request<GardenPlant[]>('/plants', undefined, signal);
  },

  async species(signal?: AbortSignal): Promise<GardenSpecies[]> {
    if (isPreviewMode()) {
      return DEV_PREVIEW_SPECIES.map(({ id, name, cultivar }) => ({ id, name, cultivar }));
    }
    return request<GardenSpecies[]>('/species', undefined, signal);
  },

  async create(draft: PlantDraft): Promise<GardenPlant> {
    if (isPreviewMode()) {
      const guide = guideFor(draft.species_id);
      const created: GardenPlant = {
        ...draft,
        common_name: guide?.name ?? null,
        status: draft.drainage === 'no' ? 'details' : 'check',
        message:
          draft.drainage === 'no'
            ? 'This pot has no drainage holes. Check moisture deeper in the pot before watering.'
            : guide?.checkPrompt ?? 'Feel the top inch of potting mix before watering.',
        check_prompt: guide?.checkPrompt ?? 'Feel the top inch of potting mix before watering.',
        next_check_at: hoursFromNowIso(0),
        watering_guidance:
          guide?.guidance ?? 'Check soil moisture with your finger before watering and allow excess water to drain.',
        watering_source: guide?.source ?? null,
        history: [],
      };
      const next = [created, ...readPreviewPlants().filter((p) => p.id !== created.id)];
      writePreviewPlants(next);
      return created;
    }
    return request<GardenPlant>('/plants', draft);
  },

  async record(plantId: string, action: { id: string; kind: CareKind }): Promise<GardenPlant> {
    if (isPreviewMode()) {
      const current = readPreviewPlants();
      const target = current.find((item) => item.id === plantId);
      if (!target) {
        throw new Error('Could not find that plant in the local preview garden.');
      }
      const updated = applyPreviewCare(target, action);
      writePreviewPlants(current.map((item) => (item.id === plantId ? updated : item)));
      return updated;
    }
    return request<GardenPlant>(`/plants/${plantId}/care`, action);
  },
};
