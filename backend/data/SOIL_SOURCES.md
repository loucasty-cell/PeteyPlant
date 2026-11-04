# Soil / substrate sources for `soil_substrates.py`

Every property value in `soil_substrates.py` traces to a source below
that was actually read during the research round (30 Oct 2026).
Anything unconfirmed is flagged `UNVERIFIED` in the module, never
filled with an invented number. Where sources disagree, the module
stores a span covering the disagreement with status `conflicting`
and names the individual ranges in its notes — it never silently
picks one.

Source tiers used in the module's `source_tier` fields:
- `extension` — university/cooperative extension page, fully opened.
- `extension-snippet` — extension page known only from a search excerpt.
- `practitioner-guide` — care guide page, fully opened.
- `practitioner-snippet` — care guide known only from a search excerpt.
- `product-sheet-snippet` — manufacturer/product page, excerpt only.
- `unverified` — no source (used only for explicitly flagged gaps).

## 1. Substrate components

- https://www.purdue.edu/hla/sites/cea/wp-content/uploads/sites/15/2026/07/Hydroponics-Course.pdf — peat: N 0.5–1.5%, high WHC + good aeration, pH 3.0–4.0, good CEC / poor AEC.
- https://www.plantanswers.com/garden_column/102001_slides/1020.htm — peat: moss-peat pH 3.6–4.2, high moisture-holding, low N 0.6–1.4%.
- https://ashlandorgardenclub.org/tag/soil-ph/ — peat pH 3.3–4.0, 10–20× water; coir pH 5.2–6.6, 8–9× water.
- https://cce.cornell.edu/orleans/peat-moss-and-sustainability — Cornell Extension: peat bogs ~10,000 years old, slow regrowth, carbon release (opened).
- https://www.hydroexperts.com.au/buying/resource-library/how-to-use-coco-coir-as-a-concept/ — coir: up to 9× water, pH 5.7–6.5, high CEC, minimal compaction, untreated Na/K + Ca/Mg binding, washing/buffering (opened).
- https://ezgrogarden.com/growing-mediums/coco-coir/ — coir: 5× water, pH 6.0–6.7 (product guide, use with care).
- http://deepgreenpermaculture.com/2020/10/06/how-to-improve-drainage-in-plant-pots-the-proper-way-to-do-it/ — perlite: pH 7.0–7.5, no buffering, no nutrients, almost no CEC, closed-cell low WHC, will not compact, floats, dust, fluoride risk; vermiculite: very high WHC, CEC 2–2.5 meq/100 cc, K/Mg/Ca, US pH 6.3–7.8 / Africa ~9, easily compressible, Libby asbestos history (opened).
- https://albopepper.com/potting-mix.php — composted pine bark: drainage/aeration, pH often 5.0–6.5, high lignin slow breakdown vs cellulose N depletion.
- https://shrubz.us/diy-the-perfect-potting-mix-for-indoor-plants/ — pine bark: slightly acidic 4.5–5.5, moderate retention (fines); composted bark fines pH 4.0–5.0.
- https://www.eliteorchids.com/product/besgrow-spagmoss-classic-100g-new-zealand-sphagnum-moss-sphagnum-cristatum/ — sphagnum: 20× water, WHC 96%, pH 4.8, EC 0.2 mS/cm, air-filled porosity ~55% loose, low salts.
- https://www.sybotanica.com/collections/live-moss/products/sphagnum-moss-5-liter?variant=42951965999343 — sphagnum: ~2000% retention, pH 6.1, EC 0.046 mS/cm, structural stability 2–3 years.
- https://homegrail.com/what-is-horticultural-sand/ — coarse sand: drainage/air gaps, silica virtually chemically inert.
- https://plantin.alibaba.com/buyingguides/planter-pot-sand — sand: grain 0.5–2 mm, inert, pH-neutral ~7.0, ≤30–40% of blend (commercial guide, lower authority).
- https://www.natureswayresources.com/wp-content/uploads/2024/01/43Pumice.pdf — pumice: volcanic glass, excellent drainage, neutral pH, will not break down, 10–50% blend range.
- https://gardening.alibaba.com/plant-care/pumice-for-plants — pumice: pH-neutral 6.5–7.5, inert, stays mixed vs perlite floating (commercial guide, qualitative only).
- https://www.housedigest.com/1985337/active-charcoal-keeps-houseplants-strong-healthy/ — charcoal: alkaline pH 6.5–8.4, absorbs nutrients, drainage/water absorption, avoid for acid-lovers.
- https://gardening.alibaba.com/plant-care/charcoal-for-plants — charcoal: drainage, toxin absorption, no nutrients, 20% typical mix, >25% reduces retention (commercial guide, thresholds indicative only).
- https://www.almanac.com/what-world-are-worm-castings — castings: NPK 1.5–2–1, 2–3× water, pH 6.5–7.0, ≤20% in containers, slow-release nutrients.
- https://hydrobuilder.com/collections/garden-soil-amendments?dir=desc&order=position — castings: NPK typically 1-0-0 to 2-1-1, 5–15% use, >15–20% reduces drainage/compaction.
- https://p2infohouse.org/ref/05/04068.pdf — Alabama Cooperative Extension / Auburn: compost = peat-like water-holding + slow nutrients, absorbs 2× weight, but high pH, excess salts, poor drainage if too wet, oxygen depletion if uncured.
- https://growershouse.co.uk/products/clay-pebbles — LECA: pH neutral 6.0–7.0, inert, no nutrients, porosity ~85%, low WHC, reusable 5–10+ years, soak 24–48 h.
- https://hydrobuilder.com/collections/clay-pebbles-growstones?price=1000-1100 — LECA: pH neutral 6.0–7.0, alkaline dust on fresh pebbles raises pH — rinse + soak pH 5.5–6.0.
- https://cropking.com/products/leca-stone-45-liters — LECA: inert, pH-neutral, porous core absorbs/releases moisture, excellent drainage/aeration.

