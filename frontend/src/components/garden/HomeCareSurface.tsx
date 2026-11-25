import { isPreviewMode } from '../../lib/gardenApi';
/**
 * Project Living Interface V3 — 40% Home Care Surface + Watering Guidance Sheet.
 *
 * Level 1 (Home 40% surface):
 * - Single clear condition in ordinary-person language (no technical tables, no repeated titles).
 * - Modern rounded Duolingo-inspired tactile cards and buttons in Petey Plant's calm
 *   botanical palette (Forest #234D36, Warm Paper #F8F8F4, Crisp White #FFFFFF, Amber #B78339, Alert #B94E43).
 * - Context-sensitive variants:
 *     - ready:   "Ready for water" + tactile "Watering guide" CTA (+ Hydration Cart shortcut)
 *     - check:   "Check the soil" + 3 impactful tactile soil-feel tiles (Dry / Still moist / Not sure)
 *     - wait:    "Hold off on watering" + calm amber guidance (NO watering button)
 *     - rest:    "Doing well" + next estimated check date (NO unnecessary watering prompt)
 *     - details: "Let's check your plant" + tactile "Answer checkup questions" CTA
 *
 * Level 2 (Watering Guidance Sheet):
 * - Accessible modal/bottom sheet separating reviewing instructions from logging watering.
 * - Houses the mL / fl oz unit switcher cleanly inside the sheet instead of cluttering Home.
 * - Never fabricates mL quantities when backend engine fields are absent.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardCheck,
  Droplet,
  Droplets,
  HelpCircle,
  ShieldAlert,
  ShoppingBasket,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type { CareKind, GardenPlant } from '../../lib/gardenApi';
import type {
  WateringIntelligenceModel,
  WaterVolumeUnit,
} from '../../lib/care/careIntelligence';

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export interface HomeCareSurfaceProps {
  plant: GardenPlant;
  intel: WateringIntelligenceModel;
  unit: WaterVolumeUnit;
  reducedMotion: boolean;
  onUnitChange: (unit: WaterVolumeUnit) => void;
  showCheckChoices: boolean;
  onShowCheckChoices: (open: boolean) => void;
  carePendingId: string | null;
  careError: string;
  careNotice: string;
  onRecordCare: (plant: GardenPlant, kind: CareKind) => void;
  onOpenConditionCheck: (plantId: string) => void;
  onOpenProfile: (plantId: string) => void;
  inHydrationCart: boolean;
  onToggleHydrationCart: (plantId: string) => void;
  activeBiomeLabel?: string;
  weatherLocationLabel?: string;
  onCycleBiome?: () => void;
}

interface VariantCopy {
  heading: string;
  summary: string;
  timingLine: string | null;
  tone: 'ready' | 'check' | 'wait' | 'rest' | 'details' | 'urgent';
}

function buildPlainLanguageVariant(
  plant: GardenPlant,
  intel: WateringIntelligenceModel,
): VariantCopy {
  const nextDateText = plant.next_check_at
    ? SHORT_DATE.format(new Date(plant.next_check_at))
    : null;

  if (intel.urgency === 'urgent') {
    return {
      heading: 'Needs attention',
      summary: intel.rationale,
      timingLine: intel.timingSummary,
      tone: 'urgent',
    };
  }

  if (intel.actionType === 'do_not_water' || plant.status === 'wait') {
    return {
      heading: 'Hold off on watering',
      summary: 'The potting mix is still moist. Empty any standing saucer water and wait.',
      timingLine: nextDateText ? `Next estimated soil check: ${nextDateText}` : 'Check soil again in a few days',
      tone: 'wait',
    };
  }

  if (plant.status === 'ready') {
    return {
      heading: 'Ready for water',
      summary: intel.volumeGuidance.hasQuantitativeVolume && intel.volumeGuidance.formattedAmount
        ? `Water today with about ${intel.volumeGuidance.formattedAmount}.`
        : 'The potting mix was noted dry. Water slowly until excess drains out.',
      timingLine: intel.volumeGuidance.hasQuantitativeVolume
        ? intel.timingSummary
        : 'Dry potting mix reported · Water today',
      tone: 'ready',
    };
  }

  if (plant.status === 'details') {
    if (plant.species_id === null) {
      return {
        heading: 'Identify this plant',
        summary: 'Add its species and pot drainage in its profile to get verified care advice.',
        timingLine: 'Species not yet identified',
        tone: 'details',
      };
    }
    return {
      heading: "Let's check your plant",
      summary:
        plant.drainage === 'no'
          ? 'This pot has no drainage holes. Check deeper in the mix before watering.'
          : 'A quick check of drainage and soil helps Petey give safer watering guidance.',
      timingLine: 'More details needed for safer watering',
      tone: 'details',
    };
  }

  if (plant.status === 'check') {
    return {
      heading: 'Check the soil',
      summary: 'Touch the top quarter of the potting mix and tap how it feels.',
      timingLine: nextDateText ? `Soil check due · Est. ${nextDateText}` : 'Soil check due today',
      tone: 'check',
    };
  }

  return {
    heading: 'Doing well',
    summary: 'No watering needed right now.',
    timingLine: nextDateText ? `Next estimated soil check: ${nextDateText}` : null,
    tone: 'rest',
  };
}

export function HomeCareSurface({
  plant,
  intel,
  unit,
  reducedMotion,
  onUnitChange,
  showCheckChoices,
  onShowCheckChoices,
  carePendingId,
  careError,
  careNotice,
  onRecordCare,
  onOpenConditionCheck,
  onOpenProfile,
  inHydrationCart,
  onToggleHydrationCart,
  activeBiomeLabel,
  weatherLocationLabel,
  onCycleBiome,
}: HomeCareSurfaceProps) {
  const [guideOpen, setGuideOpen] = useState(false);

  // Close sheet when switching plants or when plant transitions out of ready
  useEffect(() => {
    setGuideOpen(false);
  }, [plant.id, plant.status]);

  // Escape key closes watering guidance sheet
  useEffect(() => {
    if (!guideOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guideOpen]);

  const busy = carePendingId !== null;
  const isWateringBlocked = intel.actionType === 'do_not_water' || plant.status === 'wait';
  const showSoilTiles = plant.status === 'check' || showCheckChoices;
  const variant = buildPlainLanguageVariant(plant, intel);

  function handleConfirmWatered() {
    if (busy) return;
    setGuideOpen(false);
    onRecordCare(plant, 'watered');
  }

  const sortedHistory = [...(plant.history ?? [])].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  const lastWateredEntry = sortedHistory.find((entry) => entry.kind === 'watered');
  const lastCheckEntry = sortedHistory.find((entry) => entry.kind !== 'watered');

  const lastWateredLabel = lastWateredEntry
    ? SHORT_DATE.format(new Date(lastWateredEntry.occurred_at))
    : 'Not logged yet';
  const lastCheckedLabel = lastCheckEntry
    ? SHORT_DATE.format(new Date(lastCheckEntry.occurred_at))
    : 'Not checked yet';
  const drainageLabel =
    plant.drainage === 'yes'
      ? 'Drainage holes'
      : plant.drainage === 'no'
        ? 'No drainage holes'
        : 'Drainage unconfirmed';

  return (
    <div className="lv-care-surface">
      {/* Desktop-only calm botanical identity line (keeps mobile 36% ultra-compact above the fold) */}
      <div className="lv-desktop-species-meta">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="lv-desktop-species-name truncate">
            {plant.common_name ?? plant.species_id ?? 'Houseplant'}
          </span>
          {plant.species_id && plant.species_id !== plant.common_name && (
            <span className="lv-desktop-species-latin truncate">{plant.species_id}</span>
          )}
        </div>
        {activeBiomeLabel && onCycleBiome && (
          <button
            type="button"
            className="lv-biome-meta-pill"
            onClick={onCycleBiome}
            title={weatherLocationLabel ? `Outdoor: ${weatherLocationLabel}` : 'Switch nature biome'}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span>{activeBiomeLabel}</span>
          </button>
        )}
      </div>

      {/* Main Duolingo-inspired Rounded Care Card */}
      <motion.div
        key={`${plant.id}-${plant.status}-${showSoilTiles ? 'soil' : 'main'}`}
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="lv-care-card"
        data-tone={variant.tone}
      >
        <div className="lv-care-card-head">
          <div className="lv-care-title-group">
            <motion.span
              key={variant.tone}
              className="lv-status-pill"
              data-tone={variant.tone}
              initial={reducedMotion ? false : { scale: 0.9, opacity: 0, y: 4 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            >
              <span className="lv-status-pill-icon" aria-hidden="true">
                {variant.tone === 'urgent' ? (
                  <ShieldAlert className="h-3.5 w-3.5" />
                ) : variant.tone === 'wait' ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : variant.tone === 'ready' ? (
                  <Droplets className="h-3.5 w-3.5" />
                ) : variant.tone === 'rest' ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <ClipboardCheck className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="lv-status-pill-label">{variant.heading}</span>
            </motion.span>

            {intel.volumeGuidance.hasQuantitativeVolume && intel.volumeGuidance.formattedAmount && (
              <span className="lv-volume-badge">{intel.volumeGuidance.formattedAmount}</span>
            )}
          </div>

          <button
            type="button"
            className="lv-details-link"
            onClick={() => onOpenProfile(plant.id)}
          >
            <span>Care details</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <p className="lv-care-summary">{variant.summary}</p>
        {variant.timingLine && <p className="lv-care-timing">{variant.timingLine}</p>}

        {/* Lifecycle feedback after recording care */}
        {intel.lifecycleBanner && (
          <div className="lv-feedback-note" role="status">
            <Check className="h-4 w-4 shrink-0 text-[#234D36]" aria-hidden="true" />
            <span>{intel.lifecycleBanner}</span>
          </div>
        )}

        {/* Impactful Duolingo-Inspired Contextual Action Area */}
        <div className="lv-action-zone">
          {showSoilTiles && !isPreviewMode() ? (
            <button type="button" className="duo-btn duo-btn-primary" disabled={busy}
              onClick={() => onOpenConditionCheck(plant.id)}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <span>Open soil checkup</span>
            </button>
          ) : showSoilTiles ? (
            <div className="lv-soil-block">
              <div className="lv-soil-grid" role="group" aria-label="How does the potting mix feel?">
                <button
                  type="button"
                  className="duo-tile duo-tile-dry"
                  disabled={busy}
                  onClick={() => onRecordCare(plant, 'dry')}
                >
                  <Sun className="h-4 w-4" aria-hidden="true" />
                  <strong>Dry</strong>
                  <span>Record how it feels</span>
                </button>
                <button
                  type="button"
                  className="duo-tile duo-tile-moist"
                  disabled={busy}
                  onClick={() => onRecordCare(plant, 'moist')}
                >
                  <Droplet className="h-4 w-4" aria-hidden="true" />
                  <strong>Moist</strong>
                  <span>Hold off</span>
                </button>
                <button
                  type="button"
                  className="duo-tile duo-tile-unsure"
                  disabled={busy}
                  onClick={() => onRecordCare(plant, 'unsure')}
                >
                  <HelpCircle className="h-4 w-4" aria-hidden="true" />
                  <strong>Not sure</strong>
                  <span>Get help</span>
                </button>
              </div>
              {showCheckChoices && plant.status !== 'check' && (
                <button
                  type="button"
                  className="lv-subtle-link mt-1"
                  onClick={() => onShowCheckChoices(false)}
                >
                  Cancel soil check
                </button>
              )}
            </div>
          ) : plant.status === 'ready' && !isWateringBlocked ? (
            <div className="lv-primary-row">
              <button
                type="button"
                className="duo-btn duo-btn-primary flex-1"
                disabled={busy}
                onClick={() => setGuideOpen(true)}
              >
                <Droplets className="h-4 w-4" aria-hidden="true" />
                <span>Watering guide</span>
              </button>
              <button
                type="button"
                className={`duo-btn ${inHydrationCart ? 'duo-btn-sage' : 'duo-btn-secondary'}`}
                disabled={busy}
                aria-pressed={inHydrationCart}
                onClick={() => onToggleHydrationCart(plant.id)}
              >
                <ShoppingBasket className="h-4 w-4" aria-hidden="true" />
                <span>{inHydrationCart ? 'In cart' : 'Add to cart'}</span>
              </button>
            </div>
          ) : isWateringBlocked ? (
            <div className="lv-primary-row">
              <button
                type="button"
                className="duo-btn duo-btn-amber flex-1"
                disabled={busy}
                onClick={() => onOpenConditionCheck(plant.id)}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                <span>Check moisture & drainage</span>
              </button>
              <button
                type="button"
                className="duo-btn duo-btn-secondary"
                disabled={busy}
                onClick={() => onShowCheckChoices(true)}
              >
                <span>Update soil</span>
              </button>
            </div>
          ) : plant.status === 'details' ? (
            <div className="lv-primary-row">
              {plant.species_id === null ? (
                <button
                  type="button"
                  className="duo-btn duo-btn-primary flex-1"
                  disabled={busy}
                  onClick={() => onOpenProfile(plant.id)}
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Identify plant in profile</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="duo-btn duo-btn-primary flex-1"
                  disabled={busy}
                  onClick={() => onOpenConditionCheck(plant.id)}
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Answer checkup questions</span>
                </button>
              )}
              <button
                type="button"
                className="duo-btn duo-btn-secondary"
                disabled={busy}
                onClick={() => onShowCheckChoices(true)}
              >
                <span>Log soil</span>
              </button>
            </div>
          ) : (
            /* Stable / resting plant: calm optional actions, zero forced watering prompt */
            <div className="lv-primary-row">
              <button
                type="button"
                className="duo-btn duo-btn-secondary flex-1"
                disabled={busy}
                onClick={() => onShowCheckChoices(true)}
              >
                <Droplet className="h-4 w-4" aria-hidden="true" />
                <span>Check soil</span>
              </button>
              <button
                type="button"
                className="duo-btn duo-btn-secondary"
                disabled={busy}
                onClick={() => onOpenConditionCheck(plant.id)}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                <span>Check plant</span>
              </button>
            </div>
          )}
        </div>

        {/* Tactile quick-action footer pills inside the care card */}
        <div className="lv-care-footer">
          {plant.status === 'check' && !isWateringBlocked && (
            <button
              type="button"
              className="lv-footer-chip"
              disabled={busy}
              onClick={() => onRecordCare(plant, 'watered')}
            >
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Already watered</span>
            </button>
          )}
          {plant.status === 'ready' && !isWateringBlocked && (
            <button
              type="button"
              className="lv-footer-chip"
              disabled={busy}
              onClick={() => onShowCheckChoices(true)}
            >
              <Droplet className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Recheck soil</span>
            </button>
          )}
          <button
            type="button"
            className="lv-footer-chip"
            onClick={() => onOpenConditionCheck(plant.id)}
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Symptom check</span>
          </button>
          <button
            type="button"
            className="lv-footer-chip"
            onClick={() => onOpenProfile(plant.id)}
          >
            <span>Care history</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {careError && (
          <div className="petey-alert petey-alert-error mt-2" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{careError}</span>
          </div>
        )}
        {(carePendingId === plant.id || (careNotice && !intel.lifecycleBanner)) && (
          <p className="lv-inline-status" role="status">
            {carePendingId === plant.id ? 'Saving observation…' : careNotice}
          </p>
        )}
      </motion.div>

      {/* Desktop-only calm persisted care snapshot with interactive drainage/checkup cell */}
      <div className="lv-desktop-history-card duo-card" aria-label="Recorded care summary">
        <div className="lv-desktop-stat">
          <span className="lv-desktop-stat-label">Last watered</span>
          <strong className="lv-desktop-stat-val">{lastWateredLabel}</strong>
        </div>
        <div className="lv-desktop-stat">
          <span className="lv-desktop-stat-label">Last soil check</span>
          <strong className="lv-desktop-stat-val">{lastCheckedLabel}</strong>
        </div>
        <div
          className="lv-desktop-stat lv-desktop-stat-interactive"
          role="button"
          tabIndex={0}
          onClick={() => onOpenConditionCheck(plant.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenConditionCheck(plant.id);
            }
          }}
          aria-label={`Pot drainage: ${drainageLabel}. Click to review plant condition and drainage.`}
        >
          <span className="lv-desktop-stat-label">Pot drainage</span>
          <strong className="lv-desktop-stat-val lv-desktop-stat-link">
            <span>{drainageLabel}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </strong>
        </div>
      </div>

      {/* LEVEL 2: Focused Watering Guidance Sheet (Modal / Bottom Sheet) */}
      <AnimatePresence>
        {guideOpen && (
          <motion.div
            className="lv-sheet-backdrop"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGuideOpen(false)}
          >
            <motion.div
              className="lv-sheet-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="watering-guide-title"
              initial={reducedMotion ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="lv-sheet-head">
                <div>
                  <span className="petey-small-label">Watering guide · {plant.name}</span>
                  <h2 id="watering-guide-title" className="lv-sheet-title">
                    How to water today
                  </h2>
                </div>
                <button
                  type="button"
                  className="weather-popover-close"
                  onClick={() => setGuideOpen(false)}
                  aria-label="Close watering guide"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="lv-sheet-body">
                {/* How much + Unit preference moved inside sheet */}
                <div className="lv-sheet-section">
                  <div className="hs-section-bar">
                    <span className="hs-section-kicker">How much water</span>
                    <div className="hs-unit-seg" role="group" aria-label="Water volume unit">
                      <button
                        type="button"
                        className={unit === 'ml' ? 'active' : ''}
                        aria-pressed={unit === 'ml'}
                        onClick={() => onUnitChange('ml')}
                      >
                        mL
                      </button>
                      <button
                        type="button"
                        className={unit === 'fl_oz' ? 'active' : ''}
                        aria-pressed={unit === 'fl_oz'}
                        onClick={() => onUnitChange('fl_oz')}
                      >
                        fl oz
                      </button>
                    </div>
                  </div>
                  <p className="lv-sheet-emphasis">
                    {intel.volumeGuidance.hasQuantitativeVolume && intel.volumeGuidance.formattedAmount
                      ? intel.volumeGuidance.formattedAmount
                      : 'Water slowly until excess drains from the bottom'}
                  </p>
                  {intel.volumeGuidance.limitationNote && (
                    <p className="hs-disclosure-muted">{intel.volumeGuidance.limitationNote}</p>
                  )}
                </div>

                {/* When */}
                <div className="lv-sheet-section">
                  <span className="hs-section-kicker">When</span>
                  <p className="m-0 text-sm text-[#202923]">{intel.timingSummary}</p>
                </div>

                {/* How */}
                <div className="lv-sheet-section">
                  <span className="hs-section-kicker">Steps</span>
                  <ol className="hs-watering-steps">
                    <li>
                      {intel.volumeGuidance.hasQuantitativeVolume && intel.volumeGuidance.formattedAmount
                        ? `Pour ${intel.volumeGuidance.formattedAmount} evenly over the potting mix.`
                        : intel.volumeGuidance.qualitativeText}
                    </li>
                    <li>
                      {plant.drainage === 'no'
                        ? 'This pot has no drainage holes — stop early so water does not pool at the roots.'
                        : 'Let extra water drain out completely, then empty any standing water from the saucer.'}
                    </li>
                  </ol>
                </div>

                <div className="lv-sheet-actions">
                  <button
                    type="button"
                    className="duo-btn duo-btn-primary w-full"
                    disabled={busy}
                    onClick={handleConfirmWatered}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span>{busy ? 'Recording watering…' : 'Confirm watered'}</span>
                  </button>
                  <button
                    type="button"
                    className="duo-btn duo-btn-secondary w-full"
                    disabled={busy}
                    onClick={() => setGuideOpen(false)}
                  >
                    <span>Not yet</span>
                  </button>
                </div>

                <p className="hs-cart-honest-note">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#7D5211]" aria-hidden="true" />
                  <span>
                    Confirm only after physically watering. Logging records your action; plant recovery is confirmed on future checks.
                  </span>
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
