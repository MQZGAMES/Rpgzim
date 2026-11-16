import type { SpellDef } from '../entities/definitions';
import { WAND_SPELL_SCALE } from './damage';

const n = (value: number) => Number(value.toFixed(3)).toLocaleString('pt-BR');
const tiles = (v: number) => `${v} ${v === 1 ? 'casa' : 'casas'}`;

/** Coefficients come directly from the spell used by combat. */
export function spellDetails(s: SpellDef): string[] {
  const lines: string[] = [];
  if (s.formula) {
    const f = s.formula;
    const power = f.kind === 'magic' ? 'ML' : f.kind === 'distance' ? 'skill de distância' : 'skill da arma';
    const sum = `${n(f.levelFactor)} × nível + ${n(f.powerFactor)} × ${power}`;
    const formula =
      f.kind === 'magic'
        ? `(${sum} + ${n(f.base)})`
        : `((${sum}) × (1 + ataque da arma / 20) + ${n(f.base)})`;
    const wand =
      f.kind === 'magic' && s.effect === 'damage'
        ? ` × (1 + dano médio da varinha / ${WAND_SPELL_SCALE})`
        : '';
    lines.push(
      `${s.effect === 'heal' ? 'Cura' : 'Dano'}: ${formula}${wand} × bônus da vocação × (${n(f.min)} a ${n(f.max)}). Resultado arredondado.`,
    );
    const ml = f.kind === 'magic' ? '; ML = Magic Level' : '';
    lines.push(
      s.effect === 'heal'
        ? `Recuperação limitada à vida máxima${ml}.`
        : `Dano por alvo, antes de armadura, resistências e reduções${ml}.`,
    );
  }
  if (s.buff) {
    const b = s.buff;
    const effect =
      b.kind === 'manaShield'
        ? '1 mana absorve 1 de dano, enquanto houver mana'
        : b.kind === 'haste'
          ? `+${n(b.value)} na velocidade de movimento; remove lentidão`
          : b.kind === 'defense'
            ? `${n(b.value * 100)}% de redução de dano`
            : b.kind === 'attackSpeed'
              ? `${n(b.value * 100)}% de redução no intervalo dos ataques básicos`
              : b.kind === 'distanceDamage'
                ? `${n(b.value * 100)}% de bônus nos ataques básicos à distância`
                : `${n(b.value)} de vida por ciclo de regeneração`;
    lines.push(`Efeito: ${effect}. Duração: ${n(b.durationMs / 1000)}s. Não acumula com o mesmo efeito.`);
  }
  if (s.conjure)
    lines.push(`Cria ${s.conjure.count} poção(ões) por uso. O lote inteiro precisa caber na mochila.`);
  if (s.slow) lines.push(`Lentidão: ${n((1 - s.slow.factor) * 100)}% por ${n(s.slow.durationMs / 1000)}s.`);
  if (s.partyRadius) lines.push(`Também afeta aliados do grupo em até ${tiles(s.partyRadius)}.`);
  if (s.radius) lines.push(`Raio da área: ${tiles(s.radius)}.`);
  if (s.range) lines.push(`Alcance: ${tiles(s.range)}, com linha de visão.`);
  return lines;
}
