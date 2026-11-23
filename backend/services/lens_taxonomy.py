"""Conservative Lens taxonomy over the existing, persisted garden catalog IDs."""
import re
from typing import Literal, NamedTuple

from data.seed_10k_species import SPECIES

TAXONOMY_VERSION = "petey-lens-1"
LAUNCH_SPECIES = frozenset({
    "Monstera deliciosa", "Epipremnum aureum", "Dracaena trifasciata",
    "Chlorophytum comosum", "Aloe vera", "Dypsis lutescens", "Goeppertia makoyana", "Ficus lyrata",
})
TaxonomicRank = Literal["species", "genus", "unknown"]
MatchStatus = Literal["exact_species", "verified_synonym", "genus_only", "ambiguous", "unmapped", "unknown"]


class Taxon(NamedTuple):
    species_key: str | None
    scientific_name: str | None
    common_name: str | None
    taxonomic_rank: TaxonomicRank
    match_status: MatchStatus
    source: str | None = None


# The database's Areca Palm key predates the currently accepted Kew name.
_ACCEPTED_ARECA = "Chrysalidocarpus lutescens"
_KEW_ARECA = "https://powo.science.kew.org/taxon/665962-1"
_SYNONYMS = {
    "sansevieria trifasciata": ("Dracaena trifasciata", "https://powo.science.kew.org/taxon/77164235-1"),
    "calathea makoyana": ("Goeppertia makoyana", "https://powo.science.kew.org/taxon/60461041-2"),
    "aloe barbadensis": ("Aloe vera", "https://powo.science.kew.org/taxon/530017-1"),
    _ACCEPTED_ARECA.casefold(): ("Dypsis lutescens", _KEW_ARECA),
}
_CATALOG = {species.scientific_name.casefold(): species for species in SPECIES if not species.cultivar}
# Explicitly retain genus-level candidate labels where present in the audited upstream configs.
_GENERA = {genus.casefold(): genus for genus in (
    "Aglaonema", "Alocasia", "Begonia", "Calathea", "Chrysanthemum", "Ctenanthe",
    "Dieffenbachia", "Dracaena", "Kalanchoe", "Narcissus", "Schefflera", "Tradescantia", "Yucca",
)}
_BROAD_LABELS = {"orchid", "pothos", "ivy arum", "peace lily", "snake plant", "sanseviera", "tulip", "venus flytrap",
                 "lilium (hemerocallis)"}
_UNKNOWN_LABELS = {"unknown", "out_of_scope", "non_plant", "no_plant"}


def map_label(label: str) -> Taxon:
    normalized = " ".join(label.split()).casefold()
    if normalized in _UNKNOWN_LABELS:
        return Taxon(None, None, None, "unknown", "unknown")
    if normalized in _BROAD_LABELS:
        return Taxon(None, None, None, "unknown", "ambiguous")
    parenthetical = re.search(r"\(([^()]*)\)$", normalized)
    name = parenthetical[1] if parenthetical else normalized
    synonym_key, source = _SYNONYMS.get(name, (name, None))
    species = _CATALOG.get(synonym_key.casefold())
    if species is not None:
        key = species.scientific_name
        if key == "Dypsis lutescens":
            match_status = "exact_species" if name == _ACCEPTED_ARECA.casefold() else "verified_synonym"
            return Taxon(key, _ACCEPTED_ARECA, species.common_name, "species", match_status, _KEW_ARECA)
        return Taxon(key, key, species.common_name, "species", "verified_synonym" if source else "exact_species", source)
    genus = _GENERA.get(name.removesuffix(" spp."))
    if genus:
        return Taxon(None, genus, None, "genus", "genus_only")
    if name in _BROAD_LABELS:
        return Taxon(None, None, None, "unknown", "ambiguous")
    return Taxon(None, None, None, "unknown", "unmapped")
