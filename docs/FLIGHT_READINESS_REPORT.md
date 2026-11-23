# Petey Lens flight readiness

**FLIGHT STATUS — NO-GO**

Release requires all seven suites to pass. The coverage target is 80%, within the requested 75–85% range.
An unavailable measurement has no value. Unqualified measurements lack declared reviewed holdout and artifact provenance.
Software fixtures verify behavior on the scenarios run. Independent indoor photos and the frozen candidate are required for model performance claims.

## Suite verdicts

| Suite | Verdict |
|---|---|
| 1. Data integrity and leakage | INCOMPLETE |
| 2. Image perturbations | INCOMPLETE |
| 3. Domain shift and shortcuts | INCOMPLETE |
| 4. Non-plant rejection | INCOMPLETE |
| 5. Statistical rigor and calibration | INCOMPLETE |
| 6. Care failure modes | INCOMPLETE |
| 7. Hardware and production parity | INCOMPLETE |

## Release measurements

| Suite | Metric | Target | Measured | Evidence | Result |
|---|---|---|---|---|---|
| 1 | Shared image hashes | = 0 | Unavailable | representative evidence required | UNAVAILABLE |
| 1 | Shared plant-instance IDs | = 0 | Unavailable | representative evidence required | UNAVAILABLE |
| 1 | Shared duplicate-cluster IDs | = 0 | Unavailable | representative evidence required | UNAVAILABLE |
| 1 | Near-duplicate test images | ≤ 1.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 2 | Relative Macro-mAP drop under warm light | < 5.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 2 | All specified perturbations evaluated | = true | Unavailable | representative evidence required | UNAVAILABLE |
| 3 | Variegated healthy chlorosis false positives | < 8.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 3 | Background-only Macro-mAP above prevalence | ≤ 8.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 3 | Source and species holdout comparisons | = true | Unavailable | representative evidence required | UNAVAILABLE |
| 4 | Non-plant negative images | ≥ 300 | Unavailable | representative evidence required | UNAVAILABLE |
| 4 | OOD false positives at 95% plant recall | < 5.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 4 | OOD AUROC measured | ≥ 0.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 4 | OOD AUPR measured | ≥ 0.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Precision on accepted predictions | ≥ 98.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Coverage at the same operating point | ≥ 80.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Macro-mAP gain over frozen probe | > 0.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Lower 95% CI bound of Macro-mAP gain over frozen probe | > 0.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Pest signs F2 | ≥ 85.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Leaf spots and lesions F2 | ≥ 85.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Post-scaling ECE, 15 bins | < 4.00% | Unavailable | representative evidence required | UNAVAILABLE |
| 5 | Cluster CIs, reliability and conformal audit | = true | Unavailable | representative evidence required | UNAVAILABLE |
| 6 | Deterministic care scenarios run | ≥ 50 | 126 | software fixtures | PASS |
| 6 | Wet-soil cases observed | > 0 | 36 | software fixtures | PASS |
| 6 | Wet-soil harmful advice cases | = 0 | 0 | software fixtures | PASS |
| 6 | Ambiguous unknown-soil cases observed | > 0 | 30 | software fixtures | PASS |
| 6 | Ambiguous cases missing a soil check | = 0 | 0 | software fixtures | PASS |
| 6 | Dry-down adversarial and winter tests | = true | Unavailable | software fixtures | UNAVAILABLE |
| 7 | GPU P95 latency | < 120 ms | Unavailable | representative evidence required | UNAVAILABLE |
| 7 | CPU P95 latency | < 450 ms | 1319 ms | unqualified run | UNQUALIFIED |
| 7 | Peak VRAM | < 3.5 GB | Unavailable | representative evidence required | UNAVAILABLE |
| 7 | Out of memory failures | = 0 | Unavailable | representative evidence required | UNAVAILABLE |
| 7 | ONNX maximum absolute logit difference | < 0.001 | Unavailable | representative evidence required | UNAVAILABLE |
| 7 | ONNX top-class agreement | > 99.90% | Unavailable | representative evidence required | UNAVAILABLE |
| 7 | Independent-repeat maximum difference | < 1e-06 | Unavailable | representative evidence required | UNAVAILABLE |
| 7 | CPU and GPU single and batch hardware profile | = true | Unavailable | representative evidence required | UNAVAILABLE |

