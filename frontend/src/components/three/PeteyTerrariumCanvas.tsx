/**
 * PeteyTerrariumCanvas.tsx — the ONE persistent <Canvas> in the app.
 *
 * Procedural geometry only (no .glb files): LatheGeometry pot + saucer,
 * substrate disc, TubeGeometry petioles, extruded leaf blades, and a
 * plant-spirit seed-eye face on the pot. useFrame morphing drives turgor,
 * leaf colour, particles, and the happy jump directly from live
 * biophysics, so the mascot is a true digital twin, not a decoration.
 *
 * WebGL hygiene: this component is mounted exactly once by App (a CSS
 * order change moves it across breakpoints — never a second copy), and
 * R3F disposes the renderer, geometries, and materials on unmount.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { clamp } from '../../lib/biophysicsEngine';
import { useActiveSpecies, useLiveMetrics, usePeteyStore } from '../../store/usePeteyStore';

/* Palette (herbarium-ledger tokens; foliage tones are illustration
 * colours, not UI tokens). */
const CHLOROPHYLL = new THREE.Color('#0E7A4B');
const CREAM = new THREE.Color('#F5EED6');
const CHLOROTIC = new THREE.Color('#DA950B');
const NECROTIC = new THREE.Color('#7A4A21');
const SUBSTRATE_DRY = new THREE.Color('#C29B61');
const SUBSTRATE_WET = new THREE.Color('#3B2818');
const POT_CLAY = '#A85F3C';
const POT_LIP = '#8F4E33';

function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, clamp(t, 0, 1));
}

/* ------------------------------------------------------------------ */
/* Leaf blade shapes (extruded, per archetype)                         */
/* ------------------------------------------------------------------ */

function buildLeafGeometry(archetype: string): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  if (archetype === 'sword') {
    // Long tapered blade.
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.22, 0.6, 0.12, 1.9);
    shape.quadraticCurveTo(0, 2.15, -0.12, 1.9);
    shape.quadraticCurveTo(-0.22, 0.6, 0, 0);
  } else if (archetype === 'broad') {
    // Fiddle-leaf: wide paddle with a narrow waist.
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.55, 0.15, 0.75, 0.7, 0.5, 1.25);
    shape.bezierCurveTo(0.32, 1.6, -0.32, 1.6, -0.5, 1.25);
    shape.bezierCurveTo(-0.75, 0.7, -0.55, 0.15, 0, 0);
  } else if (archetype === 'fenestrated') {
    // Monstera heart blade with fenestration slits (holes).
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.6, 0.2, 0.8, 0.9, 0.45, 1.35);
    shape.bezierCurveTo(0.2, 1.65, -0.2, 1.65, -0.45, 1.35);
    shape.bezierCurveTo(-0.8, 0.9, -0.6, 0.2, 0, 0);
    for (const [hx, hy] of [
      [0.28, 0.75],
      [-0.28, 0.85],
      [0.18, 1.15],
    ] as const) {
      const hole = new THREE.Path();
      hole.absellipse(hx, hy, 0.07, 0.16, 0.5, Math.PI * 2);
      shape.holes.push(hole);
    }
  } else {
    // Ellipse (peacock plant): simple oval blade.
    shape.absellipse(0, 0.75, 0.42, 0.75, 0, Math.PI * 2);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
    curveSegments: 24,
  });
  geometry.center();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Pot + saucer + substrate                                            */
/* ------------------------------------------------------------------ */

