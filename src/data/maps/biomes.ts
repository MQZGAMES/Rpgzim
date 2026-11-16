// Os quatro braços de biomas ao redor de Pedraluz (nov/2026). Cada braço (norte, leste, sul, oeste) tem cinco zonas,
// uma por anel de distância da muralha; quanto mais longe, mais fortes as criaturas (ver layout.ts). Na mesma faixa
// de nível, as direções têm algumas criaturas em comum e outras próprias do bioma.
//
//   anel  nível     norte (gelo)          leste (sol)            sul (água)              oeste (montanhas)
//   1     1–8       Campos do Norte       Campos do Leste        Margem do Pântano       Colinas Verdes
//   2     9–20      Taiga dos Pinheiros   Savana Dourada         Pântano Sombrio         Ruínas Antigas
//   3     20–42     Tundra Uivante        Mar de Areia           Selva Alagada           Montanhas de Ferro
//   4     44–71     Geleira Eterna        Dunas Rubras           Pântano Corrompido      Charneca das Presas
//   5     72–103    Pico do Inverno       Vulcão Adormecido      Necrópole Esquecida     Abismo Primordial
//
// Estradas saem dos quatro portões e um anel viário liga os braços; nas estradas há santuários (áreas protegidas, sem
// lojas) no começo do anel 3 e do anel 5. Entre os braços, nos anéis externos, cristas de pedra (com passagens)
// separam os biomas.
import { Biome, Terrain, type MapBuilder } from '../../game/world/MapBuilder';
import { MONSTERS } from '../monsters';
import {
  RINGS,
  TOWN_BOX,
  TOWN_CX,
  TOWN_CY,
  WORLD_H,
  WORLD_W,
  armPoint,
  ringOf,
  sectorAt,
  townDistance,
  type Sector,
} from './layout';

type Pt = { x: number; y: number };

interface SpawnSpec {
  monster: string;
  /** Pontos de surgimento (padrão 3) e criaturas por ponto (padrão 3 até o anel 3, 4 nos anéis 4 e 5). */
  points?: number;
  count?: number;
  radius?: number;
  /** Surge em volta deste marco (acampamento, ruína, covil), em vez de espalhado pela zona. */
  near?: Pt;
}

interface ZoneSpec {
  id: string;
  name: string;
  sector: Sector;
  ring: number;
  biome: Biome;
  dark?: boolean;
  props: readonly string[];
  propDensity: number;
  decor: readonly string[];
  decorDensity: number;
  species: SpawnSpec[];
}

/** Bioma de cada braço por anel (chão). */
const BIOMES: Record<Sector, readonly { biome: Biome; dark?: boolean }[]> = {
  N: [{ biome: Biome.Grass }, { biome: Biome.Grass, dark: true }, { biome: Biome.Snow }, { biome: Biome.Snow }, { biome: Biome.Snow, dark: true }],
  E: [{ biome: Biome.Grass }, { biome: Biome.Dry }, { biome: Biome.Sand }, { biome: Biome.Sand, dark: true }, { biome: Biome.Ash }],
  S: [{ biome: Biome.Grass }, { biome: Biome.Mud }, { biome: Biome.Grass, dark: true }, { biome: Biome.Mud, dark: true }, { biome: Biome.Ash, dark: true }],
  W: [{ biome: Biome.Grass }, { biome: Biome.Grass }, { biome: Biome.Grass, dark: true }, { biome: Biome.Dry, dark: true }, { biome: Biome.Ash, dark: true }],
};

/** Árvores e pedras da borda do mundo, por braço. */
const BORDER: Record<Sector, readonly string[]> = {
  N: ['tree_pine_snow', 'tree_pine_snow_b', 'rock_snow'],
  E: ['rock_basalt', 'rock_red', 'tree_dead_b'],
  S: ['tree_swamp', 'tree_dead', 'tree_swamp'],
  W: ['rock_medium', 'tree_dead_b', 'rock_basalt'],
};

// ------------------------------------------------------------------ estradas
const GATE = {
  N: { x: TOWN_BOX.x0 + 22, y: TOWN_BOX.y0 },
  S: { x: TOWN_BOX.x0 + 35, y: TOWN_BOX.y1 },
  E: { x: TOWN_BOX.x1, y: TOWN_BOX.y0 + 20 },
  W: { x: TOWN_BOX.x0, y: TOWN_BOX.y0 + 20 },
} as const;

