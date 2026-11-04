import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { centroid, normalizeRing } from '@fs/geometry';
import type { BlockResult, EdgeClass, Vec2 } from '@fs/recipe';
import type { MassingLayer } from './MassingLayer';

export type EditEvent =
  | { type: 'move'; blockId: string; dx: number; dy: number }
  | { type: 'rotate'; blockId: string; deg: number; about: Vec2 }
  | { type: 'resize'; blockId: string; axis: Vec2; fixed: number; from: number; to: number }
  | { type: 'floors'; blockId: string; floors: number };

export type EditMode = 'select' | 'move' | 'rotate';

/** Principal axes of a footprint: direction of its longest edge and the perpendicular. */
function axes(ring: Vec2[]): [Vec2, Vec2] {
  let best: Vec2 = [1, 0];
  let bl = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bl) [bl, best] = [l, [(b[0] - a[0]) / l, (b[1] - a[1]) / l]];
  }
  return [best, [-best[1], best[0]]];
}

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

interface Handle {
  mesh: THREE.Mesh;
  kind: 'side' | 'height';
  axis?: Vec2;
  fixed?: number;
  from?: number;
}

/**
 * Direct manipulation of the selected block. Nothing here edits geometry: every gesture
 * ends in an EditEvent that the design store turns into a recipe change.
 */
