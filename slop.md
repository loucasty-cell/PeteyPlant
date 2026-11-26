# slop.md - Petey Plant engineering handoff

The latest review is in [PLANS.md](PLANS.md#2026-11-26-botanical-detail-pot-context-and-release-review). The historical snapshot below predates the greenhouse revisions. The current identity audit and engineering ratchet both pass after the care-control and typography fixes.

Written 2026-11-26. This file is the review artifact. It is written to be executed by an
agent (Antigravity, Codex, or a human) with no access to the conversation that produced it.

Snapshot: verified against the working tree on 2026-11-26, which includes the V5 expansion
(58 companions, 50 new untracked asset folders, `backend/lens_pipeline/train_species.py`,
and the user's README/PLANS edits). `ANTIGRAVITY_HANDOFF.md` is the session continuation
handoff; this file is the review. They are complementary, not duplicates. If the tree has
moved since this date, re-run Appendix A before trusting any count below.

Read this order: section 2 (measured ground truth), section 3 (why the product fails while
the suite is green), then the finding cards in section 4. Do not start editing before you
have run the Wave 0 gate in section 5.

---

## 0. Rules for the agent executing this file

1. Every finding has a `done_when` command. A finding is not done until that command's
   output is pasted into the PR or the commit message. A green compile is not evidence.
2. Do not "fix" a finding by editing the copy. If a screen claims a capability, gate the
   control, not the sentence.
3. Do not add a dependency. Everything below is solvable with the installed stack
   (React 19, R3F/Three, FastAPI, sqlite3, pytest, Playwright).
4. Do not weaken an existing refusal to make a test pass. The refusals in
   `backend/services/care_policy.py` are the product.
5. Work in waves. Each wave ends with the full gate: backend pytest, frontend build,
   garden journey. Do not stack waves.
6. The working tree already contains uncommitted user work. Never `git checkout --`,
   never reset, never force-push. Build on top of what is there.
7. If a finding and the code disagree when you start, the code wins. Record the
   disagreement in the PR and stop.
8. Keep `docs/images/*` untouched unless you also re-run the capture that produces them.

---

## 1. Verdict

Request changes. The codebase is unusually clean at the level most reviewers check
(no type escapes, no TODOs, no stray logs, 395 passing tests). It fails at the level that
decides whether the product works: **the suite tests a different article than the one that
ships**, and **the care promise is reachable for 2 of 84 catalog entries while 29 species
that have verified guidance are told, in a user-facing sentence, that no verified guidance
exists.**

The rest is structural drag (one 2,288-line shell, one 4,222-line stylesheet, one 1,114-line
theme object inside a network module) and evidence drift (screenshots that do not show what
their filenames claim).

---

## 2. Measured ground truth (this session, not remembered)

| Check | Command | Result |
|---|---|---|
| Backend suite | `cd backend; python -m pytest -q` | 395 collected, 395 passed, 0 failed (51.8s warm) |
| UI check harness | `frontend/verification/report.json` (committed) | 41 passed, 0 failed |
| Flight readiness | `docs/flight_readiness.json` | NO-GO: 5 PASS, 29 UNAVAILABLE, 1 UNQUALIFIED |
| Species records | `len(data.seed_10k_species.SPECIES)` | 79 |
| Catalog entries served | `GET /api/v1/garden/species` | 84 (79 + 5 `GARDEN_IDENTITIES`) |
| Species with a verified watering source | `verified_care_source` over all records | 31 |
| Species that can reach `status == "ready"` | perfect dry checkup, all 31 | **2** (Monstera, Pothos) |
| Flagship species that dead-end | 8 Plant Pals, ideal checkup | **6 of 8** |
| CSS census | 7 files under `frontend/src` | 348 hex, 1,072 px literals, 10 `!important` |
| Largest source files | total lines | `companion-stage.css` 4,222; `GardenApp.tsx` 2,288; `weatherService.ts` 1,561 |
| Backend cold import | `Measure-Command { python -c "import main" }` | 4,142 ms |
| Client garden request timeout | `frontend/src/lib/gardenApi.ts:422` | 4,000 ms |
| Backend availability probe timeout | `frontend/vite.config.ts` (`/api/backend-status`) | 1,500 ms |
| Companions shipped | `assets/characters/` (V5 expansion) | 58 (8 flagship + 50 V5) |
| Companions captured in `docs/images/` | committed review images | 8 (pre-expansion) |

The last three rows are one defect: the first paint after starting the backend can declare
the backend offline while it is still importing.

---

## 3. Failure physics - why it "works" and still will not work

This is the part that matters. The defects are not independent; they form one chain.

### 3.1 Green tests, dead product

The test corpus and the product do not share a sample space.

- `frontend/verification/garden.mjs` exercises exactly one plant: Monstera. It asserts the
  wet branch, the surface-only refusal, the ready branch, and the idempotent retry.
- The product serves 84 catalog entries. The journey walks one.
- `backend/tests/test_checkup.py` tests `care_policy.validate_watering` directly. That function
  is correct. It is also not the function that decides whether a species is allowed to be
  advised. `garden.py:312` decides that, with a two-entry dictionary, and no test varies the
  species at all.

So: 395 green tests, and a user with an Aloe vera gets a permanent dead end. This is the
classic "the test article passed" failure. The suite validated the engine; nobody validated
the harness.

Cheapest permanent fix: a parameterised test over all 79 records asserting the *classification*
(`advised` / `no_verified_policy`), not the wording. One test, 79 cases, catches every future
dataset edit.

### 3.2 The preview engine is a different product

`frontend/src/lib/gardenApi.ts` has two care models:

- Online: `GET /checkup` -> `POST /assessments` -> `POST /assessments/{id}/confirm`, which
  runs the real 4-gate ladder in `care_policy.py`.
- Preview (offline dev): `applyPreviewCare`, which reduces the ladder to
  `const ready = plant.drainage === 'yes' && Boolean(guide)` (`gardenApi.ts:364`).

The preview branch is not a shortcut around a slow backend. It is a *second policy engine*,
and it is more permissive than production: production can never return `ready` from the quick
action at all (the event has `checkup = NULL`, so `plant_view` has no observation to validate),
while preview returns `ready` on one tap.

The fingerprint is `frontend/src/components/garden/GardenApp.tsx:955`:

```ts
kind === 'dry' && updated.status === 'ready'
  ? 'Dry mix noted · watering suggested'
```

That branch is unreachable in production. It only fires in preview mode. It is the toast the
feature was built against, and it proves the feature was validated on an artifact that does
not ship.

Why this is worse than a bug: any developer working offline gets a materially different
product, and the difference is in the safety direction. The preview says "water it" when
production says "not enough evidence".

### 3.3 Honesty implemented as prose loses to affordances

The Lens screen is the clearest case. The copy is correct:
"Photo matching isn't available here yet." The control hierarchy contradicts it: `Open camera`
is a filled primary button, `Upload photo` is a secondary button, and both are enabled
(`PeteyLens.tsx:533-550`, `disabled={preparing}` only). The capability gate exists but is
applied later, to the scan action (`PeteyLens.tsx:345`, `:706`).

A user reads the biggest, darkest, left-most control. The caveat is 14px muted text above it.
Copy cannot win that fight. Only `disabled` and ordering can.

General rule for this repo: **a capability claim must be a control-flow gate backed by the
same artifact that the readiness report reads.** If `docs/flight_readiness.json` is NO-GO,
the capture controls must be inert. Prose is a supplement, never the mechanism.

### 3.4 Duplicated authority means every fix increases divergence

There are three places that decide when to water:

1. `backend/services/care_policy.py` (correct, tested).
2. `backend/services/garden.py` `plant_view` + `GUIDED_SPECIES` (the gate that actually runs).
3. `frontend/src/lib/gardenApi.ts` `applyPreviewCare` (deviation).
4. `frontend/src/lib/care/careIntelligence.ts` (presentation over `plant.status`, plus its own
   fallbacks at `:340`, `:400-408`, `:419`).

Within the backend alone, `garden.py:187` and `garden.py:312` use *different definitions of
"we can advise this species"*:

- `:187` `source = verified_care_source(species)` -> 31 species.
- `:312` `if species_id in GUIDED_SPECIES` -> 2 species.

That is the slop definition used throughout this review: one rule, more than one
implementation, no fixture that forces them to agree. The measurable consequence is in
finding P-01, and it is a user-facing falsehood, not a style issue.

Entropy argument: with two copies, the cheapest local fix is always "change one copy".
Every such change raises the difference. Over time the copies are not "mostly the same with
drift"; they are two products. The only stable state is one implementation plus a fixture
both sides are executed against.

### 3.5 Single-file gravity

`GardenApp.tsx` is 2,288 lines with 22 `useState`, 10 `useEffect`, 14 `useMemo`, 4 `useRef`.
`companion-stage.css` is 4,222 lines. Any change has cost proportional to the file, so
reviewers accept the smallest possible diff, so features accumulate as more state in the same
component. This is not laziness; it is rational local behaviour with a bad global outcome.
A line-count ratchet is the only mechanism that reverses direction without a rewrite.

### 3.6 Causal chain (read top to bottom)

```
no shared species fixture
  -> tests cover 1 species, product serves 84
  -> care advice unreachable for 29 verified species
  -> user is told "no verified watering policy" (false)
  -> user cannot resolve the state from the UI ("details" has no exit)
  -> the only working path is Monstera/Pothos
  -> demo looks perfect, real users dead-end

preview engine diverges from production
  -> dev validates the permissive path
  -> production ships the strict path unvalidated by the same author
  -> dead branch at GardenApp.tsx:955 persists
  -> nobody notices because the suite never renders preview mode

copy-based honesty
  -> capability caveat coexists with enabled primary CTA
  -> user acts on the affordance
  -> failure is attributed to the model, not to the button state
```

---

## 4. Findings

Severity: **S1** product promise broken or false statement to the user. **S2** wrong
behaviour on a realistic path. **S3** structural drag that raises the cost of every future
change. **S4** evidence, polish, provenance.

### P-01 (S1) 29 species with verified guidance are told no verified guidance exists

**Evidence**

- `backend/services/garden.py:312`
  `source = verified_care_source(...) if species_id in GUIDED_SPECIES else None`
- `backend/services/garden.py:23-26` - `GUIDED_SPECIES` has exactly two entries.
- `backend/services/care_policy.py:108-113` - when `source is None`, returns
  `INSUFFICIENT_EVIDENCE` with "This saved plant doesn't have a verified watering policy in Petey."

**Observed** (repro in Appendix A.2)

```
Dracaena trifasciata
  assessment.code        : INSUFFICIENT_EVIDENCE
  assessment.explanation : This saved plant doesn't have a verified watering policy in Petey.
  plant.watering_guidance: Water regularly during the growing season, with significantly reduced watering...
  plant.watering_source  : https://plantfinder.mobot.org/PlantFinderDetails.aspx?kempercode=b617
  plant.status           : details
```

The same JSON response says there is no verified policy and returns a verified policy with
a source URL. `verified_care_source` returns a source for Dracaena, Aloe, Ficus lyrata,
Ficus elastica, Ficus benjamina, Philodendron, Tradescantia, Echeveria, Haworthiopsis,
Crassula, Nephrolepis, Heptapleurum and 18 more. 31 in total. All of them are gated out by
a hardcoded 2-entry whitelist.

**Fair note.** `README.md` already documents the two-species limitation as intentional. The
finding is not "this is undocumented". It is that (a) 29 blocked species have verified
guidance the code deliberately ignores, and (b) the refusal text asserts a fact that is false -
`plant_view` returns a verified `watering_guidance` and `watering_source` in the same payload
that denies their existence.

**Failure mode.** A user with a snake plant performs a flawless checkup (dry at recommended
depth, drainage yes, no standing water) and is refused. They retry tomorrow. Same refusal.
They conclude the app is broken, or worse, that they should not water a snake plant at all.
The refusal is not "insufficient evidence"; it is "we have the evidence and will not use it".

**Root cause.** `GUIDED_SPECIES` was introduced to hold the two hand-written depth prompts,
and it accidentally became the advice gate as well. Two concepts, one variable:

- has verified watering guidance (31 species, dataset-derived)
- has a hand-curated depth check prompt (2 species, editorial)

**Fix (recommended, smallest honest change)**

1. Keep `GUIDED_SPECIES` as an *override* for prompt text only.
2. In `assess_for` (`garden.py:310-313`), gate on `source is not None`, not on membership.
3. When a species is not overridden, build the prompt from `species.verified_soil_moisture`
   (fall back to `verified_watering`). The dataset already contains the depth language
   ("top quarter to one-third", "completely dry", "consistently moist but not wet") and a
   source URL for every one of the 31.
4. Relabel the UI's `recommended` depth option to reference the guidance text instead of an
   absolute depth. The ladder already checks `inspection_depth == "recommended"`; the meaning
   of "recommended" for a species without an override is "the depth the guide describes".
5. Only return `INSUFFICIENT_EVIDENCE` when `source is None` (48 species). For those the
   sentence is true.

Do not change `validate_watering` (`care_policy.py:114-135`). Those gates are correct and
tested; this finding is about which species reach them.

**Rejected alternatives**

- Shrink the picker to 2 species. Kills the product for anyone who owns a snake plant.
- Copy-paste 29 prompt strings into `GUIDED_SPECIES`. That is the same defect with more lines
  and no source linkage.

**done_when**

```
cd backend
python -m pytest tests/test_care_species_matrix.py -q
# new test: for every record in SPECIES, assert
#   status_for(species, ideal_checkup) == ("ready" if verified_care_source else "details")
# and assert the INSUFFICIENT_EVIDENCE explanation is only emitted when source is None.
```

Expected: 31 pass as `ready`, 48 pass as `details`, 0 mismatches.

**Files:** `backend/services/garden.py` (310-313, 23-26), `backend/tests/test_care_species_matrix.py` (new),
plus the UI label in the checkup dialog.

**Risk:** prompts for the 29 exit the hand-curated editorial path. Mitigate by rendering the
source next to the prompt. No new fabrication: every prompt string is dataset text with a
source URL.

---

### P-02 (S1) Preview mode is more permissive than production, and that is why it shipped

**Evidence**

- `frontend/src/lib/gardenApi.ts:355-401` (`applyPreviewCare`)
- `frontend/src/lib/gardenApi.ts:364` `const ready = plant.drainage === 'yes' && Boolean(guide);`
- `frontend/src/lib/gardenApi.ts:447-450` - `checkup`, `assess`, `confirm` have no preview
  branch, so the preview cannot run the real ladder at all.
- `frontend/src/components/garden/GardenApp.tsx:955` - unreachable production toast.

**Observed.** `POST /care {kind:"dry"}` on Monstera returns
`status: "details"` with "Use Checkup to verify the soil at the recommended depth, drainage
and standing water before watering." Preview mode returns `status: "ready"` and shows
"Dry mix noted - watering suggested".

**Failure mode.** The preview is the only path a contributor without a running backend can
exercise. It teaches the wrong model of the product and hides the strictness that is the
product's whole premise. Any reviewer who signs off based on preview has not seen the app.

**Fix (recommended: make preview incapable of advice)**

Option A (recommended, ~30 lines): in preview mode, never return `ready`. Return `details`
with "Preview mode logs observations only; watering advice needs the backend." Delete the
`ready` branch and the toast branch it feeds. Preview then makes no claim it cannot justify,
and parity stops mattering.

Option B (durable): port the ladder to a shared fixture and execute it in the client. Only
worth it if preview must be a faithful simulator. It creates a second implementation that
must be kept in sync forever - the opposite of the recommendation.

Choose A now. Choose B only if a product requirement says offline advice must work.

**done_when**

```
cd frontend
npm run build
# and a unit test:
node --test src/lib/gardenApi.preview.test.ts
# asserts applyPreviewCare(..., 'dry').status !== 'ready' for every DEV_PREVIEW_SPECIES
```

**Files:** `frontend/src/lib/gardenApi.ts:355-401`, `frontend/src/components/garden/GardenApp.tsx:950-961`.

**Risk:** none to production. Preview loses a feature that was never valid.

---

### P-03 (S1) The Lens primary CTAs are enabled while the capability is unavailable

**Evidence**

- `frontend/src/components/garden/PeteyLens.tsx:533-550` - `Open camera` (primary, filled) and
  `Upload photo` (secondary) are `disabled={preparing}` only.
- `frontend/src/components/garden/PeteyLens.tsx:345` and `:706` - the *scan* action does gate
  on `capability?.status === 'available'`.
- `frontend/src/lib/plantToolsApi.ts:95` -> `GET /api/v1/lens/status`.
- `backend/services/lens.py:156-162` - returns `unavailable` when `released_model()` is None.
- Capture: `docs/images/petey-lens-identifier.png`.

**Observed.** In the capture, the caveat "Photo matching isn't available here yet" and the
filled `Open camera` button occupy the same card, caveat above, button below, button enabled.
The manual search is a tertiary text link at the bottom ("Prefer to search by plant name?").

**Failure mode.** The user opens the camera, frames a plant, submits, and only then learns
there is no model. The first 30 seconds of the product teach the user that it does not work.
The readiness report already says the model is not qualified (5/35 gates pass; the gray-control
probe ranked Aloe Vera first).

**Fix**

1. When `capability.status !== 'available'`, render `Search by plant name` as the primary
   button and move capture behind a disabled control with an inline reason.
2. When it is `available`, keep the current hierarchy.
3. Do not add new copy. Reorder and disable.

**done_when**

```
cd frontend
npx playwright test verification/lens-capability.spec.ts
# stubs GET /api/v1/lens/status -> {"status":"unavailable"}
# asserts: primary button name is "Search by plant name"
#          Open camera is disabled
#          Upload photo is disabled
#          no element with role=button named "Open camera" is enabled
```

**Files:** `frontend/src/components/garden/PeteyLens.tsx` (idle render), one new spec.

**Risk:** none; the unavailable branch already exists.

---

### P-04 (S2) `details` is a terminal state with no resolving action

**Evidence**

- `backend/services/garden.py:224-230` sets `status = "details"` for a fresh dry observation
  that has not passed the ladder.
- `backend/services/garden.py:241-243` returns no field that tells the UI what would resolve it.
- `frontend/src/lib/care/careIntelligence.ts:486` renders "Confirm drainage & care details first".
- `frontend/src/lib/gardenApi.ts:15` `species_id: string | null`; `backend/services/garden.py:32`
  `species_id: str | None = None`.

**Observed.** After 24h a `details` plant becomes `check`, the user runs a checkup, and lands
back on `details`. With `species_id = null` the loop is permanent, because no surface lets the
user set the species after creation.

**Failure mode.** The single most common real state ("I added a plant and skipped the species,
or it is not in the advised set") is a loop. The UI names the blocker ("confirm care details")
but offers no control that does it. Dead-end states are worse than errors because they look
like the user's fault.

**Fix**

- Add the resolving control: a `species_id` / `drainage` editor on the plant profile, reachable
  from the `details` state. `PATCH /plants/{id}` in `services/garden.py` plus one dialog.
- When `species_id` is null, the message must be "Identify this plant to get advice", with the
  action attached. Not "confirm drainage".
- If P-01 ships, 29 of 31 verified species stop entering this state, which shrinks the problem
  to the 48 unverified species plus unidentified plants.

**done_when**

```
cd backend
python -m pytest tests/test_garden_species_update.py -q
# create with species_id=None -> status details
# PATCH species_id to "Monstera deliciosa", drainage yes
# GET /plants -> status is check, not details
```

**Files:** `backend/services/garden.py`, `frontend/src/components/garden/PlantDetailProfile.tsx`,
`frontend/src/lib/gardenApi.ts`.

---

### P-05 (S2) The species picker advertises 84 entries and advises 2

**Evidence**

- `backend/services/garden.py:251-257` returns all `SPECIES` plus `GARDEN_IDENTITIES`.
- `frontend/src/components/garden/GardenApp.tsx:246` filters the full catalog with no
  capability field.
- Observed count: 84 entries; 58 companions in the roster; 31 with verified watering; 2 advised
  before P-01.

**Failure mode.** The picker is the moment of highest trust. It presents 84 species as
equivalent, then 79 of them cannot produce the thing the app is for. This is the same defect
as P-01 seen from the add flow.

**Fix.** Add `advice_status: "verified" | "none"` to each entry returned by `/species`, derived
from `verified_care_source` (one line). Render it as a small label in the picker and sort
verified species first. After P-01, "verified" also means "advised".

**done_when**

```
cd backend
python -m pytest tests/test_garden_species_advice_status.py -q
# every entry has advice_status; count(verified) == 31
```

**Files:** `backend/services/garden.py:251-257`, `frontend/src/components/garden/GardenApp.tsx:240-270`,
`frontend/src/lib/gardenApi.ts` (`GardenSpecies` type).

---

### P-06 (S2) A 3-minute clock skew rejects a valid checkup and blames the observation

**Evidence**

- `backend/services/garden.py:22` `CHECKUP_CLOCK_SKEW = timedelta(minutes=2)`
- `backend/services/garden.py:321-323`
- `frontend/src/lib/gardenApi.ts` sends `captured_at: new Date().toISOString()` (device clock).

**Observed.** `POST /assessments` with `captured_at = now + 3 min` returns
`409 This observation's time is out of date. Recheck your plant and start a fresh Checkup.`

**Failure mode.** Laptops and phones that are not NTP-synced drift. A device 3 minutes fast
cannot use checkup at all, and the message tells the user their observation is stale when the
observation is current and the *clock* is wrong. This is a support ticket that looks like a
data bug.

**Fix.** Clamp the future direction instead of rejecting it:

```python
if payload.captured_at > timestamp:
    payload = payload.model_copy(update={"captured_at": timestamp})
```

Keep the stale-age rejection (`elapsed > CHECKUP_MAX_AGE`) and keep rejecting observations
older than the latest event. Clamping cannot game freshness because the stored value is the
server's own `now()`. If a bound is still wanted, raise the future tolerance to 15 minutes and
change the message to name the clock.

**done_when**

```
cd backend
python -m pytest tests/test_checkup_clock.py -q
# +5 min -> 200, stored captured_at == server now
# -2 h    -> 409
# older than latest event -> 409
```

**Files:** `backend/services/garden.py:321-323`.

---

### P-07 (S2) The LAN / mobile and older-Safari paths throw before any error handling

**Evidence**

- `frontend/src/lib/gardenApi.ts:406` `crypto.randomUUID()` with no fallback.
- `frontend/src/lib/gardenApi.ts:423` `AbortSignal.any([...])` before the `try` at `:425`.
- `frontend/vite.config.ts` `server.host = '0.0.0.0'`, `allowedHosts: true`.

**Failure physics**

- `Crypto.randomUUID()` is exposed only in secure contexts. `http://192.168.x.x:3000` is not a
  secure context. `gardenKey()` therefore throws a `TypeError` on the first request, before any
  `BackendUnavailableError` wrapper exists, so the UI shows a generic failure and no garden.
  Chrome-device-emulation at 390px is a secure context on `localhost`, which is exactly why the
  mobile screenshot looks fine.
- `AbortSignal.any` is Baseline 2024 (Chrome 116+, Safari 17.4+, Firefox 124+). On an older
  iPad it is `undefined`, and it is dereferenced at `:423`, outside the `try`, so every garden
  request throws an uncaught `TypeError`.

**Failure mode.** The two devices a plant app is most likely to be tested on - a phone on the
LAN and an older iPad on the sofa - are the two that fail, and they fail in a way that looks
like the backend is down.

**Fix**

1. Replace `crypto.randomUUID()` with a UUIDv4 built from `crypto.getRandomValues`
   (available in insecure contexts), or let the backend mint the garden key on first contact.
2. Replace `AbortSignal.any` with a small helper: use `AbortSignal.any` when present, otherwise
   use the caller's signal and rely on the fetch timeout via `Promise.race`.

**done_when**

```
cd frontend
node --test src/lib/gardenKey.test.ts
# with globalThis.crypto.randomUUID = undefined, gardenKey() returns a valid v4 UUID
# and gardenApi request path does not throw before fetch
```

Plus a manual check, recorded in the PR: `npm run dev`, open `http://<LAN-IP>:3000` from a phone,
add a plant, reload. Garden persists.

**Files:** `frontend/src/lib/gardenApi.ts:403-409`, `:411-444`.

---

### P-08 (S3) `GardenApp.tsx` is 2,288 lines with 22 `useState`

**Evidence.** `frontend/src/components/garden/GardenApp.tsx`: 2,288 total lines, 22 `useState`
(424-516), 10 `useEffect`, 14 `useMemo`, 4 `useRef`. The file already declares its own seams:
five `lazy()` imports at `:89-93`.

**Failure mode.** Every feature adds state to the same component, so every feature re-renders
the whole shell and every review is a 2,000-line context load. This is the mechanism behind the
drift in section 3.5, not a style preference.

**Fix (do not rewrite)**

1. Extract `useGardenData` (plants, catalog, connection, preview, selection) as one hook.
   No behaviour change, one file.
2. Extract each lazy-loaded view's state into its own hook, in the order the lazy imports
   appear. Keep props explicit; no context until a hook is shared by two views.
3. Only after the split, consider URL state for `view`/`selectedId`. That is a separate PR
   because the garden journey asserts navigation by button name.

Target: shell under 300 lines, no other file grows by more than the hook it gains.

**done_when**

```
cd frontend && npm run build
cd backend  && python -m pytest -q
node verification/garden.mjs   # both services running
```

`report.json` must stay 41/41 and the garden journey must pass unchanged. If any check asserts
DOM structure rather than outcome, fix the check, not the split - and say so in the PR.

**Files:** `frontend/src/components/garden/GardenApp.tsx` plus new `*.hooks.ts` beside it.

**Risk:** hooks that close over the same state can silently change render order. Do it in
mechanical steps, one view per commit, running the journey after each.

---

### P-09 (S3) 1,114 lines of presentation data live inside the network module

**Evidence.** `frontend/src/lib/weatherService.ts` is 1,561 lines. `WEATHER_THEMES` occupies
163-1276 (71%). `fetchGoogleWeather` is at 1513.

**Fix.** Move the object to `frontend/src/lib/weather/themes.ts`, re-export it from
`weatherService.ts` so the six importers (`GardenApp`, `PeteyLens`, `InteractivePlantStage`,
`WeatherBackdrop`, `PlantDetailProfile`, `careIntelligence`) do not change. Delete the
re-export in a follow-up once imports are updated.

**done_when**

```
cd frontend && npm run build
# weatherService.ts under 500 lines; no import site changed
```

**Risk:** none. Pure file move, re-export preserves the public surface.

---

### P-10 (S3) 4,222-line stylesheet, 348 raw hex, 1,072 px literals, 10 `!important`

**Evidence.** `frontend/src/components/garden/companion-stage.css`: 4,222 lines, 208 hex,
915 px, 5 `!important`. Across all 7 CSS files: 348 hex, 1,072 px, 10 `!important`.
`frontend/src/styles/tokens.css` exists with 37 hex and 38 px.

**Fix.** Do not rewrite. Freeze the count (section 6), then migrate only the blocks you touch:
hex -> token, px -> `rem` where the layout is fluid. The contrast gate
(`npm run verify:contrast`) already protects the colour changes.

**done_when.** The ratchet reports `css_raw_hex <= 348`, `css_px_literals <= 1072`,
`css_important <= 10`, and never increases.

---

### P-11 (S3) `DEV_PREVIEW_SPECIES` is a second, hand-written species dataset

**Evidence.** `frontend/src/lib/gardenApi.ts:140-222`: 8 species with cadence, drainage,
guidance and source, also re-exported as the catalog in preview mode (`:459`).

**Failure mode.** The preview catalog and the backend catalog drift independently. A preview
species missing from `SpeciesCatalog` produces a plant whose advice can never resolve, and the
parity test in P-02 would not catch it because it compares decisions, not identities.

**Fix.** Emit the preview set from the dataset into a committed fixture
(`shared/species_preview.json`, generated by a small script under `tools/`) and import it from
both the frontend and the backend test. If that is too much for this wave, at minimum add a
backend test that parses the ids out of `gardenApi.ts` and asserts each one exists in
`SpeciesCatalog`.

**done_when**

```
cd backend
python -m pytest tests/test_preview_species_exist.py -q
# all 8 ids from DEV_PREVIEW_SPECIES resolve in SpeciesCatalog with a verified source
```

**Files:** `frontend/src/lib/gardenApi.ts:140-222`, new backend test.

---

### P-12 (S4) Evidence artifacts do not show what their filenames claim

Each item below is visible in `docs/images/`. Note the scope: the committed captures show the
original eight companions and predate the 50-asset V5 expansion, so they cannot be used to
review the current build.

| Capture | Problem | Consequence |
|---|---|---|
| `docs/images/` as a set | 50 of 58 companions have no committed review capture. | The roster claim in `README.md` ("58 Plant Pals") has no visual evidence in the repo. 3D review of the expansion is impossible from committed artifacts. |
| `petey-soil-checkup.png` | Different bytes from `petey-living-garden.png`, same screen and composition. No checkup step is visible. | The core flow has no screenshot. A reader cannot audit the flow the README describes. |
| `petey-live-plant-pals.png` | A truncated toast ("g is logged in my care history. No w...") is baked into all eight tiles of the sheet, clipped mid-word. | The hero sheet of the 3D work is unusable for review or marketing. |
| `petey-lens-identifier.png` | The idle H1 renders inside a rounded focus rectangle with a thin mark at the text origin, so the page title reads as a text field. `PeteyLens.tsx:487` is an `<h1 tabIndex={-1}>` that is programmatically focused. | The first element on the screen looks editable and is not. |
| `petey-living-garden-mobile.png` | "Update soil" is clipped at the right edge; the Care badge overlaps its icon. The narrowest overflow gate is 320px, and this capture is 390px. | A real mobile width is uncovered by the gate. |
| All four garden captures | The darkest nav item is Petey Lens on Home, Care & Alerts and profile. | Ambiguous: either the active state does not track the route, or a promo CTA is styled identically to the active state. Decide which; do not leave both. |

**Fix.** Re-run the capture after the behaviour fixes, with the window resized to 390 and 1440,
toast dismissed, and the checkup flow actually open for the checkup shot. Add a 390px case to
the overflow gate. For the nav, pick one meaning and make the two states visually distinct.

**done_when.** Every file in `docs/images/` matches its filename, and `report.json` includes a
390px overflow check.

---

### P-13 (S4) 3D and model provenance: honest labels exist, so do not let them rot

**3D, from the renders** (`petey-live-plant-pals.png`, `petey-living-garden.png`):

1. No contact shadow. Leaves cast nothing onto the pot or saucer, so the specimen reads as a
   sticker on a painted backdrop. One shadow-casting light or a baked contact-shadow plane.
2. Monstera leaf veins do not follow the midrib; they read as diagonal tiling stripes. Fix the
   UV/leaf texture alignment in the material, not the geometry.
3. The specimen is cropped at the top in both desktop and mobile: the top leaf touches the
   canvas edge. The camera presets in `frontend/src/lib/three/speciesAssetRegistry.ts` are the
   place to widen it.
4. Staging is identical across all eight original tiles (same backdrop, sun, pot face, crop),
   and the 50 new assets inherit the same preset, so the expansion multiplies the sameness.
   Introduce per-species framing before the roster is presented as a showcase.
5. Light direction is inconsistent (top-left shafts, sun disc mid-right). If that is deliberate
   backlight, it needs a visible source; if not, align them.

**Model outputs, from the committed artifacts:**

- `docs/flight_readiness.json`: 5/35 PASS, 29 UNAVAILABLE, 1 UNQUALIFIED. All five passes are
  software fixtures; every accuracy, OOD, calibration and hardware gate is UNAVAILABLE.
  `cpu_p95_ms` is 1,319 against a 450 ms target.
- The gray-control result (blank synthetic image ranked Aloe Vera first) means the candidate
  answers confidently on non-plants. No species prediction may render without an OOD rejection
  path, regardless of what the accuracy gate later reports.
- `backend/config.py:45` `MUSE_API_BASE` is read nowhere; `FALLBACK = True` always. `config.py`
  documents this honestly. Keep that documentation; do not let any surface imply live inference.
- `backend/services/petey_muse_botanical_engine.py` (1,258 lines) synthesises rows with `random`
  and `hashlib`. Put `provenance: "synthetic"` on the record itself so no downstream renderer can
  present it as measured. A label that lives only in the UI can be bypassed by a new caller.

**done_when.** No new gate is added here; the requirement is that the existing honesty survives
the refactors. Run the flight-readiness generator after any change to `lens_pipeline/*` and
confirm the counts did not improve by accident.

---

## 5. Execution waves

Each wave is a separate PR. Do not start the next wave until the gate is green.

Tracking (one box per finding; do not tick without the `done_when` output in the PR):

```
[x] P-01 (S1) advice reachable for verified species
[x] P-02 (S1) preview cannot return ready
[x] P-03 (S1) Lens capture gated by capability
[x] P-04 (S2) details has a resolving action
[x] P-05 (S2) species picker shows advice availability
[x] P-06 (S2) clock skew clamped
[x] P-07 (S2) LAN / older-Safari request path fixed
[x] P-08 (S3) GardenApp split along lazy seams
[x] P-09 (S3) WEATHER_THEMES extracted
[x] P-10 (S3) CSS frozen, migrate-on-touch
[x] P-11 (S3) preview species fixture shared
[x] P-12 (S4) captures match their filenames
[x] P-13 (S4) 3D staging and provenance preserved
```

### Wave 0 - measurement, no behaviour change (half a day)

- Add `tools/slop-audit.mjs` and `tools/slop-budget.json` (section 6).
- Add `backend/tests/test_care_species_matrix.py` in `xfail`-style reporting mode so it prints
  the 31/2/29/48 counts without failing. This is the baseline for P-01.
- Add `frontend/verification/lens-capability.spec.ts` as a failing test (P-03) and
  `tests/test_checkup_clock.py` as a failing test (P-06). Red is the point.
- Gate: `python -m pytest -q` still 395 passed; new tests fail for the documented reason;
  `node tools/slop-audit.mjs` exits 0 with the baseline snapshot.

### Wave 1 - make the promise reachable (P-01, P-04, P-05)

- Gate on `verified_care_source`, derive prompts from the dataset, add `advice_status`,
  add the species/drainage editor.
- Gate: the matrix test passes 31 ready / 48 details / 0 mismatches; manual checkup on
  Dracaena, Aloe and Ficus reaches `ready` with the source shown.

### Wave 2 - stop making claims the product cannot back (P-02, P-03, P-06, P-07)

- Preview cannot return `ready`; Lens CTAs gated by capability; clock clamp; UUID and
  `AbortSignal` fallbacks.
- Gate: the two new specs pass; the garden journey passes; LAN-phone check recorded.

### Wave 3 - structural (P-08, P-09, P-10, P-11)

- One view per commit, journey after each; theme extraction; CSS freeze and migrate-on-touch;
  preview species fixture.
- Gate: shell under 300 lines; `weatherService.ts` under 500; ratchet counts unchanged or lower;
  `report.json` 41/41.

### Wave 4 - evidence and provenance (P-12, P-13)

- Recapture images with the fixes in place; add the 390px check; align the 3D staging.

---

## 6. The ratchet (add this before Wave 1)

`tools/slop-budget.json` - every value may only go down. `--init` re-records after a real
reduction has been reviewed.

```json
{
  "ts_type_escapes": 0,
  "todo_markers": 0,
  "console_log": 0,
  "nondeterminism": 0,
  "css_raw_hex": 348,
  "css_px_literals": 1072,
  "css_important": 10,
  "largest_ts_file_lines": 2288,
  "largest_css_file_lines": 4222,
  "care_decision_authorities": 2
}
```

`care_decision_authorities` is the count of distinct implementations of "when to water". It is
2 today (backend ladder + preview rule) and must become 1 when P-02 Option A lands. Do not
lower it by renaming files; lower it by deleting an implementation.

`tools/slop-audit.mjs` contract:

- Walks `frontend/src` for the four static gates; counts CSS hex/px/`!important` with regex
  `#[0-9a-fA-F]{3,8}\b`, `\b\d+(\.\d+)?px\b`, `!important`.
- Compares total line counts with `content.split("\n").length` (PowerShell
  `Measure-Object -Line` skips blank lines and understates every number).
- `care_decision_authorities` is read from the budget, not computed; a human lowers it with the
  deletion in the same PR. Any increase fails.
- Exit 1 with a per-gate diff on regression; exit 0 otherwise; `--init` writes the current
  values.

Rationale: this is the only mechanism that makes section 3.5 reverse itself. A review comment is
a one-time signal; a failing gate is a permanent one.

---

## 7. Protected invariants - a refactor that trades one of these away is a regression

1. Zero `as any`, `@ts-ignore`, `@ts-expect-error`, `TODO`, `FIXME`, `console.log` and
   `Math.random` in `frontend/src`. (Verified this session.)
2. 395 backend tests pass; the garden journey passes with both services running.
3. `validate_watering` keeps all four gates: soil dry, recommended depth, drainage established,
   no standing water. Do not relax them to make a species reachable.
4. Server-side `occurred_at`. The client never supplies the timestamp that is stored.
5. Idempotency: a retried care POST produces one event (`garden.mjs` asserts this after a lost
   response). Preserve it in any PATCH work.
6. `docs/flight_readiness.json` stays the single source for release claims. Never hardcode
   "available" in a component.
7. `assetStatus` in `speciesAssetRegistry` stays honest
   (`authored` / `imported` / `procedural_fallback` / `missing`). No surface may claim custom
   geometry for a `procedural_fallback` or `missing` asset.
8. Provenance labels stay at the point of use (`Owner reported`, `Estimated`, `Engine
   assessment`, `Species-level reference`, `Not stored by current backend schema`). The plant
   profile is the best screen in the product; do not flatten it into a generic card.
9. No silent preview activation. Preview mode is opt-in via `petey-dev-preview-mode-v1`.
10. No secrets, no `*.sqlite`, no `garden.sqlite` in git.

---

## 8. Not verified in this pass - do not treat as clean

- Owner art approval for all eight companions. `assetStatus` is a pipeline stage, not a quality
  claim, and the README says so.
- Model accuracy, OOD behaviour and calibration. 29 gates are UNAVAILABLE; there is no data to
  score. Do not invent a number.
- Blender source and animation. The 3D notes come from renders, not from the `.blend` files.
- `PalCharacter.tsx` (1,235 lines) and `PeteyLens.tsx` (977 lines) line by line.
- The garden journey was not re-run in this pass (no server pair was started). `report.json` is
  committed evidence, not a fresh run. Re-run it as the Wave 0 gate.
- The LAN/mobile failure in P-07 is derived from the platform rule plus `host: '0.0.0.0'`. It was
  not executed on a phone. The `done_when` includes that check; do it before claiming the fix.

---

## 9. Appendix A - reproduction scripts

Run all three from the repo root with `python` on PATH. They write nothing into the repo.

### A.1 Species reachability (P-01, P-05)

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path("backend").resolve()))
from data.seed_10k_species import SPECIES
from services import garden as G
from services.care_policy import AssessmentInput
from datetime import datetime, timedelta, timezone

now = datetime.now(timezone.utc)
obs = AssessmentInput(soil="dry", inspection_depth="recommended", drainage="yes",
                      standing_water="no", captured_at=now - timedelta(hours=1), based_on=None)

def status_for(sid):
    plant = {"id": "p", "name": sid, "species_id": sid, "drainage": "yes",
             "created_at": (now - timedelta(days=60)).isoformat()}
    hist = [{"id": "e", "kind": "dry",
             "occurred_at": (now - timedelta(hours=1)).isoformat(),
             "checkup": obs.model_dump_json()}]
    return G.plant_view(plant, hist, now)["status"]

verified = [s.scientific_name for s in SPECIES if G.verified_care_source(s)]
ready = [s for s in verified if status_for(s) == "ready"]
print("records", len(SPECIES), "verified", len(verified), "ready", len(ready))
print("blocked", [s for s in verified if s not in ready])
```

Expected today: `records 79 verified 31 ready 2`.

### A.2 The self-contradiction, over HTTP (P-01)

```python
import os, sys, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path("backend").resolve()))
os.environ["PETEY_GARDEN_DB"] = str(Path(os.environ["TEMP"]) / f"probe-{uuid.uuid4()}.sqlite")
from fastapi.testclient import TestClient
import main

