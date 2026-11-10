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
import type { HeroEntity, MonsterEntity, NpcEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors, asActor } from '../simulation/World';
import { canEnter, isMoving, tryStep } from '../movement/movement';
import { planWalk } from '../movement/walk';
import { actorSpeed, trailStep } from '../movement/follow';
import { isRanged, ROLES } from './heroRoles';
import {
  alliesAround,
  alliesNear,
  monsterDps,
  heroDpsVs,
  xpPerMinute,
  assess,
  engagedOrJoining,
  fightMargin,
  monstersNear,
  RISKY_MARGIN,
  SAFE_MARGIN,
} from './heroThreat';
import { castCheck, castSpell } from '../abilities/spells';
import { spellManaCost, spellTiers } from '../../domain/rules/spells';

import { bestPotionFor, canDrink, potionAmount, potionsByKind, usablePotionCount } from '../../domain/rules/potions';
import { aoeWorth, backlineStep, focusPick, personaOf, spellAverage } from './heroTactics';
import { humanProfile, styleLine, type HumanProfile } from './heroHuman';
import { actorSpeed as speedOf } from '../movement/follow';
import {
  aggro,
  currentActorTarget,
  currentTarget,
  hasLineOfSight,
  respawnPlayer,
  setTarget,
} from '../combat/combat';
import { chooseDialogOption, interactWith, LOOT_RANGE } from '../interaction/interaction';
import { equipItem, nearbyLootBags, takeLoot, useInventoryItem } from '../inventory/inventoryService';
import { buyItem, sellItem } from '../economy/shopService';
import { bankGold } from '../economy/depotService';
import { marketBuyNow, marketCancel, marketOffer, marketSellAll, marketSellNow } from '../economy/marketService';
import { collectParcels, escrowOf, marketable, offersFor, ownOffers, parcelUnits, priceGuide, shopPrices } from '../../domain/rules/market';
import { withdrawItem } from '../../domain/rules/depot';
import { lureTankId, sparMode } from '../social/social';
import {
  acceptInvite,
  actorById,
  attackedRecently,
  canAttackActor,
  declineInvite,
  formationSpot,
  hasSkull,
  invite,
  isPzLocked,
  isSparring,
  leaveParty,
  partyOf,
  pendingInviteFor,
  pkNow,
  sameParty,
  atWar,
  isWarAlly,
  isWarEnemy,
  skullOf,
  skullSeenBy,
  UNJUST_KILLS_FOR_RED,
  UNJUST_WINDOW_MS,
} from '../social/social';
import { engageNeed, power, sideStrength, warEnemiesNear, warOdds } from './heroWar';

export type HeroMode =
  'decide' | 'hunt' | 'town' | 'train' | 'social' | 'retreat' | 'dead' | 'follow' | 'pk' | 'recover' | 'raid';

type TownStep =
  | { kind: 'shop'; npcId: string; buyPotions?: boolean; upgrades?: boolean; trainingWeapon?: boolean }
  | { kind: 'bank'; op: 'withdraw' | 'deposit' | 'settle'; local?: boolean; amount?: number }
  | { kind: 'market' }
  | { kind: 'heal' };

export interface HeroBrainState {
  mode: HeroMode;
  nextThinkAt: number;
  modeUntil: number;
  /** Monstro que está caçando agora. */
  quarry: string | null;
  /** Centro da área de caça escolhida. */
  spot: { x: number; y: number } | null;
  town: TownStep[];
  /** Vila onde a viagem atual acontece (as paradas de banco e sacerdote são as dela). */
  townAnchor: { x: number; y: number } | null;
  /** De onde a viagem à vila partiu (para dimensionar os tempos-limite). */
  townFrom?: { x: number; y: number } | null;
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
  /** Coragem aprendida (-1..1): sobe a cada vitória e cai ao fugir ou morrer; muda quanto risco ele aceita. */
  bold: number;
  /** Poções de vida bebidas (instante, cura) nos últimos minutos: o consumo real decide quanto estocar. */
  drinkLog: { at: number; heal: number }[];
  /** Até quando a caça (ou o grupo) está "pesada": estoca mais poção e sente melhor o risco. */
  heavyUntil: number;
  /** Está sem recursos (poucas poções): caça só o que é folgado, com margem maior. */
  frugal: boolean;
  /** Motivo da última fuga (diagnóstico). */
  retreatWhy?: string;
  /** Motivo da última ida à vila (diagnóstico). */
  townWhy?: string;
  /** Próxima ida à vila só por falta de poções e quando pode reavaliar o saco de morte. */
  nextSupplyAt: number;
  nextGraveCheckAt: number;
  /** Modo "lurar": quando pode puxar de novo e até quando volta para o meio do grupo. */
  nextLureAt: number;
  lurePostUntil: number;
  /** Até quando a fuga está suspensa porque ele travou e precisa lutar para sobreviver. */
  fightBackUntil: number;
  /** Até quando está abrindo caminho (cercado, matando a criatura mais fraca do cerco para sair). */
  breakoutUntil: number;
  /** Quando abriu caminho pela última vez (cercado e querendo sair). */
  breakoutAt: number;
  /** Último dano recebido e desde quando ele apanha sem atacar nem andar (vigia contra o "parado apanhando"). */
  lastHurtAt?: number;
  passiveSince?: number;
  /** Última vez que não achou rota nenhuma até o abrigo na fuga (aí sim revidar faz sentido). */
  routeFailedAt?: number;
  /** Distância do alvo na última olhada (para saber se ele está fugindo). */
  chaseSeen?: { id: string; d: number; x?: number; y?: number };
  /** Chamado pelo grupo: larga o que está fazendo e vai até o líder (até este instante). */
  summonedUntil?: number;
  summonTo?: string;
  /** Poções de mana bebidas (instante, mana): o consumo real decide o estoque de mana, como o de vida. */
  manaLog: { at: number; mana: number }[];
  /** Meta de equipamento: o próximo item que vale juntar dinheiro (não gasta em coisa pior no caminho). */
  goal: { itemId: string; price: number } | null;
  nextGoalAt: number;
  /** Jogadores perigosos (mataram ou atacaram ele ou um colega): até quando evita/desconfia de cada um. */
  dangerous: Record<string, number>;
  nextDangerAt: number;
  /** Pedido de socorro ao grupo (quando pode pedir de novo). */
  nextHelpCallAt: number;
  /** Ordem tática do jogador (painel do grupo): atacar o alvo dele ou segurar a posição. */
  order:
    | { kind: 'attack'; targetId: string; until: number }
    | { kind: 'hold'; x: number; y: number; until: number }
    | null;
  /** Treino de nível mágico no tempo ocioso (mana cheia sem nada para fazer). */
  nextIdleTrainAt: number;
  /** Modo guerra: quem ele foi caçar, onde o viu por último, quando pode sair para outra caçada e o próximo olhar em volta. */
  raidTargetId?: string | null;
  raidIntel?: { x: number; y: number; at: number } | null;
  nextRaidAt?: number;
  nextWarThinkAt?: number;
  /** Quando olha de novo se um aliado precisa de ajuda numa briga e se vale trair o grupo (cada um por si). */
  nextAssistAt?: number;
  nextBetrayAt?: number;
  /** Poções de vida ao começar a briga atual (mede o gasto) e tréguas: até quando não volta a atacar cada um. */
  pkPotions?: number;
  warTruce?: Record<string, number>;
  /** Jeito de gente: reação, pausas, sessão de jogo, AFK, conversa (ver heroHuman). */
  human: HumanState;
}

export interface HumanState {
  /** Quando ele percebeu cada coisa que pede reação (vida baixa, mana baixa): reage depois do tempo de reação. */
  noticed: Partial<Record<'potion' | 'mana', number>>;
  /** Último alvo (para notar quando ele morre e dar uma olhada na tela antes do próximo). */
  lastTarget: string | null;
  /** Olhando a tela (loot, próximo alvo) até este instante. */
  lookUntil: number;
  /** Fim da sessão de jogo atual (0 = ainda não sorteado). */
  sessionEnds: number;
  /** Saindo do jogo: indo para um lugar seguro para deslogar. */
  leaving: boolean;
  /** Pronto para deslogar (a simulação tira do mundo e marca a volta). */
  logoutReady: boolean;
  /** Ausente (AFK) até este instante. */
  afkUntil: number;
  /** Acabou de voltar de uma pausa: avisa no chat. */
  justBack: boolean;
  /** Fala marcada para depois (resposta "digitando"). */
  pendingSay: { key: HeroLineKey; vars: Record<string, string | number>; at: number } | null;
  /** Último cumprimento trocado com cada personagem. */
  greeted: Record<string, number>;
  /** Pequenas pausas na vila (olhando a loja, conferindo a mochila). */
  pauseUntil: number;
  nextFidgetAt: number;
}

export function newHumanState(): HumanState {
  return {
    noticed: {},
    lastTarget: null,
    lookUntil: 0,
    sessionEnds: 0,
    leaving: false,
    logoutReady: false,
    afkUntil: 0,
    justBack: false,
    pendingSay: null,
    greeted: {},
    pauseUntil: 0,
    nextFidgetAt: 0,
  };
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
    townAnchor: null,
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
    frugal: false,
    nextSupplyAt: 0,
    nextGraveCheckAt: 0,
    nextLureAt: 0,
    lurePostUntil: 0,
    fightBackUntil: 0,
    breakoutUntil: 0,
    breakoutAt: 0,
    bold: 0,
    drinkLog: [],
    heavyUntil: 0,
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
    manaLog: [],
    goal: null,
    nextGoalAt: 0,
    dangerous: {},
    nextDangerAt: 0,
    nextHelpCallAt: 0,
    order: null,
    nextIdleTrainAt: 0,
    human: newHumanState(),
  };
}

/** Texto curto do que o herói está fazendo (menu do personagem e fala de status). */
export function heroActivity(w: World, h: HeroEntity): string {
  const b = h.brain;
  if (h.dead) return 'morto (renascendo)';
  if (b.human.afkUntil > w.now) return 'ausente (AFK)';
  if (b.human.leaving) return 'saindo do jogo';
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
    case 'raid':
      return b.raidTargetId === w.human.id ? 'caçando VOCÊ' : 'indo atrás de inimigos da guerra';
    case 'decide':
      return isPzLocked(w, h.id) && atWar(w) ? 'esperando o PZ lock passar' : 'pensando no que fazer';
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
  Object.fromEntries(
    Object.values(w.data.monsters)
      .filter((m) => !m.elite && m.level !== undefined)
      .map((m) => [m.id, m.level!]),
  );

// ------------------------------------------------------------------ fala
export function heroSay(
  w: World,
  h: HeroEntity,
  key: HeroLineKey,
  vars: Record<string, string | number> = {},
  cooldownMs = 15000,
): boolean {
  const last = h.brain.lastSpeech[key] ?? -Infinity;
  if (w.now - last < cooldownMs || w.now - h.brain.lastSpokeAt < 2500) return false;
  const lines = h.hero.lines[key];
  if (!lines?.length) return false;
  let text = lines[w.rng.int(0, lines.length - 1)]!;
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  // cada um escreve do seu jeito (gírias, sem acento, exclamações...), e nunca do mesmo jeito duas vezes
  text = styleLine(text, profileOf(h).style, () => w.rng.next(), LIGHT_LINES.has(key));
  h.brain.lastSpeech[key] = w.now;
  h.brain.lastSpokeAt = w.now;
  w.events.emit('speech', { entityId: h.id, name: h.character.name, text, position: { x: h.x, y: h.y }, key });
  return true;
}

/** Falas de brincadeira (ganham um "kkk"/"haha" de quem escreve assim). */
const LIGHT_LINES = new Set<HeroLineKey>(['kill', 'death', 'rareLoot', 'pkWin', 'levelUp', 'replyHero']);

/** Perfil humano do herói (fixo; calculado uma vez). */
const profiles = new WeakMap<HeroEntity['hero'], HumanProfile>();
export function profileOf(h: HeroEntity): HumanProfile {
  let p = profiles.get(h.hero);
  if (!p) profiles.set(h.hero, (p = humanProfile(h.hero)));
  return p;
}

/** Resposta quando o jogador toca no herói. */
export function heroStatusLine(w: World, h: HeroEntity): void {
  const c = h.character;
  heroSay(
    w,
    h,
    'status',
    { level: c.level, area: heroActivity(w, h), gold: c.gold, potions: potionsOf(w, h) },
    0,
  );
}

// ------------------------------------------------------------------ utilidades
const hpPct = (h: HeroEntity) => h.character.health / Math.max(1, h.stats.maxHealth);

/** Sem arma principal (perdeu o equipamento numa morte): a arma é a primeira compra e as magias fazem o dano. */
const unarmed = (h: HeroEntity): boolean => !h.character.equipment.mainHand;

/** Ouro para completar o estoque de mana pela oferta mais barata por ponto de mana (0 se ele não compra mana). */
function manaRestockCost(w: World, h: HeroEntity): number {
  const deficit = manaGoal(w, h) - manaStock(w, h);
  if (deficit <= 0) return 0;
  let perMana = Infinity;
  for (const shop of Object.values(w.data.shops))
    for (const o of potionOffers(w, shop, 'mana', h))
      perMana = Math.min(perMana, o.price / (w.data.items[o.itemId]?.use?.mana ?? 60));
  return Number.isFinite(perMana) ? Math.ceil(deficit * perMana) : 0;
}

/** Estoque de cura de quem faz o papel de tanque: com pouca poção o Knight não arrisca, não luta o que não é folgado nem lura. */
function wellStocked(w: World, h: HeroEntity): boolean {
  return potionHeal(w, h) >= Math.max(h.stats.maxHealth * 3, healGoal(h, w.now) * 0.5);
}

/** Funções internas expostas só para os testes. */
export const heroHelpers = {
  smartStrike: (w: World, h: HeroEntity, m: MonsterEntity, ids: string[]): boolean =>
    asActor(w, h, () => smartStrike(w, h, m, ids, 0, false) === 'cast'),
  wellStocked: (w: World, h: HeroEntity): boolean => wellStocked(w, h),
  manaGoal: (w: World, h: HeroEntity): number => manaGoal(w, h),
  suppliesRunningOut: (w: World, h: HeroEntity): boolean => suppliesRunningOut(w, h),
  updateGoal: (w: World, h: HeroEntity): void => updateGoal(w, h),
  upgradeBudget: (h: HeroEntity, budget: number): number => upgradeBudget(h, budget),
  collectLoot: (w: World, h: HeroEntity): void => collectLootWhileFighting(w, h),
  fightSpells: (w: World, h: HeroEntity, target: MonsterEntity): void => fightSpells(w, h, target, 0),
  /** Etapa do mercado (com a janela do corretor aberta). */
  marketing: (w: World, h: HeroEntity): void => marketing(w, h),
  /** Um passo da sobrevivência (poções, curas, fuga). */
  survive: (w: World, h: HeroEntity): void => survive(w, h),
  /** Um passo da caça (escolha do próximo alvo). */
  huntTick: (w: World, h: HeroEntity): void => hunt(w, h, false),
  /** Compra de poções numa loja já aberta (w.ui.shop), como na etapa de loja da vila. */
  buyPotions: (w: World, h: HeroEntity, npcId: string): void => shopping(w, h, { kind: 'shop', npcId, buyPotions: true }),
  tryCast: (w: World, h: HeroEntity, id: string): boolean => tryCast(w, h, id),
  pickPotion: (w: World, h: HeroEntity): number => pickPotion(w, h),
  conjurePotions: (w: World, h: HeroEntity): void => conjurePotions(w, h),
};

/** Poções de vida que restam quando ele decide ir repor o estoque (antes de ficar seco no meio das criaturas). */
const LOW_POTIONS = 2;

/** Dinheiro (bolsa + loot + banco) para repor poções? Sem ele não adianta ir à vila. */
function canResupply(w: World, h: HeroEntity): boolean {
  return h.character.gold + lootValue(w, h) + h.character.bankGold >= potionPrice(w) * 3;
}

/** Poções quase no fim e dinheiro para repor: hora de vender o loot, comprar e voltar. */
function lowOnPotions(w: World, h: HeroEntity): boolean {
  return (
    potionsOf(w, h) <= LOW_POTIONS &&
    w.now >= h.brain.nextSupplyAt &&
    !isPzLocked(w, h.id) &&
    canResupply(w, h)
  );
}

/** Poções de vida que ele pode beber (as acima do nível dele não contam). */
function potionsOf(w: World, h: HeroEntity): number {
  return usablePotionCount(w.data, h.character, 'heal');
}

/** Uso da poção, se ele já pode bebê-la (nível mínimo). */
function drinkable(w: World, h: HeroEntity, itemId: string) {
  const def = w.data.items[itemId];
  return canDrink(def, h.character.level) ? def?.use : undefined;
}

/** Cura total guardada em poções de vida (todas as pilhas que ele pode beber). */
function potionHeal(w: World, h: HeroEntity): number {
  return h.character.inventory.reduce((s, st) => {
    const use = st && drinkable(w, h, st.itemId);
    return st && use?.heal && !use.mana ? s + use.heal * st.count : s;
  }, 0);
}

/** Mana guardada em poções de mana (que ele pode beber). */
function manaStock(w: World, h: HeroEntity): number {
  return h.character.inventory.reduce((s, st) => {
    const use = st && drinkable(w, h, st.itemId);
    return st && use?.mana && !use.heal ? s + use.mana * st.count : s;
  }, 0);
}

/**
 * Estoque de mana que a vocação quer ter na mochila (0 = não compra): o básico da vocação ou, se ele gasta mais, o
 * consumo real (mana bebida nos últimos 12 min × 14 min de caça, com 15% de folga), até 5 manas cheias.
 */
function manaGoal(w: World, h: HeroEntity): number {
  const mul = ROLES[h.character.vocation].manaStock;
  if (!mul) return 0;
  const base = Math.max(mul >= 2 ? 180 : 0, Math.round(h.stats.maxMana * mul));
  if (mul < 2) return base;
  const recent = h.brain.manaLog.filter((d) => w.now - d.at < 12 * 60000).reduce((s, d) => s + d.mana, 0);
  return Math.round(Math.min(Math.max(base, h.stats.maxMana * 5), Math.max(base, (recent / 12) * 14 * 1.15)));
}

/** Bebe a poção de mana e anota quanto recuperou (o consumo real define o estoque de mana). */
function drinkMana(w: World, h: HeroEntity, idx: number): void {
  const before = h.character.mana;
  useInventoryItem(w, idx);
  const got = h.character.mana - before;
  if (got > 0) {
    h.brain.manaLog.push({ at: w.now, mana: got });
    if (h.brain.manaLog.length > 80) h.brain.manaLog.shift();
  }
}

/** A arma serve a este herói? Paladino só usa armas de distância (o arco, o maior ataque); os demais, nada de duas mãos. */
function weaponFits(w: World, h: HeroEntity, def: ItemDef): boolean {
  if (def.slot === 'offHand') {
    const main = h.character.equipment.mainHand;
    return !main || !w.data.items[main.itemId]?.twoHanded;
  }
  if (def.slot !== 'mainHand') return true;
  const voc = h.character.vocation;
  if (voc === 'sorcerer' || voc === 'druid') return def.weapon?.kind === 'wand'; // mago: só varinha/cajado
  if (h.character.vocation === 'paladin') return def.weapon?.kind === 'distance' && !!def.twoHanded; // só arcos
  return !def.twoHanded;
}

/** Estoque de cura que ele quer ter ao sair da vila: 4 vidas cheias (mínimo 600). */
/** Estoque de cura desejado (exportado para os testes). */
export const healGoalFor = (h: HeroEntity, now: number): number => healGoal(h, now);

function healGoal(h: HeroEntity, now = 0): number {
  const b = h.brain;
  // consumo real: cura bebida por minuto nos últimos 12 min × 14 min de caça (a caça pesada pede ainda mais)
  const recent = b.drinkLog.filter((d) => now - d.at < 12 * 60000).reduce((s, d) => s + d.heal, 0);
  const heavy = b.heavyUntil > now && h.stats.maxHealth >= 400; // nos primeiros níveis o ouro é curto: sem exagero
  // (com 15% de folga sobre o consumo: acabar a poção no meio da caça custa a vida)
  const burn = h.stats.maxHealth >= 400 ? (recent / 12) * 14 * (heavy ? 1.4 : 1) * 1.15 : 0;
  return Math.min(h.stats.maxHealth * 30, Math.max(600, h.stats.maxHealth * (heavy ? 7 : 5), burn));
}

/** Margem exigida para puxar uma luta: o corajoso aceita menos, o prudente exige mais. */
function needMargin(w: World, h: HeroEntity): number {
  const scarce =
    (potionsOf(w, h) <= LOW_POTIONS ? 0.5 : 0) +
    (h.character.vocation === 'knight' && !wellStocked(w, h) ? 0.5 : 0); // sem poção não há folga: só luta o que é bem tranquilo
  return (
    SAFE_MARGIN -
    (h.hero.temperament.bravery - 0.5) * 0.4 -
    h.brain.bold * 0.35 +
    (h.brain.frugal ? 0.3 : 0) +
    scarce +
    // quem luta de longe não aguenta ser cercado (as criaturas contornam e tomam as casas em volta): mais folga
    (isRanged(h.character.vocation) ? 0.2 : 0) +
    personaOf(h.hero.temperament).margin
  );
}

/** Criaturas "de mentira" (vida cheia) para a régua avaliar uma área antes de ir até ela. */
function protoMonsters(w: World, id: string, n: number): MonsterEntity[] {
  const def = w.data.monsters[id];
  return def ? Array.from({ length: n }, () => ({ def, hp: def.health }) as unknown as MonsterEntity) : [];
}

/** Id da espécie pelo nome (o que o evento de dano informa). */
function monsterIdByName(w: World, name: string | null): string | null {
  if (!name) return null;
  return Object.values(w.data.monsters).find((d) => d.name === name)?.id ?? null;
}

/** Poções à venda (vida ou mana) que ele já pode beber, da mais fraca para a mais forte. */
function potionOffers(
  w: World,
  shop: { sells: readonly { itemId: string; price: number }[] },
  kind: 'heal' | 'mana',
  h?: HeroEntity,
) {
  return shop.sells
    .filter((o) => {
      if (h && !canDrink(w.data.items[o.itemId], h.character.level)) return false;
      const use = w.data.items[o.itemId]?.use;
      return kind === 'heal' ? !!use?.heal && !use.mana : !!use?.mana && !use.heal;
    })
    .sort((a, b) => (w.data.items[a.itemId]?.use?.[kind] ?? 0) - (w.data.items[b.itemId]?.use?.[kind] ?? 0));
}

/** A oferta mais forte cuja cura não passa de `limit` (ou a mais fraca, se todas passam). */
function pickPotionOffer<T extends { itemId: string }>(w: World, offers: T[], limit: number): T | undefined {
  const fit = offers.filter(
    (o) => (w.data.items[o.itemId]?.use?.heal ?? w.data.items[o.itemId]?.use?.mana ?? 0) <= limit,
  );
  return fit[fit.length - 1] ?? offers[0];
}

function npcByShop(w: World, shopId: string): NpcEntity | undefined {
  return [...w.npcs.values()].find((n) => n.def.shopId === shopId);
}
function npcByAction(w: World, action: string, near?: { x: number; y: number }): NpcEntity | undefined {
  const all = [...w.npcs.values()].filter((n) => n.def.dialog[0]?.options.some((o) => o.action === action));
  return near ? all.sort((a, b) => chebyshev(a, near) - chebyshev(b, near))[0] : all[0];
}

/** Loja (NPC) mais próxima de um ponto: a vila "de casa" naquele momento. */
function nearestShopNpc(w: World, near: { x: number; y: number }): NpcEntity | undefined {
  return [...w.npcs.values()]
    .filter((n) => n.def.shopId)
    .sort((a, b) => chebyshev(a, near) - chebyshev(b, near))[0];
}

/** A loja vende alguma poção? */
const sellsPotions = (w: World, shop: { sells: readonly { itemId: string }[] }): boolean =>
  shop.sells.some((o) => w.data.items[o.itemId]?.type === 'potion');

/** Valor do que a mochila renderia vendendo nas lojas (melhor preço de cada item). */
function lootValue(w: World, h: HeroEntity): number {
  let total = 0;
  for (const st of h.character.inventory) {
    const def = st && w.data.items[st.itemId];
    // poções e a munição que ele mesmo usa não são "loot para vender"
    if (!st || !def || st.itemId.startsWith('training_') || def.type === 'potion') continue;
    const best = Math.max(
      0,
      ...Object.values(w.data.shops).map((s) => s.buys.find((o) => o.itemId === st.itemId)?.price ?? 0),
    );
    total += best * st.count;
  }
  return total;
}

/** Melhor upgrade à venda que o herói pode usar (o mais caro que cabe no orçamento), ou null. */
export function bestUpgrade(
  w: World,
  h: HeroEntity,
  budget: number,
  onlySlot?: string,
): { itemId: string; price: number; shopId: string } | null {
  let best: { itemId: string; price: number; shopId: string; gain: number } | null = null;
  for (const shop of Object.values(w.data.shops))
    for (const o of shop.sells) {
      const def = w.data.items[o.itemId];
      if (
        !def?.slot ||
        (onlySlot && def.slot !== onlySlot) ||
        !weaponFits(w, h, def) ||
        def.weapon?.training ||
        o.price > budget
      )
        continue;
      if (!isUpgrade(w.data, h.character, def)) continue;
      const cur = h.character.equipment[def.slot];
      const gain = valueFor(h, def) - (cur ? valueFor(h, w.data.items[cur.itemId]!) : 0);
      if (gain < 5) continue; // melhora irrelevante não vale a viagem nem o ouro
      if (!best || gain / o.price > best.gain / best.price)
        best = { itemId: o.itemId, price: o.price, shopId: shop.id, gain };
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
    if (!def?.slot || !weaponFits(w, h, def) || def.weapon?.training || !isUpgrade(w.data, c, def)) continue;
    const cur = c.equipment[def.slot];
    if (valueFor(h, def) - (cur ? valueFor(h, w.data.items[cur.itemId]!) : 0) < 5) continue;
    if (equipItem(w, i)) heroSay(w, h, 'upgrade', { item: def.name }, 0);
  }
}

function potionPrice(w: World): number {
  return Math.min(
    ...Object.values(w.data.shops).flatMap((s) =>
      s.sells.filter((o) => o.itemId === 'potion_health').map((o) => o.price),
    ),
    999,
  );
}

function goTo(w: World, h: HeroEntity, x: number, y: number, maxNodes = 20000, stopWithin?: number): void {
  const b = h.brain;
  if (b.walkReq && b.walkReq.x === x && b.walkReq.y === y && h.path?.length) return;
  b.walkReq = { x, y };
  const far = chebyshev(h, { x, y }) > 30; // viagem longa: desvia das criaturas e aceita rotas grandes
  if (
    !planWalk(w, x, y, {
      quiet: true,
      maxNodes: far ? Math.max(maxNodes, 150000) : maxNodes,
      stopWithin,
      avoidMonsters: far,
    })
  )
    b.lastPos.at = w.now - 3000;
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
  if (mode !== 'follow') h.following = false;
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
      b.bold = Math.max(-1, b.bold - 0.4);
      const killer = monsterIdByName(w, b.lastHitBy);
      if (killer) b.avoid[killer] = w.now + 25 * 60000;
      b.prepare = true;
      // quem morre volta para a vila com o orgulho ferido
      if (b.pkLostTo) heroSay(w, h, 'pkLose', { player: b.pkLostTo }, 0);
      else heroSay(w, h, 'death', { monster: b.lastHitBy ?? 'aquele monstro' }, 0);
      b.pkLostTo = null;
      restoreMainWeapon(w, h);
      setMode(w, h, 'decide');
      // como gente: depois de morrer, às vezes dá uma respirada no templo antes de voltar
      if (w.lifelike && w.rng.chance(0.3)) b.human.afkUntil = w.now + (30 + w.rng.next() * 60) * 1000;
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
  // jeito de gente: resposta "digitando", AFK, fim de sessão (sair e voltar depois)
  if (humanRoutine(w, h)) return;
  callForHelp(w, h);
  if (partyOf(w, h.id)) supportParty(w, h); // a cura do grupo vem antes de qualquer outra decisão
  // chamado pelo grupo: larga tudo (caça, vila, loot) e vai até o líder; só as poções continuam valendo
  if ((b.summonedUntil ?? 0) > w.now && b.mode !== 'retreat') return summoned(w, h);
  // ordem tática do jogador (painel do grupo): atacar o alvo dele ou segurar a posição
  if (b.order && (w.now > b.order.until || !partyOf(w, h.id))) b.order = null;
  if (b.order && b.mode !== 'retreat' && orderTick(w, h)) return;
  fightBack(w, h);
  // (antes de abrir caminho num cerco: a briga com gente que não leva a nada é largada mesmo assim)
  if (b.mode === 'pk' && atWar(w)) {
    const v = actorById(w, b.pkTargetId);
    if (v) warPkCheck(w, h, v);
  }
  if (breakOut(w, h)) return;
  unstick(w, h);
  heroGroupLife(w, h);
  handleInvites(w, h);
  // em grupo o herói segue a dinâmica do líder: não escolhe vítimas de PK sozinho (só ataca as do líder, ver follow)
  // (no treino entre membros, friendlyFire, ele continua revidando)
  const group = partyOf(w, h.id);
  const solo = !group || group.friendlyFire;
  // em grupo o PK é o do líder, mas a legítima defesa vale sempre
  // (na guerra o líder escolhe as vítimas do grupo: o PK dele continua)
  if (
    b.mode === 'pk' &&
    !solo &&
    !(atWar(w) && warChooser(w, h)) &&
    !attackedRecently(w, b.pkTargetId ?? '', h.id, 10000)
  )
    setMode(w, h, 'decide');
  // guerra: olha em volta antes de tudo — foge do que não aguenta, ataca o que vale a pena
  if (b.mode !== 'retreat' && thinkWar(w, h)) return;
  if (b.mode !== 'retreat' && selfDefense(w, h)) return;
  if (watchDanger(w, h)) return;
  // revanche planejada: sozinho ou como líder do grupo (os membros atacam o alvo do líder)
  if (b.mode !== 'retreat' && (solo || group?.leaderId === h.id) && plannedRevenge(w, h)) return;
  if (b.mode !== 'retreat' && solo && thinkPvp(w, h)) return;
  if (
    b.mode !== 'pk' &&
    b.mode !== 'retreat' &&
    b.mode !== 'town' &&
    followingHuman(w, h) &&
    b.mode !== 'follow'
  )
    setMode(w, h, 'follow');
  conjurePotions(w, h);
  idleTraining(w, h);
  whims(w, h);
  greetNearby(w, h);
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
    case 'raid':
      raid(w, h);
      break;
  }
}

