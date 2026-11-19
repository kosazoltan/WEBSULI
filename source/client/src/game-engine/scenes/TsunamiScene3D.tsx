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
  /** A jelenet írja vissza képkockánként: a ténylegesen alkalmazott (simított) eltolás képpontban — a mérésekhez. */
  shownShiftPx?: number;
  /**
   * A jelenet írja vissza (néhány képkockánként): a figura TÉNYLEGESEN kirajzolt képernyő-doboza a vászon bal felső sarkától,
   * képpontban (a vetített befoglaló doboz — fej teteje, deszka alja, karok). A kép-eltolás benne van.
   */
  figureBoxPx?: { left: number; top: number; right: number; bottom: number };
  /**
   * A figura kiterjedése a talppontjához (a vízvonal-pont vetületéhez) képest, képpontban: fölötte (fej teteje), alatta, balra,
   * jobbra. A lap ezzel számolja a takarást a mag állapotából (nem késik a vízszint-váltásnál).
   */
  figureExtentPx?: { up: number; down: number; left: number; right: number };
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
/** A vágott vízfal mögötti mélyvíz-háttér síkja (a szikla-hegy mögött, az öböl elején). */
const BACK_FACE_Z = -7.6;
const FOG_NEAR = 140;
const FOG_FAR = 620;

/*
 * Telt, tiszta színek (terv 7.4, „kifakulás”): azúr ég a barack helyett — a régi, világos barack ég-alj és köd az ACES
 * tónusleképezéssel együtt az egész képet fehéres-pasztellre húzta. A veszéllyel (magas víz) az ég mélyül, nem szürkül.
 */
const SKY_TOP = "#1560d8";
const SKY_HORIZON = "#8fd9ff";
const SKY_BOTTOM = "#c4ecff";
const STORM_TOP = "#1b2f86";
const STORM_HORIZON = "#5f9fd6";
/** A szikla-hegy (a menedék alatt) tengelyének mélysége és a Blender-modell arányai (build_all.py `cliff`). */
const CLIFF_Z = -3.4;
const CLIFF_HEIGHT = 15;
/** A hegy kiszélesedése a tetőtől a tövéig (a Blender-szkript `CLIFF_FLARE` értékével egyezik). */
const CLIFF_FLARE = 1.3;
/** A hegy sugara (modell-egységben, x irányban) a tető alatt `below` egységgel. */
const cliffRadius = (below: number) => (1.6 + CLIFF_FLARE * Math.pow(clamp01(below / CLIFF_HEIGHT), 0.85)) * 1.12;

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
  // Szelíd part (a régi 3,2-es oldal-emelés és a nagy hullámzás kúp-szerű dombokat adott; a dombok most Blender-modellek).
  const hills = 0.4 + 1.9 * sides + bumps * (0.22 + 0.2 * sides);
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
    float hills = 0.4 + 1.9 * sides + bumps * (0.22 + 0.2 * sides);
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
  const sand = new THREE.Color("#f6d48a");
  const wetSand = new THREE.Color("#d9aa62");
  const grassA = new THREE.Color("#7fdc55");
  const grassB = new THREE.Color("#4fc04d");
  const forest = new THREE.Color("#2f9a4c");
  const rock = new THREE.Color("#9a8f84");
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
      else if (y < 1.2) c.copy(g2);
      else if (y < 2.6) c.copy(g2).lerp(forest, smooth(1.2, 2.2, y));
      else c.copy(forest).lerp(rock, smooth(2.8, 3.6, y));
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
    const s = new THREE.SphereGeometry(r * (0.9 + 0.2 * Math.sin(seed * 3.1 + i)), 10, 7);
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

/** Egyszínű (csúcs-színes) geometria a közös díszlet-anyaghoz; `lo`–`hi`: függőleges fényesség-átmenet alulról felfelé. */
function tinted(src: THREE.BufferGeometry, color: THREE.ColorRepresentation, lo = 1, hi = 1): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src;
  if (g !== src) src.dispose();
  g.deleteAttribute("uv");
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Color(color);
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y;
  const span = Math.max(1e-6, g.boundingBox!.max.y - y0);
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = lo + (hi - lo) * ((pos.getY(i) - y0) / span);
    arr[i * 3] = c.r * f;
    arr[i * 3 + 1] = c.g * f;
    arr[i * 3 + 2] = c.b * f;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Determinisztikus „véletlen” [0, 1) a stégek szabálytalanságához (nem `Math.random`: minden építés ugyanazt adja). */
