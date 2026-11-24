"""Lens contract tests. Image-sensitive ONNX fixtures are test-only and untrained."""
from hashlib import sha256
from io import BytesIO
import json
import struct
from zlib import crc32

from fastapi import FastAPI
from fastapi.testclient import TestClient
import numpy as np
from PIL import Image
import pytest

from services import lens, lens_model
from services.lens_taxonomy import LAUNCH_SPECIES, TAXONOMY_VERSION, map_label


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def photo(color="red", mode="PNG", size=(200, 200), **save_options) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, format=mode, **save_options)
    return buffer.getvalue()


def send(client, data, mime="image/png", extra_headers=None):
    return client.post("/api/v1/lens/identify", content=data, headers={"Content-Type": mime, **(extra_headers or {})})


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("PETEY_LENS_RELEASE_MANIFEST", raising=False)
    lens_model._load_release.cache_clear()
    app = FastAPI()
    app.include_router(lens.router)
    yield TestClient(app)
    lens_model._load_release.cache_clear()


def test_default_mode_is_explicitly_unavailable(client):
    response = client.get("/api/v1/lens/status")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json()["status"] == "unavailable"
    result = send(client, photo()).json()
    assert result["request_id"]
    assert result["status"] == "unavailable"
    assert result["candidates"] == []
    assert result["model_version"] is None
    assert result["fallback_used"] is False


@pytest.mark.parametrize(("body", "mime", "code"), [
    (b"", "image/png", 400),
    (b"ordinary file", "image/png", 400),
    (photo(mode="JPEG"), "image/png", 415),
    (photo(), "text/plain", 415),
    (photo(size=(159, 200)), "image/png", 400),
    (photo(size=(160, 580)), "image/png", 400),
])
def test_malformed_uploads_are_rejected(client, body, mime, code):
    assert send(client, body, mime).status_code == code


def test_limits_reject_length_chunked_and_unreasonably_large_dimensions(client, monkeypatch):
    image = photo()
    assert send(client, b"", extra_headers={"Content-Length": str(lens.MAX_IMAGE_BYTES + 1)}).status_code == 413
    width_bytes = struct.pack(">II", 6000, 4500)
    header_data = b"IHDR" + width_bytes + image[24:29]
    oversized = image[:12] + header_data + struct.pack(">I", crc32(header_data)) + image[33:]
    assert send(client, oversized).status_code == 413
    monkeypatch.setattr(lens, "MAX_IMAGE_BYTES", 20)
    assert send(client, iter([b"y" * 15, b"y" * 15])).status_code == 413


def test_untrusted_exif_is_applied_to_pixels_and_removed_from_output(client):
    exif = Image.Exif()
    exif[274] = 6  # Rotate 90 degrees clockwise.
    exif[315] = "Private artist information"
    body = photo(mode="JPEG", size=(160, 256), exif=exif)
    with lens.decode_photo(body, "JPEG") as decoded:
        assert decoded.size == (256, 160)
        assert not decoded.info
        assert not decoded.getexif()
    assert send(client, body, "image/jpeg").status_code == 200


def test_taxonomy_keeps_species_keys_distinct_from_broad_names():
    assert map_label("Calathea makoyana").species_key == "Goeppertia makoyana"
    assert map_label("Sansevieria trifasciata").species_key == "Dracaena trifasciata"
    assert map_label("Areca Palm (Dypsis lutescens)").scientific_name == "Chrysalidocarpus lutescens"
    assert map_label("Chrysalidocarpus lutescens").species_key == "Dypsis lutescens"
    assert map_label("Calathea").taxonomic_rank == "genus"
    assert map_label("Snake plant (Sanseviera)").species_key is None
    assert map_label("Pothos (Ivy arum)").species_key is None
    assert map_label("Monstera deliciosa 'Thai Constellation'").species_key is None


