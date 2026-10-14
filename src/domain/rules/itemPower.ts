// Números de ataque/defesa exibidos nos itens e comparação "é melhor que o equipado?".
import type { CharacterState } from '../entities/character';
import type { ItemDef } from '../entities/definitions';
import type { GameData } from '../entities/gameData';

/** Ataque exibido: ataque da arma ou dano médio de varinhas/cajados. */
export function itemAttack(def: ItemDef): number | null {
  const w = def.weapon;
  if (!w) return null;
  if (w.kind === 'wand') return w.damage ? Math.round((w.damage[0] + w.damage[1]) / 2) : 0;
  return w.attack;
}

/** Defesa exibida: armadura + defesa de escudo. */
export function itemDefense(def: ItemDef): number | null {
  const v = (def.armor ?? 0) + (def.defense ?? 0);
  return v > 0 ? v : null;
}

/** Pontuação geral para comparar itens do mesmo slot (ataque domina em armas). */
export function itemScore(def: ItemDef): number {
  const b = def.bonuses;
  const skills = Object.values(b?.skills ?? {}).reduce((s, v) => s + (v ?? 0), 0);
  return (
    (itemAttack(def) ?? 0) * 100 +
    (itemDefense(def) ?? 0) * 10 +
    (b?.maxHealth ?? 0) / 2 +
    (b?.maxMana ?? 0) / 2 +
    (b?.magicLevel ?? 0) * 15 +
    skills * 5 +
    (b?.speed ?? 0) * 20
  );
}

export function canUseItem(def: ItemDef, c: CharacterState): boolean {
  return (!def.vocations || def.vocations.includes(c.vocation)) && (def.minLevel ?? 1) <= c.level;
}

/** O item pode ser equipado agora e é melhor que o que está no slot (ou o slot está vazio). */
export function isUpgrade(data: GameData, c: CharacterState, def: ItemDef): boolean {
  if (!def.slot || def.slot === 'ammo' || !canUseItem(def, c)) return false;
  const cur = c.equipment[def.slot];
  const curDef = cur ? data.items[cur.itemId] : undefined;
  if (!curDef) return true;
  // armas só se comparam com armas do mesmo tipo (uma varinha não "melhora" uma espada)
  if (def.weapon && curDef.weapon && def.weapon.kind !== curDef.weapon.kind) return false;
  return itemScore(def) > itemScore(curDef);
}
