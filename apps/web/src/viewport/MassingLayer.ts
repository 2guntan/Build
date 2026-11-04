import * as THREE from 'three';
import type { BuildResult } from '@fs/recipe';
import { SELECT_COLOR, USE_COLORS } from './colors';
import { facadeTextures, storeyGeometry } from './facade-texture';

export type MassingStyle = 'realistic' | 'uses';

const white = new THREE.Color('#ffffff');

/** Massing: one textured prism per storey, coloured by use, with selection and failure states. */
export class MassingLayer {
  readonly group = new THREE.Group();
  readonly ghost = new THREE.Group();
  style: MassingStyle = 'realistic';
  private readonly mats = new Map<string, THREE.Material>();
  private readonly edgeMat = new THREE.LineBasicMaterial({ color: '#1f2937', transparent: true, opacity: 0.28 });
  private readonly selEdgeMat = new THREE.LineBasicMaterial({ color: SELECT_COLOR });
  private readonly ghostMat = new THREE.MeshBasicMaterial({ color: '#14b8a6', transparent: true, opacity: 0.22, depthWrite: false });
  private readonly ghostEdge = new THREE.LineBasicMaterial({ color: '#0d9488' });

  constructor(scene: THREE.Scene) {
    this.group.name = 'massing';
    this.ghost.name = 'ghost';
    scene.add(this.group, this.ghost);
  }

  private wallMat(use: string, ground: boolean, state: 'normal' | 'selected' | 'fail') {
    const k = `w:${this.style}:${use}:${ground}:${state}`;
    let m = this.mats.get(k);
    if (!m) {
      const base = new THREE.Color(USE_COLORS[use] ?? USE_COLORS.unassigned);
      const tex = facadeTextures();
      const color = this.style === 'realistic' ? base.clone().lerp(white, 0.72) : base;
      const mat = new THREE.MeshStandardMaterial({
        color: state === 'fail' ? new THREE.Color('#f87171') : color,
        map: this.style === 'realistic' ? (ground ? tex.ground : tex.light) : null,
        roughness: 0.75,
        metalness: 0.05,
      });
      if (state === 'selected') {
        mat.emissive = new THREE.Color(SELECT_COLOR);
        mat.emissiveIntensity = 0.18;
      }
      m = mat;
      this.mats.set(k, m);
    }
    return m;
  }

  private capMat(use: string, state: string) {
    const k = `c:${this.style}:${use}:${state}`;
    let m = this.mats.get(k);
    if (!m) {
      const base = new THREE.Color(USE_COLORS[use] ?? USE_COLORS.unassigned);
      m = new THREE.MeshStandardMaterial({
        color: state === 'fail' ? new THREE.Color('#ef4444') : this.style === 'realistic' ? new THREE.Color('#d4d7d6') : base.clone().multiplyScalar(0.9),
        roughness: 0.9,
      });
      this.mats.set(k, m);
    }
    return m;
  }

  setStyle(s: MassingStyle) {
    this.style = s;
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
      });
    }
  }

  update(br: BuildResult, selection: string | null, highlight: string[]) {
    this.clear(this.group);
    for (const b of br.blocks) {
      const g = new THREE.Group();
      g.userData.blockId = b.id;
      const state = highlight.includes(b.id) ? 'fail' : b.id === selection ? 'selected' : 'normal';
      for (const s of b.storeys) {
        const ring = s.footprint ?? b.footprint;
        const geom = storeyGeometry(ring, s.elevationM, s.elevationM + s.heightM);
        const ground = s.index === 0 && s.use !== 'residential';
        const mesh = new THREE.Mesh(geom, [this.capMat(s.use, state), this.wallMat(s.use, ground, state as 'normal')]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.blockId = b.id;
        mesh.userData.storey = s.index;
        g.add(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), state === 'selected' ? this.selEdgeMat : this.edgeMat);
        edges.userData.blockId = b.id;
        edges.raycast = () => undefined;
        g.add(edges);
      }
      this.group.add(g);
    }
  }

  /** Translucent preview of a candidate design (agent proposals, before accepting). */
  setGhost(br: BuildResult | null) {
    this.clear(this.ghost);
    if (!br) return;
    for (const b of br.blocks) {
      for (const s of b.storeys) {
        const geom = storeyGeometry(s.footprint ?? b.footprint, s.elevationM, s.elevationM + s.heightM);
        const mesh = new THREE.Mesh(geom, this.ghostMat);
        mesh.raycast = () => undefined;
        this.ghost.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), this.ghostEdge));
      }
    }
  }

  blockObject(id: string): THREE.Object3D | undefined {
    return this.group.children.find((c) => c.userData.blockId === id);
  }

  bounds(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.group);
  }
}
