// "Cérebro" de um herói: decide o que um jogador faria e executa usando os MESMOS comandos do jogador
// (caminhar, mirar, conjurar, beber poção, pegar loot, conversar com NPCs, comprar, vender, banco).
// Roda dentro de `asActor`, então `w.player` é o próprio herói. As decisões seguem o temperamento:
// coragem (onde caça e quando recua), ganância (quanto loot/ouro acumula), disciplina (treino),
// sociabilidade (conversa/praça) e prudência (poções).
import type { HeroLineKey, ItemDef } from '../../domain/entities/definitions';
import { chebyshev } from '../../domain/value-objects/position';
import { countItem, freeSlots } from '../../domain/rules/inventory';
import { isUpgrade, itemScore } from '../../domain/rules/itemPower';
import { isPz } from '../world/GameMap';
import type { HeroEntity, NpcEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { isMoving } from '../movement/movement';
import { planWalk } from '../movement/walk';
import { castCheck, castSpell } from '../abilities/spells';
import { currentTarget, hasLineOfSight, respawnPlayer, setTarget } from '../combat/combat';
import { chooseDialogOption, interactWith, LOOT_RANGE } from '../interaction/interaction';
import { equipItem, takeAllNearbyLoot, useInventoryItem } from '../inventory/inventoryService';
import { buyItem, sellItem } from '../economy/shopService';
import { bankGold } from '../economy/depotService';

export type HeroMode = 'decide' | 'hunt' | 'town' | 'train' | 'social' | 'retreat' | 'dead';

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
  };
}

const THINK_MS = 300;
const TRAINING_WEAPON = 'training_sword';
/** Nível a partir do qual cada monstro vale a caça (o temperamento desloca um pouco). */
const HUNT_LEVEL: Record<string, number> = { slime: 1, boar: 3, toad: 4, goblin: 5, wolf: 7, spider: 9, skeleton: 11 };

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
  const area = h.brain.quarry ? `caçando ${w.data.monsters[h.brain.quarry]?.name ?? h.brain.quarry}` : h.brain.mode === 'town' ? 'resolvendo coisas na vila' : h.brain.mode === 'train' ? 'treinando' : 'de boa';
  heroSay(w, h, 'status', { level: c.level, area, gold: c.gold, potions: potionsOf(w, h) }, 0);
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
  planWalk(w, x, y, { quiet: true, maxNodes: 9000 });
}

function setMode(w: World, h: HeroEntity, mode: HeroMode, durationMs = 0): void {
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
      respawnPlayer(w);
      // quem morre volta para a vila com o orgulho ferido
      heroSay(w, h, 'death', { monster: b.lastHitBy ?? 'aquele monstro' }, 0);
      restoreMainWeapon(w, h);
      setMode(w, h, 'decide');
    }
    return;
  }
  // anda preso? replaneja
  if (h.x !== b.lastPos.x || h.y !== b.lastPos.y) b.lastPos = { x: h.x, y: h.y, at: w.now };
  const stuck = w.now - b.lastPos.at > 9000 && !!h.path;
  if (stuck) {
    h.path = null;
    h.pathGoal = null;
    b.lastPos.at = w.now;
  }
  survive(w, h);
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
function needsTown(w: World, h: HeroEntity): boolean {
  const t = h.hero.temperament;
  const c = h.character;
  if (freeSlots(c.inventory) < 3) return true;
  if (lootValue(w, h) >= 150 + t.greed * 450 + c.level * 40) return true;
  const minPotions = 2 + Math.round(t.caution * 6);
  if (potionsOf(w, h) < minPotions && c.gold >= potionPrice(w) * 2) return true;
  if (w.now < h.brain.nextUpgradeTripAt) return false;
  const up = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(h) - 40);
  return !!up;
}

/** Ouro que o herói gosta de manter na bolsa (o resto vai para o banco). */
function keepGold(h: HeroEntity): number {
  return 80 + h.character.level * 25 + Math.round((1 - h.hero.temperament.greed) * 100);
}

