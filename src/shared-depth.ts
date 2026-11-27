import * as THREE from 'three';
import { BokehPass, type BokehPassParameters } from 'three/addons/postprocessing/BokehPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** BokehPass patched to reuse the composer's hardware depth texture and exit early for in-focus pixels. */
export class SharedDepthBokeh extends BokehPass {
  private width = 1;
  private height = 1;
  private hardwareDepthMaterial: THREE.ShaderMaterial;
  private hardwareDepthQuad: FullScreenQuad;
  constructor(scene: THREE.Scene, camera: THREE.Camera, params: BokehPassParameters) {
    super(scene, camera, params);
    const bokehTarget = "vec2 dofblur = vec2 ( clamp( factor * aperture, -maxblur, maxblur ) );";
    if (this.materialBokeh.fragmentShader.includes(bokehTarget)) {
      this.materialBokeh.fragmentShader = this.materialBokeh.fragmentShader.replace(
        bokehTarget,
        bokehTarget + "\n\t\t\tif ( abs( dofblur.x ) < 0.00025 ) { gl_FragColor = vec4( texture2D( tColor, vUv.xy ).rgb, 1.0 ); return; }",
      );
      this.materialBokeh.needsUpdate = true;
    }
    this.hardwareDepthMaterial = new THREE.ShaderMaterial({
      defines: { ...this.materialBokeh.defines, DEPTH_PACKING: 0 },
      uniforms: this.materialBokeh.uniforms,
      vertexShader: this.materialBokeh.vertexShader,
      fragmentShader: this.materialBokeh.fragmentShader,
    });
    this.hardwareDepthQuad = new FullScreenQuad(this.hardwareDepthMaterial);
  }
  setSize(width: number, height: number) {
    super.setSize(width, height);
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
  }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget, delta: number, mask: boolean) {
    if (!read.depthTexture || Math.floor(read.width) !== this.width || Math.floor(read.height) !== this.height) {
      // Missing hardware depth (or size mismatch) falls back to the original Bokeh depth pass.
      return super.render(renderer, write, read, delta, mask);
    }
    const uniforms = this.uniforms as Record<string, { value: any }>;
    const originalDepth = uniforms.tDepth.value;
    uniforms.tDepth.value = read.depthTexture;
    uniforms.tColor.value = read.texture;
    uniforms.nearClip.value = (this.camera as THREE.PerspectiveCamera).near;
    uniforms.farClip.value = (this.camera as THREE.PerspectiveCamera).far;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    if (!this.renderToScreen) renderer.clear();
    try { this.hardwareDepthQuad.render(renderer); }
    finally { uniforms.tDepth.value = originalDepth; renderer.autoClear = autoClear; }
  }
  dispose() {
    super.dispose();
    this.hardwareDepthQuad.dispose();
    this.hardwareDepthMaterial.dispose();
  }
}
