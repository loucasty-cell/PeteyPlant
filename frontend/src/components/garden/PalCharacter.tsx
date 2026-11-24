import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  BackSide,
  Group,
  MathUtils,
  TubeGeometry,
  Vector3,
} from 'three';
import type { CompanionAnimationId } from '../../lib/three/speciesAssetRegistry';
import type { PosturePreset } from '../../lib/care/conditionRegistry';

export type PalMood = 'idle' | 'curious' | 'concerned' | 'relieved' | 'happy';

interface PotStyle {
  bodyColor: string;
  bandColor: string;
  rimColor: string;
  topRadius: number;
  bottomRadius: number;
  height: number;
  fluted?: boolean;
}

const POT_STYLES: PotStyle[] = [
  // 0 Monstera: confident terracotta pot
  { bodyColor: '#D69464', bandColor: '#B56343', rimColor: '#DF9F70', topRadius: 0.65, bottomRadius: 0.48, height: 0.78 },
  // 1 Pothos: warm ochre stoneware
  { bodyColor: '#DCB663', bandColor: '#B88435', rimColor: '#E5C479', topRadius: 0.62, bottomRadius: 0.46, height: 0.74 },
  // 2 Snake Plant: architectural fluted sage stone
  { bodyColor: '#9AA898', bandColor: '#48665B', rimColor: '#AAB7A8', topRadius: 0.60, bottomRadius: 0.50, height: 0.84, fluted: true },
  // 3 Spider Plant: warm ivory-oat ceramic
  { bodyColor: '#E6D6BC', bandColor: '#839D68', rimColor: '#EFE3CE', topRadius: 0.62, bottomRadius: 0.45, height: 0.72 },
  // 4 Aloe Vera: low wide matte clay bowl
  { bodyColor: '#B7684A', bandColor: '#DCA772', rimColor: '#C57658', topRadius: 0.68, bottomRadius: 0.46, height: 0.68 },
  // 5 Areca Palm: tall sand-taupe planter
  { bodyColor: '#D5AE78', bandColor: '#8F6F4E', rimColor: '#DFBC8C', topRadius: 0.62, bottomRadius: 0.47, height: 0.84 },
  // 6 Peacock Plant: muted plum-clay ceramic
  { bodyColor: '#A06B77', bandColor: '#754652', rimColor: '#B27E89', topRadius: 0.62, bottomRadius: 0.46, height: 0.76 },
  // 7 Fiddle-Leaf Fig: tailored walnut-stone planter
  { bodyColor: '#B9926C', bandColor: '#6E5340', rimColor: '#C8A37E', topRadius: 0.64, bottomRadius: 0.49, height: 0.82 },
];

const MOUTH_CURVES: Record<PalMood, [number, number, number]> = {
  idle: [-0.02, -0.056, -0.02],
  curious: [-0.026, -0.062, -0.034],
  concerned: [-0.058, -0.018, -0.058],
  relieved: [-0.012, -0.078, -0.012],
  happy: [0.012, -0.098, 0.012],
};

/* ==========================================================================
   Species-Specific Procedural Geometry Builders (Properly Disposed on Switch)
   ========================================================================== */

/**
 * 0. Monstera deliciosa: high-density continuous parametric cordate leaf
 * with smooth rounded pinnatifid fenestration lobes & natural 3D arch/cupping.
 * Uses a continuous 48x28 UV grid (zero skipped triangles or long planar shards).
 */
function buildMonsteraBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const deep = new Color('#1B462E');
  const mid = new Color('#346E46');
  const highlight = new Color('#528E58');
  const vein = new Color('#8EB86A');

  const rows = 48;
  const cols = 28;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    // Smooth cordate heart envelope with rounded basal auricles
    const basalLobe = 0.22 * Math.exp(-Math.pow((t - 0.12) / 0.095, 2));
    const heartWidth = Math.pow(Math.sin(t * Math.PI), 0.6) * (1.16 - t * 0.24) + basalLobe;

    // 3 smooth pinnatifid sinus indentations along the outer margin
    const notch1 = 0.64 * Math.exp(-Math.pow((t - 0.33) / 0.038, 2));
    const notch2 = 0.68 * Math.exp(-Math.pow((t - 0.54) / 0.041, 2));
    const notch3 = 0.60 * Math.exp(-Math.pow((t - 0.74) / 0.036, 2));
    const notchDepth = Math.min(0.76, notch1 + notch2 + notch3);

    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);

      // Keep central midrib lamina intact while smoothly indenting outer lobes at sinus notches
      const outerWeight = Math.pow(absS, 1.35);
      const lobeFactor = 1 - notchDepth * outerWeight;
      const x = heartWidth * lobeFactor * s * 0.62;

      // Heart basal sinus dip near petiole attachment + natural vein sweep
      const basalDip = -0.095 * Math.exp(-Math.pow(t / 0.18, 2)) * Math.sin(absS * Math.PI);
      const veinSweep = absS * notchDepth * 0.035;
      const y = t * 1.15 + basalDip + veinSweep;

      // Smooth 3D midrib arch + concave leaf cupping + subtle lobe undulation
      const arch = Math.sin(t * Math.PI * 0.94) * 0.18 - t * t * 0.14;
      const cup = (1 - absS * 0.72) * heartWidth * 0.11 - Math.exp(-absS * 12) * 0.024;
      const lobeWaveZ = Math.sin(t * Math.PI * 6) * absS * 0.018;
      const z = arch + cup + lobeWaveZ;
      pos.push(x, y, z);

      // Botanical venation: raised pale-jade midrib + angled lateral primary veins
      const midrib = Math.exp(-absS * 18) * 0.68;
      const lateralVein =
        Math.pow(0.5 + 0.5 * Math.cos((t - absS * 0.22) * Math.PI * 11), 10) *
        (1 - notchDepth * 0.8) *
        0.28;
      const shade = deep
        .clone()
        .lerp(mid, 0.35 + (1 - absS * 0.8) * 0.45)
        .lerp(highlight, t * 0.22)
        .lerp(vein, Math.min(0.82, midrib + lateralVein));
      col.push(shade.r, shade.g, shade.b);

      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 1. Epipremnum aureum (Golden Pothos): high-density sculpted cordate heart leaf with golden marbling */
function buildPothosBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const deep = new Color('#214B2C');
  const mid = new Color('#4B7E3E');
  const gold = new Color('#DFDA7F');
  const cream = new Color('#EFE9B4');
  const rows = 36;
  const cols = 20;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      const basalDip = -0.11 * Math.exp(-Math.pow(t / 0.22, 2)) * Math.sin(absS * Math.PI);
      const heartWidth =
        Math.sin(Math.pow(t, 0.72) * Math.PI) * (1.28 - t * 0.62) +
        0.16 * Math.exp(-Math.pow((t - 0.16) / 0.12, 2));
      const x = heartWidth * s * 0.44;
      const y = t * 0.78 + basalDip;
      const arch = Math.sin(t * Math.PI * 0.95) * 0.11 - t * t * 0.08;
      const midribCrease = -Math.pow(1 - absS, 3) * 0.032 + (1 - absS) * 0.055;
      const z = arch + midribCrease;
      pos.push(x, y, z);

      const patchA = Math.sin(t * 15.2 + s * 5.8) * Math.cos(t * 8.4 - s * 4.2);
      const patchB = Math.sin(t * 23.0 - s * 7.1 + 1.4);
      const variegation = Math.pow(Math.max(0, 0.5 + 0.5 * (patchA * 0.7 + patchB * 0.3)), 3.2);
      const veinHighlight = Math.pow(1 - absS, 11) * 0.28;
      const color = deep
        .clone()
        .lerp(mid, 0.32 + 0.52 * (1 - absS * 0.85))
        .lerp(gold, Math.min(0.78, variegation * 0.68 + veinHighlight))
        .lerp(cream, Math.max(0, variegation - 0.62) * 0.55);
      col.push(color.r, color.g, color.b);

      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 2. Dracaena trifasciata (Snake Plant): volumetric 3D succulent sword blade with golden margins */
function buildSnakeSwordBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const darkBand = new Color('#1F442F');
  const sageBand = new Color('#648E5E');
  const goldEdge = new Color('#E4D272');
  const rows = 42;
  const cols = 14;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    // Smooth sword silhouette: narrow base, broad middle, sharp acuminate tip
    const baseTaper = 0.72 + 0.28 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5);
    const tipTaper = Math.pow(Math.sin(Math.min(1, t * 1.005) * Math.PI), 0.44);
    const width = tipTaper * baseTaper * 0.215;
    const twist = (t - 0.3) * 0.28;
    const sCurveZ = Math.sin(t * Math.PI * 1.15) * 0.055;

    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      const localX = width * s;
      // Gently channeled concave front & rounded ridge
      const localZ = (1 - absS * absS) * 0.048 - Math.exp(-absS * 8) * 0.012 + sCurveZ;
      const rx = localX * Math.cos(twist) - localZ * Math.sin(twist);
      const rz = localX * Math.sin(twist) + localZ * Math.cos(twist);
      pos.push(rx, t * 1.52, rz);

      // Horizontal mottled chevron banding + crisp Laurentii golden margins
      const chevron = 0.5 + 0.5 * Math.sin(t * 44 - absS * 3.4);
      const margin = MathUtils.smoothstep(absS, 0.72, 0.92);
      const color = darkBand.clone().lerp(sageBand, chevron * 0.78).lerp(goldEdge, margin * 0.94);
      col.push(color.r, color.g, color.b);

      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 3. Chlorophytum comosum (Spider Plant): graceful arching cream-striped ribbon with folded channel */
function buildSpiderRibbonBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const edgeGreen = new Color('#3B7042');
  const midGreen = new Color('#5B9455');
  const creamStripe = new Color('#F2EDC4');
  const rows = 36;
  const cols = 12;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      const width = Math.sin(t * Math.PI) ** 0.48 * 0.092 * (1.15 - t * 0.32);
      const y = Math.sin(t * Math.PI * 0.84) * 0.82 - t * t * 0.22 + absS * 0.018;
      const z = t * 1.16;
      pos.push(width * s, y, z);

      const stripe = MathUtils.smoothstep(0.42 - absS, 0, 0.14);
      const color = edgeGreen.clone().lerp(midGreen, 1 - absS).lerp(creamStripe, stripe * 0.92);
      col.push(color.r, color.g, color.b);

      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 4. Aloe vera: high-resolution 3D volumetric succulent spear with smooth rounded keel & marginal teeth */
