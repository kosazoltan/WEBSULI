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

/**
 * Minecraft-szerű pixel-pontos blokk renderelés.
 * Minden blokk saját 12×12 virtuális pixelmátrixot kap (TILE=24 → 2px/unit),
 * deterministikusan a (c, r) koordináta alapján a tileRand() seed-del.
 * AO: opcionálisan a szomszédos szilárd cellák alapján sötétíti az éleket.
 */
// Minecraft-hű pixel palette (Java Edition 1.x-alapú). Minden blokk 4-6 árnyalatot kap.
const MC_PAL: Record<number, { main: string; dark: string; darker: string; light: string; accent?: string; accent2?: string }> = {
  [GRASS]:   { main: "#5DA132", dark: "#3F7A23", darker: "#2C5A18", light: "#7BC74A", accent: "#8BDB52" },
  [DIRT]:    { main: "#8A5A2E", dark: "#6B4422", darker: "#4F3218", light: "#A8724A", accent: "#99653C" },
  [STONE]:   { main: "#7A7A7A", dark: "#5E5E5E", darker: "#424242", light: "#9A9A9A", accent: "#6A6A6A" },
  [LOG]:     { main: "#6B4423", dark: "#4E3119", darker: "#35200F", light: "#8B5E33", accent: "#2B1A0B", accent2: "#A67848" },
  [LEAVES]:  { main: "#2E7A1E", dark: "#215818", darker: "#153610", light: "#4BA530", accent: "#67C24A" },
  [COAL]:    { main: "#7A7A7A", dark: "#5E5E5E", darker: "#1C1C1C", light: "#9A9A9A", accent: "#0A0A0A" },
  [IRON]:    { main: "#7A7A7A", dark: "#5E5E5E", darker: "#424242", light: "#9A9A9A", accent: "#D8A56E", accent2: "#B28048" },
  [DIAMOND]: { main: "#7A7A7A", dark: "#5E5E5E", darker: "#424242", light: "#9A9A9A", accent: "#5ECEE8", accent2: "#B8F4FA" },
  [BEDROCK]: { main: "#4A4A4A", dark: "#2C2C2C", darker: "#111111", light: "#5C5C5C", accent: "#1A1A1A" },
  [CREEPER]: { main: "#4BA84B", dark: "#368A36", darker: "#1F5C1F", light: "#6CC46C", accent: "#0A0A0A", accent2: "#FFFFFF" },
};

/**
 * Determinisztikus blokk-textúra cache (module-scoped).
 * Mivel mcBlockPattern() kimenete tisztán determinisztikus (t, c, r) alapján,
 * a render loop hot-pathán cache-eljük Map-be.
 *
 * Felső határ (Eszter F2c memória-analízis pontosítása):
 *   ROWS × COLS × block-types = 16 × 64 × 10 ≈ 10 240–11 264 bejegyzés
 *   (AIR=0 nem cache-eli, drawBlock "if (!t) return" mögött).
 *   Egy bejegyzés = 12×12 grid = 144 string-referencia (MC_PAL konstansokra mutatnak)
 *     + 13 array objektum + Map overhead.
 *   Reality-check: runtime memory-footprint ~15–25 MB (nem ~2–3 MB, mint korábban
 *   becsültem). Dinamikus world / végtelen koordináta-domain esetén korlátlan
 *   növekedés — de a jelenlegi kódban ilyen útvonal nincs (ROWS/COLS fix, MenuBlock
 *   csak konstans mintát kér).
 *
 * A hover animáció és pulse overlay-ek nem mennek a cache-be, azok a drawBlock-ban futnak.
 */
const mcBlockPatternCache: Map<string, string[][]> = new Map();

/**
 * Determinisztikus pixelmátrix egy blokkhoz. U=TILE/12 unit-méret (2px TILE=24-nél).
 * Visszaadja a 12x12 színmátrixot (a pal alapján kiválasztva). Cache-elt.
 */
function mcBlockPattern(t: number, c: number, r: number): string[][] {
  const cacheKey = t + ":" + c + ":" + r;
  const cached = mcBlockPatternCache.get(cacheKey);
  if (cached) return cached;
  const grid = mcBlockPatternBuild(t, c, r);
  mcBlockPatternCache.set(cacheKey, grid);
  return grid;
}

