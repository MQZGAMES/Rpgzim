// Criaturas das terras do sul (nenhum humano): uma faixa nova de caça abaixo do pântano, das ruínas e do covil, e
// mais duas áreas ao sul das Terras Distantes. Cada espécie entra numa faixa de força que já existe (mesma vida, ataque,
// XP e ouro das irmãs da faixa) e deixa um troféu próprio, a poção do nível da faixa e, raramente, um equipamento.
import type { ItemDef, LootEntry } from '../domain/entities/definitions';
import { BALANCE } from './balance';
import type { Species } from './monsters';
import { SOUTH_TROPHIES, type Trophy } from './trophies';

type South = Omit<Species, 'loot'> & { trophy: Trophy; gear: readonly string[] };

/** Nível em que cada faixa começa (igual a monsters.ts). */
const TIER_LEVEL = [1, 6, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100] as const;

/** A poção do nível da faixa (a maior que um personagem daquele nível já pode beber). */
function potionOf(tier: number, mana = false): string {
  const lvl = TIER_LEVEL[tier]!;
  const size = lvl >= 75 ? 'divine' : lvl >= 50 ? 'spirit' : lvl >= 28 ? 'supreme' : lvl >= 12 ? 'great' : '';
  return `potion_${mana ? 'mana' : 'health'}${size ? `_${size}` : ''}`;
}

/** Ouro médio de uma criatura da faixa (a mesma conta de monsters.ts). */
function goldOf(tier: number): number {
  const c = BALANCE.creatures;
  return c.baseGold * c.goldRatio ** Math.min(tier, 3) * 1.3 ** Math.max(0, tier - 3);
}

function loot(s: South): LootEntry[] {
  const late = s.tier >= 6;
  return [
    { itemId: s.trophy.id, chance: 0.5, min: 1, max: s.tier <= 2 ? 2 : 1 },
    {
      itemId: potionOf(s.tier, s.attack.element === 'energy' || s.behavior === 'skirmisher'),
      chance: 0.1,
      min: 1,
      max: 1,
    },
    ...s.gear.map((itemId): LootEntry => ({ itemId, chance: late ? 0.003 : 0.012, min: 1, max: 1 })),
  ];
}

const southTrophy = (id: string): Trophy => SOUTH_TROPHIES.find((t) => t.id === id)!;

