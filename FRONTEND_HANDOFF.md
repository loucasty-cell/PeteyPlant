# Petey Plant — Frontend Engineering Handoff (Core Intelligence & Project High Sierra)

This handoff documents the frontend-only transformation of **Petey Plant** completed on top of the existing Codex repository. No backend routes, SQLite schemas, ONNX/ML adapters, or recommendation formulas were rewritten or fabricated.

---

## 1. Summary of Completed Work

### A. Project High Sierra Native Redesign & Scrollbar Polish
- **Native macOS-inspired design tokens (`/frontend/src/styles/tokens.css`)**:
  - Replaced oversized editorial serif headings with crisp native system sans (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`) and tabular monospace (`"SF Mono", "JetBrains Mono", ui-monospace`) for numbers, timestamps, and status IDs.
  - Applied refined corner radii (`6px`–`16px`), crisp `1px solid #DDE2DA` hairline dividers, translucent `48px` native toolbar, subtle tactile shadows, and restrained botanical color tokens (`#234D36` Forest, `#173C2A` Deep Forest, `#789B62` Sage, `#F2F3EF` Warm Stone, `#F8F8F4` Paper Surface, `#FFFFFF` Pure Card, `#202923` Ink, `#B78339` Amber, `#B94E43` Alert Red).
- **Modern Hidden-Style Scrollbars (`/frontend/src/index.css`)**:
  - Eliminated classic grey browser scrollbar chrome and arrow buttons globally (`scrollbar-width: none` on `html, body`; `*::-webkit-scrollbar-button { display: none; }` with transparent tracks and subtle hover-reveal `6px` thumbs inside scrollable inspector panels).
  - Locked desktop Home (`>= 1024px`) cleanly to `100dvh` inside `.petey-shell:has(.hs-home-workspace)` (`0px` outer viewport overflow even when the development preview banner is visible).
- **Home 5-Region Hierarchy (`/frontend/src/components/garden/GardenApp.tsx`, `companion-stage.css`)**:
  - **Region A**: Compact `48px` translucent native toolbar (`Plant name + species`, live Google Weather popover trigger, active Alerts jump pill, and `Standard | Technical` segmented density switch).
  - **Region B**: Interactive 3D Botanical Companion Stage (`clamp(248px, 36dvh, 296px)` on mobile so the primary care decision fits cleanly above the fold; `58fr / 42fr` split on desktop). Replaced the 3 unused rotation buttons with a single compact bottom row: **`Profile`**, **`Check`**, **`2D / 3D`** accessible fallback toggle, and accurate species caption (`Monstera` / `Snake Plant` / etc.).
  - **Region C & D**: `WateringIntelligencePanel` displaying a single clear care headline (no repeated watering labels), deterministic companion cue line, contextual primary action (`Begin watering` -> inline watering steps confirmation -> `Confirm watered` -> `Action recorded · Reassessment pending`; segmented `Dry | Still moist | Not sure` check bar; `Review moisture & drainage` with NO watering button on `wait`/locked states), and aligned label/value hairline rows (`Timing`, `Amount` with `mL | fl oz` switcher, `Soil & source` with provenance badge, `Drainage`, `Last watered`, `Freshness`, plus `Status ID`, `Reliability`, and `Outdoor weather` in `Technical` mode).
  - **Region E**: Replaced the 3 generic statistic cards (`Due today`, `Needs attention`, `In garden`) with a compact **Other Plants** priority list showing thumbnail, action headline, and severity dot for switching companions in one click.

### B. Core Product Intelligence & Living Companion Architecture
- **30-Status Backend Condition Registry (`/frontend/src/lib/care/conditionRegistry.ts`)**:
  - Maps all documented real backend identifiers across garden statuses (`check`, `ready`, `wait`, `rest`, `details`), plant health triage (`likely_overwatering`, `likely_underwatering`, `pest_or_fungal_risk`, `light_or_environment_stress`, `needs_more_observation`), symptom tags (`yellowing_leaves`, `drooping_wilting`, `brown_crispy_tips`, `mushy_stems`, `sticky_residue_or_webbing`, `spots_or_mold`, `pale_stretched_growth`, `leaf_drop`), botanical engine & safety brake states (`root_rot_brake`, `critical_wilting`, `overwater_risk`, `severe_underwater`, `dehydrated`, `mild_thirst`, `comfortable`, `thriving`), timeseries anomaly states (`drying_faster_than_expected`, `drying_slower_than_expected`, `watering_overdue`, `irregular_schedule`), and synthetic lab states — plus a safe neutral `unknown` fallback for unrecognized statuses.
- **Care Intelligence Adapter (`/frontend/src/lib/care/careIntelligence.ts`)**:
  - Answers all 7 core owner questions strictly from backend data.
  - **Zero fabricated precision**: Never invents `mL` / `fl oz` estimates when the backend does not return `recommended_water_ml` / `recommended_water_min_ml` / `recommended_water_max_ml`; cleanly renders exact `mL` / `fl oz` when future backend engine fields are present.
  - **Smart Watering Lifecycle**: Separates reviewing watering steps from logging completion; after persistence succeeds, plays the appreciative 3D reaction and displays `Watering action recorded in care history. Reassessment pending — physical recovery is confirmed only on future observations.`
  - **Action-priority sorting, Condition-Driven Alert Center, Acknowledgement Separation, and Quiet Hours** helpers.
- **Species-Specific 3D Posture Mapping (`/frontend/src/components/garden/PalCharacter.tsx`, `InteractivePlantStage.tsx`)**:
  - Threaded `PosturePreset` (`healthy_upright`, `thirsty_droop`, `overwater_slump`, `heat_stress_curl`, `low_energy_rest`, `alert_caution`, `unknown_neutral`) with per-species structural flexibility (`SPECIES_DROOP_FLEXIBILITY`): stiff upright swords (`Dracaena trifasciata`) and fleshy rosettes (`Aloe vera`) resist soft-petiole droop while soft tropicals (`Monstera`, `Pothos`, `Spider Plant`) gently bow when thirsty.
  - Added accessible `2D` botanical fallback toggle (`disable3D`) that works without WebGL.
- **Individual Plant Detail Profile (`/frontend/src/components/garden/PlantDetailProfile.tsx`)**:
  - Treats every owned plant as an individual care entity, separating owner-reported history, engine assessment, pot/substrate/environment specs, live outdoor Google Weather context (explicitly NOT an indoor soil sensor), verified species reference guidance with source link, and missing backend data disclosures.
- **Alert Center, Staggered Motion, Hydration Cart, Garden List/Grid & Notification Preferences (`/frontend/src/components/garden/CareAlertCenter.tsx`, `GardenApp.tsx`)**:
  - **Care & Alert Center**: Dedicated `CareAlertCenter.tsx` using `framer-motion` (`motion.div`, `motion.article`, `AnimatePresence mode="popLayout"`) with restrained native spring physics (`stiffness: 360, damping: 32, mass: 0.78`, `staggerChildren: 0.048`) and full `prefers-reduced-motion` bypass. Prioritizes active alerts by urgency, supports inline `Dry` / `Moist` soil confirmation on `check` plants, and moves acknowledged alerts to `Acknowledged — condition still unresolved` with `Restore alert`.
  - **Hydration Cart**: Split-pane sticky tray on desktop (`1.38fr / 0.92fr`) and top tray on mobile. Strictly enforces `getHydrationEligibility()` (`ready` only; blocks `wait` / `watering_locked` and requires soil confirmation on `check` / `details`), safety-prunes stale cart IDs whenever status updates, reports `Qualitative (no mL estimate)` honestly until backend engine volume fields exist (`buildHydrationCartSummary`), and uses a two-step batch watering confirmation (`Finish round` → physical confirmation → sequential `gardenApi.record` calls).
  - **My Garden**: Native `List | Grid` view switcher, search, status filter, and priority/name/species sorting.
  - **More → Notification Preferences & Quiet Hours**: Contextual browser Notification permission button (never requested on launch), routine vs urgent toggles, quiet-hours start/end schedule, and honest disclosure that reminders currently operate only while the app is open in a browser tab.

### C. Runtime Error Resolution (Zero Console Errors)
- **`/frontend/vite.config.ts`, `/frontend/src/lib/gardenApi.ts`, `/frontend/src/lib/plantToolsApi.ts`**:
  - Added server-side `/api/backend-status` probe in Vite dev middleware (validating HTTP 200 JSON array from FastAPI `/api/v1/garden/species` instead of getting tripped by an unrelated port-8000 401 sidecar) and same-origin `/api/v1/*` proxying.
  - Added deduplicated 5-second `checkBackendAvailable()` guard and `resetBackendStatusCache()` on manual retry so offline startup produces **0 browser console errors** while preserving the honest offline banner and explicit opt-in `Enable development preview` workflow (now seeded with all 5 real garden care statuses including `Bath Calathea` in `wait` / do-not-water state).

---

## 2. Preserved Backend Contracts (Unmodified)

- `GET /api/v1/garden/species` → `GardenSpecies[]`
- `GET /api/v1/garden/plants` → `GardenPlant[]` (`status: 'check' | 'ready' | 'wait' | 'rest' | 'details'`)
- `POST /api/v1/garden/plants` → `GardenPlant`
- `POST /api/v1/garden/plants/{plant_id}/care` → `CareKind: 'dry' | 'moist' | 'unsure' | 'watered'`
- `POST /api/v1/plant-health/triage` (strict `extra="forbid"` schema preserved)
- `GET /api/v1/lens/status` & `POST /api/v1/lens/identify`
- `GET /api/weather` (Google Maps Platform Weather proxy with `X-Goog-Maps-Solution-ID: gmp_mcp_codeassist_v1_aistudio` and quota banner preserved)

---

## 3. Missing Backend & 3D Asset Dependencies (For Next Codex Session)

1. **Quantitative Water Volume Engine Fields**: Current `/api/v1/garden/plants` records do not store pot diameter/volume, substrate mix, or return `recommended_water_ml` / `recommended_water_min_ml` / `recommended_water_max_ml`. The frontend adapter (`OptionalEngineWateringFields` in `careIntelligence.ts`) is already typed and unit-tested to display exact `mL` / `fl oz` quantities as soon as the backend provides them.
2. **Multi-Condition Persistence & Root-Rot Brake Flags**: Backend garden records currently expose a single `status` enum (`check | ready | wait | rest | details`). Adding optional `active_conditions: string[]`, `watering_locked: boolean`, `lock_reason: string`, `earliest_water_at`, `latest_water_at`, and `assessment_updated_at` will unlock simultaneous condition tags and watering-lock enforcement automatically.
3. **Background Push Notifications & Service Worker**: Browser notifications are currently scoped to active browser sessions. Persistent push reminders while closed require backend Web Push subscription endpoints (VAPID) and a registered service worker.
4. **Authored GLB 3D Models**: All 8 flagship species currently render via bespoke procedural Three.js rigs (`assetStatus: 'procedural_fallback'` in `speciesAssetRegistry.ts`) until Blender-authored GLB/GLTF assets are exported to `/public/assets/models/`.

---

## 4. Verified Test, Build & Browser Evidence

- **Unit Tests (`npx --yes tsx --test frontend/src/lib/care/careIntelligence.test.ts`)**: **9 pass, 0 fail** (covers 25+ condition registry entries & unknown fallback, multi-condition severity ordering, zero fabricated mL volume, quantitative mL/fl oz formatting, smart watering lifecycle `action_recorded_reassessment_pending`, priority sorting & alert acknowledgement separation, overnight/daytime quiet hours, Hydration Cart safety eligibility & pruning, and Hydration Cart qualitative/quantitative summary).
- **Production Build & TypeScript Lint**: `npm run build` (`compile_applet`) and `npm run lint` (`lint_applet`) both pass with exit code `0`.
- **Headless Chromium Verification (`playwright-cli`)**:
  - Verified **0 console errors and 0 warnings** on initial load and across all views.
  - Verified desktop (`1440×900`): `0px` outer vertical overflow, `0px` horizontal overflow, bottom stage HUD inside viewport (`886 / 900`), aligned `WATERING ASSESSMENT` inspector rows, `Other Plants` strip replacing old 3 stat cards, smart watering confirmation sheet -> `Reassessment pending` lifecycle note, `Bath Calathea` `Do not water yet` state hiding watering button, Plant Detail Profile, Care & Alert Center staggered entrance + Hydration Cart split layout (`Queue ready plants`, `Bath Calathea` excluded, two-step batch `Finish round` confirmation), My Garden `List` rows, and More `Notification Preferences & Quiet Hours`.
  - Verified mobile (`390×844` and `320×667`): `0px` horizontal overflow on both widths, full plant name visible in top toolbar (`Sunny Snake`), single-row `28px` stage bottom bar clear of the 3D companion's face, Hydration Cart top tray above queue, and primary care decision + action buttons visible above the fold.
