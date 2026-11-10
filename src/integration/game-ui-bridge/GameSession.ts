import { migrateAuto, type AutoSettings } from '../../game/ai/autoPlay';
// Sessão de jogo: liga simulação, persistência, áudio e interface. É a camada de integração explícita
// entre React e Phaser: o Phaser chama `frame()` a cada quadro; o React lê as stores e envia comandos.
import { parseHotbarEntry, type HotbarEntry } from '../../domain/rules/hotbar';
import type { CharacterState } from '../../domain/entities/character';
import type { EquipSlot } from '../../domain/entities/definitions';
import type { GameData } from '../../domain/entities/gameData';
import { GameSimulation } from '../../game/simulation/GameSimulation';
import type { GameMap } from '../../game/world/GameMap';
import type { SaveService } from '../../game/persistence/SaveService';
import type { AudioService } from '../../game/audio/AudioService';
import { buildSnapshot, catalogOf, type UiSnapshot } from './snapshot';
import { heroSnapshot } from '../../game/ai/heroes';
import { customHeroDef } from '../../data/heroes';
import { parseMarket } from '../../domain/rules/market';
import { SEASON } from '../../domain/rules/season';
import { createCharacter, validateName } from '../../domain/rules/character';
import type { VocationId } from '../../domain/value-objects/ids';

/** Máximo de personagens salvos (o mesmo da tela inicial). */
import type { CatalogItem } from '../../domain/rules/marketCatalog';
import type { HeroDef } from '../../domain/entities/definitions';
import { canDrink } from '../../domain/rules/potions';

/** Herói fixo do jogo (Boladex, Maguim...) ou um personagem criado pelo jogador jogando com a IA. */
function heroDefOf(data: GameData, c: CharacterState): HeroDef {
  return Object.values(data.heroes).find((d) => d.slotId === c.id) ?? customHeroDef(c);
}
import { canAttackActor, type PartySetting, type WarMode } from '../../game/social/social';
import { createLocalStore, createSnapshotStore, type Panel, type Store, type UiLocalState } from './store';

const PUBLISH_MS = 80;
/** Save automático (navegador) e, com conta conectada, envio ao GitHub: a cada 1 minuto. */
const AUTOSAVE_MS = 60000;

export interface SessionOptions {
  data: GameData;
  map: GameMap;
  character: CharacterState;
  saves: SaveService;
  audio: AudioService;
  touch: boolean;
  /** Personagens que entram no jogo já logados, jogando com IA (os heróis por padrão). */
  heroes?: CharacterState[];
  /** Personagens salvos fora do jogo: aparecem na lista de online com a opção de logar. */
  offline?: CharacterState[];
  /** Callback ao sair para o menu. */
  onExit: () => void;
}

const AUTO_KEY = 'rpgzim:auto';
const MARKET_KEY = 'rpgzim:market';
/** Quem o jogador deixou logado/deslogado (id do personagem -> logado?). Sem registro, todos entram logados. */
export const ONLINE_KEY = 'rpgzim:online';

/** Preferência de login com IA salva neste aparelho. */
export function onlinePrefs(): Record<string, boolean> {
  try {
    return (JSON.parse(localStorage.getItem(ONLINE_KEY) ?? '{}') as Record<string, boolean>) ?? {};
  } catch {
    return {};
  }
}
function setOnlinePref(id: string, on: boolean): void {
  try {
    localStorage.setItem(ONLINE_KEY, JSON.stringify({ ...onlinePrefs(), [id]: on }));
  } catch {
    // sem armazenamento: vale só nesta partida
  }
}

export class GameSession {
  readonly sim: GameSimulation;
  readonly snapshot: Store<UiSnapshot>;
  readonly local: Store<UiLocalState>;
  readonly audio: AudioService;
  private readonly saves: SaveService;
  private readonly onExit: () => void;
  private version = 0;
  private dirty = true;
  private lastPublish = 0;
  private msgSeq = 0;
  private disposers: (() => void)[] = [];
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private frames = 0;
  private fpsAt = 0;
  private disposed = false;
  /** Registrado pela cena Phaser: trata um toque em coordenadas de tela (clientX/clientY). */
  private screenTapHandler: ((clientX: number, clientY: number) => void) | null = null;

