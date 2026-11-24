import { Component, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PalCharacterModel, type PalMood } from './PalCharacter';
import type { WeatherAtmosphereTheme } from '../../lib/weatherService';
import {
  resolveSpeciesAsset,
  type CompanionAnimationId,
  type SpeciesAssetManifestEntry,
} from '../../lib/three/speciesAssetRegistry';
import { disposeObject3D, loadSpeciesGltf, type LoadedGltfAsset } from '../../lib/three/assetLoader';
import { BotanicalThumbnail } from '../../lib/three/BotanicalThumbnails';
import type { PosturePreset } from '../../lib/care/conditionRegistry';

const _dummy = new THREE.Object3D();
const _targetFogColor = new THREE.Color();

// Detect software WebGL once (adjusts pixel ratio & shadows without removing scene fidelity)
const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

class StageErrorGuard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SceneAtmosphereRig({ theme, enableFog }: { theme: WeatherAtmosphereTheme; enableFog: boolean }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      envTarget.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    if (!enableFog) {
      scene.fog = null;
      return;
    }
    _targetFogColor.set(theme.fogColor);
    scene.fog = new THREE.FogExp2(_targetFogColor.getHex(), theme.fogDensity);
    return () => {
      scene.fog = null;
    };
  }, [scene, theme.fogColor, theme.fogDensity, enableFog]);

  return null;
}

/**
 * Loads an authored GLB model from the species asset registry when `modelUrl` is set,
 * with automatic GPU disposal and seamless fallback to our bespoke procedural flagship rig.
 */
function SpeciesCompanionNode({
  entry,
  mood,
  animationState,
  posturePreset,
  playCount,
  reduced,
  windKmh,
  castShadow,
  onPet,
}: {
  entry: SpeciesAssetManifestEntry;
  mood: PalMood;
  animationState: CompanionAnimationId;
  posturePreset?: PosturePreset;
  playCount: number;
  reduced: boolean;
  windKmh: number;
  castShadow: boolean;
  onPet?: () => void;
}) {
  const [loadedGltf, setLoadedGltf] = useState<LoadedGltfAsset | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    let active = true;
    if (!entry.modelUrl) {
      setLoadedGltf(null);
      return;
    }
    void loadSpeciesGltf(entry.modelUrl).then((asset) => {
      if (!active) {
        if (asset) disposeObject3D(asset.scene);
        return;
      }
      setLoadedGltf(asset);
    });
    return () => {
      active = false;
    };
  }, [entry.modelUrl]);

  useEffect(() => {
    if (!loadedGltf) return;
    if (loadedGltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(loadedGltf.scene);
      const clip =
        loadedGltf.animations.find((a) => a.name.toLowerCase().includes(animationState)) ??
        loadedGltf.animations[0];
      if (clip) mixer.clipAction(clip).play();
      mixerRef.current = mixer;
    }
    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      disposeObject3D(loadedGltf.scene);
    };
  }, [loadedGltf, animationState]);

  useFrame((_, delta) => {
    if (!reduced && mixerRef.current) {
      mixerRef.current.update(Math.min(delta, 0.08));
    }
  });

  if (loadedGltf) {
    return (
      <primitive
        object={loadedGltf.scene}
        position={entry.pivotOffset}
        scale={entry.scale}
        rotation={entry.rotation}
        onClick={(e: { stopPropagation: () => void }) => {
          if (!onPet) return;
          e.stopPropagation();
          onPet();
        }}
      />
    );
  }

  return (
    <PalCharacterModel
      variant={entry.proceduralVariantIndex}
      mood={mood}
      animationState={animationState}
      posturePreset={posturePreset}
      play={playCount}
      reduced={reduced}
      windKmh={windKmh}
      castShadow={castShadow}
      onPet={onPet}
    />
  );
}

/**
 * Understated botanical saucer mat + soft contact shadow so the living plant
 * remains the unmistakable hero without bulky pedestal geometry or pebble clutter.
 */
