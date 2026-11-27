import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanLine,
  SwitchCamera,
  X,
} from 'lucide-react';
import { withTimeoutSignal, type GardenSpecies } from '../../lib/gardenApi';
import {
  plantToolsApi,
  type LensCandidate,
  type LensCapability,
  type LensResult,
} from '../../lib/plantToolsApi';
import { encodeLensPhoto, photoFormats, prepareLensUpload } from './lensPhoto';
import { lensTraits } from './lensTraits';
import { InteractivePlantStage } from './InteractivePlantStage';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';
import { resolveSpeciesAsset } from '../../lib/three/speciesAssetRegistry';
import { WEATHER_THEMES } from '../../lib/weatherService';

/**
 * Explicit Petey Lens state machine covering happy path and every error/fallback branch.
 */
export type LensState =
  | 'idle'
  | 'requesting_permission'
  | 'camera_ready'
  | 'capture'
  | 'preview'
  | 'submit'
  | 'processing'
  | 'response'
  | 'compare'
  | 'user_confirmation'
  | 'garden_addition'
  | 'permission_denied'
  | 'camera_unavailable'
  | 'offline_error';

function classifyCameraError(error: unknown): { state: LensState; message: string } {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return {
        state: 'permission_denied',
        message: 'Camera access was blocked in your browser. Allow camera permission in browser settings, choose a photo from your library, or search by name.',
      };
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return {
        state: 'camera_unavailable',
        message: 'No camera was found on this device. Choose a photo from your library or search by plant name instead.',
      };
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return {
        state: 'camera_unavailable',
        message: 'The camera appears to be in use by another app. Close other camera apps or choose a photo instead.',
      };
    }
  }
  return {
    state: 'camera_unavailable',
    message: 'The camera could not start. Try again, choose a photo from your library, or search by name.',
  };
}

function candidateName(candidate: LensCandidate) {
  return candidate.common_name ?? candidate.scientific_name ?? candidate.original_label;
}

