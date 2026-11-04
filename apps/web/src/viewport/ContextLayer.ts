import * as THREE from 'three';
import { normalizeRing } from '@fs/geometry';
import type { ContextPrism } from '@fs/sun';
import { CONTEXT_COLOR } from './colors';

/** Neighbouring buildings as extruded grey blocks. */
export class ContextLayer {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ color: CONTEXT_COLOR, roughness: 0.95 });

  constructor(scene: THREE.Scene) {
    this.group.name = 'context';
    scene.add(this.group);
  }

  update(buildings: ContextPrism[]) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    for (const b of buildings) {
      const ring = normalizeRing(b.ring);
      if (ring.length < 3) continue;
      const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p[0], p[1])));
      const geom = new THREE.ExtrudeGeometry(shape, { depth: b.heightM, bevelEnabled: false });
      // Shape is in the XY plane, extruded along +Z: rotate so Z (height) becomes Three's Y.
      geom.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geom, this.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.contextId = b.id;
      this.group.add(mesh);
    }
  }
}
