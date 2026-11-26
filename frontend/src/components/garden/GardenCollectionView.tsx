import {
  ArrowRight,
  Camera,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { buildWateringIntelligence } from '../../lib/care/careIntelligence';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';
import { PeteyLogo } from './PeteyLogo';
import { nextCheckLabel, STATUS_LABELS } from './gardenShellShared';
import type { useGardenWorkspace } from './useGardenWorkspace';

export function GardenCollectionView({ ws }: { ws: ReturnType<typeof useGardenWorkspace> }) {
  return (
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
          disabled={ws.connection !== 'ready'}
          onClick={() => ws.startAddPlant()}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add plant
        </button>
      </header>

      {ws.connection === 'offline' ? (
        <div className="petey-card petey-stack">
          <p className="petey-body-muted">{ws.connectionError}</p>
          <div className="petey-btn-row">
            <button type="button" className="hs-btn-primary" onClick={ws.retryBackendConnection}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
            </button>
            <button
              type="button"
              className="hs-btn-subtle"
              onClick={() => ws.togglePreviewMode(true)}
            >
              Enable development preview
            </button>
          </div>
        </div>
      ) : ws.plants.length === 0 ? (
        <div className="petey-card petey-stack items-start">
          <PeteyLogo size={48} />
          <h2 className="petey-card-title">No plants in your garden yet</h2>
          <p className="petey-body-muted">
            Add a plant manually or use Petey Lens to check possible species matches from a photo.
          </p>
          <div className="petey-btn-row">
            <button type="button" className="hs-btn-primary" onClick={() => ws.startAddPlant()}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add plant
            </button>
            <button type="button" className="hs-btn-subtle" onClick={() => ws.setView('lens')}>
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
                value={ws.gardenQuery}
                onChange={(e) => ws.setGardenQuery(e.target.value)}
                placeholder="Search by nickname or species"
              />
            </label>
            <select
              className="petey-select"
              aria-label="Filter plants by care status"
              value={ws.gardenFilter}
              onChange={(e) =>
                ws.setGardenFilter(e.target.value as 'all' | 'due' | 'attention' | 'resting')
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
              value={ws.gardenSort}
              onChange={(e) =>
                ws.setGardenSort(e.target.value as 'priority' | 'name' | 'species')
              }
            >
              <option value="priority">Sort: Care priority</option>
              <option value="name">Sort: Nickname</option>
              <option value="species">Sort: Species</option>
            </select>
            <div className="hs-toolbar-seg" role="group" aria-label="Garden layout">
              <button
                type="button"
                className={ws.gardenLayout === 'list' ? 'active' : ''}
                aria-pressed={ws.gardenLayout === 'list'}
                onClick={() => ws.setGardenLayout('list')}
                aria-label="List view"
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
                <span>List</span>
              </button>
              <button
                type="button"
                className={ws.gardenLayout === 'grid' ? 'active' : ''}
                aria-pressed={ws.gardenLayout === 'grid'}
                onClick={() => ws.setGardenLayout('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Grid</span>
              </button>
            </div>
          </div>

          {ws.filteredGarden.length === 0 ? (
            <div className="petey-card">
              <p className="petey-body-muted">No plants match your current filter.</p>
            </div>
          ) : ws.gardenLayout === 'list' ? (
            <div className="hs-garden-list" role="list">
              {ws.filteredGarden.map((plant) => {
                const intel = buildWateringIntelligence(plant, { unit: ws.waterUnit });
                return (
                  <article key={plant.id} className="hs-garden-list-row" role="listitem">
                    <div className="hs-garden-list-main">
                      <BotanicalThumbnail speciesId={plant.species_id} size={46} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-body font-semibold text-[#202923] m-0 truncate">
                            {plant.name}
                          </h2>
                          <span className="hs-urgency-tag" data-severity={intel.urgency}>
                            {STATUS_LABELS[plant.status]}
                          </span>
                        </div>
                        <p className="petey-scientific truncate mt-0.5">
                          {plant.species_id ?? plant.common_name ?? 'Unidentified'}
                        </p>
                        <p className="text-caption text-[#515D55] m-0 mt-0.5">
                          {intel.actionHeadline} · {intel.timingSummary}
                        </p>
                      </div>
                    </div>

                    <div className="hs-garden-list-actions">
                      <button
                        type="button"
                        className="hs-btn-subtle"
                        onClick={() => {
                          ws.setSelectedId(plant.id);
                          ws.setView('home');
                        }}
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        className="hs-btn-ghost"
                        onClick={() => ws.openPlantProfile(plant.id)}
                      >
                        Profile
                      </button>
                      <button
                        type="button"
                        className="hs-btn-ghost"
                        onClick={() => ws.openHealthModal(plant.id)}
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
              {ws.filteredGarden.map((plant) => {
                const intel = buildWateringIntelligence(plant, { unit: ws.waterUnit });
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
                          ws.setSelectedId(plant.id);
                          ws.setView('home');
                        }}
                      >
                        Inspect <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="hs-inline-link"
                        onClick={() => ws.openPlantProfile(plant.id)}
                      >
                        Care profile
                      </button>
                      <button
                        type="button"
                        className="hs-inline-link"
                        onClick={() => ws.openHealthModal(plant.id)}
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
  );
}