const defs: South[] = [
  // ---- Brejo das Sanguessugas (faixa 2, nível 6–12)
  {
    id: 'bog_slime',
    name: 'Slime do Brejo',
    description: 'Lodo vivo que gruda e corrói; aparece aos montes no brejo.',
    sprite: 'bog_slime',
    directions: 1,
    tier: 1,
    step: 0,
    speed: 2.4,
    attack: { kind: 'melee', range: 1, intervalMs: 1900, element: 'earth' },
    resistances: { earth: 0.6, fire: 1.4, physical: 0.9 },
    aggroRadius: 5,
    leash: 9,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 20000,
    shadow: 's',
    trophy: southTrophy('bog_ooze'),
    gear: ['legs_leather', 'helmet_iron'],
  },
  {
    id: 'marsh_toad',
    name: 'Sapo-Boi do Brejo',
    description: 'Do tamanho de um bezerro; a língua acerta de longe.',
    sprite: 'marsh_toad',
    directions: 1,
    tier: 1,
    step: 1,
    speed: 2.8,
    attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'earth' },
    resistances: { earth: 0.7, ice: 1.3 },
    aggroRadius: 6,
    leash: 10,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 22000,
    shadow: 'm',
    scale: 1.3,
    trophy: southTrophy('toad_gland'),
    gear: ['armor_chain', 'shield_iron'],
  },
  // ---- Ninho das Aranhas (faixa 3, nível 12–20)
  {
    id: 'cave_spider',
    name: 'Aranha das Cavernas',
    description: 'Cega e lenta, mas sente cada passo na teia.',
    sprite: 'cave_spider',
    directions: 1,
    tier: 2,
    step: 0,
    speed: 2.6,
    attack: { kind: 'melee', range: 1, intervalMs: 1900, element: 'earth' },
    resistances: { earth: 0.75, fire: 1.3, ice: 1.1 },
    aggroRadius: 6,
    leash: 10,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 26000,
    shadow: 'm',
    scale: 1.1,
    trophy: southTrophy('cave_silk'),
    gear: ['legs_silk', 'helmet_steel'],
  },
  {
    id: 'widow_spider',
    name: 'Viúva-Negra',
    description: 'A rainha do ninho; o veneno derruba um homem feito.',
    sprite: 'widow_spider',
    directions: 1,
    tier: 2,
    step: 2,
    speed: 3.1,
    attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'earth' },
    resistances: { earth: 0.6, fire: 1.3, holy: 1.1 },
    aggroRadius: 6,
    leash: 10,
    wanderRadius: 2,
    behavior: 'melee',
    respawnMs: 30000,
    shadow: 'm',
    scale: 1.25,
    trophy: southTrophy('widow_fang'),
    gear: ['robe_mystic', 'boots_steel'],
  },
  // ---- Savana Rachada (faixa 4, nível 20–28)
  {
    id: 'hyena',
    name: 'Hiena Risonha',
    description: 'Caça em bando e ri quando a presa sangra.',
    sprite: 'hyena',
    directions: 2,
    tier: 3,
    step: 1,
    speed: 3.1,
    attack: { kind: 'melee', range: 1, intervalMs: 1600, element: 'physical' },
    resistances: { fire: 1.1, ice: 1.1 },
    aggroRadius: 6,
    leash: 12,
    wanderRadius: 4,
    behavior: 'melee',
    respawnMs: 28000,
    shadow: 'm',
    trophy: southTrophy('hyena_pelt'),
    gear: ['armor_ranger', 'bow_elven'],
  },
  {
    id: 'rhino_boar',
    name: 'Javali Couraçado',
    description: 'Couro duro como pedra; investe sem parar.',
    sprite: 'rhino_boar',
    directions: 2,
    tier: 3,
    step: 2,
    speed: 2.8,
    attack: { kind: 'melee', range: 1, intervalMs: 2100, element: 'physical' },
    resistances: { physical: 0.85, earth: 0.8, fire: 1.2 },
    aggroRadius: 6,
    leash: 10,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 32000,
    shadow: 'l',
    scale: 1.25,
    trophy: southTrophy('armored_plate'),
    gear: ['armor_plate', 'shield_tower'],
  },
  // ---- Desfiladeiro das Serpes (faixas 5 e 6, nível 28–44)
  {
    id: 'cave_bear',
    name: 'Urso das Cavernas',
    description: 'Vive no escuro do desfiladeiro e não gosta de visitas.',
    sprite: 'cave_bear',
    directions: 2,
    tier: 4,
    step: 1,
    speed: 3,
    attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'physical' },
    resistances: { ice: 0.8, fire: 1.15, earth: 0.9 },
    aggroRadius: 7,
    leash: 11,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 34000,
    shadow: 'l',
    scale: 1.15,
    trophy: southTrophy('cave_claw'),
    gear: ['helmet_royal', 'legs_royal'],
  },
  {
    id: 'green_wyvern',
    name: 'Serpe Verde',
    description: 'Parente menor dos dragões; cospe veneno de longe.',
    sprite: 'green_wyvern',
    directions: 2,
    tier: 5,
    step: 0,
    speed: 3,
    attack: { kind: 'ranged', range: 3, intervalMs: 2200, element: 'earth', projectile: 'proj_earth' },
    resistances: { earth: 0.4, fire: 1.2, ice: 1.2 },
    aggroRadius: 7,
    leash: 10,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 60000,
    shadow: 'l',
    scale: 1.05,
    trophy: southTrophy('wyvern_scale'),
    gear: ['sword_dragon', 'bow_royal', 'wand_void'],
  },
  // ---- Estepe dos Basiliscos (faixas 10 e 11, nível 68–76): longe de Pedraluz, então bem fortes
  {
    id: 'basilisk',
    name: 'Basilisco',
    description: 'O olhar paralisa; a cauda faz o resto.',
    sprite: 'basilisk',
    directions: 1,
    tier: 9,
    step: 0,
    speed: 2.8,
    attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'earth' },
    resistances: { earth: 0.4, ice: 1.3, holy: 1.1 },
    aggroRadius: 7,
    leash: 11,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 36000,
    shadow: 'l',
    scale: 1.25,
    trophy: southTrophy('basilisk_eye'),
    gear: [],
  },
  {
    id: 'storm_wolf',
    name: 'Lobo da Tempestade',
    description: 'Corre com os raios; o uivo arrepia os pelos.',
    sprite: 'storm_wolf',
    directions: 2,
    tier: 10,
    step: 0,
    speed: 3.5,
    attack: { kind: 'melee', range: 1, intervalMs: 1500, element: 'energy' },
    resistances: { energy: 0.4, earth: 1.3 },
    aggroRadius: 7,
    leash: 12,
    wanderRadius: 4,
    behavior: 'melee',
    respawnMs: 36000,
    shadow: 'l',
    trophy: southTrophy('storm_fang'),
    gear: [],
  },
  // ---- Cratera Cristalina (faixas 12 e 13, nível 84–92): o canto mais distante do mapa
  {
    id: 'crystal_scorpion',
    name: 'Escorpião de Cristal',
    description: 'Carapaça de cristal puro; o ferrão congela.',
    sprite: 'crystal_scorpion',
    directions: 1,
    tier: 11,
    step: 0,
    speed: 2.9,
    attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'ice' },
    resistances: { ice: 0.2, fire: 1.4, physical: 0.9 },
    aggroRadius: 7,
    leash: 11,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 48000,
    shadow: 'l',
    scale: 1.3,
    trophy: southTrophy('crystal_shard'),
    gear: [],
  },
  {
    id: 'magma_slime',
    name: 'Slime de Magma',
    description: 'Rocha derretida que rasteja; queima o que toca.',
    sprite: 'magma_slime',
    directions: 1,
    tier: 12,
    step: 0,
    speed: 2.4,
    attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'fire' },
    resistances: { fire: 0.1, ice: 1.5, earth: 0.8 },
    aggroRadius: 6,
    leash: 10,
    wanderRadius: 2,
    behavior: 'melee',
    respawnMs: 48000,
    shadow: 'm',
    scale: 1.6,
    trophy: southTrophy('magma_core'),
    gear: [],
  },
];

