// Projeção do estado da simulação para a interface (somente leitura, dados prontos para exibir).
// É uma função pura: a interface nunca acessa diretamente o estado mutável da simulação.
import { EQUIP_SLOTS, SKILL_IDS, SKILL_LABEL, SLOT_LABEL, type EquipSlot, type ItemDef, type SkillId } from '../../domain/entities/definitions';
import type { ItemStack } from '../../domain/entities/character';
import { levelProgress, totalXpForLevel } from '../../domain/rules/experience';
import { skillProgress } from '../../domain/rules/skills';
import { castFailMessage } from '../../domain/rules/spells';
import { countItem } from '../../domain/rules/inventory';
import { isUpgrade, itemAttack, itemDefense } from '../../domain/rules/itemPower';
import { POTION, remaining } from '../../domain/rules/cooldowns';
import { isPz, buildingAt, regionAt } from '../../game/world/GameMap';
import type { GameSimulation } from '../../game/simulation/GameSimulation';
import { castCheck, spellCooldownRemaining } from '../../game/abilities/spells';
import { nearbyInteractables } from '../../game/interaction/interaction';
import { nearbyLootBags } from '../../game/inventory/inventoryService';

export interface ItemView {
  itemId: string;
  name: string;
  icon: string;
  count: number;
  type: ItemDef['type'];
  slot: EquipSlot | null;
  description: string;
  lines: string[];
  usable: boolean;
  equipable: boolean;
  canEquipNow: boolean;
  blockedReason: string | null;
  value: number;
  /** Ataque (armas) e defesa (armadura + escudo) para exibição rápida. */
  atk: number | null;
  def: number | null;
  /** Equipável agora e melhor que o item do mesmo slot. */
  better: boolean;
}

export interface SpellView {
  id: string;
  name: string;
  words: string;
  icon: string;
  description: string;
  manaCost: number;
  cooldownMs: number;
  cooldownRemaining: number;
  minLevel: number;
  minMagicLevel: number;
  ready: boolean;
  unlocked: boolean;
  reason: string | null;
  target: string;
  color: string;
}

export interface UiSnapshot {
  version: number;
  now: number;
  player: {
    id: string;
    name: string;
    vocation: string;
    vocationName: string;
    vocationColor: string;
    level: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    xp: number;
    xpPct: number;
    xpToNext: number;
    gold: number;
    dead: boolean;
    inPz: boolean;
    speed: number;
    deaths: number;
    kills: number;
    playTimeMs: number;
  };
  stats: { armor: number; shieldDefense: number; weaponName: string; weaponAttack: string; range: number; attackInterval: number; magicLevel: number; damageReduction: number };
  skills: { id: SkillId; label: string; level: number; base: number; pct: number }[];
  buffs: { kind: string; remainingMs: number }[];
  target: { id: string; name: string; hp: number; maxHp: number; distance: number; inRange: boolean } | null;
  hotbar: SpellView[];
  spellbook: SpellView[];
  inventory: (ItemView | null)[];
  equipment: Record<EquipSlot, ItemView | null>;
  slotLabels: Record<EquipSlot, string>;
  potions: { health: number; mana: number; cooldown: number };
  ammo: number | null;
  interaction: { kind: string; id: string; label: string } | null;
  dialog: { npcName: string; npcTitle: string; sprite: string; text: string; options: string[] } | null;
  shop: {
    name: string;
    npcName: string;
    sells: { item: ItemView; price: number; canAfford: boolean }[];
    buys: { item: ItemView; price: number; owned: number }[];
  } | null;
  depot: { npcName: string; gold: number; bankGold: number; items: (ItemView | null)[] } | null;
  loot: { title: string; bags: number; gold: number; items: { bagId: string; index: number; item: ItemView }[] } | null;
  region: string | null;
  regionId: string | null;
  building: string | null;
}

