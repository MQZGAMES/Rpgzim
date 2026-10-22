// Expansão leste: oito zonas de caça para os níveis 44 a 100, cada vez mais difíceis quanto mais longe de Pedraluz.
// O mapa continua a partir das Terras Altas (x 170): a dificuldade sobe de oeste para leste e, dentro de cada zona,
// a espécie mais fraca fica na borda oeste (perto da cidade) e a mais forte na leste.
//
//            A (x 172–212)         B (x 216–256)         C (x 260–300)
//   R1 y 2–42    Charneca (T7)         Lago Congelado (T10)  Portal Infernal (T13)
//   R2 y 46–84   Montanha Branca (T8)  Pântano Corrompido(T11) ┐
//   R3 y 86–126  Dunas Rubras (T9)     Vulcão (T12)           ┘ Abismo Primordial (T14)
import { Terrain, type MapBuilder } from '../../game/world/MapBuilder';

export const EXPANSION_X = 170;

const FOREST = ['tree_forest', 'tree_oak_b', 'tree_pine', 'tree_pine_b', 'bush_dark', 'stump'];
const ROCKY = ['rock_small', 'rock_medium', 'stump', 'bush_dark'];

/** Ruínas de pedra: pátio de calçamento, colunas, estátuas, braseiros e ossos. */
function ruins(b: MapBuilder, cx: number, cy: number, rx: number, ry: number): void {
  b.ellipse(cx, cy, rx, ry, Terrain.Cobble, 0.35);
  b.reserve({ x: cx - rx + 2, y: cy - ry + 1, w: rx * 2 - 3, h: ry * 2 - 1 });
  for (const [dx, dy] of [[-rx + 3, -ry + 2], [rx - 4, -ry + 2], [-rx + 3, ry - 3], [rx - 4, ry - 3], [0, -ry + 1], [0, ry - 2]] as const) b.prop('pillar', cx + dx, cy + dy);
  b.prop('statue', cx, cy - 2).prop('brazier', cx - 4, cy).prop('brazier', cx + 4, cy).prop('bones', cx - 3, cy + 3).prop('bones', cx + 3, cy + 2).prop('banner', cx - 1, cy - ry + 2, { force: true });
}

/** Lagos e charcos. */
function lakes(b: MapBuilder, spots: readonly (readonly [number, number, number, number])[]): void {
  for (const [cx, cy, rx, ry] of spots) b.ellipse(cx, cy, rx, ry, Terrain.Water, 0.35);
}

