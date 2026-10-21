// "Cérebro" de um herói: decide o que um jogador faria e executa usando os MESMOS comandos do jogador
// (caminhar, mirar, conjurar, beber poção, pegar loot, conversar com NPCs, comprar, vender, banco).
// Roda dentro de `asActor`, então `w.player` é o próprio herói. As decisões seguem o temperamento:
// coragem (onde caça e quando recua), ganância (quanto loot/ouro acumula), disciplina (treino),
// sociabilidade (conversa/praça) e prudência (poções).
// Além disso tem memória (quanto cada área rendeu de XP por minuto, onde morreu), uma relação com cada
// personagem (amizade/rivalidade), decide com um pouco de acaso (improvisa), joga em grupo e, com o PK
// ligado, pesa se vale atacar alguém (ganho, força relativa, vingança, caveira) — sem motivo, não ataca.
import type { HeroLineKey, ItemDef } from '../../domain/entities/definitions';
import { chebyshev } from '../../domain/value-objects/position';
import { addItem, countItem, freeSlots, removeAt } from '../../domain/rules/inventory';
import { canUseItem, isUpgrade, itemScore } from '../../domain/rules/itemPower';
import { isPz } from '../world/GameMap';
import type { HeroEntity, MonsterEntity, NpcEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { asActor } from '../simulation/World';
import { isMoving, tryStep } from '../movement/movement';
import { planWalk } from '../movement/walk';
import { AMMO_GOAL, isRanged, ROLES } from './heroRoles';
import { countAmmo } from '../../domain/rules/ammo';
import { stepAway } from '../movement/movement';
import { alliesNear, assess, engagedOrJoining, fightMargin, monstersNear, RISKY_MARGIN, SAFE_MARGIN } from './heroThreat';
import { castCheck, castSpell } from '../abilities/spells';
import { currentTarget, hasLineOfSight, respawnPlayer, setTarget } from '../combat/combat';
import { chooseDialogOption, interactWith, LOOT_RANGE } from '../interaction/interaction';
import { equipItem, takeAllNearbyLoot, useInventoryItem } from '../inventory/inventoryService';
import { buyItem, sellItem } from '../economy/shopService';
import { bankGold } from '../economy/depotService';
import { acceptInvite, actorById, attackedRecently, declineInvite, formationSpot, hasSkull, invite, isPzLocked, isSparring, leaveParty, partyOf, pendingInviteFor, sameParty } from '../social/social';

export type HeroMode = 'decide' | 'hunt' | 'town' | 'train' | 'social' | 'retreat' | 'dead' | 'follow' | 'pk' | 'recover';

type TownStep = { kind: 'shop'; npcId: string; buyPotions?: boolean; buyAmmo?: boolean; upgrades?: boolean; trainingWeapon?: boolean } | { kind: 'bank'; op: 'withdraw' | 'deposit' } | { kind: 'heal' };

export interface HeroBrainState {
  mode: HeroMode;
  nextThinkAt: number;
  modeUntil: number;
  /** Monstro que está caçando agora. */
  quarry: string | null;
  /** Centro da área de caça escolhida. */
  spot: { x: number; y: number } | null;
  town: TownStep[];
  stepStartedAt: number;
  /** -1 (frustrado) .. 1 (empolgado): muda com vitórias, mortes e níveis. */
  mood: number;
  lastSpeech: Partial<Record<HeroLineKey, number>>;
  lastSpokeAt: number;
  lastHitBy: string | null;
  deadAt: number;
  /** Arma principal guardada durante o treino. */
  mainWeapon: string | null;
  trainStart: { sword: number; shielding: number } | null;
  lastPos: { x: number; y: number; at: number };
  /** O que fazer quando terminar a passagem pela vila. */
  after: HeroMode;
  failures: number;
  nextUpgradeTripAt: number;
  /** Tentativas de recuperar o saco de morte (perde tudo ao morrer: ele volta para buscar). */
  recoverTries: number;
  /** Início da visita à vila (limite total de tempo) e quando pode voltar por motivo não urgente. */
  townStartedAt: number;
  nextTownAt: number;
  /** Último destino pedido ao andar (evita replanejar o mesmo caminho a cada decisão). */
  walkReq: { x: number; y: number } | null;
  // ---- memória e personalidade em ação
  /** XP e tempo de caça por monstro (aprende onde rende mais) e mortes recentes por área. */
  areaStats: Record<string, { xp: number; ms: number; deaths: number; lastDeathAt: number }>;
  huntXp: number;
  huntStartedAt: number;
  /** Relação com cada personagem: -1 (inimigo) .. 1 (amigo). */
  affinity: Record<string, number>;
  /** Vingança: até quando quer revidar contra quem o matou. */
  grudge: { id: string; until: number } | null;
  /** Alvo do PK (quando decidiu atacar alguém). */
  pkTargetId: string | null;
  nextPkThinkAt: number;
  nextWhimAt: number;
  nextInviteAt: number;
  inviteSeenAt: number;
  nextGiftAt: number;
  /** Nome de quem o matou no PK (fala ao renascer). */
  pkLostTo: string | null;
  /** Desde quando o líder (humano) está parado — para não seguir alguém AFK para sempre. */
  leaderIdleSince: number;
  leaderLastPos: { x: number; y: number };
  /** Desde quando procura monstro sem achar (para trocar de ponto). */
  noTargetSince: number;
  /** Criaturas que ele evita caçar (por id) até o instante indicado: as que o mataram ou que se mostraram fortes demais. */
  avoid: Record<string, number>;
  /** Voltou machucado/morto: antes de caçar de novo passa na vila (cura, banco, poções). */
  prepare: boolean;
  /** Grupos entre heróis: quando deixa o grupo atual e quando pode formar/entrar em outro. */
  groupUntil: number;
  nextGroupAt: number;
  groupThinkAt?: number;
  /** Evita idas seguidas à vila só por munição quando não deu para comprar. */
  nextAmmoTripAt: number;
  /** Está sem recursos (poucas poções): caça só o que é folgado, com margem maior. */
  frugal: boolean;
}

export function newHeroBrain(): HeroBrainState {
  return {
    mode: 'decide',
    nextThinkAt: 0,
    modeUntil: 0,
    quarry: null,
    spot: null,
    town: [],
    stepStartedAt: 0,
    mood: 0.3,
    lastSpeech: {},
    lastSpokeAt: -Infinity,
    lastHitBy: null,
    deadAt: 0,
    mainWeapon: null,
    trainStart: null,
    lastPos: { x: 0, y: 0, at: 0 },
    after: 'decide',
    failures: 0,
    nextUpgradeTripAt: 0,
    recoverTries: 0,
    townStartedAt: 0,
    nextTownAt: 0,
    avoid: {},
    prepare: false,
    groupUntil: 0,
    nextGroupAt: 0,
    nextAmmoTripAt: 0,
    frugal: false,
    walkReq: null,
    areaStats: {},
    huntXp: 0,
    huntStartedAt: 0,
    affinity: {},
    grudge: null,
    pkTargetId: null,
    nextPkThinkAt: 0,
    nextWhimAt: 0,
    nextInviteAt: 30000,
    inviteSeenAt: 0,
    nextGiftAt: 0,
    pkLostTo: null,
    leaderIdleSince: 0,
    leaderLastPos: { x: 0, y: 0 },
    noTargetSince: 0,
  };
}

/** Texto curto do que o herói está fazendo (menu do personagem e fala de status). */
export function heroActivity(w: World, h: HeroEntity): string {
  const b = h.brain;
  if (h.dead) return 'morto (renascendo)';
  switch (b.mode) {
    case 'hunt':
      return `caçando ${w.data.monsters[b.quarry ?? '']?.name ?? 'monstros'}`;
    case 'town':
      return 'resolvendo coisas na vila';
    case 'train':
      return 'treinando skills';
    case 'social':
      return 'passeando pela vila';
    case 'retreat':
      return 'recuando para se curar';
    case 'recover':
      return 'buscando seus itens perdidos';
    case 'follow':
      return 'acompanhando o grupo';
    case 'pk':
      return b.pkTargetId === w.human.id ? 'caçando VOCÊ' : 'em combate com um jogador';
    default:
      return 'pensando no que fazer';
  }
}

const affinityOf = (h: HeroEntity, id: string) => h.brain.affinity[id] ?? 0.15;
export function changeAffinity(h: HeroEntity, id: string, delta: number): void {
  h.brain.affinity[id] = Math.max(-1, Math.min(1, affinityOf(h, id) + delta));
}

const THINK_MS = 300;
const TRAINING_WEAPON = 'training_sword';
/** Nível a partir do qual cada monstro vale a caça (dos dados; chefes ficam de fora). */
const huntLevels = (w: World): Record<string, number> =>
  Object.fromEntries(Object.values(w.data.monsters).filter((m) => !m.elite && m.level !== undefined).map((m) => [m.id, m.level!]));

// ------------------------------------------------------------------ fala
export function heroSay(w: World, h: HeroEntity, key: HeroLineKey, vars: Record<string, string | number> = {}, cooldownMs = 15000): void {
  const last = h.brain.lastSpeech[key] ?? -Infinity;
  if (w.now - last < cooldownMs || w.now - h.brain.lastSpokeAt < 2500) return;
  const lines = h.hero.lines[key];
  if (!lines?.length) return;
  let text = lines[w.rng.int(0, lines.length - 1)]!;
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  h.brain.lastSpeech[key] = w.now;
  h.brain.lastSpokeAt = w.now;
  w.events.emit('speech', { entityId: h.id, name: h.character.name, text, position: { x: h.x, y: h.y } });
}

/** Resposta quando o jogador toca no herói. */
export function heroStatusLine(w: World, h: HeroEntity): void {
  const c = h.character;
  heroSay(w, h, 'status', { level: c.level, area: heroActivity(w, h), gold: c.gold, potions: potionsOf(w, h) }, 0);
}

// ------------------------------------------------------------------ utilidades
const hpPct = (h: HeroEntity) => h.character.health / Math.max(1, h.stats.maxHealth);

function potionsOf(w: World, h: HeroEntity): number {
  return Object.values(w.data.items)
    .filter((i) => i.type === 'potion' && i.use?.heal && !i.use.mana)
    .reduce((s, i) => s + countItem(h.character.inventory, i.id), 0);
}

/** Cura total guardada em poções de vida (todas as pilhas). */
function potionHeal(w: World, h: HeroEntity): number {
  return h.character.inventory.reduce((s, st) => {
    const use = st && w.data.items[st.itemId]?.use;
    return st && use?.heal && !use.mana ? s + use.heal * st.count : s;
  }, 0);
}

/** Mana guardada em poções de mana. */
function manaStock(w: World, h: HeroEntity): number {
  return h.character.inventory.reduce((s, st) => {
    const use = st && w.data.items[st.itemId]?.use;
    return st && use?.mana && !use.heal ? s + use.mana * st.count : s;
  }, 0);
}

/** Estoque de mana que a vocação quer ter na mochila (0 = não compra). */
function manaGoal(h: HeroEntity): number {
  const mul = ROLES[h.character.vocation].manaStock;
  return mul ? Math.max(mul >= 2 ? 180 : 0, Math.round(h.stats.maxMana * mul)) : 0;
}

/** Tipo de munição do herói: a da arma, ou a de flecha para o Paladino mesmo com a lança na mão. */
function ammoTypeOf(h: HeroEntity): string | undefined {
  return h.stats.weapon.ammo ?? (ROLES[h.character.vocation].ammo ? 'arrow' : undefined);
}

/** Flechas na mochila (0 se a arma não usa munição). */
function ammoOf(w: World, h: HeroEntity): number {
  const type = ammoTypeOf(h);
  return type ? countAmmo(w.data, h.character.inventory, type) : 0;
}

/** Tem algum arco equipado ou na mochila? */
function ownsBow(w: World, h: HeroEntity): boolean {
  const ids = [h.character.equipment.mainHand?.itemId, ...h.character.inventory.map((st) => st?.itemId)];
  return ids.some((id) => !!id && !!w.data.items[id]?.weapon?.ammo);
}

/** A arma serve a este herói? Paladino só usa arcos (a flecha é o dano dele); os demais, nada de duas mãos. */
function weaponFits(w: World, h: HeroEntity, def: ItemDef): boolean {
  if (def.slot === 'offHand') {
    const main = h.character.equipment.mainHand;
    return !main || !w.data.items[main.itemId]?.twoHanded;
  }
  if (def.slot !== 'mainHand') return true;
  if (h.character.vocation === 'paladin') return !!def.weapon?.ammo;
  return !def.twoHanded;
}

/** Estoque de cura que ele quer ter ao sair da vila: 4 vidas cheias (mínimo 600). */
function healGoal(h: HeroEntity): number {
  return Math.max(600, h.stats.maxHealth * 4);
}

/** Margem exigida para puxar uma luta: o corajoso aceita menos, o prudente exige mais. */
function needMargin(h: HeroEntity): number {
  return SAFE_MARGIN - (h.hero.temperament.bravery - 0.5) * 0.4 + (h.brain.frugal ? 0.4 : 0) - (isRanged(h.character.vocation) ? 0.15 : 0);
}

/** Criaturas "de mentira" (vida cheia) para a régua avaliar uma área antes de ir até ela. */
function protoMonsters(w: World, id: string, n: number): MonsterEntity[] {
  const def = w.data.monsters[id];
  return def ? Array.from({ length: n }, () => ({ def, hp: def.health }) as unknown as MonsterEntity) : [];
}

/** Uma área serve se ele aguenta um grupo de 3 da presa e nenhuma espécie vizinha é perigosa demais sozinha. */
function quarryOk(w: World, h: HeroEntity, id: string): boolean {
  if ((h.brain.avoid[id] ?? 0) > w.now) return false;
  const need = needMargin(h);
  if (fightMargin(w, h, protoMonsters(w, id, 3)) < need) return false;
  // espécies que dividem a região (até 12 tiles de um ponto de surgimento da presa)
  const spawns = w.map.spawns.filter((s) => s.monsterId === id);
  const neighbours = new Set<string>();
  for (const sp of w.map.spawns) if (sp.monsterId !== id && spawns.some((q) => chebyshev(q, sp) <= 12)) neighbours.add(sp.monsterId);
  for (const nid of neighbours) if (fightMargin(w, h, protoMonsters(w, nid, 1)) < RISKY_MARGIN + 0.3) return false;
  return true;
}

/** Id da espécie pelo nome (o que o evento de dano informa). */
function monsterIdByName(w: World, name: string | null): string | null {
  if (!name) return null;
  return Object.values(w.data.monsters).find((d) => d.name === name)?.id ?? null;
}

function npcByShop(w: World, shopId: string): NpcEntity | undefined {
  return [...w.npcs.values()].find((n) => n.def.shopId === shopId);
}
function npcByAction(w: World, action: string): NpcEntity | undefined {
  return [...w.npcs.values()].find((n) => n.def.dialog[0]?.options.some((o) => o.action === action));
}

/** Valor do que a mochila renderia vendendo nas lojas (melhor preço de cada item). */
function lootValue(w: World, h: HeroEntity): number {
  let total = 0;
  for (const st of h.character.inventory) {
    const def = st && w.data.items[st.itemId];
    // poções e a munição que ele mesmo usa não são "loot para vender"
    if (!st || !def || st.itemId.startsWith('training_') || def.type === 'potion' || (def.type === 'ammo' && ammoTypeOf(h) === def.ammoType)) continue;
    const best = Math.max(0, ...Object.values(w.data.shops).map((s) => s.buys.find((o) => o.itemId === st.itemId)?.price ?? 0));
    total += best * st.count;
  }
  return total;
}

/** Melhor upgrade à venda que o herói pode usar (o mais caro que cabe no orçamento), ou null. */
export function bestUpgrade(w: World, h: HeroEntity, budget: number): { itemId: string; price: number; shopId: string } | null {
  let best: { itemId: string; price: number; shopId: string; gain: number } | null = null;
  for (const shop of Object.values(w.data.shops))
    for (const o of shop.sells) {
      const def = w.data.items[o.itemId];
      if (!def?.slot || !weaponFits(w, h, def) || def.weapon?.training || o.price > budget) continue;
      // Paladino sem nenhum arco (só a lança reserva): o primeiro arco que puder usar é prioridade
      const needBow = h.character.vocation === 'paladin' && !!def.weapon?.ammo && !ownsBow(w, h) && canUseItem(def, h.character);
      if (!needBow && !isUpgrade(w.data, h.character, def)) continue;
      const cur = h.character.equipment[def.slot];
      const gain = needBow ? 200 : valueFor(h, def) - (cur ? valueFor(h, w.data.items[cur.itemId]!) : 0);
      if (gain < 5) continue; // melhora irrelevante não vale a viagem nem o ouro
      if (!best || gain / o.price > best.gain / best.price) best = { itemId: o.itemId, price: o.price, shopId: shop.id, gain };
    }
  return best;
}

/** Quanto o item vale PARA este herói: guerreiros quase não ligam para mana extra. */
function valueFor(h: HeroEntity, def: ItemDef): number {
  const mage = h.character.vocation === 'sorcerer' || h.character.vocation === 'druid';
  const mana = (def.bonuses?.maxMana ?? 0) / 2;
  return itemScore(def) - (mage ? 0 : mana);
}

/** Sem flechas o Paladino troca o arco pela lança de arremesso (não gasta munição); com estoque, volta ao arco. */
function manageAmmoWeapon(w: World, h: HeroEntity): void {
  if (h.character.vocation !== 'paladin' || h.brain.mode === 'train') return;
  const c = h.character;
  const main = c.equipment.mainHand && w.data.items[c.equipment.mainHand.itemId];
  if (!main?.weapon || main.weapon.training) return;
  const ammo = ammoOf(w, h);
  const find = (pred: (d: ItemDef) => boolean) => c.inventory.findIndex((st) => st && pred(w.data.items[st.itemId]!) && canUseItem(w.data.items[st.itemId]!, c));
  if (main.weapon.ammo && ammo === 0) {
    const i = find((d) => d.weapon?.kind === 'distance' && !d.weapon.ammo && !d.weapon.training);
    if (i >= 0 && equipItem(w, i)) heroSay(w, h, 'retreat', {}, 60000);
  } else if (!main.weapon.ammo && main.weapon.kind === 'distance' && ammo >= 25) {
    const i = find((d) => !!d.weapon?.ammo);
    if (i >= 0) equipItem(w, i);
  }
}

/** Equipa o que estiver na mochila e for melhor (ex.: item achado que agora já pode usar). */
function equipBagUpgrades(w: World, h: HeroEntity): void {
  const c = h.character;
  for (let i = 0; i < c.inventory.length; i++) {
    const st = c.inventory[i];
    const def = st ? w.data.items[st.itemId] : undefined;
    if (!def?.slot || !weaponFits(w, h, def) || def.weapon?.training || !isUpgrade(w.data, c, def)) continue;
    if (def.weapon?.ammo && ammoOf(w, h) < 10) continue; // arco sem flechas não é melhoria
    const cur = c.equipment[def.slot];
    if (valueFor(h, def) - (cur ? valueFor(h, w.data.items[cur.itemId]!) : 0) < 5) continue;
    if (equipItem(w, i)) heroSay(w, h, 'upgrade', { item: def.name }, 0);
  }
}

function potionPrice(w: World): number {
  return Math.min(...Object.values(w.data.shops).flatMap((s) => s.sells.filter((o) => o.itemId === 'potion_health').map((o) => o.price)), 999);
}

function goTo(w: World, h: HeroEntity, x: number, y: number, maxNodes = 20000, stopWithin?: number): void {
  const b = h.brain;
  if (b.walkReq && b.walkReq.x === x && b.walkReq.y === y && h.path?.length) return;
  b.walkReq = { x, y };
  if (!planWalk(w, x, y, { quiet: true, maxNodes, stopWithin })) b.lastPos.at = w.now - 3000;
}

function setMode(w: World, h: HeroEntity, mode: HeroMode, durationMs = 0): void {
  const b = h.brain;
  if (b.mode === 'hunt' && mode !== 'hunt' && b.quarry) {
    const st = (b.areaStats[b.quarry] ??= { xp: 0, ms: 0, deaths: 0, lastDeathAt: -Infinity });
    st.xp += b.huntXp;
    st.ms += w.now - b.huntStartedAt;
  }
  if (mode === 'hunt') {
    b.huntXp = 0;
    b.huntStartedAt = w.now;
  }
  if (mode !== 'pk') b.pkTargetId = null;
  h.brain.mode = mode;
  h.brain.modeUntil = durationMs ? w.now + durationMs : 0;
  h.brain.stepStartedAt = w.now;
  if (mode !== 'hunt' && mode !== 'train') setTarget(w, null);
}

// ------------------------------------------------------------------ ciclo principal
export function updateHeroBrain(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (w.now < b.nextThinkAt) return;
  b.nextThinkAt = w.now + THINK_MS;
  if (h.dead) {
    if (b.mode !== 'dead') {
      b.mode = 'dead';
      b.deadAt = w.now;
      b.mood = Math.max(-1, b.mood - 0.6);
    } else if (w.now - b.deadAt > 5000) {
      if (b.quarry) {
        const st = (b.areaStats[b.quarry] ??= { xp: 0, ms: 0, deaths: 0, lastDeathAt: -Infinity });
        st.deaths++;
        st.lastDeathAt = w.now;
      }
      respawnPlayer(w);
      // aprende com a morte: evita a espécie que o matou por um tempo e passa na vila antes de voltar
      const killer = monsterIdByName(w, b.lastHitBy);
      if (killer) b.avoid[killer] = w.now + 25 * 60000;
      b.prepare = true;
      // quem morre volta para a vila com o orgulho ferido
      if (b.pkLostTo) heroSay(w, h, 'pkLose', { player: b.pkLostTo }, 0);
      else heroSay(w, h, 'death', { monster: b.lastHitBy ?? 'aquele monstro' }, 0);
      b.pkLostTo = null;
      restoreMainWeapon(w, h);
      setMode(w, h, 'decide');
    }
    return;
  }
  // anda preso? replaneja
  if (h.x !== b.lastPos.x || h.y !== b.lastPos.y) b.lastPos = { x: h.x, y: h.y, at: w.now };
  // parado com caminho por mais de 2,5 s (alguém no corredor, porta, ponte): desvia e tenta de novo
  const stuck = w.now - b.lastPos.at > 2500 && !!h.path?.length && !isMoving(h, w.now);
  if (stuck) {
    b.lastPos.at = w.now;
    const goal = h.pathGoal;
    sidestep(w, h);
    h.path = null;
    if (goal) goTo(w, h, goal.x, goal.y);
  }
  manageAmmoWeapon(w, h);
  survive(w, h);
  heroGroupLife(w, h);
  handleInvites(w, h);
  if (b.mode !== 'retreat' && thinkPvp(w, h)) return;
  if (b.mode !== 'pk' && b.mode !== 'retreat' && b.mode !== 'town' && followingHuman(w, h) && b.mode !== 'follow') setMode(w, h, 'follow');
  whims(w, h);
  switch (b.mode) {
    case 'decide':
      decide(w, h);
      break;
    case 'hunt':
      hunt(w, h, false);
      break;
    case 'train':
      train(w, h);
      break;
    case 'town':
      town(w, h);
      break;
    case 'social':
      social(w, h);
      break;
    case 'retreat':
      retreat(w, h);
      break;
    case 'recover':
      recover(w, h);
      break;
    case 'dead':
      setMode(w, h, 'decide');
      break;
    case 'follow':
      follow(w, h);
      break;
    case 'pk':
      pk(w, h);
      break;
  }
}

/** Reflexos de sobrevivência válidos em qualquer atividade: poção, cura, defesa, fuga. */
function survive(w: World, h: HeroEntity): void {
  const t = h.hero.temperament;
  const pct = hpPct(h);
  // quem está batendo nele: corpo a corpo encostado e atiradores dentro do alcance deles
  const attackers = [...w.monsters.values()].filter((m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= Math.min(3, Math.max(2, m.def.attack.range)));
  // régua de ameaça: quem está na briga, quanto dano chega por segundo e quanto tempo de vida resta
  const a = assess(w, h);
  const hp = h.character.health;
  // perigo de morrer antes da próxima poção: um golpe forte tira metade da vida, ou restam poucos segundos
  const danger = !!a && attackers.length > 0 && (hp < a.maxHit * 2.2 || a.secondsLeft < 3.5);
  // poção de vida: com alguém batendo, abaixo do limiar da prudência; em emergência (<25%) bebe sempre
  if ((pct < 0.45 + t.caution * 0.15 && attackers.length) || pct < 0.25 || danger) {
    const idx = pickPotion(w, h, danger || pct < 0.25);
    if (idx >= 0) useInventoryItem(w, idx);
  }
  if (pct < 0.65 && h.character.vocation === 'druid' && tryCast(w, h, 'sap_blessing')) {
    // Bênção da Seiva: cura forte + regeneração (e cura o grupo)
  } else if (pct < 0.6) tryCast(w, h, 'light_heal');
  if (pct < 0.7 && attackers.length >= 1 && isRanged(h.character.vocation) && h.character.mana > h.stats.maxMana * 0.5 && !h.buffs.some((b) => b.kind === 'manaShield')) tryCast(w, h, 'mana_shield');
  if (attackers.length >= 2 && pct < 0.75) tryCast(w, h, 'iron_roar');
  // mana baixa no meio da luta: bebe poção de mana para não ficar inútil (magias são o principal dano)
  const manaPct = h.character.mana / Math.max(1, h.stats.maxMana);
  if (manaPct < (isRanged(h.character.vocation) ? 0.4 : 0.35)) {
    const idx = pickManaPotion(w, h);
    if (idx >= 0) useInventoryItem(w, idx);
  }
  // foge ainda com vida: luta perdida (a régua diz que não dá), cercado de criaturas ou sem poção e metade da vida
  const noPotions = potionsOf(w, h) === 0;
  const outmatched = !!a && a.mons.length > 0 && a.margin < RISKY_MARGIN + (0.5 - t.bravery) * 0.3 && pct < 0.8;
  const swarmed = attackers.length >= 4 && pct < 0.7;
  const dry = noPotions && attackers.length > 0 && pct < 0.55;
  if ((outmatched || swarmed || dry || (pct < 0.32 - t.bravery * 0.12 && noPotions)) && h.brain.mode !== 'retreat' && !isPz(w.map, h.x, h.y)) {
    heroSay(w, h, 'retreat', {}, 20000);
    setMode(w, h, 'retreat');
  }
}

/** Índice da poção de vida na mochila que melhor compensa a vida que falta (-1 se não houver). */
function pickPotion(w: World, h: HeroEntity, panic = false): number {
  const missing = h.stats.maxHealth - h.character.health;
  const owned = h.character.inventory
    .map((st, i) => ({ i, heal: st ? (w.data.items[st.itemId]?.use?.heal ?? 0) : 0, mana: st ? w.data.items[st.itemId]?.use?.mana : 0 }))
    .filter((p) => p.heal > 0 && !p.mana)
    .sort((a, b) => a.heal - b.heal);
  if (panic) return owned[owned.length - 1]?.i ?? -1; // em apuros: a maior, cada segundo conta
  return (owned.find((p) => p.heal >= missing * 0.8) ?? owned[owned.length - 1])?.i ?? -1;
}

/** Índice da poção de mana na mochila que melhor compensa a mana que falta (-1 se não houver). */
function pickManaPotion(w: World, h: HeroEntity): number {
  const missing = h.stats.maxMana - h.character.mana;
  const owned = h.character.inventory
    .map((st, i) => ({ i, mana: st ? (w.data.items[st.itemId]?.use?.mana ?? 0) : 0, heal: st ? (w.data.items[st.itemId]?.use?.heal ?? 0) : 0 }))
    .filter((p) => p.mana > 0 && !p.heal)
    .sort((a, b) => a.mana - b.mana);
  return (owned.find((p) => p.mana >= missing * 0.8) ?? owned[owned.length - 1])?.i ?? -1;
}

function tryCast(w: World, h: HeroEntity, spellId: string): boolean {
  const spell = w.data.spells[spellId];
  if (!spell || !spell.vocations.includes(h.character.vocation)) return false;
  if (!castCheck(w, spell).ok) return false;
  return castSpell(w, spellId);
}

// ------------------------------------------------------------------ decisões
/** Vale a viagem à vila? Só com motivo de verdade (mochila cheia, loot que compensa, poções acabando
 * com ouro para repor de uma vez, upgrade ao alcance) — viagens curtas e frequentes matam a caça. */
function needsTown(w: World, h: HeroEntity): boolean {
  if (isPzLocked(w, h.id)) return false; // com PZ lock não entra em lojas/templo
  const t = h.hero.temperament;
  const c = h.character;
  if (freeSlots(c.inventory) < 2) return true;
  // sem flecha o Paladino não ataca: repõe assim que dá, mesmo recém-saído da vila
  if (ROLES[c.vocation].ammo && ammoTypeOf(h) && ammoOf(w, h) < 8 && c.gold + c.bankGold + lootValue(w, h) >= 40 && w.now >= h.brain.nextAmmoTripAt) return true;
  // acabou de voltar da vila: só a mochila cheia justifica outra viagem (evita o vai e volta)
  if (w.now < h.brain.nextTownAt) return false;
  if (lootValue(w, h) >= 250 + t.greed * 600 + c.level * 60) return true;
  const potions = potionsOf(w, h);
  const price = potionPrice(w);
  const spendable = c.gold + lootValue(w, h) + c.bankGold;
  const minPotions = 1 + Math.round(t.caution * 4);
  // repõe só quando dá para comprar um bom estoque (senão volta à vila a cada 2 minutos)
  if (potions === 0 && spendable >= price * 5) return true;
  if (potions < minPotions && spendable >= price * 12) return true;
  // mana e flechas acabando (e dinheiro para repor)
  if (manaGoal(h) && manaStock(w, h) < manaGoal(h) * 0.3 && spendable >= 45 * 6) return true;
  if (ROLES[c.vocation].ammo && ammoTypeOf(h) && ammoOf(w, h) < AMMO_GOAL * 0.25 && spendable >= 100) return true;
  // estoque de cura abaixo de ~1,5 vidas cheias e dinheiro para um bom reforço
  if (potionHeal(w, h) < h.stats.maxHealth * 1.5 && spendable >= price * 8) return true;
  if (w.now < h.brain.nextUpgradeTripAt) return false;
  const up = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(w, h) - 40);
  return !!up;
}

/** Ouro que o herói gosta de manter na bolsa (o resto vai para o banco). */
function keepGold(w: World, h: HeroEntity): number {
  if (w.social.pvp) return 40 + h.character.level * 5;
  return 60 + h.character.level * 15 + Math.round((1 - h.hero.temperament.greed) * 60);
}

function decide(w: World, h: HeroEntity): void {
  const t = h.hero.temperament;
  const c = h.character;
  const b = h.brain;
  equipBagUpgrades(w, h);
  // morreu e perdeu tudo: volta ao local da morte para pegar o saco (o que caiu fica no chão para qualquer um)
  const grave = [...w.lootBags.values()].find((l) => l.ownerId === h.id);
  if (b.prepare && !isPzLocked(w, h.id) && isPz(w.map, h.x, h.y)) {
    // voltou da morte/fuga: cura, saca, repõe as poções e só então decide o resto
    return planTown(w, h, undefined, 'decide', true);
  }
  if (grave && b.recoverTries < 2 && !isPzLocked(w, h.id) && graveSafe(w, h, grave)) {
    b.recoverTries++;
    heroSay(w, h, 'recover', {}, 0);
    return setMode(w, h, 'recover', 4 * 60000);
  }
  if (!grave) b.recoverTries = 0;
  if (hpPct(h) < 0.5 && potionsOf(w, h) === 0 && !isPzLocked(w, h.id)) {
    // sem poções: descansa na área protegida até recuperar (regeneração dobrada) ou pede a bênção
    if (!isPz(w.map, h.x, h.y)) return setMode(w, h, 'retreat');
    // no templo: bênção do sacerdote (grátis) e, se der, repõe poções — nada de ficar parado esperando a vida voltar
    return planTown(w, h, undefined, 'decide', true);
  }
  if (needsTown(w, h)) return planTown(w, h);
  if (followingHuman(w, h)) return setMode(w, h, 'follow');
  const human = w.human;
  const humanNear = !human.dead && chebyshev(human, h) <= 10;
  const skillLag = c.skills.sword.level < 10 + c.level * 1.4 || c.skills.shielding.level < 10 + c.level * 1.1;
  const canTrain = countItem(c.inventory, TRAINING_WEAPON) > 0 || c.gold >= 60;
  const untried = Object.entries(huntLevels(w)).some(([id, lv]) => !h.brain.areaStats[id] && lv <= c.level + 1);
  // cada opção recebe uma nota; a escolha é sorteada com peso (quase sempre a melhor, às vezes improvisa)
  const options: [string, number][] = [
    ['hunt', 0.75 + h.brain.mood * 0.1],
    ['explore', untried ? 0.12 + t.bravery * 0.15 : 0],
    ['train', skillLag && canTrain && ROLES[c.vocation].trains ? t.discipline * 0.45 : 0],
    ['social', t.sociability * 0.08 + (humanNear ? 0.06 : 0)],
    ['invite', canInviteHuman(w, h) ? t.sociability * 0.5 + affinityOf(h, human.id) * 0.4 : 0],
  ];
  const total = options.reduce((s2, [, v]) => s2 + Math.max(0, v) ** 2, 0);
  let roll = w.rng.next() * total;
  let pick = 'hunt';
  for (const [k, v] of options) {
    roll -= Math.max(0, v) ** 2;
    if (roll <= 0) {
      pick = k;
      break;
    }
  }
  switch (pick) {
    case 'train':
      if (countItem(c.inventory, TRAINING_WEAPON) === 0) return planTown(w, h, [{ kind: 'shop', npcId: npcByShop(w, 'equipment')?.id ?? '', trainingWeapon: true }], 'train');
      return startTraining(w, h);
    case 'social':
      return setMode(w, h, 'social', 10000 + w.rng.next() * 12000);
    case 'invite':
      inviteHuman(w, h);
      return startHunt(w, h);
    case 'explore': {
      const q = chooseQuarry(w, h, true);
      heroSay(w, h, 'explore', { monster: w.data.monsters[q]?.name ?? q }, 60000);
      return startHunt(w, h, q);
    }
    default:
      startHunt(w, h);
  }
}

// ------------------------------------------------------------------ caça
/** XP por minuto esperada numa caça: o que aprendeu (se já caçou lá) ou uma estimativa pelo monstro. */
function expectedRate(w: World, h: HeroEntity, id: string): number {
  const st = h.brain.areaStats[id];
  const def = w.data.monsters[id];
  const prior = (def?.experience ?? 10) * 2.2;
  if (!st || st.ms < 90000) return prior;
  const learned = (st.xp / st.ms) * 60000;
  return learned * 0.8 + prior * 0.2;
}

function chooseQuarry(w: World, h: HeroEntity, explore = false): string {
  const t = h.hero.temperament;
  // sem poções escolhe uma caça mais tranquila (sem precisar voltar à vila)
  h.brain.frugal = potionHeal(w, h) < h.stats.maxHealth * 1.5;
  const lvl = h.character.level + (t.bravery - 0.5) * 3 + h.brain.mood - (potionsOf(w, h) === 0 ? 4 : h.brain.frugal ? 3 : 0) + alliesNear(w, h) * 1.5;
  const fits = Object.entries(huntLevels(w)).filter(([id, min]) => min <= lvl + 1 && w.map.spawns.some((s) => s.monsterId === id));
  // a régua de ameaça corta o que ele não aguenta (grupo da presa ou vizinho perigoso); sobrando nada, a caça mais fraca
  const options = fits.filter(([id]) => quarryOk(w, h, id));
  if (!options.length) {
    const weakest = fits.sort((a, c) => a[1] - c[1]).find(([id]) => (h.brain.avoid[id] ?? 0) <= w.now);
    return weakest?.[0] ?? 'slime';
  }
  const scored = options.map(([id, min]) => {
    const st = h.brain.areaStats[id];
    let score = expectedRate(w, h, id);
    if (min > lvl) score *= 0.5; // um pouco acima do nível: arriscado
    if (st && w.now - st.lastDeathAt < 15 * 60000) score *= 0.25; // morreu lá há pouco
    if (explore && !st) score *= 3; // vontade de conhecer uma área nova
    return { id, score: Math.max(0.1, score) };
  });
  // escolha ponderada: geralmente a melhor, mas às vezes improvisa
  const total = scored.reduce((s2, o) => s2 + o.score * o.score, 0);
  let roll = w.rng.next() * total;
  for (const o of scored) {
    roll -= o.score * o.score;
    if (roll <= 0) return o.id;
  }
  return scored[0]!.id;
}

function startHunt(w: World, h: HeroEntity, quarry = chooseQuarry(w, h)): void {
  const spawns = w.map.spawns.filter((s) => s.monsterId === quarry);
  const spawn = bestSpawn(w, h, quarry) ?? spawns[w.rng.int(0, spawns.length - 1)];
  h.brain.quarry = quarry;
  h.brain.noTargetSince = 0;
  h.brain.spot = spawn ? { x: spawn.x, y: spawn.y } : null;
  setMode(w, h, 'hunt', (10 + w.rng.next() * 8) * 60000);
  const def = w.data.monsters[quarry];
  const region = spawn ? w.map.regions.filter((r) => spawn.x >= r.x && spawn.x < r.x + r.w && spawn.y >= r.y && spawn.y < r.y + r.h).sort((a, b) => b.priority - a.priority)[0] : undefined;
  heroSay(w, h, 'hunt', { monster: def?.name ?? quarry, area: region?.name ?? 'a caça' }, 60000);
}

function hunt(w: World, h: HeroEntity, training: boolean, assisting = false): void {
  const b = h.brain;
  if (!training && b.mode === 'hunt' && (needsTown(w, h) || (b.modeUntil && w.now > b.modeUntil))) {
    heroSay(w, h, 'town', {}, 30000);
    return planTown(w, h);
  }
  helpHuman(w, h);
  supportParty(w, h);
  const target = currentTarget(w);
  if (target) {
    // golpes especiais quando vale a pena
    const adjacent = [...w.monsters.values()].filter((m) => m.alive && chebyshev(m, h) <= 1);
    if (!training || assisting) {
      fightSpells(w, h, target, adjacent.length);
      keepDistance(w, h);
    }
    // Loot no mesmo passo do combate: o que já está ao alcance é pego sem largar a criatura e, se for
    // seguro, ele já vai buscando o que caiu mais longe (sobreviver e atacar continuam em primeiro lugar).
    collectLootWhileFighting(w, h);
    chaseLoot(w, h, target);
    return;
  }
  // pega o loot da tela toda antes de procurar o próximo (a menos que alguém esteja batendo nele)
  const bag = nearestLoot(w, h);
  if (bag && !engagedByMonsters(w, h)) {
    if (chebyshev(bag, h) <= LOOT_RANGE) {
      collectLootWhileFighting(w, h);
    } else if (!isMoving(h, w.now) && !h.path?.length) goTo(w, h, bag.x, bag.y);
    return;
  }
  if (assisting) return;
  // próximo alvo: quem está batendo nele primeiro, depois a presa da área
  const quarry = training ? 'slime' : b.quarry;
  const candidates = [...w.monsters.values()].filter((m) => m.alive && !isPz(w.map, m.x, m.y) && chebyshev(m, h) <= 7 && (m.targetId === h.id || m.def.id === quarry) && hasLineOfSight(w, h, m));
  // quem já está nele tem prioridade; para puxar uma criatura nova, a régua precisa aprovar o grupo todo
  // (ela e as vizinhas que se juntariam à briga) e ele precisa estar com a vida em dia
  const engaged = engagedOrJoining(w, h);
  const approve = (m: MonsterEntity) => training || m.targetId === h.id || fightMargin(w, h, [...new Set([m, ...monstersNear(w, m, 3), ...engaged])]) >= needMargin(h);
  const near = candidates
    .filter(approve)
    .map((m) => ({ m, score: chebyshev(m, h) + monstersNear(w, m, 3).length * 1.5 - (m.targetId === h.id ? 100 : 0) }))
    .sort((a, c) => a.score - c.score)
    .map((o) => o.m);
  const next = near[0];
  if (!training && !next && candidates.length && !engaged.length) {
    // viu criaturas que a régua reprova: se uma sozinha já é demais, abandona a área; senão espera/escolhe outro ponto
    const bad = candidates.find((m) => m.targetId !== h.id && fightMargin(w, h, [m]) < RISKY_MARGIN + 0.3);
    if (bad) {
      b.avoid[bad.def.id] = w.now + 25 * 60000;
      if (quarry) b.avoid[quarry] = w.now + 10 * 60000;
      heroSay(w, h, 'retreat', {}, 20000);
      return startHunt(w, h, chooseQuarry(w, h));
    }
  }
  // só puxa criatura nova com a vida em dia: bebe uma poção sobrando ou vai se curar
  if (next && !training && next.targetId !== h.id && !engaged.length && hpPct(h) < 0.75) {
    if (potionsOf(w, h) > 3) {
      const idx = pickPotion(w, h);
      if (idx >= 0) useInventoryItem(w, idx);
    } else if (hpPct(h) < 0.55 && !isPzLocked(w, h.id)) {
      return planTown(w, h, undefined, 'decide', true);
    }
    return;
  }
  if (next) {
    b.noTargetSince = 0;
    setTarget(w, next.id);
    return;
  }
  // nada por perto: vai até a área (ou procura onde ainda tem monstro vivo)
  const spot = b.spot;
  if (!spot) return startHunt(w, h);
  if (!b.noTargetSince) b.noTargetSince = w.now;
  if (w.now - b.noTargetSince > 20000 && quarry) {
    // a área esvaziou (outro caçador, respawn lento): vai para o ponto com mais monstros vivos
    b.noTargetSince = w.now;
    const best = bestSpawn(w, h, quarry);
    if (best) b.spot = best;
    else if (!training) return startHunt(w, h, chooseQuarry(w, h));
  }
  if (isMoving(h, w.now) || h.path?.length) return;
  if (chebyshev(b.spot ?? spot, h) > 4) goTo(w, h, (b.spot ?? spot).x, (b.spot ?? spot).y);
  else if (w.rng.chance(0.3)) goTo(w, h, (b.spot ?? spot).x + w.rng.int(-3, 3), (b.spot ?? spot).y + w.rng.int(-3, 3));
}

/** Magias de combate de cada vocação (o Knight nos golpes corpo a corpo; os de longe nos projéteis e rajadas). */
function fightSpells(w: World, h: HeroEntity, target: MonsterEntity, adjacent: number): void {
  const manaPct = h.character.mana / Math.max(1, h.stats.maxMana);
  const dist = chebyshev(target, h);
  const cluster = monstersNear(w, target, 1).length;
  const engaged = engagedOrJoining(w, h).length;
  switch (h.character.vocation) {
    case 'knight':
      if (adjacent >= 2) tryCast(w, h, 'steel_whirlwind');
      if (dist <= 1 && hpPct(h) > 0.5) tryCast(w, h, 'brutal_strike');
      return;
    case 'sorcerer':
      if (engaged >= 2 && manaPct > 0.5 && !h.buffs.some((b) => b.kind === 'manaShield')) tryCast(w, h, 'mana_shield');
      if (monstersNear(w, h, 3).length >= 2 && manaPct > 0.3 && tryCast(w, h, 'fire_nova')) return;
      if (manaPct > 0.3 && tryCast(w, h, 'flame_lance')) return;
      if (manaPct > 0.2) tryCast(w, h, 'arcane_bolt');
      return;
    case 'druid':
      if (engaged >= 2 && manaPct > 0.5 && !h.buffs.some((b) => b.kind === 'manaShield')) tryCast(w, h, 'mana_shield');
      if ((cluster >= 2 || dist <= 3) && manaPct > 0.3 && tryCast(w, h, 'frost_burst')) return;
      if (manaPct > 0.2) tryCast(w, h, 'earth_thorn');
      return;
    case 'paladin': {
      if (dist <= 6 && manaPct > 0.4) tryCast(w, h, 'hunters_focus');
      if (dist <= 3 && target.def.attack.range <= 2 && manaPct > 0.25 && tryCast(w, h, 'stunning_arrow')) return; // lento: dá tempo de recuar
      if (cluster >= 2 && manaPct > 0.3 && ammoOf(w, h) >= 3 && tryCast(w, h, 'arrow_rain')) return;
      if (manaPct > 0.25) tryCast(w, h, 'holy_arrow');
      return;
    }
  }
}

/** Quem luta de longe recua um passo quando uma criatura corpo a corpo mais lenta (ou travada) chega perto. */
function keepDistance(w: World, h: HeroEntity): void {
  const keep = ROLES[h.character.vocation].keepDistance;
  if (!keep || isMoving(h, w.now) || h.path?.length) return;
  const close = [...w.monsters.values()]
    .filter((m) => m.alive && m.targetId === h.id && m.def.attack.range <= 2 && chebyshev(m, h) < keep)
    .sort((a, c) => chebyshev(a, h) - chebyshev(c, h));
  // cercado por 3 ou mais não adianta correr: luta (a régua de fuga cuida do resto)
  if (!close.length || close.length >= 3) return;
  const m = close[0]!;
  const speed = m.def.speed * (w.now < m.slowUntil ? m.slowFactor : 1);
  if (speed >= h.stats.speed * 0.95) return; // criatura mais rápida: recuar só dá golpe de graça
  stepAway(w, h, m.x, m.y, h.stats.speed, false);
}

/** Ponto de surgimento da presa com mais monstros vivos (empate: o mais perto). */
function bestSpawn(w: World, h: HeroEntity, quarry: string): { x: number; y: number } | null {
  let best: { x: number; y: number; score: number } | null = null;
  for (const sp of w.map.spawns) {
    if (sp.monsterId !== quarry) continue;
    const alive = [...w.monsters.values()].filter((m) => m.alive && m.spawnId === sp.id && !m.targetId).length;
    if (!alive) continue;
    const score = alive * 10 - chebyshev(sp, h) * 0.2;
    if (!best || score > best.score) best = { x: sp.x, y: sp.y, score };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Pode vender este item? Nunca poções, arma de treino nem equipamento melhor/que vai usar em breve. */
function sellable(w: World, h: HeroEntity, itemId: string): boolean {
  const c = h.character;
  if (!countItem(c.inventory, itemId) || itemId.startsWith('training_')) return false;
  const def = w.data.items[itemId];
  // munição só é guardada por quem a usa (o Knight vende as flechas que caem dos goblins)
  if (!def || def.type === 'potion' || (def.type === 'ammo' && ammoTypeOf(h) === def.ammoType)) return false;
  if (c.vocation === 'paladin' && def.weapon?.ammo) return false; // o arco fica para quando chegarem as flechas
  if (def.slot && (def.minLevel ?? 1) > c.level && (def.minLevel ?? 1) <= c.level + 3 && isUsableLater(w, h, itemId)) return false;
  if (def.slot && isUpgrade(w.data, c, def)) return false;
  return true;
}

function distOf(w: World, step: TownStep, from: { x: number; y: number }): number {
  const n = step.kind === 'shop' ? w.npcs.get(step.npcId) : step.kind === 'bank' ? npcByAction(w, 'openDepot') : npcByAction(w, 'heal');
  return n ? chebyshev(n, from) : 0;
}

/** Ajuda o jogador humano quando um monstro o ataca por perto (comportamento de bom companheiro). */
function helpHuman(w: World, h: HeroEntity): void {
  const human = w.human;
  if (human.dead || chebyshev(human, h) > 8 || affinityOf(h, human.id) < -0.2) return;
  const threat = [...w.monsters.values()].find((m) => m.alive && m.targetId === human.id && chebyshev(m, h) <= 7);
  if (!threat || h.targetId === threat.id) return;
  if (!currentTarget(w) || w.rng.chance(h.hero.temperament.bravery * 0.5)) {
    setTarget(w, threat.id);
    heroSay(w, h, 'help', { player: human.character.name }, 30000);
    changeAffinity(h, human.id, 0.02);
  }
}

/**
 * Em grupo, o herói não larga o time para caçar o monstro mais próximo: ele só luta quando a ameaça
 * é real (monstro atacando alguém do grupo) ou quando o alvo já está ao alcance. Caçar longe do líder
 * separates o grupo e ninguém mais ajuda ninguém.
 */
function keepWithGroup(w: World, h: HeroEntity): void {
  const leader = groupLeader(w, h) ?? w.human;
  const members = nearbyPartyMembers(w, h, PARTY_SUPPORT_RANGE);
  // o herói já pegou um alvo que o grupo está combatendo: pode ir pra cima dele
  const t = currentTarget(w);
  if (t && (members.some((m) => m.targetId === t.id) || t.targetId === leader.id)) return;
  // alvo de quem está longe do grupo: larga o alvo e volta para perto do líder
  if (t && chebyshev(t, leader) > BAIT_LEADER_RANGE) {
    setTarget(w, null);
  }
}

// ------------------------------------------------------------------ grupo: cura, poções e isca
/** Membros do grupo (vivo, por perto) do herói — inclui o jogador humano. */
function nearbyPartyMembers(w: World, h: HeroEntity, radius: number): PlayerEntity[] {
  const party = partyOf(w, h.id);
  if (!party) return [];
  return party.members
    .map((id) => actorById(w, id))
    .filter((m): m is PlayerEntity => !!m && !m.dead && chebyshev(m, h) <= radius);
}

/**
 * Papel de suporte do herói em grupo: cura os colegas feridos (com a magia de cura do grupo),
 * dá poção de vida a quem está morrendo e bebe poção de mana quando precisa.
 * Roda antes da decisão de combate: quem está lutando precisa estar de pé.
 */
function supportParty(w: World, h: HeroEntity): void {
  const members = nearbyPartyMembers(w, h, PARTY_SUPPORT_RANGE);
  if (!members.length) return;
  // cura o colega mais ferido por perto (a magia de grupo alcança todo mundo no raio)
  const hurt = members
    .map((m) => ({ m, pct: m.character.health / Math.max(1, m.stats.maxHealth) }))
    .filter((x) => x.pct < 0.6)
    .sort((a, b) => a.pct - b.pct)[0];
  if (hurt) {
    if (tryCast(w, h, 'sap_blessing')) return;
    if (tryCast(w, h, 'light_heal') && hurt.pct < 0.45) return;
  }
  // poção de vida para o colega em estado crítico
  const dying = hurt && hurt.pct < 0.3 ? hurt.m : null;
  if (dying && potionsOf(w, h) >= 2 && w.now >= h.brain.nextGiftAt) {
    giftPotionTo(w, h, dying);
  }
}

/** Dá uma poção de vida da mochila para um colega de grupo. */
function giftPotionTo(w: World, h: HeroEntity, mate: PlayerEntity): void {
  const idx = h.character.inventory.findIndex((st) => st?.itemId === 'potion_health');
  if (idx < 0) return;
  if (addItem(w.data, mate.character.inventory, 'potion_health', 1) !== 1) return;
  removeAt(h.character.inventory, idx, 1);
  h.brain.nextGiftAt = w.now + 45000;
  changeAffinity(h, mate.id, 0.05);
  heroSay(w, h, 'gift', { player: mate.character.name }, 0);
  mate.scope.events.emit('message', { text: `${h.character.name} te deu uma Poção de Vida.`, kind: 'loot' });
  mate.scope.events.emit('itemsChanged', {});
}

/** Alcance em que o herói cuida dos colegas de grupo. */
const PARTY_SUPPORT_RANGE = 6;

/**
 * Isca: quando um monstro persegue ou ataca um colega do grupo, o herói chama a atenção dele
 * (ataca o monstro e usa a magia de área que puxa a atenção) para o colega poder recuar e se curar.
 * A isca só vale para monstros perto do grupo: o herói não larga o time para persegui-lo longe.
 * Retorna true quando o herói assumiu a isca (o turno dele é o de puxar o monstro).
 */
function baitMonsters(w: World, h: HeroEntity): boolean {
  const leader = groupLeader(w, h) ?? w.human;
  const members = nearbyPartyMembers(w, h, BAIT_RANGE);
  if (!members.length) return false;
  // monstro que está perseguindo ou atacando um colega (e não o próprio herói), perto do grupo
  const threat = [...w.monsters.values()].find(
    (m) =>
      m.alive &&
      m.targetId &&
      m.targetId !== h.id &&
      members.some((mate) => mate.id === m.targetId) &&
      chebyshev(m, h) <= BAIT_RANGE &&
      chebyshev(m, leader) <= BAIT_LEADER_RANGE,
  );
  if (!threat) return false;
  // chama a atenção: o Grito de Guerra (raio 5) vira as criaturas por perto para o herói
  if (chebyshev(threat, h) <= 4) {
    if (tryCast(w, h, 'war_cry')) return true;
  }
  if (!currentTarget(w) || currentTarget(w)?.id !== threat.id) setTarget(w, threat.id);
  // o herói fica entre o monstro e o colega: é ele que leva a pancada
  if (chebyshev(threat, h) > 1) goTo(w, h, threat.x, threat.y);
  return true;
}

/** Alcance em que o Knight puxa criaturas ainda paradas para o grupo. */
const LURE_RANGE = 7;

/**
 * Papel de tanque em grupo: com o time inteiro sem alvo e saudável, o Knight ataca a criatura ociosa mais
 * próxima (perto do líder) para trazê-la até o grupo — quem leva as pancadas é ele, não os colegas frágeis.
 */
function lureMonsters(w: World, h: HeroEntity, leader: PlayerEntity): boolean {
  if (h.character.vocation !== 'knight' || hpPct(h) < 0.7 || isPz(w.map, h.x, h.y)) return false;
  if (leader.character.health / Math.max(1, leader.stats.maxHealth) < 0.5) return false; // time ferido: nada de puxar mais
  const target = [...w.monsters.values()]
    .filter((m) => m.alive && !m.targetId && !isPz(w.map, m.x, m.y) && chebyshev(m, h) <= LURE_RANGE && chebyshev(m, leader) <= LURE_RANGE + 1 && hasLineOfSight(w, h, m))
    .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0];
  if (!target) return false;
  // só puxa para o grupo o que ele segura sozinho (com os vizinhos que viriam junto)
  if (fightMargin(w, h, [target, ...monstersNear(w, target, 3), ...engagedOrJoining(w, h)]) < needMargin(h)) return false;
  setTarget(w, target.id);
  return currentTarget(w)?.id === target.id;
}

/** Alcance em que o herói puxa a atenção dos monstros dos colegas. */
const BAIT_RANGE = 8;
/** A isca não arrasta o herói para longe do grupo. */
const BAIT_LEADER_RANGE = 5;

/** Distância (tiles) em que o herói enxerga loot no chão (a tela toda). */
const LOOT_SCAN = 10;

/** Saco de loot mais próximo na tela, se ainda couber alguma coisa na mochila. */
function nearestLoot(w: World, h: HeroEntity): { x: number; y: number } | undefined {
  if (freeSlots(h.character.inventory) <= 0) return undefined;
  return [...w.lootBags.values()].filter((l) => chebyshev(l, h) <= LOOT_SCAN).sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0];
}

/** Algum monstro está batendo (ou prestes a bater) no herói? Aí lutar e sobreviver vêm antes do loot. */
function engagedByMonsters(w: World, h: HeroEntity): boolean {
  return [...w.monsters.values()].some((m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= 2);
}

/**
 * Com um alvo selecionado: se não há ninguém batendo nele e o saco está mais perto que a criatura, vai pegá-lo
 * no caminho (as duas coisas ao mesmo tempo); se alguém encosta, larga o loot e luta.
 */
function chaseLoot(w: World, h: HeroEntity, target: { x: number; y: number }): void {
  const bag = nearestLoot(w, h);
  if (!bag || chebyshev(bag, h) <= LOOT_RANGE) return;
  if (engagedByMonsters(w, h) || hpPct(h) < 0.45) {
    // luta/sobrevivência primeiro: abandona a caminhada até o loot
    if (h.path?.length && h.pathGoal && [...w.lootBags.values()].some((l) => l.x === h.pathGoal!.x && l.y === h.pathGoal!.y)) {
      h.path = null;
      h.pathGoal = null;
    }
    return;
  }
  if (chebyshev(bag, h) > chebyshev(target, h) + 2) return; // a criatura está bem mais perto: ataca primeiro
  if (!isMoving(h, w.now) && !h.path?.length) goTo(w, h, bag.x, bag.y);
}

/**
 * Pega o loot que já está ao alcance sem largar a luta: chamar `takeAllNearbyLoot` aqui permite
 * ao herói recolher o que caiu enquanto continua atacando a criatura.
 */
function collectLootWhileFighting(w: World, h: HeroEntity): void {
  if (freeSlots(h.character.inventory) <= 0) return;
  const bags = [...w.lootBags.values()].filter((l) => chebyshev(l, h) <= LOOT_RANGE);
  if (!bags.length) return;
  const before = new Map(h.character.inventory.filter(Boolean).map((s) => [s!.itemId, countItem(h.character.inventory, s!.itemId)]));
  takeAllNearbyLoot(w);
  w.ui.lootId = null;
  equipBagUpgrades(w, h);
  for (const st of h.character.inventory) {
    if (!st) continue;
    const def = w.data.items[st.itemId];
    if (def && def.value >= 300 && (before.get(st.itemId) ?? 0) < countItem(h.character.inventory, st.itemId)) {
      h.brain.mood = Math.min(1, h.brain.mood + 0.4);
      heroSay(w, h, 'rareLoot', { item: def.name }, 0);
    }
  }
}

// ------------------------------------------------------------------ treino
function startTraining(w: World, h: HeroEntity): void {
  const c = h.character;
  const idx = c.inventory.findIndex((s) => s?.itemId === TRAINING_WEAPON);
  if (idx < 0) return startHunt(w, h);
  h.brain.mainWeapon = c.equipment.mainHand?.itemId ?? null;
  equipItem(w, idx);
  h.brain.trainStart = { sword: c.skills.sword.level, shielding: c.skills.shielding.level };
  h.brain.quarry = 'slime';
  const spawn = w.map.spawns.find((s) => s.monsterId === 'slime');
  h.brain.spot = spawn ? { x: spawn.x, y: spawn.y } : null;
  setMode(w, h, 'train', (2 + w.rng.next() * 3) * 60000);
  heroSay(w, h, 'train', {}, 60000);
}

function train(w: World, h: HeroEntity): void {
  const b = h.brain;
  const c = h.character;
  const gained = b.trainStart ? c.skills.sword.level - b.trainStart.sword + (c.skills.shielding.level - b.trainStart.shielding) : 0;
  if (w.now > b.modeUntil || gained >= 2 || hpPct(h) < 0.35) {
    restoreMainWeapon(w, h);
    heroSay(w, h, 'trainDone', { skill: 'Sword Fighting' }, 0);
    b.trainStart = null;
    return setMode(w, h, 'decide');
  }
  hunt(w, h, true);
}

function restoreMainWeapon(w: World, h: HeroEntity): void {
  const c = h.character;
  if (!c.equipment.mainHand?.itemId.startsWith('training_')) return;
  // volta para a melhor arma corpo a corpo da mochila
  const best = c.inventory
    .map((st, i) => ({ i, def: st ? w.data.items[st.itemId] : undefined }))
    .filter((x) => x.def?.weapon?.kind === 'melee' && !x.def.weapon.training && !x.def.twoHanded && (x.def.minLevel ?? 1) <= c.level)
    .sort((a, b) => itemScore(b.def!) - itemScore(a.def!))[0];
  if (best) equipItem(w, best.i);
  h.brain.mainWeapon = null;
}

// ------------------------------------------------------------------ vila: vender, comprar, banco, bênção
function planTown(w: World, h: HeroEntity, only?: TownStep[], then: HeroMode = 'decide', heal = false): void {
  const c = h.character;
  const steps: TownStep[] = [];
  if (only) steps.push(...only);
  else {
    const earn = lootValue(w, h);
    const price = potionPrice(w);
    // poções vêm antes de equipamento: o dinheiro do estoque de cura fica reservado
    const potReserve = potionHeal(w, h) < healGoal(h) * 0.6 ? price * 10 : 0;
    const budget = c.gold + earn + c.bankGold - keepGold(w, h) - 40 - potReserve;
    const up = bestUpgrade(w, h, budget);
    const wantPotions = potionHeal(w, h) < healGoal(h) * 0.75 && c.gold + earn + c.bankGold >= price * 4;
    for (const shop of Object.values(w.data.shops)) {
      const npc = npcByShop(w, shop.id);
      if (!npc) continue;
      const sells = shop.buys.some((o) => sellable(w, h, o.itemId));
      const wantMana = !!manaGoal(h) && manaStock(w, h) < manaGoal(h) * 0.6 && c.gold + earn + c.bankGold >= 45 * 4;
      const potions = (wantPotions || wantMana) && shop.sells.some((o) => o.itemId === 'potion_health') && shop.id === 'potions';
      const ammoType = ammoTypeOf(h);
      const ammo = !!ammoType && ammoOf(w, h) < AMMO_GOAL * 0.6 && c.gold + earn + c.bankGold >= 40 && shop.sells.some((o) => w.data.items[o.itemId]?.ammoType === ammoType);
      const upgrades = !!up && up.shopId === shop.id;
      if (sells || potions || upgrades || ammo) steps.push({ kind: 'shop', npcId: npc.id, buyPotions: potions, buyAmmo: ammo, upgrades });
    }
    // caminho mais curto entre as paradas (a partir de onde está)
    let from = { x: h.x, y: h.y };
    const ordered: TownStep[] = [];
    const pending = [...steps];
    while (pending.length) {
      pending.sort((a, b2) => distOf(w, a, from) - distOf(w, b2, from));
      const next = pending.shift()!;
      ordered.push(next);
      const n = next.kind === 'shop' ? w.npcs.get(next.npcId) : undefined;
      if (n) from = { x: n.x, y: n.y };
    }
    // o alquimista primeiro: com o dinheiro na mão, as poções não perdem para o equipamento
    const ammoFirst = !!ammoTypeOf(h) && ammoOf(w, h) < AMMO_GOAL * 0.4;
    const rank = (s: TownStep) => (s.kind !== 'shop' ? 0 : ammoFirst && s.buyAmmo ? 2 : s.buyPotions ? 1 : 0);
    ordered.sort((a, b2) => rank(b2) - rank(a));
    steps.length = 0;
    steps.push(...ordered);
    // saque antes das compras: para um upgrade ou para um bom estoque de poções
    if ((up && c.gold + earn - 30 < up.price) || ((wantPotions || !!manaGoal(h)) && c.gold + earn < price * 14 && c.bankGold > 0)) steps.unshift({ kind: 'bank', op: 'withdraw' });
    // não volta à vila só por causa de upgrade nos próximos minutos
    h.brain.nextUpgradeTripAt = w.now + 4 * 60000;
    // banco só quando sobra bastante ouro; bênção do sacerdote só se estiver bem ferido
    // com PK ligado guarda quase tudo (quem morre no PK deixa parte do ouro da bolsa no chão)
    const bankAbove = w.social.pvp ? 30 : 40 + h.hero.temperament.greed * 60;
    if (c.gold + earn - keepGold(w, h) > bankAbove) steps.push({ kind: 'bank', op: 'deposit' });
    // ferido e sem poções: a bênção (grátis, no templo) vem primeiro
    if (heal || h.brain.prepare || hpPct(h) < 0.85 || (hpPct(h) < 0.45 && potionsOf(w, h) === 0)) steps.unshift({ kind: 'heal' });
    if (!steps.length) {
      startHunt(w, h);
      return;
    }
  }
  h.brain.town = steps;
  h.brain.quarry = null;
  h.brain.townStartedAt = w.now;
  setMode(w, h, 'town');
  h.brain.modeUntil = 0;
  h.brain.after = then;
}

function town(w: World, h: HeroEntity): void {
  const b = h.brain;
  // a visita inteira tem limite: resolve rápido e volta a caçar (o que faltou fica para a próxima)
  if (b.town.length && w.now - b.townStartedAt > 75000) b.town.length = 0;
  const step = b.town[0];
  if (!step) {
    b.nextTownAt = w.now + 3 * 60000;
    b.prepare = false;
    b.nextAmmoTripAt = w.now + 90000;
    w.ui.shop = null;
    w.ui.depot = null;
    w.ui.dialog = null;
    const after = b.after;
    b.after = 'decide';
    if (after === 'train') return startTraining(w, h);
    if (after === 'decide' && w.rng.chance(0.8)) return startHunt(w, h);
    return setMode(w, h, 'decide');
  }
  const done = () => {
    b.failures = 0;
    b.town.shift();
    b.stepStartedAt = w.now;
    w.ui.shop = null;
    w.ui.depot = null;
    w.ui.dialog = null;
  };
  // cada etapa tem um limite de tempo (caminho bloqueado, NPC ocupado...)
  if (w.now - b.stepStartedAt > 30000) return done();
  const npc = step.kind === 'shop' ? w.npcs.get(step.npcId) : step.kind === 'bank' ? npcByAction(w, 'openDepot') : npcByAction(w, 'heal');
  if (!npc) return done();
  const action = step.kind === 'shop' ? 'openShop' : step.kind === 'bank' ? 'openDepot' : 'heal';
  // 1) chegar e abrir o diálogo; 2) escolher a opção; 3) negociar
  const opened = step.kind === 'shop' ? w.ui.shop?.npcId === npc.id : step.kind === 'bank' ? w.ui.depot?.npcId === npc.id : false;
  if (!opened) {
    if (w.ui.dialog?.npcId === npc.id) {
      const idx = npc.def.dialog.find((p) => p.id === w.ui.dialog!.pageId)?.options.findIndex((o) => o.action === action) ?? -1;
      if (idx < 0) return done();
      chooseDialogOption(w, idx);
      if (step.kind === 'heal') return done();
      return;
    }
    if (!w.ui.pending && !isMoving(h, w.now) && !h.path?.length) {
      // longe (ex.: voltando das ruínas): primeiro atravessa o mapa até a frente do NPC
      if (chebyshev(npc, h) > 10) return goTo(w, h, npc.x, npc.y + 2);
      interactWith(w, { kind: 'npc', id: npc.id });
      // sem caminho até o NPC: desiste desta etapa depois de algumas tentativas
      if (!w.ui.pending && !w.ui.dialog && ++b.failures >= 3) return done();
    }
    return;
  }
  if (step.kind === 'shop') shopping(w, h, step);
  else if (step.kind === 'bank') banking(w, h, step.op);
  done();
}

function shopping(w: World, h: HeroEntity, step: Extract<TownStep, { kind: 'shop' }>): void {
  const c = h.character;
  const shop = w.data.shops[w.ui.shop!.shopId]!;
  // vende o loot (nunca poções nem a arma de treino)
  let earned = 0;
  for (const o of shop.buys) {
    const n = countItem(c.inventory, o.itemId);
    if (!n || !sellable(w, h, o.itemId)) continue;
    const before = c.gold;
    if (sellItem(w, o.itemId, n)) earned += c.gold - before;
  }
  if (earned > 0) heroSay(w, h, 'sell', { gold: earned }, 20000);
  if (step.trainingWeapon && countItem(c.inventory, TRAINING_WEAPON) === 0) buyItem(w, TRAINING_WEAPON, 1);
  if (step.buyPotions) {
    // mana primeiro para os magos (é o dano deles); os demais gastam menos nisso
    const manaOffer = shop.sells.find((o) => o.itemId === 'potion_mana');
    if (manaOffer && manaGoal(h)) {
      const per = w.data.items[manaOffer.itemId]?.use?.mana ?? 60;
      const share = isRanged(h.character.vocation) && h.character.vocation !== 'paladin' ? 0.45 : 0.2;
      const qty = Math.min(Math.ceil((manaGoal(h) - manaStock(w, h)) / per), Math.floor((c.gold * share) / manaOffer.price), 40);
      if (qty > 0 && buyItem(w, manaOffer.itemId, qty)) heroSay(w, h, 'buy', {}, 60000);
    }
    const basic = shop.sells.find((o) => o.itemId === 'potion_health');
    const great = shop.sells.find((o) => o.itemId === 'potion_health_great');
    if (basic) {
      let missing = healGoal(h) - potionHeal(w, h);
      // sobra pouco para um upgrade já planejado; o estoque de cura vem primeiro
      const reserve = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(w, h) - 40) ? Math.min(c.gold * 0.25, 200) : 10;
      let budget = Math.min(c.gold - reserve, Math.max(Math.min(3, Math.floor(c.gold / basic.price)) * basic.price, c.gold * 0.85));
      let bought = false;
      // vida alta: parte do estoque em poções fortes (curam 160 em 1 s, a básica só 70)
      const greatHeal = great ? (w.data.items[great.itemId]?.use?.heal ?? 160) : 0;
      if (great && h.stats.maxHealth >= 180 && missing > 0) {
        const qty = Math.min(Math.floor((missing * 0.5) / greatHeal), Math.floor((budget * 0.6) / great.price));
        if (qty > 0 && buyItem(w, great.itemId, qty)) {
          missing -= qty * greatHeal;
          budget -= qty * great.price;
          bought = true;
        }
      }
      const qty = Math.min(Math.ceil(missing / (w.data.items[basic.itemId]?.use?.heal ?? 70)), Math.floor(budget / basic.price), 40);
      if (qty > 0 && buyItem(w, basic.itemId, qty)) bought = true;
      if (bought) heroSay(w, h, 'buy', {}, 60000);
    }
  }
  if (step.buyAmmo) {
    const type = ammoTypeOf(h);
    const offers = shop.sells.filter((o) => type && w.data.items[o.itemId]?.ammoType === type).sort((a, b) => (w.data.items[b.itemId]?.ammoAttack ?? 0) - (w.data.items[a.itemId]?.ammoAttack ?? 0));
    let missing = AMMO_GOAL - ammoOf(w, h);
    // com ouro sobrando compra a flecha forte (+2) para metade do estoque; o resto, a de pedra
    const budget = Math.max(c.gold * 0.7, Math.min(c.gold, 40));
    let spent = 0;
    for (const [i, o] of offers.entries()) {
      const rich = c.gold > 400; // só com folga compra a flecha forte (3 a 6 de ouro cada)
      if (i === 0 && offers.length > 1 && !rich) continue;
      const want = i === 0 && offers.length > 1 ? Math.floor(missing / 2) : missing;
      const qty = Math.min(want, Math.floor((budget - spent) / o.price), 200);
      if (qty > 0 && buyItem(w, o.itemId, qty)) {
        missing -= qty;
        spent += qty * o.price;
      }
    }
  }
  if (step.upgrades) {
    for (let i = 0; i < 3; i++) {
      const up = bestUpgrade(w, h, c.gold - 30 - (potionHeal(w, h) < healGoal(h) * 0.5 ? potionPrice(w) * 8 : 0));
      if (!up || up.shopId !== shop.id) break;
      if (!buyItem(w, up.itemId, 1)) break;
      const idx = c.inventory.findIndex((s) => s?.itemId === up.itemId);
      if (idx >= 0 && equipItem(w, idx)) {
        h.brain.mood = Math.min(1, h.brain.mood + 0.3);
        heroSay(w, h, 'upgrade', { item: w.data.items[up.itemId]!.name }, 0);
      }
    }
  }
}

function isUsableLater(w: World, h: HeroEntity, itemId: string): boolean {
  const def = w.data.items[itemId];
  return !!def && (!def.vocations || def.vocations.includes(h.character.vocation));
}

function banking(w: World, h: HeroEntity, op: 'withdraw' | 'deposit'): void {
  const c = h.character;
  if (op === 'withdraw') {
    const up = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(w, h) - 40);
    const potionNeed = potionHeal(w, h) < healGoal(h) * 0.6 ? potionPrice(w) * 14 - c.gold : 0;
    const need = Math.max(up ? up.price + 40 - c.gold : 0, potionNeed);
    if (need > 0) bankGold(w, 'withdraw', Math.min(need, c.bankGold));
    return;
  }
  // guarda o excedente, sem mexer no dinheiro das poções (senão saca de novo na próxima visita)
  const reserve = keepGold(w, h);
  const surplus = c.gold - reserve;
  const savings = c.gold > potionPrice(w) * 30 ? Math.floor((c.gold - reserve) * (0.3 + h.hero.temperament.greed * 0.2)) : 0;
  const amount = Math.max(surplus, savings);
  if (amount >= 20 && bankGold(w, 'deposit', amount)) heroSay(w, h, 'bank', {}, 120000);
}

