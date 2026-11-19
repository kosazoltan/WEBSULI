/**
 * Adventi naptár — névtelen → párosított átmenet: ABLAKONKÉNTI EGYESÍTÉS (tulajdonosi döntés 2026-11-19, kérdőív; terv 21.).
 * Átvételkor minden naptárablaknál a jobb eredmény marad meg, és semmi nem vész el a tanuló sorából: a körszám, a korábbi körök,
 * a megfelelés időpontja és a szülői levél foglalásai a tanulói sorban maradnak; az eszköz sora az egyesítés után törlődik (a jobb
 * ablakai a tanuló sorában élnek tovább).
 *
 * A válaszlehetőségek sorrendje (vak ellenőr K1): a sorrend magja a TERVHEZ kötött kulcs (\`seedKey\`, ablakonként felülírható:
 * \`doorSeeds\`), nem a pillanatnyi alany — így átvétel után a tárolt választás, a helyes válasz jelölése és a pontozás ugyanaz marad,
 * és a vendégként megnyitott kérdés a tokennel érkező válasznál is a gyereknek mutatott sorrendben pontozódik.
 *
 * Tiszta modul: az adatbázis-tranzakciót a \`store.adopt\`, az előnézetet a \`GET /state\` használja ugyanerre a függvényre.
 */
import type { AdventPlan } from "../../shared/advent/assignment";
import { ADVENT_DOORS, adventSummary, type DoorRecord } from "../../shared/advent/rules";
import type { AdventRow } from "./store";

/** A tervvel együtt tárolt meta: tervezési évfolyam, a sorrend magja, és az átvett ablakok saját magja. */
export type PlanMeta = AdventPlan & { grade?: number; seedKey?: string; doorSeeds?: Record<number, string> };

export const withPlanMeta = (plan: AdventPlan, grade: number, seedKey: string): AdventPlan => ({ ...plan, grade, seedKey } as PlanMeta);

export const planGradeOf = (plan: AdventPlan | undefined): number | undefined => {
  const grade = (plan as PlanMeta | undefined)?.grade;
  return typeof grade === "number" ? grade : undefined;
};

/** A válaszsorrend magja egy ablakhoz: az ablak átvett magja, különben a terv magja, különben (régi terv) a megadott alany-kulcs. */
export function orderKeyFor(plan: AdventPlan | undefined, day: number, fallbackSubjectKey: string): string {
  const meta = plan as PlanMeta | undefined;
  return meta?.doorSeeds?.[day] ?? meta?.seedKey ?? fallbackSubjectKey;
}

/** Egy ablak eredményének rangja: megoldva (2) > próbálkozott, de nem megoldott (1) > nincs próba (0). */
export function doorScore(record: DoorRecord | undefined): 0 | 1 | 2 {
  const attempts = record?.attempts ?? [];
  if (attempts.some((attempt) => attempt.correct)) return 2;
  return attempts.length > 0 ? 1 : 0;
}

export type AdoptionContext = {
  learnerId: string;
  deviceKey: string;
  learnerKey: string;
  /** A tanuló profiljának évfolyama (ebből készül a tanulói terv, ha még nincs). */
  learnerGrade: number;
  maxRepairs: (grade: number) => number;
  /** A tanuló adott körének terve (meta-val), ha a sorában még nincs. */
  buildPlan: (row: AdventRow, round: number, grade: number) => AdventPlan;
  now: Date;
};

/**
 * Az egyesített tanulói sor, vagy \`null\`, ha az eszköz sorában nincs egyetlen válasz sem (nincs mit átvinni — az eszköz sora
 * egyszerűen törlődik). Az eszköz ablakai a tanuló AKTUÁLIS körébe kerülnek, ablakonként a jobb eredmény szerint: az eszköz oldalán
 * az összes köre közül a legjobb (egyenlőségnél a későbbi kör), és ha az jobb a tanulóénál, az kerül át; egyenlőségnél a tanulóé marad. Az átvett ablakkal a kérdéssora és a sorrend magja is átkerül (a jelölés így változatlan).
 */
export function mergeAdoption(learner: AdventRow | null, device: AdventRow, ctx: AdoptionContext): AdventRow | null {
  if (!Object.values(device.doors).some((round) => Object.values(round).some((door) => door.attempts.length > 0))) return null;
  const base: AdventRow = learner ?? {
    id: "", season: device.season, subjectKind: "learner", subjectId: ctx.learnerId, grade: null, round: 1, plan: {}, doors: {},
    finishedAt: null, passedAt: null, mailedTo: [], createdAt: ctx.now, updatedAt: ctx.now,
  };
  const round = base.round;
  const grade = base.grade ?? planGradeOf(base.plan[round]) ?? ctx.learnerGrade;
  const existingPlan = base.plan[round] as PlanMeta | undefined;
  const plan: PlanMeta = existingPlan ? { ...existingPlan, doors: { ...existingPlan.doors }, subjects: { ...existingPlan.subjects }, doorSeeds: { ...(existingPlan.doorSeeds ?? {}) } }
    : { ...(ctx.buildPlan(base, round, grade) as PlanMeta) };
  plan.doorSeeds ??= {};
  const doors: Record<number, DoorRecord> = { ...(base.doors[round] ?? {}) };
  // Az eszköz köreit a legutóbbitól visszafelé járjuk: szigorúan jobb korábbi eredmény felülírja a későbbit.
  const deviceRounds = Object.keys(device.doors).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => b - a);
  for (let day = 1; day <= ADVENT_DOORS; day++) {
    let theirs: DoorRecord | undefined;
    let from = device.round;
    for (const r of deviceRounds) {
      const record = device.doors[r]?.[day];
      if (doorScore(record) > doorScore(theirs)) { theirs = record; from = r; }
    }
    const mine = doors[day];
    if (doorScore(theirs) <= doorScore(mine)) continue;
    const devicePlan = device.plan[from] as PlanMeta | undefined;
    doors[day] = { attempts: theirs!.attempts.map((attempt) => ({ ...attempt })) };
    if (devicePlan?.doors[day]) plan.doors[day] = [...devicePlan.doors[day]!];
    if (devicePlan?.subjects?.[day]) plan.subjects[day] = devicePlan.subjects[day]!;
    plan.doorSeeds[day] = orderKeyFor(devicePlan, day, ctx.deviceKey);
  }
  const summary = adventSummary(doors, ctx.maxRepairs(grade));
  const answeredAny = Object.values(doors).some((door) => door.attempts.length > 0);
  return {
    ...base,
    // Az évfolyam a tanuló profiljából (vagy a már rögzített), NEM a vendégként választott (vak ellenőr KICSI-6); válasz után rögzül.
    grade: base.grade ?? (answeredAny ? grade : null),
    plan: { ...base.plan, [round]: plan },
    doors: { ...base.doors, [round]: doors },
    finishedAt: base.finishedAt ?? (summary.answered === ADVENT_DOORS ? ctx.now : null),
    passedAt: base.passedAt ?? (summary.passed ? ctx.now : null),
  };
}