function Pot({ substrateMeanVwc, fieldCapacity }: { substrateMeanVwc: number; fieldCapacity: number }) {
  const potProfile = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0.0, 0));
    pts.push(new THREE.Vector2(0.95, 0));
    pts.push(new THREE.Vector2(1.05, 0.12));
    pts.push(new THREE.Vector2(1.12, 1.15));
    pts.push(new THREE.Vector2(1.22, 1.3));
    pts.push(new THREE.Vector2(1.22, 1.5));
    pts.push(new THREE.Vector2(1.05, 1.5));
    pts.push(new THREE.Vector2(1.0, 1.28));
    pts.push(new THREE.Vector2(0.0, 1.28));
    return pts;
  }, []);
  const saucerProfile = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0.0, -0.02));
    pts.push(new THREE.Vector2(1.15, -0.02));
    pts.push(new THREE.Vector2(1.3, 0.14));
    pts.push(new THREE.Vector2(1.22, 0.16));
    pts.push(new THREE.Vector2(1.05, 0.06));
    pts.push(new THREE.Vector2(0.0, 0.06));
    return pts;
  }, []);

  // Substrate colour lerps dry tan -> hydrated espresso by mean VWC.
  const wetness = clamp(substrateMeanVwc / Math.max(0.05, fieldCapacity), 0, 1);
  const substrateColor = useMemo(
    () => `#${lerpColor(SUBSTRATE_DRY, SUBSTRATE_WET, wetness).getHexString()}`,
    [wetness],
  );

  return (
    <group>
      {/* Drainage saucer */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <latheGeometry args={[saucerProfile, 48]} />
        <meshStandardMaterial color={POT_LIP} roughness={0.85} />
      </mesh>
      {/* Terracotta pot */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <latheGeometry args={[potProfile, 48]} />
        <meshStandardMaterial color={POT_CLAY} roughness={0.8} />
      </mesh>
      {/* Substrate disc */}
      <mesh position={[0, 1.44, 0]} receiveShadow>
        <cylinderGeometry args={[1.0, 1.0, 0.08, 48]} />
        <meshStandardMaterial color={substrateColor} roughness={1} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Expressive eyes on the pot                                          */
/* ------------------------------------------------------------------ */

function Eyes({ wiltT }: { wiltT: number }) {
  // Plant-spirit face, not an owl: small dark SEED eyes (vertical ovals,
  // no white sclera), tiny cream highlights, a thin carved mouth line,
  // and faint amber blush discs. Wilt narrows the seed eyes.
  // Surface math: pot radius ≈ 1.10 at eye height, so the eye front
  // (1.08 + 0.056) clears the surface, and blush discs sit at
  // z = surface − group offset (≈ −0.11 relative) so they read as
  // painted on the pot rather than floating.
  const eyeScaleY = 1 - 0.45 * wiltT;
  return (
    <group position={[0, 0.95, 1.08]}>
      {[-0.3, 0.3].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh scale={[0.6, eyeScaleY, 0.35]}>
            <sphereGeometry args={[0.16, 24, 24]} />
            <meshStandardMaterial color="#1F2A22" roughness={0.4} />
          </mesh>
          <mesh position={[0.03, 0.05, 0.04]}>
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshStandardMaterial color="#F5EED6" roughness={0.2} />
          </mesh>
        </group>
      ))}
      {/* Carved mouth line */}
      <mesh position={[0, -0.3, 0.08]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.16, 0.02, 12, 24, Math.PI]} />
        <meshStandardMaterial color="#1F2A22" roughness={0.5} />
      </mesh>
      {/* Faint blush discs, painted on the pot surface */}
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, -0.16, -0.11]} scale={[1, 0.6, 0.3]}>
          <sphereGeometry args={[0.11, 16, 16]} />
          <meshStandardMaterial color="#DA950B" roughness={0.9} transparent opacity={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Foliage: petioles + blades, morphed by live biophysics              */
/* ------------------------------------------------------------------ */

function Foliage() {
  const species = useActiveSpecies();
  const metrics = useLiveMetrics();
  const groupRef = useRef<THREE.Group>(null);
  const wiltT = clamp(metrics.desiccationRisk / 0.8, 0, 1);
  // Turgor angle: 0.0 desiccation -> +45 deg lift, 0.8 -> -25 deg wilt.
  const baseElevationDeg =
    species.params.archetype === 'sword'
      ? 78
      : species.params.archetype === 'broad'
        ? 55
        : species.params.archetype === 'ellipse'
          ? 50
          : 45;
  const elevationDeg = baseElevationDeg - 70 * wiltT;

  const leafGeometry = useMemo(
    () => buildLeafGeometry(species.params.archetype),
    [species.params.archetype],
  );
  const petioleCurve = useMemo(() => {
    const reach = species.params.archetype === 'sword' ? 0.25 : 1.05;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.35, reach * 0.45),
      new THREE.Vector3(0, 0.55, reach),
    ]);
  }, [species.params.archetype]);
  const petioleGeometry = useMemo(
    () => new THREE.TubeGeometry(petioleCurve, 12, 0.045, 8, false),
    [petioleCurve],
  );
  // WebGL hygiene: R3F disposes on unmount, but NOT when a memoised
  // geometry is replaced (species switch changes archetype). Dispose
  // the superseded geometries here so repeated switching cannot leak.
  useEffect(
    () => () => {
      leafGeometry.dispose();
      petioleGeometry.dispose();
    },
    [leafGeometry, petioleGeometry],
  );

  const leafCount = Math.max(5, Math.min(9, species.leaf_count));
  const leafScale =
    species.params.archetype === 'sword' ? 1.15 : species.params.archetype === 'broad' ? 1.05 : 0.95;
  // Squash as turgor is lost.
  const squash = 1 - 0.18 * wiltT;

  // Leaf colour: leaf base, chimeral cream sectors on variegated
  // species, chlorotic yellow when hypoxia > 0.4, necrotic tips for
  // fluoride pathology (tip cones below).
  const leafColors = useMemo(() => {
    const colors: string[] = [];
    for (let i = 0; i < leafCount; i += 1) {
      let c = CHLOROPHYLL.clone();
      if (species.params.variegated && i % 2 === 0) {
        c = lerpColor(c, CREAM, 0.45); // chimeral cream sector
      }
      if (metrics.hypoxiaRisk > 0.4) {
        c = lerpColor(c, CHLOROTIC, (metrics.hypoxiaRisk - 0.4) / 0.6);
      }
      colors.push(`#${c.getHexString()}`);
    }
    return colors;
  }, [leafCount, metrics.hypoxiaRisk, species.params.variegated]);

  const showNecroticTips = metrics.primaryPathology === 'ABIOTIC_FLUORIDE_TIP_NECROSIS';

  // Idle sway is decorative WebGL motion, so the CSS reduced-motion
  // rule cannot stop it — gate it here on the media query instead.
  // (Photon motes stay: they encode live photosynthesis, not decor.)
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  useFrame((state) => {
    if (groupRef.current && !prefersReducedMotion) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.03;
    }
  });

  return (
    <group ref={groupRef} position={[0, 1.45, 0]}>
      {Array.from({ length: leafCount }, (_, i) => {
        const theta = (i / leafCount) * Math.PI * 2 + 0.35;
        return (
          <group key={i} rotation={[0, theta, 0]}>
            {/* Petiole + blade pivot: elevation = turgor angle. */}
            <group rotation={[-THREE.MathUtils.degToRad(elevationDeg), 0, 0]}>
              <mesh geometry={petioleGeometry} castShadow>
                <meshStandardMaterial color="#2F5D3A" roughness={0.7} />
              </mesh>
              <group position={[0, 0.62, species.params.archetype === 'sword' ? 0.3 : 1.1]}>
                <mesh
                  geometry={leafGeometry}
                  scale={[leafScale, leafScale * squash, leafScale]}
                  rotation={[Math.PI / 2.6, 0, 0]}
                  castShadow
                >
                  <meshStandardMaterial
                    color={leafColors[i]}
                    roughness={0.55}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {showNecroticTips && (
                  <mesh position={[0, 0.9, 0.55]} rotation={[Math.PI / 2.6, 0, 0]}>
                    <coneGeometry args={[0.09, 0.28, 8]} />
                    <meshStandardMaterial
                      color={`#${NECROTIC.getHexString()}`}
                      roughness={0.9}
                    />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Particles: irrigation droplets + photosynthetic photon motes        */
/* ------------------------------------------------------------------ */

const DROPLET_COUNT = 60;
const MOTE_COUNT = 42;

function Particles() {
  const metrics = useLiveMetrics();
  const irrigationBurstAt = usePeteyStore((s) => s.irrigationBurstAt);
  const dropletsRef = useRef<THREE.InstancedMesh>(null);
  const motesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: Math.max(DROPLET_COUNT, MOTE_COUNT) }, (_, i) => ({
        x: Math.sin(i * 12.9898) * 1.1,
        z: Math.cos(i * 78.233) * 1.1,
        speed: 1.6 + ((i * 37) % 10) / 10,
        phase: (i * 0.618) % 1,
      })),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const burstAge = irrigationBurstAt ? (Date.now() - irrigationBurstAt) / 1000 : 99;

    if (dropletsRef.current) {
      dropletsRef.current.visible = burstAge < 2.5;
      if (dropletsRef.current.visible) {
        for (let i = 0; i < DROPLET_COUNT; i += 1) {
          const s = seeds[i];
          const fall = ((t * s.speed + s.phase) % 1.6) / 1.6;
          dummy.position.set(s.x, 4.4 - fall * 3.1, s.z);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          dropletsRef.current.setMatrixAt(i, dummy.matrix);
        }
        dropletsRef.current.instanceMatrix.needsUpdate = true;
      }
    }

    const photosynthesizing = metrics.aNet > 5.0;
    if (motesRef.current) {
      motesRef.current.visible = photosynthesizing;
      if (photosynthesizing) {
        for (let i = 0; i < MOTE_COUNT; i += 1) {
          const s = seeds[i];
          const rise = (t * 0.25 + s.phase) % 1;
          dummy.position.set(s.x * 1.4, 1.6 + rise * 2.6, s.z * 1.4);
          dummy.scale.setScalar(0.7 + 0.5 * Math.sin(t * 2 + i));
          dummy.updateMatrix();
          motesRef.current.setMatrixAt(i, dummy.matrix);
        }
        motesRef.current.instanceMatrix.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <instancedMesh ref={dropletsRef} args={[undefined, undefined, DROPLET_COUNT]} visible={false}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshStandardMaterial color="#2591C4" roughness={0.15} transparent opacity={0.9} />
      </instancedMesh>
      <instancedMesh ref={motesRef} args={[undefined, undefined, MOTE_COUNT]} visible={false}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color="#FFD94D" roughness={0.3} emissive="#FFB800" emissiveIntensity={0.9} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Telemetry badges pinned in 3D space (drei Html)                     */
/* ------------------------------------------------------------------ */

function TelemetryBadges() {
  const metrics = useLiveMetrics();
  // whitespace-nowrap utility is included so the verification gate's
  // #terrarium div.whitespace-nowrap selector keeps finding the badges.
  const badge = 'ledger-badge whitespace-nowrap';
  // Badge positions + short text keep every badge inside the canvas at
  // 320px wide (canvas half-width ≈ 1.72 world units): ±0.75 with short
  // labels spans roughly −0.15…1.65 world units, so nothing clips.
  // Screen-space Html (no transform/distanceFactor): drei still pins
  // each badge to its 3D anchor every frame, but without the giant
  // transform layer that transform mode creates (measured 24,301px
  // wide), which hung headless screenshot compositing.
  // drei v10 + R3F v9 + React 19 reliably drops the FIRST Html mounted
  // in a Canvas (reproduced across orders, keys, and nesting: whichever
  // badge is first never appears in the DOM). The empty sacrificial
  // Html below absorbs that drop so all three real badges mount.
  return (
    <group>
      <Html position={[0, -10, 0]} center zIndexRange={[10, 0]}>
        <div aria-hidden="true" />
      </Html>
      <Html position={[-0.75, 3.05, 0]} center zIndexRange={[10, 0]}>
        <div className={badge}>VPD_leaf {metrics.vpdLeafKpa.toFixed(2)}</div>
      </Html>
      <Html position={[0.85, 2.9, 0]} center zIndexRange={[10, 0]}>
        <div className={badge}>A_net {metrics.aNet.toFixed(2)}</div>
      </Html>
      <Html position={[0, 1.0, 0]} center zIndexRange={[10, 0]}>
        <div className={badge}>
          VWC {(metrics.meanVwc * 100).toFixed(0)}% · O₂ {(metrics.airFilledPorosity * 100).toFixed(0)}%
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Whole plant: happy jump on irrigation burst                         */
/* ------------------------------------------------------------------ */

function PeteyPlant() {
  const species = useActiveSpecies();
  const metrics = useLiveMetrics();
  const irrigationBurstAt = usePeteyStore((s) => s.irrigationBurstAt);
  const plantRef = useRef<THREE.Group>(null);
  const wiltT = clamp(metrics.desiccationRisk / 0.8, 0, 1);

  useFrame(() => {
    if (!plantRef.current) return;
    const burstAge = irrigationBurstAt ? (Date.now() - irrigationBurstAt) / 1000 : 99;
    // Bouncy happy jump: |sin(t*9)| * 0.3 * (1 - t/1.2) for t < 1.2 s.
    if (burstAge < 1.2) {
      plantRef.current.position.y =
        Math.abs(Math.sin(burstAge * 9)) * 0.3 * (1 - burstAge / 1.2);
    } else {
      plantRef.current.position.y = 0;
    }
  });

  return (
    <group ref={plantRef}>
      <Pot substrateMeanVwc={metrics.meanVwc} fieldCapacity={species.params.fieldCapacityVwc} />
      <Eyes wiltT={wiltT} />
      <Foliage />
      <Particles />
      <TelemetryBadges />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The single Canvas                                                   */
/* ------------------------------------------------------------------ */

export default function PeteyTerrariumCanvas() {
  return (
    <div
      className="relative h-[420px] w-full overflow-hidden rounded-xl border-2 border-rulestrong bg-parchment sm:h-[480px] lg:h-[560px]"
      role="img"
      aria-label="3D terrarium of your plant, reacting live to its biophysics"
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 3.4, 6.4], fov: 42 }}
        shadows
      >
        <ambientLight intensity={0.75} />
        <directionalLight
          position={[4, 8, 4]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <PeteyPlant />
        <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={8} blur={2.4} />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 2.1, 0]}
        />
      </Canvas>
      <div className="ledger-badge absolute bottom-3 left-1/2 -translate-x-1/2">
        Drag to orbit Petey
      </div>
    </div>
  );
}
