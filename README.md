# Petey Plant 🌱

A Duolingo-style gamified indoor plant pet app — built for the **Meta Global AI Developer Hackathon**.

Petey turns each plant into a reactive, expressive cartoon pet with HP bars, XP levels,
streaks, Mulch Shields (streak protection), a Duolingo-style "guilt engine", and a
deterministic ReAct agent that explains its reasoning step by step. Underneath the pet
is real plant-care math: Vapor Pressure Deficit (VPD), Penman-Monteith-inspired soil
moisture decay, a camera EXIF light meter, leaf-lesion analysis, and a time-series
forecasting engine with uncertainty bands and anomaly detection.

> **Demo plants ship with synthetic history.** The 30-day histories are deterministic
> synthetic data for demo purposes — not real user watering data.

## Honest provider disclosure (read this first)

**No live Muse model call happens in this build.** The backend exposes a configurable
provider layer (`backend/config.py`):

| Env var | Default | Allowed values |
|---|---|---|
| `MUSE_MODEL_ID` | `muse-glimmer-30b` | `muse-glimmer-30b`, `muse-spark-open` |
| `MUSE_CREATIVE_MODEL` | `muse-image` | `muse-image`, `muse-wonder` |
| `MUSE_API_BASE` | `""` (empty) | Reserved for future wiring — **currently unused; no Muse HTTP call exists yet** |

With the defaults, every agent/creative result is produced by a **deterministic local
fallback** that returns the same response shapes a real model call would (triage
reasoning, avatar prompts, rig parameters). This is disclosed, not hidden:

- Every API response carries `X-Model-Provider: Meta-Muse-Open-Weights`,
  `X-Muse-Model-ID`, `X-Muse-Creative-Model`, **and `X-Muse-Fallback: true`**.
- `/health` and triage telemetry report `"fallback": true`.
- The Agent Brain drawer labels the run as a deterministic local fallback, and each
  trace step records measured per-step latency (not a fabricated constant).

Muse Spark Open and Muse Wonder are named only as allowed-but-not-wired values; this
build does not claim to call them. When real Muse endpoint credentials exist, the
provider layer is the single place to wire them in.

## Honest data scale (read this too)

- **79 starter species records** across all 12 avatar archetypes and 25+ families —
  **not 10,000**. The file is named `seed_10k_species.py` for a future 10,000-record
  ingest target that is **not shipped**. `ingest_json_dump` is implemented but is not
  called at import time and performs no download. The 79 = 76 original records +
  3 botanical-engine records (Monstera 'Thai Constellation' cultivar, Goeppertia
  makoyana, Phalaenopsis aphrodite); 7 further engine nodes attach parameters to
  existing records without touching verified data (see "Botanical engine" below).
- **31 of the 79 records carry source-verified qualitative data** (light, watering,
  soil moisture, humidity, temperature, pests/diseases, toxicity) cited to Missouri
  Botanical Garden, ASPCA, NC State Extension, RHS, UF/IFAS, and other extension
  sources, with per-field evidence quotes and source URLs in the record.
- **All numeric care parameters** (crop coefficient, moisture %, VPD kPa, lux, most pH
  ranges) are **approximate game-model parameters** calibrated to qualitative care
  categories — not measured species values. They are labeled as such in the seed.
- **18 verified-data fields are explicitly UNVERIFIED** (marked `None` /
  `verification_status = UNVERIFIED` in the records) and are never filled with
  plausible values. In particular, pet toxicity for *Haworthiopsis fasciata* and
  *Maranta leuconeura* is **unverified — do not assume safe**; the API says so
  instead of rendering a bare "pet-safe".
- Toxicity values that rest on weaker evidence (genus-level listings, NC-State-only
  sources, production values) carry `toxicity_confidence` / `verification_notes`
  flags rather than clean booleans.

## Quickstart

### Backend (FastAPI, Python 3.12)

```bash
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
../.venv/bin/python -m uvicorn main:app --port 8000
# API at http://localhost:8000 — docs at http://localhost:8000/docs
```

### Frontend (Vite + React + Tailwind v4 + framer-motion)

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into frontend/dist/
```

Point the frontend at a non-default backend with `VITE_API_URL`
(see `frontend/.env.example`). Default is `http://localhost:8000`.

### Tests

