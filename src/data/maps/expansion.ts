// Expansão leste: duas vilas (Forte Esperança e Cidadela Celeste) e oito zonas de caça para os níveis 44 a 100.
//
//            A (x 172–212)         B (x 216–256)         C (x 260–300)
//   R1 y 2–42    Charneca (T7)         Montanha Branca (T8)  Lago Congelado (T10)
//   R2 y 46–82   Forte Esperança       planície              Cidadela Celeste
//   R3 y 86–126  Pântano (T11)         Dunas Rubras (T9)     Portal Infernal (T13)
//   R4 y 130–198 Vulcão (T12, A+B)                           Abismo Primordial (T14)
import { Terrain, type MapBuilder } from '../../game/world/MapBuilder';

export const EXPANSION_X = 170;

const FOREST = ['tree_forest', 'tree_oak_b', 'tree_pine', 'tree_pine_b', 'bush_dark', 'stump'];
const ROCKY = ['rock_small', 'rock_medium', 'stump', 'bush_dark'];

export function buildExpansion(b: MapBuilder): void {
  // ------------------------------------------------------------------ regiões
  b.region({ id: 'eastlands', name: 'Terras Distantes', x: EXPANSION_X, y: 0, w: 160, h: 200, pz: false, music: 'wild', priority: 1 });
  b.region({ id: 'fort', name: 'Forte Esperança', x: 172, y: 46, w: 42, h: 38, pz: false, city: true, music: 'town', priority: 3 });
  b.region({ id: 'celestial', name: 'Cidadela Celeste', x: 262, y: 46, w: 42, h: 38, pz: false, city: true, music: 'town', priority: 3 });
  b.region({ id: 'heath', name: 'Charneca das Presas', x: 172, y: 2, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'whitepeak', name: 'Montanha Branca', x: 216, y: 2, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'frozenlake', name: 'Lago Congelado', x: 260, y: 2, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'corruptswamp', name: 'Pântano Corrompido', x: 172, y: 86, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'reddunes', name: 'Dunas Rubras', x: 216, y: 86, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'infernal', name: 'Portal Infernal', x: 260, y: 86, w: 40, h: 40, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'volcano', name: 'Vulcão Adormecido', x: 172, y: 130, w: 84, h: 66, pz: false, music: 'wild', priority: 2 });
  b.region({ id: 'abyss', name: 'Abismo Primordial', x: 260, y: 130, w: 66, h: 66, pz: false, music: 'wild', priority: 2 });

  // mar ao sul do mundo antigo (o canto sudoeste do mapa não tem caça; a água fecha o horizonte)
  b.rect({ x: 0, y: 122, w: 170, h: 78 }, Terrain.Water);
  b.ellipse(120, 121, 60, 4, Terrain.Water, 0.5);

  // ------------------------------------------------------------------ estradas
  // espinha leste-oeste a partir da Cidadela Sombria, passando pelas duas vilas
  b.path([[148, 60], [160, 62], [172, 62], [214, 62], [262, 62], [304, 62]], 3, Terrain.Cobble);
  // ligações norte-sul e entre as zonas
  b.path([[192, 6], [192, 44], [192, 84], [192, 128]], 2);
  b.path([[236, 6], [236, 62], [236, 128], [236, 170]], 2);
  b.path([[282, 6], [282, 44], [282, 84], [282, 128], [282, 190]], 2);
  b.path([[192, 22], [236, 22], [282, 22]], 2);
  b.path([[192, 106], [236, 106], [282, 106]], 2);
  b.path([[192, 150], [236, 150], [282, 150], [310, 150]], 2);
  b.sign(166, 63, 'Terras Distantes — a leste, o Forte Esperança. Mais além, perigo de verdade.');

  // ------------------------------------------------------------------ Forte Esperança (equipamento nível 24–56)
  town(b, { prefix: 'e', name: 'Forte Esperança', x: 174, y: 48, plazaX: 192, plazaY: 64 });
  // ------------------------------------------------------------------ Cidadela Celeste (equipamento nível 64–100)
  town(b, { prefix: 'f', name: 'Cidadela Celeste', x: 264, y: 48, plazaX: 282, plazaY: 64 });

  // ------------------------------------------------------------------ zonas de caça
  // R1A — Charneca das Presas (faixa 7): lobos atrozes e ogros
  b.dark({ x: 172, y: 2, w: 40, h: 40 }, 3);
  b.ellipse(190, 14, 9, 6, Terrain.Dirt, 0.4);
  b.prop('rock_large', 180, 8).prop('rock_large_b', 202, 30).prop('rock_large', 176, 32).prop('bones', 188, 16).prop('bones', 204, 12).prop('totem', 196, 24);
  b.spawn('direwolves_a', 'dire_wolf', 186, 12, 4, 3);
  b.spawn('direwolves_b', 'dire_wolf', 204, 26, 4, 3);
  b.spawn('direwolves_c', 'dire_wolf', 180, 34, 3, 2);
  b.spawn('ogres_a', 'ogre', 198, 18, 3, 3);
  b.spawn('ogres_b', 'ogre', 190, 36, 3, 2);

  // R1B — Montanha Branca (faixa 8): ursos ancestrais e cavaleiros esqueléticos
  b.dark({ x: 216, y: 2, w: 40, h: 40 }, 3);
  b.ellipse(236, 22, 10, 7, Terrain.Cobble, 0.5);
  b.reserve({ x: 226, y: 15, w: 20, h: 14 });
  for (const [x, y] of [[228, 16], [244, 16], [228, 28], [244, 28], [236, 14]] as const) b.prop('pillar', x, y);
  b.prop('statue', 236, 20).prop('brazier', 232, 22).prop('brazier', 240, 22).prop('bones', 230, 26).prop('bones', 242, 24).prop('banner', 234, 15, { force: true });
  b.prop('rock_large', 220, 8).prop('rock_large_b', 250, 36).prop('rock_large', 222, 36);
  b.spawn('elderbears_a', 'elder_bear', 222, 10, 4, 3);
  b.spawn('elderbears_b', 'elder_bear', 250, 12, 4, 3);
  b.spawn('elderbears_c', 'elder_bear', 224, 36, 3, 2);
  b.spawn('skelknights_a', 'skeleton_knight', 234, 22, 3, 3);
  b.spawn('skelknights_b', 'skeleton_knight', 240, 26, 3, 3);

  // R1C — Lago Congelado (faixa 10): dragões de gelo e espectros
  b.dark({ x: 260, y: 2, w: 40, h: 40 }, 3);
  for (const [cx, cy, rx, ry] of [[276, 16, 8, 5], [292, 26, 6, 4.5], [270, 32, 5, 3.5]] as const) b.ellipse(cx, cy, rx, ry, Terrain.Water, 0.3);
  b.prop('rock_large', 264, 8).prop('rock_large_b', 296, 8).prop('rock_medium', 284, 36).prop('bones', 280, 22).prop('statue', 290, 12).prop('pillar', 268, 24);
  b.spawn('icedragons_a', 'ice_dragon', 278, 10, 3, 2);
  b.spawn('icedragons_b', 'ice_dragon', 292, 18, 3, 2);
  b.spawn('wraiths_a', 'wraith', 270, 22, 3, 3);
  b.spawn('wraiths_b', 'wraith', 286, 34, 3, 3);

  // R3A — Pântano Corrompido (faixa 11): behemoths e cavaleiros da morte
  b.dark({ x: 172, y: 86, w: 40, h: 40 }, 3);
  for (const [cx, cy, rx, ry] of [[186, 96, 6, 4], [204, 108, 5, 4], [180, 116, 5, 3.5], [196, 120, 4, 3]] as const) b.ellipse(cx, cy, rx, ry, Terrain.Water, 0.35);
  b.prop('bones', 190, 102).prop('bones', 200, 96).prop('totem', 176, 104).prop('rock_large', 208, 118).prop('log', 184, 108);
  b.spawn('behemoths_a', 'behemoth', 196, 100, 4, 3);
  b.spawn('behemoths_b', 'behemoth', 182, 122, 3, 2);
  b.spawn('deathknights_a', 'death_knight', 204, 114, 3, 3);
  b.spawn('deathknights_b', 'death_knight', 188, 90, 3, 2);

  // R3B — Dunas Rubras (faixa 9): escorpiões rubros e senhores da guerra orc (acampamento no centro)
  b.ellipse(236, 106, 18, 14, Terrain.Dirt, 0.5);
  b.ellipse(236, 106, 7, 5, Terrain.Cobble, 0.3);
  b.reserve({ x: 228, y: 99, w: 16, h: 14 });
  for (let x = 229; x <= 243; x++) if (x < 235 || x > 237) b.prop('palisade', x, 99);
  for (let y = 100; y <= 112; y++) {
    b.prop('palisade', 229, y);
    b.prop('palisade', 243, y);
  }
  b.prop('brazier', 233, 104).prop('brazier', 239, 104).prop('tent', 231, 108).prop('tent', 238, 108).prop('totem', 236, 102).prop('banner', 235, 100, { force: true });
  b.prop('rock_large', 222, 92).prop('rock_large_b', 250, 120).prop('rock_large', 222, 120).prop('bones', 246, 94).prop('bones', 226, 118);
  b.spawn('redscorpions_a', 'red_scorpion', 222, 100, 4, 3);
  b.spawn('redscorpions_b', 'red_scorpion', 250, 108, 4, 3);
  b.spawn('redscorpions_c', 'red_scorpion', 236, 120, 4, 2);
  b.spawn('warlords_a', 'orc_warlord', 236, 106, 3, 3);
  b.spawn('warlords_b', 'orc_warlord', 232, 110, 2, 2);

  // R3C — Portal Infernal (faixa 13): demônios e arquiliches em ruínas escuras
  b.dark({ x: 260, y: 86, w: 40, h: 40 }, 3);
  b.ellipse(280, 106, 13, 10, Terrain.Cobble, 0.3);
  b.reserve({ x: 268, y: 96, w: 26, h: 20 });
  for (const [x, y] of [[270, 98], [278, 96], [286, 96], [292, 98], [270, 114], [292, 114], [280, 116]] as const) b.prop('pillar', x, y);
  b.prop('statue', 280, 100).prop('brazier', 274, 104).prop('brazier', 286, 104).prop('brazier', 280, 112).prop('bones', 272, 110).prop('bones', 290, 108).prop('banner', 277, 97, { force: true }).prop('banner', 283, 97, { force: true });
  b.spawn('demons_a', 'demon', 276, 104, 4, 3);
  b.spawn('demons_b', 'demon', 290, 112, 3, 3);
  b.spawn('archliches_a', 'arch_lich', 282, 100, 3, 2);
  b.spawn('archliches_b', 'arch_lich', 270, 116, 3, 2);

  // R4AB — Vulcão Adormecido (faixa 12): dracos flamejantes e golens de pedra
  b.ellipse(214, 164, 26, 18, Terrain.Dirt, 0.5);
  b.dark({ x: 172, y: 130, w: 84, h: 66 }, 4);
  for (const [x, y] of [[196, 140], [206, 138], [226, 140], [236, 142], [200, 176], [230, 178]] as const) b.prop('rock_large', x, y);
  b.prop('brazier', 210, 160).prop('brazier', 220, 160).prop('brazier', 215, 168).prop('bones', 204, 150).prop('bones', 232, 164).prop('statue', 215, 156).prop('totem', 190, 170);
  b.spawn('firedrakes_a', 'fire_drake', 204, 156, 4, 3);
  b.spawn('firedrakes_b', 'fire_drake', 230, 168, 4, 3);
  b.spawn('firedrakes_c', 'fire_drake', 214, 186, 3, 2);
  b.spawn('golems_a', 'stone_golem', 188, 150, 3, 3);
  b.spawn('golems_b', 'stone_golem', 240, 152, 3, 3);
  b.spawn('golems_c', 'stone_golem', 192, 184, 3, 2);

  // R4C — Abismo Primordial (faixa 14): dragões ancestrais e horrores do vazio
  b.dark({ x: 260, y: 130, w: 66, h: 66 }, 4);
  b.ellipse(292, 164, 18, 14, Terrain.Cobble, 0.4);
  b.reserve({ x: 276, y: 150, w: 34, h: 28 });
  for (const [x, y] of [[278, 152], [290, 150], [302, 152], [278, 176], [302, 176], [290, 178]] as const) b.prop('pillar', x, y);
  b.prop('statue', 290, 156).prop('statue', 284, 164).prop('statue', 298, 164).prop('brazier', 288, 160).prop('brazier', 296, 160).prop('bones', 282, 172).prop('bones', 300, 170).prop('banner', 288, 151, { force: true });
  b.spawn('elderdragons_a', 'elder_dragon', 292, 166, 3, 1);
  b.spawn('elderdragons_b', 'elder_dragon', 270, 184, 3, 1);
  b.spawn('voidhorrors_a', 'void_horror', 276, 142, 4, 3);
  b.spawn('voidhorrors_b', 'void_horror', 310, 160, 4, 3);
  b.spawn('voidhorrors_c', 'void_horror', 300, 186, 4, 3);

  // ------------------------------------------------------------------ vegetação e decoração
  b.scatter({ x: 172, y: 2, w: 40, h: 40 }, { props: FOREST, density: 0.16, salt: 101, spacing: 1 });
  b.scatter({ x: 216, y: 2, w: 40, h: 40 }, { props: ['tree_pine', 'tree_pine_b', ...ROCKY], density: 0.13, salt: 102, spacing: 1 });
  b.scatter({ x: 260, y: 2, w: 40, h: 40 }, { props: ['tree_pine', 'tree_pine_b', 'rock_small', 'rock_medium'], density: 0.12, salt: 103, spacing: 1 });
  b.scatter({ x: 172, y: 86, w: 40, h: 40 }, { props: ['tree_forest', 'bush_dark', 'stump', 'tree_forest'], density: 0.14, salt: 104, spacing: 1 });
  b.scatter({ x: 216, y: 86, w: 40, h: 40 }, { props: ['rock_small', 'rock_medium', 'stump'], density: 0.06, salt: 105, spacing: 1 });
  b.scatter({ x: 260, y: 86, w: 40, h: 40 }, { props: ['rock_small', 'rock_medium', 'bush_dark', 'stump'], density: 0.08, salt: 106, spacing: 1 });
  b.scatter({ x: 172, y: 130, w: 84, h: 66 }, { props: ['rock_small', 'rock_medium', 'bush_dark', 'stump'], density: 0.09, salt: 107, spacing: 1 });
  b.scatter({ x: 260, y: 130, w: 66, h: 66 }, { props: ['rock_small', 'rock_medium', 'bush_dark', 'stump', 'tree_forest'], density: 0.08, salt: 108, spacing: 1 });
  b.scatter({ x: 216, y: 46, w: 44, h: 38 }, { props: ['tree_oak', 'bush', 'bush_flower', 'rock_small'], density: 0.07, salt: 109, spacing: 1 });
  b.scatterDecor({ x: 172, y: 2, w: 150, h: 192 }, ['decor_pebbles', 'decor_tallgrass', 'decor_leaves', 'decor_crack', 'decor_mushrooms'], 0.07, 110);
}

