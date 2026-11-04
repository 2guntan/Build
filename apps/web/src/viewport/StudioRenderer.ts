import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * That Open renderer with a post-processing chain (ambient occlusion + SMAA + tone mapping)
 * and a CSS2D overlay for dimension labels. Quality drops automatically on slow devices.
 */
export class StudioRenderer extends OBC.SimpleRenderer {
  composer: EffectComposer | null = null;
  labels: CSS2DRenderer;
  quality: 'high' | 'low' = 'high';
  private renderPass: RenderPass | null = null;
  private ao: GTAOPass | null = null;
  private lastSize = new THREE.Vector2();

  constructor(components: OBC.Components, container: HTMLElement) {
    super(components, container, { antialias: false, alpha: false, preserveDrawingBuffer: true } as never);
    const r = this.three;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.labels = new CSS2DRenderer();
    const el = this.labels.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';
    container.appendChild(el);
  }

  setQuality(q: 'high' | 'low') {
    this.quality = q;
    this.three.shadowMap.enabled = q === 'high';
    this.three.setPixelRatio(q === 'high' ? Math.min(2, window.devicePixelRatio) : 1);
    if (this.ao) this.ao.enabled = q === 'high';
    this.needsUpdate = true;
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.Camera) {
    const size = this.three.getSize(new THREE.Vector2());
    if (!this.composer) {
      this.composer = new EffectComposer(this.three);
      this.renderPass = new RenderPass(scene, camera);
      this.composer.addPass(this.renderPass);
      this.ao = new GTAOPass(scene, camera, size.x, size.y);
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.4, thickness: 2, scale: 1 });
      this.composer.addPass(this.ao);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new SMAAPass());
    }
    if (!size.equals(this.lastSize)) {
      this.lastSize.copy(size);
      this.composer.setPixelRatio(this.three.getPixelRatio());
      this.composer.setSize(size.x, size.y);
      this.labels.setSize(size.x, size.y);
    }
    this.renderPass!.camera = camera;
    if (this.ao) this.ao.camera = camera;
  }

  override update() {
    if (!this.enabled || !this.currentWorld) return;
    if (this.mode === OBC.RendererMode.MANUAL && !this.needsUpdate) return;
    this.needsUpdate = false;
    this.onBeforeUpdate.trigger(this);
    const scene = this.currentWorld.scene.three as THREE.Scene;
    const camera = this.currentWorld.camera.three;
    try {
      this.ensureComposer(scene, camera);
      this.composer!.render();
    } catch {
      this.three.render(scene, camera);
    }
    this.labels.render(scene, camera);
    this.onAfterUpdate.trigger(this);
  }

  override dispose() {
    this.labels.domElement.remove();
    this.composer?.dispose();
    super.dispose();
  }
}