  constructor(opts: SessionOptions) {
    let character = opts.character;
    // personagem salvo morto renasce no templo com a vida cheia
    const restore = character.health > 0;
    const heroes = (opts.heroes ?? [])
      .filter((hc) => hc.id !== character.id)
      .map((hc) => ({ hero: heroDefOf(opts.data, hc), character: hc }));
    let market;
    try {
      market = parseMarket(opts.data, JSON.parse(localStorage.getItem(MARKET_KEY) ?? 'null'));
    } catch {
      market = undefined;
    }
    this.sim = new GameSimulation({
      data: opts.data,
      map: opts.map,
      character,
      restorePosition: restore,
      heroes,
      clock: Date.now,
      market,
      // jogo de verdade: os heróis têm sessões (saem para uma pausa e voltam) e ficam AFK de vez em quando
      lifelike: true,
    });
    this.offline = (opts.offline ?? []).filter((c) => c.id !== character.id);
    character = this.sim.world.player.character;
    if (!restore) {
      character.health = this.sim.world.player.stats.maxHealth;
      character.mana = this.sim.world.player.stats.maxMana;
    }
    // ajudas automáticas: as deste personagem (salvas nele); sem nada salvo, as antigas do aparelho
    const own = character.settings?.auto;
    if (own) this.sim.setAuto(migrateAuto(own));
    else
      try {
        const saved = JSON.parse(localStorage.getItem(AUTO_KEY) ?? 'null') as Record<string, unknown> | null;
        if (saved) this.sim.setAuto(migrateAuto(saved));
      } catch {
        // sem armazenamento: usa os padrões
      }
    this.saves = opts.saves;
    this.audio = opts.audio;
    this.onExit = opts.onExit;
    this.snapshot = createSnapshotStore(buildSnapshot(this.sim, 0));
    this.local = createLocalStore(opts.touch);
    this.publishOffline();
    this.wireEvents();
  }

  /** Personagens fora do jogo (o progresso salvo deles). */
  private offline: CharacterState[];
  private publishOffline(): void {
    this.local.update({
      offline: this.offline.map((c) => ({ id: c.id, name: c.name, vocation: c.vocation, level: c.level })),
    });
  }

  /** Loga um personagem salvo: ele entra no mundo jogando com a IA da vocação e do nível dele. */
  loginCharacter(id: string): boolean {
    const c = this.offline.find((x) => x.id === id);
    if (!c) return false;
    this.offline = this.offline.filter((x) => x !== c);
    const h = this.sim.addHero(heroDefOf(this.sim.world.data, c), structuredClone(c));
    setOnlinePref(id, true);
    this.publishOffline();
    this.pushMessage(`${h.character.name} entrou no jogo (joga sozinho com a IA).`, 'system');
    this.audio.play('ui');
    this.dirty = true;
    return true;
  }

