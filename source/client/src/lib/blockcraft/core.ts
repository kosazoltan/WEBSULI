/**
 * J3a — Kockavadász „Rúnabánya”: a játék tiszta, determinisztikus magja (végrehajtás J3 / J3a 2. lépés, K.6; terv 5.3).
 *
 * Rétegrend (KSZ-1): ez a modul React, three.js, DOM, hang és óra nélkül fut. A lap (`P/BlockCraftQuiz.tsx`) és a
 * node-szimuláció (`./sim.ts`) UGYANEZT a meghajtót hívja (`createRuneMine`: fix lépésű hurok, időskála, kérdés-sáv
 * állapotgép, események) — csak a játékos mozgatása más: a lapon voxel-fizika, a szimulációban rácson járó bot (K.6
 * „Közös meghajtó”, C-52).
 *
 * Szabályok:
 *  - A sima blokk KÉRDÉS NÉLKÜL bányászható: tartással a blokktípus ideje alatt (fű / föld 0,4 mp, kő 0,8, érc 1,2 —
 *    `MINE_MS`), vagy koppintással: egy koppintás egy „ütés”, `TAP_HITS` ütés = egy blokk (koppintós mód).
 *  - A rúnaérc (`RUNE_ORE`) megérintése Rúna-zárat nyit: `request("trigger")` → a director kérdése, a válaszok 3–4 lebegő
 *    rúnakövön a világban. Jó válasz: dupla zsákmány (2 rúnakristály + kombó-XP); rossz / lejárt: kisebb zsákmány
 *    (1 kristály), a helyes rúna ≥ 1,8 mp-ig világít (a kérdés-sáv megoldás-kijelzése), a tétel ismétlési sorba kerül.
 *    A pálya célja „N rúnaérc” (`BLOCK_CRAFT_LEVELS[i].runeGoal`: 3/4/5/6/7) — a kinyitott zárak száma.
 *  - A pálya ideje nem függ a válaszok helyességétől (a régi „jó válasz időcsökkentése” megszűnt).
 *  - Rúnaérc mindig elérhető: ha a játékos `RUNE_NEAR_RADIUS` blokkos körzetében nincs, `RUNE_CHECK_MS`-en belül új nő a
 *    közelében (`spawnRuneOreNear`) — így a kérdés nélküli rés a director `maxGapMs` (15 s) célja alatt marad.
 *  - Kérdés nélkül (`questions: null`, vagy ha a forrás nem ad tételt — terv 8.1) a rúnaérc zár nélkül törik (1 kristály).
 */
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { createFixedLoop, type FixedLoop } from "@/game-engine/play/loop";
import { comboBreak, comboCorrect, createCombo, type ComboState } from "@/game-engine/play/combo";
import { fitsAllViewports } from "@/game-engine/play/promptFit";
import type { DirectorConfig } from "@/game-engine/play/questionDirector";
import type { QuestionUi } from "@/game-engine/play/questionUi";
import type { QuestionOutcome, QuestionPresentation, QuestionResult } from "@/game-engine/play/types";

import {
  AIR, BEDROCK, COAL, CREEPER, DIAMOND, DIRT, GRASS, IRON, LEAVES, LOG, RUNE_ORE, SAND, SKELETON, SPIDER, STONE, WATER,
  WX, WY, WZ, ZOMBIE, vGet, vMineable, vSet,
  type VoxelGenConfig, type VoxelWorld,
} from "../voxelcraft";

export const BLOCK_CRAFT_GAME_ID = "block-craft-quiz" as const;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pályák (a régi „5 bánya” szerkezete; a cél „N rúnaérc”)                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export type LevelBiome = "forest" | "caves" | "desert" | "diamond" | "standard";
export type LevelWeather = "clear" | "rain" | "snow" | "sandstorm";
export type LevelConfig = {
  id: number;
  name: string;
  description: string;
  /** Hány rúnaércet (Rúna-zárat) kell kinyitni a pálya teljesítéséhez (J3a: 3/4/5/6/7). */
  runeGoal: number;
  /** Másodperces időkeret a pályára (a válaszok helyességétől független). */
  timeLimit: number;
  oreMultiplier: number;
  treeDensity: number;
  biome: LevelBiome;
  skyTint: { day: string; dusk: string };
  weather: LevelWeather;
  isBossLevel?: boolean;
};

