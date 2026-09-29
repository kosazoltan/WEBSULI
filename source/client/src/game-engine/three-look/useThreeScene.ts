import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import { useReducedMotion } from "../useReducedMotion";
import { disposeObjectTree } from "./dispose";
import { createPostFx, type BloomOptions, type PostFx } from "./postfx";
import { createGameRenderer } from "./renderer";
import { detectLookTier, type LookTier } from "./tier";

export type ThreeSceneContext = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  tier: LookTier;
  reducedMotion: boolean;
};

export type ThreeSceneController = {
  camera: THREE.Camera;
  /** Called every frame before rendering; `dt` is clamped to 50 ms. */
  update(dt: number, elapsed: number): void;
  /** CSS-pixel size of the canvas; the hook already resized renderer and composer. */
  resize?(width: number, height: number): void;
  dispose?(): void;
  bloom?: BloomOptions;
};

export type ThreeSceneSetup = (ctx: ThreeSceneContext) => ThreeSceneController;

/**
 * Mounts a decorative three.js scene on `canvasRef` and owns its whole life:
 * renderer, resize, render loop, context loss and disposal.
 *
 * Built for the four DOM-based games, whose game state lives in React: the
 * scene reads the latest props through refs inside `update`, so re-renders never
 * rebuild the scene. `supported` is null until the first attempt, false when
 * WebGL is unavailable — the caller then keeps its DOM visuals (spec E7).
 *
 * `setup` runs once per `deps` change; keep it free of per-frame props.
 */
export function useThreeScene(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  setup: ThreeSceneSetup,
  deps: readonly unknown[],
  rendererOptions: { alpha?: boolean; exposure?: number; shadows?: boolean } = {},
): { supported: boolean | null; tier: LookTier } {
  const [supported, setSupported] = useState<boolean | null>(null);
  const reducedMotion = useReducedMotion();
  const [tier] = useState<LookTier>(detectLookTier);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createGameRenderer(canvas, tier, rendererOptions);
    if (!renderer) {
      setSupported(false);
      return;
    }
    const scene = new THREE.Scene();
    let controller: ThreeSceneController;
    try {
      controller = setupRef.current({ renderer, scene, tier, reducedMotion });
    } catch {
      // A broken scene must never break the game: fall back to the DOM visuals.
      renderer.dispose();
      setSupported(false);
      return;
    }
    const postFx: PostFx = createPostFx(renderer, scene, controller.camera, tier, controller.bloom);
    setSupported(true);

    let width = 0;
    let height = 0;
    const handleResize = () => {
      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect?.width ?? canvas.clientWidth ?? 1));
      const h = Math.max(1, Math.floor(rect?.height ?? canvas.clientHeight ?? 1));
      if (w === width && h === height) return;
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      postFx.setSize(w, h);
      const cam = controller.camera;
      if (cam instanceof THREE.PerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      controller.resize?.(w, h);
    };
    handleResize();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement);

    let raf = 0;
    let last: number | null = null;
    let elapsed = 0;
    let running = true;
    const loop = (t: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const dt = last === null ? 0 : Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      elapsed += dt;
      controller.update(dt, elapsed);
      postFx.render();
    };
    raf = requestAnimationFrame(loop);

    // A lost context (GPU reset, too many tabs) must not throw inside the game;
    // the page keeps working and the layer simply stops drawing.
    const onLost = (e: Event) => {
      e.preventDefault();
      running = false;
      cancelAnimationFrame(raf);
      setSupported(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      try {
        controller.dispose?.();
      } finally {
        disposeObjectTree(scene);
        postFx.dispose();
        renderer.dispose();
      }
    };
    // `setup` is read through a ref; callers control rebuilds with `deps`.
  }, [canvasRef, tier, reducedMotion, ...deps]);

  return { supported, tier };
}