## 2. Ready mixes

- https://hgic.clemson.edu/factsheet/indoor-plants-soil-mixes/ — Clemson Extension (opened). Foliage ratios, Cornell Foliage + Epiphytic mixes + plant lists, Clemson Plant Mix 2 bark : 1 peat : 1 sand + pH ~6.0, garden-soil warning.
- https://extension2.missouri.edu/sites/default/files/legacy_media/wysiwyg/Extensiondata/Pub/pdf/agguides/hort/g06510.pdf — Missouri Extension G6510 (search excerpt only). General 3 peat : 1 vermiculite : 1 perlite; orchid-bark and cactus peat-lite + sand exceptions.
- https://yardandgarden.extension.iastate.edu/how-to/growing-succulents-indoors — Iowa State Extension (opened). Succulent 1 organic : 2 mineral, sharp-draining requirement, typical potting soil root-rot risk, no-frequent-repot note.
- https://www.aos.org/repotting — American Orchid Society (opened). Bark mixes vary in ratio/coarseness; repot yearly or every other year as medium decays; coarse vs fine grade guidance.
- https://news.oregonstate.edu/news/set-seeds-right-path-homemade-planting-medium — Oregon State Extension (opened). Seed mix ⅓ : ⅓ : ⅓, required properties, pasteurisation 180 °F / 30 min.
- https://site.extension.uga.edu/fultonag/2025/02/cut-veggie-garden-costs-by-making-your-own-seed-starting-mix/ — UGA Extension (opened). Seed mix 1:1:1 peat/coir : vermiculite : perlite, fine perlite, low fertility, do-not-compress.
- https://extension.psu.edu/potting-media-and-plant-propagation — Penn State Extension (search excerpt only). Seed Mix Standard Soilless 50–75% peat : 25–50% vermiculite; 1:1:1 compost : vermiculite : peat.
- https://www.centraltexasgardener.org/resource/potting-mix-for-cactus-plants-sedums-and-other-succulents/ — Central Texas Gardener (opened). Multi-mineral succulent container recipe.
- https://gardeningelsa.com/best-soil-for-indoor-plants/ — GardeningElsa (opened). All-purpose 3:1 + 20–30% perlite, aroid 1:1:1, cactus 1:1, fern/calathea 2:1:1 + compost, orchid bark-no-soil, cactus-mix exclusion for ferns/calathes/peace lilies, repot 1–2 years.
- https://greg.app/plant-care/soil/african-violet/ — Greg (opened). African violet 50% peat : 30% perlite : 20% potting soil, pH ideal 6.0–6.5 / tolerable 5.8–7.0, refresh 12–18 months, standard soil too dense.
- https://theindoorgardener.ca/?p=104 — The Indoor Gardener (opened). African violet 1-1-1 peat : vermiculite : perlite, mix pH 6.4–6.9, lime/charcoal pH ~6.8.
- https://cafeplanta.com/blogs/resources/fern-soil-mix-recipe — Cafe Planta (opened). Fern recipe 2 peat/coir : 1 perlite/pumice : 1 bark : ½ charcoal : ½ compost, annual check/refresh note.
- https://bhgs.ogles2.co.uk/files/MELORC000002/MELORC000002-Melcourt_OrchidBark_Medium.pdf — Melcourt product sheet (snippet only). Orchid bark 5:1:2 bark : charcoal : perlite, bark pH 5.0–5.5, lime 2.5 kg/m³.
- http://www.theorchidcolumn.com/search/label/Potting%20Orchids — Orchid Column (snippet only). Basic orchid 1:1:1 bark : charcoal : perlite, ~2-year bark life.
- https://flowerpursuits.com/what-is-a-good-orchid-mix/ — FlowerPursuits (snippet only, truncated). Orchid pH 5.5–6.5 claim — weak, NOT encoded without a full-page check.
- https://planthouseandgarden.com/aroid-potting-mix-recipe/ , https://www.plantvault.com/blogs/houseplant-care-guides/aroid-potting-mix-recipes , https://www.elmdirt.com/blogs/news/best-aroid-soil-mix , https://housefolia.com/5-diy-chunky-soil-mix-recipes-for-aroids/ , https://gluttonlv.com/chunky-aroid-mix-recipe/ , https://www.worldofpro.net/2026/05/best-soil-for-houseplants.html — practitioner aroid variants (snippets only).
- https://creativehomemaking.com/gardening/houseplants/african-violet-potting-mix/ , https://www.idyl.co.in/blogs/blog/the-perfect-potting-mix-for-thriving-african-violets , https://www.growflowersnow.com/can-i-use-succulent-potting-soil-mix-for-african-violets/ — African violet variants + pH claims (snippets only).
- https://ask.extension.org/kb/faq.php?id=679076 — Ask Extension (snippet only). General soil renewal every 1–2 years.
- https://www.hgtv.com/gardening/gardening-tips/make-your-own-potting-soil — HGTV (snippet only). Succulent 5 perlite/pumice : 4 potting soil (truncated).