function BotanicalPedestal({ theme, castShadow }: { theme: WeatherAtmosphereTheme; castShadow: boolean }) {
  return (
    <group position={[0, 0, 0]}>
      {/* Soft radial contact shadow directly beneath the ceramic pot */}
      <mesh position={[0, -0.84, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <circleGeometry args={[0.66, 48]} />
        <meshBasicMaterial color="#182018" transparent opacity={0.24} depthWrite={false} />
      </mesh>
      {/* Subtle thin stoneware saucer coaster */}
      <mesh position={[0, -0.885, 0]} receiveShadow={castShadow}>
        <cylinderGeometry args={[0.78, 0.84, 0.07, 48]} />
        <meshStandardMaterial color={theme.pedestalColor} roughness={0.9} metalness={0.01} />
      </mesh>
      <mesh position={[0, -0.85, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow={castShadow}>
        <torusGeometry args={[0.77, 0.022, 10, 48]} />
        <meshStandardMaterial color={theme.pedestalAccent} roughness={0.85} metalness={0.01} />
      </mesh>
    </group>
  );
}

/**
 * GPU-instanced weather precipitation synced to real outdoor weather (rain/snow/mist only;
 * omits distracting decorative fireflies or floating pollen sparkles).
 */
function WeatherParticles({
  mode,
  windKmh,
  reduced,
}: {
  mode: WeatherAtmosphereTheme['particles'];
  windKmh: number;
  reduced: boolean;
}) {
  const count =
    mode === 'rain' ? 56 : mode === 'storm-rain' ? 84 : mode === 'snow' ? 46 : mode === 'mist' ? 12 : 0;
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const seeds = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => {
        const a = (i * 1.6180339) % 1;
        const b = (i * 2.7182818) % 1;
        const c = (i * 3.1415926) % 1;
        return {
          x: (a - 0.5) * 8.5,
          y: (b - 0.35) * 6.0,
          z: (c - 0.5) * 5.0 - 0.3,
          speed: 0.7 + ((i * 17) % 10) * 0.08,
          phase: i * 0.73,
          size: 0.65 + ((i * 13) % 8) * 0.1,
        };
      }),
    [],
  );

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    const t = reduced ? 0.5 : clock.elapsedTime;
    const windDrift = THREE.MathUtils.clamp(windKmh / 30, 0.15, 1.5);

    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      if (mode === 'rain' || mode === 'storm-rain') {
        const fallSpeed = (mode === 'storm-rain' ? 7.0 : 5.0) * s.speed;
        const y = 3.2 - ((t * fallSpeed + s.phase * 3.1) % 5.4);
        const slant = (mode === 'storm-rain' ? 0.28 : 0.12) * windDrift;
        const x = ((s.x + (3.2 - y) * slant + 4.5) % 9) - 4.5;
        _dummy.position.set(x, y, s.z);
        _dummy.rotation.set(0, 0, slant);
        _dummy.scale.set(0.012, mode === 'storm-rain' ? 0.36 : 0.26, 0.012);
      } else if (mode === 'snow') {
        const y = 3.1 - ((t * 0.75 * s.speed + s.phase * 2.3) % 5.0);
        const x = s.x + Math.sin(t * 0.9 + s.phase) * 0.45 * windDrift;
        _dummy.position.set(x, y, s.z);
        _dummy.rotation.set(t + s.phase, t * 0.6, 0);
        const r = 0.03 * s.size;
        _dummy.scale.set(r, r, r);
      } else if (mode === 'fireflies') {
        const angle = t * 0.35 * s.speed + s.phase;
        const radius = 1.35 + (i % 5) * 0.42;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius * 0.8;
        const y = -0.35 + Math.sin(t * 1.1 + s.phase * 2) * 0.9 + (i % 4) * 0.42;
        const pulse = 0.65 + 0.45 * Math.sin(t * 2.4 + s.phase * 3);
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0, 0, 0);
        const r = 0.025 * s.size * pulse;
        _dummy.scale.set(r, r, r);
      } else if (mode === 'mist') {
        const x = ((s.x + t * 0.25 * s.speed + 5.5) % 11) - 5.5;
        const y = -0.45 + (i % 4) * 0.55 + Math.sin(t * 0.4 + s.phase) * 0.15;
        _dummy.position.set(x, y, s.z - 0.8);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0.95 * s.size, 0.22 * s.size, 0.35);
      } else {
        const y = -0.9 + ((t * 0.2 * s.speed + s.phase * 1.7) % 3.8);
        const x = s.x * 0.7 + Math.sin(t * 0.7 + s.phase) * 0.35;
        _dummy.position.set(x, y, s.z * 0.75);
        _dummy.rotation.set(0, 0, 0);
        const r = 0.02 * s.size;
        _dummy.scale.set(r, r, r);
      }
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  const isRain = mode === 'rain' || mode === 'storm-rain';
  const color =
    isRain ? '#c8e9ff' : mode === 'snow' ? '#ffffff' : mode === 'fireflies' ? '#ffe27a' : mode === 'mist' ? '#edf5f1' : '#fff2bd';
  const opacity = isRain ? 0.55 : mode === 'snow' ? 0.8 : mode === 'fireflies' ? 0.88 : mode === 'mist' ? 0.15 : 0.52;

  return (
    <instancedMesh key={mode} ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      {isRain ? <boxGeometry args={[1, 1, 1]} /> : <sphereGeometry args={[1, 8, 8]} />}
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  );
}