export const BLOCK_CRAFT_LEVELS: readonly LevelConfig[] = [
  {
    id: 1, name: "1. Erdei kezdés", runeGoal: 3, timeLimit: 240, oreMultiplier: 0.7, treeDensity: 0.12, biome: "forest",
    description: "Bányássz szabadon, és nyiss ki 3 világító rúnaércet a jelzőtűzhöz!",
    skyTint: { day: "#9bd1ee", dusk: "#5d7faf" }, weather: "clear",
  },
  {
    id: 2, name: "2. Sűrű erdő", runeGoal: 4, timeLimit: 240, oreMultiplier: 1.0, treeDensity: 0.2, biome: "forest",
    description: "Több fa, sűrűbb növényzet. 4 rúnaérc a célod.",
    skyTint: { day: "#8ac8e7", dusk: "#4f6fa0" }, weather: "clear",
  },
  {
    id: 3, name: "3. Barlangrendszer", runeGoal: 5, timeLimit: 220, oreMultiplier: 1.5, treeDensity: 0.1, biome: "caves",
    description: "Sok barlang, vegyes érctelep. 5 rúnaércet keress!",
    skyTint: { day: "#7ab1d4", dusk: "#3c5577" }, weather: "rain",
  },
  {
    id: 4, name: "4. Sivatag és tó", runeGoal: 6, timeLimit: 210, oreMultiplier: 1.1, treeDensity: 0.1, biome: "desert",
    description: "Homokos biomák, tavak. 6 rúnaérc — vigyázz a vízre!",
    skyTint: { day: "#f4d8a0", dusk: "#c08555" }, weather: "sandstorm",
  },
  {
    id: 5, name: "5. Gyémánt mélységek", runeGoal: 7, timeLimit: 200, oreMultiplier: 2.4, treeDensity: 0.08, biome: "diamond",
    description: "Sok gyémánt és vas. 7 rúnaérc nyitja a mélység kapuját!",
    skyTint: { day: "#7494c9", dusk: "#2a3550" }, weather: "snow", isBossLevel: true,
  },
];

