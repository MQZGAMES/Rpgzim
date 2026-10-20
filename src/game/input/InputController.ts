// Entrada de teclado e ponteiro (mouse/toque no mundo). O joystick virtual fica na interface React
// e chega pela GameSession. Perda de foco limpa as teclas pressionadas.
import type Phaser from 'phaser';
import type { GameSession } from '../../integration/game-ui-bridge/GameSession';
import type { EntityViews } from '../rendering/EntityViews';
import type { EffectsView } from '../rendering/EffectsView';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export class InputController {
  private held = new Set<string>();
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: GameSession,
    private readonly views: EntityViews,
    private readonly effects: EffectsView,
  ) {
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keyUp(e);
    this.onBlur = () => this.clear();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    // toques e cliques chegam pela camada de entrada da interface (MapInputLayer), com a posição do canvas
    // medida na hora — o cache de posição do Phaser fica velho no celular e deslocava os toques
    session.setScreenTapHandler((cx, cy) => {
      const pt = this.toCanvas(cx, cy);
      if (pt) this.tapAt(pt.x, pt.y);
    });
    session.setScreenLocator((id) => {
      const c = this.views.centerOf(id);
      if (!c) return null;
      const cam = this.scene.cameras.main;
      const canvas = this.scene.game.canvas.getBoundingClientRect();
      // mundo -> canvas (câmera com zoom e rolagem) -> janela
      const sx = (c.x - cam.worldView.x) * cam.zoom + cam.x;
      const sy = (c.y - cam.worldView.y) * cam.zoom + cam.y;
      return { x: canvas.left + (sx * canvas.width) / this.scene.scale.width, y: canvas.top + (sy * canvas.height) / this.scene.scale.height };
    });
    session.setScreenHoverHandler((cx, cy) => {
      const pt = this.toCanvas(cx, cy);
      if (!pt) return false;
      const wp = this.scene.cameras.main.getWorldPoint(pt.x, pt.y);
      return !!this.views.pick(wp.x, wp.y);
    });
  }

  private toCanvas(cx: number, cy: number): { x: number; y: number } | null {
    const r = this.scene.game.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: ((cx - r.left) * this.scene.scale.width) / r.width, y: ((cy - r.top) * this.scene.scale.height) / r.height };
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private keyDown(e: KeyboardEvent): void {
    if (this.isTyping(e)) return;
    this.session.audio.unlock();
    const s = this.session;
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      this.held.add(e.code);
      this.applyMove();
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case 'Tab':
      case 'Space':
        e.preventDefault();
        s.cycleTarget();
        break;
      case 'KeyE':
      case 'Enter':
        s.interact();
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
        s.useSlot(Number(e.code.slice(5)) - 1);
        break;
      case 'KeyQ':
        s.quickPotion('health');
        break;
      case 'KeyR':
        s.quickPotion('mana');
        break;
      case 'KeyI':
      case 'KeyB':
        s.setPanel('inventory');
        break;
      case 'KeyC':
        s.setPanel('character');
        break;
      case 'KeyK':
        s.setPanel('spells');
        break;
      case 'KeyH':
        s.setPanel('help');
        break;
      case 'KeyM':
        s.setPanel('minimap');
        break;
      case 'KeyO':
        s.setPanel('players');
        break;
      case 'KeyP':
        if (s.sim.world.social.party) s.setPartyPanel(!s.local.get().partyPanel);
        break;
      case 'Escape':
        if (!s.closeOverlays()) {
          if (s.sim.world.player.targetId) s.clearTarget();
          else s.setPanel('settings');
        }
        break;
    }
  }

  private keyUp(e: KeyboardEvent): void {
    if (MOVE_KEYS[e.code]) {
      this.held.delete(e.code);
      this.applyMove();
    }
  }

  private applyMove(): void {
    let x = 0;
    let y = 0;
    for (const k of this.held) {
      const v = MOVE_KEYS[k]!;
      x += v[0];
      y += v[1];
    }
    this.session.move(Math.sign(x), Math.sign(y));
  }

  clear(): void {
    this.held.clear();
    this.session.move(0, 0);
  }

  /** Toque/clique em coordenadas do canvas: seleciona entidade, abre loot ou caminha até o tile. */
  tapAt(x: number, y: number): void {
    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(x, y);
    const sim = this.session.sim;
    // só o corpo/nome acerta a entidade (um raio maior "roubava" os toques de andar perto do Boladex)
    const hit = this.views.pick(wp.x, wp.y);
    if (hit) {
      this.session.tapEntity(hit);
      this.session.audio.play('ui');
      return;
    }
    this.session.closeActorMenu();
    const tx = Math.floor(wp.x / 16);
    const ty = Math.floor(wp.y / 16);
    for (const bag of sim.world.lootBags.values()) {
      if (Math.abs(bag.x - tx) <= 0 && Math.abs(bag.y - ty) <= 0) {
        sim.tapLoot(bag.id);
        return;
      }
    }
    if (sim.walkTo(tx, ty)) this.effects.showMarker(tx, ty);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.session.setScreenTapHandler(null);
    this.session.setScreenHoverHandler(null);
    this.session.setScreenLocator(null);
    this.scene.input.removeAllListeners();
  }
}