/** Determinisztikus pattern építő (belső — cache-elt wrapper hívja meg). */
function mcBlockPatternBuild(t: number, c: number, r: number): string[][] {
  const pal = MC_PAL[t] || MC_PAL[STONE];
  const grid: string[][] = Array.from({ length: 12 }, () => Array(12).fill(pal.main));

  if (t === GRASS) {
    // Felső 3 sor: zöld fű (vegyes árnyalat, pixelezett felső él).
    for (let py = 0; py < 3; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 11.7);
        grid[py][px] = h < 0.22 ? pal.light! : h < 0.55 ? pal.main : pal.dark;
      }
    }
    // Fű-cseppek lecsorognak a DIRT-re (1-2 pixel).
    for (let px = 0; px < 12; px++) {
      if (tileRand(c + px, r, 29.1) < 0.25) grid[3][px] = pal.dark;
      if (tileRand(c + px, r, 37.3) < 0.12) grid[4][px] = pal.darker;
    }
    // Alatta DIRT textúra.
    const dPal = MC_PAL[DIRT];
    for (let py = 3; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        if (py === 3 && grid[py][px] !== pal.main) continue; // fű-csepp maradjon
        const h = tileRand(c + px, r + py, 41.3);
        grid[py][px] = h < 0.16 ? dPal.light! : h < 0.42 ? dPal.main : h < 0.8 ? dPal.dark : dPal.darker;
      }
    }
  } else if (t === DIRT) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 53.9);
        grid[py][px] = h < 0.14 ? pal.light! : h < 0.45 ? pal.main : h < 0.82 ? pal.dark : pal.darker;
      }
    }
  } else if (t === STONE) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 67.2);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Repedések (sötét pixelvonalak).
    const crackSeed = tileRand(c, r, 81.5);
    if (crackSeed < 0.5) {
      const cx = Math.floor(crackSeed * 10) + 1;
      const cy = Math.floor(tileRand(c, r, 91.3) * 8) + 2;
      for (let i = 0; i < 4; i++) {
        const px = Math.max(0, Math.min(11, cx + i - 1));
        const py = Math.max(0, Math.min(11, cy + Math.floor((tileRand(c, r, 103 + i) - 0.5) * 2)));
        grid[py][px] = pal.darker;
      }
    }
  } else if (t === LOG) {
    // Oldalirányú rostok: függőleges fekete/világos vonalak.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        // Rostok x-pozíciója csak a col-tól függ, r nem vált.
        const band = Math.floor(px / 2) + Math.floor(tileRand(c, r + py, 17.3) * 1.3);
        if (band % 3 === 0) grid[py][px] = pal.dark;
        else if (band % 3 === 1) grid[py][px] = pal.main;
        else grid[py][px] = pal.light!;
      }
    }
    // Évgyűrű-jellegű pontok (random sötét foltok).
    for (let k = 0; k < 4; k++) {
      const rx = Math.floor(tileRand(c, r, 27 + k) * 11);
      const ry = Math.floor(tileRand(c, r, 31 + k) * 11);
      grid[ry][rx] = pal.accent!;
    }
  } else if (t === LEAVES) {
    // Ritka, levélszerű pixelmintázat — több árnyék.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 127.1);
        grid[py][px] = h < 0.10 ? pal.accent! : h < 0.30 ? pal.light! : h < 0.60 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Ritka fekete pontok (levelek közti hézagok).
    for (let k = 0; k < 5; k++) {
      const rx = Math.floor(tileRand(c, r, 151 + k) * 12);
      const ry = Math.floor(tileRand(c, r, 173 + k) * 12);
      grid[ry][rx] = pal.darker;
    }
  } else if (t === COAL) {
    // Stone alapra fekete pixelcsomók.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 191.3);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    const clusters = [[3, 3], [8, 4], [4, 8], [9, 9]];
    clusters.forEach(([cx, cy], idx) => {
      if (tileRand(c, r, 200 + idx) < 0.75) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const px = cx + dx;
            const py = cy + dy;
            if (px >= 0 && px < 12 && py >= 0 && py < 12) {
              if (tileRand(c + px, r + py, 211 + idx) < 0.78) grid[py][px] = pal.accent!;
            }
          }
        }
      }
    });
  } else if (t === IRON) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 233.7);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Narancs-barna vas-csomók.
    const clusters = [[2, 4], [7, 3], [5, 8], [10, 9]];
    clusters.forEach(([cx, cy], idx) => {
      if (tileRand(c, r, 250 + idx) < 0.70) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const px = cx + dx;
            const py = cy + dy;
            if (px >= 0 && px < 12 && py >= 0 && py < 12) {
              const rv = tileRand(c + px, r + py, 261 + idx);
              if (rv < 0.7) grid[py][px] = rv < 0.3 ? pal.accent2! : pal.accent!;
            }
          }
        }
      }
    });
  } else if (t === DIAMOND) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 277.1);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Ciánkék gyémánt pixelcsomók — ritkábbak, de fényesebbek.
    const clusters = [[3, 4], [8, 7], [5, 9]];
    clusters.forEach(([cx, cy], idx) => {
      if (tileRand(c, r, 290 + idx) < 0.80) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const px = cx + dx;
            const py = cy + dy;
            if (px >= 0 && px < 12 && py >= 0 && py < 12) {
              const rv = tileRand(c + px, r + py, 301 + idx);
              if (rv < 0.78) grid[py][px] = rv < 0.35 ? pal.accent2! : pal.accent!;
            }
          }
        }
      }
    });
  } else if (t === BEDROCK) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 317.3);
        grid[py][px] = h < 0.16 ? pal.light! : h < 0.48 ? pal.main : h < 0.78 ? pal.dark : pal.darker;
      }
    }
    // Sötét foltok (a bedrock jellegzetes "összevissza" mintázata).
    for (let k = 0; k < 6; k++) {
      const rx = Math.floor(tileRand(c, r, 331 + k) * 12);
      const ry = Math.floor(tileRand(c, r, 347 + k) * 12);
      grid[ry][rx] = pal.accent!;
    }
  } else if (t === CREEPER) {
    // Bázis: pixeles zöld mintázat.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 373.5);
        grid[py][px] = h < 0.22 ? pal.light! : h < 0.60 ? pal.main : h < 0.88 ? pal.dark : pal.darker;
      }
    }
    // Szemek (2x2 fekete) + szemfehér (1x1).
    grid[4][2] = pal.accent!; grid[4][3] = pal.accent!;
    grid[5][2] = pal.accent!; grid[5][3] = pal.accent!;
    grid[4][8] = pal.accent!; grid[4][9] = pal.accent!;
    grid[5][8] = pal.accent!; grid[5][9] = pal.accent!;
    // Creeper száj (klasszikus "mmm" alak).
    grid[7][4] = pal.accent!; grid[7][5] = pal.accent!;
    grid[7][6] = pal.accent!; grid[7][7] = pal.accent!;
    grid[8][3] = pal.accent!; grid[8][4] = pal.accent!;
    grid[8][7] = pal.accent!; grid[8][8] = pal.accent!;
    grid[9][3] = pal.accent!; grid[9][8] = pal.accent!;
  }

  return grid;
}