```bash
cd backend
../.venv/bin/python -m pytest -q        # 125 tests
cd ../frontend
npm run verify:contrast                 # WCAG AA contrast audit (must exit 0)
```

## API endpoints

| Method & path | What it does |
|---|---|
| `GET /health` | Service + provider/fallback telemetry |
| `GET /api/v1/species?q=` | Search the 79-record species index (empty `q` returns all) |
| `GET /api/v1/plants` | All demo plants with full state + 30-day history |
| `GET /api/v1/plants/{id}` | One plant's full state |
| `POST /api/v1/plants/{id}/water` | Water (species/pot-aware amount; once-per-day XP/streak guard; refused when the root-rot brake is locked) |
| `POST /api/v1/agent/triage` | Deterministic ReAct triage: 6 tool calls (RAG, forecast, engine pathology, schedule, avatar, guilt), full `agent_trace` (thought, tool, args, observation, measured latency, model id, evidence id, limitations, coverage) |
| `GET /api/v1/agent/tools` | Declared tool registry catalog (8 tools) |
| `GET /api/v1/agent/evidence/{id}` | Retained evidence record for a triage step |
| `GET /api/v1/plants/{id}/forecast` | ML forecast: 7 days with uncertainty bands, anomalies, root-rot risk score, watering recommendation |
| `POST /api/v1/scan` | Multipart image upload → EXIF lux estimate + lesion ratios + heuristic leaf-health signal |
| `GET /api/v1/quiz` | Micro-quiz question (answer never returned) |
| `POST /api/v1/quiz/answer` | Answer a quiz (+30 XP when correct; every 3rd correct answer earns a Mulch Shield; answers are consumed — re-answer returns 410) |
| `POST /api/v1/plants/{id}/shield/buy` | Buy a Mulch Shield for 100 XP (level never regresses) |
| `POST /api/v1/plants/{id}/sitter` | Issue a sitter link token + quest checklist (+50 Sitter XP reward) |
| `GET /api/v1/sitter/{id}?token=` | Simplified sitter view (invalid/forged/cross-plant tokens → 401) |
| `POST /api/v1/sitter/{id}/water` | Water as sitter (+50 Sitter XP; shares owner watering state; honors the lock) |

## Demo plants (try these flows)

| Plant | State | Try this |
|---|---|---|
| **Monty** — *Monstera deliciosa* | Spider mites, HP 60 | Run triage; scan a leaf photo; water him (HP moves) |
| **Callie** — *Goeppertia orbifolia* | Overwatered, **watering locked by the Root Rot Brake** (VPD < 0.4 kPa sustained 4+ days) | Try watering her (refused); check the forecast + root-rot risk |
| **Serpentina** — *Dracaena trifasciata* | Thriving, HP 94 | Buy a shield; take the quiz; create a sitter link and open it (`?view=sitter&plant=serpentina-snake&token=…`) |

Core flows that all work offline: dashboard with HP/XP/streaks, 30-day moisture/VPD
chart, triage with a real trace, photo scan (lux + lesion pipeline), the Root Rot
Emergency Brake, Plant Sitter Mode, quizzes, and shield purchases.

## How the core math works

- **VPD**: `es = 0.61078 · exp(17.27·T / (T + 237.3))`, `VPD = es · (1 − RH/100)` (kPa).
- **Soil moisture**: hourly Penman-Monteith-inspired decay,
  `θ_t = clamp(θ_{t−1} − (k_species · α_pot · VPD_t · Lux_t/Lux_opt) + W_t, 0, 100)`.
  The 7-day forecast applies **24 hourly steps per day** (the spec's hourly
  semantics) — so forecasts are steep by design, not by bug.
- **EXIF light meter**: `EV = log2(N²/t) + log2(100/ISO)`, `Lux ≈ 2.5 · 2^EV`.
- **Lesion analysis**: OpenCV HSV segmentation (healthy / chlorosis / necrosis ratios)
  plus contour-PCA droop angle (lesion-ratio proxy only when no usable contour is
  found, reported via `droop_method`).
- **ML time-series** (`backend/services/timeseries_ml.py`, numpy-only): trend +
  7-day seasonal decomposition, forecast with uncertainty bands from residual
  standard deviation, anomaly detection (soil-stuck-wet, VPD spikes,
  missed-watering patterns), a 0–100 root-rot risk score, and forecast-derived
  watering recommendations. Every formula is documented in the module docstrings
  and unit-tested.
