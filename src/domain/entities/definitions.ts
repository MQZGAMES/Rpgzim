// Tipos das definições configuráveis (dados) do jogo: itens, magias, vocações, monstros, NPCs, lojas e balanceamento.
import type { Element } from '../value-objects/element';
import type { ItemId, MonsterId, NpcId, ShopId, SpellId, VocationId } from '../value-objects/ids';

// ------------------------------------------------------------------ habilidades
export const SKILL_IDS = ['sword', 'axe', 'club', 'distance', 'shielding', 'magic'] as const;
export type SkillId = (typeof SKILL_IDS)[number];
export type WeaponSkill = 'sword' | 'axe' | 'club' | 'distance';

export const SKILL_LABEL: Record<SkillId, string> = {
  sword: 'Sword Fighting',
  axe: 'Axe Fighting',
  club: 'Club Fighting',
  distance: 'Distance Fighting',
  shielding: 'Shielding',
  magic: 'Magic Level',
};

// ------------------------------------------------------------------ itens
export const EQUIP_SLOTS = ['head', 'amulet', 'body', 'mainHand', 'offHand', 'legs', 'ring', 'feet', 'ammo'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  head: 'Capacete',
  amulet: 'Amuleto',
  body: 'Armadura',
  mainHand: 'Mão principal',
  offHand: 'Mão secundária',
  legs: 'Calças',
  ring: 'Anel',
  feet: 'Botas',
  ammo: 'Munição',
};

export type ItemType =
  | 'weapon'
  | 'shield'
  | 'spellbook'
  | 'armor'
  | 'helmet'
  | 'legs'
  | 'boots'
  | 'ring'
  | 'amulet'
  | 'ammo'
  | 'potion'
  | 'food'
  | 'loot';

export interface WeaponStats {
  kind: 'melee' | 'distance' | 'wand';
  /** Skill treinada e usada no cálculo (varinhas/cajados usam o Magic Level). */
  skill: WeaponSkill | 'magic';
  attack: number;
  /** Alcance em tiles (distância de Chebyshev). */
  range: number;
  element: Element;
  /** Tipo de munição exigida no slot de munição. */
  ammo?: 'arrow';
  /** Dano fixo (varinhas e cajados). */
  damage?: readonly [number, number];
  /** Mana consumida por disparo (varinhas e cajados). */
  manaCost?: number;
  /** Projétil visual. */
  projectile?: string;
  /** Intervalo de ataque próprio (ms). */
  attackIntervalMs?: number;
  /** Arma de treino: dano fixo baixo (`damage`), sem rolagem por skill nem redução por armadura. */
  training?: boolean;
}

export interface StatBonuses {
  maxHealth?: number;
  maxMana?: number;
  magicLevel?: number;
  speed?: number;
  skills?: Partial<Record<SkillId, number>>;
}

export interface ItemUse {
  heal?: number;
  mana?: number;
  /** Regeneração ao longo do tempo (comida). */
  regen?: { health: number; mana: number; durationMs: number };
  cooldownMs: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  type: ItemType;
  /** Quadro no atlas de ícones. */
  icon: string;
  /** Valor base em ouro (as lojas aplicam seus próprios preços). */
  value: number;
  stackable?: boolean;
  maxStack?: number;
  slot?: EquipSlot;
  twoHanded?: boolean;
  weapon?: WeaponStats;
  armor?: number;
  /** Defesa de escudo (bloqueio). */
  defense?: number;
  bonuses?: StatBonuses;
  vocations?: readonly VocationId[];
  minLevel?: number;
  use?: ItemUse;
  ammoType?: 'arrow';
}

// ------------------------------------------------------------------ magias
export type SpellTargetType = 'target' | 'self' | 'areaSelf' | 'areaTarget';
export type SpellEffectType = 'damage' | 'heal' | 'buff';
export type BuffKind = 'defense' | 'attackSpeed' | 'haste' | 'regen' | 'distanceDamage';

export interface SpellFormula {
  /** Fonte de poder: magia (nível + magic level), corpo a corpo ou distância (nível + skill + arma). */
  kind: 'magic' | 'melee' | 'distance';
  levelFactor: number;
  /** Multiplicador do Magic Level (magia) ou da skill (corpo a corpo/distância). */
  powerFactor: number;
  base: number;
  /** Faixa de variação aplicada ao valor médio. */
  min: number;
  max: number;
}