const ROADS: readonly (readonly [number, number][])[] = [
  // norte: do portão, desvia para o meio do braço e sobe reto
  [[GATE.N.x, GATE.N.y], [GATE.N.x, GATE.N.y - 6], [TOWN_CX, GATE.N.y - 16], [TOWN_CX, 4]],
  // sul: reto
  [[GATE.S.x, GATE.S.y], [GATE.S.x, WORLD_H - 4]],
  // leste e oeste: do portão (avenida), descem para o meio do braço
  [[GATE.E.x, GATE.E.y], [GATE.E.x + 8, GATE.E.y], [GATE.E.x + 18, TOWN_CY], [WORLD_W - 4, TOWN_CY]],
  [[GATE.W.x, GATE.W.y], [GATE.W.x - 8, GATE.W.y], [GATE.W.x - 18, TOWN_CY], [4, TOWN_CY]],
];
/** Anel viário a 23 tiles da muralha: liga os quatro braços sem passar pela vila. */
const RING_ROAD_D = 23;
const RING_ROAD: readonly [number, number][] = [
  [TOWN_BOX.x0 - RING_ROAD_D, TOWN_BOX.y0 - RING_ROAD_D],
  [TOWN_BOX.x1 + RING_ROAD_D, TOWN_BOX.y0 - RING_ROAD_D],
  [TOWN_BOX.x1 + RING_ROAD_D, TOWN_BOX.y1 + RING_ROAD_D],
  [TOWN_BOX.x0 - RING_ROAD_D, TOWN_BOX.y1 + RING_ROAD_D],
  [TOWN_BOX.x0 - RING_ROAD_D, TOWN_BOX.y0 - RING_ROAD_D],
];

function segDist(p: Pt, a: readonly [number, number], b: readonly [number, number]): number {
  const [ax, ay] = a;
  const [bx, by] = b;
  const vx = bx - ax;
  const vy = by - ay;
  const len = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / len));
  return Math.hypot(p.x - (ax + vx * t), p.y - (ay + vy * t));
}
/** Distância até as estradas dos braços e até o anel viário (que conta como 2 tiles mais longe: é só uma trilha). */
function roadDist(p: Pt): number {
  let best = Infinity;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) best = Math.min(best, segDist(p, r[i]!, r[i + 1]!));
  for (let i = 0; i < RING_ROAD.length - 1; i++) best = Math.min(best, segDist(p, RING_ROAD[i]!, RING_ROAD[i + 1]!) + 2);
  return best;
}

// ------------------------------------------------------------------ marcos (acampamentos, ruínas, lagos, covis)
const at = (s: Sector, d: number, t: number): Pt => armPoint(s, d, t);
const M = {
  // norte
  northPond: at('N', 8, -0.55),
  banditCamp: at('N', 28, 0.5),
  tundraPond: at('N', 40, -0.5),
  yetiDen: at('N', 45, 0.55),
  frozenLake: at('N', 57, -0.4),
  glacierCrystals: at('N', 60, 0.45),
  peakCrystals: at('N', 77, 0.35),
  // leste
  goblinCamp: at('E', 9, 0.5),
  waterhole: at('E', 18, -0.5),
  orcCamp: at('E', 29, 0.45),
  oasis: at('E', 35, -0.55),
  pharaohRuins: at('E', 44, 0.45),
  warCamp: at('E', 58, 0.4),
  lavaLake: at('E', 76, -0.45),
  crater: at('E', 80, 0.5),
  // sul
  marshPonds: at('S', 7, -0.5),
  swampPond: at('S', 28, 0.45),
  jungleLake: at('S', 37, -0.45),
  jungleLake2: at('S', 43, 0.5),
  corruptPond: at('S', 57, -0.45),
  necropolis: at('S', 74, -0.4),
  crypt: at('S', 80, 0.45),
  // oeste
  hillRocks: at('W', 8, 0.5),
  ruins: at('W', 29, -0.45),
  ruins2: at('W', 18, 0.5),
  orcFort: at('W', 40, -0.5),
  goblinWarCamp: at('W', 35, 0.55),
  citadel: at('W', 44, 0.3),
  lichCrypt: at('W', 46, -0.15),
  dragonLair: at('W', 58, 0.45),
  infernalPortal: at('W', 75, -0.45),
  abyssRuins: at('W', 80, 0.45),
} as const;

/** Santuários (área protegida, sem lojas) ao lado da estrada no começo dos anéis 3 e 5. */
const SHRINE_NAMES: Record<Sector, readonly string[]> = {
  N: ['Santuário da Taiga', 'Santuário da Tundra', 'Santuário da Geleira', 'Santuário do Pico'],
  E: ['Santuário da Savana', 'Santuário do Deserto', 'Santuário das Dunas', 'Santuário do Vulcão'],
  S: ['Santuário do Pântano', 'Santuário da Selva', 'Santuário do Brejo Morto', 'Santuário da Necrópole'],
  W: ['Santuário das Ruínas', 'Santuário das Montanhas', 'Santuário da Charneca', 'Santuário do Abismo'],
};
/**
 * Santuários (área protegida, sem lojas): na estrada, no começo dos anéis 2 a 5, e mais dois no anel 4 de cada braço,
 * longe da estrada — quem caça nas laterais largas dos anéis externos também tem onde se abrigar perto.
 */
