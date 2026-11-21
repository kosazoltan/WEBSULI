/**
 * Adventi naptár — determinisztikus kérdéskiosztás tanulónként (docs/specs/2026-11-18-adventi-naptar.md R4, 12.3).
 * Tiszta modul: a véletlen a közös seedelt generátorból jön (`shared/game-rng.ts`), a bankokat paraméterben kapja.
 * A szerver az első íráskor kiszámolja a tervet, és a tanuló sorába menti — a bank későbbi változása nem cseréli ki.
 */
import { createRng, seedFrom } from "../game-rng";
import { ADVENT_DOORS, clampAdventGrade, isChristmasDoor, isLowGrade, limitsForGrade } from "./rules";

/** A közös évfolyam-bank tétele (a `GradeQuizItem` / `DuelBankItem` alakjával kompatibilis). */
export type AdventBankItem = {
  id: string;
  grade: number;
  subject: string;
  tier: 1 | 2 | 3;
  prompt: string;
  options: readonly string[];
  correctIndex: number;
  explanation?: string;
};

/** A karácsonyi készlet tétele: egy évfolyam-sávra érvényes. */
export type ChristmasItem = {
  id: string;
  minGrade: number;
  maxGrade: number;
  prompt: string;
  options: readonly string[];
  correctIndex: number;
  explanation: string;
};

export type AdventItem = AdventBankItem | ChristmasItem;
export const CHRISTMAS_SUBJECT = "christmas";

export type AdventPlan = {
  round: number;
  /** Az ablakok helye a képen: az 1–24 nap seedelt sorrendje. */
  layout: number[];
  /** Nap → kérdésazonosítók (fő kérdés, majd a javító kérdések). */
  doors: Record<number, string[]>;
  /** Nap → az ablak tárgya (`christmas` vagy a bank tárgya) — a pótlás (E14) innen tudja, nem az azonosító szövegéből. */
  subjects: Record<number, string>;
};

/** Kérdés-azonosság az ismétlés-szabályhoz (mint a `game-engine/gradeQuiz.ts`): NFC, kisbetű, egyszeres szóköz. */
export function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();
}

export function isChristmasItem(item: AdventItem): item is ChristmasItem {
  return "minGrade" in item;
}

export function subjectOf(item: AdventItem): string {
  return isChristmasItem(item) ? CHRISTMAS_SUBJECT : item.subject;
}

export function tierForDay(day: number): 1 | 2 | 3 {
  return day <= 8 ? 1 : day <= 16 ? 2 : 3;
}

/** A kért szint, majd a szomszédok — előbb a könnyebb. */
function tierOrder(tier: 1 | 2 | 3): (1 | 2 | 3)[] {
  return tier === 1 ? [1, 2, 3] : tier === 2 ? [2, 1, 3] : [3, 2, 1];
}

export type BuildPlanInput = {
  bank: readonly AdventBankItem[];
  christmas: readonly ChristmasItem[];
  grade: number;
  season: number;
  round: number;
  /** Az alany kulcsa, pl. `learner:<id>` — két alany más tervet kap. */
  subjectKey: string;
  /** Az évad korábbi köreiben már kiosztott azonosítók és normalizált promptok. */
  usedIds?: ReadonlySet<string>;
  usedPrompts?: ReadonlySet<string>;
  /**
   * Az évad korábbi köreiben megmutatott kérdések, a LEGRÉGEBBI elöl (tulajdonosi döntés 2026-11-21: „Ismétlés a legrégebbiekből”).
   * Csak akkor használja, ha egy ablak készletéből ismétlés nélkül már nem telik ki a hely: a hiányzó helyekre ezek közül az ablak
   * készletébe tartozó, a tervben még nem szereplő első tételek kerülnek. Ahol van elég új kérdés, a terv ugyanaz, mint nélküle.
   */
  repeatable?: readonly string[];
};

const planRng = (season: number, round: number, subjectKey: string, grade: number) => createRng(seedFrom("advent", season, round, subjectKey, clampAdventGrade(grade)));
const ALL_DOOR_DAYS = (): number[] => Array.from({ length: ADVENT_DOORS }, (_, i) => i + 1);

/**
 * Az ablakok elrendezése TERV NÉLKÜL is (ugyanaz, amit a terv tárolni fog): az állapot már az első megnyitás előtt a végleges,
 * kevert sorrendet mutatja, így a rács játék közben nem rendeződik át (vak ellenőr S1).
 */
