import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { centroid, dist, normalizeRing } from '@fs/geometry';
import type { BuildResult, EdgeClass, Vec2 } from '@fs/recipe';
import type { Evaluation } from '@fs/rules';

const fmt = (v: number) => v.toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function label(text: string, cls: string) {
  const el = document.createElement('div');
  el.className = `vp-label ${cls}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Closest pair of points between a ring and a segment. */
function closestPair(ring: Vec2[], a: Vec2, b: Vec2): [Vec2, Vec2] {
  let best: [Vec2, Vec2] = [ring[0]!, a];
  let bd = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = closestOnSegment(p, a, b);
    const d = dist(p, q);
    if (d < bd) [bd, best] = [d, [p, q]];
    const r0 = ring[i]!;
    const r1 = ring[(i + 1) % ring.length]!;
    for (const e of [a, b]) {
      const q2 = closestOnSegment(e, r0, r1);
      const d2 = dist(e, q2);
      if (d2 < bd) [bd, best] = [d2, [q2, e]];
    }
  }
  return best;
}

const EDGE_LETTER: Record<EdgeClass, string> = { front: 'AV', side: 'LAT', rear: 'AR' };

/** Dimension labels: plot edge lengths, block names and heights, setbacks of the selected block. */
export class LabelsLayer {
  readonly group = new THREE.Group();
  private readonly lineMat = new THREE.LineBasicMaterial({ color: '#0f172a' });
  private readonly badMat = new THREE.LineBasicMaterial({ color: '#dc2626' });
  visible = true;

  constructor(scene: THREE.Scene) {
    this.group.name = 'labels';
    scene.add(this.group);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.group.visible = v;
    this.group.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.style.display = v ? '' : 'none';
    });
  }

  private clear() {
    for (const c of [...this.group.children]) {
      c.traverse((o) => {
        if (o instanceof CSS2DObject) o.element.remove();
      });
      this.group.remove(c);
    }
  }

  update(a: { plot: Vec2[]; edgeClasses: EdgeClass[]; build: BuildResult | null; selection: string | null; compliance: Evaluation | null }) {
    this.clear();
    const plot = normalizeRing(a.plot);
    plot.forEach((p, i) => {
      const q = plot[(i + 1) % plot.length]!;
      const l = label(`${fmt(dist(p, q))} m · ${EDGE_LETTER[a.edgeClasses[i] ?? 'side']}`, 'vp-edge');
      l.position.set((p[0] + q[0]) / 2, 0.3, -(p[1] + q[1]) / 2);
      this.group.add(l);
    });
    if (!a.build) return this.setVisible(this.visible);
    const failing = new Set(a.compliance?.results.filter((r) => r.status === 'fail').flatMap((r) => r.elementIds) ?? []);
    for (const b of a.build.blocks) {
      const c = centroid(b.footprint);
      const top = b.heightM;
      const l = label(`${b.name} · ${b.floors <= 1 ? 'RDC' : `R+${b.floors - 1}`} · ${fmt(top)} m`, `vp-block${failing.has(b.id) ? ' vp-bad' : ''}${b.id === a.selection ? ' vp-sel' : ''}`);
      l.position.set(c[0], top + 1.5, -c[1]);
      this.group.add(l);
      if (b.id !== a.selection) continue;
      // Footprint edge lengths at the base of the selected block.
      const fp = normalizeRing(b.footprint);
      fp.forEach((p, i) => {
        const q = fp[(i + 1) % fp.length]!;
        const d = dist(p, q);
        if (d < 2) return;
        const e = label(`${fmt(d)} m`, 'vp-dim');
        // Offset outwards so the label does not cover the resize handle at the edge midpoint.
        const nx = (q[1] - p[1]) / d;
        const ny = -(q[0] - p[0]) / d;
        e.position.set((p[0] + q[0]) / 2 + nx * 3, 0.6, -((p[1] + q[1]) / 2 + ny * 3));
        this.group.add(e);
      });
      // Setback to each plot edge class (closest edge of that class).
      const setbackResults = a.compliance?.results.filter((r) => r.type === 'setback') ?? [];
      for (const cls of ['front', 'side', 'rear'] as EdgeClass[]) {
        let best: { p: Vec2; q: Vec2; d: number } | null = null;
        plot.forEach((pa, i) => {
          if (a.edgeClasses[i] !== cls) return;
          const [p, q] = closestPair(fp, pa, plot[(i + 1) % plot.length]!);
          const d = dist(p, q);
          if (!best || d < best.d) best = { p, q, d };
        });
        if (!best) continue;
        const { p, q, d } = best as { p: Vec2; q: Vec2; d: number };
        const bad = setbackResults.some((r) => r.status === 'fail' && r.elementIds.includes(b.id) && r.message_en.toLowerCase().startsWith(cls));
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p[0], 0.15, -p[1]), new THREE.Vector3(q[0], 0.15, -q[1])]);
        const line = new THREE.Line(g, bad ? this.badMat : this.lineMat);
        line.raycast = () => undefined;
        this.group.add(line);
        const t = label(`${EDGE_LETTER[cls]} ${fmt(d)} m`, `vp-setback${bad ? ' vp-bad' : ''}`);
        t.position.set((p[0] + q[0]) / 2, 0.4, -(p[1] + q[1]) / 2);
        this.group.add(t);
      }
    }
    this.setVisible(this.visible);
  }
}
