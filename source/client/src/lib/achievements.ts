/**
 * Achievement (jelvény) rendszer — localStorage-alapú, kliens-oldali.
 *
 * Minden játék végén meghívja a `checkAchievements(stats)` függvényt egy
 * stat-objektummal (sessionXp, streak, blocksMined, enemiesKilled stb.),
 * ami unlockolja a teljesülő jelvényeket. Az unlocked jelvények persistensek
 * (localStorage), és toast-tal jelzünk, ha új jelvény dobott be.
 *
 * 50+ jelvény, 6 kategóriában:
 *   - GENERAL (összesített statok minden játékon)
 *   - BLOCKCRAFT (Kockavadász Quiz)
 *   - SPACE (Galaktikus Aszteroida)
 *   - BRAINROT (Brain Rot Lopás)
 *   - QUIZ (kvíz-egységes: helyes válasz, sorozat)
 *   - STREAK (daily challenge / cross-game)
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "websuli.achievements";
const STATS_KEY = "websuli.lifetime-stats";
const CHANGE_EVENT = "websuli:achievements-changed";

export type AchievementCategory = "general" | "blockcraft" | "space" | "brainrot" | "quiz" | "streak";

export type Achievement = {
  /** Egyedi azonosító (pl. "first_diamond"). NE módosítsd később, mert tárolt. */
  id: string;
  /** Megjelenítendő név. */
  title: string;
  /** Rövid leírás, követelmény. */
  description: string;
  /** Emoji vagy egyetlen karakter, ami a jelvény-ikon szerepét tölti be. */
  icon: string;
  /** Kategória — UI-csoportosításhoz. */
  category: AchievementCategory;
  /** Pont-érték (ranglista-bonus, jövőre). */
  points: number;
  /** Ritkasági besorolás (UI-szín). */
  tier: "common" | "rare" | "epic" | "legendary";
};

export type LifetimeStats = {
  totalXp: number;
  totalGames: number;
  totalCorrectAnswers: number;
  totalWrongAnswers: number;
  bestStreak: number;
  // Játék-specifikus
  blocksMined: number;
  enemiesKilled: number;
  brainRotsCaught: number;
  diamondsMined: number;
  bossesDefeated: number;
  perfectQuizzes: number; // run, ahol nem volt hibás válasz
  /** Hány napja indít napi kihívást (folyamatos streak). */
  dailyStreakDays: number;
  /** Hány nap jutott el a daily challenge-be összesen. */
  totalDailyDays: number;
};

const DEFAULT_STATS: LifetimeStats = {
  totalXp: 0,
  totalGames: 0,
  totalCorrectAnswers: 0,
  totalWrongAnswers: 0,
  bestStreak: 0,
  blocksMined: 0,
  enemiesKilled: 0,
  brainRotsCaught: 0,
  diamondsMined: 0,
  bossesDefeated: 0,
  perfectQuizzes: 0,
  dailyStreakDays: 0,
  totalDailyDays: 0,
};

/* ============== Achievement-katalógus (50+ jelvény) ============== */

