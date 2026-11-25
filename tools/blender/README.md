# Blender character workflow

Each authored companion has an editable source, a runtime GLB, a transparent WebP preview, and a `spec.json` record under `assets/characters/`. The record lists its exported clips, runtime counts, and visual review status. Runtime registration lives in `frontend/src/lib/three/speciesAssetRegistry.ts`.

Use Blender 5.2.2 LTS in a fresh background process. Builders start a separate scene from factory settings. Use each builder's `--help` for its arguments. For example, from the repository root:

```text
blender -b --factory-startup --python-exit-code 1 -P tools/blender/build_monstera.py -- --source assets/characters/monstera/source/monstera.blend --glb frontend/public/characters/monstera-v3.glb --renders artifacts/monstera
blender --disable-autoexec -b assets/characters/monstera/source/monstera.blend --python-exit-code 1 -P tools/blender/review_monstera.py -- artifacts/monstera --thumbnail frontend/public/characters/monstera-v3-preview.webp
blender -b --factory-startup --python-exit-code 1 -P tools/blender/build_pothos.py -- --source assets/characters/pothos/source/pothos.blend --glb frontend/public/characters/pothos-v1.glb --thumbnail frontend/public/characters/pothos-v1-preview.webp
```

Open a source file to inspect the editable pot, foliage, facial controls, and lighting. Unmute the NLA tracks that share a clip name to preview that expression. GLB exports include the character hierarchy and named animation tracks. Studio lighting and cameras remain in the source scene.

From the repository root, verify the saved Blender sources without opening or changing any files in the live Blender session.

```text
blender --disable-autoexec -b --factory-startup --python-exit-code 1 -P tools/blender/verify_characters.py
```

The source check samples the saved Idle actions between their first and last frames. It checks for motion, matching endpoint poses, and seven Ficus branch roots on the trunk centerline with a shared animation parent.

With the local API and web app running, verify the assets and the companion stage from the repository root. The first command requires Node 22.18 or newer. The browser check uses Playwright Chromium. Set `PETEY_BROWSER_CHANNEL=msedge` to use installed Edge.

```text
node frontend/verification/character-assets.mjs http://127.0.0.1:8000
node frontend/verification/characters.mjs http://127.0.0.1:3000 [screenshot-directory]
```

The asset check matches registry entries to the Garden catalog and source records, reads GLB bounds and clip names, samples each clip with Three.js, checks matching Idle endpoint poses, and enforces budgets of 2 MB and 50,000 triangles per GLB and 100 kB per preview. The stage check switches between authored species on one canvas, restores the renderer after WebGL context loss, checks the reduced-motion pose, and exercises both 3D and 2D fallback paths.

## V5 expansion

The [model folder and index](../../assets/characters/README.md) lists all editable masters. The shared runner takes a group name (`foliage`, `architecture` or `bloom`). Run an individual model with `--only <asset-id>`. An optional `--review-dir` writes a side render for each character.

```text
blender --disable-autoexec -b --factory-startup --python-exit-code 1 -P tools/blender/expansion_common.py -- foliage --only swiss-cheese-vine
python tools/blender/sync_expansion_registry.py
```

The Blender source keeps editable foliage pieces. The GLB exporter can consolidate rigid parts sharing the foliage control. After reviewing a new character, mark its spec `INTEGRATED`, sync the app registry, then run the source, GLB and browser checks above. Set `PETEY_TEST_EXPANSION=1` to require the three expansion representatives in the browser test.