function itemLines(def: ItemDef): string[] {
  const l: string[] = [];
  const w = def.weapon;
  if (w) {
    if (w.kind === 'wand') l.push(`Dano: ${w.damage?.[0]}-${w.damage?.[1]} (${w.element === 'fire' ? 'fogo' : w.element === 'energy' ? 'energia' : w.element === 'earth' ? 'terra' : 'gelo'})`, `Mana por disparo: ${w.manaCost}`);
    else l.push(`Ataque: ${w.attack}`);
    l.push(`Alcance: ${w.range} ${w.range === 1 ? 'tile' : 'tiles'}`);
    if (w.skill !== 'magic') l.push(`Skill: ${SKILL_LABEL[w.skill]}`);
    if (w.training) l.push(`Arma de treino: dano fixo ${w.damage?.[0]}–${w.damage?.[1]}, ignora armadura`);
    if (w.ammo) l.push('Requer flechas');
    if (def.twoHanded) l.push('Duas mãos');
  }
  if (def.armor) l.push(`Armadura: +${def.armor}`);
  if (def.defense) l.push(`Defesa (bloqueio): +${def.defense}`);
  const b = def.bonuses;
  if (b?.maxHealth) l.push(`Vida máxima: +${b.maxHealth}`);
  if (b?.maxMana) l.push(`Mana máxima: +${b.maxMana}`);
  if (b?.magicLevel) l.push(`Magic Level: +${b.magicLevel}`);
  if (b?.speed) l.push(`Velocidade: +${b.speed}`);
  if (def.use?.heal) l.push(`Restaura ${def.use.heal} de vida`);
  if (def.use?.mana) l.push(`Restaura ${def.use.mana} de mana`);
  if (def.use?.regen) l.push(`Regenera por ${Math.round(def.use.regen.durationMs / 1000)}s`);
  if (def.minLevel) l.push(`Nível mínimo: ${def.minLevel}`);
  return l;
}

export function itemView(sim: GameSimulation, stack: ItemStack): ItemView {
  const w = sim.world;
  const def = w.data.items[stack.itemId]!;
  const c = w.player.character;
  let blocked: string | null = null;
  if (def.vocations && !def.vocations.includes(c.vocation)) blocked = `Apenas ${def.vocations.map((v) => w.data.vocations[v].name).join(', ')}`;
  else if (def.minLevel && c.level < def.minLevel) blocked = `Requer nível ${def.minLevel}`;
  return {
    itemId: def.id,
    name: def.name,
    icon: def.icon,
    count: stack.count,
    type: def.type,
    slot: def.slot ?? null,
    description: def.description,
    lines: itemLines(def),
    usable: !!def.use,
    equipable: !!def.slot,
    canEquipNow: !!def.slot && !blocked,
    blockedReason: blocked,
    value: def.value,
    atk: itemAttack(def),
    def: itemDefense(def),
    better: isUpgrade(w.data, c, def),
  };
}

function spellView(sim: GameSimulation, id: string): SpellView {
  const w = sim.world;
  const s = w.data.spells[id]!;
  const c = w.player.character;
  const check = castCheck(w, s);
  const unlocked = c.level >= s.minLevel && w.player.stats.magicLevel >= s.minMagicLevel;
  return {
    id,
    name: s.name,
    words: s.words,
    icon: s.icon,
    description: s.description,
    manaCost: s.manaCost,
    cooldownMs: s.cooldownMs,
    cooldownRemaining: spellCooldownRemaining(w, id),
    minLevel: s.minLevel,
    minMagicLevel: s.minMagicLevel,
    ready: check.ok,
    unlocked,
    reason: check.ok ? null : castFailMessage(check.reason, check.detail),
    target: s.target,
    color: s.vfx.color,
  };
}

