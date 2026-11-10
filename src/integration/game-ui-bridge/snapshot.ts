// Projeção do estado da simulação para a interface (somente leitura, dados prontos para exibir).
// É uma função pura: a interface nunca acessa diretamente o estado mutável da simulação.
import {
  EQUIP_SLOTS,
  SKILL_IDS,
  SKILL_LABEL,
  SLOT_LABEL,
  type EquipSlot,
  type ItemDef,
  type SkillId,
} from '../../domain/entities/definitions';
import type { ItemStack } from '../../domain/entities/character';
import { levelProgress, totalXpForLevel } from '../../domain/rules/experience';
import { skillProgress } from '../../domain/rules/skills';
import { castFailMessage } from '../../domain/rules/spells';
import type { GameData } from '../../domain/entities/gameData';
import type { MarketState } from '../../domain/rules/market';
import { countItem } from '../../domain/rules/inventory';
import { bestPotionFor, usablePotionCount } from '../../domain/rules/potions';
import { isSellLocked, keptFromSellAll } from '../../domain/rules/economy';
import { HOTBAR_SIZE, parseHotbarEntry } from '../../domain/rules/hotbar';
import { spellManaCost } from '../../domain/rules/spells';
import { escrowOf, marketable, quoteBuy, parcelUnits, priceGuide, type MarketOffer, type PriceGuide } from '../../domain/rules/market';
import { buildCatalog, categoryOf, compareItem, type CatalogItem, type MarketCategoryId, type Comparison } from '../../domain/rules/marketCatalog';
import { isUpgrade, itemAttack, itemDefense } from '../../domain/rules/itemPower';
import { POTION, remaining } from '../../domain/rules/cooldowns';
import { isPz, buildingAt, regionAt } from '../../game/world/GameMap';
import type { GameSimulation } from '../../game/simulation/GameSimulation';
import { castCheck, spellCooldownRemaining } from '../../game/abilities/spells';
import { nearbyInteractables } from '../../game/interaction/interaction';
import { nearbyLootBags } from '../../game/inventory/inventoryService';
import { selectedActor } from '../../game/combat/combat';
import {
  PARTY_SHARE_RANGE,
  PVP_FAIL_MESSAGE,
  actorById,
  actorName,
  canAttackActor,
  partyOf,
  pkNow,
  pzLockMs,
  skullOf,
  skullSeenBy,
  pendingInviteFor,
  sameParty,
  GUILD_NAMES,
  guildOf,
  type WarMode,
} from '../../game/social/social';
import { allActors } from '../../game/simulation/World';
import { heroActivity } from '../../game/ai/heroBrain';
import { personaOf } from '../../game/ai/heroTactics';

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
  /** Quanto a melhor loja paga por uma unidade (e qual), ou null se nenhuma compra. */
  npcSell: { price: number; shop: string } | null;
  /** Anúncio de venda mais barato no Mercado de Pedraluz (preço por unidade e quantos anúncios há), ou null. */
  market: { price: number; listings: number } | null;
  /** Nível mínimo para usar (equipar ou beber); 0 = qualquer nível. */
  minLevel: number;
  /** Categoria (a mesma do mercado: espadas, capacetes, poções de vida...) ou null para os itens diversos. */
  category: MarketCategoryId | null;
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
  /** Grau da magia (2 = II, 3 = III); 0 nas magias sem graus. */
  tier: number;
}

/** Uma oferta do livro do mercado. */
export interface MarketOfferView {
  id: string;
  side: 'sell' | 'buy';
  itemId: string;
  count: number;
  price: number;
  owner: string;
  mine: boolean;
  at: number;
}

export interface MarketLogView {
  kind: 'buy' | 'sell';
  itemId: string;
  count: number;
  /** Preço por unidade. */
  price: number;
  at: number;
}