// ------------------------------------------------------------------ recuo, praça
/** Vai até o saco de morte, pega tudo (e reequipa o que for melhor) e volta à vida normal. */
/** O saco de morte só vale o risco se as criaturas perto dele não forem demais para quem acabou de renascer. */
function graveSafe(w: World, h: HeroEntity, grave: { x: number; y: number }): boolean {
  return fightMargin(w, h, monstersNear(w, grave, 8)) >= SAFE_MARGIN;
}

function recover(w: World, h: HeroEntity): void {
  const b = h.brain;
  const grave = [...w.lootBags.values()].find((l) => l.ownerId === h.id);
  if (!grave || (b.modeUntil && w.now > b.modeUntil)) return setMode(w, h, 'decide');
  if (chebyshev(grave, h) <= LOOT_RANGE) {
    collectLootWhileFighting(w, h);
    // mochila cheia ou sobra: o que não coube continua no saco; sem espaço, desiste
    if ([...w.lootBags.values()].some((l) => l.ownerId === h.id) && freeSlots(h.character.inventory) <= 0) return setMode(w, h, 'decide');
    return;
  }
  // se alguém encosta, luta (hunt cuida do alvo); senão, vai direto ao saco
  if (engagedByMonsters(w, h)) return hunt(w, h, true, true);
  if (!isMoving(h, w.now) && !h.path?.length) goTo(w, h, grave.x, grave.y, 120000);
}

