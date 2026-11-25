import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowRight, Check, ClipboardCheck, Sprout, X } from 'lucide-react';
import { createUuid, gardenApi, GardenRequestError, type CheckupContext, type CheckupInput, type CheckupQuestion, type CheckupResult, type GardenPlant } from '../../lib/gardenApi';
import './checkup.css';

const questions = {
  soil: {
    title: 'How does the potting mix feel?',
    options: [['dry', 'Dry'], ['moist', 'Slightly moist'], ['wet', 'Wet or soggy'], ['unknown', 'I haven’t checked']],
  },
  inspection_depth: {
    title: 'Where did you check the mix?',
    options: [['recommended', 'At the depth described above'], ['surface', 'At the surface only'], ['unknown', 'I can’t tell']],
  },
  drainage: {
    title: 'Does the inner pot have drainage holes?',
    options: [['yes', 'Yes'], ['no', 'No'], ['unknown', 'I’m not sure']],
  },
  standing_water: {
    title: 'Is water sitting in the saucer or outer pot?',
    options: [['yes', 'Yes'], ['no', 'I looked and saw none'], ['unknown', 'I haven’t checked']],
  },
} as const satisfies { [Field in CheckupQuestion]: { title: string; options: readonly (readonly [CheckupInput[Field], string])[] } };

const evidenceNames: Record<string, string> = {
  soil: 'Potting mix', inspection_depth: 'Inspection depth', drainage: 'Drainage holes',
  standing_water: 'Standing water', species: 'Confirmed species', species_id: 'Confirmed species',
};
const evidenceOrigins: Record<string, string> = {
  OWNER_OBSERVED: 'You reported', HISTORICAL_RECORD: 'Saved record', SOURCE_VERIFIED: 'Botanical source',
};
type Screen = { mode: 'loading' | 'unavailable' | 'stale' } |
  { mode: 'question'; field: CheckupQuestion; selected: string | null } |
  { mode: 'result'; answer: CheckupResult; id: string; saved: boolean };

function readAnswers(context: CheckupContext, draftKey: string): CheckupInput {
  const defaults: CheckupInput = {
    soil: 'unknown', inspection_depth: 'unknown', standing_water: 'unknown',
    drainage: 'unknown', based_on: context.based_on, captured_at: '',
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
    const capturedAt = typeof saved?.captured_at === 'string' ? Date.parse(saved.captured_at) : NaN;
    const age = Date.now() - capturedAt;
    if (!saved || saved.based_on !== context.based_on || !Number.isFinite(age) || age > 60 * 60_000 || age < -2 * 60_000) return defaults;
    return {
      ...defaults,
      captured_at: saved.captured_at,
      soil: questions.soil.options.find(([code]) => code === saved.soil)?.[0] ?? defaults.soil,
      inspection_depth: questions.inspection_depth.options.find(([code]) => code === saved.inspection_depth)?.[0] ?? defaults.inspection_depth,
      standing_water: questions.standing_water.options.find(([code]) => code === saved.standing_water)?.[0] ?? defaults.standing_water,
      drainage: questions.drainage.options.find(([code]) => code === saved.drainage)?.[0] ?? defaults.drainage,
    };
  } catch {
    return defaults;
  }
}

