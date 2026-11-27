# Petey Plant handoff for Antigravity

Start each resumed or delegated work package with the [repo instructions](AGENTS.md) and the [engineering improvement playbook](docs/connect/SELF_IMPROVEMENT.md). Give the next agent the affected journey, owned files, current evidence, and the acceptance check. Return the tested revision, exact commands and remaining blocker to the integration owner.

[Project Connect](docs/connect/MASTER_PLAN.md#four-week-execution-plan) contains the four-week dependency plan, all 24 work packages, workstream ownership and release evidence requirements. Use the botanical art plan for per-species construction and the milestone log for completed checks.

The [engineering integrity plan](docs/connect/ENGINEERING_INTEGRITY.md) maps the new engineering and ML work to each week, with a feature-to-test map and [GitHub software workflow](.github/workflows/project-connect.yml). Week 1 automation runs the existing 648-case watering matrix and CPU ONNX release-denial fixtures. Next, obtain a reviewed private indoor corpus and verify its group isolation before any new baseline, and resume the first three remaining botanical models in parallel with that evidence collection.

The [58-asset detail plan](docs/botanical-art-plan.md) now records 37 deeper botanical passes, including the 24 from Project Connect. All 58 have editable Blender sources, animated GLBs and transparent previews. The Garden saves owner-entered pot capacity and potting mix. [PLANS.md](PLANS.md) records verification and remaining work.

Continue in `C:/Users/ASUS/Downloads/PeteyPlant`. Project Connect started on the verified GitHub `main` commit `a6a790a`. Check `git status --short -b` and GitHub `main` before carrying the current work forward. The original V4/V5 stash remains available as a reference.

## Blender assets

The 8 original companions and 50 V5 expansion species have editable Blender 5.2.2 sources. Read [the model index](assets/characters/README.md) before creating or replacing an asset. Each species folder has its own source and metadata. The spec points to the corresponding animated GLB and transparent WebP. New work belongs in the same structure. Add the model to the index so future agents can locate it.

| Prior owner | Scope | Builder |
| --- | --- | --- |
| Integration Spec | V5 #01–18, tropical foliage, vines and compact plants | `tools/blender/expansion_foliage.py` |
| Integration Standards | V5 #19–35, prayer plants, ferns, palms and woody plants | `tools/blender/expansion_architecture.py` |
| Art V5 | V5 #36–50, sculptural plants, succulents and flowering plants | `tools/blender/expansion_bloom.py` |

The three batches finished editable geometry, six animation clips per new asset, transparent previews and alternate-angle renders. The teams checked botanical silhouettes and source geometry. The Ficus branch fix was previously verified and is in the original roster. Models share the base pot and face rig while species foliage, growth habit, accent colors and flower forms vary. Owner art review is pending.

The app uses the existing single live Three.js stage and lazy WebP thumbnails on the roster. The shared export runner can consolidate rigid foliage for runtime while preserving separate editable parts in the saved .blend. The upgrade kept an original GLB when compaction increased the byte count or primitive count. Keep an existing Garden species ID when recording an accepted-name synonym. For five new plants Garden stores identity only. Care, simulation and Lens qualification have separate evidence requirements.

## Verification commands

Run FastAPI from `backend` against a disposable SQLite database, for example on port 18148. Set `PETEY_BACKEND_URL=http://127.0.0.1:18148` for Vite preview or dev and `PETEY_BROWSER_CHANNEL=msedge` for local Edge. The default character journey covers 20 representatives. Set `PETEY_TEST_EXPANSION=1` for the full 58-model journey.

```text
python tools/blender/sync_expansion_registry.py
blender --disable-autoexec -b --factory-startup --python-exit-code 1 -P tools/blender/verify_characters.py
node frontend/verification/character-assets.mjs http://127.0.0.1:18148
node frontend/verification/characters.mjs http://127.0.0.1:15147
node frontend/verification/garden.mjs http://127.0.0.1:15147
node frontend/verification/plant-tools.mjs http://127.0.0.1:15147
node frontend/verification/audit-identity.mjs
node tools/slop-audit.mjs
```

Run `python -m pytest -q` in `backend` and `npm test`, `npm run build` and `npm run verify:contrast` in `frontend`.

Checkup now binds advice to the plant species and drainage as well as the care history. Garden automatically migrates SQLite v0–v2 to v3. Preserve a v2 database backup before deploying over existing data. A rollback to the earlier backend requires that backup because it rejects the newer schema.

## Work still open

- Apply the calibrated geometry and material techniques to the remaining 21 Blender sources, using identity-specific references and front, rear and detail views. Start with Areca Palm, Peacock Plant and Split-Leaf Philodendron. The complete remaining roster is in the [art plan](docs/botanical-art-plan.md#remaining-roster--21-detailed-passes).

- If a GLB is ever regenerated, rerun its budget, actual clip motion, idle seam, and browser stage checks before calling it integrated.
- Profile GPU frame time, responsiveness and energy on a physical phone. Edge emulation verifies renderer behavior and responsive layout.
- Build per-plant appearance persistence and reviewed cultivar variants. Keep owner-controlled appearance linked to the plant ID and care history. The V5 request was species art, and the wider 64-species roadmap is a separate milestone.

- Pot capacity and potting mix are optional owner inputs. Watering volume remains open until a validated dose model can use adequate context. Background reminders still need subscription delivery and a service worker.
- Obtain a rights-reviewed, independently grouped indoor photo corpus. Then run the real Lens training and untouched holdout protocol in `backend/LENS.md`, followed by the hardware and calibration gates. The tiny ONNX test verified export compatibility. Lens production photo matching remains disabled.
- Keep the live Google Weather provider check, production auth and account recovery, mobile packaging and owner visual review open until tested.

Review artifacts are under `C:/Users/ASUS/Documents/Codex/2026-11-23/help-me-set-up-data-plugin/outputs`. The latest folders are `connect-spider`, `connect-aloe`, `connect-snake`, `connect-architecture`, `connect-architecture-wave-2`, `connect-bloom` and `project-connect-foliage`. The staged follow-up contact sheet is `connect-candidate-contact-sheet.png`. See [PLANS.md](PLANS.md) for the working log.

## Verified in the handoff session

- All 58 saved .blends reopened and passed the Idle animation pose check in Blender 5.2.2. The three model teams also inspected alternate-angle renders and checked the new foliage meshes.
- The asset verifier matched all 58 GLBs to the Garden catalog and sampled all 350 animation clips with Three.js. All 58 meet the model and thumbnail budgets. Golden Barrel Cactus went from 152 to 14 GLB primitives. There is no physical phone benchmark.
- All 395 backend tests passed, including the Garden-only identities and offline Lens trainer fixture. The production build and 25 contrast checks passed. Edge passed the Garden journey, three expansion scenes plus eight flagships, and a targeted saved Begonia check after its petiole correction. Vite still reports two large chunks.

## Completed in Wave 0–4 pass (2026-11-26)

- **Audit & ratchet (`P-01`–`P-13` tracked in [slop.md](slop.md)):** Added [tools/slop-audit.mjs](tools/slop-audit.mjs) and [tools/slop-budget.json](tools/slop-budget.json).
- **Backend care & clock fixes:** Enabled verified guidance on all `31` verified species (`48` unverified remain safely in `details`), added `advice_status` + `PATCH /api/v1/garden/plants/{plant_id}`, clamped future `captured_at` clock skew with idempotent retry support in [backend/services/garden.py](backend/services/garden.py), and stamped `provenance = "synthetic"` on [backend/services/petey_muse_botanical_engine.py](backend/services/petey_muse_botanical_engine.py) rows.
- **Honest UI & structural split:** Removed the permissive preview `'ready'` fallback, gated `PeteyLens` camera/upload on backend availability, replaced `crypto.randomUUID()` / `AbortSignal.any()`, split [GardenApp.tsx](frontend/src/components/garden/GardenApp.tsx) into focused shell/view/hook modules and extracted [frontend/src/lib/weather/themes.ts](frontend/src/lib/weather/themes.ts), aligned `DEV_PREVIEW_SPECIES`, and fixed `CheckupDialog` + `PeteyLens` heading styling.
- **3D polish & showcase:** Rebuilt Monstera lateral veins in [tools/blender/build_monstera.py](tools/blender/build_monstera.py), added dual saucer+pot contact shadows + aligned rim lighting in [InteractivePlantStage.tsx](frontend/src/components/garden/InteractivePlantStage.tsx), tuned camera presets in [speciesAssetRegistry.ts](frontend/src/lib/three/speciesAssetRegistry.ts), regenerated all `8` captures in [docs/images](docs/images), and kept `docs/flight_readiness.json` (`NO-GO`) intact.
- **Open work remaining:** Real indoor-plant Lens dataset + held-out run (`backend/LENS.md`), physical mobile GPU/battery profiling, `64`-species expansion + cultivar variants, quantitative `mL` watering engine fields + background Web Push, live Google Weather quota verification, and owner visual art approval.
