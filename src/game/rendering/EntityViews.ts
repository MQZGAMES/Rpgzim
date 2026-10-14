// Representação visual das criaturas. Lê o estado da simulação (posição interpolada, direção,
// vida) a cada quadro — a renderização nunca é a fonte da verdade.
import type Phaser from 'phaser';
import { renderPos, isMoving } from '../movement/movement';
import type { MonsterEntity, Mover, NpcEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { DEPTH, ySort } from './depth';

const HUMANOID_ROWS = { down: 0, left: 1, right: 2, up: 3 } as const;

export class CreatureView {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  private bar: Phaser.GameObjects.Graphics | null = null;
  private label: Phaser.GameObjects.BitmapText | null = null;
  private lastHpKey = '';
  private flashUntil = 0;
  /** Deslocamento temporário (investida de ataque), em pixels. */
  lunge = { x: 0, y: 0 };
  dead = false;

  constructor(
    scene: Phaser.Scene,
    readonly id: string,
    readonly sheet: string,
    readonly kind: 'humanoid' | 'slime' | 'boar',
    shadow: 's' | 'm' | 'l',
    readonly yOffset: number,
    name?: string,
  ) {
    this.shadow = scene.add.image(0, -2, 'objects', `shadow_${shadow}`);
    this.sprite = scene.add.sprite(0, yOffset, sheet, 0).setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.shadow, this.sprite]);
    if (name) {
      this.label = scene.add.bitmapText(0, -30 + yOffset, 'pixel', name.toUpperCase(), 8).setOrigin(0.5, 1).setTint(0xfff09a);
      this.container.add(this.label);
    }
  }

  get height(): number {
    return this.sprite.height;
  }

  setLabelVisible(v: boolean): void {
    this.label?.setVisible(v);
  }

  flash(now: number): void {
    this.flashUntil = now + 90;
  }

  /** Barra de vida compacta acima da cabeça (redesenhada só quando muda). */
  setHealthBar(pct: number | null, scene: Phaser.Scene, color = 0x4fd08a): void {
    const key = pct === null ? 'none' : `${Math.round(pct * 14)}:${color}`;
    if (key === this.lastHpKey) return;
    this.lastHpKey = key;
    if (pct === null) {
      this.bar?.setVisible(false);
      return;
    }
    if (!this.bar) {
      this.bar = scene.add.graphics();
      this.container.add(this.bar);
    }
    const g = this.bar.setVisible(true).clear();
    const w = 14;
    const top = -this.sprite.height + this.yOffset - 3 + (this.kind === 'humanoid' ? 8 : 2);
    g.fillStyle(0x120d18, 1).fillRect(-w / 2 - 1, top - 1, w + 2, 4);
    const fill = Math.max(1, Math.round(w * pct));
    const c = pct > 0.6 ? color : pct > 0.3 ? 0xf8dc6c : 0xe04a44;
    g.fillStyle(c, 1).fillRect(-w / 2, top, fill, 2);
  }

  sync(m: Mover, now: number, animate: boolean, speed: number): void {
    const p = renderPos(m, now);
    const x = Math.round(p.x * 16 + 8 + this.lunge.x);
    const y = Math.round((p.y + 1) * 16 - 1 + this.lunge.y);
    this.container.setPosition(x, y);
    this.container.setDepth(ySort(p.y, 0.5));
    if (this.dead) return;
    const moving = animate && isMoving(m, now);
    if (this.kind === 'humanoid') {
      const key = `${this.sheet}_walk_${m.facing}`;
      if (moving) {
        if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) this.sprite.play(key, true);
        this.sprite.anims.timeScale = speed / 4;
      } else {
        this.sprite.anims.stop();
        this.sprite.setFrame(HUMANOID_ROWS[m.facing] * 3);
      }
    } else if (this.kind === 'slime') {
      if (!this.sprite.anims.isPlaying) this.sprite.play('slime_idle');
      this.sprite.anims.timeScale = moving ? 1.8 : 1;
    } else {
      if (m.facing === 'left') this.sprite.setFlipX(true);
      else if (m.facing === 'right') this.sprite.setFlipX(false);
      if (moving) {
        if (!this.sprite.anims.isPlaying) this.sprite.play('boar_walk');
      } else {
        this.sprite.anims.stop();
        this.sprite.setFrame(0);
      }
    }
    if (now < this.flashUntil) this.sprite.setTintFill(0xffffff);
    else this.sprite.clearTint();
  }

  showDead(): void {
    this.dead = true;
    this.sprite.anims.stop();
    const frames = this.sprite.texture.frameTotal - 1; // inclui __BASE
    this.sprite.setFrame(frames - 1);
    this.bar?.setVisible(false);
    this.label?.setVisible(false);
  }

  revive(): void {
    this.dead = false;
    this.sprite.setAlpha(1);
    this.container.setAlpha(1);
  }

  destroy(): void {
    this.container.destroy();
  }
}

