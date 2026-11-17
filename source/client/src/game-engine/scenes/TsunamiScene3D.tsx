import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  LOOK_BUDGET,
  SparkleField,
  createGlowSprite,
  createGradientSky,
  useThreeScene,
  type ThreeSceneContext,
  type ThreeSceneController,
} from "@/game-engine/three-look";
import type { TsunamiCore } from "@/lib/tsunami/core";
import { OBSTACLE_CAP, SHELL_CAP, type ObstacleKind } from "@/lib/tsunami/obstacles";

/**
 * J1a — „Hegyre fel!” 3D nézet (végrehajtás J1a 6.; terv 5.1; K.4/1–7, K.5 KSZ-5–8, KSZ-11).
 *
 * A figura egy hegyi úton fut három sávban, a kamera mögötte–fölötte; mögötte a hullám (`waveGap` szerint közeledik, közel
 * érve alulról a képbe tornyosul). Akadályok (uszadékfa, kerítés, felborult kocsi), kagylók, kapuk (sávonként színes,
 * szimbólumos tábla — a válasz-feliratok a lap DOM-tábláin, U-J1-1), szakaszonként változó táj (tengerpart → falu → erdő →
 * hegyoldal), a távolban a cél: a hegytetői menedék.
 *
 * TISZTÁN NÉZET: a mag állapotát olvassa (`viewRef.current.core`) képkockánként, interpolálva (`alpha`), semmit nem ír
 * vissza; a lap a mag eseményeiből effekteket tesz a `fx` sorba (szikra, por). A forró úton nincs allokáció (modul-szintű
 * ideiglenes objektumok); ismétlődő tárgy `InstancedMesh` előre rögzített kapacitással (KSZ-6, KSZ-7). A renderer a közös
 * `useThreeScene` (`createGameRenderer`, tier-plafon, `webglcontextlost` → a lap DOM-tartaléka), a hurok `requestGameFrame`
 * (a lejárt kupon alatt áll, #477).
 */

export type TsunamiFx = { type: string; lane: number; at: number };

export type TsunamiRunnerView = {
  core: TsunamiCore | null;
  /** A fix lépésű hurok interpolációs alphája (0..1). */
  alpha: number;
  /** Effekt-sor (a lap tölti, a jelenet üríti). */
  fx: TsunamiFx[];
  /** A sávok közepe a vászon szélességének arányában a futó előtt (a lap a kapu-táblákat ide igazítja). */
  laneScreenX: [number, number, number];
  /** A „hullám közel” jelzés erőssége (0..1) a lap veszély-keretéhez. */
  danger: number;
};

export function createRunnerView(): TsunamiRunnerView {
  return { core: null, alpha: 1, fx: [], laneScreenX: [0.2, 0.5, 0.8], danger: 0 };
}

/** A sávok színe és szimbóluma (a DOM-táblák és a 3D kapuk közös jele — nem csak szín: színtévesztők is). */
export const TSUNAMI_LANE_COLORS = ["#fbbf24", "#f472b6", "#38bdf8"] as const;
export const TSUNAMI_LANE_SYMBOLS = ["●", "▲", "■"] as const;

export type TsunamiScene3DProps = {
  viewRef: MutableRefObject<TsunamiRunnerView>;
  /** "play": fut az animáció; egyébként (szünet, eredmény) áll. */
  phase: string;
  /** A lap könnyű-grafika jelzése: kevesebb díszlet és részecske. */
  light: boolean;
  /** WebGL-elérhetőség a lap DOM-tartalékához (spec E7). */
  onSupportedChange?: (supported: boolean | null) => void;
};

/** Egy sáv szélessége (világ-egység = m). */
export const LANE_W = 2.3;
const ROAD_HALF = LANE_W * 1.5 + 0.9;
const VIEW_FAR = 120;
const FOG_NEAR = 45;
const FOG_FAR = 115;
const STAGE_GROUND = ["#f2d9a0", "#8fd46c", "#4fa95c", "#a9b8a0"].map((c) => new THREE.Color(c));
const STAGE_SKY_TOP = ["#2a8fe0", "#2f86d6", "#2c7cc4", "#4b86c6"].map((c) => new THREE.Color(c));
const STAGE_HORIZON = ["#b5e6fb", "#c7ecf9", "#cde7d9", "#dfe8f0"].map((c) => new THREE.Color(c));
const GREEN = new THREE.Color("#22c55e");
const ORANGE = new THREE.Color("#fb923c");

