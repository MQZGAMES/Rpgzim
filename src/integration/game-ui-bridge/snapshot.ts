// Projeção do estado da simulação para a interface (somente leitura, dados prontos para exibir).
// É uma função pura: a interface nunca acessa diretamente o estado mutável da simulação.
import { EQUIP_SLOTS, SKILL_IDS, SKILL_LABEL, SLOT_LABEL, type EquipSlot, type ItemDef, type SkillId } from '../../domain/entities/definitions';
import type { ItemStack } from '../../domain/entities/character';
import { levelProgress, totalXpForLevel } from '../../domain/rules/experience';
import { skillProgress } from '../../domain/rules/skills';
import { castFailMessage } from '../../domain/rules/spells';
import { countItem } from '../../domain/rules/inventory';
import { isSellLocked, keptFromSellAll } from '../../domain/rules/economy';
import { HOTBAR_SIZE, parseHotbarEntry } from '../../domain/rules/hotbar';
import { isUpgrade, itemAttack, itemDefense } from '../../domain/rules/itemPower';
import { POTION, remaining } from '../../domain/rules/cooldowns';
import { isPz, buildingAt, regionAt } from '../../game/world/GameMap';
import type { GameSimulation } from '../../game/simulation/GameSimulation';
import { castCheck, spellCooldownRemaining } from '../../game/abilities/spells';
import { nearbyInteractables } from '../../game/interaction/interaction';
import { nearbyLootBags } from '../../game/inventory/inventoryService';
import { PARTY_SHARE_RANGE, PVP_FAIL_MESSAGE, actorById, actorName, canAttackActor, partyOf, pkNow, pzLockMs, skullOf, pendingInviteFor, sameParty } from '../../game/social/social';
import { heroActivity } from '../../game/ai/heroBrain';

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
  /** Venda travada pelo jogador (fica fora do "vender tudo"). */
  locked: boolean;
  /** Fora do "vender tudo" (travado ou munição da arma equipada). */
  kept: boolean;
}

/** Um atalho da barra de ações (magia, item da mochila, poção automática ou vazio). */
export interface HotbarSlotView {
  index: number;
  kind: 'spell' | 'item' | 'potion' | 'empty';
  spell: SpellView | null;
  /** Item ou poção automática. */
  itemId: string | null;
  icon: string | null;
  name: string;
  count: number;
  cooldownRemaining: number;
  cooldownMs: number;
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
  target: { id: string; name: string; hp: number; maxHp: number; distance: number; inRange: boolean; isPlayer: boolean } | null;
  /** Grupo atual (se o jogador estiver em um). */
  party: { leaderId: string; youAreLeader: boolean; formation: 'free' | 'follow' | 'line'; targeting: 'nearest' | 'leader'; friendlyFire: boolean; sparMode: 'training' | 'duel'; members: { id: string; name: string; vocation: string; level: number; hp: number; maxHp: number; isYou: boolean; isLeader: boolean; near: boolean; dead: boolean }[] } | null;
  /** Convite de grupo recebido e ainda válido. */
  invite: { fromId: string; fromName: string } | null;
  pvp: boolean;
  standAttack: boolean;
  /** Tempo restante da caveira do jogador (ms), 0 sem caveira. */
  /** PK estilo Tibia: caveira atual (tipo e tempo restante) e PZ lock restante. */
  pk: { skull: 'white' | 'yellow' | 'red' | null; skullMs: number; pzLockMs: number };
  /** Heróis no mundo (para o menu ao tocar neles). */
  heroes: { id: string; name: string; title: string; vocation: string; vocationName: string; level: number; hp: number; maxHp: number; inParty: boolean; isLeader: boolean; skull: 'white' | 'yellow' | 'red' | null; activity: string; attackBlocked: string | null; distance: number; dead: boolean; region: string }[];
  hotbar: HotbarSlotView[];
  spellbook: SpellView[];
  inventory: (ItemView | null)[];
  equipment: Record<EquipSlot, ItemView | null>;
  slotLabels: Record<EquipSlot, string>;
  potions: { health: number; mana: number; cooldown: number };
  /** Flechas na mochila por tipo (mais forte primeiro); null quando a arma não usa munição. */
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
    locked: isSellLocked(c, def.id),
    kept: keptFromSellAll(c, def.id),
  };
}

const POTION_IDS = { health: ['potion_health', 'potion_health_great', 'potion_health_supreme'], mana: ['potion_mana', 'potion_mana_great', 'potion_mana_supreme'] } as const;