/** Consegue atacar agora? Arma corpo a corpo/distância sempre; varinha só com mana para o disparo ou para uma magia. */
function canHitNow(w: World, h: HeroEntity): boolean {
  const weapon = h.stats.weapon;
  if (weapon.kind !== 'wand' || !h.character.equipment.mainHand) return true;
  const mana = h.character.mana;
  if (mana >= (weapon.manaCost ?? 0)) return true;
  return w.data.vocations[h.character.vocation].spells.some((id) => {
    const s = w.data.spells[id];
    return !!s && s.effect === 'damage' && spellManaCost(s, h.character.level) <= mana;
  });
}

/**
 * Vigia contra o "parado apanhando": se ele toma dano há ~2,5 s sem atacar nem sair do lugar (alvo inalcançável do
 * outro lado de um obstáculo, atirador fora do alcance, caminho travado, PK que não revida), ele troca para quem dá
 * para acertar daqui ou, sem ninguém ao alcance, foge — em vez de beber poção até morrer.
 */
function unstick(w: World, h: HeroEntity): void {
  const b = h.brain;
  const hurt = w.now - (b.lastHurtAt ?? -Infinity) < 1500;
  const acting = w.now - h.lastAttackAt < 2500 || isMoving(h, w.now) || w.now - b.lastPos.at < 1500;
  if (!hurt || acting || isPz(w.map, h.x, h.y)) {
    b.passiveSince = 0;
    return;
  }
  if (!b.passiveSince) {
    b.passiveSince = w.now;
    return;
  }
  if (w.now - b.passiveSince < 2500) return;
  b.passiveSince = 0;
  const range = Math.max(1, h.stats.weapon.range);
  const reachable = [...w.monsters.values()]
    .filter(
      (m) =>
        m.alive && m.targetId === h.id && chebyshev(m, h) <= range && (range <= 1 || hasLineOfSight(w, h, m)),
    )
    .sort((a, c) => a.hp - c.hp)[0];
  // já mirava quem está ao alcance e mesmo assim não atacou (sem mana para a varinha, arma inútil): não adianta
  // trocar de alvo — sai dali
  if (reachable && h.targetId !== reachable.id) {
    setTarget(w, reachable.id);
    return;
  }
  // personagem batendo nele (PK): revida se der
  const foe = allActors(w).find(
    (a) => a !== h && !a.dead && attackedRecently(w, a.id, h.id, 4000) && !canAttackActor(w, h, a),
  );
  if (foe && hpPct(h) > 0.4) {
    startPk(w, h, foe.id, 'revenge');
    return;
  }
  // ninguém ao alcance: sai dali (e, se o caminho estiver travado, dá um passo para o lado)
  setTarget(w, null);
  h.path = null;
  sidestep(w, h);
  b.retreatWhy = 'travado apanhando sem alcançar ninguém';
  if (b.mode !== 'retreat') setMode(w, h, 'retreat');
}

/** Bebe a poção de vida e anota a cura (o consumo real define o estoque). */
function drinkHealth(w: World, h: HeroEntity, idx: number): void {
  const st = h.character.inventory[idx];
  const heal = st ? (w.data.items[st.itemId]?.use?.heal ?? 0) : 0;
  const before = h.character.health;
  useInventoryItem(w, idx);
  if (h.character.health > before || heal) {
    h.brain.drinkLog.push({ at: w.now, heal: Math.min(heal, h.stats.maxHealth - before) });
    if (h.brain.drinkLog.length > 80) h.brain.drinkLog.shift();
  }
}

/**
 * Reage a quem está batendo nele em QUALQUER atividade: sem alvo (seguindo, na vila, preso fugindo) ele escolhe o
 * atacante mais fraco/perto e luta com as magias, em vez de ficar parado bebendo todas as poções até morrer.
 */
function fightBack(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (b.mode === 'pk' || b.mode === 'dead' || isPz(w.map, h.x, h.y)) return;
  // sem como bater (varinha sem mana e sem mana para magia): ficar "lutando" é ficar parado apanhando — melhor fugir
  if (!canHitNow(w, h)) return;
  const attackers = [...w.monsters.values()].filter(
    (m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= Math.max(2, Math.min(5, m.def.attack.range)),
  );
  if (!attackers.length) return;
  const adjacent = attackers.filter((m) => chebyshev(m, h) <= 1).length;
  const stuckMs = w.now - b.lastPos.at;
  const moving = isMoving(h, w.now) || !!h.path?.length;
  // fugindo/andando: continua; só luta se a rota de fuga falhou de verdade (sem caminho nenhum) ou se está cercado.
  // (antes "parado" bastava — e era justamente o revidar que o deixava parado: travava para sempre na fuga)
  const routeFailed = w.now - (b.routeFailedAt ?? -Infinity) < 3000;
  // cercado (3+ encostadas) ele luta em vez de fugir — mas só se a luta leva a algum lugar: se nem a mais fraca do
  // cerco cai em ~25 s (sem arma, sem mana), lutar é ficar curando para sempre no mesmo lugar; aí tenta sair
  const hopeless =
    adjacent >= 3 &&
    Math.min(...attackers.filter((m) => chebyshev(m, h) <= 1).map((m) => m.hp / heroDpsVs(w, h, m))) > 25;
  if (
    (b.mode === 'retreat' || b.mode === 'town') &&
    !(routeFailed && stuckMs > 1200) &&
    (adjacent < 3 || hopeless)
  )
    return;
  if (b.mode === 'retreat' || b.mode === 'town') b.fightBackUntil = w.now + 2500;
  if (
    moving &&
    stuckMs < 1200 &&
    adjacent < 2 &&
    b.mode !== 'follow' &&
    b.mode !== 'hunt' &&
    b.mode !== 'train'
  )
    return;
  let target = currentTarget(w);
  if (!target || !target.alive || target.targetId !== h.id) {
    // primeiro quem dá para acertar daqui (à vista e ao alcance da arma), depois o mais ferido e mais perto
    const range = Math.max(1, h.stats.weapon.range);
    const hittable = (m: MonsterEntity) =>
      chebyshev(m, h) <= range && (range <= 1 || hasLineOfSight(w, h, m)) ? 0 : 1;
    target = attackers.sort(
      (a, c) =>
        hittable(a) - hittable(c) ||
        a.hp / a.def.health - c.hp / c.def.health ||
        chebyshev(a, h) - chebyshev(c, h),
    )[0]!;
    setTarget(w, target.id);
  }
  // em hunt/follow o próprio modo já lança as magias; nos demais a luta é aqui
  if (b.mode !== 'hunt' && b.mode !== 'follow' && b.mode !== 'train' && castsNow(w, h, adjacent))
    fightSpells(w, h, target, adjacent);
}

// ------------------------------------------------------------------ cercado (trap)
/** As criaturas encostadas, se ele está preso: nenhuma casa em volta livre para pisar e 2+ criaturas encostadas. */
export function trappedBy(w: World, h: HeroEntity): MonsterEntity[] | null {
  const ring = [...w.monsters.values()].filter((m) => m.alive && chebyshev(m, h) <= 1);
  if (ring.length < 2) return null;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && canEnter(w, h.x + dx, h.y + dy, false, h.id)) return null;
  return ring;
}

/**
 * Cercado, ele quer sair? Quem não é Knight, sempre: preso no meio do bolo só apanha. O Knight gosta do cerco (a magia
 * de área acerta todos de uma vez) e só abre caminho quando está morrendo, com poucas poções ou perdendo a luta.
 */
function wantsBreakout(w: World, h: HeroEntity): boolean {
  if (h.character.vocation !== 'knight') return true;
  const pct = hpPct(h);
  return pct < 0.45 || potionsOf(w, h) <= 5 || (pct < 0.7 && assess(w, h).margin < 1);
}

/**
 * Cercado e querendo sair: mata primeiro a criatura do cerco que cai mais rápido (a mais fraca; empate, a que mais
 * machuca) com a melhor magia de alvo único, para abrir uma brecha. Aberta a brecha, dá um passo para a casa com menos
 * criaturas encostadas (o Knight só se precisava sair) e devolve o turno à lógica normal (caça, fuga, distância).
 * Retorna true se tomou conta do turno.
 */
function breakOut(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  if (b.mode === 'pk' || b.mode === 'dead' || isPz(w.map, h.x, h.y)) return false;
  const ring = trappedBy(w, h);
  if (ring && wantsBreakout(w, h)) {
    b.breakoutUntil = w.now + 6000;
    b.breakoutAt = w.now;
    const ttk = (m: MonsterEntity) => m.hp / Math.max(0.5, heroDpsVs(w, h, m));
    const weakest = ring.sort((a, c) => ttk(a) - ttk(c) || monsterDps(w, h, c) - monsterDps(w, h, a))[0]!;
    if (currentTarget(w)?.id !== weakest.id) setTarget(w, weakest.id);
    // magia de área que pega o cerco todo (Chama Sagrada, Nova de Fogo, Giro de Aço) também abre caminho; senão a de
    // alvo único na mais fraca
    // (a sequência de magias da vocação: a de área que pega o cerco todo — Chama Sagrada, Nova de Fogo, Giro de Aço —
    // ou a de alvo único na mais fraca, com o golpe de misericórdia esperto)
    fightSpells(w, h, weakest, ring.length);
    return true;
  }
  if (!ring && b.breakoutUntil > w.now) {
    // brecha aberta: sai do meio (uma casa com menos criaturas em volta); dali em diante a lógica de sempre
    b.breakoutUntil = 0;
    if (isMoving(h, w.now) || h.path?.length) return false;
    const foes = [...w.monsters.values()].filter((m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= 2);
    const touching = (x: number, y: number) => foes.filter((m) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) <= 1).length;
    let best: { dx: number; dy: number; n: number } | null = null;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if ((!dx && !dy) || !canEnter(w, h.x + dx, h.y + dy, false, h.id)) continue;
        const n = touching(h.x + dx, h.y + dy);
        if (!best || n < best.n) best = { dx, dy, n };
      }
    if (best && best.n < touching(h.x, h.y)) tryStep(w, h, best.dx, best.dy, speedOf(w, h), false);
  }
  return false;
}

/** Magias de alvo único de dano de cada vocação (os graus II/III entram sozinhos). */
const SINGLE_SPELLS: Record<string, string[]> = {
  knight: ['brutal_strike'],
  sorcerer: ['thunder_strike', 'flame_lance', 'arcane_bolt'],
  druid: ['earth_thorn', 'ice_shard'],
  paladin: ['divine_shot', 'holy_arrow'],
};

/**
 * Golpe de misericórdia esperto, antes da sequência de magias de cada vocação:
 * - `skip`: o golpe básico já derruba o alvo (e ele não está fugindo) — não gasta mana;
 * - `cast`: uma magia (entre `ids` e seus graus) mata o alvo — sai a mais barata que mata (nada de grau III num resto
 *   de vida), sem deixar a mana abaixo da reserva;
 * - `none`: nenhuma mata; segue a prioridade de sempre da vocação (medida nas simulações).
 */
function smartStrike(
  w: World,
  h: HeroEntity,
  target: MonsterEntity,
  ids: readonly string[] | undefined,
  minManaPct: number,
  fleeing: boolean,
): 'cast' | 'skip' | 'none' {
  if (!ids?.length) return 'none';
  const voc = h.character.vocation;
  const basicHit = (heroDpsVs(w, h, target) * (h.stats.attackIntervalMs / 1000)) / (1.12 * ROLES[voc].dpsMul);
  if (!fleeing && target.hp <= basicHit * 0.9) return 'skip';
  const lv = h.character.level;
  const reserve = minManaPct * h.stats.maxMana;
  let best: { id: string; cost: number } | null = null;
  for (const base of ids)
    for (const id of spellTiers(w.data.spells, base)) {
      const s = w.data.spells[id];
      if (!s || !s.vocations.includes(voc) || lv < s.minLevel || !castCheck(w, s).ok) continue;
      const cost = Math.max(1, spellManaCost(s, lv));
      if (h.character.mana - cost < reserve) continue;
      const res = s.element ? (target.def.resistances?.[s.element] ?? 1) : 1;
      if (spellAverage(w, h, id) * res * 0.85 < target.hp) continue;
      if (!best || cost < best.cost) best = { id, cost };
    }
  if (best && castSpell(w, best.id)) return 'cast';
  return 'none';
}

function survive(w: World, h: HeroEntity): void {
  const t = h.hero.temperament;
  const pct = hpPct(h);
  // quem está batendo nele: corpo a corpo encostado e atiradores dentro do alcance deles
  const attackers = [...w.monsters.values()].filter(
    (m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= Math.min(3, Math.max(2, m.def.attack.range)),
  );
  // apanhando de personagens (PK): conta para a poção e para a cura como as criaturas
  const pvpHit =
    w.social.pvp &&
    allActors(w).some(
      (a) => a !== h && !a.dead && chebyshev(a, h) <= 7 && attackedRecently(w, a.id, h.id, 4000),
    );
  // régua de ameaça: quem está na briga, quanto dano chega por segundo e quanto tempo de vida resta
  const a = assess(w, h);
  const hp = h.character.health;
  const shielded = h.buffs.some((b) => b.kind === 'manaShield');
  if (a.mons.length && a.margin < 2.4) h.brain.heavyUntil = w.now + 10 * 60000; // luta apertada: estoca mais poção da próxima vez
  // perigo de morrer antes da próxima poção: um golpe forte tira metade da vida, ou restam poucos segundos
  const danger = !!a && attackers.length > 0 && (hp < a.maxHit * 2.2 || a.secondsLeft < 3.5);
  // poção de vida: com alguém batendo, abaixo do limiar da prudência; em emergência (<25%) bebe sempre
  // em grupo age mais cedo (os colegas seguram a briga enquanto ele se cura): não espera chegar perto do fim
  const grouped = alliesNear(w, h) > 0;
  const persona = personaOf(t);
  // como gente: ele percebe a vida baixa e reage um instante depois (no aperto — vida no fim ou golpe que mata —, na hora)
  const urgent = pct < 0.3 || danger;
  const wantsPotion =
    (pct < 0.45 + t.caution * 0.15 + (grouped ? 0.1 : 0) + persona.drink && (attackers.length || pvpHit)) || pct < 0.25 || danger;
  if (wantsPotion && (urgent || reacted(w, h, 'potion'))) {
    const idx = pickPotion(w, h, danger || pct < 0.25);
    if (idx >= 0) drinkHealth(w, h, idx);
    delete h.brain.human.noticed.potion;
  } else if (!wantsPotion) delete h.brain.human.noticed.potion;
  if (pct < (grouped ? 0.75 : 0.65) && h.character.vocation === 'druid' && tryCast(w, h, 'sap_blessing')) {
    // Bênção da Seiva: cura forte + regeneração (e cura o grupo)
  } else if (
    pct < (grouped ? 0.7 : 0.6) &&
    // (a Luz Restauradora só com mana sobrando: sem mana o Paladin fica sem Corrida para fugir)
    ((h.character.mana > h.stats.maxMana * 0.5 && tryCast(w, h, 'holy_light')) ||
      tryCast(w, h, 'second_wind'))
  ) {
    // Paladin: Luz Restauradora; Knight: Segundo Fôlego (curam mais que o Respiro Vital para eles)
  } else if (pct < (grouped ? 0.7 : 0.6)) tryCast(w, h, 'light_heal');
  if (attackers.length >= 2 && pct < 0.7) tryCast(w, h, 'stone_skin');
  // em grupo, ferido e com criatura em cima: recua para trás dos colegas (eles pegam a criatura) em vez de apanhar até o fim
  if (grouped && attackers.length && pct < 0.55 && h.character.vocation !== 'knight')
    kiteToAlly(w, h, attackers);
  if (
    pct < 0.5 &&
    attackers.length >= 2 &&
    isRanged(h.character.vocation) &&
    h.character.mana > h.stats.maxMana * 0.6 &&
    !h.buffs.some((b) => b.kind === 'manaShield')
  )
    tryCast(w, h, 'mana_shield');
  if (attackers.length >= 2 && pct < 0.75) tryCast(w, h, 'iron_roar');
  // mana baixa no meio da luta: bebe poção de mana para não ficar inútil (magias são o principal dano)
  const manaPct = h.character.mana / Math.max(1, h.stats.maxMana);
  if (manaPct < (isRanged(h.character.vocation) ? (shielded ? 0.6 : 0.4) : 0.35)) {
    // mana no fim (ou com o Escudo de Mana segurando a vida) é emergência; fora disso, o tempo de reação dele
    if (manaPct < 0.15 || shielded || reacted(w, h, 'mana')) {
      const idx = pickManaPotion(w, h);
      if (idx >= 0) drinkMana(w, h, idx);
      delete h.brain.human.noticed.mana;
    }
  } else delete h.brain.human.noticed.mana;
  // foge ainda com vida: luta perdida (a régua diz que não dá), cercado de criaturas ou sem poção e metade da vida
  const noPotions = potionsOf(w, h) === 0;
  // com o Escudo de Mana a vida só cai quando a mana acaba: o perigo aparece na mana, não na vida
  const shieldLow = shielded && h.character.mana < h.stats.maxMana * 0.75;
  // só foge quando a régua diz que perde MESMO com as poções e a vida já caiu; a coragem aprendida adia a decisão
  const fleeMargin = 0.75 + (0.5 - t.bravery) * 0.3 - h.brain.bold * 0.25 + persona.flee;
  const outmatched = !!a && a.mons.length > 0 && a.margin < fleeMargin && (pct < 0.65 || shieldLow);
  // cercado só pesa quando a luta não é folgada (com a régua em dia e poções, é só bater e beber)
  // (o Knight gosta do cerco: só conta para ele quando quer mesmo sair — morrendo, sem poções ou perdendo)
  const swarmed =
    attackers.length >= 4 && pct < 0.7 && a.margin < 1.5 && (h.character.vocation !== 'knight' || wantsBreakout(w, h));
  // "trem" de criaturas atrás dele e a luta não é segura: sai antes de a vida (ou o escudo) começar a cair
  // (já cercado — 2+ encostadas — e com vida e poções, correr só entrega as costas: as criaturas contornam e alcançam)
  const pinned =
    attackers.filter((m) => chebyshev(m, h) <= 1).length >= 2 && pct > 0.6 && potionsOf(w, h) >= 4;
  const train =
    !!a &&
    !pinned &&
    a.mons.filter((m) => m.targetId === h.id).length >= 3 &&
    a.margin < fleeMargin + 0.35 - h.brain.bold * 0.1;
  // poções no fim: foge cedo, enquanto ainda dá tempo (sem dinheiro para repor ele só caça o que é folgado, ver needMargin)
  const dry =
    attackers.length > 0 &&
    ((noPotions && pct < 0.6 && a.margin < 3) ||
      (potionsOf(w, h) <= LOW_POTIONS && pct < 0.45 && a.margin < 3) ||
      (noPotions && pct < 0.35));
  // pouca vida e poucas (ou nenhuma) poções: vai se recuperar — MESMO em grupo (a régua conta os colegas e, com eles
  // por perto, nunca mandava fugir; o herói ficava até morrer). Só fica quem ainda se cura sozinho com magia.
  const selfHeal =
    (h.character.vocation === 'druid' && h.character.mana >= 160) ||
    (h.character.vocation === 'sorcerer' && h.character.mana >= 120);
  const recover = pct < 0.4 && potionsOf(w, h) <= LOW_POTIONS && !selfHeal;
  if (
    (outmatched || swarmed || train || dry || recover || (pct < 0.32 - t.bravery * 0.12 && noPotions)) &&
    h.brain.mode !== 'retreat' &&
    !isPz(w.map, h.x, h.y)
  ) {
    heroSay(w, h, 'retreat', {}, 20000);
    h.brain.bold = Math.max(-1, h.brain.bold - 0.12); // fugiu: da próxima vez pensa duas vezes
    h.brain.retreatWhy = `${recover ? 'recuperar ' : ''}${outmatched ? 'régua ' : ''}${swarmed ? 'cercado ' : ''}${train ? 'trem ' : ''}${dry ? 'seco ' : ''}margem=${a.margin.toFixed(2)} vida=${Math.round(pct * 100)}% pots=${potionsOf(w, h)} alvos=${a.mons.map((m) => m.def.id).join('+')}`;
    // aprendeu: foge de novo da mesma área? não — evita a caça atual e o que o cercou por alguns minutos
    if (outmatched || swarmed || train) {
      for (const m of a.mons)
        if (m.targetId === h.id)
          h.brain.avoid[m.def.id] = Math.max(h.brain.avoid[m.def.id] ?? 0, w.now + 6 * 60000);
      if (h.brain.quarry)
        h.brain.avoid[h.brain.quarry] = Math.max(h.brain.avoid[h.brain.quarry] ?? 0, w.now + 6 * 60000);
    }
    setMode(w, h, 'retreat');
  }
}

/** Um passo para o lado dos colegas, longe de quem bate nele (a criatura vem atrás e encontra o tanque). */
function kiteToAlly(w: World, h: HeroEntity, attackers: MonsterEntity[]): void {
  if (isMoving(h, w.now) || h.path?.length) return;
  const foe = [...attackers].sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0]!;
  const allies = partyMembers(w, h)
    .map((id) => actorById(w, id))
    .filter((a): a is PlayerEntity => !!a && a.id !== h.id && !a.dead && chebyshev(a, h) <= 10)
    .sort(
      (a, c) =>
        (c.character.vocation === 'knight' ? 1 : 0) - (a.character.vocation === 'knight' ? 1 : 0) ||
        chebyshev(a, h) - chebyshev(c, h),
    );
  const ally = allies[0];
  if (!ally || chebyshev(ally, h) <= 1) return;
  keepHaste(w, h);
  let best: { dx: number; dy: number; score: number } | null = null;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const n = { x: h.x + dx, y: h.y + dy };
      if (!canEnter(w, n.x, n.y, false, h.id) || isPz(w.map, n.x, n.y)) continue;
      const score = chebyshev(n, foe) * 2 - chebyshev(n, ally);
      if (!best || score > best.score) best = { dx, dy, score };
    }
  if (best) tryStep(w, h, best.dx, best.dy, actorSpeed(w, h), false);
}

/** Índice da poção de vida na mochila que melhor compensa a vida que falta (-1 se não houver). */
function pickPotion(w: World, h: HeroEntity, panic = false): number {
  const missing = h.stats.maxHealth - h.character.health;
  const owned = h.character.inventory
    .map((st, i) => ({
      i,
      heal: st ? (drinkable(w, h, st.itemId)?.heal ?? 0) : 0,
      mana: st ? w.data.items[st.itemId]?.use?.mana : 0,
    }))
    .filter((p) => p.heal > 0 && !p.mana)
    .sort((a, b) => a.heal - b.heal);
  if (panic) return owned[owned.length - 1]?.i ?? -1; // em apuros: a maior, cada segundo conta
  return (owned.find((p) => p.heal >= missing * 0.8) ?? owned[owned.length - 1])?.i ?? -1;
}

/** Índice da poção de mana na mochila que melhor compensa a mana que falta (-1 se não houver). */
function pickManaPotion(w: World, h: HeroEntity): number {
  const missing = h.stats.maxMana - h.character.mana;
  const owned = h.character.inventory
    .map((st, i) => ({
      i,
      mana: st ? (drinkable(w, h, st.itemId)?.mana ?? 0) : 0,
      heal: st ? (w.data.items[st.itemId]?.use?.heal ?? 0) : 0,
    }))
    .filter((p) => p.mana > 0 && !p.heal)
    .sort((a, b) => a.mana - b.mana);
  return (owned.find((p) => p.mana >= missing * 0.8) ?? owned[owned.length - 1])?.i ?? -1;
}

function tryCast(w: World, h: HeroEntity, spellId: string): boolean {
  const spell = w.data.spells[spellId];
  if (!spell || !spell.vocations.includes(h.character.vocation)) return false;
  // graus II/III: a cura sai sempre no maior grau liberado; o ataque, no maior só com mana sobrando (eles gastam mais
  // mana por ponto de dano — com a mana curta o I rende mais)
  const tiers = spellTiers(w.data.spells, spellId);
  if (tiers.length > 1) {
    const rich = h.character.mana >= h.stats.maxMana * 0.45;
    for (const id of [...tiers].reverse()) {
      const t = w.data.spells[id]!;
      if ((t.tier ?? 1) > 1 && t.effect === 'damage' && !rich) continue;
      if (t.vocations.includes(h.character.vocation) && castCheck(w, t).ok) return castSpell(w, id);
    }
    return false;
  }
  if (!castCheck(w, spell).ok) return false;
  return castSpell(w, spellId);
}

// ------------------------------------------------------------------ decisões
/** Vale a viagem à vila? Só com motivo de verdade (mochila cheia, loot que compensa, poções acabando
 * com ouro para repor de uma vez, upgrade ao alcance) — viagens curtas e frequentes matam a caça. */
function needsTown(w: World, h: HeroEntity): boolean {
  const why = townReason(w, h);
  if (why) h.brain.townWhy = why;
  return !!why;
}

