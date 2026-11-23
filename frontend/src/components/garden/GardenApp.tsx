import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardCheck, Droplets, FlaskConical, Leaf, Plus, Search, Sprout } from 'lucide-react';
import { gardenApi, type CareKind, type Drainage, type GardenPlant, type GardenSpecies, type PlantDraft } from '../../lib/gardenApi';
import { PalCanvas, pals, Portrait } from './PlantPalsArt';
import './garden.css';
import './plant-tools.css';

const PeteyLens = lazy(() => import('./PeteyLens'));
const PlantHealth = lazy(() => import('./PlantHealth'));
const PlantLab = lazy(() => import('../lab/PlantLab'));
const draftKey = 'petey-plant-draft-v1';
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const statuses = { check: 'Ready to check', ready: 'Ready to water', wait: 'Still moist', rest: 'Taking a rest', details: 'Check the pot' };
const plantMoods = { check: 'curious', ready: 'curious', wait: 'relieved', rest: 'happy', details: 'curious' } as const;
const historyLabels: Record<CareKind, string> = { dry: 'Reported dry potting mix', moist: 'Reported moist potting mix', unsure: 'Soil check inconclusive', watered: 'Watering logged' };

function readDraft(): PlantDraft | null {
  try { return JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as PlantDraft | null; }
  catch { return null; }
}

function nextCheck(plant: GardenPlant) {
  if (!plant.next_check_at) return 'Watering suggested';
  const date = new Date(plant.next_check_at);
  return date.getTime() <= Date.now() ? 'Ready to check' : `Check around ${dateFormat.format(date)}`;
}

function PlantArt({ species, className = '', status, interactive }: {
  species: string | null;
  className?: string;
  status?: GardenPlant['status'];
  interactive?: boolean;
}) {
  const pal = pals.find((item) => item.id === species);
  return pal ? <Portrait pal={pal} className={className} mood={status ? plantMoods[status] : 'idle'} interactive={interactive} /> :
    <span className={`garden-portrait garden-art-fallback ${className}`} aria-hidden="true"><Sprout /></span>;
}

function AddPlant({ catalog, initial, chooseSpecies, onBack, onSave }: {
  catalog: GardenSpecies[];
  initial: PlantDraft;
  chooseSpecies: boolean;
  onBack: () => void;
  onSave: (plant: GardenPlant) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(!chooseSpecies && (initial.species_id || initial.name) ? 'details' : 'species');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  const search = query.trim().toLowerCase();
  const suggestions = catalog.filter((species) => `${species.name} ${species.id}`.toLowerCase().includes(search));
  const featured = pals.flatMap((pal) => catalog.find((species) => species.id === pal.id) ?? []);
  const results = search ? suggestions : [...featured, ...catalog.filter((species) => !featured.includes(species))];

  useEffect(() => {
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft]);

  function choose(species: GardenSpecies | null) {
    setDraft((current) => ({ ...current, species_id: species?.id ?? null, name: current.name || species?.name || '' }));
    setError('');
    setStep('details');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitLock.current || !draft.name.trim()) return;
    submitLock.current = true;
    setBusy(true);
    setError('');
    try {
      const plant = await gardenApi.create(draft);
      sessionStorage.removeItem(draftKey);
      onSave(plant);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your plant couldn’t be saved. Try again.');
      submitLock.current = false;
      setBusy(false);
    }
  }

  return <section className="garden-inner garden-onboarding" aria-labelledby="add-title">
    <button type="button" className="garden-back" onClick={step === 'details' ? () => setStep('species') : onBack} disabled={busy}><ArrowLeft /> {step === 'details' ? 'Choose species' : 'Back to my garden'}</button>
    {step === 'species' ? <>
      <span className="garden-kicker">Step 1 of 2</span>
      <h1 id="add-title">Find your plant.</h1>
      <p className="garden-lede">Start with one you already have at home.</p>
      <label className="garden-search"><Search aria-hidden="true" /><span className="sr-only">Search species</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by common or scientific name" />
      </label>
      <div className="garden-results">
        {results.map((species) => <button key={species.id} type="button" onClick={() => choose(species)}>
          <PlantArt species={species.id} /><span><strong>{species.name}</strong><i>{species.id}</i></span><ChevronRight />
        </button>)}
      </div>
      {results.length === 0 && <p>No species match that search.</p>}
      <button className="garden-text-button" type="button" onClick={() => choose(null)}>I’m not sure which plant I have <ArrowRight /></button>
    </> : <>
      <span className="garden-kicker">Step 2 of 2</span>
      <h1 id="add-title">Make it yours.</h1>
      <p className="garden-lede">{draft.species_id ?? 'You can start with an unidentified plant.'}</p>
      <form className="garden-form" onSubmit={save}>
        <label>Plant name<input required maxLength={60} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Monty" autoFocus disabled={busy} /></label>
        <fieldset disabled={busy}>
          <legend>Does its pot have drainage holes?</legend>
          <div className="garden-choices">
            {([['yes', 'Yes'], ['no', 'No'], ['unknown', 'I’m not sure']] as [Drainage, string][]).map(([value, label]) =>
              <label key={value}><input type="radio" name="drainage" checked={draft.drainage === value} onChange={() => setDraft({ ...draft, drainage: value })} /> {label}</label>)}
          </div>
        </fieldset>
        {error && <p className="garden-error" role="alert">{error}</p>}
        <button className="garden-primary" disabled={busy || !draft.name.trim()}>{busy ? 'Saving…' : 'Save plant'} <ArrowRight /></button>
      </form>
    </>}
  </section>;
}

