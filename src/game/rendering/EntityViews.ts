// Representação visual das criaturas. Lê o estado da simulação (posição interpolada, direção,
// vida) a cada quadro — a renderização nunca é a fonte da verdade.
import type Phaser from 'phaser';
import { renderPos, isMoving } from '../movement/movement';
import type { HeroEntity, MonsterEntity, Mover, NpcEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { DEPTH, ySort } from './depth';
import { SHEETS } from '../../assets';
import { worldText, snapWorld, dprSafe } from './text';

const HUMANOID_ROWS = { down: 0, left: 1, right: 2, up: 3 } as const;

/** Estilo do nome: o do jogador/herói é maior (é informação de combate); o de criatura é discreto. */
export type NameKind = 'actor' | 'creature';

const NAME_STYLE: Record<NameKind, { size: number; weight: number }> = {
  actor: { size: 16, weight: 800 },
  creature: { size: 11, weight: 700 },
};

export class CreatureView {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  private bar: Phaser.GameObjects.Graphics | null = null;
  private label: Phaser.GameObjects.Text | null = null;
  private labelText = '';
  private labelColor = '';
  private labelKind: NameKind = 'creature';
  private lastHpKey = '';
  private flashUntil = 0;
  /** Deslocamento temporário (investida de ataque), em pixels. */
  lunge = { x: 0, y: 0 };
  dead = false;

  constructor(
    scene: Phaser.Scene,
    readonly id: string,
    readonly sheet: string,
    readonly kind: 'humanoid' | 'blob' | 'quad',
    shadow: 's' | 'm' | 'l',
    readonly yOffset: number,
    name?: string,
    labelColor = '#fff09a',
    nameKind: NameKind = 'creature',
  ) {
    this.shadow = scene.add.image(0, -2, 'objects', `shadow_${shadow}`);
    this.sprite = scene.add.sprite(0, yOffset, sheet, 0).setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.shadow, this.sprite]);
    this.scene = scene;
    if (name) this.setName(name, labelColor, nameKind);
  }

  private readonly scene: Phaser.Scene;

  /** Topo da "cabeça" (pixels do mundo, relativo ao pé): referência para a barra de vida e o nome. */
  private get headTop(): number {
    return -this.sprite.displayHeight + this.yOffset + (this.kind === 'humanoid' ? 8 : 2);
  }

  /** Nome sempre visível acima da barra de vida (na fonte da interface). */
  setName(text: string, color: string, nameKind: NameKind = this.labelKind): void {
    if (text === this.labelText && color === this.labelColor && this.label && nameKind === this.labelKind) return;
    this.labelText = text;
    this.labelColor = color;
    this.labelKind = nameKind;
    const style = NAME_STYLE[nameKind];
    if (!this.label) {
      this.label = worldText(this.scene, 0, 0, text, { size: style.size, color, weight: style.weight });
      this.label.setOrigin(0.5, 1);
      this.container.add(this.label);
    } else {
      this.label.setText(text).setColor(color).setFontSize(`${style.size * dprSafe()}px`);
    }
    this.label.setPosition(0, this.headTop - 4);
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
  setHealthBar(pct: number | null, scene: Phaser.Scene = this.scene, color = 0x4fd08a): void {
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
    const top = this.headTop - 3;
    g.fillStyle(0x120d18, 1).fillRect(-w / 2 - 1, top - 1, w + 2, 4);
    const fill = Math.max(1, Math.round(w * pct));
    const c = pct > 0.6 ? color : pct > 0.3 ? 0xf8dc6c : 0xe04a44;
    g.fillStyle(c, 1).fillRect(-w / 2, top, fill, 2);
  }

  sync(m: Mover, now: number, animate: boolean, speed: number): void {
    const p = renderPos(m, now);
    // Encaixa na grade de pixels da tela: sem isso o desenho "pula" meio pixel a cada quadro
    // (a interpolação é fracionária) e o nome do personagem treme enquanto o personagem anda.
    const x = snapWorld(p.x * 16 + 8 + this.lunge.x);
    const y = snapWorld((p.y + 1) * 16 - 1 + this.lunge.y);
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
    } else if (this.kind === 'blob') {
      if (!this.sprite.anims.isPlaying) this.sprite.play(`${this.sheet}_idle`);
      this.sprite.anims.timeScale = moving ? 1.8 : 1;
    } else {
      if (m.facing === 'left') this.sprite.setFlipX(true);
      else if (m.facing === 'right') this.sprite.setFlipX(false);
      if (moving) {
        if (!this.sprite.anims.isPlaying) this.sprite.play(`${this.sheet}_walk`);
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
  /** Heróis (personagens-jogadores com vida própria): nome em verde para diferenciar dos NPCs. */
  readonly heroes = new Map<string, CreatureView>();

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
    const kind = SHEETS.find((s) => s.key === m.def.sprite)?.kind ?? 'humanoid';
    const v = new CreatureView(this.scene, m.id, m.def.sprite, kind, m.def.shadow, kind === 'quad' ? 3 : kind === 'blob' ? 2 : 1);
    if (m.def.scale) {
      v.sprite.setScale(m.def.scale);
      v.shadow.setScale(m.def.scale);
    }
    v.setName(m.def.name, '#f3d6c8');
    this.monsters.set(m.id, v);
    return v;
  }

  private addNpc(n: NpcEntity): void {
    const v = new CreatureView(this.scene, n.id, n.def.sprite, 'humanoid', 's', 1, n.def.name, '#fff09a');
    this.npcs.set(n.id, v);
  }

  /** Nome do personagem com marcas de grupo (★ líder) e caveira (PK). */
  private actorPlate(a: PlayerEntity, base: string): { text: string; color: string } {
    const w = this.world;
    const party = w.social.party;
    const inParty = !!party && party.members.includes(a.id) && party.members.includes(w.human.id);
    const skull = (w.social.skulls.get(a.id) ?? 0) > w.now;
    const text = `${party?.leaderId === a.id && inParty ? '★ ' : ''}${skull ? '☠ ' : ''}${a.character.name}`;
    const color = skull ? '#ff7a6a' : inParty && a.id !== w.human.id ? '#7fd8ff' : base;
    return { text, color };
  }

  get(id: string): CreatureView | undefined {
    return id === this.player.id ? this.player : (this.monsters.get(id) ?? this.npcs.get(id) ?? this.heroes.get(id));
  }

  private addHero(h: HeroEntity): CreatureView {
    const v = new CreatureView(this.scene, h.id, h.character.vocation, 'humanoid', 's', 1, h.character.name, '#8ff0b0', 'actor');
    this.heroes.set(h.id, v);
    return v;
  }

  /** Posição de tela (pixels do mundo) do topo da cabeça de uma entidade. */
  headOf(id: string): { x: number; y: number } | null {
    const v = this.get(id);
    if (!v) return null;
    return { x: v.container.x, y: v.container.y - v.height + 8 };
  }

  sync(now: number, targetId: string | null, view?: { x: number; y: number; right: number; bottom: number }): void {
    const w = this.world;
    const p: PlayerEntity = w.player;
    this.player.sync(p, now, true, p.stats.speed);
    // só desenha (sprite, nome e barra) quem está na área visível: poupa muito em aparelhos fracos
    const M = 40;
    const visible = (e: { x: number; y: number }) => !view || (e.x * 16 + 8 >= view.x - M && e.x * 16 + 8 <= view.right + M && e.y * 16 >= view.y - M && e.y * 16 <= view.bottom + M);
    for (const m of w.monsters.values()) {
      let v = this.monsters.get(m.id);
      if (!v) v = this.addMonster(m);
      if (!m.alive || !visible(m)) {
        v.container.setVisible(false);
        continue;
      }
      if (!v.container.visible || v.dead) {
        v.revive();
        v.container.setVisible(true);
      }
      v.sync(m, now, true, m.def.speed);
      v.setLabelVisible(true);
      v.setHealthBar(m.hp / m.def.health, this.scene, m.id === targetId ? 0xff6a5a : 0x4fd08a);
    }
    for (const n of w.npcs.values()) {
      const v = this.npcs.get(n.id)!;
      v.container.setVisible(visible(n));
      if (!v.container.visible) continue;
      v.sync(n, now, true, 1.6);
      v.setLabelVisible(true);
    }
    for (const h of w.heroes.values()) {
      const v = this.heroes.get(h.id) ?? this.addHero(h);
      v.container.setVisible(visible(h));
      if (!v.container.visible) continue;
      v.sync(h, now, true, h.stats.speed);
      const plate = this.actorPlate(h, '#8ff0b0');
      v.setName(plate.text, plate.color, 'actor');
      v.setLabelVisible(!h.dead);
      v.setHealthBar(h.dead ? null : h.character.health / h.stats.maxHealth, this.scene, h.id === targetId ? 0xff6a5a : 0x4fd08a);
    }
    const plate = this.actorPlate(p, '#fbf8ef');
    this.player.setName(plate.text, plate.color, 'actor');
    this.player.setLabelVisible(!p.dead);
    this.player.setHealthBar(p.dead ? null : p.character.health / p.stats.maxHealth, this.scene, 0x4fd08a);
  }

  /** Centro do desenho de uma entidade no mundo (para testes e para apontar coisas na tela). */
  centerOf(id: string): { x: number; y: number } | null {
    const v = this.monsters.get(id) ?? this.npcs.get(id) ?? this.heroes.get(id);
    if (!v || !v.container.visible) return null;
    return { x: v.container.x, y: v.container.y - v.height / 2 };
  }

  /** Entidade sob um ponto do mundo (para toque/clique). */
  pick(wx: number, wy: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    // a área de toque inclui o nome e a barra de vida acima da cabeça (onde o jogador costuma tocar)
    const test = (id: string, v: CreatureView, pad: number, weight: number, half = 13) => {
      if (!v.container.visible || v.dead) return;
      const cx = v.container.x;
      const top = v.container.y - v.height - pad;
      const bottom = v.container.y + 4;
      if (wx < cx - half || wx > cx + half || wy < top || wy > bottom) return;
      const d = Math.hypot(wx - cx, wy - (v.container.y - v.height / 2)) * weight;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    };
    for (const [id, v] of this.monsters) test(id, v, 4, 1);
    for (const [id, v] of this.npcs) test(id, v, 12, 1);
    // personagens com vida própria têm prioridade (andam bastante e ficam no meio dos monstros)
    for (const [id, v] of this.heroes) test(id, v, 16, 0.6, 15);
    return best;
  }

  destroy(): void {
    this.player.destroy();
    for (const v of this.monsters.values()) v.destroy();
    for (const v of this.npcs.values()) v.destroy();
    for (const v of this.heroes.values()) v.destroy();
  }
}

export { DEPTH };
