import { lazy, Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PlantDetailProfile } from './PlantDetailProfile';
import { CareAlertCenter } from './CareAlertCenter';
import { AddPlantFlow } from './AddPlantFlow';
import { GardenSidebar, GardenBottomNav } from './GardenShellNav';
import { GardenHomeView } from './GardenHomeView';
import { GardenCollectionView } from './GardenCollectionView';
import { GardenMoreView } from './GardenMoreView';
import { useGardenWorkspace } from './useGardenWorkspace';
import './companion-stage.css';

const PeteyLens = lazy(() => import('./PeteyLens'));
const CheckupDialog = lazy(() => import('./CheckupDialog'));
const PlantHealth = lazy(() => import('./PlantHealth'));
const PlantLab = lazy(() => import('../lab/PlantLab'));

export default function GardenApp() {
  const ws = useGardenWorkspace();

  const quotaBanner = ws.gmpQuotaExceeded && (
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

  const previewBanner = ws.previewActive && (
    <div className="petey-preview-banner" role="status">
      <span>
        Development preview — sample plants stored locally in browser session (not connected to FastAPI database).
      </span>
      <button type="button" onClick={() => ws.togglePreviewMode(false)}>
        Exit preview
      </button>
    </div>
  );

  if (ws.view === 'lab') {
    return (
      <div className="petey-shell">
        {quotaBanner}
        <div className="flex items-center justify-between px-4 py-3 bg-[#FFFFFF] border-b border-[#DDE2DA]">
          <button type="button" className="petey-back-btn" onClick={() => ws.setView('more')}>
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
        <GardenSidebar
          view={ws.view}
          plantsCount={ws.plants.length}
          alertsCount={ws.activeAlerts.length}
          connectionReady={ws.connection === 'ready'}
          onNavigate={ws.setView}
          onAddPlant={() => ws.startAddPlant()}
        />

        <main
          id="petey-main"
          className={`petey-main-area ${ws.view === 'home' ? 'is-home-view' : ''}`}
          tabIndex={-1}
        >
          {ws.view === 'home' && <GardenHomeView ws={ws} />}

          {ws.view === 'detail' && ws.activePlant && ws.activeIntel && (
            <PlantDetailProfile
              plant={ws.activePlant}
              intel={ws.activeIntel}
              weather={ws.weather}
              unit={ws.waterUnit}
              onUnitChange={ws.handleUnitChange}
              technicalView={ws.technicalView}
              onToggleTechnicalView={() => ws.setTechnicalView((v) => !v)}
              showCheckChoices={ws.showCheckChoices}
              onShowCheckChoices={ws.setShowCheckChoices}
              carePendingId={ws.carePendingId}
              careError={ws.careError}
              careNotice={ws.careNotice}
              onRecordCare={(p, kind) => void ws.recordCareForPlant(p, kind)}
              onOpenConditionCheck={(id) =>
                ws.previewActive || !id ? ws.openHealthModal(id) : ws.setCheckupPlantId(id)
              }
              onOpenOn3DStage={(id) => {
                ws.setSelectedId(id);
                ws.setView('home');
              }}
              onBack={() => ws.setView('home')}
              catalog={ws.catalog}
              onUpdatePlant={ws.patchPlantDetails}
            />
          )}

          {ws.view === 'garden' && <GardenCollectionView ws={ws} />}

          {ws.view === 'lens' && (
            <Suspense fallback={<p className="petey-page-container" role="status">Opening Petey Lens…</p>}>
              <PeteyLens
                catalog={ws.catalog}
                reducedMotion={ws.reduced}
                onBack={() => ws.setView('home')}
                onManual={() => ws.startAddPlant(undefined, true)}
                onAdd={(speciesId) => ws.startAddPlant(speciesId, false)}
              />
            </Suspense>
          )}

          {ws.view === 'care' && (
            <CareAlertCenter
              connection={ws.connection}
              connectionError={ws.connectionError}
              plants={ws.prioritizedPlants}
              activeAlerts={ws.activeAlerts}
              ackedAlerts={ws.ackedAlerts}
              waitingPlants={ws.careGroups.waiting}
              restingPlants={ws.careGroups.resting}
              cartPlantIds={ws.validCartPlantIds}
              waterUnit={ws.waterUnit}
              reducedMotion={ws.reduced}
              carePendingId={ws.carePendingId}
              cartBatchBusy={ws.cartBatchBusy}
              careError={ws.careError}
              careNotice={ws.careNotice}
              onUnitChange={ws.handleUnitChange}
              onRetryConnection={ws.retryBackendConnection}
              onEnablePreview={() => ws.togglePreviewMode(true)}
              onStartAddPlant={() => ws.startAddPlant()}
              onInspectPlant={(id) => {
                ws.setSelectedId(id);
                ws.setView('home');
              }}
              onOpenProfile={(id) => ws.openPlantProfile(id)}
              onOpenConditionCheck={(id) =>
                ws.previewActive || !id ? ws.openHealthModal(id) : ws.setCheckupPlantId(id)
              }
              onAcknowledgeAlert={ws.handleAcknowledgeAlert}
              onRestoreAlert={ws.handleRestoreAlert}
              onRecordCare={(p, kind) => void ws.recordCareForPlant(p, kind)}
              onToggleCartPlant={ws.toggleCartPlant}
              onQueueAllReady={ws.queueAllReadyToCart}
              onClearCart={ws.clearHydrationCart}
              onConfirmCartRound={ws.confirmCartRound}
            />
          )}

          {ws.view === 'more' && <GardenMoreView ws={ws} />}

          {ws.view === 'add' && ws.draft && (
            <AddPlantFlow
              key={ws.draft.id}
              initial={ws.draft}
              chooseSpecies={ws.chooseSpecies}
              catalog={ws.catalog}
              onBack={() => ws.setView('home')}
              onSave={(saved) => {
                ws.updatePlant(saved);
                ws.setDraft(null);
                ws.setSelectedId(saved.id);
                ws.setView('home');
              }}
            />
          )}
        </main>
      </div>

      <GardenBottomNav
        view={ws.view}
        alertsCount={ws.activeAlerts.length}
        onNavigate={ws.setView}
      />

      {ws.checkupPlant && !ws.previewActive && (
        <Suspense fallback={null}>
          <CheckupDialog
            key={ws.checkupPlant.id}
            plant={ws.checkupPlant}
            onClose={() => ws.setCheckupPlantId(null)}
            onSaved={ws.updatePlant}
          />
        </Suspense>
      )}
      {ws.healthModalOpen && (
        <Suspense fallback={null}>
          <PlantHealth
            key={ws.healthPlantId ?? 'general'}
            plant={ws.checkedHealthPlant}
            asModal
            onBack={() => ws.setHealthModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
