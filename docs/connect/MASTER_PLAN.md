# Project Connect

Petey turns a plant owner's observations into one next action. The living companion depicts the confirmed plant and responds to supported care states. Camera evidence, botanical reference facts, owner observations, estimated values, and Plant Lab fixtures have different provenance.

The [engineering integrity plan](ENGINEERING_INTEGRITY.md) adds the EI and ML workstreams from the follow-up briefs. It maps them to the weekly milestones and records the software checks, authority boundaries and release dependencies.

## Where the project stands

- The latest botanical wave at `496f32e` brought the total to 37 individually refined companions out of 58 authored models. A local FastAPI request returned 84 Garden identities. The remaining 21 models and the Blender to Three.js runbook live in the [botanical art plan](../botanical-art-plan.md).
- Garden stores pot capacity, potting mix and confirmed Checkups. The rules hold watering on fresh wet mix or standing water evidence. Quantitative dosing awaits independent physical validation. See [the frontend handoff](../../FRONTEND_HANDOFF.md) and [care policy](../../backend/services/care_policy.py).
- Lens still requires an independent rights-reviewed indoor corpus, a frozen holdout and a qualifying artifact on representative hardware. The [Lens interface and bundle contract](../../backend/LENS.md), [pipeline](../../backend/lens_pipeline/README.md) and [release report](../FLIGHT_READINESS_REPORT.md) own those details.

## Dependency and gap register

| Work package | Status and dependency | Evidence required to close |
| --- | --- | --- |
| PP-01–06 · identity, botanical evidence and care inputs | Garden identity and observation flow are implemented. Cultivar mappings, reviewed root profiles, indoor estimates and nutrition policies remain open. | Reviewed field-level sources, supported/unsupported catalog matrix and safety cases using plant-bound observations. |
| PP-07–09 and PP-11 · Lens, dimensions, appearance and symptoms | Production matching remains gated. Manually set plant identity remains available. | Rights-reviewed grouped images, frozen holdout, uncertainty checks, representative device profile and a confirmed owner review step. |
| PP-10 · Blender masters and personalized plant | Species-specific material and anatomy passes in progress. Preserve the active registry, camera and animation fallback. | Every reviewed model has traceable references, editable source, runtime GLB, transparent preview, actual motion and stage evidence. Per-plant appearance persistence and reviewed cultivar variants are subsequent work. |
| PP-12–15 · health decisions, quantity, feedback and expressions | Existing triage and care hold logic provide the base. Plant-specific diagnosis, validated volume, learned dry-down and broader condition coverage remain open. | Distinguishing observations, consented longitudinal records and held-out physical trials. Explicit uncertainty and refusal cases must pass. |
| PP-16–17 · reminders and outcomes | Notification support is session-scoped. Background delivery and longitudinal outcomes remain open. | Real subscription lifecycle and idempotent delivery tests, followed by outcome tracking for a consenting sample. |
| PP-18 and PP-21 · physical trials and mobile release | Software fixtures and responsive browser runs exist. Both work packages await real devices or plants. | Consented measurements, repeated runs with versioned provenance, physical-device animation, responsiveness, power and thermal evidence. |
| PP-19–20 and PP-22–24 · trust and release | Existing provenance UI and automated verification provide a base. Account recovery, production authorization, accessibility review, household pilot and incident lifecycle remain open. | Environment-specific verification and independent review, followed by a consenting pilot with operational recovery evidence. |

## Art implementation plan for PP-10

1. **Scope the specimen.** Record phenotype or cultivar, leaf faces, organ relief, exposed structures and references. The botanical art matrix lists one scope per species. Each art workstream owns its IDs and writes candidate files outside the shipping directories.
2. **Refine the current master.** Preserve the pot and facial vocabulary, rig, species key and fallback. Color broad native markings with vertex pigment. Use supported PBR texture channels when the finish needs finer grain. Use geometry for joints, ribs, margins and exposed roots. Reject unsupported visual symptoms and generic surface overlays.
3. **Review the artifact.** Check source geometry, material or attribute presence, motion seams and deformation. Review front, side, rear, and the specific feature at close range. Validate export budgets and exercise the live Garden canvas at 375 px and desktop. Record what was actually reviewed per model.
4. **Integrate.** The primary integrator regenerates the expansion registry once after candidate acceptance. Each Blender master, GLB, thumbnail and spec goes into its existing indexed folder and asset path. See [the asset index](../../assets/characters/README.md) and [verification guide](../../tools/blender/README.md).
5. **Advance personalization only with evidence.** Establish an owner-reviewed per-plant appearance contract before applying camera estimates. Measured dimensions require calibrated inputs. If plant identity is uncertain, present candidates or manual selection. Keep exposed roots only where the specimen or growing setup supports them.

The [Antigravity handoff](../../ANTIGRAVITY_HANDOFF.md) tracks current verification and [PLANS.md](../../PLANS.md) records each integrated wave. The physical, Lens and production gates remain independent of the art pass.

## Four-week execution plan

Weeks describe dependency order and acceptance milestones. Work that needs plants, a rights-reviewed corpus, independent reviewers or physical devices stays open until that evidence is available. Owners below are workstream roles. The active handoff records actual assignments.

### Week 1 · Identity, evidence and measurements