const SHRINES: { s: Sector; d: number; t: number; name: string }[] = (['N', 'E', 'S', 'W'] as const).flatMap((s) => [
  ...[16, 33, 50, 68].map((d, i) => ({ s, d, t: 0, name: SHRINE_NAMES[s][i]! })),
  { s, d: 58, t: -0.6, name: `${SHRINE_NAMES[s][2]!} (oeste)` },
  { s, d: 58, t: 0.6, name: `${SHRINE_NAMES[s][2]!} (leste)` },
]).map((sh) => (sh.s === 'E' || sh.s === 'W' ? { ...sh, name: sh.name.replace('(oeste)', '(norte)').replace('(leste)', '(sul)') } : sh));
/** Canto superior esquerdo de cada santuário (7×6), ao lado da estrada (ou no ponto lateral do braço). */
function shrineRect(sh: { s: Sector; d: number; t: number }): { x: number; y: number; w: number; h: number } {
  if (sh.t !== 0) {
    const q = armPoint(sh.s, sh.d, sh.t);
    return { x: q.x - 3, y: q.y - 3, w: 7, h: 6 };
  }
  const p = armPoint(sh.s, sh.d, 0);
  const road = sh.s === 'N' ? { x: TOWN_CX, y: p.y } : sh.s === 'S' ? { x: GATE.S.x, y: p.y } : { x: p.x, y: TOWN_CY };
  if (sh.s === 'N' || sh.s === 'S') return { x: road.x + 4, y: road.y - 3, w: 7, h: 6 };
  // leste/oeste: abaixo da estrada (acima dela, perto da vila, passa o trecho em diagonal que vem do portão)
  return { x: road.x - 3, y: road.y + 3, w: 7, h: 6 };
}

