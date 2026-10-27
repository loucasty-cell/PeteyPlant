"""WFO/GBIF-style synonym resolution and entity matching. Pure stdlib, no network.

SYNONYMS maps an older genus name to its currently accepted genus.
Several entries are group-specific in the real taxonomy (e.g. only some
former Philodendron species moved to Thaumatophyllum); the resolver
records the method/confidence so downstream code can tell a confident
accepted-name lookup from a genus-level synonym guess.
"""
from __future__ import annotations

import re
from typing import Iterable

# Old genus -> accepted genus. CONFIDENT group moves only.
# BLANKET genus maps that were WRONG have been removed: Scindapsus ->
# Epipremnum (only S. aureus moved), Philodendron -> Thaumatophyllum
# (only the P. bipinnatifidum group moved), Haworthia -> Haworthiopsis,
# Plectranthus -> Coleus, Sedum -> Hylotelephium, and Calathea ->
# Goeppertia are now FULL-NAME-ONLY mappings below (checked first),
# so Scindapsus pictus and Philodendron hederaceum in the seed do NOT
# resolve away. A genus-level guess is never silently presented as an
# accepted-name lookup.
SYNONYMS: dict[str, str] = {
    "Sansevieria": "Dracaena",        # snake plants moved to Dracaena
    "Zebrina": "Tradescantia",        # Zebrina pendula -> Tradescantia zebrina
    "Saintpaulia": "Streptocarpus",   # African violets -> Streptocarpus
    "Trichocereus": "Echinopsis",     # San Pedro: Trichocereus pachanoi -> Echinopsis pachanoi
    "Brassaia": "Schefflera",         # Brassaia actinophylla -> Schefflera actinophylla
    "Pothos": "Epipremnum",           # Pothos aureus -> Epipremnum aureum
    "Schefflera": "Heptapleurum",     # S. arboricola -> Heptapleurum arboricola (NC State current)
    "Aloe": "Aloe",                   # placeholder guard: kept accepted (no-op, see note below)
}

# Remove the no-op entry from effective synonyms; it is documented here
# only to make clear Aloe was considered and is already accepted.
SYNONYMS.pop("Aloe", None)

# Extra full-name synonyms (old binomial -> accepted binomial) checked first.
# This is the ONLY place the restricted genera above may move, and only
# for the exact species listed here.
FULL_NAME_SYNONYMS: dict[str, str] = {
    "sansevieria trifasciata": "dracaena trifasciata",
    "sansevieria cylindrica": "dracaena angolensis",
    "sansevieria masoniana": "dracaena masoniana",
    "calathea orbifolia": "goeppertia orbifolia",
    "calathea lancifolia": "goeppertia lancifolia",
    "zebrina pendula": "tradescantia zebrina",
    "saintpaulia ionantha": "streptocarpus ionanthus",
    "philodendron bipinnatifidum": "thaumatophyllum bipinnatifidum",
    "haworthia fasciata": "haworthiopsis fasciata",
    "trichocereus pachanoi": "echinopsis pachanoi",
    "scindapsus aureus": "epipremnum aureum",
    "senecio rowleyanus": "curio rowleyanus",
    "peperomia hope": "peperomia tetraphylla",
    "plectranthus scutellarioides": "coleus scutellarioides",
    "sedum spectabile": "hylotelephium spectabile",
    "schefflera arboricola": "heptapleurum arboricola",
}

# Full-name mappings whose accepted name carries a cultivar epithet
# (normalize() strips quoted cultivars, so the cultivar is returned
# separately in the resolve() result under "cultivar").
FULL_NAME_CULTIVARS: dict[str, str] = {
    "peperomia hope": "Hope",
}

