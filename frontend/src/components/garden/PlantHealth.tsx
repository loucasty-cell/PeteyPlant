import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  Leaf,
  X,
} from 'lucide-react';
import { withTimeoutSignal, type GardenPlant } from '../../lib/gardenApi';
import {
  plantToolsApi,
  symptoms,
  type HealthContext,
  type HealthObservations,
  type HealthResult,
  type PlantSymptom,
} from '../../lib/plantToolsApi';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';

const SYMPTOM_OPTIONS = Object.entries(symptoms) as [PlantSymptom, string][];

const CONTEXT_LABELS: Record<HealthContext, string> = {
  soil: 'How does the potting mix feel right now?',
  drainage: 'Does the inner pot have drainage holes?',
  pests: 'Do you see insects, webbing, or sticky residue?',
  light: 'What kind of light reaches this plant most days?',
  spread: 'Are these signs spreading or getting worse?',
};

const CONTEXT_CHOICES: {
  [Field in HealthContext]: { value: HealthObservations[Field]; label: string; hint?: string }[];
} = {
  light: [
    { value: 'bright_indirect', label: 'Bright, indirect light', hint: 'Near a bright window, out of harsh midday sun' },
    { value: 'strong_direct', label: 'Direct sunlight', hint: 'Direct sun beams hit the leaves for hours' },
    { value: 'low', label: 'Low or dim light', hint: 'Far from windows or mostly shaded' },
    { value: 'unknown', label: 'I’m not sure', hint: 'Keep unknown rather than guessing' },
  ],
  soil: [
    { value: 'dry', label: 'Dry', hint: 'Top portion feels dry to the touch' },
    { value: 'moist', label: 'Lightly moist', hint: 'Damp like a wrung-out sponge' },
    { value: 'wet', label: 'Very wet or soggy', hint: 'Heavy, saturated, or standing water present' },
    { value: 'unknown', label: 'I haven’t checked yet' },
  ],
  drainage: [
    { value: 'yes', label: 'Yes, it has drainage holes' },
    { value: 'no', label: 'No drainage holes' },
    { value: 'unknown', label: 'I’m not sure' },
  ],
  pests: [
    { value: 'seen', label: 'Yes — insects, webbing, or residue seen' },
    { value: 'none_seen', label: 'No — I checked closely and saw none' },
    { value: 'unknown', label: 'I haven’t inspected closely yet' },
  ],
  spread: [
    { value: 'yes', label: 'Yes, spreading or worsening' },
    { value: 'no', label: 'No, staying the same' },
    { value: 'unknown', label: 'Not sure yet' },
  ],
};

/**
 * Optional local owner context notes that help the user remember conditions
 * without being sent to the strict `extra="forbid"` backend triage schema.
 */
interface LocalOwnerContext {
  placement: '' | 'indoor' | 'outdoor';
  windowNote: string;
  lastWatered: string;
  recentChange: string;
  notes: string;
}

const STEP_META = [
  { id: 0, title: 'Environment', prompt: 'Where does this plant live, and what light reaches it?' },
  { id: 1, title: 'Watering & soil', prompt: 'How does the potting mix feel, and can water drain?' },
  { id: 2, title: 'Plant condition', prompt: 'What visible changes, pests, or spread have you noticed?' },
  { id: 3, title: 'Additional context', prompt: 'Any recent changes? Review your observations before checking.' },
] as const;

function stepForContextField(field: HealthContext): number {
  if (field === 'light') return 0;
  if (field === 'soil' || field === 'drainage') return 1;
  return 2;
}

export interface PlantHealthProps {
  plant?: GardenPlant;
  onBack: () => void;
  /** Render inside an accessible modal/bottom-sheet overlay instead of a full page */
  asModal?: boolean;
}

