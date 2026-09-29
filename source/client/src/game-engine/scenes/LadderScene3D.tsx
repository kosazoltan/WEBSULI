import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import {
  LOOK_BUDGET,
  SparkleField,
  createGlowSprite,
  createGradientSky,
  glowTexture,
  useThreeScene,
  type ThreeSceneContext,
  type ThreeSceneController,
} from "../three-look";

/**
 * Szólétra — the 3D ladder rising into the sky (spec T6).
 *
 * Purely decorative: the game state stays in `WordLadderHuEn`, this layer only
 * reads the latest props through a ref every frame. World units: one rung every
 * `RUNG_GAP`, rung 0 is the ground, the goal star floats above the last rung.
 * The zones are laid out in space (meadow at the foot, forest trees, clouds,
 * night sky at the top) and the sky/light palette blends to the current zone.
 */

export type LadderMood = "happy" | "oops" | "idle";

export type LadderScene3DProps = {
  rung: number;
  total: number;
  zoneId: string;
  streak: number;
  mood: LadderMood;
  /** "column": tall narrow game column; "preview": the small menu picture. */
  variant?: "column" | "preview";
  /** Rendered instead of the canvas when WebGL is unavailable (spec E7). */
  fallback?: ReactNode;
  onSupportedChange?: (supported: boolean | null) => void;
  /** Climber feet height on the canvas, % from the bottom (for DOM pop-ups). */
  onClimberScreenPct?: (pct: number) => void;
  className?: string;
};

const RUNG_GAP = 0.7;
const HALF_WIDTH = 0.38;
/** Ladder yaw: the slight 3/4 view that shows the rails' depth. */
const LADDER_YAW = -0.5;
const CAMERA_DISTANCE = 14;

type Palette = {
  top: THREE.Color;
  horizon: THREE.Color;
  bottom: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  night: number;
  fogNear: number;
  fogFar: number;
};

const pal = (
  top: string,
  horizon: string,
  bottom: string,
  hemiSky: string,
  hemiGround: string,
  sun: string,
  sunIntensity: number,
  night: number,
  fogNear: number,
  fogFar: number,
): Palette => ({
  top: new THREE.Color(top),
  horizon: new THREE.Color(horizon),
  bottom: new THREE.Color(bottom),
  hemiSky: new THREE.Color(hemiSky),
  hemiGround: new THREE.Color(hemiGround),
  sun: new THREE.Color(sun),
  sunIntensity,
  night,
  fogNear,
  fogFar,
});

const PALETTES: Record<string, Palette> = {
  meadow: pal("#2f86e0", "#9fd8f7", "#b9e3c8", "#d9efff", "#4f8a30", "#fff1cf", 2.3, 0, 26, 80),
  forest: pal("#2a78c8", "#8fd0c0", "#9fd3b0", "#d2efe2", "#2a5a2f", "#ffe6b5", 2.1, 0, 24, 70),
  clouds: pal("#2456c8", "#8fbfff", "#cfe3ff", "#eef5ff", "#7f9cc4", "#ffffff", 2.2, 0.08, 26, 72),
  stars: pal("#040825", "#2a2470", "#171445", "#6f7bd6", "#1c1740", "#b9c6ff", 1.1, 1, 26, 80),
};

/** The rung wood per zone (mirrors `wordLadderLogic` rungColor). */
function rungWoodColor(i: number): string {
  if (i >= 15) return "#c9b7f5";
  if (i >= 10) return "#8fa7c9";
  if (i >= 5) return "#a9713a";
  return "#c98b4a";
}

const GOLD = new THREE.Color("#ffc93c");
const GOLD_EMISSIVE = new THREE.Color("#b87400");
const NEXT_EMISSIVE = new THREE.Color("#fff0b0");

