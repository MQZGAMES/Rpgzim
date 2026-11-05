// Terras do Sul: faixa nova de caça ao longo de todo o mapa, abaixo do pântano, das colinas/ruínas, do covil do
// dragão e das Terras Distantes — sem cidade nova. Cada área tem duas espécies não humanas (a mais fraca a oeste, perto
// da trilha que desce do norte) e preenche os níveis em que as caças antigas ficavam lotadas.
//
//   x   3–48   Brejo das Sanguessugas (nível 6–12)      x 104–136  Savana Rachada (20–28)
//   x  50–102  Ninho das Aranhas (12–20)                 x 137–168  Desfiladeiro das Serpes (28–44)
//   x 172–256  Estepe dos Basiliscos (68–76)             x 260–297  Cratera Cristalina (84–92)
// (como no resto do mapa, quanto mais longe de Pedraluz, mais forte: o sudeste fica com as faixas altas)
import { Terrain, type MapBuilder } from '../../game/world/MapBuilder';

/** Primeira linha das Terras do Sul (abaixo da área antiga, que ia até y 118; as Terras Distantes iam até 126). */
export const SOUTH_Y = 120;

export function buildSouth(b: MapBuilder, height: number): void {
  const bottom = height - 4;
  const h = bottom - SOUTH_Y;
  const east = 128; // as Terras Distantes descem até y 126
  // ------------------------------------------------------------------ regiões
  b.region({
    id: 'southlands',
    name: 'Terras do Sul',
    x: 0,
    y: SOUTH_Y - 1,
    w: 300,
    h: height - SOUTH_Y + 1,
    pz: false,
    music: 'wild',
    priority: 1,
  });
  b.region({
    id: 'bog',
    name: 'Brejo das Sanguessugas',
    x: 3,
    y: SOUTH_Y,
    w: 46,
    h,
    pz: false,
    music: 'wild',
    priority: 2,
  });
  b.region({
    id: 'nest',
    name: 'Ninho das Aranhas',
    x: 50,
    y: SOUTH_Y,
    w: 53,
    h,
    pz: false,
    music: 'wild',
    priority: 2,
  });
  b.region({
    id: 'savanna',
    name: 'Savana Rachada',
    x: 104,
    y: SOUTH_Y,
    w: 33,
    h,
    pz: false,
    music: 'wild',
    priority: 2,
  });
  b.region({
    id: 'gorge',
    name: 'Desfiladeiro das Serpes',
    x: 137,
    y: SOUTH_Y,
    w: 32,
    h,
    pz: false,
    music: 'wild',
    priority: 2,
  });
  b.region({
    id: 'steppe',
    name: 'Estepe dos Basiliscos',
    x: 172,
    y: east,
    w: 85,
    h: bottom - east,
    pz: false,
    music: 'wild',
    priority: 2,
  });
  b.region({
    id: 'crater',
    name: 'Cratera Cristalina',
    x: 260,
    y: east,
    w: 38,
    h: bottom - east,
    pz: false,
    music: 'wild',
    priority: 2,
  });

  // ------------------------------------------------------------------ estradas: descidas do norte e a estrada do sul
  b.path(
    [
      [16, 110],
      [16, 118],
      [18, 124],
    ],
    2,
  ); // do pântano
  b.path(
    [
      [74, 106],
      [76, 116],
      [76, 124],
    ],
    2,
  ); // das ruínas
  b.path(
    [
      [120, 108],
      [120, 124],
    ],
    2,
  ); // do covil (trolls)
  b.path(
    [
      [152, 106],
      [152, 124],
    ],
    2,
  ); // do covil (dragões)
  b.path(
    [
      [192, 124],
      [192, 132],
    ],
    2,
  ); // das Dunas Rubras
  b.path(
    [
      [236, 124],
      [236, 132],
    ],
    2,
  ); // do Vulcão
  b.path(
    [
      [6, 124],
      [50, 124],
      [104, 124],
      [137, 124],
      [166, 124],
      [172, 132],
      [258, 132],
      [294, 132],
    ],
    2,
  );
  b.sign(
    19,
    122,
    'Terras do Sul — brejo, ninho de aranhas, savana e o desfiladeiro das serpes. Nenhuma cidade por aqui: leve poções.',
  );
  b.sign(
    170,
    130,
    'Estepe dos Basiliscos e, no extremo leste, a Cratera Cristalina. Só para os muito fortes.',
  );

  // ------------------------------------------------------------------ Brejo das Sanguessugas (faixa 2)
  b.dark({ x: 3, y: SOUTH_Y + 1, w: 46, h: h - 1 }, 2);
  for (const [cx, cy, rx, ry] of [
    [12, 134, 4, 3],
    [30, 142, 5, 3],
    [40, 130, 3.5, 2.5],
    [20, 150, 4, 2.5],
  ] as const)
    b.ellipse(cx, cy, rx, ry, Terrain.Water, 0.35);
  b.scatterDecor(
    { x: 3, y: SOUTH_Y + 1, w: 46, h: h - 1 },
    ['decor_reeds', 'decor_mushrooms', 'decor_lilypad', 'decor_tallgrass'],
    0.12,
    201,
  );
  b.prop('log', 24, 132).prop('stump', 8, 144).prop('bones', 36, 148);
  b.spawn('bogslimes_a', 'bog_slime', 20, 132, 4, 4);
  b.spawn('bogslimes_b', 'bog_slime', 10, 146, 3, 3);
  b.spawn('marshtoads_a', 'marsh_toad', 36, 138, 4, 3);
  b.spawn('marshtoads_b', 'marsh_toad', 30, 152, 3, 3);

  // ------------------------------------------------------------------ Ninho das Aranhas (faixa 3): teias, ossos e rochas
  b.dark({ x: 50, y: SOUTH_Y + 1, w: 53, h: h - 1 }, 3);
  b.ellipse(84, 140, 10, 7, Terrain.Dirt, 0.45);
  b.prop('rock_large', 58, 130)
    .prop('rock_large_b', 96, 132)
    .prop('rock_large', 70, 150)
    .prop('rock_medium', 90, 148);
  b.prop('bones', 80, 138).prop('bones', 88, 142).prop('bones', 84, 136).prop('totem', 62, 142);
  b.spawn('cavespiders_a', 'cave_spider', 62, 134, 4, 4);
  b.spawn('cavespiders_b', 'cave_spider', 60, 148, 3, 3);
  b.spawn('widows_a', 'widow_spider', 84, 140, 3, 3);
  b.spawn('widows_b', 'widow_spider', 96, 150, 3, 2);

  // ------------------------------------------------------------------ Savana Rachada (faixa 4): terra seca e pedras
  b.ellipse(120, 140, 14, 14, Terrain.Dirt, 0.55);
  b.prop('rock_large', 108, 130)
    .prop('rock_large_b', 132, 134)
    .prop('rock_medium', 112, 150)
    .prop('rock_large', 130, 152)
    .prop('bones', 120, 144);
  b.spawn('hyenas_a', 'hyena', 112, 136, 4, 4);
  b.spawn('hyenas_b', 'hyena', 114, 150, 4, 3);
  b.spawn('rhinoboars_a', 'rhino_boar', 128, 140, 3, 3);
  b.spawn('rhinoboars_b', 'rhino_boar', 130, 150, 3, 2);

  // ------------------------------------------------------------------ Desfiladeiro das Serpes (faixas 5 e 6)
  b.dark({ x: 137, y: SOUTH_Y + 1, w: 32, h: h - 1 }, 3);
  b.ellipse(158, 142, 8, 6, Terrain.Dirt, 0.4);
  for (const [x, y] of [
    [140, 130],
    [146, 150],
    [164, 128],
    [166, 152],
    [150, 138],
  ] as const)
    b.prop('rock_large', x, y);
  b.prop('bones', 156, 140).prop('bones', 160, 146).prop('rock_large_b', 142, 140);
  b.spawn('cavebears_a', 'cave_bear', 144, 134, 4, 3);
  b.spawn('cavebears_b', 'cave_bear', 142, 148, 3, 3);
  b.spawn('wyverns_a', 'green_wyvern', 158, 140, 3, 2);
  b.spawn('wyverns_b', 'green_wyvern', 162, 150, 3, 2);

  // ------------------------------------------------------------------ Estepe dos Basiliscos (faixas 10 e 11)
  b.ellipse(212, 144, 30, 10, Terrain.Dirt, 0.6);
  b.prop('rock_large', 180, 138)
    .prop('rock_large_b', 200, 150)
    .prop('rock_large', 226, 138)
    .prop('rock_large_b', 246, 150)
    .prop('bones', 214, 144)
    .prop('totem', 232, 146);
  b.spawn('basilisks_a', 'basilisk', 184, 144, 4, 3);
  b.spawn('basilisks_b', 'basilisk', 198, 150, 3, 3);
  b.spawn('stormwolves_a', 'storm_wolf', 232, 142, 4, 4);
  b.spawn('stormwolves_b', 'storm_wolf', 246, 148, 4, 3);

  // ------------------------------------------------------------------ Cratera Cristalina (faixas 12 e 13): pedra e lava
  b.dark({ x: 260, y: east + 1, w: 38, h: bottom - east - 1 }, 4);
  b.ellipse(279, 144, 14, 9, Terrain.Cobble, 0.4);
  for (const [x, y] of [
    [266, 136],
    [292, 136],
    [266, 152],
    [292, 152],
  ] as const)
    b.prop('pillar', x, y);
  b.prop('brazier', 274, 144)
    .prop('brazier', 284, 144)
    .prop('statue', 279, 138)
    .prop('bones', 270, 146)
    .prop('bones', 288, 148);
  b.reserve({ x: 268, y: 138, w: 22, h: 12 });
  b.spawn('crystalscorps_a', 'crystal_scorpion', 268, 142, 3, 3);
  b.spawn('crystalscorps_b', 'crystal_scorpion', 270, 152, 3, 2);
  b.spawn('magmaslimes_a', 'magma_slime', 288, 144, 3, 3);
  b.spawn('magmaslimes_b', 'magma_slime', 290, 152, 3, 2);

  // ------------------------------------------------------------------ vegetação
  b.scatter(
    { x: 3, y: SOUTH_Y + 1, w: 46, h: h - 1 },
    {
      props: ['tree_forest', 'tree_pine', 'bush_dark', 'stump', 'tree_forest'],
      density: 0.12,
      salt: 211,
      spacing: 1,
    },
  );
  b.scatter(
    { x: 50, y: SOUTH_Y + 1, w: 53, h: h - 1 },
    { props: ['tree_forest', 'rock_small', 'bush_dark', 'stump'], density: 0.1, salt: 212, spacing: 1 },
  );
  b.scatter(
    { x: 104, y: SOUTH_Y + 1, w: 33, h: h - 1 },
    { props: ['rock_small', 'rock_medium', 'bush', 'stump'], density: 0.05, salt: 213, spacing: 1 },
  );
  b.scatter(
    { x: 137, y: SOUTH_Y + 1, w: 32, h: h - 1 },
    {
      props: ['tree_pine', 'tree_pine_b', 'rock_small', 'rock_medium'],
      density: 0.11,
      salt: 214,
      spacing: 1,
    },
  );
  b.scatter(
    { x: 172, y: east + 1, w: 85, h: bottom - east - 1 },
    { props: ['rock_small', 'rock_medium', 'bush_dark', 'stump'], density: 0.05, salt: 215, spacing: 1 },
  );
  b.scatter(
    { x: 260, y: east + 1, w: 38, h: bottom - east - 1 },
    { props: ['rock_small', 'rock_medium', 'bush_dark'], density: 0.07, salt: 216, spacing: 1 },
  );
  b.scatterDecor(
    { x: 50, y: SOUTH_Y + 1, w: 247, h: h - 1 },
    ['decor_pebbles', 'decor_tallgrass', 'decor_leaves', 'decor_crack'],
    0.07,
    217,
  );
}
