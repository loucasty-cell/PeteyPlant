"""Superpowers hardening pass: TDD red-first tests for gaps found by
failure-mode brainstorming + probing (see /tmp/superpowers-hardening/notes.md).

Each test names the break it catches. Tests 1-5 are RED tests for real
defects; tests 6-9 are regression guards for behavior that already holds
(they pass before and after — their job is to pin it).
"""
import io
import struct
import sys
import time
import zlib
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from data.seed_10k_species import SPECIES
from data_pipeline.muse_extractor import extract_golden_record
from services import ml_vision
from services.rag_engine import care_chunk
from services.tool_registry import ToolRegistryError, dispatch

client = TestClient(main.app)


def _plant(pid):
    return main.PLANTS[pid]


def _save(pid):
    p = _plant(pid)
    return {
        "streak_days": p.streak_days, "xp": p.xp,
        "last_watered_date": p.last_watered_date,
        "moisture_pct": p.moisture_pct, "history": list(p.history),
    }


def _restore(pid, snap):
    p = _plant(pid)
    for k, v in snap.items():
        setattr(p, k, v)
    main._refresh_expression(p)


# ---------------------------------------------------------------- 1. Registry validation order
def test_registry_rejects_wrong_typed_lat_lon_as_invalid_request():
    """Break caught: validate_args range-checked lat BEFORE type-checking
    it, so lat="abc" raised a raw TypeError instead of ToolRegistryError."""
    with pytest.raises(ToolRegistryError) as excinfo:
        dispatch("run_timeseries_moisture_forecast",
                 {"plant_id": "monty-monstera", "lat": "abc"})
    assert excinfo.value.code == "invalid_request"
    with pytest.raises(ToolRegistryError) as excinfo2:
        dispatch("run_timeseries_moisture_forecast",
                 {"plant_id": "monty-monstera", "lon": True})
    assert excinfo2.value.code == "invalid_request"
    with pytest.raises(ToolRegistryError):
        dispatch("run_timeseries_moisture_forecast",
                 {"plant_id": "monty-monstera", "lat": 91})


# ---------------------------------------------------------------- 2. Malformed EXIF
def _jpeg_with_iso(iso_value):
    img = Image.new("RGB", (20, 20), (0, 200, 0))
    exif = Image.Exif()
    exif[34855] = iso_value
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_scan_tolerates_malformed_exif_iso_zero():
    """Break caught: an image with EXIF ISO=0 made analyze_image raise
    ValueError, so /scan returned 400 for an otherwise analyzable image.
    Non-positive EXIF values must fall back to defaults per field."""
    parsed = ml_vision.parse_exif(_jpeg_with_iso(0))
    assert parsed["iso"] == ml_vision.DEFAULT_EXIF["iso"]
    assert parsed["present"] is False
    resp = client.post("/api/v1/scan", files={"file": ("leaf.jpg", _jpeg_with_iso(0), "image/jpeg")})
    assert resp.status_code == 200
    assert isinstance(resp.json()["lux"], float)


# ---------------------------------------------------------------- 3. Extractor empty name
def test_extractor_rejects_empty_name():
    """Break caught: extract_golden_record({}) returned a junk record with
    an empty scientific_name, which the KB would store under an empty
    PRIMARY KEY (collapsing every junk row into one)."""
    with pytest.raises(ValueError):
        extract_golden_record({})
    with pytest.raises(ValueError):
        extract_golden_record({"scientific_name": ""})
    with pytest.raises(ValueError):
        extract_golden_record({"name": "   "})
    # Valid input still extracts (guard against over-rejection).
    rec = extract_golden_record({"scientific_name": "Monstera deliciosa"})
    assert rec.accepted_name == "Monstera deliciosa"


# ---------------------------------------------------------------- 4. Sitter token TTL
def test_sitter_token_expires_after_ttl():
    """Break caught: SITTER_TOKENS recorded issued_at but nothing ever
    read it, so sitter tokens never expired."""
    token = client.post("/api/v1/plants/monty-monstera/sitter").json()["sitter_token"]
    try:
        ok = client.get("/api/v1/sitter/monty-monstera", params={"token": token})
        assert ok.status_code == 200
        # Age the token 31 days (TTL is 30 days).
        main.SITTER_TOKENS[token]["issued_at"] = time.time() - 31 * 24 * 3600
        expired = client.get("/api/v1/sitter/monty-monstera", params={"token": token})
        assert expired.status_code == 401
        expired_water = client.post("/api/v1/sitter/monty-monstera/water", json={"token": token})
        assert expired_water.status_code == 401
    finally:
        main.SITTER_TOKENS.pop(token, None)


# ---------------------------------------------------------------- 5. Streak gap reset
class _FakeDate(date):
    _today = date.today()

    @classmethod
    def today(cls):
        return cls._today


def test_streak_resets_after_missed_days(monkeypatch):
    """Break caught: streak_days incremented on every first-water-of-day
    regardless of gaps, so a streak could never break. Duolingo
    semantics: consecutive days +1, a missed day resets to 1."""
    snap = _save("monty-monstera")
    monkeypatch.setattr(main, "date", _FakeDate)
    try:
        p = _plant("monty-monstera")
        p.last_watered_date = None
        p.streak_days = 5
        _FakeDate._today = date(2026, 10, 20)
        r1 = client.post("/api/v1/plants/monty-monstera/water").json()
        assert r1["watered"] is True
        assert _plant("monty-monstera").streak_days == 6
        # Skip 3 days (21, 22, 23) and water on the 24th: streak resets.
        _FakeDate._today = date(2026, 10, 24)
        r2 = client.post("/api/v1/plants/monty-monstera/water").json()
        assert r2["watered"] is True
        assert _plant("monty-monstera").streak_days == 1
        # Next consecutive day: streak builds again.
        _FakeDate._today = date(2026, 10, 25)
        client.post("/api/v1/plants/monty-monstera/water").json()
        assert _plant("monty-monstera").streak_days == 2
    finally:
        _restore("monty-monstera", snap)


# ---------------------------------------------------------------- 6-9. Regression guards
def test_care_chunk_renders_every_species():
    """Guard: a future seed edit must not break RAG rendering for any species."""
    assert len(SPECIES) == 79
    for sp in SPECIES:
        chunk = care_chunk(sp)
        assert chunk and sp.scientific_name in chunk


def test_scan_rejects_empty_file():
    resp = client.post("/api/v1/scan", files={"file": ("empty.jpg", b"", "image/jpeg")})
    assert resp.status_code == 400


def _bomb_png():
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    idat = zlib.compress(b"\x00" * 100)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 100000, 100000, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def test_scan_rejects_decompression_bomb():
    """Guard: a valid-structure PNG claiming 10^10 pixels must fail safe
    (PIL DecompressionBombError -> scan 400), never allocate pixels."""
    resp = client.post("/api/v1/scan", files={"file": ("bomb.png", _bomb_png(), "image/png")})
    assert resp.status_code == 400


def test_sitter_token_bound_to_its_plant():
    """Guard: a valid token issued for one plant must not open another plant."""
    token = client.post("/api/v1/plants/monty-monstera/sitter").json()["sitter_token"]
    try:
        resp = client.get("/api/v1/sitter/callie-calathea", params={"token": token})
        assert resp.status_code == 401
    finally:
        main.SITTER_TOKENS.pop(token, None)
