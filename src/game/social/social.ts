// Interação entre personagens-jogadores (humano e heróis): grupo e PK.
// - Grupo: convite (expira), aceitar/recusar, sair, remover, passar liderança; XP dividida igualmente.
// - PK (estilo Tibia): só com a permissão de PK do mundo ligada, fora de áreas protegidas e nunca entre membros
//   do grupo. Atacar quem não tem caveira dá caveira branca; um terceiro que ataca uma caveira branca sem ter sido
//   atacado por ela fica com caveira amarela (quem revida contra o agressor não ganha nada); 3 mortes injustas em
//   24 h dão caveira vermelha (24 h). Quem ataca fica com PZ lock (2 min; 5 min se matar) e as caveiras branca e
//   amarela duram exatamente o PZ lock. A morte conta para quem deu o MAIOR dano e também o último golpe.
import { chebyshev } from '../../domain/value-objects/position';
import { isPz } from '../world/GameMap';
import type { PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors, message } from '../simulation/World';

export type PartyFormation = 'free' | 'follow' | 'line';
/** Alvo: cada um o mais próximo, o do líder, ou "lurar" (o Knight, ou o Paladin, puxa as criaturas da tela até o grupo). */
export type PartyTargeting = 'nearest' | 'leader' | 'lure';

export interface Party {
  leaderId: string;
  members: string[];
  /** Livre: cada um segue seu plano; seguir: todos andam perto do líder; fila: em fila atrás do líder. */
  formation: PartyFormation;
  /** Cada um ataca o inimigo mais próximo, todos atacam o alvo do líder ou o tanque puxa as criaturas para o grupo atacar. */
  targeting: PartyTargeting;
  /** Membros podem se atacar (treino ou duelo), sem caveira nem perda de ouro. */
  friendlyFire: boolean;
  /** Com o ataque entre membros liberado: treino (param com 50% de vida e esperam o outro se curar) ou duelo (até morrer). */
  sparMode?: 'training' | 'duel';
  /** Últimas posições do líder (para a formação em fila). */
  trail: { x: number; y: number }[];
}

export interface PartyInvite {
  fromId: string;
  toId: string;
  expiresAt: number;
}

export interface SocialState {
  /** Relógio de PK em ms. No jogo é o relógio real (Date.now): caveira e PZ lock passam mesmo com o jogo pausado ou fechado. */
  clock?: () => number;
  /** Grupo do jogador humano (com ele dentro). */
  party: Party | null;
  /** Grupos só de heróis (sem jogador): formam-se e desfazem-se sozinhos. */
  heroParties: Party[];
  invites: PartyInvite[];
  /** Permissão de PK (ligada pelo jogador). */
  pvp: boolean;
  /** Caveira de cada personagem: tipo e até quando. */
  skulls: Map<string, SkullState>;
  /** PZ lock: até quando o personagem não pode entrar em áreas protegidas. */
  pzLocks: Map<string, number>;
  /** Mortes injustas (vítima sem caveira) de cada personagem: instantes, para a caveira vermelha. */
  unjust: Map<string, number[]>;
  /** Dano recebido por cada personagem (de quem e quanto): decide quem matou (maior dano + último golpe). */
  damageLog: Map<string, { id: string; amount: number; at: number }[]>;
  /** Último ataque de A em B: chave `${atacante}>${vitima}` -> instante. */
  aggressions: Map<string, number>;
  /** Vingança: `${vitima}>${assassino}` -> até quando a vítima de uma morte injusta pode revidar sem caveira. */
  revenge: Map<string, number>;
}

export function newSocialState(pvp = false): SocialState {
  return {
    party: null,
    heroParties: [],
    invites: [],
    pvp,
    skulls: new Map(),
    pzLocks: new Map(),
    unjust: new Map(),
    damageLog: new Map(),
    aggressions: new Map(),
    revenge: new Map(),
  };
}