# Accepted genus -> family. Covers ALL 63 starter-seed genera (plus
# the old genera that full-name/genus synonyms resolve from), so a
# seed species never resolves to family=None / confidence 0.6 merely
# because its genus was missing from this table. Fern genera use real
# families, never the class Polypodiopsida.
GENUS_TO_FAMILY: dict[str, str] = {
    "Dracaena": "Asparagaceae", "Goeppertia": "Marantaceae",
    "Monstera": "Araceae", "Philodendron": "Araceae", "Epipremnum": "Araceae",
    "Thaumatophyllum": "Araceae", "Rhaphidophora": "Araceae",
    "Ficus": "Moraceae", "Echeveria": "Crassulaceae",
    "Crassula": "Crassulaceae", "Sempervivum": "Crassulaceae",
    "Kalanchoe": "Crassulaceae", "Sedum": "Crassulaceae",
    "Hylotelephium": "Crassulaceae",
    "Haworthiopsis": "Asphodelaceae", "Haworthia": "Asphodelaceae",
    "Aloe": "Asphodelaceae", "Hoya": "Apocynaceae",
    "Tradescantia": "Commelinaceae", "Maranta": "Marantaceae",
    "Ctenanthe": "Marantaceae", "Stromanthe": "Marantaceae",
    "Cereus": "Cactaceae", "Echinocactus": "Cactaceae",
    "Opuntia": "Cactaceae", "Mammillaria": "Cactaceae",
    "Trichocereus": "Cactaceae", "Echinopsis": "Cactaceae",
    "Nephrolepis": "Nephrolepidaceae", "Asplenium": "Aspleniaceae",
    "Adiantum": "Pteridaceae", "Davallia": "Davalliaceae",
    "Cyrtomium": "Dryopteridaceae", "Yucca": "Asparagaceae",
    "Dypsis": "Arecaceae", "Chamaedorea": "Arecaceae",
    "Howea": "Arecaceae", "Phoenix": "Arecaceae",
    "Ravenea": "Arecaceae", "Rhapis": "Arecaceae",
    "Phalaenopsis": "Orchidaceae", "Cattleya": "Orchidaceae",
    "Dendrobium": "Orchidaceae", "Oncidium": "Orchidaceae",
    "Vanda": "Orchidaceae", "Dionaea": "Droseraceae",
    "Drosera": "Droseraceae", "Sarracenia": "Sarraceniaceae",
    "Nepenthes": "Nepenthaceae", "Pinguicula": "Lentibulariaceae",
    "Streptocarpus": "Gesneriaceae", "Saintpaulia": "Gesneriaceae",
    "Coleus": "Lamiaceae", "Plectranthus": "Lamiaceae",
    "Schefflera": "Araliaceae", "Heptapleurum": "Araliaceae",
    "Brassaia": "Araliaceae", "Sansevieria": "Asparagaceae",
    "Calathea": "Marantaceae", "Pachira": "Malvaceae",
    "Peperomia": "Piperaceae", "Senecio": "Asteraceae",
    "Curio": "Asteraceae", "Scindapsus": "Araceae",
    "Pothos": "Araceae", "Zebrina": "Commelinaceae",
    "Aglaonema": "Araceae", "Anthurium": "Araceae",
    "Beaucarnea": "Asparagaceae", "Chlorophytum": "Asparagaceae",
    "Dieffenbachia": "Araceae", "Hedera": "Araliaceae",
    "Pilea": "Urticaceae", "Spathiphyllum": "Araceae",
    "Strelitzia": "Strelitziaceae", "Zamioculcas": "Araceae",
    "Carmona": "Boraginaceae", "Ehretia": "Boraginaceae",
    "Zelkova": "Ulmaceae", "Pinus": "Pinaceae",
    "Juniperus": "Cupressaceae",
}

_QUOTED = re.compile(r"""['"“”‘’][^'"“”‘’]*['"“”‘’]""")
_WS = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^a-z0-9\s\-]")


def normalize(name: str) -> str:
    """Lowercase, strip cultivar quotes, collapse whitespace."""
    if not name:
        return ""
    text = str(name).strip()
    # Remove quoted cultivar epithets: 'Triostar', "Gold", etc.
    text = _QUOTED.sub(" ", text)
    text = text.lower()
    text = _NON_WORD.sub(" ", text)
    text = _WS.sub(" ", text).strip()
    return text


def _title(name: str) -> str:
    # Botanical convention: genus capitalised, epithet(s) lowercase.
    parts = name.split()
    if not parts:
        return ""
    return " ".join([parts[0].capitalize()] + [w.lower() for w in parts[1:]])