interface TownSpec {
  /** Prefixo dos NPCs (e_, f_). */
  prefix: string;
  name: string;
  x: number;
  y: number;
  plazaX: number;
  plazaY: number;
}

/** Vila: praça de pedra, santuário, ferraria, arcana, alquimia, banco e uma casa. Ruas livres; área protegida só nas construções. */
function town(b: MapBuilder, t: TownSpec): void {
  const { x, y, plazaX, plazaY, prefix: p } = t;
  b.ellipse(plazaX, plazaY, 13, 8, Terrain.Cobble, 0.2);
  b.reserve({ x: x - 2, y: y - 2, w: 42, h: 36 });
  b.prop('fountain', plazaX - 1, plazaY);
  for (const [dx, dy] of [[-10, -4], [10, -4], [-10, 5], [10, 5]] as const) b.prop('lamp_post', plazaX + dx, plazaY + dy);
  b.prop('bench', plazaX - 6, plazaY + 3).prop('bench', plazaX + 5, plazaY + 3).prop('planter', plazaX - 4, plazaY - 4).prop('planter', plazaX + 4, plazaY - 4);
  // fileira norte: santuário, ferraria, arcana
  b.building({ id: `${p}_temple`, name: `Santuário de ${t.name}`, x, y, w: 11, h: 9, wall: 'marble', interior: 'temple', floor: 'marble', roof: 'slate', doorX: x + 5, windows: [x + 2, x + 8], interiorWindows: [x + 3], sideWindows: [{ side: 'l', y: y + 4 }, { side: 'r', y: y + 4 }] });
  b.prop('altar', x + 4, y + 3).prop('brazier', x + 2, y + 3).prop('brazier', x + 8, y + 3).prop('pillar', x + 2, y + 5).prop('pillar', x + 8, y + 5);
  b.npc(`${p}_priest`, x + 5, y + 4, 'down');
  b.building({ id: `${p}_smith`, name: `Ferraria de ${t.name}`, x: x + 14, y, w: 9, h: 9, wall: 'stone', interior: 'stone', floor: 'stone', roof: 'red', doorX: x + 18, windows: [x + 16, x + 20], interiorWindows: [], chimneyX: x + 16, sideWindows: [] });
  b.prop('anvil', x + 15, y + 3).prop('weapon_rack', x + 19, y + 3).prop('armor_stand', x + 21, y + 3).prop('counter', x + 16, y + 4).prop('barrel', x + 21, y + 6);
  b.npc(`${p}_smith`, x + 17, y + 3, 'down');
  b.building({ id: `${p}_arcana`, name: `Arcana de ${t.name}`, x: x + 26, y, w: 9, h: 9, wall: 'plaster', interior: 'wood', floor: 'wood', roof: 'blue', doorX: x + 30, windows: [x + 28, x + 32], interiorWindows: [x + 28], sideWindows: [] });
  b.prop('bookshelf', x + 27, y + 3).prop('bookshelf', x + 33, y + 3).prop('counter', x + 28, y + 4).prop('candle', x + 33, y + 6).prop('plant', x + 27, y + 6);
  b.npc(`${p}_arcana`, x + 31, y + 3, 'down');
  // fileira sul: alquimia, banco, casa
  const ys = y + 22;
  b.building({ id: `${p}_alchemy`, name: `Alquimia de ${t.name}`, x, y: ys, w: 9, h: 9, wall: 'plaster', interior: 'wood', floor: 'wood', roof: 'green', doorX: x + 4, windows: [x + 2, x + 6], interiorWindows: [x + 2], chimneyX: x + 6, sideWindows: [] });
  b.prop('potion_shelf', x + 2, y + 25).prop('cauldron', x + 7, y + 25).prop('counter', x + 3, y + 26).prop('plant', x + 2, y + 28);
  b.npc(`${p}_alchemist`, x + 5, y + 25, 'down');
  b.building({ id: `${p}_bank`, name: `Banco de ${t.name}`, x: x + 13, y: ys, w: 11, h: 9, wall: 'stone', interior: 'stone', floor: 'marble', roof: 'blue', doorX: x + 18, windows: [x + 15, x + 21], interiorWindows: [], sideWindows: [] });
  b.prop('counter', x + 16, y + 26).prop('chest', x + 14, y + 25).prop('chest', x + 22, y + 25).prop('bookshelf', x + 20, y + 25);
  b.npc(`${p}_banker`, x + 18, y + 25, 'down');
  b.building({ id: `${p}_house`, name: `Casa em ${t.name}`, x: x + 27, y: ys, w: 8, h: 9, wall: 'plaster', interior: 'wood', floor: 'wood', roof: 'blue', doorX: x + 30, windows: [x + 28, x + 32], interiorWindows: [], sideWindows: [] });
  b.prop('bed', x + 28, y + 25).prop('wardrobe', x + 29, y + 24).prop('table', x + 31, y + 26).prop('chair', x + 33, y + 26).prop('fireplace', x + 32, y + 24);
  // portal da vila (na praça)
  const px = plazaX - 8;
  const py = plazaY + 1;
  b.prop('brazier', px - 1, py + 1).prop('brazier', px + 1, py + 1).prop('pillar', px - 2, py).prop('pillar', px + 2, py);
  b.npc(`${p}_portal`, px, py, 'down');
  b.sign(x + 14, y + 10, `${t.name} — santuário, ferraria, arcana, alquimia e banco.`);
  // ruas ligando as portas à praça
  for (const dx of [5, 18, 30]) b.path([[x + dx, y + 10], [x + dx, y + 14]], 2, Terrain.Cobble);
  for (const dx of [4, 18, 30]) b.path([[x + dx, y + 21], [x + dx, y + 18]], 2, Terrain.Cobble);
}