// ------------------------------------------------------------------ zonas
const ZONES: ZoneSpec[] = [
  // ---- norte (gelo)
  { id: 'north_fields', name: 'Campos do Norte', sector: 'N', ring: 0, biome: Biome.Grass, props: ['tree_oak', 'tree_pine', 'bush', 'rock_small'], propDensity: 0.06, decor: ['decor_flowers_white', 'decor_tallgrass', 'decor_pebbles'], decorDensity: 0.06, species: [{ monster: 'slime' }, { monster: 'boar' }] },
  { id: 'taiga', name: 'Taiga dos Pinheiros', sector: 'N', ring: 1, biome: Biome.Grass, dark: true, props: ['tree_pine', 'tree_pine_b', 'tree_pine', 'tree_pine_snow', 'bush_dark'], propDensity: 0.15, decor: ['decor_leaves', 'decor_mushrooms', 'decor_pebbles'], decorDensity: 0.07, species: [{ monster: 'wolf' }, { monster: 'bandit', near: M.banditCamp }, { monster: 'bear' }] },
  { id: 'tundra', name: 'Tundra Uivante', sector: 'N', ring: 2, biome: Biome.Snow, props: ['tree_pine_snow', 'tree_pine_snow_b', 'rock_snow', 'tree_dead'], propDensity: 0.08, decor: ['decor_snow_tuft', 'decor_ice_crack'], decorDensity: 0.07, species: [{ monster: 'ice_wolf' }, { monster: 'cave_bear' }, { monster: 'yeti', near: M.yetiDen }] },
  { id: 'glacier', name: 'Geleira Eterna', sector: 'N', ring: 3, biome: Biome.Snow, props: ['tree_pine_snow_b', 'rock_snow', 'crystal_ice', 'rock_snow_large'], propDensity: 0.05, decor: ['decor_ice_crack', 'decor_snow_tuft'], decorDensity: 0.06, species: [{ monster: 'elder_bear' }, { monster: 'ice_dragon', near: M.frozenLake }, { monster: 'wraith', near: M.glacierCrystals }] },
  { id: 'peak', name: 'Pico do Inverno', sector: 'N', ring: 4, biome: Biome.Snow, dark: true, props: ['rock_snow', 'crystal_ice', 'rock_snow_large', 'crystal_ice'], propDensity: 0.05, decor: ['decor_snow_tuft', 'decor_ice_crack'], decorDensity: 0.05, species: [{ monster: 'storm_wolf' }, { monster: 'crystal_scorpion', near: M.peakCrystals }, { monster: 'frost_colossus' }] },
  // ---- leste (sol)
  { id: 'east_fields', name: 'Campos do Leste', sector: 'E', ring: 0, biome: Biome.Grass, props: ['tree_oak', 'tree_oak_b', 'bush', 'bush_berry'], propDensity: 0.07, decor: ['decor_flowers_yellow', 'decor_tallgrass', 'decor_pebbles'], decorDensity: 0.06, species: [{ monster: 'slime' }, { monster: 'goblin', near: M.goblinCamp }] },
  { id: 'savanna', name: 'Savana Dourada', sector: 'E', ring: 1, biome: Biome.Dry, props: ['tree_acacia', 'bush', 'rock_small', 'tree_acacia'], propDensity: 0.04, decor: ['decor_dry_tuft', 'decor_pebbles'], decorDensity: 0.09, species: [{ monster: 'jackal' }, { monster: 'nomad' }, { monster: 'orc', near: M.orcCamp }] },
  { id: 'desert', name: 'Mar de Areia', sector: 'E', ring: 2, biome: Biome.Sand, props: ['cactus', 'cactus_b', 'rock_small', 'rock_red'], propDensity: 0.035, decor: ['decor_sand_stones', 'decor_skull'], decorDensity: 0.05, species: [{ monster: 'scorpion' }, { monster: 'hyena' }, { monster: 'rhino_boar' }, { monster: 'mummy', near: M.pharaohRuins }] },
  { id: 'red_dunes', name: 'Dunas Rubras', sector: 'E', ring: 3, biome: Biome.Sand, dark: true, props: ['rock_red', 'rock_red_large', 'cactus_b', 'tree_dead'], propDensity: 0.045, decor: ['decor_sand_stones', 'decor_skull', 'decor_crack'], decorDensity: 0.05, species: [{ monster: 'red_scorpion' }, { monster: 'orc_warlord', near: M.warCamp }, { monster: 'basilisk' }] },
  { id: 'volcano', name: 'Vulcão Adormecido', sector: 'E', ring: 4, biome: Biome.Ash, props: ['rock_basalt', 'rock_basalt_large', 'tree_dead_b', 'rock_basalt'], propDensity: 0.05, decor: ['decor_ember', 'decor_crack'], decorDensity: 0.07, species: [{ monster: 'behemoth' }, { monster: 'fire_drake', near: M.lavaLake }, { monster: 'stone_golem', near: M.crater }, { monster: 'magma_slime' }] },
  // ---- sul (água)
  { id: 'marsh_edge', name: 'Margem do Pântano', sector: 'S', ring: 0, biome: Biome.Grass, props: ['tree_oak', 'bush', 'tree_swamp', 'bush_dark'], propDensity: 0.07, decor: ['decor_reeds', 'decor_flowers_blue', 'decor_tallgrass'], decorDensity: 0.08, species: [{ monster: 'toad' }, { monster: 'bog_slime' }] },
  { id: 'swamp', name: 'Pântano Sombrio', sector: 'S', ring: 1, biome: Biome.Mud, props: ['tree_swamp', 'bush_dark', 'tree_dead', 'tree_swamp'], propDensity: 0.11, decor: ['decor_mud_bubbles', 'decor_reeds', 'decor_mushrooms'], decorDensity: 0.08, species: [{ monster: 'marsh_toad' }, { monster: 'cave_spider' }, { monster: 'widow_spider' }] },
  { id: 'jungle', name: 'Selva Alagada', sector: 'S', ring: 2, biome: Biome.Grass, dark: true, props: ['tree_swamp', 'tree_forest', 'bush_dark', 'tree_swamp'], propDensity: 0.16, decor: ['decor_mushrooms', 'decor_leaves', 'decor_reeds'], decorDensity: 0.07, species: [{ monster: 'crocodile', near: M.jungleLake }, { monster: 'green_wyvern' }, { monster: 'troll' }] },
  { id: 'corrupt_swamp', name: 'Pântano Corrompido', sector: 'S', ring: 3, biome: Biome.Mud, dark: true, props: ['tree_dead', 'tree_dead_b', 'tree_swamp', 'bush_dark'], propDensity: 0.09, decor: ['decor_mud_bubbles', 'decor_skull'], decorDensity: 0.06, species: [{ monster: 'ogre' }, { monster: 'skeleton_knight' }, { monster: 'basilisk' }] },
  { id: 'necropolis', name: 'Necrópole Esquecida', sector: 'S', ring: 4, biome: Biome.Ash, dark: true, props: ['tree_dead_b', 'rock_basalt', 'rock_medium', 'tree_dead'], propDensity: 0.05, decor: ['decor_skull', 'decor_ember', 'decor_crack'], decorDensity: 0.06, species: [{ monster: 'death_knight', near: M.necropolis }, { monster: 'arch_lich', near: M.crypt }, { monster: 'void_horror' }] },
  // ---- oeste (montanhas)
  { id: 'green_hills', name: 'Colinas Verdes', sector: 'W', ring: 0, biome: Biome.Grass, props: ['tree_oak', 'rock_small', 'rock_medium', 'bush'], propDensity: 0.07, decor: ['decor_pebbles', 'decor_flowers_pink', 'decor_tallgrass'], decorDensity: 0.06, species: [{ monster: 'slime' }, { monster: 'boar' }] },
  { id: 'ancient_ruins', name: 'Ruínas Antigas', sector: 'W', ring: 1, biome: Biome.Grass, props: ['tree_forest', 'rock_medium', 'rock_large', 'bush_dark'], propDensity: 0.09, decor: ['decor_pebbles', 'decor_crack', 'decor_leaves'], decorDensity: 0.07, species: [{ monster: 'wolf' }, { monster: 'skeleton', near: M.ruins }, { monster: 'spider', near: M.ruins2 }] },
  { id: 'iron_mountains', name: 'Montanhas de Ferro', sector: 'W', ring: 2, biome: Biome.Grass, dark: true, props: ['rock_large', 'rock_large_b', 'rock_medium', 'tree_pine'], propDensity: 0.1, decor: ['decor_pebbles', 'decor_crack'], decorDensity: 0.06, species: [{ monster: 'goblin_chief', points: 1, count: 1, radius: 2, near: M.goblinWarCamp }, { monster: 'orc_shaman', near: M.orcFort }, { monster: 'dark_knight', near: M.citadel }, { monster: 'lich', near: M.lichCrypt }] },
  { id: 'heath', name: 'Charneca das Presas', sector: 'W', ring: 3, biome: Biome.Dry, dark: true, props: ['rock_medium', 'bush_dark', 'tree_dead', 'rock_large_b'], propDensity: 0.07, decor: ['decor_dry_tuft', 'decor_pebbles', 'decor_skull'], decorDensity: 0.06, species: [{ monster: 'young_dragon', points: 2, count: 1, radius: 3, near: M.dragonLair }, { monster: 'dire_wolf' }, { monster: 'ogre' }] },
  { id: 'abyss', name: 'Abismo Primordial', sector: 'W', ring: 4, biome: Biome.Ash, dark: true, props: ['rock_basalt', 'rock_basalt_large', 'tree_dead_b', 'rock_basalt'], propDensity: 0.06, decor: ['decor_ember', 'decor_skull', 'decor_crack'], decorDensity: 0.06, species: [{ monster: 'demon', near: M.infernalPortal }, { monster: 'elder_dragon', points: 2, count: 1, radius: 3, near: M.abyssRuins }, { monster: 'void_horror' }] },
];

