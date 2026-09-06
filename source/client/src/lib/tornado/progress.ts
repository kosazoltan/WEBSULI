/**
 * Tornado Hunter 200 — persistent progress.
 *
 * Every mutation is a pure `(state, args) => state` function: the React page
 * only stores the result and writes it to localStorage. That is what lets the
 * economy rules (no negative balance, no buying a locked vehicle, Storm Coin
 * and Highscore kept apart) be asserted in `tests/tornado-progress.test.ts`
 * without a browser.
 *
 * `parseProgress` is deliberately paranoid: a child's localStorage can hold a
 * previous version, a half-written value, or something hand-edited, and a
 * throw on mount would take down the whole page.
 */

import { STARTER_VEHICLE_ID, vehicleById } from "./vehicles";
import {
  MAX_UPGRADE_LEVEL,
  emptyUpgrades,
  isUpgradeTrackId,
  upgradeCost,
  type UpgradeState,
  type UpgradeTrackId,
} from "./upgrades";
import { LEVEL_COUNT } from "./levels";
import type { QuizMode, SchoolLevel } from "./questions";

export const PROGRESS_VERSION = 1;
export const STORAGE_KEY = "websuli.tornado.v1";

/** Starting purse: enough to look around the garage, not enough to skip the game. */
export const STARTING_COINS = 1200;

export type GraphicsQuality = "low" | "medium" | "high";

export type TornadoStats = {
  totalPoints: number;
  bestLevelScore: number;
  levelsCompleted: number;
  tornadoesIntercepted: number;
  successfulAnchors: number;
  correctAnswers: number;
  wrongAnswers: number;
  kilometersTraveled: number;
  maxWindSpeed: number;
  /** Longest single intercept, seconds. */
  longestIntercept: number;
};

export type LevelRecord = {
  score: number;
  /** Best (lowest) completion time in seconds. */
  bestTime: number;
  peakWind: number;
};

export type TornadoProgress = {
  version: number;
  coins: number;
  totalScore: number;
  highestLevelUnlocked: number;
  ownedVehicleIds: string[];
  selectedVehicleId: string;
  upgrades: Record<string, UpgradeState>;
  levelRecords: Record<string, LevelRecord>;
  stats: TornadoStats;
  settings: {
    quality: GraphicsQuality;
    school: SchoolLevel;
    quizMode: QuizMode;
    leftHanded: boolean;
    cameraMode: "chase" | "cockpit";
  };
};

export type MutationReason =
  | "unknown_vehicle"
  | "already_owned"
  | "locked"
  | "insufficient_funds"
  | "not_owned"
  | "max_level"
  | "unknown_track";

export type MutationResult = {
  ok: boolean;
  reason?: MutationReason;
  progress: TornadoProgress;
};

export function defaultStats(): TornadoStats {
  return {
    totalPoints: 0,
    bestLevelScore: 0,
    levelsCompleted: 0,
    tornadoesIntercepted: 0,
    successfulAnchors: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    kilometersTraveled: 0,
    maxWindSpeed: 0,
    longestIntercept: 0,
  };
}

export function defaultProgress(): TornadoProgress {
  return {
    version: PROGRESS_VERSION,
    coins: STARTING_COINS,
    totalScore: 0,
    highestLevelUnlocked: 1,
    ownedVehicleIds: [STARTER_VEHICLE_ID],
    selectedVehicleId: STARTER_VEHICLE_ID,
    upgrades: {},
    levelRecords: {},
    stats: defaultStats(),
    settings: {
      quality: "medium",
      school: "auto",
      quizMode: "mixed",
      leftHanded: false,
      cameraMode: "chase",
    },
  };
}

/* ============================ mutations ============================ */

export function buyVehicle(progress: TornadoProgress, vehicleId: string): MutationResult {
  const vehicle = vehicleById(vehicleId);
  if (!vehicle) return { ok: false, reason: "unknown_vehicle", progress };
  if (progress.ownedVehicleIds.includes(vehicleId)) {
    return { ok: false, reason: "already_owned", progress };
  }
  if (vehicle.unlockLevel > progress.highestLevelUnlocked) {
    return { ok: false, reason: "locked", progress };
  }
  if (progress.coins < vehicle.price) {
    return { ok: false, reason: "insufficient_funds", progress };
  }
  return {
    ok: true,
    progress: {
      ...progress,
      coins: progress.coins - vehicle.price,
      ownedVehicleIds: [...progress.ownedVehicleIds, vehicleId],
    },
  };
}

