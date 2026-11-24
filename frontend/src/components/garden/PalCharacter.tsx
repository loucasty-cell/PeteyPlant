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
  Path,
  Shape,
  ShapeGeometry,
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

/** 0. Monstera deliciosa: smooth sculpted cordate leaf with curved fenestration lobes & oval holes */
function buildMonsteraBlade(): BufferGeometry {
  const shape = new Shape();

  // Start at petiole sinus (base center), sweep right basal lobe & smooth rounded fenestration notches up to tip
  shape.moveTo(0, 0.04);
  // Right basal heart lobe
  shape.bezierCurveTo(0.24, -0.10, 0.56, 0.04, 0.58, 0.28);
  // Right lower sinus notch (smooth U-curve)
  shape.bezierCurveTo(0.58, 0.34, 0.30, 0.35, 0.28, 0.39);
  shape.bezierCurveTo(0.27, 0.43, 0.58, 0.44, 0.57, 0.54);
  // Right mid-upper sinus notch
  shape.bezierCurveTo(0.56, 0.62, 0.27, 0.63, 0.26, 0.67);
  shape.bezierCurveTo(0.25, 0.71, 0.52, 0.74, 0.48, 0.84);
  // Smooth taper to acuminate apex
  shape.bezierCurveTo(0.42, 0.99, 0.19, 1.13, 0, 1.18);

  // Left side (slightly asymmetrical for organic botanical silhouette)
  shape.bezierCurveTo(-0.20, 1.12, -0.43, 0.98, -0.49, 0.83);
  // Left upper sinus notch
  shape.bezierCurveTo(-0.52, 0.73, -0.26, 0.70, -0.27, 0.66);
  shape.bezierCurveTo(-0.28, 0.62, -0.57, 0.61, -0.58, 0.52);
  // Left lower sinus notch
  shape.bezierCurveTo(-0.59, 0.43, -0.28, 0.42, -0.29, 0.38);
  shape.bezierCurveTo(-0.30, 0.34, -0.57, 0.32, -0.57, 0.26);
  // Left basal heart lobe returning to sinus
  shape.bezierCurveTo(-0.55, 0.03, -0.23, -0.10, 0, 0.04);

  // Two smooth elliptical inner fenestrations near the midrib
  const rightHole = new Path();
  rightHole.absellipse(0.18, 0.52, 0.048, 0.088, 0, Math.PI * 2, false, -0.22);
  shape.holes.push(rightHole);

  const leftHole = new Path();
  leftHole.absellipse(-0.17, 0.48, 0.045, 0.082, 0, Math.PI * 2, false, 0.2);
  shape.holes.push(leftHole);

  const geo = new ShapeGeometry(shape, 20);
  const posAttr = geo.attributes.position;
  const colors: number[] = [];
  const deep = new Color('#1D4830');
  const mid = new Color('#366E46');
  const vein = new Color('#84AE64');

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const t = Math.max(0, Math.min(1, y / 1.18));
    const absX = Math.abs(x);

    // Organic arched midrib + subtle concave leaf cupping
    const arch = Math.sin(t * Math.PI * 0.96) * 0.16 - t * t * 0.11;
    const cup = Math.max(0, 0.6 - absX) * 0.14 - Math.exp(-absX * 14) * 0.025;
    posAttr.setZ(i, arch + cup);

    // Smooth botanical midrib & lateral venation shading
    const midrib = Math.exp(-absX * 16) * 0.62;
    const lateral = Math.pow(0.5 + 0.5 * Math.sin(y * 19 - absX * 8), 8) * 0.16;
    const shade = deep
      .clone()
      .lerp(mid, Math.min(1, 0.35 + (1 - absX * 1.1) * 0.48 + t * 0.12))
      .lerp(vein, Math.min(0.75, midrib + lateral));
    colors.push(shade.r, shade.g, shade.b);
  }

  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 1. Epipremnum aureum (Golden Pothos): sculpted cordate heart leaf with irregular golden marbling */
function buildPothosBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const deep = new Color('#214B2C');
  const mid = new Color('#4B7E3E');
  const gold = new Color('#DFDA7F');
  const cream = new Color('#EFE9B4');
  const rows = 28;
  const cols = 10;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      // True cordate heart profile: rounded basal lobes dipping slightly below petiole, tapering to an acuminate point
      const basalDip = -0.11 * Math.exp(-Math.pow(t / 0.22, 2)) * Math.sin(absS * Math.PI);
      const heartWidth =
        Math.sin(Math.pow(t, 0.72) * Math.PI) * (1.28 - t * 0.62) +
        0.16 * Math.exp(-Math.pow((t - 0.16) / 0.12, 2));
      const x = heartWidth * s * 0.44;
      const y = t * 0.78 + basalDip;
      // Organic cupped midrib crease + gentle natural arch toward tip
      const arch = Math.sin(t * Math.PI * 0.95) * 0.11 - t * t * 0.08;
      const midribCrease = -Math.pow(1 - absS, 3) * 0.032 + (1 - absS) * 0.055;
      const z = arch + midribCrease;
      pos.push(x, y, z);

      // Irregular golden-cream variegation patches & feathered veins (not uniform stripes)
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

