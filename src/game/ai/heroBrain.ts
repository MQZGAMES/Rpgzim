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
import { isUpgrade, itemScore } from '../../domain/rules/itemPower';
import { isPz } from '../world/GameMap';
import type { HeroEntity, NpcEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { isMoving, tryStep } from '../movement/movement';
import { planWalk } from '../movement/walk';
import { castCheck, castSpell } from '../abilities/spells';
import { currentTarget, hasLineOfSight, respawnPlayer, setTarget } from '../combat/combat';
import { chooseDialogOption, interactWith, LOOT_RANGE } from '../interaction/interaction';
import { equipItem, takeAllNearbyLoot, useInventoryItem } from '../inventory/inventoryService';
import { buyItem, sellItem } from '../economy/shopService';
import { bankGold } from '../economy/depotService';
import { acceptInvite, actorById, attackedRecently, declineInvite, formationSpot, hasSkull, invite, isSparring, leaveParty, partyOf, pendingInviteFor, sameParty } from '../social/social';

export type HeroMode = 'decide' | 'hunt' | 'town' | 'train' | 'social' | 'retreat' | 'dead' | 'follow' | 'pk';

type TownStep = { kind: 'shop'; npcId: string; buyPotions?: boolean; upgrades?: boolean; trainingWeapon?: boolean } | { kind: 'bank'; op: 'withdraw' | 'deposit' } | { kind: 'heal' };

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
    if (!st || st.itemId.startsWith('training_') || w.data.items[st.itemId]?.type === 'potion') continue;
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
      if (!def?.slot || def.twoHanded || def.weapon?.training || o.price > budget) continue;
      if (!isUpgrade(w.data, h.character, def)) continue;
      const cur = h.character.equipment[def.slot];
      const gain = valueFor(h, def) - (cur ? valueFor(h, w.data.items[cur.itemId]!) : 0);
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

/** Equipa o que estiver na mochila e for melhor (ex.: item achado que agora já pode usar). */
function equipBagUpgrades(w: World, h: HeroEntity): void {
  const c = h.character;
  for (let i = 0; i < c.inventory.length; i++) {
    const st = c.inventory[i];
    const def = st ? w.data.items[st.itemId] : undefined;
    if (!def?.slot || def.slot === 'ammo' || def.twoHanded || def.weapon?.training || !isUpgrade(w.data, c, def)) continue;
    const cur = c.equipment[def.slot];
    if (valueFor(h, def) - (cur ? valueFor(h, w.data.items[cur.itemId]!) : 0) < 5) continue;
    if (equipItem(w, i)) heroSay(w, h, 'upgrade', { item: def.name }, 0);
  }
}

function potionPrice(w: World): number {
  return Math.min(...Object.values(w.data.shops).flatMap((s) => s.sells.filter((o) => o.itemId === 'potion_health').map((o) => o.price)), 999);
}

function goTo(w: World, h: HeroEntity, x: number, y: number): void {
  if (h.pathGoal && h.pathGoal.x === x && h.pathGoal.y === y && h.path?.length) return;
  if (!planWalk(w, x, y, { quiet: true, maxNodes: 20000 })) h.brain.lastPos.at = w.now - 3000;
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
  survive(w, h);
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
  const attackers = [...w.monsters.values()].filter((m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= 2);
  if (pct < 0.45 + t.caution * 0.15 && attackers.length) {
    const idx = pickPotion(w, h);
    if (idx >= 0) useInventoryItem(w, idx);
  }
  if (pct < 0.6) tryCast(w, h, 'light_heal');
  if (attackers.length >= 2 && pct < 0.75) tryCast(w, h, 'iron_roar');
  // recua quando a vida está crítica e não há poções (coragem atrasa a decisão)
  if (pct < 0.32 - t.bravery * 0.12 && potionsOf(w, h) === 0 && h.brain.mode !== 'retreat' && !isPz(w.map, h.x, h.y)) {
    heroSay(w, h, 'retreat', {}, 20000);
    setMode(w, h, 'retreat');
  }
}

function pickPotion(w: World, h: HeroEntity): number {
  const missing = h.stats.maxHealth - h.character.health;
  const owned = h.character.inventory
    .map((st, i) => ({ i, heal: st ? (w.data.items[st.itemId]?.use?.heal ?? 0) : 0, mana: st ? w.data.items[st.itemId]?.use?.mana : 0 }))
    .filter((p) => p.heal > 0 && !p.mana)
    .sort((a, b) => a.heal - b.heal);
  return (owned.find((p) => p.heal >= missing * 0.8) ?? owned[owned.length - 1])?.i ?? -1;
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
  const t = h.hero.temperament;
  const c = h.character;
  if (freeSlots(c.inventory) < 2) return true;
  if (lootValue(w, h) >= 250 + t.greed * 600 + c.level * 60) return true;
  const potions = potionsOf(w, h);
  const price = potionPrice(w);
  const spendable = c.gold + lootValue(w, h);
  const minPotions = 1 + Math.round(t.caution * 4);
  // repõe só quando dá para comprar um bom estoque (senão volta à vila a cada 2 minutos)
  if (potions === 0 && spendable >= price * 4) return true;
  if (potions < minPotions && spendable >= price * minPotions * 3) return true;
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
  equipBagUpgrades(w, h);
  if (hpPct(h) < 0.5 && potionsOf(w, h) === 0) {
    // sem poções: descansa na área protegida até recuperar (regeneração dobrada) ou pede a bênção
    if (!isPz(w.map, h.x, h.y)) return setMode(w, h, 'retreat');
    if (hpPct(h) < 0.3) return planTown(w, h, [{ kind: 'heal' }]);
    return setMode(w, h, 'social', 8000);
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
    ['train', skillLag && canTrain ? t.discipline * 0.45 : 0],
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
  const lvl = h.character.level + (t.bravery - 0.5) * 3 + h.brain.mood;
  const options = Object.entries(huntLevels(w)).filter(([id, min]) => min <= lvl + 1 && w.map.spawns.some((s) => s.monsterId === id));
  if (!options.length) return 'slime';
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
  const target = currentTarget(w);
  if (target) {
    // golpes especiais quando vale a pena
    const adjacent = [...w.monsters.values()].filter((m) => m.alive && chebyshev(m, h) <= 1);
    if (!training || assisting) {
      if (adjacent.length >= 2) tryCast(w, h, 'steel_whirlwind');
      if (chebyshev(target, h) <= 1 && hpPct(h) > 0.5) tryCast(w, h, 'brutal_strike');
    }
    return;
  }
  // pega o loot por perto antes de procurar o próximo
  const bag = [...w.lootBags.values()].filter((l) => chebyshev(l, h) <= 6).sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0];
  if (bag && freeSlots(h.character.inventory) > 0) {
    if (chebyshev(bag, h) <= LOOT_RANGE) {
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
    } else if (!isMoving(h, w.now) && !h.path?.length) goTo(w, h, bag.x, bag.y);
    return;
  }
  if (assisting) return;
  // próximo alvo: quem está batendo nele primeiro, depois a presa da área
  const quarry = training ? 'slime' : b.quarry;
  const near = [...w.monsters.values()]
    .filter((m) => m.alive && !isPz(w.map, m.x, m.y) && chebyshev(m, h) <= 7 && (m.targetId === h.id || m.def.id === quarry) && hasLineOfSight(w, h, m))
    .sort((a, c) => Number(c.targetId === h.id) - Number(a.targetId === h.id) || chebyshev(a, h) - chebyshev(c, h));
  const next = near[0];
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
  if (!def || def.type === 'potion' || def.type === 'ammo') return false;
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
function planTown(w: World, h: HeroEntity, only?: TownStep[], then: HeroMode = 'decide'): void {
  const c = h.character;
  const steps: TownStep[] = [];
  if (only) steps.push(...only);
  else {
    const earn = lootValue(w, h);
    const budget = c.gold + earn + c.bankGold - keepGold(w, h) - 40;
    const up = bestUpgrade(w, h, budget);
    const wantPotions = potionsOf(w, h) < 4 + Math.round(h.hero.temperament.caution * 8);
    for (const shop of Object.values(w.data.shops)) {
      const npc = npcByShop(w, shop.id);
      if (!npc) continue;
      const sells = shop.buys.some((o) => sellable(w, h, o.itemId));
      const potions = wantPotions && shop.sells.some((o) => o.itemId === 'potion_health') && shop.id === 'potions';
      const upgrades = !!up && up.shopId === shop.id;
      if (sells || potions || upgrades) steps.push({ kind: 'shop', npcId: npc.id, buyPotions: potions, upgrades });
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
    steps.length = 0;
    steps.push(...ordered);
    // saque antes das compras se a economia já dá para um upgrade
    if (up && c.gold + earn - 30 < up.price) steps.unshift({ kind: 'bank', op: 'withdraw' });
    // não volta à vila só por causa de upgrade nos próximos minutos
    h.brain.nextUpgradeTripAt = w.now + 4 * 60000;
    // banco só quando sobra bastante ouro; bênção do sacerdote só se estiver bem ferido
    // com PK ligado guarda quase tudo (quem morre no PK deixa parte do ouro da bolsa no chão)
    const bankAbove = w.social.pvp ? 30 : 100 + h.hero.temperament.greed * 100;
    if (c.gold + earn - keepGold(w, h) > bankAbove || c.gold + earn > potionPrice(w) * 8) steps.push({ kind: 'bank', op: 'deposit' });
    if (hpPct(h) < 0.45 && potionsOf(w, h) === 0) steps.push({ kind: 'heal' });
    if (!steps.length) {
      startHunt(w, h);
      return;
    }
  }
  h.brain.town = steps;
  h.brain.quarry = null;
  setMode(w, h, 'town');
  h.brain.modeUntil = 0;
  h.brain.after = then;
}

function town(w: World, h: HeroEntity): void {
  const b = h.brain;
  const step = b.town[0];
  if (!step) {
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
  if (w.now - b.stepStartedAt > 90000) return done();
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
    const want = 6 + Math.round(h.hero.temperament.caution * 10) - potionsOf(w, h);
    const offer = shop.sells.find((o) => o.itemId === 'potion_health');
    if (offer && want > 0) {
      // guarda um pouco para um upgrade já planejado
      const reserve = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(w, h) - 40) ? Math.min(c.gold * 0.4, 300) : 10;
      // no máximo ~60% da bolsa em poções (mínimo 3, se der): o resto vira poupança/upgrade
      const cap = Math.max(Math.min(3, Math.floor(c.gold / offer.price)), Math.floor((c.gold * 0.6) / offer.price));
      const qty = Math.min(want, cap, Math.floor((c.gold - reserve) / offer.price));
      if (qty > 0 && buyItem(w, offer.itemId, qty)) heroSay(w, h, 'buy', {}, 60000);
    }
  }
  if (step.upgrades) {
    for (let i = 0; i < 3; i++) {
      const up = bestUpgrade(w, h, c.gold - 30);
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
    const need = up ? up.price + 40 - c.gold : 0;
    if (need > 0) bankGold(w, 'withdraw', Math.min(need, c.bankGold));
    return;
  }
  // guarda o excedente; e mesmo sem excedente, poupa uma parte (vai sacar depois para um upgrade)
  const surplus = c.gold - keepGold(w, h);
  const savings = Math.floor((c.gold - potionPrice(w) * 3) * (0.2 + h.hero.temperament.greed * 0.2));
  const amount = Math.max(surplus, savings);
  if (amount >= 20 && bankGold(w, 'deposit', amount)) heroSay(w, h, 'bank', {}, 120000);
}

// ------------------------------------------------------------------ recuo, praça
function retreat(w: World, h: HeroEntity): void {
  setTarget(w, null);
  if (isPz(w.map, h.x, h.y)) return setMode(w, h, 'decide');
  // recua para dentro do templo (área protegida)
  const start = w.map.playerStart;
  goTo(w, h, start.x + w.rng.int(-2, 2), start.y + w.rng.int(-1, 2));
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
  const p = partyOf(w, h.id);
  return !!p && p.leaderId === w.human.id && p.formation !== 'free' && !w.human.dead;
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
  h.brain.inviteSeenAt = 0;
  const t = h.hero.temperament;
  const from = actorById(w, inv.fromId);
  const aff = affinityOf(h, inv.fromId);
  const grudge = h.brain.grudge?.id === inv.fromId && w.now < h.brain.grudge.until;
  const levelGap = from ? Math.abs(from.character.level - h.character.level) : 99;
  const chance = grudge || h.brain.pkTargetId === inv.fromId ? 0 : 0.3 + t.sociability * 0.45 + aff * 0.5 - (levelGap > 10 ? 0.3 : 0);
  if (w.rng.chance(Math.max(0, Math.min(0.97, chance)))) {
    acceptInvite(w, h.id, inv.fromId);
    changeAffinity(h, inv.fromId, 0.1);
    heroSay(w, h, 'inviteAccept', { player: from?.character.name ?? '' }, 0);
    setMode(w, h, followingHuman(w, h) ? 'follow' : 'decide');
  } else {
    declineInvite(w, h.id);
    heroSay(w, h, 'inviteDecline', { player: from?.character.name ?? '' }, 0);
  }
}

/** Membro do grupo com o humano como líder: anda junto, ajuda nas lutas, pega loot e dá poção se ele precisar. */
function follow(w: World, h: HeroEntity): void {
  const b = h.brain;
  const leader = w.human;
  if (!followingHuman(w, h)) return setMode(w, h, 'decide');
  if (needsTown(w, h) && isPz(w.map, leader.x, leader.y)) return planTown(w, h, undefined, 'follow');
  // líder parado há muito tempo (fora da vila): segue a vida, mas avisa
  if (leader.x !== b.leaderLastPos.x || leader.y !== b.leaderLastPos.y) {
    b.leaderLastPos = { x: leader.x, y: leader.y };
    b.leaderIdleSince = w.now;
  } else if (w.now - b.leaderIdleSince > 4 * 60000 && !isPz(w.map, leader.x, leader.y)) {
    heroSay(w, h, 'partyLeave', { player: leader.character.name }, 0);
    leaveParty(w, h.id);
    return setMode(w, h, 'decide');
  }
  giftPotion(w, h);
  heroSay(w, h, 'followLeader', { player: leader.character.name }, 180000);
  // luta: o alvo do líder, quem ataca alguém do grupo, ou o monstro mais perto do líder
  if (currentTarget(w)) return hunt(w, h, true, true);
  const members = partyMembers(w, h);
  const party = partyOf(w, h.id)!;
  const leaderTarget = leader.targetId ? w.monsters.get(leader.targetId) : undefined;
  // "alvo do líder": foca o mesmo inimigo; "mais próximo": cada um pega o inimigo mais perto de si
  const nearestTo = (o: { x: number; y: number }) =>
    [...w.monsters.values()].filter((m) => m.alive && !isPz(w.map, m.x, m.y) && chebyshev(m, o) <= 5 && hasLineOfSight(w, h, m)).sort((a, c) => chebyshev(a, o) - chebyshev(c, o))[0];
  const threat =
    party.targeting === 'leader'
      ? ((leaderTarget?.alive ? leaderTarget : undefined) ??
        [...w.monsters.values()].find((m) => m.alive && m.targetId && members.includes(m.targetId) && chebyshev(m, h) <= 8) ??
        nearestTo(leader))
      : (nearestTo(h) ?? [...w.monsters.values()].find((m) => m.alive && m.targetId && members.includes(m.targetId) && chebyshev(m, h) <= 8));
  if (threat && !isPz(w.map, h.x, h.y) && chebyshev(threat, leader) <= 8) {
    setTarget(w, threat.id);
    return;
  }
  // loot por perto (sem se afastar do líder)
  const bag = [...w.lootBags.values()].find((l) => chebyshev(l, h) <= 4 && chebyshev(l, leader) <= 6);
  if (bag && freeSlots(h.character.inventory) > 0) return hunt(w, h, true, true);
  // formação: em fila pisa nos passos do líder; "seguir" anda por perto
  const spot = formationSpot(w, h.id);
  if (spot && party.formation === 'line') {
    if (chebyshev(spot, h) > 1 && !isMoving(h, w.now)) goTo(w, h, spot.x, spot.y);
  } else if (chebyshev(leader, h) > 3 && !isMoving(h, w.now)) goTo(w, h, leader.x + w.rng.int(-1, 1), leader.y + w.rng.int(-1, 1));
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