/* --------------------------------------------- építőelemek --------------------------------------------- */

function std(color: THREE.ColorRepresentation, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts });
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

/** Determinisztikus kozmetikai zaj (a díszlet elrendezéséhez; nem a játék véletlenje). */
function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildPalm(): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.CylinderGeometry(0.12, 0.17, 3, 7);
  trunk.translate(0, 1.5, 0);
  group.add(mesh(trunk, std("#a8733f", { flatShading: true, roughness: 0.9 })));
  const leafParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.SphereGeometry(0.5, 8, 4);
    leaf.scale(1.9, 0.12, 0.46);
    leaf.translate(0.85, 0, 0);
    leaf.rotateZ(-0.45);
    leaf.rotateY((i / 6) * Math.PI * 2);
    leaf.translate(0, 3.05, 0);
    leafParts.push(leaf);
  }
  const leaves = mergeGeometries(leafParts) ?? new THREE.SphereGeometry(0.8, 8, 4);
  leafParts.forEach((p) => p.dispose());
  group.add(mesh(leaves, std("#2fb35a", { flatShading: true, roughness: 0.8 })));
  return group;
}

function buildTree(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 6), std("#8a5a32", { flatShading: true }), 0, 0.6, 0));
  group.add(mesh(new THREE.ConeGeometry(1.1, 2.4, 7), std(color, { flatShading: true, roughness: 0.85 }), 0, 2.2, 0));
  return group;
}

function buildHouse(wall: THREE.ColorRepresentation, roof: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(2.4, 1.7, 2, 2, 0.08), std(wall, { roughness: 0.75 }), 0, 0.85, 0));
  const roofGeo = new THREE.ConeGeometry(1.95, 1.3, 4);
  roofGeo.rotateY(Math.PI / 4);
  group.add(mesh(roofGeo, std(roof, { flatShading: true, roughness: 0.55 }), 0, 2.35, 0));
  group.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), std("#ffe9a8", { emissive: "#ffc94a", emissiveIntensity: 0.9 }), 0.55, 1.0, 1.02));
  return group;
}

function buildRock(): THREE.Group {
  const group = new THREE.Group();
  const g = new THREE.DodecahedronGeometry(1, 0);
  g.scale(1.2, 0.8, 1);
  group.add(mesh(g, std("#9aa3a0", { flatShading: true, roughness: 0.95 }), 0, 0.5, 0));
  return group;
}

type Runner = { group: THREE.Group; body: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; head: THREE.Group };

/** Barátságos, kockás gyerek-figura (~1,6 m), háttal a kamerának; az eredete a talppontja. */
function buildRunner(): Runner {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const skin = std("#f7c6a0");
  const legMat = std("#4f46e5");
  const shoeMat = std("#f8fafc", { roughness: 0.5 });
  const makeLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.16, 0.72, 0);
    hip.add(mesh(new RoundedBoxGeometry(0.2, 0.62, 0.22, 2, 0.05), legMat, 0, -0.31, 0), mesh(new RoundedBoxGeometry(0.24, 0.12, 0.32, 2, 0.04), shoeMat, 0, -0.66, -0.04));
    body.add(hip);
    return hip;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  body.add(mesh(new RoundedBoxGeometry(0.6, 0.62, 0.36, 2, 0.08), std("#fb7a1c"), 0, 1.0, 0));
  body.add(mesh(new RoundedBoxGeometry(0.44, 0.34, 0.12, 2, 0.04), std("#2563eb"), 0, 1.06, 0.2)); // hátizsák
  const armMat = std("#fb7a1c");
  const makeArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.38, 1.24, 0);
    pivot.add(mesh(new RoundedBoxGeometry(0.16, 0.5, 0.18, 2, 0.05), armMat, 0, -0.24, 0), mesh(new THREE.SphereGeometry(0.1, 10, 8), skin, 0, -0.52, 0));
    body.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const head = new THREE.Group();
  head.position.set(0, 1.36, 0);
  body.add(head);
  head.add(mesh(new RoundedBoxGeometry(0.52, 0.46, 0.44, 3, 0.1), skin, 0, 0.22, 0));
  head.add(mesh(new RoundedBoxGeometry(0.56, 0.2, 0.48, 2, 0.06), std("#6b3f1d"), 0, 0.44, 0.02));
  head.add(mesh(new RoundedBoxGeometry(0.56, 0.34, 0.12, 2, 0.05), std("#6b3f1d"), 0, 0.26, 0.2));
  return { group, body, armL, armR, legL, legR, head };
}