export default function CheckupDialog({ plant, onClose, onSaved }: {
  plant: GardenPlant; onClose: () => void; onSaved: (plant: GardenPlant) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const questionTitle = useRef<HTMLHeadingElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const [context, setContext] = useState<CheckupContext>();
  const [input, setInput] = useState<CheckupInput>();
  const [screen, setScreen] = useState<Screen>({ mode: 'loading' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const draftKey = `petey-checkup-draft:${plant.id}`;
  const hasMonsteraPortrait = plant.species_id === 'Monstera deliciosa';
  const question = screen.mode === 'question' ? questions[screen.field] : null;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const trigger = document.activeElement;
    node.showModal();
    title.current?.focus();
    return () => {
      node.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
      request.current?.abort();
      request.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    gardenApi.checkup(plant.id, controller.signal).then((fresh) => {
      if (controller.signal.aborted) return;
      if (fresh.plant_id !== plant.id) throw new Error('Petey received a different plant. Try opening the checkup again.');
      setContext(fresh);
      const answers = readAnswers(fresh, draftKey);
      setInput(answers);
      setScreen({ mode: 'question', field: 'soil', selected: answers.soil === 'unknown' ? null : answers.soil });
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'Petey couldn’t open this checkup.');
      setScreen({ mode: 'unavailable' });
    });
    return () => controller.abort();
  }, [attempt, draftKey, plant.id]);

  const focusKey = screen.mode === 'question' ? screen.field : screen.mode;
  const saved = screen.mode === 'result' && screen.saved;
  const validUntil = screen.mode === 'result' ? screen.answer.valid_until : null;
  useEffect(() => { questionTitle.current?.focus(); }, [focusKey]);
  useEffect(() => { if (saved) done.current?.focus(); }, [saved]);

  useEffect(() => {
    if (validUntil === null) return;
    const remaining = Date.parse(validUntil) - Date.now();
    const timeout = setTimeout(() => {
      setScreen({ mode: 'stale' });
      setError('This observation is too old to guide care. Take a fresh reading.');
    }, Number.isFinite(remaining) ? Math.max(0, remaining) : 0);
    return () => clearTimeout(timeout);
  }, [validUntil]);

  function refresh() {
    setScreen({ mode: 'loading' });
    setError('');
    setAttempt((count) => count + 1);
  }

  function startRequest() {
    if (request.current) return null;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    return controller;
  }

  function finishRequest(controller: AbortController) {
    if (request.current !== controller) return;
    request.current = null;
    if (!controller.signal.aborted) setPending(false);
  }

  function reportFailure(controller: AbortController, failure: unknown) {
    if (controller.signal.aborted) return;
    if (failure instanceof GardenRequestError && failure.status === 409) {
      setScreen({ mode: 'stale' });
      setError(failure.message);
      return;
    }
    setError(failure instanceof DOMException && failure.name === 'TimeoutError'
      ? 'The checkup took too long. Try again.'
      : failure instanceof TypeError ? 'Petey couldn’t connect. Check your connection and try again.'
      : failure instanceof Error ? failure.message : 'Petey couldn’t complete the checkup. Try again.');
  }

  async function evaluate(event: FormEvent) {
    event.preventDefault();
    if (screen.mode !== 'question' || screen.selected === null || !input) return;
    const chosen = questions[screen.field].options.find(([value]) => value === screen.selected);
    if (!chosen) return;
    const controller = startRequest();
    if (!controller) return;
    const next = { ...input, [screen.field]: chosen[0] };
    if (screen.field === 'soil' && (!input.captured_at || input.soil !== next.soil)) {
      next.captured_at = new Date().toISOString();
      next.inspection_depth = 'unknown';
    }
    setInput(next);
    try { sessionStorage.setItem(draftKey, JSON.stringify(next)); }
    catch { /* The checkup also works without browser storage. */ }
    try {
      const answer = await gardenApi.assess(plant.id, next, controller.signal);
      if (!controller.signal.aborted) setScreen({ mode: 'result', answer, id: createUuid(), saved: false });
    } catch (failure) {
      reportFailure(controller, failure);
    } finally {
      finishRequest(controller);
    }
  }

  async function save() {
    if (screen.mode !== 'result' || screen.saved || !input) return;
    const controller = startRequest();
    if (!controller) return;
    try {
      const saved = await gardenApi.confirm(plant.id, screen.id, input, controller.signal);
      if (controller.signal.aborted) return;
      if (saved.id !== plant.id) throw new Error('Petey received a different plant. Reopen the checkup to verify your record.');
      try { sessionStorage.removeItem(draftKey); }
      catch { /* The server has already saved the observation. */ }
      onSaved(saved);
      setScreen({ ...screen, saved: true });
    } catch (failure) {
      reportFailure(controller, failure);
    } finally {
      finishRequest(controller);
    }
  }

  function ask(field: CheckupQuestion) {
    setError('');
    const selected = input?.[field];
    setScreen({ mode: 'question', field, selected: selected && selected !== 'unknown' ? selected : null });
  }

  return <dialog className="petey-checkup" ref={dialog} aria-labelledby="checkup-title" onCancel={(event) => {
    event.preventDefault();
    onClose();
  }}>
    <header className="petey-checkup-header">
      <span className="petey-checkup-art" aria-hidden="true">{hasMonsteraPortrait
        ? <img src={import.meta.env.BASE_URL + 'characters/monstera-v3-preview.webp'} alt="" /> : <Sprout />}</span>
      <div>
        <p className="garden-kicker"><ClipboardCheck /> Petey Checkup</p>
        <h2 tabIndex={-1} ref={title} id="checkup-title">{context?.name ?? plant.name}</h2>
      </div>
      <button type="button" className="petey-checkup-close" aria-label="Close checkup" onClick={onClose}><X /></button>
    </header>
    <div className="petey-checkup-body">
      {screen.mode === 'loading' && <p role="status">Opening this plant’s checkup…</p>}
      {(screen.mode === 'unavailable' || screen.mode === 'stale') && <>
        <h3 ref={questionTitle} tabIndex={-1}>{screen.mode === 'stale' ? 'Refresh your plant’s details' : 'Checkup is unavailable'}</h3>
        <p className="garden-error" role="alert">{error}</p>
        <button className="garden-secondary" type="button" onClick={refresh}>Try again</button>
      </>}
      {screen.mode === 'question' && question && <form className="garden-tool-stack" onSubmit={(event) => void evaluate(event)}>
        <h3 ref={questionTitle} tabIndex={-1} id="checkup-question">{question.title}</h3>
        {(screen.field === 'soil' || screen.field === 'inspection_depth') && <p>{context?.check_prompt}</p>}
        <fieldset aria-labelledby="checkup-question" disabled={pending} className="petey-checkup-options">
          {question.options.map(([value, label]) => <label key={value}>
            <input name="checkup-answer" type="radio" value={value} checked={screen.selected === value}
              onChange={() => setScreen({ ...screen, selected: value })} /> {label}
          </label>)}
        </fieldset>
        {error && <p className="garden-error" role="alert">{error}</p>}
        <div className="garden-tool-actions">
          <button className="garden-primary" disabled={pending || screen.selected === null}>
            {pending ? 'Reviewing…' : 'See next step'} <ArrowRight />
          </button>
          {screen.field !== 'soil' && <button className="garden-secondary" type="button" disabled={pending} onClick={() => ask('soil')}>Back to potting mix</button>}
        </div>
      </form>}
      {screen.mode === 'result' && <div className="garden-tool-stack">
        <h3 ref={questionTitle} tabIndex={-1}>{screen.answer.headline}</h3>
        <p>{screen.answer.explanation}</p>
        <p className="garden-tool-notice"><strong>Next step</strong><br />{screen.answer.next_step}</p>
        {screen.answer.evidence.length > 0 && <details className="petey-checkup-evidence">
          <summary>Why Petey suggests this</summary>
          <ul className="garden-tool-list">{screen.answer.evidence.map((item) => <li key={`${item.category}:${item.field}`}>
            <strong>{evidenceNames[item.field] ?? item.field.replace(/_/g, ' ')}</strong> {item.value.replace(/_/g, ' ')}
            {evidenceOrigins[item.category] && <small>{evidenceOrigins[item.category]}</small>}
          </li>)}</ul>
        </details>}
        {screen.answer.source && <a className="garden-tool-source" href={screen.answer.source} target="_blank" rel="noreferrer">Read the botanical source <ArrowDownRight /></a>}
        {error && <p className="garden-error" role="alert">{error}</p>}
        {screen.saved ? <>
          <p className="petey-checkup-saved" role="status"><Check /> Observation saved.</p>
          <button ref={done} type="button" className="garden-primary" onClick={onClose}>Done</button>
        </> : <div className="garden-tool-actions">
          {input && (input.soil !== 'unknown' || input.standing_water !== 'unknown' || input.drainage !== 'unknown')
            && <button className="garden-primary" disabled={pending} type="button" onClick={() => void save()}>{pending ? 'Saving…' : 'Save observation'}</button>}
          {screen.answer.question && <button type="button" className="garden-secondary" disabled={pending}
            onClick={() => { if (screen.answer.question) ask(screen.answer.question); }}>Answer follow-up <ArrowRight /></button>}
          <button type="button" className="garden-text-button" disabled={pending} onClick={() => ask('soil')}>Edit observations</button>
        </div>}
      </div>}
    </div>
  </dialog>;
}