export const ACHIEVEMENT_CATALOG: Achievement[] = [
  // --- GENERAL ---
  { id: "first_play", title: "Első kaland!", description: "Indíts egy játékot.", icon: "🎮", category: "general", points: 5, tier: "common" },
  { id: "xp_100", title: "Bemelegítés", description: "Szerezz 100 összesített XP-t.", icon: "⭐", category: "general", points: 10, tier: "common" },
  { id: "xp_1000", title: "Tehetség", description: "Szerezz 1000 összesített XP-t.", icon: "🌟", category: "general", points: 30, tier: "rare" },
  { id: "xp_5000", title: "Profi", description: "Szerezz 5000 összesített XP-t.", icon: "🏆", category: "general", points: 60, tier: "epic" },
  { id: "xp_10000", title: "Bajnok", description: "Szerezz 10 000 összesített XP-t.", icon: "👑", category: "general", points: 100, tier: "legendary" },
  { id: "games_5", title: "Kalandozó", description: "Játssz 5 kört (bármelyik játékban).", icon: "🎲", category: "general", points: 10, tier: "common" },
  { id: "games_25", title: "Versenyző", description: "Játssz 25 kört.", icon: "🎯", category: "general", points: 30, tier: "rare" },
  { id: "games_100", title: "Veterán", description: "Játssz 100 kört.", icon: "🥇", category: "general", points: 80, tier: "epic" },

  // --- QUIZ ---
  { id: "correct_10", title: "Tanuló", description: "Adj 10 helyes választ.", icon: "✅", category: "quiz", points: 10, tier: "common" },
  { id: "correct_100", title: "Okos kobak", description: "Adj 100 helyes választ.", icon: "🧠", category: "quiz", points: 30, tier: "rare" },
  { id: "correct_500", title: "Tudásbajnok", description: "Adj 500 helyes választ.", icon: "📚", category: "quiz", points: 70, tier: "epic" },
  { id: "streak_5", title: "Sorozat", description: "Érj el 5-ös sorozatot.", icon: "🔥", category: "quiz", points: 10, tier: "common" },
  { id: "streak_10", title: "Lángoló", description: "Érj el 10-es sorozatot.", icon: "🌋", category: "quiz", points: 25, tier: "rare" },
  { id: "streak_25", title: "Megállíthatatlan", description: "Érj el 25-ös sorozatot.", icon: "⚡", category: "quiz", points: 60, tier: "epic" },
  { id: "streak_50", title: "Legendás sorozat", description: "Érj el 50-es sorozatot.", icon: "💫", category: "quiz", points: 120, tier: "legendary" },
  { id: "perfect_run", title: "Tökéletes", description: "Egy körben 0 hibás válasz.", icon: "💎", category: "quiz", points: 30, tier: "rare" },
  { id: "perfect_run_5", title: "Tévedhetetlen", description: "5 tökéletes kör.", icon: "🌠", category: "quiz", points: 75, tier: "epic" },

  // --- BLOCKCRAFT ---
  { id: "first_diamond", title: "Első gyémánt!", description: "Bányássz ki egy gyémántot.", icon: "💎", category: "blockcraft", points: 15, tier: "common" },
  { id: "diamonds_5", title: "Gyémánt-vadász", description: "Bányássz 5 gyémántot.", icon: "💎", category: "blockcraft", points: 35, tier: "rare" },
  { id: "diamonds_20", title: "Gyémánt-magnata", description: "Bányássz 20 gyémántot.", icon: "💍", category: "blockcraft", points: 80, tier: "epic" },
  { id: "blocks_100", title: "Bányász", description: "Bányássz 100 blokkot.", icon: "⛏️", category: "blockcraft", points: 15, tier: "common" },
  { id: "blocks_500", title: "Bányakirály", description: "Bányássz 500 blokkot.", icon: "🏔️", category: "blockcraft", points: 50, tier: "rare" },
  { id: "level_5_clear", title: "5. szint clear", description: "Teljesítsd az 5. pályát BlockCraft-ban.", icon: "🏁", category: "blockcraft", points: 40, tier: "rare" },
  { id: "blockcraft_win", title: "Kockavadász bajnok", description: "Teljesítsd mind az 5 pályát.", icon: "🏆", category: "blockcraft", points: 100, tier: "epic" },

  // --- SPACE ---
  { id: "first_kill", title: "Első találat", description: "Lőj le egy aszteroidát.", icon: "🚀", category: "space", points: 5, tier: "common" },
  { id: "kills_50", title: "Aszteroida-vadász", description: "Lőj le 50 aszteroidát.", icon: "💥", category: "space", points: 25, tier: "rare" },
  { id: "kills_200", title: "Csillagrengető", description: "Lőj le 200 aszteroidát.", icon: "🌌", category: "space", points: 60, tier: "epic" },
  { id: "wave_5", title: "Hullám 5", description: "Érj el az 5. hullámig.", icon: "🌊", category: "space", points: 15, tier: "common" },
  { id: "wave_10", title: "Hullám 10", description: "Érj el a 10. hullámig.", icon: "🌪️", category: "space", points: 40, tier: "rare" },
  { id: "space_win", title: "Galaktikus bajnok", description: "Teljesítsd mind a 12 hullámot.", icon: "🛸", category: "space", points: 100, tier: "epic" },
  { id: "alien_killer", title: "Alien-vadász", description: "Lőj le 10 alien UFO-t.", icon: "👽", category: "space", points: 35, tier: "rare" },

  // --- BRAINROT ---
  { id: "rot_10", title: "Vadász", description: "Kapj el 10 Brain Rot-ot.", icon: "🧠", category: "brainrot", points: 10, tier: "common" },
  { id: "rot_50", title: "Brain Rot mester", description: "Kapj el 50 Brain Rot-ot.", icon: "🧠", category: "brainrot", points: 30, tier: "rare" },
  { id: "rot_200", title: "Agy-bajnok", description: "Kapj el 200 Brain Rot-ot.", icon: "🤯", category: "brainrot", points: 80, tier: "epic" },
  { id: "combo_4x", title: "4× combo!", description: "Érj el 4× combo-multiplikátort.", icon: "⚡", category: "brainrot", points: 25, tier: "rare" },

  // --- STREAK / DAILY ---
  { id: "daily_1", title: "Az út kezdete", description: "Teljesítsd az első napi kihívást.", icon: "📅", category: "streak", points: 10, tier: "common" },
  { id: "daily_3", title: "3 nap egymás után", description: "3 napos folyamatos streak.", icon: "🔥", category: "streak", points: 25, tier: "rare" },
  { id: "daily_7", title: "Heti hős", description: "7 napos folyamatos streak.", icon: "🏅", category: "streak", points: 60, tier: "epic" },
  { id: "daily_30", title: "Havi legenda", description: "30 napos folyamatos streak.", icon: "🌟", category: "streak", points: 200, tier: "legendary" },
  { id: "daily_total_30", title: "30 nap összesen", description: "Összesen 30 napon teljesítettél daily-t.", icon: "📅", category: "streak", points: 80, tier: "epic" },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENT_CATALOG.map((a) => [a.id, a]),
);