function retreat(w: World, h: HeroEntity): void {
  if (isPzLocked(w, h.id)) return setMode(w, h, 'decide'); // com PZ lock não há templo para onde recuar
  setTarget(w, null);
  if (isPz(w.map, h.x, h.y)) {
    h.brain.prepare = true; // chegou vivo: antes de caçar de novo, cura e repõe as poções
    return setMode(w, h, 'decide');
  }
  // corre (Corrida) para dentro do templo, desviando das criaturas
  tryCast(w, h, 'haste');
  const start = w.map.playerStart;
  if (!isMoving(h, w.now) && !h.path?.length) planWalk(w, start.x + w.rng.int(-2, 2), start.y + w.rng.int(-1, 2), { quiet: true, avoidMonsters: true });
}

function social(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (b.modeUntil && w.now > b.modeUntil) return setMode(w, h, 'decide');
  const human = w.human;
  if (!human.dead && chebyshev(human, h) <= 5) heroSay(w, h, 'greetPlayer', { player: human.character.name }, 90000);
  if (isMoving(h, w.now) || h.path?.length) return;
  if (w.rng.chance(0.08)) heroSay(w, h, 'idle', {}, 25000);
  if (w.rng.chance(0.15)) {
    // passeia pela praça da vila
    const plaza = { x: 48, y: 27 };
    goTo(w, h, plaza.x + w.rng.int(-8, 8), plaza.y + w.rng.int(-4, 4));
  }
}

