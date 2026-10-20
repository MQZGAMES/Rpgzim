// Interação entre personagens-jogadores (humano e heróis): grupo e PK.
// - Grupo: convite (expira), aceitar/recusar, sair, remover, passar liderança; XP dividida igualmente.
// - PK (estilo Tibia): só com a permissão de PK do mundo ligada, fora de áreas protegidas e nunca entre membros
//   do grupo. Atacar quem não tem caveira dá caveira branca; um terceiro que ataca uma caveira branca sem ter sido
//   atacado por ela fica com caveira amarela (quem revida contra o agressor não ganha nada); 3 mortes injustas em
//   24 h dão caveira vermelha (24 h). Quem ataca fica com PZ lock (2 min; 5 min se matar) e as caveiras branca e
//   amarela duram exatamente o PZ lock. Os dois últimos personagens que bateram na vítima contam a morte.
import { chebyshev } from '../../domain/value-objects/position';
import { isPz } from '../world/GameMap';
import type { PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors, message } from '../simulation/World';

export type PartyFormation = 'free' | 'follow' | 'line';
export type PartyTargeting = 'nearest' | 'leader';

export interface Party {
  leaderId: string;
  members: string[];
  /** Livre: cada um segue seu plano; seguir: todos andam perto do líder; fila: em fila atrás do líder. */
  formation: PartyFormation;
  /** Cada um ataca o inimigo mais próximo ou todos atacam o alvo do líder. */
  targeting: PartyTargeting;
  /** Membros podem se atacar (treino), sem caveira nem perda de ouro. */
  friendlyFire: boolean;
  /** Últimas posições do líder (para a formação em fila). */
  trail: { x: number; y: number }[];
}

export interface PartyInvite {
  fromId: string;
  toId: string;
  expiresAt: number;
}

export interface SocialState {
  party: Party | null;
  invites: PartyInvite[];
  /** Permissão de PK (ligada pelo jogador). */
  pvp: boolean;
  /** Caveira de cada personagem: tipo e até quando. */
  skulls: Map<string, SkullState>;
  /** PZ lock: até quando o personagem não pode entrar em áreas protegidas. */
  pzLocks: Map<string, number>;
  /** Mortes injustas (vítima sem caveira) de cada personagem: instantes, para a caveira vermelha. */
  unjust: Map<string, number[]>;
  /** Últimos personagens que bateram em cada vítima (até 2, o mais recente primeiro): dividem o crédito da morte. */
  hitters: Map<string, { id: string; at: number }[]>;
  /** Último ataque de A em B: chave `${atacante}>${vitima}` -> instante. */
  aggressions: Map<string, number>;
}

export function newSocialState(pvp = false): SocialState {
  return { party: null, invites: [], pvp, skulls: new Map(), pzLocks: new Map(), unjust: new Map(), hitters: new Map(), aggressions: new Map() };
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
/** Quem bateu na vítima nesta janela (os dois últimos) conta a morte. */
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
export function partyOf(w: World, id: string): Party | null {
  const p = w.social.party;
  return p && p.members.includes(id) ? p : null;
}

export function sameParty(w: World, a: string, b: string): boolean {
  const p = w.social.party;
  return !!p && p.members.includes(a) && p.members.includes(b);
}

function notify(w: World, text: string): void {
  // mensagens de grupo vão para o registro do jogador humano (barramento principal)
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
  const party = w.social.party;
  // o jogador humano convida mesmo sem ser o líder (os demais membros são heróis que seguem o que ele decide)
  if (party && party.members.includes(fromId) && party.leaderId !== fromId && fromId !== w.human.id) return 'notLeader';
  if (party && party.members.includes(toId)) return 'alreadyInParty';
  w.social.invites = w.social.invites.filter((i) => !(i.fromId === fromId && i.toId === toId) && i.expiresAt > w.now);
  w.social.invites.push({ fromId, toId, expiresAt: w.now + INVITE_MS });
  w.human.scope.events.emit('partyInvite', { fromId, toId, fromName: from.character.name, toName: to.character.name });
  if (fromId === w.human.id) message(w, `Convite enviado para ${to.character.name}.`, 'system');
  return null;
}

export function pendingInviteFor(w: World, toId: string): PartyInvite | null {
  return w.social.invites.find((i) => i.toId === toId && i.expiresAt > w.now) ?? null;
}

export function acceptInvite(w: World, toId: string, fromId?: string): PartyFail | null {
  const inv = w.social.invites.find((i) => i.toId === toId && (!fromId || i.fromId === fromId) && i.expiresAt > w.now);
  if (!inv) return 'noInvite';
  w.social.invites = w.social.invites.filter((i) => i !== inv && i.toId !== toId);
  const party = w.social.party;
  if (party && party.members.includes(inv.fromId)) {
    if (!party.members.includes(toId)) party.members.push(toId);
  } else if (!party) w.social.party = { leaderId: inv.fromId, members: [inv.fromId, toId], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] };
  else return 'alreadyInParty';
  notify(w, `${actorName(w, toId)} entrou no grupo de ${actorName(w, w.social.party!.leaderId)}.`);
  return null;
}