/** Pálya-konfig → voxel-világgenerátor paraméterek (változatlan a J3a előttihez képest). */
export function genCfgFor(cfg: LevelConfig): VoxelGenConfig {
  const desert = cfg.biome === "desert";
  return {
    oreMultiplier: cfg.oreMultiplier,
    treeCount: Math.max(4, Math.round(cfg.treeDensity * 90)) + (cfg.biome === "forest" ? 6 : 0),
    surfaceMobCount: (cfg.id >= 3 ? 3 + cfg.id : 2) + (cfg.isBossLevel ? 3 : 0),
    caveMobCount: cfg.id >= 4 ? 5 : cfg.id === 3 ? 3 : 0,
    lakeCount: desert ? 2 : 1,
    sandPatchCount: desert ? 6 : 1,
    allowZombies: cfg.id >= 3,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Bányászás                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Tartásos bányászási idő blokktípusonként (terv 5.3: 0,4–1,2 mp). */
export const MINE_MS: Readonly<Record<number, number>> = {
  [GRASS]: 400, [DIRT]: 400, [SAND]: 400, [LEAVES]: 400,
  [LOG]: 600,
  [STONE]: 800, [CREEPER]: 800, [ZOMBIE]: 800, [SKELETON]: 800, [SPIDER]: 800,
  [COAL]: 1200, [IRON]: 1200, [DIAMOND]: 1200,
};
export const DEFAULT_MINE_MS = 800;
/** Koppintós mód: ennyi ütés egy blokk. */
export const TAP_HITS = 3;
/** Ennél rövidebb nyomás „ütés” (koppintás), a hosszabb tartás. */
export const TAP_MAX_MS = 250;

export function mineTimeMs(t: number): number {
  return MINE_MS[t] ?? DEFAULT_MINE_MS;
}

/** A régi kvízes XP negyede: a bányászás jutalma kicsi, a rúnazár a nagy pont (pontgyűjtés, terv 4.1/7). */
const BLOCK_XP: Readonly<Record<number, number>> = {
  [GRASS]: 5, [DIRT]: 6, [STONE]: 9, [LOG]: 8, [LEAVES]: 4, [COAL]: 14, [IRON]: 22, [DIAMOND]: 35, [SAND]: 5,
  [CREEPER]: 20, [ZOMBIE]: 24, [SKELETON]: 28, [SPIDER]: 20,
};
export function blockXp(t: number): number {
  return BLOCK_XP[t] ?? 0;
}

/** Rúnazár-jutalom: jó válasz 60 × kombó-szorzó, rossz / lejárt 10, kérdés nélkül 20. */
export const RUNE_XP_CORRECT = 60;
export const RUNE_XP_WRONG = 10;
export const RUNE_XP_FREE = 20;
/** Zsákmány: jó = dupla (2 kristály), rossz = kisebb (1), kérdés nélkül 1. */
export const RUNE_LOOT_CORRECT = 2;
export const RUNE_LOOT_WRONG = 1;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rúnaércek a világban                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Pos = { x: number; y: number; z: number };
export type Vec3 = { x: number; y: number; z: number };

/** Ennyi blokkos (vízszintes) körzetben mindig van rúnaérc (végrehajtás J3a 2.). */
export const RUNE_NEAR_RADIUS = 8;
export const RUNE_SPAWN_MIN = 4;
export const RUNE_SPAWN_MAX = 7;
/** Ilyen sűrűn (sim-ms) nézi a mag, van-e rúnaérc a közelben. */
export const RUNE_CHECK_MS = 500;
/** Egyszerre legfeljebb ennyi rúnaérc lehet a világban (a legtávolabbi átköltözik). */
export const RUNE_MAX = 24;
/** Pálya eleji rúnaércek (az első a kezdő nézés irányában, 3–5 blokkra — a cél-jelzőhöz). */
export const RUNE_INITIAL = 5;

/** Az oszlop legfelső szolid blokkjának magassága (víznél / üres oszlopnál −1). */
export function surfaceTop(w: VoxelWorld, x: number, z: number): number {
  for (let y = WY - 1; y >= 0; y--) {
    const t = vGet(w, x, y, z);
    if (t === AIR) continue;
    return t === WATER ? -1 : y;
  }
  return -1;
}

/** Nőhet-e rúnaérc az oszlop tetejére: természetes talaj / kő a tetején, fölötte két szabad cella, nem a szélén. */
export function canHostRune(w: VoxelWorld, x: number, z: number): boolean {
  if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) return false;
  const y = surfaceTop(w, x, z);
  if (y < 1 || y + 2 >= WY) return false;
  const t = vGet(w, x, y, z);
  if (t !== GRASS && t !== DIRT && t !== SAND && t !== STONE) return false;
  return vGet(w, x, y + 1, z) === AIR && vGet(w, x, y + 2, z) === AIR;
}

/**
 * Rúnaérc-lehelyezés a játékos körüli gyűrűben (seedelt). `toward`: előnyben a megadott irány (± `spread` / 2, alap
 * ± 60°); ha arra nincs alkalmas hely, bármely irány.
 */
export function spawnRuneOreNear(
  w: VoxelWorld,
  rng: Rng,
  px: number,
  pz: number,
  minR = RUNE_SPAWN_MIN,
  maxR = RUNE_SPAWN_MAX,
  toward?: { x: number; z: number },
  spread = (Math.PI * 2) / 3,
): Pos | null {
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const base = toward && (toward.x !== 0 || toward.z !== 0) ? Math.atan2(toward.x, toward.z) : null;
  // A távolság a játékostól az érc KÖZEPÉIG számít (ahogy a `nearestRune` méri): legfeljebb `maxR + 1`.
  const dist = (x: number, z: number) => Math.hypot(x + 0.5 - px, z + 0.5 - pz);
  for (let attempt = 0; attempt < 48; attempt++) {
    const widen = attempt >= 24; // a második félben bármely irány
    const a = base !== null && !widen ? base + (rng.next() - 0.5) * spread : rng.next() * Math.PI * 2;
    const r = minR + rng.next() * (maxR - minR);
    const x = Math.floor(px + Math.sin(a) * r);
    const z = Math.floor(pz + Math.cos(a) * r);
    if ((x === ix && z === iz) || dist(x, z) > maxR + 1 || !canHostRune(w, x, z)) continue;
    const y = surfaceTop(w, x, z) + 1;
    vSet(w, x, y, z, RUNE_ORE);
    return { x, y, z };
  }
  // Tartalék (pl. a világ szélén, tó mellett): determinisztikus pásztázás, a legközelebbi alkalmas oszlop a gyűrűben.
  let best: { x: number; z: number; d: number } | null = null;
  const reach = maxR + 1;
  for (let dz = -reach - 1; dz <= reach + 1; dz++) for (let dx = -reach - 1; dx <= reach + 1; dx++) {
    const x = ix + dx;
    const z = iz + dz;
    const d = dist(x, z);
    if (d < Math.min(minR, 2) || d > reach || (x === ix && z === iz)) continue;
    if (!canHostRune(w, x, z)) continue;
    if (!best || d < best.d) best = { x, z, d };
  }
  if (!best) return null;
  const y = surfaceTop(w, best.x, best.z) + 1;
  vSet(w, best.x, y, best.z, RUNE_ORE);
  return { x: best.x, y, z: best.z };
}

/** A világ összes rúnaérce (pálya elején / ellenőrzéshez). */
export function findRuneOres(w: VoxelWorld): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < WY; y++) for (let z = 0; z < WZ; z++) for (let x = 0; x < WX; x++) {
    if (vGet(w, x, y, z) === RUNE_ORE) out.push({ x, y, z });
  }
  return out;
}