function buildAloeSpear(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const baseGreen = new Color('#35674F');
  const fleshyGreen = new Color('#649E78');
  const paleTooth = new Color('#D2E0AC');

  const rows = 32;
  const ringLen = 14;
  // Smooth 14-point cross-section: slightly concave top face, sharp lateral margins, plump rounded keel back
  const ringPts: [number, number, boolean][] = Array.from({ length: ringLen }, (_, k) => {
    const theta = (k / ringLen) * Math.PI * 2;
    const x = Math.cos(theta);
    const rawZ = Math.sin(theta);
    const z = rawZ > 0 ? rawZ * 0.22 - (1 - x * x) * 0.08 : rawZ * 0.58;
    const isEdge = k === 0 || k === ringLen / 2;
    return [x, z, isEdge];
  });

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const taper = Math.pow(1 - t, 0.68);
    const toothPulse = r % 3 === 1 && r > 2 && r < rows - 2 ? 1.15 : 1.0;
    const w = 0.16 * taper;
    const thick = 0.115 * taper;
    const curveZ = t * t * 0.2;
    const y = t * 1.24;

    for (let k = 0; k < ringLen; k++) {
      const [rx, rz, isEdge] = ringPts[k];
      const px = rx * w * (isEdge ? toothPulse : 1);
      const pz = rz * thick + curveZ;
      pos.push(px, y, pz);

      const speckle = Math.pow(0.5 + 0.5 * Math.sin(t * 28 + k * 1.7), 5) * 0.28;
      const color = baseGreen
        .clone()
        .lerp(fleshyGreen, 0.35 + t * 0.5)
        .lerp(paleTooth, isEdge && toothPulse > 1 ? 0.9 : speckle);
      col.push(color.r, color.g, color.b);
    }

    if (r < rows) {
      for (let k = 0; k < ringLen; k++) {
        const nextK = (k + 1) % ringLen;
        const a = r * ringLen + k;
        const b = r * ringLen + nextK;
        const c = (r + 1) * ringLen + k;
        const d = (r + 1) * ringLen + nextK;
        idx.push(a, b, c, b, d, c);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 5. Dypsis lutescens (Areca Palm): feathery pinnate leaflet blade */
function buildPalmLeaflet(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const deep = new Color('#2D5E38');
  const bright = new Color('#6EA355');
  const tip = new Color('#A6C672');
  const rows = 14;
  const cols = 4;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const w = Math.sin(t * Math.PI) ** 0.55 * 0.036;
      const y = Math.sin(t * Math.PI * 0.7) * 0.06 - t * t * 0.08;
      pos.push(w * s, y, t * 0.44);
      const color = deep.clone().lerp(bright, 0.4 + t * 0.5).lerp(tip, t * 0.45);
      col.push(color.r, color.g, color.b);
      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 6. Goeppertia makoyana (Peacock Plant): broad patterned oval leaf */
function buildPeacockBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const featherDark = new Color('#1D4430');
  const paleCream = new Color('#B9CF93');
  const edgeMid = new Color('#3C6E48');
  const rows = 30;
  const cols = 10;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      const w = Math.sin(t * Math.PI) ** 0.56 * 0.34;
      const y = t * 0.92;
      const z = Math.sin(t * Math.PI) * 0.14 + (1 - absS) * 0.05;
      pos.push(w * s, y, z);

      // Distinctive radiating oval peacock feather markings on pale cream-green ground
      const featherBand = Math.pow(0.5 + 0.5 * Math.sin(t * 24 - absS * 4.5), 3);
      const inFeatherZone = absS > 0.18 && absS < 0.78 ? featherBand : 0;
      const rim = absS > 0.82 ? 1 : 0;
      const color = paleCream
        .clone()
        .lerp(featherDark, Math.min(1, inFeatherZone * 0.95 + Math.pow(1 - absS, 12) * 0.65))
        .lerp(edgeMid, rim * 0.85);
      col.push(color.r, color.g, color.b);

      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 7. Ficus lyrata (Fiddle-Leaf Fig): sculpted violin-shaped veined blade */
function buildFiddleBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const deep = new Color('#1D3D2B');
  const mid = new Color('#3C6E47');
  const vein = new Color('#A6BD6D');
  const rows = 32;
  const cols = 10;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      // Iconic pinched-waist fiddle / violin silhouette (wider upper lobe, pinched middle, flared base)
      const baseCurve = Math.sin(t * Math.PI) ** 0.52;
      const waistPinch = 1 - 0.28 * Math.exp(-Math.pow((t - 0.42) / 0.14, 2)) + 0.18 * Math.exp(-Math.pow((t - 0.72) / 0.18, 2));
      const w = baseCurve * waistPinch * 0.36;
      // Gently undulating ruffled outer margin
      const ruffle = Math.sin(t * Math.PI * 7) * absS * absS * 0.045;
      const y = t * 1.02;
      const z = Math.sin(t * Math.PI * 1.1) * 0.14 + (1 - absS) * 0.06 + ruffle;
      pos.push(w * s, y, z);

      const midrib = Math.pow(1 - absS, 14) * 0.85;
      const ribs = Math.pow(0.5 + 0.5 * Math.sin(t * 26 - absS * 8), 11) * 0.45;
      const color = deep.clone().lerp(mid, 0.35 + 0.55 * (1 - absS)).lerp(vein, Math.min(1, midrib + ribs));
      col.push(color.r, color.g, color.b);

      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ==========================================================================
   Species-Specific Foliage Sub-Rigs
   ========================================================================== */

function MonsteraFoliage({ castShadow }: { castShadow: boolean }) {
  const blade = useMemo(() => buildMonsteraBlade(), []);
  const aerialRoot = useMemo(() => {
    const curve = new CatmullRomCurve3([
      new Vector3(0.05, 0.26, -0.02),
      new Vector3(0.18, 0.14, 0.08),
      new Vector3(0.27, 0.01, 0.15),
    ]);
    return new TubeGeometry(curve, 18, 0.016, 8, false);
  }, []);

  // Curved petioles that rise from the central node and bend naturally at the geniculum into the leaf blade
  const petioles = useMemo(() => {
    const specs = [
      { angle: 0.18, reach: 0.34, height: 0.44, bladePitch: 0.78, scale: 0.94 },
      { angle: 1.24, reach: 0.30, height: 0.34, bladePitch: 0.92, scale: 0.84 },
      { angle: 2.32, reach: 0.36, height: 0.50, bladePitch: 0.72, scale: 1.02 },
      { angle: 3.38, reach: 0.32, height: 0.38, bladePitch: 0.88, scale: 0.88 },
      { angle: 4.46, reach: 0.35, height: 0.46, bladePitch: 0.76, scale: 0.96 },
      { angle: 5.42, reach: 0.28, height: 0.30, bladePitch: 0.96, scale: 0.78 },
    ];
    return specs.map((sp) => {
      const curve = new CatmullRomCurve3([
        new Vector3(0, 0.03, 0.03),
        new Vector3(0, sp.height * 0.55, sp.reach * 0.42),
        new Vector3(0, sp.height, sp.reach),
      ]);
      const geo = new TubeGeometry(curve, 16, 0.021, 8, false);
      const tip = curve.getPointAt(1);
      return { ...sp, geo, tip };
    });
  }, []);

  useEffect(() => () => {
    blade.dispose();
    aerialRoot.dispose();
    petioles.forEach((p) => p.geo.dispose());
  }, [blade, aerialRoot, petioles]);

  return (
    <group>
      {/* Sturdy central climbing stem */}
      <mesh position={[0, 0.15, 0]} castShadow={castShadow}>
        <cylinderGeometry args={[0.052, 0.068, 0.32, 16]} />
        <meshStandardMaterial color="#2D5A3D" roughness={0.76} />
      </mesh>
      <mesh geometry={aerialRoot} castShadow={castShadow}>
        <meshStandardMaterial color="#8B7356" roughness={0.88} />
      </mesh>
      {petioles.map((l, idx) => (
        <group key={idx} rotation={[0, l.angle, 0]}>
          <mesh geometry={l.geo} castShadow={castShadow}>
            <meshStandardMaterial color="#346844" roughness={0.72} />
          </mesh>
          <mesh
            geometry={blade}
            position={[l.tip.x, l.tip.y - 0.02, l.tip.z - 0.01]}
            rotation={[l.bladePitch, 0, (idx % 2 === 0 ? 1 : -1) * 0.06]}
            scale={[l.scale, l.scale, l.scale]}
            castShadow={castShadow}
            receiveShadow={castShadow}
          >
            <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.64} metalness={0.01} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PothosFoliage({ castShadow }: { castShadow: boolean }) {
  const blade = useMemo(() => buildPothosBlade(), []);
  const vines = useMemo(() => {
    // 5 asymmetrical cascading vines draping organically over the stoneware rim
    const specs = [
      { angle: 0.52, length: 0.88, sway: 0.08 },
      { angle: 1.78, length: 0.72, sway: -0.07 },
      { angle: 3.12, length: 0.94, sway: 0.06 },
      { angle: 4.32, length: 0.78, sway: -0.08 },
      { angle: 5.58, length: 0.84, sway: 0.05 },
    ];
    return specs.map((spec) => {
      const curve = new CatmullRomCurve3([
        new Vector3(0, 0.05, 0.14),
        new Vector3(spec.sway * 0.5, 0.15, 0.52),
        new Vector3(spec.sway, -0.16, 0.72),
        new Vector3(-spec.sway * 0.65, -spec.length, 0.67),
      ]);
      const geo = new TubeGeometry(curve, 24, 0.017, 7, false);
      const pts = [0.28, 0.52, 0.76, 0.96].map((u) => curve.getPointAt(u));
      return { angle: spec.angle, geo, pts };
    });
  }, []);

  useEffect(() => () => {
    blade.dispose();
    vines.forEach((v) => v.geo.dispose());
  }, [blade, vines]);

  const crownLeaves = [
    { a: 0.08, p: 0.72, s: 0.88, stem: 0.30 },
    { a: 0.95, p: 0.54, s: 0.96, stem: 0.36 },
    { a: 1.88, p: 0.80, s: 0.82, stem: 0.26 },
    { a: 2.82, p: 0.58, s: 0.94, stem: 0.34 },
    { a: 3.74, p: 0.76, s: 0.86, stem: 0.28 },
    { a: 4.68, p: 0.60, s: 0.92, stem: 0.33 },
    { a: 5.52, p: 0.84, s: 0.80, stem: 0.25 },
  ];

  return (
    <group>
      {/* Full natural top crown */}
      {crownLeaves.map((l, idx) => (
        <group key={idx} rotation={[0, l.a, 0]}>
          <group position={[0, 0.04, 0.11]} rotation={[l.p, 0, (idx % 2 === 0 ? 1 : -1) * 0.08]}>
            <mesh position={[0, l.stem * 0.5, 0]} castShadow={castShadow}>
              <cylinderGeometry args={[0.014, 0.019, l.stem, 7]} />
              <meshStandardMaterial color="#44733B" roughness={0.78} metalness={0.01} />
            </mesh>
            <mesh
              geometry={blade}
              position={[0, l.stem * 0.86, 0]}
              scale={[l.s, l.s, l.s]}
              castShadow={castShadow}
              receiveShadow={castShadow}
            >
              <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.64} metalness={0.01} />
            </mesh>
          </group>
        </group>
      ))}
      {/* Cascading trailing vines over the pot rim */}
      {vines.map((v, vi) => (
        <group key={vi} rotation={[0, v.angle, 0]}>
          <mesh geometry={v.geo} castShadow={castShadow}>
            <meshStandardMaterial color="#47763D" roughness={0.78} metalness={0.01} />
          </mesh>
          {v.pts.map((pt, pi) => (
            <mesh
              key={pi}
              geometry={blade}
              position={[pt.x, pt.y, pt.z]}
              rotation={[2.02 + pi * 0.16, (pi + vi) % 2 === 0 ? 0.46 : -0.46, (pi % 2 === 0 ? 1 : -1) * 0.12]}
              scale={[0.76 - pi * 0.08, 0.76 - pi * 0.08, 0.76 - pi * 0.08]}
              castShadow={castShadow}
              receiveShadow={castShadow}
            >
              <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.64} metalness={0.01} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function SnakePlantFoliage({ castShadow }: { castShadow: boolean }) {
  const blade = useMemo(() => buildSnakeSwordBlade(), []);
  useEffect(() => () => blade.dispose(), [blade]);

  const swords = [
    { x: 0.0, z: 0.0, rotY: 0.2, tilt: 0.04, scaleY: 1.05, scaleW: 1.05 },
    { x: -0.16, z: 0.08, rotY: 0.9, tilt: 0.14, scaleY: 0.92, scaleW: 0.95 },
    { x: 0.18, z: 0.06, rotY: -0.8, tilt: 0.15, scaleY: 0.95, scaleW: 0.98 },
    { x: -0.08, z: -0.15, rotY: 2.4, tilt: 0.12, scaleY: 0.88, scaleW: 0.92 },
    { x: 0.14, z: -0.14, rotY: -2.2, tilt: 0.16, scaleY: 0.84, scaleW: 0.9 },
    { x: -0.26, z: -0.04, rotY: 1.7, tilt: 0.22, scaleY: 0.72, scaleW: 0.85 },
    { x: 0.28, z: -0.02, rotY: -1.6, tilt: 0.21, scaleY: 0.76, scaleW: 0.86 },
    { x: 0.02, z: 0.22, rotY: 0.05, tilt: 0.19, scaleY: 0.68, scaleW: 0.84 },
  ];

  return (
    <group>
      {swords.map((s, idx) => (
        <group key={idx} position={[s.x, -0.02, s.z]} rotation={[0, s.rotY, 0]}>
          <mesh
            geometry={blade}
            rotation={[s.tilt, 0, 0]}
            scale={[s.scaleW, s.scaleY, 1]}
            castShadow={castShadow}
            receiveShadow={castShadow}
          >
            <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.68} metalness={0.01} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SpiderPlantFoliage({ castShadow }: { castShadow: boolean }) {
  const ribbon = useMemo(() => buildSpiderRibbonBlade(), []);
  const stolons = useMemo(() => {
    return [0.75, 3.8].map((angle) => {
      const curve = new CatmullRomCurve3([
        new Vector3(0, 0.08, 0.06),
        new Vector3(0, 0.56, 0.45),
        new Vector3(0.05, 0.36, 0.96),
        new Vector3(0.03, -0.12, 1.12),
      ]);
      const geo = new TubeGeometry(curve, 20, 0.011, 6, false);
      const tip = curve.getPointAt(1);
      return { angle, geo, tip };
    });
  }, []);

  useEffect(() => () => {
    ribbon.dispose();
    stolons.forEach((s) => s.geo.dispose());
  }, [ribbon, stolons]);

  const blades = Array.from({ length: 14 }, (_, i) => ({
    angle: (i / 14) * Math.PI * 2 + (i % 2) * 0.16,
    pitch: i % 2 === 0 ? -0.18 : 0.08,
    scale: i % 2 === 0 ? 1.0 : 0.78,
  }));

  return (
    <group>
      {blades.map((b, idx) => (
        <group key={idx} rotation={[0, b.angle, 0]}>
          <mesh
            geometry={ribbon}
            position={[0, 0.02, 0.04]}
            rotation={[b.pitch, 0, 0]}
            scale={[b.scale, b.scale, b.scale]}
            castShadow={castShadow}
          >
            <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.68} metalness={0.01} />
          </mesh>
        </group>
      ))}
      {/* Arching stolons with miniature hanging spiderettes (plantlets) */}
      {stolons.map((st, si) => (
        <group key={si} rotation={[0, st.angle, 0]}>
          <mesh geometry={st.geo} castShadow={castShadow}>
            <meshStandardMaterial color="#8FB068" roughness={0.76} />
          </mesh>
          <group position={[st.tip.x, st.tip.y, st.tip.z]} scale={[0.28, 0.28, 0.28]}>
            {[0, 1.25, 2.5, 3.75, 5.0].map((a) => (
              <mesh key={a} geometry={ribbon} rotation={[0.15, a, 0]}>
                <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.68} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}

function AloeVeraFoliage({ castShadow }: { castShadow: boolean }) {
  const spear = useMemo(() => buildAloeSpear(), []);
  useEffect(() => () => spear.dispose(), [spear]);

  const innerRing = Array.from({ length: 5 }, (_, i) => ({
    angle: (i / 5) * Math.PI * 2 + 0.2,
    tilt: 0.24,
    scale: 0.86 + (i % 2) * 0.12,
  }));
  const outerRing = Array.from({ length: 7 }, (_, i) => ({
    angle: (i / 7) * Math.PI * 2 + 0.55,
    tilt: 0.62,
    scale: 0.96 + (i % 3) * 0.06,
  }));

  return (
    <group position={[0, -0.03, 0]}>
      {innerRing.map((s, idx) => (
        <group key={`in-${idx}`} rotation={[0, s.angle, 0]}>
          <mesh
            geometry={spear}
            position={[0, 0, 0.06]}
            rotation={[s.tilt, 0, 0]}
            scale={[s.scale, s.scale, s.scale]}
            castShadow={castShadow}
            receiveShadow={castShadow}
          >
            <meshStandardMaterial vertexColors roughness={0.72} metalness={0.01} />
          </mesh>
        </group>
      ))}
      {outerRing.map((s, idx) => (
        <group key={`out-${idx}`} rotation={[0, s.angle, 0]}>
          <mesh
            geometry={spear}
            position={[0, -0.02, 0.14]}
            rotation={[s.tilt, 0, 0]}
            scale={[s.scale, s.scale, s.scale]}
            castShadow={castShadow}
            receiveShadow={castShadow}
          >
            <meshStandardMaterial vertexColors roughness={0.72} metalness={0.01} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ArecaPalmFoliage({ castShadow }: { castShadow: boolean }) {
  const leaflet = useMemo(() => buildPalmLeaflet(), []);
  const fronds = useMemo(() => {
    const specs = [
      { angle: 0.15, height: 1.15, reach: 0.95 },
      { angle: 1.2, height: 1.28, reach: 0.88 },
      { angle: 2.3, height: 1.05, reach: 1.02 },
      { angle: 3.35, height: 1.22, reach: 0.92 },
      { angle: 4.45, height: 1.1, reach: 0.96 },
      { angle: 5.45, height: 1.32, reach: 0.82 },
    ];
    return specs.map((spec) => {
      const curve = new CatmullRomCurve3([
        new Vector3(0, 0, 0.05),
        new Vector3(0, spec.height * 0.55, spec.reach * 0.25),
        new Vector3(0, spec.height * 0.95, spec.reach * 0.65),
        new Vector3(0, spec.height * 0.78, spec.reach),
      ]);
      const caneGeo = new TubeGeometry(curve, 18, 0.022, 7, false);
      const pairs = [0.42, 0.54, 0.66, 0.78, 0.88, 0.96].map((u) => ({
        pos: curve.getPointAt(u),
        scale: 1.05 - Math.abs(u - 0.65) * 1.1,
      }));
      return { angle: spec.angle, caneGeo, pairs };
    });
  }, []);

  useEffect(() => () => {
    leaflet.dispose();
    fronds.forEach((f) => f.caneGeo.dispose());
  }, [leaflet, fronds]);

  return (
    <group>
      {fronds.map((f, fi) => (
        <group key={fi} rotation={[0, f.angle, 0]}>
          <mesh geometry={f.caneGeo} castShadow={castShadow}>
            <meshStandardMaterial color="#7C9A55" roughness={0.76} />
          </mesh>
          {f.pairs.map((p, pi) => (
            <group key={pi} position={[p.pos.x, p.pos.y, p.pos.z]}>
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  geometry={leaflet}
                  rotation={[0.22, side * 1.12, side * -0.22]}
                  scale={[p.scale, p.scale, p.scale]}
                  castShadow={castShadow}
                >
                  <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.68} metalness={0.01} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function PeacockPlantFoliage({ castShadow }: { castShadow: boolean }) {
  const blade = useMemo(() => buildPeacockBlade(), []);
  useEffect(() => () => blade.dispose(), [blade]);

  const stems = [
    { angle: 0.2, pitch: 0.58, height: 0.55, scale: 1.0 },
    { angle: 1.1, pitch: 0.72, height: 0.45, scale: 0.88 },
    { angle: 2.0, pitch: 0.50, height: 0.62, scale: 1.04 },
    { angle: 2.95, pitch: 0.74, height: 0.44, scale: 0.86 },
    { angle: 3.9, pitch: 0.54, height: 0.58, scale: 0.96 },
    { angle: 4.85, pitch: 0.76, height: 0.42, scale: 0.84 },
    { angle: 5.65, pitch: 0.62, height: 0.52, scale: 0.92 },
  ];

  return (
    <group>
      {stems.map((s, idx) => (
        <group key={idx} rotation={[0, s.angle, 0]}>
          <group position={[0, 0.02, 0.08]} rotation={[s.pitch, 0, 0]}>
            <mesh position={[0, s.height * 0.5, 0]} castShadow={castShadow}>
              <cylinderGeometry args={[0.014, 0.02, s.height, 7]} />
              <meshStandardMaterial color="#673748" roughness={0.78} />
            </mesh>
            {/* Front patterned peacock surface + rich plum-burgundy underside */}
            <group position={[0, s.height * 0.88, 0]} scale={[s.scale, s.scale, s.scale]}>
              <mesh geometry={blade} castShadow={castShadow} receiveShadow={castShadow}>
                <meshStandardMaterial vertexColors side={FrontSide} roughness={0.66} metalness={0.01} />
              </mesh>
              <mesh geometry={blade} position={[0, 0, -0.002]}>
                <meshStandardMaterial color="#5E293C" side={BackSide} roughness={0.72} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

function FiddleLeafFoliage({ castShadow }: { castShadow: boolean }) {
  const blade = useMemo(() => buildFiddleBlade(), []);
  useEffect(() => () => blade.dispose(), [blade]);

  const leaves = [
    { y: 0.48, angle: 0.4, pitch: 0.74, scale: 0.86 },
    { y: 0.62, angle: 2.5, pitch: 0.68, scale: 0.94 },
    { y: 0.74, angle: 4.4, pitch: 0.66, scale: 0.92 },
    { y: 0.88, angle: 1.4, pitch: 0.56, scale: 1.0 },
    { y: 0.98, angle: 3.5, pitch: 0.52, scale: 0.96 },
    { y: 1.06, angle: 5.5, pitch: 0.46, scale: 0.88 },
  ];

  return (
    <group>
      {/* Defined woody upright Ficus trunk */}
      <mesh position={[0, 0.54, 0]} castShadow={castShadow} receiveShadow={castShadow}>
        <cylinderGeometry args={[0.042, 0.072, 1.12, 12]} />
        <meshStandardMaterial color="#6A4D38" roughness={0.9} metalness={0.02} />
      </mesh>
      {/* Subtle woody branch fork */}
      <mesh position={[0.06, 0.84, 0.03]} rotation={[0.18, 0, -0.32]} castShadow={castShadow}>
        <cylinderGeometry args={[0.024, 0.035, 0.34, 8]} />
        <meshStandardMaterial color="#6A4D38" roughness={0.9} />
      </mesh>
      {leaves.map((l, idx) => (
        <group key={idx} position={[0, l.y, 0]} rotation={[0, l.angle, 0]}>
          <group position={[0, 0, 0.03]} rotation={[l.pitch, 0, 0]}>
            <mesh position={[0, 0.11, 0]} castShadow={castShadow}>
              <cylinderGeometry args={[0.018, 0.024, 0.22, 7]} />
              <meshStandardMaterial color="#586B41" roughness={0.82} />
            </mesh>
            <mesh
              geometry={blade}
              position={[0, 0.18, 0]}
              scale={[l.scale, l.scale, l.scale]}
              castShadow={castShadow}
              receiveShadow={castShadow}
            >
              <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.62} metalness={0.01} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/* ==========================================================================
   Main PalCharacterModel Component
   ========================================================================== */

export interface PalModelProps {
  variant: number;
  mood: PalMood;
  animationState?: CompanionAnimationId;
  posturePreset?: PosturePreset;
  play: number;
  reduced: boolean;
  windKmh?: number;
  castShadow?: boolean;
  onPet?: () => void;
}

/**
 * Species-specific structural flexibility multipliers.
 * Stiff upright swords (Snake Plant) and fleshy rosettes (Aloe Vera) do NOT droop
 * like soft-petiole tropicals (Monstera, Pothos, Spider Plant).
 */
const SPECIES_DROOP_FLEXIBILITY: Record<number, { pitch: number; relaxY: number; splayXZ: number; sway: number }> = {
  0: { pitch: 0.14, relaxY: 0.94, splayXZ: 1.04, sway: 1.0 },   // Monstera deliciosa
  1: { pitch: 0.18, relaxY: 0.92, splayXZ: 1.05, sway: 1.15 },  // Golden Pothos
  2: { pitch: 0.03, relaxY: 0.985, splayXZ: 0.99, sway: 0.42 }, // Snake Plant (stiff upright swords)
  3: { pitch: 0.16, relaxY: 0.93, splayXZ: 1.06, sway: 1.25 },  // Spider Plant (arching ribbons)
  4: { pitch: 0.035, relaxY: 0.98, splayXZ: 0.98, sway: 0.35 }, // Aloe Vera (thick fleshy rosette)
  5: { pitch: 0.13, relaxY: 0.95, splayXZ: 1.04, sway: 1.35 },  // Areca Palm (feathery fronds)
  6: { pitch: 0.11, relaxY: 0.96, splayXZ: 1.02, sway: 0.95 },  // Peacock Plant (prayer leaf posture)
  7: { pitch: 0.08, relaxY: 0.97, splayXZ: 1.02, sway: 0.68 },  // Fiddle-Leaf Fig (woody trunk)
};

export function PalCharacterModel({
  variant,
  mood,
  animationState = 'idle',
  posturePreset = 'upright_relaxed',
  play,
  reduced,
  windKmh = 8,
  castShadow = false,
  onPet,
}: PalModelProps) {
  const safeVariant = ((variant % 8) + 8) % 8;
  const pot = POT_STYLES[safeVariant] ?? POT_STYLES[0];
  const flex = SPECIES_DROOP_FLEXIBILITY[safeVariant] ?? SPECIES_DROOP_FLEXIBILITY[0];

  const mouth = useMemo(
    () =>
      new CatmullRomCurve3(
        MOUTH_CURVES[mood].map((height, index) => new Vector3((index - 1) * 0.105, height, 0)),
      ),
    [mood],
  );

  const body = useRef<Group>(null);
  const crown = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const initialPlay = useRef(play);
  const start = useRef(-10);

  useFrame(({ clock }, delta) => {
    if (!body.current || !crown.current || !eyes.current) return;
    const clampedDelta = Math.min(delta, 0.08);
    const time = clock.elapsedTime;
    if (play !== initialPlay.current) {
      initialPlay.current = play;
      start.current = time;
    }

    const t = time + safeVariant * 0.66;
    const elapsed = time - start.current;
    const reacting = !reduced && elapsed < 1.9;
    const isResting =
      animationState === 'resting' ||
      posturePreset === 'low_energy_rest' ||
      posturePreset === 'cautious_hold' ||
      mood === 'relieved';
    const energy =
      posturePreset === 'low_energy_rest'
        ? 0.42
        : posturePreset === 'stress_restrained'
          ? 0.55
          : isResting
            ? 0.58
            : mood === 'concerned'
              ? 0.52
              : mood === 'happy'
                ? 1.1
                : 0.88;
    const windFactor = MathUtils.clamp(windKmh / 26, 0.2, 1.45) * flex.sway;
    const decay = reacting ? Math.max(0, 1 - elapsed / 1.9) : 0;
    const bounce = reacting ? Math.sin(elapsed * 11.5) * decay : 0;

    // Gentle organic vertical breathing + tactile tap bounce
    const hop = Math.abs(bounce) * 0.14;
    body.current.position.y = reduced ? 0 : Math.sin(t * 1.55) * 0.01 * energy + hop;

    const stretch = reduced ? 1 : 1 + hop * 0.18;
    const squash = reduced ? 1 : 1 / Math.sqrt(stretch);
    body.current.scale.set(
      MathUtils.damp(body.current.scale.x, squash, 10, clampedDelta),
      MathUtils.damp(body.current.scale.y, stretch, 10, clampedDelta),
      MathUtils.damp(body.current.scale.z, squash, 10, clampedDelta),
    );

    const lean =
      posturePreset === 'questioning_tilt'
        ? -0.075
        : posturePreset === 'attentive_lean'
          ? -0.04
          : posturePreset === 'thirsty_droop'
            ? 0.045
            : 0;
    body.current.rotation.z = MathUtils.damp(
      body.current.rotation.z,
      lean + (reduced ? 0 : Math.sin(t * 1.2) * 0.018 * energy + bounce * 0.12),
      7,
      clampedDelta,
    );
    body.current.rotation.y = reduced ? -0.04 : Math.sin(t * 0.85) * 0.055 + bounce * 0.14;

    // Species-specific foliage posture driven strictly by condition posturePreset
    const swayAmp = animationState === 'sway' ? 1.25 : 1;
    const windSwayX = reduced ? 0 : Math.sin(t * (1.7 + windFactor * 0.7)) * (0.032 * windFactor * swayAmp) + bounce * 0.09;
    const windSwayZ = reduced ? 0 : Math.cos(t * (1.4 + windFactor * 0.5)) * (0.026 * windFactor * swayAmp);

    let targetCrownPitch = -0.015;
    let targetCrownScaleY = 1;
    let targetCrownScaleXZ = 1;

    if (posturePreset === 'thirsty_droop') {
      targetCrownPitch = flex.pitch;
      targetCrownScaleY = flex.relaxY;
      targetCrownScaleXZ = flex.splayXZ;
    } else if (posturePreset === 'cautious_hold') {
      targetCrownPitch = flex.pitch * 0.35;
      targetCrownScaleY = 0.985;
      targetCrownScaleXZ = 0.98;
    } else if (posturePreset === 'stress_restrained') {
      targetCrownPitch = flex.pitch * 0.55;
      targetCrownScaleY = MathUtils.lerp(1, flex.relaxY, 0.45);
    } else if (posturePreset === 'low_energy_rest' && safeVariant === 6) {
      // Prayer plant (Goeppertia makoyana) gently lifts foliage slightly when resting
      targetCrownPitch = -0.08;
      targetCrownScaleY = 1.03;
      targetCrownScaleXZ = 0.95;
    }

    crown.current.rotation.x = MathUtils.damp(
      crown.current.rotation.x,
      targetCrownPitch + windSwayX,
      5.5,
      clampedDelta,
    );
    crown.current.rotation.z = MathUtils.damp(crown.current.rotation.z, windSwayZ, 5.5, clampedDelta);
    crown.current.scale.set(
      MathUtils.damp(crown.current.scale.x, targetCrownScaleXZ, 5, clampedDelta),
      MathUtils.damp(crown.current.scale.y, targetCrownScaleY, 5, clampedDelta),
      MathUtils.damp(crown.current.scale.z, targetCrownScaleXZ, 5, clampedDelta),
    );

    // Restrained blinking & emotional squint on the ceramic pot face
    const blink = t % 5.1;
    const happySquint = reacting && elapsed < 0.95;
    eyes.current.scale.y = happySquint
      ? 0.42
      : !reduced && blink > 4.92
        ? 0.12
        : isResting
          ? 0.46
          : mood === 'concerned'
            ? 0.82
            : 1;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPet) return;
    event.stopPropagation();
    onPet();
  };

  const potCenterY = -0.84 + pot.height * 0.5;
  const potTopY = potCenterY + pot.height * 0.5;
  const faceZ = MathUtils.lerp(pot.bottomRadius, pot.topRadius, 0.58) + 0.015;

  return (
    <group
      ref={body}
      onClick={handleClick}
      onPointerOver={() => {
        if (onPet) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (onPet) document.body.style.cursor = '';
      }}
    >
      {/* Matte handcrafted stoneware pot body */}
      <mesh position={[0, potCenterY, 0]} castShadow={castShadow} receiveShadow={castShadow}>
        <cylinderGeometry args={[pot.topRadius, pot.bottomRadius, pot.height, pot.fluted ? 16 : 48, 1]} />
        <meshStandardMaterial color={pot.bodyColor} roughness={0.86} metalness={0.01} />
      </mesh>

      {/* Subtle glazed lower accent band */}
      <mesh position={[0, -0.84 + pot.height * 0.2, 0]} castShadow={castShadow} receiveShadow={castShadow}>
        <cylinderGeometry
          args={[
            MathUtils.lerp(pot.bottomRadius, pot.topRadius, 0.36) + 0.005,
            pot.bottomRadius + 0.005,
            pot.height * 0.30,
            pot.fluted ? 16 : 48,
          ]}
        />
        <meshStandardMaterial color={pot.bandColor} roughness={0.72} metalness={0.02} />
      </mesh>

      {/* Crafted pot collar rim */}
      <mesh position={[0, potTopY - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={castShadow} receiveShadow={castShadow}>
        <torusGeometry args={[pot.topRadius - 0.035, 0.062, 14, 48]} />
        <meshStandardMaterial color={pot.rimColor} roughness={0.76} metalness={0.02} />
      </mesh>

      {/* Rich matte organic potting mix */}
      <mesh position={[0, potTopY - 0.015, 0]} receiveShadow={castShadow}>
        <cylinderGeometry args={[pot.topRadius - 0.08, pot.topRadius - 0.08, 0.05, 36]} />
        <meshStandardMaterial color="#3E2D22" roughness={0.96} />
      </mesh>

      {/* Species-specific botanical foliage crown */}
      <group ref={crown} position={[0, potTopY + 0.01, 0]}>
        {safeVariant === 0 && <MonsteraFoliage castShadow={castShadow} />}
        {safeVariant === 1 && <PothosFoliage castShadow={castShadow} />}
        {safeVariant === 2 && <SnakePlantFoliage castShadow={castShadow} />}
        {safeVariant === 3 && <SpiderPlantFoliage castShadow={castShadow} />}
        {safeVariant === 4 && <AloeVeraFoliage castShadow={castShadow} />}
        {safeVariant === 5 && <ArecaPalmFoliage castShadow={castShadow} />}
        {safeVariant === 6 && <PeacockPlantFoliage castShadow={castShadow} />}
        {safeVariant === 7 && <FiddleLeafFoliage castShadow={castShadow} />}
      </group>

      {/* Restrained companion face placed cleanly on the pot (proportionate, matte glaze) */}
      <group ref={eyes} position={[0, potCenterY + 0.08, faceZ]}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.148, 0, 0]}>
            <mesh scale={[0.046, 0.064, 0.024]}>
              <sphereGeometry args={[1, 18, 12]} />
              <meshStandardMaterial color="#1F2A22" roughness={0.42} metalness={0.02} />
            </mesh>
            <mesh position={[-0.011, 0.022, 0.019]} scale={[0.012, 0.015, 0.008]}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshBasicMaterial color="#F7F6EF" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Subtle warm cheek dots + concerned brow cue */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh
            position={[s * 0.245, potCenterY - 0.01, faceZ - 0.05]}
            rotation={[0, s * 0.42, 0]}
            scale={[0.054, 0.022, 0.016]}
          >
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color="#D6876C" roughness={0.88} />
          </mesh>
          {mood === 'concerned' && (
            <mesh
              position={[s * 0.148, potCenterY + 0.175, faceZ - 0.004]}
              rotation={[0, 0, s * -0.32]}
              scale={[0.058, 0.013, 0.012]}
            >
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color="#2C352E" roughness={0.78} />
            </mesh>
          )}
        </group>
      ))}

      {/* Gentle ceramic smile / expression */}
      <mesh position={[0, potCenterY - 0.015, faceZ]}>
        <tubeGeometry key={mood} args={[mouth, 16, 0.013, 8, false]} />
        <meshStandardMaterial color="#233028" roughness={0.68} />
      </mesh>
    </group>
  );
}

/**
 * Self-lit PalCharacter wrapper preserved for legacy PalWebGL compatibility.
 */
export function PalCharacter({
  variant,
  mood,
  play,
  reduced,
}: {
  variant: number;
  mood: PalMood;
  play: number;
  reduced: boolean;
}) {
  return (
    <>
      <ambientLight intensity={1.5} color="#f9e9d6" />
      <directionalLight position={[-2, 5, 6]} intensity={2.2} color="#fff0cd" />
      <directionalLight position={[3, 2, -3]} intensity={1.2} color="#c3e8bd" />
      <mesh position={[0, -0.88, -0.16]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.05, 0.51, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial color="#234D36" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <PalCharacterModel variant={variant} mood={mood} play={play} reduced={reduced} />
    </>
  );
}
