# Blender botanical detail plan

Petey's 58 characters keep their expressive pots. The plant above each pot should read as the named indoor specimen with the face and label hidden. The live stage, a 116 px roster portrait, and a Blender close-up need different levels of detail. Build for the first two and use the close-up to catch weak construction, poor material separation and disconnected parts.

## Reference pass

For each species record the Garden ID, accepted name and any depicted cultivar or juvenile form. Collect an indoor whole-plant image, an upper and lower leaf view, and a stem or crown close-up. Add a root image only when exposed roots or rhizomes are part of the intended presentation. Record the source URL, photographer, rights, accession or observation ID if supplied, and what the image actually shows. Keep two independent references for the distinguishing traits where practical. Mark uncertain traits for review. Use images for observation. Reuse photo pixels only when rights permit and attribution can ship with the asset.

Start from these documented examples. The roster matrix below is an art brief derived from current model specs and proposed improvements. Rows still need their own reference packets and art review.

- Swiss Cheese Vine needs climbing nodes, aerial roots and enclosed leaf holes. The nearby Mini Monstera brief uses margin splits. Compare the outlines before copying a foliage builder. [NC State Extension, Monstera adansonii](https://plants.ces.ncsu.edu/plants/monstera-adansonii/)
- Large Monstera needs both interior openings and outer splits on selected mature leaves. Leave room for a juvenile leaf with fewer openings. [NC State Extension, Monstera deliciosa](https://plants.ces.ncsu.edu/plants/monstera-deliciosa/)
- Begonia's silver markings sit on a green face with a reddish underside. Use a separate pigment mask where leaf geometry already supplies the relief. [NC State Extension, cane begonias](https://plants.ces.ncsu.edu/plants/begonia-cane-types/common-name/polka-dot-begonia/)
- Maidenhair's dark stalks and lobed segments, Rabbit's Foot Fern's visible rhizomes, and an orchid's aerial roots call for three distinct treatments at the soil line. [RHS, Maidenhair Fern](https://www.rhs.org.uk/plants/20650/adiantum-raddianum/details) · [NC State Extension, Rabbit's Foot Fern](https://plants.ces.ncsu.edu/plants/davallia-fejeensis/common-name/rabbits-foot-fern/) · [UC Botanical Garden, epiphytes](https://botanicalgarden.berkeley.edu/learn/garden-stories/natures-savings-and-loan-how-epiphytes-survive-without-soil/)
- Make Thanksgiving Cactus pads and Bunny Ears areoles from their own references. They're stem structures with different arrangements. [NC State Extension, Schlumbergera truncata](https://plants.ces.ncsu.edu/plants/schlumbergera-truncata/) · [NC State Extension, Opuntia microdasys](https://plants.ces.ncsu.edu/plants/opuntia-microdasys/)

## What to model, paint and bake

| Approach | Where it works | Trade-off |
| --- | --- | --- |
| Geometry for every detail | Silhouette, holes, thick leaf edges, visible joints, stems, roots, spines and flowers | Expensive for fine surface relief and repeated clusters |
| Texture for every detail | Color variation, spots, bands and fine surface grain | Silhouettes, seams and branch connections stay visibly flat in orbit |
| Geometry plus baked surfaces | Reserve geometry for outline and joins, then bake lower-relief details onto an animated mesh | Requires matched UVs, normals and a browser comparison. Recommended for Petey |

1. Block the growth habit at stage scale. Mark attachment points from stem to petiole to blade and from crown or trunk into the soil. Use shared spline coordinates for mating parts and start each root or rhizome from a plausible anatomical origin. Check contact in a side view and through the existing Idle and reaction clips. Keep underground roots in an optional Blender reference collection when useful for art. Show exposed roots only where the reference or growing setup supports them.
2. Build leaf side profiles before painting. Set leaf thickness, taper, base, tip, margin, curl and vein direction. Give upper and lower faces distinct editable surfaces where their color, grain or gloss differs. Modulate color with leaf position, age and reference patterns. Keep damage and care status out of the healthy texture set. If Petey later depicts stress, tie it to an explicit observation or simulated state and keep it separate from leaf identity.
3. Use Blender's material layers for base pigment, midrib and secondary veins, fine bump, and cuticle or farina roughness. Build alignment masks along the blade axis and use local coordinates so the detail follows animation. Give ceramic separate glaze, rough lip and unglazed foot. Add restrained substrate chips near the soil surface with stable placement. Avoid applying a default gloss or noise scale across families. Research on leaf reflectance supports judging surface structure and gloss separately from pigment. [Peters and Noble, Plant Methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC10024457/)
4. Keep vertex colors for broad low-cost bands and use UV-mapped base color, tangent-space normal and roughness only where close shots justify them. Start with 512 px maps and try 1024 px on hero leaves if a side-by-side capture shows a benefit. Export base color as sRGB and normal, roughness and occlusion as linear data. Use glTF's OpenGL tangent normals and packed occlusion, roughness and metalness channels where the material needs them. Use consistent triangulation on the baked mesh and compare the same camera angle in Blender and Three.js. [Blender glTF exporter](https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html) · [Khronos glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
5. Save the editable `.blend` in its current species folder with authored materials, reference notes and packed textures. Export a candidate GLB and preview outside the shipping directory. Review front, three-quarter, side, back and macro crops under neutral light, then inspect the actual app lighting. Compare size and primitives against the current export. Update the model index, spec and runtime registry together when the candidate passes.

## Roster matrix

Each row is keyed by the editable asset ID. Where the column names a root or branch to investigate, promote it to a modeled detail after the reference packet supports it. For contained pots the default is a grounded crown at the soil line.

### Aroids and foliage vines

| Asset | Leaf form and finish | Stem, root or branch check |
| --- | --- | --- |
| `monstera` | Unequal cuts and enclosed holes by age, curved secondary veins, satin mature blades | Petiole sheath and elbow, root at climbing node, crown enters soil |
| `swiss-cheese-vine` | Narrow irregular fenestrations, midrib and swept secondary veins | Thin segmented climbing stem with separate aerial-root origins |
| `mini-monstera` | Multiple splits open to the margin, alternating mature and juvenile silhouettes | Split leaves alternate along a climbing stem with real nodes |
| `silver-monstera` | Juvenile narrow leaf with silvery field interrupted by dark reticulation | Attach petioles and root initials at climbing nodes |
| `split-leaf-philodendron` | Deep lobes with different lengths and a glossy upper face | Group long petioles on a compact self-heading base |
| `heartleaf-philodendron` | Satin hearts, unequal outline and soft new growth | Node bends, younger leaf sheaths, restrained aerial roots |
| `pothos` | Variegation changes from leaf to leaf with irregular gold sectors | Nodes and petiole collars on trailing stems, discreet aerial roots |
| `satin-pothos` | Matte dark hearts with irregular silvery patches | Thin trailing internodes, alternate petioles and a few node roots |
| `arrowhead-plant` | Juvenile sagittate blades, open basal lobes and soft central contrast | Different heights on connected petioles |
| `green-velvet-alocasia` | Velvet upper face with pale veins and deep arrow-shaped lobes | Upright petioles from a common basal cluster |
| `dieffenbachia` | Broad leaf with asymmetrical cream center and green edge | Cane rings and attached leaf bases |
| `chinese-evergreen` | Lanceolate silver pattern with a darker border | Clustered lower stems and alternating leaf groups |
| `peace-lily` | Dark ruffled blades, glossy ribs, creamy spathe and distinct spadix | Leaves gather at soil line, flower stalks originate separately |
| `flamingo-flower` | Glossy foliage and colored spathe with fine spadix relief | Leaf and spathe stems connect to crown, source any exposed roots |

### Prayer plants, ferns and palms

| Asset | Leaf form and finish | Stem, root or branch check |
| --- | --- | --- |
| `peacock-plant` | Paired feather markings and purplish reverse, fine blade relief | Petiole hinge and readable stem-to-crown joints |
| `orbifolia` | Rounded leaves with broad silver bands and soft margins | Petiole sweep, narrow attachment and foreshortened young leaves |
| `rattlesnake-plant` | Serration-free waves with paired spots and purple backs | Slim petioles anchor at the base |
| `maranta` | Reference the red-veined form, keep herringbone pigments aligned | Low spreading stems and visible petiole bases |
| `fishbone-prayer-plant` | Fishbone bars taper toward the edges, muted purple reverse | Upright to outward petiole angles vary |
| `stromanthe` | Dark upper face and burgundy reverse on tapered blades | Reddish stems enter the lower cluster |
| `maidenhair-fern` | Small lobed fans with delicately spreading veins | Dark wiry rachises divide into attached branchlets |
| `boston-fern` | Repeated tapering pinnae with natural spacing and mild green variance | Arching continuous frond axes, crown surrounds origins |
| `birds-nest-fern` | Ruffled single straps and a dark central rib | Funnel points to a dense central crown |
| `rabbits-foot-fern` | Fine divided fronds with quieter diffuse texture | Scaled creeping rhizomes rest on soil or the pot rim and carry frond origins |
| `areca-palm` | Feathered pinnae in changing lengths and subtle finish | Calibrate cane joints and basal clustering before adding surface details |
| `parlor-palm` | Fine pinnate foliage with modest variation | Verify which stems belong to separate seedlings in the pot |
| `kentia-palm` | Broad descending pinnae with lightly folded sections | Single trunk habit in the reference, concentric scars where visible |
| `lady-palm` | Split fan segments with irregular tips and ribbing | Cane bases and visible fibrous sheath texture |

### Woody, cane, upright and trailing plants

| Asset | Leaf form and finish | Stem, root or branch check |
| --- | --- | --- |
| `ficus` | Fiddle outline, strong central vein, quieter secondary network | Taper and overlap side branches at trunk anchors through animation |
| `rubber-plant` | Leathery oval leaves, underside contrast, new-leaf sheath | One leader with credible alternating junctions and leaf scars |
| `weeping-fig` | Small pointed glossy leaves, varied orientation | Graded branch order, bends and tips carry leaves rather than float |
| `dwarf-umbrella-tree` | Distinct leaflet paddles of uneven length | Leaflets attach to a common radial point on a real petiole |
| `money-tree` | Narrow palmate leaflets with individual taper | Draw the braided stems as a nursery training form with separate trunks |
| `white-bird-of-paradise` | Bananalike blades with selected age splits and midrib | Two-ranked overlapping petiole bases, stable basal fan |
| `dragon-tree` | Fine red-edged linear leaves with muted center-to-edge color | Cane scars, terminal tufts and tapered branch connections |
| `ponytail-palm` | Thin turning ribbons with longitudinal sheen | Swollen base merges into a narrower trunk with a rooted soil contact |
| `zz-plant` | Thick satin paired leaflets and terminal leaflets | Leaflets attach to arching rachises, keep rhizomes below soil |
| `snake-plant` | Stiff swords, interrupted bands and cultivar-specific yellow margins | Base forms a continuous rosette with strong upright posture |
| `cylindrical-snake` | Radial spears with longitudinal grooves and quieter bands | Base fan spacing and staggered lengths before polish |
| `whale-fin` | Asymmetric broad blades with mottling and curved cross-section | Ground each blade at the clump rather than floating in soil |
| `baby-rubber-plant` | Fleshy rounded leaves and a reflectance break at the edges | Dense stem nodes with short petioles |
| `chinese-money-plant` | Coin leaves, peltate junction with radial veins | Petioles meet the underside at the peltate attachment |
| `spider-plant` | Thickened cream-center ribbons with curved tips | Ground parent crown and attach daughter rosettes to runners |
| `silver-inch-plant` | Striped upper face and plum reverse | Trailing joints and overlap at wrapped leaf bases |
| `string-of-hearts` | Fine silver mottling on opposed hearts and purple reverse | Show opposite leaf pairs at real nodes, source any tuber depiction |
| `string-of-pearls` | Succulent beads with faint translucent stripes | Beads attach to thin stems at deliberate intervals |
| `wax-plant` | Waxy paired blades, star-shaped inflorescence with different center sheen | Attach blossom peduncles and paired leaf petioles to the vine |

### Succulents, cacti and flowering plants

| Asset | Leaf or flower form and finish | Stem, root or branch check |
| --- | --- | --- |
| `aloe` | Thick tapering spear cross sections, serrated silhouettes and waxy finish | Layer leaf bases into a common rosette |
| `echeveria` | Spoon rosette with blue-white powder finish, tighter young center | Place leaf bases on successive ranks with no gaps into the crown |
| `jade-plant` | Small thick opposite leaves, matte-to-satin surface and subdued margins | Forked woody branches with tapered new green growth |
| `zebra-haworthia` | Pale bumps on outer faces, plain inner face under the brief's species identity | Deep rosette overlap and tighter inner rosette |
| `golden-barrel` | Rib geometry, tinted valleys and individual radial spine silhouettes | Spines emerge from areoles on the ribs rather than from the green body at random |
| `bunny-ears` | Flattened pads with spaced raised areoles, bake fine glochid relief | Make offsets emerge with narrow pad joints |
| `thanksgiving-cactus` | Jointed toothed pads and recurved flowers | Real pad joints and blooms at the tips |
| `moth-orchid` | Leathery broad leaves, asymmetric flower lip and shaded inner throat | Smooth grey-green aerial roots, arching flower spike separate from leaf fan |
| `african-violet` | Rounded velvet leaves with soft marginal relief and five-lobed blooms | Shallow crown with short leaf stems and separate flower stems |
| `flaming-katy` | Succulent wavy leaves, flower clusters with four-lobed shapes | Leaf and flower stalk joints visible without crowding the crown |
| `polka-dot-begonia` | Asymmetric wings, silver spots on the adaxial surface and claret reverse | Attach six petioles at cane nodes, vary cane bends and add leaf-scar cues |

## Rollout and completion evidence

- Start with eight reference-calibrated benchmarks across the first three revised assets and five harder material or structure cases. Use Swiss Cheese Vine for geometry plus pigment, Maidenhair for repeated thin foliage, Begonia for markings and two faces, Ficus for woody joints, Rabbit's Foot Fern and Moth Orchid for distinct exposed structures, Golden Barrel for repeated spines and Echeveria for matte bloom. Compare them under the same stage camera before applying the method across the roster.
- For each of the 58, record **references attached → model revised → front/back/macro reviewed → runtime export verified**. For art review check recognizable silhouette without the name, documented pigment placement and face difference, continuous joints in orbit, and credible growth at the soil line. Keep a known issue open if any check still fails.
- Run the Blender source and Three.js asset verifiers. Preserve named clips and their Idle seam, keep each GLB at or below 2,000,000 bytes and 50,000 triangles, and each preview at or below 100,000 bytes. Log geometry and primitive deltas. Keep a single live canvas and keep shelf portraits lazy.
- Capture the motion and reduced-motion paths at phone and desktop widths, including missing GLB and WebGL loss. On a physical phone, measure render frame time and GPU/thermal behavior for the eight benchmarks before shipping heavier maps broadly. Record the device, resolution, build and comparison under the same lighting and animation.
- All 58 companions have an authored source and runtime asset. The 13 rows below have received the deeper anatomy and surface pass. The other 45 rows in the roster matrix are the remaining detail backlog.


## Calibration assets delivered

| Asset | Detail pass | Runtime GLB |
| --- | --- | ---: |
| Swiss Cheese Vine | Secondary pigments around fenestrations | 597,436 bytes |
| Maidenhair Fern | Vein pigment on fine fanlets | 1,019,280 bytes |
| Polka Dot Begonia | Swept blades, silver front markings, claret backs and connected cane nodes | 363,744 bytes |
| Fiddle-Leaf Fig | Seven continuous tapered joints, sculpted blades and packed leaf pigments | 910,644 bytes |
| Rabbit's Foot Fern | Three scaled creeping rhizomes with attached stipes | 1,124,632 bytes |
| Moth Orchid | Silver aerial roots with green tips, coarse bark, connected pedicels and three-lobed lips | 550,536 bytes |
| Golden Barrel Cactus | Continuous ribs with individual cushions and tapered spine clusters | 568,040 bytes |
| Mexican Snowball | Layered matte glaucous leaves with pale new growth | 373,700 bytes |
| Mini Monstera | Five split and two entire blades, alternating petioles and three aerial roots | 518,292 bytes |
| Dieffenbachia | Six attached petioles, scarred cane and irregular cream pigment | 542,004 bytes |
| Bird's Nest Fern | Twelve continuous fronds, funnel crown and underside sori | 984,636 bytes |
| Rubber Plant | Seven petiole joints, a tapered woody leader and one terminal stipule | 639,712 bytes |
| Thanksgiving Cactus | 28 overlapping clawed pads, four lifted flowers and projecting stamens | 571,776 bytes |

The cactus retains 1,260 individual spine silhouettes using triangular tapered meshes grouped by material. The rosette uses high roughness with restrained pigments for its powdery bloom. The orchid's flower pedicels and root tips share exact attachment coordinates and the same foliage pivot, checked on reopening the saved scene. Botanical references for the revised forms follow. [Fiddle-leaf fig](https://plants.ces.ncsu.edu/plants/ficus-lyrata/) · [Rabbit's Foot Fern](https://www.rhs.org.uk/plants/131210/davallia-solida-var-fejeensis/details) · [Moth Orchid](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A650501-1/general-information) · [Golden Barrel Cactus](https://extension.okstate.edu/programs/plant-id/plant-profiles/golden-barrel-cactus) · [Mexican Snowball](https://plants.ces.ncsu.edu/plants/echeveria-elegans/).

The five follow-up exports contain 20,188 / 20,996 / 39,680 / 25,352 / 21,588 triangles in table order and use 15 / 15 / 12 / 13 / 17 primitives. The source verifier checks shared, overlapping pad joints and terminal flower attachments on Thanksgiving Cactus. The four other assets were reopened and inspected with focused attachment and topology checks. [Mini Monstera](https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:88594-1/general-information) · [Dieffenbachia](https://monografiasfloradobrasil.jbrj.gov.br/dieffenbachia.pdf) · [Bird's Nest Fern](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A17048040-1/general-information) · [Rubber Plant](https://hortflora.rbg.vic.gov.au/taxon/ad8d6830-5340-11e7-b82b-005056b0018f) · [Thanksgiving Cactus](https://plants.ces.ncsu.edu/plants/schlumbergera-truncata/)

Editable files, runtime exports and thumbnails are listed in the [shared character index](../assets/characters/README.md). All 58 remain open for owner art review and physical mobile profiling.

[Thanksgiving Cactus in the live 375 px stage](images/petey-thanksgiving-cactus-mobile.png)

## Next production batches

1. Start with **Bunny Ears, Boston Fern and Spider Plant**. Prove pad joint plus dense areole pattern, continuous divided fronds, and parent-to-runner-to-plantlet attachment. Sample the existing assets first so the evidence shows what changed.
2. Continue by growth habit. Pair one structural model with one pigment-heavy model for each review. Start with the 45 IDs in the matrix that do not appear in the delivered table. Work in small batches so the model builder, canonical exports, registry and stage captures land together. Each art agent owns distinct IDs and writes candidate builds to a separate folder before integration.
3. After the 58 species are reviewed, confirm the additional six Garden identities and their references for the 64-species roadmap. Choose cultivar variants based on documented distinguishable anatomy or pigments. Preserve the existing Garden record's species key and plan any per-plant skin as a separate owner-controlled setting whose default is the species artwork.

## Build and integrate one replica

1. **Record references and intended form.** Save the scientific identity, cultivar or growth stage, source URLs, and at least three distinguishable features. Spot-check foliage front, reverse and edge, node continuity, visible roots, and size relative to the pot. Use specimens as geometry and material reference. For instance, Bunny Ears needs raised areoles and short, clustered glochids on both faces of its oval pads. Boston Fern needs attached, decreasing pinnae along continuous arching rachises. [Bunny Ears](https://plants.ces.ncsu.edu/plants/opuntia-microdasys/) · [Boston Fern](https://plants.ces.ncsu.edu/plants/nephrolepis-exaltata/)
2. **Build the editable crown.** Select the existing flagship builder or the `expansion_foliage`, `expansion_architecture`, or `expansion_bloom` module that owns the ID. Make editable organ geometry, anchor each component to the same joint in crown-local coordinates, test the soil line, and name parts so another artist can select them. Use discrete geometry for margins, exposed roots, and structural veins. Start with vertex pigment for broad patterning. Bake normal or roughness maps only when staged comparison shows the benefit.
3. **Verify motion in Blender.** Keep animated pivots and named Idle, Notice, Curious, Concerned, Relieved, and Celebrate actions. Check the first and last Idle poses, sample maximum bends, and inspect around the root and pot at those frames. Capture front, side, rear and macro views. Flag intentional open surfaces separately in the geometry review.
4. **Build into a staging folder.** For example, on Windows from the repository root, create a temporary candidate folder and seed the asset's existing spec at the same relative path to preserve its integration status. Run the existing exporter with the appropriate group and ID. Then compare preview legibility, bytes, triangles, primitives, animation names and joint evidence before copying the candidate files to their canonical paths.

   ```text
   blender --disable-autoexec -b --factory-startup --python-exit-code 1 -P tools/blender/expansion_common.py -- bloom --only bunny-ears --repo <staging-root> --review-dir <review-dir> --samples 12
   python tools/blender/sync_expansion_registry.py
   blender --disable-autoexec -b --factory-startup --python-exit-code 1 -P tools/blender/verify_characters.py
   node frontend/verification/character-assets.mjs <fastapi-url>
   node frontend/verification/characters.mjs <vite-url> <capture-dir>
   ```

5. **Check the actual Three.js stage.** New runtime assets appear through the generated registry and lease-based GLB loader. Keep one Canvas, preserve the authored asset's scale and camera framing, and check that two different assets can switch without a stale model or extra canvas. Use the six named clips and preserve the procedural and static fallbacks. Compare the exported finish to Blender from the same angle under the app's greenhouse lights. Verify 375 px and desktop framing, pointer reaction, reduced motion and WebGL context restore. Use the live FastAPI catalog and save a representative owned plant so mapping survives a real reload.
6. **Close the record.** Update the asset spec, model index when adding an ID, delivered table and `PLANS.md`. Record the exact commands, output numbers, checked references, previews and any remaining issue. Device QA will compare physical-phone frame time, dropped frames, thermal and battery behavior under controlled conditions. Keep rendered stress or mood tied to supported signals with provenance. A character pose alone cannot establish a diagnosis.
