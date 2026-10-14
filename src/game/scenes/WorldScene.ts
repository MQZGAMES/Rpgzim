// Cena principal: monta as visualizações a partir do estado da simulação e as sincroniza a cada quadro.
import Phaser from 'phaser';
import { ASSETS } from '../../assets';
import type { GameSession } from '../../integration/game-ui-bridge/GameSession';
import { renderPos } from '../movement/movement';
import { MapView } from '../rendering/MapView';
import { PropsView } from '../rendering/PropsView';
import { RoofView } from '../rendering/RoofView';
import { EntityViews } from '../rendering/EntityViews';
import { EffectsView } from '../rendering/EffectsView';
import { CameraController } from '../camera/CameraController';
import { InputController } from '../input/InputController';

export class WorldScene extends Phaser.Scene {
  private session!: GameSession;
  private mapView!: MapView;
  private props!: PropsView;
  private roofs!: RoofView;
  private views!: EntityViews;
  private effects!: EffectsView;
  private cam!: CameraController;
  private inputCtl!: InputController;
  private unsub: (() => void)[] = [];

  constructor() {
    super('world');
  }

  create(): void {
    this.session = this.registry.get('session') as GameSession;
    const w = this.session.sim.world;
    const names = ASSETS.tiles.names;
    this.mapView = new MapView(this, w.map, names);
    this.props = new PropsView(this, w.map);
    this.roofs = new RoofView(this, w.map, names);
    this.views = new EntityViews(this, w);
    this.effects = new EffectsView(this, this.session, this.views);
    this.cam = new CameraController(this, w.map.width * 16, w.map.height * 16);
    this.setZoomBias(Number(this.registry.get('zoomBias') ?? 0));
    this.inputCtl = new InputController(this, this.session, this.views, this.effects);
    this.unsub.push(this.session.sim.events.on('doorChanged', (e) => this.props.setDoor(e.doorId, e.open)));
    for (const [id, open] of w.doorsOpen) this.props.setDoor(id, open);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
    this.session.start();
    this.cameras.main.fadeIn(450, 18, 13, 24);
  }

  private onResize(): void {
    this.cam.resize();
  }

  setZoomBias(bias: number): void {
    this.cam.zoomBias = bias;
    this.cam.resize();
  }

  override update(_time: number, delta: number): void {
    const s = this.session;
    s.frame(delta);
    const w = s.sim.world;
    const now = w.now;
    this.views.sync(now, w.player.targetId);
    const pp = renderPos(w.player, now);
    this.cam.update(pp.x * 16 + 8, pp.y * 16 + 4, delta);
    this.roofs.update(delta, w.ui.buildingId, pp.x, pp.y);
    this.mapView.update(delta);
    this.props.update(delta, this.cameras.main.worldView);
    this.effects.update(now);
  }

  private cleanup(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.scale.off('resize', this.onResize, this);
    this.inputCtl?.destroy();
    this.effects?.destroy();
  }
}
