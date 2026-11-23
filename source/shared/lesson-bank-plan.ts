import type { Lesson } from "./lesson-schema";
import { seededShuffle } from "./seeded";
import { LESSON_METHOD_VERSION, LESSON_BANK_RESERVE, LESSON_BANK_RESERVE_RATIO, LESSON_BANK_SIZES, METHOD_KINDS, type LessonBankPlan } from "./lesson-experience";

/** Plan from taught concepts, never from a filename or a target token count. */
export function planLessonBank(lesson: Pick<Lesson, "sections" | "classroom">, version: string = LESSON_METHOD_VERSION): LessonBankPlan {
  const units: LessonBankPlan["units"] = [];
  lesson.sections.forEach((section, sectionIndex) => {
    const ids = [...new Set(section.blocks.flatMap(b => b.kind === "explain" || b.kind === "example" ? b.coversConceptIds : []))].sort();
    for (let i = 0; i < ids.length; i += 6) units.push({ sectionIndex, conceptIds: ids.slice(i, i + 6) });
  });
  if (version === LESSON_METHOD_VERSION) return { units, taskRound: LESSON_BANK_SIZES.taskRound, quizRound: LESSON_BANK_SIZES.quizRound };
  const tasks = Math.max(15, units.reduce((n, u) => n + Math.max(2, u.conceptIds.length), 0));
  const quiz = Math.max(15, units.reduce((n, u) => n + 2 * u.conceptIds.length, 0));
  const earlyReader = lesson.classroom >= 1 && lesson.classroom <= 2;
  return { units, taskRound: Math.min(earlyReader ? 3 : 5, tasks), quizRound: Math.min(earlyReader ? 5 : 10, quiz) };
}

/** Deterministic quotas are part of the checkpoint hash, including method coverage. */
export function bankUnitQuota(plan: LessonBankPlan, unitIndex: number, seed?: number) {
  const minimums = (kind: "tasks" | "quiz") => {
    const base = plan.units.map(u => kind === "tasks" ? Math.max(2, u.conceptIds.length) : u.conceptIds.length * 2);
    const extra = Math.max(0, LESSON_BANK_SIZES[kind] - base.reduce((a, b) => a + b, 0));
    return base.map((b, i) => b + Math.floor(extra / base.length) + (i < extra % base.length ? 1 : 0));
  };
  // Tételgyár T1 (tulajdonosi döntés D1, 130%): a tartalék a fejezetek TÉNYLEGES minimuma fölé kerül, a minimumuk arányában
  // (legnagyobb maradék, egyezésnél a korábbi fejezet) — eddig a tartalék csak a 45/75-ös összegig töltött, így a nagyobb
  // alapkvótájú leckében nulla volt, és egyetlen hibás tétel kivétele a minimum alá vitte a csomagot.
  const allocate = (kind: "tasks" | "quiz", withReserve = false) => {
    const mins = minimums(kind);
    if (!withReserve) return mins[unitIndex];
    const sum = mins.reduce((a, b) => a + b, 0);
    // Review #226 (P1) + #229 (P1): minden fejezet ELŐBB egy tartalékot kap, a maradék oszlik a minimumok arányában (a súlyozott
    // lefelé kerekítés különben eltérő szélességű fejezeteknél nullát adhat).
    const total = Math.max(LESSON_BANK_RESERVE[kind], Math.ceil(LESSON_BANK_RESERVE_RATIO * sum), mins.length);
    const rest = total - mins.length;
    const exact = mins.map(m => (rest * m) / sum);
    const shares = exact.map(e => Math.floor(e) + 1);
    const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
    const remainder = total - shares.reduce((a, b) => a + b, 0);
    for (let k = 0; k < remainder; k++) shares[order[k % order.length].i]++;
    return mins[unitIndex] + shares[unitIndex];
  };
  const kinds = plan.units.map(() => [] as Array<typeof METHOD_KINDS[number]>);
  // Spec 2026-11-20-tgm-valtozatossag-abrak (11. szakasz 4. pont): maggal (a változatossági kapcsolóval) a sorrend keveredik — a lecke
  // nem mindig `prediction`-nel indul; mag nélkül a kiosztás bájtra a régi.
  const order = [...METHOD_KINDS, "gate" as const];
  (seed === undefined ? order : seededShuffle(order, seed)).forEach((kind, i) => kinds[i % kinds.length].push(kind));
  // S5b vak kör 1 (L4): maggal a kitöltő csak NEM kapu fajtát vesz fel — a keverés már kiosztotta a két kötelező kapukérdést, a kitöltő
  // egy harmadikat írna elő (a lejátszó minden meg nem oldott kapunál megáll). Mag nélkül (KI) a kitöltő a régi.
  const fillers = seed === undefined ? METHOD_KINDS : METHOD_KINDS.filter((kind) => kind !== "gate");
  for (const [i, list] of kinds.entries()) {
    for (let k = i; new Set(list).size < 2; k++) if (!list.includes(fillers[k % fillers.length])) list.push(fillers[k % fillers.length]);
  }
  // Spec 2026-09-29-limit-banktetel-kivetel (5. döntés): a *Count az elfogadási minimum (a publikálási 45/75-höz),
  // a *Target a modelltől kért darabszám tartalékkal, hogy a kapu a hibás tételt a minimum megsértése nélkül kivehesse.
  return {
    taskCount: allocate("tasks"), quizCount: allocate("quiz"),
    taskTarget: allocate("tasks", true), quizTarget: allocate("quiz", true),
    methodKinds: kinds[unitIndex],
  };
}

/**
 * Review #534 (Copilot): a kész csomag módszerei a KIOSZTOTT sorrendbe kerülnek — minden módszer a fajtája legkorábbi, még szabad
 * kvótahelyére, a fajtán belül az eredeti sorrendben; a kvótán felüli tételek a végére, az eredeti sorrendjükben. Kiosztás nélkül
 * (`undefined`: KI állapot) a sorrend változatlan.
 */
export function orderMethodsByQuota<T extends { kind: string }>(methods: readonly T[], quota: readonly string[] | undefined): T[] {
  if (!quota) return [...methods];
  const free = quota.map((kind, slot) => ({ kind, slot, taken: false }));
  const placed: Array<{ slot: number; item: T }> = [];
  const rest: T[] = [];
  for (const item of methods) {
    const place = free.find((f) => !f.taken && f.kind === item.kind);
    if (place) { place.taken = true; placed.push({ slot: place.slot, item }); } else rest.push(item);
  }
  return [...placed.sort((a, b) => a.slot - b.slot).map((p) => p.item), ...rest];
}

/**
 * Review #534 (Copilot): kiosztással (BE állapot) a csomag kapukérdéseinek száma nem lépheti túl a kiosztottat — a lejátszó minden meg
 * nem oldott kapunál megáll, a lecke a megígért két kaput kapja (a hiányt a „Hiányzó módszer” ellenőrzés jelzi). Kiosztás nélkül
 * (`undefined`: KI állapot) a régi, csak alsó korlátos szabály él.
 */
export function gateCountProblem(methods: ReadonlyArray<{ kind: string }>, quota: readonly string[] | undefined): string | null {
  if (!quota) return null;
  const allowed = quota.filter((kind) => kind === "gate").length;
  const actual = methods.filter((m) => m.kind === "gate").length;
  return actual > allowed ? `A csomagban legfeljebb ${allowed} kapukérdés (kind="gate") lehet, most ${actual} — a többletet más fajtájú módszerre cseréld.` : null;
}