## 3. Species → substrate preferences

- https://extension.psu.edu/monstera-as-a-houseplant — Penn State Extension: deliciosa well-draining soilless mix, pH 6.0–8.0, top 1–2 in. dry, overwatering → root rot; Thai Constellation as deliciosa variety.
- https://www.beangrowing.com/what-soil-should-you-use-for-a-monstera/ — Bean Growing: deliciosa chunky/fast-draining, pH 5.5–6.8, Thai chunkier (~35% bark / 25% perlite).
- https://plantcarebasics.com/best-soil-for-pothos/ — PlantCareBasics: pothos 1:1:1 coir/bark/perlite, pH 6.0–6.5.
- https://plants.sorumatik.co/t/care-of-pothos-plant/40991 — Sorumatik: pothos 50/30/20 soil/perlite/bark, pH 6.0–7.0, drainage → rot prevention.
- https://plantcaretoday.com/snake-plant-soil.html — PlantCareToday: snake plant Penn State cactus/perlite mix, NC State dry-between-waterings, Missouri Botanical Garden overwatering → rot.
- https://noahgardencentre.com.sg/plants/snake-plant/ — Noah Garden Centre: fast-draining cactus/gritty mix, dry deeply before watering.
- https://florgeous.com/snake-plant/ — Florgeous: snake plant well-drained, slightly acidic to neutral (qualitative only).
- https://plantcaretoday.com/dracaena-compacta.html — PlantCareToday: GENUS-level Dracaena fluoride sensitivity, avoid high-perlite, pH 6.0–6.5 to limit fluoride injury (Clemson Extension as quoted). NOT species-confirmed for D. trifasciata.
- https://www.thespruce.com/spider-plants-chlorophytum-definition-1902773 — The Spruce (read in full): spider loamy well-drained, fairly neutral pH, lightly moist not soggy, chlorine/fluoride + salt tip burn.
- https://plantcaretoday.com/spider-plant-care.html — PlantCareToday: spider general-purpose well-drained soil, pH 6.0–8.0, avoid fluoride/boron in mixes, fluoride-free fertiliser.
- https://plantin.alibaba.com/plant-wiki/what-soil-to-use-for-aloe-vera — PlantIn: aloe gritty cactus mix, pH 6.0–7.0, standard soil → rot.
- https://Shuncy.com/article/what-soil-do-aloe-plants-need — Shuncy: aloe ~50% inorganic gritty mix, pH 6.0–7.0.
- https://shuncy.com/article/areca-palm-soil — Shuncy: areca peat/bark/perlite, pH 5.5–7.0, moisture-retentive without saturation.
- https://florgeous.com/areca-palm-care/ — Florgeous: areca well-drained loam, pH 5.5–6.5.
- https://www.rhs.org.uk/Plants/357223/Goeppertia-makoyana/Details — RHS: makoyana moist but well-drained, pH acid/alkaline/neutral (broad, no numeric band).
- https://kamer-tuintje.be/Goeppertia%20makoyana/index.php?lang=en — Kamer-tuintje: makoyana peat-based moisture-retentive + perlite, pH 6.0–6.5.
- https://monsteraholic.com/calathea-makoyana/ — Monsteraholic: makoyana peat/perlite/soil, pH 6.0–6.5, fluoride sensitivity → brown tips.
- https://plantin.alibaba.com/plant-wiki/what-kind-of-soil-for-fiddle-leaf-fig — PlantIn: lyrata peat/perlite/pine bark, pH 6.0–7.0.
- https://plantcarebasics.com/what-potting-mix-does-a-fiddle-leaf-fig-need-indoors/ — PlantCareBasics: lyrata peat/perlite/bark, pH 5.5–7.0 near 6.0, top 2 in. dry, cactus mix alone unsuitable.
- https://www.foliagefoundry.com/plants/fiddle-leaf-fig/ — FoliageFoundry: lyrata 2:1:1 soil/perlite/bark, pH 6.0–7.0, aerated + some moisture.
- https://www.soiled.in/products/monstera-thai-constellation?variant=49134851522881 — Soiled: Thai chunky aroid 40/25/20/15, pH 5.5–7.0, top 5 cm dry, more rot-prone than standard.
- https://greg.app/thai-constellation-soil/ — Greg: Thai chunky aroid, pH 5.5–6.5.
- https://fullygrows.com/whats-the-best-soil-for-zz-plants-soil-mix-tips-for-healthy-growth/ — FullyGrows: ZZ 2:1 cactus mix/perlite, ~half inorganic, rhizome rot from soggy soil.
- https://gardeningelsa.com/best-potting-soil-for-zz-plant/ — GardeningElsa: ZZ cactus mix or 1:1 soil/perlite, fast drainage, dry before watering.
- https://gardening.alibaba.com/plant-care/spathiphyllum-soil — Gardening.Al: peace lily 60% peat/coir / 20% perlite / 20% compost, pH 5.5–6.5, moisture + drainage.
- https://kamer-tuintje.be/Secure/plant.php?folder=Spathiphyllum_floribundum&lang=en — Kamer-tuintje: peace lily rich moisture-retentive + peat/perlite, pH 5.8–6.5, drainage → rot risk.
- https://completegardening.com/your-peace-lily-leaves-turn-brown-because-one-hidden-problem-keeps-building-up-0f998186/ — CompleteGardening: peace lily UF/IFAS salt-sensitive + fluoride-sensitive, brown tips.
- https://www.whiteflowerfarm.com/blogs/growing-guides/peace-lily-care — White Flower Farm: peace lily continually moist not soggy, high-salt/fluoride tap water → brown tips.
- https://Shuncy.com/article/what-kind-of-soil-is-good-for-rubber-plants — Shuncy: elastica peat/perlite/bark ~equal, pH 5.5–7.0.
- https://www.epicgardening.com/rubber-plant/ — Epic Gardening: elastica well-draining potting mix, peat/pine bark/perlite, pH 5–7.
- https://patuxentnursery.com/product/monstera-adansonii/ — Patuxent Nursery: adansonii chunky aroid (bark/perlite/peat-coir), moist but well-drained.
- https://foliagefriend.com/what-kind-of-soil-does-monstera-adansonii-need/ — FoliageFriend: adansonii pH 5.5–7.0 (5.5–6.5 ideal), organic-rich moist well-drained.
- https://www.soiled.in/products/bird-of-paradise-white-strelitzia-nicolai — Soiled: nicolai 40/30/20/10 soil/bark/perlite/compost, pH 5.5–7.5, drainage priority.
- https://gardening.alibaba.com/plant-care/white-bird-of-paradise-plant — Gardening.Al: nicolai potting/perlite/bark, pH 6.0–7.0, well-draining + moisture-retentive.
- https://lifetips.alibaba.com/plant-care/best-soil-for-bird-of-paradise-indoor — LifeTips: nicolai/reginae 40/30/20/10 soil/perlite/bark/castings, pH 5.8–6.5, nicolai salt-buildup note (single-source, low confidence).
- https://soltech.com/collections/plant-guide/products/bird-of-paradise-care — Soltech: Strelitzia peat/perlite/sand, pH 6.0–7.5, moist not soggy, rot if wet.
- https://houseplant101.com/plants/philodendron-brasil/ — Houseplant101: hederaceum chunky aroid (bark/perlite/soil).
- https://www.thespruce.com/philodendron-micans-care-5201173 — The Spruce: hederaceum var. peat-based airy moist well-draining, soil pH "Acidic" (no numbers).
- https://gardenerspath.com/plants/houseplants/grow-philodendron-brasil/ — GardenersPath: hederaceum slightly acidic–neutral, water-retentive but airy well-draining, wrung-sponge moisture.
- https://kamer-tuintje.be/Syngonium%20podophyllum%20Schott/index.php?lang=en — Kamer-tuintje: Syngonium well-draining organic-rich + perlite/sand, pH 6.0–7.0, drainage → rot. (Researched but NOT a seed species — excluded from the module's mappings.)
- https://leafyplace.com/syngonium-arrowhead-plant/ — LeafyPlace: Syngonium pH 5.5–6.5, soil/perlite/peat, worst = soggy soil. (Same exclusion note.)
- https://houseplant101.com/plants/calathea-orbifolia/ — Houseplant101: orbifolia 2:1 peat-coir/perlite + bark, consistently moist not soggy, fluoride/chlorine/salt sensitivity.
- https://www.calatheaessentials.com/calathea-orbifolia.html — CalatheaEssentials: orbifolia well-draining moisture-retentive, pH 6.0–7.0, tap-water fluoride/chlorine → brown tips.
- https://gardenbiology.com/calathea-orbifolia/ — GardenBiology: orbifolia well-draining pH 6.5, damp not drenched, root-rot susceptibility, distilled/rainwater (fluorine/chlorine aversion).