- **Root Rot Emergency Brake**: VPD < 0.4 kPa sustained 4+ days locks watering
  (and unlocks when the condition clears). Triage persists its schedule mutation
  to the plant record; the ML recommendation date is reported separately in
  triage `actions` (they can differ — the persisted schedule is authoritative).
- **Botanical engine** (`backend/services/petey_muse_botanical_engine.py`
  v2.4.0, vendored verbatim; `backend/services/botanical_engine_adapter.py`
  binds it): a 10-node APG IV knowledge graph with Magnus-Tetens VPD air +
  leaf, non-rectangular-hyperbola photosynthesis, substrate hydration balance,
  5-code differential pathology triage, and a PlantNet-300K logit adapter.
  Triage runs the pathology diagnosis as step 3 (before care advice) and
  surfaces engine interval/dose/hypoxia/desiccation risk in
  `actions.engine_hydration`; CLUSTER_C CAM succulents never get premature
  watering alerts (critical-depletion thresholds); scan responses carry a
  `plantnet_calibration` block when a species is supplied. Engine numbers are
  MODEL PARAMETERS (`engine_*` fields), never verified facts — see the backend
  README for the parameter-vs-verified discipline and the documented
  approximations (lux→PPFD, moisture→VWC mapping, fluoride/EC defaults).

## Offline-first design

The app runs with **no network access at runtime**:

- Open-Meteo is the only runtime external HTTP call, with a 5-second timeout and a
  deterministic seeded-synthetic fallback (`OPEN_METEO_BASE_URL` can point it at an
  unreachable host to force the fallback — this is how offline operation was
  verified). Light (`lux`) is a **fixed 1200.0 estimate** in both live and fallback
  weather paths, never a live light reading.
- No model downloads at runtime: RAG is local token-overlap/TF-IDF over the seed,
  vision is OpenCV/PIL, species data is a static Python file.
- The frontend bundle makes **no third-party calls** — all fetches go to the
  configured backend only; fonts are system stacks (no downloads).
- The only network touch allowed is one-time dependency installation (`pip`,
  `npm`) at build time.

## Data pipeline (`backend/data_pipeline/`)

- `taxonomy_resolver.py` — synonym resolution (full-name mappings only for
  group-specific moves; genus-level guesses carry low confidence and a flag).
- `async_scrapers.py` — token-bucket rate-limited async scrapers for NC State
  Extension, Missouri Botanical Garden, LLIFLE, and the ASPCA Toxic Plants List.
  `selectolax` is optional (stdlib HTML fallback). Scrapers never run at import
  time and are never called from HTTP endpoints.
- `muse_extractor.py` — structured extraction into `GoldenPlantRecord`, with
  phylogenetic fallback imputation (genus defaults + Köppen-Geiger biome) for
  missing cultivar metrics; every imputed field is listed with a confidence penalty.
- `build_knowledge_base.py` — CLI seeder (`python -m data_pipeline.build_knowledge_base
  --db <path> --seed`) into local **SQLite**. Qdrant is optional and **not
  implemented as a vector sync** — SQLite + token-overlap search is the real
  retrieval path, and the seeder says so when Qdrant is reachable.

## Vision model registry (`backend/services/ml_vision.py`)

| Model | Status in this build |
|---|---|
| MobileNetV2 PlantVillage identification | Descriptor only — weights load from `$PETEY_MODEL_DIR` if present, otherwise gracefully disabled. **No neural inference runs offline.** |
| ViT plant identification | Evaluated option, not bundled, not loaded by default (larger weights/latency). Listed for transparency. |
| OpenCV HSV lesion segmentation | Always available. |
| Contour-PCA droop angle | Always available when OpenCV is present; proxy fallback otherwise. |

**No accuracy numbers are claimed anywhere** — local accuracy was not measured.
The PlantVillage dataset reference is Hughes & Salathé (2015). Build-time weight
download is allowed in principle (place weights in `$PETEY_MODEL_DIR`); runtime
never downloads weights and never crashes when they are absent.

## Influences (credited honestly)

- **morluto/rea** (REA: Reverse Engineer Anything) — *methods only*. The agent
  harness and tool registry borrow REA's MCP evidence pattern (declared tool
  schemas, structured observations with evidence IDs, limitations, coverage,
  retained bundles). REA is a reverse-engineering toolkit, **not** a botanical
  source — no REA code or data is used, and all plant knowledge comes from
  Petey's own pipeline and cited extension sources.
