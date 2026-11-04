import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import type { BuildResult, Vec2 } from '@fs/recipe';
import type { ContextPrism, SunPosition } from '@fs/sun';
import { MassingLayer } from './MassingLayer';
import { ContextLayer } from './ContextLayer';
import { OverlayLayer } from './OverlayLayer';
import { SunLayer } from './SunLayer';

/** Local site frame (x east, y north, z up) → Three.js (y up). */
export const toThree = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>;

/** Wraps That Open Components: one world, layered scene content, picking, 2D/3D modes. */
export class ViewportManager {
  readonly components = new OBC.Components();
  readonly world: World;
  readonly massing: MassingLayer;
  readonly context: ContextLayer;
  readonly overlay: OverlayLayer;
  readonly sun: SunLayer;
  private readonly raycaster = new THREE.Raycaster();
  private frames = 0;
  private lastFpsCheck = performance.now();
  private lowEnd = false;
  onPick: (blockId: string | null) => void = () => undefined;
  onFps: (fps: number) => void = () => undefined;

  constructor(private readonly container: HTMLElement) {
    const worlds = this.components.get(OBC.Worlds);
    this.world = worlds.create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>();
    this.world.scene = new OBC.SimpleScene(this.components);
    this.world.scene.setup();
    this.world.scene.three.background = new THREE.Color('#eef2f1');
    this.world.renderer = new OBC.SimpleRenderer(this.components, container);
    this.world.camera = new OBC.OrthoPerspectiveCamera(this.components);
    this.components.init();
    const r = this.world.renderer.three;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.world.scene.three;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.25 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);
    this.massing = new MassingLayer(scene);
    this.context = new ContextLayer(scene);
    this.overlay = new OverlayLayer(scene);
    this.sun = new SunLayer(scene);
    void this.world.camera.controls.setLookAt(60, 70, 80, 0, 0, 0, false);
    container.addEventListener('pointerup', this.handlePick);
    this.world.renderer.onAfterUpdate.add(this.trackFps);
  }

  private trackFps = () => {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsCheck > 2000) {
      const fps = (this.frames * 1000) / (now - this.lastFpsCheck);
      this.frames = 0;
      this.lastFpsCheck = now;
      this.onFps(fps);
      // Low-end devices: drop shadows and pixel ratio when below 30 fps.
      if (fps < 30 && !this.lowEnd) {
        this.lowEnd = true;
        this.world.renderer!.three.shadowMap.enabled = false;
        this.world.renderer!.three.setPixelRatio(1);
        this.sun.setShadows(false);
      }
    }
  };

  private handlePick = (ev: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.world.camera.three);
    const hit = this.raycaster.intersectObjects(this.massing.group.children, true)[0];
    this.onPick((hit?.object.userData.blockId as string | undefined) ?? null);
  };

  setSite(plot: Vec2[], buildable: Vec2[] | null) {
    this.overlay.setPlot(plot, buildable);
  }

  setBuild(br: BuildResult, selection: string | null, highlight: string[]) {
    this.massing.update(br, selection, highlight);
  }

  setContext(c: ContextPrism[]) {
    this.context.update(c);
  }

  setSun(pos: SunPosition | null) {
    this.sun.setPosition(pos, !this.lowEnd);
  }

  async setMode(mode: '2d' | '3d') {
    const cam = this.world.camera;
    if (mode === '2d') {
      await cam.projection.set('Orthographic');
      await cam.controls.setLookAt(0, 200, 0.001, 0, 0, 0, true);
    } else {
      await cam.projection.set('Perspective');
      await cam.controls.setLookAt(60, 70, 80, 0, 0, 0, true);
    }
  }

  fitTo(plot: Vec2[]) {
    if (!plot.length) return;
    const box = new THREE.Box3();
    for (const p of plot) box.expandByPoint(toThree(p[0], p[1]));
    box.expandByPoint(toThree(plot[0]![0], plot[0]![1], 30));
    void this.world.camera.controls.fitToBox(box, true, { paddingLeft: 10, paddingRight: 10, paddingTop: 10, paddingBottom: 10 });
  }

  dispose() {
    this.container.removeEventListener('pointerup', this.handlePick);
    this.components.dispose();
  }
}
