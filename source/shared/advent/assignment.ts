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
};

export function buildAdventPlan(input: BuildPlanInput): AdventPlan {
  const grade = clampAdventGrade(input.grade);
  const perDoor = 1 + limitsForGrade(grade).maxRepairs;
  const rng = createRng(seedFrom("advent", input.season, input.round, input.subjectKey, grade));
  const usedIds = new Set(input.usedIds ?? []);
  const usedPrompts = new Set(input.usedPrompts ?? []);

  const days = Array.from({ length: ADVENT_DOORS }, (_, i) => i + 1);
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
  const byId = (a: AdventItem, b: AdventItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const free = (item: AdventItem) => !usedIds.has(item.id) && !usedPrompts.has(normalizePrompt(item.prompt));
  const existing = current.map((id) => findAdventItem(id, input.bank, input.christmas));
  const christmasDoor = isChristmasDoor(day, grade);
  const subject = plan.subjects?.[day] ?? existing.map((q) => (q ? subjectOf(q) : null)).find((s) => s && s !== CHRISTMAS_SUBJECT) ?? null;
  let changed = false;
  const next = current.map((id, index) => {
    if (existing[index] || input.protectedIds?.has(id)) return id;
    let candidates: AdventItem[];
    if (christmasDoor) {
      candidates = input.christmas.filter((c) => c.minGrade <= grade && grade <= c.maxGrade).sort(byId);
    } else {
      if (!subject) return id;
      const inGrade = input.bank.filter((q) => q.grade === grade && q.subject === subject);
      candidates = tierOrder(tierForDay(day)).flatMap((tier) => inGrade.filter((q) => q.tier === tier).sort(byId));
    }
    const replacement = candidates.find(free);
    if (!replacement) return id;
    usedIds.add(replacement.id);
    usedPrompts.add(normalizePrompt(replacement.prompt));
    changed = true;
    return replacement.id;
  });
  return changed ? { plan: { ...plan, doors: { ...plan.doors, [day]: next } }, changed } : { plan, changed };
}
