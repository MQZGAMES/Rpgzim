// Sessão de jogo: liga simulação, persistência, áudio e interface. É a camada de integração explícita
// entre React e Phaser: o Phaser chama `frame()` a cada quadro; o React lê as stores e envia comandos.
import type { CharacterState } from '../../domain/entities/character';
import type { EquipSlot } from '../../domain/entities/definitions';
import type { GameData } from '../../domain/entities/gameData';
import { GameSimulation } from '../../game/simulation/GameSimulation';
import type { GameMap } from '../../game/world/GameMap';
import type { SaveService } from '../../game/persistence/SaveService';
import type { AudioService } from '../../game/audio/AudioService';
import { buildSnapshot, type UiSnapshot } from './snapshot';
import { createLocalStore, createSnapshotStore, type Panel, type Store, type UiLocalState } from './store';

const PUBLISH_MS = 80;
const AUTOSAVE_MS = 45000;

export interface SessionOptions {
  data: GameData;
  map: GameMap;
  character: CharacterState;
  saves: SaveService;
  audio: AudioService;
  touch: boolean;
  /** Callback ao sair para o menu. */
  onExit: () => void;
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
    this.sim = new GameSimulation({ data: opts.data, map: opts.map, character, restorePosition: restore });
    character = this.sim.world.player.character;
    if (!restore) {
      character.health = this.sim.world.player.stats.maxHealth;
      character.mana = this.sim.world.player.stats.maxMana;
    }
    this.saves = opts.saves;
    this.audio = opts.audio;
    this.onExit = opts.onExit;
    this.snapshot = createSnapshotStore(buildSnapshot(this.sim, 0));
    this.local = createLocalStore(opts.touch);
    this.wireEvents();
  }

  private wireEvents(): void {
    const ev = this.sim.events;
    const markDirty = () => (this.dirty = true);
    for (const type of ['damage', 'heal', 'itemsChanged', 'goldChanged', 'targetChanged', 'lootChanged', 'lootDropped', 'dialogOpened', 'shopOpened', 'depotOpened', 'levelUp', 'skillUp', 'playerDied', 'playerRespawned', 'buffApplied', 'spellCast', 'regionEntered', 'buildingChanged', 'xpGained'] as const) {
      this.disposers.push(ev.on(type, markDirty));
    }
    this.disposers.push(
      ev.on('message', (m) => this.pushMessage(m.text, m.kind)),
      ev.on('actionFailed', (m) => {
        this.pushMessage(m.message, 'warning');
        this.audio.play('error');
      }),
      ev.on('regionEntered', (r) => {
        const sub = this.sim.world.map.regions.find((x) => x.id === r.regionId)?.pz ? 'Área protegida' : 'Área de caça — cuidado!';
        this.local.update({ banner: { id: ++this.msgSeq, title: r.name, subtitle: sub } });
        const reg = this.sim.world.map.regions.find((x) => x.id === r.regionId);
        if (reg) this.audio.setMusic(reg.music);
      }),
      ev.on('levelUp', (e) => this.local.update({ levelUp: { id: ++this.msgSeq, level: e.level } })),
      ev.on('saveRequested', () => this.saves.requestSave(() => this.sim.snapshotCharacter())),
    );
  }

  pushMessage(text: string, kind: UiLocalState['messages'][number]['kind']): void {
    const msgs = [...this.local.get().messages, { id: ++this.msgSeq, text, kind, at: performance.now() }].slice(-30);
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
    this.autosaveTimer = setInterval(() => void this.saveNow(), AUTOSAVE_MS);
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
    this.disposers.push(() => document.removeEventListener('visibilitychange', onHide), () => window.removeEventListener('pagehide', onPageHide));
    this.local.update({ ready: true });
    this.audio.setMusic(this.sim.world.map.regions.find((r) => r.id === this.sim.world.ui.regionId)?.music ?? 'town');
  }

  async saveNow(): Promise<void> {
    if (this.disposed) return;
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
    if (w.ui.dialog || w.ui.shop || w.ui.depot || w.ui.lootId) {
      w.ui.dialog = null;
      w.ui.shop = null;
      w.ui.depot = null;
      w.ui.lootId = null;
      this.dirty = true;
      return true;
    }
    return false;
  }
  setScreenTapHandler(fn: ((clientX: number, clientY: number) => void) | null): void {
    this.screenTapHandler = fn;
  }
  /** Toque repassado pela interface (ex.: zona do joystick sem arrasto) como se fosse no mapa. */
  tapScreen(clientX: number, clientY: number): void {
    this.screenTapHandler?.(clientX, clientY);
  }
  move(x: number, y: number): void {
    this.sim.setMoveVector(x, y);
  }
  castSlot(index: number): void {
    const id = this.sim.world.player.character.hotbar[index];
    if (id) this.cast(id);
  }
  cast(spellId: string): void {
    if (this.sim.castSpell(spellId)) this.dirty = true;
  }
  cycleTarget(): void {
    this.sim.cycleTarget();
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
      .map((id) => ({ id, v: (kind === 'health' ? w.data.items[id]?.use?.heal : w.data.items[id]?.use?.mana) ?? 0, other: kind === 'health' ? w.data.items[id]?.use?.mana : w.data.items[id]?.use?.heal }))
      .filter((p) => p.v > 0 && !p.other && w.data.items[p.id]?.type === 'potion')
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
  discard(index: number): void {
    this.sim.discard(index);
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
  sellAll(): void {
    if (this.sim.sellAll()) this.audio.play('coin');
    this.dirty = true;
  }
  takeLoot(which: 'all' | 'gold' | { bagId: string; index: number }): void {
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
  setHotbar(index: number, spellId: string): void {
    this.sim.setHotbar(index, spellId);
    this.dirty = true;
    this.saves.requestSave(() => this.sim.snapshotCharacter());
  }
}