export function adventLayout(season: number, round: number, subjectKey: string, grade: number): number[] {
  return planRng(season, round, subjectKey, grade).shuffle(ALL_DOOR_DAYS());
}

export function buildAdventPlan(input: BuildPlanInput): AdventPlan {
  const grade = clampAdventGrade(input.grade);
  const perDoor = 1 + limitsForGrade(grade).maxRepairs;
  const rng = planRng(input.season, input.round, input.subjectKey, grade);
  const usedIds = new Set(input.usedIds ?? []);
  const usedPrompts = new Set(input.usedPrompts ?? []);

  const days = ALL_DOOR_DAYS();
  // Az ELSŐ húzás az elrendezés — az `adventLayout` ugyanezt adja terv nélkül.
  const layout = rng.shuffle(days);

  /** A sorból az első `count` még nem használt tétel; a kivetteket használtnak jelöli. */
  const take = (queue: readonly AdventItem[], count: number): string[] => {
    const out: string[] = [];
    for (const item of queue) {
      if (out.length === count) break;
      const prompt = normalizePrompt(item.prompt);
      if (usedIds.has(item.id) || usedPrompts.has(prompt)) continue;
      usedIds.add(item.id);
      usedPrompts.add(prompt);
      out.push(item.id);
    }
    return out;
  };
  /** Ismétlés a legrégebbiekből (döntés 2026-11-21): a sor tételei közül a legrégebben megmutatottak, a tervben még nem szereplők. */
  const repeatOrder = input.repeatable ?? [];
  const planIds = new Set<string>();
  const planPrompts = new Set<string>();
  const takeRepeated = (queue: readonly AdventItem[], count: number): string[] => {
    const out: string[] = [];
    if (count <= 0 || repeatOrder.length === 0) return out;
    const inQueue = new Map(queue.map((item) => [item.id, item]));
    for (const id of repeatOrder) {
      if (out.length === count) break;
      const item = inQueue.get(id);
      if (!item) continue;
      const prompt = normalizePrompt(item.prompt);
      if (planIds.has(id) || planPrompts.has(prompt)) continue;
      planIds.add(id);
      planPrompts.add(prompt);
      out.push(id);
    }
    return out;
  };

  const christmasQueue = rng.shuffle(input.christmas.filter((c) => c.minGrade <= grade && grade <= c.maxGrade));
  const gradeBank = isLowGrade(grade) ? [] : input.bank.filter((q) => q.grade === grade);
  const subjects = rng.shuffle([...new Set(gradeBank.map((q) => q.subject))].sort());
  const cells = new Map<string, AdventBankItem[]>();
  const cell = (subject: string, tier: 1 | 2 | 3): AdventBankItem[] => {
    const key = `${subject}|${tier}`;
    let queue = cells.get(key);
    if (!queue) {
      queue = rng.shuffle(gradeBank.filter((q) => q.subject === subject && q.tier === tier));
      cells.set(key, queue);
    }
    return queue;
  };

  const doors: Record<number, string[]> = {};
  const doorSubjects: Record<number, string> = {};
  let bankDoor = 0;
  for (const day of days) {
    let ids: string[];
    if (isChristmasDoor(day, grade)) {
      ids = take(christmasQueue, perDoor);
      ids.push(...takeRepeated(christmasQueue, perDoor - ids.length));
      doorSubjects[day] = CHRISTMAS_SUBJECT;
    } else {
      if (subjects.length === 0) throw new RangeError(`advent: nincs kérdés a(z) ${grade}. évfolyam bankjában`);
      const subject = subjects[bankDoor % subjects.length]!;
      bankDoor++;
      doorSubjects[day] = subject;
      ids = [];
      for (const tier of tierOrder(tierForDay(day))) {
        if (ids.length === perDoor) break;
        ids.push(...take(cell(subject, tier), perDoor - ids.length));
      }
      // Csak ha mindhárom szint új tételei elfogytak (a cellák ekkor már mind létrejöttek: a véletlen sorrend nem változik).
      for (const tier of tierOrder(tierForDay(day))) {
        if (ids.length === perDoor) break;
        ids.push(...takeRepeated(cell(subject, tier), perDoor - ids.length));
      }
    }
    for (const id of ids) {
      planIds.add(id);
      const item = findAdventItem(id, input.bank, input.christmas);
      if (item) planPrompts.add(normalizePrompt(item.prompt));
    }
    if (ids.length < perDoor) throw new RangeError(`advent: elfogyott a kérdés (${grade}. évfolyam, ${day}. ablak, ${input.round}. kör)`);
    doors[day] = ids;
  }
  return { round: input.round, layout, doors, subjects: doorSubjects };
}