export type MarketQuoteView = PriceGuide;

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
  stats: {
    armor: number;
    shieldDefense: number;
    weaponName: string;
    weaponAttack: string;
    range: number;
    attackInterval: number;
    magicLevel: number;
    damageReduction: number;
  };
  skills: { id: SkillId; label: string; level: number; base: number; pct: number }[];
  buffs: { kind: string; remainingMs: number }[];
  target: {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    distance: number;
    inRange: boolean;
    isPlayer: boolean;
  } | null;
  /** Grupo atual (se o jogador estiver em um). */
  party: {
    leaderId: string;
    youAreLeader: boolean;
    formation: 'free' | 'follow' | 'line';
    targeting: 'nearest' | 'leader' | 'lure';
    friendlyFire: boolean;
    sparMode: 'training' | 'duel';
    /** Os heróis do grupo estão segurando a posição (ordem do painel). */
    holding: boolean;
    /** Grupo da guilda (guerra de guildas): ninguém entra nem sai. */
    locked: boolean;
    members: {
      id: string;
      name: string;
      vocation: string;
      level: number;
      hp: number;
      maxHp: number;
      isYou: boolean;
      isLeader: boolean;
      near: boolean;
      dead: boolean;
      /** Herói: personalidade (agressivo, cauteloso...) e o que está fazendo agora. */
      persona?: string;
      activity?: string;
    }[];
  } | null;
  /** Convite de grupo recebido e ainda válido. */
  invite: { fromId: string; fromName: string } | null;
  pvp: boolean;
  /** Modo guerra e, na guerra de guildas, quem está em cada uma (a sua é `mine`). */
  war: {
    mode: WarMode;
    mine: 0 | 1 | null;
    guilds: { name: string; members: { id: string; name: string; level: number; me: boolean }[] }[];
  };
  standAttack: boolean;
  /** Personagem marcado no botão de seleção (o ataque vai nele). */
  selectedActor: { id: string; name: string } | null;
  /** "Ir até": o personagem que você está indo encontrar (e a distância). */
  goingTo: { name: string; distance: number } | null;
  /** Tempo restante da caveira do jogador (ms), 0 sem caveira. */
  /** PK estilo Tibia: caveira atual (tipo e tempo restante) e PZ lock restante. */
  pk: { skull: 'white' | 'yellow' | 'red' | null; skullMs: number; pzLockMs: number };
  /** Heróis no mundo (para o menu ao tocar neles). */
  /** Heróis numa pausa (saíram e voltam sozinhos daqui a pouco). */
  resting: { id: string; name: string; vocation: string; level: number; backInMin: number }[];
  heroes: {
    id: string;
    name: string;
    title: string;
    vocation: string;
    vocationName: string;
    level: number;
    hp: number;
    maxHp: number;
    inParty: boolean;
    isLeader: boolean;
    skull: 'white' | 'yellow' | 'red' | null;
    activity: string;
    /** Personalidade do herói (Agressivo, Cauteloso, Ganancioso, Equilibrado). */
    persona: string;
    attackBlocked: string | null;
    distance: number;
    dead: boolean;
    region: string;
  }[];
  hotbar: HotbarSlotView[];
  /** Conjunto de favoritos de atalhos ativo (0 a 2). */
  hotbarSet: number;
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
    /** Ouro da mochila e do banco: a compra gasta o da mochila primeiro e completa com o do banco. */
    bankGold: number;
    /** `market`: anúncios mais baratos que a loja (preço do mais barato e quantas unidades há abaixo do preço da loja). */
    sells: { item: ItemView; price: number; canAfford: boolean; market: { price: number; units: number } | null }[];
    buys: { item: ItemView; price: number; owned: number }[];
  } | null;
  depot: { npcName: string; gold: number; bankGold: number; items: (ItemView | null)[] } | null;
  /** Mercado de Pedraluz (só com a janela do corretor aberta). */
  market: {
    npcName: string;
    /** Todas as ofertas (venda e compra) de todos os itens. */
    offers: MarketOfferView[];
    /** Guia de preços de cada item do catálogo (sem contar as suas próprias ofertas). */
    quotes: Record<string, MarketQuoteView>;
    /** Equipamentos e poções que você tem (mochila + depósito). */
    owned: Record<string, number>;
    /** Dos que você tem, os travados (cadeado ou poção): o "vender tudo rápido" só os leva com confirmação à parte. */
    kept: Record<string, boolean>;
    /** Comparação de cada item do catálogo com o que você usa (melhor, pior, igual, nível, vocação). */
    fits: Record<string, Comparison>;
    /** Unidades compradas esperando para ser retiradas. */
    parcels: number;
    /** Ouro disponível para comprar (bolsa + banco). */
    money: number;
    /** Ouro reservado nas suas ofertas de compra. */
    escrow: number;
    /** Registro das suas compras e vendas (do mais recente ao mais antigo). */
    log: MarketLogView[];
  } | null;
  loot: {
    title: string;
    bags: number;
    gold: number;
    /** Itens no chão ao redor; os agrupáveis (materiais, poções…) de vários sacos aparecem juntos numa pilha só. */
    items: { bagId: string; index: number; item: ItemView; refs: { bagId: string; index: number }[] }[];
  } | null;
  region: string | null;
  regionId: string | null;
  building: string | null;
}