/** Hora usada pelas regras de PK: relógio real no jogo (a caveira vermelha de 24 h conta com o jogo fechado); nos testes, o tempo da simulação. */
export function pkNow(w: World): number {
  return w.social.clock ? w.social.clock() : w.now;
}

export type SkullKind = 'white' | 'yellow' | 'red';
export interface SkullState {
  kind: SkullKind;
  until: number;
}

export const INVITE_MS = 60000;
/** PZ lock ao atacar outro personagem e ao matá-lo. */
export const PZ_LOCK_ATTACK_MS = 2 * 60000;
export const PZ_LOCK_KILL_MS = 5 * 60000;
/** Caveira vermelha: 24 h. As brancas e amarelas duram o mesmo que o PZ lock. */
export const RED_SKULL_MS = 24 * 3600000;
/** Só o dano recebido nesta janela conta para decidir quem matou. */
export const KILL_CREDIT_MS = 60000;
/** Com menos que isto para acabar o PZ lock/caveira, qualquer combate (com personagem, NPC ou criatura) renova para este valor. */
export const SKULL_RENEW_MS = 30000;
/** 3 mortes injustas dentro desta janela dão caveira vermelha. */
export const UNJUST_WINDOW_MS = 24 * 3600000;
export const UNJUST_KILLS_FOR_RED = 3;
const SKULL_RANK: Record<SkullKind, number> = { yellow: 1, white: 2, red: 3 };
/** Distância máxima para receber a parte da XP do grupo. */
export const PARTY_SHARE_RANGE = 20;

export function actorById(w: World, id: string | null | undefined): PlayerEntity | null {
  if (!id) return null;
  if (w.human.id === id) return w.human;
  return w.heroes.get(id) ?? null;
}

export function actorName(w: World, id: string): string {
  return actorById(w, id)?.character.name ?? id;
}

// ------------------------------------------------------------------ grupo
export function allParties(w: World): Party[] {
  return w.social.party ? [w.social.party, ...w.social.heroParties] : w.social.heroParties;
}

export function partyOf(w: World, id: string): Party | null {
  return allParties(w).find((p) => p.members.includes(id)) ?? null;
}

export function sameParty(w: World, a: string, b: string): boolean {
  const p = partyOf(w, a);
  return !!p && p.members.includes(b);
}

/** Remove o grupo do mundo (o do jogador ou um só de heróis). */
function dropParty(w: World, p: Party): void {
  if (w.social.party === p) w.social.party = null;
  else w.social.heroParties = w.social.heroParties.filter((x) => x !== p);
}

/** Cria o grupo de dois: com o jogador humano vira o grupo dele; entre heróis, um grupo próprio. */
function createParty(w: World, leaderId: string, memberId: string): Party {
  const p: Party = {
    leaderId,
    members: [leaderId, memberId],
    formation: 'follow',
    targeting: 'leader',
    friendlyFire: false,
    trail: [],
  };
  if (leaderId === w.human.id || memberId === w.human.id) w.social.party = p;
  else w.social.heroParties.push(p);
  return p;
}

function notify(w: World, text: string, party?: Party | null): void {
  // mensagens de grupo vão para o registro do jogador humano; grupos só de heróis não o incomodam
  if (party && party !== w.social.party) return;
  w.human.scope.events.emit('message', { text, kind: 'system' });
  w.human.scope.events.emit('partyChanged', {});
}

export type PartyFail = 'self' | 'notLeader' | 'alreadyInParty' | 'dead' | 'noInvite' | 'notMember';
export const PARTY_FAIL_MESSAGE: Record<PartyFail, string> = {
  self: 'Você não pode se convidar.',
  notLeader: 'Só o líder do grupo pode fazer isso.',
  alreadyInParty: 'Esse personagem já está em um grupo.',
  dead: 'Personagem indisponível.',
  noInvite: 'Convite expirado.',
  notMember: 'Esse personagem não está no grupo.',
};

