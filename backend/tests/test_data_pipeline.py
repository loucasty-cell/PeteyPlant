"""Tests for Delta A (data pipeline) and Delta B (quiz/shield/sitter/neglect)."""
import asyncio
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import main
from data_pipeline.async_scrapers import (
    TokenBucket,
    parse_aspca_html,
    parse_llifle_html,
    parse_missouri_html,
    parse_nc_state_html,
)
from data_pipeline.build_knowledge_base import build, count_records, init_db
from data_pipeline.muse_extractor import extract_golden_record
from data_pipeline.taxonomy_resolver import SYNONYMS, match_species, normalize, resolve
from data.seed_10k_species import SPECIES
from services.muse_creative import derive_expression, rig_params_for_state

client = TestClient(main.app)

# ---------- taxonomy ----------

def test_sansevieria_resolves_to_dracaena():
    r = resolve("Sansevieria trifasciata")
    assert r["accepted_name"] == "Dracaena trifasciata"
    assert r["family"] == "Asparagaceae"
    assert r["method"] in ("full_name_synonym", "genus_synonym")


def test_calathea_resolves_to_goeppertia():
    r = resolve("Calathea orbifolia")
    assert r["accepted_name"] == "Goeppertia orbifolia"
    assert r["family"] == "Marantaceae"


def test_synonym_table_has_ten_plus_mappings():
    # Confident genus moves stay in SYNONYMS; species-specific moves
    # (Calathea, Haworthia, Scindapsus, Philodendron, Plectranthus,
    # Sedum) are full-name-only, so they must NOT appear as blanket
    # genus maps (see test_botanical_resolver_no_blanket_genus_moves).
    assert SYNONYMS["Sansevieria"] == "Dracaena"
    assert "Calathea" not in SYNONYMS
    from data_pipeline.taxonomy_resolver import FULL_NAME_SYNONYMS
    assert FULL_NAME_SYNONYMS["calathea orbifolia"] == "goeppertia orbifolia"
    assert len(SYNONYMS) >= 5 and len(FULL_NAME_SYNONYMS) >= 10


def test_normalize_strips_cultivar_quotes():
    assert normalize("Stromanthe sanguinea 'Triostar'") == "stromanthe sanguinea"
    assert normalize("  Monstera   deliciosa ") == "monstera deliciosa"


def test_entity_matching_best_match():
    best = match_species("snake plant Sansevieria trifasciata", SPECIES)
    assert best is not None and best["score"] > 0
    sp = best["species"]
    sci = getattr(sp, "scientific_name", None) or (sp.get("scientific_name") if isinstance(sp, dict) else "")
    assert "Sansevieria" in sci or "trifasciata" in sci.lower()
    assert match_species("zzzqqq unknown", SPECIES) is None


# ---------- extractor / imputation ----------

def test_imputation_fallback_records_fields_and_penalty():
    rec = extract_golden_record({"scientific_name": "Monstera deliciosa"})
    assert rec.accepted_name == "Monstera deliciosa"
    assert rec.min_soil_moisture_pct == 30.0  # genus default
    assert rec.max_soil_moisture_pct == 70.0
    assert "min_soil_moisture_pct" in rec.imputed_fields
    assert rec.confidence < 0.95  # penalty applied


def test_imputation_biome_tropical_high_moisture():
    # Unknown genus, tropical Af biome -> high moisture floor from biome table.
    rec = extract_golden_record({"scientific_name": "Mysterya tropica",
                                 "native_biome_koppen": "Af"})
    assert rec.min_soil_moisture_pct == 40.0
    assert rec.ideal_vpd_max_kpa == 1.0
    assert rec.imputed_fields


def test_imputation_biome_arid_low_water_high_light():
    rec = extract_golden_record({"scientific_name": "Mysterya deserta",
                                 "native_biome_koppen": "BWh"})
    assert rec.min_soil_moisture_pct == 5.0
    assert rec.optimal_lux == 10000.0


def test_no_imputation_when_metrics_present():
    rec = extract_golden_record({
        "scientific_name": "Monstera deliciosa",
        "min_soil_moisture_pct": 33.0, "max_soil_moisture_pct": 66.0,
        "ideal_vpd_min_kpa": 0.8, "ideal_vpd_max_kpa": 1.4,
        "min_lux": 800.0, "optimal_lux": 3000.0, "soil_ph_range": [5.5, 7.0]})
    assert rec.imputed_fields == []
    assert rec.min_soil_moisture_pct == 33.0


# ---------- token bucket ----------

