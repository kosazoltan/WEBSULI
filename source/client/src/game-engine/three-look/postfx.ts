import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { LOOK_BUDGET, type LookTier } from "./tier";

export type PostFx = {
  readonly bloom: boolean;
  render(): void;
  setSize(width: number, height: number): void;
  dispose(): void;
};

export type BloomOptions = {
  strength?: number;
  radius?: number;
  /** Luminance above which pixels glow; keep high so only neon/emissive parts bloom. */
  threshold?: number;
};

/**
 * Bloom on the high tier, a plain render everywhere else.
 *
 * With a composer the tone mapping and sRGB conversion happen in `OutputPass`
 * (it reads `renderer.toneMapping`), so the renderer settings from
 * `applyRendererLook` stay the single source of truth on both paths.
 */
export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  tier: LookTier,
  opts: BloomOptions = {},
): PostFx {
  if (!LOOK_BUDGET[tier].bloom) {
    return {
      bloom: false,
      render: () => renderer.render(scene, camera),
      setSize: () => {},
      dispose: () => {},
    };
  }

  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(Math.max(1, size.x), Math.max(1, size.y));
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, size.x), Math.max(1, size.y)),
    opts.strength ?? 0.8,
    opts.radius ?? 0.45,
    opts.threshold ?? 0.72,
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  return {
    bloom: true,
    render: () => composer.render(),
    setSize: (w, h) => {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(Math.max(1, w), Math.max(1, h));
    },
    dispose: () => {
      bloomPass.dispose();
      composer.dispose();
    },
  };
}