export interface SpellDef {
  id: SpellId;
  name: string;
  /** Palavras mágicas originais exibidas ao conjurar. */
  words: string;
  description: string;
  icon: string;
  vocations: readonly VocationId[];
  minLevel: number;
  minMagicLevel: number;
  manaCost: number;
  cooldownMs: number;
  /** Alcance (tiles) para alvos ou centro de área. */
  range: number;
  /** Raio (tiles) para áreas. */
  radius?: number;
  target: SpellTargetType;
  effect: SpellEffectType;
  element: Element;
  formula?: SpellFormula;
  buff?: { kind: BuffKind; value: number; durationMs: number };
  /** Efeito adicional aplicado aos alvos atingidos. */
  slow?: { factor: number; durationMs: number };
  /** Munição consumida (flechas). */
  ammoCost?: number;
  /** Exige uma categoria de arma empunhada. */
  requiresWeapon?: 'melee' | 'distance';
  vfx: { projectile?: string; impact: string; sfx: string; color: string };
}

// ------------------------------------------------------------------ vocações
export interface VocationDef {
  id: VocationId;
  name: string;
  title: string;
  description: string;
  sprite: string;
  color: string;
  base: { health: number; mana: number };
  perLevel: { health: number; mana: number };
  /** Regeneração por tick de 2 s (escala levemente com o nível). */
  regen: { health: number; mana: number };
  /** Dificuldade de treino por skill: quanto menor, mais rápido evolui. */
  skillMultipliers: Record<SkillId, number>;
  /** Modificadores de dano/cura por categoria. */
  damage: { melee: number; distance: number; magic: number; healing: number };
  /** Redução de dano físico adicional (0..1). */
  physicalReduction: number;
  baseSpeed: number;
  attackIntervalMs: number;
  spells: readonly SpellId[];
  startingEquipment: Partial<Record<EquipSlot, { itemId: ItemId; count?: number }>>;
  startingInventory: readonly { itemId: ItemId; count: number }[];
  startingGold: number;
  strengths: readonly string[];
}

// ------------------------------------------------------------------ monstros
export interface LootEntry {
  itemId: ItemId;
  chance: number;
  min: number;
  max: number;
}

export interface MonsterDef {
  id: MonsterId;
  name: string;
  sprite: string;
  /** 4 = folha humanoide; 2 = apenas esquerda/direita; 1 = sem direção. */
  directions: 1 | 2 | 4;
  health: number;
  experience: number;
  speed: number;
  armor: number;
  defense: number;
  attack: { kind: 'melee' | 'ranged'; min: number; max: number; range: number; intervalMs: number; element: Element; projectile?: string };
  resistances?: Partial<Record<Element, number>>;
  aggroRadius: number;
  leashRadius: number;
  wanderRadius: number;
  /** "skirmisher" mantém distância e ataca de longe. */
  behavior: 'melee' | 'skirmisher';
  loot: readonly LootEntry[];
  gold: { chance: number; min: number; max: number };
  respawnMs: number;
  shadow: 's' | 'm' | 'l';
  /** Escala visual (chefes maiores). */
  scale?: number;
  description: string;
}

// ------------------------------------------------------------------ NPCs e lojas
export type DialogAction = 'close' | 'openShop' | 'openDepot' | 'heal' | 'next';

export interface DialogOption {
  label: string;
  action: DialogAction;
  /** Página seguinte (para action "next"). */
  goto?: string;
}

export interface DialogPage {
  id: string;
  text: string;
  options: readonly DialogOption[];
}

export interface NpcDef {
  id: NpcId;
  name: string;
  title: string;
  sprite: string;
  shopId?: ShopId;
  dialog: readonly DialogPage[];
  wanderRadius: number;
  /** Fala curta exibida ao se aproximar. */
  greeting: string;
}

export interface ShopOffer {
  itemId: ItemId;
  price: number;
}

export interface ShopDef {
  id: ShopId;
  name: string;
  /** Itens que o jogador pode comprar. */
  sells: readonly ShopOffer[];
  /** Itens que a loja compra do jogador. */
  buys: readonly ShopOffer[];
}

// ------------------------------------------------------------------ balanceamento
export interface BalanceConfig {
  experience: { base: number; exponent: number };
  skills: { startLevel: number; baseTries: number; growth: number };
  magic: { baseMana: number; growth: number };
  combat: {
    globalSpellCooldownMs: number;
    potionCooldownMs: number;
    unarmedAttack: number;
    blockChanceBase: number;
    blockChancePerSkill: number;
    maxBlockChance: number;
    shieldingTriesPerHit: number;
    /** Janela (ms) em que cada atacante conta uma vez para o Shielding. */
    shieldingWindowMs: number;
    /** Máximo de atacantes que treinam Shielding por janela (Tibia: 2). */
    shieldingMaxAttackers: number;
    /** O personagem precisa ter atacado neste intervalo (ms) para o Shielding treinar. */
    shieldingAttackWindowMs: number;
  };
  player: { inventorySlots: number; depotSlots: number; regenTickMs: number; deathXpPenalty: number; deathSkillPenalty: number; respawnInvulnerableMs: number };
  world: { lootDecayMs: number; corpseDecayMs: number; aiSleepDistance: number };
}
