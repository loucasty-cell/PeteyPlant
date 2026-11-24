import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface LoadedGltfAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  meshCount: number;
  triangleCount: number;
}

export interface GltfValidationResult {
  valid: boolean;
  reason?: string;
  meshCount: number;
  triangleCount: number;
}

const loader = new GLTFLoader();
const assetCache = new Map<string, LoadedGltfAsset>();
const inFlight = new Map<string, Promise<LoadedGltfAsset | null>>();

/**
 * Validates that a loaded GLTF contains at least one renderable mesh with
 * finite bounding box coordinates before mounting it in the 3D scene.
 */
export function validateGltfAsset(gltf: GLTF): GltfValidationResult {
  if (!gltf?.scene) {
    return { valid: false, reason: 'GLTF archive has no root scene.', meshCount: 0, triangleCount: 0 };
  }

  let meshCount = 0;
  let triangleCount = 0;

  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      meshCount += 1;
      const geo = child.geometry;
      if (geo.index) {
        triangleCount += Math.floor(geo.index.count / 3);
      } else if (geo.attributes.position) {
        triangleCount += Math.floor(geo.attributes.position.count / 3);
      }
    }
  });

  if (meshCount === 0) {
    return { valid: false, reason: 'GLTF scene contains zero meshes.', meshCount: 0, triangleCount: 0 };
  }

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  if (bounds.isEmpty() || !Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.y)) {
    return { valid: false, reason: 'GLTF scene has invalid bounding box.', meshCount, triangleCount };
  }

  return { valid: true, meshCount, triangleCount };
}

/**
 * Loads and validates a GLB/GLTF asset asynchronously with caching and
 * request deduplication. Returns null cleanly if `url` is absent or fails so
 * the stage can render its verified procedural companion or static fallback.
 */
export async function loadSpeciesGltf(url: string | null): Promise<LoadedGltfAsset | null> {
  if (!url) return null;

  const cached = assetCache.get(url);
  if (cached) {
    return {
      ...cached,
      scene: cached.scene.clone(true),
    };
  }

  let promise = inFlight.get(url);
  if (!promise) {
    promise = new Promise<LoadedGltfAsset | null>((resolve) => {
      loader.load(
        url,
        (gltf) => {
          const check = validateGltfAsset(gltf);
          if (!check.valid) {
            resolve(null);
            return;
          }
          const loaded: LoadedGltfAsset = {
            scene: gltf.scene,
            animations: gltf.animations ?? [],
            meshCount: check.meshCount,
            triangleCount: check.triangleCount,
          };
          assetCache.set(url, loaded);
          resolve({
            ...loaded,
            scene: loaded.scene.clone(true),
          });
        },
        undefined,
        () => {
          resolve(null);
        },
      );
    }).finally(() => {
      inFlight.delete(url);
    });
    inFlight.set(url, promise);
  }

  return promise;
}

/**
 * Recursively disposes GPU geometries, materials, and texture maps on a Three.js
 * Object3D subtree to prevent WebGL memory leaks when switching plants or routes.
 */
export function disposeObject3D(root: THREE.Object3D | null | undefined): void {
  if (!root) return;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) {
            value.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}
