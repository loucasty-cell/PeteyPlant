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

## Train a species head

Run this experiment separately from the app. It uses PyTorch and Transformers. Optional ONNX export also needs ONNX and ONNX Runtime. The normal garden service can run without the training packages.

Supply a frozen development manifest with independently grouped, reviewed original indoor photos. Both `train` and `val` must contain all eight supported species. Include reviewed unknown species or nonplant images in `val` for abstention calibration. Keep the final holdout in a separate private manifest. This command rejects test rows before opening images and applies the existing audit to the development split.

```text
python -m lens_pipeline.train_species --manifest development.jsonl --images photos --run-dir runs/openplants-head-01 --allow-download --export-onnx
```

Create the private `runs` directory first. Omit `--allow-download` to require already cached weights. The only backbone fetched by the command is the [pinned OpenPlants ViT revision](https://huggingface.co/domai-tb/OpenPlants-Identification-ViT-Base-Patch16-224/tree/30794da002827ad922366fe88840c5a2d8a4a31d), whose model card lists Apache-2.0. It uses safetensors and runs without repository-supplied executable code. The fit updates a small linear head using known training images. CPU head initialization and batch ordering are seeded. The backbone stays frozen. Inputs are oriented RGB, bilinear resized to 224 pixels and normalized with mean and standard deviation of 0.5 per channel.

The run writes `head.npz`, `model-config.json` and `training-report.json`, and optionally `species.onnx`. The report records the model revision, development dataset fingerprints, optimization settings, training loss, validation policy and artifact hashes. Export checks logits on one validation image against the actual Lens runtime. Treat that check as a compatibility smoke test. Validation metrics are measured on the same split used to fit the abstention policy, so they are development results. To qualify a candidate, use the existing evaluation workflow on the frozen artifact and final independent holdout, and measure the runtime latency before preparing any release bundle.

## Independent-group release check

The test report includes accepted photo counts and counts of connected plant/duplicate groups with any accepted prediction. A group is clean only when every accepted prediction in that group is correct. The optional photo-weighted bootstrap interval becomes unavailable when resampling yields no spread. The loader recomputes a one-sided 95% Wilson lower bound for the clean-group rate and requires it to reach 98% in addition to the existing 98% point precision, coverage, rejection and calibration checks. Under this rule, 200 correct photos from 100 independent groups yield a 97.37% clean-group lower bound. A perfect run needs at least 133 accepted groups to clear the bound.

This is a group-level release safeguard. Its assumptions include independent, representative groups. Continue to report the photo metrics separately. Existing reports without the raw accepted counts need to be regenerated with the new evaluator. [NIST confidence interval methods](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)
