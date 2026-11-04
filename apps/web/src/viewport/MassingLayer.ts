import * as THREE from 'three';
import { extrudeRing } from '@fs/geometry';
import type { BuildResult } from '@fs/recipe';
import { SELECT_COLOR, USE_COLORS } from './colors';

/** Massing coloured by use, one prism per storey, with storey lines. */
export class MassingLayer {
  readonly group = new THREE.Group();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly edgeMat = new THREE.LineBasicMaterial({ color: '#1f2937', transparent: true, opacity: 0.35 });

  constructor(scene: THREE.Scene) {
    this.group.name = 'massing';
    scene.add(this.group);
  }

  private material(use: string, selected: boolean, highlighted: boolean) {
    const k = `${use}:${selected}:${highlighted}`;
    let m = this.materials.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: highlighted ? '#dc2626' : (USE_COLORS[use] ?? USE_COLORS.unassigned),
        roughness: 0.8,
        metalness: 0,
        emissive: selected ? new THREE.Color(SELECT_COLOR) : new THREE.Color('#000'),
        emissiveIntensity: selected ? 0.35 : 0,
      });
      this.materials.set(k, m);
    }
    return m;
  }

  update(br: BuildResult, selection: string | null, highlight: string[]) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
      });
    }
    for (const b of br.blocks) {
      const g = new THREE.Group();
      g.userData.blockId = b.id;
      for (const s of b.storeys) {
        const m = extrudeRing(b.footprint, s.elevationM, s.elevationM + s.heightM);
        const geom = new THREE.BufferGeometry();
        // Local (x, y, z) → Three (x, z, -y)
        const pos = new Float32Array(m.positions.length);
        for (let i = 0; i < m.positions.length; i += 3) {
          pos[i] = m.positions[i]!;
          pos[i + 1] = m.positions[i + 2]!;
          pos[i + 2] = -m.positions[i + 1]!;
        }
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setIndex(new THREE.BufferAttribute(m.indices, 1));
        geom.computeVertexNormals();
        const mesh = new THREE.Mesh(geom, this.material(s.use, b.id === selection, highlight.includes(b.id)));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.blockId = b.id;
        g.add(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30), this.edgeMat);
        edges.userData.blockId = b.id;
        g.add(edges);
      }
      this.group.add(g);
    }
  }
}
