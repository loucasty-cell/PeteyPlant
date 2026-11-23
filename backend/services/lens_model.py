"""Local plant species inference with a versioned, evaluated ONNX artifact."""
from functools import lru_cache
from hashlib import sha256
import logging
import os
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal

import numpy as np
from PIL import Image
from pydantic import BaseModel, Field, StringConstraints, model_validator

from services.lens_taxonomy import LAUNCH_SPECIES, TAXONOMY_VERSION, map_label

logger = logging.getLogger(__name__)
Probability = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Finite = Annotated[float, Field(allow_inf_nan=False)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Digest = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Dimension = Annotated[int, Field(ge=32, le=1024)]
PolicyTemperature = Annotated[float, Field(gt=0, le=100, allow_inf_nan=False)]
MAX_ARTIFACT_BYTES = 512 * 1024 * 1024
_MANIFEST_LOCK = Lock()


class InferenceSpec(BaseModel):
    artifact_sha256: Digest
    input_width: Dimension
    input_height: Dimension
    mean: tuple[Finite, Finite, Finite]
    std: tuple[Finite, Finite, Finite]
    labels: Annotated[list[Label], Field(min_length=2, max_length=20_000)]
    temperature: PolicyTemperature
    acceptance_threshold: Probability
    margin: Probability

    @model_validator(mode="after")
    def validate_preprocessing(self):
        if any(value < 1e-6 for value in self.std):
            raise ValueError("The standard deviations must be positive.")
        if len(set(self.labels)) != len(self.labels):
            raise ValueError("Model output labels must be unique.")
        return self


class CPUFlightReport(BaseModel):
    artifact_sha256: Digest
    provider: Literal["CPUExecutionProvider"]
    scope: Literal["decode_resize_inference"]
    hardware: Label
    timed_runs: Annotated[int, Field(ge=30)]
    warmup_runs: Annotated[int, Field(ge=3)]
    p50_ms: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    p95_ms: Annotated[float, Field(gt=0, lt=450, allow_inf_nan=False)]
    p99_ms: Annotated[float, Field(gt=0, allow_inf_nan=False)]

    @model_validator(mode="after")
    def validate_latency_order(self):
        if not self.p50_ms <= self.p95_ms <= self.p99_ms:
            raise ValueError("Benchmarked latencies must be ordered.")
        return self


class ReleaseSpec(InferenceSpec):
    model_version: Label
    taxonomy_version: Literal[TAXONOMY_VERSION]
    artifact: Label
    evaluation: Label
    evaluation_sha256: Digest
    runtime_benchmark: CPUFlightReport

    @model_validator(mode="after")
    def validate_benchmarked_artifact(self):
        if self.runtime_benchmark.artifact_sha256 != self.artifact_sha256:
            raise ValueError("The CPU benchmark did not measure the release artifact.")
        return self


class HoldoutReport(InferenceSpec):
    split: Literal["test"]
    manifest_sha256: Digest
    decoded_images_sha256: Digest
    heldout_known: Annotated[int, Field(gt=0)]
    heldout_unknown: Annotated[int, Field(gt=0)]
    heldout_known_groups: Annotated[int, Field(ge=100)]
    heldout_unknown_groups: Annotated[int, Field(ge=60)]
    known_support_by_species: dict[str, Annotated[int, Field(ge=0)]]
    accepted_precision: Annotated[float, Field(ge=0.98, le=1, allow_inf_nan=False)]
    coverage: Annotated[float, Field(ge=0.80, le=1, allow_inf_nan=False)]
    accepted_precision_ci95: tuple[Probability, Probability]
    unknown_false_acceptance: Annotated[float, Field(ge=0, lt=0.05, allow_inf_nan=False)]
    ece: Annotated[float, Field(ge=0, lt=0.04, allow_inf_nan=False)]
    ece_bins: Literal[15]

    @model_validator(mode="after")
    def validate_evidence(self):
        if self.heldout_known_groups > self.heldout_known or self.heldout_unknown_groups > self.heldout_unknown:
            raise ValueError("The number of independent groups cannot exceed the number of photos.")
        if any(self.known_support_by_species.get(key, 0) < 10 for key in LAUNCH_SPECIES):
            raise ValueError("Every launch species requires at least ten held-out photos.")
        lower, upper = self.accepted_precision_ci95
        if not lower <= self.accepted_precision <= upper:
            raise ValueError("The confidence interval must contain the estimate.")
        return self


def _read_pinned_file(directory: Path, name: str, expected_hash: str, maximum_bytes: int) -> bytes:
    path = (directory / name).resolve()
    if path.parent != directory or path.name != name:
        raise ValueError("Artifact files must be next to the release manifest.")
    with path.open("rb") as file:
        data = file.read(maximum_bytes + 1)
    if len(data) > maximum_bytes or sha256(data).hexdigest() != expected_hash:
        raise ValueError("Artifact size or checksum did not match.")
    return data


class LocalLensModel:
    def __init__(self, artifact: bytes, spec: InferenceSpec):
        import onnxruntime as ort

        self.spec = spec
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(artifact, sess_options=options, providers=["CPUExecutionProvider"])
        inputs, outputs = self.session.get_inputs(), self.session.get_outputs()
        input_ok = (
            len(inputs) == 1 and inputs[0].type == "tensor(float)"
            and _shape_matches(inputs[0].shape, (1, 3, spec.input_height, spec.input_width))
        )
        output_ok = (
            len(outputs) == 1 and outputs[0].type == "tensor(float)"
            and _shape_matches(outputs[0].shape, (1, len(spec.labels)))
        )
        if not input_ok or not output_ok:
            raise ValueError("Model tensor signature did not match the Lens contract.")
        self.input_name = inputs[0].name
        self.output_name = outputs[0].name

    def logits(self, photo: Image.Image) -> np.ndarray:
        resized = photo.resize((self.spec.input_width, self.spec.input_height), Image.Resampling.BILINEAR)
        array = np.asarray(resized, dtype=np.float32) / np.float32(255)
        mean = np.asarray(self.spec.mean, dtype=np.float32)
        std = np.asarray(self.spec.std, dtype=np.float32)
        tensor = np.ascontiguousarray(((array - mean) / std).transpose(2, 0, 1)[None])
        logits = np.asarray(self.session.run([self.output_name], {self.input_name: tensor})[0], dtype=np.float64)
        if logits.shape != (1, len(self.spec.labels)) or not np.isfinite(logits).all():
            raise ValueError("The model returned invalid logits.")
        return logits[0]

    def probabilities(self, photo: Image.Image) -> np.ndarray:
        logits = self.logits(photo)
        exponent = np.exp((logits - logits.max()) / self.spec.temperature)
        return exponent / exponent.sum()


def _shape_matches(actual, expected) -> bool:
    return bool(actual is not None and len(actual) == len(expected)
                and all(isinstance(found, str) or found is None or found == need for found, need in zip(actual, expected)))


def _release_spec(path: Path) -> tuple[ReleaseSpec, bytes]:
    directory = path.parent
    release = ReleaseSpec.model_validate_json(path.read_bytes())
    report_data = _read_pinned_file(directory, release.evaluation, release.evaluation_sha256, 8 * 1024 * 1024)
    report = HoldoutReport.model_validate_json(report_data)
    if any(getattr(release, field) != getattr(report, field) for field in InferenceSpec.model_fields):
        raise ValueError("The held-out evaluation did not match the artifact configuration.")
    launch_mappings = [map_label(label).species_key for label in release.labels]
    covered = [key for key in launch_mappings if key in LAUNCH_SPECIES]
    if len(covered) != len(LAUNCH_SPECIES) or set(covered) != LAUNCH_SPECIES:
        raise ValueError("The released label set must map once to each of the eight launch species.")
    return release, _read_pinned_file(directory, release.artifact, release.artifact_sha256, MAX_ARTIFACT_BYTES)


@lru_cache(maxsize=1)
def _load_release() -> tuple[LocalLensModel, ReleaseSpec] | None:
    path = os.getenv("PETEY_LENS_RELEASE_MANIFEST")
    if not path:
        return None
    try:
        spec, artifact = _release_spec(Path(path).resolve())
        model = LocalLensModel(artifact, spec)
        model.logits(Image.new("RGB", (spec.input_width, spec.input_height)))
    except Exception as error:
        logger.warning("Petey Lens release could not be loaded (%s)", type(error).__name__)
        return None
    return model, spec


def released_model() -> tuple[LocalLensModel, ReleaseSpec] | None:
    with _MANIFEST_LOCK:
        return _load_release()