// ------------------------------------------------------------------ reações a eventos do próprio herói
export function heroOnEvent(
  w: World,
  h: HeroEntity,
  type: 'levelUp' | 'skillUp' | 'damage' | 'kill' | 'xp' | 'killedBy',
  payload: { level?: number; skill?: string; sourceName?: string; sourceId?: string; amount?: number; byPlayer?: boolean },
): void {
  const b = h.brain;
  if (type === 'xp') {
    b.huntXp += payload.amount ?? 0;
    return;
  }
  if (type === 'killedBy') {
    if (payload.byPlayer && payload.sourceId) {
      // morto por um jogador: vira rival e quer revanche
      changeAffinity(h, payload.sourceId, -0.6);
      b.grudge = { id: payload.sourceId, until: w.now + 10 * 60000 };
      b.lastHitBy = payload.sourceName ?? b.lastHitBy;
      b.pkLostTo = payload.sourceName ?? null;
    }
    return;
  }
  if (type === 'damage' && payload.sourceId && actorById(w, payload.sourceId)) {
    // apanhou de um jogador: a relação piora (e ele reage em thinkPvp)
    changeAffinity(h, payload.sourceId, -0.08);
  }
  if (type === 'levelUp') {
    b.mood = Math.min(1, b.mood + 0.5);
    heroSay(w, h, 'levelUp', { level: payload.level ?? h.character.level }, 0);
  } else if (type === 'skillUp') heroSay(w, h, 'skillUp', { skill: payload.skill ?? '' }, 45000);
  else if (type === 'damage' && payload.sourceName) b.lastHitBy = payload.sourceName;
  else if (type === 'kill') {
    b.mood = Math.min(1, b.mood + 0.03);
    if (w.rng.chance(0.15)) heroSay(w, h, 'kill', {}, 40000);
  }
}