/** A legközelebbi rúnaérc vízszintes távolsága (blokk-középtől) — `Infinity`, ha nincs. */
export function nearestRune(ores: readonly Pos[], px: number, pz: number): { ore: Pos | null; dist: number } {
  let best: Pos | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const o of ores) {
    const d = Math.hypot(o.x + 0.5 - px, o.z + 0.5 - pz);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return { ore: best, dist: bestD };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rúna-zár: a rúnakövek helye és találata                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A rúnakő találati gömbje (a látványnál ~20%-kal nagyobb — KSZ-12 megbocsátó bemenet). */
export const RUNE_STONE_HIT_RADIUS = 0.42;
export const RUNE_STONE_SIZE = 0.48;

/**
 * A 3–4 rúnakő helye az érc körül, a játékos felé néző félkörívben (az érc előtt, 1,05 sugarú íven, az érc
 * magasságában, váltakozva kicsit fölötte / alatta) — a célkereszt az ércen, a kövek körülötte látszanak. Tiszta
 * matematika — a lap rajzolja, a találatot a `pickRuneStone` méri.
 */
export function runeStoneLayout(ore: Pos, player: Vec3, count: number): Vec3[] {
  const cx = ore.x + 0.5;
  const cz = ore.z + 0.5;
  let fx = player.x - cx;
  let fz = player.z - cz;
  const len = Math.hypot(fx, fz);
  if (len < 1e-6) {
    fx = 0;
    fz = 1;
  } else {
    fx /= len;
    fz /= len;
  }
  // Oldalirány (a játékos szemszögéből balról jobbra).
  const sx = fz;
  const sz = -fx;
  const out: Vec3[] = [];
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // −1..1
    const ang = u * (Math.PI / 3); // ±60°
    const side = Math.sin(ang) * 1.25;
    const front = 0.5 + Math.cos(ang) * 0.3;
    out.push({
      x: cx + sx * side + fx * front,
      y: ore.y + 0.5 + (i % 2 === 0 ? 0.55 : -0.05),
      z: cz + sz * side + fz * front,
    });
  }
  return out;
}

/** Sugár–gömb metszés: a sugár paramétere (≥ 0), vagy null. A `d` egységvektor. */
export function rayHitsSphere(o: Vec3, d: Vec3, c: Vec3, r: number): number | null {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  const t2 = -b + Math.sqrt(disc);
  return t2 >= 0 ? t2 : null;
}

/** A sugár által eltalált legközelebbi rúnakő indexe (`maxDist`-en belül), vagy −1. */
export function pickRuneStone(o: Vec3, d: Vec3, stones: readonly Vec3[], maxDist = 6, radius = RUNE_STONE_HIT_RADIUS): number {
  let best = -1;
  let bestT = maxDist;
  for (let i = 0; i < stones.length; i++) {
    const t = rayHitsSphere(o, d, stones[i]!, radius);
    if (t !== null && t <= bestT) {
      bestT = t;
      best = i;
    }
  }
  return best;
}