export class EditControls {
  readonly gizmo: TransformControls;
  readonly handles = new THREE.Group();
  mode: EditMode = 'select';
  dragging = false;
  onEdit: (e: EditEvent) => void = () => undefined;
  private block: BlockResult | null = null;
  private target: THREE.Object3D | null = null;
  private list: Handle[] = [];
  private active: Handle | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly preview: THREE.Line;
  private readonly heightLabel = document.createElement('div');
  private startY = 0;
  private storeyH = 3.1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: OBC.OrthoPerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly massing: MassingLayer,
  ) {
    this.gizmo = new TransformControls(camera.three, dom);
    this.gizmo.setTranslationSnap(0.5);
    this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(5));
    this.gizmo.setSize(0.8);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.dragging = !!e.value;
      camera.controls.enabled = !e.value;
      if (!e.value) this.commitGizmo();
    });
    scene.add(this.gizmo.getHelper());
    this.handles.name = 'edit-handles';
    scene.add(this.handles);
    this.preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#f59e0b', dashSize: 0.6, gapSize: 0.4 }));
    this.preview.visible = false;
    scene.add(this.preview);
    this.heightLabel.className = 'vp-label vp-drag';
    this.heightLabel.style.cssText = 'position:absolute;display:none;pointer-events:none';
    dom.appendChild(this.heightLabel);
    dom.addEventListener('pointerdown', this.onDown, true);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  setSite(_plot: Vec2[], _edges: EdgeClass[]) {
    /* reserved for snapping to plot edges */
  }

  setMode(m: EditMode) {
    this.mode = m;
    this.refreshGizmo();
  }

  attach(block: BlockResult | null) {
    this.block = block;
    this.target = block ? (this.massing.blockObject(block.id) ?? null) : null;
    this.refreshGizmo();
    this.buildHandles();
  }

  private refreshGizmo() {
    this.gizmo.detach();
    for (const o of [...this.scene.children]) if (o.userData.pivotFor) this.scene.remove(o);
    if (!this.target || this.mode === 'select') return;
    this.gizmo.setMode(this.mode === 'move' ? 'translate' : 'rotate');
    this.gizmo.showX = this.mode === 'move';
    this.gizmo.showZ = this.mode === 'move';
    this.gizmo.showY = this.mode === 'rotate';
    if (this.mode === 'rotate' && this.block) {
      // Rotate around the block centroid: move the pivot by wrapping in a temporary parent.
      const c = centroid(this.block.footprint);
      const pivot = new THREE.Group();
      pivot.position.set(c[0], 0, -c[1]);
      pivot.userData.pivotFor = this.block.id;
      this.scene.add(pivot);
      this.target.position.set(-c[0], 0, c[1]);
      pivot.add(this.target);
      this.target = pivot;
    }
    this.gizmo.attach(this.target);
  }

  private commitGizmo() {
    const b = this.block;
    const t = this.target;
    if (!b || !t) return;
    if (this.gizmo.mode === 'translate') {
      const dx = t.position.x;
      const dy = -t.position.z;
      t.position.set(0, 0, 0);
      if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) this.onEdit({ type: 'move', blockId: b.id, dx, dy });
    } else {
      const deg = THREE.MathUtils.radToDeg(t.rotation.y);
      const c = centroid(b.footprint);
      t.rotation.set(0, 0, 0);
      if (Math.abs(deg) > 1e-3) this.onEdit({ type: 'rotate', blockId: b.id, deg, about: c });
    }
  }

  private buildHandles() {
    for (const h of this.list) h.mesh.geometry.dispose();
    this.handles.clear();
    this.list = [];
    const b = this.block;
    if (!b || this.mode !== 'select') return;
    const ring = normalizeRing(b.footprint);
    const [a1, a2] = axes(ring);
    const mat = new THREE.MeshBasicMaterial({ color: '#f59e0b', depthTest: false });
    const c = centroid(ring);
    for (const axis of [a1, a2]) {
      const proj = ring.map((p) => dot(p, axis));
      const lo = Math.min(...proj);
      const hi = Math.max(...proj);
      const perp: Vec2 = [-axis[1], axis[0]];
      const mid = dot(c, perp);
      for (const [side, from, fixed] of [
        [hi, hi, lo],
        [lo, lo, hi],
      ] as const) {
        const x = axis[0] * side + perp[0] * mid;
        const y = axis[1] * side + perp[1] * mid;
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat);
        mesh.position.set(x, 0.6, -y);
        mesh.renderOrder = 10;
        this.screenSized(mesh);
        this.handles.add(mesh);
        this.list.push({ mesh, kind: 'side', axis, fixed, from });
      }
    }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 16), new THREE.MeshBasicMaterial({ color: '#0ea5e9', depthTest: false }));
    top.position.set(c[0], b.heightM + 1.2, -c[1]);
    top.renderOrder = 10;
    this.screenSized(top);
    this.handles.add(top);
    this.list.push({ mesh: top, kind: 'height' });
    const typical = b.storeys[1]?.heightM ?? b.storeys[0]?.heightM ?? 3.1;
    this.storeyH = typical;
  }

  /** Keeps a handle about the same size on screen whatever the zoom. */
  private screenSized(m: THREE.Mesh) {
    const tmp = new THREE.Vector3();
    m.onBeforeRender = (_r, _s, cam) => {
      const d = cam.getWorldPosition(tmp).distanceTo(m.getWorldPosition(new THREE.Vector3()));
      const k = (cam as THREE.OrthographicCamera).isOrthographicCamera ? 1 / ((cam as THREE.OrthographicCamera).zoom || 1) * 40 : d;
      m.scale.setScalar(Math.max(0.6, k * 0.022));
    };
  }

  private ndc(ev: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  private onDown = (ev: PointerEvent) => {
    if (!this.list.length || ev.button !== 0) return;
    this.ray.setFromCamera(this.ndc(ev), this.camera.three);
    const hit = this.ray.intersectObjects(this.list.map((h) => h.mesh))[0];
    if (!hit) return;
    this.active = this.list.find((h) => h.mesh === hit.object) ?? null;
    if (!this.active) return;
    ev.stopPropagation();
    this.dragging = true;
    this.camera.controls.enabled = false;
    this.startY = ev.clientY;
  };

  private onMove = (ev: PointerEvent) => {
    const h = this.active;
    const b = this.block;
    if (!h || !b) return;
    if (h.kind === 'height') {
      const floors = this.floorsFor(ev);
      this.heightLabel.style.display = '';
      const r = this.dom.getBoundingClientRect();
      this.heightLabel.style.left = `${ev.clientX - r.left + 12}px`;
      this.heightLabel.style.top = `${ev.clientY - r.top - 12}px`;
      this.heightLabel.textContent = floors <= 1 ? 'RDC' : `R+${floors - 1}`;
      return;
    }
    const to = this.sidePos(ev, h);
    if (to === null) return;
    // Preview: a line at the new side position, parallel to the side.
    const perp: Vec2 = [-h.axis![1], h.axis![0]];
    const ring = normalizeRing(b.footprint);
    const ps = ring.map((p) => dot(p, perp));
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const p1: Vec2 = [h.axis![0] * to + perp[0] * lo, h.axis![1] * to + perp[1] * lo];
    const p2: Vec2 = [h.axis![0] * to + perp[0] * hi, h.axis![1] * to + perp[1] * hi];
    this.preview.geometry.dispose();
    this.preview.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1[0], 0.2, -p1[1]), new THREE.Vector3(p2[0], 0.2, -p2[1])]);
    this.preview.computeLineDistances();
    this.preview.visible = true;
    h.mesh.position.set(h.axis![0] * to + perp[0] * ((lo + hi) / 2), 0.6, -(h.axis![1] * to + perp[1] * ((lo + hi) / 2)));
  };

  private floorsFor(ev: PointerEvent) {
    const b = this.block!;
    const dyPx = this.startY - ev.clientY;
    return Math.max(1, Math.min(60, b.floors + Math.round(dyPx / 14)));
  }

  private sidePos(ev: PointerEvent, h: Handle): number | null {
    this.ray.setFromCamera(this.ndc(ev), this.camera.three);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, p)) return null;
    const s = dot([p.x, -p.z], h.axis!);
    // Snap to 0.5 m, keep at least 4 m of width.
    const snapped = Math.round(s * 2) / 2;
    const minW = 4;
    return h.from! > h.fixed! ? Math.max(h.fixed! + minW, snapped) : Math.min(h.fixed! - minW, snapped);
  }

  private onUp = (ev: PointerEvent) => {
    const h = this.active;
    const b = this.block;
    if (!h || !b) return;
    this.active = null;
    this.dragging = false;
    this.camera.controls.enabled = true;
    this.preview.visible = false;
    this.heightLabel.style.display = 'none';
    if (h.kind === 'height') {
      const floors = this.floorsFor(ev);
      if (floors !== b.floors) this.onEdit({ type: 'floors', blockId: b.id, floors });
      return;
    }
    const to = this.sidePos(ev, h);
    if (to !== null && Math.abs(to - h.from!) > 0.01) this.onEdit({ type: 'resize', blockId: b.id, axis: h.axis!, fixed: h.fixed!, from: h.from!, to });
    else this.buildHandles();
  };

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onDown, true);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.heightLabel.remove();
    this.gizmo.dispose();
  }
}