/**
 * Watering droplet feedback burst (only triggered on care acknowledgement).
 */
function WateringBurst({ trigger, kind, reduced }: { trigger: number; kind: 'pet' | 'water'; reduced: boolean }) {
  const count = 18;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastTrigger = useRef(trigger);
  const startTime = useRef(-10);

  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const theta = (i / count) * Math.PI * 2 + (i % 3) * 0.25;
        return {
          theta,
          radius: 0.45 + (i % 4) * 0.15,
          speed: 0.9 + (i % 4) * 0.2,
          offset: (i % 6) * 0.05,
        };
      }),
    [],
  );

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (trigger !== lastTrigger.current) {
      lastTrigger.current = trigger;
      startTime.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - startTime.current;
    const duration = 1.3;
    if (reduced || kind !== 'water' || elapsed < 0 || elapsed > duration) {
      for (let i = 0; i < count; i++) {
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const localT = Math.max(0, elapsed - p.offset);
      const progress = Math.min(1, localT / (duration - 0.25));
      const fade = Math.sin(progress * Math.PI);
      const y = 2.0 - progress * 2.05;
      const r = p.radius * (1.1 - progress * 0.62);
      _dummy.position.set(Math.cos(p.theta) * r, y, Math.sin(p.theta) * r);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(0.032 * fade, 0.06 * fade, 0.032 * fade);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial color="#67C9F2" transparent opacity={0.86} depthWrite={false} />
    </instancedMesh>
  );
}

/**
 * OrbitControls wrapper exposing programmatic keyboard/button rotation & reset view.
 */
function StageCameraControls({
  preset,
  orbitCommand,
}: {
  preset: SpeciesAssetManifestEntry['cameraPreset'];
  orbitCommand: { seq: number; action: 'left' | 'right' | 'reset' };
}) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null);
  const { camera, size, invalidate } = useThree();
  const lastSeq = useRef(orbitCommand.seq);

  // Reframe gracefully when species preset or viewport aspect changes (portrait mobile needs slight zoom-out)
  useEffect(() => {
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const portraitScale = aspect < 0.92 ? Math.min(1.22, 0.92 / Math.max(0.62, aspect)) : 1;
    const targetY = preset.target[1] - (aspect < 0.92 ? 0.08 : 0);

    camera.position.set(
      preset.position[0],
      preset.position[1] * (aspect < 0.92 ? 1.04 : 1),
      preset.position[2] * portraitScale,
    );
    if ('fov' in camera && typeof camera.fov === 'number') {
      camera.fov = preset.fov;
      camera.updateProjectionMatrix();
    }
    const ctrl = controlsRef.current;
    if (ctrl) {
      ctrl.target.set(preset.target[0], targetY, preset.target[2]);
      ctrl.update();
    } else {
      camera.lookAt(preset.target[0], targetY, preset.target[2]);
    }
    invalidate();
  }, [preset, size.width, size.height, camera, invalidate]);

  useEffect(() => {
    if (orbitCommand.seq === lastSeq.current) return;
    lastSeq.current = orbitCommand.seq;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    if (orbitCommand.action === 'reset') {
      const aspect = size.height > 0 ? size.width / size.height : 1;
      const portraitScale = aspect < 0.92 ? Math.min(1.22, 0.92 / Math.max(0.62, aspect)) : 1;
      camera.position.set(preset.position[0], preset.position[1], preset.position[2] * portraitScale);
      ctrl.target.set(...preset.target);
      ctrl.update();
      invalidate();
      return;
    }

    const deltaAngle = orbitCommand.action === 'left' ? -Math.PI / 5 : Math.PI / 5;
    const offset = camera.position.clone().sub(ctrl.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaAngle);
    camera.position.copy(ctrl.target).add(offset);
    ctrl.update();
    invalidate();
  }, [orbitCommand, camera, preset, size.width, size.height, invalidate]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={preset.target}
      enablePan={false}
      enableZoom={false}
      enableDamping={!isSoftwareGl}
      dampingFactor={0.07}
      rotateSpeed={0.72}
      minPolarAngle={preset.minPolarAngle}
      maxPolarAngle={preset.maxPolarAngle}
    />
  );
}

