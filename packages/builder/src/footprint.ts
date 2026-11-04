import { inset, normalizeRing, rotate, type Ring, type Vec2 } from '@fs/geometry';
import { resolveNum, type Footprint, type Recipe, type SiteInput } from '@fs/recipe';
import { anchorPoint, fromFrame, siteFrame } from './frame.js';

export function resolveFootprint(fp: Footprint, params: Recipe['params'], site: SiteInput): Ring | null {
  switch (fp.kind) {
    case 'polygon':
      return normalizeRing(fp.vertices.map((v) => [v[0], v[1]] as Vec2));
    case 'offset': {
      const d = resolveNum(fp.distance, params);
      const r = d > 0 ? inset(site.buildable, d) : normalizeRing(site.buildable);
      return r && r.length >= 3 ? r : null;
    }
    case 'rect': {
      const w = resolveNum(fp.width, params);
      const d = resolveNum(fp.depth, params);
      if (!(w > 0 && d > 0)) return null;
      const rot = (resolveNum(fp.rotation, params) * Math.PI) / 180;
      const du = resolveNum(fp.offsetU, params);
      const dv = resolveNum(fp.offsetV, params);
      const f = siteFrame(site);
      const { start, pivot } = anchorPoint(f, site.buildable, fp.anchor, w, d);
      const s: Vec2 = [start[0] + du, start[1] + dv];
      const piv: Vec2 = [pivot[0] + du, pivot[1] + dv];
      const corners: Vec2[] = [
        [s[0], s[1]],
        [s[0] + w, s[1]],
        [s[0] + w, s[1] + d],
        [s[0], s[1] + d],
      ];
      return normalizeRing(corners.map((c) => fromFrame(f, rotate(c, rot, piv))));
    }
  }
}