export function invite(w: World, fromId: string, toId: string): PartyFail | null {
  if (fromId === toId) return 'self';
  const from = actorById(w, fromId);
  const to = actorById(w, toId);
  if (!from || !to || from.dead || to.dead) return 'dead';
  const party = partyOf(w, fromId);
  // o jogador humano convida mesmo sem ser o líder (os demais membros são heróis que seguem o que ele decide)
  if (party && party.members.includes(fromId) && party.leaderId !== fromId && fromId !== w.human.id)
    return 'notLeader';
  if (party && party.members.includes(toId)) return 'alreadyInParty';
  w.social.invites = w.social.invites.filter(
    (i) => !(i.fromId === fromId && i.toId === toId) && i.expiresAt > w.now,
  );
  w.social.invites.push({ fromId, toId, expiresAt: w.now + INVITE_MS });
  // só convites que envolvem o jogador aparecem na interface
  if (fromId === w.human.id || toId === w.human.id)
    w.human.scope.events.emit('partyInvite', {
      fromId,
      toId,
      fromName: from.character.name,
      toName: to.character.name,
    });
  if (fromId === w.human.id) message(w, `Convite enviado para ${to.character.name}.`, 'system');
  return null;
}

export function pendingInviteFor(w: World, toId: string): PartyInvite | null {
  return w.social.invites.find((i) => i.toId === toId && i.expiresAt > w.now) ?? null;
}

export function acceptInvite(w: World, toId: string, fromId?: string): PartyFail | null {
  const inv = w.social.invites.find(
    (i) => i.toId === toId && (!fromId || i.fromId === fromId) && i.expiresAt > w.now,
  );
  if (!inv) return 'noInvite';
  w.social.invites = w.social.invites.filter((i) => i !== inv && i.toId !== toId);
  const into = partyOf(w, inv.fromId);
  if (into?.members.includes(toId)) return null;
  // convite do jogador humano vale mais: o herói sai de qualquer outro grupo e fica com o líder do servidor;
  // entre heróis, quem já está num grupo não troca por convite
  const current = partyOf(w, toId);
  if (current) {
    if (inv.fromId !== w.human.id) return 'alreadyInParty';
    leaveParty(w, toId);
  }
  // o convidante pode ter ficado sem grupo ao sair do dele (ex.: o herói era o único outro membro)
  const target = partyOf(w, inv.fromId);
  const party = target ?? createParty(w, inv.fromId, toId);
  if (target && !party.members.includes(toId)) party.members.push(toId);
  notify(w, `${actorName(w, toId)} entrou no grupo de ${actorName(w, party.leaderId)}.`, party);
  return null;
}

export function declineInvite(w: World, toId: string): void {
  const inv = pendingInviteFor(w, toId);
  if (!inv) return;
  w.social.invites = w.social.invites.filter((i) => i !== inv);
  if (inv.fromId === w.human.id || toId === w.human.id)
    notify(w, `${actorName(w, toId)} recusou o convite de grupo.`);
}

export function leaveParty(w: World, id: string): PartyFail | null {
  const p = partyOf(w, id);
  if (!p) return 'notMember';
  p.members = p.members.filter((m) => m !== id);
  const name = actorName(w, id);
  if (p.members.length < 2) {
    dropParty(w, p);
    notify(w, `${name} saiu. O grupo foi desfeito.`, p);
    return null;
  }
  if (p.leaderId === id) p.leaderId = p.members[0]!;
  notify(w, `${name} saiu do grupo.`, p);
  return null;
}

export function kickFromParty(w: World, leaderId: string, id: string): PartyFail | null {
  const p = partyOf(w, leaderId);
  if (!p) return 'notMember';
  if (p.leaderId !== leaderId) return 'notLeader';
  if (!p.members.includes(id)) return 'notMember';
  return leaveParty(w, id);
}