### Text-only sources (NOT linked — live check found the destination unavailable)

These claims are recorded with their text content only. The module
does not link them, and any claim resting solely on one of them is
treated as lower weight in the notes.

- Greg, *Best Soil for Areca Palm* — areca 50/25/20/5 soil/perlite/sand/charcoal, pH 6.0–7.0, never standing water.
- Greg, *Best Soil for ZZ Plant* — ZZ gritty succulent-like mix, pH 6.0–7.0, dry between waterings.
- Greg, *Best Soil for Rubber Plant* — elastica 60/25/15 soil/perlite/bark, pH 6.0–6.5, cactus mix too lean/dry.
- Greg, *How to Repot a Swiss Cheese Vine* — adansonii 2:1:1 soil/bark/perlite, skip moisture-control/dense peat mixes.

## Preserved disagreements (never collapsed)

1. Peat pH: 3.0–4.0 vs 3.6–4.2 vs 3.0–4.5 (sphagnum) vs 3–7 (all moss peats).
2. Coir pH: 5.7–6.5 vs 5.2–6.6 vs "neutral" (rejected as standalone).
3. Coir WHC: 5× vs 8–9× vs 9×.
4. Perlite pH: 7.0–7.5 vs 6.6–7.5.
5. Vermiculite pH: 6.3–7.8 (US) vs ~9.0 (African) vs simplified 7.0–7.5.
6. Pine bark pH: 5.0–6.5 vs 4.5–5.5 vs 4.0–5.0.
7. Sphagnum pH: 4.8 (Besgrow) vs 6.1 (Sybotanica).
8. Charcoal pH: 6.5–8.4 (alkaline) vs "neutral".
9. Worm-casting NPK: 1.5–2–1 vs 1-0-0–2-1-1 vs 1-0-0–5-5-3.
10. Vermiculite CEC units: 2–2.5 meq/100 cc vs 100–150 meq/100 g (different bases, not comparable).
11. Monstera deliciosa pH: 6.0–8.0 (Penn State Extension) vs 5.5–6.8 (Bean Growing) vs 5.5–7.0 (aroid guides).
12. African violet mix pH: 6.0–6.5 (Greg) vs 6.4–6.9 (Indoor Gardener) vs 5.5–6.2 / 5.8–6.5 (snippets).
13. African violet refresh: 12–18 months (Greg, opened) vs 6 months (snippet).
14. Cactus mineral share: Iowa State 1:2 organic:mineral (opened) vs GardeningElsa 1:1 (opened) vs Central Texas multi-mineral (opened).
15. Aroid ratio: 1:1:1 (opened) vs 2:1:1 / soil-free ⅓:⅓:⅓ / bark-heavy % recipes (snippets). No extension source found for aroid mix.
16. Orchid ratio: no consensus; AOS explicitly says ratios vary.
17. Areca palm moisture: "never fully dry out" vs "allow soil to completely dry" (Soltech) — majority position (top dry) stored, conflict flagged.
18. Strelitzia nicolai pH: 5.5–7.5 vs 6.0–7.0 vs 6.0–7.5 vs 5.8–6.5 vs 5.5–6.5.
19. Goeppertia orbifolia pH: ~6.5 vs 6.0–7.0 vs 5.5–6.5 vs 5.5–7.5 (AI-assisted source, low weight).

