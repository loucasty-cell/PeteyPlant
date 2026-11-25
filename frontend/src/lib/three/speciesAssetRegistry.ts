import expansion from './speciesExpansion.json' with { type: 'json' };

/**
 * Scalable Species 3D Asset Registry (Frontend Engineering V2 — Section 08).
 *
 * Designed to support:
 * - The 8 flagship companions today (distinct procedural botanical geometry +
 *   ready GLB drop-in slots)
 * - 64 planned launch species, with 58 planned authored companions
 *
 * Honest status tracking:
 * - `authored`: Dedicated Blender-authored GLB present and verified.
 * - `imported`: Verified external GLB integrated and normalized.
 * - `procedural_fallback`: Species-specific Three.js procedural companion rendered
 *   until the authored GLB asset is placed at `modelUrl`.
 * - `missing`: No species-specific model exists yet; resolves to a master model
 *   or neutral botanical fallback.
 */

export type AssetStatus = 'authored' | 'imported' | 'procedural_fallback' | 'missing';
export type QualityTier = 'flagship' | 'standard' | 'lightweight';
export type CompanionAnimationId =
  | 'idle'
  | 'sway'
  | 'greeting'
  | 'selected'
  | 'care_acknowledged'
  | 'resting';

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  minPolarAngle: number;
  maxPolarAngle: number;
}

export interface SpeciesAssetManifestEntry {
  speciesId: string;
  scientificName: string;
  commonName: string;
  assetId: string;
  /** Expected relative path for authored GLB once exported from Blender; null when not yet shipped */
  modelUrl: string | null;
  /** Expected static thumbnail URL if pre-rendered; UI uses BotanicalThumbnail SVG when null */
  thumbnailUrl: string | null;
  fallbackUrl: string | null;
  masterModelId: string;
  assetVersion: string;
  supportedAnimations: CompanionAnimationId[];
  authoredClips?: {
    idle: string;
    greeting: string;
    careAcknowledged: string;
    moods: Partial<Record<'curious' | 'concerned' | 'relieved', string>>;
  };
  cameraPreset: CameraPreset;
  scale: [number, number, number];
  rotation: [number, number, number];
  pivotOffset: [number, number, number];
  qualityTier: QualityTier;
  assetStatus: AssetStatus;
  /** Flagship procedural index (0-7) used while GLB files are awaiting Blender production */
  proceduralVariantIndex: number;
  traitLabel: string;
  botanicalSilhouetteNote: string;
}

const publicRoot = import.meta.env?.BASE_URL ?? '/';

const DEFAULT_CAMERA: CameraPreset = {
  position: [0, 0.96, 5.15],
  target: [0, 0.38, 0],
  fov: 35,
  minPolarAngle: Math.PI * 0.34,
  maxPolarAngle: Math.PI * 0.52,
};

const DEFAULT_AUTHORED_CLIPS: NonNullable<SpeciesAssetManifestEntry['authoredClips']> = {
  idle: 'Idle',
  greeting: 'Notice',
  careAcknowledged: 'Celebrate',
  moods: { curious: 'Curious', concerned: 'Concerned', relieved: 'Relieved' },
};

const ALL_CORE_ANIMATIONS: CompanionAnimationId[] = [
  'idle',
  'sway',
  'greeting',
  'selected',
  'care_acknowledged',
  'resting',
];

