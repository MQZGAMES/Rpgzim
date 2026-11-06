// Heróis existem desde o primeiro acesso: se ainda não há save do herói, ele é criado (nível 1, no templo).
import type { CharacterState } from '../domain/entities/character';
import type { GameData } from '../domain/entities/gameData';
import { createCharacter } from '../domain/rules/character';
import type { SaveService } from '../game/persistence/SaveService';
import { PLAYER_START } from '../data/maps/world';

/**
 * Prepara os saves ao abrir o jogo: quem era de uma temporada anterior recomeça do nível 1 e já é gravado (a lista da
 * tela inicial e a sincronização mostram o recomeço); os heróis que ainda não têm save são criados. Devolve quantos
 * personagens recomeçaram.
 */
export async function ensureHeroSaves(saves: SaveService, data: GameData): Promise<number> {
  let reset = 0;
  for (const s of await saves.list().catch(() => [])) {
    const f = await saves.loadFile(s.slotId).catch(() => null);
    if (f?.reset) {
      await saves.save(f.character).catch(() => undefined);
      reset++;
    }
  }
  const existing = new Set((await saves.list().catch(() => [])).map((s) => s.slotId));
  for (const hero of Object.values(data.heroes)) {
    if (existing.has(hero.slotId)) continue;
    const c = createCharacter(data, {
      id: hero.slotId,
      name: hero.name,
      vocation: hero.vocation,
      now: Date.now(),
      position: { ...PLAYER_START },
    });
    await saves.save(c).catch(() => undefined);
  }
  return reset;
}

/**
 * Todos os outros personagens salvos, separados em quem entra logado (jogando com a IA) e quem fica fora do jogo.
 * Todos entram logados por padrão (heróis e personagens criados); fica fora só quem o jogador deslogou no menu de
 * personagens (preferência no aparelho).
 */
export async function loadRosterFor(
  saves: SaveService,
  data: GameData,
  playingId: string,
  prefs: Record<string, boolean>,
): Promise<{ online: CharacterState[]; offline: CharacterState[] }> {
  const online: CharacterState[] = [];
  const offline: CharacterState[] = [];
  // os heróis na ordem do jogo (Boladex, Maguim...) e depois os personagens criados
  const order = Object.values(data.heroes).map((h) => h.slotId);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const slots = (await saves.list().catch(() => [])).sort((a, b) => rank(a.slotId) - rank(b.slotId));
  for (const s of slots) {
    if (s.slotId === playingId) continue;
    const c = await saves.load(s.slotId).catch(() => null);
    if (!c) continue;
    const on = prefs[c.id] ?? true; // todos entram logados (com vida própria), a menos que o jogador os tenha deslogado
    (on ? online : offline).push(c);
  }
  return { online, offline };
}

export function isHeroSlot(data: GameData, slotId: string): boolean {
  return Object.values(data.heroes).some((h) => h.slotId === slotId);
}
