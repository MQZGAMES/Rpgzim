// Efeitos visuais e sonoros reativos aos eventos da simulação: projéteis, impactos, números flutuantes,
// palavras mágicas, mortes, corpos, sacos de loot, subida de nível, mira do alvo e marcador de destino.
import Phaser from 'phaser';
import type { Element } from '../../domain/value-objects/element';
import type { GameEventMap } from '../../domain/events/gameEvents';
import type { TilePos } from '../../domain/value-objects/position';
import type { GameSession } from '../../integration/game-ui-bridge/GameSession';
import type { SfxName } from '../audio/AudioService';
import type { EntityViews } from './EntityViews';
import { DEPTH, ySort } from './depth';
import { worldText } from './text';

const ELEMENT_COLOR: Record<Element, number> = {
  physical: 0xe04a44,
  fire: 0xf6953a,
  ice: 0x7cc4ec,
  earth: 0x9ccc42,
  energy: 0xc08cff,
  holy: 0xf8dc6c,
};

const SPELL_SFX: Record<string, SfxName> = { energy: 'energy', fire: 'fire', earth: 'earth', ice: 'ice', holy: 'holy', heal: 'heal', buff: 'buff', brutal: 'brutal', whirl: 'whirl', bow: 'bow' };

const tileCenter = (t: TilePos) => ({ x: t.x * 16 + 8, y: t.y * 16 + 8 });