export function passLeadership(w: World, leaderId: string, toId: string): PartyFail | null {
  const p = partyOf(w, leaderId);
  if (!p) return 'notMember';
  if (p.leaderId !== leaderId) return 'notLeader';
  if (!p.members.includes(toId)) return 'notMember';
  p.leaderId = toId;
  p.trail = []; // o rastro da fila passa a ser o do novo líder
  notify(
    w,
    toId === w.human.id
      ? 'Você agora é o líder do grupo.'
      : `${actorName(w, toId)} agora é o líder do grupo.`,
  );
  return null;
}

/** Quem recebe parte da XP de um monstro abatido por `killerId` (o próprio, ou o grupo próximo e vivo). */
export function xpReceivers(w: World, killerId: string, at: { x: number; y: number }): PlayerEntity[] {
  const killer = actorById(w, killerId);
  if (!killer) return [];
  const p = partyOf(w, killerId);
  if (!p) return [killer];
  return p.members
    .map((id) => actorById(w, id))
    .filter(
      (a): a is PlayerEntity => !!a && !a.dead && (a === killer || chebyshev(a, at) <= PARTY_SHARE_RANGE),
    );
}

// ------------------------------------------------------------------ PK
export type PvpFail = 'off' | 'self' | 'party' | 'pz' | 'dead';
export const PVP_FAIL_MESSAGE: Record<PvpFail, string> = {
  off: 'Ataque a jogadores desligado (ative o PK).',
  self: 'Você não pode atacar a si mesmo.',
  party: 'Membros do grupo só se atacam com o treino liberado.',
  pz: 'Ninguém pode lutar dentro de uma área protegida.',
  dead: 'Alvo indisponível.',
};

export function canAttackActor(w: World, attacker: PlayerEntity, victim: PlayerEntity): PvpFail | null {
  if (attacker.id === victim.id) return 'self';
  if (victim.dead || attacker.dead) return 'dead';
  const party = sameParty(w, attacker.id, victim.id);
  // membros só se atacam com o "ataque entre membros" ligado (treino); fora do grupo, só com PK
  if (party && !partyOf(w, attacker.id)!.friendlyFire) return 'party';
  if (!party && !w.social.pvp) return 'off';
  if (isPz(w.map, attacker.x, attacker.y) || isPz(w.map, victim.x, victim.y)) return 'pz';
  return null;
}

/** Ataque entre membros do grupo liberado (treino ou duelo): sem caveira e sem perda de ouro. */
export function isSparring(w: World, a: string, b: string): boolean {
  return sameParty(w, a, b) && !!partyOf(w, a)?.friendlyFire;
}

/** Modo do ataque entre dois membros: 'training' (nunca passam de 50% da vida um do outro), 'duel' (até morrer) ou null. */
export function sparMode(w: World, a: string, b: string): 'training' | 'duel' | null {
  if (!isSparring(w, a, b)) return null;
  return partyOf(w, a)?.sparMode === 'duel' ? 'duel' : 'training';
}

/**
 * Quem faz o papel de tanque no modo "lurar": o Knight do grupo (o de maior nível) e, sem Knight, o Paladin.
 * Pode ser o jogador: então os heróis só ajudam a atacar o que vier.
 */
export function lureTankId(w: World, party: Party): string | null {
  const alive = party.members.map((id) => actorById(w, id)).filter((a): a is PlayerEntity => !!a && !a.dead);
  for (const voc of ['knight', 'paladin'] as const) {
    const pick = alive
      .filter((a) => a.character.vocation === voc)
      .sort((a, b) => b.character.level - a.character.level)[0];
    if (pick) return pick.id;
  }
  return null;
}

/** Em treino o ataque para quando a vida do alvo chega a 50% (ele se cura e, acima disso, volta a apanhar). */
export const TRAINING_HP_FLOOR = 0.5;