## UNVERIFIED — do not encode numbers for these

- Numeric CEC for peat, coir, bark, sphagnum, sand, pumice, charcoal, castings, compost, LECA (only perlite ~0 and vermiculite 2–2.5 meq/100 cc have a sourced figure).
- Numeric WHC (× weight) for vermiculite, coarse sand, pumice, charcoal, LECA.
- Numeric pH range for compost (only "tends high/alkaline" is sourced).
- NPK for peat beyond N% (0.5–1.5%), bark, sphagnum, sand, pumice, charcoal, compost, LECA.
- Charcoal toxin-release timeline (12–24 months, single source).
- Pumice 12–18% volume-retention / >95%-in-90-seconds figures (single low-quality source, excluded).
- Perlite "3–4× its weight" WHC (commercial guide, not corroborated by DeepGreen — excluded).
- Cactus/succulent, aroid/chunky, seed-starting, and fern mix target pH (no opened source); all-purpose universal pH (only Clemson's ~6.0 for its specific mix is opened-verified).
- Fixed replacement intervals for cactus, aroid, fern, and seed mixes.
- Numeric pH for Dracaena trifasciata; species-specific fluoride sensitivity for D. trifasciata (genus-level only).
- Fluoride/salt sensitivity for Monstera deliciosa, Epipremnum aureum, Aloe vera, Dypsis lutescens, Ficus lyrata, Zamioculcas zamiifolia, Ficus elastica, Monstera adansonii, Philodendron hederaceum — no source stated it; do not copy it from spider/peace-lily/calathea.
- Salt sensitivity for Strelitzia nicolai (single indoor-guide claim only).
- Any substrate preference for species not in the module's mapping list (including Alocasia 'Silver Dragon'/'Jacklyn', Philodendron 'Birkin', string of hearts, lucky bamboo in soil) — not researched; do not infer from relatives.

## Coverage honesty

- Components: 12. Mixes: 7 with 27 published recipe variants.
- Species mappings: 16 of 79 seed species (20.3%). 14 map to a mix id;
  2 (Dypsis lutescens, Strelitzia nicolai) carry a researched blend
  description with no forced mix id.
- Species pH ranges filled: 15 of 16 (Dracaena trifasciata: none found).
- Fluoride sensitivity confirmed: 4 species (Chlorophytum comosum,
  Goeppertia makoyana, Spathiphyllum wallisii, Goeppertia orbifolia).
  Salt sensitivity confirmed: the same 4.
- Researched but NOT mapped (not seed species): Syngonium podophyllum.
- Source quality note: strongest sources are extension pages (Penn
  State, Iowa State, Clemson, UGA, Oregon State, Missouri, AOS, RHS)
  and The Spruce citing extension; most species pH/mix numbers come
  from commercial care guides that agree with each other but are not
  extension publications. Convergent ranges in the module are
  agreement across guides, not single authoritative values.
