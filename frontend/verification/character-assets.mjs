import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { FLAGSHIP_SPECIES_MANIFEST as companions, resolveSpeciesAsset } from '../src/lib/three/speciesAssetRegistry.ts';

const root = new URL('../../', import.meta.url);
const api = process.argv[2] ?? 'http://localhost:8000';
const response = await fetch(`${api}/api/v1/garden/species`);
assert(response.ok, `Garden catalog unavailable (${response.status})`);
const species = new Set((await response.json()).map(item => item.id));
const seenIds = new Set();
const seenPaths = new Set();
assert.equal(new Set(companions.map(entry => entry.speciesId)).size, companions.length, 'Duplicate species in character roster');

for (const entry of companions) {
  assert(species.has(entry.speciesId), `Unknown Garden species ${entry.speciesId}`);
  if (entry.assetStatus !== 'authored') continue;
  assert(entry.authoredClips && entry.modelUrl && entry.thumbnailUrl);
  assert(!seenIds.has(entry.assetId), `Duplicate character asset ID ${entry.assetId}`);
  seenIds.add(entry.assetId);
  const specPath = new URL(`assets/characters/${entry.assetId}/spec.json`, root);
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  assert.equal(spec.id, entry.assetId);
  assert.equal(spec.speciesId, entry.speciesId);
  assert.equal(String(spec.version), entry.assetVersion);
  assert.equal(spec.runtime, `frontend/public${entry.modelUrl}`);
  assert.equal(spec.thumbnail, `frontend/public${entry.thumbnailUrl}`);
  for (const path of [spec.source, spec.runtime, spec.thumbnail]) {
    assert(!seenPaths.has(path), `Duplicate asset path ${path}`);
    seenPaths.add(path);
    assert((await stat(new URL(path, root))).isFile(), `No file at ${path}`);
  }

  const glb = await readFile(new URL(spec.runtime, root));
  assert.equal(glb.subarray(0, 4).toString(), 'glTF');
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(glb.subarray(16, 20).toString(), 'JSON');
  const doc = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const clips = doc.animations.map(clip => clip.name);
  assert.deepEqual([...clips].sort(), [...spec.clips].sort());
  assert.equal(new Set(clips).size, clips.length, 'Duplicate exported clip names');
  const { moods, ...coreClips } = entry.authoredClips;
  for (const name of [...Object.values(moods), ...Object.values(coreClips)]) assert(clips.includes(name));

  let triangles = 0;
  for (const { primitives } of doc.meshes) {
    for (const primitive of primitives) {
      assert.equal(primitive.mode ?? 4, 4, 'Character meshes must use triangles');
      const position = doc.accessors[primitive.attributes.POSITION];
      assert.equal(position.type, 'VEC3');
      const { min, max } = position;
      assert(min?.length === 3 && max?.length === 3, 'Missing mesh position bounds');
      assert([...min, ...max].every(Number.isFinite), 'Non-finite mesh position bounds');
      assert(min.every((value, index) => value <= max[index]));
      const count = primitive.indices === undefined ? position.count : doc.accessors[primitive.indices].count;
      assert(count > 0 && count % 3 === 0, 'Invalid triangle index count');
      triangles += count / 3;
    }
  }
  assert.equal(glb.length, spec.glbBytes);
  assert.equal(triangles, spec.triangles);
  assert(glb.length <= 2_000_000 && triangles <= 50_000, 'Character exceeds the initial model budget');
  const thumbnail = await readFile(new URL(spec.thumbnail, root));
  assert.equal(thumbnail.toString('ascii', 0, 4), 'RIFF');
  assert.equal(thumbnail.toString('ascii', 8, 12), 'WEBP');
  const thumbnailBytes = thumbnail.length;
  assert(thumbnailBytes <= 100_000, 'Preview exceeds the 100 kB shelf budget');
  console.log(`${entry.speciesId}: ${glb.length} GLB bytes, ${triangles} triangles, ${thumbnailBytes} preview bytes, ${clips.length} clips`);
}
assert.equal(seenIds.size, companions.length, 'Each flagship should ship an authored companion');
assert.equal(resolveSpeciesAsset('Monstera sp.').entry.modelUrl, null);
assert.equal(resolveSpeciesAsset(null).entry.modelUrl, null);
console.log(`Garden catalog matched ${companions.length} companions and ${seenIds.size} authored assets.`);
