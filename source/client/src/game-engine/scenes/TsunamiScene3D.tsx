import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  LOOK_BUDGET,
  SparkleField,
  createGlowSprite,
  createGradientSky,
  createRoomEnvironment,
  disposeObjectTree,
  glowTexture,
  useThreeScene,
  type ThreeSceneContext,
  type ThreeSceneController,
} from "@/game-engine/three-look";

/**
 * Side-view 3D seaside for Tsunami Escape (spec: docs/specs/2026-09-29-jatekok-3d-latvany.md,
 * "Szókötél / Tsunami"). Purely decorative: it DRAWS the game state the page already owns
 * (water %, player %, safe zone %, storm flash) and never feeds anything back.
 *
 * Layout contract: every gameplay element keeps the position it had in the DOM version.
 * The camera looks straight down −z; the z = 0 plane is framed so that its visible window
 * is exactly [−HALF_H, +HALF_H] vertically and ±hw horizontally (hw follows the aspect),
 * so "x % from the left / y % from the bottom" maps linearly onto that plane on any screen.
 * The eye sits EYE above the window centre (an off-axis view offset keeps the framing), which
 * puts the horizon at 60 % and lets the lower planks, the water and the valley show their tops.
 */

export type TsunamiScene3DProps = {
  /** Water surface, % of the scene height from the bottom (5–88). */
  water: number;
  /** Player centre, % from the left (8–92). */
  playerX: number;
  /** Safe-zone centre, % from the left (16–84). */
  safeZoneX: number;
  stormFlash: boolean;
  sprinting: boolean;
  phase: string;
  /** The page's low-end flag: fewer particles and decorations. */
  light: boolean;
  /** Reports WebGL availability so the page can fall back to its DOM visuals (spec E7). */
  onSupportedChange?: (supported: boolean | null) => void;
  /**
   * Per-frame values (docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md): when given, the scene reads water / player / zone
   * from this ref every frame instead of the props, so the page does not re-render 60 times a second.
   */
  live?: MutableRefObject<TsunamiLive>;
};

/** The game state the scene draws each frame (all in %, like the props). */
export type TsunamiLive = {
  water: number;
  playerX: number;
  safeZoneX: number;
  sprinting: boolean;
  /**
   * K2 (kis képernyő, köztes vízszint): a kép függőleges eltolása képpontban (pozitív = a világ lejjebb kerül), amíg egy nyitott
   * kérdés a figurát takarná — így a figura a kérdés-sáv alá kerül. Simán áll be.
   */
  shiftPx?: number;
};

/** The shelter (goal) on the top plank: % from the left. Always on screen (D4). */
export const SHELTER_X = 0.84;
/**
 * B2 (független ellenőr): a felső deszka (a menedék) a közös felső sáv ALATT legyen — álló nézetben a kép 24 %-ánál, fekvőben
 * 30 %-ánál (fentről). A lap ugyanezt a két értéket használja a címkéhez és a kérdés-sáv tetejéhez (`--ts-shelter-top`).
 */
export const SHELTER_TOP_PORTRAIT = 24;
export const SHELTER_TOP_LANDSCAPE = 30;
const shelterTopFor = (aspect: number) => (aspect > 1 ? SHELTER_TOP_LANDSCAPE : SHELTER_TOP_PORTRAIT);
/** A deszkák teteje (% fentről): a legfelső a menedék, alattuk egyenletesen a kép 78 %-áig. */
const plankTops = (aspect: number): number[] => {
  const first = shelterTopFor(aspect);
  return [0, 1, 2, 3].map((i) => first + ((78 - first) * i) / 3);
};

const CAM_DIST = 22;
const HALF_H = 7;
const EYE = 1.4;
const HALF_FULL = HALF_H + EYE;
const FOV = THREE.MathUtils.radToDeg(2 * Math.atan(HALF_FULL / CAM_DIST));
const FRONT_Z = 0.8;
const PLAYER_Z = 0.5;
const ZONE_Z = 0.3;
/** Planks sit behind the rider and the buoys, like the old DOM stacking. */
const PLANK_Z = -0.7;
const FOG_NEAR = 140;
const FOG_FAR = 620;

const SKY_TOP = "#2a74d6";
const SKY_HORIZON = "#ffe0b5";
const SKY_BOTTOM = "#ffd0a0";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Same polynomial as GLSL `smoothstep`, so CPU and GPU agree on the terrain and waves. */
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

// ---------------------------------------------------------------------------
// Shared CPU/GPU functions (keep the JS and GLSL versions identical)
// ---------------------------------------------------------------------------

function waveAtt(z: number): number {
  return 1 - smooth(12, 60, -z);
}

function waveHeight(x: number, z: number, t: number, amp: number): number {
  return (
    amp *
    waveAtt(z) *
    (0.55 * Math.sin(0.9 * x - 1.6 * t + 0.3 * z) +
      0.3 * Math.sin(1.7 * x + 2.3 * t + 0.8 * z) +
      0.15 * Math.sin(3.1 * x - 3.1 * t - 0.5 * z))
  );
}

function waveSlopeX(x: number, z: number, t: number, amp: number): number {
  return (
    amp *
    waveAtt(z) *
    (0.55 * 0.9 * Math.cos(0.9 * x - 1.6 * t + 0.3 * z) +
      0.3 * 1.7 * Math.cos(1.7 * x + 2.3 * t + 0.8 * z) +
      0.15 * 3.1 * Math.cos(3.1 * x - 3.1 * t - 0.5 * z))
  );
}

/** Coastal valley: a beach rising to hills on both sides, a bay opening to the sea in the middle. */
function terrainHeight(x: number, z: number, hw: number): number {
  const zz = -z;
  const u = x / ((hw * (CAM_DIST + zz)) / CAM_DIST);
  const au = Math.abs(u);
  const rise = smooth(4, 26, zz);
  const sides = smooth(0.2, 0.9, au);
  const bumps = 0.8 * Math.sin(u * 5.1 + zz * 0.13) + 0.5 * Math.sin(u * 9.7 - zz * 0.23 + 1.3) + 0.35 * Math.sin(zz * 0.41 + u * 2.3);
  const hills = 0.6 + 3.2 * sides + bumps * (0.5 + 0.5 * sides);
  const land = -7.5 + (hills + 7.5) * rise;
  const bay = (1 - smooth(0.12, 0.45, au)) * smooth(9, 22, zz);
  return land + (-10 - land) * bay;
}

const GLSL_SHARED = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uHw;
  float waveAtt(float z) { return 1.0 - smoothstep(12.0, 60.0, -z); }
  float waveH(float x, float z) {
    float t = uTime;
    return uAmp * waveAtt(z) * (0.55 * sin(0.9 * x - 1.6 * t + 0.3 * z)
      + 0.3 * sin(1.7 * x + 2.3 * t + 0.8 * z)
      + 0.15 * sin(3.1 * x - 3.1 * t - 0.5 * z));
  }
  vec2 waveD(float x, float z) {
    float t = uTime;
    float c1 = cos(0.9 * x - 1.6 * t + 0.3 * z);
    float c2 = cos(1.7 * x + 2.3 * t + 0.8 * z);
    float c3 = cos(3.1 * x - 3.1 * t - 0.5 * z);
    float a = uAmp * waveAtt(z);
    return a * vec2(0.495 * c1 + 0.51 * c2 + 0.465 * c3, 0.165 * c1 + 0.24 * c2 - 0.075 * c3);
  }
  float terrainH(float x, float z) {
    float zz = -z;
    float u = x / (uHw * (${CAM_DIST.toFixed(1)} + zz) / ${CAM_DIST.toFixed(1)});
    float au = abs(u);
    float rise = smoothstep(4.0, 26.0, zz);
    float sides = smoothstep(0.2, 0.9, au);
    float bumps = 0.8 * sin(u * 5.1 + zz * 0.13) + 0.5 * sin(u * 9.7 - zz * 0.23 + 1.3) + 0.35 * sin(zz * 0.41 + u * 2.3);
    float hills = 0.6 + 3.2 * sides + bumps * (0.5 + 0.5 * sides);
    float land = -7.5 + (hills + 7.5) * rise;
    float bay = (1.0 - smoothstep(0.12, 0.45, au)) * smoothstep(9.0, 22.0, zz);
    return land + (-10.0 - land) * bay;
  }