export function buildSnapshot(sim: GameSimulation, version: number): UiSnapshot {
  const w = sim.world;
  const p = w.player;
  const c = p.character;
  const voc = w.data.vocations[c.vocation];
  const xpCfg = w.data.balance.experience;
  const t = p.targetId ? w.monsters.get(p.targetId) : undefined;
  const equipment = {} as Record<EquipSlot, ItemView | null>;
  for (const slot of EQUIP_SLOTS) {
    const st = c.equipment[slot];
    equipment[slot] = st ? itemView(sim, st) : null;
  }
  const near = nearbyInteractables(w)[0];
  const dialogNpc = w.ui.dialog ? w.npcs.get(w.ui.dialog.npcId) : undefined;
  const page = dialogNpc?.def.dialog.find((pg) => pg.id === w.ui.dialog!.pageId);
  const shopDef = w.ui.shop ? w.data.shops[w.ui.shop.shopId] : undefined;
  const shopNpc = w.ui.shop ? w.npcs.get(w.ui.shop.npcId) : undefined;
  const depotNpc = w.ui.depot ? w.npcs.get(w.ui.depot.npcId) : undefined;
  const bags = w.ui.lootId ? nearbyLootBags(w) : [];
  const region = regionAt(w.map, p.x, p.y);
  const building = buildingAt(w.map, p.x, p.y);
  const ammo = c.equipment.ammo;
  return {
    version,
    now: w.now,
    player: {
      id: p.id,
      name: c.name,
      vocation: c.vocation,
      vocationName: voc.name,
      vocationColor: voc.color,
      level: c.level,
      hp: Math.ceil(c.health),
      maxHp: p.stats.maxHealth,
      mana: Math.floor(c.mana),
      maxMana: p.stats.maxMana,
      xp: c.experience,
      xpPct: levelProgress(c.level, c.experience, xpCfg),
      xpToNext: Math.max(0, totalXpForLevel(c.level + 1, xpCfg) - c.experience),
      gold: c.gold,
      dead: p.dead,
      inPz: isPz(w.map, p.x, p.y),
      speed: p.stats.speed,
      deaths: c.stats.deaths,
      kills: c.stats.monstersKilled,
      playTimeMs: c.stats.playTimeMs,
    },
    stats: {
      armor: p.stats.armor,
      shieldDefense: p.stats.shieldDefense,
      weaponName: p.stats.weapon.itemId ? w.data.items[p.stats.weapon.itemId]!.name : 'Punhos',
      weaponAttack: p.stats.weapon.kind === 'wand' ? `${p.stats.weapon.damage?.[0]}-${p.stats.weapon.damage?.[1]}` : String(p.stats.weapon.attack),
      range: p.stats.weapon.range,
      attackInterval: p.stats.attackIntervalMs,
      magicLevel: p.stats.magicLevel,
      damageReduction: p.stats.damageReduction,
    },
    skills: SKILL_IDS.map((id) => ({
      id,
      label: SKILL_LABEL[id],
      level: p.stats.skills[id],
      base: c.skills[id].level,
      pct: skillProgress(id, c.skills[id], voc.skillMultipliers[id], w.data.balance),
    })),
    buffs: p.buffs.filter((b) => b.expiresAt > w.now).map((b) => ({ kind: b.kind, remainingMs: b.expiresAt - w.now })),
    target: t && t.alive ? { id: t.id, name: t.def.name, hp: t.hp, maxHp: t.def.health, distance: Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)), inRange: Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) <= p.stats.weapon.range } : null,
    hotbar: c.hotbar.filter((id) => !!w.data.spells[id]).map((id) => spellView(sim, id)),
    spellbook: voc.spells.map((id) => spellView(sim, id)),
    inventory: c.inventory.map((st) => (st ? itemView(sim, st) : null)),
    equipment,
    slotLabels: SLOT_LABEL,
    potions: { health: ['potion_health', 'potion_health_great', 'potion_health_supreme'].reduce((s, id) => s + countItem(c.inventory, id), 0), mana: ['potion_mana', 'potion_mana_great', 'potion_mana_supreme'].reduce((s, id) => s + countItem(c.inventory, id), 0), cooldown: remaining(p.cooldowns, POTION, w.now) },
    ammo: p.stats.weapon.ammo ? (ammo && w.data.items[ammo.itemId]?.ammoType === p.stats.weapon.ammo ? ammo.count : 0) : null,
    interaction: near ? { kind: near.kind, id: near.id, label: near.label } : null,
    dialog: dialogNpc && page ? { npcName: dialogNpc.def.name, npcTitle: dialogNpc.def.title, sprite: dialogNpc.def.sprite, text: page.text, options: page.options.map((o) => o.label) } : null,
    shop:
      shopDef && shopNpc
        ? {
            name: shopDef.name,
            npcName: shopNpc.def.name,
            sells: shopDef.sells.map((o) => ({ item: itemView(sim, { itemId: o.itemId, count: 1 }), price: o.price, canAfford: c.gold >= o.price })),
            buys: shopDef.buys.map((o) => ({ item: itemView(sim, { itemId: o.itemId, count: 1 }), price: o.price, owned: countItem(c.inventory, o.itemId) })),
          }
        : null,
    depot: depotNpc
      ? { npcName: depotNpc.def.name, gold: c.gold, bankGold: c.bankGold, items: c.depot.map((st) => (st ? itemView(sim, st) : null)) }
      : null,
    loot: bags.length
      ? {
          title: bags.length === 1 ? `Loot: ${bags[0]!.sourceName}` : `Loot ao redor (${bags.length} sacos)`,
          bags: bags.length,
          gold: bags.reduce((s, b) => s + b.gold, 0),
          items: bags.flatMap((b) => b.items.map((st, index) => ({ bagId: b.id, index, item: itemView(sim, st) }))),
        }
      : null,
    region: region?.name ?? null,
    regionId: region?.id ?? null,
    building: building?.name ?? null,
  };
}
