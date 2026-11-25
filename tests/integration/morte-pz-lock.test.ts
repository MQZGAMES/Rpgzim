// Morrer encerra o PZ lock e a caveira branca/amarela, e nada da vida anterior volta a marcar o personagem no templo
// (ex.: alguém em quem ele bateu antes de morrer morre depois — antes isso dava PZ lock de 5 min e caveira no templo).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { actorSource, damagePlayer, monsterSource, respawnPlayer } from '../../src/game/combat/combat';
import { asActor } from '../../src/game/simulation/World';
import { isPzLocked, registerAggression, savePk, skullOf } from '../../src/game/social/social';
import { advance, makeSim } from '../helpers';

function rig(heroDies: boolean) {
  const sim = makeSim('knight', { seed: 5 });
  const w = sim.world;
  const def = GAME_DATA.heroes.boladex!;
  const h = sim.addHero(
    def,
    createCharacter(GAME_DATA, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart }),
  );
  h.brain.nextThinkAt = Infinity;
  sim.setPvp(true);
  const m = [...w.monsters.values()][0]!;
  const actor = heroDies ? h : w.human;
  const other = heroDies ? w.human : h;
  const killByMonster = (who: typeof actor) =>
    asActor(w, who, () => {
      who.invulnerableUntil = 0;
      for (let i = 0; i < 20 && !who.dead; i++) damagePlayer(w, 999999, 'physical', monsterSource(m), true);
    });
  return { sim, w, actor, other, killByMonster };
}

describe.each([false, true])('morte encerra o PZ lock (herói = %s)', (heroDies) => {
  it('morrer tira o PZ lock e a caveira branca, também do que fica salvo', () => {
    const { w, actor, other, killByMonster } = rig(heroDies);
    registerAggression(w, actor.id, other.id);
    savePk(w, actor);
    expect(isPzLocked(w, actor.id)).toBe(true);
    expect(skullOf(w, actor.id)?.kind).toBe('white');
    killByMonster(actor);
    asActor(w, actor, () => respawnPlayer(w));
    expect(isPzLocked(w, actor.id)).toBe(false);
    expect(skullOf(w, actor.id)).toBeNull();
    expect(actor.character.pk?.pzLockUntil ?? 0).toBe(0);
    expect(actor.character.pk?.skull ?? null).toBeNull();
  });

  it('quem ele feriu antes de morrer morrer depois não traz PZ lock nem caveira para o templo', () => {
    const { w, actor, other, killByMonster } = rig(heroDies);
    // bate no outro personagem (fica registrado como quem o feriu) e morre
    registerAggression(w, actor.id, other.id);
    asActor(w, other, () => damagePlayer(w, 5, 'physical', actorSource(actor), true));
    killByMonster(actor);
    asActor(w, actor, () => respawnPlayer(w));
    // o outro morre logo depois, para uma criatura
    killByMonster(other);
    expect(isPzLocked(w, actor.id)).toBe(false);
    expect(skullOf(w, actor.id)).toBeNull();
  });

  it('a caveira vermelha continua, mas o PZ lock acaba', () => {
    const { w, actor, killByMonster } = rig(heroDies);
    const until = w.now + 86_400_000;
    w.social.skulls.set(actor.id, { kind: 'red', until });
    w.social.pzLocks.set(actor.id, w.now + 120_000);
    killByMonster(actor);
    asActor(w, actor, () => respawnPlayer(w));
    expect(isPzLocked(w, actor.id)).toBe(false);
    expect(skullOf(w, actor.id)).toEqual({ kind: 'red', until });
  });
});

it('no jogo: depois de renascer, alguns segundos no templo sem PZ lock', () => {
  const { sim, w, actor, other, killByMonster } = rig(false);
  registerAggression(w, actor.id, other.id);
  asActor(w, other, () => damagePlayer(w, 5, 'physical', actorSource(actor), true));
  killByMonster(actor);
  sim.respawn();
  killByMonster(other);
  advance(sim, 5000, 50);
  expect(isPzLocked(w, actor.id)).toBe(false);
});
