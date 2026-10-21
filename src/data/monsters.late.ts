// Criaturas das faixas 7 a 14 (nível 44 a 100). Duas espécies por faixa; cada uma deixa um troféu próprio,
// poções fortes e, raramente, uma peça de equipamento da faixa de materiais equivalente.
import type { ItemDef, LootEntry } from '../domain/entities/definitions';
import { BALANCE } from './balance';
import { GEAR_TIERS } from './gearTiers';
import { TROPHIES } from './trophies';
import type { Species } from './monsters';

type Late = Omit<Species, 'loot' | 'tier' | 'step'> & { tier: number; step: 0 | 1; trophy: string; potion: string };

/** Equipamentos que a faixa pode soltar (peças de todas as vocações; o herói só usa o que serve a ele). */
const DROP_KINDS = ['sword', 'axe', 'bow', 'wand', 'rod', 'shield', 'spellbook', 'helmet', 'armor', 'armor_ranger', 'robe', 'hat', 'legs', 'legs_mage', 'boots', 'ring_power', 'ring_wisdom', 'amulet_guard', 'amulet_mage'] as const;

function gearIndex(level: number): number {
  let k = 0;
  GEAR_TIERS.forEach((t, i) => {
    if (t.level <= level + 3) k = i;
  });
  return k;
}

function loot(s: Late): LootEntry[] {
  const k = gearIndex(TIER_LEVELS[s.tier]!);
  const tier = GEAR_TIERS[k]!;
  const gear = DROP_KINDS.map((kind): LootEntry => ({ itemId: `${kind}_${tier.id}`, chance: s.elite ? 0.006 : 0.0025, min: 1, max: 1 }));
  return [{ itemId: s.trophy, chance: 0.5, min: 1, max: 1 }, { itemId: s.potion, chance: 0.12, min: 1, max: 2 }, ...gear];
}

const TIER_LEVELS = [1, 6, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100] as const;

