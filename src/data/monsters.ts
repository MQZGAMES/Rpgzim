// Criaturas em uma escada de força: 6 faixas com 3 espécies cada (fácil → difícil).
// Cada faixa tem o DOBRO de vida e de ataque da anterior (BALANCE.creatures.tierRatio); dentro da faixa,
// as espécies crescem ~25% uma da outra. XP e ouro acompanham. A distância de perseguição é 3x a base:
// quem foge além dela vê o monstro voltar por teleporte ao ponto de origem, com a vida cheia.
import type { LootEntry, MonsterDef } from '../domain/entities/definitions';
import type { Element } from '../domain/value-objects/element';
import { BALANCE } from './balance';

interface Species {
  id: string;
  name: string;
  description: string;
  sprite: string;
  directions: 1 | 2 | 4;
  /** Faixa (0 = iniciante … 5 = lendária) e posição dentro dela (0, 1, 2). */
  tier: number;
  step: 0 | 1 | 2;
  /** Elite/chefe: multiplica vida e ataque (aparece raramente). */
  elite?: number;
  speed: number;
  attack: { kind: 'melee' | 'ranged'; range: number; intervalMs: number; element: Element; projectile?: string };
  resistances?: Partial<Record<Element, number>>;
  aggroRadius: number;
  /** Distância de perseguição antes do multiplicador (×3). */
  leash: number;
  wanderRadius: number;
  behavior: 'melee' | 'skirmisher';
  loot: readonly LootEntry[];
  respawnMs: number;
  shadow: 's' | 'm' | 'l';
  scale?: number;
}

const STEP = [1, 1.25, 1.55] as const;
/** Nível em que cada faixa começa a valer a caça. */
const TIER_LEVEL = [1, 6, 12, 20, 30, 40] as const;

function build(s: Species): MonsterDef {
  const c = BALANCE.creatures;
  const f = STEP[s.step] * (s.elite ?? 1);
  const pow = c.tierRatio ** s.tier;
  const hp = Math.round(c.baseHealth * pow * f);
  const atk = c.baseAttack * pow * f;
  const goldAvg = c.baseGold * c.goldRatio ** s.tier * STEP[s.step] * (s.elite ? 4 : 1);
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    sprite: s.sprite,
    directions: s.directions,
    health: hp,
    experience: Math.round(c.baseExperience * c.xpRatio ** s.tier * f),
    // ritmo de celular: criaturas um pouco mais lentas que o jogador (dá para fugir e se posicionar)
    speed: Math.round(s.speed * c.speedScale * 100) / 100,
    armor: Math.round(1 + s.tier * 3 + s.step),
    defense: Math.round(s.tier * 2 + s.step),
    attack: { ...s.attack, min: Math.max(1, Math.round(atk * 0.6)), max: Math.max(2, Math.round(atk * 1.4)) },
    resistances: s.resistances,
    aggroRadius: s.aggroRadius,
    leashRadius: s.leash * c.leashMultiplier,
    wanderRadius: s.wanderRadius,
    behavior: s.behavior,
    loot: s.loot,
    gold: { chance: s.elite ? 1 : 0.8, min: Math.max(1, Math.round(goldAvg * 0.5)), max: Math.max(2, Math.round(goldAvg * 1.5)) },
    respawnMs: s.respawnMs,
    shadow: s.shadow,
    scale: s.scale,
    level: TIER_LEVEL[s.tier]! + s.step * (s.tier === 0 ? 2 : 3),
    elite: !!s.elite,
  };
}