export interface InteractivePlantStageProps {
  speciesId: string | null | undefined;
  mood: PalMood;
  animationState?: CompanionAnimationId;
  posturePreset?: PosturePreset;
  theme: WeatherAtmosphereTheme;
  windKmh: number;
  playCount: number;
  reactionKind: 'pet' | 'water';
  reduced: boolean;
  onPet?: () => void;
  /** Optional command counter for keyboard/button rotation & reset-view accessibility */
  orbitCommand?: { seq: number; action: 'left' | 'right' | 'reset' };
  /** Show atmospheric weather particles & fog (true on Home weather world, false on neutral confirmation previews) */
  showAtmosphere?: boolean;
  /** Accessible 2D static botanical fallback mode (allows essential care without WebGL) */
  disable3D?: boolean;
  /** Accessible caption for screen readers and 2D fallback */
  statusAccessibleLabel?: string;
}

export function InteractivePlantStage({
  speciesId,
  mood,
  animationState = 'idle',
  posturePreset = 'upright_relaxed',
  theme,
  windKmh,
  playCount,
  reactionKind,
  reduced,
  onPet,
  orbitCommand = { seq: 0, action: 'reset' },
  showAtmosphere = true,
  disable3D = false,
  statusAccessibleLabel,
}: InteractivePlantStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglReady, setWebglReady] = useState(false);
  const [inViewport, setInViewport] = useState(true);
  const [tabVisible, setTabVisible] = useState(
    () => (typeof document === 'undefined' ? true : !document.hidden),
  );

  const { entry } = useMemo(() => resolveSpeciesAsset(speciesId), [speciesId]);

  useEffect(() => {
    setWebglReady(typeof WebGL2RenderingContext !== 'undefined');
  }, []);

  // Pause rendering when scrolled off-screen
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entryObs]) => setInViewport(entryObs.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Pause rendering when browser tab is hidden
  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const isRenderingActive = inViewport && tabVisible && !reduced;

  const fallback = (
    <div
      className="stage-fallback"
      role="img"
      aria-label={statusAccessibleLabel ? `${entry.commonName} — ${statusAccessibleLabel}` : `${entry.commonName} companion illustration`}
    >
      <div className="stage-fallback-card">
        <BotanicalThumbnail speciesId={entry.speciesId} size={156} />
        {statusAccessibleLabel && <span className="stage-fallback-caption">{statusAccessibleLabel}</span>}
      </div>
    </div>
  );

  if (disable3D || !webglReady) return <div ref={containerRef} className="stage-canvas-wrap">{fallback}</div>;

  return (
    <div ref={containerRef} className="stage-canvas-wrap">
      <StageErrorGuard fallback={fallback}>
        <Canvas
          frameloop={isRenderingActive ? 'always' : 'demand'}
          shadows={!isSoftwareGl}
          dpr={isSoftwareGl ? 1 : [1, 2]}
          camera={{ position: entry.cameraPreset.position, fov: entry.cameraPreset.fov }}
          gl={{
            alpha: true,
            antialias: !isSoftwareGl,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.06,
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.setClearColor(0x000000, 0);
            gl.domElement.dataset.stageRenderer = 'ready';
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setWebglReady(false);
            });
            gl.domElement.addEventListener('webglcontextrestored', () => {
              setWebglReady(true);
            });
          }}
        >
          <SceneAtmosphereRig theme={theme} enableFog={showAtmosphere} />

          <ambientLight color={theme.ambientColor} intensity={theme.ambientIntensity} />
          <hemisphereLight
            args={[theme.hemiSky, theme.hemiGround, theme.hemiIntensity]}
            position={[0, 12, 0]}
          />
          <directionalLight
            position={theme.keyPosition}
            color={theme.keyColor}
            intensity={theme.keyIntensity}
            castShadow={!isSoftwareGl}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-near={0.5}
            shadow-camera-far={18}
            shadow-camera-left={-2.8}
            shadow-camera-right={2.8}
            shadow-camera-top={2.8}
            shadow-camera-bottom={-2.8}
            shadow-bias={-0.0005}
            shadow-normalBias={0.02}
          />
          <directionalLight
            position={[3.6, 2.2, -3.5]}
            color={theme.rimColor}
            intensity={theme.rimIntensity}
          />

          <group position={[0, 0.14, 0]}>
            <BotanicalPedestal theme={theme} castShadow={!isSoftwareGl} />
            <SpeciesCompanionNode
              entry={entry}
              mood={mood}
              animationState={animationState}
              posturePreset={posturePreset}
              playCount={playCount}
              reduced={reduced}
              windKmh={windKmh}
              castShadow={!isSoftwareGl}
              onPet={onPet}
            />
            <WateringBurst trigger={playCount} kind={reactionKind} reduced={reduced} />
          </group>

          {showAtmosphere && (
            <WeatherParticles mode={theme.particles} windKmh={windKmh} reduced={reduced} />
          )}

          <StageCameraControls preset={entry.cameraPreset} orbitCommand={orbitCommand} />
        </Canvas>
      </StageErrorGuard>
    </div>
  );
}