// ------------------------------------------------------------------ grupo
function partyMembers(w: World, h: HeroEntity): string[] {
  return partyOf(w, h.id)?.members ?? [];
}

/** Está num grupo em que o humano é o líder (formação seguir/fila): acompanha o líder em vez de seguir os próprios planos. */
function followingHuman(w: World, h: HeroEntity): boolean {
  const l = groupLeader(w, h);
  const p = partyOf(w, h.id);
  return !!l && !!p && p.formation !== 'free' && !l.dead;
}

// ------------------------------------------------------------------ grupos entre heróis
/** Sinergia de duas vocações no mesmo grupo (tanque + cura/dano de longe é o ideal). */
function synergy(a: string, b: string): number {
  const pair = [a, b].sort().join('+');
  const table: Record<string, number> = {
    'druid+knight': 1, 'knight+sorcerer': 0.9, 'knight+paladin': 0.8, 'druid+paladin': 0.7,
    'druid+sorcerer': 0.7, 'paladin+sorcerer': 0.6, 'knight+knight': 0.2, 'druid+druid': 0.3, 'paladin+paladin': 0.3, 'sorcerer+sorcerer': 0.3,
  };
  return table[pair] ?? 0.4;
}

/** Quem lidera: o Knight (tanque) e, empatando, o de maior nível. */
const leaderScore = (x: PlayerEntity): number => x.character.level + (x.character.vocation === 'knight' ? 4 : 0);