export type PartySetting = {
  formation?: PartyFormation;
  targeting?: PartyTargeting;
  friendlyFire?: boolean;
  sparMode?: 'training' | 'duel';
};
/** Só o líder muda as regras do grupo. */
export function configureParty(w: World, leaderId: string, patch: PartySetting): PartyFail | null {
  const p = partyOf(w, leaderId);
  if (!p) return 'notMember';
  if (p.leaderId !== leaderId) return 'notLeader';
  Object.assign(p, patch);
  const txt =
    patch.formation !== undefined
      ? `Formação: ${patch.formation === 'free' ? 'livre' : patch.formation === 'follow' ? 'todos seguem o líder' : 'em fila atrás do líder'}.`
      : patch.targeting !== undefined
        ? `Alvo do grupo: ${patch.targeting === 'leader' ? 'o mesmo do líder' : patch.targeting === 'lure' ? 'lurar (o tanque puxa as criaturas)' : 'cada um o mais próximo'}.`
        : patch.friendlyFire === false
          ? 'Ataque entre membros: bloqueado.'
          : `Ataque entre membros: ${patch.sparMode === 'duel' ? 'duelo (até morrer)' : 'treino (param com 50% de vida)'}.`;
  notify(w, txt);
  return null;
}

/** Desfaz o grupo (só o líder). */
export function disbandParty(w: World, leaderId: string): PartyFail | null {
  const p = partyOf(w, leaderId);
  if (!p) return 'notMember';
  if (p.leaderId !== leaderId) return 'notLeader';
  dropParty(w, p);
  notify(w, 'O grupo foi desfeito.', p);
  return null;
}

/** Registra o rastro do líder (formação em fila). */
export function recordLeaderTrail(w: World): void {
  for (const p of allParties(w)) {
    const leader = actorById(w, p.leaderId);
    if (!leader) continue;
    const last = p.trail[0];
    if (!last || last.x !== leader.x || last.y !== leader.y) {
      p.trail.unshift({ x: leader.x, y: leader.y });
      if (p.trail.length > 24) p.trail.length = 24;
    }
  }
}

/** Posição desejada de um membro conforme a formação (null = livre). */
export function formationSpot(
  w: World,
  memberId: string,
): { x: number; y: number; tolerance: number } | null {
  const p = partyOf(w, memberId);
  if (!p || p.formation === 'free' || p.leaderId === memberId) return null;
  const leader = actorById(w, p.leaderId);
  if (!leader || leader.dead) return null;
  if (p.formation === 'line') {
    const order = p.members.filter((id) => id !== p.leaderId).indexOf(memberId);
    const spot = p.trail[Math.min(p.trail.length - 1, (order + 1) * 2)] ?? leader;
    return { x: spot.x, y: spot.y, tolerance: 0 };
  }
  return { x: leader.x, y: leader.y, tolerance: 1 }; // colado: ao lado do líder
}

/** Caveira ativa do personagem (ou null). */
export function skullOf(w: World, id: string): SkullState | null {
  const s = w.social.skulls.get(id);
  return s && s.until > pkNow(w) ? s : null;
}

export function hasSkull(w: World, id: string): boolean {
  return !!skullOf(w, id);
}

/** Coloca uma caveira: a de maior gravidade vence (vermelha > branca > amarela). Branca/amarela duram o PZ lock. */
function setSkull(w: World, id: string, kind: SkullKind, ms = 0): void {
  const cur = skullOf(w, id);
  if (kind === 'red') {
    if (!cur || cur.kind !== 'red') w.social.skulls.set(id, { kind, until: pkNow(w) + ms });
    else cur.until = Math.max(cur.until, pkNow(w) + ms);
    return;
  }
  if (cur && SKULL_RANK[kind] <= SKULL_RANK[cur.kind]) return;
  w.social.skulls.set(id, { kind, until: Math.max(w.social.pzLocks.get(id) ?? 0, pkNow(w)) });
}

/** PZ lock: quanto falta (ms) e se ainda está ativo. */
export function pzLockMs(w: World, id: string): number {
  return Math.max(0, (w.social.pzLocks.get(id) ?? 0) - pkNow(w));
}
export function isPzLocked(w: World, id: string): boolean {
  return pzLockMs(w, id) > 0;
}