def test_token_bucket_burst_then_throttled():
    async def run():
        bucket = TokenBucket(rate=20.0, burst=2.0)  # 50 ms per token
        t0 = time.monotonic()
        await bucket.acquire()
        await bucket.acquire()  # burst: immediate
        assert time.monotonic() - t0 < 0.5
        t1 = time.monotonic()
        await bucket.acquire()  # throttled: must wait ~50 ms
        elapsed = time.monotonic() - t1
        assert 0.02 < elapsed < 0.5
    asyncio.run(run())


# ---------- scraper parsers (local fixtures, no network) ----------

FIXTURE = """
<html><body>
<a href="/plants/monstera-deliciosa">Monstera deliciosa</a>
<a href="/plants/ficus-lyrata">Ficus lyrata</a>
<a href="/home">Home</a>
</body></html>
"""


def test_scraper_parsers_on_fixtures():
    for parse in (parse_nc_state_html, parse_missouri_html, parse_llifle_html, parse_aspca_html):
        records = parse(FIXTURE)
        names = [r["name"] for r in records]
        assert "Monstera deliciosa" in names
        assert "Ficus lyrata" in names
        assert "Home" not in names  # single-word links are not plant names


def test_scraper_fetch_never_raises_without_network():
    # Point a fetch at an unroutable address; it must return [] with an error note.
    import asyncio as _a
    from data_pipeline.async_scrapers import fetch_nc_state
    result = _a.run(fetch_nc_state(url="http://127.0.0.1:1/nope"))
    assert list(result) == []
    assert result.error  # error note carried on the result


# ---------- KB seeder ----------

def test_kb_cli_seed_path(tmp_path):
    db = str(tmp_path / "kb.sqlite")
    result = build(db, seed=True)
    assert result["seeded"] == len(SPECIES)
    assert result["total"] == len(SPECIES)
    conn = sqlite3.connect(db)
    assert count_records(conn) >= 60
    row = conn.execute(
        "SELECT accepted_name FROM golden_plants WHERE scientific_name='Monstera deliciosa'"
    ).fetchone()
    assert row and row[0] == "Monstera deliciosa"
    tokens = conn.execute(
        "SELECT COUNT(*) FROM token_index WHERE token='monstera'").fetchone()[0]
    assert tokens >= 1
    conn.close()


def test_kb_ingest_json(tmp_path):
    db = str(tmp_path / "kb2.sqlite")
    dump = tmp_path / "dump.json"
    dump.write_text('[{"scientific_name": "Cereus peruvianus", "native_biome_koppen": "BWh"}]')
    result = build(db, seed=False, ingest_json_path=str(dump))
    assert result["ingested"] == 1 and result["total"] == 1


# ---------- Delta B: neglect expressions ----------

def test_neglect_root_rot_ghost():
    d = derive_expression(20, 85, "worried", min_moisture=30, max_moisture=70)
    assert d["expression"] == "root-rot ghost"
    assert d["particle_effect"] == "raincoat"
    assert d["color_saturation"] == 0.5 and d["droop_angle_deg"] >= 40


def test_neglect_parched_cactus():
    d = derive_expression(20, 5, "thirsty", min_moisture=30, max_moisture=70)
    assert d["expression"] == "parched cactus"
    assert d["particle_effect"] == "sweat_drops"


def test_neglect_wilted_and_healthy_default():
    assert derive_expression(10, 50, "sad", 30, 70)["expression"] == "wilted"
    assert derive_expression(90, 50, "thriving", 30, 70)["expression"] == "thriving"
    rig = rig_params_for_state(20, 85, "worried", "", 30, 70)
    assert rig["particleEffect"] == "raincoat" and rig["colorSaturation"] == 0.5


def test_plant_state_expression_defaults_to_mood():
    plants = client.get("/api/v1/plants").json()["plants"]
    for p in plants:
        assert p["expression"]  # present, defaults to mood when healthy
        assert "quiz_correct_count" in p


def test_neglect_via_api_state():
    plant = main.PLANTS["monty-monstera"]
    old_hp, old_moist = plant.hp, plant.moisture_pct
    try:
        plant.hp = 20
        plant.moisture_pct = 90.0  # above Monstera max 70
        body = client.get("/api/v1/plants/monty-monstera").json()
        assert body["expression"] == "root-rot ghost"
        assert body["particle_effect"] == "raincoat"
    finally:
        plant.hp, plant.moisture_pct = old_hp, old_moist
        main._refresh_expression(plant)


# ---------- Delta B: quiz / shield ----------