type NeighborSolid = { top: boolean; bottom: boolean; left: boolean; right: boolean };

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  time: number,
  worldCol?: number,
  worldRow?: number,
  light?: { sunX: number; sunY: number; viewW: number; viewH: number },
  neighbors?: NeighborSolid,
) {
  if (!t) return;
  const c = worldCol ?? Math.floor(x / TILE);
  const r = worldRow ?? Math.floor(y / TILE);

  // 12x12 unit-grid, TILE=24 esetén minden unit = 2 pixel (pixel-perfekt).
  const U = TILE / 12;
  const grid = mcBlockPattern(t, c, r);

  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 12; px++) {
      ctx.fillStyle = grid[py][px];
      ctx.fillRect(x + px * U, y + py * U, U + 0.5, U + 0.5); // +0.5 anti-gap
    }
  }

  // Glow aura ritka érceknek (IRON, DIAMOND pulzálóan).
  if (t === DIAMOND || t === IRON || t === COAL) {
    const pulse = 0.5 + Math.sin(time * 0.003 + c * 0.7 + r * 1.3) * 0.5;
    const glowColor = t === DIAMOND ? "rgba(120,235,250," : t === IRON ? "rgba(216,165,110," : "rgba(60,60,70,";
    ctx.fillStyle = glowColor + (0.08 + pulse * 0.08) + ")";
    ctx.fillRect(x, y, TILE, TILE);
  }

  // CREEPER: halvány pulzálás a robbanás-készenlétre.
  if (t === CREEPER) {
    const pulse = 0.5 + Math.sin(time * 0.004) * 0.5;
    ctx.fillStyle = `rgba(255,255,180,${0.06 + pulse * 0.07})`;
    ctx.fillRect(x, y, TILE, TILE);
  }

  // LEAVES: fű/szél animáció — finom világos csíkok.
  if (t === LEAVES) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#9BE67E";
    for (let k = 0; k < 3; k++) {
      const wind = Math.sin(time * 0.0025 + k * 1.7 + c * 0.6) * 1.5;
      ctx.fillRect(Math.round(x + 4 + k * 7 + wind), Math.round(y + 3 + k * 2), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // GRASS: apró fűszálak animációval a tetején.
  if (t === GRASS) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#B7F07A";
    for (let k = 0; k < 4; k++) {
      const wind = Math.sin(time * 0.003 + k + c * 0.6) * 1.1;
      const bx = Math.round(x + 3 + k * 5 + wind);
      ctx.fillRect(bx, Math.round(y - 1), 1, 2);
    }
    ctx.globalAlpha = 1;
  }

  // Napfény shading — ugyanaz a logika, de most a pixel-textúra fölött.
  if (light) {
    const cx = x + TILE * 0.5;
    const cy = y + TILE * 0.5;
    const toSunX = clamp01((light.sunX - cx) / Math.max(1, light.viewW) + 0.5);
    const toSunY = clamp01((light.sunY - cy) / Math.max(1, light.viewH) + 0.5);
    const lit = clamp01(0.2 + toSunX * 0.45 + (1 - toSunY) * 0.35);
    const shade = clamp01(1 - lit);

    // Napfény csillogás a felső élen.
    ctx.fillStyle = `rgba(255,255,220,${0.04 + lit * 0.08})`;
    ctx.fillRect(x, y, TILE, U * 1.2);

    // Napárnyék a távolabbi oldalon.
    ctx.fillStyle = `rgba(0,0,0,${0.05 + shade * 0.14})`;
    ctx.fillRect(x + TILE - U * 2, y, U * 2, TILE);
  }

  // Ambient Occlusion — sötétítés azon éleknél, ahol van szomszéd szilárd blokk.
  if (neighbors) {
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    if (neighbors.top) {
      ctx.fillRect(x, y, TILE, U * 0.9);
    }
    if (neighbors.bottom) {
      ctx.fillRect(x, y + TILE - U * 0.9, TILE, U * 0.9);
    }
    if (neighbors.left) {
      ctx.fillRect(x, y, U * 0.9, TILE);
    }
    if (neighbors.right) {
      ctx.fillRect(x + TILE - U * 0.9, y, U * 0.9, TILE);
    }
  }

  // Klasszikus Minecraft-keret: fekete pixel-él (1 pixel).
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  if (!neighbors?.top)    ctx.fillRect(x, y, TILE, 1);
  if (!neighbors?.bottom) ctx.fillRect(x, y + TILE - 1, TILE, 1);
  if (!neighbors?.left)   ctx.fillRect(x, y, 1, TILE);
  if (!neighbors?.right)  ctx.fillRect(x + TILE - 1, y, 1, TILE);
}