/** Caveiras branca/amarela só somem quando o PZ lock some: o fim delas acompanha o do PZ lock. */
function syncSkull(w: World, id: string): void {
  const s = w.social.skulls.get(id);
  if (s && s.kind !== 'red') s.until = Math.max(w.social.pzLocks.get(id) ?? 0, pkNow(w));
}

function lockPz(w: World, id: string, ms: number): void {
  w.social.pzLocks.set(id, Math.max(w.social.pzLocks.get(id) ?? 0, pkNow(w) + ms));
  syncSkull(w, id);
}

/**
 * Qualquer combate (atacar ou ser atacado, por personagem, NPC ou criatura) renova o PZ lock (e a caveira
 * branca/amarela que o acompanha) para 30 s se faltarem menos que isso: é preciso ficar 30 s inteiros sem
 * lutar para eles acabarem. A caveira vermelha não renova.
 */
export function touchCombat(w: World, id: string): void {
  const lock = w.social.pzLocks.get(id);
  if (lock && lock > pkNow(w) && lock - pkNow(w) < SKULL_RENEW_MS) {
    w.social.pzLocks.set(id, pkNow(w) + SKULL_RENEW_MS);
    syncSkull(w, id);
  }
}

/** Registra o dano que a vítima recebeu (de personagens e de criaturas). */
export function recordDamage(w: World, victimId: string, sourceId: string, amount: number): void {
  if (amount <= 0) return;
  const list = (w.social.damageLog.get(victimId) ?? []).filter((d) => pkNow(w) - d.at < KILL_CREDIT_MS);
  list.push({ id: sourceId, amount, at: pkNow(w) });
  w.social.damageLog.set(victimId, list);
}

/**
 * Quem matou a vítima, para a regra de PK: até 2 personagens — o ÚLTIMO personagem que a feriu e o que deu o MAIOR
 * dano nos últimos 60 s (podem ser o mesmo). Só personagens contam: o dano das criaturas é ignorado, então quem mata
 * alguém junto com monstros (ou deixa o monstro dar o golpe final) leva a morte do mesmo jeito.
 */
export function killCredits(w: World, victimId: string): string[] {
  const sums = new Map<string, number>();
  let last: { id: string; at: number } | null = null;
  for (const d of w.social.damageLog.get(victimId) ?? []) {
    if (d.id === victimId || pkNow(w) - d.at >= KILL_CREDIT_MS || !actorById(w, d.id)) continue;
    sums.set(d.id, (sums.get(d.id) ?? 0) + d.amount);
    if (!last || d.at >= last.at) last = d;
  }
  if (!last) return [];
  const top = [...sums].sort((a, b) => b[1] - a[1])[0]![0];
  return top === last.id ? [top] : [last.id, top];
}

/** Por quanto tempo quem foi morto injustamente pode se vingar do assassino (caveira amarela só para ele). */
export const REVENGE_MS = 15 * 60000;

/** `avenger` pode se vingar de `killerId` (foi morto injustamente por ele há pouco)? */
export function hasRevenge(w: World, avengerId: string, killerId: string): boolean {
  return (w.social.revenge.get(`${avengerId}>${killerId}`) ?? -Infinity) > pkNow(w);
}

/**
 * Caveira de `id` como `viewerId` a vê: a caveira real ou, se o viewer foi morto injustamente por ele há pouco e ele
 * não tem caveira pior, a amarela da vingança (só o viewer a enxerga).
 */
export function skullSeenBy(w: World, viewerId: string, id: string): SkullKind | null {
  const s = skullOf(w, id)?.kind ?? null;
  if (s === 'red' || s === 'white') return s;
  return hasRevenge(w, viewerId, id) ? 'yellow' : s;
}