/* ============== Storage helpers ============== */

function loadUnlocked(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((s) => typeof s === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveUnlocked(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* no-op */
  }
}

export function loadStats(): LifetimeStats {
  if (typeof window === "undefined") return { ...DEFAULT_STATS };
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed) {
      return { ...DEFAULT_STATS, ...parsed };
    }
    return { ...DEFAULT_STATS };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

function saveStats(stats: LifetimeStats): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* no-op */
  }
}

export function getUnlockedIds(): string[] {
  return Array.from(loadUnlocked());
}

export function isUnlocked(id: string): boolean {
  return loadUnlocked().has(id);
}

/* ============== Run-end stat-update + achievement check ============== */

/**
 * Egy futás végén meghívandó. Frissíti a lifetime statokat és visszaadja
 * az újonnan unlockolt jelvényeket. A hívó felelős a toast megjelenítéséért
 * (vagy hagyhatja, az alap UI mutatja a profil-oldalon a piros pötty-jelölést).
 */
export type RunStats = {
  game: "block-craft-quiz" | "space-asteroid-quiz" | "brain-rot-steal" | "tsunami-english" | "word-ladder-hu-en" | "speed-quiz-math";
  xpGained: number;
  correctAnswers: number;
  wrongAnswers: number;
  /** Maximum streak a futásban. */
  maxStreak: number;
  // Játék-specifikus, opcionális:
  blocksMined?: number;
  diamondsMined?: number;
  enemiesKilled?: number;
  alienKills?: number;
  brainRotsCaught?: number;
  maxComboMultiplier?: number;
  bossDefeated?: boolean;
  /** True ha 0 hibás válasz volt + legalább 5 helyes. */
  perfect?: boolean;
  /** True ha az utolsó pálya / hullám / győztes. */
  fullClear?: boolean;
  /** Pl. BlockCraft: hányadik szintet érte el (1..5). */
  highestLevel?: number;
  /** Pl. Space Asteroid: hányadik hullámot érte el (1..12). */
  highestWave?: number;
};

export function recordRun(run: RunStats): Achievement[] {
  const stats = loadStats();
  stats.totalXp += run.xpGained;
  stats.totalGames += 1;
  stats.totalCorrectAnswers += run.correctAnswers;
  stats.totalWrongAnswers += run.wrongAnswers;
  if (run.maxStreak > stats.bestStreak) stats.bestStreak = run.maxStreak;
  if (run.blocksMined) stats.blocksMined += run.blocksMined;
  if (run.diamondsMined) stats.diamondsMined += run.diamondsMined;
  if (run.enemiesKilled) stats.enemiesKilled += run.enemiesKilled;
  if (run.brainRotsCaught) stats.brainRotsCaught += run.brainRotsCaught;
  if (run.bossDefeated) stats.bossesDefeated += 1;
  if (run.perfect) stats.perfectQuizzes += 1;
  saveStats(stats);

  return checkAchievements(stats, run);
}