@pytest.fixture
def bundle(tmp_path):
    onnx = pytest.importorskip("onnx")
    pytest.importorskip("onnxruntime")
    labels = sorted(LAUNCH_SPECIES) + ["unknown"]
    tensors = onnx.helper
    constants = np.zeros((3, len(labels)), dtype=np.float32)
    constants[0, labels.index("Monstera deliciosa")] = 8
    constants[2, labels.index("unknown")] = 8
    graph = tensors.make_graph(
        [tensors.make_node("ReduceMean", ["pixels"], ["color"], axes=[2, 3], keepdims=0),
         tensors.make_node("MatMul", ["color", "weights"], ["logits"])],
        "synthetic-rgb-test-only",
        [tensors.make_tensor_value_info("pixels", onnx.TensorProto.FLOAT, [1, 3, 128, 128])],
        [tensors.make_tensor_value_info("logits", onnx.TensorProto.FLOAT, [1, len(labels)])],
        [onnx.numpy_helper.from_array(constants, "weights")],
    )
    fixture_model = tensors.make_model(graph, opset_imports=[tensors.make_opsetid("", 13)], ir_version=8)
    artifact = fixture_model.SerializeToString()
    (tmp_path / "model.onnx").write_bytes(artifact)
    shared = {
        "artifact_sha256": digest(artifact), "input_width": 128, "input_height": 128,
        "mean": [0, 0, 0], "std": [1, 1, 1], "labels": labels,
        "temperature": 1, "acceptance_threshold": 0.80, "margin": 0.2,
    }
    report = {
        **shared, "split": "test", "manifest_sha256": "a" * 64, "decoded_images_sha256": "b" * 64,
        "heldout_known": 400, "heldout_unknown": 200, "accepted_precision": 339 / 342, "coverage": 0.85,
        "accepted_total": 342, "accepted_correct": 339, "accepted_groups": 250, "clean_accepted_groups": 249,
        "heldout_known_groups": 300, "heldout_unknown_groups": 100,
        "known_support_by_species": {key: 50 for key in LAUNCH_SPECIES}, "ece_bins": 15,
        "accepted_precision_ci95": [0.97, 1.0], "unknown_false_acceptance": 0.01, "ece": 0.03,
    }
    release = {
        **shared, "model_version": "synthetic-rgb-fixture", "taxonomy_version": TAXONOMY_VERSION,
        "artifact": "model.onnx", "evaluation": "evaluation.json",
        "runtime_benchmark": {"artifact_sha256": digest(artifact), "provider": "CPUExecutionProvider",
                              "scope": "decode_resize_inference", "hardware": "Synthetic fixture",
                              "timed_runs": 40, "warmup_runs": 3, "p50_ms": 50, "p95_ms": 80, "p99_ms": 90},
    }
    return tmp_path, release, report


def point_to_release(monkeypatch, bundle):
    directory, release, report = bundle
    report_bytes = json.dumps(report).encode()
    (directory / "evaluation.json").write_bytes(report_bytes)
    release_path = directory / "release.json"
    release_path.write_text(json.dumps({**release, "evaluation_sha256": digest(report_bytes)}))
    monkeypatch.setenv("PETEY_LENS_RELEASE_MANIFEST", str(release_path))


def test_real_onnx_runtime_reads_image_content_and_abstains(client, bundle, monkeypatch):
    point_to_release(monkeypatch, bundle)
    status = client.get("/api/v1/lens/status").json()
    assert status["status"] == "available"
    assert status["model_version"] == "synthetic-rgb-fixture"
    result = send(client, photo("red")).json()
    assert result["status"] == "possible_matches"
    assert result["candidates"][0]["species_key"] == "Monstera deliciosa"
    assert result["candidates"][0]["confidence"] > 0.8
    for color in ("black", "blue"):
        abstention = send(client, photo(color)).json()
        assert abstention["status"] == "need_another_photo"
        assert abstention["candidates"] == []
        assert abstention["another_photo_recommended"] is True


@pytest.mark.parametrize(("field", "replacement"), [
    ("split", "validation"), ("coverage", 0.79), ("ece", 0.04),
    ("unknown_false_acceptance", 0.05), ("temperature", 2), ("ece_bins", 14),
    ("heldout_known_groups", 99), ("heldout_unknown_groups", 59), ("known_support_by_species", {}),
    ("clean_accepted_groups", 250), ("accepted_groups", 90), ("accepted_correct", 340),
    ("known_support_by_species", {key: 51 for key in LAUNCH_SPECIES}),
    ("accepted_total", 349), ("accepted_precision_ci95", [339 / 342, 339 / 342]),
])
def test_failed_or_mismatched_evaluation_cannot_enable_an_artifact(client, bundle, monkeypatch, field, replacement):
    _, _, report = bundle
    report[field] = replacement
    point_to_release(monkeypatch, bundle)
    assert client.get("/api/v1/lens/status").json()["status"] == "unavailable"


def test_tampered_artifact_cannot_enable_matcher(client, bundle, monkeypatch):
    directory, _, _ = bundle
    point_to_release(monkeypatch, bundle)
    (directory / "model.onnx").write_bytes(b"changed artifact")
    assert client.get("/api/v1/lens/status").json()["status"] == "unavailable"


@pytest.mark.parametrize(("field", "replacement"), [
    ("p95_ms", 450), ("p50_ms", 85), ("timed_runs", 29), ("artifact_sha256", "a" * 64),
])
def test_cpu_flight_gate_rejects_slow_or_unpinned_benchmarks(client, bundle, monkeypatch, field, replacement):
    _, release, _ = bundle
    release["runtime_benchmark"][field] = replacement
    point_to_release(monkeypatch, bundle)
    assert client.get("/api/v1/lens/status").json()["status"] == "unavailable"


def test_perfect_photos_with_insufficient_independent_groups_cannot_release(client, bundle, monkeypatch):
    _, _, report = bundle
    report.update(
        accepted_precision=1.0, accepted_precision_ci95=None, accepted_total=340,
        accepted_correct=340, accepted_groups=100, clean_accepted_groups=100,
        unknown_false_acceptance=0.0,
    )
    point_to_release(monkeypatch, bundle)
    assert client.get("/api/v1/lens/status").json()["status"] == "unavailable"