/** Aviso na tela (e no registro) para o jogador humano sobre PK. */
function pkNotice(w: World, id: string, text: string, danger: boolean): void {
  if (id !== w.human.id) return;
  message(w, text, 'warning');
  w.human.scope.events.emit('pkNotice', { text, danger });
}

/**
 * Registra um ataque entre personagens e aplica as marcas conforme a caveira da vítima:
 * - vítima sem caveira: o atacante vira agressor (caveira branca) — e quem revida contra ele não ganha caveira;
 * - vítima com caveira branca: um terceiro que a ataca sem ter sido atacado por ela fica com caveira amarela;
 * - vítima com caveira vermelha: justo, nada muda.
 * Todo atacante recebe PZ lock de 2 min.
 */
export function registerAggression(w: World, attackerId: string, victimId: string): void {
  const defending = attackedRecently(w, victimId, attackerId, PZ_LOCK_ATTACK_MS); // a vítima atacou o atacante antes
  w.social.aggressions.set(`${attackerId}>${victimId}`, pkNow(w));
  if (isSparring(w, attackerId, victimId)) return; // treino no grupo não dá caveira nem PZ lock
  lockPz(w, attackerId, PZ_LOCK_ATTACK_MS);
  const victim = skullOf(w, victimId)?.kind ?? null;
  if (hasRevenge(w, attackerId, victimId)) {
    // vingança contra quem o matou injustamente: só o PZ lock, sem caveira
  } else if (victim === 'red') {
    // atacar um caveira vermelha é justo: nada muda
  } else if (victim === 'white') {
    // revidar contra quem te atacou é defesa; já um terceiro que bate numa caveira branca fica amarelo
    if (!defending && !skullOf(w, attackerId)) {
      setSkull(w, attackerId, 'yellow');
      pkNotice(
        w,
        attackerId,
        'Você atacou uma caveira branca sem ser atacado por ela: caveira AMARELA.',
        false,
      );
    }
  } else if (!defending) {
    // vítima sem caveira: o atacante vira agressor
    const had = skullOf(w, attackerId);
    setSkull(w, attackerId, 'white');
    if (!had || had.kind === 'yellow')
      pkNotice(w, attackerId, 'Ataque injusto: você ficou com caveira BRANCA.', false);
  }
  touchCombat(w, attackerId);
  touchCombat(w, victimId);
}

/**
 * Matou outro personagem: PZ lock de 5 min (a caveira branca/amarela acompanha). Se a vítima não tinha caveira a
 * morte é injusta (aviso na tela); a 3ª em 24 h dá caveira vermelha por 24 h. Matar uma caveira
 * branca/amarela/vermelha é justo.
 */
export function registerPlayerKill(
  w: World,
  killerId: string,
  victimSkull: SkullKind | null,
  victimName = 'o personagem',
  victimId?: string,
): void {
  if (killerId === victimId) return;
  lockPz(w, killerId, PZ_LOCK_KILL_MS);
  // a vingança (a vítima tinha matado o killer injustamente há pouco) é justa: só o PZ lock
  if (victimId && hasRevenge(w, killerId, victimId)) {
    w.social.revenge.delete(`${killerId}>${victimId}`);
    pkNotice(w, killerId, `Vingança cumprida contra ${victimName}: sem caveira, só o PZ lock.`, false);
    return;
  }
  if (victimSkull !== null) return;
  // a vítima vê o assassino com caveira amarela e pode se vingar sem caveira nem morte injusta
  if (victimId) {
    w.social.revenge.set(`${victimId}>${killerId}`, pkNow(w) + REVENGE_MS);
    pkNotice(
      w,
      victimId,
      `${actorName(w, killerId)} te matou injustamente: para você ele está com caveira AMARELA por 15 min — pode atacá-lo e matá-lo sem caveira nem morte injusta (só o PZ lock).`,
      false,
    );
  }
  setSkull(w, killerId, 'white');
  syncSkull(w, killerId);
  const list = (w.social.unjust.get(killerId) ?? []).filter((t) => pkNow(w) - t < UNJUST_WINDOW_MS);
  list.push(pkNow(w));
  w.social.unjust.set(killerId, list);
  if (list.length >= UNJUST_KILLS_FOR_RED) {
    setSkull(w, killerId, 'red', RED_SKULL_MS);
    pkNotice(
      w,
      killerId,
      `MORTE INJUSTA! (${list.length}/${UNJUST_KILLS_FOR_RED}) Você ficou com caveira VERMELHA por 24 horas!`,
      true,
    );
  } else
    pkNotice(
      w,
      killerId,
      `MORTE INJUSTA! Você matou ${victimName}, que não tinha caveira (${list.length}/${UNJUST_KILLS_FOR_RED} em 24 h; a 3ª dá caveira vermelha).`,
      true,
    );
}

