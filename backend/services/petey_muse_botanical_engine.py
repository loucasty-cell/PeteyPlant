#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
PROPRIETARY & CONFIDENTIAL — COPYRIGHT (C) 2026 PETEY PLANT / MUSE AI LABS
All Rights Reserved. Unauthorized reproduction, distribution, or commercial
extraction of this schema architecture, biophysical parameterization, taxonomic
crosswalk, and synthetic feature-engineering pipeline is strictly prohibited.
Module: petey_muse_botanical_engine.py
Version: 2.4.0-enterprise
Description:
    End-to-end Indoor Plant Biology Knowledge Graph, Biophysical Differential
    Engine, PlantNet-300K Long-Tail Taxonomic Adapter, and Kaggle Indoor Plant
    Health & Care Clustering Dataset Upgrader for Petey Plant.
================================================================================
"""

from __future__ import annotations

import csv
import dataclasses
import datetime
import enum
import hashlib
import json
import logging
import math
import pathlib
import random
import sqlite3
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple, Union

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("MuseBotanicalEngine")


# ==============================================================================
# 1. BOTANICAL & PHYSIOLOGICAL ENUMERATIONS (APG IV & BIOPHYSICAL STANDARDS)
# ==============================================================================

class PhotosyntheticPathway(str, enum.Enum):
    """Carbon fixation biochemical pathways governing stomatal conductance."""
    C3 = "C3_CALVIN_BENSON"
    CAM = "CRASSULACEAN_ACID_METABOLISM"
    C3_CAM_FACULTATIVE = "FACULTATIVE_C3_CAM_SWITCHING"
    C4 = "C4_HATCH_SLACK"


class EcologicalLifeForm(str, enum.Enum):
    """Raunkiaer and structural ecological niche classifications."""
    EPIPHYTE = "OBLIGATE_EPIPHYTE"
    HEMIEPIPHYTE = "SECONDARY_HEMIEPIPHYTE_CLIMBER"
    LITHOPHYTE = "LITHOPHYTE"
    TERRESTRIAL_UNDERSTORY = "TROPICAL_FOREST_UNDERSTORY_HERB"
    TERRESTRIAL_ARBOREAL = "WOODY_FICUS_OR_INTERIOR_TREE"
    SUCCULENT_LEAF = "XEROPHYTIC_LEAF_SUCCULENT"
    SUCCULENT_STEM = "XEROPHYTIC_STEM_CACTiform"
    GEOPHYTE_RHIZOMATOUS = "RHIZOMATOUS_OR_TUBEROUS_GEOPHYTE"
    PTERIDOPHYTE_FERN = "VASCULAR_SPORE_FERN"


class RootArchitecture(str, enum.Enum):
    """Root morphology dictating aeration and matric potential thresholds."""
    VELAMEN_AERIAL = "VELAMEN_COATED_EPIPHYTIC_ROOT"
    ADVENTITIOUS_CLIMBING = "FIBROUS_PLUS_ADVENTITIOUS_AERIAL"
    RHIZOMATOUS_TUBEROUS = "WATER_STORING_RHIZOME_OR_CORM"
    FINE_FIBROUS_HYGROPHILIC = "FINE_CAPILLARY_FIBROUS_MAT"
    SHALLOW_XEROPHYTIC = "SHALLOW_RAPID_ABSORPTION_XEROPHYTIC"
    DEEP_STRUCTURAL = "LIGNIFIED_TAP_AND_LATERAL_SYSTEM"


class SubstrateArchetype(str, enum.Enum):
    """Engineered indoor potting media profiles with distinct hydraulic curves."""
    CHUNKY_AROID_BARK_PERLITE = "AROID_MIX_ORCHID_BARK_PUMICE_COIR"
    EPIPHYTIC_ORCHID_BARK_SPHAGNUM = "COARSE_FIR_BARK_CHARCOAL_SPHAGNUM"
    HUMUS_RICH_MOISTURE_RETENTIVE = "COCO_COIR_PEAT_VERMICULITE_COMPOST"
    MINERAL_GRIT_XEROPHYTIC = "PUMICE_CALCINED_CLAY_COARSE_SAND_75PCT"
    STANDARD_LOAMY_INTERIOR = "BALANCED_PEAT_PINE_BARK_PERLITE"


class ToxicityMechanism(str, enum.Enum):
    """Phytochemical defense mechanisms relevant to household pet/human safety."""
    NON_TOXIC_PET_SAFE = "NON_TOXIC_BIOSAFE"
    INSOLUBLE_CALCIUM_OXALATE_RAPHIDES = "INSOLUBLE_CA_OXALATE_NEEDLE_RAPHIDES"
    SAPONINS_AND_GLYCOSIDES = "STEROIDAL_SAPONINS_GI_IRRITANT"
    CARDIAC_GLYCOSIDES_CARDENOLIDES = "CARDENOLIDES_SEVERE_CARDIOTOXIN"
    FICIN_AND_PSORALEN_LATEX = "PROTEOLYTIC_FICIN_FURANOCOUMARIN_SAP"
    DITERPENE_ESTERS_PHORBOL = "PHORBOL_ESTERS_CORROSIVE_LATEX"
    SOLANINE_TROPANE_ALKALOIDS = "CYTOTOXIC_ALKALOIDS"


class NutrientMobility(str, enum.Enum):
    """Phloem mobility determining whether deficiency strikes old or new leaves."""
    MOBILE_BASAL_SENESCENCE = "PHLOEM_MOBILE_OLD_LEAVES_FIRST"      # N, P, K, Mg, Mo
    IMMOBILE_APICAL_NECROSIS = "PHLOEM_IMMOBILE_NEW_LEAVES_FIRST"   # Ca, B, Fe, Mn, Zn, Cu


class PlantNetOrgan(str, enum.Enum):
    """Organ tags matching Pl@ntNet-300K metadata specifications."""
    LEAF = "leaf"
    FLOWER = "flower"
    HABIT = "habit"
    STEM = "stem"
    FRUIT = "fruit"
    OTHER = "other"


# ==============================================================================
# 2. BIOPHYSICAL & TAXONOMIC DATA STRUCTURES
# ==============================================================================

@dataclass(frozen=True)
class PhotobiologyProfile:
    """
    Quantitative photosynthetic photon flux density (PPFD, umol/m^2/s)
    and Daily Light Integral (DLI, mol/m^2/day) parameters.
    """
    lcp_ppfd: float              # Light Compensation Point (A_net = 0)
    optimal_ppfd_min: float      # Lower bound of target indoor PPFD
    optimal_ppfd_max: float      # Upper bound of target indoor PPFD
    lsp_ppfd: float              # Light Saturation Point (onset of photoinhibition)
    dli_optimal_min: float       # Target minimum DLI (mol/m^2/d)
    dli_optimal_max: float       # Target maximum DLI (mol/m^2/d)
    quantum_yield_alpha: float   # Initial slope of light response curve (mol CO2 / mol photon)
    a_max_umol_m2_s: float       # Maximum gross photosynthetic rate (umol CO2/m^2/s)
    dark_respiration_rd: float   # Dark respiration rate R_d (umol CO2/m^2/s)
    variegation_chlorophyll_Penalty: float = 1.0  # < 1.0 for chimeral variegated cultivars


@dataclass(frozen=True)
class ThermodynamicVPDProfile:
    """
    Cardinal temperatures (Celsius) and Vapor Pressure Deficit (kPa) boundaries.
    """
    t_base_c: float              # Base temperature where metabolic growth halts (GDD base)
    t_opt_min_c: float           # Optimal daytime temperature lower bound
    t_opt_max_c: float           # Optimal daytime temperature upper bound
    t_upper_stress_c: float      # Heat shock protein & Rubisco activase denaturation onset
    t_chilling_injury_c: float   # Membrane lipid phase transition / chilling necrosis
    vpd_opt_min_kpa: float       # Optimal VPD minimum (below this -> fungal pathogen risk)
    vpd_opt_max_kpa: float       # Optimal VPD maximum (ideal transpiration flux)
    vpd_stomatal_closure_kpa: float  # Critical VPD triggering abscisic acid (ABA) stomatal closure


@dataclass(frozen=True)
class EdaphicHydraulicProfile:
    """
    Root-zone physics, matric potential (kPa), electrical conductivity, and pH.
    """
    substrate: SubstrateArchetype
    porosity_fraction: float            # Total pore space (0.0 - 1.0)
    air_filled_porosity_min: float      # Minimum O2 pore fraction to prevent root hypoxia
    field_capacity_vwc: float           # Volumetric water content at -10 kPa matric potential
    critical_depletion_vwc: float       # VWC threshold where irrigation must trigger
    permanent_wilting_point_vwc: float  # VWC at -1500 kPa (or species-specific turgor loss point)
    hypoxia_rot_susceptibility: float   # 0.0 (semi-aquatic) to 1.0 (extreme Pythium sensitivity)
    ph_min: float
    ph_max: float
    ec_target_ms_cm: float              # Target root-zone Electrical Conductivity (mS/cm)
    ec_burn_threshold_ms_cm: float      # Osmotic salt burn threshold
    fluoride_boron_sensitive: bool      # True for Marantaceae, Dracaena, Chlorophytum, Cordyline
    crop_coefficient_kc: float          # Penman-Monteith basal crop coefficient K_cb


@dataclass(frozen=True)
class TaxonomicSpeciesNode:
    """
    Master botanical record uniting APG IV taxonomy, Pl@ntNet-300K cross-references,
    and full physiological parameterization.
    """
    taxon_code: str
    plantnet_species_id: int
    wcvp_accepted_name: str
    genus: str
    species_epithet: str
    cultivar_or_infraspecies: Optional[str]
    apg_iv_clade: str
    apg_iv_order: str
    apg_iv_family: str
    common_names: Tuple[str, ...]
    pathway: PhotosyntheticPathway
    life_form: EcologicalLifeForm
    root_architecture: RootArchitecture
    toxicity: ToxicityMechanism
    photobiology: PhotobiologyProfile
    thermodynamics: ThermodynamicVPDProfile
    hydraulics: EdaphicHydraulicProfile
    npk_stoichiometry_ratio: Tuple[int, int, int]
    care_cluster_id: str


# ==============================================================================
# 3. MASTER KNOWLEDGE GRAPH — 10 NODE CROSS-VALIDATED CORE ARCHETYPES
# ==============================================================================

def build_master_botanical_knowledge_graph() -> Dict[str, TaxonomicSpeciesNode]:
    """
    Returns the canonical dictionary of 10 species archetypes, keyed by taxon_code.
    Care clusters: A=Tropical Aroid Hemiepiphyte, B=Hygrophilic Understory
    Calathea/Fern, C=CAM Succulent Xerophyte, D=High-DLI Woody Ficus/Strelitzia,
    E=Aerated Epiphyte Orchid/Bromeliad.
    """
    graph: Dict[str, TaxonomicSpeciesNode] = {}

    # --- CLUSTER A: TROPICAL AROID HEMIEPIPHYTE --------------------------------
    graph["ARA-MON-DEL-001"] = TaxonomicSpeciesNode(
        taxon_code="ARA-MON-DEL-001", plantnet_species_id=1041,
        wcvp_accepted_name="Monstera deliciosa Liebm.", genus="Monstera",
        species_epithet="deliciosa", cultivar_or_infraspecies=None,
        apg_iv_clade="Monocots", apg_iv_order="Alismatales", apg_iv_family="Araceae",
        common_names=("Swiss Cheese Plant", "Monstera", "Split-Leaf Philodendron"),
        pathway=PhotosyntheticPathway.C3,
        life_form=EcologicalLifeForm.HEMIEPIPHYTE,
        root_architecture=RootArchitecture.ADVENTITIOUS_CLIMBING,
        toxicity=ToxicityMechanism.INSOLUBLE_CALCIUM_OXALATE_RAPHIDES,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=20.0, optimal_ppfd_min=150.0, optimal_ppfd_max=400.0,
            lsp_ppfd=800.0, dli_optimal_min=3.0, dli_optimal_max=8.0,
            quantum_yield_alpha=0.085, a_max_umol_m2_s=28.0, dark_respiration_rd=1.2),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=10.0, t_opt_min_c=18.0, t_opt_max_c=28.0,
            t_upper_stress_c=35.0, t_chilling_injury_c=10.0,
            vpd_opt_min_kpa=0.5, vpd_opt_max_kpa=1.2, vpd_stomatal_closure_kpa=2.0),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.CHUNKY_AROID_BARK_PERLITE,
            porosity_fraction=0.70, air_filled_porosity_min=0.15,
            field_capacity_vwc=0.45, critical_depletion_vwc=0.22,
            permanent_wilting_point_vwc=0.11, hypoxia_rot_susceptibility=0.68,
            ph_min=5.5, ph_max=7.0, ec_target_ms_cm=1.2, ec_burn_threshold_ms_cm=2.5,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.82),
        npk_stoichiometry_ratio=(20, 20, 20), care_cluster_id="CLUSTER_A")

    # Variegated chimeral cultivar — 26% reduction in photosynthetic capacity
    graph["ARA-MON-DEL-002"] = TaxonomicSpeciesNode(
        taxon_code="ARA-MON-DEL-002", plantnet_species_id=1041,
        wcvp_accepted_name="Monstera deliciosa 'Thai Constellation'", genus="Monstera",
        species_epithet="deliciosa", cultivar_or_infraspecies="Thai Constellation",
        apg_iv_clade="Monocots", apg_iv_order="Alismatales", apg_iv_family="Araceae",
        common_names=("Thai Constellation Monstera", "Variegated Monstera"),
        pathway=PhotosyntheticPathway.C3,
        life_form=EcologicalLifeForm.HEMIEPIPHYTE,
        root_architecture=RootArchitecture.ADVENTITIOUS_CLIMBING,
        toxicity=ToxicityMechanism.INSOLUBLE_CALCIUM_OXALATE_RAPHIDES,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=32.0, optimal_ppfd_min=200.0, optimal_ppfd_max=500.0,
            lsp_ppfd=700.0, dli_optimal_min=4.0, dli_optimal_max=10.0,
            quantum_yield_alpha=0.063, a_max_umol_m2_s=20.7, dark_respiration_rd=1.1,
            variegation_chlorophyll_Penalty=0.74),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=10.0, t_opt_min_c=18.0, t_opt_max_c=28.0,
            t_upper_stress_c=35.0, t_chilling_injury_c=12.0,
            vpd_opt_min_kpa=0.5, vpd_opt_max_kpa=1.1, vpd_stomatal_closure_kpa=1.9),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.CHUNKY_AROID_BARK_PERLITE,
            porosity_fraction=0.72, air_filled_porosity_min=0.18,
            field_capacity_vwc=0.42, critical_depletion_vwc=0.20,
            permanent_wilting_point_vwc=0.10, hypoxia_rot_susceptibility=0.72,
            ph_min=5.5, ph_max=7.0, ec_target_ms_cm=1.0, ec_burn_threshold_ms_cm=2.2,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.76),
        npk_stoichiometry_ratio=(20, 20, 20), care_cluster_id="CLUSTER_A")

    # --- CLUSTER B: HYGROPHILIC UNDERSTORY (MARANTACEAE) ------------------------
    graph["MAR-GOE-MAK-001"] = TaxonomicSpeciesNode(
        taxon_code="MAR-GOE-MAK-001", plantnet_species_id=1023,
        wcvp_accepted_name="Goeppertia makoyana (E.Morren) Borchs. & S.Suarez",
        genus="Goeppertia", species_epithet="makoyana", cultivar_or_infraspecies=None,
        apg_iv_clade="Monocots", apg_iv_order="Zingiberales", apg_iv_family="Marantaceae",
        common_names=("Peacock Plant", "Cathedral Windows", "Calathea makoyana"),
        pathway=PhotosyntheticPathway.C3,
        life_form=EcologicalLifeForm.TERRESTRIAL_UNDERSTORY,
        root_architecture=RootArchitecture.FINE_FIBROUS_HYGROPHILIC,
        toxicity=ToxicityMechanism.NON_TOXIC_PET_SAFE,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=15.0, optimal_ppfd_min=75.0, optimal_ppfd_max=200.0,
            lsp_ppfd=400.0, dli_optimal_min=1.5, dli_optimal_max=4.0,
            quantum_yield_alpha=0.075, a_max_umol_m2_s=18.0, dark_respiration_rd=0.9),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=15.0, t_opt_min_c=18.0, t_opt_max_c=26.0,
            t_upper_stress_c=32.0, t_chilling_injury_c=15.0,
            vpd_opt_min_kpa=0.3, vpd_opt_max_kpa=0.8, vpd_stomatal_closure_kpa=1.5),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.HUMUS_RICH_MOISTURE_RETENTIVE,
            porosity_fraction=0.60, air_filled_porosity_min=0.10,
            field_capacity_vwc=0.55, critical_depletion_vwc=0.35,
            permanent_wilting_point_vwc=0.18, hypoxia_rot_susceptibility=0.45,
            ph_min=5.5, ph_max=6.5, ec_target_ms_cm=0.8, ec_burn_threshold_ms_cm=1.8,
            fluoride_boron_sensitive=True, crop_coefficient_kc=0.90),
        npk_stoichiometry_ratio=(10, 10, 10), care_cluster_id="CLUSTER_B")

    # --- CLUSTER C: CAM SUCCULENT XEROPHYTE ------------------------------------
    graph["ASP-DRA-TRI-001"] = TaxonomicSpeciesNode(
        taxon_code="ASP-DRA-TRI-001", plantnet_species_id=1056,
        wcvp_accepted_name="Dracaena trifasciata (Prain) Mabb.", genus="Dracaena",
        species_epithet="trifasciata", cultivar_or_infraspecies="Laurentii",
        apg_iv_clade="Monocots", apg_iv_order="Asparagales", apg_iv_family="Asparagaceae",
        common_names=("Snake Plant", "Mother-in-Law's Tongue", "Sansevieria trifasciata"),
        pathway=PhotosyntheticPathway.CAM,
        life_form=EcologicalLifeForm.SUCCULENT_LEAF,
        root_architecture=RootArchitecture.RHIZOMATOUS_TUBEROUS,
        toxicity=ToxicityMechanism.SAPONINS_AND_GLYCOSIDES,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=10.0, optimal_ppfd_min=50.0, optimal_ppfd_max=300.0,
            lsp_ppfd=600.0, dli_optimal_min=1.0, dli_optimal_max=6.0,
            quantum_yield_alpha=0.055, a_max_umol_m2_s=12.0, dark_respiration_rd=0.4),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=12.0, t_opt_min_c=18.0, t_opt_max_c=30.0,
            t_upper_stress_c=38.0, t_chilling_injury_c=10.0,
            vpd_opt_min_kpa=0.8, vpd_opt_max_kpa=2.0, vpd_stomatal_closure_kpa=2.8),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.MINERAL_GRIT_XEROPHYTIC,
            porosity_fraction=0.80, air_filled_porosity_min=0.25,
            field_capacity_vwc=0.25, critical_depletion_vwc=0.05,
            permanent_wilting_point_vwc=0.02, hypoxia_rot_susceptibility=0.95,
            ph_min=5.5, ph_max=7.5, ec_target_ms_cm=0.9, ec_burn_threshold_ms_cm=2.0,
            fluoride_boron_sensitive=True, crop_coefficient_kc=0.35),
        npk_stoichiometry_ratio=(10, 10, 10), care_cluster_id="CLUSTER_C")

    graph["ARA-ZAM-ZAM-001"] = TaxonomicSpeciesNode(
        taxon_code="ARA-ZAM-ZAM-001", plantnet_species_id=1089,
        wcvp_accepted_name="Zamioculcas zamiifolia (Lodd.) Engl.", genus="Zamioculcas",
        species_epithet="zamiifolia", cultivar_or_infraspecies=None,
        apg_iv_clade="Monocots", apg_iv_order="Alismatales", apg_iv_family="Araceae",
        common_names=("ZZ Plant", "Zanzibar Gem", "Eternity Plant"),
        pathway=PhotosyntheticPathway.C3_CAM_FACULTATIVE,
        life_form=EcologicalLifeForm.GEOPHYTE_RHIZOMATOUS,
        root_architecture=RootArchitecture.RHIZOMATOUS_TUBEROUS,
        toxicity=ToxicityMechanism.INSOLUBLE_CALCIUM_OXALATE_RAPHIDES,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=12.0, optimal_ppfd_min=50.0, optimal_ppfd_max=250.0,
            lsp_ppfd=500.0, dli_optimal_min=1.0, dli_optimal_max=5.0,
            quantum_yield_alpha=0.060, a_max_umol_m2_s=14.0, dark_respiration_rd=0.5),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=12.0, t_opt_min_c=18.0, t_opt_max_c=28.0,
            t_upper_stress_c=35.0, t_chilling_injury_c=12.0,
            vpd_opt_min_kpa=0.6, vpd_opt_max_kpa=1.8, vpd_stomatal_closure_kpa=2.5),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.MINERAL_GRIT_XEROPHYTIC,
            porosity_fraction=0.75, air_filled_porosity_min=0.22,
            field_capacity_vwc=0.30, critical_depletion_vwc=0.08,
            permanent_wilting_point_vwc=0.03, hypoxia_rot_susceptibility=0.90,
            ph_min=6.0, ph_max=7.5, ec_target_ms_cm=1.0, ec_burn_threshold_ms_cm=2.2,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.40),
        npk_stoichiometry_ratio=(20, 20, 20), care_cluster_id="CLUSTER_C")

    # --- CLUSTER D: HIGH-DLI WOODY FICUS / STRELITZIA ---------------------------
    graph["MOR-FIC-LYR-001"] = TaxonomicSpeciesNode(
        taxon_code="MOR-FIC-LYR-001", plantnet_species_id=1092,
        wcvp_accepted_name="Ficus lyrata Warb.", genus="Ficus",
        species_epithet="lyrata", cultivar_or_infraspecies=None,
        apg_iv_clade="Rosids", apg_iv_order="Rosales", apg_iv_family="Moraceae",
        common_names=("Fiddle-Leaf Fig", "Fiddle Leaf Fig"),
        pathway=PhotosyntheticPathway.C3,
        life_form=EcologicalLifeForm.TERRESTRIAL_ARBOREAL,
        root_architecture=RootArchitecture.DEEP_STRUCTURAL,
        toxicity=ToxicityMechanism.FICIN_AND_PSORALEN_LATEX,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=30.0, optimal_ppfd_min=250.0, optimal_ppfd_max=800.0,
            lsp_ppfd=1500.0, dli_optimal_min=5.0, dli_optimal_max=16.0,
            quantum_yield_alpha=0.090, a_max_umol_m2_s=32.0, dark_respiration_rd=1.4),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=12.0, t_opt_min_c=18.0, t_opt_max_c=30.0,
            t_upper_stress_c=38.0, t_chilling_injury_c=12.0,
            vpd_opt_min_kpa=0.5, vpd_opt_max_kpa=1.5, vpd_stomatal_closure_kpa=2.2),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.STANDARD_LOAMY_INTERIOR,
            porosity_fraction=0.65, air_filled_porosity_min=0.12,
            field_capacity_vwc=0.40, critical_depletion_vwc=0.20,
            permanent_wilting_point_vwc=0.10, hypoxia_rot_susceptibility=0.60,
            ph_min=6.0, ph_max=7.0, ec_target_ms_cm=1.5, ec_burn_threshold_ms_cm=2.8,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.95),
        npk_stoichiometry_ratio=(24, 8, 16), care_cluster_id="CLUSTER_D")

    # --- CLUSTER E: AERATED EPIPHYTE ORCHID / BROMELIAD -------------------------
    graph["ORC-PHA-APH-001"] = TaxonomicSpeciesNode(
        taxon_code="ORC-PHA-APH-001", plantnet_species_id=1075,
        wcvp_accepted_name="Phalaenopsis aphrodite Rchb.f.", genus="Phalaenopsis",
        species_epithet="aphrodite", cultivar_or_infraspecies=None,
        apg_iv_clade="Monocots", apg_iv_order="Asparagales", apg_iv_family="Orchidaceae",
        common_names=("Moth Orchid", "Phalaenopsis Orchid"),
        pathway=PhotosyntheticPathway.CAM,
        life_form=EcologicalLifeForm.EPIPHYTE,
        root_architecture=RootArchitecture.VELAMEN_AERIAL,
        toxicity=ToxicityMechanism.NON_TOXIC_PET_SAFE,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=18.0, optimal_ppfd_min=100.0, optimal_ppfd_max=300.0,
            lsp_ppfd=500.0, dli_optimal_min=2.0, dli_optimal_max=6.0,
            quantum_yield_alpha=0.070, a_max_umol_m2_s=16.0, dark_respiration_rd=0.7),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=15.0, t_opt_min_c=18.0, t_opt_max_c=28.0,
            t_upper_stress_c=32.0, t_chilling_injury_c=15.0,
            vpd_opt_min_kpa=0.4, vpd_opt_max_kpa=1.0, vpd_stomatal_closure_kpa=1.8),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.EPIPHYTIC_ORCHID_BARK_SPHAGNUM,
            porosity_fraction=0.85, air_filled_porosity_min=0.30,
            field_capacity_vwc=0.35, critical_depletion_vwc=0.15,
            permanent_wilting_point_vwc=0.05, hypoxia_rot_susceptibility=0.75,
            ph_min=5.5, ph_max=6.5, ec_target_ms_cm=0.6, ec_burn_threshold_ms_cm=1.2,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.60),
        npk_stoichiometry_ratio=(20, 20, 20), care_cluster_id="CLUSTER_E")

    graph["PIP-PEP-OBT-001"] = TaxonomicSpeciesNode(
        taxon_code="PIP-PEP-OBT-001", plantnet_species_id=1048,
        wcvp_accepted_name="Peperomia obtusifolia (L.) A.Dietr.", genus="Peperomia",
        species_epithet="obtusifolia", cultivar_or_infraspecies=None,
        apg_iv_clade="Magnoliids", apg_iv_order="Piperales", apg_iv_family="Piperaceae",
        common_names=("Baby Rubber Plant", "Pepper Face", "Blunt-Leaf Peperomia"),
        pathway=PhotosyntheticPathway.C3_CAM_FACULTATIVE,
        life_form=EcologicalLifeForm.SUCCULENT_LEAF,
        root_architecture=RootArchitecture.SHALLOW_XEROPHYTIC,
        toxicity=ToxicityMechanism.NON_TOXIC_PET_SAFE,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=15.0, optimal_ppfd_min=100.0, optimal_ppfd_max=300.0,
            lsp_ppfd=600.0, dli_optimal_min=2.0, dli_optimal_max=6.0,
            quantum_yield_alpha=0.072, a_max_umol_m2_s=17.0, dark_respiration_rd=0.8),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=12.0, t_opt_min_c=18.0, t_opt_max_c=28.0,
            t_upper_stress_c=34.0, t_chilling_injury_c=12.0,
            vpd_opt_min_kpa=0.5, vpd_opt_max_kpa=1.2, vpd_stomatal_closure_kpa=2.0),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.STANDARD_LOAMY_INTERIOR,
            porosity_fraction=0.68, air_filled_porosity_min=0.15,
            field_capacity_vwc=0.40, critical_depletion_vwc=0.18,
            permanent_wilting_point_vwc=0.08, hypoxia_rot_susceptibility=0.70,
            ph_min=6.0, ph_max=7.0, ec_target_ms_cm=1.0, ec_burn_threshold_ms_cm=2.0,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.55),
        npk_stoichiometry_ratio=(20, 20, 20), care_cluster_id="CLUSTER_E")

    graph["ARA-SPA-WAL-001"] = TaxonomicSpeciesNode(
        taxon_code="ARA-SPA-WAL-001", plantnet_species_id=1012,
        wcvp_accepted_name="Spathiphyllum wallisii Regel", genus="Spathiphyllum",
        species_epithet="wallisii", cultivar_or_infraspecies=None,
        apg_iv_clade="Monocots", apg_iv_order="Alismatales", apg_iv_family="Araceae",
        common_names=("Peace Lily", "Spathiphyllum", "White Sails"),
        pathway=PhotosyntheticPathway.C3,
        life_form=EcologicalLifeForm.TERRESTRIAL_UNDERSTORY,
        root_architecture=RootArchitecture.FINE_FIBROUS_HYGROPHILIC,
        toxicity=ToxicityMechanism.INSOLUBLE_CALCIUM_OXALATE_RAPHIDES,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=12.0, optimal_ppfd_min=75.0, optimal_ppfd_max=250.0,
            lsp_ppfd=500.0, dli_optimal_min=1.5, dli_optimal_max=5.0,
            quantum_yield_alpha=0.080, a_max_umol_m2_s=20.0, dark_respiration_rd=1.0),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=12.0, t_opt_min_c=18.0, t_opt_max_c=28.0,
            t_upper_stress_c=34.0, t_chilling_injury_c=12.0,
            vpd_opt_min_kpa=0.4, vpd_opt_max_kpa=1.0, vpd_stomatal_closure_kpa=1.8),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.HUMUS_RICH_MOISTURE_RETENTIVE,
            porosity_fraction=0.62, air_filled_porosity_min=0.12,
            field_capacity_vwc=0.50, critical_depletion_vwc=0.30,
            permanent_wilting_point_vwc=0.15, hypoxia_rot_susceptibility=0.50,
            ph_min=5.5, ph_max=6.5, ec_target_ms_cm=1.0, ec_burn_threshold_ms_cm=2.0,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.85),
        npk_stoichiometry_ratio=(20, 20, 20), care_cluster_id="CLUSTER_B")

    graph["CRA-CRA-OVA-001"] = TaxonomicSpeciesNode(
        taxon_code="CRA-CRA-OVA-001", plantnet_species_id=1033,
        wcvp_accepted_name="Crassula ovata (Mill.) Druce", genus="Crassula",
        species_epithet="ovata", cultivar_or_infraspecies=None,
        apg_iv_clade="Eudicots", apg_iv_order="Saxifragales", apg_iv_family="Crassulaceae",
        common_names=("Jade Plant", "Money Tree", "Lucky Plant"),
        pathway=PhotosyntheticPathway.CAM,
        life_form=EcologicalLifeForm.SUCCULENT_LEAF,
        root_architecture=RootArchitecture.SHALLOW_XEROPHYTIC,
        toxicity=ToxicityMechanism.NON_TOXIC_PET_SAFE,
        photobiology=PhotobiologyProfile(
            lcp_ppfd=15.0, optimal_ppfd_min=100.0, optimal_ppfd_max=500.0,
            lsp_ppfd=900.0, dli_optimal_min=2.0, dli_optimal_max=10.0,
            quantum_yield_alpha=0.060, a_max_umol_m2_s=15.0, dark_respiration_rd=0.5),
        thermodynamics=ThermodynamicVPDProfile(
            t_base_c=10.0, t_opt_min_c=18.0, t_opt_max_c=30.0,
            t_upper_stress_c=38.0, t_chilling_injury_c=5.0,
            vpd_opt_min_kpa=0.8, vpd_opt_max_kpa=2.2, vpd_stomatal_closure_kpa=3.0),
        hydraulics=EdaphicHydraulicProfile(
            substrate=SubstrateArchetype.MINERAL_GRIT_XEROPHYTIC,
            porosity_fraction=0.80, air_filled_porosity_min=0.25,
            field_capacity_vwc=0.22, critical_depletion_vwc=0.06,
            permanent_wilting_point_vwc=0.02, hypoxia_rot_susceptibility=0.92,
            ph_min=6.0, ph_max=7.5, ec_target_ms_cm=0.8, ec_burn_threshold_ms_cm=1.8,
            fluoride_boron_sensitive=False, crop_coefficient_kc=0.30),
        npk_stoichiometry_ratio=(10, 10, 10), care_cluster_id="CLUSTER_C")

    return graph


# ==============================================================================
# 4. BIOPHYSICAL DIFFERENTIAL ENGINE
# ==============================================================================

@dataclass
class VPDResult:
    """Vapor Pressure Deficit (VPD) outputs with intermediate state variables."""
    air_temp_c: float
    leaf_temp_c: float
    rh_percent: float
    saturation_vapor_pressure_kpa: float
    actual_vapor_pressure_kpa: float
    vpd_air_kpa: float
    vpd_leaf_kpa: float
    dew_point_c: float


@dataclass
class PhotosynthesisResult:
    """Net photosynthesis (A_net) outputs for a single photon flux condition."""
    ppfd_umol_m2_s: float
    a_net_umol_m2_s: float
    a_gross_umol_m2_s: float
    dark_respiration_umol_m2_s: float
    stomatal_conductance_scalar: float
    temperature_response_scalar: float
    is_photoinhibited: bool
    is_below_lcp: bool


@dataclass
class HydrationBalanceResult:
    """Daily substrate hydration simulation with hypoxia / desiccation risk."""
    substrate_start_vwc: float
    daily_evapotranspiration_ml: float
    substrate_peak_vwc: float
    substrate_trough_vwc: float
    substrate_mean_vwc: float
    air_filled_porosity_fraction: float
    hypoxia_rot_risk_score: float
    desiccation_wilt_risk_score: float
    optimal_watering_interval_days: int
    optimal_watering_dose_ml: float
    recommended_action: str


@dataclass
class StressDiagnosis:
    """Single diagnostic determination with mechanism and confidence."""
    diagnostic_code: str
    physiological_mechanism: str
    severity_score: float
    confidence: float
    action_prescription: str


class BiophysicalDifferentialEngine:
    """
    Deterministic, physics-anchored calculator for indoor plant health.

    All equations are closed-form and require no external dependencies:
    Magnus-Tetens saturation vapor pressure, non-rectangular hyperbola
    light-response curve, and a substrate water-balance ODE integrator.
    """

    # --- Constants -----------------------------------------------------------------
    MAGNUS_A: float = 17.27
    MAGNUS_B: float = 237.3
    KAGgle_PHOTOSYNTHESIS_THETA: float = 0.75   # Curvature of light-response curve
    Q10_RESPIRATION: float = 2.0               # Respiration scaling per 10C rise

    # --- 4.1 VPD (Magnus-Tetens) -----------------------------------------------------
    def compute_vpd_air_and_leaf(
        self,
        air_temp_c: float,
        rh_percent: float,
        leaf_temp_offset_c: float = -0.8,
    ) -> VPDResult:
        """
        Compute saturation vapor pressure (es) via Magnus-Tetens, actual vapor
        pressure (ea) from relative humidity, and VPD for both bulk air and leaf
        surface (leaf assumed 0.8C cooler via transpirational evaporative cooling).
        """
        if not (0.0 <= rh_percent <= 100.0):
            raise ValueError(f"Relative humidity must be within [0, 100]%; got {rh_percent}.")
        if not (-10.0 <= air_temp_c <= 50.0):
            raise ValueError(f"Air temperature out of plausible indoor range: {air_temp_c}C.")

        es_air = 0.61078 * math.exp((self.MAGNUS_A * air_temp_c) / (air_temp_c + self.MAGNUS_B))
        ea = es_air * (rh_percent / 100.0)
        vpd_air = max(0.0, es_air - ea)

        leaf_temp_c = air_temp_c + leaf_temp_offset_c
        es_leaf = 0.61078 * math.exp((self.MAGNUS_A * leaf_temp_c) / (leaf_temp_c + self.MAGNUS_B))
        vpd_leaf = max(0.0, es_leaf - ea)

        # Magnus dew point approximation: dew point T_d = B*gamma / (A - gamma)
        alpha = math.log(max(ea, 1e-9) / 0.61078)
        dew_point = (self.MAGNUS_B * alpha) / (self.MAGNUS_A - alpha)

        return VPDResult(
            air_temp_c=air_temp_c, leaf_temp_c=leaf_temp_c, rh_percent=rh_percent,
            saturation_vapor_pressure_kpa=es_air, actual_vapor_pressure_kpa=ea,
            vpd_air_kpa=vpd_air, vpd_leaf_kpa=vpd_leaf, dew_point_c=dew_point)

    # --- 4.2 Kaggle Sunlight Label to PPFD / DLI Mapping -----------------------------
    @staticmethod
    def map_kaggle_sunlight_to_ppfd_and_dli(sunlight_label: str) -> Tuple[float, float]:
        """
        Deterministic crosswalk from the Kaggle dataset's qualitative sunlight
        column to indoor PPFD (umol/m^2/s) and an implied Daily Light Integral
        (mol/m^2/day, assuming 12 h photoperiod).
        """
        label = sunlight_label.strip().lower()
        mapping: Dict[str, Tuple[float, float]] = {
            "low": (45.0, 1.94),
            "low sunlight": (45.0, 1.94),
            "medium": (150.0, 6.48),
            "part shade": (150.0, 6.48),
            "medium light": (150.0, 6.48),
            "indirect": (150.0, 6.48),
            "high": (450.0, 19.44),
            "direct": (450.0, 19.44),
            "full sun": (450.0, 19.44),
        }
        for key, value in mapping.items():
            if key in label:
                return value
        logger.warning("Unknown sunlight label '%s'; defaulting to medium indoor light.", sunlight_label)
        return mapping["medium"]

    # --- 4.3 Non-Rectangular Hyperbola Photosynthesis --------------------------------
    def compute_net_photosynthesis(
        self,
        node: TaxonomicSpeciesNode,
        ppfd_umol_m2_s: float,
        air_temp_c: float,
        vpd_air_kpa: float,
    ) -> PhotosynthesisResult:
        """
        Solve the non-rectangular hyperbola for gross photosynthesis:
            theta*A^2 - (alpha*I + A_max)*A + alpha*I*A_max = 0
        then apply stomatal conductance (VPD-driven ABA closure), cardinal
        temperature response, photoinhibition above LSP, and Q10-scaled dark
        respiration. Returns A_net = A_gross - R_d.
        """
        pb = node.photobiology
        th = node.thermodynamics
        theta = self.KAGgle_PHOTOSYNTHESIS_THETA

        # Stomatal conductance scalar: 1.0 below optimum, linear decay to closure.
        if vpd_air_kpa <= th.vpd_opt_max_kpa:
            gs_scalar = 1.0
        elif vpd_air_kpa >= th.vpd_stomatal_closure_kpa:
            gs_scalar = 0.10
        else:
            span = th.vpd_stomatal_closure_kpa - th.vpd_opt_max_kpa
            gs_scalar = 1.0 - 0.90 * ((vpd_air_kpa - th.vpd_opt_max_kpa) / max(span, 1e-9))

        # Cardinal temperature response: 0 at base/chilling, 1 at optimum plateau.
        if air_temp_c <= th.t_base_c or air_temp_c >= th.t_upper_stress_c:
            temp_scalar = 0.0
        elif th.t_opt_min_c <= air_temp_c <= th.t_opt_max_c:
            temp_scalar = 1.0
        elif air_temp_c < th.t_opt_min_c:
            temp_scalar = (air_temp_c - th.t_base_c) / max(th.t_opt_min_c - th.t_base_c, 1e-9)
        else:
            temp_scalar = (th.t_upper_stress_c - air_temp_c) / max(th.t_upper_stress_c - th.t_opt_max_c, 1e-9)

        alpha = pb.quantum_yield_alpha * pb.variegation_chlorophyll_Penalty
        a_max = pb.a_max_umol_m2_s * pb.variegation_chlorophyll_Penalty
        incident = ppfd_umol_m2_s * gs_scalar * temp_scalar

        # Closed-form non-rectangular hyperbola solution (upper root discarded).
        discriminant = (alpha * incident + a_max) ** 2 - 4.0 * theta * alpha * incident * a_max
        a_gross = ((alpha * incident + a_max) - math.sqrt(max(discriminant, 0.0))) / (2.0 * theta)

        # Photoinhibition: linear decay of gross rate above light saturation point.
        is_photoinhibited = ppfd_umol_m2_s > pb.lsp_ppfd
        if is_photoinhibited:
            excess = ppfd_umol_m2_s - pb.lsp_ppfd
            a_gross *= max(0.0, 1.0 - 0.0005 * excess)

        # Q10 dark respiration scaled from 25C reference.
        rd = pb.dark_respiration_rd * (self.Q10_RESPIRATION ** ((air_temp_c - 25.0) / 10.0))
        a_net = a_gross - rd
        is_below_lcp = ppfd_umol_m2_s < pb.lcp_ppfd

        return PhotosynthesisResult(
            ppfd_umol_m2_s=ppfd_umol_m2_s, a_net_umol_m2_s=a_net,
            a_gross_umol_m2_s=a_gross, dark_respiration_umol_m2_s=rd,
            stomatal_conductance_scalar=gs_scalar, temperature_response_scalar=temp_scalar,
            is_photoinhibited=is_photoinhibited, is_below_lcp=is_below_lcp)

    # --- 4.4 Substrate Hydration Balance -----------------------------------------------
    def simulate_substrate_hydration_balance(
        self,
        node: TaxonomicSpeciesNode,
        air_temp_c: float,
        rh_percent: float,
        ppfd_umol_m2_s: float,
        pot_volume_l: float,
        initial_vwc: float,
        watering_dose_ml: float,
        watering_interval_days: int,
        leaf_count: int = 12,
        hours_per_day: int = 12,
    ) -> HydrationBalanceResult:
        """
        Simulate 24-hour substrate water balance for a single watering cycle:
        ET demand from VPD x Kc x pathway scalar x leaf area, then compare
        trough VWC against critical depletion and wilting points, and peak
        air-filled porosity against the hypoxia floor.
        """
        vpd = self.compute_vpd_air_and_leaf(air_temp_c, rh_percent)
        hyd = node.hydraulics

        # Pathway water-use scalar: CAM conserves ~40% of C3 water use.
        pathway_scalar = {
            PhotosyntheticPathway.C3: 1.00,
            PhotosyntheticPathway.CAM: 0.60,
            PhotosyntheticPathway.C3_CAM_FACULTATIVE: 0.75,
            PhotosyntheticPathway.C4: 0.90,
        }[node.pathway]

        # Simplified Penman-Monteith proxy: ET (ml/day) ~ VPD * Kc * leaf area.
        leaf_area_m2 = max(0.02, leaf_count * 0.008)
        et_ml_per_day = (
            vpd.vpd_air_kpa * hyd.crop_coefficient_kc * pathway_scalar
            * leaf_area_m2 * 1000.0 * 0.9
        )

        # VWC trajectory: dose raises VWC instantly; ET drains it linearly.
        soil_volume_ml = pot_volume_l * 1000.0
        vwc_after_watering = min(
            hyd.porosity_fraction,
            initial_vwc + (watering_dose_ml / soil_volume_ml),
        )
        trough_vwc = max(0.0, vwc_after_watering - (et_ml_per_day * watering_interval_days) / soil_volume_ml)
        mean_vwc = (vwc_after_watering + trough_vwc) / 2.0

        air_filled_porosity = max(0.0, hyd.porosity_fraction - vwc_after_watering)
        hypoxia_risk = 0.0
        if air_filled_porosity < hyd.air_filled_porosity_min:
            deficit = hyd.air_filled_porosity_min - air_filled_porosity
            hypoxia_risk = min(1.0, (deficit / max(hyd.air_filled_porosity_min, 1e-9)) * hyd.hypoxia_rot_susceptibility)

        desiccation_risk = 0.0
        if trough_vwc < hyd.critical_depletion_vwc:
            if trough_vwc <= hyd.permanent_wilting_point_vwc:
                desiccation_risk = 1.0
            else:
                Span = hyd.critical_depletion_vwc - hyd.permanent_wilting_point_vwc
                desiccation_risk = 1.0 - ((trough_vwc - hyd.permanent_wilting_point_vwc) / max(Span, 1e-9))

        # Optimal interval: days for VWC to fall from field capacity to critical depletion.
        daily_vwc_drop = et_ml_per_day / soil_volume_ml
        if daily_vwc_drop > 1e-9:
            optimal_interval = int(round(
                (hyd.field_capacity_vwc - hyd.critical_depletion_vwc) / daily_vwc_drop))
        else:
            optimal_interval = 14
        optimal_interval = max(1, min(optimal_interval, 30))

        # Optimal dose: refill from critical depletion to field capacity + 15% leaching.
        optimal_dose_ml = (
            (hyd.field_capacity_vwc - hyd.critical_depletion_vwc) * soil_volume_ml * 1.15
        )

        if hypoxia_risk > 0.30:
            action = "REDUCE_DOSE_AND_EXTEND_INTERVAL: substrate stays hypoxic; increase aeration."
        elif desiccation_risk > 0.30:
            action = "INCREASE_DOSE_OR_SHORTEN_INTERVAL: trough VWC below critical depletion."
        else:
            action = "MAINTAIN_CURRENT_REGIME: hydration balance within safe band."

        return HydrationBalanceResult(
            substrate_start_vwc=initial_vwc, daily_evapotranspiration_ml=et_ml_per_day,
            substrate_peak_vwc=vwc_after_watering, substrate_trough_vwc=trough_vwc,
            substrate_mean_vwc=mean_vwc, air_filled_porosity_fraction=air_filled_porosity,
            hypoxia_rot_risk_score=hypoxia_risk, desiccation_wilt_risk_score=desiccation_risk,
            optimal_watering_interval_days=optimal_interval,
            optimal_watering_dose_ml=optimal_dose_ml, recommended_action=action)

    # --- 4.5 Differential Pathology Triage ----------------------------------------------
    def diagnose_biotic_and_abiotic_stressors(
        self,
        node: TaxonomicSpeciesNode,
        vpd_air_kpa: float,
        ppfd_umol_m2_s: float,
        hydration: HydrationBalanceResult,
        fertilizer_ec_ms_cm: float = 1.0,
        tap_water_fluoride_ppm: float = 0.7,
    ) -> List[StressDiagnosis]:
        """
        Differential diagnosis returning ranked stress determinations.
        Five diagnostic codes cover the dominant indoor-plant failure modes.
        """
        diagnoses: List[StressDiagnosis] = []
        pb = node.photobiology
        hyd = node.hydraulics

        # 1) Spider mites (Tetranychus urticae) — thrive in hot, dry, high-VPD air.
        if vpd_air_kpa > 1.45:
            diagnoses.append(StressDiagnosis(
                diagnostic_code="BIOTIC_ACARI_TETRANYCHUS",
                physiological_mechanism=(
                    "High VPD (>1.45 kPa) desiccates leaf boundary layer and accelerates "
                    "Tetranychus urticae reproduction; stippling chlorosis precedes webbing."),
                severity_score=min(1.0, (vpd_air_kpa - 1.45) / 1.0),
                confidence=0.72,
                action_prescription=(
                    "Raise humidity to lower VPD below 1.2 kPa; isolate plant; apply "
                    "miticide or predatory Phytoseiulus persimilis.")))

        # 2) Pythium / Phytophthora root rot — hypoxia-driven oomycete infection.
        if hydration.hypoxia_rot_risk_score > 0.30:
            diagnoses.append(StressDiagnosis(
                diagnostic_code="BIOTIC_OOMYCETE_PYTHIUM",
                physiological_mechanism=(
                    "Air-filled porosity below the species hypoxia floor suffocates roots; "
                    "anaerobic exudates recruit Pythium zoospores and collapse cortex tissue."),
                severity_score=hydration.hypoxia_rot_risk_score,
                confidence=0.81,
                action_prescription=(
                    "Stop watering immediately; repot into a chunkier, aerated substrate; "
                    "trim blackened roots; drench with a labeled fungicide if permitted.")))

        # 3) Fluoride / boron tip necrosis — Marantaceae, Dracaena, Chlorophytum.
        if hyd.fluoride_boron_sensitive and tap_water_fluoride_ppm > 0.3:
            diagnoses.append(StressDiagnosis(
                diagnostic_code="ABIOTIC_FLUORIDE_TIP_NECROSIS",
                physiological_mechanism=(
                    "Fluoride accumulates at leaf margins via transpiration stream; "
                    "sensitive taxa lack vacuolar sequestration, causing marginal necrosis."),
                severity_score=min(1.0, (tap_water_fluoride_ppm - 0.3) / 0.7),
                confidence=0.88,
                action_prescription=(
                    "Switch to rainwater, distilled water, or reverse-osmosis water; "
                    "flush substrate to leach accumulated fluoride.")))

        # 4) Osmotic salt toxicity — EC above the species burn threshold.
        if fertilizer_ec_ms_cm > hyd.ec_burn_threshold_ms_cm:
            diagnoses.append(StressDiagnosis(
                diagnostic_code="ABIOTIC_OSMOTIC_SALT_TOXICITY",
                physiological_mechanism=(
                    "Root-zone EC above the burn threshold reverses the water potential "
                    "gradient, causing plasmolysis and marginal leaf burn (fertilizer burn)."),
                severity_score=min(1.0, (fertilizer_ec_ms_cm - hyd.ec_burn_threshold_ms_cm) / 1.0),
                confidence=0.84,
                action_prescription=(
                    "Flush substrate with 3x pot volume of clean water; withhold fertilizer "
                    "for 4 weeks; resume at half label strength.")))

        # 5) Negative carbon balance (etiolation) or PSII photoinhibition.
        if ppfd_umol_m2_s < pb.lcp_ppfd:
            diagnoses.append(StressDiagnosis(
                diagnostic_code="ABIOTIC_NEGATIVE_CARBON_ETIOLATION",
                physiological_mechanism=(
                    "PPFD below the light compensation point means respiration exceeds "
                    "photosynthesis; internodes elongate and leaves pale (etiolation)."),
                severity_score=min(1.0, (pb.lcp_ppfd - ppfd_umol_m2_s) / pb.lcp_ppfd),
                confidence=0.79,
                action_prescription=(
                    "Move to brighter indirect light; increase photoperiod to 12-14 h; "
                    "do not fertilize until positive carbon balance resumes.")))
        elif ppfd_umol_m2_s > pb.lsp_ppfd:
            diagnoses.append(StressDiagnosis(
                diagnostic_code="ABIOTIC_PSII_PHOTOINHIBITION",
                physiological_mechanism=(
                    "PPFD above the light saturation point overwhelms PSII repair; "
                    "excess excitation energy generates reactive oxygen species and bleaching."),
                severity_score=min(1.0, (ppfd_umol_m2_s - pb.lsp_ppfd) / pb.lsp_ppfd),
                confidence=0.76,
                action_prescription=(
                    "Add sheer curtain diffusion; move 1-2 m from the window; "
                    "monitor for bleached patches over 7 days.")))

        if not diagnoses:
            diagnoses.append(StressDiagnosis(
                diagnostic_code="HOMEOSTASIS_OPTIMAL",
                physiological_mechanism=(
                    "All biophysical indicators within species-optimal bands; "
                    "no differential stressor exceeds its diagnostic threshold."),
                severity_score=0.0, confidence=0.95,
                action_prescription="Maintain current care regime; re-evaluate at next watering."))

        diagnoses.sort(key=lambda d: d.severity_score, reverse=True)
        return diagnoses


# ==============================================================================
# 5. PL@NTNET-300K LONG-TAIL TAXONOMIC ADAPTER
# ==============================================================================

@dataclass
class PlantNet300KClassDistribution:
    """Per-species long-tail statistics for logit adjustment and CC licensing."""
    taxon_code: str
    class_index: int
    train_image_count: int
    organ_priors: Dict[str, float]
    logit_adjustment_offset: float
    cc_by_image_count: int
    cc_by_nc_image_count: int
    is_long_tail_class: bool


class PlantNet300KAdapter:
    """
    Implements logit adjustment for the Pl@ntNet-300K long-tail distribution:
        adjusted_logit_y = logit_y - tau * log(pi_y + eps)
    where pi_y is the empirical class prior. Also enforces CC-BY vs CC-BY-NC
    separation so commercial Petey Plant features train only on permissive images.
    """

    TOTAL_DATASET_IMAGES: int = 306_146
    NUM_CLASSES_V1_1: int = 1081
    PERMISSIVE_LICENSE_ESTIMATE: float = 0.18  # CC-BY share of Pl@ntNet-300K

    def __init__(self, tau: float = 1.0):
        self.tau = tau

    def compute_logit_adjusted_prior(
        self,
        class_image_count: int,
        total_images: Optional[int] = None,
    ) -> float:
        """Return tau * log(pi_y + eps) to subtract from the raw class logit."""
        total = total_images or self.TOTAL_DATASET_IMAGES
        pi_y = class_image_count / max(total, 1)
        return self.tau * math.log(pi_y + 1e-12)

    def build_species_vision_metadata(
        self,
        node: TaxonomicSpeciesNode,
        train_image_count: int,
        class_index: int,
    ) -> PlantNet300KClassDistribution:
        """
        Build organ priors and licensing split for one species. Orchidaceae
        taxa are flower-heavy in Pl@ntNet imagery; most houseplants are leaf-heavy.
        """
        if node.apg_iv_family == "Orchidaceae":
            organ_priors = {
                PlantNetOrgan.FLOWER.value: 0.52,
                PlantNetOrgan.LEAF.value: 0.30,
                PlantNetOrgan.HABIT.value: 0.10,
                PlantNetOrgan.STEM.value: 0.05,
                PlantNetOrgan.FRUIT.value: 0.02,
                PlantNetOrgan.OTHER.value: 0.01,
            }
        else:
            organ_priors = {
                PlantNetOrgan.LEAF.value: 0.68,
                PlantNetOrgan.HABIT.value: 0.22,
                PlantNetOrgan.FLOWER.value: 0.04,
                PlantNetOrgan.STEM.value: 0.03,
                PlantNetOrgan.FRUIT.value: 0.02,
                PlantNetOrgan.OTHER.value: 0.01,
            }
        permissive = int(round(train_image_count * self.PERMISSIVE_LICENSE_ESTIMATE))
        return PlantNet300KClassDistribution(
            taxon_code=node.taxon_code, class_index=class_index,
            train_image_count=train_image_count, organ_priors=organ_priors,
            logit_adjustment_offset=self.compute_logit_adjusted_prior(train_image_count),
            cc_by_image_count=permissive,
            cc_by_nc_image_count=train_image_count - permissive,
            is_long_tail_class=train_image_count < 100)


# ==============================================================================
# 6. MUSE PROPRIETARY DATASET BUILDER
# ==============================================================================

@dataclass
class UpgradedKaggleObservation:
    """
    One Kaggle indoor-plant row upgraded with full biophysical features.
    Every row carries a SHA-256 signature for reproducibility and provenance.
    """
    original_plant_name: str
    taxon_code: str
    care_cluster_id: str
    air_temp_c: float
    rh_percent: float
    vpd_air_kpa: float
    vpd_leaf_kpa: float
    sunlight_label: str
    ppfd_umol_m2_s: float
    dli_mol_m2_day: float
    a_net_umol_m2_s: float
    substrate_vwc_peak: float
    substrate_vwc_trough: float
    hypoxia_rot_risk: float
    desiccation_wilt_risk: float
    optimal_interval_days: int
    optimal_dose_ml: float
    primary_pathology_code: str
    physiological_mechanism: str
    health_index_0_100: float
    predicted_new_leaves_30d: float
    plantnet_logit_offset: float
    row_signature_sha256: str


class MuseProprietaryDatasetBuilder:
    """
    Upgrades raw Kaggle indoor-plant observations into biophysically enriched
    training rows, and synthesizes stratified corpora across five stress regimes
    for the Petey Plant health model.
    """

    def __init__(
        self,
        knowledge_graph: Dict[str, TaxonomicSpeciesNode],
        engine: Optional[BiophysicalDifferentialEngine] = None,
        adapter: Optional[PlantNet300KAdapter] = None,
        seed: int = 20261027,
    ):
        self.graph = knowledge_graph
        self.engine = engine or BiophysicalDifferentialEngine()
        self.adapter = adapter or PlantNet300KAdapter()
        self.rng = random.Random(seed)

    # --- 6.1 Kaggle observation upgrader ----------------------------------------------
    def upgrade_kaggle_observation(
        self,
        raw_row: Dict[str, Any],
        taxon_code: str,
    ) -> UpgradedKaggleObservation:
        """Enrich one raw Kaggle row with VPD, photosynthesis, hydraulics, pathology."""
        node = self.graph[taxon_code]

        air_temp_c = float(raw_row.get("Temperature_C", raw_row.get("air_temp_c", 22.0)))
        rh_percent = float(raw_row.get("Humidity_Pct", raw_row.get("rh_percent", 55.0)))
        sunlight_label = str(raw_row.get("Sunlight", raw_row.get("sunlight_label", "medium")))
        ppfd, dli = self.engine.map_kaggle_sunlight_to_ppfd_and_dli(sunlight_label)
        vpd = self.engine.compute_vpd_air_and_leaf(air_temp_c, rh_percent)
        photo = self.engine.compute_net_photosynthesis(node, ppfd, air_temp_c, vpd.vpd_air_kpa)

        height_cm = float(raw_row.get("Height_cm", 30.0))
        pot_volume_l = float(raw_row.get("Pot_Volume_L", max(1.0, round(height_cm * 0.08, 2))))
        initial_vwc = float(raw_row.get("Soil_Moisture_VWC", node.hydraulics.field_capacity_vwc))
        dose_ml = float(raw_row.get("Watering_Dose_ml", 250.0))
        interval_days = int(raw_row.get("Watering_Interval_days", 7))
        hydration = self.engine.simulate_substrate_hydration_balance(
            node, air_temp_c, rh_percent, ppfd, pot_volume_l,
            initial_vwc, dose_ml, interval_days)
        diagnoses = self.engine.diagnose_biotic_and_abiotic_stressors(
            node, vpd.vpd_air_kpa, ppfd, hydration,
            fertilizer_ec_ms_cm=float(raw_row.get("Fertilizer_EC_mS_cm", 1.0)),
            tap_water_fluoride_ppm=float(raw_row.get("Fluoride_ppm", 0.7)))
        primary = diagnoses[0]

        # Health index: photosynthesis, hydration risk, and pathology severity.
        photo_term = max(0.0, min(1.0, photo.a_net_umol_m2_s / max(node.photobiology.a_max_umol_m2_s, 1e-9)))
        risk_term = 1.0 - max(hydration.hypoxia_rot_risk_score, hydration.desiccation_wilt_risk_score)
        path_term = 1.0 - (primary.severity_score if primary.diagnostic_code != "HOMEOSTASIS_OPTIMAL" else 0.0)
        health_index = round(100.0 * (0.40 * photo_term + 0.30 * risk_term + 0.30 * path_term), 2)

        # 30-day new-leaf prediction: proportional to carbon surplus above LCP.
        carbon_surplus = max(0.0, photo.a_net_umol_m2_s)
        predicted_leaves = round(carbon_surplus * 0.15, 2)

        logit_offset = self.adapter.compute_logit_adjusted_prior(
            int(raw_row.get("Train_Image_Count", 250)))

        signature_payload = json.dumps({
            "taxon": taxon_code, "temp": air_temp_c, "rh": rh_percent,
            "ppfd": ppfd, "health": health_index, "primary": primary.diagnostic_code,
        }, sort_keys=True)
        signature = hashlib.sha256(signature_payload.encode("utf-8")).hexdigest()

        return UpgradedKaggleObservation(
            original_plant_name=str(raw_row.get("Plant_Name", node.wcvp_accepted_name)),
            taxon_code=taxon_code, care_cluster_id=node.care_cluster_id,
            air_temp_c=air_temp_c, rh_percent=rh_percent,
            vpd_air_kpa=vpd.vpd_air_kpa, vpd_leaf_kpa=vpd.vpd_leaf_kpa,
            sunlight_label=sunlight_label, ppfd_umol_m2_s=ppfd, dli_mol_m2_day=dli,
            a_net_umol_m2_s=photo.a_net_umol_m2_s,
            substrate_vwc_peak=hydration.substrate_peak_vwc,
            substrate_vwc_trough=hydration.substrate_trough_vwc,
            hypoxia_rot_risk=hydration.hypoxia_rot_risk_score,
            desiccation_wilt_risk=hydration.desiccation_wilt_risk_score,
            optimal_interval_days=hydration.optimal_watering_interval_days,
            optimal_dose_ml=hydration.optimal_watering_dose_ml,
            primary_pathology_code=primary.diagnostic_code,
            physiological_mechanism=primary.physiological_mechanism,
            health_index_0_100=health_index,
            predicted_new_leaves_30d=predicted_leaves,
            plantnet_logit_offset=logit_offset,
            row_signature_sha256=signature)

    # --- 6.2 Stratified synthesizer -------------------------------------------------------
    def synthesize_stratified_corpus(self, n_records: int) -> List[UpgradedKaggleObservation]:
        """
        Generate a stratified synthetic corpus across five regimes:
        0=optimal, 1=overwatering/hypoxia, 2=high-VPD spider mites,
        3=sub-LCP shade etiolation, 4=salt toxicity + photoinhibition.
        """
        taxon_keys = sorted(self.graph.keys())
        records: List[UpgradedKaggleObservation] = []
        for idx in range(n_records):
            regime = idx % 5
            t_code = taxon_keys[(idx - 1) % len(taxon_keys)]
            node = self.graph[t_code]

            if regime == 0:
                row = {
                    "Plant_Name": node.wcvp_accepted_name,
                    "Temperature_C": self.rng.uniform(20.0, 26.0),
                    "Humidity_Pct": self.rng.uniform(50.0, 65.0),
                    "Sunlight": "medium",
                    "Soil_Moisture_VWC": node.hydraulics.field_capacity_vwc * 0.9,
                    "Watering_Dose_ml": 250.0, "Watering_Interval_days": 7,
                    "Fertilizer_EC_mS_cm": node.hydraulics.ec_target_ms_cm,
                    "Fluoride_ppm": 0.0, "Train_Image_Count": 400,
                }
            elif regime == 1:
                row = {
                    "Plant_Name": node.wcvp_accepted_name,
                    "Temperature_C": self.rng.uniform(20.0, 24.0),
                    "Humidity_Pct": self.rng.uniform(70.0, 85.0),
                    "Sunlight": "low sunlight",
                    "Soil_Moisture_VWC": node.hydraulics.porosity_fraction * 0.98,
                    "Watering_Dose_ml": 800.0, "Watering_Interval_days": 2,
                    "Fertilizer_EC_mS_cm": node.hydraulics.ec_target_ms_cm,
                    "Fluoride_ppm": 0.0, "Train_Image_Count": 150,
                }
            elif regime == 2:
                row = {
                    "Plant_Name": node.wcvp_accepted_name,
                    "Temperature_C": self.rng.uniform(28.0, 34.0),
                    "Humidity_Pct": self.rng.uniform(20.0, 35.0),
                    "Sunlight": "high",
                    "Soil_Moisture_VWC": node.hydraulics.critical_depletion_vwc,
                    "Watering_Dose_ml": 150.0, "Watering_Interval_days": 10,
                    "Fertilizer_EC_mS_cm": node.hydraulics.ec_target_ms_cm,
                    "Fluoride_ppm": 0.0, "Train_Image_Count": 220,
                }
            elif regime == 3:
                row = {
                    "Plant_Name": node.wcvp_accepted_name,
                    "Temperature_C": self.rng.uniform(18.0, 22.0),
                    "Humidity_Pct": self.rng.uniform(55.0, 70.0),
                    "Sunlight": "low",
                    "Soil_Moisture_VWC": node.hydraulics.field_capacity_vwc * 0.8,
                    "Watering_Dose_ml": 200.0, "Watering_Interval_days": 7,
                    "Fertilizer_EC_mS_cm": node.hydraulics.ec_target_ms_cm,
                    "Fluoride_ppm": 0.0, "Train_Image_Count": 90,
                }
            else:
                row = {
                    "Plant_Name": node.wcvp_accepted_name,
                    "Temperature_C": self.rng.uniform(24.0, 30.0),
                    "Humidity_Pct": self.rng.uniform(40.0, 55.0),
                    "Sunlight": "direct",
                    "Soil_Moisture_VWC": node.hydraulics.field_capacity_vwc * 0.85,
                    "Watering_Dose_ml": 300.0, "Watering_Interval_days": 7,
                    "Fertilizer_EC_mS_cm": node.hydraulics.ec_burn_threshold_ms_cm + 1.5,
                    "Fluoride_ppm": 0.0, "Train_Image_Count": 60,
                }
            records.append(self.upgrade_kaggle_observation(row, t_code))
        return records

    # --- 6.3 Export: SQLite + JSONL ---------------------------------------------------------
    def export_to_sqlite(
        self,
        records: List[UpgradedKaggleObservation],
        db_path: Union[str, pathlib.Path],
    ) -> pathlib.Path:
        """Write upgraded records to SQLite with a provenance hash over the corpus."""
        path = pathlib.Path(db_path)
        conn = sqlite3.connect(str(path))
        try:
            conn.execute("DROP TABLE IF EXISTS upgraded_observations")
            conn.execute("""
                CREATE TABLE upgraded_observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_plant_name TEXT, taxon_code TEXT, care_cluster_id TEXT,
                    air_temp_c REAL, rh_percent REAL, vpd_air_kpa REAL, vpd_leaf_kpa REAL,
                    sunlight_label TEXT, ppfd_umol_m2_s REAL, dli_mol_m2_day REAL,
                    a_net_umol_m2_s REAL, substrate_vwc_peak REAL, substrate_vwc_trough REAL,
                    hypoxia_rot_risk REAL, desiccation_wilt_risk REAL,
                    optimal_interval_days INTEGER, optimal_dose_ml REAL,
                    primary_pathology_code TEXT, physiological_mechanism TEXT,
                    health_index_0_100 REAL, predicted_new_leaves_30d REAL,
                    plantnet_logit_offset REAL, row_signature_sha256 TEXT
                )
            """)
            insert_sql = """
                INSERT INTO upgraded_observations (
                    original_plant_name, taxon_code, care_cluster_id,
                    air_temp_c, rh_percent, vpd_air_kpa, vpd_leaf_kpa,
                    sunlight_label, ppfd_umol_m2_s, dli_mol_m2_day,
                    a_net_umol_m2_s, substrate_vwc_peak, substrate_vwc_trough,
                    hypoxia_rot_risk, desiccation_wilt_risk,
                    optimal_interval_days, optimal_dose_ml,
                    primary_pathology_code, physiological_mechanism,
                    health_index_0_100, predicted_new_leaves_30d,
                    plantnet_logit_offset, row_signature_sha256)
                VALUES (
                    :original_plant_name, :taxon_code, :care_cluster_id,
                    :air_temp_c, :rh_percent, :vpd_air_kpa, :vpd_leaf_kpa,
                    :sunlight_label, :ppfd_umol_m2_s, :dli_mol_m2_day,
                    :a_net_umol_m2_s, :substrate_vwc_peak, :substrate_vwc_trough,
                    :hypoxia_rot_risk, :desiccation_wilt_risk,
                    :optimal_interval_days, :optimal_dose_ml,
                    :primary_pathology_code, :physiological_mechanism,
                    :health_index_0_100, :predicted_new_leaves_30d,
                    :plantnet_logit_offset, :row_signature_sha256)
            """
            for rec in records:
                conn.execute(insert_sql, dataclasses.asdict(rec))
            corpus_hash = hashlib.sha256(
                "".join(sorted(r.row_signature_sha256 for r in records)).encode("utf-8")
            ).hexdigest()
            conn.execute("DROP TABLE IF EXISTS corpus_provenance")
            conn.execute("""
                CREATE TABLE corpus_provenance (
                    corpus_hash_sha256 TEXT, record_count INTEGER, generated_at TEXT
                )
            """)
            conn.execute(
                "INSERT INTO corpus_provenance VALUES (?, ?, ?)",
                (corpus_hash, len(records), datetime.datetime.now(datetime.timezone.utc).isoformat()),
            )
            conn.commit()
        finally:
            conn.close()
        logger.info("Exported %d records to SQLite at %s", len(records), path)
        return path

    def export_to_jsonl(
        self,
        records: List[UpgradedKaggleObservation],
        jsonl_path: Union[str, pathlib.Path],
    ) -> pathlib.Path:
        """Write upgraded records to JSONL, one JSON object per line."""
        path = pathlib.Path(jsonl_path)
        with path.open("w", encoding="utf-8") as fh:
            for rec in records:
                fh.write(json.dumps(dataclasses.asdict(rec), sort_keys=True) + "\n")
        logger.info("Exported %d records to JSONL at %s", len(records), path)
        return path

    @staticmethod
    def load_csv_rows(csv_path: Union[str, pathlib.Path]) -> List[Dict[str, Any]]:
        """Load a raw Kaggle CSV into a list of row dictionaries."""
        with pathlib.Path(csv_path).open("r", encoding="utf-8", newline="") as fh:
            return list(csv.DictReader(fh))


# ==============================================================================
# 7. COMMAND-LINE ENTRYPOINT (SYNTHETIC CORPUS GENERATOR)
# ==============================================================================

if __name__ == "__main__":
    graph = build_master_botanical_knowledge_graph()
    engine = BiophysicalDifferentialEngine()
    builder = MuseProprietaryDatasetBuilder(graph, engine=engine)
    logger.info("Knowledge graph loaded: %d taxa", len(graph))
    records = builder.synthesize_stratified_corpus(1000)
    out_dir = pathlib.Path(__file__).resolve().parent / "muse_dataset"
    out_dir.mkdir(parents=True, exist_ok=True)
    builder.export_to_sqlite(records, out_dir / "petey_muse_dataset.sqlite")
    builder.export_to_jsonl(records, out_dir / "petey_muse_dataset.jsonl")
    logger.info("Sample Upgraded Record [0]: %s", json.dumps(dataclasses.asdict(records[0]), indent=2))