// Each flagship retains its procedural rig for use when its authored model cannot load.
export const FLAGSHIP_SPECIES_MANIFEST: SpeciesAssetManifestEntry[] = [
  {
    speciesId: 'Monstera deliciosa',
    scientificName: 'Monstera deliciosa',
    commonName: 'Monstera',
    assetId: 'monstera',
    modelUrl: `${publicRoot}characters/monstera-v3.glb`,
    thumbnailUrl: `${publicRoot}characters/monstera-v3-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_aroid_fenestrated',
    assetVersion: '3',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0.35, 1.08, 6.45], target: [0, 0.56, 0] },
    scale: [0.87, 0.87, 0.87],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.91, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 0,
    traitLabel: 'The confident leader',
    botanicalSilhouetteNote: 'Broad asymmetrical heart-shaped leaves with deep fenestration lobes, curved petioles, and aerial root accents.',
  },
  {
    speciesId: 'Epipremnum aureum',
    scientificName: 'Epipremnum aureum',
    commonName: 'Golden Pothos',
    assetId: 'pothos',
    modelUrl: `${publicRoot}characters/pothos-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/pothos-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_trailing_vine',
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [-0.38, 0.96, 6.65], target: [0, 0.34, 0] },
    scale: [0.99, 0.99, 0.99],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.919, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 1,
    traitLabel: 'The friendly trailblazer',
    botanicalSilhouetteNote: 'Cascading trailing vines draping naturally over the pot rim with variegated heart-shaped leaves.',
  },
  {
    speciesId: 'Dracaena trifasciata',
    scientificName: 'Dracaena trifasciata',
    commonName: 'Snake Plant',
    assetId: 'snake-plant',
    modelUrl: `${publicRoot}characters/snake-plant-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/snake-plant-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_upright_sword',
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0.28, 1.08, 5.92], target: [0, 0.46, 0] },
    scale: [0.87, 0.87, 0.87],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.85, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 2,
    traitLabel: 'The steady guardian',
    botanicalSilhouetteNote: 'Stiff upright sword blades rising in layered rosette planes with horizontal sage banding and golden margins.',
  },
  {
    speciesId: 'Chlorophytum comosum',
    scientificName: 'Chlorophytum comosum',
    commonName: 'Spider Plant',
    assetId: 'spider-plant',
    modelUrl: `${publicRoot}characters/spider-plant-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/spider-plant-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_arching_rosette',
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 0.95, 6.55], target: [0, 0.32, 0] },
    scale: [0.94, 0.94, 0.94],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.85, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 3,
    traitLabel: 'The caring multitasker',
    botanicalSilhouetteNote: 'Fountain of slender cream-striped ribbon leaves paired with arching stolons holding miniature hanging plantlets.',
  },
  {
    speciesId: 'Aloe vera',
    scientificName: 'Aloe vera',
    commonName: 'Aloe Vera',
    assetId: 'aloe',
    modelUrl: `${publicRoot}characters/aloe-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/aloe-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_succulent_rosette',
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [-0.28, 0.96, 5.55], target: [0, 0.40, 0] },
    scale: [0.87, 0.87, 0.87],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.91, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 4,
    traitLabel: 'The resourceful helper',
    botanicalSilhouetteNote: 'Thick, fleshy concave succulent spears arranged in a tight radial rosette with subtle marginal teeth.',
  },
  {
    speciesId: 'Dypsis lutescens',
    scientificName: 'Dypsis lutescens',
    commonName: 'Areca Palm',
    assetId: 'areca-palm',
    modelUrl: `${publicRoot}characters/areca-palm-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/areca-palm-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_feathery_palm',
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0.42, 1.12, 6.40], target: [0, 0.48, 0] },
    scale: [0.87, 0.87, 0.87],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.889, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 5,
    traitLabel: 'The sunny socialite',
    botanicalSilhouetteNote: 'Clustered ringed bamboo-like canes rising into graceful pinnate fronds with paired feathery leaflets.',
  },
  {
    speciesId: 'Goeppertia makoyana',
    scientificName: 'Goeppertia makoyana',
    commonName: 'Peacock Plant',
    assetId: 'peacock-plant',
    modelUrl: `${publicRoot}characters/peacock-plant-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/peacock-plant-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_prayer_plant',
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [-0.36, 1.12, 6.12], target: [0, 0.45, 0] },
    scale: [0.85, 0.85, 0.85],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.85, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 6,
    traitLabel: 'The elegant diva',
    botanicalSilhouetteNote: 'Slender upright stems holding broad oval leaves with feathered dark markings above and rich plum undersides.',
  },
  {
    speciesId: 'Ficus lyrata',
    scientificName: 'Ficus lyrata',
    commonName: 'Fiddle-Leaf Fig',
    assetId: 'ficus',
    modelUrl: `${publicRoot}characters/ficus-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/ficus-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: 'master_woody_ficus',
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.10, 6.00], target: [0, 0.48, 0] },
    scale: [0.83, 0.83, 0.83],
    rotation: [0, 0, 0],
    pivotOffset: [0, -0.90, 0],
    qualityTier: 'flagship',
    assetStatus: 'authored',
    proceduralVariantIndex: 7,
    traitLabel: 'The ambitious believer',
    botanicalSilhouetteNote: 'Defined woody central trunk branching into sculpted, prominently veined violin-shaped leaves with undulating rims.',
  },
];

interface ExpansionAsset {
  speciesId: string;
  acceptedName: string;
  commonName: string;
  assetId: string;
  design: string;
  stageScale: number;
  fallback: number;
}

export const SPECIES_ASSET_MANIFEST: SpeciesAssetManifestEntry[] = [
  ...FLAGSHIP_SPECIES_MANIFEST,
  ...(expansion as ExpansionAsset[]).map((asset): SpeciesAssetManifestEntry => ({
    speciesId: asset.speciesId,
    scientificName: asset.acceptedName,
    commonName: asset.commonName,
    assetId: asset.assetId,
    modelUrl: `${publicRoot}characters/${asset.assetId}-v1.glb`,
    thumbnailUrl: `${publicRoot}characters/${asset.assetId}-v1-preview.webp`,
    fallbackUrl: null,
    masterModelId: asset.assetId,
    assetVersion: '1',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    authoredClips: DEFAULT_AUTHORED_CLIPS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.12, 6.5], target: [0, .38, 0] },
    scale: [asset.stageScale, asset.stageScale, asset.stageScale],
    rotation: [0, 0, 0],
    pivotOffset: [0, -.87, 0],
    qualityTier: 'standard',
    assetStatus: 'authored',
    proceduralVariantIndex: asset.fallback,
    traitLabel: 'Blender companion',
    botanicalSilhouetteNote: asset.design,
  })),
];

/**
 * Planned expansion map linking additional botanical genera / launch species
 * (up to 64 launch species) to the closest structural
 * master model so every catalog entry resolves deterministically and honestly.
 */