export function declineInvite(w: World, toId: string): void {
  const inv = pendingInviteFor(w, toId);
  if (!inv) return;
  w.social.invites = w.social.invites.filter((i) => i !== inv);
  notify(w, `${actorName(w, toId)} recusou o convite de grupo.`);
}

export function leaveParty(w: World, id: string): PartyFail | null {
  const p = partyOf(w, id);
  if (!p) return 'notMember';
  p.members = p.members.filter((m) => m !== id);
  const name = actorName(w, id);
  if (p.members.length < 2) {
    w.social.party = null;
    notify(w, `${name} saiu. O grupo foi desfeito.`);
    return null;
  }
  if (p.leaderId === id) p.leaderId = p.members[0]!;
  notify(w, `${name} saiu do grupo.`);
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
  notify(w, toId === w.human.id ? 'Você agora é o líder do grupo.' : `${actorName(w, toId)} agora é o líder do grupo.`);
  return null;
}

/** Quem recebe parte da XP de um monstro abatido por `killerId` (o próprio, ou o grupo próximo e vivo). */
export function xpReceivers(w: World, killerId: string, at: { x: number; y: number }): PlayerEntity[] {
  const killer = actorById(w, killerId);
  if (!killer) return [];
  const p = partyOf(w, killerId);
  if (!p) return [killer];
  return p.members.map((id) => actorById(w, id)).filter((a): a is PlayerEntity => !!a && !a.dead && (a === killer || chebyshev(a, at) <= PARTY_SHARE_RANGE));
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
  if (party && !w.social.party!.friendlyFire) return 'party';
  if (!party && !w.social.pvp) return 'off';
  if (isPz(w.map, attacker.x, attacker.y) || isPz(w.map, victim.x, victim.y)) return 'pz';
  return null;
}

/** Treino entre membros do grupo (ataque permitido, sem caveira e sem perda de ouro). */
export function isSparring(w: World, a: string, b: string): boolean {
  return sameParty(w, a, b) && !!w.social.party?.friendlyFire;
}

export type PartySetting = { formation?: PartyFormation; targeting?: PartyTargeting; friendlyFire?: boolean };
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
        ? `Alvo do grupo: ${patch.targeting === 'leader' ? 'o mesmo do líder' : 'cada um o mais próximo'}.`
        : `Ataque entre membros: ${patch.friendlyFire ? 'permitido (treino)' : 'bloqueado'}.`;
  notify(w, txt);
  return null;
}

/** Desfaz o grupo (só o líder). */
export function disbandParty(w: World, leaderId: string): PartyFail | null {
  const p = partyOf(w, leaderId);
  if (!p) return 'notMember';
  if (p.leaderId !== leaderId) return 'notLeader';
  w.social.party = null;
  notify(w, 'O grupo foi desfeito.');
  return null;
}

/** Registra o rastro do líder (formação em fila). */
export function recordLeaderTrail(w: World): void {
  const p = w.social.party;
  if (!p) return;
  const leader = actorById(w, p.leaderId);
  if (!leader) return;
  const last = p.trail[0];
  if (!last || last.x !== leader.x || last.y !== leader.y) {
    p.trail.unshift({ x: leader.x, y: leader.y });
    if (p.trail.length > 24) p.trail.length = 24;
  }
}

/** Posição desejada de um membro conforme a formação (null = livre). */
export function formationSpot(w: World, memberId: string): { x: number; y: number; tolerance: number } | null {
  const p = partyOf(w, memberId);
  if (!p || p.formation === 'free' || p.leaderId === memberId) return null;
  const leader = actorById(w, p.leaderId);
  if (!leader || leader.dead) return null;
  if (p.formation === 'line') {
    const order = p.members.filter((id) => id !== p.leaderId).indexOf(memberId);
    const spot = p.trail[Math.min(p.trail.length - 1, (order + 1) * 2)] ?? leader;
    return { x: spot.x, y: spot.y, tolerance: 0 };
  }
  return { x: leader.x, y: leader.y, tolerance: 2 };
}

