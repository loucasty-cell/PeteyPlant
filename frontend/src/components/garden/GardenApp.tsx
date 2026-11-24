import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  Box,
  CalendarCheck,
  Camera,
  Check,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  FlaskConical,
  Home,
  LayoutGrid,
  List,
  MapPin,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShoppingBasket,
  Sparkles,
  Sprout,
  Sun,
  X,
} from 'lucide-react';
import {
  BackendUnavailableError,
  gardenApi,
  isPreviewMode,
  resetBackendStatusCache,
  setPreviewMode,
  type CareKind,
  type Drainage,
  type GardenPlant,
  type GardenSpecies,
  type PlantDraft,
} from '../../lib/gardenApi';
import {
  ALL_ATMOSPHERE_IDS,
  createPreviewWeather,
  defaultTimeWeather,
  fetchGoogleWeather,
  NATURE_THEME_CATEGORIES,
  WEATHER_LOCATIONS,
  WEATHER_THEMES,
  type LiveWeatherState,
  type NatureThemeCategory,
  type WeatherAtmosphereId,
} from '../../lib/weatherService';
import {
  FLAGSHIP_SPECIES_MANIFEST,
  getRegistryCoverageSummary,
} from '../../lib/three/speciesAssetRegistry';
import {
  acknowledgeAlertFingerprint,
  buildPlantAlerts,
  buildWateringIntelligence,
  clearAlertAcknowledgement,
  filterEligibleCartIds,
  getHydrationEligibility,
  isWithinQuietHours,
  readAcknowledgedAlerts,
  readNotificationPreferences,
  readWaterUnitPreference,
  saveNotificationPreferences,
  saveWaterUnitPreference,
  sortPlantsByActionPriority,
  type NotificationPreferences,
  type WaterVolumeUnit,
} from '../../lib/care/careIntelligence';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';
import { PeteyLogo } from './PeteyLogo';
import { WeatherBackdrop } from './WeatherBackdrop';
import { InteractivePlantStage } from './InteractivePlantStage';
import { HomeCareSurface } from './HomeCareSurface';
import { PlantDetailProfile } from './PlantDetailProfile';
import { CareAlertCenter } from './CareAlertCenter';
import './companion-stage.css';

const PeteyLens = lazy(() => import('./PeteyLens'));
const PlantHealth = lazy(() => import('./PlantHealth'));
const PlantLab = lazy(() => import('../lab/PlantLab'));

type PrimaryView = 'home' | 'detail' | 'garden' | 'lens' | 'care' | 'more' | 'add' | 'lab';

const DRAFT_KEY = 'petey-plant-draft-v1';
const RENDER_MODE_KEY = 'petey-disable-3d-v1';
const SELECTED_PLANT_KEY = 'petey-selected-plant-v1';
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const STATUS_LABELS: Record<GardenPlant['status'], string> = {
  check: 'Check soil',
  ready: 'Water now',
  wait: 'Hold off',
  rest: 'Doing well',
  details: 'Needs info',
};

const VIEW_TITLES: Record<PrimaryView, string> = {
  home: 'Petey Plant — Home',
  detail: 'Petey Plant — Plant Care Profile',
  garden: 'Petey Plant — My Garden',
  lens: 'Petey Plant — Petey Lens',
  care: 'Petey Plant — Care & Alerts',
  more: 'Petey Plant — Settings & Catalog',
  add: 'Petey Plant — Add Plant',
  lab: 'Petey Plant — Plant Lab (Demo)',
};

const ATMOSPHERE_LIST: WeatherAtmosphereId[] = ALL_ATMOSPHERE_IDS;

function readDraft(): PlantDraft | null {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as PlantDraft | null;
  } catch {
    return null;
  }
}

function readDisable3D(): boolean {
  try {
    return localStorage.getItem(RENDER_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function readStoredSelectedPlantId(): string | null {
  try {
    return localStorage.getItem(SELECTED_PLANT_KEY);
  } catch {
    return null;
  }
}

function nextCheckLabel(plant: GardenPlant): string {
  if (plant.status === 'ready') return 'Dry mix reported';
  if (plant.status === 'wait') {
    return plant.next_check_at
      ? `Hold · Est. ${DATE_FORMAT.format(new Date(plant.next_check_at))}`
      : 'Hold watering';
  }
  if (plant.status === 'details') return 'Confirm drainage';
  if (!plant.next_check_at) return 'Check potting mix';
  const date = new Date(plant.next_check_at);
  return date.getTime() <= Date.now()
    ? 'Soil check due'
    : `Est. check ${DATE_FORMAT.format(date)}`;
}

function isDueNow(plant: GardenPlant): boolean {
  if (plant.status === 'ready' || plant.status === 'check') return true;
  if (!plant.next_check_at) return false;
  return new Date(plant.next_check_at).getTime() <= Date.now();
}

function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const pref = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(pref.matches);
    pref.addEventListener('change', update);
    return () => pref.removeEventListener('change', update);
  }, []);
  return reduced;
}

