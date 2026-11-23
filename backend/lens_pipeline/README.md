# Petey Lens offline evaluation

Run from `backend`. Keep photos, embeddings, artifacts and reports in a private working directory outside Git. Do not use camera uploads as training data by default.

## Dataset contract

Each JSONL record identifies one original image. Supply `id`, `path` relative to the image directory, `source_id`, `source_url`, `creator`, `license`, `rights_review` (explicitly approved), `plant_instance_id`, `cluster_id`, `species_id`, `domain`, `split`, `original` and `human_reviewed`. Use `__unknown__` as the species ID for out-of-scope and negative examples. Record whether an unknown is a plant in separate plant detection data so species abstention and plant OOD are measured independently. Optional `symptoms` uses the eight canonical keys in `manifest.py` with `1` for seen, `0` for reviewed absent, and `-1` for unknown. Photos in validation and test must be human-reviewed indoor originals.

The audit checks decoded oriented RGB hashes, perceptual dHash candidates, dimensions, rights declarations and split grouping. Address candidate overlaps manually and run the embedding audit before training. Explicit group IDs keep views of a single plant and near-duplicate clusters together. Freeze the manifest and image hashes early. Keep the untouched holdout away from training, threshold tuning, conformal fitting and ablations.

Candidate sources have concrete limitations.

- The Mendeley V2 record reports 787 nursery photos and a CC BY 4.0 deposit. The original archive is actually named `01_raw_dataset.zip`. The public metadata lacks independent physical-plant IDs, so these alone cannot establish holdout independence. [DOI metadata](https://api.datacite.org/dois/10.17632/7wbstnfpjy.2) · [Deposit files](https://data.mendeley.com/public-api/datasets/7wbstnfpjy/files?folder_id=root&version=2)
- The second Mendeley deposit is a broad species classification set with pre-split and augmented material. Treat these labels and groups as unresolved until reviewed. Each source requires a per-image lineage assessment before intake. [DOI metadata](https://api.datacite.org/dois/10.17632/59rz3cj69v.1)
- The combined Kaggle publisher states that the source includes Roboflow material and the published Aloe test contains augmented images. Keep those original partitions out of Petey release evaluation. [Dataset publisher disclosure](https://www.linkedin.com/posts/abdul-ahad0296_dropping-the-link-here-since-i-dropped-it-earlier-activity-7467447501218934784-_88a) · [Sources cited by the publisher](https://universe.roboflow.com/nishad-a6yze/indoor-plant-disease-dataset-odg74)

## Commands

The commands below use illustrative local filenames. The taxonomy file contains an array of supported Garden IDs. `config.json` contains the raw model label order, input height/width and the RGB normalization mean/std. The runner writes new outputs and will refuse to replace an existing file.

```text
python -m lens_pipeline audit --manifest photos.jsonl --images photos --taxonomy taxonomy.json --output audit.json
python -m lens_pipeline predict --manifest photos.jsonl --images photos --taxonomy taxonomy.json --artifact model.onnx --model-config config.json --split val --output val.jsonl
python -m lens_pipeline calibrate --manifest photos.jsonl --images photos --taxonomy taxonomy.json --artifact model.onnx --model-config config.json --predictions val.jsonl --output policy.json
python -m lens_pipeline predict --manifest photos.jsonl --images photos --taxonomy taxonomy.json --artifact model.onnx --model-config config.json --split test --output test.jsonl
python -m lens_pipeline evaluate --manifest photos.jsonl --images photos --taxonomy taxonomy.json --artifact model.onnx --model-config config.json --predictions test.jsonl --policy policy.json --output test-report.json
python -m lens_pipeline.probe --manifest development.jsonl --embeddings embeddings.jsonl --ood-source unseen-nursery --oof-output oof.jsonl
python -m lens_pipeline.stress --help
python -m lens_pipeline.readiness --evidence evidence.json --json flight_readiness.json --markdown FLIGHT_READINESS_REPORT.md
```

The symptom probe requires a development-only manifest and cached embeddings. It rejects test rows, balances five connected-group folds, and reserves an indoor source and all its connected groups. Optional OOF logits can fit symptom-specific temperatures and F1/F2 thresholds. Conformal fitting requires a separate group-disjoint calibration set.

Run the test predictions and evaluation only after freezing the model and policy. Species scoring and serving share the ONNX adapter and label mapping. Report accepted precision over all accepted outputs, including unknown examples admitted in error. Report known coverage and unknown false acceptance with their own denominators. Intervals resample connected plant/cluster groups. CPU speed limits, species-only gates and full symptom/model readiness are distinct. A file that satisfies the model loader's schema is not evidence that a dataset represents household use, rights have been reviewed or a benchmark is independent.

The current runtime is disabled. The model candidate check is a smoke test on one licensed photo and one synthetic control. No representative model, promotion result or symptom probabilities are available.
