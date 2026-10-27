"""CLI seeder: build a local SQLite golden-plant knowledge base.

Usage (from backend/):
    python -m data_pipeline.build_knowledge_base --db kb.sqlite --seed
    python -m data_pipeline.build_knowledge_base --db kb.sqlite --seed --ingest-json dump.json

Qdrant is OPTIONAL: it is only attempted when qdrant_client is importable
AND QDRANT_URL is set; otherwise a note is printed and SQLite is used alone.
qdrant_client is deliberately NOT in requirements.txt.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_pipeline.muse_extractor import extract_golden_record
from data_pipeline.taxonomy_resolver import normalize
from models.schemas import GoldenPlantRecord

SCHEMA = """
CREATE TABLE IF NOT EXISTS golden_plants (
    scientific_name TEXT PRIMARY KEY,
    accepted_name TEXT,
    synonyms TEXT,
    family TEXT,
    genus TEXT,
    native_biome_koppen TEXT,
    archetype_rig_id TEXT,
    min_soil_moisture_pct REAL,
    max_soil_moisture_pct REAL,
    ideal_vpd_min_kpa REAL,
    ideal_vpd_max_kpa REAL,
    min_lux REAL,
    optimal_lux REAL,
    soil_ph_range TEXT,
    pet_toxicity INTEGER,
    common_pathogens TEXT,
    sources TEXT,
    confidence REAL,
    imputed_fields TEXT
);
CREATE TABLE IF NOT EXISTS token_index (
    token TEXT,
    scientific_name TEXT,
    PRIMARY KEY (token, scientific_name)
);
"""


def init_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def _tokens_for(rec: GoldenPlantRecord) -> set[str]:
    texts = [rec.scientific_name, rec.accepted_name, rec.family or "",
             rec.genus or ""] + list(rec.synonyms)
    tokens: set[str] = set()
    for text in texts:
        tokens.update(normalize(text).split())
    return {t for t in tokens if t}


def insert_record(conn: sqlite3.Connection, rec: GoldenPlantRecord) -> None:
    conn.execute(
        """INSERT OR REPLACE INTO golden_plants VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (rec.scientific_name, rec.accepted_name, json.dumps(rec.synonyms),
         rec.family, rec.genus, rec.native_biome_koppen, rec.archetype_rig_id,
         rec.min_soil_moisture_pct, rec.max_soil_moisture_pct,
         rec.ideal_vpd_min_kpa, rec.ideal_vpd_max_kpa, rec.min_lux,
         rec.optimal_lux, json.dumps(rec.soil_ph_range),
         1 if rec.pet_toxicity else 0, json.dumps(rec.common_pathogens),
         json.dumps(rec.sources), rec.confidence, json.dumps(rec.imputed_fields)))
    for token in _tokens_for(rec):
        conn.execute("INSERT OR IGNORE INTO token_index VALUES (?, ?)",
                     (token, rec.scientific_name))


def count_records(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COUNT(*) FROM golden_plants").fetchone()[0]


def seed_from_species(conn: sqlite3.Connection, species_list=None) -> int:
    """Seed from data/seed_10k_species.py via muse_extractor. Returns count added."""
    if species_list is None:
        from data.seed_10k_species import SPECIES
        species_list = SPECIES
    n = 0
    for sp in species_list:
        raw = sp.model_dump() if hasattr(sp, "model_dump") else dict(sp)
        rec = extract_golden_record(raw)
        insert_record(conn, rec)
        n += 1
    conn.commit()
    return n


def ingest_json(conn: sqlite3.Connection, json_path: str) -> int:
    with open(json_path, "r", encoding="utf-8") as fh:
        raw_list = json.load(fh)
    if isinstance(raw_list, dict):
        raw_list = raw_list.get("plants") or raw_list.get("records") or []
    n = 0
    for raw in raw_list:
        insert_record(conn, extract_golden_record(raw))
        n += 1
    conn.commit()
    return n


def maybe_sync_qdrant(conn: sqlite3.Connection) -> str:
    """Optional Qdrant sync; returns a human-readable note. Never raises."""
    url = os.environ.get("QDRANT_URL", "")
    if not url:
        return "Qdrant skipped: QDRANT_URL not set (SQLite only)."
    try:
        import qdrant_client  # type: ignore
    except Exception:
        return "Qdrant skipped: qdrant_client not installed (SQLite only)."
    try:
        _client = qdrant_client.QdrantClient(url=url)
        return f"Qdrant client available at {url}; vector sync not configured, SQLite remains authoritative."
    except Exception as exc:
        return f"Qdrant skipped: could not connect ({exc}). SQLite only."


def build(db_path: str, seed: bool = False, ingest_json_path: str | None = None) -> dict:
    conn = init_db(db_path)
    seeded = seed_from_species(conn) if seed else 0
    ingested = ingest_json(conn, ingest_json_path) if ingest_json_path else 0
    total = count_records(conn)
    note = maybe_sync_qdrant(conn)
    conn.close()
    return {"db": db_path, "seeded": seeded, "ingested": ingested,
            "total": total, "qdrant_note": note}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build the Petey Plant knowledge base.")
    parser.add_argument("--db", required=True, help="Path to SQLite database file")
    parser.add_argument("--seed", action="store_true",
                        help="Seed from data/seed_10k_species.py")
    parser.add_argument("--ingest-json", default=None,
                        help="Optional JSON dump file to ingest")
    args = parser.parse_args(argv)
    result = build(args.db, seed=args.seed, ingest_json_path=args.ingest_json)
    print(f"Seeded {result['seeded']} species.")
    if args.ingest_json:
        print(f"Ingested {result['ingested']} records from {args.ingest_json}.")
    print(f"Total golden plants in {result['db']}: {result['total']}")
    print(result["qdrant_note"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
