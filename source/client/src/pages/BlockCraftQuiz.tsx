import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Box, Pickaxe, Star, Flame, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import GameNextGoalBar from "@/components/GameNextGoalBar";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";

const TILE = 24;
const ROWS = 16;
const COLS = 64;
const GRAVITY = 2200;
const MOVE_SPEED = 188;
const JUMP_V = 550;
const PLAYER_W = 14;
const PLAYER_H = 26;
const ROUND_LIMIT = 180;
/** Mini-cél a sorozat-sávhoz (látható „következő lépés”) */
const ROUND_STREAK_GOAL = 5;
/** Koppintásos bányászás max. hatótáv (Chebyshev, „csempe” egységben); kisebb = kevésbé érzékeny messzi kockákra. */
const MINING_REACH_TILES = 2.85;

const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const STONE = 3;
const LOG = 4;
const LEAVES = 5;
const COAL = 6;
const IRON = 7;
const DIAMOND = 8;
/** Alul: nem bányászható, nem esik át rajta a játékos */
const BEDROCK = 9;
/** Creeper mob a felszínen — bónusz kvíz, dupla XP */
const CREEPER = 10;

type Quiz = { prompt: string; options: string[]; correctIndex: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type QuizBankApi = {
  items: { prompt: string; options: string[]; correctIndex: number }[];
};

const QUIZ_FALLBACK: Quiz[] = [
  { prompt: "„Stone” jelentése:", options: ["kő", "hó", "fény", "híd"], correctIndex: 0 },
  { prompt: "„Pickaxe” jelentése:", options: ["lapát", "csákány", "kard", "háló"], correctIndex: 1 },
  { prompt: "„Diamond” magyarul:", options: ["arany", "gyémánt", "szén", "vas"], correctIndex: 1 },
  { prompt: "„Forest” magyarul:", options: ["tenger", "hegy", "erdő", "hűtő"], correctIndex: 2 },
  { prompt: "„Build” jelentése:", options: ["épít", "fut", "ugrik", "bányászik"], correctIndex: 0 },
  { prompt: "Mit jelent: „Craft a tool”?", options: ["eszközt készít", "futni tanul", "többet alszik", "vizet gyűjt"], correctIndex: 0 },
  { prompt: "„Grass” magyarul:", options: ["fű", "jég", "kő", "ég"], correctIndex: 0 },
  { prompt: "„Dirt” magyarul:", options: ["homok", "föld", "víz", "ég"], correctIndex: 1 },
  { prompt: "„Wood” / faanyag angolul a játékban gyakran:", options: ["water", "wood", "wind", "wolf"], correctIndex: 1 },
  { prompt: "„Leaves” jelentése:", options: ["gyökerek", "levelek", "kövek", "felhők"], correctIndex: 1 },
  { prompt: "„Coal” magyarul:", options: ["réz", "szén", "cukor", "kő"], correctIndex: 1 },
  { prompt: "„Iron” magyarul:", options: ["arany", "vas", "ezüst", "réz"], correctIndex: 1 },
  { prompt: "„Jump” jelentése:", options: ["fut", "ugrás / ugrik", "áll", "esik"], correctIndex: 1 },
  { prompt: "„Mine” ebben a játékban:", options: ["fest", "bányászik", "főz", "úszik"], correctIndex: 1 },
  { prompt: "„Block” jelentése:", options: ["kocka / blokk", "labda", "ajtó", "ablak"], correctIndex: 0 },
  { prompt: "„Sky” magyarul:", options: ["föld", "ég / égbolt", "víz", "erdő"], correctIndex: 1 },
  { prompt: "„River” magyarul:", options: ["hegy", "folyó", "út", "ház"], correctIndex: 1 },
  { prompt: "„Bridge” magyarul:", options: ["híd", "bástya", "bokor", "bárány"], correctIndex: 0 },
  { prompt: "„Castle” magyarul:", options: ["kert", "vár", "vonat", "villa"], correctIndex: 1 },
  { prompt: "„Star” magyarul:", options: ["hold", "csillag", "felhő", "szél"], correctIndex: 1 },
  { prompt: "„Moon” magyarul:", options: ["nap", "hold", "hó", "hajó"], correctIndex: 1 },
  { prompt: "„Rain” magyarul:", options: ["hó", "eső", "szél", "nap"], correctIndex: 1 },
  { prompt: "„Snow” magyarul:", options: ["jég", "hó", "eső", "homok"], correctIndex: 1 },
  { prompt: "„Happy” magyarul:", options: ["szomorú", "boldog", "fáradt", "mérges"], correctIndex: 1 },
  { prompt: "„Big” magyarul:", options: ["kicsi", "nagy", "lassú", "rövid"], correctIndex: 1 },
  { prompt: "„Small” magyarul:", options: ["nagy", "kicsi", "kövér", "mély"], correctIndex: 1 },
  // === SZITUÁCIÓS MINECRAFT KÉRDÉSEK ===
  { prompt: "Éjszaka van, zombik jönnek! Mit csinálsz?", options: ["Build a shelter", "Go swimming", "Take a nap", "Eat diamonds"], correctIndex: 0 },
  { prompt: "A creeper felrobban! Angolul:", options: ["The creeper explodes!", "The creeper sleeps", "The creeper sings", "The creeper dances"], correctIndex: 0 },
  { prompt: "Hogyan mondod: 'Készíts egy kardot'?", options: ["Craft a sword", "Cook a sword", "Plant a sword", "Drink a sword"], correctIndex: 0 },
  { prompt: "Mit jelent: 'Watch out for lava!'?", options: ["Vigyázz a lávára!", "Nézd a vizet!", "Keresd a gyémántot!", "Építs házat!"], correctIndex: 0 },
  { prompt: "Éhes vagy Minecraftban. Mit csinálsz?", options: ["Find food", "Mine stone", "Jump around", "Sleep outside"], correctIndex: 0 },
  { prompt: "'You found diamonds!' mit jelent?", options: ["Gyémántot találtál!", "Köveket látod!", "Fát vágsz!", "Vizet iszol!"], correctIndex: 0 },
  { prompt: "Milyen eszközzel bányászol követ? Angolul:", options: ["With a pickaxe", "With a sword", "With a shovel", "With a bucket"], correctIndex: 0 },
  { prompt: "'Help! A skeleton is shooting at me!' mit jelent?", options: ["Segítség! Egy csontváz lő rám!", "Segítség! Éhes vagyok!", "Hol van a ház?", "Fussunk!"], correctIndex: 0 },
  { prompt: "'It’s dangerous to go alone!' mit jelent?", options: ["Veszélyes egyedl menni!", "Gyorsan bányássz!", "Keress vizet!", "Hol a gyémánt?"], correctIndex: 0 },
  { prompt: "'Run! The creeper is behind you!' mit jelent?", options: ["Fuss! A creeper mögötted van!", "Allé! Zombi jön!", "Keress barlangot!", "Gyúíts tüzet!"], correctIndex: 0 },
  // === CRAFTING RECEPTEK ===
  { prompt: "Mi kell a fáklyához? (angolul)", options: ["Coal + Stick", "Iron + Wood", "Diamond + Stone", "Grass + Dirt"], correctIndex: 0 },
  { prompt: "'Crafting table' magyarul:", options: ["munkasztal / kézműasztal", "konyhaasztal", "íróasztal", "kereskedő"], correctIndex: 0 },
  { prompt: "Mi kell a kardhoz? (alap: fa + fa) Angolul:", options: ["Wood + Wood", "Stone + Grass", "Coal + Stick", "Dirt + Sand"], correctIndex: 0 },
  { prompt: "'Sword' magyarul:", options: ["kard", "pajzs", "páncél", "nyíl"], correctIndex: 0 },
  { prompt: "'Bow' magyarul a Minecraftban:", options: ["ij", "kard", "pajzs", "csákány"], correctIndex: 0 },
  // === MOB-OK ANGOLUL ===
  { prompt: "Skeleton = ?", options: ["csontváz", "zombi", "pók", "deneér"], correctIndex: 0 },
  { prompt: "A 'Villager' magyarul:", options: ["falusi", "katona", "király", "boszorkány"], correctIndex: 0 },
  { prompt: "Creeper = ?", options: ["robbanó zöld szörny", "repülő deneér", "vörös sárkány", "vízi hal"], correctIndex: 0 },
  { prompt: "Zombie = ?", options: ["zombi", "démon", "kísértet", "varjú"], correctIndex: 0 },
  { prompt: "Spider = ?", options: ["pók", "hangya", "méh", "bogarak"], correctIndex: 0 },
  { prompt: "Witch = ?", options: ["boszorkány", "harcos", "varázslos herceg", "tündér"], correctIndex: 0 },
  { prompt: "Enderman = ?", options: ["magas fekete lény", "zöld creeper", "csontváz", "vízi szörny"], correctIndex: 0 },
  // === BIOME-OK ===
  { prompt: "Desert biome = ?", options: ["sivatag", "óceán", "dzsungel", "hegy"], correctIndex: 0 },
  { prompt: "'Nether' magyarul kb.:", options: ["alvílág / pokol", "mennyország", "óceán", "erdő"], correctIndex: 0 },
  { prompt: "Jungle biome = ?", options: ["dzsungel", "sivatag", "tundra", "folyó"], correctIndex: 0 },
  { prompt: "Ocean biome = ?", options: ["óceán", "hegy", "völgy", "barlang"], correctIndex: 0 },
  { prompt: "Swamp biome = ?", options: ["mocsár", "sivatag", "mező", "tenger"], correctIndex: 0 },
  // === SURVIVAL TIPPEK ===
  { prompt: "First night tip: 'Dig into a hillside!' Mit jelent?", options: ["Áss bele egy dombba!", "Ugorj a vízbe!", "Fuss el!", "Aludj a fán!"], correctIndex: 0 },
  { prompt: "'Always bring food on adventures!' mit jelent?", options: ["Mindig vigyél ételt a kalandhoz!", "Felejtsd el az ételt!", "Csak vizet igyy", "Aludj sokat!"], correctIndex: 0 },
  { prompt: "'Mine deeper for rare ores!' mit jelent?", options: ["Mélyebbre bányássz ritka ércekért!", "Maradj a felszínen!", "Keress vizet!", "Gyűjts fát!"], correctIndex: 0 },
  { prompt: "'Don't dig straight down!' mit jelent?", options: ["Ne áss egyenesen le!", "Mindig lefelé ássz!", "Gyorsan fuss!", "Bányássz követ!"], correctIndex: 0 },
  // === EXTRA SZÓKINCS ===
  { prompt: "'Shield' magyarul:", options: ["pajzs", "kard", "sisak", "csizma"], correctIndex: 0 },
  { prompt: "'Armor' magyarul:", options: ["páncél", "kesztyű", "sapka", "táska"], correctIndex: 0 },
  { prompt: "'Cave' magyarul:", options: ["barlang", "folyó", "völgy", "domb"], correctIndex: 0 },
  { prompt: "'Lava' magyarul:", options: ["láva", "víz", "homok", "jég"], correctIndex: 0 },
  { prompt: "'Torch' magyarul:", options: ["fáklya", "lámpa", "gyertya", "tűz"], correctIndex: 0 },
  { prompt: "'Chest' magyarul a játékban:", options: ["láda / mellény", "asztal", "ajtó", "ablak"], correctIndex: 0 },
  { prompt: "'Spawn' jelentése Minecraftban:", options: ["megjelenés / születési pont", "tárgy", "csontváz", "bányász"], correctIndex: 0 },
  { prompt: "Hogyan mondod: 'Gyere ide!'?", options: ["Come here!", "Go away!", "Mine this!", "Build that!"], correctIndex: 0 },
  { prompt: "'Careful!' angolul, ha veszely van:", options: ["Careful! / Watch out!", "Hello!", "Good job!", "Let's go!"], correctIndex: 0 },
  { prompt: "'Hungry' magyarul:", options: ["éhes", "szomjas", "fáradt", "beteg"], correctIndex: 0 },
  { prompt: "'Dangerous' magyarul:", options: ["veszélyes", "békés", "mély", "gyönyörű"], correctIndex: 0 },
];

const XP_BY_TILE: Record<number, number> = {
  [GRASS]: 20,
  [DIRT]: 24,
  [STONE]: 34,
  [LOG]: 30,
  [LEAVES]: 18,
  [COAL]: 56,
  [IRON]: 88,
  [DIAMOND]: 140,
  [AIR]: 0,
  [BEDROCK]: 0,
  [CREEPER]: 280,
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function buildWorld(): Uint8Array {
  const g = new Uint8Array(ROWS * COLS);
  let base = 8;
  const topByCol: number[] = [];

  for (let c = 0; c < COLS; c++) {
    base += randInt(-1, 1);
    base = Math.max(5, Math.min(10, base));
    const top = Math.max(4, Math.min(11, Math.round(base + Math.sin(c * 0.24) * 1.2)));
    topByCol.push(top);
    for (let r = 0; r < ROWS; r++) {
      const i = r * COLS + c;
      if (r < top) g[i] = AIR;
      else if (r === top) g[i] = GRASS;
      else if (r < top + 3) g[i] = DIRT;
      else g[i] = STONE;
    }
  }

  for (let n = 0; n < 18; n++) {
    const cx = randInt(5, COLS - 6);
    const cy = randInt(9, ROWS - 2);
    const rx = randInt(2, 4);
    const ry = randInt(1, 2);
    for (let r = cy - ry; r <= cy + ry; r++) {
      for (let c = cx - rx; c <= cx + rx; c++) {
        if (r <= 0 || c <= 0 || r >= ROWS - 1 || c >= COLS - 1) continue;
        const nx = (c - cx) / rx;
        const ny = (r - cy) / ry;
        if (nx * nx + ny * ny < 1.1) g[r * COLS + c] = AIR;
      }
    }
  }

  for (let c = 8; c < COLS - 8; c++) {
    const top = topByCol[c] ?? 8;
    if (Math.random() < 0.12) {
      if (Math.random() < 0.15 && top - 1 >= 0) {
        // Creeper a felszínen (15% eséllyel fa helyett)
        g[(top - 1) * COLS + c] = CREEPER;
      } else {
        const h = randInt(2, 4);
        for (let t = 1; t <= h; t++) g[(top - t) * COLS + c] = LOG;
        const tr = top - h;
        for (let dr = -2; dr <= 1; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = tr + dr;
            const cc = c + dc;
            if (rr > 0 && rr < ROWS && cc > 0 && cc < COLS && Math.abs(dc) + Math.abs(dr) <= 3) {
              if (g[rr * COLS + cc] === AIR) g[rr * COLS + cc] = LEAVES;
            }
          }
        }
      }
    }
    for (let r = top + 2; r < ROWS - 1; r++) {
      const i = r * COLS + c;
      if (g[i] !== STONE) continue;
      const roll = Math.random();
      if (roll < 0.035) g[i] = COAL;
      else if (roll < 0.05) g[i] = IRON;
      else if (roll < 0.055) g[i] = DIAMOND;
    }
  }

  for (let c = 0; c < COLS; c++) {
    g[(ROWS - 1) * COLS + c] = BEDROCK;
  }

  return g;
}

function findSpawn(world: Uint8Array): { x: number; y: number } {
  const c = 6;
  for (let r = 1; r < ROWS; r++) {
    const i = r * COLS + c;
    if (world[i] !== AIR) {
      return { x: c * TILE + 4, y: r * TILE - 0.1 };
    }
  }
  return { x: 6 * TILE, y: 7 * TILE };
}

function solid(t: number) {
  return t !== AIR;
}

/** Játszható-e a cella (AIR vagy bányászható tömb) */
function mineable(t: number) {
  return t !== AIR && t !== BEDROCK;
}

/** Belső canvas-koordináta a megjelenített méret és a buffer eltérése esetén is. */
function pointerOnCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/** Kb. 3,5 csempe „Minecraft” hatótáv a játékos középpontjától. */
function playerCanReachTile(p: { x: number; y: number }, tc: number, tr: number) {
  const pcx = p.x + PLAYER_W / 2;
  const pcy = p.y - PLAYER_H / 2;
  const tcx = tc * TILE + TILE / 2;
  const tcy = tr * TILE + TILE / 2;
  return Math.max(Math.abs(tcx - pcx), Math.abs(tcy - pcy)) <= TILE * MINING_REACH_TILES;
}

function canStandAt(world: Uint8Array, footX: number, footY: number): boolean {
  const gx0 = Math.floor(footX / TILE);
  const gx1 = Math.floor((footX + PLAYER_W) / TILE);
  const gyFoot = Math.floor(footY / TILE);
  const gyHead = Math.floor((footY - PLAYER_H) / TILE);
  if (gx0 < 0 || gx1 >= COLS || gyHead < 0 || gyFoot >= ROWS) return false;
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gyHead; gy <= gyFoot; gy++) {
      if (gy < 0 || gx < 0 || gx >= COLS || gy >= ROWS) continue;
      const cell = world[gy * COLS + gx] ?? AIR;
      if (solid(cell)) return false;
    }
  }
  if (gyFoot + 1 >= ROWS) return false;
  let ground = false;
  for (let gx = gx0; gx <= gx1; gx++) {
    const below = world[(gyFoot + 1) * COLS + gx] ?? AIR;
    if (solid(below)) ground = true;
  }
  return ground;
}

