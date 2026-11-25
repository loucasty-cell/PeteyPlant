import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Search } from 'lucide-react';
import {
  gardenApi,
  type Drainage,
  type GardenPlant,
  type GardenSpecies,
  type PlantDraft,
} from '../../lib/gardenApi';
import { FLAGSHIP_SPECIES_MANIFEST } from '../../lib/three/speciesAssetRegistry';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';

export const DRAFT_KEY = 'petey-plant-draft-v1';

export function AddPlantFlow({
  catalog,
  initial,
  chooseSpecies,
  onBack,
  onSave,
}: {
  catalog: GardenSpecies[];
  initial: PlantDraft;
  chooseSpecies: boolean;
  onBack: () => void;
  onSave: (plant: GardenPlant) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<'species' | 'details'>(
    !chooseSpecies && (initial.species_id || initial.name) ? 'details' : 'species',
  );
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);

  const search = query.trim().toLowerCase();
  const flagshipIds = useMemo(() => new Set(FLAGSHIP_SPECIES_MANIFEST.map((m) => m.speciesId)), []);
  const results = useMemo(() => {
    const filtered = catalog.filter((sp) => `${sp.name} ${sp.id}`.toLowerCase().includes(search));
    return [...filtered].sort((a, b) => {
      const aVerified = a.advice_status === 'verified' ? 0 : 1;
      const bVerified = b.advice_status === 'verified' ? 0 : 1;
      if (aVerified !== bVerified) return aVerified - bVerified;
      if (!search) {
        const aFlag = flagshipIds.has(a.id) ? 0 : 1;
        const bFlag = flagshipIds.has(b.id) ? 0 : 1;
        if (aFlag !== bFlag) return aFlag - bFlag;
      }
      return a.name.localeCompare(b.name);
    });
  }, [catalog, search, flagshipIds]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage errors
    }
  }, [draft]);

  function choose(species: GardenSpecies | null) {
    setDraft((cur) => ({
      ...cur,
      species_id: species?.id ?? null,
      name: cur.name || species?.name || '',
    }));
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
      const saved = await gardenApi.create(draft);
      sessionStorage.removeItem(DRAFT_KEY);
      onSave(saved);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Your plant could not be saved. Try again.',
      );
      submitLock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="petey-page-container" aria-labelledby="add-plant-heading">
      <div>
        <button
          type="button"
          className="petey-back-btn"
          disabled={busy}
          onClick={step === 'details' ? () => setStep('species') : onBack}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {step === 'details' ? 'Choose species' : 'Back'}
        </button>
      </div>

      <header>
        <span className="petey-small-label">{step === 'species' ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
        <h1 id="add-plant-heading" className="petey-page-title">
          {step === 'species' ? 'Choose your plant species' : 'Name your plant'}
        </h1>
        <p className="petey-page-sub">
          {step === 'species'
            ? 'Start with a real houseplant you already care for.'
            : draft.species_id ?? 'Unidentified houseplant — you can update species details later.'}
        </p>
      </header>

      {step === 'species' ? (
        <div className="petey-stack">
          <label className="petey-search-box">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Search species</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by common or scientific name"
            />
          </label>

          <div className="petey-garden-grid">
            {results.map((species) => {
              const badgeId = `advice-${species.id.replace(/[^a-z0-9]/gi, '-')}`;
              const verifiedAdvice = species.advice_status === 'verified';
              return (
                <div key={species.id} className="petey-stack gap-1">
                  <button
                    type="button"
                    className="petey-plant-card text-left w-full"
                    aria-describedby={species.advice_status ? badgeId : undefined}
                    onClick={() => choose(species)}
                  >
                    <div className="petey-plant-card-head">
                      <BotanicalThumbnail speciesId={species.id} size={48} />
                      <div className="min-w-0">
                        <strong className="block truncate text-sm text-[#202923]">{species.name}</strong>
                        <span className="petey-scientific block truncate">{species.id}</span>
                      </div>
                    </div>
                  </button>
                  {species.advice_status && (
                    <span
                      id={badgeId}
                      className="text-xs px-1 text-[#526156]"
                      data-advice-status={species.advice_status}
                    >
                      {verifiedAdvice ? 'Verified watering guide' : 'Identity only (manual checks)'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {results.length === 0 && (
            <p className="petey-body-muted">No species in the catalog match “{query}”.</p>
          )}

          <div>
            <button type="button" className="petey-link-btn" onClick={() => choose(null)}>
              I’m not sure which species I have <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <form className="petey-card petey-stack max-w-lg" onSubmit={(e) => void save(e)}>
          <label className="petey-field">
            Plant nickname
            <input
              required
              maxLength={60}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Window Monstera"
              autoFocus
              disabled={busy}
            />
          </label>

          <fieldset className="petey-fieldset" disabled={busy}>
            <legend className="petey-legend">Does its inner pot have drainage holes?</legend>
            <div className="petey-choice-grid-3">
              {(
                [
                  ['yes', 'Yes'],
                  ['no', 'No'],
                  ['unknown', 'Not sure'],
                ] as [Drainage, string][]
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`petey-choice-card ${draft.drainage === value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="add-drainage"
                    checked={draft.drainage === value}
                    onChange={() => setDraft({ ...draft, drainage: value })}
                  />
                  <span>
                    <strong>{label}</strong>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="petey-alert petey-alert-error" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="petey-btn-row">
            <button type="submit" className="hs-btn-primary" disabled={busy || !draft.name.trim()}>
              {busy ? 'Saving…' : 'Save plant'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