function leaveHeroParty(w: World, h: HeroEntity, why: 'town' | 'time' | 'gap'): void {
  if (!partyOf(w, h.id) || humanInParty(w, h)) return;
  leaveParty(w, h.id);
  h.brain.nextGroupAt = w.now + (why === 'town' ? 4 : 2 + w.rng.next() * 6) * 60000;
  h.brain.groupUntil = 0;
}

/**
 * Os heróis se juntam e se separam por conta própria: duplas, trios ou quartetos, quando quiserem. Grupos com o
 * jogador humano são decididos por ele; os só de heróis duram alguns minutos e se desfazem quando um precisa da vila.
 */
function heroGroupLife(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (b.mode === 'dead' || b.mode === 'pk' || w.now < (b.groupThinkAt ?? 0)) return;
  b.groupThinkAt = w.now + 4000 + w.rng.next() * 4000;
  const party = partyOf(w, h.id);
  if (party) {
    if (humanInParty(w, h)) return;
    const leader = actorById(w, party.leaderId);
    if (!leader || leader.dead) return;
    if (!b.groupUntil) b.groupUntil = w.now + (8 + w.rng.next() * 17) * 60000;
    // cansou do grupo, nível muito diferente ou o líder foi para longe demais
    if (w.now > b.groupUntil) return leaveHeroParty(w, h, 'time');
    if (Math.abs(leader.character.level - h.character.level) > 10) return leaveHeroParty(w, h, 'gap');
    if (leader.id !== h.id && chebyshev(leader, h) > 40) return leaveHeroParty(w, h, 'gap');
    // o líder convida mais um enquanto o grupo tem menos de 4
    if (party.leaderId !== h.id || party.members.length >= 4) return;
  } else if (w.now < b.nextGroupAt || (b.mode !== 'hunt' && b.mode !== 'decide') || isPzLocked(w, h.id)) return;
  else if (!w.rng.chance(0.12 + h.hero.temperament.sociability * 0.3)) return;
  if (pendingInviteFor(w, h.id)) return;
  const mine = partyOf(w, h.id);
  // candidatos: heróis livres e por perto; o convite só parte de quem lideraria o grupo
  const picks = [...w.heroes.values()]
    .filter((o) => o.id !== h.id && !o.dead && !partyOf(w, o.id) && !pendingInviteFor(w, o.id) && w.now >= o.brain.nextGroupAt && o.brain.mode !== 'pk' && o.brain.mode !== 'town' && chebyshev(o, h) <= 25)
    .filter((o) => Math.abs(o.character.level - h.character.level) <= 7 && affinityOf(h, o.id) > -0.3 && affinityOf(o, h.id) > -0.3)
    .filter((o) => (mine ? true : leaderScore(h) > leaderScore(o) || (leaderScore(h) === leaderScore(o) && h.id < o.id)))
    .map((o) => ({ o, score: synergy(h.character.vocation, o.character.vocation) - chebyshev(o, h) * 0.02 + affinityOf(h, o.id) * 0.3 }))
    .sort((x, y) => y.score - x.score);
  const pick = picks[0];
  if (!pick || pick.score < 0.25) return;
  if (invite(w, h.id, pick.o.id)) return;
  if (!mine) b.groupUntil = w.now + (8 + w.rng.next() * 17) * 60000;
  heroSay(w, h, 'invite', { player: pick.o.character.name }, 30000);
  // o convidado responde logo (heróis não fazem o outro esperar)
  asActor(w, pick.o, () => answerInviteNow(w, pick.o));
}