const GENUS_MASTER_FALLBACKS: Record<string, { masterModelId: string; proceduralVariantIndex: number }> = {
  monstera: { masterModelId: 'master_aroid_fenestrated', proceduralVariantIndex: 0 },
  philodendron: { masterModelId: 'master_aroid_fenestrated', proceduralVariantIndex: 0 },
  rhaphidophora: { masterModelId: 'master_aroid_fenestrated', proceduralVariantIndex: 0 },
  epipremnum: { masterModelId: 'master_trailing_vine', proceduralVariantIndex: 1 },
  scindapsus: { masterModelId: 'master_trailing_vine', proceduralVariantIndex: 1 },
  hedera: { masterModelId: 'master_trailing_vine', proceduralVariantIndex: 1 },
  dracaena: { masterModelId: 'master_upright_sword', proceduralVariantIndex: 2 },
  sansevieria: { masterModelId: 'master_upright_sword', proceduralVariantIndex: 2 },
  zamioculcas: { masterModelId: 'master_upright_sword', proceduralVariantIndex: 2 },
  chlorophytum: { masterModelId: 'master_arching_rosette', proceduralVariantIndex: 3 },
  nephrolepis: { masterModelId: 'master_arching_rosette', proceduralVariantIndex: 3 },
  aloe: { masterModelId: 'master_succulent_rosette', proceduralVariantIndex: 4 },
  haworthia: { masterModelId: 'master_succulent_rosette', proceduralVariantIndex: 4 },
  echeveria: { masterModelId: 'master_succulent_rosette', proceduralVariantIndex: 4 },
  crassula: { masterModelId: 'master_succulent_rosette', proceduralVariantIndex: 4 },
  dypsis: { masterModelId: 'master_feathery_palm', proceduralVariantIndex: 5 },
  chamaedorea: { masterModelId: 'master_feathery_palm', proceduralVariantIndex: 5 },
  howea: { masterModelId: 'master_feathery_palm', proceduralVariantIndex: 5 },
  goeppertia: { masterModelId: 'master_prayer_plant', proceduralVariantIndex: 6 },
  calathea: { masterModelId: 'master_prayer_plant', proceduralVariantIndex: 6 },
  maranta: { masterModelId: 'master_prayer_plant', proceduralVariantIndex: 6 },
  ctenanthe: { masterModelId: 'master_prayer_plant', proceduralVariantIndex: 6 },
  ficus: { masterModelId: 'master_woody_ficus', proceduralVariantIndex: 7 },
  schefflera: { masterModelId: 'master_woody_ficus', proceduralVariantIndex: 7 },
  pachira: { masterModelId: 'master_woody_ficus', proceduralVariantIndex: 7 },
};

const MANIFEST_BY_ID = new Map<string, SpeciesAssetManifestEntry>(
  SPECIES_ASSET_MANIFEST.map((entry) => [entry.speciesId.toLowerCase(), entry]),
);

export interface ResolvedSpeciesAsset {
  entry: SpeciesAssetManifestEntry;
  exactMatch: boolean;
}

export function resolveSpeciesAsset(speciesId: string | null | undefined): ResolvedSpeciesAsset {
  if (speciesId) {
    const exact = MANIFEST_BY_ID.get(speciesId.trim().toLowerCase());
    if (exact) {
      return { entry: exact, exactMatch: true };
    }
    const genus = speciesId.trim().toLowerCase().split(/\s+/)[0];
    const mapped = GENUS_MASTER_FALLBACKS[genus];
    if (mapped) {
      const baseEntry = FLAGSHIP_SPECIES_MANIFEST[mapped.proceduralVariantIndex] ?? FLAGSHIP_SPECIES_MANIFEST[0];
      return {
        exactMatch: false,
        entry: {
          ...baseEntry,
          modelUrl: null,
          thumbnailUrl: null,
          authoredClips: undefined,
          speciesId,
          scientificName: speciesId,
          commonName: speciesId,
          assetId: `fallback_${genus}`,
          masterModelId: mapped.masterModelId,
          assetStatus: 'missing',
          qualityTier: 'standard',
        },
      };
    }
  }

  return {
    exactMatch: false,
    entry: {
      ...FLAGSHIP_SPECIES_MANIFEST[0],
      modelUrl: null,
      thumbnailUrl: null,
      authoredClips: undefined,
      speciesId: speciesId ?? 'unidentified',
      scientificName: speciesId ?? 'Unidentified houseplant',
      commonName: speciesId ?? 'Houseplant',
      assetId: 'fallback_generic_houseplant',
      assetStatus: 'missing',
      qualityTier: 'lightweight',
    },
  };
}

export function getRegistryCoverageSummary() {
  const counts: Record<AssetStatus, number> = {
    authored: 0,
    imported: 0,
    procedural_fallback: 0,
    missing: 0,
  };
  for (const entry of SPECIES_ASSET_MANIFEST) {
    counts[entry.assetStatus] += 1;
  }
  return {
    flagshipCount: FLAGSHIP_SPECIES_MANIFEST.length,
    plannedLaunchSpeciesTarget: 64,
    plannedMasterModelsTarget: 58,
    counts,
  };
}
