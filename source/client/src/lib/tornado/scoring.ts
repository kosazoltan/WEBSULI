/**
 * Tornado Hunter 200 — anchoring and rewards.
 *
 * The brief keeps Storm Coin and Highscore as two separate systems, and makes
 * the anchor's success depend on the quiz answer. Both live here as pure
 * functions so the rules can be asserted without running the 3D scene.
 */

import type { LevelSpec } from "./levels";

export type AnchorReason = "ok" | "wrong_answer" | "too_close" | "too_far" | "bad_ground";

export type AnchorArgs = {
  /** Distance from the funnel, km. */
  distanceKm: number;
  spec: LevelSpec;
  /** Was the quiz answered correctly? A wrong answer fails the anchor. */
  answerCorrect: boolean;
  /** 0..1 — mud gives poor grip, tarmac and hard ground give good grip. */
  surfaceGrip: number;
};

export type AnchorResult = {
  ok: boolean;
  reason: AnchorReason;
  /** A failed anchor is retryable — the brief says "újra lehet próbálni". */
  retryAllowed: boolean;
  message: string;
};

/** Minimum grip the anchor spikes need to hold. */
export const MIN_ANCHOR_GRIP = 0.45;

/** Reward multiplier lost per failed anchor attempt. */
export const ANCHOR_QUIZ_PENALTY = 0.15;

/**
 * Decide whether the anchor holds.
 *
 * Distance is checked BEFORE the answer would matter for the "too close/far"
 * messages, but a wrong answer short-circuits first: the brief ties the anchor
 * to the question, and telling a child "your position was fine, your answer was
 * not" is the feedback that teaches.
 */
export function anchorOutcome(args: AnchorArgs): AnchorResult {
  const { distanceKm, spec, answerCorrect, surfaceGrip } = args;

  if (!answerCorrect) {
    return {
      ok: false,
      reason: "wrong_answer",
      retryAllowed: true,
      message: "Hibás válasz — a horgonyzás nem sikerült. Próbáld újra!",
    };
  }
  if (distanceKm < spec.anchorBand.min) {
    return {
      ok: false,
      reason: "too_close",
      retryAllowed: true,
      message: "Túl közel vagy a tornádóhoz! Hátrébb kell állni a horgonyzáshoz.",
    };
  }
  if (distanceKm > spec.anchorBand.max) {
    return {
      ok: false,
      reason: "too_far",
      retryAllowed: true,
      message: "Túl messze vagy — innen nem mérhető a vihar. Menj közelebb!",
    };
  }
  if (surfaceGrip < MIN_ANCHOR_GRIP) {
    return {
      ok: false,
      reason: "bad_ground",
      retryAllowed: true,
      message: "Sáros talaj: a horgony nem fog. Keress szilárdabb helyet!",
    };
  }
  return { ok: true, reason: "ok", retryAllowed: false, message: "Horgony rögzítve — tartsd ki a vihart!" };
}

export type RewardArgs = {
  spec: LevelSpec;
  /** Seconds the whole intercept took. */
  secondsUsed: number;
  /** How many anchor attempts were needed (1 = first try). */
  anchorAttempts: number;
  /** Highest wind measured this run, km/h. */
  peakWind: number;
  /** Distance at the moment of anchoring, km. */
  distanceKm: number;
  correctAnswers: number;
  wrongAnswers: number;
};

export type RewardResult = {
  /** Highscore points. */
  score: number;
  /** Storm Coin — a separate currency, deliberately a different number. */
  coins: number;
  breakdown: {
    base: number;
    speedBonus: number;
    stormBonus: number;
    answerBonus: number;
    positionBonus: number;
  };
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Score an intercept.
 *
 * The brief lists what earns points: catching the tornado, anchoring, correct
 * answers, finishing fast, strong storms, good positioning. Each is a named
 * term in the breakdown so the results screen can show the child WHY they got
 * what they got — an opaque total teaches nothing.
 */
export function interceptReward(args: RewardArgs): RewardResult {
  const { spec, secondsUsed, anchorAttempts, peakWind, distanceKm, correctAnswers, wrongAnswers } = args;

  const base = Math.round(spec.scoreBase);

  // Fast finishes: full bonus at <= 25% of the limit, nothing at the limit.
  const timeRatio = clamp01(1 - secondsUsed / Math.max(1, spec.timeLimit));
  const speedBonus = Math.round(spec.scoreBase * 0.45 * Math.pow(timeRatio, 1.2));

  // Strong storms pay more; measured against the level's own peak.
  const stormRatio = clamp01(peakWind / Math.max(1, spec.windPeak));
  const stormBonus = Math.round(spec.scoreBase * 0.35 * stormRatio);

  // Answers: correct ones pay, wrong ones cost — but never below zero.
  const answerBonus = Math.max(
    0,
    Math.round(correctAnswers * 320 * (1 + spec.tornadoIntensity / 10) - wrongAnswers * 180),
  );

  // Positioning: anchoring near the inner (riskier) edge of the band pays most.
  const band = spec.anchorBand;
  const width = Math.max(0.01, band.max - band.min);
  const closeness = clamp01(1 - (distanceKm - band.min) / width);
  const positionBonus = Math.round(spec.scoreBase * 0.3 * closeness);

  const attemptPenalty = Math.max(0.35, 1 - (Math.max(1, anchorAttempts) - 1) * ANCHOR_QUIZ_PENALTY);

  // Storm Coin follows a flatter curve than score: the shop must stay reachable
  // for a struggling player, while the leaderboard rewards mastery.
  const coins = Math.max(
    1,
    Math.round(spec.coinReward * (0.6 + stormRatio * 0.5 + timeRatio * 0.35) * attemptPenalty),
  );

  // The breakdown must add up to the reported score, so the results screen can
  // print the terms without a rounding discrepancy the player would notice.
  const scaled = {
    base: Math.round(base * attemptPenalty),
    speedBonus: Math.round(speedBonus * attemptPenalty),
    stormBonus: Math.round(stormBonus * attemptPenalty),
    answerBonus: Math.round(answerBonus * attemptPenalty),
    positionBonus: Math.round(positionBonus * attemptPenalty),
  };
  const scaledSum = scaled.base + scaled.speedBonus + scaled.stormBonus + scaled.answerBonus + scaled.positionBonus;

  return {
    score: scaledSum,
    coins,
    breakdown: scaled,
  };
}

/** Points for a correct answer outside the anchoring moment (free-roam quiz). */
export function freeRoamAnswerScore(spec: LevelSpec): number {
  return Math.round(120 + spec.tornadoIntensity * 45);
}
