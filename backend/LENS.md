# Petey Lens photo identification

The Garden can use Lens to suggest species before the user confirms a plant. Without a reviewed model bundle, the API reports that photo matching is unavailable and the Garden can continue with manual species selection. Plant photo identification is a separate feature from symptom triage.

## HTTP interface

- `GET /api/v1/lens/status` reports availability, model version and taxonomy version.
- `POST /api/v1/lens/identify` takes raw JPEG, PNG, or WebP bytes with the corresponding `Content-Type`. The request may contain one still photo of up to 8 MiB with both edges between 160 and 8,192 pixels, a maximum aspect ratio of 3.5:1 and a maximum of 24 megapixels. The server processes the photo in memory, applies its orientation, removes metadata and keeps no persistent photo or remote inference copy, and logs no photo contents or metadata. Client polling or upload does not train the model.
- Results are `possible_matches`, `need_another_photo`, or `unavailable`. Candidate `species_key` values match existing Garden catalog keys. Broad, ambiguous and unmapped labels can trigger abstention and never become exact species. `confidence`, when present for the top result, is the temperature-adjusted model probability for that class. Users still compare plant features before confirming it.
- File-format, upload-size and decode failures return HTTP `415`, `413`, or `400`. Upload timeout returns `408`. A full queue, inference failure, or response timeout returns `503`. Two photo requests can be active per process. When a request times out during inference, the running worker still holds its slot until it finishes.

## Local model bundle

Install `onnxruntime` into the server's Python environment to enable an evaluated local bundle. Manual selection and the availability endpoint work with the base dependencies. Set `PETEY_LENS_RELEASE_MANIFEST` to a local JSON file and restart the backend. The server never fetches weights from an external service. Put the manifest, reviewed ONNX artifact and held-out evaluation report together in a server-managed folder outside the repository. Only give model-bundle write access to trusted operators.

The release manifest includes `model_version`, `taxonomy_version` (`petey-lens-1`), `artifact` (filename), `artifact_sha256`, `evaluation` (filename), and `evaluation_sha256`. Its `runtime_benchmark` contains the identical `artifact_sha256`, `provider` (`CPUExecutionProvider`), `scope` (`decode_resize_inference`), `hardware`, `timed_runs` (at least 30), `warmup_runs` (at least 3) and ordered `p50_ms`, `p95_ms`, `p99_ms`. The server requires measured CPU P95 below 450 ms. Use representative inputs on the target hardware. The manifest also includes inference settings copied exactly into the test report:

- `input_width`, `input_height` and channel arrays `mean`, `std` define the input. The ONNX graph takes one RGB float32 input `[1,3,H,W]`. The server resizes with PIL bilinear interpolation, divides each channel by 255 and then applies `(pixel - mean) / std`. Match that transform in evaluation.
- `labels` lists model output labels in order. The ONNX graph produces one float32 raw-logit tensor `[1,len(labels)]`. Each of the eight supported Garden species must be mapped exactly once. Additional output classes are retained in ranking and score normalization, which lets them trigger abstention.
- `temperature`, `acceptance_threshold` and `margin` define the frozen policy. Softmax runs over all outputs. An unsupported winner, insufficient top score, or insufficient difference from the second score triggers abstention.

The report must use the `test` split, pin the audited data and decoded-image fingerprints (`manifest_sha256`, `decoded_images_sha256`), and document these metric fields:

| Report field | Species activation condition |
| --- | --- |
| `heldout_known`, `heldout_unknown` | Both populations represented |
| `heldout_known_groups`, `heldout_unknown_groups` | At least 100 independent known groups and 60 independent unknown groups |
| `known_support_by_species` | At least 10 held-out photos per launch species |
| `accepted_precision`, `accepted_precision_ci95` | At least 0.98 accepted precision with a reported interval |
| `coverage` | At least 0.80 acceptance coverage on known species |
| `unknown_false_acceptance` | Less than 0.05 at the frozen policy |
| `ece`, `ece_bins` | Less than 0.04 top-label expected calibration error in 15 bins |

Deployment operators still need to independently review data provenance, split integrity, rights, model behavior under real indoor lighting, lookalike and non-plant failures, device performance and the end-to-end product release checks. This bundle contract concerns species identification. The runtime has no symptom classifier and these gates establish no symptom accuracy.

## Research candidates

| Candidate | Publisher information and disposition |
| --- | --- |
| [Iris 10](https://huggingface.co/brunopaiva15/iris) | CC BY 4.0 weights, with attribution to brunopaiva15. Two TFLite networks and a reference table provide 1,567 species. The card reports 86.5% top-1 on its own indoor split and 36.6% acceptance for uncatalogued plants under its indoor mask at the stated threshold. The publisher notes that its original Iris 9 per-image attribution manifest was lost. This checkout had no TFLite runtime, so Iris was reviewed and left unserved. |
| [OpenPlants ViT-Base](https://huggingface.co/domai-tb/OpenPlants-Identification-ViT-Base-Patch16-224) | Apache-2.0 weights, about 14,000 species and 97.2M parameters. The card describes training on GBIF and iNaturalist occurrences. It supplies no independent Petey indoor benchmark. Retain for future comparison with grouped indoor data. |
| [BioCLIP 2.5 Huge](https://huggingface.co/imageomics/bioclip-2.5-vith14) | MIT weights, OpenCLIP ViT-H/14 with standard CLIP preprocessing. The scientific card reports broad biology tasks. Frozen embeddings would be a research candidate if representative data and suitable compute are available. |
| [House-plant ONNX](https://huggingface.co/onnx-community/house-plant-image-detection-ONNX) | Apache-2.0 conversion of [dima806's ViT](https://huggingface.co/dima806/house-plant-image-detection). Its 47 labels mix species, genera and other broad categories. Only Aloe Vera, Areca Palm and Monstera have direct mappings to the launch scope under the audited taxonomy. The original benchmark cannot establish Petey release performance. An 87 MB int8 artifact was used locally for research and stays outside the app. |

The taxonomy uses Kew sources for [snake plant](https://powo.science.kew.org/taxon/77164235-1), [peacock plant](https://powo.science.kew.org/taxon/60461041-2), [aloe](https://powo.science.kew.org/taxon/530017-1), and [areca palm](https://powo.science.kew.org/taxon/665962-1). For areca palm, `Dypsis lutescens` remains the stored Garden key and the current accepted species name is `Chrysalidocarpus lutescens`.

## Local inference smoke

ONNX Runtime 1.30.0 loaded `onnx/model_int8.onnx` from [pinned upstream revision 24d519d](https://huggingface.co/onnx-community/house-plant-image-detection-ONNX/tree/24d519d5ce1dd1a44b159b4e1bef012d01f30b95), SHA-256 `d746a150317b670ed308c243b4aba46f1c0e69c5d1da68e7713b8aca72097c0b`. The Windows CPU session took 1.257 seconds to initialize. After three warmups, 35 requests to the local processing function with one repeated JPEG yielded P50/P95/P99 of 854.0/1,319.0/1,510.2 ms for decode, resize and inference. These timings exclude HTTP, device camera work and model initialization.

The top raw label on the [single CC BY Monstera observation by adamrb2](https://www.inaturalist.org/observations/415414433) (photo 764930338, `large` resolution) was *Monstera deliciosa*. The same candidate's raw classifier gave Aloe Vera as the top label for a synthetic plain gray image. This smoke establishes that the artifact runs. Independent accuracy, calibration, out-of-distribution rejection and 8-species coverage remain unestablished, so this model stays outside the app. Its CPU P95 also exceeded both the 450 ms goal and the 900 ms hard-abort comparison in the flight plan.
