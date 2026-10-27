# Petey Plant — Backend

FastAPI backend for Petey Plant. Run from this directory (imports are relative to
`backend/`).

## Run

```bash
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
../.venv/bin/python -m uvicorn main:app --port 8000
# API at http://localhost:8000 — interactive docs at /docs
```

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `MUSE_MODEL_ID` | `muse-glimmer-30b` | Validated against `muse-glimmer-30b`, `muse-spark-open`; anything else falls back to the default with a stderr warning. |
| `MUSE_CREATIVE_MODEL` | `muse-image` | Validated against `muse-image`, `muse-wonder`; anything else falls back to the default with a warning. |
| `MUSE_API_BASE` | `""` | **Currently unused.** Reserved for future wiring — no Muse HTTP call exists yet. The deterministic local fallback is always used. |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com/v1/forecast` | Point at an unreachable host (e.g. `http://127.0.0.1:9`) to force the offline weather fallback. |
| `PETEY_CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Comma-separated CORS origins. Credentials are not allowed. |
| `PETEY_MODEL_DIR` | (unset) | Directory to load optional vision weights from (MobileNetV2 PlantVillage). Absent = gracefully disabled, never a crash. |
| `QDRANT_URL` | (unset) | Only used by the knowledge-base CLI; Qdrant sync is not implemented — SQLite remains authoritative. |

## Honest provider note

No live Muse model call happens in this build. `MUSE_MODEL_ID` /
`MUSE_CREATIVE_MODEL` are shape-compatible labels for the deterministic local
fallback, disclosed via the `X-Muse-Fallback: true` response header and
`"fallback": true` in health/triage telemetry. Muse Spark Open and Muse Wonder
are allowed values, not wired calls.

## Endpoints

See the root `README.md` for the full table. Highlights: `GET /health`,
`GET /api/v1/plants`, `POST /api/v1/plants/{id}/water`,
`POST /api/v1/agent/triage` (6-step ReAct trace: RAG, forecast, engine
pathology, schedule, avatar, guilt — with measured latency and evidence IDs),
`GET /api/v1/agent/tools`, `GET /api/v1/agent/evidence/{id}`,
`GET /api/v1/plants/{id}/forecast` (bands, anomalies, root-rot risk),
`POST /api/v1/scan`, quiz/shield/sitter flows. Every response carries
`X-Model-Provider`, `X-Muse-Model-ID`, `X-Muse-Creative-Model`, and
`X-Muse-Fallback` headers.

## Botanical engine (`services/petey_muse_botanical_engine.py` v2.4.0)

Vendored verbatim (its own project header intact): a 10-node APG IV knowledge
graph, Magnus-Tetens VPD air + leaf, a non-rectangular-hyperbola photosynthesis
model, a substrate hydration balance (hypoxia/desiccation risk + optimal
interval/dose), a 5-code differential pathology triage, a PlantNet-300K logit
adapter, and a Kaggle observation upgrader / stratified synthesizer (the
synthesizer is a documented generator entry point — no bulk generated artifacts
are committed; a 20-record synthesis to `/tmp` verified sane outputs).
`services/botanical_engine_adapter.py` is the only binding layer. Four
integration points:

1. **Vision calibration** — `ml_vision.analyze_image(..., species_scientific_name)`
   adds `plantnet_calibration` (logit offset, organ priors incl. `leaf`, CC-BY /
   CC-BY-NC split) and `calibrated_vision_scores` to the scan output; `/scan`
   accepts `?species=` / `?cultivar=`. The engine defines the adjustment as
   `logit − tau·log(pi)` weighted by the leaf prior, so rare classes are
   boosted. Calibration integration point only: **no neural inference runs
   offline** (see the vision honesty note in the root README).
2. **Care clustering** — `care_cluster_id` (CLUSTER_A–E) drives cluster-aware
   watering thresholds in the guilt engine, the triage schedule interval, and
   the sitter view. CLUSTER_C CAM succulents count as thirsty only below the
   engine's critical-depletion VWC (5–8%), so they never get premature watering
   alerts; all other species keep the 30% threshold.
3. **Hydration engine** — triage runs `simulate_substrate_hydration_balance()`
   from live telemetry (air temp + RH from the newest history entry, lux-derived
   PPFD, current moisture, watering interval) and surfaces the engine's
   interval, dose, hypoxia risk, and desiccation risk in `actions.engine_hydration`
   alongside the existing decay forecast.
4. **Differential pathology** — triage step 3 (`diagnose_engine_pathology`,
   registered in `tool_registry.py`) runs the engine's 5-code differential
   diagnosis before any care advice is generated and surfaces
   `primary_pathology_code` + `physiological_mechanism` in
   `actions.engine_pathology`. Species with no engine node return
   `available=false`, never an error.

**Parameter-vs-verified-fact discipline:** engine numbers are MODEL PARAMETERS
labeled `petey_muse_botanical_engine v2.4.0 parameters` in `engine_*` fields
on the Species model. They never overwrite a verified field, and UNVERIFIED
fields stay UNVERIFIED. Documented approximations: lux → PPFD uses
`PPFD = lux × 0.0185` (indoor daylight); game moisture % maps to VWC as the
plant-available water fraction (0% = wilting point, 100% = field capacity);
fluoride defaults to 0.7 ppm and fertilizer EC to 1.0 mS/cm when no sensor
data exists (so fluoride-sensitive taxa surface the fluoride code by default).

## Data honesty

- 79 starter species (76 + 3 engine records: Thai Constellation cultivar,
  Goeppertia makoyana, Phalaenopsis aphrodite); 31 carry source-verified
  qualitative data (see the root README). Numeric care parameters are
  approximate game-model parameters.
- 18 verified-data fields are explicitly UNVERIFIED and are never filled with
  plausible values. Pet toxicity for *Haworthiopsis fasciata* and *Maranta
  leuconeura* is unverified — the API says so rather than rendering "pet-safe".
- Demo plant histories are deterministic synthetic data.

## Tests

```bash
../.venv/bin/python -m pytest -q   # 116 tests, run from backend/
```

Coverage includes VPD/moisture/EXIF math, the emergency brake (lock + unlock),
ReAct trace shape and evidence, headers (including 404s), HP movement,
triage persistence, sitter auth (forged/cross-plant rejection), quiz
consumption (410 on re-answer), once-per-day watering guard, sticky levels,
forecast bands/anomalies/risk, contour-PCA droop, and the offline weather
fallback (forced via `OPEN_METEO_BASE_URL`).

## Knowledge-base CLI

```bash
../.venv/bin/python -m data_pipeline.build_knowledge_base --db /tmp/petey-kb.sqlite --seed
```

Seeds a local SQLite store from the species file. Optional `--ingest-json <path>`
for larger dumps. Qdrant is attempted only if `qdrant_client` is installed and
`QDRANT_URL` is set — and even then no vectors are synced; SQLite stays
authoritative.
