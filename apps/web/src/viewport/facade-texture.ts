import * as THREE from 'three';

/** Bay width used for window repetition, metres. */
export const BAY_M = 3;

let cache: { light: THREE.CanvasTexture; ground: THREE.CanvasTexture } | null = null;

function draw(kind: 'typical' | 'ground'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  // Wall: white so the material colour tints it.
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  // Slab edge line
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 124, 128, 4);
  // Glazing
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#6f8796');
  grad.addColorStop(1, '#3d5160');
  g.fillStyle = grad;
  if (kind === 'ground') {
    g.fillRect(8, 16, 112, 104); // shopfront
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(8, 16, 112, 10);
  } else {
    g.fillRect(22, 26, 84, 74);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(22, 26, 84, 8);
    g.fillStyle = '#9aa3a8';
    g.fillRect(16, 100, 96, 5); // sill / balcony edge
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function facadeTextures() {
  cache ??= { light: draw('typical'), ground: draw('ground') };
  return cache;
}

/**
 * Builds a storey prism with UVs: walls repeat one window per bay and one per storey,
 * caps carry no texture (index range returned so caps can use a plain material).
 */
export function storeyGeometry(ring: readonly (readonly [number, number])[], z0: number, z1: number): THREE.BufferGeometry {
  const n = ring.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p[0], p[1])));
  const tris = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
  // caps (group 0)
  for (const [zz, flip] of [
    [z1, false],
    [z0, true],
  ] as const) {
    const s = pos.length / 3;
    for (const p of ring) {
      pos.push(p[0], zz, -p[1]);
      uv.push(0, 0);
    }
    for (const t of tris) idx.push(...(flip ? [s + t[0]!, s + t[2]!, s + t[1]!] : [s + t[0]!, s + t[1]!, s + t[2]!]));
  }
  const capCount = idx.length;
  // walls (group 1)
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bays = Math.max(1, Math.round(len / BAY_M));
    const s = pos.length / 3;
    pos.push(a[0], z0, -a[1], b[0], z0, -b[1], b[0], z1, -b[1], a[0], z1, -a[1]);
    uv.push(0, 0, bays, 0, bays, 1, 0, 1);
    idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, capCount, 0);
  g.addGroup(capCount, idx.length - capCount, 1);
  g.computeVertexNormals();
  return g;
}