function hotbarView(sim: GameSimulation): HotbarSlotView[] {
  const w = sim.world;
  const c = w.player.character;
  const potionCd = remaining(w.player.cooldowns, POTION, w.now);
  const out: HotbarSlotView[] = [];
  for (let index = 0; index < HOTBAR_SIZE; index++) {
    const e = parseHotbarEntry(c.hotbar[index]);
    const empty: HotbarSlotView = { index, kind: 'empty', spell: null, itemId: null, icon: null, name: 'Vazio', count: 0, cooldownRemaining: 0, cooldownMs: 0 };
    if (!e) out.push(empty);
    else if (e.kind === 'spell') {
      if (!w.data.spells[e.id]) out.push(empty);
      else out.push({ ...empty, kind: 'spell', spell: spellView(sim, e.id), name: w.data.spells[e.id]!.name });
    } else if (e.kind === 'potion') {
      const ids = POTION_IDS[e.id];
      out.push({
        ...empty,
        kind: 'potion',
        itemId: e.id,
        icon: e.id === 'health' ? 'item_potion_health' : 'item_potion_mana',
        name: e.id === 'health' ? 'Poção de vida (automática)' : 'Poção de mana (automática)',
        count: ids.reduce((s, id) => s + countItem(c.inventory, id), 0),
        cooldownRemaining: potionCd,
        cooldownMs: 1000,
      });
    } else {
      const def = w.data.items[e.id];
      if (!def) out.push(empty);
      else out.push({ ...empty, kind: 'item', itemId: def.id, icon: def.icon, name: def.name, count: countItem(c.inventory, def.id), cooldownRemaining: def.type === 'potion' ? potionCd : 0, cooldownMs: def.use?.cooldownMs ?? 1000 });
    }
  }
  return out;
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

function partyView(sim: GameSimulation): UiSnapshot['party'] {
  const w = sim.world;
  const p = w.player;
  const party = partyOf(w, p.id);
  if (!party) return null;
  return {
    leaderId: party.leaderId,
    youAreLeader: party.leaderId === p.id,
    formation: party.formation,
    targeting: party.targeting,
    friendlyFire: party.friendlyFire,
    sparMode: party.sparMode === 'duel' ? 'duel' : 'training',
    members: party.members.flatMap((id) => {
      const a = actorById(w, id);
      if (!a) return [];
      return [{ id, name: a.character.name, vocation: w.data.vocations[a.character.vocation].name, level: a.character.level, hp: a.character.health, maxHp: a.stats.maxHealth, isYou: id === p.id, isLeader: id === party.leaderId, near: Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) <= PARTY_SHARE_RANGE, dead: a.dead }];
    }),
  };
}

export function buildSnapshot(sim: GameSimulation, version: number): UiSnapshot {
  const w = sim.world;
  const p = w.player;
  const c = p.character;
  const voc = w.data.vocations[c.vocation];
  const xpCfg = w.data.balance.experience;
  const t = p.targetId ? w.monsters.get(p.targetId) : undefined;
  const ta = !t && p.targetId ? actorById(w, p.targetId) : null;
  const inv = pendingInviteFor(w, p.id);
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
    target:
      t && t.alive
        ? { id: t.id, name: t.def.name, hp: t.hp, maxHp: t.def.health, distance: Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)), inRange: Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) <= p.stats.weapon.range, isPlayer: false }
        : ta
          ? { id: ta.id, name: ta.character.name, hp: ta.character.health, maxHp: ta.stats.maxHealth, distance: Math.max(Math.abs(ta.x - p.x), Math.abs(ta.y - p.y)), inRange: Math.max(Math.abs(ta.x - p.x), Math.abs(ta.y - p.y)) <= p.stats.weapon.range, isPlayer: true }
          : null,
    party: partyView(sim),
    invite: inv ? { fromId: inv.fromId, fromName: actorName(w, inv.fromId) } : null,
    pvp: w.social.pvp,
    standAttack: c.flags.standAttack === true,
    pk: { skull: skullOf(w, p.id)?.kind ?? null, skullMs: Math.max(0, (skullOf(w, p.id)?.until ?? 0) - pkNow(w)), pzLockMs: pzLockMs(w, p.id) },
    heroes: [...w.heroes.values()].map((h) => ({
      id: h.id,
      name: h.character.name,
      title: h.hero.title,
      vocation: h.character.vocation,
      vocationName: w.data.vocations[h.character.vocation].name,
      level: h.character.level,
      hp: h.character.health,
      maxHp: h.stats.maxHealth,
      inParty: sameParty(w, p.id, h.id),
      isLeader: w.social.party?.leaderId === h.id,
      skull: skullOf(w, h.id)?.kind ?? null,
      activity: heroActivity(w, h),
      attackBlocked: (() => {
        const f = canAttackActor(w, p, h);
        return f ? PVP_FAIL_MESSAGE[f] : null;
      })(),
      distance: Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)),
      dead: h.dead,
      region: regionAt(w.map, h.x, h.y)?.name ?? 'Terras desconhecidas',
    })),
    hotbar: hotbarView(sim),
    spellbook: voc.spells.map((id) => spellView(sim, id)),
    inventory: c.inventory.map((st) => (st ? itemView(sim, st) : null)),
    equipment,
    slotLabels: SLOT_LABEL,
    potions: { health: ['potion_health', 'potion_health_great', 'potion_health_supreme'].reduce((s, id) => s + countItem(c.inventory, id), 0), mana: ['potion_mana', 'potion_mana_great', 'potion_mana_supreme'].reduce((s, id) => s + countItem(c.inventory, id), 0), cooldown: remaining(p.cooldowns, POTION, w.now) },
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
