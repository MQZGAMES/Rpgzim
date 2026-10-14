// Mundo inicial contínuo: Templo da Aurora -> Vila de Pedraluz -> Bosque Selvagem.
// Tudo é montado com tiles e objetos navegáveis (nenhuma imagem de fundo única).
import tiles from '../../assets/generated/tiles.json';
import { PROPS } from '../props';
import { MapBuilder, Terrain } from '../../game/world/MapBuilder';
import type { GameMap } from '../../game/world/GameMap';

export const WORLD_W = 104;
export const WORLD_H = 76;

export function buildWorld(): GameMap {
  const b = new MapBuilder(WORLD_W, WORLD_H, tiles.names, PROPS, 2024);
  const TOWN_TREES = ['tree_oak', 'tree_oak_b', 'tree_apple', 'tree_oak'];
  const WILD_TREES = ['tree_forest', 'tree_oak', 'tree_pine', 'tree_pine_b', 'tree_forest', 'tree_oak_b'];

  // ------------------------------------------------------------------ regiões
  b.region({ id: 'town', name: 'Vila de Pedraluz', x: 0, y: 0, w: 72, h: WORLD_H, pz: true, music: 'town', priority: 1 });
  b.region({ id: 'temple',  name: 'Templo da Aurora', x: 39, y: 3, w: 17, h: 14, pz: true, music: 'temple', priority: 3 });
  b.region({ id: 'wild', name: 'Bosque Selvagem', x: 72, y: 0, w: 32, h: WORLD_H, pz: false, music: 'wild', priority: 1 });
  b.region({ id: 'meadow', name: 'Clareira dos Slimes', x: 73, y: 24, w: 18, h: 20, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'boarwoods', name: 'Mata dos Javalis', x: 73, y: 3, w: 29, h: 18, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'goblincamp', name: 'Acampamento Goblin', x: 76, y: 47, w: 26, h: 27, pz: false, music: 'wild', priority: 2 });

  // ------------------------------------------------------------------ terreno base
  b.dark({ x: 72, y: 0, w: 32, h: 22 });
  b.dark({ x: 76, y: 46, w: 28, h: 30 });
  // lago oeste da vila e lagoa do bosque
  b.ellipse(13, 30, 6.5, 5, Terrain.Water, 0.25);
  b.ellipse(95, 33, 5, 6, Terrain.Water, 0.25);
  // praça, pátio do templo e avenida principal
  b.ellipse(48, 27.5, 11.5, 6.8, Terrain.Cobble, 0.2);
  b.rect({ x: 42, y: 16, w: 11, h: 4 }, Terrain.Cobble);
  b.rect({ x: 45, y: 16, w: 5, h: 6 }, Terrain.Cobble);
  b.path([[24, 22], [70, 22]], 3, Terrain.Cobble);
  b.reserve({ x: 36, y: 20, w: 25, h: 15 });
  // estradas de terra
  b.path([[6, 22], [24, 22]], 3);
  b.path([[36, 32], [35, 40], [35, 48]], 2);
  b.path([[60, 32], [61, 40], [61, 48]], 2);
  b.path([[20, 48], [70, 48]], 2);
  b.path([[48, 34], [48, 38]], 2);
  b.path([[22, 48], [18, 54]], 2);
  // estrada para o bosque e trilhas internas
  b.path([[70, 22], [80, 22], [84, 26], [84, 36], [86, 42], [88, 50], [90, 56]], 3);
  b.path([[82, 22], [86, 16], [88, 10], [92, 7]], 2);
  b.path([[84, 30], [89, 31]], 2);

  // ------------------------------------------------------------------ Templo da Aurora (nascimento, área segura)
  b.building({ id: 'temple', sideWindows: [{ side: 'l', y: 9 }, { side: 'r', y: 9 }], name: 'Templo da Aurora', x: 40, y: 4, w: 15, h: 12, wall: 'marble', interior: 'temple', floor: 'marble', roof: 'slate', doorX: 47, windows: [42, 44, 50, 52], interiorWindows: [44, 50] });
  b.carpet({ x: 46, y: 9, w: 3, h: 5 });
  b.prop('statue', 47, 6).prop('brazier', 45, 6).prop('brazier', 49, 6);
  b.prop('altar', 46, 7);
  b.prop('pillar', 42, 7).prop('pillar', 52, 7).prop('pillar', 42, 11).prop('pillar', 52, 11);
  b.prop('pew', 43, 10).prop('pew', 50, 10).prop('pew', 43, 12).prop('pew', 50, 12);
  b.prop('banner', 43, 5, { force: true }).prop('banner', 51, 5, { force: true });
  b.prop('candle', 41, 6).prop('candle', 53, 6).prop('plant', 41, 13).prop('plant', 53, 13);
  b.npc('priest', 48, 8, 'down');
  b.playerStart = { x: 47, y: 11 };
  for (const [x, n] of [[46, 'steps_l'], [47, 'steps_m'], [48, 'steps_r']] as const) b.floorTile(x, 16, n);
  b.prop('brazier', 44, 17).prop('brazier', 50, 17);
  b.prop('planter', 42, 19).prop('planter', 52, 19);
  b.prop('statue', 41, 17).prop('statue', 53, 17);
  b.reserve({ x: 39, y: 3, w: 17, h: 18 });

  // ------------------------------------------------------------------ Vila: lojas ao norte da avenida
  b.building({ id: 'smith', sideWindows: [{ side: 'r', y: 16 }], name: 'Ferraria', x: 26, y: 12, w: 9, h: 9, wall: 'stone', interior: 'stone', floor: 'stone', roof: 'red', doorX: 30, windows: [28, 32], interiorWindows: [], chimneyX: 28 });
  b.prop('anvil', 27, 14).prop('weapon_rack', 31, 14).prop('armor_stand', 33, 14);
  b.prop('counter', 28, 15);
  b.prop('barrel', 33, 17).prop('crate', 27, 17);
  b.npc('smith', 29, 14, 'down');
  b.sign(32, 21, 'Ferraria de Pedraluz — armas, escudos e armaduras.');

  b.building({ id: 'alchemy', sideWindows: [{ side: 'l', y: 16 }], name: 'Alquimia', x: 60, y: 12, w: 9, h: 9, wall: 'plaster', interior: 'wood', floor: 'wood', roof: 'green', doorX: 64, windows: [62, 66], interiorWindows: [62], chimneyX: 66 });
  b.prop('potion_shelf', 61, 14).prop('cauldron', 66, 14).prop('bookshelf', 67, 14);
  b.prop('counter', 63, 15);
  b.prop('plant', 61, 17).prop('candle', 67, 17);
  b.npc('alchemist', 64, 14, 'down');
  b.sign(66, 21, 'Alquimia da Selene — poções e artefatos.');

  // ------------------------------------------------------------------ praça
  b.prop('fountain', 46, 28);
  b.prop('stall_fruit', 39, 25).prop('stall_cloth', 55, 25);
  b.npc('merchant', 38, 25, 'right');
  b.prop('bench', 42, 31).prop('bench', 51, 31);
  for (const [x, y] of [[37, 21], [58, 21], [38, 32], [58, 32], [44, 19], [51, 19]] as const) b.prop('lamp_post', x, y);
  b.prop('planter', 44, 24).prop('planter', 50, 24);
  b.prop('barrel', 37, 25).prop('crate', 37, 26).prop('sack', 58, 26);
  b.prop('well', 24, 25);

  // ------------------------------------------------------------------ casas exploráveis (sem troca de tela)
  b.building({ id: 'house_rosa', sideWindows: [{ side: 'l', y: 42 }], name: 'Casa da Dona Rosa', x: 26, y: 38, w: 8, h: 9, wall: 'plaster', interior: 'wood', floor: 'wood', roof: 'blue', doorX: 29, windows: [27, 31], interiorWindows: [31], chimneyX: 31 });
  b.prop('bed', 27, 41).prop('wardrobe', 28, 40).prop('fireplace', 31, 40).prop('table', 30, 42).prop('chair', 32, 42).prop('plant', 27, 43);
  b.npc('villager', 29, 42, 'down');

  b.building({ id: 'house_elder', sideWindows: [{ side: 'r', y: 42 }, { side: 'l', y: 41 }], name: 'Casa do Ancião', x: 44, y: 38, w: 9, h: 9, wall: 'plaster', interior: 'wood', floor: 'wood', roof: 'red', doorX: 48, windows: [46, 50], interiorWindows: [46, 50], chimneyX: 45 });
  b.prop('bookshelf', 45, 40).prop('bookshelf', 46, 40).prop('bed', 51, 41).prop('table_small', 49, 40).prop('chair', 50, 40).prop('chest', 45, 43).prop('candle', 51, 43);

  b.building({ id: 'house_hunter', sideWindows: [{ side: 'r', y: 41 }], name: 'Casa do Caçador', x: 60, y: 38, w: 8, h: 9, wall: 'stone', interior: 'wood', floor: 'wood', roof: 'green', doorX: 63, windows: [61, 65], interiorWindows: [65], chimneyX: 61 });
  b.prop('weapon_rack', 61, 40).prop('bed', 66, 41).prop('table', 62, 42).prop('chair', 61, 42).prop('barrel', 66, 43).prop('crate', 61, 43);

  // ------------------------------------------------------------------ lago, fazenda e jardins
  for (const [x, y] of [[11, 28], [15, 31], [12, 33], [16, 28]] as const) b.decorTile(x, y, 'decor_lilypad');
  b.scatterDecor({ x: 5, y: 23, w: 17, h: 14 }, ['decor_reeds', 'decor_flowers_blue', 'decor_tallgrass'], 0.25, 33);
  b.prop('bench', 18, 26).prop('lamp_post', 20, 24);
  // fazenda cercada
  for (let x = 6; x <= 20; x++) {
    b.prop('fence_h', x, 52);
    if (x !== 14) b.prop('fence_h', x, 64);
  }
  for (let y = 53; y < 64; y++) {
    b.prop('fence_v', 6, y);
    b.prop('fence_v', 20, y);
  }
  b.rect({ x: 8, y: 55, w: 11, h: 7 }, Terrain.Dirt);
  b.reserve({ x: 7, y: 53, w: 13, h: 11 });
  for (const [x, y] of [[9, 54], [12, 54], [17, 62]] as const) b.prop('hay', x, y);
  b.npc('farmer', 13, 58, 'down');
  b.prop('sack', 18, 54).prop('barrel', 8, 62);
  b.sign(14, 66, 'Fazenda do Seu Joaquim');

  // ------------------------------------------------------------------ portão leste e cerca da vila
  for (let y = 3; y < WORLD_H - 3; y++) if (y < 20 || y > 24) b.prop('palisade', 72, y);
  b.prop('lamp_post', 71, 19).prop('lamp_post', 71, 25);
  b.npc('guard', 70, 19, 'down');
  b.sign(74, 19, 'Bosque Selvagem — perigo! Slimes, javalis e goblins.');

  // ------------------------------------------------------------------ Bosque Selvagem
  b.spawn('slimes_a', 'slime', 79, 29, 4, 4);
  b.spawn('slimes_b', 'slime', 88, 37, 3, 3);
  b.spawn('boars_a', 'boar', 82, 11, 5, 3);
  b.spawn('boars_b', 'boar', 95, 13, 4, 3);
  b.spawn('goblins_a', 'goblin', 90, 60, 5, 4);
  b.spawn('goblins_b', 'goblin', 96, 68, 3, 2);
  // acampamento goblin
  b.ellipse(90, 60, 8, 6, Terrain.Dirt, 0.4);
  b.reserve({ x: 82, y: 54, w: 17, h: 13 });
  b.prop('campfire', 90, 60);
  b.prop('tent', 84, 57).prop('tent', 95, 56).prop('tent', 86, 65);
  b.prop('totem', 88, 55).prop('totem', 93, 64).prop('bones', 92, 58).prop('bones', 86, 61).prop('crate', 97, 61).prop('barrel', 83, 62);
  for (const x of [80, 81, 82, 98, 99, 100]) b.prop('palisade', x, 52);
  for (const y of [53, 54, 66, 67]) {
    b.prop('palisade', 80, y);
    b.prop('palisade', 100, y);
  }
  // lagoa e clareira
  for (const [x, y] of [[93, 31], [96, 35], [94, 36]] as const) b.decorTile(x, y, 'decor_lilypad');
  b.scatterDecor({ x: 74, y: 24, w: 18, h: 20 }, ['decor_tallgrass', 'decor_flowers_yellow', 'decor_mushrooms'], 0.12, 41);
  b.prop('log', 77, 34).prop('stump', 86, 27).prop('rock_medium', 90, 27).prop('rock_large', 80, 40);
  b.prop('rock_large_b', 92, 22).prop('log', 96, 18).prop('stump', 78, 15);

  // ------------------------------------------------------------------ vegetação e decoração procedural
  b.forestBorder(3, WILD_TREES);
  // jardins e bordas da vila
  b.scatter({ x: 3, y: 3, w: 36, h: 17 }, { props: [...TOWN_TREES, 'bush', 'bush_flower'], density: 0.2, salt: 11, spacing: 1 });
  b.scatter({ x: 56, y: 3, w: 15, h: 9 }, { props: [...TOWN_TREES, 'bush'], density: 0.22, salt: 12, spacing: 1 });
  b.scatter({ x: 3, y: 36, w: 22, h: 14 }, { props: [...TOWN_TREES, 'bush', 'bush_berry', 'rock_small'], density: 0.14, salt: 13, spacing: 1 });
  b.scatter({ x: 22, y: 50, w: 49, h: 23 }, { props: [...TOWN_TREES, 'bush', 'bush_flower', 'stump'], density: 0.16, salt: 14, spacing: 1 });
  b.scatter({ x: 3, y: 66, w: 20, h: 8 }, { props: TOWN_TREES, density: 0.3, salt: 15, spacing: 1 });
  b.scatter({ x: 54, y: 30, w: 17, h: 8 }, { props: ['bush', 'bush_flower', 'tree_oak'], density: 0.12, salt: 16, spacing: 1 });
  b.scatter({ x: 24, y: 26, w: 12, h: 11 }, { props: ['bush', 'bush_flower', 'tree_apple'], density: 0.12, salt: 17, spacing: 1 });
  // bosque
  b.scatter({ x: 73, y: 3, w: 29, h: 20 }, { props: [...WILD_TREES, 'bush_dark', 'rock_small', 'rock_medium'], density: 0.17, salt: 21, spacing: 1 });
  b.scatter({ x: 73, y: 23, w: 29, h: 24 }, { props: ['tree_oak', 'bush', 'bush_berry', 'rock_small', 'tree_forest'], density: 0.09, salt: 22, spacing: 1 });
  b.scatter({ x: 73, y: 47, w: 29, h: 27 }, { props: [...WILD_TREES, 'bush_dark', 'rock_medium', 'stump'], density: 0.15, salt: 23, spacing: 1 });
  // decoração plana
  b.scatterDecor({ x: 3, y: 3, w: 69, h: 70 }, ['decor_flowers_white', 'decor_flowers_pink', 'decor_flowers_yellow', 'decor_pebbles', 'decor_tallgrass'], 0.045, 51);
  b.scatterDecor({ x: 72, y: 3, w: 29, h: 70 }, ['decor_tallgrass', 'decor_mushrooms', 'decor_leaves', 'decor_pebbles', 'decor_flowers_blue'], 0.08, 52);

  return b.build();
}