/** Klasszikus Minecraft pixel-nap: sárga négyzetes korong, 24×24px, sarokvilágítással. */
function drawMcSun(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const s = 18; // sun half-size
  // Halvány fényudvar.
  const halo = ctx.createRadialGradient(cx, cy, s * 0.6, cx, cy, s * 3.2);
  halo.addColorStop(0, "rgba(255,240,180,0.32)");
  halo.addColorStop(1, "rgba(255,230,150,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - s * 3.2, cy - s * 3.2, s * 6.4, s * 6.4);
  // Négyzetes pixel-nap.
  ctx.fillStyle = "#FFE889";
  ctx.fillRect(Math.round(cx - s), Math.round(cy - s), s * 2, s * 2);
  // Belső világosabb rész.
  ctx.fillStyle = "#FFF4B8";
  ctx.fillRect(Math.round(cx - s * 0.8), Math.round(cy - s * 0.8), Math.round(s * 1.6), Math.round(s * 1.6));
  // Kis sötétebb sarkok (pixeles "kerekítés").
  ctx.fillStyle = "#FFD35E";
  ctx.fillRect(Math.round(cx - s), Math.round(cy - s), 3, 3);
  ctx.fillRect(Math.round(cx + s - 3), Math.round(cy - s), 3, 3);
  ctx.fillRect(Math.round(cx - s), Math.round(cy + s - 3), 3, 3);
  ctx.fillRect(Math.round(cx + s - 3), Math.round(cy + s - 3), 3, 3);
}

/** Klasszikus Minecraft pixel-hold: fehér négyzetes, sarokvilágítással. */
function drawMcMoon(ctx: CanvasRenderingContext2D, cx: number, cy: number, alpha: number) {
  const s = 14;
  ctx.globalAlpha = alpha;
  // Hold fényudvar.
  const halo = ctx.createRadialGradient(cx, cy, s * 0.5, cx, cy, s * 3);
  halo.addColorStop(0, "rgba(220,230,255,0.30)");
  halo.addColorStop(1, "rgba(200,215,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - s * 3, cy - s * 3, s * 6, s * 6);
  // Pixeles hold korong.
  ctx.fillStyle = "#E8ECF5";
  ctx.fillRect(Math.round(cx - s), Math.round(cy - s), s * 2, s * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(Math.round(cx - s * 0.7), Math.round(cy - s * 0.7), Math.round(s * 1.4), Math.round(s * 1.4));
  // Hold-foltok.
  ctx.fillStyle = "rgba(140,150,170,0.55)";
  ctx.fillRect(Math.round(cx - s + 4), Math.round(cy - s + 3), 3, 3);
  ctx.fillRect(Math.round(cx + 2), Math.round(cy - 3), 4, 4);
  ctx.fillRect(Math.round(cx - 5), Math.round(cy + 2), 3, 2);
  ctx.globalAlpha = 1;
}

/** Minecraft-stílusú pixel-felhők: nagyobb, lapos, pixeles, több réteg. */
function drawMcClouds(ctx: CanvasRenderingContext2D, time: number, viewW: number) {
  const cloudLayer = 4;
  for (let i = 0; i < cloudLayer; i++) {
    const speed = 0.010 + i * 0.004;
    const yBase = 18 + i * 18;
    const cxBase = ((i * 230 + time * speed) % (viewW + 320)) - 180;
    const scale = 1 + i * 0.4;

    // Minecraft cloud: nagy lapos 6×1 pixelblokk + vegyes "zaj" kisebb téglalapokkal.
    ctx.fillStyle = i < 2 ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.55)";
    // Fő felhő-test.
    ctx.fillRect(Math.round(cxBase), Math.round(yBase), Math.round(82 * scale), Math.round(9 * scale));
    ctx.fillRect(Math.round(cxBase + 14 * scale), Math.round(yBase - 5 * scale), Math.round(58 * scale), Math.round(5 * scale));
    ctx.fillRect(Math.round(cxBase + 26 * scale), Math.round(yBase + 9 * scale), Math.round(42 * scale), Math.round(4 * scale));

    // Halvány "aljazat".
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(Math.round(cxBase - 4), Math.round(yBase + 3), Math.round(6 * scale), Math.round(6 * scale));
    ctx.fillRect(Math.round(cxBase + 86 * scale), Math.round(yBase + 3), Math.round(6 * scale), Math.round(6 * scale));

    // Sötétebb alsó él.
    ctx.fillStyle = "rgba(180,190,200,0.30)";
    ctx.fillRect(Math.round(cxBase), Math.round(yBase + 9 * scale - 1), Math.round(82 * scale), 1);
  }
}

/**
 * Steve-szerű Minecraft pixel player.
 * PLAYER_W=14, PLAYER_H=26.
 * Láb = 12px, Törzs = 10px, Fej = 8px (szigorú aranyú pixel-vox).
 */
function drawPlayer(ctx: CanvasRenderingContext2D, px: number, py: number, facing: number, tick: number) {
  const x = Math.round(px);
  const y = Math.round(py);
  const walking = Math.abs((Math.sin(tick * 0.35)));
  const bob = walking > 0.1 ? Math.round(Math.sin(tick * 0.18) * 1) : 0;

  // Walk cycle: karok és lábak swing.
  const legSwing = Math.round(Math.sin(tick * 0.35) * 2);
  const armSwing = Math.round(Math.sin(tick * 0.35 + Math.PI) * 2);

  // Koordináták: y = láb alja, fel van a fej.
  const footY = y + bob;
  const legTop = footY - 12;        // lábak: 12 pixel magasak
  const torsoTop = legTop - 10;     // törzs: 10 pixel magas
  const headBottom = torsoTop;
  const headTop = headBottom - 8;   // fej: 8x8 pixel
  const centerX = x;

  // Árnyék a talajon.
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(centerX - 1, footY + 1, 14, 2);

  // === LÁBAK (két 4x12) ===
  ctx.fillStyle = "#1C3A78"; // nadrág sötétkék
  // Bal láb
  ctx.fillRect(centerX + 1, legTop - legSwing, 4, 12);
  // Jobb láb
  ctx.fillRect(centerX + 7, legTop + legSwing, 4, 12);
  // Nadrág világosabb csík (highlight bal oldal).
  ctx.fillStyle = "#2A4D94";
  ctx.fillRect(centerX + 1, legTop - legSwing, 1, 12);
  ctx.fillRect(centerX + 7, legTop + legSwing, 1, 12);
  // Cipő
  ctx.fillStyle = "#0E1A35";
  ctx.fillRect(centerX + 1, legTop - legSwing + 10, 4, 2);
  ctx.fillRect(centerX + 7, legTop + legSwing + 10, 4, 2);

  // === TÖRZS (8x10) ===
  ctx.fillStyle = "#2F8AE0"; // póló kék (Steve: cyános)
  ctx.fillRect(centerX + 2, torsoTop, 8, 10);
  // Világosabb bal oldal.
  ctx.fillStyle = "#44A1F2";
  ctx.fillRect(centerX + 2, torsoTop, 2, 10);
  // Sötétebb jobb oldal.
  ctx.fillStyle = "#1F6FBC";
  ctx.fillRect(centerX + 9, torsoTop, 1, 10);
  // Öv (alsó csík).
  ctx.fillStyle = "#1A3C6E";
  ctx.fillRect(centerX + 2, torsoTop + 9, 8, 1);

  // === KAROK (2x 3x10) ===
  // Bőrszín (kéz-alj).
  ctx.fillStyle = "#CE9776";
  const armLeftY = torsoTop + 1 + armSwing;
  const armRightY = torsoTop + 1 - armSwing;
  ctx.fillRect(centerX - 1, armLeftY + 7, 3, 3);
  ctx.fillRect(centerX + 10, armRightY + 7, 3, 3);
  // Póló-ujj (kék).
  ctx.fillStyle = "#2F8AE0";
  ctx.fillRect(centerX - 1, armLeftY, 3, 7);
  ctx.fillRect(centerX + 10, armRightY, 3, 7);
  // Világos bal-széle ujj.
  ctx.fillStyle = "#44A1F2";
  ctx.fillRect(centerX - 1, armLeftY, 1, 7);
  ctx.fillRect(centerX + 10, armRightY, 1, 7);

  // === FEJ (8x8) ===
  // Haj (felső 2 sor + sarok).
  ctx.fillStyle = "#46341E";
  ctx.fillRect(centerX + 2, headTop, 8, 3);
  ctx.fillRect(centerX + 2, headTop + 3, 1, 2);
  ctx.fillRect(centerX + 9, headTop + 3, 1, 2);
  // Arc bőrszín.
  ctx.fillStyle = "#D5A07E";
  ctx.fillRect(centerX + 3, headTop + 3, 6, 5);
  // Arc árnyék (jobb oldal).
  ctx.fillStyle = "#B78760";
  ctx.fillRect(centerX + 8, headTop + 3, 1, 5);

  // Szemek (2x1 fehér + 1 fekete pupilla).
  const eyeY = headTop + 4;
  const faceOffset = facing > 0 ? 0 : 0; // szimmetrikus szem mindkét irányban
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(centerX + 3 + faceOffset, eyeY, 2, 1);
  ctx.fillRect(centerX + 6 + faceOffset, eyeY, 2, 1);
  ctx.fillStyle = "#2A5ACE"; // kék szem
  ctx.fillRect(centerX + 4 + (facing > 0 ? 0 : -1), eyeY, 1, 1);
  ctx.fillRect(centerX + 7 + (facing > 0 ? 0 : -1), eyeY, 1, 1);

  // Orr.
  ctx.fillStyle = "#B78760";
  ctx.fillRect(centerX + 5, headTop + 5, 1, 1);

  // Száj.
  ctx.fillStyle = "#6B3A1E";
  ctx.fillRect(centerX + 4, headTop + 7, 4, 1);

  // Szakáll (sötétebb csík az állon).
  ctx.fillStyle = "#3E2C16";
  ctx.fillRect(centerX + 3, headTop + 6, 1, 1);
  ctx.fillRect(centerX + 8, headTop + 6, 1, 1);
}

function MenuBlock({ t }: { t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (c) {
      c.imageSmoothingEnabled = false;
      drawBlock(c, 0, 0, t, performance.now(), 0, 0);
    }
  }, [t]);
  return <canvas ref={ref} width={TILE} height={TILE} className="rounded border border-black/40" style={{ imageRendering: "pixelated" as const }} />;
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
  const hoverCellRef = useRef<{ c: number; r: number } | null>(null);

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
      // Stale-hover visszaállítás play → quiz átmenetnél (Eszter F2c PARTIAL finding):
      // kvíz megjelenése előtt nincs szükség hover indikátorra.
      hoverCellRef.current = null;
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
    // Stale-hover visszaállítás (Eszter F2 LOW finding — új kör kezdetekor ne maradjon kijelölés).
    hoverCellRef.current = null;
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
    // Stale-hover visszaállítás kör-végnél is (Eszter F2 LOW finding).
    hoverCellRef.current = null;
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
    // Pixel-perfect renderelés (Minecraft-stílusú): nincs bilinear smoothing.
    ctx.imageSmoothingEnabled = false;

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

      // Klasszikus Minecraft pixel-nap és (éjszaka) hold: négyzetes, pixeles, sarokvilágítással.
      const sunOrbit = t * 0.00005;
      const sunX = CW * 0.52 + Math.cos(sunOrbit) * CW * 0.42;
      const sunY = 54 + Math.sin(sunOrbit * 1.35) * 22;
      const moonX = CW - sunX;
      const moonY = sunY;
      // Nappal: nap. Éjszaka (cycle < 0.45): hold fokozatos halványulással.
      if (cycle > 0.1) {
        drawMcSun(ctx, sunX, sunY);
      }
      if (cycle < 0.55) {
        drawMcMoon(ctx, moonX, moonY, Math.min(1, (0.55 - cycle) * 3));
      }

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

      // Klasszikus Minecraft pixel-felhők: többrétegű, lapos, pixeles.
      drawMcClouds(ctx, t, CW);

      const c0 = Math.floor(camX / TILE);
      const c1 = Math.ceil((camX + CW) / TILE) + 1;
      for (let r = 0; r < ROWS; r++) {
        for (let c = Math.max(0, c0); c < Math.min(COLS, c1); c++) {
          const cell = w[r * COLS + c] ?? AIR;
          if (cell) {
            // Ambient Occlusion: szomszédos szilárd cellák lekérdezése (három oldalról világséta).
            const top = r > 0 ? solid(w[(r - 1) * COLS + c] ?? AIR) : false;
            const bottom = r < ROWS - 1 ? solid(w[(r + 1) * COLS + c] ?? AIR) : false;
            const left = c > 0 ? solid(w[r * COLS + (c - 1)] ?? AIR) : false;
            const right = c < COLS - 1 ? solid(w[r * COLS + (c + 1)] ?? AIR) : false;
            drawBlock(
              ctx,
              c * TILE - camX,
              r * TILE - camY,
              cell,
              t,
              c,
              r,
              { sunX, sunY, viewW: CW, viewH: CH },
              { top, bottom, left, right },
            );
          }
        }
      }

      // Hover outline (klasszikus Minecraft fekete pixel-keret a célzott blokk körül).
      const hover = hoverCellRef.current;
      if (hover) {
        const cell = w[hover.r * COLS + hover.c] ?? AIR;
        if (cell && mineable(cell) && playerCanReachTile(p, hover.c, hover.r)) {
          const hx = Math.round(hover.c * TILE - camX);
          const hy = Math.round(hover.r * TILE - camY);
          // Külső fekete keret.
          ctx.fillStyle = "rgba(0,0,0,0.9)";
          ctx.fillRect(hx - 1, hy - 1, TILE + 2, 1);
          ctx.fillRect(hx - 1, hy + TILE, TILE + 2, 1);
          ctx.fillRect(hx - 1, hy - 1, 1, TILE + 2);
          ctx.fillRect(hx + TILE, hy - 1, 1, TILE + 2);
          // Finom világos belső pulzálás.
          const pulse = 0.3 + Math.sin(t * 0.008) * 0.3;
          ctx.fillStyle = `rgba(255,255,255,${pulse})`;
          ctx.fillRect(hx, hy, TILE, 1);
          ctx.fillRect(hx, hy + TILE - 1, TILE, 1);
          ctx.fillRect(hx, hy, 1, TILE);
          ctx.fillRect(hx + TILE - 1, hy, 1, TILE);
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
    // Stale-hover visszaállítás quiz → play átmenetnél is (Eszter F2c PARTIAL finding):
    // ha a játékos a quiz alatt nem mozgatja a kurzort, a korábbi highlight újra felvillanhat.
    hoverCellRef.current = null;
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

  /** Hover-outline: a kurzor / ujj alatti blokk célzókeretéhez. */
  const onCanvasPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "play") return;
      const canvas = e.currentTarget;
      const { x, y } = pointerOnCanvas(canvas, e.clientX, e.clientY);
      const cam = cameraRef.current;
      const tc = Math.floor((x + cam.x) / TILE);
      const tr = Math.floor((y + cam.y) / TILE);
      if (tc < 0 || tc >= COLS || tr < 0 || tr >= ROWS) {
        hoverCellRef.current = null;
        return;
      }
      hoverCellRef.current = { c: tc, r: tr };
    },
    [phase],
  );

  const onCanvasPointerLeave = useCallback(() => {
    hoverCellRef.current = null;
  }, []);

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

          {phase === "play" && <div className="flex flex-col items-center gap-1.5">{/* === CANVAS LEGFELÜL (mobil-first) === */}<div className="rounded-xl overflow-hidden border-2 border-lime-700/70 shadow-[0_0_28px_rgba(34,197,94,0.18)] w-full bg-black min-h-[min(50dvh,340px)] sm:min-h-[280px]"><canvas ref={canvasRef} className="block touch-manipulation w-full max-w-full cursor-crosshair" style={{ imageRendering: "pixelated" as const }} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerLeave={onCanvasPointerLeave} /></div>{/* === KONTROLLGOMBOK közvetlenül a canvas alatt === */}<div className="grid grid-cols-4 gap-1.5 w-full"><Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "left")} onPointerUp={(e) => endHold(e, "left")} onPointerCancel={(e) => endHold(e, "left")} onPointerLeave={(e) => endHold(e, "left")}>Balra</Button><Button type="button" size="sm" className="bg-violet-700 hover:bg-violet-600 text-white border border-violet-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "jump")} onPointerUp={(e) => endHold(e, "jump")} onPointerCancel={(e) => endHold(e, "jump")} onPointerLeave={(e) => endHold(e, "jump")}>Ugrás</Button><Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "right")} onPointerUp={(e) => endHold(e, "right")} onPointerCancel={(e) => endHold(e, "right")} onPointerLeave={(e) => endHold(e, "right")}>Jobbra</Button><Button type="button" size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-200/35 touch-manipulation shadow-md py-3 text-xs" onClick={() => tryMine()}><Pickaxe className="w-3.5 h-3.5 mr-1" />Bányász</Button></div>{/* === KOMPAKT HUD sáv === */}<div className="w-full flex items-center gap-1.5"><div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-cyan-400 to-lime-500 transition-all" style={{ width: `${(timeLeft / ROUND_LIMIT) * 100}%` }} /></div><span className="text-[10px] font-bold text-white/80 tabular-nums min-w-[32px] text-right">{timeLeft}s</span></div><div className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70"><span>XP: <strong className="text-amber-300">{sessionXp}</strong></span><span>Blokk: {blocksMined}</span><span>Érc: {rareBlocks}</span><span className="flex items-center gap-0.5"><Flame className="w-3 h-3 text-orange-400" />{streak}</span></div>{/* === Cél sáv (kompakt) === */}<GameNextGoalBar accent="lime" headline={streak >= ROUND_STREAK_GOAL ? "Szuper sorozat!" : `${streak}/${ROUND_STREAK_GOAL} jó egymás után`} subtitle="" current={Math.min(streak, ROUND_STREAK_GOAL)} target={ROUND_STREAK_GOAL} className="w-full" /><div className="flex gap-2 justify-center w-full"><Button type="button" size="sm" className="bg-amber-600/80 hover:bg-amber-500 text-slate-950 border border-amber-200/45 shadow-md text-xs px-3 py-1" onClick={endRun}>Kör vége</Button></div></div>}

          {phase === "over" && <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center"><Box className="w-12 h-12 text-lime-400" /><p className="text-lg font-bold">Bányászat vége</p><p className="text-sm font-semibold text-lime-100/90 max-w-sm">Minden jó kvíz angol szavakat erősített — nézd meg az XP-t és a sorozatot: ez a munkád gyümölcse!</p><p className="text-sm text-white/75">XP: <strong className="text-amber-300">{sessionXp}</strong> · Blokkok: <strong>{blocksMined}</strong> · Érc: <strong>{rareBlocks}</strong></p>{syncEligibility?.eligible ? <p className="text-xs text-emerald-300/90">Eredmény elküldve.</p> : <p className="text-xs text-white/50 max-w-xs">{syncBanner}</p>}<div className="flex gap-2"><Button className="bg-lime-700 hover:bg-lime-600" onClick={startGame}><RotateCcw className="w-4 h-4 mr-1" />Új világ</Button><Link href="/games"><Button variant="outline" className="border-white/40 text-white">Lista</Button></Link></div></div>}
        </CardContent></Card>
      </main>

      <AnimatePresence>{phase === "quiz" && quiz && <motion.div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`w-full max-w-md rounded-2xl border-2 border-lime-500/50 bg-slate-950/95 p-4 shadow-2xl ${wrongShake ? "animate-shake" : ""}`}><p className="text-xs font-bold text-lime-300 uppercase mb-1">Angol mini-teszt</p><p className="text-[11px] text-white/65 mb-2">Ha eltalálod, a blokk eltűnik és jön az XP. Rossz válasz: próbáld újra ugyanazt a blokkot — nincs büntető víz, csak gyakorolsz tovább.</p><p className="text-base font-semibold mb-4">{quiz.prompt}</p><div className="grid gap-2">{quiz.options.map((o, i) => <Button key={`${o}-${i}`} variant="secondary" className="h-auto py-3 text-left bg-white/10 hover:bg-lime-800/50 text-white border border-lime-900/40 text-[15px]" onClick={() => onAnswer(i)}>{o}</Button>)}</div></motion.div></motion.div>}</AnimatePresence>

      <AnimatePresence>{achievement && <motion.div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] bg-amber-500/95 text-slate-950 font-bold text-sm px-4 py-2 rounded-xl shadow-xl border border-amber-200/60 whitespace-nowrap" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>{achievement}</motion.div>}</AnimatePresence>
      <style>{`@keyframes shake {0%,100% { transform: translateX(0); }25% { transform: translateX(-5px); }75% { transform: translateX(5px); }} .animate-shake { animation: shake 0.16s ease-in-out 2; }`}</style>
    </div>
  );
}
