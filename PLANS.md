# Petey Plant development roadmap

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