/** A teljes katalógusra ellenőrzi a feltételeket. */
function checkAchievements(stats: LifetimeStats, run: RunStats): Achievement[] {
  const unlocked = loadUnlocked();
  const newlyUnlocked: Achievement[] = [];
  const tryUnlock = (id: string, condition: boolean) => {
    if (!condition || unlocked.has(id)) return;
    const a = ACHIEVEMENT_BY_ID[id];
    if (!a) return;
    unlocked.add(id);
    newlyUnlocked.push(a);
  };

  // --- General ---
  tryUnlock("first_play", true);
  tryUnlock("xp_100", stats.totalXp >= 100);
  tryUnlock("xp_1000", stats.totalXp >= 1000);
  tryUnlock("xp_5000", stats.totalXp >= 5000);
  tryUnlock("xp_10000", stats.totalXp >= 10000);
  tryUnlock("games_5", stats.totalGames >= 5);
  tryUnlock("games_25", stats.totalGames >= 25);
  tryUnlock("games_100", stats.totalGames >= 100);

  // --- Quiz ---
  tryUnlock("correct_10", stats.totalCorrectAnswers >= 10);
  tryUnlock("correct_100", stats.totalCorrectAnswers >= 100);
  tryUnlock("correct_500", stats.totalCorrectAnswers >= 500);
  tryUnlock("streak_5", stats.bestStreak >= 5);
  tryUnlock("streak_10", stats.bestStreak >= 10);
  tryUnlock("streak_25", stats.bestStreak >= 25);
  tryUnlock("streak_50", stats.bestStreak >= 50);
  tryUnlock("perfect_run", run.perfect === true);
  tryUnlock("perfect_run_5", stats.perfectQuizzes >= 5);

  // --- BlockCraft ---
  if (run.game === "block-craft-quiz") {
    tryUnlock("first_diamond", (run.diamondsMined ?? 0) >= 1);
    tryUnlock("diamonds_5", stats.diamondsMined >= 5);
    tryUnlock("diamonds_20", stats.diamondsMined >= 20);
    tryUnlock("blocks_100", stats.blocksMined >= 100);
    tryUnlock("blocks_500", stats.blocksMined >= 500);
    tryUnlock("level_5_clear", (run.highestLevel ?? 0) >= 5);
    tryUnlock("blockcraft_win", run.fullClear === true);
  }

  // --- Space ---
  if (run.game === "space-asteroid-quiz") {
    tryUnlock("first_kill", (run.enemiesKilled ?? 0) >= 1);
    tryUnlock("kills_50", stats.enemiesKilled >= 50);
    tryUnlock("kills_200", stats.enemiesKilled >= 200);
    tryUnlock("wave_5", (run.highestWave ?? 0) >= 5);
    tryUnlock("wave_10", (run.highestWave ?? 0) >= 10);
    tryUnlock("space_win", run.fullClear === true);
    tryUnlock("alien_killer", (run.alienKills ?? 0) >= 10);
  }

  // --- BrainRot ---
  if (run.game === "brain-rot-steal") {
    tryUnlock("rot_10", stats.brainRotsCaught >= 10);
    tryUnlock("rot_50", stats.brainRotsCaught >= 50);
    tryUnlock("rot_200", stats.brainRotsCaught >= 200);
    tryUnlock("combo_4x", (run.maxComboMultiplier ?? 1) >= 4);
  }

  if (newlyUnlocked.length > 0) {
    saveUnlocked(unlocked);
  }
  return newlyUnlocked;
}

/* ============== React hook ============== */

export function useAchievements() {
  const [unlocked, setUnlocked] = useState<Set<string>>(() => loadUnlocked());
  const [stats, setStats] = useState<LifetimeStats>(() => loadStats());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setUnlocked(loadUnlocked());
      setStats(loadStats());
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  return {
    unlocked,
    stats,
    catalog: ACHIEVEMENT_CATALOG,
    isUnlocked: (id: string) => unlocked.has(id),
    /** Hány jelvényt nyitott meg a játékos összesen. */
    unlockedCount: unlocked.size,
    totalCount: ACHIEVEMENT_CATALOG.length,
    /** Hány pontot ért össze a játékos a jelvényekért. */
    totalPoints: ACHIEVEMENT_CATALOG.filter((a) => unlocked.has(a.id)).reduce((s, a) => s + a.points, 0),
  };
}