function WeatherIcon({ atmosphere }: { atmosphere: WeatherAtmosphereId }) {
  const theme = WEATHER_THEMES[atmosphere];
  if (!theme) {
    return <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.clouds === 'storm' || theme.particles === 'storm-rain') {
    return <CloudLightning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.particles === 'snow') {
    return <CloudSnow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.particles === 'rain' || theme.category === 'Rain & Monsoon') {
    return <CloudRain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.particles === 'mist' || theme.category === 'Mist, Storm & Frost') {
    return <CloudFog className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.celestial === 'moon' || theme.category === 'Nocturnal Biomes') {
    return <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (theme.category === 'Clouds & Breeze' || theme.clouds === 'dense') {
    return <Cloud className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  return <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

/* ==========================================================================
   Add Plant Two-Step Flow (Uses Lightweight BotanicalThumbnails)
   ========================================================================== */

function AddPlantFlow({
  catalog,
  initial,
  chooseSpecies,
  onBack,
  onSave,
}: {
  catalog: GardenSpecies[];
  initial: PlantDraft;
  chooseSpecies: boolean;
  onBack: () => void;
  onSave: (plant: GardenPlant) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<'species' | 'details'>(
    !chooseSpecies && (initial.species_id || initial.name) ? 'details' : 'species',
  );
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);

  const search = query.trim().toLowerCase();
  const flagshipIds = useMemo(() => new Set(FLAGSHIP_SPECIES_MANIFEST.map((m) => m.speciesId)), []);
  const results = useMemo(() => {
    const filtered = catalog.filter((sp) => `${sp.name} ${sp.id}`.toLowerCase().includes(search));
    if (search) return filtered;
    const featured = filtered.filter((sp) => flagshipIds.has(sp.id));
    const rest = filtered.filter((sp) => !flagshipIds.has(sp.id));
    return [...featured, ...rest];
  }, [catalog, search, flagshipIds]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage errors
    }
  }, [draft]);

  function choose(species: GardenSpecies | null) {
    setDraft((cur) => ({
      ...cur,
      species_id: species?.id ?? null,
      name: cur.name || species?.name || '',
    }));
    setError('');
    setStep('details');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitLock.current || !draft.name.trim()) return;
    submitLock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await gardenApi.create(draft);
      sessionStorage.removeItem(DRAFT_KEY);
      onSave(saved);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Your plant could not be saved. Try again.',
      );
      submitLock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="petey-page-container" aria-labelledby="add-plant-heading">
      <div>
        <button
          type="button"
          className="petey-back-btn"
          disabled={busy}
          onClick={step === 'details' ? () => setStep('species') : onBack}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {step === 'details' ? 'Choose species' : 'Back'}
        </button>
      </div>

      <header>
        <span className="petey-small-label">{step === 'species' ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
        <h1 id="add-plant-heading" className="petey-page-title">
          {step === 'species' ? 'Choose your plant species' : 'Name your plant'}
        </h1>
        <p className="petey-page-sub">
          {step === 'species'
            ? 'Start with a real houseplant you already care for.'
            : draft.species_id ?? 'Unidentified houseplant — you can update species details later.'}
        </p>
      </header>

      {step === 'species' ? (
        <div className="petey-stack">
          <label className="petey-search-box">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Search species</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by common or scientific name"
            />
          </label>

          <div className="petey-garden-grid">
            {results.map((species) => (
              <button
                key={species.id}
                type="button"
                className="petey-plant-card text-left"
                onClick={() => choose(species)}
              >
                <div className="petey-plant-card-head">
                  <BotanicalThumbnail speciesId={species.id} size={48} />
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-[#202923]">{species.name}</strong>
                    <span className="petey-scientific block truncate">{species.id}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {results.length === 0 && (
            <p className="petey-body-muted">No species in the catalog match “{query}”.</p>
          )}

          <div>
            <button type="button" className="petey-link-btn" onClick={() => choose(null)}>
              I’m not sure which species I have <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <form className="petey-card petey-stack max-w-lg" onSubmit={(e) => void save(e)}>
          <label className="petey-field">
            Plant nickname
            <input
              required
              maxLength={60}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Window Monstera"
              autoFocus
              disabled={busy}
            />
          </label>

          <fieldset className="petey-fieldset" disabled={busy}>
            <legend className="petey-legend">Does its inner pot have drainage holes?</legend>
            <div className="petey-choice-grid-3">
              {(
                [
                  ['yes', 'Yes'],
                  ['no', 'No'],
                  ['unknown', 'Not sure'],
                ] as [Drainage, string][]
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`petey-choice-card ${draft.drainage === value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="add-drainage"
                    checked={draft.drainage === value}
                    onChange={() => setDraft({ ...draft, drainage: value })}
                  />
                  <span>
                    <strong>{label}</strong>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="petey-alert petey-alert-error" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="petey-btn-row">
            <button type="submit" className="hs-btn-primary" disabled={busy || !draft.name.trim()}>
              {busy ? 'Saving…' : 'Save plant'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ==========================================================================
   Main GardenApp Shell — Project High Sierra & Core Care Intelligence
   ========================================================================== */

export default function GardenApp() {
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);

  const [view, setView] = useState<PrimaryView>(() => {
    const v = initialQuery.get('view');
    if (v === 'lab' || v === 'garden' || v === 'lens' || v === 'care' || v === 'more') return v;
    if (initialQuery.get('plant') && initialQuery.get('action') === 'profile') return 'detail';
    return 'home';
  });

  const [plants, setPlants] = useState<GardenPlant[]>([]);
  const [catalog, setCatalog] = useState<GardenSpecies[]>([]);
  const [connection, setConnection] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [connectionError, setConnectionError] = useState('');
  const [previewActive, setPreviewActive] = useState<boolean>(() => isPreviewMode());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialQuery.get('plant') ?? readStoredSelectedPlantId(),
  );
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Care intelligence display preferences
  const [waterUnit, setWaterUnit] = useState<WaterVolumeUnit>(() => readWaterUnitPreference());
  const [technicalView, setTechnicalView] = useState(false);
  const [disable3D, setDisable3D] = useState<boolean>(() => readDisable3D());

  // Alert acknowledgements & notification preferences
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<string, string>>(() =>
    readAcknowledgedAlerts(),
  );
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(() =>
    readNotificationPreferences(),
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    () => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'),
  );

  // Conversational Plant Health modal state
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [healthPlantId, setHealthPlantId] = useState<string | null>(null);

  // Add plant flow
  const [chooseSpecies, setChooseSpecies] = useState(false);
  const [draft, setDraft] = useState<PlantDraft | null>(readDraft);

  // My Garden search/filter/sort & List/Grid view state
  const [gardenQuery, setGardenQuery] = useState('');
  const [gardenFilter, setGardenFilter] = useState<'all' | 'due' | 'attention' | 'resting'>('all');
  const [gardenSort, setGardenSort] = useState<'priority' | 'name' | 'species'>('priority');
  const [gardenLayout, setGardenLayout] = useState<'list' | 'grid'>('list');

  // Live Google Weather & 32 Interactive Nature Biome state
  const [weather, setWeather] = useState<LiveWeatherState>(() => defaultTimeWeather());
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherMenuOpen, setWeatherMenuOpen] = useState(false);
  const [activeLocationId, setActiveLocationId] = useState<string>('sf');
  const [gpsError, setGpsError] = useState('');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [themeCategoryFilter, setThemeCategoryFilter] = useState<NatureThemeCategory | 'all'>('all');
  const [stageParallax, setStageParallax] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interactive 3D Companion controls & smart care lifecycle state
  const [playCount, setPlayCount] = useState(0);
  const [reactionKind, setReactionKind] = useState<'pet' | 'water'>('pet');
  const [stageToast, setStageToast] = useState('');
  const [carePendingId, setCarePendingId] = useState<string | null>(null);
  const [careError, setCareError] = useState('');
  const [careNotice, setCareNotice] = useState('');
  const [showCheckChoices, setShowCheckChoices] = useState(false);
  const [justRecordedAction, setJustRecordedAction] = useState<{
    plantId: string;
    kind: CareKind;
  } | null>(null);
  const [cartPlantIds, setCartPlantIds] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem('petey-hydration-cart-v1');
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [cartBatchBusy, setCartBatchBusy] = useState(false);

  const reduced = useReducedMotion();
  const toastTimer = useRef<number | null>(null);
  const careInFlight = useRef(false);
  const deepLinkApplied = useRef(false);

  // Dynamic page titles per active route
  useEffect(() => {
    document.title = VIEW_TITLES[view];
  }, [view]);

  // Listen for Google Maps Platform quota events (Case A)
  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Load real garden data (never silently falls back to mock data)
  const loadGardenData = useCallback(async (signal?: AbortSignal) => {
    setConnection('loading');
    setConnectionError('');
    try {
      const [records, species] = await Promise.all([
        gardenApi.plants(signal),
        gardenApi.species(signal),
      ]);
      if (signal?.aborted) return;
      const prioritized = sortPlantsByActionPriority(records);
      setPlants(records);
      setCatalog(species);
      setSelectedId((prev) =>
        prev && records.some((p) => p.id === prev) ? prev : prioritized[0]?.id ?? null,
      );
      setConnection('ready');
    } catch (err) {
      if (signal?.aborted) return;
      setConnection('offline');
      setConnectionError(
        err instanceof BackendUnavailableError || err instanceof Error
          ? err.message
          : 'Could not reach the Petey Plant backend.',
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadGardenData(controller.signal);
    return () => controller.abort();
  }, [loadGardenData, previewActive]);

  // Apply deep-link ?plant=<id>&action=check once plants load
  useEffect(() => {
    if (deepLinkApplied.current || plants.length === 0) return;
    const requestedPlant = initialQuery.get('plant');
    const requestedAction = initialQuery.get('action');
    if (requestedPlant && plants.some((p) => p.id === requestedPlant)) {
      deepLinkApplied.current = true;
      setSelectedId(requestedPlant);
      if (requestedAction === 'check') {
        setHealthPlantId(requestedPlant);
        setHealthModalOpen(true);
      } else if (requestedAction === 'profile') {
        setView('detail');
      }
    }
  }, [initialQuery, plants]);

  // Fetch initial live Google Weather
  useEffect(() => {
    const controller = new AbortController();
    const initialLoc = WEATHER_LOCATIONS[0];
    setWeatherLoading(true);
    void fetchGoogleWeather(initialLoc.lat, initialLoc.lng, initialLoc.label, controller.signal)
      .then((live) => {
        if (!controller.signal.aborted && live) setWeather(live);
      })
      .finally(() => {
        if (!controller.signal.aborted) setWeatherLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setShowCheckChoices(false);
    setCareNotice('');
    setCareError('');
    setSwitcherOpen(false);
    if (selectedId) {
      try {
        localStorage.setItem(SELECTED_PLANT_KEY, selectedId);
      } catch {
        // Ignore storage restrictions
      }
    }
  }, [selectedId]);

  // Priority-sorted plants so actionable care needs always surface first
  const prioritizedPlants = useMemo(() => sortPlantsByActionPriority(plants), [plants]);

  const activeIndex = useMemo(() => {
    if (prioritizedPlants.length === 0) return 0;
    const idx = prioritizedPlants.findIndex((item) => item.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [prioritizedPlants, selectedId]);

  const activePlant = prioritizedPlants[activeIndex] ?? null;
  const weatherTheme = WEATHER_THEMES[weather.atmosphere];

  const activeIntel = useMemo(
    () =>
      activePlant
        ? buildWateringIntelligence(activePlant, {
            unit: waterUnit,
            weather,
            justRecordedAction,
          })
        : null,
    [activePlant, waterUnit, weather, justRecordedAction],
  );

  // Condition-driven Alert Center items
  const allAlerts = useMemo(
    () => buildPlantAlerts(plants, acknowledgedAlerts),
    [plants, acknowledgedAlerts],
  );
  const activeAlerts = useMemo(() => allAlerts.filter((a) => !a.acknowledged), [allAlerts]);
  const ackedAlerts = useMemo(() => allAlerts.filter((a) => a.acknowledged), [allAlerts]);

  const careGroups = useMemo(() => {
    const waiting = prioritizedPlants.filter((p) => p.status === 'wait');
    const resting = prioritizedPlants.filter((p) => p.status === 'rest');
    return { waiting, resting };
  }, [prioritizedPlants]);

  const filteredGarden = useMemo(() => {
    const q = gardenQuery.trim().toLowerCase();
    const list = prioritizedPlants.filter((p) => {
      if (q && !`${p.name} ${p.species_id ?? ''} ${p.common_name ?? ''}`.toLowerCase().includes(q)) {
        return false;
      }
      if (gardenFilter === 'due') return isDueNow(p);
      if (gardenFilter === 'attention') return p.status === 'details';
      if (gardenFilter === 'resting') return p.status === 'rest' || p.status === 'wait';
      return true;
    });
    if (gardenSort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (gardenSort === 'species') {
      return [...list].sort((a, b) => (a.species_id ?? '').localeCompare(b.species_id ?? ''));
    }
    return list;
  }, [prioritizedPlants, gardenQuery, gardenFilter, gardenSort]);

  function flashStageToast(message: string) {
    setStageToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setStageToast(''), 2400);
  }

  function triggerCompanionGreet() {
    setReactionKind('pet');
    setPlayCount((c) => c + 1);
    flashStageToast(
      activeIntel ? activeIntel.companionSpeech.message : `${activePlant?.name ?? 'Companion'} says hello`,
    );
  }

  function handleUnitChange(next: WaterVolumeUnit) {
    setWaterUnit(next);
    saveWaterUnitPreference(next);
  }

  function handleToggleDisable3D() {
    setDisable3D((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RENDER_MODE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  }

  function updateNotifPref(patch: Partial<NotificationPreferences>) {
    setNotifPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveNotificationPreferences(next);
      return next;
    });
  }

  async function requestBrowserNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        updateNotifPref({ enabled: true });
      }
    } catch {
      // Ignore permission dialog errors
    }
  }

  function handleAcknowledgeAlert(fingerprint: string) {
    setAcknowledgedAlerts(acknowledgeAlertFingerprint(fingerprint));
  }

  function handleRestoreAlert(fingerprint: string) {
    setAcknowledgedAlerts(clearAlertAcknowledgement(fingerprint));
  }

  function togglePreviewMode(enable: boolean) {
    setPreviewMode(enable);
    setPreviewActive(enable);
    if (!enable) {
      resetBackendStatusCache();
    }
  }

  function retryBackendConnection() {
    resetBackendStatusCache();
    void loadGardenData();
  }

  async function selectLocationPreset(presetId: string) {
    const preset = WEATHER_LOCATIONS.find((l) => l.id === presetId);
    if (!preset) return;
    setActiveLocationId(preset.id);
    setGpsError('');
    setWeatherLoading(true);
    const live = await fetchGoogleWeather(preset.lat, preset.lng, preset.label);
    setWeatherLoading(false);
    if (live) {
      setWeather(live);
      flashStageToast(`Live weather · ${preset.label}`);
    } else {
      setGpsError('Live Google Weather is unavailable right now — try an atmosphere preview below.');
    }
  }

  function requestUserGpsWeather() {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported in this browser.');
      return;
    }
    setGpsError('');
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setActiveLocationId('gps');
        const live = await fetchGoogleWeather(pos.coords.latitude, pos.coords.longitude, 'Your location');
        setWeatherLoading(false);
        if (live) {
          setWeather(live);
          setWeatherMenuOpen(false);
          flashStageToast(`Synced live weather · ${live.conditionLabel}`);
        } else {
          setGpsError('Could not load Google Weather for your coordinates.');
        }
      },
      () => {
        setWeatherLoading(false);
        setGpsError('Location permission declined — pick a city or weather preview instead.');
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function selectAtmospherePreview(id: WeatherAtmosphereId) {
    setActiveLocationId(`preview:${id}`);
    setGpsError('');
    setWeather(createPreviewWeather(id));
  }

  function cycleNextNatureTheme() {
    const currentIndex = ATMOSPHERE_LIST.indexOf(weather.atmosphere);
    const nextId = ATMOSPHERE_LIST[(currentIndex + 1) % ATMOSPHERE_LIST.length];
    selectAtmospherePreview(nextId);
    flashStageToast(`Nature biome · ${WEATHER_THEMES[nextId].label}`);
  }

  function startAddPlant(species?: string, manual = false) {
    setChooseSpecies(manual);
    const match = catalog.find((entry) => entry.id === species);
    setDraft(
      match
        ? { id: crypto.randomUUID(), species_id: match.id, name: match.name, drainage: 'unknown' }
        : readDraft() ?? { id: crypto.randomUUID(), species_id: null, name: '', drainage: 'unknown' },
    );
    setView('add');
  }

  function updatePlant(plant: GardenPlant) {
    setPlants((cur) =>
      cur.some((item) => item.id === plant.id)
        ? cur.map((item) => (item.id === plant.id ? plant : item))
        : [plant, ...cur],
    );
  }

  function openHealthModal(plantId: string | null = null) {
    setHealthPlantId(plantId);
    setHealthModalOpen(true);
  }

  function openPlantProfile(plantId: string) {
    setSelectedId(plantId);
    setView('detail');
  }

  // Safety invariant: always keep Hydration Cart limited strictly to ready, unlocked plants
  const validCartPlantIds = useMemo(
    () => filterEligibleCartIds(cartPlantIds, plants),
    [cartPlantIds, plants],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem('petey-hydration-cart-v1', JSON.stringify(validCartPlantIds));
    } catch {
      // Ignore storage quota errors
    }
  }, [validCartPlantIds]);

  function toggleCartPlant(plantId: string) {
    const plant = plants.find((p) => p.id === plantId);
    if (!plant) return;
    setCartPlantIds((prev) => {
      if (prev.includes(plantId)) {
        return prev.filter((id) => id !== plantId);
      }
      if (getHydrationEligibility(plant) !== 'eligible') return prev;
      return [...prev, plantId];
    });
  }

  function queueAllReadyToCart() {
    const readyIds = prioritizedPlants
      .filter((p) => getHydrationEligibility(p) === 'eligible')
      .map((p) => p.id);
    setCartPlantIds(readyIds);
  }

  function clearHydrationCart() {
    setCartPlantIds([]);
  }

  async function confirmCartRound(plantsInCart: GardenPlant[]) {
    if (careInFlight.current || plantsInCart.length === 0) return;
    careInFlight.current = true;
    setCartBatchBusy(true);
    setCareError('');
    setCareNotice('');
    const succeededIds: string[] = [];
    const failedNames: string[] = [];

    try {
      for (const plant of plantsInCart) {
        try {
          const updated = await gardenApi.record(plant.id, {
            id: crypto.randomUUID(),
            kind: 'watered',
          });
          updatePlant(updated);
          succeededIds.push(updated.id);
          setJustRecordedAction({ plantId: updated.id, kind: 'watered' });
        } catch {
          failedNames.push(plant.name);
        }
      }

      if (succeededIds.length > 0) {
        setCartPlantIds((prev) => prev.filter((id) => !succeededIds.includes(id)));
        setReactionKind('water');
        setPlayCount((c) => c + 1);
        setCareNotice(
          `Watering recorded for ${succeededIds.length} ${succeededIds.length === 1 ? 'plant' : 'plants'}. Reassessment pending.`,
        );
      }
      if (failedNames.length > 0) {
        setCareError(
          `Could not record watering for ${failedNames.join(', ')}. Those plants remain in your Hydration Cart.`,
        );
      }
    } finally {
      careInFlight.current = false;
      setCartBatchBusy(false);
    }
  }

  async function recordCareForPlant(plant: GardenPlant, kind: CareKind) {
    if (careInFlight.current) return;
    careInFlight.current = true;
    setCarePendingId(plant.id);
    setCareError('');
    setCareNotice('');
    try {
      const updated = await gardenApi.record(plant.id, {
        id: crypto.randomUUID(),
        kind,
      });
      updatePlant(updated);
      setShowCheckChoices(false);
      setJustRecordedAction({ plantId: updated.id, kind });
      if (kind === 'watered') {
        setCartPlantIds((prev) => prev.filter((id) => id !== updated.id));
        // Play appreciative companion animation ONLY after persistence succeeds
        setReactionKind('water');
        setPlayCount((c) => c + 1);
        setCareNotice(`Watering logged for ${updated.name}. Reassessment pending.`);
        flashStageToast(`Action recorded · ${updated.name}`);
      } else {
        setReactionKind('pet');
        setPlayCount((c) => c + 1);
        setCareNotice(`Soil observation saved for ${updated.name}.`);
        flashStageToast(
          kind === 'dry'
            ? 'Dry mix noted · watering suggested'
            : kind === 'moist'
              ? 'Moist mix noted · hold watering'
              : 'Observation saved',
        );
      }
    } catch (failure) {
      setCareError(
        failure instanceof Error
          ? failure.message
          : 'Could not save this care action. Nothing was marked complete.',
      );
    } finally {
      careInFlight.current = false;
      setCarePendingId(null);
    }
  }

  const quotaBanner = gmpQuotaExceeded && (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs md:text-sm text-center sticky top-0 z-50">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  );

  const previewBanner = previewActive && (
    <div className="petey-preview-banner" role="status">
      <span>
        Development preview — sample plants stored locally in browser session (not connected to FastAPI database).
      </span>
      <button type="button" onClick={() => togglePreviewMode(false)}>
        Exit preview
      </button>
    </div>
  );

  const registrySummary = useMemo(() => getRegistryCoverageSummary(), []);
  const checkedHealthPlant = plants.find((p) => p.id === healthPlantId);
  const inQuietHoursNow = isWithinQuietHours(notifPrefs, new Date().getHours());

  if (view === 'lab') {
    return (
      <div className="petey-shell">
        {quotaBanner}
        <div className="flex items-center justify-between px-4 py-3 bg-[#FFFFFF] border-b border-[#DDE2DA]">
          <button type="button" className="petey-back-btn" onClick={() => setView('more')}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Petey Plant
          </button>
          <span className="petey-small-label">Plant Lab · Synthetic experimental demo</span>
        </div>
        <Suspense fallback={<p className="p-6 text-sm" role="status">Opening Plant Lab…</p>}>
          <PlantLab />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="petey-shell">
      {quotaBanner}
      {previewBanner}

      <a href="#petey-main" className="petey-skip-link">
        Skip to main content
      </a>

      <div className="petey-frame">
        {/* DESKTOP LEFT SIDEBAR (5 Core Destinations — High Sierra Inspector Sidebar) */}
        <aside className="petey-sidebar" aria-label="Main navigation">
          <div>
            <button
              type="button"
              className="petey-sidebar-brand"
              onClick={() => setView('home')}
            >
              <PeteyLogo size={32} title="Petey Plant logo" />
              <span>Petey Plant</span>
            </button>

            <nav className="petey-sidebar-nav" aria-label="Primary">
              <button
                type="button"
                className="petey-sidebar-item"
                aria-current={view === 'home' || view === 'detail' ? 'page' : undefined}
                onClick={() => setView('home')}
              >
                <span className="petey-sidebar-item-left">
                  <Home className="h-4 w-4" aria-hidden="true" /> Home
                </span>
              </button>

              <button
                type="button"
                className="petey-sidebar-item"
                aria-current={view === 'garden' ? 'page' : undefined}
                onClick={() => setView('garden')}
              >
                <span className="petey-sidebar-item-left">
                  <Sprout className="h-4 w-4" aria-hidden="true" /> My Garden
                </span>
                {plants.length > 0 && <span className="text-xs font-mono opacity-75">{plants.length}</span>}
              </button>

              <button
                type="button"
                className="petey-sidebar-item petey-sidebar-lens"
                aria-current={view === 'lens' ? 'page' : undefined}
                onClick={() => setView('lens')}
              >
                <span className="petey-sidebar-item-left">
                  <Camera className="h-4 w-4" aria-hidden="true" /> Petey Lens
                </span>
              </button>

              <button
                type="button"
                className="petey-sidebar-item"
                aria-current={view === 'care' ? 'page' : undefined}
                onClick={() => setView('care')}
              >
                <span className="petey-sidebar-item-left">
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Care & Alerts
                </span>
                {activeAlerts.length > 0 && (
                  <span className="petey-sidebar-count">{activeAlerts.length}</span>
                )}
              </button>

              <button
                type="button"
                className="petey-sidebar-item"
                aria-current={view === 'more' ? 'page' : undefined}
                onClick={() => setView('more')}
              >
                <span className="petey-sidebar-item-left">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> More
                </span>
              </button>
            </nav>
          </div>

          <div className="petey-stack">
            <button
              type="button"
              className="hs-btn-subtle w-full"
              disabled={connection !== 'ready'}
              onClick={() => startAddPlant()}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add plant
            </button>
          </div>
        </aside>

        {/* PRIMARY CONTENT AREA */}
        <main
          id="petey-main"
          className={`petey-main-area ${view === 'home' ? 'is-home-view' : ''}`}
          tabIndex={-1}
        >
          {/* ================= HOME VIEW — PROJECT LIVING INTERFACE V3 (60:40) ================= */}
          {view === 'home' && (
            <div className="hs-home-workspace">
              {/* Compact Native Application Toolbar (Plant name appears ONCE here) */}
              <header className="hs-toolbar" aria-label="Workspace toolbar">
                <div className="hs-toolbar-left">
                  <button
                    type="button"
                    className="hs-toolbar-brand-mobile"
                    onClick={() => setView('more')}
                    aria-label="Petey Plant settings"
                  >
                    <PeteyLogo size={26} />
                  </button>

                  {activePlant && prioritizedPlants.length > 1 ? (
                    <div className="lv-switcher-wrap">
                      <button
                        type="button"
                        className="lv-plant-switcher-btn"
                        aria-expanded={switcherOpen}
                        aria-haspopup="listbox"
                        onClick={() => {
                          setSwitcherOpen((open) => !open);
                          setWeatherMenuOpen(false);
                        }}
                      >
                        <h1 className="hs-toolbar-plant-name m-0">{activePlant.name}</h1>
                        <ChevronDown className="h-3.5 w-3.5 text-[#515D55] shrink-0" aria-hidden="true" />
                      </button>

                      {switcherOpen && (
                        <div className="lv-switcher-popover" role="listbox" aria-label="Switch active plant">
                          {prioritizedPlants.map((p) => {
                            const selected = p.id === activePlant.id;
                            const pIntel = buildWateringIntelligence(p, { unit: waterUnit });
                            return (
                              <button
                                key={p.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`lv-switcher-item ${selected ? 'is-selected' : ''}`}
                                onClick={() => {
                                  setSelectedId(p.id);
                                  setSwitcherOpen(false);
                                }}
                              >
                                <BotanicalThumbnail speciesId={p.species_id} size={28} />
                                <span className="min-w-0 flex-1 text-left">
                                  <strong className="block text-xs text-[#202923] truncate">{p.name}</strong>
                                  <small className="block text-[11px] text-[#5C6860] truncate">
                                    {STATUS_LABELS[p.status]}
                                  </small>
                                </span>
                                <span
                                  className="hs-severity-dot"
                                  data-severity={pIntel.urgency}
                                  aria-hidden="true"
                                />
                                {selected && <Check className="h-3.5 w-3.5 text-[#234D36] shrink-0" aria-hidden="true" />}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            className="lv-switcher-footer"
                            onClick={() => {
                              setSwitcherOpen(false);
                              setView('garden');
                            }}
                          >
                            Manage in My Garden
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <h1 className="hs-toolbar-plant-name m-0">
                      {activePlant ? activePlant.name : 'Petey Plant'}
                    </h1>
                  )}
                </div>

                <div className="hs-toolbar-right">
                  {/* Outdoor Environment Atmosphere Popover Trigger */}
                  <button
                    type="button"
                    className="hs-toolbar-pill"
                    onClick={() => {
                      setWeatherMenuOpen((open) => !open);
                      setSwitcherOpen(false);
                    }}
                    aria-expanded={weatherMenuOpen}
                    aria-label="Outdoor weather atmosphere settings"
                  >
                    <WeatherIcon atmosphere={weather.atmosphere} />
                    <span className="font-mono font-semibold">{weather.temperatureC}°C</span>
                    <span className="hs-hide-xs">Outdoor</span>
                  </button>

                  {/* Hydration Cart Indicator when plants are queued */}
                  {validCartPlantIds.length > 0 && (
                    <button
                      type="button"
                      className="hs-toolbar-pill hs-toolbar-cart-pill"
                      onClick={() => setView('care')}
                      aria-label={`${validCartPlantIds.length} plants queued in Hydration Cart`}
                    >
                      <ShoppingBasket className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-mono font-semibold">{validCartPlantIds.length}</span>
                    </button>
                  )}

                  {/* Active Alerts Jump Control */}
                  {activeAlerts.length > 0 && (
                    <button
                      type="button"
                      className="hs-toolbar-pill hs-toolbar-alert-pill"
                      onClick={() => setView('care')}
                      aria-label={`${activeAlerts.length} active plant care alerts`}
                    >
                      <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-mono font-semibold">{activeAlerts.length}</span>
                    </button>
                  )}
                </div>
              </header>

              {/* 64:36 LIVING COMPANION HABITAT + DUOLINGO-INSPIRED CARE SURFACE */}
              <div className="companion-shell">
                {/* 64%: Expanded Unobstructed Living 3D Botanical Companion Stage */}
                <section
                  className="companion-stage"
                  aria-label="Interactive plant companion stage"
                  onPointerMove={(e) => {
                    if (reduced) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) return;
                    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                    setStageParallax({ x: nx, y: ny });
                  }}
                  onPointerLeave={() => {
                    if (!reduced) setStageParallax({ x: 0, y: 0 });
                  }}
                >
                  <WeatherBackdrop theme={weatherTheme} parallaxOffset={stageParallax} />

                  <InteractivePlantStage
                    speciesId={activePlant?.species_id ?? 'Monstera deliciosa'}
                    mood={activeIntel?.primaryCondition.companionMood ?? 'happy'}
                    animationState={activeIntel?.primaryCondition.animationPreset ?? 'idle'}
                    posturePreset={activeIntel?.primaryCondition.posturePreset}
                    theme={weatherTheme}
                    windKmh={weather.windKmh}
                    playCount={playCount}
                    reactionKind={reactionKind}
                    reduced={reduced}
                    disable3D={disable3D}
                    statusAccessibleLabel={activeIntel?.primaryCondition.staticFallbackLabel}
                    onPet={triggerCompanionGreet}
                    showAtmosphere
                  />

                  {stageToast && (
                    <div className="stage-toast" role="status">
                      {stageToast}
                    </div>
                  )}

                  {/* Calm Companion Speech Cue grounded strictly in verified backend state + Interactive Biome Chip */}
                  {activePlant && activeIntel && (
                    <div className="lv-stage-speech-wrap">
                      <button
                        type="button"
                        className="lv-speech-bubble"
                        onClick={triggerCompanionGreet}
                        aria-label={`${activePlant.name} says: ${activeIntel.companionSpeech.message}`}
                      >
                        <span
                          className="hs-severity-dot"
                          data-severity={activeIntel.urgency}
                          aria-hidden="true"
                        />
                        <span className="lv-speech-copy">“{activeIntel.companionSpeech.message}”</span>
                        <span className="lv-speech-biome-tag" aria-hidden="true">
                          <WeatherIcon atmosphere={weather.atmosphere} />
                          <span>{weatherTheme.label}</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        className="lv-biome-cycle-btn"
                        onClick={cycleNextNatureTheme}
                        aria-label={`Switch nature theme (current: ${weatherTheme.label})`}
                        title={`Next nature theme (${ATMOSPHERE_LIST.indexOf(weather.atmosphere) + 1}/${ATMOSPHERE_LIST.length})`}
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Biome</span>
                      </button>
                    </div>
                  )}

                  {/* Live Google Weather & 32-Biome Interactive Switcher Popover */}
                  {weatherMenuOpen && (
                    <div className="weather-popover" role="dialog" aria-label="Outdoor weather atmosphere">
                      <div className="weather-popover-head">
                        <div className="min-w-0">
                          <span className="weather-popover-title block truncate">
                            {weather.locationLabel} · {weatherTheme.label}
                          </span>
                          <span className="weather-popover-sub">
                            32 interactive nature themes · {ATMOSPHERE_LIST.indexOf(weather.atmosphere) + 1} of{' '}
                            {ATMOSPHERE_LIST.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="weather-popover-close"
                          onClick={() => setWeatherMenuOpen(false)}
                          aria-label="Close outdoor weather settings"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="weather-popover-stats">
                        <div className="weather-stat-cell">
                          <span className="weather-stat-label">Outdoor</span>
                          <span className="weather-stat-val">{weather.temperatureC}°C</span>
                        </div>
                        <div className="weather-stat-cell">
                          <span className="weather-stat-label">Humidity</span>
                          <span className="weather-stat-val">{weather.relativeHumidity}%</span>
                        </div>
                        <div className="weather-stat-cell">
                          <span className="weather-stat-label">Wind</span>
                          <span className="weather-stat-val">{weather.windKmh} km/h</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          className="duo-btn duo-btn-primary duo-btn-sm flex-1"
                          disabled={weatherLoading}
                          onClick={requestUserGpsWeather}
                        >
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                          <span>{weatherLoading ? 'Syncing…' : 'Live GPS'}</span>
                        </button>
                        <button
                          type="button"
                          className="duo-btn duo-btn-sage duo-btn-sm"
                          onClick={cycleNextNatureTheme}
                        >
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                          <span>Next biome</span>
                        </button>
                      </div>

                      {gpsError && (
                        <p className="petey-alert petey-alert-error mb-2" role="alert">
                          {gpsError}
                        </p>
                      )}

                      <p className="weather-section-label">Live cities (Google Weather)</p>
                      <div className="weather-loc-grid">
                        {WEATHER_LOCATIONS.map((loc) => (
                          <button
                            key={loc.id}
                            type="button"
                            className={`weather-choice-btn ${activeLocationId === loc.id ? 'active' : ''}`}
                            disabled={weatherLoading}
                            onClick={() => void selectLocationPreset(loc.id)}
                          >
                            {loc.label}
                          </button>
                        ))}
                      </div>

                      <div className="weather-section-bar">
                        <p className="weather-section-label m-0">
                          32 Nature Biomes ({themeCategoryFilter === 'all'
                            ? ATMOSPHERE_LIST.length
                            : ATMOSPHERE_LIST.filter((id) => WEATHER_THEMES[id].category === themeCategoryFilter).length})
                        </p>
                      </div>

                      <div className="weather-category-chips" role="tablist" aria-label="Filter nature biome categories">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={themeCategoryFilter === 'all'}
                          className={`weather-cat-chip ${themeCategoryFilter === 'all' ? 'active' : ''}`}
                          onClick={() => setThemeCategoryFilter('all')}
                        >
                          All (32)
                        </button>
                        {NATURE_THEME_CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            role="tab"
                            aria-selected={themeCategoryFilter === cat}
                            className={`weather-cat-chip ${themeCategoryFilter === cat ? 'active' : ''}`}
                            onClick={() => setThemeCategoryFilter(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      <div className="weather-theme-gallery">
                        {ATMOSPHERE_LIST.filter(
                          (id) => themeCategoryFilter === 'all' || WEATHER_THEMES[id].category === themeCategoryFilter,
                        ).map((id) => {
                          const t = WEATHER_THEMES[id];
                          const isSelected = weather.atmosphere === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              className={`weather-theme-card ${isSelected ? 'active' : ''}`}
                              onClick={() => selectAtmospherePreview(id)}
                            >
                              <span
                                className="weather-theme-swatch"
                                style={{
                                  background: `linear-gradient(135deg, ${t.skyTop} 0%, ${t.skyMid} 52%, ${t.hillNear} 100%)`,
                                }}
                                aria-hidden="true"
                              />
                              <span className="weather-theme-card-text">
                                <span className="weather-theme-card-title">
                                  <WeatherIcon atmosphere={id} />
                                  <span className="truncate">{t.label}</span>
                                </span>
                                <span className="weather-theme-card-sub truncate">{t.biomeSubtitle}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <p className="weather-source-note">
                        {weather.source === 'google-weather'
                          ? 'Outdoor weather from Google Weather automatically selects the matching nature biome. Does not measure indoor room temperature or potting mix moisture.'
                          : 'Interactive nature biome preview. Pick a city or Live GPS for automatic Google Weather matching.'}
                      </p>
                    </div>
                  )}
                </section>

                {/* 40%: Clean Modern Rounded Care Surface (No Other Plants, No Technical Table) */}
                <section className="companion-dock" aria-label="Plant care decision">
                  <div className="dock-scroll-body">
                    {connection === 'loading' && (
                      <div className="lv-care-card" role="status">
                        <p className="petey-body-muted m-0">Connecting to Petey Plant backend…</p>
                      </div>
                    )}

                    {connection === 'offline' && (
                      <div className="lv-care-card" data-tone="details">
                        <span className="petey-small-label">Condition unavailable</span>
                        <h2 className="lv-offline-title">Garden records are offline</h2>
                        <p className="lv-care-summary">
                          {connectionError ||
                            'Petey Plant uses your FastAPI backend as the source of truth for care history and recommendations.'}
                        </p>
                        <div className="lv-primary-row mt-2">
                          <button
                            type="button"
                            className="duo-btn duo-btn-primary duo-btn-sm flex-1"
                            onClick={retryBackendConnection}
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            <span>Retry</span>
                          </button>
                          <button
                            type="button"
                            className="duo-btn duo-btn-secondary duo-btn-sm flex-1"
                            onClick={() => togglePreviewMode(true)}
                          >
                            <span>Enable preview</span>
                          </button>
                        </div>
                        <p className="hs-disclosure-muted mt-2">
                          Development preview uses temporary sample plants in browser storage while FastAPI is offline.
                        </p>
                      </div>
                    )}

                    {connection === 'ready' && (
                      <>
                        {activePlant && activeIntel ? (
                          <HomeCareSurface
                            plant={activePlant}
                            intel={activeIntel}
                            unit={waterUnit}
                            reducedMotion={reduced}
                            onUnitChange={handleUnitChange}
                            showCheckChoices={showCheckChoices}
                            onShowCheckChoices={setShowCheckChoices}
                            carePendingId={carePendingId}
                            careError={careError}
                            careNotice={careNotice}
                            onRecordCare={(p, kind) => void recordCareForPlant(p, kind)}
                            onOpenConditionCheck={(id) => openHealthModal(id)}
                            onOpenProfile={(id) => openPlantProfile(id)}
                            inHydrationCart={validCartPlantIds.includes(activePlant.id)}
                            onToggleHydrationCart={(id) => toggleCartPlant(id)}
                            activeBiomeLabel={weatherTheme.label}
                            weatherLocationLabel={`${weather.locationLabel} · ${weather.temperatureC}°C`}
                            onCycleBiome={cycleNextNatureTheme}
                          />
                        ) : (
                          /* First-Time Empty Garden Onboarding (3 plain concepts) */
                          <div className="lv-care-card" data-tone="rest">
                            <span className="petey-small-label">Welcome to Petey Plant</span>
                            <h2 className="lv-offline-title">Add your first houseplant</h2>
                            <p className="lv-care-summary">
                              Add a real plant you own, share a quick note on its pot and soil, and get simple care guidance.
                            </p>
                            <div className="lv-primary-row mt-2">
                              <button
                                type="button"
                                className="duo-btn duo-btn-primary duo-btn-sm flex-1"
                                onClick={() => startAddPlant()}
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                <span>Add your plant</span>
                              </button>
                              <button
                                type="button"
                                className="duo-btn duo-btn-secondary duo-btn-sm"
                                onClick={() => setView('lens')}
                              >
                                <Camera className="h-4 w-4" aria-hidden="true" />
                                <span>Use Lens</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* ================= INDIVIDUAL PLANT DETAIL PROFILE VIEW ================= */}
          {view === 'detail' && activePlant && activeIntel && (
            <PlantDetailProfile
              plant={activePlant}
              intel={activeIntel}
              weather={weather}
              unit={waterUnit}
              onUnitChange={handleUnitChange}
              technicalView={technicalView}
              onToggleTechnicalView={() => setTechnicalView((v) => !v)}
              showCheckChoices={showCheckChoices}
              onShowCheckChoices={setShowCheckChoices}
              carePendingId={carePendingId}
              careError={careError}
              careNotice={careNotice}
              onRecordCare={(p, kind) => void recordCareForPlant(p, kind)}
              onOpenConditionCheck={(id) => openHealthModal(id)}
              onOpenOn3DStage={(id) => {
                setSelectedId(id);
                setView('home');
              }}
              onBack={() => setView('home')}
            />
          )}

          {/* ================= MY GARDEN VIEW (Native List / Grid Browser) ================= */}
          {view === 'garden' && (
            <section className="petey-page-container" aria-labelledby="garden-heading">
              <header className="petey-page-header">
                <div>
                  <span className="petey-small-label">Your collection</span>
                  <h1 id="garden-heading" className="petey-page-title">
                    My Garden
                  </h1>
                  <p className="petey-page-sub">
                    Every plant record keeps its own care history, pot drainage, and estimated check schedule.
                  </p>
                </div>
                <button
                  type="button"
                  className="hs-btn-primary"
                  disabled={connection !== 'ready'}
                  onClick={() => startAddPlant()}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add plant
                </button>
              </header>

              {connection === 'offline' ? (
                <div className="petey-card petey-stack">
                  <p className="petey-body-muted">{connectionError}</p>
                  <div className="petey-btn-row">
                    <button type="button" className="hs-btn-primary" onClick={retryBackendConnection}>
                      <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
                    </button>
                    <button
                      type="button"
                      className="hs-btn-subtle"
                      onClick={() => togglePreviewMode(true)}
                    >
                      Enable development preview
                    </button>
                  </div>
                </div>
              ) : plants.length === 0 ? (
                <div className="petey-card petey-stack items-start">
                  <PeteyLogo size={48} />
                  <h2 className="petey-card-title">No plants in your garden yet</h2>
                  <p className="petey-body-muted">
                    Add a plant manually or use Petey Lens to check possible species matches from a photo.
                  </p>
                  <div className="petey-btn-row">
                    <button type="button" className="hs-btn-primary" onClick={() => startAddPlant()}>
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add plant
                    </button>
                    <button type="button" className="hs-btn-subtle" onClick={() => setView('lens')}>
                      <Camera className="h-4 w-4" aria-hidden="true" /> Open Petey Lens
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="petey-toolbar">
                    <label className="petey-search-box">
                      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="sr-only">Search your plants</span>
                      <input
                        value={gardenQuery}
                        onChange={(e) => setGardenQuery(e.target.value)}
                        placeholder="Search by nickname or species"
                      />
                    </label>
                    <select
                      className="petey-select"
                      aria-label="Filter plants by care status"
                      value={gardenFilter}
                      onChange={(e) =>
                        setGardenFilter(e.target.value as 'all' | 'due' | 'attention' | 'resting')
                      }
                    >
                      <option value="all">All statuses</option>
                      <option value="due">Due for check / water</option>
                      <option value="attention">Needs info / attention</option>
                      <option value="resting">Waiting / resting</option>
                    </select>
                    <select
                      className="petey-select"
                      aria-label="Sort plants"
                      value={gardenSort}
                      onChange={(e) =>
                        setGardenSort(e.target.value as 'priority' | 'name' | 'species')
                      }
                    >
                      <option value="priority">Sort: Care priority</option>
                      <option value="name">Sort: Nickname</option>
                      <option value="species">Sort: Species</option>
                    </select>
                    <div className="hs-toolbar-seg" role="group" aria-label="Garden layout">
                      <button
                        type="button"
                        className={gardenLayout === 'list' ? 'active' : ''}
                        aria-pressed={gardenLayout === 'list'}
                        onClick={() => setGardenLayout('list')}
                        aria-label="List view"
                      >
                        <List className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>List</span>
                      </button>
                      <button
                        type="button"
                        className={gardenLayout === 'grid' ? 'active' : ''}
                        aria-pressed={gardenLayout === 'grid'}
                        onClick={() => setGardenLayout('grid')}
                        aria-label="Grid view"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Grid</span>
                      </button>
                    </div>
                  </div>

                  {filteredGarden.length === 0 ? (
                    <div className="petey-card">
                      <p className="petey-body-muted">No plants match your current filter.</p>
                    </div>
                  ) : gardenLayout === 'list' ? (
                    <div className="hs-garden-list" role="list">
                      {filteredGarden.map((plant) => {
                        const intel = buildWateringIntelligence(plant, { unit: waterUnit });
                        return (
                          <article key={plant.id} className="hs-garden-list-row" role="listitem">
                            <div className="hs-garden-list-main">
                              <BotanicalThumbnail speciesId={plant.species_id} size={46} />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h2 className="text-sm font-semibold text-[#202923] m-0 truncate">
                                    {plant.name}
                                  </h2>
                                  <span className="hs-urgency-tag" data-severity={intel.urgency}>
                                    {STATUS_LABELS[plant.status]}
                                  </span>
                                </div>
                                <p className="petey-scientific truncate mt-0.5">
                                  {plant.species_id ?? plant.common_name ?? 'Unidentified'}
                                </p>
                                <p className="text-xs text-[#515D55] m-0 mt-0.5">
                                  {intel.actionHeadline} · {intel.timingSummary}
                                </p>
                              </div>
                            </div>

                            <div className="hs-garden-list-actions">
                              <button
                                type="button"
                                className="hs-btn-subtle"
                                onClick={() => {
                                  setSelectedId(plant.id);
                                  setView('home');
                                }}
                              >
                                Inspect
                              </button>
                              <button
                                type="button"
                                className="hs-btn-ghost"
                                onClick={() => openPlantProfile(plant.id)}
                              >
                                Profile
                              </button>
                              <button
                                type="button"
                                className="hs-btn-ghost"
                                onClick={() => openHealthModal(plant.id)}
                              >
                                Check
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="petey-garden-grid">
                      {filteredGarden.map((plant) => {
                        const intel = buildWateringIntelligence(plant, { unit: waterUnit });
                        return (
                          <article key={plant.id} className="petey-plant-card">
                            <div className="petey-plant-card-head">
                              <BotanicalThumbnail speciesId={plant.species_id} size={52} />
                              <div className="min-w-0 flex-1">
                                <span className="hs-urgency-tag" data-severity={intel.urgency}>
                                  {STATUS_LABELS[plant.status]}
                                </span>
                                <h2 className="petey-card-title mt-1 truncate">{plant.name}</h2>
                                <p className="petey-scientific truncate">
                                  {plant.species_id ?? plant.common_name ?? 'Unidentified'}
                                </p>
                              </div>
                            </div>

                            <p className="petey-body-muted">{nextCheckLabel(plant)}</p>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#DDE2DA]">
                              <button
                                type="button"
                                className="hs-inline-link"
                                onClick={() => {
                                  setSelectedId(plant.id);
                                  setView('home');
                                }}
                              >
                                Inspect <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="hs-inline-link"
                                onClick={() => openPlantProfile(plant.id)}
                              >
                                Care profile
                              </button>
                              <button
                                type="button"
                                className="hs-inline-link"
                                onClick={() => openHealthModal(plant.id)}
                              >
                                Condition check
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ================= PETEY LENS VIEW ================= */}
          {view === 'lens' && (
            <Suspense
              fallback={
                <p className="petey-page-container" role="status">
                  Opening Petey Lens…
                </p>
              }
            >
              <PeteyLens
                catalog={catalog}
                reducedMotion={reduced}
                onBack={() => setView('home')}
                onManual={() => startAddPlant(undefined, true)}
                onAdd={(speciesId) => startAddPlant(speciesId, false)}
              />
            </Suspense>
          )}

          {/* ================= CARE & ALERT CENTER VIEW (+ HYDRATION CART) ================= */}
          {view === 'care' && (
            <CareAlertCenter
              connection={connection}
              connectionError={connectionError}
              plants={prioritizedPlants}
              activeAlerts={activeAlerts}
              ackedAlerts={ackedAlerts}
              waitingPlants={careGroups.waiting}
              restingPlants={careGroups.resting}
              cartPlantIds={validCartPlantIds}
              waterUnit={waterUnit}
              reducedMotion={reduced}
              carePendingId={carePendingId}
              cartBatchBusy={cartBatchBusy}
              careError={careError}
              careNotice={careNotice}
              onUnitChange={handleUnitChange}
              onRetryConnection={retryBackendConnection}
              onEnablePreview={() => togglePreviewMode(true)}
              onStartAddPlant={() => startAddPlant()}
              onInspectPlant={(id) => {
                setSelectedId(id);
                setView('home');
              }}
              onOpenProfile={(id) => openPlantProfile(id)}
              onOpenConditionCheck={(id) => openHealthModal(id)}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onRestoreAlert={handleRestoreAlert}
              onRecordCare={(p, kind) => void recordCareForPlant(p, kind)}
              onToggleCartPlant={toggleCartPlant}
              onQueueAllReady={queueAllReadyToCart}
              onClearCart={clearHydrationCart}
              onConfirmCartRound={confirmCartRound}
            />
          )}

          {/* ================= MORE / SETTINGS, NOTIFICATIONS & BOTANICAL CATALOG ================= */}
          {view === 'more' && (
            <section className="petey-page-container" aria-labelledby="more-heading">
              <header className="petey-page-header">
                <div className="flex items-center gap-3">
                  <PeteyLogo size={42} />
                  <div>
                    <span className="petey-small-label">Preferences, Notifications & Botanical Roster</span>
                    <h1 id="more-heading" className="petey-page-title">
                      More from Petey Plant
                    </h1>
                  </div>
                </div>
              </header>

              {/* Notification Preferences & Quiet Hours Card */}
              <section className="petey-card petey-stack" aria-labelledby="notif-prefs-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="petey-small-label">Notification preferences</span>
                    <h2 id="notif-prefs-heading" className="petey-card-title mt-0.5">
                      In-session care reminders & quiet hours
                    </h2>
                  </div>
                  <span className="hs-prov-tag">
                    {notifPermission === 'granted'
                      ? 'Browser permission granted'
                      : notifPermission === 'denied'
                        ? 'Permission blocked in browser'
                        : notifPermission === 'unsupported'
                          ? 'Unsupported browser'
                          : 'Permission not requested'}
                  </span>
                </div>

                <p className="petey-body-muted">
                  Browser notifications are never requested on launch and currently deliver only while Petey Plant is open in a tab. Background push delivery requires a future backend push service and service worker.
                </p>

                <div className="hs-pref-grid">
                  <label className="hs-toggle-row">
                    <span>
                      <strong>Routine watering & check cues</strong>
                      <small>Surface due checks and watering actions during your session</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={notifPrefs.routineReminders}
                      onChange={(e) => updateNotifPref({ routineReminders: e.target.checked })}
                    />
                  </label>

                  <label className="hs-toggle-row">
                    <span>
                      <strong>Urgent alerts only</strong>
                      <small>Prioritize root-rot brakes and urgent plant risks</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={notifPrefs.urgentOnly}
                      onChange={(e) => updateNotifPref({ urgentOnly: e.target.checked })}
                    />
                  </label>

                  <label className="hs-toggle-row">
                    <span>
                      <strong>Quiet hours ({formatHour(notifPrefs.quietStartHour)} – {formatHour(notifPrefs.quietEndHour)})</strong>
                      <small>
                        {inQuietHoursNow
                          ? 'Quiet hours are active right now — routine reminders paused.'
                          : 'Pause routine reminders during evening/night hours.'}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={notifPrefs.quietHoursEnabled}
                      onChange={(e) => updateNotifPref({ quietHoursEnabled: e.target.checked })}
                    />
                  </label>

                  {notifPrefs.quietHoursEnabled && (
                    <div className="petey-two-col">
                      <label className="petey-field">
                        Quiet hours start
                        <select
                          value={notifPrefs.quietStartHour}
                          onChange={(e) => updateNotifPref({ quietStartHour: Number(e.target.value) })}
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                              {formatHour(h)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="petey-field">
                        Quiet hours end
                        <select
                          value={notifPrefs.quietEndHour}
                          onChange={(e) => updateNotifPref({ quietEndHour: Number(e.target.value) })}
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                              {formatHour(h)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                <div className="hs-action-inline">
                  {notifPermission === 'default' && (
                    <button
                      type="button"
                      className="hs-btn-subtle"
                      onClick={() => void requestBrowserNotificationPermission()}
                    >
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      Allow browser reminders
                    </button>
                  )}
                  {notifPermission === 'granted' && (
                    <button
                      type="button"
                      className="hs-btn-subtle"
                      onClick={() => updateNotifPref({ enabled: !notifPrefs.enabled })}
                    >
                      {notifPrefs.enabled ? (
                        <>
                          <BellOff className="h-4 w-4" aria-hidden="true" /> Pause browser reminders
                        </>
                      ) : (
                        <>
                          <Bell className="h-4 w-4" aria-hidden="true" /> Resume browser reminders
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="hs-btn-ghost"
                    onClick={handleToggleDisable3D}
                  >
                    <Box className="h-4 w-4" aria-hidden="true" />
                    Companion stage: {disable3D ? '2D botanical mode' : '3D interactive mode'}
                  </button>
                </div>
              </section>

              {/* Quick Tools */}
              <div className="petey-garden-grid">
                <div className="petey-card petey-stack">
                  <span className="petey-small-label">Plant Health Triage</span>
                  <h2 className="petey-card-title">Conversational condition check</h2>
                  <p className="petey-body-muted">
                    Walk through environment, watering, and visible signs for practical next steps backed by extension sources.
                  </p>
                  <div>
                    <button
                      type="button"
                      className="hs-btn-primary"
                      onClick={() => openHealthModal(activePlant?.id ?? null)}
                    >
                      <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                      Start condition check
                    </button>
                  </div>
                </div>

                <div className="petey-card petey-stack">
                  <span className="petey-small-label">Experimental Demo</span>
                  <h2 className="petey-card-title">Plant Lab (synthetic data)</h2>
                  <p className="petey-body-muted">
                    Explore the experimental biophysics simulation workbench. Data in Plant Lab is clearly labeled as synthetic.
                  </p>
                  <div>
                    <button
                      type="button"
                      className="hs-btn-subtle"
                      onClick={() => setView('lab')}
                    >
                      <FlaskConical className="h-4 w-4" aria-hidden="true" />
                      Open Plant Lab
                    </button>
                  </div>
                </div>

                <div className="petey-card petey-stack">
                  <span className="petey-small-label">Connection & Preview Mode</span>
                  <h2 className="petey-card-title">
                    {previewActive
                      ? 'Development preview active'
                      : connection === 'ready'
                        ? 'Connected to backend'
                        : 'Backend unreachable'}
                  </h2>
                  <p className="petey-body-muted">
                    {previewActive
                      ? 'Using local session sample plants. Exit preview mode to connect directly to the FastAPI backend.'
                      : 'Petey Plant reads and writes real garden records via the FastAPI backend API.'}
                  </p>
                  <div className="petey-btn-row">
                    {previewActive ? (
                      <button
                        type="button"
                        className="hs-btn-subtle"
                        onClick={() => togglePreviewMode(false)}
                      >
                        Exit preview mode
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="hs-btn-subtle"
                          onClick={() => togglePreviewMode(true)}
                        >
                          Try development preview
                        </button>
                        {connection !== 'ready' && (
                          <button
                            type="button"
                            className="hs-btn-ghost"
                            onClick={retryBackendConnection}
                          >
                            Retry backend
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 8 Flagship Botanical Companions Showcase */}
              <section className="petey-stack" aria-labelledby="pals-catalog-heading">
                <div className="petey-page-header">
                  <div>
                    <span className="petey-small-label">
                      8 Flagship Companions · Registry Target {registrySummary.plannedLaunchSpeciesTarget} Species /{' '}
                      {registrySummary.plannedMasterModelsTarget} Master Models
                    </span>
                    <h2 id="pals-catalog-heading" className="petey-card-title mt-1 text-lg">
                      Botanical Companion Roster
                    </h2>
                  </div>
                </div>

                <div className="petey-garden-grid">
                  {FLAGSHIP_SPECIES_MANIFEST.map((entry) => (
                    <article key={entry.speciesId} className="petey-plant-card">
                      <div className="petey-plant-card-head">
                        <BotanicalThumbnail speciesId={entry.speciesId} size={56} />
                        <div className="min-w-0">
                          <span className="petey-small-label">{entry.traitLabel}</span>
                          <h3 className="petey-card-title truncate">{entry.commonName}</h3>
                          <p className="petey-scientific truncate">{entry.scientificName}</p>
                        </div>
                      </div>
                      <p className="petey-body-muted">{entry.botanicalSilhouetteNote}</p>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#DDE2DA]">
                        <span className="text-xs font-mono text-[#515D55]">
                          3D: {entry.assetStatus === 'procedural_fallback' ? 'Procedural rig' : entry.assetStatus}
                        </span>
                        <button
                          type="button"
                          className="hs-inline-link"
                          disabled={connection !== 'ready'}
                          onClick={() => startAddPlant(entry.speciesId, false)}
                        >
                          Add to garden <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </section>
          )}

          {/* ================= ADD PLANT FLOW ================= */}
          {view === 'add' && draft && (
            <AddPlantFlow
              key={draft.id}
              initial={draft}
              chooseSpecies={chooseSpecies}
              catalog={catalog}
              onBack={() => setView('home')}
              onSave={(saved) => {
                updatePlant(saved);
                setDraft(null);
                setSelectedId(saved.id);
                setView('home');
              }}
            />
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION (5 Core Destinations + Distinctive Center Lens) */}
      <nav className="petey-bottom-nav" aria-label="Primary mobile navigation">
        <button
          type="button"
          className="petey-nav-tab"
          aria-current={view === 'home' || view === 'detail' ? 'page' : undefined}
          onClick={() => setView('home')}
        >
          <Home className="h-5 w-5" aria-hidden="true" />
          <span>Home</span>
        </button>

        <button
          type="button"
          className="petey-nav-tab"
          aria-current={view === 'garden' ? 'page' : undefined}
          onClick={() => setView('garden')}
        >
          <Sprout className="h-5 w-5" aria-hidden="true" />
          <span>My Garden</span>
        </button>

        <button
          type="button"
          className="petey-nav-lens-tab"
          aria-current={view === 'lens' ? 'page' : undefined}
          onClick={() => setView('lens')}
          aria-label="Open Petey Lens camera identification"
        >
          <span className="petey-nav-lens-disc" aria-hidden="true">
            <Camera className="h-5 w-5" />
          </span>
          <span>Petey Lens</span>
        </button>

        <button
          type="button"
          className="petey-nav-tab"
          aria-current={view === 'care' ? 'page' : undefined}
          onClick={() => setView('care')}
        >
          <CalendarCheck className="h-5 w-5" aria-hidden="true" />
          <span>Care</span>
          {activeAlerts.length > 0 && <span className="petey-nav-badge">{activeAlerts.length}</span>}
        </button>

        <button
          type="button"
          className="petey-nav-tab"
          aria-current={view === 'more' ? 'page' : undefined}
          onClick={() => setView('more')}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {/* CONVERSATIONAL PLANT CONDITION INTAKE MODAL / BOTTOM SHEET */}
      {healthModalOpen && (
        <Suspense fallback={null}>
          <PlantHealth
            key={healthPlantId ?? 'general'}
            plant={checkedHealthPlant}
            asModal
            onBack={() => setHealthModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
