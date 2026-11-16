// Mundo (nov/2026): Pedraluz no centro e quatro direções de biomas ao redor (ver layout.ts e biomes.ts). Quanto
// mais longe da vila, em qualquer direção, mais fortes as criaturas. A vila é desenhada nas coordenadas locais de
// sempre (0–72 × 0–77) e montada no centro do mundo por deslocamento (TOWN_X, TOWN_Y): por dentro ela é a mesma.
import tiles from '../../assets/generated/tiles.json';
import { PROPS } from '../props';
import { MapBuilder, Terrain } from '../../game/world/MapBuilder';
import { buildBiomes } from './biomes';
import { TOWN_X, TOWN_Y, WORLD_H, WORLD_W } from './layout';
import type { GameMap } from '../../game/world/GameMap';

export { PLAYER_START, TOWN_BOX, TOWN_X, TOWN_Y, WORLD_H, WORLD_VERSION, WORLD_W, town } from './layout';

/** Linha da muralha sul da vila (coordenada local). */
const SOUTH = 77;

export function buildWorld(): GameMap {
  const b = new MapBuilder(WORLD_W, WORLD_H, tiles.names, PROPS, 2024);
  b.translate(TOWN_X, TOWN_Y, () => buildTown(b));
  buildBiomes(b);
  return b.build();
}

