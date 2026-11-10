import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { CreatureView } from '../../src/game/rendering/EntityViews';

function makeView() {
  const graphics = {
    visible: true,
    setVisible: vi.fn((visible: boolean) => {
      graphics.visible = visible;
      return graphics;
    }),
    clear: vi.fn(() => graphics),
    fillStyle: vi.fn(() => graphics),
    fillRect: vi.fn(() => graphics),
  };
  const sprite = {
    displayHeight: 32,
    texture: { frameTotal: 14 },
    anims: { stop: vi.fn() },
    setFrame: vi.fn(),
    setOrigin: vi.fn(() => sprite),
    setAlpha: vi.fn(),
  };
  const container = { add: vi.fn(), setAlpha: vi.fn() };
  const scene = {
    add: {
      image: vi.fn(() => ({})),
      sprite: vi.fn(() => sprite),
      container: vi.fn(() => container),
      graphics: vi.fn(() => graphics),
    },
  };
  const view = new CreatureView(scene as unknown as Phaser.Scene, 'hero', 'knight', 'humanoid', 's', 1);
  return { view, graphics, scene };
}

describe('health bar lifecycle', () => {
  it('draws a full health bar on the first update, without taking damage', () => {
    const { view, graphics, scene } = makeView();
    view.setHealthBar(1);
    expect(scene.add.graphics).toHaveBeenCalledOnce();
    expect(graphics.visible).toBe(true);
    expect(graphics.fillRect).toHaveBeenLastCalledWith(-10, -30, 20, 2);
  });

  it('restores the bar after death and revival with exactly the same HP', () => {
    const { view, graphics } = makeView();
    view.setHealthBar(1);
    view.showDead();
    expect(graphics.visible).toBe(false);
    view.revive();
    view.setHealthBar(1);
    expect(graphics.visible).toBe(true);
    expect(graphics.clear).toHaveBeenCalledTimes(2);
  });

  it('repairs a hidden bar even when the cached HP is unchanged', () => {
    const { view, graphics } = makeView();
    view.setHealthBar(0.8);
    graphics.setVisible(false);
    view.setHealthBar(0.8);
    expect(graphics.visible).toBe(true);
  });

  it('keeps dead bars hidden and avoids redrawing unchanged living bars', () => {
    const { view, graphics } = makeView();
    view.setHealthBar(1);
    view.setHealthBar(1);
    expect(graphics.clear).toHaveBeenCalledOnce();
    view.showDead();
    view.setHealthBar(null);
    expect(graphics.visible).toBe(false);
    expect(graphics.clear).toHaveBeenCalledOnce();
  });
});
