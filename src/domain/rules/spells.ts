// Validação de magias: todas as condições são checadas antes de gastar mana ou iniciar cooldown.
import type { SpellDef } from '../entities/definitions';
import type { VocationId } from '../value-objects/ids';

export type CastFailReason =
  | 'dead'
  | 'vocation'
  | 'level'
  | 'magicLevel'
  | 'cooldown'
  | 'noMana'
  | 'noTarget'
  | 'invalidTarget'
  | 'outOfRange'
  | 'noLineOfSight'
  | 'protectionZone'
  | 'weapon';

export interface CastContext {
  vocation: VocationId;
  level: number;
  magicLevel: number;
  mana: number;
  dead: boolean;
  cooldownRemaining: number;
  globalCooldownRemaining: number;
  inProtectionZone: boolean;
  /** Estado do alvo (para magias com alvo). */
  target: { exists: boolean; alive: boolean; hostile: boolean; distance: number; lineOfSight: boolean } | null;
  weaponKind: 'melee' | 'distance' | 'wand';
}

export type CastCheck = { ok: true } | { ok: false; reason: CastFailReason; detail?: string };

export function validateCast(spell: SpellDef, ctx: CastContext): CastCheck {
  if (ctx.dead) return { ok: false, reason: 'dead' };
  if (!spell.vocations.includes(ctx.vocation)) return { ok: false, reason: 'vocation' };
  if (ctx.level < spell.minLevel) return { ok: false, reason: 'level', detail: String(spell.minLevel) };
  if (ctx.magicLevel < spell.minMagicLevel) return { ok: false, reason: 'magicLevel', detail: String(spell.minMagicLevel) };
  if (ctx.cooldownRemaining > 0 || ctx.globalCooldownRemaining > 0) return { ok: false, reason: 'cooldown' };
  if (ctx.mana < spell.manaCost) return { ok: false, reason: 'noMana' };
  if (spell.requiresWeapon && spell.requiresWeapon !== ctx.weaponKind) return { ok: false, reason: 'weapon', detail: spell.requiresWeapon };
  const offensive = spell.effect === 'damage';
  if (offensive && ctx.inProtectionZone) return { ok: false, reason: 'protectionZone' };
  if (spell.target === 'target' || spell.target === 'areaTarget') {
    const t = ctx.target;
    if (!t || !t.exists) return { ok: false, reason: 'noTarget' };
    if (!t.alive || (offensive && !t.hostile)) return { ok: false, reason: 'invalidTarget' };
    if (t.distance > spell.range) return { ok: false, reason: 'outOfRange' };
    if (!t.lineOfSight) return { ok: false, reason: 'noLineOfSight' };
  }
  return { ok: true };
}

export function castFailMessage(reason: CastFailReason, detail?: string): string {
  switch (reason) {
    case 'dead':
      return 'Você está morto.';
    case 'vocation':
      return 'Sua vocação não conhece esta magia.';
    case 'level':
      return `Requer nível ${detail}.`;
    case 'magicLevel':
      return `Requer Magic Level ${detail}.`;
    case 'cooldown':
      return 'Magia em recarga.';
    case 'noMana':
      return 'Mana insuficiente.';
    case 'noTarget':
      return 'Selecione um alvo primeiro.';
    case 'invalidTarget':
      return 'Alvo inválido.';
    case 'outOfRange':
      return 'Alvo fora de alcance.';
    case 'noLineOfSight':
      return 'Sem linha de visão até o alvo.';
    case 'protectionZone':
      return 'Ações ofensivas não são permitidas em área protegida.';
    case 'weapon':
      return detail === 'melee' ? 'Requer uma arma corpo a corpo.' : 'Requer uma arma de distância.';
  }
}