/** A célula pertence à zona (direção e anel exatos, sem a mistura das bordas). */
const inZone = (z: ZoneSpec) => (x: number, y: number): boolean => {
  const { d } = townDistance(x, y);
  return d > 0 && sectorAt(x, y) === z.sector && ringOf(d) === z.ring;
};

// ------------------------------------------------------------------ montagem
export function buildBiomes(b: MapBuilder): void {
  paintBiomes(b);
  for (const z of ZONES) b.zoneRegion({ id: z.id, name: z.name, x: 0, y: 0, w: WORLD_W, h: WORLD_H, pz: false, music: 'wild', priority: 1 }, inZone(z));
  roads(b);
  shrines(b);
  landmarks(b);
  ridges(b);
  b.forestBorder(3, (x, y) => BORDER[sectorAt(x, y) ?? 'N']);
  for (const [i, z] of ZONES.entries()) {
    const inside = inZone(z);
    b.scatter({ x: 0, y: 0, w: WORLD_W, h: WORLD_H }, { props: z.props, density: z.propDensity, salt: 300 + i * 7, spacing: 1, predicate: inside });
    b.scatterDecor({ x: 0, y: 0, w: WORLD_W, h: WORLD_H }, z.decor, z.decorDensity, 400 + i * 7, inside);
  }
  // por último, com o cenário pronto: só pontos livres e alcançáveis a pé a partir da vila
  spawns(b);
}

/** Chão de cada célula pelo braço e pelo anel, com as bordas misturadas (pontilhado) entre biomas vizinhos. */
function paintBiomes(b: MapBuilder): void {
  b.paintBiome((x, y) => {
    const { d } = townDistance(x, y);
    if (d === 0) return null;
    const s = sectorAt(x, y, (b.hash(x, y, 6) - 0.5) * 4) ?? 'N';
    const r = ringOf(Math.max(1, d + Math.round((b.hash(x, y, 5) - 0.5) * 5)));
    return BIOMES[s][r]!;
  });
}

function roads(b: MapBuilder): void {
  for (const r of ROADS) b.path(r as [number, number][], 3);
  b.path(RING_ROAD as [number, number][], 2);
  // placas no começo de cada anel, à beira da estrada
  for (const s of ['N', 'E', 'S', 'W'] as const)
    for (let r = 1; r < RINGS.length; r++) {
      const z = ZONES.find((zz) => zz.sector === s && zz.ring === r)!;
      const p = armPoint(s, RINGS[r]!.d0 + 1, 0);
      const road = s === 'N' ? { x: TOWN_CX, y: p.y } : s === 'S' ? { x: GATE.S.x, y: p.y } : { x: p.x, y: TOWN_CY };
      const sign = s === 'N' || s === 'S' ? { x: road.x - 3, y: road.y } : { x: road.x, y: road.y - 3 };
      const [lo, hi] = RINGS[r]!.levels;
      b.propAbs('sign', sign.x, sign.y, { soft: true });
      b.signs.push({ ...sign, text: `${z.name} — criaturas do nível ${lo} ao ${hi}. Quanto mais longe da vila, mais perigoso.` });
    }
}

function shrines(b: MapBuilder): void {
  for (const [i, sh] of SHRINES.entries()) {
    const r = shrineRect(sh);
    b.building({ id: `shrine_${i}`, name: sh.name, x: r.x, y: r.y, w: r.w, h: r.h, wall: 'marble', interior: 'temple', floor: 'marble', roof: 'slate', doorX: r.x + 3, windows: [r.x + 1, r.x + 5], interiorWindows: [] });
    b.prop('candle', r.x + 1, r.y + 2).prop('candle', r.x + 5, r.y + 2);
    b.prop('brazier', r.x + 1, r.y + r.h).prop('brazier', r.x + 5, r.y + r.h);
    b.reserve({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 5 });
    b.sign(r.x + 6, r.y + r.h, `${sh.name}: área protegida para descansar (sem lojas). Ninguém luta aqui dentro.`);
  }
}

// ------------------------------------------------------------------ marcos
function ruins(b: MapBuilder, c: Pt, rx: number, ry: number): void {
  b.ellipse(c.x, c.y, rx, ry, Terrain.Cobble, 0.35);
  b.reserve({ x: c.x - rx + 2, y: c.y - ry + 1, w: rx * 2 - 3, h: ry * 2 - 1 });
  for (const [dx, dy] of [[-rx + 3, -ry + 2], [rx - 4, -ry + 2], [-rx + 3, ry - 3], [rx - 4, ry - 3]] as const) b.propAbs('pillar', c.x + dx, c.y + dy, { soft: true });
  b.propAbs('statue', c.x, c.y - 2, { soft: true });
  b.propAbs('brazier', c.x - 4, c.y, { soft: true }).propAbs('brazier', c.x + 4, c.y, { soft: true });
  b.propAbs('bones', c.x - 3, c.y + 3, { soft: true }).propAbs('bones', c.x + 3, c.y + 2, { soft: true });
}