/** Tiny deterministic PRNG so the scenery is the same on every mount. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function woodTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#a86c38";
  ctx.fillRect(0, 0, c.width, c.height);
  const r = rng(7);
  for (let k = 0; k < 26; k++) {
    const x = r() * c.width;
    ctx.strokeStyle = `rgba(${70 + r() * 40}, ${38 + r() * 20}, 14, ${0.25 + r() * 0.3})`;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= c.height; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + k) * 1.5, y);
    ctx.stroke();
  }
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = "rgba(80, 42, 16, 0.45)";
    ctx.beginPath();
    ctx.ellipse(r() * c.width, r() * c.height, 2.2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  return tex;
}

function starShape(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

type ClimberRig = {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  smile: THREE.Mesh;
  oops: THREE.Mesh;
  flame: THREE.Group;
};

/** Blocky kid with a backpack, facing the ladder and peeking back at the player. */
function buildClimber(): ClimberRig {
  const skin = new THREE.MeshStandardMaterial({ color: "#fcd3ae", roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: "#38bdf8", roughness: 0.6 });
  const pants = new THREE.MeshStandardMaterial({ color: "#4f46e5", roughness: 0.7 });
  const shoe = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: "#7c2d12", roughness: 0.85 });
  const pack = new THREE.MeshStandardMaterial({ color: "#f97316", roughness: 0.55 });
  const packDark = new THREE.MeshStandardMaterial({ color: "#c2410c", roughness: 0.6 });
  const ink = new THREE.MeshBasicMaterial({ color: "#1f2937" });
  const blush = new THREE.MeshBasicMaterial({ color: "#fb9a9a", transparent: true, opacity: 0.8 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const limb = (w: number, h: number, d: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, d) * 0.3), mat);
    return m;
  };

  // Legs pivot at the hips; the mesh hangs down from the pivot.
  const makeLeg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.22, 0);
    const leg = limb(0.1, 0.2, 0.1, pants);
    leg.position.y = -0.1;
    const foot = limb(0.11, 0.06, 0.14, shoe);
    foot.position.set(0, -0.2, -0.02);
    g.add(leg, foot);
    body.add(g);
    return g;
  };
  const legL = makeLeg(-0.065);
  const legR = makeLeg(0.065);

  const torso = limb(0.28, 0.25, 0.17, shirt);
  torso.position.y = 0.34;
  body.add(torso);

  // Backpack on the camera side (the climber faces -z, towards the ladder).
  const bag = limb(0.24, 0.24, 0.11, pack);
  bag.position.set(0, 0.35, 0.13);
  const pocket = limb(0.16, 0.09, 0.05, packDark);
  pocket.position.set(0, 0.29, 0.195);
  const flap = limb(0.25, 0.07, 0.12, packDark);
  flap.position.set(0, 0.45, 0.135);
  body.add(bag, pocket, flap);

  // Arms pivot at the shoulders and reach up to the rung above.
  const makeArm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.43, -0.02);
    const arm = limb(0.075, 0.24, 0.075, shirt);
    arm.position.y = 0.11;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), skin);
    hand.position.y = 0.25;
    g.add(arm, hand);
    body.add(g);
    return g;
  };
  const armL = makeArm(-0.175);
  const armR = makeArm(0.175);
  armL.rotation.set(-0.35, 0, -0.18);
  armR.rotation.set(-0.35, 0, 0.18);

  // Head, turned back over the shoulder so the face shows in the 3/4 view.
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0);
  head.rotation.y = -1.95;
  const skull = limb(0.28, 0.26, 0.26, skin);
  const hairTop = limb(0.3, 0.08, 0.28, hair);
  hairTop.position.set(0, 0.12, 0.01);
  const hairBack = limb(0.3, 0.2, 0.08, hair);
  hairBack.position.set(0, 0.04, 0.11);
  const fringe = limb(0.3, 0.05, 0.06, hair);
  fringe.position.set(0, 0.1, -0.12);
  head.add(skull, hairTop, hairBack, fringe);
  const eyeGeo = new THREE.SphereGeometry(0.026, 10, 8);
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(eyeGeo, ink);
    eye.position.set(x, 0.015, -0.131);
    eye.scale.set(1, 1.3, 0.5);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(x + 0.008, 0.028, -0.143);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), blush);
    cheek.position.set(x * 1.45, -0.04, -0.132);
    cheek.rotation.y = Math.PI;
    head.add(eye, shine, cheek);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), ink);
  smile.position.set(0, -0.035, -0.132);
  smile.rotation.set(0, Math.PI, Math.PI);
  const oops = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.01, 6, 14), ink);
  oops.position.set(0, -0.05, -0.132);
  oops.visible = false;
  head.add(smile, oops);
  body.add(head);

  // Streak flame on the backpack.
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.2, 10),
    new THREE.MeshBasicMaterial({ color: "#fb923c", transparent: true, opacity: 0.95 }),
  );
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.13, 10),
    new THREE.MeshBasicMaterial({ color: "#fde047" }),
  );
  inner.position.y = -0.02;
  inner.position.z = 0.02;
  const halo = createGlowSprite("#ff9a3c", 0.55, 0.8);
  flame.add(outer, inner, halo);
  flame.position.set(-0.1, 0.5, 0.2);
  flame.scale.setScalar(0.8);
  flame.visible = false;
  body.add(flame);

  return { root, body, head, armL, armR, legL, legR, smile, oops, flame };
}