/** Kapu: két oszlop, gerenda, színes tábla a sáv szimbólumával. */
type Arch = { group: THREE.Group; panel: THREE.MeshStandardMaterial; glow: THREE.Sprite; base: THREE.Color };

function buildArch(lane: number, tex: THREE.Texture): Arch {
  const group = new THREE.Group();
  const color = new THREE.Color(TSUNAMI_LANE_COLORS[lane]);
  const postMat = std("#f8fafc", { roughness: 0.4 });
  const w = LANE_W * 0.86;
  for (const side of [-1, 1]) group.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.1, 8), postMat, (side * w) / 2, 1.55, 0));
  group.add(mesh(new RoundedBoxGeometry(w + 0.3, 0.22, 0.22, 2, 0.06), postMat, 0, 3.1, 0));
  const panel = new THREE.MeshStandardMaterial({ color, map: tex, emissive: color, emissiveIntensity: 0.55, transparent: true, opacity: 0.92, side: THREE.DoubleSide, roughness: 0.5 });
  group.add(mesh(new THREE.PlaneGeometry(w * 0.82, 0.95), panel, 0, 2.45, 0));
  const glow = createGlowSprite(TSUNAMI_LANE_COLORS[lane], 2.2, 0.55);
  glow.position.set(0, 3.5, 0);
  group.add(glow);
  return { group, panel, glow, base: color };
}

/** A hullám fala: ívelt, felül előrebukó tarajjal (a csúcsok képkockánként hullámzanak, helyben írva). */
function buildWave(segX: number): { mesh: THREE.Mesh; base: Float32Array } {
  const geo = new THREE.PlaneGeometry(36, 7, segX, 10);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const deep = new THREE.Color("#0b4a8a");
  const mid = new THREE.Color("#1aa3d9");
  const foam = new THREE.Color("#f0fbff");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const v = (pos.getY(i) + 3.5) / 7; // 0 alul … 1 felül
    // A taraj előrebukik (−z felé, a futó irányába).
    pos.setZ(i, -Math.pow(Math.max(0, v - 0.55) / 0.45, 2) * 2.2);
    pos.setY(i, pos.getY(i) + 3.5);
    if (v < 0.6) c.copy(deep).lerp(mid, v / 0.6);
    else c.copy(mid).lerp(foam, Math.min(1, (v - 0.6) / 0.3));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const base = Float32Array.from(pos.array as ArrayLike<number>);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05, emissive: "#0b3a66", emissiveIntensity: 0.25, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return { mesh: m, base };
}

/* --------------------------------------------- a jelenet --------------------------------------------- */