function townReason(w: World, h: HeroEntity): string | null {
  if (isPzLocked(w, h.id)) return null; // com PZ lock não entra em lojas/templo
  const t = h.hero.temperament;
  const c = h.character;
  if (freeSlots(c.inventory) < 2) return 'mochila cheia';
  // acabou de voltar da vila: só a mochila cheia justifica outra viagem (evita o vai e volta)
  if (w.now < h.brain.nextTownAt) return null;
  // perdeu a arma numa morte e já tem ouro (bolsa, banco ou loot) para uma: é a primeira coisa a resolver — antes ele
  // ficava horas caçando desarmado, morrendo de novo e perdendo o ouro junto (sem arma, o mago quase não dá dano)
  if (unarmed(h) && bestUpgrade(w, h, c.gold + c.bankGold + lootValue(w, h) - 5, 'mainHand')) return 'sem arma';
  if (lootValue(w, h) >= (250 + t.greed * 600 + c.level * 60) * 1.6 * personaOf(t).lootTrip) return 'loot';
  const potions = potionsOf(w, h);
  const price = potionPrice(w);
  const spendable = c.gold + lootValue(w, h) + c.bankGold;
  const minPotions = 1 + Math.round(t.caution * 4) + (atWar(w) ? 3 : 0);
  // guerra: sem estoque para brigar (cura e mana) ele vira presa — repõe antes de sair
  if (atWar(w) && !warStocked(w, h) && spendable >= price * 10) return 'estoque para a guerra';
  // repõe só quando dá para comprar um bom estoque (senão volta à vila a cada 2 minutos)
  if (potions === 0 && spendable >= price * 5) return 'sem poção';
  if (potions < minPotions && spendable >= price * 12) return 'poucas poções';
  // mana acabando (e dinheiro para repor)
  // (só vale a viagem com ouro para um reforço de verdade: ida e volta custam mais que comprar duas poções)
  if (
    manaGoal(w, h) &&
    manaStock(w, h) < manaGoal(w, h) * 0.3 &&
    spendable >= Math.max(45 * 6, manaRestockCost(w, h) * 0.5)
  )
    return 'mana';
  // estoque de cura abaixo de ~1,5 vidas cheias (ou de ~5 min do consumo real) e dinheiro para um bom reforço
  if (
    potionHeal(w, h) < Math.max(h.stats.maxHealth * 1.5, healGoal(h, w.now) * 0.3) &&
    spendable >= price * 8
  )
    return 'cura';
  if (w.now < h.brain.nextUpgradeTripAt) return null;
  const room = c.gold + c.bankGold - keepGold(w, h) - 40;
  if (goalOffer(w, h, room)) return 'meta de equipamento';
  const up = nextUpgrade(w, h, room);
  return up ? 'upgrade' : null;
}

/** O ator está na cidade (área protegida ou rua da vila)? */
function inTown(w: World, a: { x: number; y: number }): boolean {
  return isPz(w.map, a.x, a.y) || !!w.map.city[a.y * w.map.width + a.x];
}