/** Equipamento da faixa tardia (o mesmo das irmãs da faixa em monsters.late.ts). */
const LATE_GEAR = ['sword', 'axe', 'bow', 'wand', 'rod', 'shield', 'armor', 'robe', 'legs', 'boots'] as const;
function lateGear(tier: number, tiers: readonly { id: string; level: number }[]): string[] {
  let k = 0;
  tiers.forEach((t, i) => {
    if (t.level <= TIER_LEVEL[tier]! + 3) k = i;
  });
  return LATE_GEAR.map((kind) => `${kind}_${tiers[k]!.id}`);
}

/** Espécies do sul (para monsters.ts) — as tardias recebem o equipamento da faixa. */
export function southSpecies(gearTiers: readonly { id: string; level: number }[]): Species[] {
  return defs.map(({ trophy: _t, gear, ...rest }) => {
    const g = rest.tier >= 6 ? lateGear(rest.tier, gearTiers) : gear;
    return { ...rest, loot: loot({ ...rest, trophy: _t, gear: g }) };
  });
}

/** Itens de troféu do sul: valem ~1,6× o ouro médio da criatura (como os troféus das faixas antigas). */
export const SOUTH_TROPHY_ITEMS: ItemDef[] = defs.map((d) => ({
  id: d.trophy.id,
  name: d.trophy.name,
  description: d.trophy.description,
  type: 'loot',
  icon: `item_${d.trophy.id}`,
  value: Math.max(5, Math.round(goldOf(d.tier) * 1.6)),
  stackable: true,
  maxStack: 100,
}));