/** Líder do grupo do herói (jogador ou outro herói); null se não está num grupo ou ele mesmo é o líder. */
function groupLeader(w: World, h: HeroEntity): PlayerEntity | null {
  const p = partyOf(w, h.id);
  if (!p || p.leaderId === h.id) return null;
  return actorById(w, p.leaderId);
}

/** O grupo tem o jogador humano dentro? (grupos só de heróis se formam e se desfazem sozinhos) */
function humanInParty(w: World, h: HeroEntity): boolean {
  return !!partyOf(w, h.id)?.members.includes(w.human.id);
}

function canInviteHuman(w: World, h: HeroEntity): boolean {
  const human = w.human;
  return (
    !human.dead &&
    w.now >= h.brain.nextInviteAt &&
    chebyshev(human, h) <= 10 &&
    !partyOf(w, human.id) &&
    !partyOf(w, h.id) &&
    affinityOf(h, human.id) > 0.05 &&
    Math.abs(human.character.level - h.character.level) <= 8 &&
    !pendingInviteFor(w, human.id)
  );
}

function inviteHuman(w: World, h: HeroEntity): void {
  h.brain.nextInviteAt = w.now + 5 * 60000;
  if (invite(w, h.id, w.human.id)) return;
  heroSay(w, h, 'invite', { player: w.human.character.name }, 0);
}

/** Responde a convites de grupo depois de "pensar" um pouco, conforme a relação e o temperamento. */
function handleInvites(w: World, h: HeroEntity): void {
  const inv = pendingInviteFor(w, h.id);
  if (!inv) {
    h.brain.inviteSeenAt = 0;
    return;
  }
  if (!h.brain.inviteSeenAt) {
    h.brain.inviteSeenAt = w.now;
    return;
  }
  if (w.now - h.brain.inviteSeenAt < 1500 + w.rng.next() * 1500) return;
  answerInviteNow(w, h);
}

/** Responde o convite pendente na hora. Convite do jogador humano: aceita, salvo rixa ou relação ruim. */
export function answerInviteNow(w: World, h: HeroEntity): void {
  const inv = pendingInviteFor(w, h.id);
  if (!inv) return;
  h.brain.inviteSeenAt = 0;
  const t = h.hero.temperament;
  const from = actorById(w, inv.fromId);
  const aff = affinityOf(h, inv.fromId);
  const grudge = h.brain.grudge?.id === inv.fromId && w.now < h.brain.grudge.until;
  const levelGap = from ? Math.abs(from.character.level - h.character.level) : 99;
  const hostile = grudge || h.brain.pkTargetId === inv.fromId;
  const chance = hostile ? 0 : inv.fromId === w.human.id ? (aff < -0.3 ? 0.2 : 1) : 0.3 + t.sociability * 0.45 + aff * 0.5 - (levelGap > 10 ? 0.3 : 0);
  if (w.rng.chance(Math.max(0, Math.min(0.97, chance)))) {
    const wasFree = !partyOf(w, h.id);
    if (acceptInvite(w, h.id, inv.fromId)) return declineInvite(w, h.id);
    changeAffinity(h, inv.fromId, 0.1);
    h.brain.groupUntil = w.now + (8 + w.rng.next() * 17) * 60000;
    if (wasFree || from?.id === w.human.id) heroSay(w, h, 'inviteAccept', { player: from?.character.name ?? '' }, 0);
    setMode(w, h, followingHuman(w, h) ? 'follow' : 'decide');
  } else {
    declineInvite(w, h.id);
    heroSay(w, h, 'inviteDecline', { player: from?.character.name ?? '' }, 0);
  }
}