const list: Species[] = [
  // ================================================================ Faixa 1 — iniciante (nível 1–6)
  {
    id: 'slime', name: 'Slime do Musgo', description: 'Lento e pegajoso. Ótimo para os primeiros treinos.', sprite: 'slime', directions: 1,
    tier: 0, step: 0, speed: 2, attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'earth' },
    resistances: { earth: 0.8, fire: 1.25, ice: 1.2 }, aggroRadius: 5, leash: 9, wanderRadius: 3, behavior: 'melee',
    loot: [{ itemId: 'slime_gel', chance: 0.6, min: 1, max: 2 }, { itemId: 'potion_health', chance: 0.05, min: 1, max: 1 }], respawnMs: 15000, shadow: 'm',
  },
  {
    id: 'toad', name: 'Sapo do Pântano', description: 'Cospe veneno de longe e salta entre os juncos.', sprite: 'toad', directions: 1,
    tier: 0, step: 1, speed: 2.4, attack: { kind: 'ranged', range: 3, intervalMs: 2200, element: 'earth', projectile: 'proj_earth' },
    resistances: { earth: 0.5, ice: 1.3, fire: 1.1 }, aggroRadius: 6, leash: 10, wanderRadius: 4, behavior: 'skirmisher',
    loot: [{ itemId: 'toad_venom', chance: 0.45, min: 1, max: 2 }, { itemId: 'potion_mana', chance: 0.06, min: 1, max: 1 }], respawnMs: 18000, shadow: 'm',
  },
  {
    id: 'boar', name: 'Javali Espinhento', description: 'Rápido e teimoso. Investe com as presas.', sprite: 'boar', directions: 2,
    tier: 0, step: 2, speed: 3.2, attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'physical' },
    resistances: { ice: 1.2, earth: 0.9 }, aggroRadius: 6, leash: 10, wanderRadius: 4, behavior: 'melee',
    loot: [{ itemId: 'meat', chance: 0.6, min: 1, max: 2 }, { itemId: 'boar_hide', chance: 0.45, min: 1, max: 1 }, { itemId: 'boar_tusk', chance: 0.3, min: 1, max: 1 }], respawnMs: 20000, shadow: 'l',
  },
  // ================================================================ Faixa 2 — aventureiro (nível 6–12)
  {
    id: 'goblin', name: 'Goblin Saqueador', description: 'Arremessa lanças e mantém distância. Vive em bandos.', sprite: 'goblin', directions: 4,
    tier: 1, step: 0, speed: 2.8, attack: { kind: 'ranged', range: 4, intervalMs: 2200, element: 'physical', projectile: 'proj_spear' },
    resistances: { holy: 1.2, earth: 0.9 }, aggroRadius: 7, leash: 11, wanderRadius: 3, behavior: 'skirmisher',
    loot: [{ itemId: 'goblin_ear', chance: 0.5, min: 1, max: 1 }, { itemId: 'arrow', chance: 0.4, min: 3, max: 8 }, { itemId: 'dagger', chance: 0.12, min: 1, max: 1 }, { itemId: 'potion_health', chance: 0.1, min: 1, max: 1 }, { itemId: 'goblin_charm', chance: 0.04, min: 1, max: 1 }],
    respawnMs: 25000, shadow: 'm',
  },
  {
    id: 'wolf', name: 'Lobo Cinzento', description: 'Caça em matilha nas colinas. Rápido e persistente.', sprite: 'wolf', directions: 2,
    tier: 1, step: 1, speed: 3.8, attack: { kind: 'melee', range: 1, intervalMs: 1700, element: 'physical' },
    resistances: { ice: 0.8, fire: 1.2 }, aggroRadius: 7, leash: 12, wanderRadius: 4, behavior: 'melee',
    loot: [{ itemId: 'wolf_pelt', chance: 0.45, min: 1, max: 1 }, { itemId: 'meat', chance: 0.4, min: 1, max: 2 }, { itemId: 'boots_steel', chance: 0.015, min: 1, max: 1 }], respawnMs: 22000, shadow: 'l',
  },
  {
    id: 'spider', name: 'Aranha das Ruínas', description: 'Espreita entre pedras antigas. Picada venenosa.', sprite: 'spider', directions: 1,
    tier: 1, step: 2, speed: 3, attack: { kind: 'melee', range: 1, intervalMs: 1900, element: 'earth' },
    resistances: { earth: 0.75, fire: 1.3, ice: 1.1, holy: 1.1 }, aggroRadius: 6, leash: 10, wanderRadius: 3, behavior: 'melee',
    loot: [{ itemId: 'spider_silk', chance: 0.45, min: 1, max: 2 }, { itemId: 'potion_mana', chance: 0.08, min: 1, max: 1 }, { itemId: 'potion_health', chance: 0.08, min: 1, max: 1 }, { itemId: 'legs_silk', chance: 0.025, min: 1, max: 1 }, { itemId: 'robe_mystic', chance: 0.012, min: 1, max: 1 }],
    respawnMs: 24000, shadow: 'm',
  },
  // ================================================================ Faixa 3 — veterano (nível 12–20)
  {
    id: 'skeleton', name: 'Esqueleto Guerreiro', description: 'Sentinela morta-viva das ruínas. Resiste a golpes, teme a luz sagrada.', sprite: 'skeleton', directions: 4,
    tier: 2, step: 0, speed: 2.6, attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'physical' },
    resistances: { holy: 1.5, fire: 1.1, earth: 0.8, ice: 0.9 }, aggroRadius: 6, leash: 10, wanderRadius: 2, behavior: 'melee',
    loot: [{ itemId: 'bone_fragment', chance: 0.6, min: 1, max: 3 }, { itemId: 'potion_health_great', chance: 0.05, min: 1, max: 1 }, { itemId: 'helmet_steel', chance: 0.02, min: 1, max: 1 }, { itemId: 'sword_steel', chance: 0.012, min: 1, max: 1 }, { itemId: 'shield_steel', chance: 0.012, min: 1, max: 1 }],
    respawnMs: 28000, shadow: 'm',
  },
  {
    id: 'bandit', name: 'Bandido da Estrada', description: 'Arremessa lanças escondido entre as árvores e foge do corpo a corpo.', sprite: 'bandit', directions: 4,
    tier: 2, step: 1, speed: 3.1, attack: { kind: 'ranged', range: 4, intervalMs: 2100, element: 'physical', projectile: 'proj_spear' },
    resistances: { holy: 1.1 }, aggroRadius: 7, leash: 11, wanderRadius: 3, behavior: 'skirmisher',
    loot: [{ itemId: 'bandit_mask', chance: 0.45, min: 1, max: 1 }, { itemId: 'potion_health', chance: 0.15, min: 1, max: 2 }, { itemId: 'arrow', chance: 0.3, min: 5, max: 12 }, { itemId: 'ring_power', chance: 0.008, min: 1, max: 1 }],
    respawnMs: 26000, shadow: 'm',
  },
  {
    id: 'bear', name: 'Urso Pardo', description: 'Enorme e territorial. Um golpe de pata derruba um guerreiro.', sprite: 'bear', directions: 2,
    tier: 2, step: 2, speed: 2.9, attack: { kind: 'melee', range: 1, intervalMs: 2100, element: 'physical' },
    resistances: { ice: 0.8, fire: 1.15 }, aggroRadius: 6, leash: 11, wanderRadius: 3, behavior: 'melee',
    loot: [{ itemId: 'bear_claw', chance: 0.5, min: 1, max: 2 }, { itemId: 'meat', chance: 0.6, min: 2, max: 3 }, { itemId: 'legs_plate', chance: 0.01, min: 1, max: 1 }],
    respawnMs: 30000, shadow: 'l',
  },
  // ================================================================ Faixa 4 — campeão (nível 20–30)
  {
    id: 'orc', name: 'Orc Guerreiro', description: 'Brutamontes de armadura, marcha em grupo pela fortaleza.', sprite: 'orc', directions: 4,
    tier: 3, step: 0, speed: 2.8, attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'physical' },
    resistances: { holy: 1.15, earth: 0.9, fire: 1.05 }, aggroRadius: 7, leash: 11, wanderRadius: 3, behavior: 'melee',
    loot: [{ itemId: 'orc_tooth', chance: 0.5, min: 1, max: 2 }, { itemId: 'potion_health_great', chance: 0.1, min: 1, max: 1 }, { itemId: 'axe_double', chance: 0.01, min: 1, max: 1 }, { itemId: 'helmet_steel', chance: 0.03, min: 1, max: 1 }],
    respawnMs: 30000, shadow: 'm',
  },
  {
    id: 'scorpion', name: 'Escorpião Gigante', description: 'Carapaça dura e ferrão venenoso. Vive no cânion de pedra.', sprite: 'scorpion', directions: 1,
    tier: 3, step: 1, speed: 3.2, attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'earth' },
    resistances: { earth: 0.5, ice: 1.3, fire: 0.9 }, aggroRadius: 6, leash: 10, wanderRadius: 3, behavior: 'melee',
    loot: [{ itemId: 'scorpion_stinger', chance: 0.5, min: 1, max: 1 }, { itemId: 'potion_health_great', chance: 0.08, min: 1, max: 1 }, { itemId: 'boots_steel', chance: 0.02, min: 1, max: 1 }],
    respawnMs: 30000, shadow: 'l',
  },
  {
    id: 'goblin_chief', name: 'Chefe Goblin', description: 'Líder do acampamento goblin. Raro, forte e bem recompensado.', sprite: 'goblin_chief', directions: 4,
    tier: 3, step: 2, elite: 1.4, speed: 2.7, attack: { kind: 'melee', range: 1, intervalMs: 1800, element: 'physical' },
    resistances: { holy: 1.15, earth: 0.85 }, aggroRadius: 7, leash: 9, wanderRadius: 2, behavior: 'melee',
    loot: [{ itemId: 'goblin_charm', chance: 0.5, min: 1, max: 2 }, { itemId: 'potion_health_great', chance: 0.35, min: 1, max: 2 }, { itemId: 'axe_battle', chance: 0.08, min: 1, max: 1 }, { itemId: 'ring_vigor', chance: 0.07, min: 1, max: 1 }, { itemId: 'boots_swift', chance: 0.04, min: 1, max: 1 }, { itemId: 'ring_power', chance: 0.04, min: 1, max: 1 }, { itemId: 'ring_wisdom', chance: 0.04, min: 1, max: 1 }, { itemId: 'spellbook_adept', chance: 0.03, min: 1, max: 1 }, { itemId: 'amulet_guard', chance: 0.03, min: 1, max: 1 }],
    respawnMs: 180000, shadow: 'l', scale: 1.25,
  },
  // ================================================================ Faixa 5 — mestre (nível 30–40)
  {
    id: 'orc_shaman', name: 'Xamã Orc', description: 'Invoca chamas a distância e foge de quem se aproxima.', sprite: 'orc_shaman', directions: 4,
    tier: 4, step: 0, speed: 2.7, attack: { kind: 'ranged', range: 4, intervalMs: 2300, element: 'fire', projectile: 'proj_fire' },
    resistances: { fire: 0.6, ice: 1.2, holy: 1.1 }, aggroRadius: 7, leash: 11, wanderRadius: 2, behavior: 'skirmisher',
    loot: [{ itemId: 'shaman_totem', chance: 0.45, min: 1, max: 1 }, { itemId: 'potion_mana_great', chance: 0.12, min: 1, max: 2 }, { itemId: 'wand_inferno', chance: 0.012, min: 1, max: 1 }, { itemId: 'rod_thorns', chance: 0.012, min: 1, max: 1 }],
    respawnMs: 32000, shadow: 'm',
  },
  {
    id: 'ice_wolf', name: 'Lobo de Gelo', description: 'Pelagem de cristal; a mordida congela até os ossos.', sprite: 'ice_wolf', directions: 2,
    tier: 4, step: 1, speed: 4, attack: { kind: 'melee', range: 1, intervalMs: 1600, element: 'ice' },
    resistances: { ice: 0.3, fire: 1.4 }, aggroRadius: 8, leash: 12, wanderRadius: 4, behavior: 'melee',
    loot: [{ itemId: 'ice_fang', chance: 0.5, min: 1, max: 2 }, { itemId: 'potion_health_great', chance: 0.1, min: 1, max: 1 }, { itemId: 'boots_wind', chance: 0.006, min: 1, max: 1 }],
    respawnMs: 30000, shadow: 'l',
  },
  {
    id: 'dark_knight', name: 'Cavaleiro Sombrio', description: 'Guardião amaldiçoado da cidadela. Armadura pesada, golpes devastadores.', sprite: 'dark_knight', directions: 4,
    tier: 4, step: 2, speed: 2.6, attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'physical' },
    resistances: { holy: 1.4, earth: 0.8, ice: 0.9 }, aggroRadius: 6, leash: 10, wanderRadius: 2, behavior: 'melee',
    loot: [{ itemId: 'dark_emblem', chance: 0.4, min: 1, max: 1 }, { itemId: 'potion_health_great', chance: 0.15, min: 1, max: 2 }, { itemId: 'sword_runic', chance: 0.015, min: 1, max: 1 }, { itemId: 'armor_plate', chance: 0.012, min: 1, max: 1 }, { itemId: 'shield_tower', chance: 0.008, min: 1, max: 1 }],
    respawnMs: 35000, shadow: 'm',
  },
  // ================================================================ Faixa 6 — lendária (nível 40+)
  {
    id: 'troll', name: 'Troll da Caverna', description: 'Gigante de pele dura que guarda a entrada do covil.', sprite: 'troll', directions: 4,
    tier: 5, step: 0, speed: 2.4, attack: { kind: 'melee', range: 1, intervalMs: 2200, element: 'physical' },
    resistances: { fire: 1.3, earth: 0.8, holy: 1.05 }, aggroRadius: 6, leash: 10, wanderRadius: 2, behavior: 'melee',
    loot: [{ itemId: 'troll_hide', chance: 0.5, min: 1, max: 1 }, { itemId: 'potion_health_supreme', chance: 0.08, min: 1, max: 1 }, { itemId: 'morningstar', chance: 0.012, min: 1, max: 1 }, { itemId: 'ring_life', chance: 0.01, min: 1, max: 1 }],
    respawnMs: 40000, shadow: 'l', scale: 1.3,
  },
  {
    id: 'lich', name: 'Lich Ancião', description: 'Feiticeiro morto-vivo; raios arcanos de longe.', sprite: 'lich', directions: 4,
    tier: 5, step: 1, speed: 2.5, attack: { kind: 'ranged', range: 4, intervalMs: 2400, element: 'energy', projectile: 'proj_energy' },
    resistances: { holy: 1.5, energy: 0.4, ice: 0.8, earth: 0.9 }, aggroRadius: 7, leash: 10, wanderRadius: 2, behavior: 'skirmisher',
    loot: [{ itemId: 'lich_dust', chance: 0.45, min: 1, max: 2 }, { itemId: 'potion_mana_supreme', chance: 0.12, min: 1, max: 1 }, { itemId: 'wand_void', chance: 0.008, min: 1, max: 1 }, { itemId: 'rod_glacier', chance: 0.008, min: 1, max: 1 }, { itemId: 'spellbook_master', chance: 0.008, min: 1, max: 1 }],
    respawnMs: 45000, shadow: 'm',
  },
  {
    id: 'young_dragon', name: 'Dragão Jovem', description: 'Cospe fogo e protege seu tesouro no covil da montanha.', sprite: 'young_dragon', directions: 2,
    tier: 5, step: 2, elite: 1.3, speed: 2.8, attack: { kind: 'ranged', range: 3, intervalMs: 2200, element: 'fire', projectile: 'proj_fire' },
    resistances: { fire: 0.2, ice: 1.3, earth: 0.9 }, aggroRadius: 7, leash: 10, wanderRadius: 3, behavior: 'melee',
    loot: [{ itemId: 'dragon_scale', chance: 0.6, min: 1, max: 3 }, { itemId: 'potion_health_supreme', chance: 0.25, min: 1, max: 2 }, { itemId: 'sword_dragon', chance: 0.01, min: 1, max: 1 }, { itemId: 'armor_royal', chance: 0.008, min: 1, max: 1 }, { itemId: 'bow_royal', chance: 0.01, min: 1, max: 1 }, { itemId: 'amulet_archmage', chance: 0.01, min: 1, max: 1 }],
    respawnMs: 120000, shadow: 'l', scale: 1.15,
  },
];

export const MONSTERS: Readonly<Record<string, MonsterDef>> = Object.fromEntries(list.map((s) => [s.id, build(s)]));

/** Ordem da escada de força (mais fraco → mais forte) e a faixa de cada espécie. */
export const CREATURE_LADDER: readonly { id: string; tier: number; step: number }[] = list.map((s) => ({ id: s.id, tier: s.tier, step: s.step }));