/** Caveira ativa do personagem (ou null). */
export function skullOf(w: World, id: string): SkullState | null {
  const s = w.social.skulls.get(id);
  return s && s.until > w.now ? s : null;
}

export function hasSkull(w: World, id: string): boolean {
  return !!skullOf(w, id);
}

/** Coloca uma caveira: a de maior gravidade vence (vermelha > branca > amarela). Branca/amarela duram o PZ lock. */
function setSkull(w: World, id: string, kind: SkullKind, ms = 0): void {
  const cur = skullOf(w, id);
  if (kind === 'red') {
    if (!cur || cur.kind !== 'red') w.social.skulls.set(id, { kind, until: w.now + ms });
    else cur.until = Math.max(cur.until, w.now + ms);
    return;
  }
  if (cur && SKULL_RANK[kind] <= SKULL_RANK[cur.kind]) return;
  w.social.skulls.set(id, { kind, until: Math.max(w.social.pzLocks.get(id) ?? 0, w.now) });
}

/** PZ lock: quanto falta (ms) e se ainda está ativo. */
export function pzLockMs(w: World, id: string): number {
  return Math.max(0, (w.social.pzLocks.get(id) ?? 0) - w.now);
}
export function isPzLocked(w: World, id: string): boolean {
  return pzLockMs(w, id) > 0;
}

/** Caveiras branca/amarela só somem quando o PZ lock some: o fim delas acompanha o do PZ lock. */
function syncSkull(w: World, id: string): void {
  const s = w.social.skulls.get(id);
  if (s && s.kind !== 'red') s.until = Math.max(w.social.pzLocks.get(id) ?? 0, w.now);
}

function lockPz(w: World, id: string, ms: number): void {
  w.social.pzLocks.set(id, Math.max(w.social.pzLocks.get(id) ?? 0, w.now + ms));
  syncSkull(w, id);
}

/**
 * Qualquer combate (atacar ou ser atacado, por personagem, NPC ou criatura) renova o PZ lock (e a caveira
 * branca/amarela que o acompanha) para 30 s se faltarem menos que isso: é preciso ficar 30 s inteiros sem
 * lutar para eles acabarem. A caveira vermelha não renova.
 */
export function touchCombat(w: World, id: string): void {
  const lock = w.social.pzLocks.get(id);
  if (lock && lock > w.now && lock - w.now < SKULL_RENEW_MS) {
    w.social.pzLocks.set(id, w.now + SKULL_RENEW_MS);
    syncSkull(w, id);
  }
}

/** Anota quem bateu na vítima: os dois últimos (distintos) dividem o crédito da morte. */
function noteHit(w: World, attackerId: string, victimId: string): void {
  const list = (w.social.hitters.get(victimId) ?? []).filter((h) => h.id !== attackerId && w.now - h.at < KILL_CREDIT_MS);
  list.unshift({ id: attackerId, at: w.now });
  w.social.hitters.set(victimId, list.slice(0, 2));
}

/** Quem conta a morte da vítima: os dois últimos personagens que bateram nela nos últimos 60 s. */
export function killCredits(w: World, victimId: string): string[] {
  return (w.social.hitters.get(victimId) ?? []).filter((h) => w.now - h.at < KILL_CREDIT_MS).map((h) => h.id);
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
  w.social.aggressions.set(`${attackerId}>${victimId}`, w.now);
  if (isSparring(w, attackerId, victimId)) return; // treino no grupo não dá caveira nem PZ lock
  noteHit(w, attackerId, victimId);
  lockPz(w, attackerId, PZ_LOCK_ATTACK_MS);
  const victim = skullOf(w, victimId)?.kind ?? null;
  if (victim === 'red') {
    // atacar um caveira vermelha é justo: nada muda
  } else if (victim === 'white') {
    // revidar contra quem te atacou é defesa; já um terceiro que bate numa caveira branca fica amarelo
    if (!defending && !skullOf(w, attackerId)) {
      setSkull(w, attackerId, 'yellow');
      pkNotice(w, attackerId, 'Você atacou uma caveira branca sem ser atacado por ela: caveira AMARELA.', false);
    }
  } else if (!defending) {
    // vítima sem caveira: o atacante vira agressor
    const had = skullOf(w, attackerId);
    setSkull(w, attackerId, 'white');
    if (!had || had.kind === 'yellow') pkNotice(w, attackerId, 'Ataque injusto: você ficou com caveira BRANCA.', false);
  }
  touchCombat(w, attackerId);
  touchCombat(w, victimId);
}

