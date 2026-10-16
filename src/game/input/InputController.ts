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
  private downAt: { x: number; y: number; t: number } | null = null;

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
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.session.audio.unlock();
      this.downAt = { x: p.x, y: p.y, t: p.downTime };
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.pointerUp(p));
    // mouse: cursor de "mão" sobre personagens, monstros e NPCs (deixa claro que dá para clicar)
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const wp = scene.cameras.main.getWorldPoint(p.x, p.y);
      const hit = this.views.pick(wp.x, wp.y) ?? this.views.heroNear(wp.x, wp.y);
      scene.game.canvas.style.cursor = hit ? 'pointer' : 'default';
    });
    session.setScreenTapHandler((cx, cy) => {
      const canvas = this.scene.game.canvas;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.tapAt(((cx - r.left) * this.scene.scale.width) / r.width, ((cy - r.top) * this.scene.scale.height) / r.height);
    });
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
        s.castSlot(Number(e.code.slice(5)) - 1);
        break;
      case 'Digit5':
      case 'KeyQ':
        s.quickPotion('health');
        break;
      case 'Digit6':
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

  private pointerUp(p: Phaser.Input.Pointer): void {
    const d = this.downAt;
    this.downAt = null;
    if (!d || Math.hypot(p.x - d.x, p.y - d.y) > 14 * (window.devicePixelRatio || 1)) return;
    if (p.button === 2) return;
    this.tapAt(p.x, p.y);
  }

  /** Toque/clique em coordenadas do canvas: seleciona entidade, abre loot ou caminha até o tile. */
  tapAt(x: number, y: number): void {
    const cam = this.scene.cameras.main;
    const wp = cam.getWorldPoint(x, y);
    const sim = this.session.sim;
    const hit = this.views.pick(wp.x, wp.y) ?? this.views.heroNear(wp.x, wp.y);
    if (hit) {
      this.session.tapEntity(hit);
      this.session.audio.play('ui');
      return;
    }
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
    this.scene.input.removeAllListeners();
  }
}
