import { bbox, centroid, dist, normalizeRing, type Ring, type Vec2 } from '@fs/geometry';
import type { Anchor, EdgeClass, SiteInput } from '@fs/recipe';

/**
 * Site frame aligned with the front edge: u runs along the front edge, v points
 * into the plot. "Left" is the low-u end, i.e. the left of a person standing in
 * the street and facing the plot... seen on plan with the street at the bottom.
 */
export interface SiteFrame {
  origin: Vec2;
  u: Vec2;
  v: Vec2;
}

export function frontEdgeIndex(plot: Ring, edgeClasses: EdgeClass[]): number {
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < plot.length; i++) {
    if (edgeClasses[i] !== 'front') continue;
    const l = dist(plot[i]!, plot[(i + 1) % plot.length]!);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  if (best >= 0) return best;
  // No front edge tagged: use the longest edge.
  for (let i = 0; i < plot.length; i++) {
    const l = dist(plot[i]!, plot[(i + 1) % plot.length]!);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  return Math.max(0, best);
}

export function siteFrame(site: Pick<SiteInput, 'plot' | 'edgeClasses'>): SiteFrame {
  const plot = normalizeRing(site.plot);
  const i = frontEdgeIndex(plot, site.edgeClasses);
  const a = plot[i]!;
  const b = plot[(i + 1) % plot.length]!;
  const l = dist(a, b) || 1;
  const u: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  // CCW ring: interior lies to the left of each directed edge.
  const v: Vec2 = [-u[1], u[0]];
  return { origin: a, u, v };
}

export function toFrame(f: SiteFrame, p: Vec2): Vec2 {
  const x = p[0] - f.origin[0];
  const y = p[1] - f.origin[1];
  return [x * f.u[0] + y * f.u[1], x * f.v[0] + y * f.v[1]];
}

export function fromFrame(f: SiteFrame, q: Vec2): Vec2 {
  return [f.origin[0] + q[0] * f.u[0] + q[1] * f.v[0], f.origin[1] + q[0] * f.u[1] + q[1] * f.v[1]];
}

/** Anchor point in frame coordinates and the corner the rectangle grows from. */
export function anchorPoint(
  f: SiteFrame,
  buildable: Ring,
  anchor: Anchor,
  width: number,
  depth: number,
): { start: Vec2; pivot: Vec2 } {
  const local = buildable.map((p) => toFrame(f, p));
  const b = bbox(local);
  switch (anchor) {
    case 'buildable.front-left':
      return { start: [b.minX, b.minY], pivot: [b.minX, b.minY] };
    case 'buildable.front-right':
      return { start: [b.maxX - width, b.minY], pivot: [b.maxX, b.minY] };
    case 'buildable.rear-left':
      return { start: [b.minX, b.maxY - depth], pivot: [b.minX, b.maxY] };
    case 'buildable.rear-right':
      return { start: [b.maxX - width, b.maxY - depth], pivot: [b.maxX, b.maxY] };
    case 'buildable.centroid': {
      const c = toFrame(f, centroid(buildable));
      return { start: [c[0] - width / 2, c[1] - depth / 2], pivot: c };
    }
  }
}
