/**
 * Gépi ellenfél a párbajhoz (JM3a, terv D22): seedelt, állítható ügyességű „játékos”, amely a kliensen futó `room-machine`
 * ugyanazon kérdésére válaszol, mint az ember (azonos évfolyam → azonos kérdés). Tiszta TS (J19 őr alatt): nincs óra,
 * nincs `Math.random` — azonos seed + kör → azonos válasz és időpont.
 *
 * Ügyesség (pontosság + reakcióidő a saját ablak arányában). A D14-szabály bot-szimulációja (`tests/duel-bot-sim.test.ts`)
 * szerint a pontosság dönt, a gyorsaság csak kis bónusz — így a Könnyű gép egy figyelmes gyereknek legyőzhető, a Nehéz
 * kihívás, de nem legyőzhetetlen (≤ 85% pontosság, sosem 200 ms alatti „emberfeletti” válasz).
 * A gépi meccs a párbaj-mérlegbe (JM9) nem számít ember elleni győzelemnek, és pont sem jár érte (D22).
 */
import { createRng, seedFrom } from "../game-rng";

export type BotSkill = "beginner" | "easy" | "normal" | "hard";

export type BotProfile = {
  skill: BotSkill;
  label: string;
  /** Helyes válasz valószínűsége. */
  accuracy: number;
  /** A válasz időpontja a saját ablak arányában: [reactMin, reactMax]. */
  reactMin: number;
  reactMax: number;
};

export const BOT_PROFILES: Record<BotSkill, BotProfile> = {
  // Review #464 K1: a gyengébb (≈ 40%-os, lassú) gyereknek is kell sikerélmény — a „Kezdő” gép ritkán talál, lassan válaszol.
  beginner: { skill: "beginner", label: "Kezdő", accuracy: 0.36, reactMin: 0.7, reactMax: 0.98 },
  easy: { skill: "easy", label: "Könnyű", accuracy: 0.55, reactMin: 0.45, reactMax: 0.9 },
  normal: { skill: "normal", label: "Közepes", accuracy: 0.7, reactMin: 0.3, reactMax: 0.8 },
  hard: { skill: "hard", label: "Nehéz", accuracy: 0.85, reactMin: 0.2, reactMax: 0.6 },
};

export const BOT_SKILLS: readonly BotSkill[] = ["beginner", "easy", "normal", "hard"];

/** A gép soha nem válaszol ennél gyorsabban (emberi alsó határ fölött, `HUMAN_MIN_MS` = 200). */
export const BOT_MIN_REACT_MS = 900;

export type BotAnswerPlan = { atOffsetMs: number; optionIndex: number; correct: boolean };

/**
 * A gép válasza egy körre: mikor (a kör megnyitásától, ms) és melyik opcióval. Determinisztikus: `seedFrom("duel-bot",
 * seed, round)`. Rossz válasznál egy seedelt másik opció.
 */
export function planBotAnswer(seed: string, round: number, q: { correctIndex: number; optionCount: number; windowMs: number }, profile: BotProfile): BotAnswerPlan {
  const rng = createRng(seedFrom("duel-bot", seed, round));
  const ratio = profile.reactMin + rng.next() * (profile.reactMax - profile.reactMin);
  const correct = rng.next() < profile.accuracy;
  const n = Math.max(2, q.optionCount);
  const optionIndex = correct ? q.correctIndex : (q.correctIndex + 1 + rng.int(n - 1)) % n;
  const window = Number.isFinite(q.windowMs) && q.windowMs > 0 ? q.windowMs : 6000;
  const atOffsetMs = Math.min(window - 50, Math.max(BOT_MIN_REACT_MS, Math.round(ratio * window)));
  return { atOffsetMs, optionIndex, correct };
}

export type BotRecord = { skill: BotSkill; results: Array<"win" | "loss" | "co"> };

/**
 * Áramlat-elv (flow): a következő javasolt ügyesség az utolsó két gépi meccs alapján — két győzelem után eggyel nehezebb,
 * két vereség után eggyel könnyebb, különben marad. Első alkalommal: Közepes (a kérdések úgyis a saját évfolyamból jönnek,
 * a gép reakcióideje a saját — évfolyamhoz igazított — ablak arányában mér).
 */
export function suggestBotSkill(record: BotRecord | null): BotSkill {
  if (!record || !BOT_SKILLS.includes(record.skill)) return "normal";
  const last = record.results.slice(-2);
  const i = BOT_SKILLS.indexOf(record.skill);
  if (last.length === 2 && last.every((r) => r === "win")) return BOT_SKILLS[Math.min(BOT_SKILLS.length - 1, i + 1)]!;
  if (last.length === 2 && last.every((r) => r === "loss")) return BOT_SKILLS[Math.max(0, i - 1)]!;
  return record.skill;
}

/** Egy lejátszott gépi meccs hozzáírása (legfeljebb az utolsó 10 eredmény marad; ügyesség-váltáskor újraindul). */
export function recordBotResult(record: BotRecord | null, skill: BotSkill, result: "win" | "loss" | "co"): BotRecord {
  const base = record && record.skill === skill ? record.results : [];
  return { skill, results: [...base, result].slice(-10) };
}