/** A válaszlehetőségek seedelt sorrendje: a visszaadott tömb i. eleme az eredeti opció indexe. */
export function optionOrder(questionId: string, subjectKey: string, season: number): number[] {
  return createRng(seedFrom("advent-options", season, subjectKey, questionId)).shuffle([0, 1, 2, 3]);
}

export type AdventClientQuestion = { id: string; subject: string; prompt: string; options: string[] };

/** A kliensnek adott kérdés — kevert sorrendben, a helyes válasz és a magyarázat NÉLKÜL. */
export function toClientQuestion(item: AdventItem, order: readonly number[]): AdventClientQuestion {
  return { id: item.id, subject: subjectOf(item), prompt: item.prompt, options: order.map((i) => item.options[i]!) };
}

/** Pontozás a kevert sorrendben értett `pick` szerint; a `correctIndex` is a kevert sorrendben értendő. */
export function gradePick(item: AdventItem, order: readonly number[], pick: number): { correct: boolean; correctIndex: number } {
  const correctIndex = order.indexOf(item.correctIndex);
  return { correct: pick === correctIndex, correctIndex };
}

export function findAdventItem(id: string, bank: readonly AdventBankItem[], christmas: readonly ChristmasItem[]): AdventItem | null {
  return christmas.find((c) => c.id === id) ?? bank.find((q) => q.id === id) ?? null;
}

/**
 * E14 — a mentett terv egy ablakának javítása, ha egy kiosztott kérdés közben eltűnt a bankból: a hiányzó azonosító helyére a
 * megfelelő készlet azonosító szerinti első, az évadban még nem használt tétele lép (determinisztikus). A meglévő azonosítók
 * helye nem változik, és a `protectedIds` (a már megválaszolt próbák kérdései) SOHA nem cserélődnek — a tárolt próba a régi
 * azonosítóra mutat (review A1). A tárgyat a terv mondja meg (`plan.subjects`), nem az azonosító szövege. Ha nincs pótlás, a
 * hiányzó azonosító a helyén marad (a hívó hibát jelez).
 */
export function repairPlanDoor(
  plan: AdventPlan,
  day: number,
  input: {
    bank: readonly AdventBankItem[];
    christmas: readonly ChristmasItem[];
    grade: number;
    usedIds: ReadonlySet<string>;
    usedPrompts: ReadonlySet<string>;
    protectedIds?: ReadonlySet<string>;
  },
): { plan: AdventPlan; changed: boolean } {
  const grade = clampAdventGrade(input.grade);
  const current = plan.doors[day] ?? [];
  const usedIds = new Set(input.usedIds);
  const usedPrompts = new Set(input.usedPrompts);
  for (const ids of Object.values(plan.doors)) {
    for (const id of ids) {
      usedIds.add(id);
      const known = findAdventItem(id, input.bank, input.christmas);
      if (known) usedPrompts.add(normalizePrompt(known.prompt));
    }
  }
  const free = (item: AdventItem) => !usedIds.has(item.id) && !usedPrompts.has(normalizePrompt(item.prompt));
  const existing = current.map((id) => findAdventItem(id, input.bank, input.christmas));
  const subject = plan.subjects?.[day] ?? existing.map((q) => (q ? subjectOf(q) : null)).find((s) => s && s !== CHRISTMAS_SUBJECT) ?? null;
  let changed = false;
  const next = current.map((id, index) => {
    if (existing[index] || input.protectedIds?.has(id)) return id;
    const candidates = replacementCandidates(day, grade, subject, input.bank, input.christmas);
    if (!candidates) return id;
    const replacement = candidates.find(free);
    if (!replacement) return id;
    usedIds.add(replacement.id);
    usedPrompts.add(normalizePrompt(replacement.prompt));
    changed = true;
    return replacement.id;
  });
  return changed ? { plan: { ...plan, doors: { ...plan.doors, [day]: next } }, changed } : { plan, changed };
}