function useLensPreviewUrl(photo: Blob | null) {
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

export default function PeteyLens({
  catalog,
  onBack,
  onManual,
  onAdd,
  reducedMotion = false,
}: {
  catalog: GardenSpecies[];
  onBack: () => void;
  onManual: () => void;
  onAdd: (species: string) => void;
  reducedMotion?: boolean;
}) {
  const [lensState, setLensState] = useState<LensState>('idle');
  const [capability, setCapability] = useState<LensCapability | null>(null);
  const [statusRetry, setStatusRetry] = useState(0);
  const [statusFailed, setStatusFailed] = useState(false);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoSource, setPhotoSource] = useState<'camera' | 'gallery'>('gallery');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);

  const [result, setResult] = useState<LensResult | null>(null);
  const [confirmed, setConfirmed] = useState<LensCandidate | null>(null);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [orbitCommand, setOrbitCommand] = useState<{ seq: number; action: 'left' | 'right' | 'reset' }>({
    seq: 0,
    action: 'reset',
  });
  const [previewPlay, setPreviewPlay] = useState(0);

  const cameraRef = useRef<MediaStream | null>(null);
  const workRef = useRef(0);
  const scanRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeStateRef = useRef<LensState>('idle');
  const previewUrl = useLensPreviewUrl(photo);

  const stopCamera = useCallback(() => {
    cameraRef.current?.getTracks().forEach((track) => track.stop());
    cameraRef.current = null;
    setStream(null);
  }, []);

  const transitionTo = useCallback(
    (next: LensState, keepError = false) => {
      activeStateRef.current = next;
      workRef.current += 1;
      if (next !== 'camera_ready' && next !== 'requesting_permission' && next !== 'capture') {
        stopCamera();
      }
      setPreparing(false);
      if (!keepError) setError('');
      setLensState(next);
    },
    [stopCamera],
  );

  // Query backend identification capability (honest backend source of truth)
  useEffect(() => {
    const controller = new AbortController();
    const timeout = withTimeoutSignal(6_000, controller.signal);
    plantToolsApi
      .lensStatus(timeout.signal)
      .then((status) => {
        if (!controller.signal.aborted) {
          setCapability(status);
          setStatusFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatusFailed(true);
        }
      })
      .finally(() => timeout.cleanup());
    return () => {
      timeout.cleanup();
      controller.abort();
    };
  }, [statusRetry]);

  // Detect multiple video input devices for optional camera flip control
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const cameras = devices.filter((d) => d.kind === 'videoinput');
        setCanSwitchCamera(cameras.length > 1);
      })
      .catch(() => setCanSwitchCamera(false));
  }, []);

  // Guarantee camera release on background tab, pagehide, or unmount
  useEffect(() => {
    function releaseHiddenCamera() {
      if (!document.hidden) return;
      if (activeStateRef.current === 'camera_ready' || activeStateRef.current === 'requesting_permission') {
        stopCamera();
        activeStateRef.current = 'idle';
        workRef.current += 1;
        setLensState('idle');
        setError('Camera paused while Petey Plant was in the background.');
      }
    }
    window.addEventListener('pagehide', stopCamera);
    document.addEventListener('visibilitychange', releaseHiddenCamera);
    return () => {
      window.removeEventListener('pagehide', stopCamera);
      document.removeEventListener('visibilitychange', releaseHiddenCamera);
      workRef.current += 1;
      stopCamera();
      scanRef.current?.abort();
    };
  }, [stopCamera]);

  // Focus management on major stage transitions
  useEffect(() => {
    headingRef.current?.focus();
  }, [lensState]);

  // Bind MediaStream to <video> element and listen for unexpected track termination
  useEffect(() => {
    if (!stream || !videoRef.current) return;
    const node = videoRef.current;
    const track = stream.getVideoTracks()[0];
    let active = true;

    function handleInterrupted() {
      if (!active) return;
      stopCamera();
      setLensState('camera_unavailable');
      setError('The camera feed was interrupted. Reopen the camera or choose a photo instead.');
    }

    track?.addEventListener('ended', handleInterrupted);
    node.srcObject = stream;
    void node.play().catch(handleInterrupted);

    return () => {
      active = false;
      track?.removeEventListener('ended', handleInterrupted);
      node.srcObject = null;
    };
  }, [stream, stopCamera]);

  async function openCamera(requestedFacing: 'environment' | 'user' = facingMode) {
    if (capability?.status !== 'available') return;
    stopCamera();
    setPhoto(null);
    setError('');
    setFacingMode(requestedFacing);
    activeStateRef.current = 'requesting_permission';
    setLensState('requesting_permission');
    const operation = ++workRef.current;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setLensState('camera_unavailable');
      setError('Camera access requires a secure browser context (HTTPS). Choose a photo from your library instead.');
      return;
    }

    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: requestedFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (operation !== workRef.current || document.hidden) {
        opened.getTracks().forEach((track) => track.stop());
        if (operation === workRef.current) {
          setLensState('idle');
          setError('Camera closed while Petey Plant was in the background.');
        }
        return;
      }

      cameraRef.current = opened;
      setStream(opened);
      activeStateRef.current = 'camera_ready';
      setLensState('camera_ready');
    } catch (failure) {
      if (operation !== workRef.current) return;
      const classified = classifyCameraError(failure);
      activeStateRef.current = classified.state;
      setLensState(classified.state);
      setError(classified.message);
    }
  }

  async function captureFrame() {
    const node = videoRef.current;
    if (!node?.videoWidth || lensState !== 'camera_ready' || preparing) return;
    const operation = ++workRef.current;
    setPreparing(true);
    setLensState('capture');
    setError('');
    try {
      const captured = await encodeLensPhoto(node, node.videoWidth, node.videoHeight);
      if (operation !== workRef.current) return;
      stopCamera();
      setPhotoSource('camera');
      setPhoto(captured);
      activeStateRef.current = 'preview';
      setLensState('preview');
    } catch (failure) {
      if (operation === workRef.current) {
        activeStateRef.current = 'camera_ready';
        setLensState('camera_ready');
        setError(failure instanceof Error ? failure.message : 'Petey could not capture that frame. Try again.');
      }
    } finally {
      if (operation === workRef.current) setPreparing(false);
    }
  }

  async function selectLibraryPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || capability?.status !== 'available') return;
    if (activeStateRef.current === 'requesting_permission') transitionTo('idle');
    const operation = ++workRef.current;
    setPreparing(true);
    setError('');
    try {
      const prepared = await prepareLensUpload(file);
      if (operation !== workRef.current) return;
      setPhotoSource('gallery');
      setPhoto(prepared);
      transitionTo('preview');
    } catch (failure) {
      if (operation === workRef.current) {
        setError(failure instanceof Error ? failure.message : 'Petey could not open that photo. Choose a JPEG, PNG, or WebP image.');
      }
    } finally {
      if (operation === workRef.current) setPreparing(false);
    }
  }

  function refreshCapability() {
    setCapability(null);
    setStatusFailed(false);
    setStatusRetry((n) => n + 1);
  }

  async function submitForIdentification() {
    if (!photo || scanRef.current || capability?.status !== 'available') return;
    const request = new AbortController();
    scanRef.current = request;
    transitionTo('submit');
    activeStateRef.current = 'processing';
    setLensState('processing');

    const timeout = withTimeoutSignal(25_000, request.signal);
    try {
      const answer = await plantToolsApi.identify(photo, timeout.signal);
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
      transitionTo('response');
    } catch (failure) {
      if (request.signal.aborted) return;
      const isOffline =
        failure instanceof TypeError ||
        (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (isOffline) {
        setError('Petey couldn’t reach the plant identification service. Check your connection or search manually by species name.');
        transitionTo('offline_error', true);
      } else {
        setError(
          failure instanceof DOMException && failure.name === 'TimeoutError'
            ? 'Identification timed out. Try submitting the same photo again.'
            : failure instanceof Error
              ? failure.message
              : 'Identification could not be completed. Try again.',
        );
        transitionTo('preview', true);
      }
    } finally {
      timeout.cleanup();
      if (scanRef.current === request) scanRef.current = null;
    }
  }

  function cancelProcessing() {
    scanRef.current?.abort();
    scanRef.current = null;
    transitionTo('preview');
  }

  function resetToStart() {
    scanRef.current?.abort();
    scanRef.current = null;
    setPhoto(null);
    setResult(null);
    setConfirmed(null);
    transitionTo('idle');
  }

  const candidates = result?.candidates.slice(0, 3) ?? [];
  const canCompare =
    candidates.filter((candidate) => candidate.species_key && lensTraits[candidate.species_key]).length >= 2;
  const needsAnotherPhoto =
    result?.status === 'need_another_photo' || Boolean(result?.another_photo_recommended);
  const hasCandidates = result?.status !== 'unavailable' && candidates.length > 0;
  const confirmedSpecies = confirmed
    ? catalog.find((species) => species.id === confirmed.species_key) ?? null
    : null;
  const resolvedPreviewAsset = useMemo(
    () => (confirmedSpecies ? resolveSpeciesAsset(confirmedSpecies.id) : null),
    [confirmedSpecies],
  );

  const statusNotice =
    capability?.status === 'unavailable'
      ? capability.message
      : statusFailed
        ? 'Could not reach the backend identification service. Check again once the backend is running, or search manually by species name.'
        : null;

  const titles: Record<LensState, string> = {
    idle: 'Identify a plant',
    requesting_permission: 'Starting camera…',
    camera_ready: 'Frame your plant',
    capture: 'Capturing frame…',
    preview: 'Review your photo',
    submit: 'Sending photo…',
    processing: 'Checking possible matches…',
    response: hasCandidates
      ? 'Possible species matches'
      : needsAnotherPhoto
        ? 'Try a clearer photo'
        : 'Identification unavailable',
    compare: 'Compare botanical traits',
    user_confirmation: 'Confirm your companion',
    garden_addition: 'Opening plant setup…',
    permission_denied: 'Camera permission needed',
    camera_unavailable: 'Camera unavailable',
    offline_error: 'Identification offline',
  };

  const isCameraSurface =
    lensState === 'requesting_permission' ||
    lensState === 'camera_ready' ||
    lensState === 'capture';

  return (
    <section className="petey-lens-shell" aria-labelledby="lens-heading">
      <div className="petey-lens-topbar">
        <button
          type="button"
          className="petey-back-btn"
          onClick={
            lensState === 'compare' || lensState === 'user_confirmation'
              ? () => transitionTo('response')
              : lensState === 'processing'
                ? cancelProcessing
                : lensState === 'idle'
                  ? onBack
                  : resetToStart
          }
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {lensState === 'idle'
            ? 'Back'
            : lensState === 'compare' || lensState === 'user_confirmation'
              ? 'Possible matches'
              : lensState === 'processing'
                ? 'Cancel scan'
                : 'Petey Lens'}
        </button>

        <span className="petey-kicker-inline">
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          Petey Lens
        </span>
      </div>

      <header className="petey-lens-header">
        <h1 id="lens-heading" ref={headingRef} tabIndex={-1}>
          {titles[lensState]}
        </h1>
        {lensState === 'idle' && (
          <p className="petey-lens-sub">
            Take a clear photo of leaves and stems to see possible matches from Petey’s identification pipeline. Photos are sent only after you review and confirm.
          </p>
        )}
      </header>

      <input
        ref={pickerRef}
        type="file"
        accept={photoFormats.join(',')}
        onChange={(event) => void selectLibraryPhoto(event)}
        disabled={capability?.status !== 'available'}
        hidden
      />

      {error && (
        <div className="petey-alert petey-alert-error" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* IDLE / ENTRY STATE */}
      {lensState === 'idle' && (
        <div className="petey-lens-grid">
          <div className="petey-card petey-stack">
            <h2 className="petey-card-title">Capture or upload a plant photo</h2>
            <p className="petey-body-muted">
              Keep one plant centered in bright, even light so Petey’s backend model can inspect leaf shape and stem attachment.
            </p>

            {(statusNotice || !capability) && (
              <div className="petey-alert petey-alert-info" role="status">
                <p>{statusNotice ?? 'Checking identification service availability…'}</p>
                {statusNotice && (
                  <button type="button" className="petey-link-btn" onClick={refreshCapability}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Check again
                  </button>
                )}
              </div>
            )}

            {capability?.status === 'available' ? (
              <>
                <div className="petey-btn-row">
                  <button
                    type="button"
                    className="petey-btn-primary"
                    onClick={() => void openCamera('environment')}
                    disabled={preparing}
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Open camera
                  </button>
                  <button
                    type="button"
                    className="petey-btn-secondary"
                    onClick={() => pickerRef.current?.click()}
                    disabled={preparing}
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    Upload photo
                  </button>
                </div>

                <button type="button" className="petey-link-btn" onClick={onManual}>
                  Prefer to search by plant name? <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <div className="petey-btn-row">
                  <button type="button" className="petey-btn-primary" onClick={onManual}>
                    Search by plant name <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="petey-btn-secondary"
                    onClick={() => void openCamera('environment')}
                    disabled
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Open camera
                  </button>
                  <button
                    type="button"
                    className="petey-btn-secondary"
                    onClick={() => pickerRef.current?.click()}
                    disabled
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    Upload photo
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="petey-lens-tips-card" aria-label="Framing guide">
            <div className="petey-lens-frame-preview">
              <BotanicalThumbnail speciesId="Monstera deliciosa" size={112} />
              <span className="petey-lens-brackets" aria-hidden="true" />
            </div>
            <ul className="petey-tips-list">
              <li>Fill the guide with a single plant.</li>
              <li>Show both leaf shape and how stems meet the base.</li>
              <li>Avoid harsh backlight or heavy shadow across leaves.</li>
            </ul>
          </aside>
        </div>
      )}

      {/* DARK RESTRAINED CAMERA WORKSPACE */}
      {isCameraSurface && (
        <div className="petey-camera-stage">
          <div className="petey-camera-viewfinder">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label="Live camera preview"
            />
            <div className="petey-camera-reticle" aria-hidden="true">
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
            </div>
            {lensState === 'requesting_permission' && (
              <div className="petey-camera-overlay" role="status">
                Allow camera access in your browser prompt, or choose a photo from your library below.
              </div>
            )}
          </div>

          <p className="petey-camera-hint">
            Center one plant inside the corners with leaves in clear focus.
          </p>

          <div className="petey-camera-controls">
            <button
              type="button"
              className="petey-camera-secondary"
              disabled={preparing || capability?.status !== 'available'}
              onClick={() => pickerRef.current?.click()}
              aria-label="Upload photo from library"
            >
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              <span>Library</span>
            </button>

            <button
              type="button"
              className="petey-shutter-btn"
              disabled={lensState !== 'camera_ready' || preparing || capability?.status !== 'available'}
              onClick={() => void captureFrame()}
              aria-label="Capture plant photo"
            >
              <span className="petey-shutter-inner" />
            </button>

            {canSwitchCamera ? (
              <button
                type="button"
                className="petey-camera-secondary"
                disabled={preparing || capability?.status !== 'available'}
                onClick={() => void openCamera(facingMode === 'environment' ? 'user' : 'environment')}
                aria-label="Switch camera"
              >
                <SwitchCamera className="h-5 w-5" aria-hidden="true" />
                <span>Flip</span>
              </button>
            ) : (
              <button
                type="button"
                className="petey-camera-secondary"
                onClick={resetToStart}
                aria-label="Close camera"
              >
                <X className="h-5 w-5" aria-hidden="true" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* PERMISSION DENIED / CAMERA UNAVAILABLE RECOVERY */}
      {(lensState === 'permission_denied' || lensState === 'camera_unavailable') && (
        <div className="petey-card petey-stack">
          <p className="petey-body-muted">
            You can continue right away by selecting an existing plant photo or searching our species catalog by name.
          </p>
          <div className="petey-btn-row">
            <button
              type="button"
              className="petey-btn-primary"
              disabled={preparing || capability?.status !== 'available'}
              onClick={() => pickerRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              Choose a photo
            </button>
            <button
              type="button"
              className="petey-btn-secondary"
              disabled={preparing || capability?.status !== 'available'}
              onClick={() => void openCamera('environment')}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Try camera again
            </button>
          </div>
          <button type="button" className="petey-link-btn" onClick={onManual}>
            Search by plant name <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* PHOTO PREVIEW & CONFIRMATION BEFORE UPLOAD */}
      {(lensState === 'preview' || lensState === 'offline_error') && (
        <div className="petey-lens-grid">
          <div className="petey-photo-review-frame">
            {previewUrl && <img src={previewUrl} alt="Captured plant photo ready for review" />}
          </div>

          <div className="petey-card petey-stack">
            <h2 className="petey-card-title">Are the leaves sharp and centered?</h2>
            <p className="petey-body-muted">
              Petey strips file metadata before sending this copy to the backend identification model.
            </p>

            {(statusNotice || !capability) && (
              <div className="petey-alert petey-alert-info" role="status">
                <p>{statusNotice ?? 'Checking identification service availability…'}</p>
                {statusNotice && (
                  <button type="button" className="petey-link-btn" onClick={refreshCapability}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Check again
                  </button>
                )}
              </div>
            )}

            <div className="petey-btn-row">
              <button
                type="button"
                className="petey-btn-primary"
                disabled={preparing || capability?.status !== 'available'}
                onClick={() => void submitForIdentification()}
              >
                <ScanLine className="h-4 w-4" aria-hidden="true" />
                Identify plant
              </button>
              <button
                type="button"
                className="petey-btn-secondary"
                disabled={preparing || capability?.status !== 'available'}
                onClick={
                  photoSource === 'camera'
                    ? () => void openCamera(facingMode)
                    : () => pickerRef.current?.click()
                }
              >
                {photoSource === 'camera' ? 'Retake photo' : 'Choose another'}
              </button>
            </div>

            <button type="button" className="petey-link-btn" onClick={onManual}>
              Search by plant name instead <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* PROCESSING STATE */}
      {(lensState === 'submit' || lensState === 'processing') && (
        <div className="petey-card petey-stack petey-lens-narrow" role="status">
          <div className="petey-lens-processing-mark">
            <BotanicalThumbnail speciesId="Monstera deliciosa" size={88} />
          </div>
          <h2 className="petey-card-title">Checking your photo</h2>
          <p className="petey-body-muted">
            Waiting for Petey’s backend identification model to return candidate matches.
          </p>
          <button type="button" className="petey-btn-secondary" onClick={cancelProcessing}>
            <X className="h-4 w-4" aria-hidden="true" />
            Cancel and return to photo
          </button>
        </div>
      )}

      {/* CANDIDATE RESULTS (NO AUTO-CONFIRM, NO INVENTED ACCURACY) */}
      {lensState === 'response' && result && (
        <div className="petey-stack">
          {hasCandidates && (
            <>
              <p className="petey-lens-sub">
                Review leaf shape and stem habit before confirming. Petey never assumes a match without your selection.
              </p>
              <ol className="petey-candidate-grid">
                {candidates.map((candidate, index) => {
                  const species = candidate.species_key
                    ? catalog.find((item) => item.id === candidate.species_key)
                    : undefined;
                  const trait = candidate.species_key ? lensTraits[candidate.species_key] : undefined;
                  return (
                    <li className="petey-card petey-stack" key={candidate.original_label}>
                      <div className="petey-candidate-top">
                        <BotanicalThumbnail speciesId={candidate.species_key} size={56} />
                        <div>
                          <span className="petey-small-label">
                            {index === 0 ? 'Top suggestion' : `Suggestion ${index + 1}`}
                          </span>
                          <h2 className="petey-card-title">{candidateName(candidate)}</h2>
                          {candidate.scientific_name &&
                            candidate.scientific_name !== candidateName(candidate) && (
                              <p className="petey-scientific">{candidate.scientific_name}</p>
                            )}
                        </div>
                      </div>

                      {candidate.taxonomic_rank === 'genus' && (
                        <p className="petey-body-muted">
                          This backend suggestion identifies a broader plant genus rather than a single species.
                        </p>
                      )}
                      {trait && <p className="petey-body-muted">{trait.leaves}</p>}

                      {species && candidate.taxonomic_rank === 'species' && (
                        <button
                          type="button"
                          className="petey-btn-primary"
                          onClick={() => {
                            setConfirmed(candidate);
                            transitionTo('user_confirmation');
                          }}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Preview {candidateName(candidate)}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {needsAnotherPhoto && (
            <div className="petey-alert petey-alert-warning">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                The model recommends another angle showing both leaf blades and how stems join the base in even light.
              </span>
            </div>
          )}

          {result.limitations.length > 0 && (
            <div className="petey-card petey-stack">
              <h3 className="petey-small-label">Model notes & limitations</h3>
              <ul className="petey-tips-list">
                {result.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="petey-btn-row">
            {hasCandidates && canCompare && (
              <button
                type="button"
                className="petey-btn-secondary"
                onClick={() => transitionTo('compare')}
              >
                Compare leaf & stem features
              </button>
            )}
            {result.status !== 'unavailable' && (
              <button
                type="button"
                className="petey-btn-secondary"
                onClick={() => void openCamera('environment')}
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Take another photo
              </button>
            )}
            <button type="button" className="petey-link-btn" onClick={onManual}>
              Search by plant name <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* SIDE-BY-SIDE TRAIT COMPARISON */}
      {lensState === 'compare' && (
        <div className="petey-candidate-grid">
          {candidates.map((candidate) => {
            const trait = candidate.species_key ? lensTraits[candidate.species_key] : undefined;
            return (
              <section key={candidate.original_label} className="petey-card petey-stack">
                <h2 className="petey-card-title">{candidateName(candidate)}</h2>
                {trait ? (
                  <>
                    <dl className="petey-trait-dl">
                      <div>
                        <dt>Leaves</dt>
                        <dd>{trait.leaves}</dd>
                      </div>
                      <div>
                        <dt>Growth habit</dt>
                        <dd>{trait.habit}</dd>
                      </div>
                    </dl>
                    <a
                      className="petey-link-btn"
                      target="_blank"
                      rel="noreferrer"
                      href={trait.source}
                    >
                      NC State Extension reference
                    </a>
                  </>
                ) : (
                  <p className="petey-body-muted">No side-by-side leaf comparison notes available for this entry.</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* USER CONFIRMATION WITH INTERACTIVE 3D VIRTUAL COMPANION PREVIEW */}
      {lensState === 'user_confirmation' && confirmedSpecies && (
        <section className="petey-card petey-confirm-grid" aria-label="Virtual plant companion preview">
          <div className="petey-confirm-stage-box">
            <div className="petey-confirm-3d">
              <InteractivePlantStage
                speciesId={confirmedSpecies.id}
                mood="happy"
                animationState="greeting"
                theme={WEATHER_THEMES['clear-day']}
                windKmh={4}
                playCount={previewPlay}
                reactionKind="pet"
                reduced={reducedMotion}
                onPet={() => setPreviewPlay((c) => c + 1)}
                orbitCommand={orbitCommand}
                showAtmosphere={false}
              />
            </div>

            <div className="petey-orbit-bar" role="group" aria-label="3D preview camera controls">
              <button
                type="button"
                className="petey-orbit-btn"
                onClick={() => setOrbitCommand((prev) => ({ seq: prev.seq + 1, action: 'left' }))}
                aria-label="Rotate companion left"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="petey-orbit-btn"
                onClick={() => setOrbitCommand((prev) => ({ seq: prev.seq + 1, action: 'reset' }))}
              >
                Reset view
              </button>
              <button
                type="button"
                className="petey-orbit-btn"
                onClick={() => setOrbitCommand((prev) => ({ seq: prev.seq + 1, action: 'right' }))}
                aria-label="Rotate companion right"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="petey-stack">
            <span className="petey-small-label">Selected species</span>
            <h2 className="petey-confirm-title">{confirmedSpecies.name}</h2>
            <p className="petey-scientific">{confirmed?.scientific_name ?? confirmedSpecies.id}</p>

            <div className="petey-btn-row">
              <button
                type="button"
                className="petey-btn-primary"
                onClick={() => {
                  transitionTo('garden_addition');
                  onAdd(confirmedSpecies.id);
                }}
              >
                Add to my garden <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="petey-btn-secondary"
                onClick={() => transitionTo('response')}
              >
                Choose another match
              </button>
            </div>

            {resolvedPreviewAsset && (
              <p className="petey-body-muted">{resolvedPreviewAsset.entry.botanicalSilhouetteNote}</p>
            )}

            <p className="petey-companion-disclaimer">
              This stylized 3D companion shows the species you selected. Plants of the same species share this design.
            </p>
          </div>
        </section>
      )}
    </section>
  );
}