function camp(b: MapBuilder, c: Pt, rx: number, ry: number, palisade: boolean): void {
  b.ellipse(c.x, c.y, rx, ry, Terrain.Dirt, 0.4);
  b.reserve({ x: c.x - rx, y: c.y - ry, w: rx * 2 + 1, h: ry * 2 + 1 });
  b.propAbs('campfire', c.x, c.y, { soft: true });
  b.propAbs('tent', c.x - rx + 2, c.y - 2, { soft: true }).propAbs('tent', c.x + rx - 4, c.y - 3, { soft: true }).propAbs('tent', c.x - 3, c.y + ry - 2, { soft: true });
  b.propAbs('totem', c.x - 2, c.y - ry + 1, { soft: true }).propAbs('crate', c.x + rx - 2, c.y + 1, { soft: true }).propAbs('barrel', c.x - rx + 1, c.y + 2, { soft: true });
  if (palisade) {
    // paliçada com aberturas nos quatro lados
    for (let x = c.x - rx - 1; x <= c.x + rx + 1; x++)
      if (Math.abs(x - c.x) > 1) {
        b.propAbs('palisade', x, c.y - ry - 1, { soft: true });
        b.propAbs('palisade', x, c.y + ry + 1, { soft: true });
      }
    for (let y = c.y - ry; y <= c.y + ry; y++)
      if (Math.abs(y - c.y) > 1) {
        b.propAbs('palisade', c.x - rx - 1, y, { soft: true });
        b.propAbs('palisade', c.x + rx + 1, y, { soft: true });
      }
  }
}

function pond(b: MapBuilder, c: Pt, rx: number, ry: number, t: Terrain = Terrain.Water): void {
  b.ellipse(c.x, c.y, rx, ry, t, 0.35);
  b.reserve({ x: Math.round(c.x - rx - 1), y: Math.round(c.y - ry - 1), w: Math.round(rx * 2 + 3), h: Math.round(ry * 2 + 3) });
}

function cluster(b: MapBuilder, c: Pt, r: number, props: readonly string[], n: number, salt: number): void {
  for (let i = 0; i < n; i++) {
    const a = b.hash(i, salt, 1) * Math.PI * 2;
    const rr = r * (0.4 + b.hash(i, salt, 2) * 0.6);
    const p = props[Math.floor(b.hash(i, salt, 3) * props.length)]!;
    b.propAbs(p, Math.round(c.x + Math.cos(a) * rr), Math.round(c.y + Math.sin(a) * rr), { soft: true });
  }
}

function sub(b: MapBuilder, id: string, name: string, c: Pt, rx: number, ry: number): void {
  b.region({ id, name, x: c.x - rx, y: c.y - ry, w: rx * 2 + 1, h: ry * 2 + 1, pz: false, music: 'wild', priority: 2 });
}