`;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

/**
 * Telefonos (nem „high”) szinten a díszlet Lambert-anyagot kap (koordinátori kötelező gyorsítás 2026-11-18): a PBR-árnyalás
 * képkockánkénti ára a lassú CPU-n / GPU-n a menetindítás és a játék akadását növelte. A víz saját shadere változatlan.
 */
let lambertDecor = false;

function std(color: THREE.ColorRepresentation, opts: THREE.MeshStandardMaterialParameters = {}): THREE.Material {
  if (lambertDecor) {
    const { roughness: _r, metalness: _m, envMap: _e, envMapIntensity: _ei, ...rest } = opts;
    return new THREE.MeshLambertMaterial({ color, ...(rest as THREE.MeshLambertMaterialParameters) });
  }
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...opts });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Symmetric axis: fine steps near the middle (where the camera looks), coarse far away. */
function buildAxis(nearHalf: number, nearStep: number, farHalf: number, farSteps: number): number[] {
  const pos: number[] = [];
  for (let v = 0; v < nearHalf; v += nearStep) pos.push(v);
  for (let i = 0; i <= farSteps; i++) pos.push(nearHalf + (farHalf - nearHalf) * Math.pow(i / farSteps, 1.8));
  const neg = pos.slice(1).map((v) => -v).reverse();
  return [...neg, ...pos];
}

function buildWaterSurface(xs: number[], zs: number[]): THREE.BufferGeometry {
  const positions = new Float32Array(xs.length * zs.length * 3);
  let k = 0;
  for (const z of zs) {
    for (const x of xs) {
      positions[k++] = x;
      positions[k++] = 0;
      positions[k++] = z;
    }
  }
  const index: number[] = [];
  const nx = xs.length;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -100), 1000);
  return g;
}

function buildWaterFront(xs: number[]): THREE.BufferGeometry {
  const positions = new Float32Array(xs.length * 2 * 3);
  const top = new Float32Array(xs.length * 2);
  xs.forEach((x, i) => {
    positions.set([x, 0, FRONT_Z], i * 3);
    positions.set([x, 1, FRONT_Z], (xs.length + i) * 3);
    top[xs.length + i] = 1;
  });
  const index: number[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = i;
    const b = i + 1;
    const c = xs.length + i;
    const d = c + 1;
    index.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("aTop", new THREE.BufferAttribute(top, 1));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
  return g;
}

function buildTerrain(hw: number, light: boolean): THREE.BufferGeometry {
  const uSegs = light ? 60 : 96;
  const zSegs = light ? 30 : 46;
  const nx = uSegs + 1;
  const positions = new Float32Array(nx * (zSegs + 1) * 3);
  const colors = new Float32Array(nx * (zSegs + 1) * 3);
  const sand = new THREE.Color("#f5dca4");
  const wetSand = new THREE.Color("#dcbf86");
  const grassA = new THREE.Color("#8ada6a");
  const grassB = new THREE.Color("#58bd58");
  const forest = new THREE.Color("#3d9a55");
  const rock = new THREE.Color("#a9b7ae");
  const c = new THREE.Color();
  const g2 = new THREE.Color();
  let k = 0;
  for (let j = 0; j <= zSegs; j++) {
    const zz = 5 + 107 * Math.pow(j / zSegs, 1.45);
    for (let i = 0; i <= uSegs; i++) {
      const u = -1.8 + (3.6 * i) / uSegs;
      const x = (u * hw * (CAM_DIST + zz)) / CAM_DIST;
      const y = terrainHeight(x, -zz, hw);
      positions[k] = x;
      positions[k + 1] = y;
      positions[k + 2] = -zz;
      const n = 0.5 + 0.5 * Math.sin(x * 1.7 + zz * 0.9) * Math.sin(x * 0.6 - zz * 1.3);
      g2.copy(grassA).lerp(grassB, n);
      if (y < -5.6) c.copy(wetSand);
      else if (y < -4.4) c.copy(wetSand).lerp(sand, smooth(-5.6, -4.8, y));
      else if (y < -3.5) c.copy(sand).lerp(g2, smooth(-4.4, -3.6, y));
      else if (y < 2.4) c.copy(g2);
      else if (y < 3.8) c.copy(g2).lerp(forest, smooth(2.4, 3.2, y));
      else c.copy(forest).lerp(rock, smooth(3.8, 4.6, y));
      colors[k] = c.r;
      colors[k + 1] = c.g;
      colors[k + 2] = c.b;
      k += 3;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < zSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const d = cc + 1;
      index.push(a, b, d, a, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function buildCloudGeometry(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const puffs = [
    [0, 0.2, 0, 2.2],
    [-2.1, -0.3, 0.2, 1.6],
    [2.2, -0.2, -0.2, 1.7],
    [-0.9, 1.1, -0.3, 1.5],
    [1.1, 0.9, 0.3, 1.4],
    [3.6, -0.6, 0, 1.1],
    [-3.5, -0.7, 0, 1.0],
  ];
  puffs.forEach(([x, y, z, r], i) => {
    const s = new THREE.SphereGeometry(r * (0.9 + 0.2 * Math.sin(seed * 3.1 + i)), 14, 10);
    s.translate(x, y, z);
    parts.push(s);
  });
  const merged = mergeGeometries(parts) ?? new THREE.SphereGeometry(2, 12, 8);
  parts.forEach((p) => p.dispose());
  merged.scale(1, 0.72, 0.6);
  return merged;
}

function buildPalm(): THREE.Group {
  const group = new THREE.Group();
  const trunkParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.CylinderGeometry(0.13 - i * 0.012, 0.16 - i * 0.012, 0.52, 7);
    seg.rotateZ(-0.08 * i);
    seg.translate(0.05 * i * i * 0.35, 0.26 + i * 0.48, 0);
    trunkParts.push(seg);
  }
  const trunkGeo = mergeGeometries(trunkParts) ?? new THREE.CylinderGeometry(0.12, 0.16, 3, 7);
  trunkParts.forEach((p) => p.dispose());
  const top = new THREE.Vector3(0.05 * 25 * 0.35, 0.26 + 5 * 0.48 + 0.2, 0);
  group.add(mesh(trunkGeo, std("#a8733f", { flatShading: true, roughness: 0.9 })));
  const leafParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.SphereGeometry(0.5, 8, 4);
    leaf.scale(1.9, 0.12, 0.46);
    leaf.translate(0.85, 0, 0);
    leaf.rotateZ(-0.45 - (i % 2) * 0.15);
    leaf.rotateY((i / 7) * Math.PI * 2 + 0.3);
    leaf.translate(top.x, top.y, top.z);
    leafParts.push(leaf);
  }
  const leavesGeo = mergeGeometries(leafParts) ?? new THREE.SphereGeometry(0.8, 8, 4);
  leafParts.forEach((p) => p.dispose());
  group.add(mesh(leavesGeo, std("#2fb35a", { flatShading: true, roughness: 0.8 })));
  const coco = new THREE.SphereGeometry(0.13, 8, 6);
  const cocoMat = std("#6b4423");
  group.add(mesh(coco, cocoMat, top.x + 0.12, top.y - 0.18, 0.1), mesh(coco, cocoMat, top.x - 0.1, top.y - 0.2, 0.05));
  return group;
}

function buildTree(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 6), std("#8a5a32", { flatShading: true }), 0, 0.4, 0));
  const crown = new THREE.IcosahedronGeometry(0.72, 0);
  group.add(mesh(crown, std(color, { flatShading: true, roughness: 0.85 }), 0, 1.15, 0));
  return group;
}

function buildHouse(wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation, windowMat: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(1.5, 1.05, 1.2, 2, 0.06), std(wall, { roughness: 0.75 }), 0, 0.52, 0));
  const roofGeo = new THREE.ConeGeometry(1.2, 0.85, 4);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1.05, 1, 0.85);
  group.add(mesh(roofGeo, std(roof, { flatShading: true, roughness: 0.55 }), 0, 1.47, 0));
  group.add(mesh(new THREE.BoxGeometry(0.3, 0.5, 0.05), std("#7c4a25"), -0.35, 0.27, 0.61));
  group.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.05), windowMat, 0.32, 0.6, 0.61));
  return group;
}

function buildLighthouse(): { group: THREE.Group; lamp: THREE.Sprite } {
  const group = new THREE.Group();
  const red = std("#ef4444", { roughness: 0.45 });
  const white = std("#fbfbf6", { roughness: 0.45 });
  for (let i = 0; i < 4; i++) {
    const r0 = 0.62 - i * 0.07;
    const r1 = r0 - 0.07;
    group.add(mesh(new THREE.CylinderGeometry(r1, r0, 0.9, 16), i % 2 === 0 ? white : red, 0, 0.45 + i * 0.9, 0));
  }
  group.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), std("#334155"), 0, 3.66, 0));
  group.add(mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshStandardMaterial({ color: "#fff7c2", emissive: "#ffd54a", emissiveIntensity: 2.4 }), 0, 3.95, 0));
  group.add(mesh(new THREE.ConeGeometry(0.42, 0.5, 16), red, 0, 4.42, 0));
  const lamp = createGlowSprite("#ffd76a", 3.2, 0.75);
  lamp.position.set(0, 3.95, 0.2);
  group.add(lamp);
  return { group, lamp };
}

type Kid = {
  group: THREE.Group;
  rider: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** S9: hip pivots, so the ride cycle can pump the legs. */
  legL: THREE.Group;
  legR: THREE.Group;
  head: THREE.Group;
};

/** A friendly blocky kid (~1 unit tall) standing on a surfboard; origin = board centre. */
function buildKid(): Kid {
  const group = new THREE.Group();
  const boardGeo = new THREE.SphereGeometry(0.5, 28, 12);
  boardGeo.scale(1.2, 0.1, 0.34);
  group.add(mesh(boardGeo, std("#ffcf3a", { roughness: 0.35 })));
  group.add(mesh(new THREE.BoxGeometry(0.95, 0.012, 0.07), std("#ef4444", { roughness: 0.4 }), 0, 0.048, 0));
  group.add(mesh(new THREE.BoxGeometry(0.95, 0.012, 0.03), std("#38bdf8", { roughness: 0.4 }), 0, 0.048, 0.07));

  const rider = new THREE.Group();
  rider.position.y = 0.05;
  group.add(rider);
  const skin = std("#f7c6a0", { roughness: 0.7 });
  const legMat = std("#4f46e5", { roughness: 0.7 });
  const legGeo = new RoundedBoxGeometry(0.13, 0.27, 0.14, 2, 0.03);
  const shoeGeo = new RoundedBoxGeometry(0.15, 0.06, 0.18, 2, 0.02);
  const shoeMat = std("#f8fafc", { roughness: 0.5 });
  // S9: each leg hangs from a hip pivot (y = 0.27), so the ride cycle can swing it.
  const makeLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 0.27, 0);
    hip.add(mesh(legGeo, legMat, 0, -0.135, 0), mesh(shoeGeo, shoeMat, 0, -0.24, 0.02));
    rider.add(hip);
    return hip;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  // Látvány 3. lépés (3): kerekded, kedves figura — lekerekített törzs (kapszula) csíkkal.
  const torso = new THREE.CapsuleGeometry(0.17, 0.16, 6, 14);
  torso.scale(1.1, 1, 0.85);
  rider.add(mesh(torso, std("#fb7a1c", { roughness: 0.6 }), 0, 0.45, 0));
  const stripe = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 18);
  stripe.scale(1.1, 1, 0.85);
  rider.add(mesh(stripe, std("#fde68a", { roughness: 0.6 }), 0, 0.47, 0));

  const armGeo = new RoundedBoxGeometry(0.1, 0.28, 0.11, 2, 0.03);
  const armMat = std("#fb7a1c", { roughness: 0.6 });
  const handGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const makeArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0.58, 0);
    pivot.add(mesh(armGeo, armMat, 0, -0.13, 0), mesh(handGeo, skin, 0, -0.29, 0));
    rider.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  const head = new THREE.Group();
  head.position.set(0, 0.61, 0);
  rider.add(head);
  const headGeo = new THREE.SphereGeometry(0.23, 22, 16);
  headGeo.scale(1.05, 0.95, 0.92);
  head.add(mesh(headGeo, skin, 0, 0.19, 0));
  const hairMat = std("#6b3f1d", { roughness: 0.8 });
  const hairGeo = new THREE.SphereGeometry(0.245, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
  hairGeo.scale(1.05, 0.95, 0.95);
  head.add(mesh(hairGeo, hairMat, 0, 0.2, -0.01));
  const fringe = new THREE.SphereGeometry(0.09, 12, 8);
  fringe.scale(1.6, 0.6, 0.8);
  head.add(mesh(fringe, hairMat, 0.05, 0.36, 0.15));
  const eyeGeo = new THREE.SphereGeometry(0.036, 10, 8);
  const eyeMat = std("#111827", { roughness: 0.3 });
  const shineGeo = new THREE.SphereGeometry(0.012, 6, 4);
  const shineMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  for (const side of [-1, 1]) {
    head.add(mesh(eyeGeo, eyeMat, side * 0.085, 0.21, 0.2));
    head.add(mesh(shineGeo, shineMat, side * 0.085 + 0.012, 0.224, 0.225));
  }
  const cheekGeo = new THREE.SphereGeometry(0.036, 10, 6);
  cheekGeo.scale(1.2, 0.8, 0.4);
  const cheekMat = std("#ff94a6", { roughness: 0.8 });
  head.add(mesh(cheekGeo, cheekMat, -0.13, 0.13, 0.18), mesh(cheekGeo, cheekMat, 0.13, 0.13, 0.18));
  const smile = new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI);
  smile.rotateZ(Math.PI);
  head.add(mesh(smile, std("#9f1239"), 0, 0.125, 0.205));
  return { group, rider, armL, armR, legL, legR, head };
}

type Buoy = { group: THREE.Group; light: THREE.MeshStandardMaterial; glow: THREE.Sprite };

function buildBuoy(): Buoy {
  const group = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.26, 18, 12);
  bodyGeo.scale(1, 0.9, 1);
  group.add(mesh(bodyGeo, std("#22c55e", { roughness: 0.4 }), 0, 0.05, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 18), std("#f8fafc", { roughness: 0.4 }), 0, 0.09, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.34, 8), std("#e2e8f0"), 0, 0.38, 0));
  const light = new THREE.MeshStandardMaterial({ color: "#dcfce7", emissive: "#4ade80", emissiveIntensity: 2.5 });
  group.add(mesh(new THREE.SphereGeometry(0.085, 12, 8), light, 0, 0.58, 0));
  const glow = createGlowSprite("#4ade80", 1.1, 0.8);
  glow.position.set(0, 0.58, 0.05);
  group.add(glow);
  return { group, light, glow };
}

type PlankKind = "ice" | "steel" | "wood";
const PLANKS: { top: number; type: PlankKind }[] = [
  // Látvány-előnézet (2026-11-18): egységes, meleg fa deszkák (a sárga-fekete fémcsík és a jég „építkezési” hatást keltett).
  { top: 18, type: "wood" },
  { top: 38, type: "wood" },
  { top: 58, type: "wood" },
  { top: 78, type: "wood" },
];

function buildPlatforms(
  xLeft: number,
  xRight: number,
  yAtTopPct: (top: number) => number,
  thick: number,
  envMap: THREE.Texture | null,
  tops: readonly number[],
): THREE.Group {
  const root = new THREE.Group();
  const len = xRight - xLeft;
  const cx = (xLeft + xRight) / 2;
  const depth = 1.5;
  const dummy = new THREE.Object3D();
  for (const [i, { type }] of PLANKS.entries()) {
    const top = tops[i]!;
    const yTop = yAtTopPct(top);
    const cy = yTop - thick / 2;
    const plank = new THREE.Group();
    plank.position.set(cx, cy, PLANK_Z);
    root.add(plank);
    if (type === "wood") {
      const colors = ["#d99a5b", "#c4843f", "#e0a86a"];
      for (let i = 0; i < 3; i++) {
        const g = new RoundedBoxGeometry(len, thick, depth / 3 - 0.06, 2, Math.min(0.06, thick * 0.3));
        plank.add(mesh(g, std(colors[i], { roughness: 0.85 }), 0, 0, -depth / 2 + (depth / 3) * (i + 0.5)));
      }
      const beamGeo = new RoundedBoxGeometry(0.22, thick * 0.7, depth + 0.1, 2, 0.04);
      const beamMat = std("#8b5a2b", { roughness: 0.9 });
      for (const f of [0.04, 0.5, 0.96]) plank.add(mesh(beamGeo, beamMat, -len / 2 + len * f, -thick * 0.55, 0));
      const nailGeo = new THREE.SphereGeometry(Math.min(0.05, thick * 0.18), 6, 4);
      const nails = new THREE.InstancedMesh(nailGeo, std("#6b7280", { metalness: 0.6, roughness: 0.4 }), 3 * 3);
      let n = 0;
      for (const f of [0.04, 0.5, 0.96]) {
        for (let i = 0; i < 3; i++) {
          dummy.position.set(-len / 2 + len * f, thick / 2, -depth / 2 + (depth / 3) * (i + 0.5));
          dummy.updateMatrix();
          nails.setMatrixAt(n++, dummy.matrix);
        }
      }
      plank.add(nails);
    } else if (type === "steel") {
      plank.add(mesh(new RoundedBoxGeometry(len, thick, depth, 2, Math.min(0.08, thick * 0.3)), std("#9fb4c9", { metalness: 0.8, roughness: 0.34, envMap, envMapIntensity: 0.8 })));
      const stripe = canvasTexture(64, 16, (ctx) => {
        ctx.fillStyle = "#facc15";
        ctx.fillRect(0, 0, 64, 16);
        ctx.fillStyle = "#1f2937";
        for (let x = -16; x < 80; x += 16) {
          ctx.beginPath();
          ctx.moveTo(x, 16);
          ctx.lineTo(x + 8, 16);
          ctx.lineTo(x + 16, 0);
          ctx.lineTo(x + 8, 0);
          ctx.closePath();
          ctx.fill();
        }
      });
      stripe.wrapS = THREE.RepeatWrapping;
      stripe.repeat.set(Math.max(1, len / 0.9), 1);
      plank.add(mesh(new THREE.PlaneGeometry(len * 0.985, thick * 0.42), std("#ffffff", { map: stripe, roughness: 0.5 }), 0, 0, depth / 2 + 0.005));
      const count = Math.max(2, Math.floor(len / 1.4));
      const rivets = new THREE.InstancedMesh(
        new THREE.SphereGeometry(Math.min(0.07, thick * 0.2), 8, 6),
        std("#e2e8f0", { metalness: 0.9, roughness: 0.3, envMap }),
        count,
      );
      for (let i = 0; i < count; i++) {
        dummy.position.set(-len / 2 + (len * (i + 0.5)) / count, thick / 2, depth / 2 - 0.12);
        dummy.updateMatrix();
        rivets.setMatrixAt(i, dummy.matrix);
      }
      plank.add(rivets);
    } else {
      plank.add(
        mesh(
          new RoundedBoxGeometry(len, thick, depth, 2, Math.min(0.08, thick * 0.3)),
          std("#8fe3f8", { roughness: 0.3, emissive: "#38bdf8", emissiveIntensity: 0.22, transparent: true, opacity: 0.92, envMap, envMapIntensity: 0.6 }),
        ),
      );
      plank.add(mesh(new RoundedBoxGeometry(len + 0.04, thick * 0.38, depth + 0.04, 2, Math.min(0.06, thick * 0.18)), std("#f4fbff", { roughness: 0.9 }), 0, thick * 0.42, 0));
      const count = Math.max(4, Math.floor(len / 0.7));
      const icicleGeo = new THREE.ConeGeometry(0.07, 1, 6);
      icicleGeo.rotateX(Math.PI);
      icicleGeo.translate(0, -0.5, 0);
      const icicles = new THREE.InstancedMesh(
        icicleGeo,
        std("#cffafe", { roughness: 0.3, emissive: "#67e8f9", emissiveIntensity: 0.3, transparent: true, opacity: 0.9 }),
        count,
      );
      for (let i = 0; i < count; i++) {
        const l = thick * (0.8 + 1.4 * Math.abs(Math.sin(i * 12.9898 + top) * 0.5 + Math.sin(i * 3.1) * 0.5));
        dummy.position.set(-len / 2 + (len * (i + 0.3 + 0.4 * Math.abs(Math.sin(i * 7.7)))) / count, -thick / 2 + 0.01, depth / 2 - 0.15);
        dummy.scale.set(1, l, 1);
        dummy.updateMatrix();
        icicles.setMatrixAt(i, dummy.matrix);
      }
      plank.add(icicles);
    }
  }
  return root;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/** The goal: a small hut with a waving flag on the top plank (D4: the shelter is always visible). */
function buildShelter(): { group: THREE.Group; flag: THREE.Mesh } {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(1.5, 1.05, 1.1, 2, 0.08), std("#fef3c7", { roughness: 0.8 }), 0, 0.52, 0));
  const roof = mesh(new THREE.ConeGeometry(1.15, 0.75, 4), std("#dc2626", { roughness: 0.7 }), 0, 1.42, 0);
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  group.add(mesh(new THREE.BoxGeometry(0.42, 0.62, 0.05), std("#7c2d12"), 0, 0.31, 0.56));
  group.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), std("#e5e7eb", { metalness: 0.4 }), 0.62, 2.0, 0));
  const flag = mesh(new THREE.PlaneGeometry(0.62, 0.38), new THREE.MeshStandardMaterial({ color: "#22c55e", emissive: "#16a34a", emissiveIntensity: 0.6, side: THREE.DoubleSide }), 0.94, 2.55, 0);
  group.add(flag);
  return { group, flag };
}

function setupTsunami(
  { renderer, scene, tier, reducedMotion }: ThreeSceneContext,
  propsRef: MutableRefObject<TsunamiScene3DProps>,
  light: boolean,
): ThreeSceneController {
  const budget = LOOK_BUDGET[tier];
  const particleScale = budget.particleScale * (light ? 0.5 : 1);
  const lean = light || tier === "low";
  lambertDecor = tier !== "high";

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 900);
  camera.position.set(0, EYE, CAM_DIST);

  let hw = HALF_H * 1.6;
  let worldPerPx = (2 * HALF_H) / 400;
  let heightPx = 400;
  const worldX = (fx: number, z = 0) => (fx * 2 - 1) * hw * ((CAM_DIST - z) / CAM_DIST);
  const worldY = (fy: number, z = 0) => {
    const s = (CAM_DIST - z) / CAM_DIST;
    return EYE - HALF_FULL * s + fy * 2 * HALF_H * s;
  };

  scene.fog = new THREE.Fog(SKY_HORIZON, FOG_NEAR, FOG_FAR);

  let env: { texture: THREE.Texture; dispose(): void } | null = null;
  if (budget.environment) {
    // Only the glossy props (steel, ice) reflect it; on the whole scene it turns the toy colours milky.
    env = createRoomEnvironment(renderer);
  }

  // Sky + sun
  const sky = createGradientSky({
    top: SKY_TOP,
    horizon: SKY_HORIZON,
    bottom: SKY_BOTTOM,
    sunDirection: new THREE.Vector3(-0.6, 0.35, -1),
    sunColor: "#fff0b0",
    sunSize: 0.035,
    radius: 600,
  });
  sky.position.copy(camera.position);
  scene.add(sky);
  const skyU = sky.material.uniforms;
  // With bloom the HDR sun disc would haze half the hills; the glow itself supplies the brightness.
  if (budget.bloom) (skyU.sunColor.value as THREE.Color).multiplyScalar(0.5);

  // Lights: a warm key from the front so faces read, a sky/ground fill.
  const hemi = new THREE.HemisphereLight("#ffe9cc", "#4c8a5a", 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#ffd9a3", 2.2);
  key.position.set(6, 10, 14);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#bfe8ff", 0.8);
  rim.position.set(-8, 6, -10);
  scene.add(rim);

  // Distant mountains (screen-anchored, recoloured by the fog)
  const mountainMat = std("#86acd6", { flatShading: true, roughness: 1 });
  const snowMat = std("#ffffff", { flatShading: true, roughness: 0.9 });
  const mountains = [
    { u: -1.05, fy: 0.76, r: 30 },
    { u: -0.62, fy: 0.7, r: 24 },
    { u: 0.58, fy: 0.72, r: 26 },
    { u: 0.98, fy: 0.79, r: 32 },
  ].map(({ u, fy, r }) => {
    const zz = 200;
    const base = -24;
    const h = worldY(fy, -zz) - base;
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(r, h, 7), mountainMat, 0, h / 2, 0));
    g.add(mesh(new THREE.ConeGeometry(r * 0.28, h * 0.28, 7), snowMat, 0, h - h * 0.14 + 0.2, 0));
    g.position.set(0, base, -zz);
    scene.add(g);
    return { g, u, zz };
  });

  // Clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#e3f1ff", emissiveIntensity: 0.55, roughness: 1, fog: false });
  const clouds = Array.from({ length: lean ? 3 : 6 }, (_, i) => {
    const m = new THREE.Mesh(buildCloudGeometry(i), cloudMat);
    const zz = 130 + (i % 3) * 25;
    const s = 2.2 + ((i * 37) % 10) / 10;
    m.scale.setScalar(s);
    scene.add(m);
    return { m, zz, fx: (i + 0.35) / (lean ? 3 : 6), fy: 0.78 + ((i * 53) % 17) / 100, speed: 0.6 + (i % 3) * 0.35 };
  });

  // Terrain (rebuilt on resize: its shape is anchored to the screen width)
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 });
  const terrain = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
  scene.add(terrain);

  // Land decorations: houses, palms, trees, lighthouse, a little island in the bay
  const windowMat = new THREE.MeshStandardMaterial({ color: "#ffe9a8", emissive: "#ffc94a", emissiveIntensity: 1.6 });
  type Decor = { obj: THREE.Object3D; u: number; zz: number; lift: number; kind?: "palm" | "house" | "lighthouse" | "tree" | "rock" | "bush" };
  const decor: Decor[] = [];
  const addDecor = (obj: THREE.Object3D, u: number, zz: number, scale: number, lift = -0.05, rotY = 0, kind?: Decor["kind"]) => {
    obj.scale.setScalar(scale);
    obj.rotation.y = rotY;
    scene.add(obj);
    decor.push({ obj, u, zz, lift, kind });
  };
  const lighthouse = buildLighthouse();
  addDecor(lighthouse.group, 0.74, 34, 1.3, -0.2, 0, "lighthouse");
  addDecor(buildHouse("#ffd6a5", "#e5484d", windowMat), -0.74, 24, 1.15, -0.1, 0.25, "house");
  addDecor(buildHouse("#bde0fe", "#2563eb", windowMat), -0.46, 30, 1.1, -0.1, -0.2, "house");
  addDecor(buildHouse("#ffc8dd", "#7c3aed", windowMat), 0.5, 24, 1.1, -0.1, 0.15, "house");
  addDecor(buildPalm(), -0.3, 15, 1.25, -0.05, 0, "palm");
  addDecor(buildPalm(), 0.34, 14, 1.2, -0.05, 1.2, "palm");
  if (!lean) {
    addDecor(buildHouse("#caffbf", "#f97316", windowMat), 0.9, 40, 1.2, -0.1, -0.3, "house");
    addDecor(buildPalm(), -0.95, 18, 1.35, -0.05, 2.2, "palm");
    addDecor(buildTree("#4cbf5f"), -0.6, 38, 1.4);
    addDecor(buildTree("#3fa65a"), -0.88, 46, 1.6);
    addDecor(buildTree("#5ccc62"), 0.62, 44, 1.5);
    addDecor(buildTree("#46b25a"), 1.05, 30, 1.4);
    addDecor(buildTree("#4cbf5f"), -1.1, 30, 1.5);
  }
  const islandGeo = new THREE.SphereGeometry(3.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  islandGeo.scale(1.3, 0.34, 1);
  const island = new THREE.Group();
  island.add(mesh(islandGeo, std("#f3d9a0", { roughness: 0.95 })));
  const islandPalm = buildPalm();
  islandPalm.scale.setScalar(1.3);
  islandPalm.position.set(0.4, 0.9, 0);
  island.add(islandPalm);
  scene.add(island);
  const islandSpot = { u: 0.16, zz: 78, y: -5.9 };

  /*
   * Látvány C irány (terv 7.2): a Blender-szkriptből gyártott, Meshopt-tömörített díszlet (`/models/szokoar/`). Lustán, a
   * menü alatt töltődik; amíg nincs meg (vagy hiba esetén), a primitív díszlet marad. A modell a régi tárgy befoglaló
   * magasságára igazodik, a talppontja a régi talppontra.
   */
  let disposed = false;
  const debris: { obj: THREE.Object3D; fx: number; speed: number; phase: number }[] = [];
  const fitInto = (holder: THREE.Object3D, model: THREE.Object3D, heightMul = 1) => {
    holder.updateMatrixWorld(true);
    const oldBox = new THREE.Box3().setFromObject(holder);
    const oldH = Math.max(0.01, oldBox.max.y - oldBox.min.y) * heightMul;
    for (const c of holder.children) c.visible = false;
    const box = new THREE.Box3().setFromObject(model);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const k = oldH / h / Math.max(1e-6, holder.getWorldScale(new THREE.Vector3()).y);
    model.scale.setScalar(k);
    model.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    holder.add(model);
  };
  const lambertize = (root: THREE.Object3D) => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      const params = { color: src.color, emissive: src.emissive, emissiveIntensity: src.emissiveIntensity };
      m.material = lambertDecor ? new THREE.MeshLambertMaterial(params) : new THREE.MeshStandardMaterial({ ...params, roughness: 0.8, metalness: 0 });
      src.dispose();
    });
  };
  const loadModels = async () => {
    try {
      const res = await fetch("/models/szokoar/manifest.json");
      if (!res.ok) return;
      const manifest = (await res.json()) as { props?: string };
      if (!manifest.props || disposed) return;
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf: GLTF = await loader.loadAsync(`/models/szokoar/${manifest.props}`);
      if (disposed) return;
      lambertize(gltf.scene);
      const clone = (n: string) => {
        const src = gltf.scene.getObjectByName(n);
        if (!src) return null;
        const c = src.clone(true);
        c.position.set(0, 0, 0);
        return c;
      };
      let palmI = 0;
      let houseI = 0;
      for (const d of decor) {
        if (d.kind === "palm") {
          const m = clone(palmI++ % 2 ? "palm_b" : "palm_a");
          if (m) fitInto(d.obj, m);
        } else if (d.kind === "house") {
          const m = clone(houseI++ % 2 ? "hut_b" : "hut_a");
          if (m) fitInto(d.obj, m);
        } else if (d.kind === "lighthouse") {
          d.obj.visible = false; // a világítótorony lett a menedék (a felső deszkán)
        }
      }
      const lh = clone("lighthouse");
      if (lh) fitInto(shelter.group, lh, 1.5);
      const spots: [string, number, number, number][] = [
        ["rock_c", -0.62, 11, 1.4], ["rock_a", -0.4, 9, 1.0], ["rock_b", 0.42, 9, 1.0], ["rock_c", 0.66, 12, 1.5],
        ["bush", -0.5, 17, 1.2], ["bush", 0.55, 16, 1.1], ["rock_a", -0.85, 14, 1.3], ["rock_b", 0.85, 13, 1.2],
      ];
      for (const [n, u, zz, sc] of spots) {
        const m = clone(n);
        if (!m) continue;
        const holder = new THREE.Group();
        holder.add(m);
        const box = new THREE.Box3().setFromObject(m);
        m.position.y = -box.min.y;
        // A sziklák a talajba ülnek (a lekerekített aljuk ne lebegjen).
        addDecor(holder, u, zz, sc, n.startsWith("rock") ? -0.45 * sc : -0.2, u * 3, n.startsWith("rock") ? "rock" : "bush");
      }
      const debrisNames = ["debris_plank", "debris_barrel", "debris_crate", "debris_plank", "debris_barrel"];
      debrisNames.slice(0, lean ? 3 : 5).forEach((n, i) => {
        const m = clone(n);
        if (!m) return;
        m.scale.setScalar(0.55);
        scene.add(m);
        debris.push({ obj: m, fx: 0.1 + i * 0.19, speed: (i % 2 ? -1 : 1) * (0.006 + 0.003 * i), phase: i * 1.7 });
      });
      layout();
    } catch {
      /* a primitív díszlet marad */
    }
  };

  // Water: a wave surface receding into the bay + the sea's cut face towards the camera
  const step = lean ? 0.7 : 0.4;
  const xs = buildAxis(30, step, 420, lean ? 14 : 22);
  const zs: number[] = [];
  for (let z = FRONT_Z; z > -14; z -= step) zs.push(z);
  for (let i = 1; i <= (lean ? 18 : 28); i++) zs.push(-14 - 316 * Math.pow(i / (lean ? 18 : 28), 1.7));
  const waterUniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.2 },
    uHw: { value: hw },
    uLevel: { value: -5 },
    uFlash: { value: 0 },
    uShallow: { value: new THREE.Color("#1ccfd6") },
    uDeep: { value: new THREE.Color("#0a62a8") },
    uSkyTint: { value: new THREE.Color("#ffd8b0") },
    uFogColor: { value: new THREE.Color(SKY_HORIZON) },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.35, -1).normalize() },
    uSunColor: { value: new THREE.Color("#fff3c4") },
    uFoamW: { value: 0.16 },
    uFrontTop: { value: new THREE.Color("#22c3d8") },
    uFrontDeep: { value: new THREE.Color("#073763") },
  };
  const surfaceMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: /* glsl */ `
      ${GLSL_SHARED}
      uniform float uLevel;
      varying vec3 vWorld;
      varying vec2 vSlope;
      varying float vWave;
      void main() {
        vec3 p = position;
        float w = waveH(p.x, p.z);
        vSlope = waveD(p.x, p.z);
        vWave = w / max(uAmp, 0.001);
        p.y = uLevel + w;
        vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_SHARED}
      uniform float uLevel;
      uniform float uFlash;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSkyTint;
      uniform vec3 uFogColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vWorld;
      varying vec2 vSlope;
      varying float vWave;
      void main() {
        float dist = length(cameraPosition - vWorld);
        float near = 1.0 - smoothstep(10.0, 45.0, -vWorld.z);
        vec3 n = normalize(vec3(-vSlope.x, 1.0, -vSlope.y));
        vec2 rp = vWorld.xz;
        n = normalize(n + near * vec3(0.07 * sin(rp.x * 4.3 + uTime * 2.1 + rp.y * 3.1), 0.0, 0.07 * cos(rp.y * 5.1 - uTime * 1.8 + rp.x * 2.3)));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(6.0, 90.0, dist));
        col = mix(col, uSkyTint, 0.03 + 0.22 * fres);
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(n, H), 0.0), 220.0);
        col += uSunColor * spec * 2.2;
        float sparkle = pow(max(dot(n, H), 0.0), 40.0) * 0.18;
        col += uSunColor * sparkle;
        // Foam: wave crests, the front edge and every shoreline.
        float grain = 0.5 + 0.5 * sin(rp.x * 7.3 + uTime * 1.3) * sin(rp.y * 6.1 - uTime * 0.9);
        float crest = smoothstep(0.62, 0.98, vWave + 0.25 * grain) * near;
        float edge = smoothstep(${(FRONT_Z - 0.45).toFixed(2)}, ${FRONT_Z.toFixed(2)}, vWorld.z) * (0.4 + 0.5 * grain);
        float zz = -vWorld.z;
        float onLand = smoothstep(4.5, 6.0, zz) * (1.0 - smoothstep(106.0, 112.0, zz));
        float gap = vWorld.y - terrainH(vWorld.x, vWorld.z);
        // S9: a wider surf line where the sea meets the beach.
        float shore = (1.0 - smoothstep(0.0, 0.9 + 0.35 * grain, gap)) * onLand;
        // S9: whitecaps where the wave face is steep (foam follows the waveH slope).
        float steep = smoothstep(0.16, 0.42, length(vSlope) + 0.06 * grain) * near;
        float foam = clamp(max(max(max(crest * 0.75, edge), shore * 0.9), steep * 0.6), 0.0, 1.0);
        col = mix(col, vec3(0.96, 0.99, 1.0), foam);
        col = mix(col, uFogColor, smoothstep(${FOG_NEAR.toFixed(1)}, ${FOG_FAR.toFixed(1)}, dist));
        col = mix(col, vec3(0.92, 0.95, 1.0), uFlash * 0.45);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  // S9: wet sand — the terrain darkens in a band just above the (moving) waterline.
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uLevel = waterUniforms.uLevel;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vWetY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWetY = (modelMatrix * vec4(transformed, 1.0)).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uLevel;\nvarying float vWetY;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nfloat wetBand = (1.0 - smoothstep(0.0, 1.15, vWetY - uLevel)) * step(uLevel - 0.6, vWetY);\ndiffuseColor.rgb *= mix(1.0, 0.68, wetBand);",
      );
  };
  terrainMat.customProgramCacheKey = () => "tsunami-wet-sand";

  const surface = new THREE.Mesh(buildWaterSurface(xs, zs), surfaceMat);
  surface.frustumCulled = false;
  scene.add(surface);

  const frontMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: /* glsl */ `
      ${GLSL_SHARED}
      uniform float uLevel;
      attribute float aTop;
      varying vec3 vWorld;
      varying float vSurf;
      void main() {
        vec3 p = position;
        vSurf = uLevel + waveH(p.x, p.z);
        p.y = aTop > 0.5 ? vSurf : -40.0;
        vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFlash;
      uniform float uFoamW;
      uniform vec3 uFrontTop;
      uniform vec3 uFrontDeep;
      varying vec3 vWorld;
      varying float vSurf;
      void main() {
        float d = vSurf - vWorld.y;
        vec3 col = mix(uFrontTop, uFrontDeep, smoothstep(0.0, 3.5, d) * 0.7 + smoothstep(3.5, 12.0, d) * 0.3);
        float c = sin(vWorld.x * 1.3 + uTime * 0.9 + sin(vWorld.y * 1.7 + uTime * 0.6) * 1.2)
                * sin(vWorld.x * 0.7 - uTime * 0.5 + vWorld.y * 0.9 + sin(vWorld.x * 0.4) * 1.5);
        col += vec3(0.3, 0.7, 0.8) * smoothstep(0.6, 0.95, c) * (1.0 - smoothstep(0.0, 4.0, d)) * 0.1;
        col += vec3(0.4, 0.85, 0.95) * exp(-d * 1.6) * 0.3;
        float edge = uFoamW * (1.0 + 0.45 * sin(vWorld.x * 5.3 + uTime * 2.2) + 0.3 * sin(vWorld.x * 11.0 - uTime * 3.1));
        float foam = 1.0 - smoothstep(edge * 0.55, edge, d);
        float bubbles = smoothstep(0.975, 0.995, sin(vWorld.x * 23.0 + uTime * 0.7) * sin(vWorld.y * 21.0 + uTime * 1.9 + sin(vWorld.x * 3.0))) * (1.0 - smoothstep(0.0, 1.2, d));
        col = mix(col, vec3(0.96, 0.99, 1.0), max(foam, bubbles * 0.35));
        col = mix(col, vec3(0.85, 0.92, 1.0), uFlash * 0.3);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const front = new THREE.Mesh(buildWaterFront(xs), frontMat);
  front.frustumCulled = false;
  front.renderOrder = 1;
  scene.add(front);

  /*
   * Látvány 3. lépés (1): a SZÖKŐÁR mint főszereplő — a öböl mögött közeledő, átbukó hullámfal. Minél magasabb a víz, annál
   * közelebb és magasabb; a tetején fehér, tépett taraj, a falán sötét mélység és fénylő sávok. Egy rajzolási hívás.
   */
  const waveUniforms = { uTime: { value: 0 }, uDanger: { value: 0 } };
  const waveMat = new THREE.ShaderMaterial({
    uniforms: waveUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uDanger;
      varying vec2 vUv;
      varying float vCurl;
      void main() {
        vUv = uv;
        vec3 p = position;
        float x = p.x;
        // A taraj előrebukik (z felé), a fal teteje hullámzik.
        float crestWave = sin(x * 0.18 + uTime * 0.9) * 0.6 + sin(x * 0.07 - uTime * 0.5) * 1.1;
        float top = smoothstep(0.55, 1.0, uv.y);
        // A mesh y-ban a fal magasságára skálázódik: a taraj hullámzása ennek néhány százaléka.
        p.y += uv.y * crestWave * 0.025 * (0.6 + uDanger);
        p.z += top * top * (3.0 + 6.0 * uDanger);
        vCurl = top;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vCurl;
      void main() {
        vec3 deep = vec3(0.02, 0.22, 0.38);
        vec3 face = vec3(0.07, 0.55, 0.66);
        vec3 col = mix(deep, face, smoothstep(0.0, 0.8, vUv.y));
        float streak = smoothstep(0.75, 1.0, sin(vUv.x * 60.0 + vUv.y * 9.0 + uTime * 1.6) * 0.5 + 0.5) * smoothstep(0.2, 0.8, vUv.y);
        col += vec3(0.35, 0.8, 0.85) * streak * 0.18;
        float foamEdge = 0.86 + 0.05 * sin(vUv.x * 40.0 + uTime * 3.0) + 0.03 * sin(vUv.x * 97.0 - uTime * 4.0);
        float foam = smoothstep(foamEdge - 0.05, foamEdge, vUv.y);
        col = mix(col, vec3(0.97, 0.99, 1.0), foam);
        float alpha = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.985, 1.0, vUv.y));
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const waveWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, lean ? 48 : 96, 12), waveMat);
  waveWall.frustumCulled = false;
  waveWall.renderOrder = 0;
  scene.add(waveWall);

  // Platforms (rebuilt on resize: their length follows the screen width)
  let platforms: THREE.Group | null = null;

  // Safe zone: two glowing buoys, a float line and a green glow on the water
  const zone = new THREE.Group();
  scene.add(zone);
  const buoyL = buildBuoy();
  const buoyR = buildBuoy();
  zone.add(buoyL.group, buoyR.group);
  const FLOATS = 9;
  const floats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), std("#fde047", { roughness: 0.4, emissive: "#facc15", emissiveIntensity: 0.25 }), FLOATS);
  zone.add(floats);
  const bandGeo = new THREE.PlaneGeometry(1, 1, 24, 1);
  bandGeo.rotateX(-Math.PI / 2);
  const bandBase = Float32Array.from(bandGeo.attributes.position.array as ArrayLike<number>);
  const bandMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#22c55e", transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.frustumCulled = false;
  band.renderOrder = 2;
  zone.add(band);
  const beamTex = canvasTexture(32, 64, (ctx) => {
    const v = ctx.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, "rgba(255,255,255,0)");
    v.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 32, 64);
    ctx.globalCompositeOperation = "destination-in";
    const h = ctx.createLinearGradient(0, 0, 32, 0);
    h.addColorStop(0, "rgba(255,255,255,0)");
    h.addColorStop(0.5, "rgba(255,255,255,1)");
    h.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 32, 64);
  });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: "#6ee7b7", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beamMat);
  beam.renderOrder = 2;
  zone.add(beam);

  // Player
  const kid = buildKid();
  scene.add(kid.group);
  const shelter = buildShelter();
  scene.add(shelter.group);

  // Rain
  const rainCount = reducedMotion || light ? 0 : Math.round(30 * Math.max(0.5, budget.particleScale));
  const rainPos = new Float32Array(rainCount * 6);
  const rainSpeed = new Float32Array(rainCount);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = new THREE.LineBasicMaterial({ color: "#e0f7ff", transparent: true, opacity: 0.38, depthWrite: false, fog: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = rainCount > 0;
  scene.add(rain);
  const spawnDrop = (i: number, anywhere: boolean) => {
    const z = 4 - Math.random() * 14;
    const s = (CAM_DIST - z) / CAM_DIST;
    const x = (Math.random() * 2 - 1) * hw * s * 1.15;
    const y = anywhere ? (Math.random() * 2 - 1) * HALF_FULL * s + EYE : EYE + HALF_FULL * s + Math.random() * 3;
    rainPos[i * 6] = x;
    rainPos[i * 6 + 1] = y;
    rainPos[i * 6 + 2] = z;
    rainSpeed[i] = 13 + Math.random() * 7;
  };
  for (let i = 0; i < rainCount; i++) spawnDrop(i, true);

  // Lightning
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.4), transparent: true, opacity: 0, depthWrite: false, fog: false });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  bolt.frustumCulled = false;
  bolt.visible = false;
  scene.add(bolt);
  const makeBolt = () => {
    const z = -40;
    const s = (CAM_DIST - z) / CAM_DIST;
    let x = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.55) * hw * s;
    let y = EYE + HALF_FULL * s + 2;
    const endY = waterUniforms.uLevel.value;
    const pts: THREE.Vector2[] = [new THREE.Vector2(x, y)];
    while (y > endY) {
      y -= 1.2 + Math.random() * 1.6;
      x += (Math.random() - 0.5) * 2.6;
      pts.push(new THREE.Vector2(x, Math.max(y, endY)));
    }
    const w = 0.22;
    const pos: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const wa = w * (1 - (i / pts.length) * 0.6);
      const wb = w * (1 - ((i + 1) / pts.length) * 0.6);
      pos.push(a.x - wa, a.y, z, a.x + wa, a.y, z, b.x + wb, b.y, z);
      pos.push(a.x - wa, a.y, z, b.x + wb, b.y, z, b.x - wb, b.y, z);
    }
    bolt.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    bolt.geometry = g;
  };

  // Sparkles: board spray, safe-zone glitter, splash when the water drops
  const sparkles = new SparkleField(scene, Math.max(40, Math.round(320 * particleScale)));

  // -------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const sprayDir = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const dummy = new THREE.Object3D();
  const readTarget = () => {
    const p = propsRef.current.live?.current ?? propsRef.current;
    return {
      level: worldY(clamp01(p.water / 100)),
      px: clamp01(p.playerX / 100),
      sx: clamp01(p.safeZoneX / 100),
    };
  };
  const init = readTarget();
  let level = init.level;
  let px = init.px;
  let sx = init.sx;
  let lastTargetLevel = init.level;
  let prevKidX = 0;
  let vx = 0;
  let leanZ = 0;
  let turnY = 0;
  let flash = 0;
  let prevStorm = false;
  let sprayAcc = 0;
  let zoneAcc = 0;
  let waveTime = 0;
  let kidScale = 0.5;
  /** Victory (D4): 0 → 1 while the rider climbs into the shelter and the wave breaks below it. */
  let winT = 0;
  let winBurst = false;
  /** S9: ride-cycle phase (legs, arms, bob) — its rate follows the board speed. */
  let ridePhase = 0;
  let prevPumpSign = 1;
  let frontSprayAcc = 0;
  /** S9: reduced motion keeps 30 % of the rider's swing (and no spray / dust). */
  const motionK = reducedMotion ? 0.3 : 1;

  const layout = () => {
    // Screen-anchored pieces
    waterUniforms.uHw.value = hw;
    // S9: a thicker white crest band on top of the wave face.
    waterUniforms.uFoamW.value = Math.max(0.14, 8.5 * worldPerPx);
    terrain.geometry.dispose();
    terrain.geometry = buildTerrain(hw, lean);
    for (const d of decor) {
      const x = (d.u * hw * (CAM_DIST + d.zz)) / CAM_DIST;
      d.obj.position.set(x, terrainHeight(x, -d.zz, hw) + d.lift, -d.zz);
    }
    island.position.set((islandSpot.u * hw * (CAM_DIST + islandSpot.zz)) / CAM_DIST, islandSpot.y, -islandSpot.zz);
    for (const m of mountains) m.g.position.x = (m.u * hw * (CAM_DIST + m.zz)) / CAM_DIST;
    const sunPoint = new THREE.Vector3(worldX(0.12, -400), worldY(0.95, -400), -400);
    const sunDir = sunPoint.sub(camera.position).normalize();
    skyU.sunDirection.value.copy(sunDir);
    waterUniforms.uSunDir.value.copy(sunDir);

    if (platforms) {
      scene.remove(platforms);
      disposeObjectTree(platforms);
    }
    const thick = Math.max(0.24, 15 * worldPerPx);
    platforms = buildPlatforms(worldX(0.08), worldX(0.92), (top) => worldY(1 - top / 100), thick, env?.texture ?? null, plankTops(hw / HALF_H));
    scene.add(platforms);

    kidScale = Math.min(74, Math.max(46, heightPx * 0.14)) * worldPerPx;
    kid.group.scale.setScalar(kidScale);
    shelter.group.scale.setScalar(kidScale * 0.62);
    shelter.group.position.set(worldX(SHELTER_X), worldY(1 - shelterTopFor(hw / HALF_H) / 100), PLANK_Z + 0.2);
    const zoneUnit = kidScale * 0.95;
    buoyL.group.scale.setScalar(zoneUnit);
    buoyR.group.scale.setScalar(zoneUnit);
    floats.scale.setScalar(1);
  };

  let warmFrames = 0;
  let shiftY = 0;
  let lastW = -1;
  let lastH = -1;
  const controller: ThreeSceneController = {
    camera,
    // The sky near the sun is ~1.5 (disc ~3): only the disc, buoy lights and lightning should glow.
    bloom: { strength: 0.6, radius: 0.35, threshold: 1.6 },
    resize(w, h) {
      // Azonos méretre nincs újraépítés (a menü alatti előkészítés után az indítás ne építse újra a terepet és a deszkákat).
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      heightPx = h;
      hw = (HALF_H * w) / h;
      worldPerPx = (2 * HALF_H) / h;
      const fullH = (h * HALF_FULL) / HALF_H;
      camera.aspect = hw / HALF_FULL;
      camera.setViewOffset(w, fullH, 0, (h * EYE) / HALF_H, w, h);
      camera.updateProjectionMatrix();
      sparkles.setViewportHeight(fullH * renderer.getPixelRatio(), FOV);
      layout();
    },
    update(dt, elapsed) {
      const p = propsRef.current;
      // Menü alatti előkészítés (K4): néhány bemelegítő képkocka (shader-fordítás, feltöltés) után a jelenet láthatatlan és
      // nem számol — a közös hurok csak egy üres törlést rajzol, amíg a gyerek a menüben van.
      if (p.phase === "menu") {
        warmFrames += 1;
        scene.visible = warmFrames <= 3;
        if (warmFrames > 3) return;
      } else {
        scene.visible = true;
      }
      const target = readTarget();
      const playing = p.phase === "play";
      if (!reducedMotion) waveTime += dt;
      const t = waveTime;

      // K2: kép-eltolás nyitott kérdés alatt (a kamera felfelé mozdul → a világ lejjebb kerül a képen).
      const live = p.live?.current;
      // ≈ 400 ms-os lassuló beállás (koordinátori pontosítás 2026-11-18); csökkentett mozgásnál azonnali.
      const shiftTarget = (live?.shiftPx ?? 0) * worldPerPx;
      shiftY = reducedMotion ? shiftTarget : damp(shiftY, shiftTarget, 12, dt);
      camera.position.y = EYE + shiftY;
      sky.position.y = camera.position.y;
      // Victory (D4): the wave breaks below the shelter — the level sinks and the crest collapses in spray once.
      const won = p.phase === "won";
      winT = won ? Math.min(1, winT + dt / 1.2) : 0;
      if (!won) winBurst = false;
      if (won && !winBurst) {
        winBurst = true;
        if (!reducedMotion) {
          for (let i = 0; i < 10; i++) {
            tmp.set(worldX(0.05 + 0.1 * i), level + 0.2, FRONT_Z);
            sparkles.emit(tmp, { count: Math.round(10 * particleScale) + 3, color: i % 2 ? "#e0f7ff" : "#ffffff", speed: 4.2, life: 1.2, gravity: 6, size: 0.32, direction: UP, directionality: 0.5, spread: 0.8 });
          }
        }
      }
      const targetLevel = won ? Math.min(target.level, worldY(0.3)) : target.level;
      // Smoothly follow the game state (≈ 0.4 s to settle: the D4 drop / surge is visible within half a second).
      level = damp(level, targetLevel, 7, dt);
      px = damp(px, target.px, 12, dt);
      sx = damp(sx, target.sx, 4, dt);
      const fill = clamp01((level + HALF_H) / (2 * HALF_H));
      // A közeledő szökőár: a víz magasságával (és győzelemkor visszahúzódva) közelebb és magasabb.
      const danger = won ? 0 : clamp01((fill - 0.15) / 0.6);
      waveUniforms.uTime.value = t;
      waveUniforms.uDanger.value = damp(waveUniforms.uDanger.value, danger, 2, dt);
      const dg = waveUniforms.uDanger.value;
      const dz = THREE.MathUtils.lerp(160, 60, dg);
      // A taraj a kép 52 %-ától (távol) a 74 %-áig (közel) ér fel — a teteje és a habja mindig látszik, az ég nem tűnik el.
      const wallTop = worldY(THREE.MathUtils.lerp(0.52, 0.74, dg), -dz);
      const wallBottom = worldY(0.05, -dz);
      const wallH = Math.max(1, wallTop - wallBottom);
      const span = hw * 2.6 * ((CAM_DIST + dz) / CAM_DIST);
      waveWall.scale.set(span, wallH, 1);
      waveWall.position.set(0, wallBottom + wallH / 2, -dz);
      const amp = 0.14 + 0.16 * fill + flash * 0.08;
      waterUniforms.uAmp.value = amp;
      waterUniforms.uLevel.value = level;
      waterUniforms.uTime.value = t;

      // Correct answer → the water drops: a splash of glitter along the surface.
      if (target.level < lastTargetLevel - 0.25 && !reducedMotion) {
        for (let i = 0; i < 6; i++) {
          tmp.set(worldX(0.1 + 0.16 * i + Math.random() * 0.08), target.level + 0.1, FRONT_Z - 0.2);
          sparkles.emit(tmp, { count: Math.round(6 * particleScale) + 2, color: i % 2 ? "#a5f3fc" : "#ffffff", speed: 3, life: 0.9, gravity: 5, size: 0.28, direction: UP, directionality: 0.6, spread: 0.6 });
        }
      }
      // Wrong answer / timeout → the water jumps up (D4): a dark, heavy splash and a short flash (none with reduced motion).
      if (target.level > lastTargetLevel + 0.25 && !won) {
        if (!reducedMotion) {
          flash = Math.max(flash, 0.45);
          for (let i = 0; i < 5; i++) {
            tmp.set(worldX(0.08 + 0.2 * i + Math.random() * 0.06), level + 0.15, FRONT_Z);
            sparkles.emit(tmp, { count: Math.round(7 * particleScale) + 2, color: i % 2 ? "#0ea5e9" : "#bae6fd", speed: 3.6, life: 0.8, gravity: 8, size: 0.3, direction: UP, directionality: 0.7, spread: 0.5 });
          }
        }
      }
      lastTargetLevel = target.level;
      // The shelter's flag waves (still with reduced motion).
      shelter.flag.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * 3.1) * 0.35;

      // Storm flash + lightning bolt on the rising edge.
      if (p.stormFlash && !prevStorm) {
        flash = reducedMotion ? 0.35 : 1;
        if (!reducedMotion) {
          makeBolt();
          bolt.visible = true;
        }
      }
      prevStorm = p.stormFlash;
      flash = Math.max(0, flash - dt * 3.2);
      skyU.flash.value = flash * 0.55;
      waterUniforms.uFlash.value = flash;
      hemi.intensity = 1.1 + flash * 2.2;
      boltMat.opacity = Math.min(1, flash * 1.6);
      if (flash <= 0) bolt.visible = false;

      // Player on the surfboard
      const kx = worldX(px);
      const surfaceAt = (x: number, z: number) => level + waveHeight(x, z, t, amp);
      // Sodródó törmelék: a hullámon ringatózva, lassan sodródva (díszlet, nem akadály — D2-b).
      for (const d of debris) {
        if (!reducedMotion) d.fx += d.speed * dt;
        if (d.fx > 1.05) d.fx = -0.05;
        if (d.fx < -0.05) d.fx = 1.05;
        const dx = worldX(d.fx, -1.2);
        d.obj.position.set(dx, surfaceAt(dx, FRONT_Z - 1.2) + 0.05, FRONT_Z - 1.2);
        d.obj.rotation.z = Math.atan(waveSlopeX(dx, FRONT_Z - 1.2, t, amp)) + (reducedMotion ? 0 : Math.sin(elapsed * 1.3 + d.phase) * 0.12);
        d.obj.rotation.y = d.phase;
      }
      const ky = surfaceAt(kx, PLAYER_Z);
      if (dt > 0) vx = damp(vx, (kx - prevKidX) / dt, 10, dt);
      prevKidX = kx;
      const slope = waveSlopeX(kx, PLAYER_Z, t, amp);
      leanZ = damp(leanZ, THREE.MathUtils.clamp(-vx * 0.05, -0.32, 0.32), 8, dt);
      turnY = damp(turnY, THREE.MathUtils.clamp(vx * 0.07, -0.55, 0.55), 6, dt);
      // S9 ride cycle: the faster the board, the quicker and bigger the pump of legs and arms.
      const speed = Math.abs(vx);
      const effort = Math.min(1, speed / 6) + (p.sprinting && playing ? 0.35 : 0);
      ridePhase += dt * (2.6 + effort * 7);
      const swing = Math.sin(ridePhase);
      const bob = Math.sin(ridePhase * 2) * (0.02 + 0.025 * effort) * motionK;
      kid.group.position.set(kx, ky + 0.035 * kidScale, PLAYER_Z);
      if (winT > 0) {
        // Victory: the rider climbs into the shelter (eased), above the breaking wave.
        const e = winT * winT * (3 - 2 * winT);
        kid.group.position.x = THREE.MathUtils.lerp(kx, shelter.group.position.x - 0.9 * kidScale, e);
        kid.group.position.y = THREE.MathUtils.lerp(ky, shelter.group.position.y, e);
      }
      kid.group.rotation.set(0, turnY, Math.atan(slope) * 0.8);
      kid.rider.rotation.z = leanZ;
      const crouch = p.sprinting && playing ? 0.9 : 1;
      kid.rider.scale.y = damp(kid.rider.scale.y, crouch - Math.abs(swing) * 0.04 * effort * motionK, 10, dt);
      kid.rider.position.y = 0.05 + bob;
      const armSwing = swing * (0.18 + 0.32 * effort) * motionK;
      kid.armL.rotation.z = -1.05 - armSwing + leanZ;
      kid.armR.rotation.z = 1.05 - armSwing + leanZ;
      const legSwing = swing * (0.08 + 0.26 * effort) * motionK;
      kid.legL.rotation.z = -0.06 + legSwing;
      kid.legR.rotation.z = 0.06 + legSwing;
      kid.head.rotation.z = Math.sin(elapsed * 1.7) * 0.06 * motionK;

      // S9: every pump kicks a puff of spray off the board tail (the surfer's "footprints").
      const pumpSign = swing >= 0 ? 1 : -1;
      if (pumpSign !== prevPumpSign) {
        prevPumpSign = pumpSign;
        if (!reducedMotion && playing && speed > 0.6) {
          const dir = Math.sign(vx) || 1;
          tmp.set(kx - dir * 0.5 * kidScale, ky + 0.02 * kidScale, PLAYER_Z + 0.08);
          sparkles.emit(tmp, { count: Math.max(1, Math.round(5 * particleScale)), color: "#e0f7ff", speed: 1.6, life: 0.55, gravity: 4, size: 0.16 * kidScale + 0.05, direction: sprayDir.set(-dir, 0.7, 0.1), directionality: 0.4, spread: 0.5 });
        }
      }

      // S9: spray blown off the wave front (≈ 60 × particleScale per second along the crest).
      if (!reducedMotion && playing) {
        frontSprayAcc += dt * 60 * particleScale;
        while (frontSprayAcc >= 1) {
          frontSprayAcc -= 1;
          const fx = Math.random();
          const wx = worldX(fx);
          tmp.set(wx, surfaceAt(wx, FRONT_Z) + 0.05, FRONT_Z + 0.15);
          sparkles.emit(tmp, { count: 1, color: Math.random() < 0.6 ? "#ffffff" : "#c7f4ff", speed: 1.3 + Math.random() * 1.4, life: 0.75, gravity: 3.2, size: 0.14 + Math.random() * 0.12, direction: UP, directionality: 0.75, spread: 0.4 });
        }
      }

      // Spray behind the board while riding.
      if (!reducedMotion && playing && speed > 0.4) {
        sprayAcc += dt * Math.min(60, speed * 7 + (p.sprinting ? 20 : 0)) * particleScale;
        const dir = Math.sign(vx);
        while (sprayAcc >= 1) {
          sprayAcc -= 1;
          tmp.set(kx - dir * 0.55 * kidScale, ky + 0.05 * kidScale, PLAYER_Z + 0.05);
          sparkles.emit(tmp, { count: 1, color: Math.random() < 0.5 ? "#ffffff" : "#bff4ff", speed: 2.4, life: 0.6, gravity: 7, size: 0.2 * kidScale + 0.06, direction: sprayDir.set(-dir, 1.1, 0.2), directionality: 0.7, spread: 0.15 });
        }
      }

      // Safe zone
      const zx = worldX(sx);
      const halfW = Math.abs(worldX(sx + 0.08) - zx);
      const inZone = Math.abs(px - sx) * 100 <= 9;
      const pulse = reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(elapsed * (inZone ? 7 : 3.4));
      for (const [b, x] of [[buoyL, zx - halfW], [buoyR, zx + halfW]] as const) {
        const by = surfaceAt(x, ZONE_Z);
        b.group.position.set(x, by - 0.06, ZONE_Z);
        b.group.rotation.z = Math.atan(waveSlopeX(x, ZONE_Z, t, amp)) * 0.9 + (reducedMotion ? 0 : Math.sin(elapsed * 2 + x) * 0.05);
        b.light.emissiveIntensity = 1.6 + pulse * (inZone ? 2.4 : 1.2);
        (b.glow.material as THREE.SpriteMaterial).opacity = 0.45 + pulse * 0.45;
      }
      for (let i = 0; i < FLOATS; i++) {
        const f = (i + 1) / (FLOATS + 1);
        const x = zx - halfW + 2 * halfW * f;
        dummy.position.set(x, surfaceAt(x, ZONE_Z + 0.05) + 0.02, ZONE_Z + 0.05);
        dummy.updateMatrix();
        floats.setMatrixAt(i, dummy.matrix);
      }
      floats.instanceMatrix.needsUpdate = true;
      const bandPos = band.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bandPos.count; i++) {
        const bx = zx + bandBase[i * 3] * halfW * 2.3;
        const bz = ZONE_Z + bandBase[i * 3 + 2] * 1.6;
        bandPos.setXYZ(i, bx, surfaceAt(bx, bz) + 0.04, bz);
      }
      bandPos.needsUpdate = true;
      bandMat.opacity = 0.35 + pulse * (inZone ? 0.4 : 0.2);
      const beamH = 2.6 + (inZone ? 0.8 : 0);
      beam.scale.set(halfW * 2.4, beamH, 1);
      beam.position.set(zx, level + beamH / 2 - 0.1, ZONE_Z - 0.4);
      beamMat.opacity = 0.16 + pulse * (inZone ? 0.26 : 0.12);
      if (inZone && playing && !reducedMotion) {
        zoneAcc += dt * 10 * particleScale;
        while (zoneAcc >= 1) {
          zoneAcc -= 1;
          tmp.set(zx + (Math.random() * 2 - 1) * halfW, level + 0.2, ZONE_Z);
          sparkles.emit(tmp, { count: 1, color: "#86efac", speed: 1.2, life: 1.1, gravity: -1.5, size: 0.22, direction: UP, directionality: 0.8, spread: 0.3 });
        }
      }

      // Scenery motion
      if (!reducedMotion) {
        for (const c of clouds) {
          c.fx += (c.speed * dt) / (hw * 12);
          if (c.fx > 1.25) c.fx = -0.25;
        }
        const lampPulse = 0.6 + 0.25 * Math.sin(elapsed * 2.2);
        (lighthouse.lamp.material as THREE.SpriteMaterial).opacity = lampPulse;
      }
      for (const c of clouds) c.m.position.set(worldX(c.fx, -c.zz), worldY(c.fy, -c.zz), -c.zz);

      if (rainCount > 0) {
        const slant = 0.18;
        for (let i = 0; i < rainCount; i++) {
          let y = rainPos[i * 6 + 1] - rainSpeed[i] * dt;
          const z = rainPos[i * 6 + 2];
          const s = (CAM_DIST - z) / CAM_DIST;
          if (y < EYE - HALF_FULL * s - 1) {
            spawnDrop(i, false);
            y = rainPos[i * 6 + 1];
          }
          const x = rainPos[i * 6] - slant * rainSpeed[i] * dt;
          rainPos[i * 6] = x;
          rainPos[i * 6 + 1] = y;
          rainPos[i * 6 + 3] = x + slant * 0.55;
          rainPos[i * 6 + 4] = y + 0.55;
          rainPos[i * 6 + 5] = z;
        }
        rainGeo.attributes.position.needsUpdate = true;
        rainMat.opacity = 0.3 + flash * 0.3;
      }

      sparkles.update(dt);
    },
    dispose() {
      disposed = true;
      sparkles.dispose();
      env?.dispose();
    },
  };
  void loadModels();
  return controller;
}

export default function TsunamiScene3D(props: TsunamiScene3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const { supported } = useThreeScene(canvasRef, (ctx) => setupTsunami(ctx, propsRef, props.light), [props.light], {
    exposure: 1.05,
    shadows: false,
  });
  const { onSupportedChange } = props;
  useEffect(() => {
    onSupportedChange?.(supported);
  }, [supported, onSupportedChange]);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      style={supported === false ? { display: "none" } : undefined}
    />
  );
}
