// Parâmetros de balanceamento documentados em docs/BALANCE.md.
import type { BalanceConfig } from '../../domain/entities/definitions';

export const BALANCE: BalanceConfig = {
  // XP total para o nível L = 45 * (L - 1)^2.15  -> nv2: 45, nv3: 199, nv4: 486, nv5: 885
  experience: { base: 45, exponent: 2.15 },
  // Tentativas para subir do nível n: 22 * 1.12^(n - 10) * multiplicador da vocação
  skills: { startLevel: 10, baseTries: 22, growth: 1.12 },
  // Mana gasta para subir do Magic Level n: 60 * 1.25^n * multiplicador da vocação
  magic: { baseMana: 60, growth: 1.25 },
  combat: {
    globalSpellCooldownMs: 1000,
    potionCooldownMs: 1000,
    unarmedAttack: 7,
    blockChanceBase: 0.05,
    blockChancePerSkill: 0.008,
    maxBlockChance: 0.45,
    shieldingTriesPerHit: 1,
    shieldingWindowMs: 2000,
    shieldingMaxAttackers: 2,
    shieldingAttackWindowMs: 5000,
  },
  player: { inventorySlots: 20, depotSlots: 40, regenTickMs: 2000, deathXpPenalty: 0.5, deathSkillPenalty: 0.5, respawnInvulnerableMs: 3000 },
  world: { lootDecayMs: 180000, corpseDecayMs: 15000, aiSleepDistance: 24 },
};
