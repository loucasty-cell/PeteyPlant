const plants = 'https://plants.ces.ncsu.edu/plants/';

export const lensTraits: Readonly<Record<string, { leaves: string; habit: string; source: string }>> = {
  'Monstera deliciosa': {
    leaves: 'Broad leaves can develop interior holes and deep splits as they mature.',
    habit: 'Climbs with aerial roots.',
    source: plants + 'monstera-deliciosa/',
  },
  'Epipremnum aureum': {
    leaves: 'Glossy, often heart-shaped leaves may have yellow or cream markings.',
    habit: 'Trails or climbs, with grooved leaf stalks.',
    source: plants + 'epipremnum-aureum/',
  },
  'Dracaena trifasciata': {
    leaves: 'Stiff, flat blades often have horizontal bands of green.',
    habit: 'Grows upright in clusters from the base.',
    source: plants + 'dracaena-trifasciata/',
  },
  'Chlorophytum comosum': {
    leaves: 'Narrow, arching leaves can have a lengthwise white stripe.',
    habit: 'Small plantlets may hang from long stems.',
    source: plants + 'chlorophytum-comosum/',
  },
  'Aloe vera': {
    leaves: 'Thick, pointed leaves hold water and have toothed edges.',
    habit: 'Leaves radiate from the center and offsets grow at the base.',
    source: plants + 'aloe-vera/',
  },
  'Dypsis lutescens': {
    leaves: 'Arching fronds have many narrow leaflets along a yellow-green stalk.',
    habit: 'Several bamboo-like stems rise from a single base.',
    source: plants + 'chrysalidocarpus-lutescens/',
  },
  'Goeppertia makoyana': {
    leaves: 'Oval leaves have dark markings along both sides of the lighter midrib.',
    habit: 'Leaf undersides have reddish-purple markings.',
    source: plants + 'goeppertia-makoyana/',
  },
  'Ficus lyrata': {
    leaves: 'Large, leathery leaves often have a broad, violin-like outline.',
    habit: 'Grows upright as a woody plant.',
    source: plants + 'ficus-lyrata/',
  },
};
