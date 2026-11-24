/**
 * Care & Alert Center + Hydration Cart (Project Living Interface V3 + High Sierra).
 *
 * Features:
 * - Framer Motion `AnimatePresence` + `motion.div` staggered slide-up entrance
 *   animation whenever the 'Care & Alert' view is mounted (with full
 *   prefers-reduced-motion compliance).
 * - Modern rounded Duolingo-inspired tactile cards in Petey Plant's restrained
 *   botanical palette (no garish gradients).
 * - Safety-first Hydration Cart:
 *   - Strictly allows only `ready` (unlocked) plants to enter the cart.
 *   - `check` / `details` plants require soil confirmation first.
 *   - `wait` / root-rot-locked plants are strictly excluded.
 *   - Never fabricates mL volumes when backend lacks pot/volume measurements.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ClipboardCheck,
  Droplets,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react';
import type { CareKind, GardenPlant } from '../../lib/gardenApi';
import {
  buildHydrationCartSummary,
  buildWateringIntelligence,
  getHydrationEligibility,
  type PlantAlertItem,
  type WaterVolumeUnit,
} from '../../lib/care/careIntelligence';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const SLIDE_UP_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 28,
  mass: 0.85,
};

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

export interface CareAlertCenterProps {
  connection: 'loading' | 'ready' | 'offline';
  connectionError: string;
  plants: GardenPlant[];
  activeAlerts: PlantAlertItem[];
  ackedAlerts: PlantAlertItem[];
  waitingPlants: GardenPlant[];
  restingPlants: GardenPlant[];
  cartPlantIds: string[];
  waterUnit: WaterVolumeUnit;
  reducedMotion: boolean;
  carePendingId: string | null;
  cartBatchBusy: boolean;
  careError: string;
  careNotice: string;
  onUnitChange: (unit: WaterVolumeUnit) => void;
  onRetryConnection: () => void;
  onEnablePreview: () => void;
  onStartAddPlant: () => void;
  onInspectPlant: (plantId: string) => void;
  onOpenProfile: (plantId: string) => void;
  onOpenConditionCheck: (plantId: string | null) => void;
  onAcknowledgeAlert: (fingerprint: string) => void;
  onRestoreAlert: (fingerprint: string) => void;
  onRecordCare: (plant: GardenPlant, kind: CareKind) => void;
  onToggleCartPlant: (plantId: string) => void;
  onQueueAllReady: () => void;
  onClearCart: () => void;
  onConfirmCartRound: (plantsInCart: GardenPlant[]) => Promise<void>;
}

export function CareAlertCenter({
  connection,
  connectionError,
  plants,
  activeAlerts,
  ackedAlerts,
  waitingPlants,
  restingPlants,
  cartPlantIds,
  waterUnit,
  reducedMotion,
  carePendingId,
  cartBatchBusy,
  careError,
  careNotice,
  onUnitChange,
  onRetryConnection,
  onEnablePreview,
  onStartAddPlant,
  onInspectPlant,
  onOpenProfile,
  onOpenConditionCheck,
  onAcknowledgeAlert,
  onRestoreAlert,
  onRecordCare,
  onToggleCartPlant,
  onQueueAllReady,
  onClearCart,
  onConfirmCartRound,
}: CareAlertCenterProps) {
  const [confirmRoundOpen, setConfirmRoundOpen] = useState(false);

  const plantById = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  const cartIdSet = useMemo(() => new Set(cartPlantIds), [cartPlantIds]);

  const cartPlants = useMemo(
    () => cartPlantIds.map((id) => plantById.get(id)).filter((p): p is GardenPlant => Boolean(p)),
    [cartPlantIds, plantById],
  );

  const eligibleReadyPlants = useMemo(
    () => plants.filter((p) => getHydrationEligibility(p) === 'eligible'),
    [plants],
  );
  const unqueuedReadyCount = eligibleReadyPlants.filter((p) => !cartIdSet.has(p.id)).length;
  const cartSummary = useMemo(
    () => buildHydrationCartSummary(cartPlants, waterUnit),
    [cartPlants, waterUnit],
  );

  const busy = carePendingId !== null || cartBatchBusy;

  async function handleConfirmAll() {
    if (cartPlants.length === 0 || busy) return;
    setConfirmRoundOpen(false);
    await onConfirmCartRound(cartPlants);
  }

  return (
    <section className="petey-page-container" aria-labelledby="care-heading">
      <header className="petey-page-header">
        <div>
          <span className="petey-small-label">Actionable care & watering round</span>
          <h1 id="care-heading" className="petey-page-title">
            Care & Alert Center
          </h1>
          <p className="petey-page-sub">
            Ordered by urgency from your plant records. Queue confirmed-dry plants into your Hydration Cart to water together.
          </p>
        </div>
        <button
          type="button"
          className="duo-btn duo-btn-secondary duo-btn-sm"
          onClick={() => onOpenConditionCheck(plants[0]?.id ?? null)}
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          <span>Condition check</span>
        </button>
      </header>

      {careError && (
        <div className="petey-alert petey-alert-error" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{careError}</span>
        </div>
      )}

      {careNotice && (
        <div className="petey-alert petey-alert-info" role="status">
          <Check className="h-4 w-4 shrink-0 text-[#234D36]" aria-hidden="true" />
          <span>{careNotice}</span>
        </div>
      )}

      {connection === 'offline' ? (
        <div className="petey-card petey-stack">
          <h2 className="petey-card-title">Care schedule unavailable</h2>
          <p className="petey-body-muted">{connectionError}</p>
          <div className="petey-btn-row">
            <button type="button" className="duo-btn duo-btn-primary duo-btn-sm" onClick={onRetryConnection}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> <span>Retry</span>
            </button>
            <button type="button" className="duo-btn duo-btn-secondary duo-btn-sm" onClick={onEnablePreview}>
              <span>Enable development preview</span>
            </button>
          </div>
        </div>
      ) : plants.length === 0 ? (
        <div className="petey-card petey-stack">
          <h2 className="petey-card-title">Nothing scheduled yet</h2>
          <p className="petey-body-muted">Add a plant to see due checks, alerts, and watering rounds here.</p>
          <div>
            <button type="button" className="duo-btn duo-btn-primary duo-btn-sm" onClick={onStartAddPlant}>
              <Plus className="h-4 w-4" aria-hidden="true" /> <span>Add plant</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="hs-care-split">
          {/* LEFT COLUMN: Staggered Slide-Up Alert & Care Cards */}
          <div className="hs-care-queue-col">
            {/* Active Unacknowledged Alerts */}
            <div className="petey-care-group">
              <div className="hs-section-bar">
                <h2 className="petey-small-label m-0">
                  Needs attention & due today ({activeAlerts.length})
                </h2>
              </div>

              {activeAlerts.length === 0 ? (
                <p className="petey-body-muted">
                  No unacknowledged plant care alerts right now.
                </p>
              ) : (
                <div className="petey-care-group">
                  <AnimatePresence mode="popLayout">
                    {activeAlerts.map((alert, index) => {
                      const plant = plantById.get(alert.plantId);
                      if (!plant) return null;
                      const eligibility = getHydrationEligibility(plant);
                      const inCart = cartIdSet.has(plant.id);

                      return (
                        <motion.div
                          key={alert.fingerprint}
                          role="article"
                          layout={!reducedMotion}
                          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12, transition: { duration: 0.18 } }}
                          transition={{
                            ...SLIDE_UP_SPRING,
                            delay: reducedMotion ? 0 : Math.min(index * 0.065, 0.36),
                          }}
                          className="hs-alert-card duo-card"
                        >
                          <div className="petey-care-row-left">
                            <BotanicalThumbnail speciesId={plant.species_id} size={46} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-sm text-[#202923]">{alert.plantName}</strong>
                                <span className="hs-urgency-tag" data-severity={alert.severity}>
                                  {alert.isEmergency && <ShieldAlert className="h-3 w-3" aria-hidden="true" />}
                                  {alert.headline}
                                </span>
                              </div>
                              <p className="text-xs text-[#515D55] mt-1 m-0 leading-relaxed">{alert.reason}</p>
                            </div>
                          </div>

                          <div className="hs-action-inline">
                            {eligibility === 'eligible' ? (
                              <button
                                type="button"
                                className={`duo-btn duo-btn-sm ${inCart ? 'duo-btn-sage' : 'duo-btn-primary'}`}
                                disabled={busy}
                                onClick={() => onToggleCartPlant(plant.id)}
                                aria-pressed={inCart}
                              >
                                {inCart ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-[#234D36]" aria-hidden="true" />
                                    <span>In cart</span>
                                  </>
                                ) : (
                                  <>
                                    <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Add to cart</span>
                                  </>
                                )}
                              </button>
                            ) : plant.status === 'check' ? (
                              <>
                                <button
                                  type="button"
                                  className="duo-btn duo-btn-amber duo-btn-sm"
                                  disabled={busy}
                                  onClick={() => onRecordCare(plant, 'dry')}
                                >
                                  <span>Dry</span>
                                </button>
                                <button
                                  type="button"
                                  className="duo-btn duo-btn-sage duo-btn-sm"
                                  disabled={busy}
                                  onClick={() => onRecordCare(plant, 'moist')}
                                >
                                  <span>Moist</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="duo-btn duo-btn-primary duo-btn-sm"
                                onClick={() => onInspectPlant(plant.id)}
                              >
                                <span>Open care</span>
                              </button>
                            )}

                            <button
                              type="button"
                              className="hs-btn-ghost"
                              onClick={() => onOpenProfile(plant.id)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="hs-btn-ghost"
                              onClick={() => onAcknowledgeAlert(alert.fingerprint)}
                            >
                              Acknowledge
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Acknowledged Alerts (Explicitly Still Unresolved) */}
            {ackedAlerts.length > 0 && (
              <div className="petey-care-group">
                <h2 className="petey-small-label m-0">
                  Acknowledged — still unresolved ({ackedAlerts.length})
                </h2>
                <div className="petey-care-group">
                  <AnimatePresence mode="popLayout">
                    {ackedAlerts.map((alert, index) => {
                      const plant = plantById.get(alert.plantId);
                      if (!plant) return null;
                      return (
                        <motion.div
                          key={alert.fingerprint}
                          role="article"
                          layout={!reducedMotion}
                          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, transition: { duration: 0.16 } }}
                          transition={{
                            ...SLIDE_UP_SPRING,
                            delay: reducedMotion ? 0 : Math.min(index * 0.055, 0.28),
                          }}
                          className="hs-alert-card duo-card is-acknowledged"
                        >
                          <div className="petey-care-row-left">
                            <BotanicalThumbnail speciesId={plant.species_id} size={40} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-sm text-[#202923]">{alert.plantName}</strong>
                                <span className="hs-prov-tag">Acknowledged · Still needs care</span>
                              </div>
                              <p className="text-xs text-[#515D55] mt-0.5 m-0">{alert.headline}</p>
                            </div>
                          </div>
                          <div className="hs-action-inline">
                            <button
                              type="button"
                              className="duo-btn duo-btn-secondary duo-btn-sm"
                              onClick={() => onInspectPlant(plant.id)}
                            >
                              <span>Open care</span>
                            </button>
                            <button
                              type="button"
                              className="hs-btn-ghost"
                              onClick={() => onRestoreAlert(alert.fingerprint)}
                            >
                              Restore alert
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Holding / Waiting (Do not water — explicitly excluded from Hydration Cart) */}
            {waitingPlants.length > 0 && (
              <div className="petey-care-group">
                <h2 className="petey-small-label m-0">
                  Hold watering — mix still moist ({waitingPlants.length})
                </h2>
                <div className="petey-care-group">
                  <AnimatePresence mode="popLayout">
                    {waitingPlants.map((plant, index) => (
                      <motion.div
                        key={plant.id}
                        layout={!reducedMotion}
                        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          ...SLIDE_UP_SPRING,
                          delay: reducedMotion ? 0 : 0.14 + Math.min(index * 0.05, 0.24),
                        }}
                        className="petey-care-row duo-card"
                      >
                        <div className="petey-care-row-left">
                          <BotanicalThumbnail speciesId={plant.species_id} size={42} />
                          <div>
                            <strong className="block text-sm text-[#202923]">{plant.name}</strong>
                            <span className="text-xs text-[#515D55]">{nextCheckLabel(plant)}</span>
                          </div>
                        </div>
                        <div className="hs-action-inline">
                          <span className="hs-prov-tag">Excluded from cart</span>
                          <button
                            type="button"
                            className="hs-inline-link"
                            onClick={() => onInspectPlant(plant.id)}
                          >
                            Inspect
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Upcoming Checks / Resting */}
            <div className="petey-care-group">
              <h2 className="petey-small-label m-0">
                Upcoming checks & resting ({restingPlants.length})
              </h2>
              {restingPlants.length === 0 ? (
                <p className="petey-body-muted">Watered plants will appear here while resting.</p>
              ) : (
                <div className="petey-care-group">
                  <AnimatePresence mode="popLayout">
                    {restingPlants.map((plant, index) => (
                      <motion.div
                        key={plant.id}
                        layout={!reducedMotion}
                        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          ...SLIDE_UP_SPRING,
                          delay: reducedMotion ? 0 : 0.18 + Math.min(index * 0.05, 0.24),
                        }}
                        className="petey-care-row duo-card"
                      >
                        <div className="petey-care-row-left">
                          <BotanicalThumbnail speciesId={plant.species_id} size={42} />
                          <div>
                            <strong className="block text-sm text-[#202923]">{plant.name}</strong>
                            <span className="text-xs text-[#515D55]">{nextCheckLabel(plant)}</span>
                          </div>
                        </div>
                        <span className="hs-prov-tag">No watering needed</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN (DESKTOP) / TOP TRAY (MOBILE): Hydration Cart Inspector */}
          <aside className="hs-hydration-cart-col" aria-label="Hydration Cart">
            <motion.div
              className="hs-cart-panel duo-card"
              initial={reducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SLIDE_UP_SPRING, delay: reducedMotion ? 0 : 0.08 }}
            >
              <div className="hs-cart-head">
                <div className="hs-cart-title-wrap">
                  <ShoppingBasket className="h-4 w-4 text-[#234D36]" aria-hidden="true" />
                  <h2 className="hs-cart-title">Hydration Cart</h2>
                  <span className="hs-cart-count">{cartSummary.count}</span>
                </div>

                <div className="hs-unit-seg" role="group" aria-label="Cart water unit">
                  <button
                    type="button"
                    className={waterUnit === 'ml' ? 'active' : ''}
                    onClick={() => onUnitChange('ml')}
                    aria-pressed={waterUnit === 'ml'}
                  >
                    mL
                  </button>
                  <button
                    type="button"
                    className={waterUnit === 'fl_oz' ? 'active' : ''}
                    onClick={() => onUnitChange('fl_oz')}
                    aria-pressed={waterUnit === 'fl_oz'}
                  >
                    fl oz
                  </button>
                </div>
              </div>

              {/* Honest Cart Assessment Hairline Rows */}
              <dl className="hs-kv-list hs-cart-kv">
                <div className="hs-kv-row">
                  <dt>Ready to water</dt>
                  <dd>
                    <span>
                      {cartSummary.count} queued · {eligibleReadyPlants.length} eligible
                    </span>
                  </dd>
                </div>
                <div className="hs-kv-row">
                  <dt>Water estimate</dt>
                  <dd>{cartSummary.volumeSummaryLabel}</dd>
                </div>
                {cartSummary.drainageCautionCount > 0 && (
                  <div className="hs-kv-row">
                    <dt>Drainage note</dt>
                    <dd className="text-[#7D5211]">
                      {cartSummary.drainageCautionCount}{' '}
                      {cartSummary.drainageCautionCount === 1 ? 'pot needs' : 'pots need'} drainage caution
                    </dd>
                  </div>
                )}
              </dl>

              {/* Cart Items or Calm Empty State */}
              {cartPlants.length === 0 ? (
                <div className="hs-cart-empty">
                  <p className="hs-disclosure-muted">
                    Queue confirmed-dry plants here to complete one calm watering round. Moist or unverified plants stay excluded until checked.
                  </p>
                  {eligibleReadyPlants.length > 0 && (
                    <button
                      type="button"
                      className="duo-btn duo-btn-primary duo-btn-sm mt-2"
                      disabled={busy}
                      onClick={onQueueAllReady}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>Queue ready plants ({eligibleReadyPlants.length})</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <ul className="hs-cart-list" aria-label="Plants queued for watering">
                    <AnimatePresence mode="popLayout">
                      {cartPlants.map((plant) => {
                        const intel = buildWateringIntelligence(plant, { unit: waterUnit });
                        const isPending = carePendingId === plant.id || cartBatchBusy;
                        return (
                          <motion.li
                            key={plant.id}
                            layout={!reducedMotion}
                            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 14, transition: { duration: 0.16 } }}
                            transition={SLIDE_UP_SPRING}
                            className="hs-cart-item"
                          >
                            <div className="hs-cart-item-top">
                              <BotanicalThumbnail speciesId={plant.species_id} size={34} />
                              <div className="min-w-0 flex-1">
                                <strong className="block text-sm text-[#202923] truncate">
                                  {plant.name}
                                </strong>
                                <span className="text-xs text-[#515D55] block truncate">
                                  {intel.volumeGuidance.hasQuantitativeVolume &&
                                  intel.volumeGuidance.formattedAmount
                                    ? intel.volumeGuidance.formattedAmount
                                    : plant.drainage === 'no'
                                      ? 'No drainage — water sparingly'
                                      : 'Water until drained, empty saucer'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="hs-cart-remove-btn"
                                disabled={isPending}
                                onClick={() => onToggleCartPlant(plant.id)}
                                aria-label={`Remove ${plant.name} from Hydration Cart`}
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>

                            <div className="hs-cart-item-actions">
                              <span className="hs-prov-tag">
                                {plant.drainage === 'yes'
                                  ? 'Drainage holes'
                                  : plant.drainage === 'no'
                                    ? 'No drainage'
                                    : 'Drainage unknown'}
                              </span>
                              <button
                                type="button"
                                className="duo-btn duo-btn-secondary duo-btn-xs"
                                disabled={isPending}
                                onClick={() => onRecordCare(plant, 'watered')}
                              >
                                <Check className="h-3.5 w-3.5 text-[#234D36]" aria-hidden="true" />
                                <span>{carePendingId === plant.id ? 'Saving…' : 'Confirm watered'}</span>
                              </button>
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>

                  {/* Cart Footer Controls (with honest two-step batch confirmation) */}
                  <div className="hs-cart-footer">
                    {unqueuedReadyCount > 0 && (
                      <button
                        type="button"
                        className="hs-inline-link"
                        disabled={busy}
                        onClick={onQueueAllReady}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add remaining ready ({unqueuedReadyCount})
                      </button>
                    )}

                    {confirmRoundOpen ? (
                      <div className="hs-watering-sheet">
                        <p className="hs-watering-sheet-title">Confirm physical watering</p>
                        <p className="text-xs text-[#515D55] m-0 leading-relaxed">
                          Confirm only after you have watered all {cartPlants.length} queued plants and emptied any standing saucer water.
                        </p>
                        <div className="hs-action-inline">
                          <button
                            type="button"
                            className="duo-btn duo-btn-primary duo-btn-sm"
                            disabled={busy}
                            onClick={() => void handleConfirmAll()}
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            <span>{cartBatchBusy ? 'Recording…' : `Confirm ${cartPlants.length} watered`}</span>
                          </button>
                          <button
                            type="button"
                            className="duo-btn duo-btn-secondary duo-btn-sm"
                            disabled={busy}
                            onClick={() => setConfirmRoundOpen(false)}
                          >
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="hs-cart-footer-row">
                        {cartPlants.length >= 2 && (
                          <button
                            type="button"
                            className="duo-btn duo-btn-primary duo-btn-sm flex-1"
                            disabled={busy}
                            onClick={() => setConfirmRoundOpen(true)}
                          >
                            <Droplets className="h-4 w-4" aria-hidden="true" />
                            <span>Finish round ({cartPlants.length})</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="hs-btn-ghost"
                          disabled={busy}
                          onClick={onClearCart}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Clear
                        </button>
                      </div>
                    )}

                    <p className="hs-cart-honest-note">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#7D5211]" aria-hidden="true" />
                      <span>
                        Logging watering records your action in care history; physical recovery is confirmed on future checks.
                      </span>
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </aside>
        </div>
      )}
    </section>
  );
}
