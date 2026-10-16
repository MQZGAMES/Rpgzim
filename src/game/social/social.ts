// Interação entre personagens-jogadores (humano e heróis): grupo e PK.
// - Grupo: convite (expira), aceitar/recusar, sair, remover, passar liderança; XP dividida igualmente.
// - PK: só com a permissão de PK do mundo ligada, fora de áreas protegidas e nunca entre membros do grupo.
//   Quem ataca um personagem sem caveira ganha caveira (5 min; 15 min se matar).
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
  /** Caveira: até quando cada personagem está marcado como agressor. */
  skulls: Map<string, number>;
  /** Último ataque de A em B: chave `${atacante}>${vitima}` -> instante. */
  aggressions: Map<string, number>;
}

export function newSocialState(pvp = false): SocialState {
  return { party: null, invites: [], pvp, skulls: new Map(), aggressions: new Map() };
}

export const INVITE_MS = 60000;
const SKULL_MS = 5 * 60000;
const KILL_SKULL_MS = 15 * 60000;
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

export function hasSkull(w: World, id: string): boolean {
  return (w.social.skulls.get(id) ?? 0) > w.now;
}

/** Registra um ataque entre personagens e aplica a caveira (legítima defesa contra quem tem caveira não marca). */
export function registerAggression(w: World, attackerId: string, victimId: string): void {
  w.social.aggressions.set(`${attackerId}>${victimId}`, w.now);
  if (isSparring(w, attackerId, victimId)) return; // treino no grupo não dá caveira
  const selfDefense = hasSkull(w, victimId) || w.now - (w.social.aggressions.get(`${victimId}>${attackerId}`) ?? -Infinity) < 60000;
  if (!selfDefense) w.social.skulls.set(attackerId, Math.max(w.social.skulls.get(attackerId) ?? 0, w.now + SKULL_MS));
}

export function registerPlayerKill(w: World, killerId: string): void {
  w.social.skulls.set(killerId, Math.max(w.social.skulls.get(killerId) ?? 0, w.now + KILL_SKULL_MS));
}

/** `a` atacou `b` nos últimos `ms`? */
export function attackedRecently(w: World, a: string, b: string, ms = 30000): boolean {
  return w.now - (w.social.aggressions.get(`${a}>${b}`) ?? -Infinity) < ms;
}

/** Limpa convites vencidos e a caveira expirada. */
export function updateSocial(w: World): void {
  recordLeaderTrail(w);
  if (w.social.invites.some((i) => i.expiresAt <= w.now)) w.social.invites = w.social.invites.filter((i) => i.expiresAt > w.now);
  for (const [id, until] of w.social.skulls) if (until <= w.now) w.social.skulls.delete(id);
  // membros que deixaram de existir saem do grupo
  const p = w.social.party;
  if (p && p.members.some((id) => !allActors(w).some((a) => a.id === id))) {
    p.members = p.members.filter((id) => allActors(w).some((a) => a.id === id));
    if (p.members.length < 2) w.social.party = null;
    else if (!p.members.includes(p.leaderId)) p.leaderId = p.members[0]!;
  }
}