def resolve(name: str) -> dict:
    """Resolve a name to {accepted_name, family, synonyms, confidence, method}.

    method is one of: "full_name_synonym", "genus_synonym", "accepted",
    "unknown". Confidence: 0.95 for a full-name synonym hit, 0.9 for a
    confident genus synonym, 1.0 for an already accepted name with a
    known family, 0.6 for an unknown name. Full-name hits with a
    cultivar (e.g. peperomia hope) also return "cultivar". Genera
    whose moves are species-specific (Scindapsus, Philodendron,
    Haworthia, Plectranthus, Sedum, Calathea) are NOT in SYNONYMS, so
    only their listed full names move.
    """
    raw = str(name or "").strip()
    norm = normalize(raw)
    if not norm:
        return {"accepted_name": "", "family": None, "synonyms": [],
                "confidence": 0.0, "method": "unknown"}
    tokens = norm.split()
    genus_norm = tokens[0]
    genus_title = genus_norm.capitalize()
    # 1. Full binomial synonym (the only path for restricted genera).
    if norm in FULL_NAME_SYNONYMS:
        accepted = _title(FULL_NAME_SYNONYMS[norm])
        genus = accepted.split()[0]
        result = {"accepted_name": accepted,
                  "family": GENUS_TO_FAMILY.get(genus),
                  "synonyms": [norm], "confidence": 0.95,
                  "method": "full_name_synonym"}
        if norm in FULL_NAME_CULTIVARS:
            result["cultivar"] = FULL_NAME_CULTIVARS[norm]
        return result
    # 2. Genus synonym.
    if genus_title in SYNONYMS:
        accepted_genus = SYNONYMS[genus_title]
        rest = tokens[1:]
        accepted = " ".join([accepted_genus] + rest)
        return {"accepted_name": accepted,
                "family": GENUS_TO_FAMILY.get(accepted_genus),
                "synonyms": [norm], "confidence": 0.9,
                "method": "genus_synonym"}
    # 3. Already accepted (or unknown genus).
    accepted = _title(norm)
    family = GENUS_TO_FAMILY.get(genus_title)
    return {"accepted_name": accepted, "family": family,
            "synonyms": [], "confidence": 1.0 if family else 0.6,
            "method": "accepted" if family else "unknown"}


def _tokens(text: str) -> set[str]:
    return set(normalize(text).split())


def _candidate_text(candidate) -> str:
    if isinstance(candidate, dict):
        parts = [candidate.get("scientific_name", ""),
                 candidate.get("accepted_name", ""),
                 candidate.get("common_name", "")]
        return " ".join(p for p in parts if p)
    # Pydantic Species or any object with attributes.
    parts = []
    for attr in ("scientific_name", "accepted_name", "common_name"):
        val = getattr(candidate, attr, None)
        if val:
            parts.append(str(val))
    return " ".join(parts)


def match_species(name: str, species_list: Iterable) -> dict | None:
    """Score candidates by token overlap; return best {species, score, method}.

    Score = Jaccard overlap over name tokens, plus a 0.25 bonus when the
    (resolved) genus matches exactly. Returns None when nothing overlaps.
    """
    query_tokens = _tokens(name)
    if not query_tokens:
        return None
    resolved = resolve(name)
    query_genus = resolved["accepted_name"].split()[0].lower() if resolved["accepted_name"] else ""
    best = None
    best_score = 0.0
    for cand in species_list:
        cand_tokens = _tokens(_candidate_text(cand))
        if not cand_tokens:
            continue
        overlap = query_tokens & cand_tokens
        if not overlap:
            continue
        union = query_tokens | cand_tokens
        score = len(overlap) / len(union) if union else 0.0
        cand_genus = ""
        text = _candidate_text(cand)
        if text:
            cand_genus = normalize(text).split()[0]
        if query_genus and cand_genus == query_genus:
            score += 0.25
        score = min(1.0, round(score, 4))
        if score > best_score:
            best_score = score
            best = cand
    if best is None:
        return None
    return {"species": best, "score": best_score, "method": "token_overlap"}