function landmarks(b: MapBuilder): void {
  // norte
  pond(b, M.northPond, 4, 2.5);
  camp(b, M.banditCamp, 6, 3, false);
  sub(b, 'bandit_camp', 'Acampamento dos Bandidos', M.banditCamp, 8, 6);
  pond(b, M.tundraPond, 5, 3);
  cluster(b, M.yetiDen, 6, ['rock_snow_large', 'rock_snow'], 8, 11);
  sub(b, 'yeti_den', 'Toca do Yeti', M.yetiDen, 7, 6);
  pond(b, M.frozenLake, 10, 5.5);
  sub(b, 'frozen_lake', 'Lago Congelado', M.frozenLake, 12, 8);
  cluster(b, M.glacierCrystals, 6, ['crystal_ice'], 9, 12);
  cluster(b, M.peakCrystals, 7, ['crystal_ice', 'rock_snow_large'], 12, 13);
  // leste
  camp(b, M.goblinCamp, 7, 5, true);
  sub(b, 'goblin_camp', 'Acampamento Goblin', M.goblinCamp, 9, 7);
  pond(b, M.waterhole, 4, 3);
  camp(b, M.orcCamp, 4, 4, false);
  pond(b, M.oasis, 4.5, 3);
  cluster(b, M.oasis, 7, ['tree_acacia'], 6, 14);
  sub(b, 'oasis', 'Oásis Escondido', M.oasis, 8, 6);
  ruins(b, M.pharaohRuins, 9, 6);
  sub(b, 'pharaoh_ruins', 'Ruínas do Faraó', M.pharaohRuins, 10, 7);
  camp(b, M.warCamp, 7, 5, true);
  sub(b, 'war_camp', 'Acampamento dos Senhores da Guerra', M.warCamp, 9, 7);
  pond(b, M.lavaLake, 8, 5, Terrain.Lava);
  b.path([[M.lavaLake.x + 6, M.lavaLake.y + 2], [M.lavaLake.x + 14, M.lavaLake.y + 8], [M.lavaLake.x + 22, M.lavaLake.y + 10]], 2, Terrain.Lava, 0);
  sub(b, 'lava_lake', 'Lago de Lava', M.lavaLake, 10, 7);
  pond(b, M.crater, 4, 3, Terrain.Lava);
  cluster(b, M.crater, 8, ['rock_basalt_large', 'rock_basalt'], 12, 15);
  sub(b, 'crater', 'Cratera do Vulcão', M.crater, 9, 8);
  // sul
  pond(b, M.marshPonds, 4, 2.5);
  pond(b, { x: M.marshPonds.x + 30, y: M.marshPonds.y + 3 }, 3.5, 2.5);
  pond(b, M.swampPond, 5, 3);
  pond(b, { x: M.swampPond.x - 50, y: M.swampPond.y + 4 }, 4, 3);
  pond(b, { x: M.swampPond.x - 22, y: M.swampPond.y - 3 }, 3, 2);
  pond(b, M.jungleLake, 8, 4.5);
  pond(b, M.jungleLake2, 6, 4);
  pond(b, M.corruptPond, 6, 4);
  pond(b, { x: M.corruptPond.x + 60, y: M.corruptPond.y + 3 }, 5, 3);
  ruins(b, M.necropolis, 11, 7);
  sub(b, 'necropolis_ruins', 'Cemitério dos Reis', M.necropolis, 12, 8);
  ruins(b, M.crypt, 9, 6);
  sub(b, 'crypt', 'Cripta Profunda', M.crypt, 10, 7);
  // oeste
  cluster(b, M.hillRocks, 6, ['rock_large', 'rock_medium', 'rock_large_b'], 8, 16);
  ruins(b, M.ruins, 5, 8);
  ruins(b, M.ruins2, 4, 6);
  sub(b, 'old_ruins', 'Ruínas Antigas', M.ruins, 10, 6);
  camp(b, M.orcFort, 8, 6, true);
  sub(b, 'orc_fort', 'Fortaleza Orc', M.orcFort, 10, 8);
  camp(b, M.goblinWarCamp, 5, 4, true);
  sub(b, 'goblin_war_camp', 'Forte do Chefe Goblin', M.goblinWarCamp, 7, 6);
  ruins(b, M.citadel, 10, 7);
  sub(b, 'citadel', 'Cidadela Sombria', M.citadel, 11, 8);
  ruins(b, M.lichCrypt, 7, 5);
  sub(b, 'lich_crypt', 'Cripta do Lich', M.lichCrypt, 8, 6);
  b.ellipse(M.dragonLair.x, M.dragonLair.y, 9, 6, Terrain.Dirt, 0.45);
  cluster(b, M.dragonLair, 10, ['rock_large', 'rock_large_b', 'bones'], 12, 17);
  sub(b, 'dragon_lair', 'Covil do Dragão', M.dragonLair, 11, 8);
  ruins(b, M.infernalPortal, 12, 8);
  pond(b, { x: M.infernalPortal.x - 14, y: M.infernalPortal.y + 2 }, 3, 2, Terrain.Lava);
  sub(b, 'infernal_portal', 'Portal Infernal', M.infernalPortal, 13, 9);
  ruins(b, M.abyssRuins, 12, 8);
  pond(b, { x: M.abyssRuins.x + 16, y: M.abyssRuins.y - 2 }, 3, 2, Terrain.Lava);
  sub(b, 'abyss_ruins', 'Trono do Abismo', M.abyssRuins, 13, 9);
}

// ------------------------------------------------------------------ criaturas
/**
 * Pontos de surgimento de cada espécie da zona: a zona é dividida em faixas de distância, da espécie mais fraca (mais
 * perto da vila) para a mais forte (mais longe). Os pontos ficam afastados das estradas, da água e da lava, dos
 * santuários e uns dos outros, espalhados de lado a lado do braço; as espécies de marco surgem em volta do marco.
 */