export function buildExpansion(b: MapBuilder): void {
  // ------------------------------------------------------------------ regiões
  b.region({ id: 'eastlands', name: 'Terras Distantes', x: EXPANSION_X, y: 0, w: 130, h: 128, pz: false, music: 'wild', priority: 1 });
  b.region({ id: 'heath', name: 'Charneca das Presas', x: 172, y: 2, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'whitepeak', name: 'Montanha Branca', x: 172, y: 46, w: 40, h: 38, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'reddunes', name: 'Dunas Rubras', x: 172, y: 86, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'frozenlake', name: 'Lago Congelado', x: 216, y: 2, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'corruptswamp', name: 'Pântano Corrompido', x: 216, y: 46, w: 40, h: 38, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'volcano', name: 'Vulcão Adormecido', x: 216, y: 86, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'infernal', name: 'Portal Infernal', x: 260, y: 2, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'abyss', name: 'Abismo Primordial', x: 260, y: 46, w: 40, h: 80, pz: false, music: 'wild', priority: 2 });

  // ------------------------------------------------------------------ estradas
  // da Cidadela Sombria para leste e a grade que liga as zonas
  b.path([[148, 60], [160, 64], [172, 65], [214, 65], [258, 65], [298, 65]], 3);
  b.path([[192, 6], [192, 64], [192, 124]], 2);
  b.path([[236, 6], [236, 64], [236, 124]], 2);
  b.path([[282, 6], [282, 64], [282, 124]], 2);
  b.path([[192, 22], [236, 22], [282, 22]], 2);
  b.path([[192, 106], [236, 106]], 2);
  b.sign(166, 63, 'Terras Distantes — quanto mais a leste, mais perigosas as criaturas. Leve poções de sobra.');

  // ------------------------------------------------------------------ A1 Charneca das Presas (faixa 7): lobos atrozes (oeste) e ogros (leste)
  b.dark({ x: 172, y: 2, w: 40, h: 40 }, 3);
  b.ellipse(190, 14, 9, 6, Terrain.Dirt, 0.4);
  b.prop('rock_large', 180, 8).prop('rock_large_b', 202, 30).prop('rock_large', 176, 32).prop('bones', 188, 16).prop('bones', 204, 12).prop('totem', 196, 24);
  b.spawn('direwolves_a', 'dire_wolf', 180, 12, 4, 3);
  b.spawn('direwolves_b', 'dire_wolf', 178, 30, 4, 3);
  b.spawn('ogres_a', 'ogre', 202, 16, 3, 3);
  b.spawn('ogres_b', 'ogre', 204, 32, 3, 2);

  // ------------------------------------------------------------------ A2 Montanha Branca (faixa 8): ursos ancestrais (oeste) e cavaleiros esqueléticos (leste)
  b.dark({ x: 172, y: 46, w: 40, h: 38 }, 3);
  ruins(b, 200, 66, 10, 7);
  b.prop('rock_large', 176, 50).prop('rock_large_b', 180, 78).prop('rock_large', 206, 80);
  b.spawn('elderbears_a', 'elder_bear', 180, 54, 4, 3);
  b.spawn('elderbears_b', 'elder_bear', 178, 74, 4, 3);
  b.spawn('skelknights_a', 'skeleton_knight', 202, 62, 3, 3);
  b.spawn('skelknights_b', 'skeleton_knight', 204, 72, 3, 3);

  // ------------------------------------------------------------------ A3 Dunas Rubras (faixa 9): escorpiões rubros (oeste) e senhores da guerra orc (acampamento a leste)
  b.ellipse(192, 106, 18, 14, Terrain.Dirt, 0.5);
  b.ellipse(200, 106, 7, 5, Terrain.Cobble, 0.3);
  b.reserve({ x: 192, y: 99, w: 16, h: 14 });
  for (let x = 193; x <= 207; x++) if (x < 199 || x > 201) b.prop('palisade', x, 99);
  for (let y = 100; y <= 112; y++) {
    b.prop('palisade', 193, y);
    b.prop('palisade', 207, y);
  }
  b.prop('brazier', 197, 104).prop('brazier', 203, 104).prop('tent', 195, 108).prop('tent', 202, 108).prop('totem', 200, 102).prop('banner', 199, 100, { force: true });
  b.prop('rock_large', 178, 92).prop('rock_large_b', 208, 120).prop('rock_large', 178, 120).prop('bones', 210, 94);
  b.spawn('redscorpions_a', 'red_scorpion', 180, 100, 4, 3);
  b.spawn('redscorpions_b', 'red_scorpion', 182, 118, 4, 3);
  b.spawn('warlords_a', 'orc_warlord', 200, 106, 3, 3);
  b.spawn('warlords_b', 'orc_warlord', 197, 110, 2, 2);

  // ------------------------------------------------------------------ B1 Lago Congelado (faixa 10): espectros (oeste) e dragões de gelo (leste)
  b.dark({ x: 216, y: 2, w: 40, h: 40 }, 3);
  lakes(b, [[240, 16, 8, 5], [248, 30, 6, 4.5], [230, 34, 5, 3.5]]);
  b.prop('rock_large', 220, 8).prop('rock_large_b', 252, 8).prop('rock_medium', 240, 38).prop('bones', 236, 24).prop('statue', 250, 14).prop('pillar', 226, 26);
  b.spawn('wraiths_a', 'wraith', 224, 14, 3, 3);
  b.spawn('wraiths_b', 'wraith', 226, 34, 3, 3);
  b.spawn('icedragons_a', 'ice_dragon', 250, 10, 3, 2);
  b.spawn('icedragons_b', 'ice_dragon', 252, 22, 3, 2);

  // ------------------------------------------------------------------ B2 Pântano Corrompido (faixa 11): behemoths (oeste) e cavaleiros da morte (leste)
  b.dark({ x: 216, y: 46, w: 40, h: 38 }, 3);
  lakes(b, [[230, 56, 6, 4], [246, 68, 5, 4], [224, 76, 5, 3.5], [240, 80, 4, 3]]);
  b.prop('bones', 234, 62).prop('bones', 244, 54).prop('totem', 220, 64).prop('rock_large', 250, 78).prop('log', 228, 70);
  b.spawn('behemoths_a', 'behemoth', 222, 56, 4, 3);
  b.spawn('behemoths_b', 'behemoth', 222, 66, 3, 2);
  b.spawn('deathknights_a', 'death_knight', 248, 62, 3, 3);
  b.spawn('deathknights_b', 'death_knight', 250, 52, 3, 2);

  // ------------------------------------------------------------------ B3 Vulcão Adormecido (faixa 12): dracos flamejantes (oeste) e golens de pedra (leste)
  b.ellipse(236, 106, 18, 14, Terrain.Dirt, 0.5);
  b.dark({ x: 216, y: 86, w: 40, h: 40 }, 4);
  for (const [x, y] of [[222, 92], [250, 92], [222, 120], [250, 120]] as const) b.prop('rock_large', x, y);
  b.prop('brazier', 232, 104).prop('brazier', 240, 104).prop('brazier', 236, 112).prop('bones', 226, 108).prop('bones', 246, 110).prop('statue', 236, 100).prop('totem', 218, 106);
  b.spawn('firedrakes_a', 'fire_drake', 224, 100, 4, 3);
  b.spawn('firedrakes_b', 'fire_drake', 226, 116, 4, 3);
  b.spawn('golems_a', 'stone_golem', 248, 104, 3, 3);
  b.spawn('golems_b', 'stone_golem', 250, 118, 3, 2);

  // ------------------------------------------------------------------ C1 Portal Infernal (faixa 13): demônios (oeste) e arquiliches (leste)
  b.dark({ x: 260, y: 2, w: 40, h: 40 }, 3);
  ruins(b, 280, 22, 13, 10);
  b.spawn('demons_a', 'demon', 266, 16, 4, 3);
  b.spawn('demons_b', 'demon', 268, 32, 3, 3);
  b.spawn('archliches_a', 'arch_lich', 292, 14, 3, 2);
  b.spawn('archliches_b', 'arch_lich', 292, 30, 3, 2);

  // ------------------------------------------------------------------ C2 Abismo Primordial (faixa 14): dragões ancestrais (oeste) e horrores do vazio (leste)
  b.dark({ x: 260, y: 46, w: 40, h: 80 }, 4);
  ruins(b, 282, 70, 14, 10);
  ruins(b, 282, 108, 12, 9);
  b.spawn('elderdragons_a', 'elder_dragon', 266, 64, 3, 1);
  b.spawn('elderdragons_b', 'elder_dragon', 266, 104, 3, 1);
  b.spawn('voidhorrors_a', 'void_horror', 294, 56, 4, 3);
  b.spawn('voidhorrors_b', 'void_horror', 294, 84, 4, 3);
  b.spawn('voidhorrors_c', 'void_horror', 294, 112, 4, 3);

  // ------------------------------------------------------------------ vegetação e decoração
  b.scatter({ x: 172, y: 2, w: 40, h: 40 }, { props: FOREST, density: 0.16, salt: 101, spacing: 1 });
  b.scatter({ x: 172, y: 46, w: 40, h: 38 }, { props: ['tree_pine', 'tree_pine_b', ...ROCKY], density: 0.13, salt: 102, spacing: 1 });
  b.scatter({ x: 172, y: 86, w: 40, h: 40 }, { props: ['rock_small', 'rock_medium', 'stump'], density: 0.06, salt: 103, spacing: 1 });
  b.scatter({ x: 216, y: 2, w: 40, h: 40 }, { props: ['tree_pine', 'tree_pine_b', 'rock_small', 'rock_medium'], density: 0.12, salt: 104, spacing: 1 });
  b.scatter({ x: 216, y: 46, w: 40, h: 38 }, { props: ['tree_forest', 'bush_dark', 'stump', 'tree_forest'], density: 0.14, salt: 105, spacing: 1 });
  b.scatter({ x: 216, y: 86, w: 40, h: 40 }, { props: ['rock_small', 'rock_medium', 'bush_dark', 'stump'], density: 0.09, salt: 106, spacing: 1 });
  b.scatter({ x: 260, y: 2, w: 40, h: 40 }, { props: ['rock_small', 'rock_medium', 'bush_dark', 'stump'], density: 0.08, salt: 107, spacing: 1 });
  b.scatter({ x: 260, y: 46, w: 40, h: 80 }, { props: ['rock_small', 'rock_medium', 'bush_dark', 'stump', 'tree_forest'], density: 0.08, salt: 108, spacing: 1 });
  b.scatterDecor({ x: 172, y: 2, w: 126, h: 122 }, ['decor_pebbles', 'decor_tallgrass', 'decor_leaves', 'decor_crack', 'decor_mushrooms'], 0.07, 110);
}