const defs: Late[] = [
  // ---- faixa 7 (nível 44)
  { id: 'dire_wolf', name: 'Lobo Atroz', description: 'Maior e mais rápido que um lobo comum; caça em bando.', sprite: 'dire_wolf', directions: 2, tier: 6, step: 0, speed: 4, attack: { kind: 'melee', range: 1, intervalMs: 1500, element: 'physical' }, resistances: { ice: 0.8, fire: 1.2 }, aggroRadius: 9, leash: 12, wanderRadius: 4, behavior: 'melee', respawnMs: 32000, shadow: 'l', trophy: 'dire_fang', potion: 'potion_health_supreme' },
  { id: 'ogre', name: 'Ogro', description: 'Gigante lento que esmaga tudo com a clava.', sprite: 'ogre', directions: 4, tier: 6, step: 1, speed: 2.4, attack: { kind: 'melee', range: 1, intervalMs: 2300, element: 'physical' }, resistances: { fire: 1.2, earth: 0.8 }, aggroRadius: 6, leash: 10, wanderRadius: 2, behavior: 'melee', respawnMs: 36000, shadow: 'l', scale: 1.3, trophy: 'ogre_horn', potion: 'potion_health_supreme' },
  // ---- faixa 8 (nível 52)
  { id: 'elder_bear', name: 'Urso Ancestral', description: 'Pelagem branca de gelo e garras milenares.', sprite: 'elder_bear', directions: 2, tier: 7, step: 0, speed: 3, attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'physical' }, resistances: { ice: 0.5, fire: 1.3 }, aggroRadius: 7, leash: 11, wanderRadius: 3, behavior: 'melee', respawnMs: 38000, shadow: 'l', scale: 1.15, trophy: 'elder_claw', potion: 'potion_health_spirit' },
  { id: 'skeleton_knight', name: 'Cavaleiro Esquelético', description: 'Guerreiro de uma guarda esquecida, ainda de pé.', sprite: 'skeleton_knight', directions: 4, tier: 7, step: 1, speed: 2.7, attack: { kind: 'melee', range: 1, intervalMs: 1900, element: 'physical' }, resistances: { holy: 1.5, ice: 0.7, earth: 0.9 }, aggroRadius: 6, leash: 10, wanderRadius: 2, behavior: 'melee', respawnMs: 38000, shadow: 'm', trophy: 'knight_rune', potion: 'potion_health_spirit' },
  // ---- faixa 9 (nível 60)
  { id: 'red_scorpion', name: 'Escorpião Rubro', description: 'Carapaça em brasa; o ferrão derrete armaduras.', sprite: 'red_scorpion', directions: 1, tier: 8, step: 0, speed: 3, attack: { kind: 'melee', range: 1, intervalMs: 1700, element: 'fire' }, resistances: { fire: 0.3, ice: 1.4 }, aggroRadius: 7, leash: 11, wanderRadius: 3, behavior: 'melee', respawnMs: 40000, shadow: 'l', scale: 1.2, trophy: 'scorpion_gland', potion: 'potion_health_spirit' },
  { id: 'orc_warlord', name: 'Senhor da Guerra Orc', description: 'Comanda hordas inteiras; armadura dourada de batalha.', sprite: 'orc_warlord', directions: 4, tier: 8, step: 1, speed: 2.7, attack: { kind: 'melee', range: 1, intervalMs: 1900, element: 'physical' }, resistances: { holy: 1.1, earth: 0.85 }, aggroRadius: 7, leash: 11, wanderRadius: 2, behavior: 'melee', respawnMs: 42000, shadow: 'm', scale: 1.15, trophy: 'warlord_banner', potion: 'potion_health_spirit' },
  // ---- faixa 10 (nível 68)
  { id: 'ice_dragon', name: 'Dragão de Gelo', description: 'Sopro congelante e escamas que refletem a luz.', sprite: 'ice_dragon', directions: 2, tier: 9, step: 0, speed: 2.8, attack: { kind: 'ranged', range: 3, intervalMs: 2300, element: 'ice', projectile: 'proj_ice' }, resistances: { ice: 0.2, fire: 1.4, earth: 0.9 }, aggroRadius: 7, leash: 10, wanderRadius: 3, behavior: 'melee', respawnMs: 90000, shadow: 'l', scale: 1.2, trophy: 'ice_scale', potion: 'potion_health_spirit' },
  { id: 'wraith', name: 'Espectro', description: 'Alma errante; atravessa a névoa lançando gelo.', sprite: 'wraith', directions: 4, tier: 9, step: 1, speed: 2.6, attack: { kind: 'ranged', range: 4, intervalMs: 2300, element: 'ice', projectile: 'proj_ice' }, resistances: { holy: 1.6, ice: 0.3, physical: 0.8 }, aggroRadius: 7, leash: 10, wanderRadius: 2, behavior: 'skirmisher', respawnMs: 45000, shadow: 'm', trophy: 'wraith_dust', potion: 'potion_mana_spirit' },
  // ---- faixa 11 (nível 76)
  { id: 'behemoth', name: 'Behemoth', description: 'Colosso encouraçado; nada o faz recuar.', sprite: 'behemoth', directions: 2, tier: 10, step: 0, speed: 2.6, attack: { kind: 'melee', range: 1, intervalMs: 2200, element: 'physical' }, resistances: { earth: 0.7, fire: 1.2 }, aggroRadius: 6, leash: 10, wanderRadius: 3, behavior: 'melee', respawnMs: 48000, shadow: 'l', scale: 1.5, trophy: 'behemoth_hide', potion: 'potion_health_spirit' },
  { id: 'death_knight', name: 'Cavaleiro da Morte', description: 'Lâmina profana, armadura negra e olhos em brasa.', sprite: 'death_knight', directions: 4, tier: 10, step: 1, speed: 2.7, attack: { kind: 'melee', range: 1, intervalMs: 1900, element: 'physical' }, resistances: { holy: 1.5, earth: 0.8, ice: 0.9 }, aggroRadius: 7, leash: 11, wanderRadius: 2, behavior: 'melee', respawnMs: 48000, shadow: 'm', scale: 1.1, trophy: 'death_emblem', potion: 'potion_health_spirit' },
  // ---- faixa 12 (nível 84)
  { id: 'fire_drake', name: 'Draco Flamejante', description: 'Cospe bolas de fogo e arde em fúria.', sprite: 'fire_drake', directions: 2, tier: 11, step: 0, speed: 2.9, attack: { kind: 'ranged', range: 3, intervalMs: 2200, element: 'fire', projectile: 'proj_fire' }, resistances: { fire: 0.2, ice: 1.4, earth: 0.9 }, aggroRadius: 7, leash: 10, wanderRadius: 3, behavior: 'melee', respawnMs: 95000, shadow: 'l', scale: 1.2, trophy: 'drake_ember', potion: 'potion_health_divine' },
  { id: 'stone_golem', name: 'Golem de Pedra', description: 'Construto antigo; golpes lentos, impacto brutal.', sprite: 'stone_golem', directions: 4, tier: 11, step: 1, speed: 2.2, attack: { kind: 'melee', range: 1, intervalMs: 2500, element: 'physical' }, resistances: { earth: 0.4, fire: 0.7, ice: 0.8, energy: 1.3, physical: 0.85 }, aggroRadius: 5, leash: 9, wanderRadius: 1, behavior: 'melee', respawnMs: 50000, shadow: 'l', scale: 1.4, trophy: 'golem_core', potion: 'potion_health_divine' },
  // ---- faixa 13 (nível 92)
  { id: 'demon', name: 'Demônio', description: 'Chamas negras e garras cortantes vindas do abismo.', sprite: 'demon', directions: 4, tier: 12, step: 0, speed: 2.9, attack: { kind: 'ranged', range: 3, intervalMs: 2000, element: 'fire', projectile: 'proj_fire' }, resistances: { fire: 0.2, holy: 1.5, ice: 1.2 }, aggroRadius: 8, leash: 11, wanderRadius: 2, behavior: 'melee', respawnMs: 55000, shadow: 'l', scale: 1.25, trophy: 'demon_eye', potion: 'potion_health_divine' },
  { id: 'arch_lich', name: 'Arquilich', description: 'Mestre dos mortos; raios arcanos à distância.', sprite: 'arch_lich', directions: 4, tier: 12, step: 1, speed: 2.6, attack: { kind: 'ranged', range: 5, intervalMs: 2400, element: 'energy', projectile: 'proj_energy' }, resistances: { holy: 1.5, energy: 0.3, ice: 0.8, earth: 0.9 }, aggroRadius: 8, leash: 11, wanderRadius: 2, behavior: 'skirmisher', respawnMs: 55000, shadow: 'm', scale: 1.1, trophy: 'archlich_phylactery', potion: 'potion_mana_divine' },
  // ---- faixa 14 (nível 100)
  { id: 'elder_dragon', name: 'Dragão Ancião', description: 'Sobrevivente de eras esquecidas; o céu escurece ao redor.', sprite: 'elder_dragon', directions: 2, tier: 13, step: 0, elite: 1.25, speed: 2.9, attack: { kind: 'ranged', range: 4, intervalMs: 2200, element: 'fire', projectile: 'proj_fire' }, resistances: { fire: 0.2, ice: 1.2, earth: 0.9, holy: 1.1 }, aggroRadius: 8, leash: 11, wanderRadius: 3, behavior: 'melee', respawnMs: 150000, shadow: 'l', scale: 1.5, trophy: 'elder_dragon_scale', potion: 'potion_health_divine' },
  { id: 'void_horror', name: 'Horror do Vazio', description: 'Algo que não deveria existir; tudo ao redor se apaga.', sprite: 'void_horror', directions: 1, tier: 13, step: 1, speed: 3, attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'energy' }, resistances: { energy: 0.3, holy: 1.4, physical: 0.9 }, aggroRadius: 8, leash: 11, wanderRadius: 3, behavior: 'melee', respawnMs: 60000, shadow: 'l', scale: 1.4, trophy: 'void_shard', potion: 'potion_mana_divine' },
];

export const LATE_SPECIES: Species[] = defs.map(({ trophy, potion, ...rest }) => ({ ...rest, step: rest.step as 0 | 1 | 2, loot: loot({ ...rest, trophy, potion } as Late) }));

/** Ouro médio de uma criatura da faixa (para o valor dos troféus). */
function goldOf(tier: number): number {
  const c = BALANCE.creatures;
  return c.baseGold * c.goldRatio ** 3 * 1.4 ** (tier - 3);
}

/** Itens de troféu (loot vendável), um por espécie tardia. */
export const TROPHY_ITEMS: ItemDef[] = defs.map((d) => {
  const t = TROPHIES.find((x) => x.id === d.trophy)!;
  return { id: t.id, name: t.name, description: t.description, type: 'loot', icon: `item_${t.id}`, value: Math.round(goldOf(d.tier) * 2.8), stackable: true, maxStack: 100 };
});