/** Felfelé / szomszéd oszlopokban keresünk biztonságos állást (gödör, kvíz utáni lyuk). */
function rescuePlayerIfNeeded(world: Uint8Array, p: { x: number; y: number; vx: number; vy: number; onGround: boolean }) {
  const centerCol = Math.max(0, Math.min(COLS - 1, Math.floor((p.x + PLAYER_W / 2) / TILE)));
  for (const dc of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const col = Math.max(0, Math.min(COLS - 1, centerCol + dc));
    const footX = col * TILE + 4;
    for (let groundRow = ROWS - 2; groundRow >= 1; groundRow--) {
      const footY = groundRow * TILE - 0.01;
      if (canStandAt(world, footX, footY)) {
        p.x = Math.max(2, Math.min(COLS * TILE - PLAYER_W - 2, footX));
        p.y = footY;
        p.vx = 0;
        p.vy = 0;
        p.onGround = true;
        return;
      }
    }
  }
  const spawn = findSpawn(world);
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
}

/** Kvíz után: tömbbe ragadás, kibányászott talaj, vagy mélyen üresen esés alatt. */
function needsRescueAfterMine(world: Uint8Array, p: { x: number; y: number }, mined: { c: number; r: number; t: number } | null) {
  if (!canStandAt(world, p.x, p.y)) return true;
  const gx0 = Math.floor(p.x / TILE);
  const gx1 = Math.floor((p.x + PLAYER_W) / TILE);
  const gyFoot = Math.floor(p.y / TILE);
  let hasGroundBelow = false;
  if (gyFoot + 1 < ROWS) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (gx < 0 || gx >= COLS) continue;
      if (solid(world[(gyFoot + 1) * COLS + gx] ?? AIR)) {
        hasGroundBelow = true;
        break;
      }
    }
  }
  if (mined && mined.r === gyFoot + 1 && mined.c >= gx0 && mined.c <= gx1 && !hasGroundBelow) return true;
  const deep = p.y > ROWS * TILE - TILE * 4;
  return deep && !hasGroundBelow;
}

