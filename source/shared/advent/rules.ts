/**
 * Adventi naptár — szabályok (docs/specs/2026-11-18-adventi-naptar.md R1–R3, 12.3; végrehajtás: …-vegrehajtas.md „S1”).
 * Tiszta modul: nincs benne óra, véletlen, DOM vagy adatbázis. A tulajdonosi döntések (2026-11-18) itt élnek konstansként.
 */

export const ADVENT_DOORS = 24;
export const ADVENT_PASS_PERCENT = 95;
export const ADVENT_MIN_GRADE = 1;
export const ADVENT_MAX_GRADE = 12;

export const ADVENT_RULES = {
  /** (a) A1: naponta egy új ablak, a korábbiak pótolhatók. */
  unlock: "daily",
  /** (b) B1: hibás válasz után új kérdéssel javíthat. */
  repair: "new-question",
  maxRepairs: 2,
  maxRounds: 3,
  /** (h): az 1–2. évfolyam mind a 24 ablaka karácsonyi; ablakonként 1 javítás, legfeljebb 2 kör. */
  lowGrade: { maxGrade: 2, maxRepairs: 1, maxRounds: 2 },
  /** A „Hamarosan” kártya november ennyiedikétől látszik. */
  teaserFromDay: 24,
  /** A pótlási időszak január ennyiedikéig tart (bezárólag). */
  catchupUntilJan: 6,
} as const;

/** (h) „Vegyesen”: a 3–12. évfolyamon minden harmadik ablak karácsonyi — a 24. mindig. */
export const ADVENT_CHRISTMAS_DAYS = [3, 6, 9, 12, 15, 18, 21, 24] as const;

/** (c) C1 — a tulajdonos szó szerinti záró üzenete. Őr-teszt karakterre ellenőrzi; máshol csak importálni szabad. */
export const ADVENT_GIFT_MESSAGE = "Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.";

export function clampAdventGrade(grade: number): number {
  if (!Number.isFinite(grade)) return ADVENT_MIN_GRADE;
  return Math.min(ADVENT_MAX_GRADE, Math.max(ADVENT_MIN_GRADE, Math.round(grade)));
}

export function isLowGrade(grade: number): boolean {
  return clampAdventGrade(grade) <= ADVENT_RULES.lowGrade.maxGrade;
}

export function isChristmasDoor(day: number, grade: number): boolean {
  return isLowGrade(grade) || day % 3 === 0;
}

export function limitsForGrade(grade: number): { maxRepairs: number; maxRounds: number } {
  return isLowGrade(grade)
    ? { maxRepairs: ADVENT_RULES.lowGrade.maxRepairs, maxRounds: ADVENT_RULES.lowGrade.maxRounds }
    : { maxRepairs: ADVENT_RULES.maxRepairs, maxRounds: ADVENT_RULES.maxRounds };
}

/**
 * R1 — a 95% pontos szabálya, egész számokkal, kerekítés nélkül: mind a 24 ablakra érkezett válasz ÉS
 * `megoldott × 100 ≥ 95 × 24`. 24 ablaknál ez legalább 23 megoldott ablak (23 / 24 = 95,83%; 22 / 24 = 91,67%).
 */
export function adventPassed(solved: number, answered: number, total: number = ADVENT_DOORS): boolean {
  return answered === total && solved * 100 >= ADVENT_PASS_PERCENT * total;
}

/** Csak kijelzésre (lefelé kerekít: 23 → 95, 24 → 100); a megfelelést NEM ebből számoljuk. */
export function adventPercent(solved: number, total: number = ADVENT_DOORS): number {
  return total > 0 ? Math.floor((solved * 100) / total) : 0;
}

export type DoorState = "locked" | "open" | "solved" | "repairable" | "failed";
export type DoorAttempt = { questionId: string; pick: number; correct: boolean; at: string };
export type DoorRecord = { attempts: DoorAttempt[] };

/** Az ablak állapota: jó próba → megoldott; különben amíg van javítás (próbák ≤ maxRepairs) → javítható; utána hibás. */
export function doorState(input: { unlocked: boolean; attempts: readonly { correct: boolean }[]; maxRepairs: number }): DoorState {
  if (input.attempts.length === 0) return input.unlocked ? "open" : "locked";
  if (input.attempts.some((a) => a.correct)) return "solved";
  return input.attempts.length <= input.maxRepairs ? "repairable" : "failed";
}

export type AdventSummary = {
  total: number;
  answered: number;
  solved: number;
  firstTry: number;
  repairable: number;
  failed: number;
  passed: boolean;
  percent: number;
};

export function adventSummary(doors: Readonly<Record<number, DoorRecord | undefined>>, maxRepairs: number): AdventSummary {
  let answered = 0;
  let solved = 0;
  let firstTry = 0;
  let repairable = 0;
  let failed = 0;
  for (let day = 1; day <= ADVENT_DOORS; day++) {
    const attempts = doors[day]?.attempts ?? [];
    if (attempts.length === 0) continue;
    answered++;
    const state = doorState({ unlocked: true, attempts, maxRepairs });
    if (state === "solved") solved++;
    else if (state === "repairable") repairable++;
    else failed++;
    if (attempts[0]!.correct) firstTry++;
  }
  return { total: ADVENT_DOORS, answered, solved, firstTry, repairable, failed, passed: adventPassed(solved, answered), percent: adventPercent(solved) };
}

export type AdventClosingKind = "gift" | "repair" | "new-round" | "done" | "progress";
export type AdventClosing = { kind: AdventClosingKind; text: string };

/** R2–R3 — a záró / bátorító szöveg. Hibáztatás, sürgetés nincs. */
export function adventClosing(summary: AdventSummary, round: number, maxRounds: number): AdventClosing {
  if (summary.passed) return { kind: "gift", text: ADVENT_GIFT_MESSAGE };
  if (summary.repairable > 0) {
    return {
      kind: "repair",
      text: `Szép munka! ${summary.solved} ablak már világít a ${summary.total}-ből. Még ${summary.repairable} ablak javításra vár — javítsd ki, és a végén meglepetés vár!`,
    };
  }
  if (summary.answered === summary.total) {
    if (round < maxRounds) {
      return { kind: "new-round", text: "Végigcsináltad — ez nagy dolog! Kérj egy új naptárat, és próbáld meg újra: most már többet tudsz." };
    }
    return { kind: "done", text: "Idén rengeteget gyakoroltál — büszke lehetsz magadra! Mutasd meg a szüleidnek, mennyit dolgoztál." };
  }
  return { kind: "progress", text: `${summary.solved} ablak már világít a ${summary.total}-ből. Gyere vissza holnap is!` };
}
