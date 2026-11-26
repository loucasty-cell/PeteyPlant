/**
 * Individual Plant Detail Care Profile Screen (Section 13).
 *
 * Treats every owned plant as an individual care entity — clearly separating:
 * - Individual plant observations & care history (`user_reported`)
 * - Engine assessment & estimated schedule (`engine_estimated`)
 * - Verified species botanical reference (`verified_species_reference`)
 * - Local outdoor weather context (`measured` outdoor weather, NOT indoor sensor)
 * - Missing / outdated information (`unknown`)
 *
 * Works seamlessly with or without 3D WebGL rendering.
 */

import { useState, type FormEvent } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  Box,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CloudSun,
  History,
  Info,
  Layers,
  Pencil,
  ShieldAlert,
} from 'lucide-react';
import type { CareKind, Drainage, GardenPlant, GardenSpecies, PlantUpdate } from '../../lib/gardenApi';
import { formatWeatherReading, type LiveWeatherState } from '../../lib/weatherService';
import type {
  WateringIntelligenceModel,
  WaterVolumeUnit,
} from '../../lib/care/careIntelligence';
import { resolveSpeciesAsset } from '../../lib/three/speciesAssetRegistry';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';
import { WateringIntelligencePanel } from './WateringIntelligencePanel';

const FULL_DATE = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const CAPACITY_FORMAT = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'liter',
  maximumFractionDigits: 3,
});

const HISTORY_LABELS: Record<GardenPlant['history'][number]['kind'], string> = {
  wet: 'Reported wet potting mix',
  dry: 'Owner reported dry potting mix',
  moist: 'Owner reported moist potting mix',
  unsure: 'Soil check inconclusive',
  watered: 'Owner logged watering',
};

export interface PlantDetailProfileProps {
  plant: GardenPlant;
  intel: WateringIntelligenceModel;
  weather: LiveWeatherState;
  unit: WaterVolumeUnit;
  onUnitChange: (unit: WaterVolumeUnit) => void;
  technicalView: boolean;
  onToggleTechnicalView: () => void;
  showCheckChoices: boolean;
  onShowCheckChoices: (open: boolean) => void;
  carePendingId: string | null;
  careError: string;
  careNotice: string;
  onRecordCare: (plant: GardenPlant, kind: CareKind) => void;
  onOpenConditionCheck: (plantId: string) => void;
  onOpenOn3DStage: (plantId: string) => void;
  onBack: () => void;
  catalog?: GardenSpecies[];
  onUpdatePlant?: (plantId: string, patch: PlantUpdate) => Promise<void>;
}

