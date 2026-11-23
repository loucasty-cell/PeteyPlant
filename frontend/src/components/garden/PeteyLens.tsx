import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Leaf, ScanLine, X } from 'lucide-react';
import type { GardenSpecies } from '../../lib/gardenApi';
import { plantToolsApi, type LensCandidate, type LensCapability, type LensResult } from '../../lib/plantToolsApi';
import { encodeLensPhoto, photoFormats, prepareLensUpload } from './lensPhoto';
import { lensTraits } from './lensTraits';
import { pals, Portrait } from './PlantPalsArt';

type Stage = 'welcome' | 'camera' | 'review' | 'identifying' | 'result' | 'compare' | 'confirmed';

function cameraError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera access was blocked. Check your browser permissions or choose a photo.';
    if (error.name === 'NotFoundError') return 'Petey couldn’t find a camera. Choose a photo instead.';
    if (error.name === 'NotReadableError') return 'The camera may be in use. Close other camera apps or choose a photo.';
  }
  return 'The camera couldn’t start. Try again or choose a photo.';
}

function candidateName(candidate: LensCandidate) {
  return candidate.common_name ?? candidate.scientific_name ?? candidate.original_label;
}

function useLensPreview(photo: Blob | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!photo) {
      setUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);
  return url;
}

export default function PeteyLens({ catalog, onBack, onManual, onAdd }: {
  catalog: GardenSpecies[];
  onBack: () => void;
  onManual: () => void;
  onAdd: (species: string) => void;
}) {
  const [stage, setStage] = useState<Stage>('welcome');
  const [capability, setCapability] = useState<LensCapability | null>(null);
  const [statusRetry, setStatusRetry] = useState(0);
  const [statusFailed, setStatusFailed] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoSource, setPhotoSource] = useState<'camera' | 'gallery'>('gallery');
  const [result, setResult] = useState<LensResult | null>(null);
  const [confirmed, setConfirmed] = useState<LensCandidate | null>(null);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const camera = useRef<MediaStream | null>(null);
  const work = useRef(0);
  const scan = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef<Stage>('welcome');
  const activeStage = useRef<Stage>('welcome');
  const preview = useLensPreview(photo);

  const stopCamera = useCallback(() => {
    camera.current?.getTracks().forEach((track) => track.stop());
    camera.current = null;
  }, []);

  function changeStage(next: Stage) {
    activeStage.current = next;
    work.current += 1;
    stopCamera();
    setStream(null);
    setCameraStarting(false);
    setCameraReady(false);
    setPreparing(false);
    setError('');
    setStage(next);
  }

  useEffect(() => {
    const controller = new AbortController();
    plantToolsApi.lensStatus(AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]))
      .then((status) => {
        if (!controller.signal.aborted) setCapability(status);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatusFailed(true);
      });
    return () => controller.abort();
  }, [statusRetry]);

  useEffect(() => {
    function releaseHiddenCamera() {
      if (!document.hidden || activeStage.current !== 'camera') return;
      activeStage.current = 'welcome';
      work.current += 1;
      stopCamera();
      setStream(null);
      setCameraStarting(false);
      setCameraReady(false);
      setPreparing(false);
      setStage('welcome');
      setError('The camera closed while Petey was in the background.');
    }
    window.addEventListener('pagehide', stopCamera);
    document.addEventListener('visibilitychange', releaseHiddenCamera);
    return () => {
      window.removeEventListener('pagehide', stopCamera);
      document.removeEventListener('visibilitychange', releaseHiddenCamera);
      work.current += 1;
      stopCamera();
      scan.current?.abort();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [stage]);

  useEffect(() => {
    if (!stream || !video.current) return;
    const node = video.current;
    const track = stream.getVideoTracks()[0];
    let active = true;
    function interrupted() {
      if (!active) return;
      stopCamera();
      setStream(null);
      setCameraReady(false);
      setError('The camera was interrupted. Open it again or choose a photo.');
    }
    track?.addEventListener('ended', interrupted);
    node.srcObject = stream;
    void node.play().catch(interrupted);
    return () => {
      active = false;
      track?.removeEventListener('ended', interrupted);
      node.srcObject = null;
    };
  }, [stream, stopCamera]);

  async function openCamera() {
    changeStage('camera');
    const operation = work.current;
    setPhoto(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Your browser needs a secure connection for camera access. Choose a photo instead.');
      return;
    }
    setCameraStarting(true);
    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (operation !== work.current || document.hidden) {
        opened.getTracks().forEach((track) => track.stop());
        if (operation === work.current) setError('The camera closed while Petey was in the background.');
        return;
      }
      camera.current = opened;
      setStream(opened);
    } catch (failure) {
      if (operation === work.current) setError(cameraError(failure));
    } finally {
      if (operation === work.current) setCameraStarting(false);
    }
  }

  async function capture() {
    const node = video.current;
    if (!node?.videoWidth || !cameraReady || preparing) return;
    const operation = ++work.current;
    setPreparing(true);
    setError('');
    try {
      const captured = await encodeLensPhoto(node, node.videoWidth, node.videoHeight);
      if (operation !== work.current) return;
      changeStage('review');
      setPhotoSource('camera');
      setPhoto(captured);
    } catch (failure) {
      if (operation === work.current) setError(failure instanceof Error ? failure.message : 'Petey couldn’t capture that frame.');
    } finally {
      if (operation === work.current) setPreparing(false);
    }
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const operation = ++work.current;
    stopCamera();
    setStream(null);
    setCameraReady(false);
    setCameraStarting(false);
    setPreparing(true);
    setError('');
    try {
      const prepared = await prepareLensUpload(file);
      if (operation !== work.current) return;
      changeStage('review');
      setPhotoSource('gallery');
      setPhoto(prepared);
    } catch (failure) {
      if (operation === work.current) setError(failure instanceof Error ? failure.message : 'Petey couldn’t open that photo.');
    } finally {
      if (operation === work.current) setPreparing(false);
    }
  }

  function refreshStatus() {
    setCapability(null);
    setStatusFailed(false);
    setStatusRetry((attempt) => attempt + 1);
  }

  async function identify() {
    if (!photo || scan.current || capability?.status !== 'available') return;
    const request = new AbortController();
    scan.current = request;
    changeStage('identifying');
    try {
      const answer = await plantToolsApi.identify(photo, AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]));
      if (request.signal.aborted) return;
      setResult(answer);
      setPhoto(null);
      if (answer.status === 'unavailable') {
        setCapability({
          status: 'unavailable',
          message: 'Photo identification is unavailable right now.',
          model_version: answer.model_version,
          taxonomy_version: answer.taxonomy_version,
        });
      }
      changeStage('result');
    } catch (failure) {
      if (request.signal.aborted) return;
      changeStage('review');
      setError(failure instanceof DOMException && failure.name === 'TimeoutError'
        ? 'Identification took too long. Try the same photo again.'
        : failure instanceof TypeError ? 'Petey couldn’t reach identification. Check your connection and try again.'
        : failure instanceof Error ? failure.message : 'Identification failed. Try again.');
    } finally {
      if (scan.current === request) scan.current = null;
    }
  }

  function cancelScan() {
    scan.current?.abort();
    scan.current = null;
    changeStage('review');
  }

  function startOver() {
    setPhoto(null);
    setResult(null);
    setConfirmed(null);
    changeStage('welcome');
  }

  const candidates = result?.candidates.slice(0, 3) ?? [];
  const canCompare = candidates.filter((candidate) => candidate.species_key && lensTraits[candidate.species_key]).length >= 2;
  const anotherPhoto = result?.status === 'need_another_photo' || result?.another_photo_recommended;
  const displayMatch = result?.status !== 'unavailable' && candidates.length > 0;
  const match = confirmed && catalog.find((species) => species.id === confirmed.species_key);
  const pal = match && pals.find((item) => item.id === match.id);
  const statusMessage = capability?.status === 'unavailable'
    ? capability.message
    : statusFailed ? 'Petey couldn’t check whether identification is available.' : null;
  const titles = {
    welcome: 'Meet your plant.',
    camera: 'Take a plant photo.',
    review: 'Review your photo.',
    identifying: 'Looking for matches…',
    result: displayMatch ? 'Possible matches.' : anotherPhoto ? 'Try a clearer angle.' : 'Photo identification unavailable.',
    compare: 'Compare your matches.',
    confirmed: 'You picked a match.',
  };

  return <section className="garden-inner garden-tool" aria-labelledby="lens-title">
    <button type="button" className="garden-back" onClick={stage === 'compare' || stage === 'confirmed'
      ? () => changeStage('result') : stage === 'identifying' ? cancelScan : stage === 'welcome' ? onBack : startOver}>
      <ArrowLeft />{stage === 'welcome' ? 'My garden' : stage === 'compare' || stage === 'confirmed' ? 'Possible matches' : stage === 'identifying' ? 'Cancel scan' : 'Back to Petey Lens'}
    </button>
    <header className="garden-tool-heading">
      <span className="garden-kicker"><ScanLine /> Petey Lens</span>
      <h1 id="lens-title" ref={heading} tabIndex={-1}>{titles[stage]}</h1>
      {stage === 'welcome' && <p className="garden-lede">Take a photo to look for possible species matches.</p>}
    </header>
    <input ref={picker} type="file" accept={photoFormats.join(',')} onChange={(event) => void selectPhoto(event)} hidden />
    {error && <p className="garden-tool-notice garden-error" role="alert">{error}</p>}

    {stage === 'welcome' && <div className="garden-tool-grid">
      <section className="garden-panel garden-tool-stack" aria-labelledby="lens-start">
        <h2 id="lens-start">Start with a photo</h2>
        <p>Your browser will ask to use your camera. Petey sends a photo for identification only when you choose Use photo.</p>
        {(statusMessage || !capability) && <div className="garden-tool-notice" role="status">
          <p>{statusMessage ?? 'Checking whether photo identification is available…'}</p>
          {statusMessage && <button type="button" className="garden-text-button" onClick={refreshStatus}>Check again</button>}
        </div>}
        <div className="garden-tool-actions">
          <button type="button" className="garden-primary" onClick={() => void openCamera()} disabled={preparing}><Camera /> Open camera</button>
          <button type="button" className="garden-secondary" onClick={() => picker.current?.click()} disabled={preparing}><ImagePlus /> Choose a photo</button>
        </div>
        <button type="button" className="garden-text-button" onClick={onManual}>Search by plant name <ArrowRight /></button>
      </section>
      <aside className="garden-lens-guide" aria-label="Photo framing tips">
        <div className="garden-lens-illustration"><Portrait pal={pals[0]} mood="curious" /><span aria-hidden="true" className="garden-frame-guide" /></div>
        <p>Fit one plant in the frame. Use even light and keep the leaves in focus.</p>
      </aside>
    </div>}

    {stage === 'camera' && <div className="garden-camera-workspace">
      <div className="garden-viewfinder">
        <video ref={video} autoPlay muted playsInline onPlaying={() => setCameraReady(Boolean(camera.current))} aria-label="Live camera preview" />
        {cameraReady && <span className="garden-frame-guide" aria-hidden="true" />}
        {!cameraReady && <p role="status">{cameraStarting ? 'Allow camera access in your browser, or choose a photo.' : 'Camera preview paused.'}</p>}
      </div>
      <p>Fit the whole plant in the frame, with its leaves and stems in view.</p>
      <div className="garden-tool-actions">
        {cameraReady ? <button className="garden-primary" type="button" disabled={preparing} onClick={() => void capture()}><Camera /> Take photo</button>
          : <button className="garden-primary" type="button" disabled={cameraStarting || preparing} onClick={() => void openCamera()}><Camera /> Open camera</button>}
        <button type="button" className="garden-secondary" disabled={preparing} onClick={() => picker.current?.click()}><ImagePlus /> Choose a photo</button>
      </div>
    </div>}

    {stage === 'review' && <div className="garden-tool-grid">
      <div className="garden-photo-preview">{preview && <img src={preview} alt="Your plant photo for review" />}</div>
      <section className="garden-panel garden-tool-stack" aria-labelledby="review-photo-details">
        <h2 id="review-photo-details">Leaves in focus?</h2>
        <p>If another plant is in the shot or the leaves are blurred, try a new photo. Petey sends this copy without the original file metadata.</p>
        {(statusMessage || !capability) && <div className="garden-tool-notice" role="status">
          <p>{statusMessage ?? 'Checking whether photo identification is available…'}</p>
          {statusMessage && <button type="button" className="garden-text-button" onClick={refreshStatus}>Check again</button>}
        </div>}
        <div className="garden-tool-actions">
          <button className="garden-primary" type="button" disabled={preparing || capability?.status !== 'available'} onClick={() => void identify()}><ScanLine /> Use photo</button>
          <button className="garden-secondary" type="button" disabled={preparing} onClick={photoSource === 'camera' ? () => void openCamera() : () => picker.current?.click()}>
            {photoSource === 'camera' ? 'Retake photo' : 'Choose another photo'}
          </button>
        </div>
        <button type="button" className="garden-text-button" onClick={onManual}>Search by plant name <ArrowRight /></button>
      </section>
    </div>}
    {preparing && <p className="garden-tool-notice" role="status">Preparing your photo…</p>}

    {stage === 'identifying' && <section className="garden-panel garden-tool-stack garden-tool-narrow">
      <div className="garden-lens-progress-pal"><Portrait pal={pals[0]} mood="curious" /></div>
      <p role="status">Petey is checking your photo for possible species matches.</p>
      <button className="garden-secondary" type="button" onClick={cancelScan}><X /> Cancel and return to photo</button>
    </section>}

    {stage === 'result' && result && <div className="garden-tool-stack">
      {displayMatch && <p className="garden-lede">Compare the leaf shape and stems before choosing a species.</p>}
      {displayMatch && <ol className="garden-lens-matches">
        {candidates.map((candidate, index) => {
          const species = candidate.species_key ? catalog.find((item) => item.id === candidate.species_key) : undefined;
          const trait = candidate.species_key ? lensTraits[candidate.species_key] : undefined;
          return <li className="garden-panel garden-tool-stack" key={candidate.original_label}>
            <span className="garden-kicker">{index === 0 ? 'First suggestion' : 'Another possibility'}</span>
            <h2>{candidateName(candidate)}</h2>
            {candidate.scientific_name && candidate.scientific_name !== candidateName(candidate) && <p><i>{candidate.scientific_name}</i></p>}
            {candidate.taxonomic_rank === 'genus' && <p>This match suggests a plant group.</p>}
            {trait && <p>{trait.leaves}</p>}
            {species && candidate.taxonomic_rank === 'species' && <button className="garden-secondary" type="button" onClick={() => {
              setConfirmed(candidate);
              changeStage('confirmed');
            }}>Choose {candidateName(candidate)} <ArrowRight /></button>}
          </li>;
        })}
      </ol>}
      {anotherPhoto && <p className="garden-tool-notice">Try another angle showing how the leaves join the stem. Keep one plant in frame and use bright, even light.</p>}
      {result.limitations.length > 0 && <ul className="garden-tool-list garden-muted">{result.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>}
      <div className="garden-tool-actions">
        {displayMatch && canCompare && <button type="button" className="garden-primary" onClick={() => changeStage('compare')}>Compare leaf and stem features</button>}
        {result.status !== 'unavailable' && <button type="button" className="garden-secondary" onClick={() => void openCamera()}><Camera /> Take another photo</button>}
        {result.status !== 'unavailable' && <button type="button" className="garden-secondary" onClick={() => picker.current?.click()} disabled={preparing}><ImagePlus /> Choose a photo</button>}
        <button type="button" className="garden-text-button" onClick={onManual}>Search by plant name <ArrowRight /></button>
      </div>
    </div>}

    {stage === 'compare' && <div className="garden-lens-matches">
      {candidates.map((candidate) => {
        const trait = candidate.species_key ? lensTraits[candidate.species_key] : undefined;
        return <section key={candidate.original_label} className="garden-panel garden-tool-stack">
          <h2>{candidateName(candidate)}</h2>
          {trait ? <>
            <dl className="garden-comparison">
              <div><dt>Leaves</dt><dd>{trait.leaves}</dd></div>
              <div><dt>Growth</dt><dd>{trait.habit}</dd></div>
            </dl>
            <a className="garden-tool-source" target="_blank" rel="noreferrer" href={trait.source}>NC State Extension plant guide</a>
          </> : <p>See other matches for features you can compare.</p>}
        </section>;
      })}
    </div>}

    {stage === 'confirmed' && match && <section className="garden-panel garden-lens-confirm">
      {pal ? <Portrait pal={pal} mood="happy" interactive /> : <span aria-hidden="true" className="garden-portrait garden-art-fallback"><Leaf /></span>}
      <div className="garden-tool-stack">
        <h2>{match.name}</h2>
        <p><i>{confirmed?.scientific_name ?? match.id}</i></p>
        <button className="garden-primary" type="button" onClick={() => onAdd(match.id)}>Set up this plant <ArrowRight /></button>
      </div>
    </section>}
  </section>;
}