const byItemId = (a: AdventItem, b: AdventItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Egy ablak pótlási jelöltjei determinisztikus (azonosító szerinti) sorrendben: karácsonyi ablaknál az évfolyam karácsonyi tételei,
 * különben a terv szerinti tárgy tételei a nap nehézségi sorrendjében. `null`, ha a tárgy nem ismert.
 */
function replacementCandidates(day: number, grade: number, subject: string | null, bank: readonly AdventBankItem[], christmas: readonly ChristmasItem[]): AdventItem[] | null {
  // Karácsonyi nap VAGY karácsonyi tárgyú (pl. eltérő évfolyamú vendégtől átvett) hely: a karácsonyi készlet (PR-B 4. kör L4).
  if (isChristmasDoor(day, grade) || subject === CHRISTMAS_SUBJECT) return christmas.filter((c) => c.minGrade <= grade && grade <= c.maxGrade).sort(byItemId);
  if (!subject) return null;
  const inGrade = bank.filter((q) => q.grade === grade && q.subject === subject);
  return tierOrder(tierForDay(day)).flatMap((tier) => inGrade.filter((q) => q.tier === tier).sort(byItemId));
}

/**
 * Ütközésmentesítés (GPT-vak L3 és 3. kör L2; terv A4, A36): két terv egyesítése után (névtelen → párosított átvétel) ugyanaz a kérdés
 * két ablakba is kerülhet. A TÖRTÉNETI helyek (`historicalByDay`: ablakonként a már megválaszolt próbák száma — a terv első N helye) a
 * próbákban élnek tovább; a TERV mégis egyedi marad: ha két történeti hely ugyanazt a kérdést hordozza, a nap szerinti első marad a
 * tervben, a többi helyén a terv pótlást kap (a tárolt próba és visszajelzése érintetlen — a megválaszolt ablak a próbából olvas).
 * A játszható helyeken (a próbák után) minden olyan kérdés pótlódik, amely bármely történeti helyen, korábbi játszható helyen vagy az
 * évad korábbi köreiben már szerepelt (azonosító VAGY normalizált szöveg). A pótlás az ablak saját készletéből, determinisztikus.
 */
export function dedupePlanDoors(
  plan: AdventPlan,
  input: {
    bank: readonly AdventBankItem[];
    christmas: readonly ChristmasItem[];
    grade: number;
    usedIds: ReadonlySet<string>;
    usedPrompts: ReadonlySet<string>;
    historicalByDay: ReadonlyMap<number, number>;
  },
): { plan: AdventPlan; changed: boolean } {
  const grade = clampAdventGrade(input.grade);
  const seenIds = new Set(input.usedIds);
  const seenPrompts = new Set(input.usedPrompts);
  const promptOf = (id: string): string | null => {
    const item = findAdventItem(id, input.bank, input.christmas);
    return item ? normalizePrompt(item.prompt) : null;
  };
  const mark = (id: string) => { seenIds.add(id); const p = promptOf(id); if (p) seenPrompts.add(p); };
  const taken = (id: string) => { const p = promptOf(id); return seenIds.has(id) || (p !== null && seenPrompts.has(p)); };
  const free = (item: AdventItem) => !seenIds.has(item.id) && !seenPrompts.has(normalizePrompt(item.prompt));
  const days = Object.keys(plan.doors).map(Number).filter((d) => Number.isInteger(d)).sort((a, b) => a - b);
  const doors: Record<number, string[]> = {};
  for (const day of days) doors[day] = [...(plan.doors[day] ?? [])];
  let changed = false;
  const replace = (day: number, index: number) => {
    const replacement = replacementCandidates(day, grade, plan.subjects?.[day] ?? null, input.bank, input.christmas)?.find(free);
    if (!replacement) return;
    mark(replacement.id);
    doors[day]![index] = replacement.id;
    changed = true;
  };
  // 1) Történeti helyek (elsőbbség): a nap szerinti első előfordulás marad a tervben, a későbbi ismétlődés helye pótlást kap.
  const historical = (day: number) => Math.min(input.historicalByDay.get(day) ?? 0, doors[day]!.length);
  for (const day of days) for (let i = 0; i < historical(day); i++) { const id = doors[day]![i]!; if (taken(id)) replace(day, i); else mark(id); }
  // 2) Játszható helyek: minden már szereplő kérdés pótlódik.
  for (const day of days) for (let i = historical(day); i < doors[day]!.length; i++) { const id = doors[day]![i]!; if (taken(id)) replace(day, i); else mark(id); }
  return changed ? { plan: { ...plan, doors: { ...plan.doors, ...doors } }, changed } : { plan, changed };
}