| Package | Owner | Deliverable and acceptance evidence |
| --- | --- | --- |
| PP-01 | Integration | Reconcile stable Garden IDs, accepted taxa, synonyms and reviewed cultivar identities. Test saved-record compatibility, lookalikes and unsupported cultivars. |
| PP-02 | Horticulture | Profile the eight flagships first. Cite root architecture, natural habit, substrate, drainage, dry-down, light, environment, nutrition, pests and household safety at field level. |
| PP-03 | Biophysics | Define the indoor measurements needed for a microclimate estimate. Compare room readings with model estimates across placement and ventilation conditions before enabling personalized indoor estimates. |
| PP-04 | Integration | Verify ownership, timestamps, freshness, retries and safety-policy invariants. Label measured, observed, inferred, retrieved and synthetic inputs. Exercise wet, stale and unknown conditions through the real API. |
| PP-05 | Horticulture | Record author, reference, population, supported fact, limitations and review state. Require reviewed provenance before evidence feeds care policy. |
| PP-06 | Horticulture | Evaluate nutrition and household amendments for specific plant and growing contexts. Publish only qualified guidance with contraindications. Continue the review through Week 3. |

Start consent, rights review and the physical observation protocol in Week 1. Group images by specimen and source. Record plant identity, container and substrate, drainage, time, mass or other calibrated moisture measurement, recent care and indoor conditions. Preserve sampling and measurement uncertainty. Keep raw samples and private ownership data in the approved collection location.

### Week 2 · Lens and living botanical twins

| Package | Owner | Deliverable and acceptance evidence |
| --- | --- | --- |
| PP-07 | Lens | Compare image checks, local candidates and a frozen baseline. Freeze grouped data partitions before tuning. Report precision, coverage, unknown rejection, calibration and target hardware timing against the [Lens contract](../../backend/LENS.md). |
| PP-08 | Lens | Estimate dimensions only with verified scale input. Measure absolute errors and uncertainty by pose, camera and scale visibility on held-out plants. |
| PP-09 | Lens and Garden | Validate plant and pot segmentation and multi-view morphology. Let the owner review leaf geometry, visible pigments and pot appearance before persisting appearance to the confirmed owned plant. |
| PP-10 | Technical art | Refine the editable Blender masters and verify the app stage. Preserve export metadata, animation and fallbacks. Add appearance controls and reviewed cultivar variants after the core mapping. Use the [58-species art runbook](../botanical-art-plan.md). |
| PP-11 | Lens and plant health | Evaluate visible symptoms separately from identity. Audit healthy variegation, pest evidence, lesions, unsupported classes and lookalikes. Report label support, misses and abstentions. Continue through Week 3. |

Use calibrated, owner-confirmed input for personalized appearance. Model exposed roots only when the plant's species and growth context support them. Verify a saved plant loads the expected companion and remains associated after reload. The [flight readiness report](../FLIGHT_READINESS_REPORT.md) defines the current Lens qualification.

### Week 3 · Adaptive care, plant health and reminders

| Package | Owner | Deliverable and acceptance evidence |
| --- | --- | --- |
| PP-12 | Plant health | Compare plausible causes and ask for the next distinguishing observation. Review overlapping symptoms and escalation against independently examined examples. |
| PP-13 | Biophysics | Validate a root-zone water balance against physical measurements. Keep deterministic holds. Enable quantitative doses only for input combinations that pass independent validation and uncertainty criteria. |
| PP-14 | Biophysics | Estimate dry-down from measured history with an explicit uncertainty interval. Evaluate drift, repotting and delayed observations. Keep experimental controllers in Plant Lab pending safety and holdout evidence. |
| PP-15 | Garden experience | Connect the proposed 30 or more meaningful conditions to one prioritized action and supported companion expression. Test concurrent observations, expiry, reduced motion and unavailable data. |
| PP-16 | Infrastructure | Implement background reminder registration, permission UX, deduplicated delivery and revocation. Prove delivery while Garden is closed on the supported targets. |
| PP-17 | Product | Link care actions to later observations and record timestamps and uncertainty. Verify notification, Checkup, idempotent care event and follow-up outcome across reload. Continue through Week 4. |

Exercise the observation-to-action-to-outcome loop with deterministic software fixtures and with a consented physical cohort. Keep Plant Lab experiments and durable owner care events separate.

### Week 4 · Trust, device testing and release

| Package | Owner | Deliverable and acceptance evidence |
| --- | --- | --- |
| PP-18 | Independent QA | Compare predictions with held-out physical measurements. Report grouped samples, uncertainty, adverse outcomes and missing data. Collection starts in Week 1. |
| PP-19 | Product and horticulture | Test owners' understanding of what was observed, what is uncertain and what to do next in Garden, Health and Lens. Include unavailable and manual paths. |
| PP-20 | Infrastructure | Verify production authorization and isolation, privacy and photo handling, retention, account recovery, deployment and rollback. |
| PP-21 | Mobile and QA | Profile physical-device GPU frame time, responsiveness, heat and power under normal stage use. Verify keyboard, screen-reader, offline and reduced-motion paths separately. |
| PP-22 | Integration and independent QA | Review the spec, actual behavior and evidence independently. Require the appropriate suite and a scoped handoff before promotion. Runs throughout. |
| PP-23 | Product | Run a consenting household pilot and independent horticultural review. Record usefulness, trust, care actions, longitudinal outcomes and adverse events. |
| PP-24 | QA and infrastructure | Track incidents by affected version, severity, evidence, remediation and regression verification. Rehearse recovery for a representative Garden or Lens failure. |

### Release evidence and weekly handoff

For each package record the problem, source evidence, owner, dependencies, affected files, implementation choice, risks, acceptance criteria, commands and measured results. Use `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED` and `REJECTED` as explicit states. Assign one integration owner per shared contract. Record the reviewed build, data and artifact versions in the final readiness report.

The art gate checks saved Blender source, GLB budgets and actual clips, desktop and 375 px rendering, fallback recovery and a saved Garden identity. The Garden software gate runs real save, reload and Checkup over an isolated database. The independent Lens, physical care, production and owner art reviews have their own completion evidence.