def test_quiz_flow_correct_and_shield_every_third():
    plant = main.PLANTS["serpentina-snake"]
    old_xp, old_shields, old_count = plant.xp, plant.mulch_shields, plant.quiz_correct_count
    try:
        plant.quiz_correct_count = 0
        for i in range(3):
            q = client.get("/api/v1/quiz").json()
            assert "answer_index" not in q and "answer" not in q
            assert len(q["options"]) == 4
            # Server-side answer is the bank entry matching this quiz's question.
            bank = next(b for b in main.QUIZ_BANK if b["question"] == q["question"])
            resp = client.post("/api/v1/quiz/answer", json={
                "quiz_id": q["quiz_id"], "plant_id": plant.id,
                "selected_index": bank["answer_index"]}).json()
            assert resp["correct"] is True and resp["xp_awarded"] == 30
            if i < 2:
                assert resp["shield_awarded"] is False
            else:
                assert resp["shield_awarded"] is True
        assert client.get(f"/api/v1/plants/{plant.id}").json()["mulch_shields"] == old_shields + 1
    finally:
        plant.xp, plant.mulch_shields, plant.quiz_correct_count = old_xp, old_shields, old_count
        plant.level = main._level(plant.xp)


def test_quiz_incorrect_awards_nothing():
    q = client.get("/api/v1/quiz").json()
    bank = next(b for b in main.QUIZ_BANK if b["question"] == q["question"])
    wrong = (bank["answer_index"] + 1) % 4
    resp = client.post("/api/v1/quiz/answer", json={
        "quiz_id": q["quiz_id"], "plant_id": "serpentina-snake",
        "selected_index": wrong}).json()
    assert resp["correct"] is False and resp["xp_awarded"] == 0
    assert resp["shield_awarded"] is False


def test_shield_buy_sufficient_and_insufficient():
    plant = main.PLANTS["monty-monstera"]
    old_xp, old_shields = plant.xp, plant.mulch_shields
    try:
        plant.xp = 50
        resp = client.post(f"/api/v1/plants/{plant.id}/shield/buy").json()
        assert resp["success"] is False and resp["cost"] == 100 and resp["xp"] == 50
        plant.xp = 250
        plant.level = 2  # 1 + 250 // 200
        resp = client.post(f"/api/v1/plants/{plant.id}/shield/buy").json()
        assert resp["success"] is True and resp["xp"] == 150
        assert resp["mulch_shields"] == old_shields + 1
        # Sticky level: spending 100 XP must NOT demote level 2 -> 1.
        assert resp["level"] == 2
    finally:
        plant.xp, plant.mulch_shields = old_xp, old_shields
        plant.level = main._level(plant.xp)


# ---------- Delta B: sitter ----------

def test_sitter_view_and_water():
    token = client.post("/api/v1/plants/serpentina-snake/sitter").json()["sitter_token"]
    view = client.get(f"/api/v1/sitter/serpentina-snake?token={token}").json()
    assert view["plant_name"] == "Serpentina"
    assert view["xp_reward"] == 50 and "sitter_xp" in view
    assert view["instructions"] and view["quest_checklist"]
    assert view["expression"]
    assert client.get("/api/v1/sitter/serpentina-snake").status_code == 401
    plant = main.PLANTS["serpentina-snake"]
    orig_moist = plant.moisture_pct
    try:
        # STRESS FIX: this test used to rely on leaked suite moisture and
        # on the old (buggy) above-cap watering behavior, which pushed an
        # already-overwatered plant even higher. Set moisture
        # deterministically BELOW the species cap, so watering must raise
        # it; the above-cap hold-flat case is covered in test_stress.py.
        plant.moisture_pct = 20.0
        resp = client.post("/api/v1/sitter/serpentina-snake/water",
                           json={"token": token}).json()
        assert resp["watered"] is True and resp["sitter_xp_awarded"] == 50
        assert resp["moisture_pct"] > 20.0
    finally:
        plant.moisture_pct = orig_moist


def test_sitter_water_respects_lock():
    token = client.post("/api/v1/plants/callie-calathea/sitter").json()["sitter_token"]
    resp = client.post("/api/v1/sitter/callie-calathea/water",
                       json={"token": token}).json()
    assert resp["watered"] is False and resp["sitter_xp_awarded"] == 0


def test_guilt_quest_tone_varies_by_state():
    from services.muse_agent_harness import dispatch_duolingo_guilt_quest
    locked = dispatch_duolingo_guilt_quest(
        {"id": "x", "name": "Callie", "watering_locked": True, "hp": 45, "moisture_pct": 80})
    assert "raincoat" in locked["quest"]["description"].lower() or "water" in locked["quest"]["description"].lower()
    thriving = dispatch_duolingo_guilt_quest(
        {"id": "y", "name": "Serpentina", "watering_locked": False, "hp": 95, "moisture_pct": 50})
    assert "thriving" in thriving["quest"]["description"].lower() or "streak" in thriving["quest"]["description"].lower()