export class EntityViews {
  readonly player: CreatureView;
  readonly monsters = new Map<string, CreatureView>();
  readonly npcs = new Map<string, CreatureView>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    const p = world.player;
    this.player = new CreatureView(scene, p.id, p.character.vocation, 'humanoid', 's', 1);
    for (const m of world.monsters.values()) this.addMonster(m);
    for (const n of world.npcs.values()) this.addNpc(n);
  }

  addMonster(m: MonsterEntity): CreatureView {
    const kind = m.def.sprite === 'slime' ? 'slime' : m.def.sprite === 'boar' ? 'boar' : 'humanoid';
    const v = new CreatureView(this.scene, m.id, m.def.sprite, kind, m.def.shadow, kind === 'boar' ? 3 : kind === 'slime' ? 2 : 1);
    this.monsters.set(m.id, v);
    return v;
  }

  private addNpc(n: NpcEntity): void {
    const v = new CreatureView(this.scene, n.id, n.def.sprite, 'humanoid', 's', 1, n.def.name);
    this.npcs.set(n.id, v);
  }

  get(id: string): CreatureView | undefined {
    return id === this.player.id ? this.player : (this.monsters.get(id) ?? this.npcs.get(id));
  }

  /** Posição de tela (pixels do mundo) do topo da cabeça de uma entidade. */
  headOf(id: string): { x: number; y: number } | null {
    const v = this.get(id);
    if (!v) return null;
    return { x: v.container.x, y: v.container.y - v.height + 8 };
  }

  sync(now: number, targetId: string | null): void {
    const w = this.world;
    const p: PlayerEntity = w.player;
    this.player.sync(p, now, true, p.stats.speed);
    for (const m of w.monsters.values()) {
      let v = this.monsters.get(m.id);
      if (!v) v = this.addMonster(m);
      if (!m.alive) {
        v.container.setVisible(false);
        continue;
      }
      if (!v.container.visible || v.dead) {
        v.revive();
        v.container.setVisible(true);
      }
      v.sync(m, now, true, m.def.speed);
      const pct = m.hp / m.def.health;
      v.setHealthBar(m.id === targetId || pct < 1 ? pct : null, this.scene, 0x4fd08a);
    }
    for (const n of w.npcs.values()) {
      const v = this.npcs.get(n.id)!;
      v.sync(n, now, true, 1.6);
      v.setLabelVisible(Math.max(Math.abs(n.x - p.x), Math.abs(n.y - p.y)) <= 4);
    }
    const hpPct = p.character.health / p.stats.maxHealth;
    this.player.setHealthBar(p.dead || (hpPct >= 1 && !targetId) ? null : hpPct, this.scene, 0x4fd08a);
  }

  /** Entidade sob um ponto do mundo (para toque/clique). */
  pick(wx: number, wy: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    const test = (id: string, v: CreatureView) => {
      if (!v.container.visible || v.dead) return;
      const cx = v.container.x;
      const top = v.container.y - v.height + 6;
      const bottom = v.container.y + 2;
      if (wx < cx - 11 || wx > cx + 11 || wy < top || wy > bottom) return;
      const d = Math.hypot(wx - cx, wy - (top + bottom) / 2);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    };
    for (const [id, v] of this.monsters) test(id, v);
    for (const [id, v] of this.npcs) test(id, v);
    return best;
  }

  destroy(): void {
    this.player.destroy();
    for (const v of this.monsters.values()) v.destroy();
    for (const v of this.npcs.values()) v.destroy();
  }
}

export { DEPTH };