function spawns(b: MapBuilder): void {
  const taken: Pt[] = [];
  const shrineRects = SHRINES.map(shrineRect);
  const nearShrine = (p: Pt) => shrineRects.some((r) => p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6);
  const wet = (p: Pt) => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (!b.inside(p.x + dx, p.y + dy)) return true;
        const t = b.terrain[b.idx(p.x + dx, p.y + dy)];
        if (t === Terrain.Water || t === Terrain.Lava) return true;
      }
    return false;
  };
  // alcançável a pé a partir da vila (rochas de um marco podem fechar um canto)
  const reach = new Uint8Array(WORLD_W * WORLD_H);
  const stack = [b.idx(GATE.E.x + 1, GATE.E.y)];
  reach[stack[0]!] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % WORLD_W;
    const y = (i - x) / WORLD_W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!b.inside(nx, ny)) continue;
      const j = b.idx(nx, ny);
      if (reach[j] || b.solid[j] || b.terrain[j] === Terrain.Water || b.terrain[j] === Terrain.Lava) continue;
      reach[j] = 1;
      stack.push(j);
    }
  }
  const blocked = (p: Pt) => {
    const i = b.idx(p.x, p.y);
    return b.solid[i] === 1 || b.buildingAt[i]! >= 0 || !reach[i];
  };
  for (const z of ZONES) {
    const inside = inZone(z);
    const sorted = [...z.species].sort((a, c) => (MONSTERS[a.monster]?.level ?? 0) - (MONSTERS[c.monster]?.level ?? 0));
    // faixas de distância só entre as espécies espalhadas (as de marco ficam onde o marco estiver)
    const spread = sorted.filter((sp) => !sp.near);
    // (o anel 1 começa a 7 tiles da muralha: raio de surgimento + folga, ver abaixo)
    const d0 = Math.max(RINGS[z.ring]!.d0, 7);
    const d1 = Math.min(RINGS[z.ring]!.d1, 82);
    sorted.forEach((sp, k0) => {
      const k = Math.max(0, spread.indexOf(sp));
      if (!MONSTERS[sp.monster]) throw new Error(`Criatura inexistente na zona ${z.id}: ${sp.monster}`);
      const points = sp.points ?? 3;
      // 3 por ponto até o anel 3 (grupos de 4 viravam trem para quem luta de longe); 4 nos anéis externos (respawn lento)
      const count = sp.count ?? (z.ring <= 2 ? 3 : 4);
      const radius = sp.radius ?? 4;
      // faixa de distância desta espécie dentro do anel (as de marco ficam onde o marco estiver)
      const lo = d0 + ((d1 - d0) * k) / Math.max(1, spread.length);
      const hi = d0 + ((d1 - d0) * (k + 1)) / Math.max(1, spread.length);
      const gather = (lo: number, hi: number): Pt[] => {
        const cands: Pt[] = [];
        const step = sp.near ? 1 : 2;
        const area = sp.near ? { x: sp.near.x - 8, y: sp.near.y - 8, w: 17, h: 17 } : { x: 3, y: 3, w: WORLD_W - 6, h: WORLD_H - 6 };
        for (let y = area.y; y < area.y + area.h; y += step)
          for (let x = area.x; x < area.x + area.w; x += step) {
            const p = { x, y };
            if (!b.inside(x, y) || !inside(x, y)) continue;
            // longe da muralha: as criaturas surgem num raio em volta do ponto e não podem nascer dentro da vila
            if (townDistance(x, y).d < radius + 3) continue;
            if (!sp.near) {
              const { d } = townDistance(x, y);
              if (d < lo || d > hi || roadDist(p) < 5) continue;
            }
            if (wet(p) || blocked(p) || nearShrine(p)) continue;
            if (taken.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) < (sp.near ? 4 : 9))) continue;
            cands.push(p);
          }
        return cands;
      };
      // a faixa da espécie; se ela não tiver lugar (estrada, poças, santuário), o anel inteiro
      let cands = gather(lo, hi);
      if (cands.length < points && !sp.near) cands = gather(d0, d1);
      // amostragem pelo ponto mais distante: espalha os pontos de lado a lado da zona
      const chosen: Pt[] = [];
      while (chosen.length < points && cands.length) {
        let best = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < cands.length; i++) {
          const c = cands[i]!;
          const minD = chosen.length ? Math.min(...chosen.map((q) => Math.hypot(q.x - c.x, q.y - c.y))) : 0;
          const score = minD + b.hash(c.x, c.y, 900 + k0) * (sp.near ? 3 : 6) - (sp.near ? Math.hypot(c.x - sp.near.x, c.y - sp.near.y) * 0.3 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        }
        const p = cands.splice(best, 1)[0]!;
        if (chosen.some((q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) < (sp.near ? 4 : 9))) continue;
        chosen.push(p);
      }
      if (!chosen.length) throw new Error(`Sem lugar para ${sp.monster} na zona ${z.id}`);
      chosen.forEach((p, i) => {
        taken.push(p);
        b.spawn(`${z.id}_${sp.monster}_${i}`, sp.monster, p.x, p.y, radius, count);
      });
    });
  }
}

/**
 * Cristas de pedra (com passagens) nas diagonais, separando os braços a partir do anel 2: cada bioma fica com cara
 * própria e a passagem entre eles é escolhida.
 */
function ridges(b: MapBuilder): void {
  for (let y = 3; y < WORLD_H - 3; y++)
    for (let x = 3; x < WORLD_W - 3; x++) {
      const { d, dx, dy } = townDistance(x, y);
      if (d < 26 || dx === 0 || dy === 0 || Math.abs(dx - dy) > 1) continue;
      if (d % 18 < 4) continue; // passagens
      const i = b.idx(x, y);
      if (b.reserved[i] || b.terrain[i] !== Terrain.Grass) continue;
      const s = sectorAt(x, y) ?? 'N';
      const ringIx = ringOf(d);
      const pool = s === 'N' && ringIx >= 2 ? ['rock_snow', 'tree_pine_snow'] : s === 'E' && ringIx >= 4 ? ['rock_basalt', 'rock_basalt'] : s === 'E' && ringIx >= 2 ? ['rock_red', 'rock_red'] : ringIx >= 4 ? ['rock_basalt', 'rock_medium'] : ['rock_medium', 'rock_small'];
      b.propAbs(pool[Math.floor(b.hash(x, y, 31) * pool.length)]!, x, y, { soft: true });
    }
}