function decide(w: World, h: HeroEntity): void {
  const t = h.hero.temperament;
  const c = h.character;
  equipBagUpgrades(w, h);
  if (hpPct(h) < 0.5) {
    // descansa na área protegida até recuperar (regeneração dobrada)
    if (!isPz(w.map, h.x, h.y)) return setMode(w, h, 'retreat');
    if (hpPct(h) < 0.3) return planTown(w, h, [{ kind: 'heal' }]);
    return setMode(w, h, 'social', 8000);
  }
  if (needsTown(w, h)) return planTown(w, h);
  const skillLag = c.skills.sword.level < 10 + c.level * 1.4 || c.skills.shielding.level < 10 + c.level * 1.1;
  if (skillLag && w.rng.chance(t.discipline * 0.35) && (countItem(c.inventory, TRAINING_WEAPON) > 0 || c.gold >= 60)) {
    if (countItem(c.inventory, TRAINING_WEAPON) === 0) return planTown(w, h, [{ kind: 'shop', npcId: npcByShop(w, 'equipment')?.id ?? '', trainingWeapon: true }], 'train');
    return startTraining(w, h);
  }
  if (w.rng.chance(t.sociability * 0.12)) return setMode(w, h, 'social', 20000 + w.rng.next() * 25000);
  startHunt(w, h);
}

// ------------------------------------------------------------------ caça
function chooseQuarry(w: World, h: HeroEntity): string {
  const t = h.hero.temperament;
  const lvl = h.character.level + (t.bravery - 0.5) * 3 + h.brain.mood;
  const options = Object.entries(HUNT_LEVEL).filter(([id, min]) => min <= lvl && w.map.spawns.some((s) => s.monsterId === id));
  options.sort((a, b) => b[1] - a[1]);
  // às vezes varia entre as duas melhores opções, como um jogador faria
  const pick = options.length > 1 && w.rng.chance(0.3) ? options[1]! : options[0];
  return pick?.[0] ?? 'slime';
}

function startHunt(w: World, h: HeroEntity, quarry = chooseQuarry(w, h)): void {
  const spawns = w.map.spawns.filter((s) => s.monsterId === quarry);
  const spawn = spawns[w.rng.int(0, spawns.length - 1)];
  h.brain.quarry = quarry;
  h.brain.spot = spawn ? { x: spawn.x, y: spawn.y } : null;
  setMode(w, h, 'hunt', (6 + w.rng.next() * 6) * 60000);
  const def = w.data.monsters[quarry];
  const region = spawn ? w.map.regions.filter((r) => spawn.x >= r.x && spawn.x < r.x + r.w && spawn.y >= r.y && spawn.y < r.y + r.h).sort((a, b) => b.priority - a.priority)[0] : undefined;
  heroSay(w, h, 'hunt', { monster: def?.name ?? quarry, area: region?.name ?? 'a caça' }, 60000);
}

