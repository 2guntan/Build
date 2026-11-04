import type { Vec2 } from '@fs/geometry';

/** Layout templates in the site frame (u along the front, v inwards), metres. */
export const TEMPLATES = ['bar', 'double_bar', 'l_shape', 'u_shape', 'courtyard', 'towers', 'podium_tower'] as const;
export type Template = (typeof TEMPLATES)[number];

export interface TemplateParams {
  /** Usable extent of the buildable area in the frame. */
  u0: number;
  v0: number;
  lenU: number;
  lenV: number;
  /** Fraction of lenU used (0–1). */
  fillU: number;
  /** Fraction of lenV used (0–1). */
  fillV: number;
  /** Wing / bar depth, m. */
  depth: number;
  /** Gap between blocks, m (double bar, towers). */
  gap: number;
}

export type BlockShape = Vec2[];

function rect(u: number, v: number, w: number, d: number): BlockShape {
  return [
    [u, v],
    [u + w, v],
    [u + w, v + d],
    [u, v + d],
  ];
}

/** Returns one polygon per block, or null if the template does not fit. */
export function templateShapes(t: Template, p: TemplateParams): BlockShape[] | null {
  const W = p.lenU * p.fillU;
  const D = p.lenV * p.fillV;
  const d = p.depth;
  const u = p.u0 + (p.lenU - W) / 2;
  const v = p.v0;
  if (W < 6 || D < 6 || d < 6) return null;
  switch (t) {
    case 'bar':
      return d <= D ? [rect(u, v, W, d)] : null;
    case 'podium_tower':
      // Deep podium (full buildable depth up to 2.2 × wing depth); upper floors step back (see solver).
      return d * 1.4 <= D ? [rect(u, v, W, Math.min(D, d * 2.2))] : null;
    case 'double_bar':
      if (2 * d + p.gap > D) return null;
      return [rect(u, v, W, d), rect(u, v + D - d, W, d)];
    case 'l_shape':
      if (d * 2 > W || d * 2 > D) return null;
      return [
        [
          [u, v],
          [u + W, v],
          [u + W, v + d],
          [u + d, v + d],
          [u + d, v + D],
          [u, v + D],
        ],
      ];
    case 'u_shape':
      if (d * 3 > W || d * 2 > D) return null;
      return [
        [
          [u, v],
          [u + W, v],
          [u + W, v + D],
          [u + W - d, v + D],
          [u + W - d, v + d],
          [u + d, v + d],
          [u + d, v + D],
          [u, v + D],
        ],
      ];
    case 'courtyard': {
      // Two interlocking L-shapes around an open court, separated by `gap` at two corners,
      // so each block stays a simple polygon and the separation rule can be met.
      const g = p.gap;
      if (d * 2 + g + 6 > W || d * 2 + g + 6 > D) return null;
      return [
        [
          [u, v],
          [u + W - d - g, v],
          [u + W - d - g, v + d],
          [u + d, v + d],
          [u + d, v + D - d - g],
          [u, v + D - d - g],
        ],
        [
          [u + W - d, v],
          [u + W, v],
          [u + W, v + D],
          [u + d + g, v + D],
          [u + d + g, v + D - d],
          [u + W - d, v + D - d],
        ],
      ];
    }
    case 'towers': {
      const side = d;
      const nu = Math.max(1, Math.floor((W + p.gap) / (side + p.gap)));
      const nv = Math.max(1, Math.floor((D + p.gap) / (side + p.gap)));
      if (nu * nv > 6) return null;
      const out: BlockShape[] = [];
      const su = nu > 1 ? (W - side) / (nu - 1) : 0;
      const sv = nv > 1 ? (D - side) / (nv - 1) : 0;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) out.push(rect(u + i * su, v + j * sv, side, side));
      return out;
    }
  }
}