function itemLines(def: ItemDef): string[] {
  const l: string[] = [];
  const w = def.weapon;
  if (w) {
    if (w.kind === 'wand')
      l.push(
        `Dano: ${w.damage?.[0]}-${w.damage?.[1]} (${w.element === 'fire' ? 'fogo' : w.element === 'energy' ? 'energia' : w.element === 'earth' ? 'terra' : 'gelo'})`,
        `Mana por disparo: ${w.manaCost}`,
      );
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

/** Junta, entre os sacos ao redor, as pilhas do mesmo item agrupável (o equipamento continua um por um). */
function groupLoot(sim: GameSimulation, bags: readonly { id: string; items: readonly ItemStack[] }[]): NonNullable<UiSnapshot['loot']>['items'] {
  const out: NonNullable<UiSnapshot['loot']>['items'] = [];
  const byItem = new Map<string, { count: number; refs: { bagId: string; index: number }[] }>();
  for (const b of bags)
    b.items.forEach((st, index) => {
      const ref = { bagId: b.id, index };
      if (!sim.world.data.items[st.itemId]?.stackable) {
        out.push({ ...ref, item: itemView(sim, st), refs: [ref] });
        return;
      }
      const g = byItem.get(st.itemId);
      if (g) {
        g.count += st.count;
        g.refs.push(ref);
      } else byItem.set(st.itemId, { count: st.count, refs: [ref] });
    });
  const grouped = [...byItem.entries()].map(([itemId, g]) => ({
    ...g.refs[0]!,
    item: itemView(sim, { itemId, count: g.count }),
    refs: g.refs,
  }));
  return [...grouped, ...out];
}

function marketView(sim: GameSimulation, npcName: string): NonNullable<UiSnapshot['market']> {
  const w = sim.world;
  const c = w.player.character;
  const m = w.market;
  const owned: Record<string, number> = {};
  for (const st of [...c.inventory, ...c.depot])
    if (st && marketable(w.data.items[st.itemId])) owned[st.itemId] = (owned[st.itemId] ?? 0) + st.count;
  const quotes: Record<string, MarketQuoteView> = {};
  const fits: Record<string, Comparison> = {};
  // ofertas agrupadas por item uma vez só (o guia de cada item olha só as dele)
  const byItem = new Map<string, MarketOffer[]>();
  for (const o of m.offers) byItem.set(o.itemId, [...(byItem.get(o.itemId) ?? []), o]);
  for (const it of catalogOf(w.data)) {
    quotes[it.itemId] = priceGuide(w.data, { ...m, offers: byItem.get(it.itemId) ?? [] }, it.itemId, c.id);
    fits[it.itemId] = compareItem(w.data, c, w.data.items[it.itemId]!);
  }
  return {
    npcName,
    offers: m.offers.map((o) => ({
      id: o.id,
      side: o.side,
      itemId: o.itemId,
      count: o.count,
      price: o.price,
      owner: o.ownerName,
      mine: o.ownerId === c.id,
      at: o.at,
    })),
    quotes,
    owned,
    kept: Object.fromEntries(Object.keys(owned).map((id) => [id, keptFromSellAll(c, id)])),
    fits,
    parcels: parcelUnits(m, c.id),
    money: c.gold + c.bankGold,
    escrow: escrowOf(m, c.id),
    log: [...(m.log[c.id] ?? [])].reverse(),
  };
}

/** Catálogo do mercado (fixo para os dados do jogo). */
const catalogCache = new WeakMap<GameData, CatalogItem[]>();
export function catalogOf(data: GameData): CatalogItem[] {
  let cat = catalogCache.get(data);
  if (!cat) catalogCache.set(data, (cat = buildCatalog(data)));
  return cat;
}

/** O que a melhor loja paga pelo item. */
function bestNpcBuy(data: GameData, itemId: string): ItemView['npcSell'] {
  let best: ItemView['npcSell'] = null;
  for (const shop of Object.values(data.shops))
    for (const o of shop.buys) if (o.itemId === itemId && (!best || o.price > best.price)) best = { price: o.price, shop: shop.name };
  return best;
}

/** O anúncio de venda mais barato do item no mercado. */
function marketLow(market: MarketState, itemId: string): ItemView['market'] {
  const ls = market.offers.filter((o) => o.itemId === itemId && o.side === 'sell');
  if (!ls.length) return null;
  return { price: Math.min(...ls.map((l) => l.price)), listings: ls.length };
}

export function itemView(sim: GameSimulation, stack: ItemStack): ItemView {
  const w = sim.world;
  const def = w.data.items[stack.itemId]!;
  const c = w.player.character;
  let blocked: string | null = null;
  if (def.vocations && !def.vocations.includes(c.vocation))
    blocked = `Apenas ${def.vocations.map((v) => w.data.vocations[v].name).join(', ')}`;
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
    npcSell: bestNpcBuy(w.data, def.id),
    market: marketLow(w.market, def.id),
    minLevel: def.minLevel ?? 0,
    category: categoryOf(def),
  };
}


function hotbarView(sim: GameSimulation): HotbarSlotView[] {
  const w = sim.world;
  const c = w.player.character;
  const potionCd = remaining(w.player.cooldowns, POTION, w.now);
  const out: HotbarSlotView[] = [];
  for (let index = 0; index < HOTBAR_SIZE; index++) {
    const e = parseHotbarEntry(c.hotbar[index]);
    const empty: HotbarSlotView = {
      index,
      kind: 'empty',
      spell: null,
      itemId: null,
      icon: null,
      name: 'Vazio',
      count: 0,
      cooldownRemaining: 0,
      cooldownMs: 0,
    };
    if (!e) out.push(empty);
    else if (e.kind === 'spell') {
      if (!w.data.spells[e.id]) out.push(empty);
      else
        out.push({ ...empty, kind: 'spell', spell: spellView(sim, e.id), name: w.data.spells[e.id]!.name });
    } else if (e.kind === 'potion') {
      out.push({
        ...empty,
        kind: 'potion',
        itemId: e.id,
        // ícone da maior poção que ele já pode beber (a do nível dele)
        icon: bestPotionFor(w.data, c.level, e.id === 'health' ? 'heal' : 'mana')?.icon ?? (e.id === 'health' ? 'item_potion_health' : 'item_potion_mana'),
        name: e.id === 'health' ? 'Poção de vida (automática)' : 'Poção de mana (automática)',
        count: usablePotionCount(w.data, c, e.id === 'health' ? 'heal' : 'mana'), // só as que ele já pode beber
        cooldownRemaining: potionCd,
        cooldownMs: 1000,
      });
    } else {
      const def = w.data.items[e.id];
      if (!def) out.push(empty);
      else
        out.push({
          ...empty,
          kind: 'item',
          itemId: def.id,
          icon: def.icon,
          name: def.name,
          count: countItem(c.inventory, def.id),
          cooldownRemaining: def.type === 'potion' ? potionCd : 0,
          cooldownMs: def.use?.cooldownMs ?? 1000,
        });
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
    manaCost: spellManaCost(s, c.level),
    cooldownMs: s.cooldownMs,
    cooldownRemaining: spellCooldownRemaining(w, id),
    minLevel: s.minLevel,
    minMagicLevel: s.minMagicLevel,
    ready: check.ok,
    unlocked,
    reason: check.ok ? null : castFailMessage(check.reason, check.detail),
    target: s.target,
    color: s.vfx.color,
    tier: s.baseId ? (s.tier ?? 0) : 0,
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
    holding: party.members.some((id) => w.heroes.get(id)?.brain.order?.kind === 'hold'),
    locked: party.guild !== undefined,
    members: party.members.flatMap((id) => {
      const a = actorById(w, id);
      if (!a) return [];
      const hero = w.heroes.get(id);
      return [
        {
          id,
          name: a.character.name,
          vocation: w.data.vocations[a.character.vocation].name,
          level: a.character.level,
          hp: a.character.health,
          maxHp: a.stats.maxHealth,
          isYou: id === p.id,
          isLeader: id === party.leaderId,
          near: Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) <= PARTY_SHARE_RANGE,
          dead: a.dead,
          ...(hero && hero.id !== p.id
            ? { persona: personaOf(hero.hero.temperament).label, activity: heroActivity(w, hero) }
            : {}),
        },
      ];
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
  const marketNpc = w.ui.market ? w.npcs.get(w.ui.market.npcId) : undefined;
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
      weaponAttack:
        p.stats.weapon.kind === 'wand'
          ? `${p.stats.weapon.damage?.[0]}-${p.stats.weapon.damage?.[1]}`
          : String(p.stats.weapon.attack),
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
      pct: skillProgress(id, c.skills[id], voc.skillMultipliers[id], w.data.balance, voc.magicGrowth),
    })),
    buffs: p.buffs
      .filter((b) => b.expiresAt > w.now)
      .map((b) => ({ kind: b.kind, remainingMs: b.expiresAt - w.now })),
    target:
      t && t.alive
        ? {
            id: t.id,
            name: t.def.name,
            hp: t.hp,
            maxHp: t.def.health,
            distance: Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)),
            inRange: Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) <= p.stats.weapon.range,
            isPlayer: false,
          }
        : ta
          ? {
              id: ta.id,
              name: ta.character.name,
              hp: ta.character.health,
              maxHp: ta.stats.maxHealth,
              distance: Math.max(Math.abs(ta.x - p.x), Math.abs(ta.y - p.y)),
              inRange: Math.max(Math.abs(ta.x - p.x), Math.abs(ta.y - p.y)) <= p.stats.weapon.range,
              isPlayer: true,
            }
          : null,
    party: partyView(sim),
    invite: inv ? { fromId: inv.fromId, fromName: actorName(w, inv.fromId) } : null,
    pvp: w.social.pvp,
    war: {
      mode: w.social.war.mode,
      mine: guildOf(w, p.id),
      guilds:
        w.social.war.mode === 'guilds'
          ? GUILD_NAMES.map((name, g) => ({
              name,
              members: allActors(w)
                .filter((a) => guildOf(w, a.id) === g)
                .map((a) => ({
                  id: a.id,
                  name: a.character.name,
                  level: a.character.level,
                  me: a.id === p.id,
                }))
                .sort((a, b) => b.level - a.level),
            }))
          : [],
    },
    standAttack: c.flags.standAttack === true,
    goingTo: (() => {
      const t = sim.goToId ? w.heroes.get(sim.goToId) : undefined;
      return t ? { name: t.character.name, distance: Math.max(Math.abs(t.x - w.human.x), Math.abs(t.y - w.human.y)) } : null;
    })(),
    selectedActor: (() => {
      const a = selectedActor(w);
      return a ? { id: a.id, name: a.character.name } : null;
    })(),
    pk: {
      skull: skullOf(w, p.id)?.kind ?? null,
      skullMs: Math.max(0, (skullOf(w, p.id)?.until ?? 0) - pkNow(w)),
      pzLockMs: pzLockMs(w, p.id),
    },
    resting: sim.resting.map((r) => ({
      id: r.hero.id,
      name: r.character.name,
      vocation: r.character.vocation,
      level: r.character.level,
      backInMin: Math.max(1, Math.ceil((r.backAt - w.now) / 60000)),
    })),
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
      skull: skullSeenBy(w, p.id, h.id),
      activity: heroActivity(w, h),
      persona: personaOf(h.hero.temperament).label,
      attackBlocked: (() => {
        const f = canAttackActor(w, p, h);
        return f ? PVP_FAIL_MESSAGE[f] : null;
      })(),
      distance: Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)),
      dead: h.dead,
      region: regionAt(w.map, h.x, h.y)?.name ?? 'Terras desconhecidas',
    })),
    hotbar: hotbarView(sim),
    hotbarSet: c.hotbarSet ?? 0,
    spellbook: voc.spells.map((id) => spellView(sim, id)),
    inventory: c.inventory.map((st) => (st ? itemView(sim, st) : null)),
    equipment,
    slotLabels: SLOT_LABEL,
    potions: {
      health: ['potion_health', 'potion_health_great', 'potion_health_supreme'].reduce(
        (s, id) => s + countItem(c.inventory, id),
        0,
      ),
      mana: ['potion_mana', 'potion_mana_great', 'potion_mana_supreme'].reduce(
        (s, id) => s + countItem(c.inventory, id),
        0,
      ),
      cooldown: remaining(p.cooldowns, POTION, w.now),
    },
    interaction: near ? { kind: near.kind, id: near.id, label: near.label } : null,
    dialog:
      dialogNpc && page
        ? {
            npcName: dialogNpc.def.name,
            npcTitle: dialogNpc.def.title,
            sprite: dialogNpc.def.sprite,
            text: page.text,
            options: page.options.map((o) => o.label),
          }
        : null,
    shop:
      shopDef && shopNpc
        ? {
            name: shopDef.name,
            npcName: shopNpc.def.name,
            bankGold: c.bankGold,
            sells: shopDef.sells.map((o) => {
              const units = quoteBuy(w.market, o.itemId, 10_000, c.id, o.price - 1).count;
              const best = units ? quoteBuy(w.market, o.itemId, 1, c.id, o.price - 1).total : 0;
              return {
                item: itemView(sim, { itemId: o.itemId, count: 1 }),
                price: o.price,
                canAfford: c.gold + c.bankGold >= o.price,
                market: units ? { price: best, units } : null,
              };
            }),
            buys: shopDef.buys.map((o) => ({
              item: itemView(sim, { itemId: o.itemId, count: 1 }),
              price: o.price,
              owned: countItem(c.inventory, o.itemId),
            })),
          }
        : null,
    depot: depotNpc
      ? {
          npcName: depotNpc.def.name,
          gold: c.gold,
          bankGold: c.bankGold,
          items: c.depot.map((st) => (st ? itemView(sim, st) : null)),
        }
      : null,
    market: marketNpc ? marketView(sim, marketNpc.def.name) : null,
    loot: bags.length
      ? {
          title: bags.length === 1 ? `Loot: ${bags[0]!.sourceName}` : `Loot ao redor (${bags.length} sacos)`,
          bags: bags.length,
          gold: bags.reduce((s, b) => s + b.gold, 0),
          items: groupLoot(sim, bags),
        }
      : null,
    region: region?.name ?? null,
    regionId: region?.id ?? null,
    building: building?.name ?? null,
  };
}
