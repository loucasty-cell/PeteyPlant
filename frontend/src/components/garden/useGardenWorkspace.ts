import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackendUnavailableError,
  createUuid,
  gardenApi,
  isPreviewMode,
  resetBackendStatusCache,
  setPreviewMode,
  type CareKind,
  type GardenPlant,
  type GardenSpecies,
  type PlantDraft,
  type PlantUpdate,
} from '../../lib/gardenApi';
import {
  createPreviewWeather,
  defaultTimeWeather,
  fetchGoogleWeather,
  WEATHER_LOCATIONS,
  WEATHER_THEMES,
  type LiveWeatherState,
  type NatureThemeCategory,
  type WeatherAtmosphereId,
} from '../../lib/weatherService';
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
import { DRAFT_KEY } from './AddPlantFlow';
import {
  ATMOSPHERE_LIST,
  isDueNow,
  RENDER_MODE_KEY,
  SELECTED_PLANT_KEY,
  useReducedMotion,
  VIEW_TITLES,
  type PrimaryView,
} from './gardenShellShared';

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

export function useGardenWorkspace() {
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);

  const [view, setView] = useState<PrimaryView>(() => {
    const v = initialQuery.get('view');
    if (v === 'lab' || v === 'garden' || v === 'lens' || v === 'care' || v === 'more') return v;
    if (initialQuery.get('plant') && initialQuery.get('action') === 'profile') return 'detail';
    return 'home';
  });

  const [storedPlants, setPlants] = useState<GardenPlant[]>([]);
  const [careClock, setCareClock] = useState(Date.now);
  const [checkupPlantId, setCheckupPlantId] = useState<string | null>(null);
  const plantSwitcherTrigger = useRef<HTMLButtonElement>(null);
  const pendingCareIds = useRef(new Map<string, string>());

  const plants = useMemo(
    () =>
      storedPlants.map((plant) => {
        const expires = Date.parse(plant.watering_advice_expires_at ?? plant.next_check_at ?? '');
        if (plant.status !== 'ready' || (Number.isFinite(expires) && expires > careClock)) return plant;
        return {
          ...plant,
          status: 'check' as const,
          message: 'The previous soil observation has expired. Check the mix again before watering.',
        };
      }),
    [storedPlants, careClock],
  );
  const checkupPlant = plants.find((plant) => plant.id === checkupPlantId);

  useEffect(() => {
    const refreshClock = () => setCareClock(Date.now());
    document.addEventListener('visibilitychange', refreshClock);
    const expires = storedPlants
      .filter((plant) => plant.status === 'ready')
      .map((plant) => Date.parse(plant.watering_advice_expires_at ?? plant.next_check_at ?? ''))
      .filter((time) => time > careClock);
    const timer = expires.length
      ? window.setTimeout(refreshClock, Math.max(0, Math.min(...expires) - Date.now()) + 1)
      : undefined;
    return () => {
      document.removeEventListener('visibilitychange', refreshClock);
      window.clearTimeout(timer);
    };
  }, [storedPlants, careClock]);

  const [catalog, setCatalog] = useState<GardenSpecies[]>([]);
  const [connection, setConnection] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [connectionError, setConnectionError] = useState('');
  const [previewActive, setPreviewActive] = useState<boolean>(() => isPreviewMode());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialQuery.get('plant') ?? readStoredSelectedPlantId(),
  );
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const [waterUnit, setWaterUnit] = useState<WaterVolumeUnit>(() => readWaterUnitPreference());
  const [technicalView, setTechnicalView] = useState(false);
  const [disable3D, setDisable3D] = useState<boolean>(() => readDisable3D());

  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<string, string>>(() =>
    readAcknowledgedAlerts(),
  );
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(() =>
    readNotificationPreferences(),
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );

  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [healthPlantId, setHealthPlantId] = useState<string | null>(null);
  const [chooseSpecies, setChooseSpecies] = useState(false);
  const [draft, setDraft] = useState<PlantDraft | null>(readDraft);

  const [gardenQuery, setGardenQuery] = useState('');
  const [gardenFilter, setGardenFilter] = useState<'all' | 'due' | 'attention' | 'resting'>('all');
  const [gardenSort, setGardenSort] = useState<'priority' | 'name' | 'species'>('priority');
  const [gardenLayout, setGardenLayout] = useState<'list' | 'grid'>('list');

  const [weather, setWeather] = useState<LiveWeatherState>(() => defaultTimeWeather());
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherMenuOpen, setWeatherMenuOpen] = useState(false);
  const [activeLocationId, setActiveLocationId] = useState<string>('sf');
  const [gpsError, setGpsError] = useState('');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [themeCategoryFilter, setThemeCategoryFilter] = useState<NatureThemeCategory | 'all'>('all');
  const [stageParallax, setStageParallax] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  useEffect(() => {
    document.title = VIEW_TITLES[view];
  }, [view]);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

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

  useEffect(() => {
    if (deepLinkApplied.current || plants.length === 0) return;
    const requestedPlant = initialQuery.get('plant');
    const requestedAction = initialQuery.get('action');
    if (requestedPlant && plants.some((p) => p.id === requestedPlant)) {
      deepLinkApplied.current = true;
      setSelectedId(requestedPlant);
      if (requestedAction === 'check') {
        setCheckupPlantId(requestedPlant);
      } else if (requestedAction === 'profile') {
        setView('detail');
      }
    }
  }, [initialQuery, plants]);

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
      if (result === 'granted') updateNotifPref({ enabled: true });
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
    if (!enable) resetBackendStatusCache();
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
        ? { id: createUuid(), species_id: match.id, name: match.name, drainage: 'unknown' }
        : readDraft() ?? { id: createUuid(), species_id: null, name: '', drainage: 'unknown' },
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

  async function patchPlantDetails(plantId: string, patch: PlantUpdate) {
    const updated = await gardenApi.update(plantId, patch);
    updatePlant(updated);
  }

  function openHealthModal(plantId: string | null = null) {
    setHealthPlantId(plantId);
    setHealthModalOpen(true);
  }

  function openPlantProfile(plantId: string) {
    setSelectedId(plantId);
    setView('detail');
  }

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
      if (prev.includes(plantId)) return prev.filter((id) => id !== plantId);
      if (getHydrationEligibility(plant) !== 'eligible') return prev;
      return [...prev, plantId];
    });
  }

  function queueAllReadyToCart() {
    setCartPlantIds(
      prioritizedPlants.filter((p) => getHydrationEligibility(p) === 'eligible').map((p) => p.id),
    );
  }

  function clearHydrationCart() {
    setCartPlantIds([]);
  }

  async function persistCare(plantId: string, kind: CareKind) {
    const key = `petey-pending-care:${plantId}:${kind}`;
    let id = pendingCareIds.current.get(key);
    try { id ??= sessionStorage.getItem(key) ?? undefined; } catch { /* Use in-memory retry ID. */ }
    id ??= createUuid();
    pendingCareIds.current.set(key, id);
    try { sessionStorage.setItem(key, id); } catch { /* Use in-memory retry ID. */ }
    const saved = await gardenApi.record(plantId, { id, kind });
    pendingCareIds.current.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* Server confirmed. */ }
    return saved;
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
          const updated = await persistCare(plant.id, 'watered');
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
      const updated = await persistCare(plant.id, kind);
      updatePlant(updated);
      setShowCheckChoices(false);
      setJustRecordedAction({ plantId: updated.id, kind });
      if (kind === 'watered') {
        setCartPlantIds((prev) => prev.filter((id) => id !== updated.id));
        setReactionKind('water');
        setPlayCount((c) => c + 1);
        setCareNotice(`Watering logged for ${updated.name}. Reassessment pending.`);
        flashStageToast(`Action recorded · ${updated.name}`);
      } else {
        setReactionKind('pet');
        setPlayCount((c) => c + 1);
        setCareNotice(`Soil observation saved for ${updated.name}.`);
        flashStageToast(kind === 'moist' ? 'Moist mix noted · hold watering' : 'Observation saved');
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

  const checkedHealthPlant = plants.find((p) => p.id === healthPlantId);
  const inQuietHoursNow = isWithinQuietHours(notifPrefs, new Date().getHours());

  return {
    view,
    setView,
    plants,
    prioritizedPlants,
    activePlant,
    activeIntel,
    catalog,
    connection,
    connectionError,
    previewActive,
    selectedId,
    setSelectedId,
    switcherOpen,
    setSwitcherOpen,
    plantSwitcherTrigger,
    waterUnit,
    handleUnitChange,
    technicalView,
    setTechnicalView,
    disable3D,
    handleToggleDisable3D,
    activeAlerts,
    ackedAlerts,
    careGroups,
    filteredGarden,
    gardenQuery,
    setGardenQuery,
    gardenFilter,
    setGardenFilter,
    gardenSort,
    setGardenSort,
    gardenLayout,
    setGardenLayout,
    weather,
    weatherTheme,
    weatherLoading,
    weatherMenuOpen,
    setWeatherMenuOpen,
    activeLocationId,
    gpsError,
    gmpQuotaExceeded,
    themeCategoryFilter,
    setThemeCategoryFilter,
    stageParallax,
    setStageParallax,
    playCount,
    reactionKind,
    stageToast,
    carePendingId,
    careError,
    careNotice,
    showCheckChoices,
    setShowCheckChoices,
    validCartPlantIds,
    cartBatchBusy,
    reduced,
    checkupPlant,
    setCheckupPlantId,
    healthModalOpen,
    setHealthModalOpen,
    healthPlantId,
    checkedHealthPlant,
    chooseSpecies,
    draft,
    setDraft,
    notifPrefs,
    notifPermission,
    inQuietHoursNow,
    triggerCompanionGreet,
    updateNotifPref,
    requestBrowserNotificationPermission,
    handleAcknowledgeAlert,
    handleRestoreAlert,
    togglePreviewMode,
    retryBackendConnection,
    selectLocationPreset,
    requestUserGpsWeather,
    selectAtmospherePreview,
    cycleNextNatureTheme,
    startAddPlant,
    updatePlant,
    patchPlantDetails,
    openHealthModal,
    openPlantProfile,
    toggleCartPlant,
    queueAllReadyToCart,
    clearHydrationCart,
    confirmCartRound,
    recordCareForPlant,
  };
}
