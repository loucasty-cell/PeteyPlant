import { useMemo } from 'react';
import {
  ArrowRight,
  Bell,
  BellOff,
  Box,
  ClipboardCheck,
  FlaskConical,
} from 'lucide-react';
import {
  SPECIES_ASSET_MANIFEST,
  getRegistryCoverageSummary,
} from '../../lib/three/speciesAssetRegistry';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';
import { PeteyLogo } from './PeteyLogo';
import { formatHour } from './gardenShellShared';
import type { useGardenWorkspace } from './useGardenWorkspace';

export function GardenMoreView({ ws }: { ws: ReturnType<typeof useGardenWorkspace> }) {
  const registrySummary = useMemo(() => getRegistryCoverageSummary(), []);

  return (
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

      <section className="petey-card petey-stack" aria-labelledby="notif-prefs-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="petey-small-label">Notification preferences</span>
            <h2 id="notif-prefs-heading" className="petey-card-title mt-0.5">
              In-session care reminders & quiet hours
            </h2>
          </div>
          <span className="hs-prov-tag">
            {ws.notifPermission === 'granted'
              ? 'Browser permission granted'
              : ws.notifPermission === 'denied'
                ? 'Permission blocked in browser'
                : ws.notifPermission === 'unsupported'
                  ? 'Unsupported browser'
                  : 'Permission not requested'}
          </span>
        </div>

        <p className="petey-body-muted">
          Preferences are saved on this device. Petey Plant currently shows care alerts inside the app.
        </p>

        <div className="hs-pref-grid">
          <label className="hs-toggle-row">
            <span>
              <strong>Routine watering & check cues</strong>
              <small>Surface due checks and watering actions during your session</small>
            </span>
            <input
              type="checkbox"
              checked={ws.notifPrefs.routineReminders}
              onChange={(e) => ws.updateNotifPref({ routineReminders: e.target.checked })}
            />
          </label>

          <label className="hs-toggle-row">
            <span>
              <strong>Urgent alerts only</strong>
              <small>Prioritize root-rot brakes and urgent plant risks</small>
            </span>
            <input
              type="checkbox"
              checked={ws.notifPrefs.urgentOnly}
              onChange={(e) => ws.updateNotifPref({ urgentOnly: e.target.checked })}
            />
          </label>

          <label className="hs-toggle-row">
            <span>
              <strong>
                Quiet hours ({formatHour(ws.notifPrefs.quietStartHour)} – {formatHour(ws.notifPrefs.quietEndHour)})
              </strong>
              <small>
                {ws.inQuietHoursNow
                  ? 'Quiet hours are active right now — routine reminders paused.'
                  : 'Pause routine reminders during evening/night hours.'}
              </small>
            </span>
            <input
              type="checkbox"
              checked={ws.notifPrefs.quietHoursEnabled}
              onChange={(e) => ws.updateNotifPref({ quietHoursEnabled: e.target.checked })}
            />
          </label>

          {ws.notifPrefs.quietHoursEnabled && (
            <div className="petey-two-col">
              <label className="petey-field">
                Quiet hours start
                <select
                  value={ws.notifPrefs.quietStartHour}
                  onChange={(e) => ws.updateNotifPref({ quietStartHour: Number(e.target.value) })}
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
                  value={ws.notifPrefs.quietEndHour}
                  onChange={(e) => ws.updateNotifPref({ quietEndHour: Number(e.target.value) })}
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
          {ws.notifPermission === 'default' && (
            <button
              type="button"
              className="hs-btn-subtle"
              onClick={() => void ws.requestBrowserNotificationPermission()}
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              Allow browser reminders
            </button>
          )}
          {ws.notifPermission === 'granted' && (
            <button
              type="button"
              className="hs-btn-subtle"
              onClick={() => ws.updateNotifPref({ enabled: !ws.notifPrefs.enabled })}
            >
              {ws.notifPrefs.enabled ? (
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
            onClick={ws.handleToggleDisable3D}
          >
            <Box className="h-4 w-4" aria-hidden="true" />
            Companion stage: {ws.disable3D ? '2D botanical mode' : '3D interactive mode'}
          </button>
        </div>
      </section>

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
              onClick={() => ws.openHealthModal(ws.activePlant?.id ?? null)}
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
              onClick={() => ws.setView('lab')}
            >
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Open Plant Lab
            </button>
          </div>
        </div>

        <div className="petey-card petey-stack">
          <span className="petey-small-label">Connection & Preview Mode</span>
          <h2 className="petey-card-title">
            {ws.previewActive
              ? 'Development preview active'
              : ws.connection === 'ready'
                ? 'Connected to backend'
                : 'Backend unreachable'}
          </h2>
          <p className="petey-body-muted">
            {ws.previewActive
              ? 'Using local session sample plants. Exit preview mode to connect directly to the FastAPI backend.'
              : 'Petey Plant reads and writes real garden records via the FastAPI backend API.'}
          </p>
          <div className="petey-btn-row">
            {ws.previewActive ? (
              <button
                type="button"
                className="hs-btn-subtle"
                onClick={() => ws.togglePreviewMode(false)}
              >
                Exit preview mode
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="hs-btn-subtle"
                  onClick={() => ws.togglePreviewMode(true)}
                >
                  Try development preview
                </button>
                {ws.connection !== 'ready' && (
                  <button
                    type="button"
                    className="hs-btn-ghost"
                    onClick={ws.retryBackendConnection}
                  >
                    Retry backend
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <section className="petey-stack" aria-labelledby="pals-catalog-heading">
        <div className="petey-page-header">
          <div>
            <span className="petey-small-label">
              {registrySummary.counts.authored} Blender companions
            </span>
            <h2 id="pals-catalog-heading" className="petey-card-title mt-1 text-lg">
              Botanical Companion Roster
            </h2>
          </div>
        </div>

        <div className="petey-garden-grid">
          {SPECIES_ASSET_MANIFEST.map((entry) => (
            <article key={entry.speciesId} className="petey-plant-card">
              <div className="petey-plant-card-head">
                <BotanicalThumbnail speciesId={entry.speciesId} size={56} preferRender />
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
                  disabled={ws.connection !== 'ready'}
                  onClick={() => ws.startAddPlant(entry.speciesId, false)}
                >
                  Add to garden <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
