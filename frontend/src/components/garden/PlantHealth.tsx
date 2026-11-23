import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, ClipboardCheck, Leaf } from 'lucide-react';
import type { GardenPlant } from '../../lib/gardenApi';
import { pals, Portrait } from './PlantPalsArt';
import { plantToolsApi, symptoms, type HealthContext, type HealthObservations, type HealthResult, type PlantSymptom } from '../../lib/plantToolsApi';

const symptomOptions = Object.entries(symptoms) as [PlantSymptom, string][];

const contextLabels = {
  soil: 'What does the potting mix feel like?',
  drainage: 'Does the inner pot have drainage holes?',
  pests: 'Can you see insects, webbing, or sticky residue?',
  light: 'What kind of light reaches this plant?',
  spread: 'Are the signs spreading or getting worse?',
};

const contextOptions: { [Field in HealthContext]: [HealthObservations[Field], string][] } = {
  soil: [['unknown', 'I haven’t checked'], ['dry', 'Dry'], ['moist', 'Moist'], ['wet', 'Very wet or soggy']],
  drainage: [['unknown', 'I’m not sure'], ['yes', 'Yes'], ['no', 'No']],
  pests: [['unknown', 'I haven’t looked closely'], ['seen', 'Yes'], ['none_seen', 'I looked and didn’t see any']],
  light: [['unknown', 'I’m not sure'], ['low', 'Dim most of the day'], ['bright_indirect', 'Bright, out of direct sun'], ['strong_direct', 'Strong sunlight on the leaves']],
  spread: [['unknown', 'I’m not sure yet'], ['yes', 'Yes'], ['no', 'No change']],
};