function PlantProfile({ plant, onBack, onSaved, onCheckHealth }: {
  plant: GardenPlant;
  onBack: () => void;
  onSaved: (plant: GardenPlant) => void;
  onCheckHealth: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const retryKey = `petey-care-draft:${plant.id}`;
  const retry = useRef<{ id: string; kind: CareKind } | null>(null);
  useEffect(() => {
    const saved = sessionStorage.getItem(retryKey);
    if (saved) retry.current = JSON.parse(saved) as { id: string; kind: CareKind };
  }, [retryKey]);
  const requestInFlight = useRef(false);

  async function record(kind: CareKind) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setError('');
    setNotice('');
    const action = retry.current?.kind === kind ? retry.current : { id: crypto.randomUUID(), kind };
    retry.current = action;
    sessionStorage.setItem(retryKey, JSON.stringify(action));
    try {
      const result = await gardenApi.record(plant.id, action);
      retry.current = null;
      sessionStorage.removeItem(retryKey);
      onSaved(result);
      setNotice(kind === 'watered' ? 'Watering saved.' : 'Soil check saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The entry couldn’t be saved. Try again.');
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  const checkOptions = <div className="garden-choices garden-care-options" aria-label="Record soil observation">
    <button type="button" disabled={pending} onClick={() => void record('dry')}>Dry</button>
    <button type="button" disabled={pending} onClick={() => void record('moist')}>Still moist</button>
    <button type="button" disabled={pending} onClick={() => void record('unsure')}>I’m not sure</button>
  </div>;
  const heading = {
    check: 'How’s the potting mix?',
    ready: 'A good time to water.',
    wait: 'Give the mix time to dry.',
    rest: 'Watering is logged.',
    details: 'Take a closer look.',
  }[plant.status];

  return <section className="garden-inner garden-profile" aria-labelledby="profile-title">
    <button className="garden-back" type="button" onClick={onBack}><ArrowLeft /> My garden</button>
    <header className="garden-profile-top">
      <PlantArt species={plant.species_id} status={plant.status} interactive />
      <div><span className="garden-kicker">{plant.common_name ?? 'Plant companion'}</span><h1 id="profile-title">{plant.name}</h1>
        {plant.species_id && <p><i>{plant.species_id}</i></p>}</div>
    </header>
    <div className="garden-profile-body">
      <section className="garden-panel">
        <span className="garden-status"><Leaf /> {statuses[plant.status]}</span>
        <h2>{heading}</h2>
        <p>{plant.message}</p>
        {plant.status === 'check' ? checkOptions : <details className="garden-repeat">
          <summary>Record another soil check</summary>
          <p className="garden-muted">{plant.check_prompt}</p>
          {checkOptions}
        </details>}
        {plant.status !== 'rest' && <button className={plant.status === 'ready' ? 'garden-primary' : 'garden-text-button'} type="button" disabled={pending} onClick={() => void record('watered')}>
          <Droplets /> {plant.status === 'ready' ? 'Log watering' : 'I already watered this plant'}
        </button>}
        <p className="garden-muted">{nextCheck(plant)}{plant.next_check_at ? ' · Estimated check' : ''}</p>
        {error && <p className="garden-error" role="alert">{error}</p>}
        <p className="garden-feedback" role="status">{pending ? 'Saving care entry…' : notice && <><Check /> {notice}</>}</p>
        {plant.watering_guidance && <details className="garden-guidance"><summary>Species care guidance</summary><p>{plant.watering_guidance}</p>
          {plant.watering_source && <a href={plant.watering_source} target="_blank" rel="noreferrer">Read the botanical source <ArrowDownRight /></a>}</details>}
      </section>
      <div className="garden-tool-stack">
        <section className="garden-panel garden-tool-stack" aria-labelledby="profile-health-heading">
          <h2 id="profile-health-heading">Something changed?</h2>
          <button type="button" className="garden-secondary" onClick={onCheckHealth}><ClipboardCheck /> Check plant health</button>
        </section>
        <section className="garden-panel garden-history" aria-labelledby="garden-history-title">
          <h2 id="garden-history-title">Care history</h2>
          {plant.history.length === 0 ? <p className="garden-muted">Soil checks and watering you log will appear here.</p> :
            <ol>{plant.history.map((event) => <li key={event.id}><span>{historyLabels[event.kind]}</span>
              <time dateTime={event.occurred_at}>{dateFormat.format(new Date(event.occurred_at))}</time></li>)}</ol>}
        </section>
      </div>
    </div>
  </section>;
}

type View = 'home' | 'collection' | 'add' | 'plant' | 'lab' | 'lens' | 'health';

export default function GardenApp() {
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get('view') === 'lab' ? 'lab' : 'home');
  const [plants, setPlants] = useState<GardenPlant[]>([]);
  const [catalog, setCatalog] = useState<GardenSpecies[]>([]);
  const [connection, setConnection] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [healthPlant, setHealthPlant] = useState<string | null>(null);
  const [chooseSpecies, setChooseSpecies] = useState(false);
  const [draft, setDraft] = useState<PlantDraft | null>(readDraft);
  const headingTarget = useRef<HTMLElement>(null);
  const previousView = useRef<View>('home');
  const savedRevision = useRef(0);

  useEffect(() => {
    function refreshOnReturn() {
      if (document.visibilityState === 'visible') setReload((revision) => revision + 1);
    }
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => document.removeEventListener('visibilitychange', refreshOnReturn);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const revision = savedRevision.current;
    Promise.all([gardenApi.plants(controller.signal), gardenApi.species(controller.signal)])
      .then(([records, species]) => {
        if (controller.signal.aborted) return;
        if (savedRevision.current === revision) setPlants(records);
        setCatalog(species);
        setConnection('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setConnection('error'); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    headingTarget.current?.focus();
    window.scrollTo(0, 0);
  }, [view]);

  function addPlant(species?: string, manual = false) {
    setChooseSpecies(manual);
    const match = catalog.find((entry) => entry.id === species);
    setDraft(match ? { id: crypto.randomUUID(), species_id: match.id, name: match.name, drainage: 'unknown' }
      : readDraft() ?? { id: crypto.randomUUID(), species_id: null, name: '', drainage: 'unknown' });
    setView('add');
  }

  function updatePlant(plant: GardenPlant) {
    savedRevision.current += 1;
    setPlants((current) => current.some((item) => item.id === plant.id)
      ? current.map((item) => item.id === plant.id ? plant : item)
      : [...current, plant]);
  }

  function openPlant(id: string) {
    setSelected(id);
    setView('plant');
  }

  function openHealth(id: string | null = null) {
    setHealthPlant(id);
    setView('health');
  }

  const plant = plants.find((item) => item.id === selected);
  const checkedPlant = plants.find((item) => item.id === healthPlant);
  const first = plants.find((item) => item.status === 'ready')
    ?? plants.find((item) => item.status === 'check' || item.status === 'details');
  const hasPlants = plants.length > 0;

  if (view === 'lab') return <div>
    <div className="garden-lab-bar"><button className="garden-back" type="button" onClick={() => setView('home')}><ArrowLeft /> Back to my garden</button><span>Plant Lab · Demo data</span></div>
    <Suspense fallback={<p className="garden-lab-bar" role="status">Opening Plant Lab…</p>}><PlantLab /></Suspense>
  </div>;

  return <div className="garden-app">
    <a href="#garden-content" className="garden-skip">Skip to content</a>
    <header className="garden-nav">
      <button className="garden-brand" type="button" onClick={() => setView('home')}><span><Sprout /></span> Petey Plant</button>
      <nav aria-label="Primary">
        <button type="button" aria-current={view === 'home' || view === 'plant' || view === 'add' ? 'page' : undefined} onClick={() => setView('home')}>My garden</button>
        <button type="button" aria-current={view === 'collection' ? 'page' : undefined} onClick={() => setView('collection')}>Plant Pals</button>
        <button type="button" aria-current={view === 'lens' ? 'page' : undefined} onClick={() => setView('lens')}>Petey Lens</button>
        <button type="button" aria-current={view === 'health' ? 'page' : undefined} onClick={() => openHealth()}>Plant health</button>
      </nav>
      <button className="garden-primary garden-add" type="button" onClick={() => addPlant()} disabled={connection !== 'ready'}><Plus /> Add plant</button>
    </header>
    <main id="garden-content" tabIndex={-1} ref={headingTarget}>
      {view === 'home' && <div className="garden-inner">
        <section className="garden-hero">
          <div className="garden-hero-copy">
            <span className="garden-kicker"><Leaf /> {hasPlants ? 'Your garden today' : 'Petey’s Plant Pals'}</span>
            <h1>{hasPlants ? first ? 'Time for a little care.' : 'Your garden can rest.' : 'A little care goes a long way.'}</h1>
            <p>{first ? `${first.name} ${first.status === 'ready' ? 'is ready for watering.' : first.status === 'details' ? 'needs a quick look at its pot.' : 'could use a soil check.'}`
              : hasPlants ? 'See when each plant is due for its next check.'
              : 'Meet the companions that help you remember when to check on the real plants you love.'}</p>
            {connection === 'ready' && (first ? <button className="garden-hero-button" type="button" onClick={() => openPlant(first.id)}>Open {first.name} <ArrowRight /></button>
              : !hasPlants && <button className="garden-hero-button" type="button" onClick={() => addPlant()}><Plus /> Add your first plant</button>)}
          </div>
          <PlantArt species={hasPlants ? (first ?? plants[0]).species_id : pals[0].id} status={(first ?? plants[0])?.status} className="garden-hero-art" />
        </section>
        {connection === 'loading' && <p className="garden-connection" role="status">Opening your garden…</p>}
        {connection === 'error' && <div className="garden-connection" role="alert"><p>Your garden is offline. Reconnect to view or save your plants.</p>
          <button className="garden-text-button" onClick={() => { setConnection('loading'); setReload((count) => count + 1); }}>Try again <ArrowRight /></button></div>}
        {hasPlants ? <section className="garden-section" aria-labelledby="my-plants">
          <div className="garden-section-heading"><div><span className="garden-kicker">Care at a glance</span><h2 id="my-plants">My plants</h2></div></div>
          <div className="garden-plants">{plants.map((item) => <button type="button" className="garden-plant" key={item.id} onClick={() => openPlant(item.id)}>
            <PlantArt species={item.species_id} status={item.status} /><span><strong>{item.name}</strong><span>{nextCheck(item)}</span></span><ChevronRight />
          </button>)}</div>
        </section> : <section className="garden-section" aria-labelledby="meet-pals">
          <div className="garden-section-heading"><div><span className="garden-kicker">The greenhouse</span><h2 id="meet-pals">Meet the Plant Pals</h2></div>
            <button className="garden-text-button" type="button" onClick={() => setView('collection')}>View all <ArrowRight /></button></div>
          <PalShelf entries={pals.slice(0, 4)} catalog={catalog} connection={connection} onAdd={addPlant} />
        </section>}
      </div>}
      {view === 'collection' && <section className="garden-inner garden-section" aria-labelledby="collection-title">
        <span className="garden-kicker">The greenhouse</span><h1 id="collection-title">Meet the Plant Pals.</h1>
        <p className="garden-lede">Choose a companion for a plant you have at home.</p>
        <PalShelf entries={pals} catalog={catalog} connection={connection} onAdd={addPlant} />
      </section>}
      {view === 'add' && draft && <AddPlant initial={draft} key={draft.id} chooseSpecies={chooseSpecies} catalog={catalog} onBack={() => setView('home')}
        onSave={(saved) => { updatePlant(saved); setDraft(null); openPlant(saved.id); }} />}
      {view === 'plant' && plant && <PlantProfile key={plant.id} plant={plant} onBack={() => setView('home')} onSaved={updatePlant} onCheckHealth={() => openHealth(plant.id)} />}
      {view === 'lens' && <Suspense fallback={<p className="garden-inner garden-connection" role="status">Opening Petey Lens…</p>}>
        <PeteyLens catalog={catalog} onBack={() => setView('home')} onManual={() => addPlant(undefined, true)} onAdd={addPlant} />
      </Suspense>}
      {view === 'health' && <Suspense fallback={<p className="garden-inner garden-connection" role="status">Opening the health check…</p>}>
        <PlantHealth key={healthPlant ?? 'general'} plant={checkedPlant} onBack={() => setView(checkedPlant ? 'plant' : 'home')} />
      </Suspense>}
    </main>
    <footer className="garden-footer"><span><Sprout /> Petey Plant</span><button className="garden-text-button" onClick={() => setView('lab')}><FlaskConical /> Plant Lab</button></footer>
    <PalCanvas />
  </div>;
}

function PalShelf({ entries, catalog, connection, onAdd }: {
  entries: typeof pals; catalog: GardenSpecies[]; connection: string; onAdd: (species: string) => void;
}) {
  return <ul className="garden-shelf">
    {entries.map((pal) => {
      const available = connection === 'ready' && catalog.some((species) => species.id === pal.id);
      return <li key={pal.id}><Portrait pal={pal} onShelf /><div className="garden-nameplate">
        <span><strong>{pal.name}</strong><span>{pal.trait}</span></span>
        {available && <button type="button" aria-label={`Add ${pal.name}`} onClick={() => onAdd(pal.id)}><Plus /></button>}
      </div></li>;
    })}
  </ul>;
}