/** A Vila de Pedraluz, em coordenadas locais (0–72 × 0–77), com muralha e portão nos quatro lados. */
function buildTown(b: MapBuilder): void {
  const TOWN_TREES = ['tree_oak', 'tree_oak_b', 'tree_apple', 'tree_oak'];

  // ------------------------------------------------------------------ regiões
  // área protegida só dentro das construções (casas, lojas, banco, templo): as ruas são livres
  b.region({ id: 'town', name: 'Vila de Pedraluz', x: 2, y: 2, w: 70, h: SOUTH - 2, pz: false, city: true, music: 'town', priority: 1 });
  b.region({ id: 'temple', name: 'Templo da Aurora', x: 39, y: 3, w: 17, h: 14, pz: false, city: true, music: 'temple', priority: 3 });

  // ------------------------------------------------------------------ terreno base
  // lago oeste da vila
  b.ellipse(13, 30, 6.5, 5, Terrain.Water, 0.25);
  // praça, pátio do templo e avenida principal
  b.ellipse(48, 27.5, 11.5, 6.8, Terrain.Cobble, 0.2);
  b.rect({ x: 42, y: 16, w: 11, h: 4 }, Terrain.Cobble);
  b.rect({ x: 45, y: 16, w: 5, h: 6 }, Terrain.Cobble);
  b.path([[24, 22], [70, 22]], 3, Terrain.Cobble);
  b.reserve({ x: 36, y: 20, w: 25, h: 15 });
  // estradas de terra (a avenida segue até o portão oeste; uma rua sobe até o portão norte)
  b.path([[0, 22], [24, 22]], 3);
  b.path([[36, 32], [35, 40], [35, 48]], 2);
  b.path([[60, 32], [61, 40], [61, 48]], 2);
  b.path([[20, 48], [70, 48]], 2);
  b.path([[48, 34], [48, 38]], 2);
  b.path([[22, 48], [18, 54]], 2);
  b.path([[24, 0], [24, 21]], 3);
  b.path([[35, 48], [36, 60], [37, 70], [37, 79]], 2);

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
  b.start(47, 11);
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

  // ------------------------------------------------------------------ Banco de Pedraluz (oeste da avenida)
  b.building({ id: 'bank', sideWindows: [{ side: 'l', y: 11 }], name: 'Banco de Pedraluz', x: 9, y: 7, w: 11, h: 9, wall: 'stone', interior: 'stone', floor: 'marble', roof: 'blue', doorX: 14, windows: [11, 17], interiorWindows: [11, 17] });
  b.carpet({ x: 13, y: 11, w: 3, h: 3 });
  b.prop('counter', 13, 10).prop('chest', 10, 9).prop('chest', 18, 9).prop('bookshelf', 16, 9).prop('plant', 10, 13).prop('candle', 18, 13);
  b.npc('banker', 14, 9, 'down');
  // Mercado de Pedraluz: o corretor fica na mesa ao lado da banqueira
  b.prop('table_small', 17, 11).prop('sack', 18, 11);
  b.npc('broker', 17, 10, 'down');
  b.reserve({ x: 7, y: 6, w: 15, h: 12 });
  b.path([[14, 16], [14, 21]], 2);
  b.sign(16, 18, 'Banco de Pedraluz — guarde ouro e itens com segurança.');

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

  // ------------------------------------------------------------------ muralha e portões (norte, leste, sul e oeste)
  b.gate(24, 0).gate(74, 22).gate(37, 79).gate(0, 22);
  for (let x = 2; x <= 72; x++) if (x < 23 || x > 25) b.prop('palisade', x, 2);
  for (let y = 3; y < SOUTH; y++) if (y < 20 || y > 24) b.prop('palisade', 72, y);
  for (let y = 3; y < SOUTH; y++) if (y < 20 || y > 24) b.prop('palisade', 2, y);
  for (let x = 2; x < 72; x++) if (x < 36 || x > 39) b.prop('palisade', x, SOUTH);
  // leste
  b.prop('lamp_post', 71, 19).prop('lamp_post', 71, 25);
  b.npc('guard', 70, 19, 'down');
  b.sign(74, 19, 'Leste: Campos do Leste, Savana Dourada, Mar de Areia, Dunas Rubras e o Vulcão Adormecido.');
  // sul
  b.prop('lamp_post', 35, SOUTH - 1).prop('lamp_post', 40, SOUTH - 1);
  b.npc('guard_south', 41, SOUTH - 2, 'down');
  b.sign(41, SOUTH + 1, 'Sul: Margem do Pântano, Pântano Sombrio, Selva Alagada, Pântano Corrompido e a Necrópole.');
  // norte
  b.prop('lamp_post', 22, 3).prop('lamp_post', 26, 3);
  b.npc('guard_north', 27, 4, 'down');
  b.sign(27, 0, 'Norte: Campos do Norte, Taiga dos Pinheiros, Tundra Uivante, Geleira Eterna e o Pico do Inverno.');
  // oeste
  b.prop('lamp_post', 3, 19).prop('lamp_post', 3, 25);
  b.npc('guard_west', 4, 18, 'right');
  b.sign(0, 19, 'Oeste: Colinas Verdes, Ruínas Antigas, Montanhas de Ferro, Charneca das Presas e o Abismo Primordial.');

  // ------------------------------------------------------------------ jardins e bordas da vila
  // jardins e bordas da vila
  b.scatter({ x: 3, y: 3, w: 36, h: 17 }, { props: [...TOWN_TREES, 'bush', 'bush_flower'], density: 0.2, salt: 11, spacing: 1 });
  b.scatter({ x: 56, y: 3, w: 15, h: 9 }, { props: [...TOWN_TREES, 'bush'], density: 0.22, salt: 12, spacing: 1 });
  b.scatter({ x: 3, y: 36, w: 22, h: 14 }, { props: [...TOWN_TREES, 'bush', 'bush_berry', 'rock_small'], density: 0.14, salt: 13, spacing: 1 });
  b.scatter({ x: 22, y: 50, w: 49, h: 23 }, { props: [...TOWN_TREES, 'bush', 'bush_flower', 'stump'], density: 0.16, salt: 14, spacing: 1 });
  b.scatter({ x: 3, y: 66, w: 20, h: 8 }, { props: TOWN_TREES, density: 0.3, salt: 15, spacing: 1 });
  b.scatter({ x: 54, y: 30, w: 17, h: 8 }, { props: ['bush', 'bush_flower', 'tree_oak'], density: 0.12, salt: 16, spacing: 1 });
  b.scatter({ x: 24, y: 26, w: 12, h: 11 }, { props: ['bush', 'bush_flower', 'tree_apple'], density: 0.12, salt: 17, spacing: 1 });
  // decoração plana
  b.scatterDecor({ x: 3, y: 3, w: 69, h: 70 }, ['decor_flowers_white', 'decor_flowers_pink', 'decor_flowers_yellow', 'decor_pebbles', 'decor_tallgrass'], 0.045, 51);
}
