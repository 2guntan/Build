import * as THREE from 'three';
import { LocalFrame } from '@fs/geometry';

export type BasemapKind = 'satellite' | 'streets' | 'none';

/** XYZ tile templates. Override in production with a licensed provider (MapTiler, Stadia, IGN-SN…). */
export const TILE_TEMPLATES: Record<Exclude<BasemapKind, 'none'>, string> = {
  satellite:
    import.meta.env.VITE_SATELLITE_TILES ?? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  streets: import.meta.env.VITE_STREET_TILES ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};
export const TILE_ATTRIBUTION: Record<Exclude<BasemapKind, 'none'>, string> = {
  satellite: 'Imagery © Esri, Maxar, Earthstar Geographics',
  streets: '© OpenStreetMap contributors',
};

const lon2tile = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2tile = (lat: number, z: number) =>
  ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/**
 * Ground made of map tiles placed in the local site frame, with a neutral ground plane and grid
 * underneath so the scene still reads well when tiles cannot be fetched.
 */
export class TileGround {
  readonly group = new THREE.Group();
  private readonly tiles = new THREE.Group();
  private readonly loader = new THREE.TextureLoader();
  private kind: BasemapKind = 'none';
  private key = '';
  onStatus: (s: { loaded: number; failed: number; total: number }) => void = () => undefined;
  onChange: () => void = () => undefined;

  constructor(scene: THREE.Scene) {
    this.group.name = 'ground';
    const base = new THREE.Mesh(
      new THREE.CircleGeometry(1500, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#d5d7d0', roughness: 1 }),
    );
    base.receiveShadow = true;
    base.position.y = -0.05;
    base.name = 'ground-base';
    const grid = new THREE.GridHelper(1000, 100, '#bfc3bb', '#c8ccc4');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    grid.position.y = -0.04;
    grid.name = 'grid';
    this.loader.setCrossOrigin('anonymous');
    this.group.add(base, grid, this.tiles);
    scene.add(this.group);
  }

  setGridVisible(v: boolean) {
    const g = this.group.getObjectByName('grid');
    if (g) g.visible = v;
  }

  setDark(dark: boolean) {
    const base = this.group.getObjectByName('ground-base') as THREE.Mesh;
    (base.material as THREE.MeshStandardMaterial).color.set(dark ? '#1f2428' : '#d5d7d0');
  }

  /** Loads tiles covering `radiusM` around the origin at a zoom giving ~0.6 m/px near the site. */
  set(kind: BasemapKind, origin: { lon: number; lat: number }, radiusM = 260) {
    const key = `${kind}:${origin.lon.toFixed(6)}:${origin.lat.toFixed(6)}`;
    if (key === this.key) return;
    this.key = key;
    this.kind = kind;
    for (const c of [...this.tiles.children]) {
      this.tiles.remove(c);
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      ((m.material as THREE.MeshBasicMaterial).map as THREE.Texture | null)?.dispose();
    }
    if (kind === 'none') return this.onChange();
    const frame = new LocalFrame(origin);
    const z = 18;
    const dLat = radiusM / 110574;
    const dLon = radiusM / (111320 * Math.cos((origin.lat * Math.PI) / 180));
    const x0 = Math.floor(lon2tile(origin.lon - dLon, z));
    const x1 = Math.floor(lon2tile(origin.lon + dLon, z));
    const y0 = Math.floor(lat2tile(origin.lat + dLat, z));
    const y1 = Math.floor(lat2tile(origin.lat - dLat, z));
    const total = (x1 - x0 + 1) * (y1 - y0 + 1);
    let loaded = 0;
    let failed = 0;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const url = TILE_TEMPLATES[kind].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
        const corners = [
          frame.toLocal(tile2lon(x, z), tile2lat(y + 1, z)),
          frame.toLocal(tile2lon(x + 1, z), tile2lat(y + 1, z)),
          frame.toLocal(tile2lon(x + 1, z), tile2lat(y, z)),
          frame.toLocal(tile2lon(x, z), tile2lat(y, z)),
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((c) => [c[0], 0, -c[1]]), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        g.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(g, mat);
        mesh.receiveShadow = true;
        this.tiles.add(mesh);
        this.loader.load(
          url,
          (tex) => {
            if (this.kind !== kind) return tex.dispose();
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            mat.map = tex;
            mat.opacity = 1;
            mat.transparent = false;
            mat.needsUpdate = true;
            loaded++;
            this.onStatus({ loaded, failed, total });
            this.onChange();
          },
          undefined,
          () => {
            failed++;
            this.onStatus({ loaded, failed, total });
          },
        );
      }
    }
  }
}