export function selectVehicle(progress: TornadoProgress, vehicleId: string): MutationResult {
  if (!vehicleById(vehicleId)) return { ok: false, reason: "unknown_vehicle", progress };
  if (!progress.ownedVehicleIds.includes(vehicleId)) {
    return { ok: false, reason: "not_owned", progress };
  }
  return { ok: true, progress: { ...progress, selectedVehicleId: vehicleId } };
}

export function upgradesFor(progress: TornadoProgress, vehicleId: string): UpgradeState {
  return { ...emptyUpgrades(), ...(progress.upgrades[vehicleId] ?? {}) };
}

export function buyUpgrade(
  progress: TornadoProgress,
  vehicleId: string,
  track: UpgradeTrackId,
): MutationResult {
  if (!vehicleById(vehicleId)) return { ok: false, reason: "unknown_vehicle", progress };
  if (!progress.ownedVehicleIds.includes(vehicleId)) {
    return { ok: false, reason: "not_owned", progress };
  }
  if (!isUpgradeTrackId(track)) return { ok: false, reason: "unknown_track", progress };

  const current = upgradesFor(progress, vehicleId);
  const nextLevel = (current[track] ?? 0) + 1;
  if (nextLevel > MAX_UPGRADE_LEVEL) return { ok: false, reason: "max_level", progress };

  const cost = upgradeCost(track, nextLevel);
  if (progress.coins < cost) return { ok: false, reason: "insufficient_funds", progress };

  return {
    ok: true,
    progress: {
      ...progress,
      coins: progress.coins - cost,
      upgrades: {
        ...progress.upgrades,
        [vehicleId]: { ...current, [track]: nextLevel },
      },
    },
  };
}

export type LevelResult = {
  level: number;
  /** Highscore points earned. */
  score: number;
  /** Storm Coin earned — a separate system by the brief. */
  coins: number;
  secondsUsed: number;
  peakWind: number;
  anchored: boolean;
};

export function completeLevel(progress: TornadoProgress, result: LevelResult): TornadoProgress {
  const key = String(result.level);
  const prevRecord = progress.levelRecords[key];
  const record: LevelRecord = {
    score: Math.max(prevRecord?.score ?? 0, result.score),
    bestTime:
      prevRecord && prevRecord.bestTime > 0
        ? Math.min(prevRecord.bestTime, result.secondsUsed)
        : result.secondsUsed,
    peakWind: Math.max(prevRecord?.peakWind ?? 0, result.peakWind),
  };

  const stats: TornadoStats = {
    ...progress.stats,
    totalPoints: progress.stats.totalPoints + result.score,
    bestLevelScore: Math.max(progress.stats.bestLevelScore, result.score),
    levelsCompleted: progress.stats.levelsCompleted + 1,
    tornadoesIntercepted: progress.stats.tornadoesIntercepted + 1,
    successfulAnchors: progress.stats.successfulAnchors + (result.anchored ? 1 : 0),
    maxWindSpeed: Math.max(progress.stats.maxWindSpeed, result.peakWind),
    longestIntercept: Math.max(progress.stats.longestIntercept, result.secondsUsed),
  };

  return {
    ...progress,
    coins: progress.coins + Math.max(0, result.coins),
    totalScore: progress.totalScore + Math.max(0, result.score),
    // Replaying an old level must never walk the campaign back.
    highestLevelUnlocked: Math.min(
      LEVEL_COUNT,
      Math.max(progress.highestLevelUnlocked, result.level + 1),
    ),
    levelRecords: { ...progress.levelRecords, [key]: record },
    stats,
  };
}

export function recordAnswer(progress: TornadoProgress, correct: boolean): TornadoProgress {
  return {
    ...progress,
    stats: {
      ...progress.stats,
      correctAnswers: progress.stats.correctAnswers + (correct ? 1 : 0),
      wrongAnswers: progress.stats.wrongAnswers + (correct ? 0 : 1),
    },
  };
}

export function addDistance(progress: TornadoProgress, km: number): TornadoProgress {
  if (!Number.isFinite(km) || km <= 0) return progress;
  return {
    ...progress,
    stats: { ...progress.stats, kilometersTraveled: progress.stats.kilometersTraveled + km },
  };
}

export function updateSettings(
  progress: TornadoProgress,
  patch: Partial<TornadoProgress["settings"]>,
): TornadoProgress {
  return { ...progress, settings: { ...progress.settings, ...patch } };
}

/* ============================ persistence ============================ */

export function serializeProgress(progress: TornadoProgress): string {
  return JSON.stringify(progress);
}

function num(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function parseUpgradeState(raw: unknown): UpgradeState {
  const out = emptyUpgrades();
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isUpgradeTrackId(key)) continue;
    out[key] = Math.round(num(value, 0, 0, MAX_UPGRADE_LEVEL));
  }
  return out;
}

