"""Regression tests for the soil/substrate dataset (data/soil_substrates.py).

Guards the dataset's honesty invariants: the module imports cleanly,
every record carries sourced-or-flagged fields, recipe ingredients are
either known components or explicitly documented recipe-only items,
species mappings never invent a preference, and the coverage report
sums from the data rather than from typed numbers.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.soil_substrates import (
    COMPONENTS,
    MIXES,
    SPECIES_SUBSTRATE_PREFERENCES,
    Drainage,
    component_by_id,
    coverage_report,
    mix_by_id,
    model_drying_multiplier,
    preference_for_species,
)

# Recipe ingredients that are NOT entries in COMPONENTS, documented in
# the module as recipe-only items. Any other unknown ingredient fails.
RECIPE_ONLY_INGREDIENTS = {
    "all_purpose_base",
    "organic_base",
    "mineral_base",
    "peat_lite_base",
    "decomposed_granite",
    "lava_sand",
    "expanded_shale",
    "pasteurised_soil_or_compost",
}


def test_module_counts():
    assert len(COMPONENTS) == 12
    assert len(MIXES) == 7
    assert len(SPECIES_SUBSTRATE_PREFERENCES) == 16


def test_ids_unique():
    assert len({c.id for c in COMPONENTS}) == len(COMPONENTS)
    assert len({m.id for m in MIXES}) == len(MIXES)
    assert (
        len({p.scientific_name for p in SPECIES_SUBSTRATE_PREFERENCES})
        == len(SPECIES_SUBSTRATE_PREFERENCES)
    )


def test_recipe_ingredients_known_or_documented():
    known = {c.id for c in COMPONENTS} | RECIPE_ONLY_INGREDIENTS
    for mix in MIXES:
        assert mix.recipes, f"{mix.id} has no recipes"
        for recipe in mix.recipes:
            assert recipe.parts, f"{mix.id}/{recipe.name} has empty parts"
            assert sum(recipe.parts.values()) > 0
            for ingredient in recipe.parts:
                assert ingredient in known, (
                    f"{mix.id}/{recipe.name} uses undocumented ingredient "
                    f"{ingredient!r}"
                )


def test_preferred_mix_ids_resolve():
    for pref in SPECIES_SUBSTRATE_PREFERENCES:
        if pref.preferred_mix_id is not None:
            assert mix_by_id(pref.preferred_mix_id) is not None, (
                f"{pref.scientific_name} points at unknown mix "
                f"{pref.preferred_mix_id!r}"
            )


def test_unmapped_species_returns_none_not_a_default():
    assert preference_for_species("Ficus benjamina") is None
    assert preference_for_species("No Such Plant") is None
    assert component_by_id("nope") is None
    assert mix_by_id("nope") is None


def test_no_invented_sensitivity_flags():
    # None means UNKNOWN, never False-as-default: every sensitivity flag
    # is either a sourced True or None. (No species in this dataset has
    # a sourced False — a False would claim proven non-sensitivity.)
    for pref in SPECIES_SUBSTRATE_PREFERENCES:
        assert pref.fluoride_sensitive in (True, None)
        assert pref.salt_sensitive in (True, None)
        assert pref.root_rot_prone in (True, None)


def test_ph_ranges_valid_and_flagged():
    for pref in SPECIES_SUBSTRATE_PREFERENCES:
        if pref.ph_min is None:
            assert pref.ph_max is None
            assert pref.verification_status.get("ph") == "UNVERIFIED"
        else:
            assert pref.ph_max is not None and pref.ph_min <= pref.ph_max


def test_model_drying_multiplier_is_labelled_and_ordered():
    # Faster-draining substrates dry faster in the game model.
    assert (
        model_drying_multiplier(Drainage.VERY_FAST)
        > model_drying_multiplier(Drainage.FAST)
        > model_drying_multiplier(Drainage.MODERATE)
        > model_drying_multiplier(Drainage.SLOW)
    )


def test_coverage_report_sums_from_data():
    report = coverage_report()
    assert report["components"] == len(COMPONENTS)
    assert report["mixes"] == len(MIXES)
    assert report["species_preferences"] == len(SPECIES_SUBSTRATE_PREFERENCES)
    assert report["mix_recipe_variants"] == sum(len(m.recipes) for m in MIXES)
    assert report["species_preferences_with_mix_id"] + report[
        "species_preferences_without_mix_id"
    ] == len(SPECIES_SUBSTRATE_PREFERENCES)
    assert report["species_fluoride_confirmed"] == sum(
        1 for p in SPECIES_SUBSTRATE_PREFERENCES if p.fluoride_sensitive is True
    )
    total_flags = sum(report["field_status_counts"].values())
    assert total_flags == sum(
        len(r.verification_status)
        for r in list(COMPONENTS) + list(MIXES) + list(SPECIES_SUBSTRATE_PREFERENCES)
    )