/** Morreu: perde o PZ lock; a caveira vermelha continua contando, as demais somem (renasce sem caveira). */
export function onPlayerDeath(w: World, id: string): void {
  w.social.pzLocks.delete(id);
  w.social.damageLog.delete(id);
  if (skullOf(w, id)?.kind !== 'red') w.social.skulls.delete(id);
}

// ------------------------------------------------------------------ persistência (tempo real, vale entre sessões)
/** Copia o estado de PK salvo no personagem (tempo real) para o mundo (tempo de simulação). */
export function loadPk(w: World, a: PlayerEntity): void {
  const pk = a.character.pk;
  if (!pk) return;
  const real = Date.now();
  if (pk.skull && pk.skullUntil > real)
    w.social.skulls.set(a.id, { kind: pk.skull, until: pkNow(w) + (pk.skullUntil - real) });
  if (pk.pzLockUntil > real) w.social.pzLocks.set(a.id, pkNow(w) + (pk.pzLockUntil - real));
  w.social.unjust.set(
    a.id,
    pk.unjust.filter((t) => real - t < UNJUST_WINDOW_MS).map((t) => pkNow(w) - (real - t)),
  );
}

/** Grava o estado de PK do mundo no personagem (para salvar). */
export function savePk(w: World, a: PlayerEntity): void {
  const real = Date.now();
  const s = skullOf(w, a.id);
  a.character.pk = {
    skull: s?.kind ?? null,
    skullUntil: s ? real + (s.until - pkNow(w)) : 0,
    pzLockUntil: isPzLocked(w, a.id) ? real + pzLockMs(w, a.id) : 0,
    unjust: (w.social.unjust.get(a.id) ?? [])
      .filter((t) => pkNow(w) - t < UNJUST_WINDOW_MS)
      .map((t) => real - (pkNow(w) - t)),
  };
}

/** `a` atacou `b` nos últimos `ms`? */
export function attackedRecently(w: World, a: string, b: string, ms = 30000): boolean {
  return pkNow(w) - (w.social.aggressions.get(`${a}>${b}`) ?? -Infinity) < ms;
}

/** Limpa convites vencidos e a caveira expirada. */
export function updateSocial(w: World): void {
  recordLeaderTrail(w);
  if (w.social.invites.some((i) => i.expiresAt <= w.now))
    w.social.invites = w.social.invites.filter((i) => i.expiresAt > w.now);
  for (const [id, sk] of w.social.skulls) if (sk.until <= pkNow(w)) w.social.skulls.delete(id);
  for (const [id, until] of w.social.pzLocks) if (until <= pkNow(w)) w.social.pzLocks.delete(id);
  for (const [k, until] of w.social.revenge) if (until <= pkNow(w)) w.social.revenge.delete(k);
  // membros que deixaram de existir saem do grupo
  for (const p of [...allParties(w)]) {
    if (!p.members.some((id) => !allActors(w).some((a) => a.id === id))) continue;
    p.members = p.members.filter((id) => allActors(w).some((a) => a.id === id));
    if (p.members.length < 2) dropParty(w, p);
    else if (!p.members.includes(p.leaderId)) p.leaderId = p.members[0]!;
  }
}