export default function PlantHealth({ plant, onBack, asModal = false }: PlantHealthProps) {
  const [step, setStep] = useState(0);
  const [observations, setObservations] = useState<HealthObservations>({
    symptoms: [],
    soil: 'unknown',
    drainage: plant?.drainage ?? 'unknown',
    pests: 'unknown',
    light: 'unknown',
    spread: 'unknown',
  });
  const [localNotes, setLocalNotes] = useState<LocalOwnerContext>({
    placement: '',
    windowNote: '',
    lastWatered: '',
    recentChange: '',
    notes: '',
  });
  const [result, setResult] = useState<HealthResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const inFlight = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, result]);

  // Escape-to-close when used as modal/bottom-sheet
  useEffect(() => {
    if (!asModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asModal, onBack]);

  function toggleSymptom(symptom: PlantSymptom) {
    setObservations((current) => {
      if (current.symptoms.includes(symptom)) {
        return {
          ...current,
          symptoms: current.symptoms.filter((selected) => selected !== symptom),
        };
      }
      return {
        ...current,
        symptoms:
          symptom === 'healthy'
            ? ['healthy']
            : [...current.symptoms.filter((selected) => selected !== 'healthy'), symptom],
      };
    });
  }

  async function submitObservations() {
    if (inFlight.current) return;
    const request = new AbortController();
    inFlight.current = request;
    setError('');
    setPending(true);

    // Strictly pass ONLY backend-supported HealthObservations fields (extra="forbid")
    const payload: HealthObservations = {
      symptoms: observations.symptoms,
      soil: observations.soil,
      drainage: observations.drainage,
      pests: observations.pests,
      light: observations.light,
      spread: observations.spread,
    };

    const timeout = withTimeoutSignal(8_000, request.signal);
    try {
      const answer = await plantToolsApi.triage(payload, timeout.signal);
      if (!request.signal.aborted) {
        setResult(answer);
      }
    } catch (failure) {
      if (!request.signal.aborted) {
        setError(
          failure instanceof DOMException && failure.name === 'TimeoutError'
            ? 'The health check took too long to respond. Try submitting again.'
            : failure instanceof TypeError
              ? 'Petey couldn’t reach the backend health triage service. Ensure the backend is running and try again.'
              : failure instanceof Error
                ? failure.message
                : 'Petey couldn’t review these observations right now. Try again.',
        );
      }
    } finally {
      timeout.cleanup();
      if (inFlight.current === request) inFlight.current = null;
      if (!request.signal.aborted) setPending(false);
    }
  }

  function jumpToFollowUp(field: HealthContext) {
    setResult(null);
    setStep(stepForContextField(field));
  }

  const hasLocalNotes = Boolean(
    localNotes.placement ||
      localNotes.windowNote.trim() ||
      localNotes.lastWatered.trim() ||
      localNotes.recentChange.trim() ||
      localNotes.notes.trim(),
  );

  const innerContent = (
    <div className={asModal ? 'petey-modal-sheet' : 'petey-health-page'}>
      {/* Header bar */}
      <div className="petey-health-topbar">
        {asModal ? (
          <>
            <span className="petey-kicker-inline">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Plant condition check
            </span>
            <button
              type="button"
              className="petey-icon-close"
              onClick={onBack}
              aria-label="Close plant condition check"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="petey-back-btn" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {plant ? `Back to ${plant.name}` : 'Back'}
            </button>
            <span className="petey-kicker-inline">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Plant health
            </span>
          </>
        )}
      </div>

      {/* Title & Plant context */}
      <header className="petey-health-header">
        {plant && <BotanicalThumbnail speciesId={plant.species_id} size={52} />}
        <div>
          <h1 id="health-heading" ref={headingRef} tabIndex={-1}>
            {result
              ? result.headline
              : plant
                ? `Check on ${plant.name}`
                : 'Plant condition check'}
          </h1>
          <p className="petey-health-sub">
            {result
              ? 'Practical guidance based strictly on the observations you reported.'
              : STEP_META[step].prompt}
          </p>
        </div>
      </header>

      {/* Progress indicator during 4-step intake */}
      {!result && (
        <nav className="petey-step-bar" aria-label="Intake progress">
          {STEP_META.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`petey-step-item ${step === item.id ? 'active' : step > item.id ? 'done' : ''}`}
              onClick={() => setStep(item.id)}
              aria-current={step === item.id ? 'step' : undefined}
            >
              <span className="petey-step-num">{step > item.id ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : item.id + 1}</span>
              <span className="petey-step-label">{item.title}</span>
            </button>
          ))}
        </nav>
      )}

      {/* STEP 1: ENVIRONMENT */}
      {!result && step === 0 && (
        <div className="petey-stack">
          <fieldset className="petey-fieldset" disabled={pending}>
            <legend className="petey-legend">{CONTEXT_LABELS.light}</legend>
            <div className="petey-choice-list">
              {CONTEXT_CHOICES.light.map((opt) => (
                <label
                  key={opt.value}
                  className={`petey-choice-card ${observations.light === opt.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="health-light"
                    checked={observations.light === opt.value}
                    onChange={() => setObservations((cur) => ({ ...cur, light: opt.value }))}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                    {opt.hint && <small>{opt.hint}</small>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="petey-optional-box">
            <span className="petey-small-label">Optional local notes (for your reference only)</span>
            <div className="petey-two-col">
              <label className="petey-field">
                Placement
                <select
                  value={localNotes.placement}
                  onChange={(e) =>
                    setLocalNotes((cur) => ({
                      ...cur,
                      placement: e.target.value as LocalOwnerContext['placement'],
                    }))
                  }
                >
                  <option value="">Not noted</option>
                  <option value="indoor">Indoors</option>
                  <option value="outdoor">Outdoors / patio</option>
                </select>
              </label>
              <label className="petey-field">
                Window or draft notes
                <input
                  type="text"
                  maxLength={80}
                  value={localNotes.windowNote}
                  onChange={(e) => setLocalNotes((cur) => ({ ...cur, windowNote: e.target.value }))}
                  placeholder="e.g. 1m from south window, near AC"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: WATERING & SOIL */}
      {!result && step === 1 && (
        <div className="petey-stack">
          <fieldset className="petey-fieldset" disabled={pending}>
            <legend className="petey-legend">{CONTEXT_LABELS.soil}</legend>
            <div className="petey-choice-list">
              {CONTEXT_CHOICES.soil.map((opt) => (
                <label
                  key={opt.value}
                  className={`petey-choice-card ${observations.soil === opt.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="health-soil"
                    checked={observations.soil === opt.value}
                    onChange={() => setObservations((cur) => ({ ...cur, soil: opt.value }))}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                    {opt.hint && <small>{opt.hint}</small>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="petey-fieldset" disabled={pending}>
            <legend className="petey-legend">{CONTEXT_LABELS.drainage}</legend>
            <div className="petey-choice-grid-3">
              {CONTEXT_CHOICES.drainage.map((opt) => (
                <label
                  key={opt.value}
                  className={`petey-choice-card ${observations.drainage === opt.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="health-drainage"
                    checked={observations.drainage === opt.value}
                    onChange={() => setObservations((cur) => ({ ...cur, drainage: opt.value }))}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="petey-optional-box">
            <span className="petey-small-label">Optional local watering note (not sent to triage rules)</span>
            <label className="petey-field">
              Last watering or mix type
              <input
                type="text"
                maxLength={80}
                value={localNotes.lastWatered}
                onChange={(e) => setLocalNotes((cur) => ({ ...cur, lastWatered: e.target.value }))}
                placeholder="e.g. Watered 5 days ago, chunky bark mix"
              />
            </label>
          </div>
        </div>
      )}

      {/* STEP 3: PLANT CONDITION */}
      {!result && step === 2 && (
        <div className="petey-stack">
          <fieldset className="petey-fieldset" disabled={pending}>
            <legend className="petey-legend">What visible signs do you notice?</legend>
            <p className="petey-field-hint">Select all that apply, or leave unchecked if you are unsure.</p>
            <div className="petey-symptom-grid">
              {SYMPTOM_OPTIONS.map(([id, label]) => {
                const checked = observations.symptoms.includes(id);
                return (
                  <label key={id} className={`petey-choice-card ${checked ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSymptom(id)}
                    />
                    <span>
                      <strong>{label}</strong>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="petey-fieldset" disabled={pending}>
            <legend className="petey-legend">{CONTEXT_LABELS.pests}</legend>
            <div className="petey-choice-list">
              {CONTEXT_CHOICES.pests.map((opt) => (
                <label
                  key={opt.value}
                  className={`petey-choice-card ${observations.pests === opt.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="health-pests"
                    checked={observations.pests === opt.value}
                    onChange={() => setObservations((cur) => ({ ...cur, pests: opt.value }))}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="petey-fieldset" disabled={pending}>
            <legend className="petey-legend">{CONTEXT_LABELS.spread}</legend>
            <div className="petey-choice-grid-3">
              {CONTEXT_CHOICES.spread.map((opt) => (
                <label
                  key={opt.value}
                  className={`petey-choice-card ${observations.spread === opt.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="health-spread"
                    checked={observations.spread === opt.value}
                    onChange={() => setObservations((cur) => ({ ...cur, spread: opt.value }))}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {/* STEP 4: ADDITIONAL CONTEXT & REVIEW */}
      {!result && step === 3 && (
        <div className="petey-stack">
          <div className="petey-optional-box">
            <span className="petey-small-label">Optional owner notes (kept locally in this session)</span>
            <label className="petey-field">
              Recent repotting, move, or feeding
              <input
                type="text"
                maxLength={100}
                value={localNotes.recentChange}
                onChange={(e) => setLocalNotes((cur) => ({ ...cur, recentChange: e.target.value }))}
                placeholder="e.g. Repotted last weekend or moved to a new room"
              />
            </label>
            <label className="petey-field">
              Additional notes
              <textarea
                rows={2}
                maxLength={240}
                value={localNotes.notes}
                onChange={(e) => setLocalNotes((cur) => ({ ...cur, notes: e.target.value }))}
                placeholder="Anything else you want to keep in mind during this check"
              />
            </label>
          </div>

          <section className="petey-summary-card" aria-label="Review observations before submitting">
            <h2 className="petey-small-label">Observations sent to Petey’s care guidance rules</h2>
            <dl className="petey-review-dl">
              <div>
                <dt>Visible signs</dt>
                <dd>
                  {observations.symptoms.length > 0
                    ? observations.symptoms.map((s) => symptoms[s]).join(', ')
                    : 'None selected (unknown)'}
                </dd>
              </div>
              <div>
                <dt>Light</dt>
                <dd>{CONTEXT_CHOICES.light.find((c) => c.value === observations.light)?.label}</dd>
              </div>
              <div>
                <dt>Potting mix</dt>
                <dd>{CONTEXT_CHOICES.soil.find((c) => c.value === observations.soil)?.label}</dd>
              </div>
              <div>
                <dt>Pot drainage</dt>
                <dd>{CONTEXT_CHOICES.drainage.find((c) => c.value === observations.drainage)?.label}</dd>
              </div>
              <div>
                <dt>Pests</dt>
                <dd>{CONTEXT_CHOICES.pests.find((c) => c.value === observations.pests)?.label}</dd>
              </div>
              <div>
                <dt>Spreading</dt>
                <dd>{CONTEXT_CHOICES.spread.find((c) => c.value === observations.spread)?.label}</dd>
              </div>
            </dl>
          </section>

          {error && (
            <div className="petey-alert petey-alert-error" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* STEP FOOTER CONTROLS */}
      {!result && (
        <div className="petey-health-footer">
          {step > 0 ? (
            <button
              type="button"
              className="petey-btn-secondary"
              disabled={pending}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          ) : (
            <button type="button" className="petey-btn-secondary" onClick={onBack}>
              Cancel
            </button>
          )}

          {step < STEP_META.length - 1 ? (
            <button
              type="button"
              className="petey-btn-primary"
              onClick={() => setStep((s) => Math.min(STEP_META.length - 1, s + 1))}
            >
              Next: {STEP_META[step + 1].title}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="petey-btn-primary"
              disabled={pending}
              onClick={() => void submitObservations()}
            >
              {pending ? 'Reviewing observations…' : 'Get practical next steps'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* STRUCTURED CARE RESULT HIERARCHY */}
      {result && (
        <div className="petey-stack">
          <section className="petey-card petey-stack">
            <div className="petey-result-badge">
              <Leaf className="h-4 w-4" aria-hidden="true" />
              <span>Evidence: Owner observations (not a lab or visual diagnosis)</span>
            </div>

            <p className="petey-result-summary">{result.summary}</p>

            {result.steps.length > 0 && (
              <div>
                <h2 className="petey-section-heading">What to do now</h2>
                <ol className="petey-ordered-steps">
                  {result.steps.map((actionStep) => (
                    <li key={actionStep}>{actionStep}</li>
                  ))}
                </ol>
              </div>
            )}

            {result.follow_up.length > 0 && (
              <div>
                <h2 className="petey-section-heading">Missing checks that narrow this down</h2>
                <div className="petey-followup-list">
                  {result.follow_up.map((field) => (
                    <button
                      type="button"
                      key={field}
                      className="petey-btn-secondary"
                      onClick={() => jumpToFollowUp(field)}
                    >
                      {CONTEXT_LABELS[field]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {result.possible_causes.length > 0 && (
            <section className="petey-card petey-stack">
              <h2 className="petey-section-heading">Possible explanations (unconfirmed)</h2>
              <p className="petey-body-muted">
                These possibilities align with what you reported; check the follow-up items above before making drastic changes.
              </p>
              <ul className="petey-causes-list">
                {result.possible_causes.map((cause) => (
                  <li key={cause.label}>
                    <strong>{cause.label}</strong>
                    <p>{cause.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.sources.length > 0 && (
            <section className="petey-card petey-stack">
              <h2 className="petey-section-heading">Verified horticultural sources</h2>
              <ul className="petey-sources-list">
                {result.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="petey-link-btn">
                      {source.title} <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasLocalNotes && (
            <section className="petey-optional-box">
              <span className="petey-small-label">Your local session notes</span>
              <ul className="petey-tips-list">
                {localNotes.placement && <li>Placement: {localNotes.placement}</li>}
                {localNotes.windowNote.trim() && <li>Window/environment: {localNotes.windowNote}</li>}
                {localNotes.lastWatered.trim() && <li>Watering/mix: {localNotes.lastWatered}</li>}
                {localNotes.recentChange.trim() && <li>Recent change: {localNotes.recentChange}</li>}
                {localNotes.notes.trim() && <li>Notes: {localNotes.notes}</li>}
              </ul>
            </section>
          )}

          <div className="petey-health-footer">
            <button
              type="button"
              className="petey-btn-secondary"
              onClick={() => {
                setResult(null);
                setStep(0);
              }}
            >
              Edit observations
            </button>
            <button type="button" className="petey-btn-primary" onClick={onBack}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (asModal) {
    return (
      <div
        className="petey-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-heading"
        onClick={(event) => {
          if (event.target === event.currentTarget) onBack();
        }}
      >
        {innerContent}
      </div>
    );
  }

  return <section className="petey-page-container">{innerContent}</section>;
}