c = TestClient(main.app)
H = {"X-Petey-Garden": str(uuid.uuid4())}
pid = str(uuid.uuid4())
c.post("/api/v1/garden/plants", headers=H,
       json={"id": pid, "name": "Snake", "species_id": "Dracaena trifasciata", "drainage": "yes"})
ctx = c.get(f"/api/v1/garden/plants/{pid}/checkup", headers=H).json()
body = {"soil": "dry", "inspection_depth": "recommended", "drainage": "yes",
        "standing_water": "no", "based_on": ctx["based_on"],
        "captured_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}
a = c.post(f"/api/v1/garden/plants/{pid}/assessments", headers=H, json=body).json()
p = c.post(f"/api/v1/garden/plants/{pid}/assessments/{uuid.uuid4()}/confirm", headers=H, json=body).json()
print(a["code"], "|", a["explanation"])
print("guidance:", (p["watering_guidance"] or "")[:60], "| source:", p["watering_source"])
```

Expected today: `INSUFFICIENT_EVIDENCE | This saved plant doesn't have a verified watering
policy in Petey.` followed by a non-empty guidance string and a source URL.

### A.3 Clock skew (P-06)

Same as A.2 with `captured_at = now + 3 minutes`. Expected today: HTTP 409,
"This observation's time is out of date."

---

## 10. Appendix B - evidence index

- `docs/images/petey-living-garden.png` - desktop garden, nav emphasis, right-rail density.
- `docs/images/petey-living-garden-mobile.png` - 390px clipping, badge overlap.
- `docs/images/petey-live-plant-pals.png` - eight original silhouettes; baked-in toast. The
  repo now ships 58 companions, so this sheet is stale.
- `ANTIGRAVITY_HANDOFF.md` - the V5 session continuation handoff (58 assets, verification
  commands, open work). Read it for asset work; this file is the review.
- `docs/images/petey-lens-identifier.png` - capability caveat above enabled primary CTA.
- `docs/images/petey-soil-checkup.png` - same screen as the garden capture, no checkup shown.
- `docs/images/petey-plant-health-triage.png` - triage states and severity treatment.
- `docs/images/petey-plant-detail-profile.png` - `Owner reported` / `Estimated` / `Engine
  assessment` labels; this is the strongest provenance surface in the product. Copy this pattern.
- `docs/images/petey-biophysical-lab.png` - "PLANT LAB - SYNTHETIC EXPERIMENTAL DEMO" and
  "Backend offline - running on the local biophysics engine". Correct labels; keep them.
- `docs/flight_readiness.json` - 5 PASS / 29 UNAVAILABLE / 1 UNQUALIFIED, NO-GO.
- `frontend/verification/report.json` - 41 passed, 0 failed (Lab shell, three viewports).
- `frontend/verification/garden.mjs` - the garden journey (Monstera only).
