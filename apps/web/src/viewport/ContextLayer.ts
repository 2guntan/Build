import * as THREE from 'three';
import { normalizeRing } from '@fs/geometry';
import type { ContextPrism } from '@fs/sun';

/** Neighbouring buildings: soft white volumes with light edges (clay-model look). */
export class ContextLayer {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.95 });
  private readonly roof = new THREE.MeshStandardMaterial({ color: '#dedbd5', roughness: 0.95 });
  private readonly edge = new THREE.LineBasicMaterial({ color: '#8b9099', transparent: true, opacity: 0.7 });

  constructor(scene: THREE.Scene) {
    this.group.name = 'context';
    scene.add(this.group);
  }

  setDark(dark: boolean) {
    this.mat.color.set(dark ? '#6b7280' : '#f1efea');
    this.edge.color.set(dark ? '#9ca3af' : '#8b9099');
    this.edge.opacity = dark ? 0.35 : 0.7;
    this.roof.color.set(dark ? '#7b8390' : '#dedbd5');
  }

  update(buildings: ContextPrism[]) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof THREE.Mesh || c instanceof THREE.LineSegments) c.geometry.dispose();
    }
    for (const b of buildings) {
      const ring = normalizeRing(b.ring);
      if (ring.length < 3 || b.heightM <= 0) continue;
      const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p[0], p[1])));
      const geom = new THREE.ExtrudeGeometry(shape, { depth: b.heightM, bevelEnabled: false });
      // Shape in XY extruded along +Z → rotate so local (x, y, z) becomes Three (x, z, -y).
      geom.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geom, [this.roof, this.mat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.contextId = b.id;
      this.group.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30), this.edge);
      e.raycast = () => undefined;
      this.group.add(e);
    }
  }
}