  /**
   * Cria um personagem novo de dentro do jogo: nasce no templo, nível 1 com o kit da vocação, e já entra jogando com a
   * IA (aparece em Personagens online e pode ser deslogado ou escolhido na tela inicial depois). Devolve o erro, se houver.
   */
  async createAiCharacter(rawName: string, vocation: VocationId): Promise<string | null> {
    const invalid = validateName(rawName);
    if (invalid) return invalid;
    const name = rawName.trim().replace(/\s+/g, ' ');
    const w = this.sim.world;
    const taken = [
      w.human.character.name,
      ...[...w.heroes.values()].map((h) => h.character.name),
      ...this.sim.resting.map((r) => r.character.name),
      ...this.offline.map((c) => c.name),
    ].some((n) => n.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
    if (taken) return 'Já existe um personagem com esse nome.';
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const c = createCharacter(w.data, { id, name, vocation, now: Date.now(), position: { ...w.map.playerStart } });
    const h = this.sim.addHero(heroDefOf(w.data, c), structuredClone(c));
    setOnlinePref(id, true);
    this.pushMessage(`${h.character.name} (${w.data.vocations[vocation].name}) nasceu no templo e já está jogando com a IA.`, 'system');
    this.audio.play('ui');
    this.dirty = true;
    await this.saves.save(c).catch(() => undefined);
    return null;
  }

  /** Desloga um personagem que joga com IA: salva o progresso e tira do mundo. */
  async logoutCharacter(heroId: string): Promise<boolean> {
    const h = [...this.sim.world.heroes.values()].find((x) => x.hero.id === heroId || x.id === heroId);
    // em pausa: sai de vez (não volta sozinho)
    const resting = h ? null : this.sim.dropResting(heroId);
    if (!h && !resting) return false;
    const snap = h ? heroSnapshot(this.sim.world, h) : resting!;
    if (h) this.sim.removeHero(h.hero.id);
    this.offline = [...this.offline, snap];
    setOnlinePref(snap.id, false);
    this.publishOffline();
    this.pushMessage(`${snap.name} saiu do jogo.`, 'system');
    this.audio.play('ui');
    this.dirty = true;
    await this.saves.save(snap).catch(() => undefined);
    return true;
  }

  private saveMarket(): void {
    try {
      localStorage.setItem(MARKET_KEY, JSON.stringify({ ...this.sim.world.market, season: SEASON }));
    } catch {
      // sem armazenamento: o mercado vale só nesta partida
    }
  }

  /** Ajudas automáticas (loot, poção e cura): de cada personagem — salvas nele e mantidas entre as sessões. */
  getAuto(): AutoSettings {
    return { ...this.sim.world.auto };
  }
  setAuto(patch: Partial<AutoSettings>): void {
    this.sim.setAuto(patch);
    const c = this.sim.world.human.character;
    c.settings = { ...c.settings, auto: { ...this.sim.world.auto } };
    this.saves.requestSave(() => this.sim.snapshotCharacter());
  }

  private wireEvents(): void {
    const ev = this.sim.events;
    const markDirty = () => (this.dirty = true);
    for (const type of [
      'damage',
      'heal',
      'itemsChanged',
      'goldChanged',
      'targetChanged',
      'lootChanged',
      'lootDropped',
      'dialogOpened',
      'shopOpened',
      'depotOpened',
      'partyInvite',
      'partyChanged',
      'socialChanged',
      'levelUp',
      'skillUp',
      'playerDied',
      'playerRespawned',
      'buffApplied',
      'spellCast',
      'regionEntered',
      'buildingChanged',
      'xpGained',
      'marketChanged',
      'heroesChanged',
    ] as const) {
      this.disposers.push(ev.on(type, markDirty));
    }
    this.disposers.push(
      ev.on('message', (m) => this.pushMessage(m.text, m.kind)),
      ev.on('actionFailed', (m) => {
        this.pushMessage(m.message, 'warning');
        this.audio.play('error');
      }),
      ev.on('regionEntered', (r) => {
        const reg0 = this.sim.world.map.regions.find((x) => x.id === r.regionId);
        const sub = reg0?.pz
          ? 'Área protegida'
          : reg0?.city
            ? 'Cidade — protegido só dentro das construções'
            : 'Área de caça — cuidado!';
        this.local.update({ banner: { id: ++this.msgSeq, title: r.name, subtitle: sub } });
        const reg = this.sim.world.map.regions.find((x) => x.id === r.regionId);
        if (reg) this.audio.setMusic(reg.music);
      }),
      ev.on('levelUp', (e) => this.local.update({ levelUp: { id: ++this.msgSeq, level: e.level } })),
      ev.on('pkNotice', (e) =>
        this.local.update({ pkToast: { id: ++this.msgSeq, text: e.text, danger: e.danger } }),
      ),
      ev.on('saveRequested', () => this.saves.requestSave(() => this.sim.snapshotCharacter())),
      ev.on('heroSaveRequested', (e) => this.saveHero(e.heroId)),
      ev.on('heroLoggedOut', (e) => {
        this.pushMessage(`${e.character.name} saiu do jogo (volta daqui a pouco).`, 'system');
        void this.saves.save(e.character).catch(() => undefined);
      }),
      ev.on('marketChanged', () => this.saveMarket()),
      ev.on('partyChanged', () => {
        const has = !!this.sim.world.social.party;
        // grupo formado pelo menu do personagem: abre os controles (pela lista de online, só avisa)
        if (has && !this.hadParty && !this.local.get().panel)
          this.local.update({ partyPanel: true, actorMenu: null });
        if (!has) this.local.update({ partyPanel: false });
        this.hadParty = has;
      }),
      // falas de heróis próximos aparecem no registro de mensagens
      ev.on('speech', (e) => {
        const p = this.sim.world.human;
        if (Math.max(Math.abs(e.position.x - p.x), Math.abs(e.position.y - p.y)) <= 12)
          this.pushMessage(`${e.name}: ${e.text}`, 'chat');
      }),
    );
  }

  pushMessage(text: string, kind: UiLocalState['messages'][number]['kind']): void {
    const msgs = [
      ...this.local.get().messages,
      { id: ++this.msgSeq, text, kind, at: performance.now() },
    ].slice(-30);
    this.local.update({ messages: msgs });
  }

  /** Chamado pela cena Phaser a cada quadro. */
  frame(deltaMs: number): void {
    if (this.disposed) return;
    this.sim.update(deltaMs);
    const now = performance.now();
    this.frames++;
    if (now - this.fpsAt >= 1000) {
      this.local.update({ fps: Math.round((this.frames * 1000) / (now - this.fpsAt)) });
      this.frames = 0;
      this.fpsAt = now;
    }
    if (this.dirty || now - this.lastPublish >= PUBLISH_MS) this.publish(now);
  }

  publish(now = performance.now()): void {
    this.dirty = false;
    this.lastPublish = now;
    this.snapshot.set(buildSnapshot(this.sim, ++this.version));
  }

  start(): void {
    // roda no tempo ocioso do navegador (entre quadros) para nunca competir com a renderização
    const idle = (fn: () => void) =>
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(fn, { timeout: 2000 })
        : setTimeout(fn, 0);
    this.autosaveTimer = setInterval(() => idle(() => void this.saveNow()), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        this.sim.setPaused(true);
        // celular: o app pode ser fechado em segundo plano; envia já para a nuvem
        void this.saveNow().then(() => this.saves.flushRemote(true));
      } else this.sim.setPaused(false);
    };
    const onPageHide = () => void this.saveNow().then(() => this.saves.flushRemote(true));
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    this.disposers.push(
      () => document.removeEventListener('visibilitychange', onHide),
      () => window.removeEventListener('pagehide', onPageHide),
    );
    this.local.update({ ready: true });
    this.audio.setMusic(
      this.sim.world.map.regions.find((r) => r.id === this.sim.world.ui.regionId)?.music ?? 'town',
    );
  }