function hunt(w: World, h: HeroEntity, training: boolean): void {
  const b = h.brain;
  if (!training && (needsTown(w, h) || (b.modeUntil && w.now > b.modeUntil))) {
    heroSay(w, h, 'town', {}, 30000);
    return planTown(w, h);
  }
  helpHuman(w, h);
  const target = currentTarget(w);
  if (target) {
    // golpes especiais quando vale a pena
    const adjacent = [...w.monsters.values()].filter((m) => m.alive && chebyshev(m, h) <= 1);
    if (!training) {
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
  // próximo alvo: quem está batendo nele primeiro, depois a presa da área
  const quarry = training ? 'slime' : b.quarry;
  const near = [...w.monsters.values()]
    .filter((m) => m.alive && !isPz(w.map, m.x, m.y) && chebyshev(m, h) <= 7 && (m.targetId === h.id || m.def.id === quarry) && hasLineOfSight(w, h, m))
    .sort((a, c) => Number(c.targetId === h.id) - Number(a.targetId === h.id) || chebyshev(a, h) - chebyshev(c, h));
  const next = near[0];
  if (next) {
    setTarget(w, next.id);
    return;
  }
  // nada por perto: vai até a área (ou passeia por ela procurando)
  const spot = b.spot;
  if (!spot) return startHunt(w, h);
  if (isMoving(h, w.now) || h.path?.length) return;
  if (chebyshev(spot, h) > 4) goTo(w, h, spot.x, spot.y);
  else if (w.rng.chance(0.25)) {
    const spawns = w.map.spawns.filter((s) => s.monsterId === quarry);
    const other = spawns[w.rng.int(0, spawns.length - 1)];
    if (other && w.rng.chance(0.4)) b.spot = { x: other.x, y: other.y };
    goTo(w, h, (b.spot?.x ?? spot.x) + w.rng.int(-3, 3), (b.spot?.y ?? spot.y) + w.rng.int(-3, 3));
  }
}

/** Ajuda o jogador humano quando um monstro o ataca por perto (comportamento de bom companheiro). */
function helpHuman(w: World, h: HeroEntity): void {
  const human = w.human;
  if (human.dead || chebyshev(human, h) > 8) return;
  const threat = [...w.monsters.values()].find((m) => m.alive && m.targetId === human.id && chebyshev(m, h) <= 7);
  if (!threat || h.targetId === threat.id) return;
  if (!currentTarget(w) || w.rng.chance(h.hero.temperament.bravery * 0.5)) {
    setTarget(w, threat.id);
    heroSay(w, h, 'help', { player: human.character.name }, 30000);
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
    for (const shop of Object.values(w.data.shops)) {
      const npc = npcByShop(w, shop.id);
      if (!npc) continue;
      const sells = shop.buys.some((o) => countItem(c.inventory, o.itemId) > 0 && !o.itemId.startsWith('training_'));
      const potions = shop.sells.some((o) => o.itemId === 'potion_health') && shop.id === 'potions';
      const upgrades = shop.id === 'equipment' || shop.id === 'potions';
      if (sells || potions || upgrades) steps.push({ kind: 'shop', npcId: npc.id, buyPotions: potions, upgrades });
    }
    // saque antes das compras se a economia já dá para um upgrade
    const up = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(h) - 40);
    if (up && c.gold - 30 < up.price) steps.unshift({ kind: 'bank', op: 'withdraw' });
    // não volta à vila só por causa de upgrade nos próximos minutos
    h.brain.nextUpgradeTripAt = w.now + 4 * 60000;
    steps.push({ kind: 'bank', op: 'deposit' });
    if (hpPct(h) < 0.7) steps.push({ kind: 'heal' });
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
    const def = w.data.items[o.itemId];
    if (!n || o.itemId.startsWith('training_') || def?.type === 'potion') continue;
    // equipamento útil que ainda não usa (ex.: upgrade guardado para o próximo nível) fica
    if (def?.slot && (def.minLevel ?? 1) > c.level && isUsableLater(w, h, o.itemId)) continue;
    if (def?.slot && def.slot !== 'ammo' && isUpgrade(w.data, c, def)) continue;
    const before = c.gold;
    if (sellItem(w, o.itemId, n)) earned += c.gold - before;
  }
  if (earned > 0) heroSay(w, h, 'sell', { gold: earned }, 20000);
  if (step.trainingWeapon && countItem(c.inventory, TRAINING_WEAPON) === 0) buyItem(w, TRAINING_WEAPON, 1);
  if (step.buyPotions) {
    const want = 4 + Math.round(h.hero.temperament.caution * 10) - potionsOf(w, h);
    const offer = shop.sells.find((o) => o.itemId === 'potion_health');
    if (offer && want > 0) {
      const qty = Math.min(want, Math.floor((c.gold - 20) / offer.price));
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
    const up = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(h) - 40);
    const need = up ? up.price + 40 - c.gold : 0;
    if (need > 0) bankGold(w, 'withdraw', Math.min(need, c.bankGold));
    return;
  }
  const surplus = c.gold - keepGold(h);
  if (surplus > 0 && bankGold(w, 'deposit', surplus)) heroSay(w, h, 'bank', {}, 120000);
}

// ------------------------------------------------------------------ recuo, praça
function retreat(w: World, h: HeroEntity): void {
  setTarget(w, null);
  if (isPz(w.map, h.x, h.y)) return setMode(w, h, 'decide');
  const start = w.map.playerStart;
  goTo(w, h, start.x, start.y + 6);
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
export function heroOnEvent(w: World, h: HeroEntity, type: 'levelUp' | 'skillUp' | 'damage' | 'kill', payload: { level?: number; skill?: string; sourceName?: string }): void {
  const b = h.brain;
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