type Hop = { from: number; to: number; t: number; dur: number; up: boolean };

function setupLadderScene(
  ctx: ThreeSceneContext,
  propsRef: { current: LadderScene3DProps },
  variant: "column" | "preview",
): ThreeSceneController {
  const { scene, tier, reducedMotion } = ctx;
  const budget = LOOK_BUDGET[tier];
  const total = Math.max(1, propsRef.current.total);
  const topY = total * RUNG_GAP;
  const starY = topY + 0.95;

  const camera = new THREE.PerspectiveCamera(35, 0.15, 0.1, 500);

  // --- sky, fog, light --------------------------------------------------------
  const start = PALETTES[propsRef.current.zoneId] ?? PALETTES.meadow!;
  const cur: Palette = {
    ...start,
    top: start.top.clone(),
    horizon: start.horizon.clone(),
    bottom: start.bottom.clone(),
    hemiSky: start.hemiSky.clone(),
    hemiGround: start.hemiGround.clone(),
    sun: start.sun.clone(),
  };
  const sky = createGradientSky({ top: cur.top, horizon: cur.horizon, bottom: cur.bottom, radius: 300 });
  scene.add(sky);
  const skyU = sky.material.uniforms;
  const fog = new THREE.Fog(cur.horizon.clone(), cur.fogNear, cur.fogFar);
  scene.fog = fog;

  const hemi = new THREE.HemisphereLight(cur.hemiSky, cur.hemiGround, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(cur.sun, cur.sunIntensity);
  sun.position.set(4, 9, 8);
  scene.add(sun);

  // --- ground island, hills, flowers -------------------------------------------
  const grass = new THREE.MeshStandardMaterial({ color: "#6cc04a", roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 48), grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);
  const hillGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hillColors = ["#7fcf5a", "#5fb247", "#8fd66a", "#4f9e3f", "#9adb72"];
  const hills: Array<[number, number, number, number, number]> = [
    [-2.6, -9, 3.4, 1.9, 0],
    [2.4, -11, 4.2, 2.6, 1],
    [-0.4, -15, 5.2, 2.2, 2],
    [3.8, -18, 5, 3.2, 3],
    [-4.2, -17, 4.6, 2.8, 4],
  ];
  for (const [x, z, r, h, c] of hills) {
    const hill = new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ color: hillColors[c], roughness: 1 }));
    hill.position.set(x, -0.2, z);
    hill.scale.set(r, h, r * 0.8);
    scene.add(hill);
  }

  const rand = rng(42);
  const dummy = new THREE.Object3D();
  const flowerCount = 16;
  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.014, 1, 5),
    new THREE.MeshStandardMaterial({ color: "#3f8f35", roughness: 0.9 }),
    flowerCount,
  );
  const centers = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#ffd23f", roughness: 0.6 }),
    flowerCount,
  );
  const petals = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }),
    flowerCount * 5,
  );
  const petalColors = ["#ff7eb6", "#ffffff", "#c084fc", "#ff5d5d", "#ffd84a", "#7dd3fc"].map((c) => new THREE.Color(c));
  for (let i = 0; i < flowerCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (0.25 + rand() * 1.5);
    const z = -2.4 + rand() * 3.6;
    const h = 0.14 + rand() * 0.16;
    dummy.position.set(x, h / 2, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, h, z);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    centers.setMatrixAt(i, dummy.matrix);
    const col = petalColors[i % petalColors.length]!;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + rand();
      dummy.position.set(x + Math.cos(a) * 0.05, h, z + Math.sin(a) * 0.05);
      dummy.scale.set(1, 0.55, 1);
      dummy.updateMatrix();
      petals.setMatrixAt(i * 5 + p, dummy.matrix);
      petals.setColorAt(i * 5 + p, col);
    }
  }
  scene.add(stems, centers, petals);

  // --- forest ------------------------------------------------------------------
  const treeCount = 9;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.1, 0.14, 1, 8),
    new THREE.MeshStandardMaterial({ color: "#6b4424", roughness: 0.9 }),
    treeCount,
  );
  const cones = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 9),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, flatShading: true }),
    treeCount * 3,
  );
  const pineGreens = ["#2f7d3b", "#3b9447", "#276b33", "#46a052"].map((c) => new THREE.Color(c));
  const treeSpots: Array<[number, number, number]> = [
    [-1.05, -2.6, 6.4],
    [1.15, -3.4, 7.1],
    [-1.6, -6.5, 7.6],
    [1.9, -7.2, 6.6],
    [-0.5, -9.5, 8.2],
    [0.8, -12, 7.4],
    [-2.6, -11, 7],
    [2.9, -13.5, 8],
    [-1.2, -15, 6.8],
  ];
  treeSpots.forEach(([x, z, h], i) => {
    const trunkH = h * 0.42;
    dummy.position.set(x, trunkH / 2 - 0.1, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, trunkH, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 3; k++) {
      const r = (0.95 - k * 0.22) * (h / 7);
      const ch = h * 0.34;
      dummy.position.set(x, trunkH + k * h * 0.19 + ch / 2 - 0.25, z);
      dummy.rotation.set(0, i + k, 0);
      dummy.scale.set(r, ch, r);
      dummy.updateMatrix();
      cones.setMatrixAt(i * 3 + k, dummy.matrix);
      cones.setColorAt(i * 3 + k, pineGreens[(i + k) % pineGreens.length]!);
    }
  });
  scene.add(trunks, cones);

  // --- clouds (instanced puffs, drifting) ----------------------------------------
  const cloudDefs: Array<{ x: number; y: number; z: number; s: number; speed: number }> = [
    { x: -1.1, y: 7.4, z: 1.6, s: 0.55, speed: 0.12 },
    { x: 1.4, y: 8.3, z: -2.5, s: 0.9, speed: -0.08 },
    { x: -1.6, y: 9.6, z: -4, s: 1.1, speed: 0.06 },
    { x: 1.1, y: 10.6, z: 1.2, s: 0.5, speed: -0.1 },
    { x: 0.2, y: 6.8, z: -8, s: 1.4, speed: 0.05 },
    { x: -2.2, y: 11.2, z: -9, s: 1.5, speed: 0.04 },
    { x: 2.4, y: 12.6, z: -11, s: 1.4, speed: -0.05 },
    { x: 1.8, y: 5.6, z: -12, s: 1.6, speed: 0.03 },
  ];
  const puffOffsets: Array<[number, number, number, number]> = [
    [0, 0, 0, 0.62],
    [0.5, -0.06, 0.05, 0.46],
    [-0.52, -0.08, 0, 0.44],
    [0.22, 0.26, -0.05, 0.42],
    [-0.25, 0.2, 0.08, 0.38],
  ];
  const puffs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshStandardMaterial({ color: "#f1f6ff", emissive: "#c9d8f2", emissiveIntensity: 0.12, roughness: 1 }),
    cloudDefs.length * puffOffsets.length,
  );
  const cloudX = cloudDefs.map((c) => c.x);
  const placeClouds = () => {
    cloudDefs.forEach((c, i) => {
      puffOffsets.forEach(([ox, oy, oz, r], k) => {
        dummy.position.set(cloudX[i]! + ox * c.s, c.y + oy * c.s, c.z + oz * c.s);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(r * c.s, r * c.s * 0.78, r * c.s * 0.85);
        dummy.updateMatrix();
        puffs.setMatrixAt(i * puffOffsets.length + k, dummy.matrix);
      });
    });
    puffs.instanceMatrix.needsUpdate = true;
  };
  placeClouds();
  scene.add(puffs);

  // --- night sky: stars, moon; day: sun --------------------------------------------
  const starCount = Math.round(220 * Math.max(0.5, budget.particleScale));
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const starTint = [new THREE.Color("#ffffff"), new THREE.Color("#fff3b0"), new THREE.Color("#bcd4ff")];
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (rand() - 0.5) * 9;
    starPos[i * 3 + 1] = topY - 3 + rand() * 16;
    starPos[i * 3 + 2] = -8 - rand() * 18;
    const c = starTint[i % 3]!;
    starCol[i * 3] = c.r;
    starCol[i * 3 + 1] = c.g;
    starCol[i * 3 + 2] = c.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.28,
    map: glowTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    opacity: cur.night,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 16),
    new THREE.MeshBasicMaterial({ color: "#fff4cf", transparent: true, fog: false, opacity: cur.night }),
  );
  moon.position.set(1.5, topY + 1.8, -14);
  const moonGlow = createGlowSprite("#dfe6ff", 3.2, 0.6 * cur.night);
  moonGlow.position.copy(moon.position);
  (moonGlow.material as THREE.SpriteMaterial).fog = false;
  scene.add(moon, moonGlow);

  // --- the ladder -----------------------------------------------------------------
  const ladder = new THREE.Group();
  ladder.rotation.y = LADDER_YAW;
  scene.add(ladder);
  const wood = woodTexture();
  const railMat = new THREE.MeshStandardMaterial({ color: "#e2a86e", map: wood, roughness: 0.75 });
  const railLen = topY + 0.55;
  const railGeo = new RoundedBoxGeometry(0.11, railLen, 0.15, 2, 0.035);
  for (const x of [-HALF_WIDTH, HALF_WIDTH]) {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(x, railLen / 2 - 0.12, 0);
    ladder.add(rail);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 10),
      new THREE.MeshStandardMaterial({ color: "#ffd166", roughness: 0.35, metalness: 0.4 }),
    );
    cap.position.set(x, railLen - 0.1, 0);
    ladder.add(cap);
  }
  const rungGeo = new THREE.CylinderGeometry(0.055, 0.055, HALF_WIDTH * 2, 14);
  rungGeo.rotateZ(Math.PI / 2);
  const rungs: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>[] = [];
  const rungBase: THREE.Color[] = [];
  for (let i = 1; i <= total; i++) {
    const base = new THREE.Color(rungWoodColor(i));
    const mat = new THREE.MeshStandardMaterial({ color: base.clone(), roughness: 0.6, metalness: 0.05 });
    const m = new THREE.Mesh(rungGeo, mat);
    m.position.set(0, i * RUNG_GAP, 0.01);
    ladder.add(m);
    rungs.push(m);
    rungBase.push(base);
  }
  const nextHalo = createGlowSprite("#ffe38a", 1, 0.0);
  nextHalo.scale.set(1.05, 0.34, 1);
  ladder.add(nextHalo);

  // Soft contact shadow under the feet of the ladder.
  const shadowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: "#000000",
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), shadowMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, 0.01, 0);
  ladder.add(contact);

  // --- the goal star ---------------------------------------------------------------
  const goal = new THREE.Group();
  goal.position.set(0, starY, 0);
  const starMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(starShape(0.42, 0.18), {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    }),
    new THREE.MeshStandardMaterial({
      color: "#ffd23f",
      emissive: "#ffae00",
      emissiveIntensity: 1.3,
      roughness: 0.3,
      metalness: 0.35,
    }),
  );
  starMesh.geometry.center();
  goal.add(starMesh);
  const goalGlow = createGlowSprite("#ffd76a", 2, 0.5);
  goal.add(goalGlow);
  const goalLight = new THREE.PointLight("#ffcf6b", 4, 5, 1.6);
  goal.add(goalLight);
  scene.add(goal);

  // --- climber ------------------------------------------------------------------------
  const rig = buildClimber();
  rig.root.position.set(0, 0, 0.17);
  rig.root.scale.setScalar(0.86);
  ladder.add(rig.root);

  const sparkles = reducedMotion ? null : new SparkleField(scene, Math.round(260 * budget.particleScale) + 40);

  // --- animation state --------------------------------------------------------------------
  let shownRung = propsRef.current.rung;
  let climberY = shownRung * RUNG_GAP;
  let hop: Hop | null = null;
  let lastRung = shownRung;
  let lastZone = propsRef.current.zoneId;
  const gold: number[] = rungs.map((_, i) => (i + 1 <= shownRung ? 1 : 0));
  let visibleH = 10;
  let camY = 0;
  let camInit = false;
  let lastPct = -1;
  let sparkleTimer = 0;
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();

  const framing = () => {
    const minH = variant === "preview" ? 2.3 : 0;
    const width = variant === "preview" ? 1.9 : 1.25;
    const h = Math.max(minH, width / Math.max(0.05, camera.aspect));
    visibleH = h;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 2 / CAMERA_DISTANCE));
    camera.updateProjectionMatrix();
    sparkles?.setViewportHeight(ctx.renderer.domElement.height, camera.fov);
  };

  const cameraTarget = (y: number) => {
    const lo = visibleH / 2 - (variant === "preview" ? 0.3 : 0.55);
    const hi = starY + 1.15 - visibleH / 2;
    if (lo >= hi) return (lo + hi) / 2;
    return THREE.MathUtils.clamp(y + 0.35 + visibleH * 0.1, lo, hi);
  };

  const lerpColor = (c: THREE.Color, to: THREE.Color, k: number) => c.lerp(to, k);

  const update = (dt: number, elapsed: number) => {
    const p = propsRef.current;
    const target = PALETTES[p.zoneId] ?? PALETTES.meadow!;
    const k = reducedMotion ? 1 : 1 - Math.exp(-2.2 * dt);

    // Palette blend towards the current zone.
    lerpColor(cur.top, target.top, k);
    lerpColor(cur.horizon, target.horizon, k);
    lerpColor(cur.bottom, target.bottom, k);
    lerpColor(cur.hemiSky, target.hemiSky, k);
    lerpColor(cur.hemiGround, target.hemiGround, k);
    lerpColor(cur.sun, target.sun, k);
    cur.sunIntensity += (target.sunIntensity - cur.sunIntensity) * k;
    cur.night += (target.night - cur.night) * k;
    cur.fogNear += (target.fogNear - cur.fogNear) * k;
    cur.fogFar += (target.fogFar - cur.fogFar) * k;
    fog.near = cur.fogNear;
    fog.far = cur.fogFar;
    (skyU.topColor!.value as THREE.Color).copy(cur.top);
    (skyU.horizonColor!.value as THREE.Color).copy(cur.horizon);
    (skyU.bottomColor!.value as THREE.Color).copy(cur.bottom);
    fog.color.copy(cur.horizon);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    sun.color.copy(cur.sun);
    sun.intensity = cur.sunIntensity;
    starMat.opacity = cur.night;
    stars.visible = cur.night > 0.01;
    (moon.material as THREE.MeshBasicMaterial).opacity = cur.night;
    (moonGlow.material as THREE.SpriteMaterial).opacity = 0.6 * cur.night;

    // Rung changes start a hop (up) or a slip (down).
    if (p.rung !== lastRung) {
      const up = p.rung > lastRung;
      if (reducedMotion) {
        climberY = p.rung * RUNG_GAP;
        hop = null;
      } else {
        hop = { from: climberY, to: p.rung * RUNG_GAP, t: 0, dur: up ? 0.48 : 0.55, up };
      }
      if (sparkles) {
        tmpV.set(0, p.rung * RUNG_GAP + 0.1, 0.25).applyMatrix4(ladder.matrixWorld);
        if (up) sparkles.emit(tmpV, { count: 22, color: "#ffd84a", speed: 1.6, life: 0.9, gravity: 1.2, size: 0.12, spread: 0.3 });
        else sparkles.emit(tmpV, { count: 12, color: "#cfe3ff", speed: 1, life: 0.6, gravity: 2, size: 0.09, spread: 0.2 });
        if (up && p.zoneId !== lastZone) {
          const zc = p.zoneId === "stars" ? "#c4b5fd" : p.zoneId === "clouds" ? "#ffffff" : "#86efac";
          sparkles.emit(tmpV, { count: 40, color: zc, speed: 2.6, life: 1.3, gravity: 0.4, size: 0.14, spread: 0.5 });
        }
      }
      lastRung = p.rung;
      lastZone = p.zoneId;
    }
    shownRung = p.rung;

    let squash = 0;
    let wobble = 0;
    let stride = 0;
    if (hop) {
      hop.t += dt;
      const t = Math.min(1, hop.t / hop.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      climberY = THREE.MathUtils.lerp(hop.from, hop.to, e) + (hop.up ? Math.sin(Math.PI * t) * 0.22 : 0);
      if (hop.up) {
        stride = Math.sin(t * Math.PI * 2);
        squash = t > 0.85 ? Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.12 : 0;
      } else {
        wobble = Math.sin(t * Math.PI * 3) * (1 - t) * 0.45;
      }
      if (t >= 1) hop = null;
    } else {
      climberY = shownRung * RUNG_GAP;
    }

    // Climber pose.
    const idle = reducedMotion ? 0 : Math.sin(elapsed * 2.4);
    rig.root.position.y = climberY + (reducedMotion || hop ? 0 : Math.max(0, idle) * 0.015);
    rig.body.rotation.z = wobble;
    rig.body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
    rig.armL.rotation.x = -0.35 - stride * 0.45;
    rig.armR.rotation.x = -0.35 + stride * 0.45;
    rig.legL.rotation.x = stride * 0.5;
    rig.legR.rotation.x = -stride * 0.5;
    const oops = p.mood === "oops";
    rig.smile.visible = !oops;
    rig.oops.visible = oops;
    rig.head.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * 1.3) * 0.06 + (oops ? 0.15 : 0);
    rig.head.rotation.y = -1.95 + (p.mood === "happy" ? 0.15 : 0);
    rig.flame.visible = p.streak >= 3;
    if (rig.flame.visible) {
      const f = reducedMotion ? 1 : 1 + Math.sin(elapsed * 17) * 0.12 + Math.sin(elapsed * 29) * 0.06;
      const big = p.streak >= 5 ? 1.2 : 1;
      rig.flame.scale.set(0.8 * big, 0.8 * f * big, 0.8 * big);
    }

    // Rungs: climbed ones turn gold, the next one pulses.
    const pulse = reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(elapsed * 4.2);
    const gk = reducedMotion ? 1 : 1 - Math.exp(-6 * dt);
    rungs.forEach((m, i) => {
      const n = i + 1;
      const want = n <= shownRung ? 1 : 0;
      gold[i] = gold[i]! + (want - gold[i]!) * gk;
      tmpC.copy(rungBase[i]!).lerp(GOLD, gold[i]!);
      m.material.color.copy(tmpC);
      m.material.metalness = 0.05 + gold[i]! * 0.35;
      m.material.roughness = 0.6 - gold[i]! * 0.25;
      if (n === shownRung + 1) {
        m.material.emissive.copy(NEXT_EMISSIVE);
        m.material.emissiveIntensity = 0.25 + pulse * 0.55;
      } else {
        m.material.emissive.copy(GOLD_EMISSIVE);
        m.material.emissiveIntensity = gold[i]! * 0.45;
      }
    });
    if (shownRung < total) {
      nextHalo.visible = true;
      nextHalo.position.set(0, (shownRung + 1) * RUNG_GAP, 0.05);
      (nextHalo.material as THREE.SpriteMaterial).opacity = 0.15 + pulse * 0.35;
    } else {
      nextHalo.visible = false;
    }

    // Goal star.
    if (!reducedMotion) {
      starMesh.rotation.y = elapsed * 1.4;
      goal.position.y = starY + Math.sin(elapsed * 1.8) * 0.06;
      (goalGlow.material as THREE.SpriteMaterial).opacity = 0.3 + 0.45 * cur.night + Math.sin(elapsed * 3) * 0.08;
    } else {
      starMesh.rotation.y = 0.35;
      (goalGlow.material as THREE.SpriteMaterial).opacity = 0.3 + 0.45 * cur.night;
    }

    // Clouds drift.
    if (!reducedMotion) {
      cloudDefs.forEach((c, i) => {
        let x = cloudX[i]! + c.speed * dt;
        if (x > 3.4) x = -3.4;
        if (x < -3.4) x = 3.4;
        cloudX[i] = x;
      });
      placeClouds();
    }

    // Sparkles: a trickle around the star, and around the climber on a streak.
    if (sparkles) {
      sparkleTimer -= dt;
      if (sparkleTimer <= 0) {
        sparkleTimer = 0.35;
        tmpV.set((Math.random() - 0.5) * 0.9, goal.position.y + (Math.random() - 0.5) * 0.6, 0.2);
        sparkles.emit(tmpV, { count: 2, color: "#ffe9a0", speed: 0.4, life: 1.1, gravity: -0.2, size: 0.1 });
        if (p.streak >= 3) {
          tmpV.set(0.1, climberY + 0.55, 0.35).applyMatrix4(ladder.matrixWorld);
          sparkles.emit(tmpV, { count: 3, color: "#ffb347", speed: 0.6, life: 0.7, gravity: -0.8, size: 0.08, spread: 0.1 });
        }
      }
      sparkles.update(dt);
    }

    // Camera follows the climber vertically.
    const want = cameraTarget(climberY);
    if (!camInit || reducedMotion) {
      camY = want;
      camInit = true;
    } else {
      camY += (want - camY) * (1 - Math.exp(-3.2 * dt));
    }
    // Slightly below the target, looking up the ladder — but never under the ground.
    camera.position.set(0.25, Math.max(0.4, camY - 1.1), CAMERA_DISTANCE);
    camera.lookAt(0, camY, 0);
    sky.position.copy(camera.position);
    camera.updateMatrixWorld();

    // Report the feet position for DOM pop-ups (only when it moved).
    if (p.onClimberScreenPct) {
      ladder.updateMatrixWorld();
      tmpV.set(0, climberY, 0.17).applyMatrix4(ladder.matrixWorld).project(camera);
      const pct = Math.round(((tmpV.y + 1) / 2) * 1000) / 10;
      if (Math.abs(pct - lastPct) >= 0.2) {
        lastPct = pct;
        p.onClimberScreenPct(pct);
      }
    }
  };

  return {
    camera,
    update,
    resize: () => framing(),
    dispose: () => {
      sparkles?.dispose();
      scene.fog = null;
    },
    // The canvas is tiny, so the bloom mip chain spreads far: keep it subtle.
    bloom: { strength: 0.3, radius: 0.2, threshold: 1.05 },
  };
}

export default function LadderScene3D(props: LadderScene3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const variant = props.variant ?? "column";

  const { supported } = useThreeScene(
    canvasRef,
    (ctx) => setupLadderScene(ctx, propsRef, variant),
    [variant, props.total],
    { exposure: 1.0, shadows: false },
  );

  const { onSupportedChange } = props;
  useEffect(() => {
    onSupportedChange?.(supported);
  }, [supported, onSupportedChange]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 block h-full w-full ${supported === false ? "hidden" : ""} ${props.className ?? ""}`}
        style={{ zIndex: 0 }}
      />
      {supported === false ? props.fallback : null}
    </>
  );
}
