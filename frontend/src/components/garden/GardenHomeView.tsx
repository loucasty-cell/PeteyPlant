import { lazy, Suspense } from 'react';
import {
  ArrowRight,
  Bell,
  Camera,
  Check,
  ChevronDown,
  MapPin,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  X,
} from 'lucide-react';
import {
  formatWeatherReading,
  NATURE_THEME_CATEGORIES,
  WEATHER_LOCATIONS,
  WEATHER_THEMES,
} from '../../lib/weatherService';
import { buildWateringIntelligence } from '../../lib/care/careIntelligence';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';
import { PeteyLogo } from './PeteyLogo';
import { WeatherBackdrop } from './WeatherBackdrop';
import { HomeCareSurface } from './HomeCareSurface';
import { ATMOSPHERE_LIST, STATUS_LABELS, WeatherIcon } from './gardenShellShared';
import type { useGardenWorkspace } from './useGardenWorkspace';

const InteractivePlantStage = lazy(() =>
  import('./InteractivePlantStage').then((module) => ({ default: module.InteractivePlantStage })),
);

export function GardenHomeView({ ws }: { ws: ReturnType<typeof useGardenWorkspace> }) {
  return (
    <div className="hs-home-workspace">
      <header className="hs-toolbar" aria-label="Workspace toolbar">
        <div className="hs-toolbar-left">
          <button
            type="button"
            className="hs-toolbar-brand-mobile"
            onClick={() => ws.setView('more')}
            aria-label="Petey Plant settings"
          >
            <PeteyLogo size={26} />
          </button>

          {ws.activePlant && ws.prioritizedPlants.length > 1 ? (
            <div
              className="lv-switcher-wrap"
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !ws.switcherOpen) return;
                event.stopPropagation();
                ws.setSwitcherOpen(false);
                ws.plantSwitcherTrigger.current?.focus();
              }}
            >
              <button
                type="button"
                className="lv-plant-switcher-btn"
                aria-expanded={ws.switcherOpen}
                ref={ws.plantSwitcherTrigger}
                aria-controls={ws.switcherOpen ? 'petey-plant-switcher' : undefined}
                onClick={() => {
                  ws.setSwitcherOpen((open) => !open);
                  ws.setWeatherMenuOpen(false);
                }}
              >
                <h1 className="hs-toolbar-plant-name m-0">{ws.activePlant.name}</h1>
                <ChevronDown className="h-3.5 w-3.5 text-[#515D55] shrink-0" aria-hidden="true" />
              </button>

              {ws.switcherOpen && (
                <div className="lv-switcher-popover" id="petey-plant-switcher" role="group" aria-label="Switch active plant">
                  {ws.prioritizedPlants.map((p) => {
                    const selected = p.id === ws.activePlant?.id;
                    const pIntel = buildWateringIntelligence(p, { unit: ws.waterUnit });
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={selected}
                        className={`lv-switcher-item ${selected ? 'is-selected' : ''}`}
                        onClick={() => {
                          ws.setSelectedId(p.id);
                          ws.setSwitcherOpen(false);
                          ws.plantSwitcherTrigger.current?.focus();
                        }}
                      >
                        <BotanicalThumbnail speciesId={p.species_id} size={28} />
                        <span className="min-w-0 flex-1 text-left">
                          <strong className="block text-xs text-[#202923] truncate">{p.name}</strong>
                          <small className="block text-[11px] text-[#5C6860] truncate">
                            {STATUS_LABELS[p.status]}
                          </small>
                        </span>
                        <span className="hs-severity-dot" data-severity={pIntel.urgency} aria-hidden="true" />
                        {selected && <Check className="h-3.5 w-3.5 text-[#234D36] shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="lv-switcher-footer"
                    onClick={() => {
                      ws.setSwitcherOpen(false);
                      ws.setView('garden');
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
              {ws.activePlant ? ws.activePlant.name : 'Petey Plant'}
            </h1>
          )}
        </div>

        <div className="hs-toolbar-right">
          <button
            type="button"
            className="hs-toolbar-pill"
            onClick={() => {
              ws.setWeatherMenuOpen((open) => !open);
              ws.setSwitcherOpen(false);
            }}
            aria-expanded={ws.weatherMenuOpen}
            aria-label="Outdoor weather atmosphere settings"
          >
            <WeatherIcon atmosphere={ws.weather.atmosphere} />
            <span className="font-mono font-semibold">{formatWeatherReading(ws.weather.temperatureC, '°C') ?? '—'}</span>
            <span className="hs-hide-xs">{ws.weather.source === 'google-weather' ? 'Outdoor' : 'Preview'}</span>
          </button>

          {ws.validCartPlantIds.length > 0 && (
            <button
              type="button"
              className="hs-toolbar-pill hs-toolbar-cart-pill"
              onClick={() => ws.setView('care')}
              aria-label={`${ws.validCartPlantIds.length} plants queued in Hydration Cart`}
            >
              <ShoppingBasket className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono font-semibold">{ws.validCartPlantIds.length}</span>
            </button>
          )}

          {ws.activeAlerts.length > 0 && (
            <button
              type="button"
              className="hs-toolbar-pill hs-toolbar-alert-pill"
              onClick={() => ws.setView('care')}
              aria-label={`${ws.activeAlerts.length} active plant care alerts`}
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono font-semibold">{ws.activeAlerts.length}</span>
            </button>
          )}
        </div>
      </header>

      <div className="companion-shell">
        <section
          className="companion-stage"
          aria-label="Interactive plant companion stage"
          onPointerMove={(e) => {
            if (ws.reduced) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
            const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
            ws.setStageParallax({ x: nx, y: ny });
          }}
          onPointerLeave={() => {
            if (!ws.reduced) ws.setStageParallax({ x: 0, y: 0 });
          }}
        >
          <WeatherBackdrop theme={ws.weatherTheme} parallaxOffset={ws.stageParallax} />

          <Suspense
            fallback={
              <div className="stage-fallback" aria-label="Loading the plant companion">
                <BotanicalThumbnail speciesId={ws.activePlant ? ws.activePlant.species_id : 'Monstera deliciosa'} size={160} />
              </div>
            }
          >
            <InteractivePlantStage
              speciesId={ws.activePlant ? ws.activePlant.species_id : 'Monstera deliciosa'}
              mood={ws.activeIntel?.primaryCondition.companionMood ?? 'happy'}
              animationState={ws.activeIntel?.primaryCondition.animationPreset ?? 'idle'}
              posturePreset={ws.activeIntel?.primaryCondition.posturePreset}
              theme={ws.weatherTheme}
              windKmh={ws.weather.windKmh ?? 0}
              playCount={ws.playCount}
              reactionKind={ws.reactionKind}
              reduced={ws.reduced}
              disable3D={ws.disable3D}
              statusAccessibleLabel={ws.activeIntel?.primaryCondition.staticFallbackLabel}
              onPet={ws.triggerCompanionGreet}
              showAtmosphere
            />
          </Suspense>

          {ws.stageToast && (
            <div className="stage-toast" role="status">
              {ws.stageToast}
            </div>
          )}

          {ws.activePlant && ws.activeIntel && (
            <div className="lv-stage-speech-wrap">
              <button
                type="button"
                className="lv-speech-bubble"
                onClick={ws.triggerCompanionGreet}
                aria-label={`${ws.activePlant.name} says: ${ws.activeIntel.companionSpeech.message}`}
              >
                <span className="hs-severity-dot" data-severity={ws.activeIntel.urgency} aria-hidden="true" />
                <span className="lv-speech-copy">“{ws.activeIntel.companionSpeech.message}”</span>
                <span className="lv-speech-biome-tag" aria-hidden="true">
                  <WeatherIcon atmosphere={ws.weather.atmosphere} />
                  <span>{ws.weatherTheme.label}</span>
                </span>
              </button>

              <button
                type="button"
                className="lv-biome-cycle-btn"
                onClick={ws.cycleNextNatureTheme}
                aria-label={`Switch nature theme (current: ${ws.weatherTheme.label})`}
                title={`Next nature theme (${ATMOSPHERE_LIST.indexOf(ws.weather.atmosphere) + 1}/${ATMOSPHERE_LIST.length})`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Biome</span>
              </button>
            </div>
          )}

          {ws.weatherMenuOpen && (
            <div className="weather-popover" role="dialog" aria-label="Outdoor weather atmosphere">
              <div className="weather-popover-head">
                <div className="min-w-0">
                  <span className="weather-popover-title block truncate">
                    {ws.weather.locationLabel} · {ws.weatherTheme.label}
                  </span>
                  <span className="weather-popover-sub">
                    32 interactive nature themes · {ATMOSPHERE_LIST.indexOf(ws.weather.atmosphere) + 1} of{' '}
                    {ATMOSPHERE_LIST.length}
                  </span>
                </div>
                <button
                  type="button"
                  className="weather-popover-close"
                  onClick={() => ws.setWeatherMenuOpen(false)}
                  aria-label="Close outdoor weather settings"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="weather-popover-stats">
                <div className="weather-stat-cell">
                  <span className="weather-stat-label">{ws.weather.source === 'google-weather' ? 'Outdoor' : 'Preview'}</span>
                  <span className="weather-stat-val">{formatWeatherReading(ws.weather.temperatureC, '°C') ?? '—'}</span>
                </div>
                <div className="weather-stat-cell">
                  <span className="weather-stat-label">Humidity</span>
                  <span className="weather-stat-val">{formatWeatherReading(ws.weather.relativeHumidity, '%') ?? 'Unavailable'}</span>
                </div>
                <div className="weather-stat-cell">
                  <span className="weather-stat-label">Wind</span>
                  <span className="weather-stat-val">{formatWeatherReading(ws.weather.windKmh, ' km/h') ?? 'Unavailable'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  className="duo-btn duo-btn-primary duo-btn-sm flex-1"
                  disabled={ws.weatherLoading}
                  onClick={ws.requestUserGpsWeather}
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  <span>{ws.weatherLoading ? 'Syncing…' : 'Live GPS'}</span>
                </button>
                <button
                  type="button"
                  className="duo-btn duo-btn-sage duo-btn-sm"
                  onClick={ws.cycleNextNatureTheme}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>Next biome</span>
                </button>
              </div>

              {ws.gpsError && (
                <p className="petey-alert petey-alert-error mb-2" role="alert">
                  {ws.gpsError}
                </p>
              )}

              <p className="weather-section-label">Live cities (Google Weather)</p>
              <div className="weather-loc-grid">
                {WEATHER_LOCATIONS.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    className={`weather-choice-btn ${ws.activeLocationId === loc.id ? 'active' : ''}`}
                    disabled={ws.weatherLoading}
                    onClick={() => void ws.selectLocationPreset(loc.id)}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>

              <div className="weather-section-bar">
                <p className="weather-section-label m-0">
                  32 Nature Biomes (
                  {ws.themeCategoryFilter === 'all'
                    ? ATMOSPHERE_LIST.length
                    : ATMOSPHERE_LIST.filter((id) => WEATHER_THEMES[id].category === ws.themeCategoryFilter).length}
                  )
                </p>
              </div>

              <div className="weather-category-chips" role="tablist" aria-label="Filter nature biome categories">
                <button
                  type="button"
                  role="tab"
                  aria-selected={ws.themeCategoryFilter === 'all'}
                  className={`weather-cat-chip ${ws.themeCategoryFilter === 'all' ? 'active' : ''}`}
                  onClick={() => ws.setThemeCategoryFilter('all')}
                >
                  All (32)
                </button>
                {NATURE_THEME_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={ws.themeCategoryFilter === cat}
                    className={`weather-cat-chip ${ws.themeCategoryFilter === cat ? 'active' : ''}`}
                    onClick={() => ws.setThemeCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="weather-theme-gallery">
                {ATMOSPHERE_LIST.filter(
                  (id) => ws.themeCategoryFilter === 'all' || WEATHER_THEMES[id].category === ws.themeCategoryFilter,
                ).map((id) => {
                  const t = WEATHER_THEMES[id];
                  const isSelected = ws.weather.atmosphere === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`weather-theme-card ${isSelected ? 'active' : ''}`}
                      onClick={() => ws.selectAtmospherePreview(id)}
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
                {ws.weather.source === 'google-weather'
                  ? 'Outdoor weather from Google Weather automatically selects the matching nature biome. Does not measure indoor room temperature or potting mix moisture.'
                  : 'Interactive nature biome preview. Pick a city or Live GPS for automatic Google Weather matching.'}
              </p>
            </div>
          )}
        </section>

        <section className="companion-dock" aria-label="Plant care decision">
          <div className="dock-scroll-body">
            {ws.connection === 'loading' && (
              <div className="lv-care-card" role="status">
                <p className="petey-body-muted m-0">Connecting to Petey Plant backend…</p>
              </div>
            )}

            {ws.connection === 'offline' && (
              <div className="lv-care-card" data-tone="details">
                <span className="petey-small-label">Condition unavailable</span>
                <h2 className="lv-offline-title">Garden records are offline</h2>
                <p className="lv-care-summary">
                  {ws.connectionError ||
                    'Petey Plant uses your FastAPI backend as the source of truth for care history and recommendations.'}
                </p>
                <div className="lv-primary-row mt-2">
                  <button
                    type="button"
                    className="duo-btn duo-btn-primary duo-btn-sm flex-1"
                    onClick={ws.retryBackendConnection}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    className="duo-btn duo-btn-secondary duo-btn-sm flex-1"
                    onClick={() => ws.togglePreviewMode(true)}
                  >
                    <span>Enable preview</span>
                  </button>
                </div>
                <p className="hs-disclosure-muted mt-2">
                  Development preview uses temporary sample plants in browser storage while FastAPI is offline.
                </p>
              </div>
            )}

            {ws.connection === 'ready' && (
              <>
                {ws.activePlant && ws.activeIntel ? (
                  <HomeCareSurface
                    plant={ws.activePlant}
                    intel={ws.activeIntel}
                    unit={ws.waterUnit}
                    reducedMotion={ws.reduced}
                    onUnitChange={ws.handleUnitChange}
                    showCheckChoices={ws.showCheckChoices}
                    onShowCheckChoices={ws.setShowCheckChoices}
                    carePendingId={ws.carePendingId}
                    careError={ws.careError}
                    careNotice={ws.careNotice}
                    onRecordCare={(p, kind) => void ws.recordCareForPlant(p, kind)}
                    onOpenConditionCheck={(id) =>
                      ws.previewActive || !id ? ws.openHealthModal(id) : ws.setCheckupPlantId(id)
                    }
                    onOpenProfile={(id) => ws.openPlantProfile(id)}
                    inHydrationCart={ws.validCartPlantIds.includes(ws.activePlant.id)}
                    onToggleHydrationCart={(id) => ws.toggleCartPlant(id)}
                    activeBiomeLabel={ws.weatherTheme.label}
                    weatherLocationLabel={
                      ws.weather.source === 'google-weather' ? ws.weather.locationLabel : 'Atmosphere preview'
                    }
                    onCycleBiome={ws.cycleNextNatureTheme}
                  />
                ) : (
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
                        onClick={() => ws.startAddPlant()}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        <span>Add your plant</span>
                      </button>
                      <button
                        type="button"
                        className="duo-btn duo-btn-secondary duo-btn-sm"
                        onClick={() => ws.setView('lens')}
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
  );
}