/** 2. Dracaena trifasciata (Snake Plant): stiff banded upright sword blade */
function buildSnakeSwordBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const darkBand = new Color('#214530');
  const sageBand = new Color('#628C5C');
  const goldEdge = new Color('#DFCF6F');
  const rows = 36;
  const cols = 8;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      // Taper cleanly to a stiff pointed sword tip
      const width = Math.sin(Math.min(1, t * 1.02) * Math.PI) ** 0.42 * (0.22 - t * 0.04);
      const twist = t * 0.42;
      const localX = width * s;
      const localZ = (1 - absS * absS) * 0.045;
      const rx = localX * Math.cos(twist) - localZ * Math.sin(twist);
      const rz = localX * Math.sin(twist) + localZ * Math.cos(twist);
      pos.push(rx, t * 1.55, rz);

      // Horizontal mottled chevron banding + distinct yellow margins
      const band = 0.5 + 0.5 * Math.sin(t * 42 + absS * 2.5);
      const margin = Math.pow(absS, 6);
      const color = darkBand.clone().lerp(sageBand, band * 0.78).lerp(goldEdge, margin * 0.92);
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

/** 3. Chlorophytum comosum (Spider Plant): graceful arching cream-striped ribbon */
function buildSpiderRibbonBlade(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const edgeGreen = new Color('#3E7344');
  const midGreen = new Color('#5B9455');
  const creamStripe = new Color('#EFEBC0');
  const rows = 30;
  const cols = 6;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const absS = Math.abs(s);
      const width = Math.sin(t * Math.PI) ** 0.5 * 0.085 * (1.15 - t * 0.35);
      // Graceful fountain arch rising then cascading downward
      const y = Math.sin(t * Math.PI * 0.86) * 0.85 - t * t * 0.16;
      const z = t * 1.18;
      pos.push(width * s, y, z);

      const stripe = absS < 0.36 ? 0.9 : 0;
      const color = edgeGreen.clone().lerp(midGreen, 1 - absS).lerp(creamStripe, stripe);
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

/** 4. Aloe vera: 3D volumetric thick fleshy succulent spear with marginal teeth */
function buildAloeSpear(): BufferGeometry {
  const geo = new BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const baseGreen = new Color('#366850');
  const fleshyGreen = new Color('#629D76');
  const paleTooth = new Color('#C9D8A2');

  const rows = 26;
  // Cross-section ring: 6 vertices around a thick concave-top, convex-back triangular spear
  const ringPts: [number, number][] = [
    [-1.0, 0.12],  // left serrated ridge
    [-0.35, -0.02], // inner concave top-left
    [0.35, -0.02],  // inner concave top-right
    [1.0, 0.12],   // right serrated ridge
    [0.5, -0.52],  // fleshy rounded back-right
    [-0.5, -0.52], // fleshy rounded back-left
  ];
  const ringLen = ringPts.length;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const taper = Math.pow(1 - t, 0.72);
    const toothPulse = r % 3 === 1 && r > 2 && r < rows - 2 ? 1.18 : 1.0;
    const w = 0.155 * taper;
    const thick = 0.11 * taper;
    const curveZ = t * t * 0.22;
    const y = t * 1.24;

    for (let k = 0; k < ringLen; k++) {
      const [rx, rz] = ringPts[k];
      const isEdge = k === 0 || k === 3;
      const px = rx * w * (isEdge ? toothPulse : 1);
      const pz = rz * thick + curveZ;
      pos.push(px, y, pz);

      const speckle = Math.pow(0.5 + 0.5 * Math.sin(t * 28 + k * 2.1), 5) * 0.3;
      const color = baseGreen
        .clone()
        .lerp(fleshyGreen, 0.35 + t * 0.5)
        .lerp(paleTooth, isEdge && toothPulse > 1 ? 0.92 : speckle);
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
      new Vector3(0.05, 0.28, -0.04),
      new Vector3(0.18, 0.16, 0.08),
      new Vector3(0.28, 0.01, 0.15),
    ]);
    return new TubeGeometry(curve, 16, 0.016, 6, false);
  }, []);

  useEffect(() => () => {
    blade.dispose();
    aerialRoot.dispose();
  }, [blade, aerialRoot]);

  const leaves = [
    { angle: 0.25, pitch: 0.72, scale: 0.96, stem: 0.56 },
    { angle: 1.32, pitch: 0.88, scale: 0.84, stem: 0.44 },
    { angle: 2.38, pitch: 0.65, scale: 1.05, stem: 0.62 },
    { angle: 3.45, pitch: 0.86, scale: 0.88, stem: 0.46 },
    { angle: 4.58, pitch: 0.70, scale: 1.0, stem: 0.58 },
    { angle: 5.55, pitch: 0.94, scale: 0.76, stem: 0.38 },
  ];

  return (
    <group>
      {/* Sturdy central climbing stem */}
      <mesh position={[0, 0.16, 0]} castShadow={castShadow}>
        <cylinderGeometry args={[0.055, 0.072, 0.34, 12]} />
        <meshStandardMaterial color="#2D5A3D" roughness={0.78} />
      </mesh>
      <mesh geometry={aerialRoot} castShadow={castShadow}>
        <meshStandardMaterial color="#8B7356" roughness={0.9} />
      </mesh>
      {leaves.map((l, idx) => (
        <group key={idx} rotation={[0, l.angle, 0]}>
          <group position={[0, 0.1, 0.05]} rotation={[l.pitch, 0, 0]}>
            <mesh position={[0, l.stem * 0.5, 0]} castShadow={castShadow}>
              <cylinderGeometry args={[0.022, 0.032, l.stem, 8]} />
              <meshStandardMaterial color="#346844" roughness={0.72} />
            </mesh>
            <mesh
              geometry={blade}
              position={[0, l.stem * 0.9, 0]}
              scale={[0.56 * l.scale, l.scale, l.scale]}
              castShadow={castShadow}
              receiveShadow={castShadow}
            >
              <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.68} metalness={0.01} />
            </mesh>
          </group>
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