  private heroSavedAt = new Map<string, number>();
  private hadParty = false;
  private lastHeroTap: { id: string; at: number } | null = null;
  /** Salva o progresso de um herói (no máx. a cada 20 s, exceto `force`). */
  saveHero(heroId: string, force = false): Promise<void> {
    const h = [...this.sim.world.heroes.values()].find((x) => x.hero.id === heroId);
    if (!h) return Promise.resolve();
    const now = performance.now();
    if (!force && now - (this.heroSavedAt.get(heroId) ?? -Infinity) < 20000) return Promise.resolve();
    this.heroSavedAt.set(heroId, now);
    return this.saves.save(heroSnapshot(this.sim.world, h)).catch(() => undefined);
  }
  private saveHeroes(): Promise<void> {
    return Promise.all([...this.sim.world.heroes.values()].map((h) => this.saveHero(h.hero.id, true))).then(
      () => undefined,
    );
  }

  async saveNow(): Promise<void> {
    if (this.disposed) return;
    void this.saveHeroes();
    this.local.update({ saving: true });
    try {
      await this.saves.flush(() => this.sim.snapshotCharacter());
      this.local.update({ saving: false, lastSaved: Date.now() });
    } catch {
      this.local.update({ saving: false });
      this.pushMessage('Não foi possível salvar o progresso neste navegador.', 'warning');
    }
  }

