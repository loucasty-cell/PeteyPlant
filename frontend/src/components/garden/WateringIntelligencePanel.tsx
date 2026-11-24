/**
 * Project High Sierra — Watering Intelligence Inspector.
 *
 * Native-inspired inspector panel answering the 7 core owner questions in <3 seconds
 * with zero repeated watering labels, zero fake mL numbers, and zero generic card bloat.
 *
 * Implements:
 * - Single clear care decision + deterministic companion voice
 * - Contextual primary action system (never forces "Log watering" when inappropriate)
 * - Coherent Watering Sequence (View steps -> Physically water -> Confirm watering completed
 *   -> Action recorded / Reassessment pending — never declaring instant biological recovery)
 * - Aligned label/value inspector rows separated by crisp 1px hairlines
 * - Progressive disclosure for rationale, missing info, species reference, and history
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Droplets,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import type { CareKind, GardenPlant } from '../../lib/gardenApi';
import type {
  WateringIntelligenceModel,
  WaterVolumeUnit,
} from '../../lib/care/careIntelligence';

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const HISTORY_LABELS: Record<CareKind, string> = {
  dry: 'Reported dry potting mix',
  moist: 'Reported moist potting mix',
  unsure: 'Soil check inconclusive',
  watered: 'Watering logged',
};

export interface WateringIntelligencePanelProps {
  plant: GardenPlant;
  intel: WateringIntelligenceModel;
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
  onOpenProfile?: (plantId: string) => void;
  inHydrationCart?: boolean;
  onToggleHydrationCart?: (plantId: string) => void;
  /** Whether to show inline disclosure rows for species reference & history (true on Home) */
  includeDisclosures?: boolean;
}

const URGENCY_LABEL: Record<WateringIntelligenceModel['urgency'], string> = {
  urgent: 'Urgent',
  high: 'Attention',
  moderate: 'Action due',
  upcoming: 'Check due',
  unknown: 'Unknown',
  routine: 'Stable',
};

