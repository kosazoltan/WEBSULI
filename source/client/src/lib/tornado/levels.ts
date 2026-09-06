/**
 * Tornado Hunter 200 — the 200-level campaign.
 *
 * The stage boundaries come verbatim from the brief (1-25 Light Storm …
 * 200 THE ULTIMATE STORM) and every per-level number is interpolated from them,
 * so difficulty rises monotonically by construction rather than by hand-tuning
 * 200 rows. Level 200 gets its own hard-coded step above the curve because the
 * brief demands it be the hardest.
 */

export type StageId =
  | "light"
  | "beginner"
  | "advanced"
  | "pro"
  | "expert"
  | "master"
  | "extreme"
  | "legendary"
  | "ultimate";

export type Stage = {
  id: StageId;
  label: string;
  from: number;
  to: number;
  /** HUD accent colour for the stage. */
  color: string;
};

export type LevelSpec = {
  level: number;
  stage: StageId;
  stageLabel: string;
  /** 1..10, drives visuals and the wind model. */
  tornadoIntensity: number;
  /** km/h at the funnel core. */
  windPeak: number;
  /** Funnel radius multiplier. */
  tornadoScale: number;
  /** World units per second the funnel travels. */
  tornadoSpeed: number;
  /** Funnel lifetime in seconds — after this it lifts and the run is lost. */
  tornadoLifetime: number;
  /** Seconds the player has for the whole intercept. */
  timeLimit: number;
  /** Safe anchoring distance window, in km. */
  anchorBand: { min: number; max: number };
  /** 0..1 visual density knobs. */
  debrisDensity: number;
  rainIntensity: number;
  lightningRate: number;
  /** Reward baselines — the scoring module multiplies these. */
  coinReward: number;
  scoreBase: number;
};

export const LEVEL_COUNT = 200;
export const ULTIMATE_LEVEL = 200;

export const LEVEL_STAGES: readonly Stage[] = [
  { id: "light", label: "Light Storm", from: 1, to: 25, color: "#7dd3fc" },
  { id: "beginner", label: "Beginner", from: 26, to: 50, color: "#4ade80" },
  { id: "advanced", label: "Advanced", from: 51, to: 75, color: "#a3e635" },
  { id: "pro", label: "Pro", from: 76, to: 100, color: "#facc15" },
  { id: "expert", label: "Expert", from: 101, to: 125, color: "#fb923c" },
  { id: "master", label: "Master", from: 126, to: 150, color: "#f87171" },
  { id: "extreme", label: "Extreme", from: 151, to: 175, color: "#e879f9" },
  { id: "legendary", label: "Legendary", from: 176, to: 199, color: "#c084fc" },
  { id: "ultimate", label: "THE ULTIMATE STORM", from: 200, to: 200, color: "#f43f5e" },
] as const;

export function stageForLevel(level: number): Stage {
  const n = clampLevel(level);
  for (const stage of LEVEL_STAGES) {
    if (n >= stage.from && n <= stage.to) return stage;
  }
  return LEVEL_STAGES[LEVEL_STAGES.length - 1]!;
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(LEVEL_COUNT, Math.round(level)));
}

/** Progress through the campaign, 0 at level 1 and 1 at level 199. */
function ramp(level: number): number {
  return (level - 1) / (LEVEL_COUNT - 2);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function buildLevel(level: number): LevelSpec {
  const stage = stageForLevel(level);
  const t = ramp(Math.min(level, LEVEL_COUNT - 1));
  const isUltimate = level === ULTIMATE_LEVEL;

  // Base curves: gentle at first, steeper towards the end (t^1.15).
  const curve = Math.pow(t, 1.15);

  const intensity = round1(1 + curve * 8.4);
  const windPeak = Math.round(120 + curve * 340);
  const scale = round1(0.8 + curve * 1.9);
  const speed = round1(2.6 + curve * 7.4);
  const lifetime = Math.round(150 - curve * 55);
  const timeLimit = Math.round(300 - curve * 130);
  // The safe window narrows as the storms get meaner.
  const bandCenter = round1(0.72 - curve * 0.24);
  const bandWidth = round1(0.62 - curve * 0.42);
  const coin = Math.round(140 + curve * 2600);
  const scoreBase = Math.round(900 + curve * 14000);

  if (isUltimate) {
    // The final storm sits deliberately above the curve.
    return {
      level,
      stage: stage.id,
      stageLabel: stage.label,
      tornadoIntensity: 10,
      windPeak: 520,
      tornadoScale: 3.2,
      tornadoSpeed: 11.5,
      tornadoLifetime: 90,
      timeLimit: 165,
      anchorBand: { min: 0.34, max: 0.5 },
      debrisDensity: 1,
      rainIntensity: 1,
      lightningRate: 1,
      coinReward: 5000,
      scoreBase: 30000,
    };
  }

  return {
    level,
    stage: stage.id,
    stageLabel: stage.label,
    tornadoIntensity: Math.min(9.6, intensity),
    windPeak,
    tornadoScale: scale,
    tornadoSpeed: speed,
    tornadoLifetime: lifetime,
    timeLimit,
    anchorBand: {
      min: round1(Math.max(0.22, bandCenter - bandWidth / 2)),
      max: round1(bandCenter + bandWidth / 2),
    },
    debrisDensity: round1(Math.min(1, 0.12 + curve * 0.85)),
    rainIntensity: round1(Math.min(1, 0.08 + curve * 0.88)),
    lightningRate: round1(Math.min(1, 0.05 + curve * 0.9)),
    coinReward: coin,
    scoreBase,
  };
}

export const LEVELS: readonly LevelSpec[] = Object.freeze(
  Array.from({ length: LEVEL_COUNT }, (_, i) => buildLevel(i + 1)),
);

export function levelSpec(level: number): LevelSpec {
  return LEVELS[clampLevel(level) - 1]!;
}

/** Levels grouped by stage — the level-select screen renders these blocks. */
export function levelsByStage(): { stage: Stage; levels: LevelSpec[] }[] {
  return LEVEL_STAGES.map((stage) => ({
    stage,
    levels: LEVELS.filter((l) => l.level >= stage.from && l.level <= stage.to),
  }));
}

/** Coarse storm label for the HUD ("STORM: EXTREME"). */
export function stormLabel(level: number): string {
  return stageForLevel(level).label.toUpperCase();
}