/** Az InstancedMesh látható darabszáma (képkockánként, allokáció nélkül). */
function setCount(m: THREE.InstancedMesh, n: number): void {
  m.count = n;
  m.instanceMatrix.needsUpdate = true;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(0, 0.6, 1);
const EULER = new THREE.Euler();

function setupRunner({ scene, tier, reducedMotion }: ThreeSceneContext, props: MutableRefObject<TsunamiScene3DProps>, light: boolean): ThreeSceneController {
  const budget = LOOK_BUDGET[tier];
  const lean = light || tier === "low";
  const particleScale = budget.particleScale * (light ? 0.5 : 1);
  const view = () => props.current.viewRef.current;

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
  scene.fog = new THREE.Fog(STAGE_HORIZON[0]!.clone(), FOG_NEAR, FOG_FAR);

  const sky = createGradientSky({ top: "#2a8fe0", horizon: "#b5e6fb", bottom: "#9fd6ee", sunDirection: new THREE.Vector3(0.4, 0.35, -1), sunColor: "#fff0b0", sunSize: 0.05, radius: 200 });
  scene.add(sky);
  const skyU = sky.material.uniforms;
  scene.add(new THREE.HemisphereLight("#e0f4ff", "#7aa86a", 1.15));
  const key = new THREE.DirectionalLight("#fff3dc", 1.7);
  key.position.set(4, 9, 6);
  scene.add(key);

  // Talaj két oldalt (szakaszonként színeződik) és az út (görgetett textúra, sávjelekkel).
  const groundMat = std(STAGE_GROUND[0]!.clone(), { roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, VIEW_FAR + 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -VIEW_FAR / 2 + 10);
  scene.add(ground);
  const roadTex = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = "#a8835a";
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = "#94714a";
    for (let i = 0; i < 40; i++) ctx.fillRect(hash(i) * 128, hash(i + 50) * 256, 3, 6);
    ctx.fillStyle = "#fff8e1";
    for (const x of [128 / 3, (2 * 128) / 3]) for (let y = 0; y < 256; y += 64) ctx.fillRect(x - 2, y, 4, 34);
    ctx.fillStyle = "#8b6a3e";
    ctx.fillRect(0, 0, 6, 256);
    ctx.fillRect(122, 0, 6, 256);
  });
  roadTex.wrapT = THREE.RepeatWrapping;
  const ROAD_TILE = 8;
  roadTex.repeat.set(1, (VIEW_FAR + 40) / ROAD_TILE);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, VIEW_FAR + 40), std("#ffffff", { map: roadTex, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -VIEW_FAR / 2 + 10);
  scene.add(road);

  // A cél: hegy a menedékkel a távolban (közeledik és nő az előrehaladással).
  const goal = new THREE.Group();
  goal.add(mesh(new THREE.ConeGeometry(38, 30, 8), std("#7e9fbf", { flatShading: true, roughness: 1, fog: false })));
  goal.add(mesh(new THREE.ConeGeometry(11, 8.5, 8), std("#ffffff", { flatShading: true, fog: false }), 0, 11, 0));
  const hut = new THREE.Group();
  hut.add(mesh(new THREE.BoxGeometry(3, 2, 2.4), std("#b45309", { fog: false }), 0, 1, 0));
  const hutRoof = new THREE.ConeGeometry(2.6, 1.6, 4);
  hutRoof.rotateY(Math.PI / 4);
  hut.add(mesh(hutRoof, std("#dc2626", { fog: false }), 0, 2.8, 0));
  hut.position.set(0, 15, 0);
  goal.add(hut);
  const flagGlow = createGlowSprite("#fde68a", 9, 0.7);
  flagGlow.position.set(0, 19, 0);
  goal.add(flagGlow);
  goal.position.set(0, -2, -200);
  scene.add(goal);

  // Díszlet az út két oldalán: körbeforgó helyek, a szakasznak megfelelő tárggyal (pálma, ház, fa, szikla).
  type Slot = { objs: THREE.Group[]; z: number; side: number; off: number; seed: number };
  const SLOTS = lean ? 10 : 16;
  const SPACING = (VIEW_FAR + 10) / (SLOTS / 2);
  const houseColors: [string, string][] = [["#ffd6a5", "#e5484d"], ["#bde0fe", "#2563eb"], ["#ffc8dd", "#7c3aed"], ["#caffbf", "#f97316"]];
  const slots: Slot[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const hc = houseColors[i % houseColors.length]!;
    const objs = [buildPalm(), buildHouse(hc[0], hc[1]), buildTree(i % 2 ? "#3fa65a" : "#4cbf5f"), buildRock()];
    for (const o of objs) {
      o.visible = false;
      scene.add(o);
    }
    slots.push({ objs, z: -Math.floor(i / 2) * SPACING - hash(i) * 4, side: i % 2 ? 1 : -1, off: 2.2 + hash(i + 9) * 4.5, seed: i });
  }
  const showSlot = (s: Slot, stage: number) => {
    // Szakaszonként: 0 tengerpart = pálma; 1 falu = ház / pálma; 2 erdő = fa; 3 hegyoldal = szikla / fa.
    const h = hash(s.seed * 7 + Math.floor(-s.z));
    const pick = stage === 0 ? 0 : stage === 1 ? (h < 0.6 ? 1 : 0) : stage === 2 ? 2 : h < 0.5 ? 3 : 2;
    for (let k = 0; k < s.objs.length; k++) s.objs[k]!.visible = k === pick;
  };
  for (const s of slots) showSlot(s, 0);

  // Akadály-készlet (InstancedMesh, KSZ-6/7): fa, kerítés (oszlop + léc), kocsi (karosszéria + kabin + kerekek).
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const logGeo = new THREE.CylinderGeometry(0.3, 0.3, LANE_W * 0.82, 10);
  logGeo.rotateZ(Math.PI / 2);
  logGeo.translate(0, 0.3, 0);
  const logs = inst(logGeo, std("#8b5a2b", { flatShading: true }), OBSTACLE_CAP);
  const postGeo = mergeGeometries([-0.85, 0, 0.85].map((x) => new THREE.BoxGeometry(0.14, 0.95, 0.14).translate(x, 0.47, 0))) ?? new THREE.BoxGeometry(1, 1, 1);
  const fencePosts = inst(postGeo, std("#f8fafc"), OBSTACLE_CAP);
  const railGeo = mergeGeometries([0.35, 0.72].map((y) => new THREE.BoxGeometry(LANE_W * 0.86, 0.14, 0.08).translate(0, y, 0))) ?? new THREE.BoxGeometry(1, 1, 1);
  const fenceRails = inst(railGeo, std("#ef4444"), OBSTACLE_CAP);
  // A felborult kocsi: a kabin alul (fejjel lefelé), a karosszéria fölötte, a kerekek az égnek.
  const carCabGeo = new RoundedBoxGeometry(1.45, 0.55, 1.4, 2, 0.12).translate(0, 0.28, 0);
  const carCab = inst(carCabGeo, std("#93c5fd", { roughness: 0.25 }), OBSTACLE_CAP);
  const carBodyGeo = new RoundedBoxGeometry(1.75, 0.75, 2.6, 2, 0.15).translate(0, 0.92, 0);
  const carBody = inst(carBodyGeo, std("#e11d48", { roughness: 0.45 }), OBSTACLE_CAP);
  const wheelParts: THREE.BufferGeometry[] = [];
  for (const x of [-0.8, 0.8]) for (const z of [-0.85, 0.85]) wheelParts.push(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12).rotateZ(Math.PI / 2).translate(x, 1.42, z));
  const carWheels = inst(mergeGeometries(wheelParts) ?? new THREE.BoxGeometry(1, 1, 1), std("#1f2937"), OBSTACLE_CAP);
  wheelParts.forEach((p) => p.dispose());

  const shellGeo = new THREE.SphereGeometry(0.26, 10, 6);
  shellGeo.scale(1, 0.62, 0.85);
  shellGeo.translate(0, 0.55, 0);
  const shells = inst(shellGeo, std("#fda4af", { emissive: "#fb7185", emissiveIntensity: 0.45, roughness: 0.3 }), SHELL_CAP);

  // Kapuk: három ív (egyetlen kérdéshez), szimbólum-textúrával.
  const symbolTex = TSUNAMI_LANE_SYMBOLS.map((sym) =>
    canvasTexture(128, 96, (ctx) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 128, 96);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 64px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sym, 64, 52);
    }),
  );
  const arches = [0, 1, 2].map((l) => {
    const a = buildArch(l, symbolTex[l]!);
    a.group.visible = false;
    scene.add(a.group);
    return a;
  });

  // A futó és a hullám.
  const runner = buildRunner();
  scene.add(runner.group);
  const runnerGlow = createGlowSprite("#fde047", 2.4, 0);
  runnerGlow.position.set(0, 0.9, 0.2);
  runner.group.add(runnerGlow);
  const wave = buildWave(lean ? 24 : 40);
  scene.add(wave.mesh);

  const sparkles = new SparkleField(scene, Math.max(48, Math.round(360 * particleScale)));

  let laneSpeedX = 0;
  let prevRx = 0;
  let runPhase = 0;
  let stageBlend = 0;
  let waveSpray = 0;
  let fxSeed = 1;
  const fxRand = () => {
    fxSeed = (fxSeed * 16807) % 2147483647;
    return fxSeed / 2147483647;
  };
  const motionK = reducedMotion ? 0.3 : 1;

  const projectLanes = () => {
    const out = view().laneScreenX;
    camera.updateMatrixWorld();
    for (let l = 0; l < 3; l++) {
      tmpV.set((l - 1) * LANE_W, 1.2, -9).project(camera);
      out[l] = Math.min(0.97, Math.max(0.03, (tmpV.x + 1) / 2));
    }
  };

  const placeCamera = (rx: number) => {
    camera.position.set(rx * 0.55, 5.2, 8.6);
    camera.lookAt(rx * 0.4, 0.3, -12);
  };

  const controller: ThreeSceneController = {
    camera,
    bloom: { strength: 0.5, radius: 0.3, threshold: 1.5 },
    resize(w, h) {
      // Fekvő nézetben szűkebb látószög: az út ne vesszen el a kép közepén.
      camera.fov = w > h ? 46 : 62;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      placeCamera(0);
      sparkles.setViewportHeight(h, camera.fov);
      projectLanes();
    },
    update(dt) {
      const v = view();
      const core = v.core;
      if (!core) return;
      const st = core.state();
      const playing = props.current.phase === "play";
      const a = Math.min(1, Math.max(0, v.alpha));
      const dist = st.prevDistance + (st.distance - st.prevDistance) * a;
      const rx = (st.prevX + (st.x - st.prevX) * a) * LANE_W;
      const ry = st.prevY + (st.y - st.prevY) * a;
      const frame = playing ? dt : 0;

      // Szakasz: talaj / ég színe lassan átúszik.
      stageBlend += ((st.stage as number) - stageBlend) * Math.min(1, frame * 0.8);
      const s0 = Math.min(3, Math.floor(stageBlend));
      const s1 = Math.min(3, s0 + 1);
      const f = stageBlend - s0;
      groundMat.color.copy(STAGE_GROUND[s0]!).lerp(STAGE_GROUND[s1]!, f);
      (skyU.topColor.value as THREE.Color).copy(STAGE_SKY_TOP[s0]!).lerp(STAGE_SKY_TOP[s1]!, f);
      (skyU.horizonColor.value as THREE.Color).copy(STAGE_HORIZON[s0]!).lerp(STAGE_HORIZON[s1]!, f);
      (scene.fog as THREE.Fog).color.copy(skyU.horizonColor.value as THREE.Color);

      roadTex.offset.y = (dist / ROAD_TILE) % 1;
      placeCamera(rx);
      sky.position.copy(camera.position);

      // Cél-hegy: az előrehaladással közelebb és nagyobb.
      const prog = Math.min(1, st.distance / Math.max(1, core.tuning().levelDistance));
      goal.position.z = -200 + prog * 70;
      goal.scale.setScalar(1 + prog * 0.5);

      // Díszlet: a futó mögé került hely előreugrik.
      for (const s of slots) {
        let z = s.z + dist;
        if (z > 8) {
          s.z -= SPACING * (SLOTS / 2);
          z = s.z + dist;
          showSlot(s, st.stage);
        }
        for (const o of s.objs) if (o.visible) o.position.set(s.side * (ROAD_HALF + s.off), 0, z);
      }

      // Akadályok.
      let nl = 0;
      let nf = 0;
      let nc = 0;
      for (let i = 0; i < st.obstacles.length; i++) {
        const o = st.obstacles[i]!;
        if (!o.alive) continue;
        const z = -(o.at - dist);
        if (z < -VIEW_FAR || z > 8) continue;
        // Elütve: oldalra billen (látható következmény).
        EULER.set(0, 0, o.hit ? 0.5 * (o.lane === 0 ? -1 : 1) : 0);
        tmpQ.setFromEuler(EULER);
        tmpP.set((o.lane - 1) * LANE_W + (o.hit ? (o.lane === 0 ? -0.6 : 0.6) : 0), 0, z);
        tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
        const kind: ObstacleKind = o.kind;
        if (kind === "log") logs.setMatrixAt(nl++, tmpM);
        else if (kind === "fence") {
          fencePosts.setMatrixAt(nf, tmpM);
          fenceRails.setMatrixAt(nf++, tmpM);
        } else {
          carBody.setMatrixAt(nc, tmpM);
          carCab.setMatrixAt(nc, tmpM);
          carWheels.setMatrixAt(nc++, tmpM);
        }
      }
      setCount(logs, nl);
      setCount(fencePosts, nf);
      setCount(fenceRails, nf);
      setCount(carBody, nc);
      setCount(carCab, nc);
      setCount(carWheels, nc);

      // Kagylók (forognak).
      let ns = 0;
      for (let i = 0; i < st.shells.length; i++) {
        const s = st.shells[i]!;
        if (!s.alive) continue;
        const z = -(s.at - dist);
        if (z < -VIEW_FAR || z > 6) continue;
        EULER.set(0, (s.at * 0.7 + runPhase * 0.5) * motionK, 0);
        tmpQ.setFromEuler(EULER);
        tmpP.set((s.lane - 1) * LANE_W, reducedMotion ? 0 : Math.sin(s.at + runPhase) * 0.12, z);
        tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
        shells.setMatrixAt(ns++, tmpM);
      }
      shells.count = ns;
      shells.instanceMatrix.needsUpdate = true;

      // Kapu: a sávonkénti ívek; eldőlt kérdésnél a helyes zöld, a választott (rossz) narancs, a többi halvány.
      const g = st.gates;
      for (let l = 0; l < 3; l++) {
        const arch = arches[l]!;
        if (!g || g.laneOptions[l]! < 0) {
          arch.group.visible = false;
          continue;
        }
        const z = -(g.atDistance - dist);
        arch.group.visible = z < 8 && z > -VIEW_FAR;
        arch.group.position.set((l - 1) * LANE_W, 0, z);
        let col = arch.base;
        let glow = 0.55;
        if (g.resolved) {
          if (l === g.correctLane) {
            col = GREEN;
            glow = 0.95;
          } else if (l === g.pickedLane) col = ORANGE;
          else glow = 0.15;
        }
        arch.panel.color.copy(col);
        arch.panel.emissive.copy(col);
        arch.panel.emissiveIntensity = g.resolved && l === g.correctLane ? 1.1 : 0.55;
        arch.panel.opacity = g.resolved && l !== g.correctLane && l !== g.pickedLane ? 0.45 : 0.92;
        (arch.glow.material as THREE.SpriteMaterial).color.copy(col);
        (arch.glow.material as THREE.SpriteMaterial).opacity = reducedMotion ? glow * 0.7 : glow * (0.8 + 0.2 * Math.sin(runPhase * 2));
      }

      // A futó: folyamatos futó-animáció (csak játékban), ugrás, sávváltásnál dőlés, botláskor előrebukás.
      if (frame > 0) laneSpeedX += ((rx - prevRx) / frame - laneSpeedX) * Math.min(1, frame * 12);
      prevRx = rx;
      const speedK = st.speed / Math.max(1, core.tuning().speed);
      if (playing) runPhase += frame * (8 + 6 * speedK);
      const swing = Math.sin(runPhase) * motionK * (ry > 0.05 ? 0.25 : 1);
      runner.group.position.set(rx, ry, 0);
      runner.group.rotation.set(st.stumbleMs > 0 ? 0.35 * motionK : -0.08, Math.PI, THREE.MathUtils.clamp(-laneSpeedX * 0.03, -0.3, 0.3) * motionK);
      runner.legL.rotation.x = swing * 0.9;
      runner.legR.rotation.x = -swing * 0.9;
      runner.armL.rotation.x = -swing * 0.8;
      runner.armR.rotation.x = swing * 0.8;
      runner.body.position.y = ry > 0.05 ? 0 : Math.abs(Math.sin(runPhase)) * 0.06 * motionK;
      const turbo = st.turboMs > 0 || st.miniTurboMs > 0;
      (runnerGlow.material as THREE.SpriteMaterial).opacity = turbo ? 0.55 : 0;
      if (turbo && playing && !reducedMotion) {
        tmpP.set(rx + (fxRand() - 0.5) * 0.6, 0.4 + fxRand() * 1.2, 0.6);
        sparkles.emit(tmpP, { count: 1, color: "#fde68a", speed: 6, life: 0.35, gravity: 0, size: 0.18, direction: BACK, directionality: 0.9, spread: 0.2 });
      }

      // A hullám a futó mögött: közel érve alulról a képbe tornyosul (a rés vizuálisan sűrítve).
      const behind = 1.4 + Math.max(0, st.waveGap) * 0.33;
      wave.mesh.position.set(rx * 0.3, -0.4, behind);
      const pos = wave.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const t = runPhase * 0.25;
      for (let i = 0; i < pos.count; i++) {
        const bx = wave.base[i * 3]!;
        const by = wave.base[i * 3 + 1]!;
        const top = by / 7;
        arr[i * 3 + 1] = by + (reducedMotion ? 0 : Math.sin(bx * 0.6 + t * 3) * 0.35 * top);
        arr[i * 3 + 2] = wave.base[i * 3 + 2]! + (reducedMotion ? 0 : Math.sin(bx * 0.45 - t * 2.2) * 0.4 * top);
      }
      pos.needsUpdate = true;
      v.danger = Math.max(0, Math.min(1, (12 - st.waveGap) / 10));
      if (playing && !reducedMotion && behind < 7.5) {
        waveSpray += frame * 40 * particleScale;
        while (waveSpray >= 1) {
          waveSpray -= 1;
          tmpP.set(rx + (fxRand() - 0.5) * 9, 6.2, behind - 1.6);
          sparkles.emit(tmpP, { count: 1, color: fxRand() < 0.6 ? "#ffffff" : "#bff4ff", speed: 2.4, life: 0.8, gravity: 4, size: 0.3, direction: UP, directionality: 0.6, spread: 0.6 });
        }
      }

      // Effektek a lap eseményeiből.
      for (let i = 0; i < v.fx.length; i++) {
        const e = v.fx[i]!;
        const z = -(e.at - dist);
        const x = e.lane >= 0 && e.lane <= 2 ? (e.lane - 1) * LANE_W : rx;
        tmpP.set(x, 0.8, z);
        if (reducedMotion && e.type !== "gateCorrect") continue;
        if (e.type === "shell") sparkles.emit(tmpP, { count: Math.max(2, Math.round(8 * particleScale)), color: "#fda4af", speed: 3, life: 0.5, gravity: 5, size: 0.22, direction: UP, directionality: 0.6, spread: 0.2 });
        else if (e.type === "shellRow") sparkles.emit(tmpP, { count: Math.max(4, Math.round(24 * particleScale)), color: "#fde047", speed: 4, life: 0.7, gravity: 3, size: 0.3, direction: UP, directionality: 0.5, spread: 0.5 });
        else if (e.type === "collide") sparkles.emit(tmpP.set(rx, 0.5, -0.6), { count: Math.max(4, Math.round(20 * particleScale)), color: "#d6b98a", speed: 3.5, life: 0.6, gravity: 6, size: 0.35, direction: UP, directionality: 0.4, spread: 0.6 });
        else if (e.type === "cleared") sparkles.emit(tmpP, { count: Math.max(3, Math.round(12 * particleScale)), color: "#e0f7ff", speed: 3, life: 0.6, gravity: 3, size: 0.4, direction: UP, directionality: 0.5, spread: 0.8 });
        else if (e.type === "gateCorrect") sparkles.emit(tmpP.set(x, 2.4, Math.min(z, -1)), { count: Math.max(6, Math.round(36 * particleScale)), color: "#4ade80", speed: 4.5, life: 0.8, gravity: 2, size: 0.32, direction: UP, directionality: 0.3, spread: 0.8 });
        else if (e.type === "land" && ry < 0.05) sparkles.emit(tmpP.set(rx, 0.1, 0.2), { count: Math.max(2, Math.round(6 * particleScale)), color: "#e7cfa0", speed: 1.5, life: 0.4, gravity: 4, size: 0.25, direction: UP, directionality: 0.3, spread: 0.4 });
      }
      v.fx.length = 0;
      sparkles.update(frame > 0 ? frame : dt * 0.25);
    },
    dispose() {
      sparkles.dispose();
    },
  };
  return controller;
}

export default function TsunamiScene3D(props: TsunamiScene3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const { supported } = useThreeScene(canvasRef, (ctx) => setupRunner(ctx, propsRef, props.light), [props.light], { exposure: 1.05, shadows: false });
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
