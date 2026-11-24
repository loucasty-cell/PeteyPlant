/**
 * Scalable Species 3D Asset Registry (Frontend Engineering V2 — Section 08).
 *
 * Designed to support:
 * - The 8 flagship companions today (distinct procedural botanical geometry +
 *   ready GLB drop-in slots)
 * - 64 planned launch species mapped cleanly across 50 master botanical models
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

const DEFAULT_CAMERA: CameraPreset = {
  position: [0, 1.04, 5.75],
  target: [0, 0.44, 0],
  fov: 35,
  minPolarAngle: Math.PI * 0.34,
  maxPolarAngle: Math.PI * 0.52,
};

const ALL_CORE_ANIMATIONS: CompanionAnimationId[] = [
  'idle',
  'sway',
  'greeting',
  'selected',
  'care_acknowledged',
  'resting',
];

/**
 * The 8 flagship botanical companions.
 * Currently backed by bespoke, species-accurate procedural Three.js rigs
 * (`assetStatus: 'procedural_fallback'`) because zero .glb/.blend files exist
 * in the repository. When Blender GLBs are added under `/assets/models/`,
 * set `modelUrl` and update `assetStatus` to `'authored'`.
 */
export const FLAGSHIP_SPECIES_MANIFEST: SpeciesAssetManifestEntry[] = [
  {
    speciesId: 'Monstera deliciosa',
    scientificName: 'Monstera deliciosa',
    commonName: 'Monstera',
    assetId: 'monstera_deliciosa_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_aroid_fenestrated',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.12, 6.05], target: [0, 0.48, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 0,
    traitLabel: 'The confident leader',
    botanicalSilhouetteNote: 'Broad asymmetrical heart-shaped leaves with deep fenestration lobes, curved petioles, and aerial root accents.',
  },
  {
    speciesId: 'Epipremnum aureum',
    scientificName: 'Epipremnum aureum',
    commonName: 'Golden Pothos',
    assetId: 'epipremnum_aureum_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_trailing_vine',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 0.96, 5.55], target: [0, 0.28, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 1,
    traitLabel: 'The friendly trailblazer',
    botanicalSilhouetteNote: 'Cascading trailing vines draping naturally over the pot rim with variegated heart-shaped leaves.',
  },
  {
    speciesId: 'Dracaena trifasciata',
    scientificName: 'Dracaena trifasciata',
    commonName: 'Snake Plant',
    assetId: 'dracaena_trifasciata_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_upright_sword',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.15, 6.05], target: [0, 0.54, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 2,
    traitLabel: 'The steady guardian',
    botanicalSilhouetteNote: 'Stiff upright sword blades rising in layered rosette planes with horizontal sage banding and golden margins.',
  },
  {
    speciesId: 'Chlorophytum comosum',
    scientificName: 'Chlorophytum comosum',
    commonName: 'Spider Plant',
    assetId: 'chlorophytum_comosum_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_arching_rosette',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.05, 5.85], target: [0, 0.38, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 3,
    traitLabel: 'The caring multitasker',
    botanicalSilhouetteNote: 'Fountain of slender cream-striped ribbon leaves paired with arching stolons holding miniature hanging plantlets.',
  },
  {
    speciesId: 'Aloe vera',
    scientificName: 'Aloe vera',
    commonName: 'Aloe Vera',
    assetId: 'aloe_vera_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_succulent_rosette',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.0, 5.45], target: [0, 0.36, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 4,
    traitLabel: 'The resourceful helper',
    botanicalSilhouetteNote: 'Thick, fleshy concave succulent spears arranged in a tight radial rosette with subtle marginal teeth.',
  },
  {
    speciesId: 'Dypsis lutescens',
    scientificName: 'Dypsis lutescens',
    commonName: 'Areca Palm',
    assetId: 'dypsis_lutescens_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_feathery_palm',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.24, 6.35], target: [0, 0.58, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 5,
    traitLabel: 'The sunny socialite',
    botanicalSilhouetteNote: 'Clustered ringed bamboo-like canes rising into graceful pinnate fronds with paired feathery leaflets.',
  },
  {
    speciesId: 'Goeppertia makoyana',
    scientificName: 'Goeppertia makoyana',
    commonName: 'Peacock Plant',
    assetId: 'goeppertia_makoyana_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_prayer_plant',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.04, 5.75], target: [0, 0.42, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 6,
    traitLabel: 'The elegant diva',
    botanicalSilhouetteNote: 'Slender upright stems holding broad oval leaves with feathered dark markings above and rich plum undersides.',
  },
  {
    speciesId: 'Ficus lyrata',
    scientificName: 'Ficus lyrata',
    commonName: 'Fiddle-Leaf Fig',
    assetId: 'ficus_lyrata_v1',
    modelUrl: null,
    thumbnailUrl: null,
    fallbackUrl: null,
    masterModelId: 'master_woody_ficus',
    assetVersion: '2.2.0-procedural',
    supportedAnimations: ALL_CORE_ANIMATIONS,
    cameraPreset: { ...DEFAULT_CAMERA, position: [0, 1.2, 6.2], target: [0, 0.56, 0] },
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    pivotOffset: [0, 0, 0],
    qualityTier: 'flagship',
    assetStatus: 'procedural_fallback',
    proceduralVariantIndex: 7,
    traitLabel: 'The ambitious believer',
    botanicalSilhouetteNote: 'Defined woody central trunk branching into sculpted, prominently veined violin-shaped leaves with undulating rims.',
  },
];

/**
 * Planned expansion map linking additional botanical genera / launch species
 * (up to 64 launch species across 50 master models) to the closest structural
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
  FLAGSHIP_SPECIES_MANIFEST.map((entry) => [entry.speciesId.toLowerCase(), entry]),
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
  for (const entry of FLAGSHIP_SPECIES_MANIFEST) {
    counts[entry.assetStatus] += 1;
  }
  return {
    flagshipCount: FLAGSHIP_SPECIES_MANIFEST.length,
    plannedLaunchSpeciesTarget: 64,
    plannedMasterModelsTarget: 50,
    counts,
  };
}