/** Arany visszajátszáshoz: a világ (FNV-1a) és a menet számlálóinak lenyomata. */
export function mineFingerprint(st: RuneMineState): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < st.world.length; i++) {
    h ^= st.world[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return [st.phase, st.level, st.opened, st.crystals, st.blocks, st.xp, st.combo.best, st.ores.length, h.toString(16)].join("|");
}

/**
 * A pálya másodperces visszaszámlálásának egy lépése (review #484, Codex): ha a pálya-cél már teljesült (`won` — az utolsó
 * rúnazár kinyílt, a megoldás-kijelzés még fut), az óra ÁLL, és nem jár le — a határidő előtt teljesített pálya győzelem.
 * Szabály a fordított esetre: ha a lejárat előbb jön, mint a célt teljesítő válasz (a zár még nyitott, vagy hiányzik még
 * rúnaérc), a pálya lejár (`expired`); a nyitott kérdés ilyenkor „megszakítva” zárul (nem hiba, nem ismétlés). A sorrend az
 * események sorrendje: a válasz szinkron állítja a `won`-t, a következő óra-lépés már ezt látja.
 */
export function levelClockTick(timeLeft: number, phase: RuneMineState["phase"]): { timeLeft: number; expired: boolean } {
  if (phase !== "play") return { timeLeft, expired: false };
  if (timeLeft <= 1) return { timeLeft: 0, expired: true };
  return { timeLeft: timeLeft - 1, expired: false };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A kérdés-ütemező beállítása                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A kérdés alatt a világ (a játékos is) fele sebességgel fut (terv 4.1/3: ≥ 0,35). */
export const RUNE_SLOW_MO = 0.5;

/** Végrehajtás J3a + terv 6.2: Kockavadász ≥ 7 kérdés/perc, a leghosszabb kérdés nélküli rés ≤ 15 s. */
export function blockCraftDirectorConfig(grade: number | null): DirectorConfig {
  return {
    gameId: BLOCK_CRAFT_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 15_000,
    targetPerMin: 7,
    baseWindowMs: 5000,
    slowMo: RUNE_SLOW_MO,
    grade,
    readingAware: true,
    promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs: 5000 }).ok,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A meghajtó: fix lépésű hurok + kérdés-sáv + bányászás + rúnazár (a lap és a sim közös útja)                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export type RuneLock = {
  ore: Pos;
  presentationId: number;
  stones: Vec3[];
  /** A zár kimenete (null, amíg nyitott); a lap a megoldás-kijelzés végéig rajzolja. */
  resolved: QuestionResult | null;
};

export type RuneMineEvent =
  | { type: "hit"; x: number; y: number; z: number; t: number; hits: number }
  | { type: "mined"; x: number; y: number; z: number; t: number; xp: number }
  | { type: "runeOpen"; ore: Pos; presentationId: number }
  | { type: "runeBreak"; ore: Pos; result: QuestionResult | "free"; crystals: number; xp: number; combo: number }
  | { type: "runeSpawn"; ore: Pos }
  | { type: "goal" };

export type RuneMineState = {
  phase: "idle" | "play" | "won";
  world: VoxelWorld;
  level: number;
  goal: number;
  opened: number;
  crystals: number;
  blocks: number;
  diamonds: number;
  xp: number;
  combo: ComboState;
  ores: Pos[];
  lock: RuneLock | null;
  /** Megérintett rúnaérc, amelynek kérdése még nem nyílt meg (kijelzés / minGap alatt vár). */
  pendingOre: Pos | null;
  /** Tartásos / koppintásos bányászás állapota. */
  mining: { key: number; hits: number; pressMs: number; pressing: boolean };
  lastStartMs: number | null;
};

export type MineTarget = { x: number; y: number; z: number };

/** A kérdés-sáv részhalmaza, amit a mag használ (a `createQuestionUi` és a `usePlayQuestion` is ilyen). */
export type RuneQuestions = Pick<QuestionUi, "frame" | "request" | "pick" | "canAsk" | "active" | "view" | "finish" | "finished" | "timeScale">;

export type RuneMineOptions = {
  seed: number | string;
  /** A kérdés-sáv (null: kérdés nélküli mód). Getter, mert a lap horga renderenként új objektumot ad. */
  questions: () => RuneQuestions | null;
  /** Egy fix lépés (ms) játékos-mozgása: a lapon voxel-fizika, a szimulációban rácson járó bot. */
  movePlayer: (dtMs: number) => void;
  player: () => Vec3;
  minGapMs: number;
};

export type RuneMine = {
  readonly loop: FixedLoop;
  state(): RuneMineState;
  /** Új pálya a megadott (már generált) világon. `toward`: a kezdő nézés iránya (az első rúnaérc arra nő). */
  startLevel(world: VoxelWorld, levelIndex: number, toward?: { x: number; z: number }): void;
  /** A célkereszt alatti blokk (a tartásos bányászás célja) — képkockánként. */
  aim(target: MineTarget | null): void;
  press(): void;
  release(): void;
  /** Egy koppintás egy adott blokkra (a vászon koppintása): ütés, rúnaércen zár. */
  hit(target: MineTarget): void;
  /** Rúnakő választása (a `presentation.options` indexe). */
  pick(optionIndex: number): void;
  /** A kérdés-sáv `onShow`-ja hívja: a várakozó rúnaérchez köti a megnyílt kérdést. */
  noteShow(p: QuestionPresentation): void;
  /** A kérdés-sáv `onOutcome`-ja hívja: zsákmány, kombó, pálya-cél. */
  applyOutcome(o: QuestionOutcome, p: QuestionPresentation): void;
  /** Képkocka: `realDtMs` valós idő, `paused` → a kérdés-óra és a sim áll. Visszaadja az interpolációs alphát. */
  frame(realDtMs: number, paused: boolean): number;
  drain(cb: (e: RuneMineEvent) => void): void;
  /** A kérdés-óra (a nem szüneteltetett valós idő összege, ms). */
  clockMs(): number;
  /** Teszt-kampó (`forceState({ question: true })`): rúnaérc a játékos elé és azonnali zár. */
  forceLock(facing: { x: number; z: number }): Pos | null;
};

export function createRuneMine(opts: RuneMineOptions): RuneMine {
  let rng: Rng = createRng(seedFrom(BLOCK_CRAFT_GAME_ID, opts.seed, "runes", 0));
  const st: RuneMineState = {
    phase: "idle",
    world: new Uint8Array(WX * WY * WZ),
    level: 0,
    goal: 0,
    opened: 0,
    crystals: 0,
    blocks: 0,
    diamonds: 0,
    xp: 0,
    combo: createCombo(),
    ores: [],
    lock: null,
    pendingOre: null,
    mining: { key: -1, hits: 0, pressMs: 0, pressing: false },
    lastStartMs: null,
  };
  let events: RuneMineEvent[] = [];
  let aimed: MineTarget | null = null;
  let clock = 0;
  let real = 0;
  let checkAcc = 0;
  const emit = (e: RuneMineEvent) => {
    events.push(e);
  };
  const keyOf = (t: MineTarget) => (t.y * WZ + t.z) * WX + t.x;

  const removeOre = (o: Pos) => {
    st.ores = st.ores.filter((r) => r.x !== o.x || r.y !== o.y || r.z !== o.z);
  };

  function ensureRuneNear(): void {
    // Az elfogyott / elbányászott (pl. lerakott blokk alá került) érc kikerül a listából.
    st.ores = st.ores.filter((o) => vGet(st.world, o.x, o.y, o.z) === RUNE_ORE);
    const p = opts.player();
    if (nearestRune(st.ores, p.x, p.z).dist <= RUNE_NEAR_RADIUS) return;
    if (st.ores.length >= RUNE_MAX) {
      // A legtávolabbi érc „átköltözik” a játékos közelébe.
      let far = 0;
      let farD = -1;
      st.ores.forEach((o, i) => {
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d > farD) {
          farD = d;
          far = i;
        }
      });
      const gone = st.ores[far]!;
      vSet(st.world, gone.x, gone.y, gone.z, AIR);
      st.ores.splice(far, 1);
    }
    const ore = spawnRuneOreNear(st.world, rng, p.x, p.z);
    if (ore) {
      st.ores.push(ore);
      emit({ type: "runeSpawn", ore });
    }
  }

  function mineBlock(target: MineTarget): void {
    const t = vGet(st.world, target.x, target.y, target.z);
    if (!vMineable(t) || t === RUNE_ORE || t === BEDROCK) return;
    vSet(st.world, target.x, target.y, target.z, AIR);
    st.blocks += 1;
    if (t === DIAMOND) st.diamonds += 1;
    const xp = blockXp(t);
    st.xp += xp;
    st.mining.key = -1;
    st.mining.hits = 0;
    st.mining.pressMs = 0;
    emit({ type: "mined", x: target.x, y: target.y, z: target.z, t, xp });
  }

  function breakRune(ore: Pos, result: QuestionResult | "free"): void {
    if (vGet(st.world, ore.x, ore.y, ore.z) === RUNE_ORE) vSet(st.world, ore.x, ore.y, ore.z, AIR);
    removeOre(ore);
    let crystals = RUNE_LOOT_WRONG;
    let xp = RUNE_XP_WRONG;
    if (result === "correct") {
      st.combo = comboCorrect(st.combo);
      crystals = RUNE_LOOT_CORRECT;
      xp = RUNE_XP_CORRECT * st.combo.multiplier;
    } else if (result === "free") {
      xp = RUNE_XP_FREE;
    } else {
      st.combo = comboBreak(st.combo);
    }
    st.crystals += crystals;
    st.xp += xp;
    st.opened += 1;
    emit({ type: "runeBreak", ore, result, crystals, xp, combo: st.combo.count });
    if (st.phase === "play" && st.opened >= st.goal) {
      st.phase = "won";
      emit({ type: "goal" });
    }
  }

  function touchRune(ore: Pos): void {
    if (st.phase !== "play") return;
    if (st.lock && !st.lock.resolved) return; // egyszerre egy zár
    if (st.pendingOre) return;
    const q = opts.questions();
    if (!q) {
      breakRune(ore, "free");
      return;
    }
    st.pendingOre = ore;
    tryAsk();
  }

  /** A várakozó rúnaérc kérdésének kérése (C-53: kijelzés alatt csak egyszer — a kérés függőben vár). */
  function tryAsk(): void {
    const ore = st.pendingOre;
    if (!ore || st.phase !== "play") return;
    if (vGet(st.world, ore.x, ore.y, ore.z) !== RUNE_ORE) {
      st.pendingOre = null;
      return;
    }
    const q = opts.questions();
    if (!q) {
      st.pendingOre = null;
      breakRune(ore, "free");
      return;
    }
    if (q.finished() || q.active()) return;
    const v = q.view();
    if (v.reveal && v.pending !== null) return;
    const p = q.request("trigger", clock);
    if (p) return; // a `noteShow` (onShow) köti a zárhoz
    const gapOk = st.lastStartMs === null || clock - st.lastStartMs >= opts.minGapMs;
    if (q.canAsk() && gapOk) {
      // A forrás üres (terv 8.1): az érc zár nélkül törik — a játék kérdés nélkül is halad.
      st.pendingOre = null;
      breakRune(ore, "free");
    }
  }

  function clearResolvedLock(): void {
    const lock = st.lock;
    if (!lock || !lock.resolved) return;
    const q = opts.questions();
    const shown = q?.view().presentation ?? null;
    if (!shown || shown.id !== lock.presentationId) st.lock = null;
  }

  const loop = createFixedLoop((dt) => {
    if (st.phase !== "play") return;
    opts.movePlayer(dt);
    const m = st.mining;
    if (m.pressing && aimed) {
      const t = vGet(st.world, aimed.x, aimed.y, aimed.z);
      if (t === RUNE_ORE) {
        touchRune({ x: aimed.x, y: aimed.y, z: aimed.z });
      } else if (vMineable(t)) {
        const k = keyOf(aimed);
        if (k !== m.key) {
          m.key = k;
          m.hits = 0;
          m.pressMs = 0;
        }
        m.pressMs += dt;
        if (m.pressMs >= mineTimeMs(t)) {
          mineBlock(aimed);
          m.pressing = true; // a tartás folytatódik a következő blokkra
        }
      }
    }
    checkAcc += dt;
    if (checkAcc >= RUNE_CHECK_MS) {
      checkAcc = 0;
      ensureRuneNear();
    }
  });

  function registerHit(target: MineTarget): void {
    const t = vGet(st.world, target.x, target.y, target.z);
    if (t === RUNE_ORE) {
      touchRune({ x: target.x, y: target.y, z: target.z });
      return;
    }
    if (!vMineable(t)) return;
    const m = st.mining;
    const k = keyOf(target);
    if (k !== m.key) {
      m.key = k;
      m.hits = 0;
      m.pressMs = 0;
    }
    m.hits += 1;
    emit({ type: "hit", x: target.x, y: target.y, z: target.z, t, hits: m.hits });
    if (m.hits >= TAP_HITS) mineBlock(target);
  }

  return {
    loop,
    state: () => st,
    startLevel(world, levelIndex, toward) {
      const cfg = BLOCK_CRAFT_LEVELS[Math.max(0, Math.min(BLOCK_CRAFT_LEVELS.length - 1, levelIndex))]!;
      rng = createRng(seedFrom(BLOCK_CRAFT_GAME_ID, opts.seed, "runes", levelIndex));
      st.world = world;
      st.level = levelIndex;
      st.goal = cfg.runeGoal;
      st.opened = 0;
      st.phase = "play";
      st.lock = null;
      st.pendingOre = null;
      st.mining = { key: -1, hits: 0, pressMs: 0, pressing: false };
      aimed = null;
      checkAcc = 0;
      st.ores = findRuneOres(world);
      const p = opts.player();
      // Az első rúnaérc a kezdő nézés irányában, közel (cél-jelző: „Nyiss ki 3 rúnaércet!”), a többi szétszórva.
      const first = spawnRuneOreNear(world, rng, p.x, p.z, 3, 5, toward);
      if (first) st.ores.push(first);
      for (let i = 1; i < RUNE_INITIAL; i++) {
        const ore = spawnRuneOreNear(world, rng, p.x, p.z, 6, 14);
        if (ore) st.ores.push(ore);
      }
    },
    aim(target) {
      aimed = target;
    },
    press() {
      if (st.phase !== "play") return;
      st.mining.pressing = true;
      st.mining.pressMs = 0;
      if (aimed && vGet(st.world, aimed.x, aimed.y, aimed.z) === RUNE_ORE) touchRune({ ...aimed });
    },
    release() {
      const m = st.mining;
      if (!m.pressing) return;
      m.pressing = false;
      const short = m.pressMs < TAP_MAX_MS;
      m.pressMs = 0;
      if (short && aimed && st.phase === "play" && vGet(st.world, aimed.x, aimed.y, aimed.z) !== RUNE_ORE) registerHit(aimed);
    },
    hit(target) {
      if (st.phase !== "play") return;
      registerHit(target);
    },
    pick(optionIndex) {
      const q = opts.questions();
      if (!q || !st.lock || st.lock.resolved) return;
      q.pick(optionIndex, clock);
    },
    noteShow(p) {
      st.lastStartMs = p.startedAtSimMs;
      const ore = st.pendingOre;
      if (!ore) return;
      st.pendingOre = null;
      st.lock = { ore, presentationId: p.id, stones: runeStoneLayout(ore, opts.player(), p.options.length), resolved: null };
      emit({ type: "runeOpen", ore, presentationId: p.id });
    },
    applyOutcome(o, p) {
      const lock = st.lock;
      if (!lock || lock.presentationId !== p.id) return;
      if (o.result === "aborted") {
        st.lock = null;
        return;
      }
      lock.resolved = o.result;
      breakRune(lock.ore, o.result);
    },
    frame(realDtMs, paused) {
      const dt = Number.isFinite(realDtMs) && realDtMs > 0 ? realDtMs : 0;
      real += dt;
      if (!paused) clock += dt;
      const q = opts.questions();
      if (q && !paused) {
        // Menetvég a frame ELŐTT (J0c): nyitott kérdés „megszakítva”, a futó megoldás-kijelzés kifut.
        if (st.phase !== "play" && !q.finished()) q.finish();
        q.frame(clock, { tick: false });
        clearResolvedLock();
        tryAsk();
      }
      loop.setTimeScale(paused ? 0 : q ? q.timeScale() : 1);
      return loop.frame(real);
    },
    drain(cb) {
      if (events.length === 0) return;
      const list = events;
      events = [];
      for (const e of list) cb(e);
    },
    clockMs: () => clock,
    forceLock(facing) {
      if (st.phase !== "play") return null;
      const p = opts.player();
      const len = Math.hypot(facing.x, facing.z) || 1;
      const ore = spawnRuneOreNear(st.world, rng, p.x, p.z, 3, 4, { x: facing.x / len, z: facing.z / len }, Math.PI / 6);
      if (!ore) return null;
      st.ores.push(ore);
      emit({ type: "runeSpawn", ore });
      st.lock = null;
      st.pendingOre = null;
      touchRune(ore);
      return ore;
    },
  };
}