- **codewithasnari/nongeneric** — *design direction only*. The frontend's
  editorial system (OKLCH tokens, tri-voice typography, purposeful motion
  blueprints, 320–1440px discipline, no purple gradients / glassmorphism /
  hero sections) follows NonGeneric's anti-slop approach in Petey's own botanical
  world. No upstream theme, font, or asset is copied.
- **shadcn/ui** — *component idiom only*. The `frontend/src/components/ui/`
  primitives (button, card, dialog, drawer, badge, progress, tabs, input, tooltip)
  are **hand-written in the shadcn style** (no Radix, no `clsx`/`tailwind-merge`
  dependencies), styled with Petey's tokens — not copied upstream source and not
  default shadcn styling.

## Known limitations (no silent gaps)

- **Sitter auth is demo-grade**: tokens are unguessable per-link secrets, but they
  live in memory only (a restart invalidates them) and carry no TTL enforcement
  yet (`issued_at` is recorded but not checked). Do not present sitter links as
  production-secure.
- **Two triage dates**: the persisted schedule `next_water_iso` (interval-based)
  and the ML `recommendation.next_water_iso` (first forecast day below species
  minimum) can differ. The persisted schedule is authoritative.
- **Forecast steepness**: hourly stepping makes 7-day forecasts drop fast (Monty
  can hit 0% by day 4). That is what the spec's hourly formula implies; the
  formula was not softened to look nicer.
- **Vision registry reports availability only** — no neural inference actually
  runs in this offline build. The PlantNet calibration block is a classical-score
  shift, not a model output.
- **Engine defaults are assumptions, not measurements**: triage pathology uses
  tap-water fluoride 0.7 ppm and fertilizer EC 1.0 mS/cm when no sensor data
  exists (fluoride-sensitive taxa therefore surface the fluoride code by
  default), lux→PPFD uses the 0.0185 approximation, and game moisture % maps
  to VWC as the plant-available water fraction. All three are documented in
  the adapter and backend README.
- **No browser visual verification**: 320px layout, sitter-link click-through,
  drawer focus behavior, and framer-motion droop-pivot rendering were verified
  by code reading + build, not by a visual browser pass. Spot-check them visually.
- **Demo history is synthetic** (seeded random walk), including Callie's forced
  low-VPD tail that sustains her brake.
- **CORS** is restricted to `http://localhost:5173` and `http://localhost:4173`
  (Vite dev/preview) by default; set `PETEY_CORS_ORIGINS` (comma-separated) to
  change it.
- **In-memory stores**: plants, quiz answers, sitter tokens, and evidence bundles
  reset on backend restart (evidence capped at 500 records).

## Project layout

```text
petey-plant/
├── README.md
├── backend/
│   ├── main.py                 # FastAPI app, headers middleware, endpoints, stores
│   ├── config.py               # Muse provider layer + env validation
│   ├── models/schemas.py       # Pydantic v2 models
│   ├── services/               # ml_vision, timeseries_vpd, timeseries_ml,
│   │                           # rag_engine, muse_creative, muse_agent_harness,
│   │                           # tool_registry, petey_muse_botanical_engine
│   │                           # (v2.4.0, verbatim) + botanical_engine_adapter
│   ├── data/seed_10k_species.py# 79 starter species + 3 demo plants (see scale note)
│   ├── data_pipeline/          # taxonomy_resolver, async_scrapers,
│   │                           # muse_extractor, build_knowledge_base
│   ├── tests/                  # pytest suite (125 tests)
│   └── requirements.txt
└── frontend/
    ├── src/App.tsx             # dashboard, sitter routing, herbarium ledger
    ├── src/components/         # TopTelemetryBar, diagnostics/MuseDiagnosticSheet,
    │                           # ledger/GrowthLedger, three/PeteyTerrariumCanvas
    ├── src/lib/                # api, biophysicsEngine, diagnosisEvidence
    ├── src/store/              # usePeteyStore (Zustand)
    ├── src/types/              # botanical types
    ├── src/index.css           # OKLCH herbarium-ledger tokens
    ├── verification/           # Playwright screenshots, report.json, contrast + identity audits
    └── package.json
```