## Stage evidence

| Stage | Work | Recorded evidence and cluster CI |
|---|---|---|
| 0 | Zero-shot and frozen probe baselines | Grouped five-fold symptom probe and held-source runner passed synthetic preflight. A real community ONNX species candidate ran for execution smoke only. No representative comparison or cluster interval. |
| 1 | Warm-start and controlled fine-tuning | Blocked by absence of an independently grouped indoor corpus for supervised fine-tuning and a qualified baseline. |
| 2 | Regularization and hard negatives | Offline perturbation and leakage tools passed synthetic tests. No model comparison or hard-negative mining run. |
| 3 | Weight ensembling and test-time augmentation | No fine-tuned weights, OOD comparison, or ensemble promotion result. |
| 4 | Calibration and selective prediction | Species and symptom calibration and split conformal helpers are implemented. Software checks use fixtures. No representative OOF calibration or holdout score is available. |

## Symptoms

| Observable symptom | PR-AUC | F1 | F2 | Positive / total | Threshold | Temperature |
|---|---|---|---|---|---|---|
| healthy | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| chlorosis_yellowing | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| necrosis_brown_tips_edges | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| spots_lesions_rot | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| wilting_turgor_loss | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| pest_damage_signs | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| etiolation_light_stress | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| mechanical_or_senescence | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |

## Risk and coverage

| Target coverage | Observed coverage | Selective precision | Abstention |
|---|---|---|---|
| 60% | Unavailable | Unavailable | Unavailable |
| 70% | Unavailable | Unavailable | Unavailable |
| 80% | Unavailable | Unavailable | Unavailable |
| 90% | Unavailable | Unavailable | Unavailable |
| 100% | Unavailable | Unavailable | Unavailable |

## Hardware, worst cases, and data priorities

- Hardware profile · Unavailable
- Worst cases · Unavailable
- Data collection priorities by uncertainty or error · Unavailable

## Software evidence

- Harmful advice among wet-soil fixtures · 0.00%
- Soil-check prompt among ambiguous fixtures · 100.00%
- 357 integrated backend tests passed. Frontend production build passed. All 25 automated contrast pairs passed.
- Edge verified the Garden and Petey Lens journeys, click-through, eight live Three.js companions, idle motion, profile dance and reduced motion. The camera used browser test media. Candidate comparison used fixtures.
- The 126 deterministic plant-health cases include 36 wet-soil cases and 30 ambiguous unknown-soil cases. Garden schedule fixtures cover inconsistent, missed, stale and repeated moist checks. A Bayesian winter-temperature model was not exercised.
- One community ONNX candidate ran on one licensed Monstera photo and one synthetic gray control. The gray input ranked Aloe Vera first. Direct model label coverage was three of eight launch species.
- Candidate CPU measurement across 35 repeated decode-to-logit calls after three warmups yielded P50 854.0 ms, P95 1319.0 ms and P99 1510.2 ms. P95 exceeded the 450 ms goal and the 900 ms hard-abort boundary for this candidate. These repeats do not estimate accuracy or qualify a release.
- Public Mendeley V2 metadata verifies a CC BY 4.0 deposit and 787 photos but does not identify independent physical plants per photo. No reviewed indoor holdout or approved release artifact was available.
- Collect independent multi-view groups for each of the eight launch species and recruit a separate household or nursery source before measuring accuracy. Prioritize confirmed pest and spot examples, healthy variegated specimens, warm indoor light captures, and non-plant scenes. No empirical class confidence interval exists to rank priorities statistically.