function tileRand(c: number, r: number, seed: number) {
  const n = Math.sin(c * 127.1 + r * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  time: number,
  worldCol?: number,
  worldRow?: number,
  light?: { sunX: number; sunY: number; viewW: number; viewH: number },
) {
  if (!t) return;
  const c = worldCol ?? Math.floor(x / TILE);
  const r = worldRow ?? Math.floor(y / TILE);
  const pal: Record<number, { top: string; base: string; side: string; speck?: string }> = {
    [GRASS]: { top: "#7cd057", base: "#5a903d", side: "#416a2d", speck: "#325423" },
    [DIRT]: { top: "#a67a4d", base: "#8a6038", side: "#634223", speck: "#6d4728" },
    [STONE]: { top: "#b4b9bf", base: "#8f959b", side: "#636970", speck: "#545961" },
    [LOG]: { top: "#8f6642", base: "#6a4a2f", side: "#4b3420", speck: "#3d2a19" },
    [LEAVES]: { top: "#4eb45a", base: "#327f3c", side: "#245b2d", speck: "#19451f" },
    [COAL]: { top: "#5e646d", base: "#3d4148", side: "#272b31", speck: "#1b1f25" },
    [IRON]: { top: "#c2a789", base: "#9b8169", side: "#715c49", speck: "#d9ccbc" },
    [DIAMOND]: { top: "#7be9f0", base: "#35b2bb", side: "#237b82", speck: "#c7ffff" },
    [BEDROCK]: { top: "#1a1d22", base: "#0f1114", side: "#050607", speck: "#2a3038" },
    [CREEPER]: { top: "#4cba4c", base: "#3ea63e", side: "#2d8a2d", speck: "#5ccf5c" },
  };
  const p = pal[t] || pal[STONE];
  ctx.fillStyle = p.base;
  ctx.fillRect(x, y, TILE, TILE);

  // Finom textúra-zaj: részletesebb, "voxel" hatás.
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  for (let i = 0; i < 6; i++) {
    const rx = x + 2 + Math.floor(tileRand(c, r, i + 0.31) * (TILE - 5));
    const ry = y + 2 + Math.floor(tileRand(c, r, i + 1.77) * (TILE - 5));
    ctx.fillRect(rx, ry, 2, 2);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = p.top;
  ctx.fillRect(x, y, TILE, TILE * 0.34);
  ctx.fillStyle = p.side;
  ctx.fillRect(x + TILE * 0.62, y + TILE * 0.22, TILE * 0.38, TILE * 0.78);

  if (light) {
    const cx = x + TILE * 0.5;
    const cy = y + TILE * 0.5;
    const toSunX = clamp01((light.sunX - cx) / Math.max(1, light.viewW) + 0.5);
    const toSunY = clamp01((light.sunY - cy) / Math.max(1, light.viewH) + 0.5);
    const lit = clamp01(0.2 + toSunX * 0.45 + (1 - toSunY) * 0.35);
    const shade = clamp01(1 - lit);

    // Napfény oldalfüggő csillanás.
    ctx.fillStyle = `rgba(255,255,220,${0.06 + lit * 0.11})`;
    ctx.fillRect(x, y, TILE, TILE * 0.28);

    // Naptól elforduló oldal sötétítése.
    ctx.fillStyle = `rgba(0,0,0,${0.08 + shade * 0.2})`;
    ctx.fillRect(x + TILE * 0.58, y + TILE * 0.18, TILE * 0.42, TILE * 0.82);
  }

  // Világítás + peremárnyék: térérzet.
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(x, y, TILE, 1);
  ctx.fillRect(x, y, 1, TILE);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x + TILE - 1, y, 1, TILE);
  ctx.fillRect(x, y + TILE - 1, TILE, 1);

  if (p.speck) {
    ctx.fillStyle = p.speck;
    for (let k = 0; k < 5; k++) {
      const sx = x + 2 + Math.floor(tileRand(c, r, 10 + k) * (TILE - 5));
      const sy = y + 3 + Math.floor(tileRand(c, r, 17 + k) * (TILE - 6));
      ctx.fillRect(sx, sy, 2, 2);
    }
  }
  if (t === GRASS) {
    ctx.fillStyle = "rgba(220,255,170,0.26)";
    for (let k = 0; k < 5; k++) {
      const wind = Math.sin(time * 0.003 + k + c * 0.6) * 1.3;
      ctx.fillRect(x + 3 + k * 4 + wind, y + 3, 1, 6);
    }
  }
  if (t === LEAVES) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#8dff8d";
    for (let k = 0; k < 4; k++) {
      const sx = x + 2 + Math.floor(tileRand(c, r, 40 + k) * (TILE - 5));
      const sy = y + 2 + Math.floor(tileRand(c, r, 47 + k) * (TILE - 5));
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  if (t === LOG) {
    ctx.strokeStyle = "rgba(45,25,10,0.35)";
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 2);
    ctx.lineTo(x + 5, y + TILE - 2);
    ctx.moveTo(x + 11, y + 2);
    ctx.lineTo(x + 11, y + TILE - 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
  // Creeper pixel arc
  if (t === CREEPER) {
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 4, y + 6, 5, 4);
    ctx.fillRect(x + 15, y + 6, 5, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 5, y + 7, 2, 2);
    ctx.fillRect(x + 16, y + 7, 2, 2);
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 7, y + 13, 2, 3);
    ctx.fillRect(x + 15, y + 13, 2, 3);
    ctx.fillRect(x + 9, y + 15, 6, 2);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, px: number, py: number, facing: number, tick: number) {
  const x = Math.round(px);
  const y = Math.round(py);
  const bob = Math.sin(tick * 0.18) * 1.2;

  // Pixeles kontúr: erősebb Minecraft-jelleg.
  ctx.fillStyle = "#17100d";
  ctx.fillRect(x - 2, y - PLAYER_H + 2 + bob, 14, 30);

  ctx.fillStyle = "#d0a173";
  ctx.fillRect(x, y - PLAYER_H + 5 + bob, 10, 9);
  ctx.fillStyle = "#8e6546";
  ctx.fillRect(x, y - PLAYER_H + 5 + bob, 10, 2);

  ctx.fillStyle = "#4b321a";
  ctx.fillRect(x - 1, y - PLAYER_H + 3 + bob, 12, 5);
  ctx.fillStyle = "#318bf1";
  ctx.fillRect(x - 1, y - PLAYER_H + 14 + bob, 12, 11);
  ctx.fillStyle = "#4ea3ff";
  ctx.fillRect(x - 1, y - PLAYER_H + 14 + bob, 12, 2);

  ctx.fillStyle = "#1c396e";
  ctx.fillRect(x - 1, y - PLAYER_H + 24 + Math.sin(tick * 0.2) + bob, 5, 6);
  ctx.fillRect(x + 6, y - PLAYER_H + 24 + Math.sin(tick * 0.2 + Math.PI) + bob, 5, 6);

  // Szem + árnyék.
  ctx.fillStyle = "#0f0b09";
  ctx.fillRect(facing > 0 ? x + 7 : x + 1, y - PLAYER_H + 8 + bob, 2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(facing > 0 ? x + 8 : x + 2, y - PLAYER_H + 8 + bob, 1, 1);
}

function MenuBlock({ t }: { t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (c) drawBlock(c, 0, 0, t, performance.now(), 0, 0);
  }, [t]);
  return <canvas ref={ref} width={TILE} height={TILE} className="rounded border border-black/40" />;
}

type Phase = "menu" | "play" | "quiz" | "over";

export default function BlockCraftQuiz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<Uint8Array>(buildWorld());
  const playerRef = useRef({ x: 8 * TILE, y: 7 * TILE, vx: 0, vy: 0, facing: 1, onGround: false, tick: 0 });
  const keysRef = useRef({ left: false, right: false, jump: false, mine: false });
  const touchRef = useRef({ left: false, right: false, jump: false });
  const cameraRef = useRef({ x: 0, y: 0 });
  const lastTRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const mineTargetRef = useRef<{ c: number; r: number; t: number } | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const streakRef = useRef(0);
  const xpPopupRef = useRef<{ amount: number; wx: number; wy: number; life: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("menu");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [wrongShake, setWrongShake] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [runSeconds, setRunSeconds] = useState(0);
  const [blocksMined, setBlocksMined] = useState(0);
  const [rareBlocks, setRareBlocks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_LIMIT);
  const [achievement, setAchievement] = useState<string | null>(null);
  const scoreSubmittedRef = useRef(false);
  // Keep streakRef in sync for the canvas loop (avoids stale closure)
  streakRef.current = streak;

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  const { data: bankData } = useQuery<QuizBankApi>({
    queryKey: ["/api/games/quiz-bank/block-craft-quiz"],
    queryFn: async () => {
      const res = await fetch("/api/games/quiz-bank/block-craft-quiz", { credentials: "include" });
      if (!res.ok) return { items: [] };
      return res.json();
    },
  });

  const bank = useMemo<Quiz[]>(() => {
    const remote = (bankData?.items ?? []).filter((q) => q.options?.length > 1).map((q) => ({
      prompt: q.prompt,
      options: q.options.slice(0, 4),
      correctIndex: q.correctIndex,
    }));
    return [...remote, ...QUIZ_FALLBACK];
  }, [bankData]);

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(() => {
      setRunSeconds((s) => s + 1);
      setTimeLeft((s) => {
        if (s <= 1) {
          setPhase("over");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const pickQuiz = useCallback(() => bank[Math.floor(Math.random() * bank.length)] ?? QUIZ_FALLBACK[0]!, [bank]);

  const spawnDust = useCallback((x: number, y: number, tile: number) => {
    const color: Record<number, string> = {
      [GRASS]: "#7cd057", [DIRT]: "#a67a4d", [STONE]: "#afb4ba", [LOG]: "#8f6642", [LEAVES]: "#54bc60", [COAL]: "#727882", [IRON]: "#d4bfaa", [DIAMOND]: "#9ff8ff", [AIR]: "#fff",
    };
    for (let i = 0; i < 12; i++) {
      particlesRef.current.push({ x, y, vx: randInt(-80, 80), vy: randInt(-150, -40), life: 0.5 + Math.random() * 0.5, color: color[tile] || "#fff" });
    }
  }, []);

  const tryMineAt = useCallback(
    (tc: number, tr: number, opts?: { skipReach?: boolean }): boolean => {
      const p = playerRef.current;
      const w = worldRef.current;
      if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return false;
      if (!opts?.skipReach && !playerCanReachTile(p, tc, tr)) return false;
      const t = w[tr * COLS + tc] ?? AIR;
      if (!mineable(t)) return false;
      p.vx = 0;
      p.vy = 0;
      const tcx = tc * TILE + TILE / 2;
      p.facing = tcx >= p.x + PLAYER_W / 2 ? 1 : -1;
      mineTargetRef.current = { c: tc, r: tr, t };
      setQuiz(pickQuiz());
      setPhase("quiz");
      return true;
    },
    [pickQuiz],
  );

  /** E / Bányász gomb: az arc előtti oszlopban a legközelebbi (lábtól felfelé) bányászható cella. */
  const tryMine = useCallback(() => {
    const p = playerRef.current;
    const cx = Math.floor((p.x + PLAYER_W / 2) / TILE) + p.facing;
    if (cx < 0 || cx >= COLS) return;
    const rFoot = Math.min(ROWS - 1, Math.floor(p.y / TILE) + 1);
    const rTop = Math.max(0, Math.floor((p.y - PLAYER_H) / TILE));
    for (let tr = rFoot; tr >= rTop; tr--) {
      if (tryMineAt(cx, tr, { skipReach: true })) return;
    }
  }, [tryMineAt]);

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    worldRef.current = buildWorld();
    const spawn = findSpawn(worldRef.current);
    playerRef.current = { x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: 1, onGround: false, tick: 0 };
    cameraRef.current = { x: 0, y: 0 };
    particlesRef.current = [];
    xpPopupRef.current = null;
    setAchievement(null);
    setSessionXp(0);
    setStreak(0);
    setRunSeconds(0);
    setBlocksMined(0);
    setRareBlocks(0);
    setTimeLeft(ROUND_LIMIT);
    setPhase("play");
    lastTRef.current = null;
  }, []);

  const endRun = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPhase("over");
  }, []);

  const tryMineRef = useRef(tryMine);
  tryMineRef.current = tryMine;
  const endRunRef = useRef(endRun);
  endRunRef.current = endRun;

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = true;
      if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space") {
        e.preventDefault();
        keysRef.current.jump = true;
      }
      if (e.code === "KeyE") keysRef.current.mine = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = false;
      if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space") keysRef.current.jump = false;
      if (e.code === "KeyE") keysRef.current.mine = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = (t: number) => {
      const last = lastTRef.current;
      lastTRef.current = t;
      const dt = last == null ? 0 : Math.min(0.033, (t - last) / 1000);
      const p = playerRef.current;
      const w = worldRef.current;

      if (keysRef.current.mine) {
        keysRef.current.mine = false;
        tryMineRef.current();
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const left = keysRef.current.left || touchRef.current.left;
      const right = keysRef.current.right || touchRef.current.right;
      const jump = keysRef.current.jump || touchRef.current.jump;

      p.vx = left ? -MOVE_SPEED : right ? MOVE_SPEED : 0;
      if (left) p.facing = -1;
      if (right) p.facing = 1;
      if (Math.abs(p.vx) > 0.1) p.tick += dt * 60;
      if (jump && p.onGround) {
        p.vy = -JUMP_V;
        p.onGround = false;
      }

      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = Math.max(2, Math.min(COLS * TILE - PLAYER_W - 2, p.x));
      p.onGround = false;

      const gx0 = Math.floor(p.x / TILE);
      const gx1 = Math.floor((p.x + PLAYER_W) / TILE);
      const gy0 = Math.floor((p.y - PLAYER_H) / TILE);
      const gy1 = Math.floor(p.y / TILE);

      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (gy < 0 || gx < 0 || gx >= COLS || gy >= ROWS) continue;
          const cell = w[gy * COLS + gx] ?? AIR;
          if (!solid(cell)) continue;
          const bx = gx * TILE;
          const by = gy * TILE;
          const px0 = p.x;
          const px1 = p.x + PLAYER_W;
          const py0 = p.y - PLAYER_H;
          const py1 = p.y;
          if (px1 > bx && px0 < bx + TILE && py1 > by && py0 < by + TILE) {
            const overlapX = Math.min(px1 - bx, bx + TILE - px0);
            const overlapY = Math.min(py1 - by, by + TILE - py0);

            if (overlapX < overlapY) {
              if (px0 < bx) p.x = bx - PLAYER_W - 0.01;
              else p.x = bx + TILE + 0.01;
              p.vx = 0;
            } else {
              if (py1 - by < by + TILE - py0) {
                p.y = by - 0.01;
                p.vy = 0;
                p.onGround = true;
              } else {
                p.y = by + TILE + PLAYER_H + 0.01;
                p.vy = 0;
              }
            }
          }
        }
      }

      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        parts[i].x += parts[i].vx * dt;
        parts[i].y += parts[i].vy * dt;
        parts[i].vy += 420 * dt;
        parts[i].life -= dt;
        if (parts[i].life <= 0) parts.splice(i, 1);
      }

      if (p.y > ROWS * TILE + TILE * 5) {
        endRunRef.current();
        return;
      }

      const CW = canvas.width;
      const CH = canvas.height;
      const playerCenterX = p.x + PLAYER_W / 2;
      const playerCenterY = p.y - PLAYER_H / 2;
      const speedRatio = Math.min(1, Math.abs(p.vx) / MOVE_SPEED);
      const microAmp = 0.22 + speedRatio * 0.85;
      const microX = Math.sin(t * 0.007 + p.tick * 0.05) * microAmp;
      const microY = Math.cos(t * 0.006 + p.tick * 0.08) * microAmp * 0.62;
      cameraRef.current = {
        x: playerCenterX - CW / 2 + microX,
        y: playerCenterY - CH / 2 + microY,
      };
      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;

      const cycle = (Math.sin(t * 0.00008) + 1) * 0.5;
      const sky = ctx.createLinearGradient(0, 0, 0, CH);
      sky.addColorStop(0, `rgba(${Math.round(36 + cycle * 55)}, ${Math.round(70 + cycle * 90)}, ${Math.round(105 + cycle * 100)}, 1)`);
      sky.addColorStop(0.6, `rgba(${Math.round(95 + cycle * 65)}, ${Math.round(150 + cycle * 60)}, ${Math.round(185 + cycle * 40)}, 1)`);
      sky.addColorStop(1, "#45764f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CW, CH);

      // Éjszakai csillagok (cycle < 0.3 = sotét ég)
      if (cycle < 0.3) {
        const starAlpha = Math.min(0.95, (0.3 - cycle) * 4);
        ctx.fillStyle = `rgba(255,255,255,${starAlpha})`;
        for (let si = 0; si < 18; si++) {
          const sx = ((Math.sin(si * 7.31 + 1.2) * 0.5 + 0.5) * CW);
          const sy = ((Math.sin(si * 3.73 + 0.5) * 0.5 + 0.5) * CH * 0.38);
          ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        }
      }

      const sunOrbit = t * 0.00005;
      const sunX = CW * 0.52 + Math.cos(sunOrbit) * CW * 0.42;
      const sunY = 54 + Math.sin(sunOrbit * 1.35) * 22;
      const sun = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 64);
      sun.addColorStop(0, "rgba(255,248,220,0.95)");
      sun.addColorStop(0.4, "rgba(255,230,150,0.38)");
      sun.addColorStop(1, "rgba(255,200,100,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, CW, CH);

      ctx.fillStyle = "rgba(22,58,36,0.3)";
      ctx.beginPath();
      ctx.moveTo(0, ROWS * TILE - cameraRef.current.y - 120);
      for (let sx = 0; sx <= CW + 20; sx += 16) {
        const wx = sx + camX * 0.6;
        ctx.lineTo(
          sx,
          ROWS * TILE - camY - 122 + Math.sin(wx * 0.018) * 14 + Math.cos(wx * 0.008) * 10,
        );
      }
      ctx.lineTo(CW, CH);
      ctx.lineTo(0, CH);
      ctx.fill();

      for (let i = 0; i < 5; i++) {
        const cloudSpeed = 0.018 + i * 0.004;
        const cx = ((i * 170 + t * cloudSpeed) % (CW + 260)) - 120;
        const cy = 20 + (i % 3) * 20;
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(cx, cy, 48, 12);
        ctx.fillRect(cx + 10, cy - 6, 26, 8);
      }

      const c0 = Math.floor(camX / TILE);
      const c1 = Math.ceil((camX + CW) / TILE) + 1;
      for (let r = 0; r < ROWS; r++) {
        for (let c = Math.max(0, c0); c < Math.min(COLS, c1); c++) {
          const cell = w[r * COLS + c] ?? AIR;
          if (cell) {
            drawBlock(ctx, c * TILE - camX, r * TILE - camY, cell, t, c, r, {
              sunX,
              sunY,
              viewW: CW,
              viewH: CH,
            });
          }
        }
      }

      for (const ptx of parts) {
        ctx.globalAlpha = Math.max(0, ptx.life);
        ctx.fillStyle = ptx.color;
        ctx.fillRect(ptx.x - camX, ptx.y - camY, 3, 3);
      }
      ctx.globalAlpha = 1;

      drawPlayer(ctx, p.x - camX, p.y - camY, p.facing, p.tick);

      // Streak aura: 3+ sorozatnál arany particle-k a játékos körül
      if (streakRef.current >= 3) {
        const auraCx = Math.round(p.x + PLAYER_W / 2 - camX);
        const auraCy = Math.round(p.y - PLAYER_H / 2 - camY);
        const auraCount = Math.min(12, 4 + streakRef.current * 2);
        for (let ai = 0; ai < auraCount; ai++) {
          const angle = (t * 0.003 + ai * (Math.PI * 2 / auraCount)) % (Math.PI * 2);
          const rad = 14 + Math.sin(t * 0.008 + ai) * 4;
          const ax = auraCx + Math.cos(angle) * rad;
          const ay = auraCy + Math.sin(angle) * rad;
          const aAlpha = 0.55 + Math.sin(t * 0.01 + ai * 1.3) * 0.3;
          ctx.fillStyle = `rgba(255,200,0,${aAlpha})`;
          ctx.fillRect(ax, ay, 2, 2);
        }
      }

      // +XP popup animáció
      const xpPop = xpPopupRef.current;
      if (xpPop) {
        xpPop.life -= dt;
        if (xpPop.life <= 0) {
          xpPopupRef.current = null;
        } else {
          const popAlpha = Math.min(1, xpPop.life / 0.4);
          const rise = (1.5 - xpPop.life) * 30;
          ctx.globalAlpha = popAlpha;
          ctx.font = "bold 13px monospace";
          ctx.fillStyle = "#ffe040";
          ctx.fillText(`+${xpPop.amount} XP`, xpPop.wx - camX - 20, xpPop.wy - camY - rise);
          ctx.globalAlpha = 1;
        }
      }

      // Távolsági köd + atmoszférikus réteg (mélységérzet).
      const fog = ctx.createLinearGradient(0, 0, 0, CH);
      fog.addColorStop(0, "rgba(180,220,255,0.03)");
      fog.addColorStop(0.55, "rgba(150,195,220,0.08)");
      fog.addColorStop(1, "rgba(120,165,180,0.18)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, CW, CH);

      ctx.fillStyle = "rgba(210,240,255,0.06)";
      for (let i = 0; i < 3; i++) {
        const bandY = CH * (0.28 + i * 0.21) + Math.sin(t * 0.00065 + i + camX * 0.0014) * 8;
        ctx.fillRect(0, bandY, CW, 14 + i * 5);
      }

      // Finom vignetta: fókusz a középponti játéktérre.
      const vignette = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.28, CW / 2, CH / 2, CH * 0.8);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.2)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, CW, CH);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const onAnswer = (idx: number) => {
    if (!quiz) return;
    if (idx !== quiz.correctIndex) {
      setWrongShake(true);
      setTimeout(() => setWrongShake(false), 320);
      setStreak(0);
      return;
    }

    const tgt = mineTargetRef.current;
    if (tgt) {
      worldRef.current[tgt.r * COLS + tgt.c] = AIR;
      spawnDust((tgt.c + 0.5) * TILE, (tgt.r + 0.5) * TILE, tgt.t);
      const isCreeper = tgt.t === CREEPER;
      const baseXp = XP_BY_TILE[tgt.t] ?? 24;
      const add = (isCreeper ? baseXp * 2 : baseXp) + streak * 4;
      const newBlocks = blocksMined + 1;
      const newStreak = streak + 1;
      setSessionXp((x) => x + add);
      setTotalXp((x) => x + add);
      setBlocksMined(newBlocks);
      if (tgt.t === COAL || tgt.t === IRON || tgt.t === DIAMOND || tgt.t === CREEPER) setRareBlocks((n) => n + 1);
      setStreak(newStreak);
      // +XP popup a canvas-on
      xpPopupRef.current = { amount: add, wx: (tgt.c + 0.5) * TILE, wy: (tgt.r + 0.5) * TILE, life: 1.5 };
      // Achievement toastok
      if (tgt.t === DIAMOND && rareBlocks === 0) {
        setAchievement("Elso gyemant megtalva!");
        setTimeout(() => setAchievement(null), 2500);
      } else if (newBlocks === 10) {
        setAchievement("10. blokk kibányászva!");
        setTimeout(() => setAchievement(null), 2500);
      } else if (newStreak === 5) {
        setAchievement("5-ös sorozat elérve!");
        setTimeout(() => setAchievement(null), 2500);
      } else if (isCreeper) {
        setAchievement("Creeper legyőzve! Dupla XP!");
        setTimeout(() => setAchievement(null), 2500);
      }
    }
    mineTargetRef.current = null;
    setQuiz(null);
    {
      const p = playerRef.current;
      p.vx = 0;
      p.vy = 0;
      if (needsRescueAfterMine(worldRef.current, p, tgt)) {
        rescuePlayerIfNeeded(worldRef.current, p);
      }
    }
    setPhase("play");
  };

  useEffect(() => {
    if (phase !== "over" || !syncEligibility?.eligible || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void apiRequest("POST", "/api/games/score", {
      gameId: "block-craft-quiz",
      difficulty: "normal",
      runXp: sessionXp,
      runStreak: streak,
      runSeconds,
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, streak, runSeconds]);

  const resizeCanvas = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const parent = el.parentElement;
    const parentW = Math.max(320, Math.floor(parent?.clientWidth ?? 380));
    const maxH = parentW >= 640 ? 520 : 440;
    const h = Math.min(maxH, Math.max(300, Math.round(parentW * 0.56)));
    el.width = parentW;
    el.height = h;
    el.style.width = `${parentW}px`;
    el.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const hold = (k: "left" | "right" | "jump", v: boolean) => {
    touchRef.current[k] = v;
  };

  const startHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "left" | "right" | "jump") => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hold(k, true);
  };

  const endHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "left" | "right" | "jump") => {
    e.preventDefault();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    hold(k, false);
  };

  const onCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "play") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const canvas = e.currentTarget;
      const { x, y } = pointerOnCanvas(canvas, e.clientX, e.clientY);
      const cam = cameraRef.current;
      const tc = Math.floor((x + cam.x) / TILE);
      const tr = Math.floor((y + cam.y) / TILE);
      if (!tryMineAt(tc, tr)) tryMine();
    },
    [phase, tryMine, tryMineAt],
  );

  return (
    <div className="min-h-screen relative overflow-hidden text-white" style={{ background: "radial-gradient(circle at 15% 15%, rgba(34,197,94,0.18), transparent 38%), radial-gradient(circle at 88% 8%, rgba(34,211,238,0.2), transparent 42%), linear-gradient(180deg, #0b1727 0%, #1b2f45 100%)" }}>
      <main className="relative z-10 w-full max-w-xl lg:max-w-3xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-dvh min-h-screen flex flex-col pb-20 sm:pb-10">
        <header className="flex items-center justify-between gap-1 mb-1">
          <Link href="/games"><Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2"><ArrowLeft className="w-4 h-4" />Játékok</Button></Link>
          <div className="flex items-center gap-2 text-xs font-semibold"><span className="flex items-center gap-1 text-amber-300"><Star className="w-4 h-4" />{totalXp}</span><span className="flex items-center gap-1 text-lime-300"><Flame className="w-4 h-4" />{streak}</span></div>
        </header>

        <Card className="border border-lime-400/45 bg-slate-950/85 backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.45)] flex-1 flex flex-col min-h-0"><CardContent className={`flex flex-col flex-1 min-h-0 ${phase === "play" ? "p-1.5 sm:p-3" : "p-3"}`}>
          {phase !== "play" && <div className="flex items-center gap-2 mb-1"><Box className="w-5 h-5 text-lime-400" /><h1 className="text-base font-extrabold">Kockavadász kvíz</h1></div>}
          {phase !== "play" && <><GamePedagogyPanel
            accent="lime"
            className="mb-2"
            kidMission="Bányássz blokkokat egy kockavilágban! Minden blokk előtt rövid angol kvíz jön: csak helyes válaszra tűnik el a kő (és kapsz XP-et + sorozat-lángot). Időre is figyelj — a kör végén összesítjük a pontjaidat."
            parentBody={
              <>
                <strong className="text-lime-100/90">Tananyag:</strong> alap angol szókincs (tárgyak, helyzetek) kvízformában, a bányászat motivációt ad az ismétléshez.
                <br />
                <strong className="text-lime-100/90">Fejleszt:</strong> olvasásértés gyors döntés mellett, térbeli tájékozódás és kéz-szem koordináció (billentyű / érintés).
                <br />
                <span className="text-white/55">
                  Akadály (fizikai pálya) + teszt (kvíz) + jutalom (XP, blokk eltűnik) minden lépésnél összekapcsolva — erős, azonnali visszajelzés.
                </span>
              </>
            }
          />
          <p className="text-[11px] text-lime-100/90 mb-2 border border-lime-700/45 rounded px-2 py-1.5 bg-slate-900/95">{syncBanner}</p></>}

          {phase === "menu" && <div className="flex flex-col items-center justify-center flex-1 gap-4 py-6"><div className="grid grid-cols-5 gap-2 p-3 rounded-xl bg-black/45 border border-lime-700/45">{[GRASS, DIRT, STONE, LOG, LEAVES, COAL, IRON, DIAMOND].map((t) => <MenuBlock key={t} t={t} />)}</div><p className="text-xs text-amber-100/95 text-center max-w-sm font-semibold">A zöld sáv fent = mennyi időd van a körből. Minél több jó kvíz, annál több XP és hosszabb sorozat!</p><p className="text-xs text-white/80 text-center max-w-xs">A/D vagy nyilak: mozgás, Space: ugrás, E vagy Bányász: kvíz. Koppints a kockára is, ha közel vagy hozzá.</p><Button size="lg" className="bg-gradient-to-r from-lime-600 to-emerald-800 hover:from-lime-500 hover:to-emerald-700 border border-lime-200/35 font-bold text-white shadow-lg text-base" onClick={startGame}><Pickaxe className="w-4 h-4 mr-2" />Új világ — indulhat a bányászat!</Button></div>}

          {phase === "play" && <div className="flex flex-col items-center gap-1.5">{/* === CANVAS LEGFELÜL (mobil-first) === */}<div className="rounded-xl overflow-hidden border-2 border-lime-700/70 shadow-[0_0_28px_rgba(34,197,94,0.18)] w-full bg-black min-h-[min(50dvh,340px)] sm:min-h-[280px]"><canvas ref={canvasRef} className="block touch-manipulation w-full max-w-full cursor-crosshair" onPointerDown={onCanvasPointerDown} /></div>{/* === KONTROLLGOMBOK közvetlenül a canvas alatt === */}<div className="grid grid-cols-4 gap-1.5 w-full"><Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "left")} onPointerUp={(e) => endHold(e, "left")} onPointerCancel={(e) => endHold(e, "left")} onPointerLeave={(e) => endHold(e, "left")}>Balra</Button><Button type="button" size="sm" className="bg-violet-700 hover:bg-violet-600 text-white border border-violet-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "jump")} onPointerUp={(e) => endHold(e, "jump")} onPointerCancel={(e) => endHold(e, "jump")} onPointerLeave={(e) => endHold(e, "jump")}>Ugrás</Button><Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "right")} onPointerUp={(e) => endHold(e, "right")} onPointerCancel={(e) => endHold(e, "right")} onPointerLeave={(e) => endHold(e, "right")}>Jobbra</Button><Button type="button" size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-200/35 touch-manipulation shadow-md py-3 text-xs" onClick={() => tryMine()}><Pickaxe className="w-3.5 h-3.5 mr-1" />Bányász</Button></div>{/* === KOMPAKT HUD sáv === */}<div className="w-full flex items-center gap-1.5"><div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-cyan-400 to-lime-500 transition-all" style={{ width: `${(timeLeft / ROUND_LIMIT) * 100}%` }} /></div><span className="text-[10px] font-bold text-white/80 tabular-nums min-w-[32px] text-right">{timeLeft}s</span></div><div className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70"><span>XP: <strong className="text-amber-300">{sessionXp}</strong></span><span>Blokk: {blocksMined}</span><span>Érc: {rareBlocks}</span><span className="flex items-center gap-0.5"><Flame className="w-3 h-3 text-orange-400" />{streak}</span></div>{/* === Cél sáv (kompakt) === */}<GameNextGoalBar accent="lime" headline={streak >= ROUND_STREAK_GOAL ? "Szuper sorozat!" : `${streak}/${ROUND_STREAK_GOAL} jó egymás után`} subtitle="" current={Math.min(streak, ROUND_STREAK_GOAL)} target={ROUND_STREAK_GOAL} className="w-full" /><div className="flex gap-2 justify-center w-full"><Button type="button" size="sm" className="bg-amber-600/80 hover:bg-amber-500 text-slate-950 border border-amber-200/45 shadow-md text-xs px-3 py-1" onClick={endRun}>Kör vége</Button></div></div>}

          {phase === "over" && <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center"><Box className="w-12 h-12 text-lime-400" /><p className="text-lg font-bold">Bányászat vége</p><p className="text-sm font-semibold text-lime-100/90 max-w-sm">Minden jó kvíz angol szavakat erősített — nézd meg az XP-t és a sorozatot: ez a munkád gyümölcse!</p><p className="text-sm text-white/75">XP: <strong className="text-amber-300">{sessionXp}</strong> · Blokkok: <strong>{blocksMined}</strong> · Érc: <strong>{rareBlocks}</strong></p>{syncEligibility?.eligible ? <p className="text-xs text-emerald-300/90">Eredmény elküldve.</p> : <p className="text-xs text-white/50 max-w-xs">{syncBanner}</p>}<div className="flex gap-2"><Button className="bg-lime-700 hover:bg-lime-600" onClick={startGame}><RotateCcw className="w-4 h-4 mr-1" />Új világ</Button><Link href="/games"><Button variant="outline" className="border-white/40 text-white">Lista</Button></Link></div></div>}
        </CardContent></Card>
      </main>

      <AnimatePresence>{phase === "quiz" && quiz && <motion.div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`w-full max-w-md rounded-2xl border-2 border-lime-500/50 bg-slate-950/95 p-4 shadow-2xl ${wrongShake ? "animate-shake" : ""}`}><p className="text-xs font-bold text-lime-300 uppercase mb-1">Angol mini-teszt</p><p className="text-[11px] text-white/65 mb-2">Ha eltalálod, a blokk eltűnik és jön az XP. Rossz válasz: próbáld újra ugyanazt a blokkot — nincs büntető víz, csak gyakorolsz tovább.</p><p className="text-base font-semibold mb-4">{quiz.prompt}</p><div className="grid gap-2">{quiz.options.map((o, i) => <Button key={`${o}-${i}`} variant="secondary" className="h-auto py-3 text-left bg-white/10 hover:bg-lime-800/50 text-white border border-lime-900/40 text-[15px]" onClick={() => onAnswer(i)}>{o}</Button>)}</div></motion.div></motion.div>}</AnimatePresence>

      <AnimatePresence>{achievement && <motion.div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] bg-amber-500/95 text-slate-950 font-bold text-sm px-4 py-2 rounded-xl shadow-xl border border-amber-200/60 whitespace-nowrap" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>{achievement}</motion.div>}</AnimatePresence>
      <style>{`@keyframes shake {0%,100% { transform: translateX(0); }25% { transform: translateX(-5px); }75% { transform: translateX(5px); }} .animate-shake { animation: shake 0.16s ease-in-out 2; }`}</style>
    </div>
  );
}
