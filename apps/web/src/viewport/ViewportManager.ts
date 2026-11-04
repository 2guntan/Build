import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import type { BuildResult, EdgeClass, Vec2 } from '@fs/recipe';
import type { Evaluation } from '@fs/rules';
import type { ContextPrism, SunPosition } from '@fs/sun';
import { ContextLayer } from './ContextLayer';
import { EditControls, type EditEvent } from './EditControls';
import { LabelsLayer } from './LabelsLayer';
import { MassingLayer, type MassingStyle } from './MassingLayer';
import { OverlayLayer } from './OverlayLayer';
import { StudioRenderer } from './StudioRenderer';
import { SunLayer, type HeatCell } from './SunLayer';
import { TileGround, type BasemapKind } from './TileGround';

/** Local site frame (x east, y north, z up) → Three.js (y up). */
export const toThree = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);

export type ViewPreset = 'iso' | 'top' | 'south' | 'north' | 'east' | 'west';

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, StudioRenderer>;

function skyTexture(dark: boolean) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  if (dark) {
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#273445');
  } else {
    grad.addColorStop(0, '#b8d3ec');
    grad.addColorStop(0.6, '#e6eef4');
    grad.addColorStop(1, '#f4f1ea');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wraps That Open Components: one world, layered content, picking, editing, camera presets. */
export class ViewportManager {
  readonly components = new OBC.Components();
  readonly world: World;
  readonly ground: TileGround;
  readonly massing: MassingLayer;
  readonly context: ContextLayer;
  readonly overlay: OverlayLayer;
  readonly labels: LabelsLayer;
  readonly sun: SunLayer;
  readonly edit: EditControls;
  private readonly raycaster = new THREE.Raycaster();
  private frames = 0;
  private lastFpsCheck = performance.now();
  private lowFpsStreak = 0;
  /** 'auto' lowers quality on slow devices; 'high' / 'low' are fixed by the user. */
  qualityMode: 'auto' | 'high' | 'low' = 'auto';
  private plot: Vec2[] = [];
  private down: { x: number; y: number } | null = null;
  onPick: (blockId: string | null) => void = () => undefined;
  onFps: (fps: number) => void = () => undefined;
  onCamera: (azimuthDeg: number) => void = () => undefined;
  onEdit: (e: EditEvent) => void = () => undefined;

  constructor(private readonly container: HTMLElement) {
    const worlds = this.components.get(OBC.Worlds);
    this.world = worlds.create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, StudioRenderer>();
    this.world.scene = new OBC.SimpleScene(this.components);
    const scene = this.world.scene.three as THREE.Scene;
    scene.background = skyTexture(false);
    scene.fog = new THREE.Fog('#eef1f0', 500, 1600);
    this.world.renderer = new StudioRenderer(this.components, container);
    this.world.camera = new OrthoPerspectiveCamera2(this.components);
    this.components.init();
    const cam = this.world.camera.three as THREE.PerspectiveCamera;
    if ('far' in cam) {
      cam.far = 5000;
      cam.near = 0.5;
      cam.updateProjectionMatrix();
    }
    this.ground = new TileGround(scene);
    this.ground.onChange = () => (this.world.renderer!.needsUpdate = true);
    this.massing = new MassingLayer(scene);
    this.context = new ContextLayer(scene);
    this.overlay = new OverlayLayer(scene);
    this.labels = new LabelsLayer(scene);
    this.sun = new SunLayer(scene);
    this.edit = new EditControls(scene, this.world.camera, container, this.massing);
    this.edit.onEdit = (e) => this.onEdit(e);
    const controls = this.world.camera.controls;
    controls.dollyToCursor = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.addEventListener('update', () => this.onCamera((controls.azimuthAngle * 180) / Math.PI));
    void controls.setLookAt(70, 60, 90, 0, 0, 0, false);
    container.addEventListener('pointerdown', this.handleDown);
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
      // Low-end devices: after two slow windows, drop AO, shadows and pixel ratio.
      this.lowFpsStreak = fps < 30 ? this.lowFpsStreak + 1 : 0;
      if (this.qualityMode === 'auto' && this.lowFpsStreak >= 2 && this.world.renderer!.quality === 'high') {
        this.world.renderer!.setQuality('low');
        this.sun.setShadows(false);
      }
    }
  };

  private handleDown = (ev: PointerEvent) => {
    this.down = { x: ev.clientX, y: ev.clientY };
  };

  private handlePick = (ev: PointerEvent) => {
    // Ignore drags (orbit) and gizmo interactions.
    if (!this.down || Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y) > 4 || this.edit.dragging) return;
    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.world.camera.three);
    const hit = this.raycaster.intersectObjects(this.massing.group.children, true)[0];
    this.onPick((hit?.object.userData.blockId as string | undefined) ?? null);
  };

  setOrigin(origin: { lon: number; lat: number }, basemap: BasemapKind) {
    this.ground.set(basemap, origin);
  }

  setSite(plot: Vec2[], buildable: Vec2[] | null, edgeClasses: EdgeClass[]) {
    this.plot = plot;
    this.overlay.setPlot(plot, buildable);
    this.edit.setSite(plot, edgeClasses);
    const c = plot.reduce((a, p) => [a[0] + p[0] / plot.length, a[1] + p[1] / plot.length], [0, 0]);
    this.sun.setCenter(c[0]!, -c[1]!);
  }

  setBuild(br: BuildResult, selection: string | null, highlight: string[], compliance: Evaluation | null, edgeClasses: EdgeClass[]) {
    if (this.edit.dragging) return;
    this.massing.update(br, selection, highlight);
    this.labels.update({ plot: this.plot, edgeClasses, build: br, selection, compliance });
    this.edit.attach(selection ? (br.blocks.find((b) => b.id === selection) ?? null) : null);
  }

  setGhost(br: BuildResult | null) {
    this.massing.setGhost(br);
  }

  setContext(c: ContextPrism[]) {
    this.context.update(c);
  }

  setSun(pos: SunPosition | null) {
    this.sun.setPosition(pos);
  }

  showHours(cells: HeatCell[] | null, hours?: ArrayLike<number>) {
    if (cells && hours) this.sun.showHours(cells, hours);
    else this.sun.clearHours();
  }

  setQuality(q: 'auto' | 'high' | 'low') {
    this.qualityMode = q;
    const r = q === 'low' ? 'low' : 'high';
    this.world.renderer!.setQuality(r);
    this.sun.setShadows(r === 'high');
  }

  setStyle(s: MassingStyle) {
    this.massing.setStyle(s);
  }

  setDark(dark: boolean) {
    const scene = this.world.scene.three as THREE.Scene;
    scene.background = skyTexture(dark);
    scene.fog = new THREE.Fog(dark ? '#1b2230' : '#eef1f0', 500, 1600);
    this.ground.setDark(dark);
    this.context.setDark(dark);
    this.sun.setDark(dark);
  }

  private focusBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const p of this.plot) box.expandByPoint(toThree(p[0], p[1]));
    const m = this.massing.bounds();
    if (!m.isEmpty()) box.union(m);
    if (box.isEmpty()) box.set(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 20, 20));
    box.max.y = Math.max(box.max.y, 12);
    return box;
  }

  async view(preset: ViewPreset, smooth = true) {
    const cam = this.world.camera;
    await cam.projection.set(preset === 'top' ? 'Orthographic' : 'Perspective');
    const box = this.focusBox();
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const d = Math.max(90, size * 1.9);
    const dirs: Record<ViewPreset, [number, number, number]> = {
      iso: [0.55, 1.05, 0.8],
      top: [0, 1, 0.0001],
      south: [0, 0.6, 1],
      north: [0, 0.6, -1],
      east: [1, 0.6, 0],
      west: [-1, 0.6, 0],
    };
    const [x, y, z] = dirs[preset];
    const n = new THREE.Vector3(x, y, z).normalize().multiplyScalar(d);
    await cam.controls.setLookAt(c.x + n.x, c.y + n.y, c.z + n.z, c.x, c.y * 0.6, c.z, smooth);
    if (preset === 'top') await cam.controls.fitToBox(box, smooth, { paddingTop: 4, paddingBottom: 4, paddingLeft: 4, paddingRight: 4 });
  }

  frameSelection(id: string | null) {
    const obj = id ? this.massing.blockObject(id) : null;
    const box = obj ? new THREE.Box3().setFromObject(obj) : this.focusBox();
    void this.world.camera.controls.fitToBox(box, true, { paddingTop: 6, paddingBottom: 6, paddingLeft: 6, paddingRight: 6 });
  }

  screenshot(): string {
    this.world.renderer!.needsUpdate = true;
    this.world.renderer!.update();
    return this.world.renderer!.three.domElement.toDataURL('image/png');
  }

  dispose() {
    this.container.removeEventListener('pointerdown', this.handleDown);
    this.container.removeEventListener('pointerup', this.handlePick);
    this.edit.dispose();
    this.components.dispose();
  }
}

/** OrthoPerspectiveCamera with a wider far plane for map context. */
class OrthoPerspectiveCamera2 extends OBC.OrthoPerspectiveCamera {}