export default function PlantHealth({ plant, onBack }: { plant?: GardenPlant; onBack: () => void }) {
  const [observations, setObservations] = useState<HealthObservations>({
    symptoms: [], soil: 'unknown', drainage: plant?.drainage ?? 'unknown', pests: 'unknown', light: 'unknown', spread: 'unknown',
  });
  const [result, setResult] = useState<HealthResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const editTarget = useRef<HealthContext | 'heading' | null>(null);
  const contextFields = useRef<Partial<Record<HealthContext, HTMLSelectElement | null>>>({});

  useEffect(() => () => inFlight.current?.abort(), []);

  useEffect(() => {
    if (result) {
      resultHeading.current?.focus();
      return;
    }
    const field = editTarget.current;
    if (!field) return;
    editTarget.current = null;
    (field === 'heading' ? formHeading.current : contextFields.current[field])?.focus();
  }, [result]);

  function toggle(symptom: PlantSymptom) {
    setObservations((current) => {
      if (current.symptoms.includes(symptom)) {
        return { ...current, symptoms: current.symptoms.filter((selected) => selected !== symptom) };
      }
      return {
        ...current,
        symptoms: symptom === 'healthy' ? [symptom] : [...current.symptoms.filter((selected) => selected !== 'healthy'), symptom],
      };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const request = new AbortController();
    inFlight.current = request;
    setError('');
    setPending(true);
    try {
      const answer = await plantToolsApi.triage(observations, AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]));
      if (!request.signal.aborted) setResult(answer);
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof DOMException && failure.name === 'TimeoutError'
        ? 'The health check took too long. Try again.'
        : failure instanceof TypeError ? 'Petey couldn’t reach the health check. Check your connection and try again.'
        : failure instanceof Error ? failure.message : 'Petey couldn’t check these observations. Try again.');
    } finally {
      if (inFlight.current === request) inFlight.current = null;
      if (!request.signal.aborted) setPending(false);
    }
  }

  function edit(field: HealthContext | 'heading' = 'heading') {
    editTarget.current = field;
    setResult(null);
  }

  const pal = pals.find((item) => item.id === plant?.species_id);
  const hasVisibleIssue = observations.pests === 'seen' || observations.symptoms.some((symptom) => symptom !== 'healthy');
  const reaction = result?.status === 'no_visible_issue' ? 'relieved' : hasVisibleIssue ? 'concerned' : 'curious';

  return <section className="garden-inner garden-tool" aria-labelledby="health-title">
    <button type="button" className="garden-back" onClick={onBack}><ArrowLeft />{plant ? `Back to ${plant.name}` : 'My garden'}</button>
    <header className="garden-tool-heading">
      <span className="garden-kicker"><ClipboardCheck /> Plant health</span>
      <h1 id="health-title" ref={formHeading} tabIndex={-1}>{plant ? `How’s ${plant.name}?` : 'What’s changed?'}</h1>
      {!result && <p className="garden-lede">Tell Petey what you see for practical next steps and things to check.</p>}
    </header>

    {!result && <form className="garden-tool-grid garden-health-form" onSubmit={(event) => void submit(event)}>
      <fieldset className="garden-panel garden-symptoms" disabled={pending}>
        <legend>What do you notice?</legend>
        <p className="garden-muted">Choose all that apply.</p>
        <div className="garden-symptom-options">
          {symptomOptions.map(([id, label]) => <label key={id}>
            <input type="checkbox" checked={observations.symptoms.includes(id)} onChange={() => toggle(id)} /> {label}
          </label>)}
        </div>
      </fieldset>
      <fieldset className="garden-panel garden-tool-stack garden-context" disabled={pending}>
        <legend>Take a closer look</legend>
        {(Object.keys(contextOptions) as HealthContext[]).map((name) => <label key={name}>
          {contextLabels[name]}
          <select ref={(node) => { contextFields.current[name] = node; }} value={observations[name]} onChange={(event) => {
            setObservations((current) => ({ ...current, [name]: event.target.value }));
          }}>
            {contextOptions[name].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>)}
      </fieldset>
      <div className="garden-health-submit garden-tool-stack">
        {error && <p className="garden-error" role="alert">{error}</p>}
        {pending && <p className="garden-muted" role="status">Reviewing your observations…</p>}
        <button type="submit" className="garden-primary" disabled={pending}>Get next steps <ArrowRight /></button>
      </div>
    </form>}

    {result && <div className="garden-tool-stack">
      <section className="garden-panel garden-tool-stack">
        {pal && <div className="garden-health-reaction"><Portrait pal={pal} mood={reaction} /></div>}
        <span className="garden-status"><Leaf />Based on your observations</span>
        <h2 ref={resultHeading} tabIndex={-1}>{result.headline}</h2>
        <p>{result.summary}</p>
        {result.steps.length > 0 && <ol className="garden-tool-list">{result.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
        {result.follow_up.length > 0 && <div className="garden-tool-stack">
          <h3>Check these next</h3>
          <div className="garden-tool-actions">
            {result.follow_up.map((field) => <button type="button" key={field} className="garden-secondary" onClick={() => edit(field)}>
              {contextLabels[field]}
            </button>)}
          </div>
        </div>}
        <button className="garden-text-button" type="button" onClick={() => edit()}>Edit observations <ArrowRight /></button>
      </section>
      {(result.possible_causes.length > 0 || result.sources.length > 0) && <div className="garden-tool-grid">
        {result.possible_causes.length > 0 && <section className="garden-panel garden-tool-stack">
          <h2>What could explain it</h2>
          <ul className="garden-tool-list">{result.possible_causes.map((cause) => <li key={cause.label}>
            <strong>{cause.label}</strong><p>{cause.reason}</p>
          </li>)}</ul>
        </section>}
        {result.sources.length > 0 && <section className="garden-panel garden-tool-stack">
          <h2>Care sources</h2>
          <ul className="garden-tool-list">{result.sources.map((source) => <li key={source.url}>
            <a className="garden-tool-source" href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowDownRight /></a>
          </li>)}</ul>
        </section>}
      </div>}
    </div>}
  </section>;
}