  async exitToMenu(): Promise<void> {
    await this.saveNow();
    await this.saves.flushRemote();
    this.onExit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.autosaveTimer) clearInterval(this.autosaveTimer);
    for (const d of this.disposers) d();
    this.disposers = [];
    this.sim.events.clear();
    this.audio.setMusic(null);
  }

  // ------------------------------------------------------------------ comandos da interface
  setPanel(panel: Panel): void {
    const cur = this.local.get().panel;
    const next = cur === panel ? null : panel;
    this.local.update({ panel: next });
    this.sim.setPaused(false);
    this.audio.play('ui');
  }
  closeOverlays(): boolean {
    const w = this.sim.world;
    if (this.local.get().panel) {
      this.local.update({ panel: null });
      return true;
    }
    if (this.local.get().partyPanel || this.local.get().actorMenu) {
      this.local.update({ partyPanel: false, actorMenu: null });
      return true;
    }
    if (w.ui.dialog || w.ui.shop || w.ui.depot || w.ui.market || w.ui.lootId) {
      w.ui.dialog = null;
      w.ui.shop = null;
      w.ui.depot = null;
      w.ui.market = null;
      w.ui.lootId = null;
      this.dirty = true;
      return true;
    }
    return false;
  }
  setScreenTapHandler(fn: ((clientX: number, clientY: number) => void) | null): void {
    this.screenTapHandler = fn;
  }
  /** Toque no mini mapa: caminha até o ponto (fecha o painel para ver a viagem). */
  travelTo(x: number, y: number): boolean {
    const ok = this.sim.travelTo(x, y);
    if (ok) {
      this.travelGoal = this.sim.world.player.pathGoal;
      this.audio.play('ui');
    } else this.audio.play('error');
    this.dirty = true;
    return ok;
  }
  private travelGoal: { x: number; y: number } | null = null;
  /** "Ir até" o personagem (lista de online): fecha o painel e vai andando até ele. */
  goToActor(id: string): boolean {
    const ok = this.sim.goToActor(id);
    this.audio.play(ok ? 'ui' : 'error');
    if (ok) this.setPanel(null);
    this.dirty = true;
    return ok;
  }
  stopGoTo(): void {
    this.sim.goToId = null;
    this.sim.stop();
    this.dirty = true;
  }
  /** Posições para o mini mapa (lidas a cada poucos décimos de segundo, fora do snapshot). */
  minimapState(): {
    width: number;
    height: number;
    you: { x: number; y: number };
    party: { id: string; name: string; x: number; y: number; leader: boolean }[];
    goal: { x: number; y: number } | null;
    regions: { name: string; x: number; y: number }[];
    heroes: {
      id: string;
      name: string;
      x: number;
      y: number;
      vocation: string;
      inParty: boolean;
      dead: boolean;
    }[];
    npcs: { id: string; name: string; x: number; y: number }[];
    bags: { id: string; x: number; y: number; mine: boolean }[];
  } {
    const w = this.sim.world;
    const p = w.human;
    const party = w.social.party;
    const goal = p.path?.length ? (this.travelGoal ?? p.pathGoal) : null;
    if (!p.path?.length) this.travelGoal = null;
    return {
      width: w.map.width,
      height: w.map.height,
      you: { x: p.x, y: p.y },
      party: (party?.members ?? [])
        .filter((id) => id !== p.id)
        .flatMap((id) => {
          const a = w.heroes.get(id);
          return a ? [{ id, name: a.character.name, x: a.x, y: a.y, leader: party!.leaderId === id }] : [];
        }),
      heroes: [...w.heroes.values()].map((a) => ({
        id: a.id,
        name: a.character.name,
        x: a.x,
        y: a.y,
        vocation: a.character.vocation,
        inParty: !!party?.members.includes(a.id),
        dead: a.dead,
      })),
      npcs: [...w.npcs.values()].map((n) => ({ id: n.id, name: n.def.name, x: n.x, y: n.y })),
      // saco de morte do jogador (ou o último loot largado por ele) em destaque; sacos de monstros não poluem o mapa
      bags: [...w.lootBags.values()]
        .filter((l) => l.ownerId === p.id)
        .map((l) => ({ id: l.id, x: l.x, y: l.y, mine: true })),
      goal,
      regions: w.map.regions
        .filter((r) => r.priority >= 1 && r.w * r.h < w.map.width * w.map.height * 0.5)
        .map((r) => ({ name: r.name, x: r.x + r.w / 2, y: r.y + r.h / 2 })),
    };
  }
  /** Toque/clique no mapa (camada de entrada da interface), em coordenadas da janela. */
  tapScreen(clientX: number, clientY: number): void {
    this.screenTapHandler?.(clientX, clientY);
  }
  private screenLocator: ((id: string) => { x: number; y: number } | null) | null = null;
  setScreenLocator(fn: ((id: string) => { x: number; y: number } | null) | null): void {
    this.screenLocator = fn;
  }
  /** Onde uma entidade aparece na janela (coordenadas de cliente), ou null se fora da tela. */
  screenOf(id: string): { x: number; y: number } | null {
    return this.screenLocator?.(id) ?? null;
  }
  private screenHoverHandler: ((clientX: number, clientY: number) => boolean) | null = null;
  setScreenHoverHandler(fn: ((clientX: number, clientY: number) => boolean) | null): void {
    this.screenHoverHandler = fn;
  }
  /** Há algo clicável (monstro, NPC, personagem) sob o ponteiro? */
  hoverScreen(clientX: number, clientY: number): boolean {
    return this.screenHoverHandler?.(clientX, clientY) ?? false;
  }
  /** Toque numa criatura do mapa: herói abre o menu; monstro/NPC segue o comportamento normal. */
  tapEntity(id: string): void {
    if (this.sim.world.heroes.has(id)) {
      const now = performance.now();
      const w = this.sim.world;
      const hero = w.heroes.get(id)!;
      // toque duplo: ataca (com PK ligado, ou treino liberado no grupo); toque simples: menu discreto
      if (this.lastHeroTap?.id === id && now - this.lastHeroTap.at < 420) {
        this.lastHeroTap = null;
        if (!canAttackActor(w, w.human, hero)) {
          this.sim.setTarget(id);
          this.local.update({ actorMenu: null });
          this.dirty = true;
          return;
        }
      }
      this.lastHeroTap = { id, at: now };
      // toque simples sempre abre (não alterna): fechar é no X ou tocando em outro lugar do mapa
      if (this.local.get().actorMenu !== id) {
        this.local.update({ actorMenu: id });
        this.audio.play('ui');
      }
      return;
    }
    this.sim.tapEntity(id);
  }
  closeActorMenu(): void {
    if (this.local.get().actorMenu) this.local.update({ actorMenu: null });
  }
  talkTo(id: string): void {
    this.sim.talkTo(id);
  }
  attackActor(id: string): void {
    this.sim.setTarget(id);
    this.local.update({ actorMenu: null });
    this.dirty = true;
  }
  partyInvite(id: string): void {
    if (this.sim.partyInvite(id)) this.audio.play('ui');
    const w = this.sim.world;
    const hero = w.heroes.get(id);
    if (hero && w.social.party?.members.includes(id)) {
      const far = Math.max(Math.abs(hero.x - w.human.x), Math.abs(hero.y - w.human.y)) > 4;
      if (far) this.pushMessage(`${hero.character.name} está vindo até você (veja no mini mapa).`, 'system');
    }
    this.dirty = true;
  }
  partyAccept(): void {
    this.sim.partyAccept();
    this.dirty = true;
  }
  partyDecline(): void {
    this.sim.partyDecline();
    this.dirty = true;
  }
  partyLeave(): void {
    this.sim.partyLeave();
    this.dirty = true;
  }
  partyKick(id: string): void {
    this.sim.partyKick(id);
    this.dirty = true;
  }
  partyOrder(kind: 'attack' | 'hold' | 'town'): void {
    this.audio.play(this.sim.partyOrder(kind) ? 'ui' : 'error');
    this.dirty = true;
  }
  partyCall(id: string): void {
    this.audio.play(this.sim.partyCall(id) ? 'ui' : 'error');
    this.dirty = true;
  }
  partyPassLeader(id: string): void {
    this.sim.partyPassLeader(id);
    this.dirty = true;
  }
  configureParty(patch: PartySetting): void {
    this.sim.configureParty(patch);
    this.audio.play('ui');
    this.dirty = true;
    this.saves.requestSave(() => this.sim.snapshotCharacter());
  }
  disbandParty(): void {
    this.sim.disbandParty();
    this.local.update({ partyPanel: false });
    this.dirty = true;
  }
  setPartyPanel(open: boolean): void {
    this.local.update({ partyPanel: open, actorMenu: null });
  }
  setPvp(on: boolean): void {
    this.sim.setPvp(on);
    this.audio.play(on ? 'error' : 'ui');
    this.dirty = true;
    this.saves.requestSave(() => this.sim.snapshotCharacter());
  }
  setWar(mode: WarMode): void {
    this.sim.setWar(mode);
    this.audio.play(mode === 'off' ? 'ui' : 'error');
    this.dirty = true;
    this.saves.requestSave(() => this.sim.snapshotCharacter());
  }
  setStandAttack(stand: boolean): void {
    this.sim.setStandAttack(stand);
    this.audio.play('ui');
    this.dirty = true;
    this.saves.requestSave(() => this.sim.snapshotCharacter());
  }
  move(x: number, y: number): void {
    this.sim.setMoveVector(x, y);
  }
  /** Usa o atalho: magia, item da mochila ou poção automática. Atalho vazio abre a configuração. */
  useSlot(index: number): void {
    const e = parseHotbarEntry(this.sim.world.player.character.hotbar[index]);
    if (!e) {
      this.setPanel('hotbar');
      return;
    }
    if (e.kind === 'spell') return this.cast(e.id);
    if (e.kind === 'potion') return this.quickPotion(e.id);
    if (!this.sim.useItemById(e.id)) this.audio.play('error');
    this.dirty = true;
  }
  /** Soltou um atalho que estava pressionado: a magia que ficou na fila (alvo fora de alcance) não dispara depois. */
  cancelQueuedSpell(): void {
    this.sim.world.player.queuedSpell = null;
  }
  organizeInventory(): void {
    this.sim.organizeInventory();
    this.dirty = true;
  }
  cast(spellId: string): void {
    if (this.sim.castSpell(spellId)) this.dirty = true;
  }
  cycleTarget(): void {
    this.sim.cycleTarget();
    this.dirty = true;
  }
  cycleActorSelection(): void {
    this.sim.cycleActorSelection();
    this.audio.play('ui');
    this.dirty = true;
  }
  clearTarget(): void {
    this.sim.setTarget(null);
  }
  interact(): void {
    if (this.sim.interact()) this.audio.play('ui');
    this.dirty = true;
  }
  quickPotion(kind: 'health' | 'mana'): void {
    const id = this.pickPotion(kind);
    if (!id) {
      this.pushMessage(kind === 'health' ? 'Sem poções de vida.' : 'Sem poções de mana.', 'warning');
      this.audio.play('error');
      return;
    }
    this.sim.useItemById(id);
    this.dirty = true;
  }
  /** Escolhe a menor poção que cobre o que falta; se nenhuma cobre, a mais forte disponível. */
  private pickPotion(kind: 'health' | 'mana'): string | undefined {
    const w = this.sim.world;
    const c = w.player.character;
    const missing = kind === 'health' ? w.player.stats.maxHealth - c.health : w.player.stats.maxMana - c.mana;
    const owned = [...new Set(c.inventory.filter((s) => s).map((s) => s!.itemId))]
      .map((id) => ({
        id,
        v: (kind === 'health' ? w.data.items[id]?.use?.heal : w.data.items[id]?.use?.mana) ?? 0,
        other: kind === 'health' ? w.data.items[id]?.use?.mana : w.data.items[id]?.use?.heal,
      }))
      .filter((p) => p.v > 0 && !p.other && w.data.items[p.id]?.type === 'potion' && canDrink(w.data.items[p.id], c.level))
      .sort((a, b) => a.v - b.v);
    return (owned.find((p) => p.v >= missing * 0.8) ?? owned[owned.length - 1])?.id;
  }
  useItem(index: number): void {
    this.sim.useItem(index);
    this.dirty = true;
  }
  equip(index: number): boolean {
    const ok = this.sim.equip(index);
    if (ok) this.audio.play('equip');
    this.dirty = true;
    return ok;
  }
  unequip(slot: EquipSlot): void {
    if (this.sim.unequip(slot)) this.audio.play('equip');
    this.dirty = true;
  }
  drop(index: number): void {
    this.sim.drop(index);
    this.dirty = true;
  }
  dialogChoose(i: number): void {
    this.sim.dialogChoose(i);
    this.audio.play('ui');
    this.dirty = true;
  }
  closeDialog(): void {
    this.sim.closeDialog();
    this.dirty = true;
  }
  closeShop(): void {
    this.sim.closeShop();
    this.dirty = true;
  }
  closeDepot(): void {
    this.sim.closeDepot();
    this.dirty = true;
  }
  depotDeposit(invIndex: number): boolean {
    const ok = this.sim.depotDeposit(invIndex);
    if (ok) this.audio.play('pickup');
    this.dirty = true;
    return ok;
  }
  depotWithdraw(depotIndex: number): boolean {
    const ok = this.sim.depotWithdraw(depotIndex);
    if (ok) this.audio.play('pickup');
    this.dirty = true;
    return ok;
  }
  private marketAct(ok: boolean, sound: 'coin' | 'pickup' = 'coin'): boolean {
    this.audio.play(ok ? sound : 'error');
    this.dirty = true;
    return ok;
  }
  /** Catálogo do mercado (categorias, atributos): fixo para os dados do jogo. */
  marketCatalog(): CatalogItem[] {
    return catalogOf(this.sim.world.data);
  }
  /** Na loja: compra no mercado o que está anunciado mais barato que o preço da loja. */
  marketBuyAtShop(itemId: string, qty: number): boolean {
    return this.marketAct(this.sim.marketBuyAtShop(itemId, qty));
  }
  marketBuyNow(itemId: string, qty: number, maxPrice?: number): boolean {
    return this.marketAct(this.sim.marketBuyNow(itemId, qty, maxPrice));
  }
  marketSellNow(itemId: string, qty: number, minPrice?: number): boolean {
    return this.marketAct(this.sim.marketSellNow(itemId, qty, minPrice));
  }
  marketOffer(side: 'sell' | 'buy', itemId: string, qty: number, price: number): boolean {
    return this.marketAct(this.sim.marketOffer(side, itemId, qty, price), side === 'sell' ? 'coin' : 'pickup');
  }
  /** Vender tudo rápido: anuncia tudo o que tem desses itens pelo preço sugerido (travados só com `includeKept`). */
  marketSellAll(itemIds: readonly string[], includeKept = false): boolean {
    return this.marketAct(this.sim.marketSellAll(itemIds, includeKept));
  }
  marketCancel(offerId: string): boolean {
    return this.marketAct(this.sim.marketCancel(offerId), 'pickup');
  }
  marketTakeParcels(): boolean {
    return this.marketAct(this.sim.marketTakeParcels(), 'pickup');
  }
  closeMarket(): void {
    this.sim.closeMarket();
    this.dirty = true;
  }
  depotDepositAll(): void {
    if (this.sim.depotDepositAll()) this.audio.play('pickup');
    this.dirty = true;
  }
  bankGold(op: 'deposit' | 'withdraw', amount: number): void {
    if (this.sim.bankGold(op, amount)) this.audio.play('coin');
    this.dirty = true;
  }
  buy(itemId: string, qty: number): void {
    if (this.sim.buy(itemId, qty)) this.audio.play('coin');
    this.dirty = true;
  }
  sell(itemId: string, qty: number): void {
    if (this.sim.sell(itemId, qty)) this.audio.play('coin');
    this.dirty = true;
  }
  setSellLock(itemId: string, locked: boolean): void {
    this.sim.setSellLock(itemId, locked);
    this.audio.play('ui');
    this.dirty = true;
  }
  sellAll(): void {
    if (this.sim.sellAll()) this.audio.play('coin');
    this.dirty = true;
  }
  takeLoot(which: 'all' | 'gold' | { bagId: string; index: number } | { refs: { bagId: string; index: number }[] }): void {
    this.sim.takeLoot(which);
    this.audio.play('pickup');
    this.dirty = true;
  }
  closeLoot(): void {
    this.sim.closeLoot();
    this.dirty = true;
  }
  respawn(): void {
    this.sim.respawn();
    this.dirty = true;
  }
  setHotbar(index: number, entry: HotbarEntry): void {
    this.sim.setHotbar(index, entry);
    this.dirty = true;
    this.saves.requestSave(() => this.sim.snapshotCharacter());
  }
}
