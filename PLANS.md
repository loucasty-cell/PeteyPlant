# Petey Plant development roadmap

The [Project Connect plan](docs/connect/MASTER_PLAN.md#four-week-execution-plan) records the four-week sequence, all 24 work packages, dependencies and acceptance evidence. The milestones below record completed work and checks.

Product focus: a busy plant owner opens Petey, knows which plant to check, and sees a care record they can trust. The greenhouse collection and character moments support that task. Pricing is out of scope.

## Repository audit

- Baseline `fc04589` on `main`. Six local concept PNGs and four standalone mascot source files were present before this work. The checked-in runtime used procedural React Three Fiber meshes and a single canvas. No tracked Blender source or GLB was present. Blender 5.2 was found installed. No character assets were authored in Blender in this pass.
- The original UI tracked simulated watering per species in memory. The backend independently tracked synthetic demo instances and awarded different XP. The lab selected the first backend plant for its diagnostic trace. Default CORS excluded the Vite dev and preview ports. The lab trace now looks for a matching species and falls back to its local trace when no matching demo plant exists. The router offered no real plant creation workflow before this change.
- The starter species catalog has 79 records. Verified qualitative fields and approximate simulation inputs are stored separately. The substrate dataset is available and currently separate from the operational care rules. Muse remains a deterministic fallback.
- Baseline evidence: frontend build and legacy contrast check passed. Backend baseline: 134 tests passed.

## This milestone’s verification

- The backend suite passed 139 tests, including 5 new garden cases. The Vite build and 21 contrast pairs passed. The legacy Plant Lab chunk is 1.20 MB before gzip and loads only when opened.
- Edge completed the garden journey against FastAPI and an isolated SQLite database. It restored the onboarding draft, saved a plant, handled a failed care request, retried, recorded watering and retained history after refresh. It also opened Plant Lab and checked home layout at 320, 375, 768, 1024 and 1440px. Desktop home and mobile collection and care screenshots were inspected.
- No physical phone, screen reader or production deployment was tested.

## Phases

| Phase | Status | Relevant work and acceptance evidence |
| --- | --- | --- |
| 0. Discovery | VERIFIED | Local checkout and assets inspected, independent backend baseline passed. |
| 1. Engineering foundation | IN_PROGRESS | `backend/services/garden.py`, `backend/tests/test_garden.py`, `frontend/src/lib/gardenApi.ts`. SQLite plant IDs and care events, same-key retry protection, garden scoping and corrected CORS. Account recovery, cross-device use and production authorization are pending. |
| 2. Botanical foundation | IN_PROGRESS | The app displays verified watering guidance and sources where available. Actionable observation rules currently cover Monstera deliciosa and Golden Pothos. Expand audited rules and substrate integration before treating other species as supported for watering suggestions. |
| 3. Design system | NEEDS_REVIEW | `frontend/src/components/garden/garden.css` scopes the greenhouse palette, typography, spacing and responsive layouts. Check visual screenshots and interactions alongside the default product journey. |
| 4. Onboarding | VERIFIED | Two-step catalog search and pot context, unknown species option, draft restored in the same tab after refresh. A real plant is saved. Resume across devices and additional onboarding polish are pending. |
| 5. Plant care | VERIFIED | `GardenApp.tsx` uses API-backed recommendations, reports, care history and estimated check dates. Standalone lab remains isolated. Alerts, plant editing and advanced diagnostics are pending. |
| 6. Blender production | NOT_STARTED | Establish editable source, export, scale and mobile asset validation using the installed Blender. |
| 7. Hero Monstera | NOT_STARTED | Author and verify one flagship rig in the real plant profile. The pictured companion is existing concept art. |
| 8. Original eight | NOT_STARTED | Extend the validated Monstera pipeline to seven distinct rigs. Eight source-art crops are already visible in Plant Pals. |
| 9. Motion architecture | NOT_STARTED | Verify UI transitions, asset animation and natural foliage motion with reduced-motion settings. |
| 10. Collection expansion | NOT_STARTED | Confirm species IDs and asset provenance before expanding the art roster to 64. |
| 11. Notifications and scheduling | NOT_STARTED | Add consent, timezone and quiet hours, idempotent reminders, and snooze. Current next-check dates are suggestions in the app. |
| 12. Product polish | NOT_STARTED | Refine after the actual garden journey and character assets are reviewed. |
| 13. Performance, security and accessibility | IN_PROGRESS | Lazy-load Plant Lab. Exercise real browser layout and failure states via `frontend/verification/garden.mjs`. Review accessibility, local data isolation and low-end device performance before release. |
| 14. Release verification | NOT_STARTED | Run full browser, backend, performance and device checks when release scope is established. |

## Local garden details

`PETEY_GARDEN_DB` may point to a separate SQLite file for testing. The default is `backend/garden.sqlite`. The browser stores a random garden key locally. It provides isolation for this local workflow. Clearing site data or changing browsers loses the key. Production accounts, recovery, cross-device support and deployment safeguards are separate work.

Check dates are rough follow-up suggestions based on the last recorded observation. They are never moisture readings or automatic watering schedules. Plant Lab is explicitly a demo and has separate synthetic data.

## Next priority

Review the first garden journey on a real phone and extend the evidence-backed care rules before expanding the visual roster. Integrate one tested animated companion when the app and art direction are approved.

## Lens, plant health and live companions

- [x] Integrate the camera/gallery and manual species selection with the real garden. Camera and manual entry preserve a user confirmation before a plant is saved.
- [x] Replace the reference picture on Garden and Plant Pals with eight live Three.js companions. An active care status changes the expression. Health reactions use owner observations. Camera results can choose the companion after species confirmation when a qualified artifact is enabled.
- [x] Add source-linked checks for ambiguous wilt, standing water, likely pests, plant spots, and light stress. The health check is advisory and currently does not update the saved garden record. Guided watering still requires a separate, fresh dry reading and confirmed drainage.
- [x] Audit a versioned photo manifest, detect exact and near-duplicate leaks, validate grouped splits, score a pinned local ONNX model and fit the species acceptance policy exclusively on validation predictions. Add offline symptom/stress tooling and report missing evidence as unavailable.
- [ ] Assemble the eight-species independent indoor dataset, with explicit physical plant IDs, rights and ownership trail, indoor scenarios, OOD captures and verified symptom annotation. Data from the camera app is not collected for research.
- [ ] Run the real symptom baseline and fine-tuning ladder, OOD and hardware comparisons, stress trials, calibration, export parity, and final holdout evaluation. Qualified weights and a representative split are unavailable.
- [ ] Expand to 64 species, multi-photo fusion, and validated image-derived symptom reactions after the first release gates pass.

See [Lens runtime and candidate audit](backend/LENS.md) and [dataset and evaluation workflow](backend/lens_pipeline/README.md).

## 2026-11-24 AI Studio integration audit

Baseline `1382fd4` includes the AI Studio interface and the expanded weather themes. The earlier V4/V5 implementation is available in the named local Git stash. It has overlap in the Garden, Health, API client, and character components.

| Priority | Evidence | Impact |
| --- | --- | --- |
| High | `GardenApp.tsx:547`, `careIntelligence.ts:603`, `backend/services/garden.py:135` | The client retains a ready status in an open tab after the dry observation expires. Home and the hydration cart can continue to advise watering. The preceding revision refreshed when the tab became visible. |
| High | `GardenApp.tsx:864` and `:897`, `backend/services/garden.py:219` | Care retries allocate new IDs. If SQLite commits and the reply is lost, the next attempt can record the same watering twice. The prior frontend reused its pending event ID. |
| High | `.env.example:2`, `frontend/package.json:37`, `backend/main.py:51` | The documented direct API path from port 3000 returns HTTP 400 on CORS preflight. The local Vite proxy returned an available status with the same backend. |
| High before GLB activation | `InteractivePlantStage.tsx:109` and `:134`, `assetLoader.ts:69` | Animation cleanup disposes scene resources on animation changes. Cached clones share geometries, materials, and textures. Concurrent loads can also return the same scene instance. |
| Medium | `gardenApi.ts:327`, `GardenApp.tsx:922` | The demo accepts dry soil as sufficient for ready even when drainage is unknown. The real dry-observation toast promises watering after the server returns an unready result. |
| Medium | `GardenApp.tsx:1127` and `:1902` | The plant switcher lacks listbox focus behavior. Reminder settings imply in-tab delivery, while the app only stores preferences and requests permission. |

Baseline evidence from the Windows checkout

- Production build passed. Vite reported a 1,540.80 kB entry chunk, 433.16 kB gzip. These are build sizes.
- All 357 backend tests passed. All 25 existing contrast assertions passed. The contrast script covers its defined swatches.
- The isolated FastAPI Lens endpoint reported unavailable with no configured release manifest. Data lineage, independent indoor holdout, calibrated abstention, and a reproducible model run remain release evidence requirements.
- The live Blender bridge reported the editable Monstera scene. The current app registry covers eight procedural companions and activates zero authored GLBs. The Monstera source, runtime GLB, and preview are preserved in the stash.

### Proposed integration design

Keep the AI Studio screens and use FastAPI and SQLite as the authority for observations, actionable recommendations, and saved history. Port the relevant stash changes into the current screens, verify freshness on expiry and resume, and reuse one event identity for every retry of the same write. Weather remains labeled outdoor context. Lens remains explicitly unavailable until a real artifact clears the qualification gate.

The other approaches considered are applying the stash wholesale and maintaining two competing garden experiences. A selective port preserves the current screen structure and lets each backend contract be verified through the live product.

Make Monstera the first authored companion through the current registry after fixing GLB ownership and clip lifecycle. Author the remaining seven as editable Blender masters with species-specific silhouettes and movement. Each asset needs review from multiple angles, loop and deformation checks, an exported GLB budget, an app screenshot at phone and desktop widths, a reduced-motion pose, and a labeled fallback. Start with the reference's trailing Pothos and upright Snake Plant to prove that the pipeline supports visibly different growth habits. Track cultivars as separate deliverables.

### Additional verification and remaining plan criteria

- Edge opened the real empty garden through the isolated FastAPI proxy with reduced motion. Document width matched viewports at 320, 390, 768, and 1440 px with zero JavaScript page errors in this smoke check. The existing full journey stops at the renamed onboarding button before exercising persistence.
- The empty garden showed an example 22°C value labeled Outdoor with no observation. The live weather mapper also fills missing numeric fields before marking its output as provider data. Carry source and missingness per value.
- The current workspace declaration prevents the documented clean npm install. The standards review reproduced npm EUSAGE with a dry-run from frontend because there is only a child lockfile.
- Plant Health assessment still sends a generic triage request. The V4 criteria require a plant-bound assessment with confirmed observations and persisted provenance. The V5 criteria also require appearance configuration tied to that same persistent plant.

### Approved implementation sequence

- Reproduce and fix the clean install and origin mismatch. Verify npm lockfile resolution and the FastAPI preflight from port 3000.
- Port the plant-bound Checkup policy and SQLite migration with explicit confirmation, evidence provenance, and expiration. Run policy and API regressions.
- Wire Checkup into the current profile, preserve care write IDs across retries, and invalidate expired recommendations across Home and the cart. Exercise real SQLite persistence and failure paths in Edge.
- Mount the preserved Blender Monstera in the current stage. Verify shared resource lifetime, animation, and fallback before adding distinct authored species.
- Review the Lens release gate and keep production abstention in place until qualification evidence exists. Record actual results and unfinished criteria here.

## Resume after usage reset

The approved integration is in the working tree at `1382fd4`. Keep the named
pre-sync V4/V5 stash as a reference. No branch was pushed. The working tree
contains the current source, tests, Blender builders, eight asset specs and
eight editable .blend files. The fixed Ficus source starts every branch on its
animated trunk centerline. Its regenerated GLB is 973,632 bytes with 40,068 triangles.

### Verified integration

- `python -m pytest -q` from backend passed 391 tests with Checkup and Lens gate changes.
- `npm run build` from frontend passed. Lazy-loading the scene reduced the main bundle from 433 kB to 167 kB gzip. The entry and shared Three.js chunks still trigger size warnings.
- The 10 care logic tests passed. Direct API CORS preflight passed from both loopback port-3000 origins. The npm clean-install offline dry run and mocked sparse-weather intake passed.
- The Edge garden journey exercised the current interface, real SQLite, wet observation persistence, surface-only dry evidence, eligible dry check, recommendation expiry while open and idempotent retry after deliberately discarding a committed response.
- The roster validator passed all eight catalog-linked Blender assets. Each carries six or more named animation clips and fits its GLB and preview budgets. Edge rendered all eight on desktop and emulated 375 px touch, with one live canvas and verified reduced motion, context restoration and fallback behavior. Individual Blender passes checked geometry and multiple views. Physical phone frame time, power and owner visual approval remain open.
- Lens correctly returned unavailable without a release manifest. The new report gate checks independent plant-group uncertainty. Existing classification fixtures verify behavior, while a qualified held-out model run remains required.

### 2026-11-24 Visual Showcase, Art Audit & Documentation Milestone

- Automated showcase capture: `node tools/capture_showcase.mjs` executed in headless MS Edge with SwiftShader WebGL, capturing 8 production-grade screenshots across living garden desktop, full 8-companion 3D roster, soil checkup modal, plant detail profile, health triage, Petey Lens, biophysical Plant Lab, and mobile viewport.
- 391 backend unit & regression tests passed (`python -m pytest -q`).
- Frontend production build passed (`tsc --noEmit && vite build`).
- Frontend WCAG AA contrast audit passed (`node verification/contrast.mjs`).
- Cleaned root intermediate artifacts (`monstera.blend` duplicate removed; canonical source preserved in `assets/characters/monstera/source/monstera.blend`).
- Overhauled [README.md](README.md) with comprehensive workflow explanations, honest provenance disclosures, botanical tables, and high-impact visual captures.
- Second README pass: documents the real `care_policy.py` decision ladder, the eight asset records (clips, triangles, GLB bytes), the Lens NO-GO state and the OpenCode slash commands. Removed the claims that photo matching works, that Ficus is a rubber tree, and that Plant Lab has a root-rot brake; none matched the code.
- Registered the local agent skills as slash commands in `~/.config/opencode/commands` (369 skill commands after skipping the three that collide with built-in commands). Commands are static, so adding a skill requires regenerating them; `@skill-id` works without a command.

## 2026-11-26 Lens and character verification

- Repaired the Plant Tools browser test for the current Lens and four-step condition check. Edge verified the unavailable-model manual path, synthetic camera capture and stream cleanup, review before upload, JPEG retry, fixture match comparison, interactive Monstera preview, and confirmed plant creation against FastAPI and isolated SQLite. The mobile confirmation action now sits above the navigation at 375 px. The test passed against the Vite production preview.
- Reopened all eight masters in Blender 5.2.2. All saved Idle actions moved and matched at their first and last sampled poses. Ficus still has seven petioles rooted on the trunk centerline with the same motion parent. The Monstera review rendered four expression poses and found no non-manifold edges on its six main leaf meshes. The Blender check is repeatable with the commands in [the character workflow](tools/blender/README.md).
- Three.js loaded the eight production GLBs, sampled all 50 named clips for visible model transforms, and confirmed matching first and last Idle poses. All eight passed the existing geometry and file-size budgets. Edge exercised the eight authored companions, reduced motion, lost and restored WebGL, and preview fallbacks.
- Recovered the documented offline species-head trainer and its tests from the saved V4/V5 work. The shared manifest audit accepts train/validation for development and still requires all three splits by default. The trainer rejects holdout rows before opening photos. A small fixture verified seeded training and compatible ONNX logits. No representative accuracy or latency was measured.
- The production build, 25 automated contrast checks, and all 394 backend tests passed. Vite still reports large entry and shared Three.js chunks.

Lens release still requires independently grouped, rights-reviewed indoor photos and a qualified held-out run. Browser emulation covers layout and fallback behavior. Phone GPU frame time and power still require a physical device. Per-plant appearance, verified cultivar variants, and the expanded authored roster remain open.

## 2026-11-26 V5 roster expansion

- Added all 50 species from the V5 roster for 58 editable, catalog-linked companions. The three art batches are saved in [the shared model folder](assets/characters/README.md) with an editable .blend, animated GLB, WebP preview, and asset spec for every species. Use that folder structure for future models.
- Blender reopened all 58 sources. The three art teams reviewed alternate angles and audited geometry. The Begonia revision explicitly attaches all six leaf stems to its three cane centerlines. Three.js matched all 58 assets to the Garden catalog and sampled motion in every one of the 350 clips. Every model and preview passed the asset budgets.
- The expanded shelf uses lazy static images and mounts no canvas for an individual card. Edge passed the Garden flow and 58-card shelf checks, and the active stage checks used all eight flagships and three expansion examples. Browser emulation covered desktop and 375 px mobile, context restore, reduced motion and fallback paths.
- All 395 backend tests, the production build, and 25 contrast checks passed. Five new Garden identity records enable saving those species without introducing care or simulation measurements. Physically benchmark mobile rendering before changing the renderer or claiming phone performance.
- The renderer can consolidate rigid foliage mesh groups in runtime exports while retaining editable source parts. For example, Golden Barrel Cactus went from 152 to 14 GLB primitives.

[Antigravity handoff](ANTIGRAVITY_HANDOFF.md) records the local state, verification commands, and remaining Lens, customization and release work. The 64-species roadmap, per-plant appearance, reviewed cultivar variants, real mobile performance and owner art review are open.

## 2026-11-26 Combined Handoff Execution (Waves 0–4)

- **Wave 0 (Audit & ratchet):** Added [tools/slop-audit.mjs](tools/slop-audit.mjs) and [tools/slop-budget.json](tools/slop-budget.json) (`0` TS type escapes, `0` TODO markers, `0` console logs, `0` runtime `crypto.randomUUID`/`AbortSignal.any`, `care_decision_authorities: 1`) plus parameterized care-matrix and checkup clock-skew regression tests.
- **Wave 1 (Core Care Reachable — P-01, P-04, P-05):** Fixed [backend/services/garden.py](backend/services/garden.py) `check_prompt_for` and `source is not None` gating so all 31 species with verified botanical care sources reach `ready` on dry soil (and 48 identity-only species stay cleanly in `details` without fabricated watering advice); added `advice_status` + verified-first sort on `GET /species`, extracted [AddPlantFlow.tsx](frontend/src/components/garden/AddPlantFlow.tsx) with verified/identity-only status labels, and added `PATCH /plants/{plant_id}` + inline species/drainage editing in [PlantDetailProfile.tsx](frontend/src/components/garden/PlantDetailProfile.tsx) with specific copy for `species_id === null`.
- **Wave 2 (Honest Controls & Compatibility — P-02, P-03, P-06, P-07):** Clamped future `captured_at` in `verify_snapshot` and handled skewed-clock idempotent retries cleanly; removed the false `'ready'` / `'Dry mix noted · watering suggested'` preview fallback in [gardenApi.ts](frontend/src/lib/gardenApi.ts) and [GardenApp.tsx](frontend/src/components/garden/GardenApp.tsx); disabled `Open camera` & `Upload photo` on [PeteyLens.tsx](frontend/src/components/garden/PeteyLens.tsx) when backend identification is unavailable; replaced all `crypto.randomUUID()` and `AbortSignal.any()` calls with `createUuid` and `withTimeoutSignal`.
- **Wave 3 (Structural Split & UI Polish — P-08, P-09, P-10, P-11):** Extracted [themes.ts](frontend/src/lib/weather/themes.ts) from [weatherService.ts](frontend/src/lib/weatherService.ts); split [GardenApp.tsx](frontend/src/components/garden/GardenApp.tsx) into [useGardenWorkspace.ts](frontend/src/components/garden/useGardenWorkspace.ts), [GardenShellNav.tsx](frontend/src/components/garden/GardenShellNav.tsx), [GardenHomeView.tsx](frontend/src/components/garden/GardenHomeView.tsx), [GardenCollectionView.tsx](frontend/src/components/garden/GardenCollectionView.tsx), and [GardenMoreView.tsx](frontend/src/components/garden/GardenMoreView.tsx); synced `DEV_PREVIEW_SPECIES` `advice_status` with `SpeciesCatalog`; fixed `CheckupDialog` modal styling in [checkup.css](frontend/src/components/garden/checkup.css) using `--petey-*` tokens, suppressed programmatic heading focus outlines in [index.css](frontend/src/index.css), fixed sidebar Lens active pill & badge spacing in [companion-stage.css](frontend/src/components/garden/companion-stage.css), and added `390px` horizontal-overflow checks.
- **Wave 4 (Blender 3D & Showcase — P-12, P-13):** Rebuilt Monstera lateral veins in [build_monstera.py](tools/blender/build_monstera.py) with 7-point surface-conforming curves (`monstera.blend` / `monstera-v3.glb`), added dual saucer+pot `CanvasTexture` contact shadows and aligned rim lighting in [InteractivePlantStage.tsx](frontend/src/components/garden/InteractivePlantStage.tsx), tuned per-species camera framing in [speciesAssetRegistry.ts](frontend/src/lib/three/speciesAssetRegistry.ts), fixed open-modal and clean-tile capture in [capture_showcase.mjs](tools/capture_showcase.mjs), and regenerated all 8 captures in `docs/images/`.
- **Remaining open unknowns:** Physical mobile GPU frame-time/thermal profiling, live Google Weather quota/key check on deployment, real indoor plant dataset & held-out qualification for Lens (still `NO-GO` in `docs/flight_readiness.json`), 64-species expansion, per-plant/cultivar appearance, and owner art approval.

## 2026-11-26 Greenhouse presentation and botanical detail

- Based on `origin/main` at `34acb8a`. The greenhouse vignette and action gradients use `#111C15`, forest and sage. Care surfaces stay light. Roster portraits grow to 116 px while retaining lazy loading, trait and asset status. Cards lift on pointer hover and controls press on activation. Reduced motion removes translation.
- The live stage uses one radial shadow texture for the saucer and pot contacts. Blender 5.2.2 rebuilt Swiss Cheese Vine pigment veins, Maidenhair Fern fanlet pigment, and Polka Dot Begonia's asymmetric wings and surface-projected spots. Begonia dropped from 634,900 to 363,744 bytes and 23,456 to 13,016 triangles. The three exports retain their six named clips and primitive counts.
- Blender reopened all 58 sources and checked their Idle seams. The Three.js asset verifier checked 58 models and sampled the 350 clips. Edge passed the Garden journey, roster widths down to 320 px, card hover and reduced motion, 11 representative live scenes on desktop and mobile, and WebGL loss and fallback cases. The production build, 28 contrast checks and CSS/code ratchet passed. The existing Vite chunk-size warning remains.
- The [botanical detail plan](docs/botanical-art-plan.md) covers all 58 asset IDs and proposes an eight-species calibration batch for the deeper anatomy and texture work. Individual Blender edits for 55 companions, reference packets, owner art approval, and a physical-phone benchmark remain open. Real Lens qualification still requires rights-reviewed grouped indoor photos and an untouched holdout.


## 2026-11-26 Botanical calibration and Garden connection

- Completed the five remaining calibration assets in the [botanical detail plan](docs/botanical-art-plan.md). Fiddle-Leaf Fig, Rabbit's Foot Fern, Moth Orchid, Golden Barrel Cactus and Mexican Snowball each have updated editable source, animated GLB, transparent preview and spec. The shared roster still matches 58 Garden species IDs to 58 authored companions. All 350 clips passed the Three.js motion verifier within existing asset budgets.
- A real FastAPI Checkup now returns separate, time-bounded wet mix and standing water observations. Garden preserves their source in the profile, shows the corresponding companion cue and holds watering when standing water is reported. The hold expires to a fresh check and the original observation remains in care history. Live Edge Garden journey and 402 backend tests passed.
- Long plant switcher lists scroll above bottom navigation. Edge passed 15 authored models on desktop and at 375 px, plus reduced motion, a single live canvas, WebGL recovery and missing-GLB fallbacks. REA through its local MCP server searched the live catalog, saved a Moth Orchid and confirmed its authored canvas against the same FastAPI instance.
- Blender 5.2.2 reopened the complete roster for idle seam sampling. Used an isolated protocol-16 Blender MCP review instance to inspect the saved orchid source and its roots. The other 50 asset-specific detail passes, physical phone profiling, and owner art review remain open. See [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) for quantitative care and background notifications, and [backend/LENS.md](backend/LENS.md) for the photo-data and model evaluation gates.

## 2026-11-26 Botanical detail, pot context and release review

- Applied five additional identity-specific Blender passes. Mini Monstera has split and entire leaves with attached aerial roots. Dieffenbachia has asymmetrical variegation on connected cane leaves. Bird's Nest Fern has a funnel crown, underside sori and continuous fronds. Rubber Plant has a single leader with seven leaf junctions and a terminal stipule. Thanksgiving Cactus has overlapping clawed pads and oblique terminal flowers. The editable roster now contains 13 passes, with 45 remaining.
- Pot capacity and owner-described mix persist through Plant Profile, FastAPI and additive SQLite v2. A live Edge profile edit persisted across reload. Watering guidance stays qualitative pending a validated model. All 404 backend tests passed.
- Fixed the three design identity audit failures by replacing raised-edge care controls with soft greenhouse shadows and short press motion, applying the existing type scale and enlarging the 11 px switcher text. The identity audit and engineering ratchet passed with 283 raw CSS hex values, 1,005 px literals and five `!important` declarations.
- Blender 5.2.2 verified visible Idle motion and the loop seam across all 58 sources. All 58 assets matched the live Garden catalog and Three.js sampled all 350 authored clips within the asset budgets. The Edge character journey passed across 20 authored models at desktop and 375 px, with a single canvas, context recovery, reduced motion and fallback states. The production build and 28 contrast checks passed. Vite still reports two chunks above 500 KB. See [Antigravity handoff](ANTIGRAVITY_HANDOFF.md) for remaining work.

## 2026-11-27 Project Connect · botanical material pass

- Added the four-week dependency plan, 24 work packages, acceptance evidence and blocked release prerequisites to [Project Connect](docs/connect/MASTER_PLAN.md). Reconciled the documented Garden catalog with the live 84 identities and 31 verified watering records.
- Detailed 24 existing Blender companions. The [model results and backlog](docs/botanical-art-plan.md#project-connect-detail-passes--2026-11-27) list each change and export size, triangles and primitives. The reviewed total is 37 of 58. Owner visual approval and physical device profiling remain open.
- Verified the two Spider Plant offshoots against the real growing habit and inspected their source in Blender 5.2.2. The attachment test checks each runner endpoint, crown hierarchy and retained pigments. The desktop material viewport showed both attached rosettes.
- Recovered candidate artwork from the three specialist workstreams. Reopened 12 candidate sources for geometry and Idle checks and reviewed their front and side renders. The full gate verified 58 saved Blender sources, all 350 actual Three.js animation clips, asset budgets and catalog identity. Edge rendered all 58 at desktop and 375 px and passed single-canvas, context recovery, reduced-motion and fallback checks.
- All 404 backend tests, the frontend production build, 28 contrast checks and both code and identity audits passed. Production-preview Edge passed the live Garden save, reload and Checkup journey and the Plant Tools journey. Lens model matching used a test stub in the latter. Vite still reports two chunks above 500 KB.