const jag = (i: number, k: number) => {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Egy stég-szint: a teteje (% fentről) és a bal (szabad) vége (világ-x). A jobb vége a hegyre támaszkodik. */
type PierLevel = { top: number; left: number; /** false: nincs vízig érő cölöp — a móló ferde támasszal a sziklába kapaszkodik. */ stilts?: boolean };

/**
 * A stégek (csiszoló kör 2. pont: ne hassanak állványzatnak): lépcsőzetes, a hegy felé egyre rövidebb mólók, kissé
 * szabálytalan deszkákkal (eltérő hossz, enyhe dőlés, színárnyalat), ferde, eltérő vastagságú cölöpökkel és a cölöpök közt
 * belógó kötélkorláttal. Minden szint és cölöp EGY összevont, csúcs-színes geometria (egy rajzolási hívás); a cölöpök a víz alá
 * nyúlnak (az áttetsző vízfal mögött átderengenek).
 */
function buildPlatforms(
  levels: readonly PierLevel[],
  xRightAt: (y: number) => number,
  yAtTopPct: (top: number) => number,
  thick: number,
  material: THREE.Material,
): THREE.Mesh {
  const depth = 1.5;
  const parts: THREE.BufferGeometry[] = [];
  const boards = ["#dba05e", "#c78743", "#e6b274", "#cf9452"];
  const yBottom = -HALF_FULL * 1.6;
  levels.forEach(({ top, left, stilts = true }, li) => {
    const cy = yAtTopPct(top) - thick / 2;
    const xRight = xRightAt(cy);
    const len = Math.max(1, xRight - left);
    // Deszkák: három sor, a bal végük szabálytalan (eltérő hossz), enyhe dőlés és színárnyalat.
    for (let i = 0; i < 3; i++) {
      const ragged = (jag(li, i) - 0.3) * 0.7;
      const l = Math.max(0.8, len - ragged);
      const g = new RoundedBoxGeometry(l, thick, depth / 3 - 0.07, 1, Math.min(0.06, thick * 0.3));
      g.rotateZ((jag(li, i + 7) - 0.5) * 0.03);
      g.rotateY((jag(li, i + 13) - 0.5) * 0.04);
      g.translate(xRight - l / 2, cy + (jag(li, i + 3) - 0.5) * 0.05, PLANK_Z - depth / 2 + (depth / 3) * (i + 0.5));
      parts.push(tinted(g, boards[(li + i) % boards.length]!, 0.8, 1.1));
    }
    // Cölöpök: a szabad végen és ~6 egységenként, szabálytalan helyen, vastagságban és dőléssel; elöl korlátoszlopként a deszka
    // fölé nyúlnak, és köztük kötél lóg.
    const count = Math.max(1, Math.round(len / 6));
    const railY = cy + thick / 2 + 0.55;
    const railTops: THREE.Vector3[] = [];
    for (let k = 0; k <= count; k++) {
      const f = k / count;
      if (f > 0.97 && count > 0) break; // a hegy felőli vég a sziklára támaszkodik
      const px = left + 0.3 + f * (len - 0.6) + (jag(li, k + 21) - 0.5) * 0.5;
      const r = 0.075 + jag(li, k + 31) * 0.045;
      const lean = (jag(li, k + 41) - 0.5) * 0.08;
      for (const side of [-1, 1]) {
        const z = PLANK_Z + side * (depth / 2 + 0.03);
        const postTop = side > 0 ? railY : cy + thick / 2 + 0.12;
        if (!stilts && side < 0) continue;
        const bottom = stilts ? yBottom : cy - thick * 0.4;
        const h = postTop - bottom;
        const post = new THREE.CylinderGeometry(r * 0.85, r * 1.1, h, 7, 1);
        post.rotateZ(stilts ? lean : 0);
        post.translate(px, (postTop + bottom) / 2, z);
        parts.push(tinted(post, side > 0 ? "#8a5730" : "#7a4a26", 0.55, 1.15));
        if (side > 0) railTops.push(new THREE.Vector3(stilts ? px - Math.sin(lean) * h * 0.5 : px, postTop, z));
      }
    }
    // Cölöp nélküli móló: a szabad végétől ferde támasz fut le a sziklába (a hegy felé).
    if (!stilts) {
      const a = new THREE.Vector3(left + 0.35, cy - thick * 0.45, PLANK_Z);
      // A támasz alsó vége a szikla oldalába ér (a móló jobb vége a szikla széle; onnan kissé beljebb és lejjebb).
      const b = new THREE.Vector3(xRight + 0.35, cy - Math.min(2.6, Math.max(1.2, (xRight - left) * 0.45)), PLANK_Z);
      const d = b.clone().sub(a);
      const strut = new THREE.CylinderGeometry(0.08, 0.1, d.length(), 7, 1);
      strut.rotateZ(-Math.atan2(d.x, d.y));
      strut.translate((a.x + b.x) / 2, (a.y + b.y) / 2, a.z);
      parts.push(tinted(strut, "#7a4a26", 0.7, 1.1));
    }
    // Kötélkorlát: belógó ív (5 szakasz) a szomszédos elülső korlátoszlopok között.
    for (let k = 0; k + 1 < railTops.length; k++) {
      const a = railTops[k]!;
      const b = railTops[k + 1]!;
      const seg = 5;
      for (let j = 0; j < seg; j++) {
        const t0 = j / seg;
        const t1 = (j + 1) / seg;
        const p0 = new THREE.Vector3().lerpVectors(a, b, t0);
        const p1 = new THREE.Vector3().lerpVectors(a, b, t1);
        p0.y -= Math.sin(Math.PI * t0) * 0.22;
        p1.y -= Math.sin(Math.PI * t1) * 0.22;
        const d = p1.clone().sub(p0);
        const rope = new THREE.CylinderGeometry(0.028, 0.028, d.length(), 5, 1);
        rope.rotateZ(-Math.atan2(d.x, d.y));
        rope.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
        parts.push(tinted(rope, "#e9d3a4"));
      }
    }
  });
  const merged = mergeGeometries(parts) ?? new THREE.BoxGeometry(4, thick, depth);
  parts.forEach((g) => g.dispose());
  const m = new THREE.Mesh(merged, material);
  m.frustumCulled = false;
  return m;
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

  // Semleges tónusleképezés (terv 7.4): az ACES a világos, telt játékszíneket fehér felé húzta — ez volt a „kifakulás” egyik oka.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const fogColor = new THREE.Color(SKY_HORIZON);
  const fog = new THREE.Fog(fogColor, FOG_NEAR, FOG_FAR);
  // A köd, az ég alja és a víz távoli színe UGYANAZ a színobjektum (a hangulattal együtt változik).
  fog.color = fogColor;
  scene.fog = fog;

  // Sky + sun
  const sky = createGradientSky({
    top: SKY_TOP,
    horizon: SKY_HORIZON,
    bottom: SKY_BOTTOM,
    sunDirection: new THREE.Vector3(-0.6, 0.35, -1),
    sunColor: "#fff3c8",
    sunSize: 0.03,
    radius: 600,
  });
  sky.position.copy(camera.position);
  scene.add(sky);
  const skyU = sky.material.uniforms;
  (skyU.sunColor.value as THREE.Color).multiplyScalar(budget.bloom ? 0.4 : 0.7);
  const calmTop = new THREE.Color(SKY_TOP);
  const calmHorizon = new THREE.Color(SKY_HORIZON);
  const stormTop = new THREE.Color(STORM_TOP);
  const stormHorizon = new THREE.Color(STORM_HORIZON);

  // Lights: a warm key from the front-left so the rock facets read, a sky/ground fill.
  const hemi = new THREE.HemisphereLight("#d8efff", "#6f9a58", 1.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#fff0d2", 2.5);
  key.position.set(-7, 11, 13);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#bfe8ff", 0.6);
  rim.position.set(8, 6, -10);
  scene.add(rim);

  /*
   * A díszlet EGY közös anyagot használ, a szín csúcs-színből jön (a Blender-szkript festi) — modellenként egy rajzolási
   * hívás, példányosítva. Telefonos (nem „high”) szinten Lambert.
   */
  const propMat: THREE.Material = lambertDecor
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });

  // Clouds: one instanced mesh
  const cloudMat = lambertDecor
    ? new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#a9cdfa", emissiveIntensity: 0.5, fog: false })
    : new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#a9cdfa", emissiveIntensity: 0.5, roughness: 1, fog: false });
  const cloudCount = lean ? 4 : 7;
  const cloudMesh = new THREE.InstancedMesh(buildCloudGeometry(1), cloudMat, cloudCount);
  cloudMesh.frustumCulled = false;
  scene.add(cloudMesh);
  const clouds = Array.from({ length: cloudCount }, (_, i) => ({
    zz: 130 + (i % 3) * 25,
    s: 2.0 + ((i * 37) % 10) / 9,
    fx: (i + 0.35) / cloudCount,
    fy: 0.8 + ((i * 53) % 13) / 100,
    speed: 0.6 + (i % 3) * 0.35,
  }));

  // Terrain (rebuilt on resize: its shape is anchored to the screen width)
  const terrainMat = lambertDecor
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const terrain = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
  scene.add(terrain);

  /*
   * Látvány C irány (terv 7.2, 7.4): a Blender-szkriptből gyártott, Meshopt-tömörített díszlet és figura (`/models/szokoar/`).
   * A menü alatt töltődik; hiba / hiány esetén a kódból épített (primitív) díszlet és figura a tartalék.
   */
  type Spot = { model: string; u: number; zz: number; s: number; rotY?: number; lift?: number; tint?: string; cliff?: [number, number] };
  const SPOTS: Spot[] = [
    // Dombok (hátul a távoliak kékes árnyalattal — levegő-távlat).
    { model: "hill", u: -1.08, zz: 15, s: 3.4, rotY: 0.4 },
    { model: "hill", u: -0.86, zz: 31, s: 4.6, rotY: 1.3 },
    { model: "hill", u: 1.0, zz: 34, s: 5.0, rotY: 2.2 },
    { model: "hill", u: -0.7, zz: 62, s: 7, rotY: 3.6, tint: "#d5e6f7" },
    { model: "hill", u: 0.66, zz: 58, s: 6.5, rotY: 5.1, tint: "#d5e6f7" },
    { model: "hill", u: -1.3, zz: 92, s: 11, rotY: 0.9, tint: "#b9d4f2" },
    { model: "hill", u: 1.32, zz: 98, s: 12, rotY: 4.2, tint: "#b9d4f2" },
    // Cölöpházak a parton (magas víznél elönti őket a víz).
    { model: "hut_a", u: -0.62, zz: 12.5, s: 1.3, rotY: 0.3 },
    { model: "hut_b", u: -0.88, zz: 18, s: 1.35, rotY: -0.2 },
    { model: "hut_b", u: -0.42, zz: 25, s: 1.25, rotY: 0.15 },
    { model: "hut_a", u: 0.62, zz: 23, s: 1.35, rotY: -0.3 },
    { model: "palm_a", u: -0.4, zz: 9.5, s: 1.5, rotY: 0.2 },
    { model: "palm_b", u: -0.78, zz: 10.5, s: 1.45, rotY: 1.9 },
    { model: "palm_a", u: -0.98, zz: 13, s: 1.65, rotY: 2.4 },
    { model: "palm_b", u: 0.48, zz: 14, s: 1.4, rotY: 0.8 },
    { model: "palm_a", u: 0.72, zz: 19, s: 1.55, rotY: 4.1 },
    { model: "rock_a", u: -0.55, zz: 8, s: 1.1, rotY: 0.7, lift: -0.35 },
    { model: "rock_b", u: -0.28, zz: 8.6, s: 0.9, rotY: 2.1, lift: -0.25 },
    { model: "rock_a", u: -0.92, zz: 9, s: 1.35, rotY: 4.0, lift: -0.4 },
    { model: "rock_b", u: 0.4, zz: 10, s: 1.0, rotY: 1.2, lift: -0.25 },
    { model: "bush", u: -0.7, zz: 14.5, s: 1.3 },
    { model: "bush", u: -0.5, zz: 20, s: 1.2, rotY: 1.5 },
    { model: "bush", u: 0.55, zz: 17, s: 1.2, rotY: 0.6 },
    // A szikla-hegy tetején, a menedék mellett.
    { model: "palm_b", u: 0, zz: 0, s: 0.62, rotY: 2.6, cliff: [1.05, -0.55] },
    { model: "bush", u: 0, zz: 0, s: 0.5, rotY: 0.4, cliff: [0.75, 0.75] },
    { model: "rock_b", u: 0, zz: 0, s: 0.45, rotY: 1.1, lift: -0.08, cliff: [-1.25, 0.7] },
  ];
  // Gyenge gépen kevesebb díszlet (a legtávolabbi dombok és minden harmadik apró elem nélkül).
  const spots = lean ? SPOTS.filter((s, i) => (s.model === "hill" ? s.zz < 90 : !!s.cliff || i % 3 !== 2)) : SPOTS;
  type Batch = { mesh: THREE.InstancedMesh; items: Spot[] };
  const batches: Batch[] = [];
  const palmBatches: Batch[] = [];
  let cliff: THREE.Mesh | null = null;
  let cliffScale = 1;
  const cliffTop = new THREE.Vector3(0, 0, CLIFF_Z);
  let lampGlow: THREE.Sprite | null = null;
  // Sodródó törmelék (díszlet, nem akadály — D2-b): elöl, az öbölben és távolabb, a hullámfal előtt.
  type Drift = { model: string; z: number; fx: number; speed: number; phase: number; s: number };
  const DRIFT: Drift[] = [
    { model: "debris_plank", z: FRONT_Z - 1.2, fx: 0.12, speed: 0.008, phase: 0, s: 0.55 },
    { model: "debris_barrel", z: FRONT_Z - 1.3, fx: 0.72, speed: -0.007, phase: 1.7, s: 0.55 },
    { model: "debris_log", z: -5, fx: 0.3, speed: 0.011, phase: 3.4, s: 0.9 },
    { model: "debris_crate", z: -7, fx: 0.55, speed: -0.009, phase: 5.1, s: 0.95 },
    { model: "debris_plank", z: -13, fx: 0.42, speed: 0.012, phase: 2.2, s: 1.3 },
    { model: "debris_log", z: -22, fx: 0.2, speed: -0.01, phase: 4.3, s: 1.8 },
    { model: "debris_barrel", z: -30, fx: 0.5, speed: 0.013, phase: 0.9, s: 2.1 },
    { model: "debris_crate", z: FRONT_Z - 1.1, fx: 0.4, speed: 0.006, phase: 2.9, s: 0.5 },
  ];
  const drifts: { mesh: THREE.InstancedMesh; items: Drift[] }[] = [];

  // A kódból épített tartalék-díszlet (csak ha a modellek nem töltődnek be).
  const windowMat = new THREE.MeshStandardMaterial({ color: "#ffe9a8", emissive: "#ffc94a", emissiveIntensity: 1.6 });
  type Decor = { obj: THREE.Object3D; u: number; zz: number; lift: number };
  const decor: Decor[] = [];
  const addDecor = (obj: THREE.Object3D, u: number, zz: number, scale: number, lift = -0.05, rotY = 0) => {
    obj.scale.setScalar(scale);
    obj.rotation.y = rotY;
    scene.add(obj);
    decor.push({ obj, u, zz, lift });
  };
  const buildFallbackDecor = () => {
    addDecor(buildHouse("#ffd6a5", "#e5484d", windowMat), -0.74, 24, 1.15, -0.1, 0.25);
    addDecor(buildHouse("#bde0fe", "#2563eb", windowMat), -0.46, 30, 1.1, -0.1, -0.2);
    addDecor(buildHouse("#ffc8dd", "#7c3aed", windowMat), 0.5, 24, 1.1, -0.1, 0.15);
    addDecor(buildPalm(), -0.3, 15, 1.25, -0.05, 0);
    addDecor(buildPalm(), 0.34, 14, 1.2, -0.05, 1.2);
    if (!lean) {
      addDecor(buildTree("#4cbf5f"), -0.6, 38, 1.4);
      addDecor(buildTree("#5ccc62"), 0.62, 44, 1.5);
    }
    layout();
  };

  let disposed = false;
  /** A modellek a jelenetbe kerültek (utána egy hiba már nem építhet melléjük tartalék-díszletet). */
  let applied = false;
  /*
   * Minden shader-program a menü alatt forduljon le, és a pufferek is töltődjenek fel (ne menet közben). Csiszoló kör 4. pont,
   * profillal mérve: a `renderer.compile` csak a LÁTHATÓ objektumokat fordítja; a villám (`bolt`) láthatatlanul indul, így a
   * programja az első villámláskor, menet közben fordult — a GPU-folyamatban 350–500 ms-os megakadás, a főszál közben tétlen.
   * Ezért a fordítás idejére a villám is látható (érvényes geometriával, átlátszóan), utána a menü alatt még három bemelegítő
   * képkocka fut.
   */
  const prewarmPrograms = () => {
    const wasVisible = scene.visible;
    scene.visible = true;
    makeBolt();
    bolt.visible = true;
    renderer.compile(scene, camera);
    bolt.visible = false;
    scene.visible = wasVisible;
    warmFrames = 0;
  };
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
  const loadModels = async () => {
    try {
      const res = await fetch("/models/szokoar/manifest.json");
      if (!res.ok) throw new Error("manifest");
      const manifest = (await res.json()) as { props?: string; kid?: string };
      if (!manifest.props) throw new Error("manifest");
      if (disposed) return;
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const files = [manifest.props, manifest.kid].filter((f): f is string => typeof f === "string");
      const gltfs: GLTF[] = await Promise.all(files.map((f) => loader.loadAsync(`/models/szokoar/${f}`)));
      if (disposed) return;
      // Modell → geometria (a gyökér forgatása / méretezése és a háló saját transzformációja beégetve; a GLB anyaga nem kell).
      const geoCache = new Map<string, THREE.BufferGeometry | null>();
      const geo = (name: string): THREE.BufferGeometry | null => {
        if (geoCache.has(name)) return geoCache.get(name)!;
        let out: THREE.BufferGeometry | null = null;
        for (const g of gltfs) {
          const root = g.scene.getObjectByName(name);
          let src: THREE.Mesh | null = null;
          root?.traverse((o) => {
            if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
          });
          if (!root || !src) continue;
          const m = src as THREE.Mesh;
          m.updateMatrix();
          const mat = new THREE.Matrix4().compose(new THREE.Vector3(), root.quaternion, root.scale);
          if (m !== root) mat.multiply(m.matrix);
          out = m.geometry.clone().applyMatrix4(mat);
          out.deleteAttribute("uv");
          break;
        }
        geoCache.set(name, out);
        return out;
      };
      for (const g of gltfs) g.scene.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.());

      /*
       * Vak ellenőr K2 és KICSI 2 (2026-11-19): minden új háló előbb egy nem látható csoportba kerül, és a végleges jelenet
       * fényeivel / ködével, ASZINKRON fordul le (`compileAsync`, KHR_parallel_shader_compile) — így a menet közben érkező modellek
       * sem állítják meg a főszálat (mérve: 205–260 ms-os akadás). Utána egyetlen szinkron lépésben kerülnek a jelenetbe; ha ez
       * előtt hiba van, a jelenet érintetlen, és csak a tartalék-díszlet épül meg (nincs kettőzés).
       */
      const pending = new THREE.Group();
      const newBatches: Batch[] = [];
      const byModel = new Map<string, Spot[]>();
      for (const s of spots) byModel.set(s.model, [...(byModel.get(s.model) ?? []), s]);
      const tint = new THREE.Color();
      for (const [model, items] of Array.from(byModel)) {
        const g = geo(model);
        if (!g) continue;
        const mesh = new THREE.InstancedMesh(g, propMat, items.length);
        mesh.frustumCulled = false;
        items.forEach((s, i) => mesh.setColorAt(i, tint.set(s.tint ?? "#ffffff")));
        pending.add(mesh);
        newBatches.push({ mesh, items });
      }
      const cliffGeo = geo("cliff");
      const newCliff = cliffGeo ? new THREE.Mesh(cliffGeo, propMat) : null;
      if (newCliff) {
        newCliff.frustumCulled = false;
        pending.add(newCliff);
      }
      const lhGeo = geo("lighthouse");
      const lhMesh = lhGeo ? new THREE.Mesh(lhGeo, propMat) : null;
      if (lhMesh) pending.add(lhMesh);
      const newDrifts: { mesh: THREE.InstancedMesh; items: Drift[] }[] = [];
      const driftBy = new Map<string, Drift[]>();
      for (const d of lean ? DRIFT.filter((_, i) => i % 2 === 0) : DRIFT) driftBy.set(d.model, [...(driftBy.get(d.model) ?? []), d]);
      for (const [model, items] of Array.from(driftBy)) {
        const g = geo(model);
        if (!g) continue;
        const mesh = new THREE.InstancedMesh(g, propMat, items.length);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pending.add(mesh);
        newDrifts.push({ mesh, items });
      }
      const kidParts: [THREE.Object3D, string][] = [
        [kid.group, "kid_board"], [kid.rider, "kid_torso"], [kid.head, "kid_head"],
        [kid.armL, "kid_arm"], [kid.armR, "kid_arm"], [kid.legL, "kid_leg"], [kid.legR, "kid_leg"],
      ];
      const kidOk = kidParts.every(([, n]) => geo(n));
      // A villám programja is (láthatatlanul indul, a `compile` különben kihagyná).
      makeBolt();
      const boltProbe = new THREE.Mesh(bolt.geometry, boltMat);
      pending.add(boltProbe);
      const r = renderer as THREE.WebGLRenderer & { compileAsync?: (o: THREE.Object3D, c: THREE.Camera, t?: THREE.Scene) => Promise<unknown> };
      if (r.compileAsync) await r.compileAsync(pending, camera, scene);
      else renderer.compile(pending, camera, scene);
      pending.remove(boltProbe);
      if (disposed) return;
      // Egy szinkron lépésben a jelenetbe.
      for (const o of [...pending.children]) scene.add(o);
      for (const b of newBatches) {
        batches.push(b);
        if (b.items[0]?.model.startsWith("palm")) palmBatches.push(b);
      }
      drifts.push(...newDrifts);
      cliff = newCliff;
      if (lhMesh) {
        fitInto(shelter.group, lhMesh, 1.5);
        lampGlow = createGlowSprite("#ffd76a", 2.6, 0.8);
        lampGlow.position.set(0, 3.77, 0.35);
        lhMesh.add(lampGlow);
      }
      // A figura: a kódból épített részek helyére a Blender-modell kerül, ugyanazokra a forgáspontokra.
      if (kidOk) {
        for (const [holder, n] of kidParts) {
          for (const c of [...holder.children]) {
            const old = c as THREE.Mesh;
            if (!old.isMesh) continue;
            holder.remove(old);
            old.geometry.dispose();
          }
          holder.add(new THREE.Mesh(geo(n)!, propMat));
        }
      }
      applied = true;
      layout();
      prewarmPrograms();
    } catch {
      if (!disposed && !applied) {
        buildFallbackDecor();
        prewarmPrograms();
      }
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
    uShallow: { value: new THREE.Color("#16d2de") },
    uDeep: { value: new THREE.Color("#0a55c2") },
    uSkyTint: { value: new THREE.Color("#c9efff") },
    uFogColor: { value: fogColor },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.35, -1).normalize() },
    uSunColor: { value: new THREE.Color("#fff6d6") },
    uFoamW: { value: 0.16 },
    uFrontTop: { value: new THREE.Color("#22c9e8") },
    uFrontDeep: { value: new THREE.Color("#062f78") },
    /** A szikla-hegy tengelye (x, z), a tető magassága és a méretezése — a habgyűrűhöz. */
    uCliff: { value: new THREE.Vector4(0, CLIFF_Z, 0, 0) },
    /** A vágott vízfal síkja (elöl) / a mögötte álló mélyvíz-háttér síkja. */
    uFaceZ: { value: FRONT_Z },
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
      uniform vec4 uCliff;
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
        vec3 col = mix(uShallow, uDeep, smoothstep(4.0, 70.0, dist));
        // Élő felszín: lassan vándorló, világosabb és sötétebb sávok (a hullámhátak színe), nem egyszínű lap.
        float bands = sin(rp.x * 0.55 + rp.y * 0.9 + uTime * 0.7) * sin(rp.y * 0.37 - uTime * 0.45 + rp.x * 0.21);
        col *= 1.0 + 0.14 * bands;
        col = mix(col, uSkyTint, 0.02 + 0.2 * fres);
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(n, H), 0.0), 220.0);
        col += uSunColor * spec * 2.0;
        float sparkle = pow(max(dot(n, H), 0.0), 40.0) * 0.16;
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
        // Habgyűrű a szikla-hegy körül: a hegy sugara a vízszint magasságában (a Blender-modell profilja), lüktető szélességgel.
        float ct = clamp((uCliff.z - uLevel) / (${CLIFF_HEIGHT.toFixed(1)} * max(uCliff.w, 0.001)), 0.0, 1.0);
        float cr = uCliff.w * (1.6 + ${CLIFF_FLARE.toFixed(2)} * pow(ct, 0.85));
        float cd = length((rp - uCliff.xy) / vec2(1.12, 0.88)) - cr;
        float ring = (1.0 - smoothstep(0.0, 0.55 + 0.35 * grain + 0.15 * sin(uTime * 1.7), cd)) * step(0.001, uCliff.w);
        float foam = clamp(max(max(max(max(crest * 0.75, edge), shore * 0.9), steep * 0.6), ring * 0.92), 0.0, 1.0);
        col = mix(col, vec3(0.97, 0.995, 1.0), foam);
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

  /*
   * A vágott vízfal (a tenger keresztmetszete a néző felé) ÁTTETSZŐ: a víz alá került szikla-hegy, cölöpök és a figura lába
   * kéken átdereng rajta („akvárium”) — a víz emelkedése így a hegyen és a mólón is látszik. Mögötte, az öböl elején egy
   * átlátszatlan mélyvíz-háttér áll (ugyanaz a geometria, hátrébb tolva), hogy a víz alatt ne az ég látsszon.
   */
  const faceShader = (opaque: boolean) =>
    new THREE.ShaderMaterial({
      uniforms: opaque ? { ...waterUniforms, uFaceZ: { value: BACK_FACE_Z } } : waterUniforms,
      transparent: !opaque,
      depthWrite: opaque,
      vertexShader: /* glsl */ `
        ${GLSL_SHARED}
        uniform float uLevel;
        uniform float uFaceZ;
        attribute float aTop;
        varying vec3 vWorld;
        varying float vSurf;
        void main() {
          vec3 p = position;
          float k = (${CAM_DIST.toFixed(1)} - uFaceZ) / (${CAM_DIST.toFixed(1)} - ${FRONT_Z.toFixed(2)});
          p.x *= k;
          p.z = uFaceZ;
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
          vec3 col = mix(uFrontTop, uFrontDeep, smoothstep(0.0, 3.5, d) * 0.6 + smoothstep(3.5, 13.0, d) * 0.4);
          ${
            opaque
              ? "gl_FragColor = vec4(col * 0.82, 1.0);"
              : /* glsl */ `
          // Fénysávok a víz alatt (ferde, lassan vándorló) és fénytörés-háló a felszín közelében.
          float ray = sin((vWorld.x + vWorld.y * 0.55) * 0.9 + uTime * 0.35) * 0.5 + 0.5;
          ray *= sin((vWorld.x + vWorld.y * 0.55) * 2.3 - uTime * 0.22 + 1.7) * 0.5 + 0.5;
          col += vec3(0.25, 0.6, 0.7) * ray * exp(-d * 0.22) * 0.22;
          float c = sin(vWorld.x * 1.3 + uTime * 0.9 + sin(vWorld.y * 1.7 + uTime * 0.6) * 1.2)
                  * sin(vWorld.x * 0.7 - uTime * 0.5 + vWorld.y * 0.9 + sin(vWorld.x * 0.4) * 1.5);
          col += vec3(0.3, 0.7, 0.8) * smoothstep(0.6, 0.95, c) * (1.0 - smoothstep(0.0, 4.0, d)) * 0.14;
          col += vec3(0.2, 0.6, 0.7) * exp(-d * 1.6) * 0.18;
          float edge = uFoamW * (1.0 + 0.45 * sin(vWorld.x * 5.3 + uTime * 2.2) + 0.3 * sin(vWorld.x * 11.0 - uTime * 3.1));
          float foam = 1.0 - smoothstep(edge * 0.55, edge, d);
          float bubbles = smoothstep(0.975, 0.995, sin(vWorld.x * 23.0 + uTime * 0.7) * sin(vWorld.y * 21.0 + uTime * 1.9 + sin(vWorld.x * 3.0))) * (1.0 - smoothstep(0.0, 2.2, d));
          float white = max(foam, bubbles * 0.4);
          col = mix(col, vec3(0.97, 0.995, 1.0), white);
          col = mix(col, vec3(0.85, 0.92, 1.0), uFlash * 0.3);
          // A felszín alatt áttetsző, lefelé gyorsan sűrűsödik.
          float alpha = max(white, 0.58 + 0.36 * smoothstep(0.0, 6.0, d));
          gl_FragColor = vec4(col, alpha);`
          }
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  const frontGeo = buildWaterFront(xs);
  const front = new THREE.Mesh(frontGeo, faceShader(false));
  front.frustumCulled = false;
  front.renderOrder = 3;
  scene.add(front);
  const backFace = new THREE.Mesh(frontGeo, faceShader(true));
  backFace.frustumCulled = false;
  scene.add(backFace);

  /*
   * A SZÖKŐÁR mint főszereplő (terv 7.4): az öböl mögött közeledő hullámfal. A part és a dombok FÖLÉ magasodik; a vízszinttel
   * nő és közelít. Sötétkék tő → türkiz fal → világító perem → vastag, tépett fehér taraj, lecsorgó habnyelvekkel; a falon
   * felfelé futó habcsíkok; a tövénél permet-köd. Egy rajzolási hívás.
   */
  const waveUniforms = { uTime: { value: 0 }, uDanger: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uFlash: waterUniforms.uFlash };
  const waveMat = new THREE.ShaderMaterial({
    uniforms: waveUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uDanger;
      uniform vec2 uSize;
      varying vec2 vUv;
      varying float vX;
      void main() {
        vUv = uv;
        vec3 p = position;
        vX = p.x * uSize.x;
        // A taraj magassága a fal mentén hullámzik (nagy, lassú hátak), a fal a néző felé dől.
        float crest = 0.55 * sin(vX * 0.045 + uTime * 0.5) + 0.3 * sin(vX * 0.11 - uTime * 0.8 + 1.3) + 0.15 * sin(vX * 0.23 + uTime * 1.3);
        p.y += uv.y * crest * 0.07;
        p.z += uv.y * uv.y * uSize.y * (0.22 + 0.2 * uDanger);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDanger;
      uniform float uFlash;
      uniform vec2 uSize;
      varying vec2 vUv;
      varying float vX;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float t = vUv.y;
        float h = t * uSize.y;
        // A léptéket a fal magassága adja: közelről is, távolról is ugyanolyan rajzolatú.
        float sx = vX / max(uSize.y, 1.0);
        vec3 deep = vec3(0.006, 0.05, 0.22);
        vec3 body = vec3(0.01, 0.19, 0.5);
        vec3 lit = vec3(0.04, 0.5, 0.74);
        vec3 col = mix(deep, body, smoothstep(0.0, 0.7, t));
        // Felfelé rohanó habcsíkok a falon.
        float streak = noise(vec2(sx * 9.0, t * 5.0 - uTime * 0.55));
        streak = smoothstep(0.55, 0.85, streak) * smoothstep(0.08, 0.5, t);
        col = mix(col, vec3(0.75, 0.95, 0.98), streak * 0.3);
        // Nagy, sötétebb redők (a víztömeg súlya).
        float fold = noise(vec2(sx * 2.2 + uTime * 0.05, t * 1.6 - uTime * 0.12));
        col *= 0.82 + 0.3 * fold;
        // Tépett taraj: zajjal mozgó perem + lecsorgó habnyelvek + árnyék a taraj alatt.
        float edge = 0.8 + 0.07 * noise(vec2(sx * 5.0, uTime * 0.5)) + 0.035 * noise(vec2(sx * 17.0, -uTime * 0.9));
        float tongues = smoothstep(0.5, 0.95, noise(vec2(sx * 13.0, t * 7.0 + uTime * 0.7))) * smoothstep(edge - 0.17, edge, t);
        float foam = max(smoothstep(edge - 0.035, edge + 0.015, t), tongues * 0.55);
        // A taraj alatt a fal elvékonyodik: a fény átüt rajta (türkiz sáv), lejjebb mélykék a víztömeg.
        float lip = smoothstep(edge - 0.3, edge - 0.03, t) * (1.0 - foam);
        col = mix(col, lit, lip * 0.75);
        col = mix(col, vec3(0.25, 0.88, 0.92), smoothstep(edge - 0.1, edge - 0.03, t) * (1.0 - foam) * 0.45);
        col *= 1.0 - 0.28 * smoothstep(edge - 0.08, edge - 0.035, t) * (1.0 - foam);
        vec3 foamCol = mix(vec3(0.82, 0.93, 1.0), vec3(1.0), smoothstep(edge, edge + 0.12, t) * 0.5 + 0.5 * noise(vec2(sx * 23.0, t * 30.0 + uTime)));
        col = mix(col, foamCol, foam);
        // Permet-köd a fal tövénél.
        float mist = (1.0 - smoothstep(0.0, 0.13 + 0.07 * noise(vec2(sx * 4.0 + uTime * 0.2, 1.0)), t)) * (0.55 + 0.45 * noise(vec2(sx * 6.0 - uTime * 0.3, t * 9.0)));
        col = mix(col, vec3(0.85, 0.95, 1.0), mist * 0.6);
        col = mix(col, vec3(0.92, 0.95, 1.0), uFlash * 0.35);
        // A taraj fölötti perem tépett (áttetszőbe fut), az alja a tengerbe olvad.
        float topFade = 1.0 - smoothstep(0.955 + 0.03 * noise(vec2(sx * 13.0, uTime * 1.2)), 0.995, t);
        float alpha = smoothstep(0.0, 0.03, t) * topFade;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const waveWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, lean ? 40 : 80, 10), waveMat);
  waveWall.frustumCulled = false;
  waveWall.renderOrder = 0;
  scene.add(waveWall);

  // Platforms (rebuilt on resize: their length follows the screen width)
  let platforms: THREE.Mesh | null = null;

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
  let crestAcc = 0;
  /** S9: reduced motion keeps 30 % of the rider's swing (and no spray / dust). */
  const motionK = reducedMotion ? 0.3 : 1;

  const shelterNear = new THREE.Vector2();
  let hillK = 1;
  let propK = 1;
  const spotMatrix = (s: Spot, sway = 0): THREE.Matrix4 => {
    if (s.cliff) {
      dummy.position.set(cliffTop.x + s.cliff[0] * cliffScale, cliffTop.y + (s.lift ?? -0.03) * s.s, cliffTop.z + s.cliff[1] * cliffScale);
    } else {
      const x = (s.u * hw * (CAM_DIST + s.zz)) / CAM_DIST;
      dummy.position.set(x, terrainHeight(x, -s.zz, hw) + (s.lift ?? (s.model === "hill" ? -0.2 * hillK : -0.04)) * s.s, -s.zz);
    }
    dummy.rotation.set(0, s.rotY ?? 0, sway);
    dummy.scale.setScalar(s.s * (s.cliff ? cliffScale : s.model === "hill" ? hillK : propK));
    dummy.updateMatrix();
    return dummy.matrix;
  };
  const layout = () => {
    // Screen-anchored pieces
    const aspect = hw / HALF_H;
    waterUniforms.uHw.value = hw;
    // S9: a thicker white crest band on top of the wave face.
    waterUniforms.uFoamW.value = Math.max(0.14, 8.5 * worldPerPx);
    terrain.geometry.dispose();
    terrain.geometry = buildTerrain(hw, lean);
    for (const d of decor) {
      const x = (d.u * hw * (CAM_DIST + d.zz)) / CAM_DIST;
      d.obj.position.set(x, terrainHeight(x, -d.zz, hw) + d.lift, -d.zz);
    }
    // A szikla-hegy teteje pontosan a menedék talppontja (a kép SHELTER_X / felső deszka pontja), a hegy mélységében.
    // Álló nézetben keskenyebb hegy (vak ellenőr K3: a kép jobb felét eltakarta, a szökőár nem volt felismerhető).
    cliffScale = THREE.MathUtils.clamp(hw / 4.2, aspect < 1 ? 0.6 : 0.8, 1.5);
    // Keskeny (álló) képen a dombok és a díszlet arányosan kisebbek, hogy az öböl és a hullámfal látsszon.
    hillK = THREE.MathUtils.clamp(hw / 7.5, 0.5, 1.15);
    propK = THREE.MathUtils.clamp(hw / 6, 0.72, 1.1);
    cliffTop.set(worldX(SHELTER_X, CLIFF_Z), worldY(1 - shelterTopFor(aspect) / 100, CLIFF_Z), CLIFF_Z);
    if (cliff) {
      cliff.position.copy(cliffTop);
      cliff.scale.setScalar(cliffScale);
    }
    waterUniforms.uCliff.value.set(cliffTop.x, CLIFF_Z, cliffTop.y, cliff ? cliffScale : 0);
    for (const b of batches) {
      b.items.forEach((s, i) => b.mesh.setMatrixAt(i, spotMatrix(s)));
      b.mesh.instanceMatrix.needsUpdate = true;
    }
    const sunPoint = new THREE.Vector3(worldX(0.12, -400), worldY(0.95, -400), -400);
    const sunDir = sunPoint.sub(camera.position).normalize();
    skyU.sunDirection.value.copy(sunDir);
    waterUniforms.uSunDir.value.copy(sunDir);

    if (platforms) {
      scene.remove(platforms);
      platforms.geometry.dispose();
    }
    const thick = Math.max(0.24, 15 * worldPerPx);
    // A pallók a hegyhez futó stégek: a jobb végük a szikla sziluettjébe ér (hegy nélkül a kép 92 %-áig tartanak).
    const xRightAt = (y: number) => (cliff ? Math.min(worldX(0.92), cliffTop.x - cliffScale * cliffRadius((cliffTop.y - y) / cliffScale) + 0.55) : worldX(0.92));
    // Három lépcsőzetes stég (a negyedik szint elmaradt): fent a menedék rövid mólója, lejjebb egyre hosszabbak — a bal felső
    // rész szabad, ott látszik a közeledő hullámfal.
    const tops = plankTops(aspect);
    const levels: PierLevel[] = [
      { top: tops[0]!, left: worldX(aspect < 1 ? 0.5 : 0.56), stilts: false },
      { top: tops[2]!, left: worldX(aspect < 1 ? 0.2 : 0.3) },
      { top: tops[3]!, left: worldX(0.06) },
    ];
    platforms = buildPlatforms(levels, xRightAt, (top) => worldY(1 - top / 100), thick, propMat);
    scene.add(platforms);

    kidScale = Math.min(74, Math.max(46, heightPx * 0.14)) * worldPerPx;
    kid.group.scale.setScalar(kidScale);
    shelterNear.set(worldX(SHELTER_X, PLAYER_Z), worldY(1 - shelterTopFor(aspect) / 100, PLAYER_Z));
    if (cliff) {
      // A menedék a hegy tetején áll; a mélység miatt ugyanakkorának látszik, mint a régi helyén.
      shelter.group.scale.setScalar(kidScale * 0.62 * ((CAM_DIST - CLIFF_Z) / CAM_DIST));
      shelter.group.position.copy(cliffTop);
    } else {
      shelter.group.scale.setScalar(kidScale * 0.62);
      shelter.group.position.set(worldX(SHELTER_X), worldY(1 - shelterTopFor(aspect) / 100), PLANK_Z + 0.2);
    }
    const zoneUnit = kidScale * 0.95;
    buoyL.group.scale.setScalar(zoneUnit);
    buoyR.group.scale.setScalar(zoneUnit);
    floats.scale.setScalar(1);
  };

  let warmFrames = 0;
  let shiftY = 0;
  let lastW = -1;
  let lastH = -1;
  // A figura képernyő-dobozának mérése (vetített befoglaló doboz) — 4 képkockánként.
  const figBox = new THREE.Box3();
  const figCorner = new THREE.Vector3();
  let figBoxTick = 0;
  const measureFigureBox = (live: TsunamiLive) => {
    if (lastW <= 0 || lastH <= 0) return;
    kid.group.updateMatrixWorld(true);
    figBox.setFromObject(kid.group);
    camera.updateMatrixWorld();
    let l = Infinity;
    let r = -Infinity;
    let t = Infinity;
    let b = -Infinity;
    for (let i = 0; i < 8; i++) {
      figCorner.set(i & 1 ? figBox.max.x : figBox.min.x, i & 2 ? figBox.max.y : figBox.min.y, i & 4 ? figBox.max.z : figBox.min.z).project(camera);
      const x = ((figCorner.x + 1) / 2) * lastW;
      const y = ((1 - figCorner.y) / 2) * lastH;
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
    if (!Number.isFinite(l + r + t + b)) return;
    live.figureBoxPx = { left: l, top: t, right: r, bottom: b };
    figCorner.copy(kid.group.position).project(camera);
    const ax = ((figCorner.x + 1) / 2) * lastW;
    const ay = ((1 - figCorner.y) / 2) * lastH;
    live.figureExtentPx = { up: ay - t, down: b - ay, left: ax - l, right: r - ax };
  };
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
      if (live) live.shownShiftPx = shiftY / worldPerPx;
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
      const danger = won ? 0 : clamp01((fill - 0.07) / 0.55);
      waveUniforms.uTime.value = t;
      waveUniforms.uDanger.value = damp(waveUniforms.uDanger.value, danger, 2, dt);
      const dg = waveUniforms.uDanger.value;
      const dz = THREE.MathUtils.lerp(hw < HALF_H ? 95 : 120, hw < HALF_H ? 30 : 34, dg);
      // A taraj a kép 71 %-ától (távol) a 86 %-áig (közel) ér fel: a horizont (60 %), a part és a dombok FÖLÖTT van, de a
      // felső sáv (HUD) alatt marad — a habos taraj álló nézetben is látszik.
      // Álló nézetben (keskeny kép) a taraj már alacsony víznél is a felső stég és a menedék FÖLÖTT van (csiszoló kör 1. pont).
      /*
       * Vak ellenőr K3 (2026-11-19): álló nézetben a taraj a felső sáv jelzői alá esett, és magas víznél a fal eltűnt a vízfelszín
       * mögött. Álló nézetben ezért a taraj alacsonyabban (a jelzők alatt bőven, a felső stég magasságában) és közelebb jön, és a
       * vízszinttel együtt emelkedik, mindig legalább a kép ~13 %-ával a vízfelszín fölött — így a fal minden vízállásnál
       * látszik.
       */
      const portraitView = hw < HALF_H;
      const surfaceFrac = (level - worldY(0)) / (worldY(1) - worldY(0));
      const crestFrac = portraitView
        ? Math.max(THREE.MathUtils.lerp(0.73, 0.79, dg), Math.min(0.8, surfaceFrac + 0.13))
        : THREE.MathUtils.lerp(0.71, 0.86, dg);
      const wallTop = worldY(crestFrac, -dz);
      const wallBottom = level - 1.5;
      const wallH = Math.max(1, wallTop - wallBottom);
      const span = hw * 3 * ((CAM_DIST + dz) / CAM_DIST) + wallH;
      waveWall.scale.set(span, wallH, 1);
      waveWall.position.set(0, wallBottom + wallH / 2, -dz);
      waveUniforms.uSize.value.set(span, wallH);
      // Hangulat: a veszéllyel az ég mélyül és a fény hűvösebb — a színek teltek maradnak.
      (skyU.topColor.value as THREE.Color).copy(calmTop).lerp(stormTop, dg * 0.85);
      fogColor.copy(calmHorizon).lerp(stormHorizon, dg * 0.8);
      (skyU.horizonColor.value as THREE.Color).copy(fogColor);
      key.intensity = 2.5 - 0.5 * dg;
      // Permet a tarajról (a fal méretéhez illő, nagy cseppek).
      if (!reducedMotion && playing) {
        crestAcc += dt * (10 + 40 * dg) * particleScale;
        while (crestAcc >= 1) {
          crestAcc -= 1;
          const fxr = Math.random();
          tmp.set(worldX(fxr, -dz) * 1.05, wallTop - 0.04 * wallH, -dz + 0.3 * wallH);
          sparkles.emit(tmp, { count: 1, color: "#ffffff", speed: 0.06 * wallH + 1, life: 1.3, gravity: 0.12 * wallH, size: 0.016 * wallH + 0.005 * dz, direction: sprayDir.set(0, 1, 0.6), directionality: 0.6, spread: 0.03 * wallH });
        }
      }
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
      hemi.intensity = 1.5 - 0.25 * waveUniforms.uDanger.value + flash * 2.2;
      boltMat.opacity = Math.min(1, flash * 1.6);
      if (flash <= 0) bolt.visible = false;

      // Player on the surfboard
      const kx = worldX(px);
      const surfaceAt = (x: number, z: number) => level + waveHeight(x, z, t, amp);
      // Sodródó törmelék: a hullámon ringatózva, lassan sodródva (díszlet, nem akadály — D2-b).
      for (const batch of drifts) {
        batch.items.forEach((d, i) => {
          if (!reducedMotion) d.fx += d.speed * dt;
          if (d.fx > 1.08) d.fx = -0.08;
          if (d.fx < -0.08) d.fx = 1.08;
          const dx = worldX(d.fx, d.z);
          dummy.position.set(dx, surfaceAt(dx, d.z) + 0.04 * d.s, d.z);
          dummy.rotation.set(reducedMotion ? 0 : Math.sin(elapsed * 0.9 + d.phase) * 0.1, d.phase, Math.atan(waveSlopeX(dx, d.z, t, amp)) + (reducedMotion ? 0 : Math.sin(elapsed * 1.3 + d.phase) * 0.12));
          dummy.scale.setScalar(d.s);
          dummy.updateMatrix();
          batch.mesh.setMatrixAt(i, dummy.matrix);
        });
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
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
        kid.group.position.x = THREE.MathUtils.lerp(kx, shelterNear.x - 0.9 * kidScale, e);
        kid.group.position.y = THREE.MathUtils.lerp(ky, shelterNear.y, e);
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
        if (lampGlow) (lampGlow.material as THREE.SpriteMaterial).opacity = 0.6 + 0.25 * Math.sin(elapsed * 2.2);
        // A pálmák a szélben billegnek (a veszéllyel erősebben).
        for (const b of palmBatches) {
          b.items.forEach((s, i) => b.mesh.setMatrixAt(i, spotMatrix(s, Math.sin(elapsed * (1.1 + 0.9 * dg) + s.zz) * (0.03 + 0.05 * dg))));
          b.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      clouds.forEach((c, i) => {
        dummy.position.set(worldX(c.fx, -c.zz), worldY(c.fy, -c.zz), -c.zz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(c.s);
        dummy.updateMatrix();
        cloudMesh.setMatrixAt(i, dummy.matrix);
      });
      cloudMesh.instanceMatrix.needsUpdate = true;
      dummy.scale.setScalar(1);

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
        // Az eső a viharral érkezik: alacsony víznél alig, magasnál sűrűn látszik.
        rainMat.opacity = 0.04 + 0.4 * dg + flash * 0.3;
      }

      sparkles.update(dt);
      if (live && (figBoxTick++ & 3) === 0) measureFigureBox(live);
    },
    dispose() {
      disposed = true;
      sparkles.dispose();
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
    exposure: 1,
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
