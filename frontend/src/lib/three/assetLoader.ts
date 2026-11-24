import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedGltfAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  meshCount: number;
  triangleCount: number;
  release: () => void;
}

type SourceAsset = Omit<LoadedGltfAsset, 'release'>;
type SharedAsset = { source: Promise<SourceAsset | null>; leases: number };

const loader = new GLTFLoader();
const assets = new Map<string, SharedAsset>();

function validateGltfAsset(gltf: GLTF) {
  let meshCount = 0;
  let triangleCount = 0;
  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const count = child.geometry.index?.count ?? position?.count ?? 0;
    if (count < 3 || !position) return;
    meshCount += 1;
    triangleCount += Math.floor(count / 3);
  });
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const valid = meshCount > 0 && !bounds.isEmpty() &&
    [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite);
  return { valid, meshCount, triangleCount };
}

async function loadSource(url: string): Promise<SourceAsset | null> {
  try {
    const gltf = await loader.loadAsync(url);
    const { valid, meshCount, triangleCount } = validateGltfAsset(gltf);
    if (!valid) {
      disposeSource(gltf.scene);
      return null;
    }
    return { scene: gltf.scene, animations: gltf.animations, meshCount, triangleCount };
  } catch {
    return null;
  }
}

// A scene clone owns its transforms and skeletons. Its GPU geometry, materials,
// and textures stay shared for the lifetime of all mounted and pending leases.
export async function loadSpeciesGltf(url: string): Promise<LoadedGltfAsset | null> {
  let shared = assets.get(url);
  if (!shared) {
    shared = { source: loadSource(url), leases: 0 };
    assets.set(url, shared);
  }
  const lease = shared;
  lease.leases += 1;
  const source = await lease.source;
  let released = false;
  let scene: THREE.Group | undefined;
  function release() {
    if (released) return;
    released = true;
    scene?.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
    });
    lease.leases -= 1;
    if (lease.leases === 0) {
      assets.delete(url);
      if (source) disposeSource(source.scene);
    }
  }
  if (!source) {
    release();
    return null;
  }
  try {
    scene = clone(source.scene) as THREE.Group;
    return { ...source, scene, release };
  } catch {
    release();
    return null;
  }
}

function disposeSource(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  root.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        textures.add(value);
        if (typeof ImageBitmap !== 'undefined' && value.source.data instanceof ImageBitmap) {
          images.add(value.source.data);
        }
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  for (const image of images) image.close();
}