/**
 * Matou outro personagem: PZ lock de 5 min (a caveira branca/amarela acompanha). Se a vítima não tinha caveira a
 * morte é injusta (aviso na tela); a 3ª em 24 h dá caveira vermelha por 24 h. Matar uma caveira
 * branca/amarela/vermelha é justo.
 */
export function registerPlayerKill(w: World, killerId: string, victimSkull: SkullKind | null, victimName = 'o personagem'): void {
  lockPz(w, killerId, PZ_LOCK_KILL_MS);
  if (victimSkull !== null) return;
  setSkull(w, killerId, 'white');
  syncSkull(w, killerId);
  const list = (w.social.unjust.get(killerId) ?? []).filter((t) => w.now - t < UNJUST_WINDOW_MS);
  list.push(w.now);
  w.social.unjust.set(killerId, list);
  if (list.length >= UNJUST_KILLS_FOR_RED) {
    setSkull(w, killerId, 'red', RED_SKULL_MS);
    pkNotice(w, killerId, `MORTE INJUSTA! (${list.length}/${UNJUST_KILLS_FOR_RED}) Você ficou com caveira VERMELHA por 24 horas!`, true);
  } else pkNotice(w, killerId, `MORTE INJUSTA! Você matou ${victimName}, que não tinha caveira (${list.length}/${UNJUST_KILLS_FOR_RED} em 24 h; a 3ª dá caveira vermelha).`, true);
}

/** Morreu: perde o PZ lock; a caveira vermelha continua contando, as demais somem (renasce sem caveira). */
export function onPlayerDeath(w: World, id: string): void {
  w.social.pzLocks.delete(id);
  w.social.hitters.delete(id);
  if (skullOf(w, id)?.kind !== 'red') w.social.skulls.delete(id);
}

// ------------------------------------------------------------------ persistência (tempo real, vale entre sessões)
/** Copia o estado de PK salvo no personagem (tempo real) para o mundo (tempo de simulação). */
export function loadPk(w: World, a: PlayerEntity): void {
  const pk = a.character.pk;
  if (!pk) return;
  const real = Date.now();
  if (pk.skull && pk.skullUntil > real) w.social.skulls.set(a.id, { kind: pk.skull, until: w.now + (pk.skullUntil - real) });
  if (pk.pzLockUntil > real) w.social.pzLocks.set(a.id, w.now + (pk.pzLockUntil - real));
  w.social.unjust.set(
    a.id,
    pk.unjust.filter((t) => real - t < UNJUST_WINDOW_MS).map((t) => w.now - (real - t)),
  );
}

/** Grava o estado de PK do mundo no personagem (para salvar). */
export function savePk(w: World, a: PlayerEntity): void {
  const real = Date.now();
  const s = skullOf(w, a.id);
  a.character.pk = {
    skull: s?.kind ?? null,
    skullUntil: s ? real + (s.until - w.now) : 0,
    pzLockUntil: isPzLocked(w, a.id) ? real + pzLockMs(w, a.id) : 0,
    unjust: (w.social.unjust.get(a.id) ?? []).filter((t) => w.now - t < UNJUST_WINDOW_MS).map((t) => real - (w.now - t)),
  };
}

/** `a` atacou `b` nos últimos `ms`? */
export function attackedRecently(w: World, a: string, b: string, ms = 30000): boolean {
  return w.now - (w.social.aggressions.get(`${a}>${b}`) ?? -Infinity) < ms;
}

/** Limpa convites vencidos e a caveira expirada. */
export function updateSocial(w: World): void {
  recordLeaderTrail(w);
  if (w.social.invites.some((i) => i.expiresAt <= w.now)) w.social.invites = w.social.invites.filter((i) => i.expiresAt > w.now);
  for (const [id, sk] of w.social.skulls) if (sk.until <= w.now) w.social.skulls.delete(id);
  for (const [id, until] of w.social.pzLocks) if (until <= w.now) w.social.pzLocks.delete(id);
  // membros que deixaram de existir saem do grupo
  const p = w.social.party;
  if (p && p.members.some((id) => !allActors(w).some((a) => a.id === id))) {
    p.members = p.members.filter((id) => allActors(w).some((a) => a.id === id));
    if (p.members.length < 2) w.social.party = null;
    else if (!p.members.includes(p.leaderId)) p.leaderId = p.members[0]!;
  }
}