export function WateringIntelligencePanel({
  plant,
  intel,
  unit,
  onUnitChange,
  technicalView,
  showCheckChoices,
  onShowCheckChoices,
  carePendingId,
  careError,
  careNotice,
  onRecordCare,
  onOpenConditionCheck,
  onOpenProfile,
  inHydrationCart = false,
  onToggleHydrationCart,
  includeDisclosures = true,
}: WateringIntelligencePanelProps) {
  // Multi-step watering sequence: intention -> review instructions -> confirm completion
  const [wateringStepsOpen, setWateringStepsOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Reset transient step state when switching plants or after watering completes
  useEffect(() => {
    setWateringStepsOpen(false);
  }, [plant.id, plant.status]);

  const isCheckState = plant.status === 'check' || showCheckChoices;
  const isWateringBlocked = intel.actionType === 'do_not_water';
  const busy = carePendingId !== null;
  const lastWateredEvent = plant.history.find((h) => h.kind === 'watered') ?? null;

  const provenanceTag =
    intel.reliability === 'verified_observation'
      ? 'Owner reported'
      : intel.reliability === 'unknown'
        ? 'Unknown'
        : 'Estimated';

  return (
    <section className="hs-inspector" aria-label={`Watering intelligence for ${plant.name}`}>
      {/* REGION C: Primary Care Decision (Single clear recommendation, no redundant labels) */}
      <div className="hs-decision-block">
        <div className="hs-decision-head">
          <div className="hs-decision-title-wrap">
            <span className="hs-severity-dot" data-severity={intel.urgency} aria-hidden="true" />
            <h2 className="hs-decision-title">{intel.actionHeadline}</h2>
          </div>
          <span className="hs-urgency-tag" data-severity={intel.urgency}>
            {intel.urgency === 'urgent' && <ShieldAlert className="h-3 w-3" aria-hidden="true" />}
            {URGENCY_LABEL[intel.urgency]}
          </span>
        </div>

        {/* Deterministic companion cue line — calm, factual, non-guilt */}
        <p className="hs-companion-line">“{intel.companionSpeech.message}”</p>

        {/* Prominent engine water quantity ONLY when backend actually supplies it */}
        {intel.volumeGuidance.hasQuantitativeVolume && intel.volumeGuidance.formattedAmount && (
          <div className="hs-volume-hero">
            <span className="hs-volume-number">{intel.volumeGuidance.formattedAmount}</span>
            <span className="hs-volume-caption">Engine recommendation</span>
          </div>
        )}

        {/* Active simultaneous conditions strip when >1 condition applies */}
        {intel.activeConditions.length > 1 && (
          <div className="hs-cond-row" aria-label="Active conditions">
            {intel.activeConditions.map((cond) => (
              <span key={cond.id} className="hs-cond-chip" data-severity={cond.severity}>
                {cond.label}
              </span>
            ))}
          </div>
        )}

        {/* Smart Watering Lifecycle Status Banner (Action recorded -> Reassessment pending) */}
        {intel.lifecycleBanner && (
          <div className="hs-lifecycle-note" role="status">
            <Check className="h-3.5 w-3.5 shrink-0 text-[#234D36]" aria-hidden="true" />
            <span>{intel.lifecycleBanner}</span>
          </div>
        )}

        {/* Hold-off warning when watering is actively discouraged */}
        {isWateringBlocked && (
          <div className="hs-hold-note" role="status">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Do not water right now. Empty any standing saucer water and recheck the potting mix later.
            </span>
          </div>
        )}

        {/* CONTEXTUAL PRIMARY ACTION SYSTEM (One dominant action, proportionate native control) */}
        <div className="hs-primary-action-area">
          {isCheckState ? (
            <div className="hs-soil-check-block">
              <span className="hs-micro-prompt">Record potting mix feel:</span>
              <div className="hs-segmented-actions" role="group" aria-label="How does the potting mix feel?">
                <button
                  type="button"
                  className="hs-seg-action"
                  disabled={busy}
                  onClick={() => onRecordCare(plant, 'dry')}
                >
                  Dry
                </button>
                <button
                  type="button"
                  className="hs-seg-action"
                  disabled={busy}
                  onClick={() => onRecordCare(plant, 'moist')}
                >
                  Still moist
                </button>
                <button
                  type="button"
                  className="hs-seg-action"
                  disabled={busy}
                  onClick={() => onRecordCare(plant, 'unsure')}
                >
                  Not sure
                </button>
              </div>
            </div>
          ) : plant.status === 'ready' && !isWateringBlocked ? (
            !wateringStepsOpen ? (
              <div className="hs-action-inline">
                <button
                  type="button"
                  className="hs-btn-primary"
                  disabled={busy}
                  onClick={() => setWateringStepsOpen(true)}
                >
                  <Droplets className="h-4 w-4" aria-hidden="true" />
                  Begin watering
                </button>
                <button
                  type="button"
                  className="hs-btn-subtle"
                  disabled={busy}
                  onClick={() => onShowCheckChoices(true)}
                >
                  Recheck soil
                </button>
              </div>
            ) : (
              /* Explicit watering instruction confirmation step (separates intention from logging) */
              <div className="hs-watering-sheet" aria-label="Watering steps">
                <p className="hs-watering-sheet-title">Before logging watering</p>
                <ol className="hs-watering-steps">
                  <li>
                    {intel.volumeGuidance.hasQuantitativeVolume
                      ? `Apply ${intel.volumeGuidance.formattedAmount} slowly around the soil surface.`
                      : intel.volumeGuidance.qualitativeText}
                  </li>
                  <li>Let excess water drain freely, then empty any standing saucer water.</li>
                </ol>
                <div className="hs-action-inline">
                  <button
                    type="button"
                    className="hs-btn-primary"
                    disabled={busy}
                    onClick={() => onRecordCare(plant, 'watered')}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {busy ? 'Saving…' : 'Confirm watered'}
                  </button>
                  <button
                    type="button"
                    className="hs-btn-subtle"
                    disabled={busy}
                    onClick={() => setWateringStepsOpen(false)}
                  >
                    Not yet
                  </button>
                </div>
              </div>
            )
          ) : isWateringBlocked ? (
            <div className="hs-action-inline">
              <button
                type="button"
                className="hs-btn-subtle"
                onClick={() => onOpenConditionCheck(plant.id)}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Review moisture & drainage
              </button>
              <button
                type="button"
                className="hs-btn-ghost"
                disabled={busy}
                onClick={() => onShowCheckChoices(true)}
              >
                Update soil check
              </button>
            </div>
          ) : plant.status === 'details' ? (
            <div className="hs-action-inline">
              <button
                type="button"
                className="hs-btn-primary"
                onClick={() => onOpenConditionCheck(plant.id)}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Check drainage & condition
              </button>
              <button
                type="button"
                className="hs-btn-subtle"
                disabled={busy}
                onClick={() => onShowCheckChoices(true)}
              >
                Log soil
              </button>
            </div>
          ) : (
            /* Stable / resting plant: no unnecessary watering prompt */
            <div className="hs-action-inline">
              {onOpenProfile ? (
                <button
                  type="button"
                  className="hs-btn-subtle"
                  onClick={() => onOpenProfile(plant.id)}
                >
                  View care profile
                </button>
              ) : null}
              <button
                type="button"
                className={onOpenProfile ? 'hs-btn-ghost' : 'hs-btn-subtle'}
                disabled={busy}
                onClick={() => onShowCheckChoices(true)}
              >
                Log soil check
              </button>
            </div>
          )}

          {/* Subtle secondary link row */}
          <div className="hs-secondary-links">
            {plant.status === 'ready' && !isWateringBlocked && onToggleHydrationCart && (
              <button
                type="button"
                className="hs-inline-link"
                disabled={busy}
                onClick={() => onToggleHydrationCart(plant.id)}
              >
                {inHydrationCart ? 'In hydration cart' : 'Add to hydration cart'}
              </button>
            )}
            {plant.status === 'check' && !isWateringBlocked && (
              <button
                type="button"
                className="hs-inline-link"
                disabled={busy}
                onClick={() => onRecordCare(plant, 'watered')}
              >
                Already watered
              </button>
            )}
            <button
              type="button"
              className="hs-inline-link"
              onClick={() => onOpenConditionCheck(plant.id)}
            >
              Condition check
            </button>
            {onOpenProfile && plant.status !== 'rest' && (
              <button
                type="button"
                className="hs-inline-link"
                onClick={() => onOpenProfile(plant.id)}
              >
                Plant profile
              </button>
            )}
          </div>

          {careError && (
            <p className="petey-alert petey-alert-error mt-1" role="alert">
              {careError}
            </p>
          )}
          {(carePendingId === plant.id || (careNotice && !intel.lifecycleBanner)) && (
            <p className="text-xs font-semibold text-[#234D36] m-0 flex items-center gap-1" role="status">
              {carePendingId === plant.id ? 'Saving observation…' : careNotice}
            </p>
          )}
        </div>
      </div>

      {/* REGION D: High Sierra Native Inspector Table (Aligned Label/Value + Fine Hairlines) */}
      <div className="hs-inspector-section">
        <div className="hs-section-bar">
          <span className="hs-section-kicker">Watering assessment</span>
          <div className="hs-unit-seg" role="group" aria-label="Water unit">
            <button
              type="button"
              className={unit === 'ml' ? 'active' : ''}
              onClick={() => onUnitChange('ml')}
              aria-pressed={unit === 'ml'}
            >
              mL
            </button>
            <button
              type="button"
              className={unit === 'fl_oz' ? 'active' : ''}
              onClick={() => onUnitChange('fl_oz')}
              aria-pressed={unit === 'fl_oz'}
            >
              fl oz
            </button>
          </div>
        </div>

        <dl className="hs-kv-list">
          <div className="hs-kv-row">
            <dt>Timing</dt>
            <dd>{intel.timingSummary}</dd>
          </div>
          <div className="hs-kv-row">
            <dt>Amount</dt>
            <dd>
              {intel.volumeGuidance.hasQuantitativeVolume
                ? intel.volumeGuidance.formattedAmount
                : isWateringBlocked || plant.status === 'rest'
                  ? 'None right now'
                  : 'Qualitative (no mL estimate)'}
            </dd>
          </div>
          <div className="hs-kv-row">
            <dt>Soil & source</dt>
            <dd>
              <span>{intel.previousCareSummary}</span>
              <span className="hs-prov-tag">{provenanceTag}</span>
            </dd>
          </div>
          <div className="hs-kv-row">
            <dt>Drainage</dt>
            <dd>
              {plant.drainage === 'yes'
                ? 'Holes confirmed'
                : plant.drainage === 'no'
                  ? 'No drainage holes'
                  : 'Unknown'}
            </dd>
          </div>
          <div className="hs-kv-row">
            <dt>Last watered</dt>
            <dd>
              {lastWateredEvent
                ? SHORT_DATE.format(new Date(lastWateredEvent.occurred_at))
                : 'Not yet logged'}
            </dd>
          </div>
          <div className="hs-kv-row">
            <dt>Freshness</dt>
            <dd>{intel.freshnessLabel}</dd>
          </div>

          {technicalView && (
            <>
              <div className="hs-kv-row">
                <dt>Status ID</dt>
                <dd className="font-mono text-xs">{intel.primaryCondition.id}</dd>
              </div>
              <div className="hs-kv-row">
                <dt>Reliability</dt>
                <dd>{intel.reliabilityLabel}</dd>
              </div>
              <div className="hs-kv-row">
                <dt>Outdoor weather</dt>
                <dd>{intel.environmentalContext}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {/* Compact Missing Information Notice (Only shown when real gaps exist) */}
      {intel.missingInformation.length > 0 && (
        <div className="hs-missing-row" aria-label="Missing information">
          <HelpCircle className="h-3.5 w-3.5 shrink-0 text-[#7D5211] mt-0.5" aria-hidden="true" />
          <div>
            <strong className="hs-missing-title">Missing detail:</strong>{' '}
            <span>{intel.missingInformation[0]}</span>
          </div>
        </div>
      )}

      {/* Progressive Disclosure Rows (1 click away from primary decision) */}
      {includeDisclosures && (
        <div className="hs-disclosures">
          <div className="hs-disclosure-item">
            <button
              type="button"
              className="hs-disclosure-btn"
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((o) => !o)}
            >
              <span>Why this is recommended & species guidance</span>
              {whyOpen ? (
                <ChevronDown className="h-4 w-4 text-[#5C6860]" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#5C6860]" aria-hidden="true" />
              )}
            </button>
            {whyOpen && (
              <div className="hs-disclosure-body">
                <p>{intel.rationale}</p>
                {intel.volumeGuidance.limitationNote && (
                  <p className="hs-disclosure-muted">{intel.volumeGuidance.limitationNote}</p>
                )}
                {plant.watering_guidance && (
                  <div className="hs-species-ref">
                    <span className="hs-section-kicker">Species reference</span>
                    <p>{plant.watering_guidance}</p>
                    {plant.watering_source && (
                      <a
                        href={plant.watering_source}
                        target="_blank"
                        rel="noreferrer"
                        className="hs-inline-link"
                      >
                        Verified botanical source
                        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
                <p className="hs-disclosure-muted">{intel.environmentalContext}</p>
              </div>
            )}
          </div>

          <div className="hs-disclosure-item">
            <button
              type="button"
              className="hs-disclosure-btn"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((o) => !o)}
            >
              <span>Care history ({plant.history.length})</span>
              {historyOpen ? (
                <ChevronDown className="h-4 w-4 text-[#5C6860]" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#5C6860]" aria-hidden="true" />
              )}
            </button>
            {historyOpen && (
              <div className="hs-disclosure-body">
                {plant.history.length === 0 ? (
                  <p className="hs-disclosure-muted">No care observations recorded yet.</p>
                ) : (
                  <ol className="dock-history-list">
                    {plant.history.map((evt) => (
                      <li key={evt.id}>
                        <span>{HISTORY_LABELS[evt.kind]}</span>
                        <time dateTime={evt.occurred_at}>
                          {SHORT_DATE.format(new Date(evt.occurred_at))}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
