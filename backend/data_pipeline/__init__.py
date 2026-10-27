"""Petey Plant data pipeline: taxonomy resolution, scrapers, extraction, KB seeding.

Pure-stdlib core (taxonomy + extraction); scrapers use httpx if available
but never fail at import time and never run at import time.
"""
from .taxonomy_resolver import SYNONYMS, match_species, normalize, resolve

__all__ = ["SYNONYMS", "normalize", "resolve", "match_species"]