export class EffectsView {
  private readonly unsub: (() => void)[] = [];
  private readonly bags = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly target: Phaser.GameObjects.Sprite;
  private readonly marker: Phaser.GameObjects.Sprite;
  private auras: { sprite: Phaser.GameObjects.Sprite; until: number; targetId: string }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: GameSession,
    private readonly views: EntityViews,
  ) {
    const ev = session.sim.events;
    this.target = scene.add.sprite(0, 0, 'fx', 'target_0').setVisible(false);
    scene.tweens.add({ targets: this.target, scale: { from: 1, to: 1.08 }, duration: 380, yoyo: true, repeat: -1 });
    this.marker = scene.add.sprite(0, 0, 'fx', 'marker_0').setVisible(false).setDepth(DEPTH.flat + 1);
    this.marker.on('animationcomplete', () => this.marker.setVisible(false));
    const on = <K extends keyof GameEventMap>(k: K, fn: (e: GameEventMap[K]) => void) => this.unsub.push(ev.on(k, fn));
    on('attack', (e) => this.onAttack(e));
    on('damage', (e) => this.onDamage(e));
    on('heal', (e) => this.onHeal(e));
    on('missed', (e) => {
      this.floatText('ERROU', tileCenter(e.position).x, tileCenter(e.position).y - 14, 0xb6aebd);
      if (this.audible(e.sourceId, e.position)) session.audio.play('miss');
    });
    on('spellCast', (e) => this.onSpell(e));
    on('entityDied', (e) => this.onDeath(e));
    on('lootDropped', (e) => this.onLoot(e.containerId, e.position));
    on('lootChanged', (e) => {
      if (!session.sim.world.lootBags.has(e.containerId)) {
        this.bags.get(e.containerId)?.destroy();
        this.bags.delete(e.containerId);
      }
    });
    on('levelUp', (e) => this.onLevelUp(e.level));
    on('skillUp', () => {
      const h = this.views.headOf(this.session.sim.world.player.id);
      if (h) this.floatText('SKILL UP!', h.x, h.y - 18, 0x5cbba8, 1100);
      this.session.audio.play('skill');
    });
    on('xpGained', (e) => {
      const h = this.views.headOf(this.session.sim.world.player.id);
      if (h) this.floatText(`+${e.amount} XP`, h.x, h.y + 4, 0xfbf8ef, 1000, 350);
    });
    on('buffApplied', (e) => this.onBuff(e.targetId, e.kind, e.durationMs));
    on('actorFx', (e) => {
      if (!this.vis(e.entityId)) return;
      const h = this.views.headOf(e.entityId);
      if (!h) return;
      const color = e.tone === 'level' ? 0xf8dc6c : e.tone === 'skill' ? 0x5cbba8 : 0xfbf8ef;
      this.floatText(e.text, h.x, h.y - (e.tone === 'xp' ? -4 : 18), color, e.tone === 'level' ? 1600 : 1000, e.tone === 'xp' ? 350 : 0);
      if (e.tone === 'level') {
        const v = this.views.get(e.entityId);
        if (v) this.playFx('fx_levelup', v.container.x, v.container.y + 2, v.container.depth + 1, { origin: [0.5, 1] });
      }
    });
    on('actorRespawned', (e) => {
      const v = this.views.get(e.entityId);
      if (!v) return;
      v.revive();
      if (v.container.visible) this.playFx('fx_heal', v.container.x, v.container.y - 14, v.container.depth + 1);
    });
    on('speech', (e) => this.speech(e.entityId, e.text));
    on('monsterReturned', (e) => {
      // fumaça onde sumiu e onde reapareceu (se estiver na tela)
      if (this.onScreen(e.from)) this.playFx('fx_poof', tileCenter(e.from).x, tileCenter(e.from).y - 6, DEPTH.overlay);
      if (this.onScreen(e.to)) this.playFx('fx_poof', tileCenter(e.to).x, tileCenter(e.to).y - 6, DEPTH.overlay);
    });
    on('playerRespawned', () => {
      const v = this.views.player;
      v.revive();
      this.playFx('fx_heal', v.container.x, v.container.y - 14, v.container.depth + 1);
      this.scene.cameras.main.fadeIn(500, 18, 13, 24);
    });
    on('doorChanged', () => session.audio.play('door'));
    on('itemUsed', (e) => e.itemId.startsWith('potion') && session.audio.play('potion'));
    on('goldChanged', (e) => e.delta > 0 && session.audio.play('coin'));
    // sacos de loot já existentes (ex.: recarga de cena)
    for (const bag of session.sim.world.lootBags.values()) this.onLoot(bag.id, bag);
  }

  // ------------------------------------------------------------------ utilidades
  floatText(text: string, x: number, y: number, color: number, duration = 800, delay = 0, size = 8): void {
    const t = worldText(this.scene, Math.round(x), Math.round(y), text, { size: Math.round(size * 1.6), color: `#${color.toString(16).padStart(6, '0')}` });
    t.setOrigin(0.5, 1).setDepth(DEPTH.text);
    t.setAlpha(delay ? 0 : 1);
    this.scene.tweens.add({ targets: t, y: y - 14, delay, duration, ease: 'Cubic.Out', onStart: () => t.setAlpha(1) });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: delay + duration * 0.6, duration: duration * 0.4, onComplete: () => t.destroy() });
  }

  playFx(name: string, x: number, y: number, depth: number, opts: { delay?: number; scale?: number; origin?: [number, number] } = {}): void {
    const run = () => {
      const s = this.scene.add.sprite(Math.round(x), Math.round(y), 'fx', `${name}_0`).setDepth(depth).setScale(opts.scale ?? 1);
      if (opts.origin) s.setOrigin(opts.origin[0], opts.origin[1]);
      s.play(`fx:${name}`);
      s.once('animationcomplete', () => s.destroy());
    };
    if (opts.delay) this.scene.time.delayedCall(opts.delay, run);
    else run();
  }

  private projectile(frame: string, from: { x: number; y: number }, to: { x: number; y: number }, onHit?: () => void): number {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.max(90, dist * 3.2);
    const animated = this.scene.anims.exists(`fx:${frame}`);
    const s = this.scene.add.sprite(from.x, from.y, 'fx', `${frame}_0`).setDepth(DEPTH.overlay);
    if (animated) s.play({ key: `fx:${frame}`, repeat: -1, frameRate: 10 });
    s.setRotation(Math.atan2(to.y - from.y, to.x - from.x));
    this.scene.tweens.add({
      targets: s,
      x: to.x,
      y: to.y,
      duration: dur,
      onComplete: () => {
        s.destroy();
        onHit?.();
      },
    });
    return dur;
  }

  /**
   * Figura de uma criatura SÓ se ela estiver sendo desenhada agora. Quem está fora da tela não é
   * atualizado (economia de desempenho), então a figura guardada fica na última posição em que foi
   * vista — usá-la faria falas, números e golpes aparecerem no lugar errado.
   */
  private vis(id: string) {
    const v = this.views.get(id);
    return v && v.container.visible ? v : undefined;
  }

  /** O tile está na área visível (com uma pequena margem)? */
  private onScreen(pos: TilePos): boolean {
    const cam = this.scene.cameras.main.worldView;
    const x = pos.x * 16 + 8;
    const y = pos.y * 16 + 8;
    return x >= cam.x - 24 && x <= cam.right + 24 && y >= cam.y - 24 && y <= cam.bottom + 24;
  }

  private posOf(id: string, fallback: TilePos): { x: number; y: number } {
    const v = this.vis(id);
    return v ? { x: v.container.x, y: v.container.y - 10 } : tileCenter(fallback);
  }

  // ------------------------------------------------------------------ eventos
  private onAttack(e: GameEventMap['attack']): void {
    // projétil: as duas pontas na tela; golpe corpo a corpo: o alvo na tela (nada atravessa a tela vindo de longe)
    if (e.projectile ? !this.onScreen(e.from) || !this.onScreen(e.to) : !this.onScreen(e.to)) return;
    const from = this.posOf(e.sourceId, e.from);
    const to = this.posOf(e.targetId, e.to);
    const audio = this.audible(e.sourceId, e.from) || this.audible(e.targetId, e.to) ? this.session.audio : { play: () => undefined };
    if (e.projectile) {
      this.projectile(e.projectile, from, to);
      audio.play(e.kind === 'wand' ? (e.element === 'fire' ? 'wand' : e.element === 'energy' ? 'energy' : e.element === 'ice' ? 'ice' : 'earth') : 'bow');
    } else {
      // investida curta do atacante e corte no alvo
      const v = this.vis(e.sourceId);
      if (v) {
        const dx = Math.sign(to.x - from.x) * 3;
        const dy = Math.sign(to.y - from.y) * 3;
        this.scene.tweens.add({ targets: v.lunge, x: dx, y: dy, duration: 70, yoyo: true, ease: 'Quad.Out' });
      }
      this.playFx('slash', to.x, to.y - 2, DEPTH.overlay, { scale: 0.75 });
      audio.play('swing');
    }
  }

  private onDamage(e: GameEventMap['damage']): void {
    if (!this.onScreen(e.position)) return;
    const isPlayer = e.targetId === this.session.sim.world.player.id;
    const v = this.vis(e.targetId);
    const x = v ? v.container.x : tileCenter(e.position).x;
    const y = v ? v.container.y - v.height + 6 : tileCenter(e.position).y - 12;
    const delay = e.sourceId && e.sourceId !== e.targetId ? 0 : 0;
    if (e.blocked || e.amount === 0) {
      this.floatText(e.blocked && isPlayer ? 'BLOQUEOU' : 'ABSORVEU', x, y, 0xa9b0bf, 700, delay);
      this.playFx('hit', x, y + 6, DEPTH.overlay);
      if (this.audible(e.targetId, e.position)) this.session.audio.play('block');
      return;
    }
    this.floatText(String(e.amount), x, y, isPlayer ? 0xff5040 : ELEMENT_COLOR[e.element], 800, delay);
    v?.flash(this.session.sim.now);
    if (e.element === 'physical') this.playFx('blood', x, y + 8, DEPTH.overlay);
    if (this.audible(e.targetId, e.position)) this.session.audio.play(isPlayer ? 'hurt' : 'hit');
  }

  private onHeal(e: GameEventMap['heal']): void {
    const v = this.vis(e.targetId);
    if (!v) return;
    if (e.amount > 0) this.floatText(`+${e.amount}`, v.container.x, v.container.y - v.height + 4, e.mana ? 0x69a0e0 : 0x4fd08a);
    this.playFx('fx_heal', v.container.x, v.container.y - 14, v.container.depth + 1);
    if (!e.mana && this.audible(e.targetId)) this.session.audio.play('heal');
  }

  private onSpell(e: GameEventMap['spellCast']): void {
    const w = this.session.sim.world;
    const spell = w.data.spells[e.spellId];
    if (!spell) return;
    if (!this.onScreen(e.from) && !e.tiles.some((t) => this.onScreen(t))) return;
    const caster = this.vis(e.casterId);
    const color = Phaser.Display.Color.HexStringToColor(spell.vfx.color).color;
    if (caster) this.floatText(e.words, caster.container.x, caster.container.y - caster.height - 6, color, 1100, 0);
    if (this.audible(e.casterId, e.from)) this.session.audio.play(SPELL_SFX[spell.vfx.sfx] ?? 'energy');
    const from = caster ? { x: caster.container.x, y: caster.container.y - 10 } : tileCenter(e.from);
    const impactAll = (delay: number) => {
      for (const t of e.tiles) {
        if (spell.target === 'self') continue;
        const c = tileCenter(t);
        const d = delay + Math.hypot(t.x - e.from.x, t.y - e.from.y) * (spell.target === 'areaSelf' ? 45 : 25);
        if (spell.id === 'arrow_rain') {
          this.scene.time.delayedCall(d, () => this.projectile('proj_arrow', { x: c.x - 18, y: c.y - 60 }, { x: c.x, y: c.y }, () => this.playFx('hit', c.x, c.y, DEPTH.overlay)));
        } else this.playFx(spell.vfx.impact, c.x, c.y - 4, ySort(t.y, 1), { delay: d });
      }
    };
    if (spell.vfx.impact === 'fx_whirl' && caster) {
      this.playFx('fx_whirl', caster.container.x, caster.container.y - 8, DEPTH.overlay);
      return;
    }
    if (spell.target === 'self' && spell.vfx.impact === 'fx_heal') return; // o evento heal já mostra
    if (spell.effect === 'buff') return; // aura mostrada em buffApplied
    if (spell.vfx.projectile && e.targetId && spell.id !== 'arrow_rain' && this.onScreen(e.from)) {
      const to = this.posOf(e.targetId, e.tiles[0] ?? e.from);
      const dur = this.projectile(spell.vfx.projectile, from, to);
      impactAll(dur * 0.9);
    } else impactAll(0);
  }

  private onBuff(targetId: string, kind: string, durationMs: number): void {
    const name = kind === 'defense' ? 'fx_buff_iron' : kind === 'attackSpeed' ? 'fx_buff_focus' : kind === 'regen' ? 'fx_heal' : kind === 'manaShield' ? 'fx_mana_shield' : 'fx_haste';
    const v = this.vis(targetId);
    if (!v) return;
    const s = this.scene.add.sprite(v.container.x, v.container.y, 'fx', `${name}_0`).setOrigin(0.5, 1).setDepth(v.container.depth + 1);
    s.play({ key: `fx:${name}`, repeat: -1, frameRate: 10 });
    this.auras.push({ sprite: s, until: this.session.sim.now + durationMs, targetId });
    if (this.audible(targetId)) this.session.audio.play('buff');
  }

  /** Sons de outros personagens só tocam quando estão perto do jogador. */
  private audible(entityId: string | null | undefined, pos?: TilePos): boolean {
    const w = this.session.sim.world;
    const p = w.human;
    if (!entityId || entityId === p.id) return true;
    const e = w.heroes.get(entityId) ?? w.monsters.get(entityId);
    const at = e ?? pos;
    return !at || Math.max(Math.abs(at.x - p.x), Math.abs(at.y - p.y)) <= 10;
  }

  private bubbles = new Map<string, { box: Phaser.GameObjects.Container; until: number; halfWidth: number }>();
  /** Balão de fala acima da cabeça (some sozinho). */
  private speech(entityId: string, text: string): void {
    // fala de quem está fora da tela não vira balão (só aparece no registro, se estiver perto)
    const v = this.vis(entityId);
    if (!v) return;
    this.bubbles.get(entityId)?.box.destroy();
    const t = worldText(this.scene, 0, 0, text, { size: 12, color: '#fbf8ef', wrap: 170, weight: 700, stroke: null });
    t.setOrigin(0.5, 1);
    const bw = Math.ceil(t.displayWidth);
    const bh = Math.ceil(t.displayHeight);
    // texto claro sobre fundo escuro, centralizado acima da cabeça
    t.setPosition(0, -4);
    const g = this.scene.add.graphics();
    g.fillStyle(0x120d18, 0.82).fillRoundedRect(-bw / 2 - 3, -bh - 6, bw + 6, bh + 4, 2);
    g.fillTriangle(-2, -2, 2, -2, 0, 1);
    const box = this.scene.add.container(0, 0, [g, t]).setDepth(DEPTH.text);
    this.bubbles.set(entityId, { box, until: this.session.sim.now + 2600 + text.length * 45, halfWidth: bw / 2 + 5 });
  }

  private onDeath(e: GameEventMap['entityDied']): void {
    const v = this.views.get(e.entityId);
    if (!v) return;
    if (e.kind === 'monster') {
      if (!v.container.visible || !this.onScreen(e.position)) {
        v.container.setVisible(false);
        return;
      }
      // corpo no chão que se desfaz, fumaça e som
      const sheet = v.sheet;
      const frameCount = this.scene.textures.get(sheet).frameTotal - 1;
      const corpse = this.scene.add.sprite(v.container.x, v.container.y + v.yOffset, sheet, frameCount - 1).setOrigin(0.5, 1).setDepth(DEPTH.flat + 2);
      if (v.sprite.flipX) corpse.setFlipX(true);
      this.scene.tweens.add({ targets: corpse, alpha: 0, delay: this.session.sim.world.data.balance.world.corpseDecayMs - 1500, duration: 1500, onComplete: () => corpse.destroy() });
      this.playFx('fx_poof', v.container.x, v.container.y - 8, DEPTH.overlay);
      v.container.setVisible(false);
      if (this.audible(e.entityId, e.position)) this.session.audio.play('monsterDeath');
    } else {
      v.showDead();
      if (e.entityId === this.session.sim.world.human.id) {
        this.session.audio.play('death');
        this.scene.cameras.main.flash(400, 120, 20, 30);
      } else if (this.audible(e.entityId)) this.session.audio.play('death');
    }
  }

  private onLoot(id: string, pos: TilePos): void {
    if (this.bags.has(id)) return;
    const s = this.scene.add.sprite(pos.x * 16 + 8, (pos.y + 1) * 16 - 2, 'objects', 'loot_bag').setOrigin(0.5, 1).setDepth(DEPTH.flat + 3);
    s.setScale(0.2);
    this.scene.tweens.add({ targets: s, scale: 1, duration: 260, ease: 'Back.Out' });
    this.bags.set(id, s);
    this.playFx('sparkle', s.x + 4, s.y - 10, DEPTH.overlay);
    this.scene.time.addEvent({ delay: 1600, loop: true, callback: () => s.active && s.visible && this.playFx('sparkle', s.x + Phaser.Math.Between(-5, 5), s.y - Phaser.Math.Between(6, 12), DEPTH.overlay) });
  }

  private onLevelUp(level: number): void {
    const v = this.views.player;
    this.playFx('fx_levelup', v.container.x, v.container.y + 2, v.container.depth + 1, { origin: [0.5, 1] });
    this.floatText('LEVEL UP!', v.container.x, v.container.y - 34, 0xf8dc6c, 1600, 0, 8);
    this.floatText(`NIVEL ${level}`, v.container.x, v.container.y - 24, 0xfff6be, 1600, 200);
    this.session.audio.play('levelup');
  }

  /** Mostra o marcador de destino ao tocar no chão. */
  showMarker(tx: number, ty: number): void {
    this.marker.setPosition(tx * 16 + 8, ty * 16 + 8).setVisible(true).play('fx:marker');
  }

  update(now: number): void {
    const w = this.session.sim.world;
    // mira segue o alvo
    const tid = w.player.targetId;
    const tv = tid ? this.vis(tid) : undefined;
    if (tv && tv.container.visible) {
      this.target.setVisible(true).setPosition(tv.container.x, tv.container.y - 7).setDepth(tv.container.depth - 1);
      this.target.setFrame(Math.floor(now / 300) % 2 ? 'target_1' : 'target_0');
    } else this.target.setVisible(false);
    // auras de buff acompanham quem recebeu
    this.auras = this.auras.filter((a) => {
      const v = this.views.get(a.targetId);
      if (now >= a.until || !v) {
        a.sprite.destroy();
        return false;
      }
      a.sprite.setVisible(v.container.visible);
      a.sprite.setPosition(v.container.x, v.container.y + 2).setDepth(v.container.depth + 1);
      return true;
    });
    // balões de fala seguem a cabeça de quem fala
    for (const [id, b] of this.bubbles) {
      const v = this.vis(id);
      if (now >= b.until || !v) {
        b.box.destroy();
        this.bubbles.delete(id);
        continue;
      }
      // acima do nome de quem fala; só desliza um pouco para não cortar na borda da tela
      const cam = this.scene.cameras.main.worldView;
      const fitted = Phaser.Math.Clamp(v.container.x, cam.x + b.halfWidth, cam.right - b.halfWidth);
      const x = Math.abs(fitted - v.container.x) <= 24 ? fitted : v.container.x;
      b.box.setPosition(Math.round(x), v.container.y - v.height - 2);
    }
  }

  destroy(): void {
    for (const u of this.unsub) u();
    this.bags.clear();
  }
}