export function PlantDetailProfile({
  plant,
  intel,
  weather,
  unit,
  onUnitChange,
  technicalView,
  onToggleTechnicalView,
  showCheckChoices,
  onShowCheckChoices,
  carePendingId,
  careError,
  careNotice,
  onRecordCare,
  onOpenConditionCheck,
  onOpenOn3DStage,
  onBack,
  catalog = [],
  onUpdatePlant,
}: PlantDetailProfileProps) {
  const { entry, exactMatch } = resolveSpeciesAsset(plant.species_id);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editSpeciesId, setEditSpeciesId] = useState<string>(plant.species_id ?? '');
  const [editDrainage, setEditDrainage] = useState<Drainage>(plant.drainage);
  const [editCapacity, setEditCapacity] = useState('');
  const [editMix, setEditMix] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  function openEditor() {
    setEditSpeciesId(plant.species_id ?? '');
    setEditDrainage(plant.drainage);
    setEditCapacity(plant.container_volume_ml == null ? '' : String(plant.container_volume_ml / 1000));
    setEditMix(plant.potting_mix ?? '');
    setEditError('');
    setEditingDetails(true);
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!onUpdatePlant || editBusy) return;
    setEditBusy(true);
    setEditError('');
    try {
      const speciesId = editSpeciesId || null;
      const volumeMl = editCapacity === '' ? null : Math.round(Number(editCapacity) * 1000);
      const mix = editMix.trim() || null;
      const patch: PlantUpdate = {};
      if (speciesId !== plant.species_id) patch.species_id = speciesId;
      if (editDrainage !== plant.drainage) patch.drainage = editDrainage;
      if (volumeMl !== (plant.container_volume_ml ?? null)) patch.container_volume_ml = volumeMl;
      if (mix !== (plant.potting_mix ?? null)) patch.potting_mix = mix;
      if (Object.keys(patch).length) await onUpdatePlant(plant.id, patch);
      setEditingDetails(false);
    } catch (failure) {
      setEditError(failure instanceof Error ? failure.message : 'Could not update plant details.');
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <section className="petey-page-container" aria-labelledby="plant-detail-heading">
      {/* Top navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="petey-back-btn" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Home
        </button>

        <div className="petey-btn-row">
          <button
            type="button"
            className="petey-btn-secondary"
            onClick={() => onOpenOn3DStage(plant.id)}
          >
            <Box className="h-4 w-4" aria-hidden="true" />
            View on 3D stage
          </button>
          <button
            type="button"
            className="petey-btn-primary"
            onClick={() => onOpenConditionCheck(plant.id)}
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Update observations
          </button>
        </div>
      </div>

      {/* Individual Plant Identity Header */}
      <header className="petey-card profile-hero-card">
        <div className="profile-hero-left">
          <BotanicalThumbnail speciesId={plant.species_id} size={78} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="petey-small-label">Individual plant profile</span>
              <span className="provenance-chip" data-provenance="engine_estimated">
                ID: {plant.id.slice(0, 8)}
              </span>
            </div>
            <h1 id="plant-detail-heading" className="petey-page-title mt-0">
              {plant.name}
            </h1>
            <p className="petey-scientific mt-0.5">
              {plant.species_id ?? 'Unidentified species'}
              {plant.common_name ? ` · ${plant.common_name}` : ''}
            </p>
            <p className="text-caption text-[#5C6D62] mt-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {intel.lastObservationAt
                ? `Latest care entry: ${FULL_DATE.format(new Date(intel.lastObservationAt))}`
                : 'No care observations logged yet'}
            </p>
          </div>
        </div>

        <div className="profile-status-summary">
          <span className="wi-urgency-chip" data-severity={intel.urgency}>
            {intel.primaryCondition.label}
          </span>
          <span className="text-caption text-[#48584E] mt-1">
            {intel.primaryCondition.accessibleText}
          </span>
        </div>
      </header>

      {/* Two-Column Care Intelligence & Plant Specs Grid */}
      <div className="profile-grid">
        {/* Left: Active Watering Intelligence & Actions */}
        <div className="petey-stack">
          <WateringIntelligencePanel
            plant={plant}
            intel={intel}
            unit={unit}
            onUnitChange={onUnitChange}
            technicalView={technicalView}
            onToggleTechnicalView={onToggleTechnicalView}
            showCheckChoices={showCheckChoices}
            onShowCheckChoices={onShowCheckChoices}
            carePendingId={carePendingId}
            careError={careError}
            careNotice={careNotice}
            onRecordCare={onRecordCare}
            onOpenConditionCheck={onOpenConditionCheck}
            includeDisclosures={false}
          />

          {/* Active Conditions Breakdown */}
          <section className="petey-card petey-stack" aria-labelledby="active-cond-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="active-cond-heading" className="petey-card-title flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#234D36]" aria-hidden="true" />
                Active assessed conditions
              </h2>
              <span className="provenance-chip" data-provenance={intel.reliability === 'verified_observation' ? 'user_reported' : 'engine_estimated'}>
                {intel.reliability === 'verified_observation' ? 'Owner reported' : 'Engine assessment'}
              </span>
            </div>

            <ul className="profile-condition-list">
              {intel.activeConditions.map((cond) => (
                <li key={cond.id} className="profile-condition-item">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{cond.label}</strong>
                    <span className="wi-cond-tag" data-severity={cond.severity}>
                      {cond.severity}
                    </span>
                  </div>
                  <p className="petey-body-muted mt-1">{cond.careInstruction}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right: Physical Context, Provenance Legend, Species Reference, Care History */}
        <div className="petey-stack">
          {/* Pot, Soil & Environmental Context */}
          <section className="petey-card petey-stack" aria-labelledby="env-specs-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="env-specs-heading" className="petey-card-title flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#234D36]" aria-hidden="true" />
                Pot, substrate & environment
              </h2>
              <span className="provenance-chip" data-provenance="user_reported">
                Owner reported
              </span>
            </div>

            {onUpdatePlant && !editingDetails && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {plant.species_id === null && (
                  <p className="petey-body-muted m-0">
                    Identify this plant to unlock verified care guidance.
                  </p>
                )}
                <button
                  type="button"
                  className={plant.species_id === null ? 'petey-btn-primary' : 'petey-btn-secondary'}
                  onClick={openEditor}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {plant.species_id === null ? 'Identify plant & drainage' : 'Edit species & pot'}
                </button>
              </div>
            )}

            {editingDetails && (
              <form className="petey-stack" onSubmit={(event) => void saveDetails(event)}>
                <label className="petey-field">
                  Botanical species
                  <select
                    value={editSpeciesId}
                    disabled={editBusy}
                    onChange={(event) => setEditSpeciesId(event.target.value)}
                  >
                    <option value="">Unidentified species</option>
                    {catalog.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} ({sp.id}){sp.advice_status === 'verified' ? ' — Verified care' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="petey-field">
                  Pot drainage holes
                  <select
                    value={editDrainage}
                    disabled={editBusy}
                    onChange={(event) => setEditDrainage(event.target.value as Drainage)}
                  >
                    <option value="yes">Yes — pot has drainage holes</option>
                    <option value="no">No — no drainage holes</option>
                    <option value="unknown">Not sure</option>
                  </select>
                </label>

                <label className="petey-field">
                  Inner pot capacity (litres, optional)
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.001}
                    max={1000}
                    step={0.001}
                    value={editCapacity}
                    disabled={editBusy}
                    aria-describedby="pot-capacity-hint"
                    onChange={(event) => setEditCapacity(event.target.value)}
                  />
                  <span id="pot-capacity-hint" className="petey-body-muted">
                    Use the capacity on the pot label or a known measurement. Leave blank if unsure.
                  </span>
                </label>

                <label className="petey-field">
                  Potting mix (optional)
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="e.g. orchid bark mix"
                    value={editMix}
                    disabled={editBusy}
                    onChange={(event) => setEditMix(event.target.value)}
                  />
                </label>

                {editError && (
                  <p className="petey-alert petey-alert-error m-0" role="alert">
                    {editError}
                  </p>
                )}

                <div className="petey-btn-row">
                  <button type="submit" className="petey-btn-primary" disabled={editBusy}>
                    {editBusy ? 'Saving…' : 'Save details'}
                  </button>
                  <button
                    type="button"
                    className="petey-btn-secondary"
                    disabled={editBusy}
                    onClick={() => setEditingDetails(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <dl className="profile-spec-dl">
              <div>
                <dt>Pot drainage</dt>
                <dd>
                  {plant.drainage === 'yes'
                    ? 'Drainage holes confirmed'
                    : plant.drainage === 'no'
                      ? 'No drainage holes (extra caution)'
                      : 'Unknown — confirm inner pot'}
                </dd>
              </div>
              <div>
                <dt>Inner pot capacity</dt>
                <dd>{plant.container_volume_ml == null ? 'Not recorded' : CAPACITY_FORMAT.format(plant.container_volume_ml / 1000)}</dd>
              </div>
              <div>
                <dt>Potting mix</dt>
                <dd className="break-words">{plant.potting_mix ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Indoor light / sensor</dt>
                <dd>No live soil or light sensor connected</dd>
              </div>
              <div>
                <dt>Companion 3D asset</dt>
                <dd>
                  {entry.commonName} ({exactMatch ? 'species rig' : 'genus fallback'} ·{' '}
                  {entry.assetStatus === 'procedural_fallback' ? 'procedural' : entry.assetStatus})
                </dd>
              </div>
            </dl>

            <div className="profile-weather-box">
              <div className="flex items-center justify-between gap-2">
                <span className="petey-small-label flex items-center gap-1.5">
                  <CloudSun className="h-3.5 w-3.5" aria-hidden="true" />
                  Outdoor weather context
                </span>
                <span className="provenance-chip" data-provenance={weather.source === 'google-weather' ? 'measured' : 'preview'}>
                  {weather.source === 'google-weather' ? 'Live Google Weather' : 'Biome preview'}
                </span>
              </div>
              {weather.source === 'google-weather' ? (
                <>
                  <p className="petey-body-muted mt-1">
                    {weather.locationLabel} · {weather.conditionLabel}
                  </p>
                  <p className="petey-body-muted mt-1">
                    Temperature {formatWeatherReading(weather.temperatureC, '°C') ?? 'unavailable'} ·{' '}
                    Humidity {formatWeatherReading(weather.relativeHumidity, '% RH') ?? 'unavailable'} ·{' '}
                    Wind {formatWeatherReading(weather.windKmh, ' km/h') ?? 'unavailable'}
                  </p>
                  <p className="text-caption text-[#5C6D62] mt-1 m-0">{weather.careContext}</p>
                </>
              ) : (
                <p className="petey-body-muted mt-1">{weather.conditionLabel} preview. Live outdoor measurements are unavailable.</p>
              )}
            </div>
          </section>

          {/* Verified Species Botanical Reference (kept strictly distinct from individual assessment) */}
          <section className="petey-card petey-stack" aria-labelledby="species-ref-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="species-ref-heading" className="petey-card-title flex items-center gap-2">
                <Info className="h-4 w-4 text-[#234D36]" aria-hidden="true" />
                Species reference guidance
              </h2>
              <span className="provenance-chip" data-provenance="verified_species_reference">
                Species-level reference
              </span>
            </div>

            {plant.watering_guidance ? (
              <>
                <p className="petey-body-muted">{plant.watering_guidance}</p>
                {plant.watering_source && (
                  <a
                    href={plant.watering_source}
                    target="_blank"
                    rel="noreferrer"
                    className="petey-link-btn"
                  >
                    Read verified botanical source
                    <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
              </>
            ) : (
              <p className="petey-body-muted">
                No verified species-specific watering text is stored for this plant yet. Rely on touching the potting mix and checking pot drainage.
              </p>
            )}
          </section>

          {/* Individual Care & Observation History */}
          <section className="petey-card petey-stack" aria-labelledby="care-history-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="care-history-heading" className="petey-card-title flex items-center gap-2">
                <History className="h-4 w-4 text-[#234D36]" aria-hidden="true" />
                Care & observation history
              </h2>
              <span className="provenance-chip" data-provenance="user_reported">
                {plant.history.length} {plant.history.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {plant.history.length === 0 ? (
              <p className="petey-body-muted">
                No soil checks or watering logs recorded for {plant.name} yet. Record your first potting-mix check to start adapting its schedule.
              </p>
            ) : (
              <ol className="dock-history-list">
                {plant.history.map((evt) => (
                  <li key={evt.id}>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#234D36] shrink-0" aria-hidden="true" />
                      {HISTORY_LABELS[evt.kind]}
                    </span>
                    <time dateTime={evt.occurred_at}>
                      {FULL_DATE.format(new Date(evt.occurred_at))}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