/**
 * Rebuild a progress object from a stored string.
 *
 * Anything unrecognised falls back to the default value rather than throwing;
 * a version mismatch resets entirely, because silently reinterpreting an old
 * shape is how save files get corrupted in a way nobody can debug.
 */
export function parseProgress(raw: string | null | undefined): TornadoProgress {
  const base = defaultProgress();
  if (!raw) return base;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
  const src = parsed as Record<string, unknown>;
  if (src.version !== PROGRESS_VERSION) return base;

  const owned = Array.isArray(src.ownedVehicleIds)
    ? (src.ownedVehicleIds as unknown[]).filter(
        (id): id is string => typeof id === "string" && Boolean(vehicleById(id)),
      )
    : [];
  if (!owned.includes(STARTER_VEHICLE_ID)) owned.unshift(STARTER_VEHICLE_ID);

  const selected =
    typeof src.selectedVehicleId === "string" && owned.includes(src.selectedVehicleId)
      ? src.selectedVehicleId
      : STARTER_VEHICLE_ID;

  const upgrades: Record<string, UpgradeState> = {};
  if (src.upgrades && typeof src.upgrades === "object" && !Array.isArray(src.upgrades)) {
    for (const [vehicleId, state] of Object.entries(src.upgrades as Record<string, unknown>)) {
      if (!vehicleById(vehicleId)) continue;
      upgrades[vehicleId] = parseUpgradeState(state);
    }
  }

  const levelRecords: Record<string, LevelRecord> = {};
  if (src.levelRecords && typeof src.levelRecords === "object" && !Array.isArray(src.levelRecords)) {
    for (const [key, value] of Object.entries(src.levelRecords as Record<string, unknown>)) {
      const level = Number(key);
      if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) continue;
      if (!value || typeof value !== "object") continue;
      const rec = value as Record<string, unknown>;
      levelRecords[key] = {
        score: num(rec.score, 0),
        bestTime: num(rec.bestTime, 0),
        peakWind: num(rec.peakWind, 0),
      };
    }
  }

  const statsSrc = (src.stats ?? {}) as Record<string, unknown>;
  const stats: TornadoStats = {
    totalPoints: num(statsSrc.totalPoints, 0),
    bestLevelScore: num(statsSrc.bestLevelScore, 0),
    levelsCompleted: num(statsSrc.levelsCompleted, 0),
    tornadoesIntercepted: num(statsSrc.tornadoesIntercepted, 0),
    successfulAnchors: num(statsSrc.successfulAnchors, 0),
    correctAnswers: num(statsSrc.correctAnswers, 0),
    wrongAnswers: num(statsSrc.wrongAnswers, 0),
    kilometersTraveled: num(statsSrc.kilometersTraveled, 0),
    maxWindSpeed: num(statsSrc.maxWindSpeed, 0),
    longestIntercept: num(statsSrc.longestIntercept, 0),
  };

  const settingsSrc = (src.settings ?? {}) as Record<string, unknown>;
  const quality: GraphicsQuality =
    settingsSrc.quality === "low" || settingsSrc.quality === "high" || settingsSrc.quality === "medium"
      ? settingsSrc.quality
      : base.settings.quality;
  const school: SchoolLevel =
    settingsSrc.school === "auto"
      ? "auto"
      : typeof settingsSrc.school === "number" && settingsSrc.school >= 1 && settingsSrc.school <= 6
        ? (Math.round(settingsSrc.school) as SchoolLevel)
        : base.settings.school;
  const quizMode: QuizMode =
    settingsSrc.quizMode === "math" || settingsSrc.quizMode === "english" || settingsSrc.quizMode === "mixed"
      ? settingsSrc.quizMode
      : base.settings.quizMode;

  return {
    version: PROGRESS_VERSION,
    coins: num(src.coins, base.coins),
    totalScore: num(src.totalScore, 0),
    highestLevelUnlocked: Math.round(num(src.highestLevelUnlocked, 1, 1, LEVEL_COUNT)),
    ownedVehicleIds: owned,
    selectedVehicleId: selected,
    upgrades,
    levelRecords,
    stats,
    settings: {
      quality,
      school,
      quizMode,
      leftHanded: settingsSrc.leftHanded === true,
      cameraMode: settingsSrc.cameraMode === "cockpit" ? "cockpit" : "chase",
    },
  };
}

/** Read from localStorage; SSR-safe and never throws. */
export function loadProgress(): TornadoProgress {
  try {
    if (typeof window === "undefined") return defaultProgress();
    return parseProgress(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: TornadoProgress): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, serializeProgress(progress));
  } catch {
    /* quota or private mode — the run still works, it just is not remembered */
  }
}
