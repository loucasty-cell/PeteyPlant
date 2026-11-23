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
