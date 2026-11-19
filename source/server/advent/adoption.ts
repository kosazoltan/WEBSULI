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
import { ADVENT_DOORS, adventSummary, doorState, type DoorRecord } from "../../shared/advent/rules";
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

/**
 * Egy ablak eredményének rangja (vak ellenőr 3. kör KÖZEPES-A): megoldva (2) > érintetlen vagy még javítható (1) > végleg elbukott (0).
 * Az elbukott próba nem „jobb”, mint a még meglévő lehetőség.
 */
export function doorRank(record: DoorRecord | undefined, maxRepairs: number): 0 | 1 | 2 {
  const attempts = record?.attempts ?? [];
  const state = doorState({ unlocked: true, attempts, maxRepairs });
  return state === "solved" ? 2 : state === "failed" ? 0 : 1;
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
 * egyszerűen törlődik). Csak az eszköz AKTUÁLIS körének ablakai kerülnek a tanuló aktuális körébe (korábbi kör kudarca soha), ablakonként
 * akkor, ha MEGOLDOTTAK és a tanulóé nem az (`doorRank`); minden más esetben a tanulóé marad. Próba nélküli eszköz-ablak soha nem
 * töröl a tanuló sorából. Az átvett ablakkal a kérdéssora és a sorrend magja is átkerül (a jelölés így változatlan).
 */
export function mergeAdoption(learner: AdventRow | null, device: AdventRow, ctx: AdoptionContext): AdventRow | null {
  const deviceDoors = device.doors[device.round] ?? {};
  if (!Object.values(deviceDoors).some((door) => door.attempts.length > 0)) return null;
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
  const devicePlan = device.plan[device.round] as PlanMeta | undefined;
  const repairs = ctx.maxRepairs(grade);
  for (let day = 1; day <= ADVENT_DOORS; day++) {
    const theirs = deviceDoors[day];
    const mine = doors[day];
    if (!theirs?.attempts.length && !mine?.attempts.length) {
      // Senki nem válaszolt még: azonos évfolyamnál a vendég (épp ezen az eszközön mutatott) kérdéssora és magja marad, hogy a
      // megnyitott kérdésre érkező válasz ne legyen elavult; eltérő évfolyamnál a tanuló saját terve.
      if (devicePlan?.doors[day] && (planGradeOf(devicePlan) ?? device.grade) === grade) {
        plan.doors[day] = [...devicePlan.doors[day]!];
        if (devicePlan.subjects?.[day]) plan.subjects[day] = devicePlan.subjects[day]!;
        plan.doorSeeds[day] = orderKeyFor(devicePlan, day, ctx.deviceKey);
      }
      continue;
    }
    // Felülírni csak MEGOLDOTT ablak tud (és csak nem megoldottat): a vendég rontott / javítható próbája sem az érintetlen, sem a
    // tanuló végleg elbukott ablakát nem váltja le — a gyerek vendégként nem „állíthatja vissza” a saját kudarcát (döntés 2026-11-19).
    if (!theirs?.attempts.length || doorRank(theirs, repairs) !== 2 || doorRank(mine, repairs) === 2) continue;
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