/** Há o que resolver numa passada pela vila (loot para vender, ouro para guardar, poções ou itens para comprar)? */
function townErrands(w: World, h: HeroEntity): boolean {
  const c = h.character;
  if (w.now < h.brain.nextTownAt) return false;
  const spendable = c.gold + c.bankGold + lootValue(w, h);
  if (lootValue(w, h) >= 40 || c.gold - keepGold(w, h) > 80) return true;
  if (potionHeal(w, h) < healGoal(h, w.now) * 0.8 && spendable >= potionPrice(w) * 4) return true;
  if (manaGoal(w, h) && manaStock(w, h) < manaGoal(w, h) * 0.8 && spendable >= 270) return true;
  return !!bestUpgrade(w, h, c.gold + c.bankGold - keepGold(w, h) - 40);
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
  updateGoal(w, h);
  // morreu e perdeu tudo: volta ao local da morte para pegar o saco (o que caiu fica no chão para qualquer um)
  const grave = [...w.lootBags.values()].find((l) => l.ownerId === h.id);
  // o saco de morte tem as poções, o ouro e (caveira vermelha) a arma: se dá para pegar, vai buscar ANTES de comprar tudo de novo
  if (maybeRecoverGrave(w, h, true)) return;
  if (b.prepare && !isPzLocked(w, h.id) && isPz(w.map, h.x, h.y)) {
    // voltou da morte/fuga: cura, saca, repõe as poções e só então decide o resto
    return planTown(w, h, undefined, 'decide', true);
  }
  if (!grave) b.recoverTries = 0;
  if (waitOutLock(w, h)) return;
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
  const untried = Object.entries(huntLevels(w)).some(
    ([id, lv]) => !h.brain.areaStats[id] && lv <= c.level + 1,
  );
  // guerra: ir caçar um inimigo que o seu lado vence com folga (mais vontade em quem é corajoso ou lidera um grupo)
  const raidFoe =
    atWar(w) && w.now >= (b.nextRaidAt ?? 0) && hpPct(h) > 0.8 && !warRecovering(w, h) && warChooser(w, h)
      ? pickRaidTarget(w, h)
      : null;
  const leads = partyOf(w, h.id)?.leaderId === h.id;
  // cada opção recebe uma nota; a escolha é sorteada com peso (quase sempre a melhor, às vezes improvisa)
  const options: [string, number][] = [
    ['hunt', 0.75 + h.brain.mood * 0.1],
    ['explore', untried ? 0.12 + t.bravery * 0.15 : 0],
    // sem dinheiro para repor as poções: treinar a skill na arma de treino rende mais do que caçar seco
    [
      'train',
      skillLag && canTrain && ROLES[c.vocation].trains
        ? t.discipline * 0.45 + (potionsOf(w, h) <= LOW_POTIONS && !canResupply(w, h) ? 0.5 : 0)
        : 0,
    ],
    ['social', t.sociability * 0.03 + (humanNear ? 0.04 : 0)], // pouco tempo de praça: a caça é o que rende
    ['invite', canInviteHuman(w, h) ? t.sociability * 0.5 + affinityOf(h, human.id) * 0.4 : 0],
    ['raid', raidFoe ? 0.35 + t.bravery * 0.35 + (leads ? 0.25 : 0) + b.mood * 0.1 - t.caution * 0.2 : 0],
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
      if (countItem(c.inventory, TRAINING_WEAPON) === 0)
        return planTown(
          w,
          h,
          [{ kind: 'shop', npcId: npcByShop(w, 'equipment')?.id ?? '', trainingWeapon: true }],
          'train',
        );
      return startTraining(w, h);
    case 'social':
      return setMode(w, h, 'social', 5000 + w.rng.next() * 5000);
    case 'invite':
      inviteHuman(w, h);
      return startHunt(w, h);
    case 'raid':
      return startRaid(w, h, raidFoe!);
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
  // estimativa pela régua (quanto leva para matar cada uma); o que ele viveu lá pesa mais depois de uns minutos
  let prior = def ? xpPerMinute(w, h, id) : 10;
  // áreas longe da vila gastam tempo de viagem e de volta
  const sp = w.map.spawns
    .filter((s) => s.monsterId === id)
    .sort((a, b) => chebyshev(a, h) - chebyshev(b, h))[0];
  // (com as Terras do Sul o mapa ficou bem mais fundo: a viagem pesa mais — fugir de longe sem poção mata)
  if (sp) prior /= 1 + chebyshev(sp, h) / 250;
  if (!st || st.ms < 90000) return prior;
  const learned = (st.xp / st.ms) * 60000;
  return learned * 0.7 + prior * 0.3;
}

interface QuarryScore {
  id: string;
  level: number;
  margin: number;
  rate: number;
  safety: number;
  score: number;
}

/**
 * Custo-benefício de cada caça possível: XP por minuto (com o dano do grupo matando mais rápido e a XP dividida) vezes
 * a segurança (margem da régua contra 3 da presa, com os colegas por perto). Vizinhos perigosos, morte recente lá e
 * viagem longa descontam. Nada de cortar tudo e cair na caça mais fraca: sem opção "segura", fica com a menos arriscada
 * que ainda rende.
 */
function scoreQuarries(w: World, h: HeroEntity, explore = false): QuarryScore[] {
  const t = h.hero.temperament;
  // sem poções escolhe uma caça mais tranquila (sem precisar voltar à vila)
  h.brain.frugal = potionHeal(w, h) < h.stats.maxHealth * 1.5;
  const lvl =
    h.character.level +
    (t.bravery - 0.5) * 3 +
    h.brain.mood -
    (potionsOf(w, h) === 0 ? 4 : h.brain.frugal ? 3 : 0) +
    alliesNear(w, h) * 2;
  const need = needMargin(w, h);
  // quantas da presa ele puxa de uma vez: sozinho 2-3 (o corajoso puxa mais); em grupo, mais uma por colega
  const pull = Math.min(6, Math.round(2 + t.bravery + alliesNear(w, h)));
  const out: QuarryScore[] = [];
  for (const [id, min] of Object.entries(huntLevels(w))) {
    if (min > lvl + 4 || (h.brain.avoid[id] ?? 0) > w.now) continue;
    const spawns = w.map.spawns.filter((s) => s.monsterId === id);
    if (!spawns.length) continue;
    // em grupo, a régua vale para o membro mais frágil (o mago não pode morrer para o Knight upar)
    let margin = fightMargin(w, h, protoMonsters(w, id, pull));
    for (const a of alliesAround(w, h))
      if ('brain' in a)
        margin = Math.min(margin, fightMargin(w, a as HeroEntity, protoMonsters(w, id, pull)));
    // segurança: 0 abaixo da margem de risco, sobe até 1 na margem exigida pelo temperamento
    let safety = Math.max(
      0,
      Math.min(1, (margin - RISKY_MARGIN * 0.9) / Math.max(0.2, need - RISKY_MARGIN * 0.9)),
    );
    // espécies que dividem a região (até 12 tiles de um ponto de surgimento): uma perigosa sozinha estraga a área
    for (const sp of w.map.spawns)
      if (
        sp.monsterId !== id &&
        spawns.some((q) => chebyshev(q, sp) <= 12) &&
        fightMargin(w, h, protoMonsters(w, sp.monsterId, 1)) < RISKY_MARGIN + 0.3
      ) {
        safety *= 0.25;
        break;
      }
    const st = h.brain.areaStats[id];
    let rate = expectedRate(w, h, id);
    // poucos pontos de surgimento: a área esvazia e ele fica esperando a criatura renascer
    if (spawns.length < 3) rate *= 0.6 + spawns.length * 0.13;
    if (st && w.now - st.lastDeathAt < 15 * 60000) safety *= 0.3; // morreu lá há pouco
    // memória longa: cada morte lá pesa, e o peso some aos poucos (meia-vida de ~40 min)
    if (st?.deaths) safety /= 1 + st.deaths * 0.25 * Math.exp(-(w.now - st.lastDeathAt) / (40 * 60000));
    let score = rate * safety ** 1.5 * warSpotFactor(w, h, spawns);
    // a caça que mais rendeu de verdade (já conhecida, sem morte recente) ganha um empurrão: ele volta para ela
    if (st && st.ms > 5 * 60000 && id === favoriteHunt(h) && w.now - st.lastDeathAt > 30 * 60000)
      score *= 1.15;
    if (explore && !st) score *= 2.5; // vontade de conhecer uma área nova
    out.push({ id, level: min, margin, rate, safety, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** A caça (já vivida por pelo menos 5 min) que mais rendeu XP por minuto. */
function favoriteHunt(h: HeroEntity): string | null {
  let best: { id: string; rate: number } | null = null;
  for (const [id, st] of Object.entries(h.brain.areaStats)) {
    if (st.ms < 5 * 60000) continue;
    const rate = st.xp / st.ms;
    if (!best || rate > best.rate) best = { id, rate };
  }
  return best?.id ?? null;
}

/** Resumo das melhores caças (ferramentas de diagnóstico). */
export function huntChoiceDebug(w: World, h: HeroEntity): string {
  return scoreQuarries(w, h)
    .slice(0, 6)
    .map((q) => `${q.id}(n${q.level} m${q.margin.toFixed(2)} xp${q.rate.toFixed(0)} s${q.safety.toFixed(2)})`)
    .join(' > ');
}

function chooseQuarry(w: World, h: HeroEntity, explore = false): string {
  const scored = scoreQuarries(w, h, explore).filter((o) => o.score > 0);
  if (!scored.length) {
    // nada aprovado pela régua: a caça com a maior margem (a mais tranquila) que exista
    const calm = scoreQuarries(w, h, explore).sort((a, b) => b.margin - a.margin)[0];
    return calm?.id ?? 'slime';
  }
  // não perde tempo com presa fraca: só entra na disputa quem rende pelo menos ~70% da melhor (ou a que quer conhecer)
  const best = scored[0]!.score;
  const worthy = scored.filter((o) => o.score >= best * 0.7 || (explore && !h.brain.areaStats[o.id]));
  // escolha ponderada: geralmente a melhor, mas às vezes improvisa
  const total = worthy.reduce((s2, o) => s2 + o.score * o.score, 0);
  let roll = w.rng.next() * total;
  for (const o of worthy) {
    roll -= o.score * o.score;
    if (roll <= 0) return o.id;
  }
  return worthy[0]!.id;
}

function startHunt(w: World, h: HeroEntity, quarry = chooseQuarry(w, h)): void {
  const spawns = w.map.spawns.filter((s) => s.monsterId === quarry);
  const spawn = bestSpawn(w, h, quarry) ?? spawns[w.rng.int(0, spawns.length - 1)];
  h.brain.quarry = quarry;
  h.brain.noTargetSince = 0;
  h.brain.spot = spawn ? { x: spawn.x, y: spawn.y } : null;
  setMode(w, h, 'hunt', (10 + w.rng.next() * 8) * 60000);
  const def = w.data.monsters[quarry];
  const region = spawn
    ? w.map.regions
        .filter((r) => spawn.x >= r.x && spawn.x < r.x + r.w && spawn.y >= r.y && spawn.y < r.y + r.h)
        .sort((a, b) => b.priority - a.priority)[0]
    : undefined;
  heroSay(w, h, 'hunt', { monster: def?.name ?? quarry, area: region?.name ?? 'a caça' }, 4 * 60000);
}

function hunt(w: World, h: HeroEntity, training: boolean, assisting = false): void {
  const b = h.brain;
  if (!training && b.mode === 'hunt' && (needsTown(w, h) || (b.modeUntil && w.now > b.modeUntil))) {
    heroSay(w, h, 'town', {}, 4 * 60000);
    return planTown(w, h);
  }
  if (!training && b.mode === 'hunt') {
    if (maybeRecoverGrave(w, h)) return;
    // poções no fim e dinheiro para repor: avisa, corre à vila vender o loot, compra e volta (não fica lá até morrer)
    if (lowOnPotions(w, h)) {
      b.nextSupplyAt = w.now + 90000;
      heroSay(w, h, 'lowPotions', { potions: potionsOf(w, h) }, 0);
      keepHaste(w, h);
      if (engagedByMonsters(w, h) && !isPz(w.map, h.x, h.y)) return setMode(w, h, 'retreat');
      return planTown(w, h);
    }
    // previsão: no ritmo dos últimos minutos o estoque acaba antes de dar tempo de chegar à vila? volta já
    if (suppliesRunningOut(w, h) && !engagedByMonsters(w, h)) {
      b.nextSupplyAt = w.now + 90000;
      b.townWhy = 'previsão de estoque';
      heroSay(w, h, 'supplyRun', {}, 0);
      return planTown(w, h);
    }
  }
  helpHuman(w, h);
  supportParty(w, h);
  // tanque em grupo: segura as criaturas que foram para cima dos colegas (fica entre elas e os frágeis)
  if (h.character.vocation === 'knight' && partyOf(w, h.id) && !training && baitMonsters(w, h)) {
    const t = currentTarget(w);
    if (!t || chebyshev(t, h) > 1) return;
  }
  const target = currentTarget(w);
  const hm = b.human;
  if (target) hm.lastTarget = target.id;
  else if (hm.lastTarget) {
    // o alvo caiu: como gente, olha a tela (o loot, a próxima criatura) antes de puxar outra
    hm.lastTarget = null;
    hm.lookUntil = w.now + profileOf(h).reactionMs * (1.2 + w.rng.next() * 1.6);
  }
  if (target) {
    // alvo fora do alcance: persegue com Corrida ativa (renovando sempre que possível)
    if (chebyshev(target, h) > Math.max(1, h.stats.weapon.range)) keepHaste(w, h);
    // golpes especiais quando vale a pena
    const adjacent = [...w.monsters.values()].filter((m) => m.alive && chebyshev(m, h) <= 1);
    if (!training || assisting) {
      if (castsNow(w, h, adjacent.length)) fightSpells(w, h, target, adjacent.length);
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
  // (olhando a tela depois da última: só não espera se uma criatura já estiver batendo nele)
  if (w.now < hm.lookUntil && !engagedByMonsters(w, h)) return;
  // modo lurar do grupo: puxa as criaturas da tela até os colegas antes de escolher vítimas sozinho
  const lureParty = partyOf(w, h.id);
  if (
    !training &&
    lureParty?.targeting === 'lure' &&
    lureTankId(w, lureParty) === h.id &&
    lureTick(w, h, lureParty)
  )
    return;
  // próximo alvo: quem está batendo nele primeiro, depois a presa da área
  const quarry = training ? 'slime' : b.quarry;
  const candidates = [...w.monsters.values()].filter(
    (m) =>
      m.alive &&
      !isPz(w.map, m.x, m.y) &&
      chebyshev(m, h) <= 7 &&
      (m.targetId === h.id || m.def.id === quarry) &&
      hasLineOfSight(w, h, m),
  );
  // quem já está nele tem prioridade; para puxar uma criatura nova, a régua precisa aprovar o grupo todo
  // (ela e as vizinhas que se juntariam à briga) e ele precisa estar com a vida em dia
  const engaged = engagedOrJoining(w, h);
  const approve = (m: MonsterEntity) =>
    training ||
    m.targetId === h.id ||
    fightMargin(w, h, [...new Set([m, ...monstersNear(w, m, 3), ...engaged])]) >= needMargin(w, h);
  // ordem de abate: entre as que já batem nele, primeiro a que mais machuca por vida restante (some mais dano
  // que chega por segundo de luta); para puxar, a mais perto e sem vizinhas
  // em grupo: o alvo que os colegas já atacam morre primeiro (foco); atiradores batendo nele também vêm antes
  const mates = alliesAround(w, h);
  const near = candidates
    .filter(approve)
    .map((m) => ({
      m,
      score:
        chebyshev(m, h) +
        monstersNear(w, m, 3).length * 1.5 -
        (m.targetId === h.id ? 100 + (60 * monsterDps(w, h, m)) / Math.max(1, m.hp) : 0) -
        mates.filter((a) => a.targetId === m.id).length * 3 -
        (m.def.attack.kind === 'ranged' && m.targetId === h.id ? 2 : 0),
    }))
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
  // líder (ou membro) de grupo: não puxa a próxima enquanto um colega por perto está ferido ou sem mana — espera ele
  // se recompor (o time inteiro entra inteiro na próxima luta)
  if (next && !training && next.targetId !== h.id && !engaged.length && partyNeedsBreath(w, h)) return;
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
  else if (w.rng.chance(0.3))
    goTo(w, h, (b.spot ?? spot).x + w.rng.int(-3, 3), (b.spot ?? spot).y + w.rng.int(-3, 3));
}

/**
 * O alvo está fugindo do herói? Sem lentidão e se afastando (a distância cresceu desde a última olhada, já fora do
 * corpo a corpo) ou voltando para casa. Usado pelo Druid para abrir com a Rajada Glacial.
 */
function isFleeing(w: World, h: HeroEntity, t: MonsterEntity | PlayerEntity): boolean {
  const b = h.brain;
  const d = chebyshev(t, h);
  const seen = b.chaseSeen?.id === t.id ? b.chaseSeen : null;
  // distância de ONDE O ALVO ESTAVA até onde o herói está agora: o recuo do próprio herói (kiting) não conta como fuga
  const prev = seen
    ? seen.x !== undefined && seen.y !== undefined
      ? chebyshev({ x: seen.x, y: seen.y }, h)
      : seen.d
    : d;
  b.chaseSeen = { id: t.id, d, x: t.x, y: t.y };
  if (w.now < t.slowUntil) return false;
  if (t.kind === 'monster') {
    if (t.state === 'returning') return true;
    if (t.targetId === h.id) return false; // vem para cima dele: não está fugindo
  }
  return d >= 2 && d > prev;
}

/** Algum colega de grupo por perto precisa respirar (vida abaixo de 55% ou mago com menos de 25% de mana)? */
function partyNeedsBreath(w: World, h: HeroEntity): boolean {
  return alliesAround(w, h).some((a) => {
    const mage = a.character.vocation === 'sorcerer' || a.character.vocation === 'druid';
    return (
      a.character.health < a.stats.maxHealth * 0.55 || (mage && a.character.mana < a.stats.maxMana * 0.25)
    );
  });
}

/** A criatura com mais vizinhas na briga (raio `radius`) ao alcance e à vista: o melhor centro para uma magia de área. */
function bestClusterTarget(
  w: World,
  h: HeroEntity,
  range: number,
  radius = 1,
): { m: MonsterEntity; n: number } | null {
  let best: { m: MonsterEntity; n: number } | null = null;
  for (const m of w.monsters.values()) {
    if (!m.alive || isPz(w.map, m.x, m.y) || chebyshev(m, h) > range || !hasLineOfSight(w, h, m)) continue;
    const n = engagedAround(w, h, m, radius, m) + 1;
    if (!best || n > best.n) best = { m, n };
  }
  return best;
}

/**
 * Criaturas já na briga (batendo nele ou num colega) a até `radius` do ponto: o que uma magia de área acertaria sem
 * acordar o resto da caça.
 */
function engagedAround(
  w: World,
  h: HeroEntity,
  at: { x: number; y: number },
  radius: number,
  except?: MonsterEntity,
): number {
  const members = partyMembers(w, h);
  let n = 0;
  for (const m of w.monsters.values())
    if (
      m.alive &&
      m !== except &&
      m.targetId &&
      (m.targetId === h.id || members.includes(m.targetId)) &&
      chebyshev(m, at) <= radius
    )
      n++;
  return n;
}

/** Alguma criatura parada (fora da briga) a até `radius` do ponto? A magia de área a acordaria e puxaria um trem. */
function wakesIdle(w: World, at: { x: number; y: number }, radius: number): boolean {
  for (const m of w.monsters.values())
    if (
      m.alive &&
      !m.targetId &&
      m.state !== 'returning' &&
      chebyshev(m, at) <= radius &&
      !isPz(w.map, m.x, m.y)
    )
      return true;
  return false;
}

/**
 * Magias de combate de cada vocação. A de área só sai quando compensa (conta de dano por mana contra a de alvo único,
 * ver aoeWorth); quem foge leva primeiro a magia que deixa lento; o Druid em grupo guarda mana para curar.
 */
/** Ninguém aperta todo botão a cada segundo: fora de aperto, às vezes ele deixa passar uma brecha para magia. */
function castsNow(w: World, h: HeroEntity, adjacent: number): boolean {
  return hpPct(h) <= 0.6 || adjacent >= 2 || !w.rng.chance(1 - profileOf(h).apm);
}

function fightSpells(w: World, h: HeroEntity, target: MonsterEntity, adjacent: number): void {
  const voc = h.character.vocation;
  const manaPct = h.character.mana / Math.max(1, h.stats.maxMana);
  const rich = manaPct > (voc === 'knight' ? 0.4 : 0.7);
  // o Druid em grupo é a cura do time: não gasta em dano a mana que vai salvar um colega
  const reserve = voc === 'druid' && alliesNear(w, h) > 0 ? 0.15 : 0;
  // em grupo: a magia de área vai no meio do bolo de criaturas (o tanque as junta), não só no alvo atual
  if (alliesNear(w, h) > 0 && (voc === 'druid' || voc === 'paladin')) {
    const spellId = voc === 'druid' ? 'frost_burst' : 'arrow_rain';
    const single = voc === 'druid' ? 'earth_thorn' : 'holy_arrow';
    const spell = w.data.spells[spellId];
    const cl = spell && bestClusterTarget(w, h, spell.range, spell.radius ?? 1);
    if (
      spell &&
      cl &&
      cl.m.id !== target.id &&
      manaPct > 0.3 + reserve &&
      !wakesIdle(w, cl.m, spell.radius ?? 1) &&
      aoeWorth(w, h, spellId, single, cl.n, rich)
    ) {
      const keep = target.id;
      setTarget(w, cl.m.id);
      if (tryCast(w, h, spellId)) {
        setTarget(w, keep);
        return;
      }
      setTarget(w, keep);
    }
  }
  const dist = chebyshev(target, h);
  const fleeing = isFleeing(w, h, target) || target.state === 'returning';
  const slowed = w.now < target.slowUntil;
  const around = (r: number) => engagedAround(w, h, target, r, target) + 1;
  const cast = (id: string): boolean => tryCast(w, h, id);
  // golpe de misericórdia: o básico já mata (não gasta mana) ou a magia mais barata que mata
  // (o giro/área do Knight e a lentidão em quem foge continuam valendo antes)
  if (voc !== 'knight' && !fleeing) {
    const fin = smartStrike(w, h, target, SINGLE_SPELLS[voc], voc === 'paladin' ? 0.25 : 0.2 + reserve, false);
    // (com várias criaturas na briga, o "básico já mata" não impede a magia de área logo abaixo)
    if (fin === 'cast' || (fin === 'skip' && engagedAround(w, h, h, 4) <= 1)) return;
  }
  switch (voc) {
    case 'knight':
      if (
        !wakesIdle(w, h, 2) &&
        aoeWorth(w, h, 'steel_whirlwind', 'brutal_strike', engagedAround(w, h, h, 2), rich) &&
        tryCast(w, h, 'steel_whirlwind')
      )
        return;
      // quem tenta escapar (ou está quase morto e vai fugir) leva o golpe que deixa lento
      if (
        dist <= 1 &&
        !slowed &&
        (fleeing || target.hp < target.def.health * 0.3) &&
        tryCast(w, h, 'crippling_blow')
      )
        return;
      if ((engagedAround(w, h, h, 2) >= 2 || target.hp > target.def.health * 0.6) && manaPct > 0.5)
        tryCast(w, h, 'berserk');
      if (dist <= 1 && hpPct(h) > 0.5 && tryCast(w, h, 'brutal_strike')) return;
      if (dist <= 1 && manaPct > 0.6 && tryCast(w, h, 'crippling_blow')) return;
      if (adjacent >= 3 && manaPct > 0.3) tryCast(w, h, 'steel_whirlwind'); // cercado: o giro acerta todos
      return;
    case 'sorcerer':
      if (
        engagedOrJoining(w, h).length >= 3 &&
        manaPct > 0.75 &&
        !h.buffs.some((b) => b.kind === 'manaShield')
      )
        tryCast(w, h, 'mana_shield');
      if (
        manaPct > 0.3 &&
        !wakesIdle(w, h, 4) &&
        aoeWorth(w, h, 'fire_nova', 'flame_lance', engagedAround(w, h, h, 4), rich) &&
        cast('fire_nova')
      )
        return;
      if (
        manaPct > 0.35 &&
        !wakesIdle(w, target, 1) &&
        aoeWorth(w, h, 'inferno_rain', 'flame_lance', around(1), rich) &&
        cast('inferno_rain')
      )
        return;
      if (manaPct > 0.4 && cast('thunder_strike')) return;
      if (manaPct > 0.3 && cast('flame_lance')) return;
      if (manaPct > 0.2) cast('arcane_bolt');
      return;
    case 'druid':
      // alvo fugindo (ou se afastando enquanto ele persegue) e ainda sem lentidão: Rajada Glacial primeiro, para
      // deixá-lo lento; só depois as outras magias
      if (fleeing && !slowed && manaPct > 0.12 && (cast('ice_shard') || cast('frost_burst'))) return;
      if (
        engagedOrJoining(w, h).length >= 3 &&
        manaPct > 0.75 &&
        !h.buffs.some((b) => b.kind === 'manaShield')
      )
        tryCast(w, h, 'mana_shield');
      if (
        manaPct > 0.3 + reserve &&
        !wakesIdle(w, target, 2) &&
        aoeWorth(w, h, 'frost_burst', 'earth_thorn', around(2), rich) &&
        cast('frost_burst')
      )
        return;
      if (manaPct > 0.2 + reserve) cast('earth_thorn');
      return;
    case 'paladin': {
      if (dist <= 6 && manaPct > 0.4) tryCast(w, h, 'hunters_focus');
      // perto demais (corpo a corpo) ou fugindo: a flecha que deixa lento — dá tempo de recuar ou de alcançar
      if (
        ((dist <= 3 && target.def.attack.range <= 2) || (fleeing && !slowed)) &&
        manaPct > 0.2 &&
        cast('stunning_arrow')
      )
        return;
      if (
        manaPct > 0.3 &&
        !wakesIdle(w, target, 2) &&
        aoeWorth(w, h, 'arrow_rain', 'holy_arrow', around(2), rich) &&
        cast('arrow_rain')
      )
        return;
      if (
        manaPct > 0.35 &&
        !wakesIdle(w, h, 2) &&
        aoeWorth(w, h, 'sacred_fire', 'holy_arrow', engagedAround(w, h, h, 2), rich) &&
        cast('sacred_fire')
      )
        return;
      if (manaPct > 0.55 && cast('divine_shot')) return;
      if (manaPct > 0.25) cast('holy_arrow');
      return;
    }
  }
}

/**
 * Posição de quem luta de longe. Com um Knight no grupo: fica na retaguarda — atrás do tanque, longe das criaturas
 * corpo a corpo e sem perder o alvo do alcance. Sozinho: kiting — logo depois de atirar, recua um passo de quem vem
 * bater corpo a corpo, se for mais rápido que ela (ou ela estiver lenta); cercado por 3 ou mais, luta.
 */
function keepDistance(w: World, h: HeroEntity): void {
  const keep = ROLES[h.character.vocation].keepDistance;
  if (!keep || isMoving(h, w.now) || h.path?.length) return;
  const melee = [...w.monsters.values()].filter(
    (m) =>
      m.alive &&
      m.def.attack.range <= 2 &&
      chebyshev(m, h) < keep &&
      (m.targetId === h.id || chebyshev(m, h) <= 2),
  );
  if (!melee.length) return;
  const tank =
    alliesAround(w, h).find((a) => a.character.vocation === 'knight' && !a.dead && chebyshev(a, h) <= 8) ??
    null;
  const chasing = melee.filter((m) => m.targetId === h.id);
  if (!tank) {
    if (!chasing.length || chasing.length >= 3) return;
    const fastest = Math.max(...chasing.map((m) => m.def.speed * (w.now < m.slowUntil ? m.slowFactor : 1)));
    if (fastest >= speedOf(w, h) * 1.02) return; // criatura mais rápida: recuar só dá golpe de graça
    // atira primeiro e recua depois (a menos que ela já esteja encostada)
    if (w.now - h.lastAttackAt > 700 && chasing.every((m) => chebyshev(m, h) > 1)) return;
  }
  const step = backlineStep(w, h, melee, tank, currentTarget(w) ?? null, Math.max(1, h.stats.weapon.range));
  if (step) tryStep(w, h, step.dx, step.dy, speedOf(w, h), false);
}

/** Ponto de surgimento da presa com mais monstros vivos (empate: o mais perto). */
function bestSpawn(w: World, h: HeroEntity, quarry: string): { x: number; y: number } | null {
  let best: { x: number; y: number; score: number } | null = null;
  for (const sp of w.map.spawns) {
    if (sp.monsterId !== quarry) continue;
    const alive = [...w.monsters.values()].filter(
      (m) => m.alive && m.spawnId === sp.id && !m.targetId,
    ).length;
    if (!alive) continue;
    const score = alive * 10 - chebyshev(sp, h) * 0.2;
    if (!best || score > best.score) best = { x: sp.x, y: sp.y, score };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Pode vender este item? Nunca poções, arma de treino nem equipamento melhor/que vai usar em breve. */
function sellable(w: World, h: HeroEntity, itemId: string, includeDepot = false): boolean {
  const c = h.character;
  if (!(countItem(c.inventory, itemId) + (includeDepot ? countItem(c.depot, itemId) : 0)) || itemId.startsWith('training_')) return false;
  const def = w.data.items[itemId];
  // munição só é guardada por quem a usa (o Knight vende as flechas que caem dos goblins)
  if (!def || def.type === 'potion') return false;
  if (
    def.slot &&
    (def.minLevel ?? 1) > c.level &&
    (def.minLevel ?? 1) <= c.level + 3 &&
    isUsableLater(w, h, itemId)
  )
    return false;
  if (def.slot && isUpgrade(w.data, c, def)) return false;
  return true;
}

function distOf(
  w: World,
  step: TownStep,
  from: { x: number; y: number },
  anchor?: { x: number; y: number } | null,
): number {
  const n =
    step.kind === 'shop'
      ? w.npcs.get(step.npcId)
      : step.kind === 'bank'
        ? npcByAction(w, 'openDepot', step.local ? from : (anchor ?? from))
        : step.kind === 'market'
          ? npcByAction(w, 'openMarket', anchor ?? from)
          : npcByAction(w, 'heal', anchor ?? from);
  return n ? chebyshev(n, from) : 0;
}

/** Ajuda o jogador humano quando um monstro o ataca por perto (comportamento de bom companheiro). */
function helpHuman(w: World, h: HeroEntity): void {
  const human = w.human;
  if (human.dead || chebyshev(human, h) > 8 || affinityOf(h, human.id) < -0.2) return;
  const threat = [...w.monsters.values()].find(
    (m) => m.alive && m.targetId === human.id && chebyshev(m, h) <= 7,
  );
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
  // o Druid alcança o grupo a até 12 tiles com a Cura Intensa; os demais cuidam de quem está do lado
  const members = nearbyPartyMembers(w, h, h.character.vocation === 'druid' ? 10 : PARTY_SUPPORT_RANGE);
  if (members.length < 2) return;
  // triagem: quem corre mais risco (pouca vida e mais criaturas batendo nele) é atendido primeiro
  const ranked = members
    .map((m) => {
      const pct = m.character.health / Math.max(1, m.stats.maxHealth);
      const hitters = [...w.monsters.values()].filter(
        (x) => x.alive && x.targetId === m.id && chebyshev(x, m) <= 3,
      ).length;
      return { m, pct, hitters, risk: 1 - pct + hitters * 0.12 };
    })
    .sort((a, c) => c.risk - a.risk);
  const top = ranked[0]!;
  if (top.pct < 0.6 || (top.pct < 0.75 && top.hitters >= 2)) {
    if (tryCast(w, h, 'sap_blessing')) {
      if (top.m.id !== h.id) heroSay(w, h, 'healAlly', { player: top.m.character.name }, 25000);
      return;
    }
    if (top.m.id === h.id && tryCast(w, h, 'light_heal')) return;
  }
  // poção de vida para o colega em estado crítico
  if (top.m.id !== h.id && top.pct < 0.3 && potionsOf(w, h) >= 2 && w.now >= h.brain.nextGiftAt)
    giftPotionTo(w, h, top.m);
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
  const leader = groupLeader(w, h) ?? h;
  const members = nearbyPartyMembers(w, h, BAIT_RANGE);
  if (!members.length || !wellStocked(w, h)) return false;
  // monstro que está perseguindo ou atacando um colega (e não o próprio herói), perto do grupo; atiradores primeiro
  const threat = [...w.monsters.values()]
    .filter(
      (m) =>
        m.alive &&
        m.targetId &&
        m.targetId !== h.id &&
        members.some((mate) => mate.id === m.targetId) &&
        chebyshev(m, h) <= BAIT_RANGE &&
        chebyshev(m, leader) <= BAIT_LEADER_RANGE,
    )
    .sort(
      (a, c) =>
        (c.def.attack.kind === 'ranged' ? 1 : 0) - (a.def.attack.kind === 'ranged' ? 1 : 0) ||
        chebyshev(a, h) - chebyshev(c, h),
    )[0];
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

/** No modo lurar: até onde (do líder) o grupo ainda ataca o que o tanque trouxe. */
const LURE_GROUP_RANGE = 9;
/** Alcance da tela: o tanque puxa as criaturas que estão até aqui. */
const LURE_SCREEN = 9;

/**
 * Modo "lurar": o tanque puxa as criaturas paradas da tela (as que a régua diz que o grupo aguenta de uma vez) e vai
 * ao encontro do grupo, no espaço de onde os de longe (Paladin, Sorcerer, Druid) atacam também. Retorna true se agiu.
 */
function lureTick(w: World, h: HeroEntity, party: NonNullable<ReturnType<typeof partyOf>>): boolean {
  const b = h.brain;
  const mates = party.members
    .map((id) => actorById(w, id))
    .filter((a): a is PlayerEntity => !!a && !a.dead && a.id !== h.id && chebyshev(a, h) <= 14);
  // depois de puxar: volta para o meio do grupo e espera as criaturas chegarem
  if (w.now < b.lurePostUntil) {
    if (mates.length) {
      const cx = Math.round(mates.reduce((s, m) => s + m.x, 0) / mates.length);
      const cy = Math.round(mates.reduce((s, m) => s + m.y, 0) / mates.length);
      keepHaste(w, h);
      if (chebyshev({ x: cx, y: cy }, h) > 1) goTo(w, h, cx, cy, 20000, 1);
    }
    return true;
  }
  if (w.now < b.nextLureAt || hpPct(h) < 0.7 || isPz(w.map, h.x, h.y) || !wellStocked(w, h)) return false; // tanque sem poção não lura
  if (mates.some((m) => m.character.health / Math.max(1, m.stats.maxHealth) < 0.5)) return false; // time ferido: nada de puxar mais
  const members = party.members;
  // ainda tem criatura batendo no grupo: primeiro termina essa leva
  if (
    [...w.monsters.values()].some(
      (m) => m.alive && m.targetId && members.includes(m.targetId) && chebyshev(m, h) <= 14,
    )
  )
    return false;
  const idle = [...w.monsters.values()]
    .filter((m) => m.alive && !m.targetId && !isPz(w.map, m.x, m.y) && chebyshev(m, h) <= LURE_SCREEN)
    .sort((a, c) => chebyshev(a, h) - chebyshev(c, h));
  if (!idle.length) return false;
  // leva o máximo que a régua aprova (o grupo todo divide o dano): vai somando da mais perto para a mais longe
  const chosen: MonsterEntity[] = [];
  for (const m of idle) {
    const trial = [...new Set([...chosen, m, ...monstersNear(w, m, 2)])];
    if (chosen.length >= 8 || fightMargin(w, h, trial) < needMargin(w, h)) break;
    chosen.push(...trial.filter((t) => !chosen.includes(t) && !t.targetId));
  }
  b.nextLureAt = w.now + (chosen.length ? 12000 : 4000);
  if (!chosen.length) return false;
  for (const m of chosen) aggro(w, m, h.id);
  b.lurePostUntil = w.now + 5000;
  heroSay(w, h, 'lure', {}, 30000);
  return true;
}

/** Alcance em que o Knight puxa criaturas ainda paradas para o grupo. */
const LURE_RANGE = 7;

/**
 * Papel de tanque em grupo: com o time inteiro sem alvo e saudável, o Knight ataca a criatura ociosa mais
 * próxima (perto do líder) para trazê-la até o grupo — quem leva as pancadas é ele, não os colegas frágeis.
 */
function lureMonsters(w: World, h: HeroEntity, leader: PlayerEntity): boolean {
  if (h.character.vocation !== 'knight' || hpPct(h) < 0.7 || isPz(w.map, h.x, h.y) || !wellStocked(w, h))
    return false;
  if (leader.character.health / Math.max(1, leader.stats.maxHealth) < 0.5) return false; // time ferido: nada de puxar mais
  const target = [...w.monsters.values()]
    .filter(
      (m) =>
        m.alive &&
        !m.targetId &&
        !isPz(w.map, m.x, m.y) &&
        chebyshev(m, h) <= LURE_RANGE &&
        chebyshev(m, leader) <= LURE_RANGE + 1 &&
        hasLineOfSight(w, h, m),
    )
    .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0];
  if (!target) return false;
  // só puxa para o grupo o que ele segura sozinho (com os vizinhos que viriam junto)
  if (
    fightMargin(w, h, [target, ...monstersNear(w, target, 3), ...engagedOrJoining(w, h)]) < needMargin(w, h)
  )
    return false;
  setTarget(w, target.id);
  return currentTarget(w)?.id === target.id;
}

/** Alcance em que o herói puxa a atenção dos monstros dos colegas. */
const BAIT_RANGE = 8;
/** A isca não arrasta o herói para longe do grupo. */
const BAIT_LEADER_RANGE = 5;

/** Distância (tiles) em que o herói enxerga loot no chão (a tela toda). */
const LOOT_SCAN = 10;

/**
 * Este saco é dele para pegar? Nunca o item que alguém jogou no chão nem o saco de morte de outro personagem (do
 * jogador, de colega de grupo ou de outro herói): só o próprio saco — ou o de quem ele está caçando no PK.
 */
function heroMayLoot(_w: World, _h: HeroEntity, l: { ownerId?: string; dropped?: boolean }): boolean {
  // o saco de morte é de quem pegar primeiro (em qualquer modo): o dono tenta recuperar, mas todos podem levar
  return !l.dropped;
}

/** A pilha que menos vale na mochila (entre as que ele venderia): a primeira a sair para dar lugar a loot melhor. */
function cheapestStack(w: World, h: HeroEntity): { i: number; value: number } | null {
  let best: { i: number; value: number } | null = null;
  h.character.inventory.forEach((st, i) => {
    if (!st || !sellable(w, h, st.itemId)) return;
    const value = (w.data.items[st.itemId]?.value ?? 0) * st.count;
    if (!best || value < best.value) best = { i, value };
  });
  return best;
}

/** Valor da pilha mais valiosa do saco (o que vale trocar por lixo da mochila cheia). */
function bestInBag(w: World, bag: { items: readonly { itemId: string; count: number }[] }): number {
  return Math.max(0, ...bag.items.map((st) => (w.data.items[st.itemId]?.value ?? 0) * st.count));
}

/** Mochila cheia e o saco tem algo que vale bem mais que o lixo dela? (larga o lixo e pega o que vale) */
function worthSwapping(
  w: World,
  h: HeroEntity,
  bag: { items: readonly { itemId: string; count: number }[] },
): boolean {
  const cheap = cheapestStack(w, h);
  return !!cheap && bestInBag(w, bag) >= Math.max(20, cheap.value * 2);
}

/** Saco de loot mais próximo na tela, se ainda couber alguma coisa na mochila (ou se vale trocar lixo por ele). */
function nearestLoot(w: World, h: HeroEntity): { x: number; y: number } | undefined {
  if (freeSlots(h.character.inventory) <= 0)
    return [...w.lootBags.values()]
      .filter((l) => chebyshev(l, h) <= LOOT_SCAN && heroMayLoot(w, h, l) && worthSwapping(w, h, l))
      .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0];
  const scan = LOOT_SCAN + personaOf(h.hero.temperament).lootScan; // o ganancioso enxerga (e busca) mais longe
  return [...w.lootBags.values()]
    .filter((l) => chebyshev(l, h) <= scan && heroMayLoot(w, h, l))
    .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0];
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
    if (
      h.path?.length &&
      h.pathGoal &&
      [...w.lootBags.values()].some((l) => l.x === h.pathGoal!.x && l.y === h.pathGoal!.y)
    ) {
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
  const bags = [...w.lootBags.values()].filter((l) => chebyshev(l, h) <= LOOT_RANGE && heroMayLoot(w, h, l));
  if (!bags.length) return;
  // mochila cheia: larga o que vale menos se o saco tem coisa bem melhor (valor por espaço na mochila)
  if (freeSlots(h.character.inventory) <= 0) {
    const swap = bags.find((l) => worthSwapping(w, h, l));
    const cheap = swap && cheapestStack(w, h);
    if (!cheap) return;
    removeAt(h.character.inventory, cheap.i, h.character.inventory[cheap.i]!.count);
  }
  const before = new Map(
    h.character.inventory
      .filter(Boolean)
      .map((s) => [s!.itemId, countItem(h.character.inventory, s!.itemId)]),
  );
  for (const bag of nearbyLootBags(w)) if (heroMayLoot(w, h, bag)) takeLoot(w, bag.id, 'all');
  w.ui.lootId = null;
  equipBagUpgrades(w, h);
  for (const st of h.character.inventory) {
    if (!st) continue;
    const def = w.data.items[st.itemId];
    if (
      def &&
      def.value >= 300 &&
      (before.get(st.itemId) ?? 0) < countItem(h.character.inventory, st.itemId)
    ) {
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
  const gained = b.trainStart
    ? c.skills.sword.level - b.trainStart.sword + (c.skills.shielding.level - b.trainStart.shielding)
    : 0;
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
    .filter(
      (x) =>
        x.def?.weapon?.kind === 'melee' &&
        !x.def.weapon.training &&
        !x.def.twoHanded &&
        (x.def.minLevel ?? 1) <= c.level,
    )
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
    const noWeapon = unarmed(h);
    const potReserve = !noWeapon && potionHeal(w, h) < healGoal(h, w.now) * 0.6 ? price * 10 : 0;
    const budget = c.gold + earn + c.bankGold - keepGold(w, h) - 40 - potReserve;
    // sem arma (morte de caveira vermelha): a arma é a primeira compra, com o que houver, antes de poções e armaduras
    const up =
      (noWeapon && bestUpgrade(w, h, c.gold + earn + c.bankGold - 15, 'mainHand')) ||
      nextUpgrade(w, h, budget);
    const wantPotions =
      potionHeal(w, h) < healGoal(h, w.now) * 0.75 && c.gold + earn + c.bankGold >= price * 4;
    // a viagem acontece numa vila só: a da loja do upgrade que ele quer ou, sem upgrade, a mais perto de onde está
    const anchorNpc = (up && npcByShop(w, up.shopId)) || nearestShopNpc(w, h);
    const anchor = anchorNpc ? { x: anchorNpc.x, y: anchorNpc.y } : { x: h.x, y: h.y };
    h.brain.townAnchor = anchor;
    h.brain.townFrom = { x: h.x, y: h.y };
    for (const shop of Object.values(w.data.shops)) {
      const npc = npcByShop(w, shop.id);
      if (!npc || chebyshev(npc, h.brain.townAnchor ?? anchor) > 45) continue;
      const sells = shop.buys.some((o) => sellable(w, h, o.itemId));
      const wantMana =
        !!manaGoal(w, h) && manaStock(w, h) < manaGoal(w, h) * 0.6 && c.gold + earn + c.bankGold >= 45 * 4;
      const potions = (wantPotions || wantMana) && sellsPotions(w, shop);
      const upgrades = !!up && up.shopId === shop.id;
      if (sells || potions || upgrades)
        steps.push({ kind: 'shop', npcId: npc.id, buyPotions: potions, upgrades });
    }
    // caminho mais curto entre as paradas (a partir de onde está)
    let from = { x: h.x, y: h.y };
    const ordered: TownStep[] = [];
    const pending = [...steps];
    while (pending.length) {
      pending.sort((a, b2) => distOf(w, a, from, anchor) - distOf(w, b2, from, anchor));
      const next = pending.shift()!;
      ordered.push(next);
      const n = next.kind === 'shop' ? w.npcs.get(next.npcId) : undefined;
      if (n) from = { x: n.x, y: n.y };
    }
    // o alquimista primeiro: com o dinheiro na mão, as poções não perdem para o equipamento
    const rank = (s: TownStep) =>
      s.kind === 'shop' && s.upgrades && noWeapon ? 2 : s.kind === 'shop' && s.buyPotions ? 1 : 0;
    ordered.sort((a, b2) => rank(b2) - rank(a));
    steps.length = 0;
    steps.push(...ordered);
    // o mercado antes de tudo (os heróis preferem negociar lá: equipamento e poções) e, no mesmo prédio, o banco:
    // acerta a bolsa de uma vez — guarda o excedente ou saca o que as lojas vão pedir (upgrade, estoque de poções)
    const needBank = noWeapon
      ? c.gold + earn < (up?.price ?? 0) + price * 10
      : !!up && c.gold + earn - 30 < up.price;
    // com PK ligado guarda quase tudo (quem morre no PK deixa parte do ouro da bolsa no chão)
    const bankAbove = w.social.pvp ? 30 : 150 + c.level * 8 + h.hero.temperament.greed * 60;
    const market = !!npcByAction(w, 'openMarket', anchor) && marketErrands(w, h);
    const withdraw = c.bankGold > 0 && (needBank || ((wantPotions || !!manaGoal(w, h)) && c.gold + earn < price * 14));
    const bank = withdraw || c.gold + earn - keepGold(w, h) > bankAbove;
    // mercado e banco ficam no mesmo prédio: entram juntos na rota (o mercado antes do banco), antes das lojas se for
    // preciso sacar para as compras; senão na ordem do caminho mais curto. Se o prédio ficar para o fim, as lojas não
    // vendem o que vai ao mercado nem compram o upgrade mais barato lá (ver shopping).
    const bankStops: TownStep[] = [
      ...(market ? [{ kind: 'market' } as TownStep] : []),
      ...(bank ? [{ kind: 'bank', op: 'settle' } as TownStep] : []),
    ];
    if (bankStops.length) {
      const bankNpc = npcByAction(w, 'openDepot', anchor);
      const from = { x: h.x, y: h.y };
      const dBank = bankNpc ? chebyshev(bankNpc, from) : 0;
      const at = withdraw ? 0 : steps.findIndex((st) => distOf(w, st, from, anchor) > dBank);
      steps.splice(at < 0 ? steps.length : at, 0, ...bankStops);
    }
    // não volta à vila só por causa de upgrade nos próximos minutos
    h.brain.nextUpgradeTripAt = w.now + 8 * 60000;
    // ferido e sem poções: a bênção (grátis, no templo) vem primeiro
    // (a bênção só cura vida e a ida ao sacerdote custa tempo de caça: só vale com a vida bem baixa)
    if (hpPct(h) < 0.65 || (heal && hpPct(h) < 0.8)) steps.unshift({ kind: 'heal' });
    if (!steps.length) {
      h.brain.nextTownAt = w.now + 2 * 60000; // nada a resolver: não repete a ida
      if (then === 'follow') return setMode(w, h, 'follow');
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

/** Mochila ainda lotada depois da visita à vila (nada que a vila compre): joga fora o que vale menos. */
function dropJunk(w: World, h: HeroEntity): void {
  const inv = h.character.inventory;
  for (let guard = 0; guard < 6 && freeSlots(inv) < 3; guard++) {
    let worst = -1;
    let worstValue = Infinity;
    inv.forEach((st, i) => {
      if (!st || !sellable(w, h, st.itemId)) return;
      const v = (w.data.items[st.itemId]?.value ?? 0) * st.count;
      if (v < worstValue) {
        worstValue = v;
        worst = i;
      }
    });
    if (worst < 0) return;
    removeAt(inv, worst, inv[worst]!.count);
  }
}

function town(w: World, h: HeroEntity): void {
  const b = h.brain;
  // a visita inteira tem limite: resolve rápido e volta a caçar (o que faltou fica para a próxima)
  // a visita inteira tem limite (somado ao tempo da viagem, que pode cruzar o mapa)
  const trip = b.townAnchor ? chebyshev(b.townAnchor, b.townFrom ?? h) * 500 : 0;
  // (decide rápido: o que não deu para resolver em ~45 s fica para a próxima — parado na vila não sobe nível)
  if (b.town.length && w.now - b.townStartedAt > 45000 + trip) b.town.length = 0;
  const step = b.town[0];
  if (!step) {
    // área protegida não recupera mana: quem vive dela bebe poção de mana antes de sair para caçar
    if (manaGoal(w, h) && h.character.mana < h.stats.maxMana * 0.7 && w.now - b.stepStartedAt < 20000) {
      const idx = pickManaPotion(w, h);
      if (idx >= 0) {
        drinkMana(w, h, idx);
        return;
      }
    }
    b.nextTownAt = w.now + (manaGoal(w, h) ? 3 : 5) * 60000;
    b.prepare = false;
    dropJunk(w, h);
    // às vezes, como gente, fica um pouco AFK antes de voltar a caçar
    if (maybeAfk(w, h)) {
      w.ui.shop = null;
      w.ui.depot = null;
      w.ui.market = null;
      w.ui.dialog = null;
      b.after = 'decide';
      return setMode(w, h, 'decide');
    }
    w.ui.shop = null;
    w.ui.depot = null;
    w.ui.market = null;
    w.ui.dialog = null;
    const after = b.after;
    b.after = 'decide';
    if (after === 'train') return startTraining(w, h);
    if (after === 'decide') return startHunt(w, h); // terminou a vila: direto para a caça
    return setMode(w, h, 'decide');
  }
  // pequena pausa entre uma parada e outra (olhando a loja, conferindo a mochila)
  if (w.now < b.human.pauseUntil) return;
  const done = () => {
    b.human.pauseUntil = w.now + 400 + w.rng.next() * 1100;
    b.failures = 0;
    b.town.shift();
    b.stepStartedAt = w.now;
    w.ui.shop = null;
    w.ui.depot = null;
    w.ui.market = null;
    w.ui.dialog = null;
  };
  // cada etapa tem um limite de tempo (caminho bloqueado, NPC ocupado...)
  if (w.now - b.stepStartedAt > 18000 + (b.stepStartedAt === b.townStartedAt ? trip : 0)) return done();
  const npc =
    step.kind === 'shop'
      ? w.npcs.get(step.npcId)
      : step.kind === 'bank'
        ? npcByAction(w, 'openDepot', step.local ? h : (b.townAnchor ?? h))
        : step.kind === 'market'
          ? npcByAction(w, 'openMarket', b.townAnchor ?? h)
          : npcByAction(w, 'heal', b.townAnchor ?? h);
  if (!npc) return done();
  const action =
    step.kind === 'shop' ? 'openShop' : step.kind === 'bank' ? 'openDepot' : step.kind === 'market' ? 'openMarket' : 'heal';
  // 1) chegar e abrir o diálogo; 2) escolher a opção; 3) negociar
  const opened =
    step.kind === 'shop'
      ? w.ui.shop?.npcId === npc.id
      : step.kind === 'bank'
        ? w.ui.depot?.npcId === npc.id
        : step.kind === 'market'
          ? w.ui.market?.npcId === npc.id
          : false;
  if (!opened) {
    if (w.ui.dialog?.npcId === npc.id) {
      const idx =
        npc.def.dialog
          .find((p) => p.id === w.ui.dialog!.pageId)
          ?.options.findIndex((o) => o.action === action) ?? -1;
      if (idx < 0) return done();
      chooseDialogOption(w, idx);
      if (step.kind === 'heal') return done();
      return;
    }
    if (!w.ui.pending && !isMoving(h, w.now) && !h.path?.length) {
      // longe (ex.: voltando das ruínas): primeiro atravessa o mapa até a frente do NPC
      if (chebyshev(npc, h) > 10) return goTo(w, h, npc.x, npc.y + 2, 150000);
      interactWith(w, { kind: 'npc', id: npc.id });
      // sem caminho até o NPC: desiste desta etapa depois de algumas tentativas
      if (!w.ui.pending && !w.ui.dialog && ++b.failures >= 2) return done();
    }
    return;
  }
  if (step.kind === 'shop') shopping(w, h, step);
  else if (step.kind === 'bank') banking(w, h, step.op, step.amount);
  else if (step.kind === 'market') marketing(w, h);
  done();
}

function shopping(w: World, h: HeroEntity, step: Extract<TownStep, { kind: 'shop' }>): void {
  const c = h.character;
  const shop = w.data.shops[w.ui.shop!.shopId]!;
  // vende o loot (nunca poções nem a arma de treino) — o que outra loja desta viagem paga mais fica para ela
  const later = h.brain.town
    .slice(1)
    .flatMap((st) => (st.kind === 'shop' ? [w.data.shops[w.npcs.get(st.npcId)?.def.shopId ?? '']] : []))
    .filter((x): x is NonNullable<typeof x> => !!x);
  let earned = 0;
  const marketAhead = h.brain.town.slice(1).some((st) => st.kind === 'market');
  for (const o of shop.buys) {
    const n = countItem(c.inventory, o.itemId);
    if (!n || !sellable(w, h, o.itemId)) continue;
    if (marketAhead && worthMarket(w, h, o.itemId)) continue; // vai ser anunciado no mercado
    if (later.some((sh) => (sh.buys.find((b2) => b2.itemId === o.itemId)?.price ?? 0) > o.price)) continue;
    const before = c.gold;
    if (sellItem(w, o.itemId, n)) earned += c.gold - before;
  }
  if (earned > 0 && w.rng.chance(0.35)) heroSay(w, h, 'sell', { gold: earned }, 5 * 60000);
  if (step.trainingWeapon && countItem(c.inventory, TRAINING_WEAPON) === 0) buyItem(w, TRAINING_WEAPON, 1);
  // sem arma: a arma vem antes das poções (com o ouro do banco, se precisar)
  if (unarmed(h)) {
    const need = bestUpgrade(w, h, c.gold + c.bankGold - 5, 'mainHand');
    const here = need && shop.sells.some((o) => o.itemId === need.itemId);
    if (need && here && buyItem(w, need.itemId, 1)) {
      const idx = c.inventory.findIndex((st) => st?.itemId === need.itemId);
      if (idx >= 0 && equipItem(w, idx)) heroSay(w, h, 'upgrade', { item: w.data.items[need.itemId]!.name }, 0);
    }
  }
  if (step.buyPotions) {
    // mana primeiro para os magos (é o dano deles); os demais gastam menos nisso
    const manaOffers = potionOffers(w, shop, 'mana', h);
    const manaOffer = pickPotionOffer(w, manaOffers, h.stats.maxMana * 0.5);
    if (manaOffer && manaGoal(w, h)) {
      const per = w.data.items[manaOffer.itemId]?.use?.mana ?? 60;
      const share = isRanged(h.character.vocation) && h.character.vocation !== 'paladin' ? 0.7 : 0.2;
      // o que falta em poções do tamanho dele (as pequenas que sobraram serão vendidas)
      const qty = Math.min(
        Math.ceil((manaGoal(w, h) - goodStock(w, h, 'mana', per)) / per),
        Math.floor((c.gold * share) / manaOffer.price),
        40,
      );
      if (qty > 0 && buyItem(w, manaOffer.itemId, qty)) heroSay(w, h, 'buy', {}, 5 * 60000);
    }
    const healOffers = potionOffers(w, shop, 'heal', h);
    const basic = healOffers[0]; // a mais barata: tapa-buraco
    // a do nível dele: a mais forte que ainda cura "pouco por vez" (sem desperdiçar a cura com a vida quase cheia)
    const great = pickPotionOffer(w, healOffers, h.stats.maxHealth * 0.7);
    if (basic) {
      let missing = healGoal(h, w.now) - potionHeal(w, h);
      // sobra pouco para um upgrade já planejado; o estoque de cura vem primeiro
      const reserve = bestUpgrade(w, h, c.gold + c.bankGold - keepGold(w, h) - 40)
        ? Math.min(c.gold * 0.25, 200)
        : 10;
      let budget = Math.min(
        c.gold - reserve,
        Math.max(Math.min(3, Math.floor(c.gold / basic.price)) * basic.price, c.gold * 0.85),
      );
      let bought = false;
      // a poção do nível dele primeiro (cura bem mais por gole); a pequena só completa o estoque
      const greatHeal = great ? (w.data.items[great.itemId]?.use?.heal ?? 160) : 0;
      // (conta só o estoque das poções do tamanho dele: com ouro, troca as pequenas pelas do nível)
      const missingGood = healGoal(h, w.now) - goodStock(w, h, 'heal', greatHeal);
      if (great && great.itemId !== basic.itemId && h.stats.maxHealth >= 180 && missingGood > 0) {
        const qty = Math.min(
          Math.floor((missingGood * 0.85) / greatHeal),
          Math.floor((budget * 0.75) / great.price),
        );
        if (qty > 0 && buyItem(w, great.itemId, qty)) {
          missing -= qty * greatHeal;
          budget -= qty * great.price;
          bought = true;
        }
      }
      const qty = Math.min(
        Math.ceil(missing / (w.data.items[basic.itemId]?.use?.heal ?? 70)),
        Math.floor(budget / basic.price),
        40,
      );
      if (qty > 0 && buyItem(w, basic.itemId, qty)) bought = true;
      if (bought) heroSay(w, h, 'buy', {}, 5 * 60000);
    }
    sellSmallPotions(w, h, shop);
  }
  if (step.upgrades) {
    for (let i = 0; i < 3; i++) {
      // sem arma: compra a melhor que o bolso paga, sem reservar nada para poções
      const reserve = unarmed(h) ? 0 : potionHeal(w, h) < healGoal(h, w.now) * 0.5 ? potionPrice(w) * 8 : 0;
      const goal = goalOffer(w, h, c.gold - 30 - reserve);
      const up =
        (unarmed(h) && bestUpgrade(w, h, c.gold - 5, 'mainHand')) || nextUpgrade(w, h, c.gold - 30 - reserve);
      if (!up || up.shopId !== shop.id) break;
      // mais barato no mercado (e o mercado ainda está na rota): compra lá
      const ask = offersFor(w.market, up.itemId, 'sell', c.id)[0];
      if (marketAhead && ask && ask.price <= up.price) break;
      if (!buyItem(w, up.itemId, 1)) break;
      const idx = c.inventory.findIndex((s) => s?.itemId === up.itemId);
      if (idx >= 0 && equipItem(w, idx)) {
        h.brain.mood = Math.min(1, h.brain.mood + 0.3);
        heroSay(w, h, 'upgrade', { item: w.data.items[up.itemId]!.name }, 0);
      }
      if (goal && up.itemId === goal.itemId) {
        // meta cumprida: escolhe a próxima na próxima decisão
        h.brain.goal = null;
        h.brain.nextGoalAt = 0;
      }
      if (savingForGoal(h)) break; // juntando para a meta: no máximo uma compra pequena por viagem
    }
  }
}

function isUsableLater(w: World, h: HeroEntity, itemId: string): boolean {
  const def = w.data.items[itemId];
  return !!def && (!def.vocations || def.vocations.includes(h.character.vocation));
}

function banking(w: World, h: HeroEntity, op: 'withdraw' | 'deposit' | 'settle', ticket?: number): void {
  const c = h.character;
  if (op === 'withdraw' && ticket) {
    // saque para uma finalidade exata
    if (ticket > 0) bankGold(w, 'withdraw', Math.min(ticket, c.bankGold));
    return;
  }
  // mercado e banco no mesmo prédio, antes das lojas: a bolsa fica com o que as lojas vão pedir; o resto vai para o banco
  const purse = shopPurse(w, h);
  if (op === 'withdraw' || (op === 'settle' && c.gold < purse)) {
    if (purse > c.gold) bankGold(w, 'withdraw', Math.min(purse - c.gold, c.bankGold));
    return;
  }
  // guarda o excedente, sem mexer no dinheiro das compras desta visita (senão saca de novo na próxima)
  const reserve = Math.max(keepGold(w, h), op === 'settle' ? purse : 0);
  const surplus = c.gold - reserve;
  // juntando para a meta de equipamento: guarda mais
  const saving = h.brain.goal ? 0.3 : 0;
  const savings =
    c.gold > potionPrice(w) * 30
      ? Math.floor((c.gold - reserve) * Math.min(0.9, 0.3 + h.hero.temperament.greed * 0.2 + saving))
      : 0;
  const amount = Math.max(surplus, savings);
  if (amount >= 20 && bankGold(w, 'deposit', amount)) heroSay(w, h, 'bank', {}, 8 * 60000);
}

/**
 * Ouro que a bolsa precisa ter para as compras das lojas: completar o estoque de cura e de mana (com a poção do nível
 * dele) e o upgrade planejado; sem arma, a arma. (O banco fica no começo da visita: o depósito não pode levar o
 * dinheiro das poções.)
 */
function shopPurse(w: World, h: HeroEntity): number {
  const c = h.character;
  const room = c.gold + c.bankGold - keepGold(w, h) - 40;
  const up = nextUpgrade(w, h, room);
  const best = bestPotionFor(w.data, c.level, 'heal');
  const missing = Math.max(0, healGoal(h, w.now) - potionHeal(w, h));
  const perHeal = best ? (shopPrices(w.data, best.id).sells ?? potionPrice(w)) / Math.max(1, potionAmount(best, 'heal')) : 0.6;
  const potions = Math.ceil(missing * perHeal * 1.1);
  // quem vive de mana (Sorcerer/Druid) também leva o ouro do estoque de mana: uma ida só, em vez de uma a cada 3 minutos
  const mana = manaGoal(w, h) ? Math.round(manaRestockCost(w, h) * 1.1) : 0;
  let purse = Math.max(up ? up.price + 40 : 0, potions + mana);
  if (unarmed(h)) {
    // sem arma: o preço da melhor arma que o saldo paga mais um estoque de poções
    const wp = bestUpgrade(w, h, c.gold + c.bankGold - 15, 'mainHand');
    if (wp) purse = Math.max(purse, wp.price + potionPrice(w) * 10);
  }
  return purse;
}

// ------------------------------------------------------------------ recuo, praça
/** Vai até o saco de morte, pega tudo (e reequipa o que for melhor) e volta à vida normal. */
/**
 * Avalia o saco de morte: se ele dá conta das criaturas que estão ao redor (com o que tem agora, magias incluídas),
 * vai buscar. Reavalia de tempos em tempos (depois de comprar uma arma e poções a conta muda).
 */
function maybeRecoverGrave(w: World, h: HeroEntity, now = false): boolean {
  const b = h.brain;
  if (!now && w.now < b.nextGraveCheckAt) return false;
  b.nextGraveCheckAt = w.now + 20000;
  const grave = [...w.lootBags.values()].find((l) => l.ownerId === h.id);
  if (!grave || b.recoverTries >= 3 || isPzLocked(w, h.id) || freeSlots(h.character.inventory) <= 0)
    return false;
  if (!graveSafe(w, h, grave)) return false;
  b.recoverTries++;
  heroSay(w, h, 'recover', {}, 0);
  setMode(w, h, 'recover', 4 * 60000);
  return true;
}

/** O saco de morte só vale o risco se as criaturas perto dele não forem demais para quem acabou de renascer. */
function graveSafe(w: World, h: HeroEntity, grave: { x: number; y: number }): boolean {
  if (fightMargin(w, h, monstersNear(w, grave, 8)) < SAFE_MARGIN) return false;
  // guerra: inimigos acampando o saco (esperando ele voltar) — só vai se o lado dele der conta
  if (!atWar(w)) return true;
  const campers = allActors(w).filter(
    (a) => !a.dead && isWarEnemy(w, h.id, a.id) && chebyshev(a, grave) <= 10,
  );
  return campers.reduce((s2, a) => s2 + power(a), 0) < sideStrength(w, h) * 0.8;
}

function recover(w: World, h: HeroEntity): void {
  const b = h.brain;
  const grave = [...w.lootBags.values()].find((l) => l.ownerId === h.id);
  if (!grave || (b.modeUntil && w.now > b.modeUntil)) return setMode(w, h, 'decide');
  if (chebyshev(grave, h) <= LOOT_RANGE) {
    collectLootWhileFighting(w, h);
    // mochila cheia ou sobra: o que não coube continua no saco; sem espaço, desiste
    if ([...w.lootBags.values()].some((l) => l.ownerId === h.id) && freeSlots(h.character.inventory) <= 0)
      return setMode(w, h, 'decide');
    return;
  }
  // se alguém encosta, luta (hunt cuida do alvo); senão, vai direto ao saco
  if (engagedByMonsters(w, h)) return hunt(w, h, true, true);
  if (!isMoving(h, w.now) && !h.path?.length) goTo(w, h, grave.x, grave.y, 120000);
}

function retreat(w: World, h: HeroEntity): void {
  // guerra: fugiu de gente e já está longe dela, com a vida em dia — volta a caçar (não precisa atravessar o mapa até o templo)
  if (
    atWar(w) &&
    h.brain.retreatWhy?.startsWith('guerra') &&
    hpPct(h) > 0.5 &&
    w.now - h.brain.stepStartedAt > 3000 &&
    !warEnemiesNear(w, h, 14).length
  ) {
    h.brain.nextRaidAt = Math.max(h.brain.nextRaidAt ?? 0, w.now + 60000);
    return setMode(w, h, 'decide');
  }
  if (isPzLocked(w, h.id)) {
    // com PZ lock não há templo para onde recuar; na guerra ele corre para perto dos aliados (reagrupa)
    if (atWar(w) && warEnemiesNear(w, h, 10).length && regroup(w, h)) return;
    // na guerra o PZ lock é comum: perseguido por criaturas, foge mesmo assim para perto da vila (sem entrar no templo)
    const chased = [...w.monsters.values()].some(
      (m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= 8,
    );
    if (!atWar(w) || !chased) return setMode(w, h, 'decide');
  }
  // travado e cercado: luta (a fuga sem saída só entrega as costas)
  if (w.now < h.brain.fightBackUntil && currentTarget(w)) return hunt(w, h, true, true);
  setTarget(w, null);
  if (isPz(w.map, h.x, h.y)) {
    // chegou vivo: com poções de sobra volta à caça sem passar pela vila (a vida volta com poção e regeneração);
    // sem elas, antes de caçar de novo cura e repõe o estoque
    h.brain.prepare = potionsOf(w, h) < 6 || hpPct(h) < 0.5;
    return setMode(w, h, 'decide');
  }
  // corre (Corrida) para a área protegida mais próxima (porta de uma construção), desviando das criaturas. Sem mana
  // para a Corrida, bebe uma poção de mana antes: as criaturas contornam obstáculos e alcançam quem foge a pé
  const haste = w.data.spells.haste;
  if (
    haste &&
    !h.buffs.some((x) => x.kind === 'haste') &&
    h.character.level >= haste.minLevel &&
    h.character.mana < spellManaCost(haste, h.character.level)
  ) {
    const idx = pickManaPotion(w, h);
    if (idx >= 0) drinkMana(w, h, idx);
  }
  tryCast(w, h, 'haste');
  // a porta mais perto (medido: trocar por uma "menos cheia" mais longe matava mais no caminho; a rota já desvia das criaturas)
  const door = [...w.map.doors].sort((a, b) => chebyshev(a, h) - chebyshev(b, h))[0];
  const start = w.map.playerStart;
  const goal = door
    ? { x: door.x, y: door.y - 2 }
    : { x: start.x + w.rng.int(-2, 2), y: start.y + w.rng.int(-1, 2) };
  if (
    !isMoving(h, w.now) &&
    !h.path?.length &&
    !planWalk(w, goal.x, goal.y, { quiet: true, avoidMonsters: true, maxNodes: 60000 }) &&
    // cercado, a rota "desviando das criaturas" não existe: passa no meio delas mesmo (parado ele só apanha)
    !planWalk(w, goal.x, goal.y, { quiet: true, maxNodes: 60000 })
  ) {
    // sem rota nenhuma até o abrigo: luta contra quem está em cima dele (poção e magias); sem como lutar, dá um passo
    h.brain.routeFailedAt = w.now;
    const foe = [...w.monsters.values()]
      .filter((m) => m.alive && m.targetId === h.id)
      .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0];
    if (foe) {
      setTarget(w, foe.id);
      hunt(w, h, true, true);
    } else sidestep(w, h);
  }
}

function social(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (b.modeUntil && w.now > b.modeUntil) return setMode(w, h, 'decide');
  const human = w.human;
  if (!human.dead && chebyshev(human, h) <= 5)
    heroSay(w, h, 'greetPlayer', { player: human.character.name }, 90000);
  if (isMoving(h, w.now) || h.path?.length) return;
  fidget(w, h);
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
  payload: {
    level?: number;
    skill?: string;
    sourceName?: string;
    sourceId?: string;
    amount?: number;
    byPlayer?: boolean;
  },
): void {
  const b = h.brain;
  if (type === 'xp') {
    b.huntXp += payload.amount ?? 0;
    return;
  }
  if (type === 'killedBy') {
    reactNearby(w, h, 'rip', { player: h.character.name });
    if (payload.byPlayer && payload.sourceId) {
      // morto por um jogador: vira rival e quer revanche (planejada: só vai quando estiver mais forte ou em grupo)
      changeAffinity(h, payload.sourceId, -0.6);
      b.grudge = { id: payload.sourceId, until: w.now + 30 * 60000 };
      markDanger(w, h, payload.sourceId, 30 * 60000);
      // o líder (herói) do grupo também guarda a rixa: a revanche do grupo é decisão dele
      const lead = partyOf(w, h.id)?.leaderId;
      const leadHero = lead && lead !== h.id ? w.heroes.get(lead) : undefined;
      if (leadHero && !sameParty(w, leadHero.id, payload.sourceId))
        leadHero.brain.grudge = { id: payload.sourceId, until: w.now + 30 * 60000 };
      b.lastHitBy = payload.sourceName ?? b.lastHitBy;
      b.pkLostTo = payload.sourceName ?? null;
    }
    return;
  }
  if (type === 'damage' && payload.sourceId && actorById(w, payload.sourceId)) {
    // apanhou de um jogador: a relação piora (e ele reage em thinkPvp) e ele passa a desconfiar dele
    changeAffinity(h, payload.sourceId, -0.08);
    if (!isSparring(w, h.id, payload.sourceId) && !sameParty(w, h.id, payload.sourceId))
      markDanger(w, h, payload.sourceId, 15 * 60000);
  }
  if (type === 'levelUp') {
    b.mood = Math.min(1, b.mood + 0.5);
    // comemora os níveis redondos sempre; os outros, às vezes (no começo eles vêm rápido)
    const lv = payload.level ?? h.character.level;
    if (lv % 5 === 0 || w.rng.chance(0.35)) heroSay(w, h, 'levelUp', { level: lv }, 0);
    if (lv % 5 === 0 || lv >= 15) reactNearby(w, h, 'congrats', { player: h.character.name, level: lv });
  } else if (type === 'skillUp' && w.rng.chance(0.4)) heroSay(w, h, 'skillUp', { skill: payload.skill ?? '' }, 6 * 60000);
  else if (type === 'damage' && payload.sourceName) {
    b.lastHitBy = payload.sourceName;
    if ((payload.amount ?? 0) > 0) b.lastHurtAt = w.now;
  } else if (type === 'kill') {
    b.mood = Math.min(1, b.mood + 0.03);
    b.bold = Math.min(1, b.bold + 0.015); // venceu: ganha confiança
    if (w.rng.chance(0.08)) heroSay(w, h, 'kill', {}, 4 * 60000);
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
    'druid+knight': 1,
    'knight+sorcerer': 0.9,
    'knight+paladin': 0.8,
    'druid+paladin': 0.7,
    'druid+sorcerer': 0.7,
    'paladin+sorcerer': 0.6,
    'knight+knight': 0.2,
    'druid+druid': 0.3,
    'paladin+paladin': 0.3,
    'sorcerer+sorcerer': 0.3,
  };
  return table[pair] ?? 0.4;
}

/** Quem lidera: o Knight (tanque) e, empatando, o de maior nível. */
const leaderScore = (x: PlayerEntity): number =>
  x.character.level + (x.character.vocation === 'knight' ? 4 : 0);

function leaveHeroParty(w: World, h: HeroEntity, why: 'town' | 'time' | 'gap'): void {
  if (!partyOf(w, h.id) || humanInParty(w, h)) return;
  leaveParty(w, h.id);
  h.brain.nextGroupAt = w.now + (why === 'town' ? 3 : 1 + w.rng.next() * 3) * 60000;
  h.brain.groupUntil = 0;
}

/**
 * Os heróis se juntam e se separam por conta própria: duplas, trios ou quartetos, quando quiserem. Grupos com o
 * jogador humano são decididos por ele; os só de heróis duram alguns minutos e se desfazem quando um precisa da vila.
 */
function heroGroupLife(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (b.mode === 'dead' || b.mode === 'pk' || b.mode === 'raid' || w.now < (b.groupThinkAt ?? 0)) return;
  // guerra de guildas: o grupo é a guilda inteira (fixo)
  if (w.social.war.mode === 'guilds') return;
  b.groupThinkAt = w.now + 4000 + w.rng.next() * 4000;
  const party = partyOf(w, h.id);
  if (party) {
    if (humanInParty(w, h)) return;
    const leader = actorById(w, party.leaderId);
    if (!leader || leader.dead) return;
    // (cada um por si: grupos de ocasião, mais curtos)
    if (!b.groupUntil)
      b.groupUntil = w.now + (atWar(w) ? 4 + w.rng.next() * 10 : 8 + w.rng.next() * 17) * 60000;
    // cansou do grupo, nível muito diferente ou o líder foi para longe demais
    if (w.now > b.groupUntil) return leaveHeroParty(w, h, 'time');
    if (Math.abs(leader.character.level - h.character.level) > 10) return leaveHeroParty(w, h, 'gap');
    if (leader.id !== h.id && chebyshev(leader, h) > 40) return leaveHeroParty(w, h, 'gap');
    // o líder convida mais um enquanto o grupo tem menos de 4
    if (party.leaderId !== h.id || party.members.length >= 4) return;
  } else if (
    w.now < b.nextGroupAt ||
    (b.mode !== 'hunt' && b.mode !== 'decide') ||
    (isPzLocked(w, h.id) && !atWar(w))
  )
    return;
  // (cada um por si: uns andam em bando, outros preferem ir sozinhos — o temperamento decide)
  else if (!w.rng.chance(0.3 + h.hero.temperament.sociability * 0.3 + (atWar(w) ? 0.1 : 0))) return; // gosta de caçar em grupo (a margem sobe e rende mais)
  if (pendingInviteFor(w, h.id)) return;
  const mine = partyOf(w, h.id);
  // candidatos: heróis livres e por perto; o convite só parte de quem lideraria o grupo
  const picks = [...w.heroes.values()]
    .filter(
      (o) =>
        o.id !== h.id &&
        !o.dead &&
        !partyOf(w, o.id) &&
        !pendingInviteFor(w, o.id) &&
        w.now >= o.brain.nextGroupAt &&
        o.brain.mode !== 'pk' &&
        o.brain.mode !== 'town' &&
        chebyshev(o, h) <= 25,
    )
    .filter(
      (o) =>
        Math.abs(o.character.level - h.character.level) <= (atWar(w) ? 12 : 7) &&
        affinityOf(h, o.id) > -0.3 &&
        affinityOf(o, h.id) > -0.3 &&
        // guerra de guildas: só com a própria guilda; e ninguém chama para o grupo quem está tentando matar
        (w.social.war.mode !== 'guilds' || isWarAlly(w, h.id, o.id)) &&
        o.brain.pkTargetId !== h.id &&
        b.pkTargetId !== o.id,
    )
    .filter((o) =>
      mine ? true : leaderScore(h) > leaderScore(o) || (leaderScore(h) === leaderScore(o) && h.id < o.id),
    )
    .map((o) => ({
      o,
      score:
        synergy(h.character.vocation, o.character.vocation) -
        chebyshev(o, h) * 0.02 +
        affinityOf(h, o.id) * 0.3,
    }))
    .sort((x, y) => y.score - x.score);
  const pick = picks[0];
  if (!pick || pick.score < 0.25) return;
  if (invite(w, h.id, pick.o.id)) return;
  if (!mine) b.groupUntil = w.now + (8 + w.rng.next() * 17) * 60000;
  heroSay(w, h, 'invite', { player: pick.o.character.name }, 30000);
  // o convidado responde logo (heróis não fazem o outro esperar)
  asActor(w, pick.o, () => answerInviteNow(w, pick.o));
}

/** Distância (tiles) que o seguidor mantém do líder: colado; quem luta de longe fica um tile mais atrás. */
const followGap = (h: HeroEntity): number => (isRanged(h.character.vocation) ? 2 : 1);

/**
 * Sorcerer e Druid transformam o excesso de mana em poções fortes (custo: 4× o que a poção recupera) quando o estoque
 * está baixo, ninguém está batendo neles e a mana sobra (a mana restante cobre as próximas lutas).
 */
function conjurePotions(w: World, h: HeroEntity): void {
  const voc = h.character.vocation;
  if (voc !== 'sorcerer' && voc !== 'druid') return;
  if (h.targetId || engagedByMonsters(w, h) || freeSlots(h.character.inventory) < 3) return;
  const lacking =
    voc === 'sorcerer' ? manaStock(w, h) < manaGoal(w, h) : potionHeal(w, h) < healGoal(h, w.now);
  if (!lacking) return;
  // a maior poção que ele já pode beber e criar sem deixar a mana abaixo da metade
  const options = w.data.vocations[voc].spells
    .map((id) => w.data.spells[id]!)
    .filter(
      (sp) =>
        sp?.effect === 'conjure' &&
        canDrink(w.data.items[sp.conjure!.itemId], h.character.level) &&
        h.character.mana - spellManaCost(sp, h.character.level) >= h.stats.maxMana * 0.5,
    )
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0));
  for (const sp of options) if (tryCast(w, h, sp.id)) return;
}

/** Mantém a Corrida ativa (renova antes de acabar) enquanto segue ou persegue: usa sempre que possível. */
function keepHaste(w: World, h: HeroEntity): void {
  const buff = h.buffs.find((b) => b.kind === 'haste');
  if (buff && buff.expiresAt - w.now > 4000) return;
  if (h.character.mana < h.stats.maxMana * 0.15) return;
  tryCast(w, h, 'haste');
}

/** Passo contínuo de quem segue o líder (a cada passo da simulação, não só a cada pensamento de 300 ms). */
export function heroFollowTick(w: World, h: HeroEntity): void {
  if (h.brain.mode !== 'follow' || h.dead || isMoving(h, w.now) || h.path?.length) return;
  if (currentTarget(w) || currentActorTarget(w)) return;
  trailStep(w, h, followGap(h));
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
  const hostile = grudge || h.brain.pkTargetId === inv.fromId || h.brain.raidTargetId === inv.fromId;
  // convite do jogador humano nunca é recusado (sai de qualquer outro grupo); entre heróis, conforme a relação
  const fromHuman = inv.fromId === w.human.id;
  const chance = fromHuman
    ? 1
    : hostile
      ? 0
      : 0.3 + t.sociability * 0.45 + aff * 0.5 - (levelGap > 10 ? 0.3 : 0) + (atWar(w) ? 0.25 : 0);
  if (fromHuman || w.rng.chance(Math.max(0, Math.min(0.97, chance)))) {
    if (fromHuman && hostile) {
      h.brain.grudge = null;
      h.brain.pkTargetId = null;
    }
    const wasFree = !partyOf(w, h.id);
    if (acceptInvite(w, h.id, inv.fromId)) return declineInvite(w, h.id);
    changeAffinity(h, inv.fromId, 0.1);
    h.brain.groupUntil = w.now + (8 + w.rng.next() * 17) * 60000;
    if (wasFree || from?.id === w.human.id)
      heroSay(w, h, 'inviteAccept', { player: from?.character.name ?? '' }, 0);
    setMode(w, h, followingHuman(w, h) ? 'follow' : 'decide');
  } else {
    declineInvite(w, h.id);
    heroSay(w, h, 'inviteDecline', { player: from?.character.name ?? '' }, 0);
  }
}

/**
 * Botão "Chamar" do painel do grupo: o herói para o que estiver fazendo e vai até o líder (se ele próprio for o
 * líder, vai até quem chamou). Chega a 2 tiles e volta a seguir o grupo.
 */
export function summonHero(w: World, h: HeroEntity, callerId: string): boolean {
  const party = partyOf(w, h.id);
  if (!party || h.dead || !party.members.includes(callerId)) return false;
  h.brain.summonedUntil = w.now + 90000;
  h.brain.summonTo = party.leaderId === h.id ? callerId : party.leaderId;
  asActor(w, h, () => {
    setTarget(w, null);
    h.path = null;
    h.pathGoal = null;
    h.brain.walkReq = null;
    if (h.brain.mode !== 'follow') setMode(w, h, 'follow');
  });
  return true;
}

function summoned(w: World, h: HeroEntity): void {
  const b = h.brain;
  const to = actorById(w, b.summonTo);
  if (!to || to.dead || !sameParty(w, h.id, to.id)) {
    b.summonedUntil = 0;
    return;
  }
  if (h.targetId) setTarget(w, null);
  if (chebyshev(to, h) <= 2) {
    b.summonedUntil = 0;
    h.path = null;
    heroSay(w, h, 'followLeader', { player: to.character.name }, 5 * 60000);
    return setMode(w, h, followingHuman(w, h) ? 'follow' : 'decide');
  }
  keepHaste(w, h);
  walkToLeader(w, h, to, { x: to.x, y: to.y, near: 2 }, chebyshev(to, h) > 15);
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
  // o líder foi à cidade: aproveita para vender o loot, guardar e comprar poções e itens (cada um resolve a própria vida)
  if (inTown(w, leader) && !isPzLocked(w, h.id) && (needsTown(w, h) || townErrands(w, h)))
    return planTown(w, h, undefined, 'follow');
  // líder parado há muito tempo (fora da vila): segue a vida, mas avisa (líder herói tem vida própria)
  if (leader.x !== b.leaderLastPos.x || leader.y !== b.leaderLastPos.y) {
    b.leaderLastPos = { x: leader.x, y: leader.y };
    b.leaderIdleSince = w.now;
  } else if (
    !heroLed &&
    !atWar(w) &&
    w.now - b.leaderIdleSince > 4 * 60000 &&
    !isPz(w.map, leader.x, leader.y)
  ) {
    heroSay(w, h, 'partyLeave', { player: leader.character.name }, 0);
    leaveParty(w, h.id);
    return setMode(w, h, 'decide');
  }
  // o grupo caça num lugar mais difícil que o dele? sente o risco, estoca mais poção e vai comprar antes de faltar
  const around = monstersNear(w, leader, 12);
  if (around.length && fightMargin(w, h, around.slice(0, 6)) < 2.6) b.heavyUntil = w.now + 10 * 60000;
  // com o jogador de líder o herói só se afasta (vai à vila) quando as poções de cura estão no fim; com líder herói,
  // quando o estoque já não cobre a caça pesada
  const needSupplies = heroLed
    ? b.heavyUntil > w.now && potionHeal(w, h) < healGoal(h, w.now) * 0.35
    : potionsOf(w, h) <= LOW_POTIONS + 1 && canResupply(w, h);
  if (needSupplies && !engagedByMonsters(w, h) && !isPzLocked(w, h.id)) {
    if (!heroLed) heroSay(w, h, 'lowPotions', { potions: potionsOf(w, h) }, 0);
    return planTown(w, h, undefined, 'follow');
  }
  giftPotion(w, h);
  heroSay(w, h, 'followLeader', { player: leader.character.name }, 8 * 60000);
  // Isca: um monstro perseguindo um colega? o herói chama a atenção dele para si.
  if (h.character.vocation === 'knight' && baitMonsters(w, h)) return;
  keepHaste(w, h); // seguindo: Corrida sempre ativa (depois de proteger o grupo)
  // PK segue o líder: ataca o personagem que o líder ataca (se o PK do mundo permitir) e solta a vítima quando ele para
  // (na guerra também o inimigo que está batendo num colega: todo mundo nele)
  const leaderFoe = actorById(w, leader.targetId) ?? (atWar(w) ? groupAggressor(w, h) : null);
  if (leaderFoe && !leaderFoe.dead && !sameParty(w, h.id, leaderFoe.id) && !canAttackActor(w, h, leaderFoe)) {
    if (h.targetId !== leaderFoe.id) setTarget(w, leaderFoe.id);
    if (h.targetId === leaderFoe.id) pvpSpells(w, h, leaderFoe);
    return;
  }
  if (currentActorTarget(w)) setTarget(w, null);
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
    if (chebyshev(leader, h) > FOLLOW_FIGHT_LEASH && !engagedByMonsters(w, h)) {
      setTarget(w, null);
      walkToLeader(w, h, leader, { x: leader.x, y: leader.y, near: 2 }, false);
      return;
    }
    // lutando: larga o passo de seguir (o caminho até o líder não pode arrastar o herói para fora da briga)
    if (h.path?.length && !isMoving(h, w.now) && b.walkReq && chebyshev(b.walkReq, leader) <= 3) {
      h.path = null;
      h.pathGoal = null;
      b.walkReq = null;
    }
    return hunt(w, h, true, true);
  }
  // "alvo do líder": foca o mesmo inimigo; "mais próximo": cada um pega o inimigo mais perto de si.
  // Em ambos os casos a ameaça precisa estar perto do grupo: o herói não sai correndo atrás dela
  // (o time se separa e ninguém mais ajuda ninguém).
  const nearestTo = (o: { x: number; y: number }) =>
    [...w.monsters.values()]
      .filter((m) => m.alive && !isPz(w.map, m.x, m.y) && chebyshev(m, o) <= 5 && hasLineOfSight(w, h, m))
      .sort((a, c) => chebyshev(a, o) - chebyshev(c, o))[0];
  // ameaça real: o monstro está atacando ou perseguindo alguém do grupo (ou é o alvo do líder). Entre várias, o foco:
  // a que os colegas já atacam e a de menos vida morrem primeiro (no "mais próximo", cada um pega a mais perto)
  const onGroup = [...w.monsters.values()].filter(
    (m) => m.alive && m.targetId && members.includes(m.targetId) && chebyshev(m, h) <= 8,
  );
  const mates = members.map((id) => actorById(w, id)).filter((a): a is PlayerEntity => !!a && !a.dead);
  const attackingGroup =
    party.targeting === 'nearest'
      ? onGroup.sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0]
      : focusPick(h, mates, onGroup);
  const threat =
    party.targeting === 'leader'
      ? ((leaderTarget?.alive ? leaderTarget : undefined) ?? attackingGroup)
      : party.targeting === 'lure'
        ? attackingGroup // lurar: só ataca o que o tanque trouxe até o grupo, não vai buscar criatura parada
        : (attackingGroup ?? nearestTo(h));
  if (
    threat &&
    !isPz(w.map, h.x, h.y) &&
    chebyshev(threat, leader) <= (party.targeting === 'lure' ? LURE_GROUP_RANGE : BAIT_LEADER_RANGE)
  ) {
    setTarget(w, threat.id);
    return;
  }
  // modo lurar: o tanque (Knight, ou Paladin sem Knight) puxa as criaturas da tela até o grupo
  if (party.targeting === 'lure' && lureTankId(w, party) === h.id && lureTick(w, h, party)) return;
  // grupo parado e nada atacando: o Knight "lura" — puxa a criatura mais próxima para o grupo, levando a pancada
  if (party.targeting !== 'lure' && lureMonsters(w, h, leader)) return;
  // loot na tela toda (sem se afastar demais do líder), a menos que alguém esteja batendo nele
  const bag = [...w.lootBags.values()].find(
    (l) => chebyshev(l, h) <= LOOT_SCAN && chebyshev(l, leader) <= LOOT_SCAN + 2 && heroMayLoot(w, h, l),
  );
  if (bag && freeSlots(h.character.inventory) > 0 && !engagedByMonsters(w, h)) return hunt(w, h, true, true);
  // formação: em fila pisa nos passos do líder; "seguir" fica a até 2 tiles. A rota mira sempre onde o líder
  // está agora (refeita quando ele se afasta do destino), então o herói anda junto sem parar e recomeçar.
  const spot = formationSpot(w, h.id);
  const far = chebyshev(leader, h) > 15;
  // seguir pela trilha do líder: passo contínuo, sem refazer rota (formação em fila usa o ponto dela)
  if (!(spot && party.formation === 'line' && !far) && !isMoving(h, w.now) && !h.path?.length) {
    const r = trailStep(w, h, followGap(h));
    if (r !== 'none') return;
  }
  const goal =
    spot && party.formation === 'line' && !far
      ? { x: spot.x, y: spot.y, near: 0 }
      : { x: leader.x, y: leader.y, near: followGap(h) };
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
  h.following = true;
}

/** Dá uma poção ao colega de grupo com pouca vida (se tiver de sobra). */
function giftPotion(w: World, h: HeroEntity): void {
  const human = w.human;
  if (w.now < h.brain.nextGiftAt || human.dead || chebyshev(human, h) > 3 || !sameParty(w, h.id, human.id))
    return;
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

/**
 * Legítima defesa contra QUALQUER personagem que o atacou há pouco (o jogador ou outro herói), sozinho ou em grupo:
 * revida se aguenta, foge se está perdendo feio. Antes só valia sozinho e contra o jogador — em grupo ele ficava parado
 * apanhando até morrer. Retorna true se tomou conta do turno.
 */
function selfDefense(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  if (b.mode === 'pk' || h.dead) return false;
  const foes = allActors(w).filter(
    (a) =>
      a !== h &&
      !a.dead &&
      chebyshev(a, h) <= 12 &&
      attackedRecently(w, a.id, h.id, 8000) &&
      !isSparring(w, a.id, h.id) &&
      !canAttackActor(w, h, a),
  );
  if (!foes.length) return false;
  const foe = foes.sort((a, c) => power(a) - power(c))[0]!;
  // na guerra a conta é lado contra lado (ele e os aliados por perto contra o atacante e os dele)
  const ratio = atWar(w) ? warOdds(w, h, foe) : power(h) / Math.max(1, power(foe));
  // com o grupo por perto ele aguenta mais: os colegas ajudam (ver follow, alvo do líder)
  const backup = atWar(w) ? 0 : alliesNear(w, h) * 0.25;
  // guerra: com trégua (a briga já empatou), não volta a trocar poção com ele — sai de perto se puder
  if (atWar(w) && onTruce(w, h, foe.id) && hpPct(h) > 0.25 && (warFlee(w, h, foe) || runFrom(w, h, foe)))
    return true;
  if ((hpPct(h) > 0.35 && ratio + backup > 0.7) || hpPct(h) > 0.8) return startPk(w, h, foe.id, 'revenge');
  if (atWar(w)) return warFlee(w, h, foe) || startPk(w, h, foe.id, 'revenge');
  heroSay(w, h, 'flee', { player: foe.character.name }, 20000);
  if (b.mode !== 'retreat') setMode(w, h, 'retreat');
  return true;
}

/** Reage a ataques e, com o PK ligado, decide se vale atacar alguém. Retorna true se tomou conta do turno. */
function thinkPvp(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  const human = w.human;
  if (b.mode === 'pk') return false;
  // treino no grupo: revida quem o atacou, mas para antes de se machucar demais
  if (isSparring(w, h.id, human.id) && !human.dead && !h.dead && attackedRecently(w, human.id, h.id, 6000)) {
    // treino: o combate já para com 50% de vida de quem apanha; duelo: revida até o fim (mas bebe poção e se cura no caminho)
    if (sparMode(w, h.id, human.id) === 'duel' || hpPct(h) > 0.5) {
      if (h.targetId !== human.id) setTarget(w, human.id);
      return h.targetId === human.id;
    }
    if (h.targetId === human.id) h.targetId = null;
    return false;
  }
  // (na guerra quem decide é thinkWar: o jogador é um inimigo como qualquer outro)
  if (!w.social.pvp || atWar(w) || human.dead || h.dead) return false;
  if (sameParty(w, h.id, human.id) || isPz(w.map, h.x, h.y) || isPz(w.map, human.x, human.y)) return false;
  const dist = chebyshev(human, h);
  if (dist > 9) return false;
  const ratio = power(h) / Math.max(1, power(human));
  if (w.now < b.nextPkThinkAt) return false;
  b.nextPkThinkAt = w.now + 6000 + w.rng.next() * 6000;
  if (!hasLineOfSight(w, h, human)) return false;
  const t = h.hero.temperament;
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

function startPk(w: World, h: HeroEntity, targetId: string, why: 'greed' | 'revenge' | 'war'): boolean {
  const victim = actorById(w, targetId);
  if (!victim) return false;
  setMode(w, h, 'pk');
  h.brain.pkTargetId = targetId;
  h.brain.pkPotions = potionsOf(w, h);
  setTarget(w, targetId);
  if (h.targetId !== targetId) {
    setMode(w, h, 'decide');
    return false;
  }
  changeAffinity(h, targetId, why === 'war' ? -0.05 : -0.2);
  if (why === 'war') heroSay(w, h, 'warAttack', { player: victim.character.name }, 20000);
  else
    heroSay(
      w,
      h,
      why === 'revenge' ? 'revenge' : 'pkThreat',
      { player: victim.character.name, gold: victim.character.gold },
      0,
    );
  return true;
}

function pk(w: World, h: HeroEntity): void {
  const b = h.brain;
  const victim = actorById(w, b.pkTargetId);
  if (!victim || !w.social.pvp || sameParty(w, h.id, victim.id)) return setMode(w, h, 'decide');
  if (atWar(w) && !victim.dead && !isWarEnemy(w, h.id, victim.id)) return setMode(w, h, 'decide');
  if (victim.dead) {
    heroSay(w, h, atWar(w) ? 'warWin' : 'pkWin', { player: victim.character.name }, 0);
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
  if (warPkCheck(w, h, victim)) return;
  if (h.targetId !== victim.id) setTarget(w, victim.id);
  keepHaste(w, h);
  if (h.targetId === victim.id) pvpSpells(w, h, victim);
}

/**
 * Guerra, no meio de uma briga com gente: larga se chegou reforço do outro lado (ou a vida despencou), se a briga
 * empatou (as poções curam o que o outro tira) ou se ele não consegue acertar a vítima. Roda também quando outra rotina
 * toma o turno (ex.: abrindo caminho num cerco), senão ele ficava preso mirando quem não alcança. True se largou.
 */
function warPkCheck(w: World, h: HeroEntity, victim: PlayerEntity): boolean {
  if (!atWar(w) || victim.dead) return false;
  const b = h.brain;
  const odds = warOdds(w, h, victim);
  if (((odds < 0.6 && hpPct(h) < 0.6) || (hpPct(h) < 0.25 && odds < 1.2)) && warFlee(w, h, victim)) return true;
  const elapsed = w.now - b.stepStartedAt;
  const used = (b.pkPotions ?? potionsOf(w, h)) - potionsOf(w, h);
  const vhp = victim.character.health / Math.max(1, victim.stats.maxHealth);
  const stale =
    (elapsed > 45000 && vhp > 0.35 && used >= 6) ||
    (elapsed > 60000 && vhp > 0.25) ||
    // (não alcança a vítima: atrás de criaturas, do outro lado de um obstáculo — bater nas criaturas em volta não conta)
    (elapsed > 20000 && !attackedRecently(w, h.id, victim.id, 15000));
  if (stale) {
    warDisengage(w, h, victim);
    return true;
  }
  if (onTruce(w, h, victim.id) && vhp > 0.25) {
    setMode(w, h, 'decide');
    return true;
  }
  return false;
}

/** Magias que deixam lento, por vocação: abrem a perseguição de quem foge (ou está para fugir). */
const PVP_SLOW: Record<HeroEntity['character']['vocation'], string[]> = {
  knight: ['crippling_blow'],
  sorcerer: [],
  druid: ['ice_shard', 'frost_burst'],
  paladin: ['stunning_arrow'],
};

/**
 * Magias no PK — sozinho (modo pk) ou ajudando o grupo a matar o personagem que o líder ataca (antes, em grupo, os
 * colegas só davam o ataque básico). Pensado para matar gente, que bebe poção e foge:
 * 1. defesa quando é ele quem apanha (Escudo de Mana, Pele de Pedra, Rugido de Ferro);
 * 2. reforço de ataque já na briga (Fúria encostado, Foco do Caçador no alcance);
 * 3. lentidão em quem foge ou está com pouca vida (vai fugir) e ainda não está lento;
 * 4. o resto pela magia que mais tira vida agora — a de área quando pega a vítima e outros inimigos (sem acordar
 *    criaturas paradas); com a mana curta, a que rende mais dano por ponto de mana.
 * Com a vida baixa guarda mana para a própria cura; o Druid em grupo guarda um pouco para curar os colegas.
 */
function pvpSpells(w: World, h: HeroEntity, victim: PlayerEntity): void {
  const voc = h.character.vocation;
  const lv = h.character.level;
  const manaPct = h.character.mana / Math.max(1, h.stats.maxMana);
  const reserve = hpPct(h) < 0.45 ? 0.35 : voc === 'druid' && alliesNear(w, h) > 0 ? 0.15 : 0.05;
  const d = chebyshev(victim, h);
  if (d > 7 || !hasLineOfSight(w, h, victim)) return;
  // 1) apanhando de um personagem (a vítima ou outro): defesa antes de atacar
  const hitBy = allActors(w).filter(
    (a) =>
      a !== h &&
      !a.dead &&
      chebyshev(a, h) <= 7 &&
      attackedRecently(w, a.id, h.id, 4000) &&
      !canAttackActor(w, h, a),
  ).length;
  if (hitBy && hpPct(h) < 0.6) {
    if (
      isRanged(voc) &&
      manaPct > 0.5 &&
      !h.buffs.some((b) => b.kind === 'manaShield') &&
      tryCast(w, h, 'mana_shield')
    )
      return;
    if (tryCast(w, h, voc === 'knight' ? 'iron_roar' : 'stone_skin')) return;
  }
  if (manaPct <= reserve) return;
  // 2) reforço de ataque
  if (voc === 'knight' && d <= 1 && manaPct > 0.3) tryCast(w, h, 'berserk');
  if (voc === 'paladin' && d <= 6 && manaPct > 0.3) tryCast(w, h, 'hunters_focus');
  // 3) quem foge (ou vai fugir, com pouca vida) leva primeiro a magia que deixa lento
  const victimHp = victim.character.health / Math.max(1, victim.stats.maxHealth);
  if ((isFleeing(w, h, victim) || victimHp < 0.35) && w.now >= victim.slowUntil)
    for (const id of PVP_SLOW[voc]) if (tryCast(w, h, id)) return;
  // 4) a de mais dano agora (área conta todos os inimigos que pega; mana curta: dano por mana)
  const hostile = (a: PlayerEntity) => a !== h && !a.dead && !canAttackActor(w, h, a);
  const foes = allActors(w).filter(hostile);
  const thrifty = manaPct < 0.4;
  let best: { id: string; score: number } | null = null;
  for (const id of w.data.vocations[voc].spells) {
    const sp = w.data.spells[id];
    if (!sp || sp.effect !== 'damage' || sp.attract || !castCheck(w, sp).ok) continue; // (o grito de isca é para criaturas)
    let hits = 1;
    if (sp.target === 'areaSelf' || sp.target === 'areaTarget') {
      const at = sp.target === 'areaSelf' ? h : victim;
      const r = sp.radius ?? 1;
      if (sp.target === 'areaSelf' && d > r) continue; // a área em volta dele não chega na vítima
      if (wakesIdle(w, at, r)) continue;
      hits = foes.filter((a) => chebyshev(a, at) <= r).length;
      // criaturas já brigando com o grupo também levam (bônus pequeno: o alvo é a vítima)
      hits +=
        [...w.monsters.values()].filter((m) => m.alive && m.targetId && chebyshev(m, at) <= r).length * 0.3;
      if (hits < 1) continue;
    }
    const dmg = spellAverage(w, h, id) * hits;
    const score = thrifty ? dmg / Math.max(1, spellManaCost(sp, lv)) : dmg;
    if (!best || score > best.score) best = { id, score };
  }
  if (best) tryCast(w, h, best.id);
}

// ------------------------------------------------------------------ guerra: atacar, caçar gente, fugir e reagrupar
/** Estoque para a guerra: cura para ~2,5 vidas cheias e (quem vive de mana) mana para brigar. */
function warStocked(w: World, h: HeroEntity): boolean {
  const goal = manaGoal(w, h);
  return (
    potionHeal(w, h) >= h.stats.maxHealth * 2.5 &&
    (!goal || manaStock(w, h) >= Math.min(goal * 0.4, h.stats.maxMana * 2))
  );
}

/** Sem condições de guerrear: sem estoque de poção, sem dinheiro para repor ou sem o equipamento (perdido numa morte). */
function warBroke(w: World, h: HeroEntity): boolean {
  const c = h.character;
  const money = c.gold + c.bankGold + lootValue(w, h);
  // (dinheiro: menos que umas 5 poções no total — bolsa, banco e loot a vender)
  return unarmed(h) || !c.equipment.body || money < potionPrice(w) * 5 || !warStocked(w, h);
}

/**
 * Em recuperação (ele ou a maior parte do grupo por perto sem dinheiro, itens ou poções): prioriza caçar para se
 * refazer e só briga por oportunidade (inimigo quase morto) ou com vitória certa.
 */
function warRecovering(w: World, h: HeroEntity): boolean {
  if (warBroke(w, h)) return true;
  const mates = alliesAround(w, h).filter((a): a is HeroEntity => 'brain' in a);
  return mates.length >= 2 && mates.filter((m) => warBroke(w, m)).length * 2 > mates.length + 1;
}

/** Escolhe as vítimas? Sozinho, líder do grupo ou em formação livre; quem segue o líder ataca o alvo dele. */
function warChooser(w: World, h: HeroEntity): boolean {
  const p = partyOf(w, h.id);
  return !p || p.leaderId === h.id || !followingHuman(w, h);
}

/** Caveira do inimigo como ele a vê (vermelha, branca ou a amarela da vingança): matá-lo é justo. */
function warSkullBonus(w: World, h: HeroEntity, foe: PlayerEntity): number {
  const s = skullSeenBy(w, h.id, foe.id);
  return s === 'red' ? 1 : s === 'white' ? 0.6 : s === 'yellow' ? 0.45 : 0;
}

/** Mortes injustas dele nas últimas 24 h (a 3ª dá caveira vermelha). */
function unjustKills(w: World, h: HeroEntity): number {
  return (w.social.unjust.get(h.id) ?? []).filter((t) => pkNow(w) - t < UNJUST_WINDOW_MS).length;
}

/**
 * Vantagem que ele exige para atacar este inimigo: o temperamento dá a base; caveira no inimigo baixa (é justo);
 * perto da caveira vermelha, atacar quem não tem caveira pede mais folga (mas não deixa de acontecer); com caveira
 * vermelha a morte custa tudo — mais cuidado; em recuperação, só com vitória certa.
 */
function warNeed(w: World, h: HeroEntity, foe: PlayerEntity | null): number {
  let need = engageNeed(h.hero.temperament, h.brain.mood);
  if (foe && warSkullBonus(w, h, foe) > 0) need -= 0.15;
  else if (unjustKills(w, h) >= UNJUST_KILLS_FOR_RED - 1) need += 0.2;
  if (skullOf(w, h.id)?.kind === 'red') need += 0.25;
  if (warRecovering(w, h)) need = Math.max(need + 0.6, 2);
  return need;
}

/** Nota de um alvo de guerra (maior = melhor): caveira primeiro, depois vantagem, vida baixa, foco do time e rixa. */
function warTargetScore(w: World, h: HeroEntity, foe: PlayerEntity, odds: number): number {
  const foeHp = foe.character.health / Math.max(1, foe.stats.maxHealth);
  const focused = allActors(w).some((a) => a !== h && a.targetId === foe.id && isWarAlly(w, h.id, a.id));
  return (
    warSkullBonus(w, h, foe) * 1.2 +
    Math.min(odds, 3) * 0.6 +
    (1 - foeHp) * 0.8 +
    (focused ? 0.5 : 0) +
    (h.brain.grudge?.id === foe.id ? 0.6 : 0) -
    affinityOf(h, foe.id) * 0.4 -
    chebyshev(foe, h) * 0.04
  );
}

/**
 * Guerra: a cada ~1,2 s olha em volta.
 * 1. Inimigos demais para o seu lado (todos somados contra ele e os aliados por perto): sai dali.
 * 2. Quem escolhe vítimas (sozinho, líder ou em formação livre): ataca o inimigo à vista que o seu lado vence com a
 *    folga exigida (warNeed) — sozinho contra alguém muito mais forte a conta não fecha, com o grupo fecha. Quem está
 *    quase morto vale o golpe final (oportunidade). Caveiras vêm primeiro.
 * 3. Sem ninguém à vista: trai o grupo (cada um por si), vai ajudar um aliado que está brigando, ou sai para caçar
 *    um inimigo que esteja dando sopa. Fora disso, segue caçando criaturas.
 * Retorna true se tomou conta do turno.
 */
function thinkWar(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  if (!atWar(w) || h.dead || b.mode === 'pk' || b.mode === 'dead' || isPz(w.map, h.x, h.y)) return false;
  if (w.now < (b.nextWarThinkAt ?? 0)) return false;
  b.nextWarThinkAt = w.now + 900 + w.rng.next() * 700;
  const foes = warEnemiesNear(w, h, 10).filter((f) => hasLineOfSight(w, h, f));
  if (foes.length) {
    // 1) perigo: o meu lado perde feio para os inimigos em volta
    const close = foes.filter((f) => chebyshev(f, h) <= 7);
    const pressure = close.reduce((s2, f) => s2 + power(f), 0);
    const flee = warRecovering(w, h) || skullOf(w, h.id)?.kind === 'red' ? 0.9 : 0.7;
    if (close.length && sideStrength(w, h) / Math.max(1, pressure) < flee) {
      const worst = [...close].sort((a, c) => power(c) - power(a))[0]!;
      if (warFlee(w, h, worst)) return true;
    }
    // 2) atacar: só quem escolhe as vítimas (os membros vão no alvo do líder, ver follow)
    if (warChooser(w, h)) {
      const hp = hpPct(h);
      const recovering = warRecovering(w, h);
      let best: { foe: PlayerEntity; score: number } | null = null;
      for (const foe of foes) {
        const odds = warOdds(w, h, foe);
        const foeHp = foe.character.health / Math.max(1, foe.stats.maxHealth);
        const finisher = foeHp < 0.25 && odds >= (recovering ? 1.1 : 0.9) && hp > 0.35;
        if (!(odds >= warNeed(w, h, foe) && hp > 0.55 && !onTruce(w, h, foe.id)) && !finisher) continue;
        const score = warTargetScore(w, h, foe, odds);
        if (!best || score > best.score) best = { foe, score };
      }
      if (best) return startPk(w, h, best.foe.id, 'war');
    }
  }
  return maybeBetray(w, h) || warAssist(w, h) || warUrge(w, h);
}

/** Vontade de caçar gente no meio da caça: de tempos em tempos, com vida e estoque em dia, vai atrás de um inimigo. */
function warUrge(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  if (b.mode !== 'hunt' || w.now < (b.nextRaidAt ?? 0) || !warChooser(w, h)) return false;
  b.nextRaidAt = w.now + 30000 + w.rng.next() * 30000;
  if (hpPct(h) < 0.8 || warRecovering(w, h) || engagedByMonsters(w, h)) return false;
  const t = h.hero.temperament;
  const leads = partyOf(w, h.id)?.leaderId === h.id;
  if (!w.rng.chance(0.25 + t.bravery * 0.3 + (leads ? 0.15 : 0) - t.caution * 0.1)) return false;
  const foe = pickRaidTarget(w, h, 80);
  if (!foe) return false;
  startRaid(w, h, foe);
  return true;
}

/**
 * Busca o conflito: um aliado (grupo ou guilda) a até 35 tiles está brigando com um inimigo e, chegando lá, o lado
 * deles vence — vai ajudar. Em recuperação, não sai da caça para isso.
 */
function warAssist(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  if (w.now < (b.nextAssistAt ?? 0) || !warChooser(w, h)) return false;
  b.nextAssistAt = w.now + 3000;
  if (b.mode === 'raid' || b.mode === 'town' || b.mode === 'retreat' || hpPct(h) < 0.7) return false;
  if (warRecovering(w, h) || engagedByMonsters(w, h)) return false;
  let best: { foe: PlayerEntity; ally: PlayerEntity; d: number } | null = null;
  for (const ally of allActors(w)) {
    if (ally === h || ally.dead || !isWarAlly(w, h.id, ally.id) || chebyshev(ally, h) > 35) continue;
    for (const foe of warEnemiesNear(w, ally, 8)) {
      if (!(attackedRecently(w, foe.id, ally.id, 5000) || ally.targetId === foe.id) || inTown(w, foe))
        continue;
      const odds = (sideStrength(w, ally) + power(h) * 0.8) / Math.max(1, sideStrength(w, foe));
      if (odds < warNeed(w, h, foe) * 0.9) continue;
      const d = chebyshev(foe, h);
      if (!best || d < best.d) best = { foe, ally, d };
    }
  }
  if (!best) return false;
  startRaid(w, h, best.foe, best.ally);
  return true;
}

/**
 * Cada um por si: um grupo só de heróis pode ser traído. Quem é ganancioso (e não gosta tanto do colega) olha o
 * colega ferido ou carregado de ouro; se vence ele E quem ficar do lado dele, sai do grupo e ataca. O grupo do
 * jogador nunca trai.
 */
function maybeBetray(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  if (w.social.war.mode !== 'ffa' || w.now < (b.nextBetrayAt ?? 0)) return false;
  b.nextBetrayAt = w.now + 20000 + w.rng.next() * 20000;
  const p = partyOf(w, h.id);
  if (!p || p.guild !== undefined || p.members.includes(w.human.id)) return false;
  if (hpPct(h) < 0.6 || engagedByMonsters(w, h) || warRecovering(w, h)) return false;
  const t = h.hero.temperament;
  const loyalty = (1 - t.greed) * 0.5 + t.sociability * 0.25 + t.caution * 0.25;
  for (const id of p.members) {
    const mate = id !== h.id ? actorById(w, id) : null;
    if (
      !mate ||
      mate.dead ||
      chebyshev(mate, h) > 6 ||
      !hasLineOfSight(w, h, mate) ||
      isPz(w.map, mate.x, mate.y)
    )
      continue;
    const defenders = p.members
      .map((m) => actorById(w, m))
      .filter((a): a is PlayerEntity => !!a && a !== h && a !== mate && !a.dead && chebyshev(a, mate) <= 8);
    const odds = power(h) / Math.max(1, power(mate) + defenders.reduce((s2, a) => s2 + power(a) * 0.8, 0));
    const mateHp = mate.character.health / Math.max(1, mate.stats.maxHealth);
    const loot = mate.character.gold + ('brain' in mate ? lootValue(w, mate as HeroEntity) : 0);
    const temptation =
      t.greed * 0.8 +
      (1 - mateHp) * 0.6 +
      Math.min(1, loot / (300 + h.character.level * 50)) * 0.5 +
      (b.grudge?.id === mate.id ? 0.6 : 0) -
      affinityOf(h, mate.id) * 0.8 -
      loyalty * 0.6;
    if (temptation < 0.45 || odds < warNeed(w, h, mate) || !w.rng.chance(0.35)) continue;
    leaveParty(w, h.id);
    for (const m of p.members) {
      const o = w.heroes.get(m);
      if (!o) continue;
      changeAffinity(o, h.id, -0.7);
      o.brain.dangerous[h.id] = w.now + 30 * 60000;
    }
    const victim = w.heroes.get(mate.id);
    if (victim) victim.brain.grudge = { id: h.id, until: w.now + 30 * 60000 };
    heroSay(w, h, 'warBetray', { player: mate.character.name }, 0);
    return startPk(w, h, mate.id, 'war');
  }
  return false;
}

/** Alvo para ir caçar: inimigo fora da vila que o meu lado (eu e quem está comigo) vence com folga. */
function pickRaidTarget(w: World, h: HeroEntity, maxDist = 120): PlayerEntity | null {
  const mine = sideStrength(w, h, 10);
  let best: { foe: PlayerEntity; score: number } | null = null;
  for (const foe of allActors(w)) {
    if (foe === h || foe.dead || !isWarEnemy(w, h.id, foe.id) || inTown(w, foe) || onTruce(w, h, foe.id))
      continue;
    const d = chebyshev(foe, h);
    if (d > maxDist) continue;
    const odds = mine / Math.max(1, sideStrength(w, foe));
    if (odds < warNeed(w, h, foe) * 1.05) continue;
    const foeHp = foe.character.health / Math.max(1, foe.stats.maxHealth);
    const score =
      warSkullBonus(w, h, foe) +
      Math.min(odds, 3) * 0.5 -
      d / 60 +
      (h.brain.grudge?.id === foe.id ? 0.6 : 0) +
      (1 - foeHp) * 0.3 -
      affinityOf(h, foe.id) * 0.3;
    if (!best || score > best.score) best = { foe, score };
  }
  return best?.foe ?? null;
}

function startRaid(w: World, h: HeroEntity, foe: PlayerEntity, helping?: PlayerEntity): void {
  const b = h.brain;
  setMode(w, h, 'raid', 4 * 60000);
  b.raidTargetId = foe.id;
  b.raidIntel = null;
  if (helping) heroSay(w, h, 'warHelp', { player: helping.character.name }, 30000);
  else heroSay(w, h, 'warRaid', { player: foe.character.name }, 60000);
}

/**
 * Caçando um inimigo: vai até onde ele foi visto por último (a posição é atualizada de tempos em tempos, como quem
 * pergunta no chat "onde ele tá?"). Ao avistá-lo, refaz a conta: vence, ataca; quase, espera o grupo chegar; perde
 * feio, desiste e guarda a rixa para depois. Desiste também se ele entrar na vila ou se faltar vida/poção.
 */
function raid(w: World, h: HeroEntity): void {
  const b = h.brain;
  const foe = actorById(w, b.raidTargetId ?? null);
  const done = (cool = 45000): void => {
    b.raidTargetId = null;
    b.raidIntel = null;
    b.nextRaidAt = w.now + cool + w.rng.next() * cool;
    setMode(w, h, 'decide');
  };
  if (!atWar(w) || !foe || foe.dead || !isWarEnemy(w, h.id, foe.id) || (b.modeUntil && w.now > b.modeUntil))
    return done();
  if (hpPct(h) < 0.5 || potionsOf(w, h) <= LOW_POTIONS) return done();
  if (inTown(w, foe)) {
    heroSay(w, h, 'pkEscaped', { player: foe.character.name }, 60000);
    return done();
  }
  // criaturas no caminho: resolve primeiro (a caçada continua depois)
  if (engagedByMonsters(w, h)) return hunt(w, h, true, true);
  const d = chebyshev(foe, h);
  if (d <= 10 && hasLineOfSight(w, h, foe)) {
    const odds = warOdds(w, h, foe);
    const need = warNeed(w, h, foe);
    const foeHp = foe.character.health / Math.max(1, foe.stats.maxHealth);
    if (odds >= need || (foeHp < 0.25 && odds >= 0.9)) {
      startPk(w, h, foe.id, 'war');
      return;
    }
    // perde feio (ou está sozinho, sem ninguém para chegar): desiste por agora e guarda a conta
    if (odds < need * 0.75 || !partyOf(w, h.id)) {
      markDanger(w, h, foe.id, 5 * 60000);
      heroSay(w, h, 'revengeLater', { player: foe.character.name }, 120000);
      return done(2 * 60000);
    }
    // quase: para e espera o grupo encostar (não entra na briga em desvantagem)
    if (h.path?.length) {
      h.path = null;
      h.pathGoal = null;
      b.walkReq = null;
    }
    return;
  }
  if (!b.raidIntel || w.now - b.raidIntel.at > 8000) b.raidIntel = { x: foe.x, y: foe.y, at: w.now };
  if (d > 12) keepHaste(w, h);
  const goal = b.raidIntel;
  if (!h.path?.length || !b.walkReq || chebyshev(b.walkReq, goal) > 3) goTo(w, h, goal.x, goal.y, 150000, 3);
}

/** Trégua com o inimigo (a última briga empatou): ainda não volta a atacá-lo. */
function onTruce(w: World, h: HeroEntity, id: string): boolean {
  return (h.brain.warTruce?.[id] ?? 0) > w.now;
}

/** Larga a briga empatada: trégua de ~3 min com ele; com a vida baixa, recua para se refazer. */
function warDisengage(w: World, h: HeroEntity, foe: PlayerEntity): void {
  const b = h.brain;
  const until = w.now + (2.5 + w.rng.next()) * 60000;
  (b.warTruce ??= {})[foe.id] = until;
  // a trégua vale para os dois lados (o outro também cansou de trocar poção): ele larga a briga no próximo pensamento
  const other = w.heroes.get(foe.id);
  if (other) (other.brain.warTruce ??= {})[h.id] = Math.max(other.brain.warTruce[h.id] ?? 0, until);
  for (const [id, t] of Object.entries(b.warTruce)) if (t <= w.now) delete b.warTruce[id];
  heroSay(w, h, 'revengeLater', { player: foe.character.name }, 60000);
  b.nextRaidAt = Math.max(b.nextRaidAt ?? 0, w.now + 60000);
  if (hpPct(h) < 0.5 && warFlee(w, h, foe)) return;
  setMode(w, h, 'decide');
}

/**
 * Sai de uma briga perdida: sem PZ lock, recua para o templo; com ele (não entra na área protegida), corre para perto
 * do aliado mais próximo. Sem ninguém para quem correr, retorna false (a legítima defesa decide: luta).
 */
function warFlee(w: World, h: HeroEntity, foe: PlayerEntity): boolean {
  const b = h.brain;
  if (isPzLocked(w, h.id) && !nearestWarAlly(w, h)) return false;
  heroSay(w, h, 'flee', { player: foe.character.name }, 20000);
  markDanger(w, h, foe.id, 5 * 60000);
  b.retreatWhy = `guerra: inimigos demais (${foe.character.name})`;
  if (b.mode !== 'retreat') setMode(w, h, 'retreat');
  return true;
}

/** Afasta-se do inimigo (sem abrigo nem aliado para onde correr): um ponto livre do lado oposto a ele. */
function runFrom(w: World, h: HeroEntity, foe: PlayerEntity): boolean {
  const dx = Math.sign(h.x - foe.x) || (w.rng.chance(0.5) ? 1 : -1);
  const dy = Math.sign(h.y - foe.y);
  if (h.targetId && !w.monsters.has(h.targetId)) setTarget(w, null);
  keepHaste(w, h);
  if (h.path?.length && isMoving(h, w.now)) return true;
  for (const d of [14, 10, 7, 4]) {
    const x = h.x + dx * d;
    const y = h.y + dy * d;
    if (canEnter(w, x, y, false, h.id) && !isPz(w.map, x, y)) {
      goTo(w, h, x, y, 40000);
      return true;
    }
  }
  return false;
}

function nearestWarAlly(w: World, h: HeroEntity): PlayerEntity | null {
  return (
    allActors(w)
      .filter(
        (a) => a !== h && !a.dead && isWarAlly(w, h.id, a.id) && chebyshev(a, h) <= 30 && chebyshev(a, h) > 2,
      )
      .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))[0] ?? null
  );
}

/** Corre (Corrida) para perto do aliado mais próximo. Retorna false se não há aliado longe dele (já está junto). */
function regroup(w: World, h: HeroEntity): boolean {
  const ally = nearestWarAlly(w, h);
  if (!ally) return false;
  if (h.targetId && !w.monsters.has(h.targetId)) setTarget(w, null);
  keepHaste(w, h);
  const b = h.brain;
  if (!h.path?.length || !b.walkReq || chebyshev(b.walkReq, ally) > 2) goTo(w, h, ally.x, ally.y, 60000, 1);
  return true;
}

/** Seguindo o grupo na guerra: o inimigo por perto que está batendo num colega (ou que um colega ataca) — o mais ferido. */
function groupAggressor(w: World, h: HeroEntity): PlayerEntity | null {
  const members = partyMembers(w, h);
  return (
    warEnemiesNear(w, h, 8)
      .filter((f) =>
        members.some((m) => attackedRecently(w, f.id, m, 4000) || actorById(w, m)?.targetId === f.id),
      )
      .sort((a, c) => a.character.health / a.stats.maxHealth - c.character.health / c.stats.maxHealth)[0] ??
    null
  );
}

/**
 * Guerra com PZ lock (não entra na vila para repor) e o estoque no fim ou a vida baixa: espera o lock passar perto da
 * porta mais próxima, fora da área protegida (caçar seco seria morrer). Retorna true se está esperando.
 */
function waitOutLock(w: World, h: HeroEntity): boolean {
  if (!atWar(w) || !isPzLocked(w, h.id) || isPz(w.map, h.x, h.y)) return false;
  if (potionsOf(w, h) > LOW_POTIONS + 1 && hpPct(h) >= 0.5) return false;
  if (engagedByMonsters(w, h)) return false;
  const doors = [...w.map.doors].sort((a, c) => chebyshev(a, h) - chebyshev(c, h));
  for (const door of doors.slice(0, 3))
    for (const dy of [2, -2, 3, -3]) {
      const x = door.x;
      const y = door.y + dy;
      if (isPz(w.map, x, y) || !canEnter(w, x, y, false, h.id)) continue;
      h.brain.townWhy = 'esperando o PZ lock passar';
      if (chebyshev({ x, y }, h) > 2 && !h.path?.length) goTo(w, h, x, y, 60000, 1);
      return true;
    }
  return false;
}

/** A guerra mudou (ligou, desligou ou trocou de modo): cada herói reavalia tudo já no próximo pensamento. */
export function heroWarChanged(w: World, h: HeroEntity): void {
  const b = h.brain;
  b.nextWarThinkAt = 0;
  b.nextAssistAt = 0;
  b.nextBetrayAt = w.now + 30000 + w.rng.next() * 30000;
  b.nextRaidAt = w.now + 5000 + w.rng.next() * 15000;
  b.raidTargetId = null;
  b.raidIntel = null;
  b.warTruce = {};
  b.groupThinkAt = 0;
  b.nextGroupAt = Math.min(b.nextGroupAt, w.now);
  if (b.mode === 'pk' || b.mode === 'raid' || (b.mode === 'follow' && !followingHuman(w, h)))
    setMode(w, h, 'decide');
}

/**
 * Busca o conflito na escolha da caça: área com inimigos que o lado dele vence rende mais (é onde a guerra acontece);
 * com inimigos fortes demais por perto, rende menos. Em recuperação, só evita os fortes.
 */
function warSpotFactor(w: World, h: HeroEntity, spawns: readonly { x: number; y: number }[]): number {
  if (!atWar(w)) return 1;
  const mine = sideStrength(w, h, 10);
  const recovering = warRecovering(w, h);
  let prey = 0;
  let threat = 0;
  for (const foe of allActors(w)) {
    if (foe === h || foe.dead || !isWarEnemy(w, h.id, foe.id) || !spawns.some((s) => chebyshev(s, foe) <= 15))
      continue;
    const odds = mine / Math.max(1, power(foe));
    if (odds >= warNeed(w, h, foe)) prey++;
    else if (odds < 0.8) threat++;
  }
  return (recovering ? 1 : 1 + Math.min(2, prey) * 0.3) * (threat ? 0.5 : 1);
}

// ------------------------------------------------------------------ improviso: comentários e pequenas vontades
function whims(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (w.now < b.nextWhimAt) return;
  b.nextWhimAt = w.now + 20000 + w.rng.next() * 40000;
  const human = w.human;
  if (!human.dead && chebyshev(human, h) <= 6 && b.mode !== 'pk') {
    const c = human.character;
    heroSay(
      w,
      h,
      'comment',
      {
        player: c.name,
        plevel: c.level,
        weapon: w.data.items[c.equipment.mainHand?.itemId ?? '']?.name ?? 'as mãos',
      },
      90000,
    );
  }
  // atitude rara: vontade de PK (só fora do grupo; nunca ataca nem desafia quem está no grupo dele)
  const t = h.hero.temperament;
  if (
    !human.dead &&
    chebyshev(human, h) <= 6 &&
    b.mode !== 'pk' &&
    !w.social.pvp &&
    !sameParty(w, h.id, human.id) &&
    (t.bravery > 0.6 || b.mood < -0.2) &&
    w.rng.chance(0.04)
  ) {
    heroSay(w, h, 'pkWish', { player: human.character.name }, 600000);
  }
  // caçando sozinho, quem é sociável às vezes chama gente para caçar junto
  if (b.mode === 'hunt' && !partyOf(w, h.id) && b.quarry && w.rng.chance(t.sociability * 0.15))
    heroSay(w, h, 'lfg', { monster: w.data.monsters[b.quarry]?.name ?? 'monstros', area: heroActivity(w, h) }, 12 * 60000);
  // às vezes muda de ideia no meio da caça (outra área com mais monstros)
  if (b.mode === 'hunt' && w.rng.chance(0.08)) {
    const q = chooseQuarry(w, h, w.rng.chance(0.4));
    if (q !== b.quarry) startHunt(w, h, q);
  }
}

/** Um passo para um tile livre ao lado (sai da frente de quem está bloqueando). */
function sidestep(w: World, h: HeroEntity): void {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const;
  const start = w.rng.int(0, dirs.length - 1);
  for (let i = 0; i < dirs.length; i++) {
    const [dx, dy] = dirs[(start + i) % dirs.length]!;
    if (tryStep(w, h, dx, dy, speedOf(w, h), false)) return;
  }
}

// ------------------------------------------------------------------ socorro, ordens, perigo, metas, treino ocioso
/**
 * Pedido de socorro: apanhando de 2 ou mais criaturas (ou de uma com a vida já abaixo de 60%) e com colegas heróis
 * longe (mais de 7 tiles), chama-os: eles largam o que fazem e vêm até ele com Corrida (como o botão "Chamar").
 */
function callForHelp(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (w.now < b.nextHelpCallAt || h.dead || isPz(w.map, h.x, h.y)) return;
  const party = partyOf(w, h.id);
  if (!party) return;
  // guerra: apanhando de gente, chama os 3 aliados mais perto (eles vêm caçar o agressor e refazem a conta ao chegar)
  if (atWar(w)) {
    const foe = allActors(w).find(
      (a) => !a.dead && isWarEnemy(w, h.id, a.id) && attackedRecently(w, a.id, h.id, 4000),
    );
    if (foe) {
      const allies = [...w.heroes.values()]
        .filter(
          (a) =>
            a !== h &&
            !a.dead &&
            isWarAlly(w, h.id, a.id) &&
            chebyshev(a, h) > 6 &&
            chebyshev(a, h) <= 40 &&
            a.brain.mode !== 'pk' &&
            a.brain.mode !== 'retreat' &&
            a.brain.mode !== 'town' &&
            hpPct(a) > 0.6,
        )
        .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))
        .slice(0, 3);
      if (allies.length) {
        b.nextHelpCallAt = w.now + 25000;
        for (const a of allies) asActor(w, a, () => startRaid(w, a, foe, h));
        heroSay(w, h, 'helpCall', {}, 0);
        return;
      }
    }
  }
  const hitters = [...w.monsters.values()].filter(
    (m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= 3,
  );
  if (!hitters.length || (hitters.length < 2 && hpPct(h) > 0.6)) return;
  const far = party.members
    .map((id) => w.heroes.get(id))
    .filter(
      (a): a is HeroEntity =>
        !!a &&
        a.id !== h.id &&
        !a.dead &&
        chebyshev(a, h) > 7 &&
        chebyshev(a, h) <= 40 &&
        a.brain.mode !== 'retreat' &&
        a.brain.mode !== 'town' &&
        (a.brain.summonedUntil ?? 0) <= w.now &&
        hpPct(a) > 0.5,
    )
    .sort((a, c) => chebyshev(a, h) - chebyshev(c, h))
    .slice(0, 3);
  if (!far.length) return;
  b.nextHelpCallAt = w.now + 30000;
  for (const a of far) {
    a.brain.summonedUntil = w.now + 30000;
    a.brain.summonTo = h.id;
    asActor(w, a, () => {
      setTarget(w, null);
      a.path = null;
      a.pathGoal = null;
      a.brain.walkReq = null;
    });
  }
  heroSay(w, h, 'helpCall', {}, 0);
  if (party.members.includes(w.human.id))
    w.human.scope.events.emit('message', {
      text: `${h.character.name} pediu socorro ao grupo.`,
      kind: 'system',
    });
}

/** Ordem tática do painel do grupo. Retorna false se o herói não pôde cumprir (ex.: PZ lock para ir à vila). */
export function orderHero(
  w: World,
  h: HeroEntity,
  kind: 'attack' | 'hold' | 'release' | 'town',
  targetId: string | null = null,
): boolean {
  if (h.dead || !partyOf(w, h.id)) return false;
  let ok = true;
  asActor(w, h, () => {
    const b = h.brain;
    b.summonedUntil = 0;
    if (kind === 'release') {
      b.order = null;
      return;
    }
    if (kind === 'attack') {
      if (!targetId) {
        ok = false;
        return;
      }
      b.order = { kind: 'attack', targetId, until: w.now + 30000 };
      h.path = null;
      b.walkReq = null;
      setTarget(w, targetId);
      heroSay(w, h, 'orderAttack', {}, 0);
      return;
    }
    if (kind === 'hold') {
      b.order = { kind: 'hold', x: h.x, y: h.y, until: w.now + 10 * 60000 };
      h.path = null;
      h.pathGoal = null;
      b.walkReq = null;
      heroSay(w, h, 'holdPos', {}, 0);
      return;
    }
    b.order = null;
    if (isPzLocked(w, h.id)) {
      ok = false;
      return;
    }
    // vila: vende, guarda, repõe e se cura; sem nada a resolver, passa pelo templo mesmo assim
    planTown(w, h, undefined, 'follow', true);
    if (b.mode !== 'town') planTown(w, h, [{ kind: 'heal' }], 'follow');
    heroSay(w, h, 'town', {}, 0);
  });
  return ok;
}

/** Ordem tática ativa. "Atacar": foca o alvo do jogador; "segurar": fica no lugar e só bate no que chega ao alcance. */
function orderTick(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  const o = b.order!;
  if (o.kind === 'attack') {
    const m = w.monsters.get(o.targetId);
    if (m?.alive) {
      if (h.targetId !== m.id) setTarget(w, m.id);
      if (chebyshev(m, h) > Math.max(1, h.stats.weapon.range)) keepHaste(w, h);
      hunt(w, h, true, true);
      return true;
    }
    const a = actorById(w, o.targetId);
    if (a && !a.dead && !canAttackActor(w, h, a)) {
      if (b.mode !== 'pk') startPk(w, h, a.id, 'revenge');
      return b.mode === 'pk';
    }
    b.order = null;
    return false;
  }
  // segurar a posição: bate só no que chegou ao alcance, volta para o ponto quando ninguém está em cima dele
  const range = Math.max(1, h.stats.weapon.range);
  const cur = currentTarget(w);
  if (cur && chebyshev(cur, h) > range + 1) setTarget(w, null);
  if (!currentTarget(w)) {
    const near = [...w.monsters.values()]
      .filter(
        (m) =>
          m.alive &&
          !isPz(w.map, m.x, m.y) &&
          chebyshev(m, h) <= range &&
          (range <= 1 || hasLineOfSight(w, h, m)) &&
          (m.targetId === h.id || (!!m.targetId && sameParty(w, h.id, m.targetId))),
      )
      .sort((a, c) => a.hp - c.hp)[0];
    if (near) setTarget(w, near.id);
  }
  const t = currentTarget(w);
  if (t) {
    const adjacent = [...w.monsters.values()].filter((m) => m.alive && chebyshev(m, h) <= 1).length;
    fightSpells(w, h, t, adjacent);
  }
  if (!engagedByMonsters(w, h) && chebyshev(o, h) > 1 && !isMoving(h, w.now) && !h.path?.length)
    goTo(w, h, o.x, o.y, 20000);
  return true;
}

/** Marca um jogador como perigoso (e avisa os colegas heróis do grupo, que passam a desconfiar dele também). */
function markDanger(w: World, h: HeroEntity, id: string, ms: number): void {
  const until = w.now + ms;
  h.brain.dangerous[id] = Math.max(h.brain.dangerous[id] ?? 0, until);
  for (const mid of partyOf(w, h.id)?.members ?? []) {
    const mate = mid !== h.id ? w.heroes.get(mid) : undefined;
    if (mate && mate.id !== id) mate.brain.dangerous[id] = Math.max(mate.brain.dangerous[id] ?? 0, until);
  }
}

/** Força do herói somada à dos colegas por perto (os de grupo valem 80%: nem sempre entram juntos). */
function strengthWithAllies(w: World, h: HeroEntity): number {
  if (atWar(w)) return sideStrength(w, h, 10); // guerra: a guilda por perto também conta
  return power(h) + alliesAround(w, h).reduce((s, a) => s + power(a) * 0.8, 0);
}

/**
 * Jogador perigoso (matou ou atacou ele ou um colega) por perto e o grupo não é forte o bastante: avisa e sai dali
 * (troca de área) antes de virar vítima. Forte o bastante: deixa a revanche/legítima defesa decidir.
 */
function watchDanger(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  // (na guerra quem vigia o perigo é thinkWar, lado contra lado)
  if (
    !w.social.pvp ||
    atWar(w) ||
    w.now < b.nextDangerAt ||
    b.mode === 'pk' ||
    b.mode === 'retreat' ||
    b.mode === 'dead'
  )
    return false;
  b.nextDangerAt = w.now + 1000;
  const foe = allActors(w).find(
    (a) =>
      a !== h &&
      !a.dead &&
      (b.dangerous[a.id] ?? 0) > w.now &&
      !sameParty(w, h.id, a.id) &&
      chebyshev(a, h) <= 9 &&
      !isPz(w.map, a.x, a.y),
  );
  if (!foe) return false;
  if (strengthWithAllies(w, h) / Math.max(1, power(foe)) >= 1.15) return false;
  heroSay(w, h, 'dangerSeen', { player: foe.character.name }, 30000);
  if (isPz(w.map, h.x, h.y) || isPzLocked(w, h.id)) return false;
  if (chebyshev(foe, h) <= 6 || hasLineOfSight(w, h, foe)) {
    if (b.quarry) b.avoid[b.quarry] = Math.max(b.avoid[b.quarry] ?? 0, w.now + 8 * 60000);
    b.retreatWhy = `jogador perigoso ${foe.character.name}`;
    setMode(w, h, 'retreat');
    return true;
  }
  return false;
}

/**
 * Revanche planejada contra quem o matou (o jogador ou outro herói): só ataca quando ele (com os colegas por perto)
 * está bem mais forte e com a vida em dia; senão avisa que a conta fica para depois e espera a hora certa.
 */
function plannedRevenge(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  const g = b.grudge;
  if (!g || w.now > g.until || !w.social.pvp || b.mode === 'pk') return false;
  const foe = actorById(w, g.id);
  if (!foe || foe.dead || sameParty(w, h.id, foe.id)) return false;
  if (
    chebyshev(foe, h) > 9 ||
    isPz(w.map, foe.x, foe.y) ||
    isPz(w.map, h.x, h.y) ||
    !hasLineOfSight(w, h, foe)
  )
    return false;
  if (canAttackActor(w, h, foe)) return false;
  if (strengthWithAllies(w, h) / Math.max(1, power(foe)) > 1.1 && hpPct(h) > 0.6)
    return startPk(w, h, foe.id, 'revenge');
  heroSay(w, h, 'revengeLater', { player: foe.character.name }, 120000);
  return false;
}

/** Ouro total (bolsa, banco e o loot da mochila). */
function wealthOf(w: World, h: HeroEntity): number {
  return h.character.gold + h.character.bankGold + lootValue(w, h) + escrowOf(w.market, h.character.id);
}

/**
 * Meta de equipamento: o melhor upgrade (ganho por ouro) que ele ainda não pode pagar, até 4x o que tem. Enquanto junta
 * para ele, não gasta em upgrade grande pelo caminho (ver upgradeBudget) e guarda mais no banco.
 */
function updateGoal(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (w.now < b.nextGoalAt) return;
  b.nextGoalAt = w.now + 60000;
  if (b.goal) {
    const def = w.data.items[b.goal.itemId];
    if (!def || !isUpgrade(w.data, h.character, def)) b.goal = null;
    else return;
  }
  const money = wealthOf(w, h) - keepGold(w, h) - 40;
  const up = bestUpgrade(w, h, Math.max(0, money) * 2.5 + 150);
  if (!up || up.price <= money) return;
  b.goal = { itemId: up.itemId, price: up.price };
  heroSay(w, h, 'goal', { item: w.data.items[up.itemId]!.name, gold: up.price }, 0);
}

/** Orçamento de upgrade com a meta em vista: juntando para ela, só compra coisa pequena (até 8% do preço da meta). */
function upgradeBudget(h: HeroEntity, budget: number): number {
  const g = h.brain.goal;
  if (!g || budget >= g.price) return budget;
  return Math.min(budget, g.price * 0.08);
}

/**
 * Melhor upgrade respeitando a meta: a meta primeiro (se der para pagar); juntando para ela, só coisa pequena — menos a
 * arma principal, que nunca espera (é o dano: atrasar a arma atrasa a caça inteira, e a meta junto).
 */
function nextUpgrade(
  w: World,
  h: HeroEntity,
  budget: number,
): { itemId: string; price: number; shopId: string } | null {
  const goal = goalOffer(w, h, budget);
  if (goal) return goal;
  const g = h.brain.goal;
  const goalSlot = g ? w.data.items[g.itemId]?.slot : undefined;
  const weapon =
    g && budget < g.price && goalSlot !== 'mainHand' ? bestUpgrade(w, h, budget, 'mainHand') : null;
  return weapon ?? bestUpgrade(w, h, upgradeBudget(h, budget));
}

/** A meta à venda e dentro do orçamento: é a primeira compra (antes de qualquer outro upgrade). */
function goalOffer(
  w: World,
  h: HeroEntity,
  budget: number,
): { itemId: string; price: number; shopId: string } | null {
  const g = h.brain.goal;
  if (!g || budget < g.price) return null;
  const def = w.data.items[g.itemId];
  if (!def || !isUpgrade(w.data, h.character, def)) return null;
  for (const shop of Object.values(w.data.shops)) {
    const o = shop.sells.find((x) => x.itemId === g.itemId);
    if (o && o.price <= budget) return { itemId: g.itemId, price: o.price, shopId: shop.id };
  }
  return null;
}

/** Juntando para a meta (ainda sem dinheiro para ela)? */
function savingForGoal(h: HeroEntity): boolean {
  const g = h.brain.goal;
  return !!g && h.character.gold + h.character.bankGold < g.price;
}

/**
 * O estoque acaba antes de dar tempo de voltar? Estima pelo consumo dos últimos 4 minutos (cura e, para quem vive de
 * mana, mana) quantos minutos as poções ainda aguentam e compara com a caminhada até a loja mais perto (+1,5 min de folga).
 */
function suppliesRunningOut(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  // acabou de voltar da vila (ou de tentar): espera; e só com uns minutos de caça para a média valer
  if (w.now < b.nextSupplyAt || w.now < b.nextTownAt || isPzLocked(w, h.id) || !canResupply(w, h))
    return false;
  if (w.now - b.huntStartedAt < 3 * 60000) return false;
  const shop = nearestShopNpc(w, h);
  if (!shop) return false;
  const walkMin = ((chebyshev(shop, h) / Math.max(1, h.stats.speed)) * 1.4) / 60 + 1.5;
  // (só a cura: a mana tem a regra própria de ida à vila, e quem não vive de mana nem a estoca direito)
  const healRate = b.drinkLog.filter((e) => w.now - e.at < 4 * 60000).reduce((s2, e) => s2 + e.heal, 0) / 4;
  return healRate > 0 && potionHeal(w, h) / healRate < walkMin;
}

/**
 * Tempo ocioso útil: mana cheia, ninguém por perto e nada para fazer (seguindo o grupo parado, esperando a presa
 * renascer): gasta a mana que sobra em magia de cura/Corrida, que treina o nível mágico (a mana volta sozinha).
 */
function idleTraining(w: World, h: HeroEntity): void {
  const b = h.brain;
  if (w.now < b.nextIdleTrainAt) return;
  b.nextIdleTrainAt = w.now + 3000;
  if (b.mode !== 'follow') return; // na caça a mana cheia é para a próxima luta (medido: gastar antes de puxar piorava)
  if (h.targetId || engagedByMonsters(w, h) || isPz(w.map, h.x, h.y)) return;
  if (h.character.mana < h.stats.maxMana * 0.95) return;
  if ([...w.monsters.values()].some((m) => m.alive && m.targetId && chebyshev(m, h) <= 8)) return;
  if (!tryCast(w, h, 'light_heal')) tryCast(w, h, 'haste');
}

// ------------------------------------------------------------------ mercado (corretor ao lado da banqueira)
/** Cap for surplus potion listings; equipment loot is listed in bulk. */
const HERO_MAX_LISTINGS = 4;
/** Ofertas de compra (metas de equipamento) abertas por herói. */
const HERO_MAX_BIDS = 2;
/** Equipamento barato (até este valor) não vale o anúncio: vai direto para a loja. */
const MARKET_MIN_VALUE = 150;
/** Sem baixar o preço por este tempo: depois, ~15% a menos a cada visita. */
const REPRICE_MS = 10 * 60000;

/** Piso de um anúncio: o que a loja paga (vender no mercado abaixo disso não compensa). */
function shopFloor(w: World, itemId: string): number {
  return shopPrices(w.data, itemId).buys ?? Math.round((w.data.items[itemId]?.value ?? 1) * 0.35);
}

/** Equipamento do loot que ele leva ao mercado em vez da loja: não vai usar e vale anunciar. */
function marketLoot(w: World, h: HeroEntity, itemId: string): boolean {
  const def = w.data.items[itemId];
  return !!def?.slot && marketable(def) && !def.weapon?.training && def.value >= MARKET_MIN_VALUE && sellable(w, h, itemId, true);
}

/**
 * Vale levar ao mercado (e não à loja)? Alguém já paga mais que a loja, ou o preço sugerido rende bem mais (40%+) que a
 * loja. O resto vai para a loja na hora (dinheiro parado em anúncio sem
 * comprador atrasa poções e equipamento).
 */
function worthMarket(w: World, h: HeroEntity, itemId: string): boolean {
  if (!marketLoot(w, h, itemId)) return false;
  const c = h.character;
  const floor = shopFloor(w, itemId);
  const bid = offersFor(w.market, itemId, 'buy', c.id)[0];
  if (bid && bid.price > floor) return true;
  return priceGuide(w.data, w.market, itemId, c.id).sellSuggest >= floor * 1.4;
}

/** Há o que fazer no corretor nesta visita? (senão ele nem passa lá: o banco fica no outro lado da vila) */
function marketErrands(w: World, h: HeroEntity): boolean {
  const c = h.character;
  const now = pkNow(w);
  if (parcelUnits(w.market, c.id) > 0) return true;
  if (c.depot.some((st) => st && wantsGear(w, h, w.data.items[st.itemId]))) return true;
  for (const o of ownOffers(w.market, c.id)) {
    if (o.side === 'sell' && now - o.at >= REPRICE_MS) return true;
    if (o.side === 'buy') {
      const ask = offersFor(w.market, o.itemId, 'sell', c.id)[0];
      const shop = shopPrices(w.data, o.itemId).sells;
      if (!wantsGear(w, h, w.data.items[o.itemId]) || (ask && ask.price <= o.price)) return true;
      if (shop !== null && c.gold + c.bankGold + o.price * o.count - keepGold(w, h) >= shop) return true;
    }
  }
  if ([...c.inventory, ...c.depot].some((st) => st && worthMarket(w, h, st.itemId))) return true;
  const money = marketMoney(w, h);
  for (const o of w.market.offers) {
    if (o.side !== 'sell' || o.ownerId === c.id) continue;
    const def = w.data.items[o.itemId];
    const shop = shopPrices(w.data, o.itemId).sells;
    if (shop !== null && o.price > shop) continue;
    if (def?.type === 'potion' && canDrink(def, c.level) && potionHeal(w, h) < healGoal(h, w.now)) return true;
    if (wantsGear(w, h, def) && o.price <= money) return true;
  }
  const g = h.brain.goal;
  const shop = g ? shopPrices(w.data, g.itemId).sells : null;
  return (
    !!g &&
    (shop === null || c.gold + c.bankGold - keepGold(w, h) < shop) &&
    !ownOffers(w.market, c.id).some((o) => o.side === 'buy' && o.itemId === g.itemId) &&
    marketMoney(w, h) * 0.6 >= g.price * 0.45
  );
}

/** Ganho (para ele) de trocar o equipado pelo item. */
function gainOf(w: World, h: HeroEntity, def: ItemDef): number {
  const cur = def.slot ? h.character.equipment[def.slot] : undefined;
  return valueFor(h, def) - (cur ? valueFor(h, w.data.items[cur.itemId]!) : 0);
}

/** Serve como upgrade de equipamento para ele agora? */
function wantsGear(w: World, h: HeroEntity, def: ItemDef | undefined): boolean {
  if (!def?.slot || def.weapon?.training || !weaponFits(w, h, def) || !isUpgrade(w.data, h.character, def)) return false;
  return gainOf(w, h, def) >= 5 || (def.slot === 'mainHand' && unarmed(h));
}

/** Ouro livre para o mercado: bolsa + banco, menos o que ele guarda e o estoque de poções que ainda falta comprar. */
function marketMoney(w: World, h: HeroEntity): number {
  const c = h.character;
  const potions = potionHeal(w, h) < healGoal(h, w.now) * 0.6 ? potionPrice(w) * 10 : 0;
  return c.gold + c.bankGold - keepGold(w, h) - 40 - potions;
}

/** Garante, na visita atual à vila, a parada na loja que vende o item (para comprá-lo como upgrade). */
function shopStepFor(w: World, h: HeroEntity, itemId: string): void {
  const shop = Object.values(w.data.shops).find((s) => s.sells.some((o) => o.itemId === itemId));
  const npc = shop && npcByShop(w, shop.id);
  if (!npc) return;
  const step = h.brain.town.find((st) => st.kind === 'shop' && st.npcId === npc.id);
  if (step && step.kind === 'shop') step.upgrades = true;
  else h.brain.town.push({ kind: 'shop', npcId: npc.id, upgrades: true });
}

/**
 * Etapa do mercado na vila (antes das lojas). Os heróis preferem negociar aqui:
 * 1. recebem as compras que chegaram (e já equipam/guardam na mochila o que serve);
 * 2. cuidam das próprias ofertas (baixam o preço do que não vende; cancelam a compra que perdeu o sentido);
 * 3. vendem o equipamento do loot para quem já quer comprar (se pagar mais que a loja) ou anunciam;
 * 4. compram poções do nível deles pelo menor preço (nunca acima da loja) e anunciam as pequenas que sobraram;
 * 5. compram upgrades à venda que cabem no orçamento;
 * 6. o que precisam para evoluir e não acharam: deixam uma oferta de compra dizendo quanto pagam — e seguem com o que
 *    têm (ou com algo mais fraco da loja) até a oferta fechar.
 * Os materiais de criaturas ficam para as lojas (o mercado não os aceita).
 */
function marketing(w: World, h: HeroEntity): void {
  const c = h.character;
  const now = pkNow(w);
  // 1) compras que chegaram por oferta (mochila ou depósito) e o que estava guardado e agora serve
  collectParcels(w.data, w.market, c);
  for (let i = 0; i < c.depot.length; i++) {
    const st = c.depot[i];
    const def = st ? w.data.items[st.itemId] : undefined;
    if (!st || !def) continue;
    const useful = wantsGear(w, h, def) || (def.type === 'potion' && canDrink(def, c.level));
    if (useful && freeSlots(c.inventory) > 1) withdrawItem(w.data, c, i);
  }
  equipBagUpgrades(w, h);
  // 2) as próprias ofertas
  for (const o of ownOffers(w.market, c.id)) {
    const def = w.data.items[o.itemId];
    if (o.side === 'buy') {
      const shop = shopPrices(w.data, o.itemId).sells;
      const ask = offersFor(w.market, o.itemId, 'sell', c.id)[0];
      if (!wantsGear(w, h, def)) marketCancel(w, o.id);
      // alguém anuncia pelo preço da oferta (ou menos): solta o ouro reservado e compra já (passo 5)
      else if (ask && ask.price <= o.price) marketCancel(w, o.id);
      // já dá para comprar na loja (contando o ouro reservado): cancela e garante a parada na loja
      else if (shop !== null && c.gold + c.bankGold + o.price * o.count - keepGold(w, h) >= shop) {
        marketCancel(w, o.id);
        shopStepFor(w, h, o.itemId);
      }
      continue;
    }
    const floor = shopFloor(w, o.itemId);
    const age = now - o.at;
    if (age < REPRICE_MS) continue;
    if (o.price <= Math.ceil(floor * 1.15)) {
      // ninguém quis nem perto do preço da loja: retira (volta para a mochila; a loja compra)
      if (age >= REPRICE_MS * 2) marketCancel(w, o.id);
      continue;
    }
    // não vendeu: baixa ~15% (sem ir abaixo do que a loja paga)
    const price = Math.max(floor + 1, Math.round(o.price * 0.85));
    if (marketCancel(w, o.id)) marketOffer(w, 'sell', o.itemId, o.count, price);
  }
  // 3) equipamento do loot: para quem já quer comprar (pagando mais que a loja) ou anuncia o que rende bem mais que a
  // loja (o resto vai para a loja)
  const toList: string[] = [];
  const lootIds = new Set([...c.inventory, ...c.depot].filter((st) => st && worthMarket(w, h, st.itemId)).map((st) => st!.itemId));
  for (const id of lootIds) {
    const floor = shopFloor(w, id);
    const bid = offersFor(w.market, id, 'buy', c.id)[0];
    if (bid && bid.price > floor) marketSellNow(w, id, countItem(c.inventory, id) + countItem(c.depot, id), floor + 1);
    const left = countItem(c.inventory, id) + countItem(c.depot, id);
    if (!left) continue;
    const g = priceGuide(w.data, w.market, id, c.id);
    if (g.sellSuggest < floor * 1.4) continue;
    toList.push(id);
  }
  if (toList.length && marketSellAll(w, toList)) {
    const id = toList[0]!;
    heroSay(w, h, 'tradeSell', { item: w.data.items[id]?.name ?? id, gold: priceGuide(w.data, w.market, id, c.id).sellSuggest }, 3 * 60000);
  }
  let listings = ownOffers(w.market, c.id).filter((o) => o.side === 'sell').length;
  // 4) poções: do nível dele, pelo menor preço (nunca acima da loja); anuncia as pequenas que sobraram
  for (const kind of ['heal', 'mana'] as const) {
    const best = bestPotionFor(w.data, c.level, kind);
    if (!best) continue;
    const goal = kind === 'heal' ? healGoal(h, w.now) : manaGoal(w, h);
    if (!goal) continue;
    const bestAmt = potionAmount(best, kind);
    for (const def of potionsByKind(w.data, kind).reverse()) {
      if (!canDrink(def, c.level) || potionAmount(def, kind) < bestAmt * 0.5) continue;
      const missing = goal - goodStock(w, h, kind, bestAmt);
      const shop = shopPrices(w.data, def.id).sells;
      const ask = offersFor(w.market, def.id, 'sell', c.id)[0];
      if (missing <= 0 || !ask || shop === null || ask.price > shop) continue;
      const qty = Math.min(Math.ceil(missing / potionAmount(def, kind)), Math.floor(Math.max(0, marketMoney(w, h) + potionPrice(w) * 10) / ask.price), 60);
      if (qty > 0) marketBuyNow(w, def.id, qty, shop);
    }
    if (goodStock(w, h, kind, bestAmt) < goal * 0.8 || listings >= HERO_MAX_LISTINGS) continue;
    for (const def of potionsByKind(w.data, kind)) {
      if (potionAmount(def, kind) >= bestAmt * 0.5) continue;
      const keep = kind === 'heal' && def.id === 'potion_health' ? 3 : 0;
      const n = countItem(c.inventory, def.id) - keep;
      if (n <= 0) continue;
      const shop = shopPrices(w.data, def.id);
      const g = priceGuide(w.data, w.market, def.id, c.id);
      // um pouco abaixo da loja (quem compra economiza) e acima do que a loja paga de volta
      const price = Math.max((shop.buys ?? 1) + 1, Math.min(Math.round((shop.sells ?? def.value) * 0.85), g.sellSuggest));
      if (marketOffer(w, 'sell', def.id, n, price)) listings++;
    }
  }
  // 5) upgrades à venda: o maior ganho por ouro que o orçamento paga (a arma nunca espera; a meta tem prioridade)
  for (let k = 0; k < 3; k++) {
    const money = marketMoney(w, h);
    let pick: { id: string; price: number; score: number } | null = null;
    for (const id of new Set(w.market.offers.filter((o) => o.side === 'sell' && o.ownerId !== c.id).map((o) => o.itemId))) {
      const def = w.data.items[id];
      if (!def || !wantsGear(w, h, def)) continue;
      const ask = offersFor(w.market, id, 'sell', c.id)[0]!;
      const shop = shopPrices(w.data, id).sells;
      if (shop !== null && ask.price > shop) continue; // mais caro que a loja: compra lá
      const isGoal = h.brain.goal?.itemId === id;
      const budget = isGoal || def.slot === 'mainHand' ? money : upgradeBudget(h, money);
      if (ask.price > budget) continue;
      const score = (gainOf(w, h, def) + (isGoal ? 1000 : 0)) / ask.price;
      if (!pick || score > pick.score) pick = { id, price: ask.price, score };
    }
    if (!pick || !marketBuyNow(w, pick.id, 1, pick.price)) break;
    const bi = c.inventory.findIndex((st) => st?.itemId === pick!.id);
    if (bi >= 0 && equipItem(w, bi)) heroSay(w, h, 'upgrade', { item: w.data.items[pick.id]!.name }, 0);
    if (h.brain.goal?.itemId === pick.id) h.brain.goal = null;
  }
  // 6) o que precisa para evoluir e não achou: oferta de compra (quanto ele paga), sem prender o ouro das poções
  // (se já dá para comprar na loja, a loja resolve hoje)
  const bids = ownOffers(w.market, c.id).filter((o) => o.side === 'buy');
  const target = h.brain.goal ? w.data.items[h.brain.goal.itemId] : undefined;
  const targetShop = target ? shopPrices(w.data, target.id).sells : null;
  const affordable = targetShop !== null && c.gold + c.bankGold - keepGold(w, h) >= targetShop;
  if (target && affordable) shopStepFor(w, h, target.id);
  if (target && !affordable && wantsGear(w, h, target) && bids.length < HERO_MAX_BIDS) {
    const g = priceGuide(w.data, w.market, target.id, c.id);
    const shop = targetShop;
    // preço justo: abaixo da loja (quem vende ganha mais que vendendo à loja) e perto do que o mercado pratica
    const fair = Math.max(shopFloor(w, target.id) + 1, Math.min(shop !== null ? Math.round(shop * 0.8) : g.ref, g.ref));
    const cap = Math.floor(Math.max(0, marketMoney(w, h)) * 0.6);
    const price = Math.min(fair, cap);
    const mine = bids.find((o) => o.itemId === target.id);
    if (price >= fair * 0.6 && (!mine || mine.price < price * 0.9)) {
      if (mine) marketCancel(w, mine.id);
      if (marketOffer(w, 'buy', target.id, 1, price)) heroSay(w, h, 'tradeBuy', { item: target.name, gold: price }, 3 * 60000);
    }
  }
}

/** Estoque (vida ou mana) só das poções que recuperam pelo menos metade da do tamanho dele. */
function goodStock(w: World, h: HeroEntity, kind: 'heal' | 'mana', size: number): number {
  return h.character.inventory.reduce((sum, st) => {
    const use = st && drinkable(w, h, st.itemId);
    const v = use?.[kind] ?? 0;
    return st && v >= size * 0.5 && !use?.[kind === 'heal' ? 'mana' : 'heal'] ? sum + v * st.count : sum;
  }, 0);
}

/**
 * Com o estoque da poção do nível dele em dia, vende as poções bem menores que sobraram na mochila (curam menos da
 * metade da dele: só ocupam espaço e gole). Fica com algumas para emergência e para dar aos colegas.
 */
function sellSmallPotions(w: World, h: HeroEntity, shop: { buys: readonly { itemId: string; price: number }[] }): void {
  const c = h.character;
  for (const kind of ['heal', 'mana'] as const) {
    const best = bestPotionFor(w.data, c.level, kind);
    if (!best) continue;
    const bestAmt = potionAmount(best, kind);
    const goal = kind === 'heal' ? healGoal(h, w.now) : manaGoal(w, h);
    if (!goal || countItem(c.inventory, best.id) * bestAmt < goal * 0.8) continue;
    for (const def of potionsByKind(w.data, kind)) {
      if (def.id === best.id || potionAmount(def, kind) >= bestAmt * 0.5) continue;
      const keep = kind === 'heal' && def.id === 'potion_health' ? 3 : 0;
      const n = countItem(c.inventory, def.id) - keep;
      if (n > 0 && shop.buys.some((o) => o.itemId === def.id)) sellItem(w, def.id, n);
    }
  }
}

// ------------------------------------------------------------------ jeito de gente (reação, sessões, AFK, conversa)
/**
 * Reage como gente: na primeira vez que percebe a situação marca o momento, e só age depois do tempo de reação dele
 * (alguns décimos de segundo, varia um pouco a cada vez).
 */
function reacted(w: World, h: HeroEntity, what: 'potion' | 'mana'): boolean {
  const n = h.brain.human.noticed;
  const since = n[what];
  if (since === undefined) {
    n[what] = w.now;
    return false;
  }
  return w.now - since >= profileOf(h).reactionMs * (0.8 + w.rng.next() * 0.5);
}

/** Pode deslogar/ficar AFK sem atrapalhar ninguém nem correr risco: fora de luta, de grupo com você e de PK. */
function freeToLeave(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  return (
    !h.dead &&
    b.mode !== 'pk' &&
    b.mode !== 'retreat' &&
    b.mode !== 'dead' &&
    b.mode !== 'recover' &&
    !humanInParty(w, h) &&
    !engagedByMonsters(w, h) &&
    !isPzLocked(w, h.id) &&
    !h.targetId
  );
}

/** Lugar seguro mais perto para deslogar ou ficar AFK: o templo (onde todo mundo nasce). */
function safeSpot(w: World): { x: number; y: number } {
  return w.map.playerStart;
}

/**
 * A rotina de quem joga de verdade (só no jogo, com `lifelike`): responde o que ficou "digitando", fica AFK de vez em
 * quando (e volta se alguém o ataca), e ao fim da sessão avisa que vai sair, vai a um lugar seguro e desloga — a
 * simulação o tira do mundo e ele volta depois de uma pausa, dizendo que voltou. Nunca sai de um grupo com você.
 * Retorna true se tomou conta do turno.
 */
function humanRoutine(w: World, h: HeroEntity): boolean {
  const b = h.brain;
  const hm = b.human;
  const prof = profileOf(h);
  // fala marcada ("digitando" a resposta)
  // (se acabou de falar outra coisa, espera a vez; depois de 10 s a conversa já passou)
  if (hm.pendingSay && w.now >= hm.pendingSay.at) {
    const p = hm.pendingSay;
    if (heroSay(w, h, p.key, p.vars, 0) || w.now - p.at > 10000) hm.pendingSay = null;
  }
  if (hm.justBack) {
    hm.justBack = false;
    heroSay(w, h, 'back', {}, 0);
  }
  if (!w.lifelike) return false;
  if (!hm.sessionEnds) hm.sessionEnds = w.now + (prof.sessionMin[0] + w.rng.next() * (prof.sessionMin[1] - prof.sessionMin[0])) * 60000;
  // AFK: parado no lugar seguro; volta na hora se alguém bate nele
  if (hm.afkUntil > w.now) {
    if (engagedByMonsters(w, h) || h.targetId) hm.afkUntil = 0;
    else return true;
  }
  // fim da sessão: avisa (cansado, depois tchau), vai ao templo e desloga
  if (!hm.leaving && w.now >= hm.sessionEnds - 5 * 60000 && w.now < hm.sessionEnds) heroSay(w, h, 'tired', {}, 10 * 60000);
  if (!hm.leaving && w.now >= hm.sessionEnds && freeToLeave(w, h)) {
    hm.leaving = true;
    heroSay(w, h, 'bye', {}, 0);
    if (partyOf(w, h.id)) leaveParty(w, h.id);
  }
  if (hm.leaving) {
    if (humanInParty(w, h)) {
      // (alguém o chamou para um grupo com você no caminho: fica mais um pouco)
      hm.leaving = false;
      hm.sessionEnds = w.now + 20 * 60000;
      return false;
    }
    if (isPz(w.map, h.x, h.y) && !engagedByMonsters(w, h)) {
      hm.logoutReady = true;
      return true;
    }
    if (!isMoving(h, w.now) && !h.path?.length) {
      const spot = safeSpot(w);
      goTo(w, h, spot.x, spot.y, 150000, 2);
    }
    return true;
  }
  return false;
}

/** Termina uma visita à vila: às vezes fica AFK uns minutos (numa loja ou no templo, em lugar seguro). */
function maybeAfk(w: World, h: HeroEntity): boolean {
  if (!w.lifelike || !isPz(w.map, h.x, h.y) || !freeToLeave(w, h) || !w.rng.chance(profileOf(h).afkChance)) return false;
  h.brain.human.afkUntil = w.now + (60 + w.rng.next() * 150) * 1000;
  heroSay(w, h, 'afk', {}, 0);
  return true;
}

/** Cumprimenta quem chega perto na vila (e o outro responde depois de "digitar"); um cumprimento por pessoa a cada 10 min. */
function greetNearby(w: World, h: HeroEntity): void {
  const hm = h.brain.human;
  if (h.brain.mode !== 'social' && h.brain.mode !== 'town') return;
  if (!w.rng.chance(h.hero.temperament.sociability * 0.4)) return;
  for (const o of w.heroes.values()) {
    if (o === h || o.dead || chebyshev(o, h) > 4 || o.brain.human.afkUntil > w.now) continue;
    if (w.now - (hm.greeted[o.id] ?? -Infinity) < 10 * 60000) continue;
    if (!heroSay(w, h, 'greetHero', { player: o.character.name }, 30000)) return;
    hm.greeted[o.id] = w.now;
    o.brain.human.greeted[h.id] = w.now;
    if (!o.brain.human.pendingSay)
      o.brain.human.pendingSay = { key: 'replyHero', vars: { player: h.character.name }, at: w.now + 1500 + w.rng.next() * 2500 };
    return;
  }
}

/** Parado, ninguém fica estático: olha para os lados de vez em quando. */
function fidget(w: World, h: HeroEntity): void {
  const hm = h.brain.human;
  if (w.now < hm.nextFidgetAt || isMoving(h, w.now) || h.path?.length) return;
  hm.nextFidgetAt = w.now + 2500 + w.rng.next() * 5000;
  const dirs = ['down', 'left', 'right', 'up'] as const;
  h.facing = dirs[w.rng.int(0, dirs.length - 1)]!;
}

/**
 * Quem está por perto reage ao que acontece com alguém (como num MMO de verdade): "gz" no nível novo, "F" na morte.
 * Cada um responde depois de "digitar" (1 a 4 s), e nem todo mundo fala (depende de quão sociável ele é).
 */
export function reactNearby(
  w: World,
  who: { id: string; x: number; y: number },
  key: 'congrats' | 'rip',
  vars: Record<string, string | number>,
): void {
  for (const o of w.heroes.values()) {
    if (o.id === who.id || o.dead || chebyshev(o, who) > 8 || o.brain.human.afkUntil > w.now || o.brain.human.pendingSay) continue;
    if (w.now - (o.brain.lastSpeech[key] ?? -Infinity) < 3 * 60000) continue;
    if (!w.rng.chance(0.25 + o.hero.temperament.sociability * 0.5)) continue;
    o.brain.human.pendingSay = { key, vars, at: w.now + 1000 + w.rng.next() * 3000 };
  }
}