/** Membro do grupo com o humano como líder: anda junto, ajuda nas lutas, pega loot e dá poção se ele precisar. */
function follow(w: World, h: HeroEntity): void {
  const b = h.brain;
  const leader = groupLeader(w, h);
  if (!leader || !followingHuman(w, h)) return setMode(w, h, 'decide');
  const heroLed = leader.id !== w.human.id;
  // grupo só de heróis: precisa da vila, sai e resolve a vida; não segura ninguém
  if (heroLed && !humanInParty(w, h) && needsTown(w, h)) {
    leaveHeroParty(w, h, 'town');
    return planTown(w, h);
  }
  if (needsTown(w, h) && isPz(w.map, leader.x, leader.y)) return planTown(w, h, undefined, 'follow');
  // líder parado há muito tempo (fora da vila): segue a vida, mas avisa (líder herói tem vida própria)
  if (leader.x !== b.leaderLastPos.x || leader.y !== b.leaderLastPos.y) {
    b.leaderLastPos = { x: leader.x, y: leader.y };
    b.leaderIdleSince = w.now;
  } else if (!heroLed && w.now - b.leaderIdleSince > 4 * 60000 && !isPz(w.map, leader.x, leader.y)) {
    heroSay(w, h, 'partyLeave', { player: leader.character.name }, 0);
    leaveParty(w, h.id);
    return setMode(w, h, 'decide');
  }
  giftPotion(w, h);
  heroSay(w, h, 'followLeader', { player: leader.character.name }, 180000);
  // Isca: um monstro perseguindo um colega? o herói chama a atenção dele para si.
  if (h.character.vocation === 'knight' && baitMonsters(w, h)) return;
  // não sai do grupo para caçar longe: larga o alvo que está longe do time
  keepWithGroup(w, h);
  const members = partyMembers(w, h);
  const party = partyOf(w, h.id)!;
  const leaderTarget = leader.targetId ? w.monsters.get(leader.targetId) : undefined;
  // Luta: o herói só sai do lado do líder se a ameaça estiver perto do grupo.
  // Se já tem alvo, ele luta; se não, escolhe a ameaça real (alvo do líder ou quem ataca o time).
  if (currentTarget(w)) {
    // Afastou-se demais do líder durante a luta? larga o alvo e volta (o monstro persegue e vem junto).
    // A folga é grande de propósito: perto do líder ele luta sem ficar indo e voltando.
    if (chebyshev(leader, h) > FOLLOW_FIGHT_LEASH) {
      setTarget(w, null);
      walkToLeader(w, h, leader, { x: leader.x, y: leader.y, near: 2 }, false);
      return;
    }
    return hunt(w, h, true, true);
  }
  // "alvo do líder": foca o mesmo inimigo; "mais próximo": cada um pega o inimigo mais perto de si.
  // Em ambos os casos a ameaça precisa estar perto do grupo: o herói não sai correndo atrás dela
  // (o time se separa e ninguém mais ajuda ninguém).
  const nearestTo = (o: { x: number; y: number }) =>
    [...w.monsters.values()].filter((m) => m.alive && !isPz(w.map, m.x, m.y) && chebyshev(m, o) <= 5 && hasLineOfSight(w, h, m)).sort((a, c) => chebyshev(a, o) - chebyshev(c, o))[0];
  // ameaça real: o monstro está atacando ou perseguendo alguém do grupo (ou é o alvo do líder)
  const attackingGroup = [...w.monsters.values()].find((m) => m.alive && m.targetId && members.includes(m.targetId) && chebyshev(m, h) <= 8);
  const threat =
    party.targeting === 'leader'
      ? ((leaderTarget?.alive ? leaderTarget : undefined) ?? attackingGroup)
      : (attackingGroup ?? nearestTo(h));
  if (threat && !isPz(w.map, h.x, h.y) && chebyshev(threat, leader) <= BAIT_LEADER_RANGE) {
    setTarget(w, threat.id);
    return;
  }
  // grupo parado e nada atacando: o Knight "lura" — puxa a criatura mais próxima para o grupo, levando a pancada
  if (lureMonsters(w, h, leader)) return;
  // loot na tela toda (sem se afastar demais do líder), a menos que alguém esteja batendo nele
  const bag = [...w.lootBags.values()].find((l) => chebyshev(l, h) <= LOOT_SCAN && chebyshev(l, leader) <= LOOT_SCAN + 2);
  if (bag && freeSlots(h.character.inventory) > 0 && !engagedByMonsters(w, h)) return hunt(w, h, true, true);
  // formação: em fila pisa nos passos do líder; "seguir" fica a até 2 tiles. A rota mira sempre onde o líder
  // está agora (refeita quando ele se afasta do destino), então o herói anda junto sem parar e recomeçar.
  const spot = formationSpot(w, h.id);
  const far = chebyshev(leader, h) > 15;
  const goal = spot && party.formation === 'line' && !far ? { x: spot.x, y: spot.y, near: 0 } : { x: leader.x, y: leader.y, near: isRanged(h.character.vocation) ? 3 : 2 };
  walkToLeader(w, h, leader, goal, far);
}

/** Distância máxima do líder durante uma luta antes de o herói largar o alvo e voltar (o time não se separa). */
const FOLLOW_FIGHT_LEASH = 8;

/**
 * Caminha para perto do líder (ou para a posição da formação). O caminho termina a 2 tiles do líder:
 * os personagens não se sobrepõem, então "chegar" significa "ficar ao lado".
 */
function walkToLeader(
  w: World,
  h: HeroEntity,
  leader: PlayerEntity,
  goal: { x: number; y: number; near: number },
  far: boolean,
): void {
  const req = h.brain.walkReq;
  if (chebyshev(goal, h) <= goal.near) {
    if (h.path?.length && req && chebyshev(req, leader) <= 2) {
      h.path = null; // chegou perto: para ao lado do líder (sem encostar e empurrar)
      h.pathGoal = null;
    }
    return;
  }
  const stale = !req || !h.path?.length || chebyshev(req, goal) > (far ? 6 : 1);
  // "seguir" para a 2 tiles do líder (não entra no tile dele: os personagens não se sobrepõem)
  if (stale) goTo(w, h, goal.x, goal.y, far ? 120000 : 20000, goal.near);
}

/** Dá uma poção ao colega de grupo com pouca vida (se tiver de sobra). */
function giftPotion(w: World, h: HeroEntity): void {
  const human = w.human;
  if (w.now < h.brain.nextGiftAt || human.dead || chebyshev(human, h) > 3 || !sameParty(w, h.id, human.id)) return;
  if (human.character.health / human.stats.maxHealth > 0.35 || potionsOf(w, h) < 3) return;
  const idx = h.character.inventory.findIndex((st) => st?.itemId === 'potion_health');
  if (idx < 0) return;
  if (addItem(w.data, human.character.inventory, 'potion_health', 1) !== 1) return;
  removeAt(h.character.inventory, idx, 1);
  h.brain.nextGiftAt = w.now + 45000;
  changeAffinity(h, human.id, 0.05);
  heroSay(w, h, 'gift', { player: human.character.name }, 0);
  human.scope.events.emit('message', { text: `${h.character.name} te deu uma Poção de Vida.`, kind: 'loot' });
  human.scope.events.emit('itemsChanged', {});
}

// ------------------------------------------------------------------ PK: defesa, vingança e oportunidade
function power(a: { character: { level: number; health: number }; stats: { maxHealth: number; armor: number; weapon: { attack: number; damage?: readonly [number, number] } } }): number {
  const hp = a.character.health / Math.max(1, a.stats.maxHealth);
  const atk = a.stats.weapon.damage ? (a.stats.weapon.damage[0] + a.stats.weapon.damage[1]) / 2 : a.stats.weapon.attack;
  return a.character.level * 12 + a.stats.maxHealth * 0.25 * (0.4 + hp * 0.6) + a.stats.armor * 2 + atk * 3;
}

/** Reage a ataques e, com o PK ligado, decide se vale atacar alguém. Retorna true se tomou conta do turno. */
function thinkPvp(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  const human = w.human;
  if (b.mode === 'pk') return false;
  // treino no grupo: revida quem o atacou, mas para antes de se machucar demais
  if (isSparring(w, h.id, human.id) && !human.dead && !h.dead && attackedRecently(w, human.id, h.id, 6000)) {
    if (hpPct(h) > 0.3) {
      if (h.targetId !== human.id) setTarget(w, human.id);
      return h.targetId === human.id;
    }
    if (h.targetId === human.id) h.targetId = null;
    return false;
  }
  if (!w.social.pvp || human.dead || h.dead) return false;
  if (sameParty(w, h.id, human.id) || isPz(w.map, h.x, h.y) || isPz(w.map, human.x, human.y)) return false;
  const dist = chebyshev(human, h);
  if (dist > 9) return false;
  const ratio = power(h) / Math.max(1, power(human));
  // 1) legítima defesa: quem bate leva o troco (ou ele foge se estiver perdendo feio)
  if (attackedRecently(w, human.id, h.id, 8000)) {
    if (hpPct(h) > 0.35 && ratio > 0.7) return startPk(w, h, human.id, 'revenge');
    heroSay(w, h, 'flee', { player: human.character.name }, 20000);
    setMode(w, h, 'retreat');
    return true;
  }
  if (w.now < b.nextPkThinkAt) return false;
  b.nextPkThinkAt = w.now + 6000 + w.rng.next() * 6000;
  if (!hasLineOfSight(w, h, human)) return false;
  const t = h.hero.temperament;
  // 2) vingança de quem o matou
  if (b.grudge && b.grudge.id === human.id && w.now < b.grudge.until && ratio > 0.85 && hpPct(h) > 0.6) return startPk(w, h, human.id, 'revenge');
  // 3) oportunidade: só vale se houver o que ganhar ou um motivo (caveira, rivalidade)
  const gold = human.character.gold;
  const skull = hasSkull(w, human.id);
  const aff = affinityOf(h, human.id);
  if (gold < 25 && !skull && aff > -0.3) {
    if (w.rng.chance(0.15)) heroSay(w, h, 'pkSpare', { player: human.character.name }, 300000);
    return false;
  }
  const lootScore = Math.min(1, gold / (150 + h.character.level * 40));
  const humanHp = human.character.health / Math.max(1, human.stats.maxHealth);
  const desire =
    t.greed * lootScore * 1.2 +
    t.bravery * Math.max(0, Math.min(1, ratio - 1)) +
    (humanHp < 0.4 ? 0.3 : 0) +
    (skull ? 0.45 : 0) -
    aff * 0.9 +
    (b.mood < 0 ? 0.15 : 0) -
    t.caution * 0.3;
  if (desire > 0.75 && ratio > 0.9 && w.rng.chance(0.55)) return startPk(w, h, human.id, 'greed');
  return false;
}

function startPk(w: World, h: HeroEntity, targetId: string, why: 'greed' | 'revenge'): boolean {
  const victim = actorById(w, targetId);
  if (!victim) return false;
  setMode(w, h, 'pk');
  h.brain.pkTargetId = targetId;
  setTarget(w, targetId);
  if (h.targetId !== targetId) {
    setMode(w, h, 'decide');
    return false;
  }
  changeAffinity(h, targetId, -0.2);
  heroSay(w, h, why === 'revenge' ? 'revenge' : 'pkThreat', { player: victim.character.name, gold: victim.character.gold }, 0);
  return true;
}

function pk(w: World, h: HeroEntity): void {
  const b = h.brain;
  const victim = actorById(w, b.pkTargetId);
  if (!victim || !w.social.pvp || sameParty(w, h.id, victim.id)) return setMode(w, h, 'decide');
  if (victim.dead) {
    heroSay(w, h, 'pkWin', { player: victim.character.name }, 0);
    h.brain.mood = Math.min(1, h.brain.mood + 0.3);
    if (b.grudge?.id === victim.id) b.grudge = null;
    // volta a caçar (e pega o que caiu, se estiver perto)
    return startHunt(w, h, b.quarry ?? chooseQuarry(w, h));
  }
  if (isPz(w.map, victim.x, victim.y) || chebyshev(victim, h) > 14) {
    heroSay(w, h, 'pkEscaped', { player: victim.character.name }, 60000);
    return setMode(w, h, 'decide');
  }
  if (hpPct(h) < 0.3 && potionsOf(w, h) === 0) {
    heroSay(w, h, 'flee', { player: victim.character.name }, 0);
    return setMode(w, h, 'retreat');
  }
  if (h.targetId !== victim.id) setTarget(w, victim.id);
  if (chebyshev(victim, h) <= 1 && hpPct(h) > 0.4) tryCast(w, h, 'brutal_strike');
}

// ------------------------------------------------------------------ improviso: comentários e pequenas vontades
function whims(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (w.now < b.nextWhimAt) return;
  b.nextWhimAt = w.now + 20000 + w.rng.next() * 40000;
  const human = w.human;
  if (!human.dead && chebyshev(human, h) <= 6 && b.mode !== 'pk') {
    const c = human.character;
    heroSay(w, h, 'comment', { player: c.name, plevel: c.level, weapon: w.data.items[c.equipment.mainHand?.itemId ?? '']?.name ?? 'as mãos' }, 90000);
  }
  // atitude rara: vontade de PK (só fora do grupo; nunca ataca nem desafia quem está no grupo dele)
  const t = h.hero.temperament;
  if (!human.dead && chebyshev(human, h) <= 6 && b.mode !== 'pk' && !w.social.pvp && !sameParty(w, h.id, human.id) && (t.bravery > 0.6 || b.mood < -0.2) && w.rng.chance(0.04)) {
    heroSay(w, h, 'pkWish', { player: human.character.name }, 600000);
  }
  // às vezes muda de ideia no meio da caça (outra área com mais monstros)
  if (b.mode === 'hunt' && w.rng.chance(0.08)) {
    const q = chooseQuarry(w, h, w.rng.chance(0.4));
    if (q !== b.quarry) startHunt(w, h, q);
  }
}

/** Um passo para um tile livre ao lado (sai da frente de quem está bloqueando). */
function sidestep(w: World, h: HeroEntity): void {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;
  const start = w.rng.int(0, dirs.length - 1);
  for (let i = 0; i < dirs.length; i++) {
    const [dx, dy] = dirs[(start + i) % dirs.length]!;
    if (tryStep(w, h, dx, dy, h.stats.speed, false)) return;
  }
}
