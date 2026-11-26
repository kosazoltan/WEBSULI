/**
 * V2a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): az öt új feladatfajta specifikáció-olvasója, érvényesítője és
 * DETERMINISZTIKUS, dokumentált pontozója. DOM-mentes; a kliens megjelenítője és a séma is ezt használja (egy szabály egy helyen).
 *
 * Pontozás:
 * - trueFalseSeries: pont = helyes jelölések száma, max = állítások száma;
 * - highlight: pont = max(0, eltalált célszó − téves kijelölés), max = célszavak száma;
 * - categorize: pont = helyesen besorolt elemek száma, max = elemek száma;
 * - numberLine: |érték − cél| ≤ tűrés → 2; ≤ 2 × tűrés → 1; különben 0 (max 2);
 * - estimate: relatív eltérés ≤ 5% → 2; ≤ 15% → 1; különben 0 (max 2).
 * Ítélet: pont = max → „teljes”; 0 < pont < max → „részleges”; 0 → „rossz”.
 */
export const V2_TRY_KINDS = ["trueFalseSeries", "highlight", "categorize", "numberLine", "estimate"] as const;
export type V2TryKind = (typeof V2_TRY_KINDS)[number];
/** V3a: kártyaformák és döntés–következmény (a `try` keretben; pontozás csak a döntésnél: legjobb = 1, más = 0). */
export const V3_TRY_KINDS = ["flipCard", "stepReveal", "didYouKnow", "decision", "flashcards"] as const;
export type V3TryKind = (typeof V3_TRY_KINDS)[number];

export type Verdict = "teljes" | "részleges" | "rossz";
export type TryScore = { points: number; max: number; verdict: Verdict };

export function verdictOf(points: number, max: number): Verdict {
  if (max > 0 && points >= max) return "teljes";
  return points > 0 ? "részleges" : "rossz";
}
const score = (points: number, max: number): TryScore => ({ points, max, verdict: verdictOf(points, max) });

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type TrueFalseSpec = { statements: Array<{ text: string; answer: boolean; explanation?: string }> };
export function readTrueFalse(spec: unknown): TrueFalseSpec {
  const s = (spec ?? {}) as { statements?: unknown };
  return { statements: arr(s.statements).flatMap((x) => {
    const o = (x ?? {}) as { text?: unknown; answer?: unknown; explanation?: unknown };
    return str(o.text) && typeof o.answer === "boolean" ? [{ text: str(o.text), answer: o.answer, ...(str(o.explanation) ? { explanation: str(o.explanation) } : {}) }] : [];
  }) };
}
export function scoreTrueFalseSeries(spec: unknown, answers: ReadonlyArray<boolean | null | undefined>): TryScore {
  const { statements } = readTrueFalse(spec);
  return score(statements.filter((s, i) => answers[i] === s.answer).length, statements.length);
}

export type HighlightToken = { word: string; index: number };
/** A szöveg szavai (betűk / számjegyek, kötőjellel); az írásjel nem kijelölhető. */
export function highlightTokens(text: string): HighlightToken[] {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)].map((m, index) => ({ word: m[0], index }));
}
const norm = (w: string) => w.normalize("NFC").toLocaleLowerCase("hu");
export type HighlightSpec = { text: string; targets: string[]; prompt?: string };
export function readHighlight(spec: unknown): HighlightSpec {
  const s = (spec ?? {}) as { text?: unknown; targets?: unknown; prompt?: unknown };
  return { text: str(s.text), targets: arr(s.targets).map(str).filter(Boolean), ...(str(s.prompt) ? { prompt: str(s.prompt) } : {}) };
}
export function scoreHighlight(spec: unknown, selected: readonly number[]): TryScore {
  const { text, targets } = readHighlight(spec);
  const tokens = highlightTokens(text);
  const wanted = new Set(targets.map(norm));
  const picked = new Set(selected.filter((i) => Number.isInteger(i) && i >= 0 && i < tokens.length));
  const hitWords = new Set<string>();
  let wrong = 0;
  for (const i of picked) {
    const w = norm(tokens[i].word);
    if (wanted.has(w)) hitWords.add(w); else wrong++;
  }
  return score(Math.max(0, hitWords.size - wrong), wanted.size);
}

export type CategorizeSpec = { categories: string[]; items: Array<{ text: string; category: string }> };
export function readCategorize(spec: unknown): CategorizeSpec {
  const s = (spec ?? {}) as { categories?: unknown; items?: unknown };
  return {
    categories: arr(s.categories).map(str).filter(Boolean),
    items: arr(s.items).flatMap((x) => { const o = (x ?? {}) as { text?: unknown; category?: unknown }; return str(o.text) && str(o.category) ? [{ text: str(o.text), category: str(o.category) }] : []; }),
  };
}
export function scoreCategorize(spec: unknown, picks: ReadonlyArray<string | null | undefined>): TryScore {
  const { items } = readCategorize(spec);
  return score(items.filter((it, i) => picks[i] === it.category).length, items.length);
}

export type NumberLineSpec = { min: number; max: number; step: number; target: number; tolerance: number; prompt?: string };
export function readNumberLine(spec: unknown): NumberLineSpec {
  const s = (spec ?? {}) as Record<string, unknown>;
  const min = num(s.min) ?? 0, max = num(s.max) ?? 10;
  const step = num(s.step) && num(s.step)! > 0 ? num(s.step)! : (max - min) / 100 || 1;
  return { min, max, step, target: num(s.target) ?? NaN, tolerance: num(s.tolerance) ?? step / 2, ...(str(s.prompt) ? { prompt: str(s.prompt) } : {}) };
}
export function scoreNumberLine(spec: unknown, value: number | null | undefined): TryScore {
  const { target, tolerance } = readNumberLine(spec);
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(target)) return score(0, 2);
  const d = Math.abs(value - target);
  return score(d <= tolerance + 1e-9 ? 2 : d <= 2 * tolerance + 1e-9 ? 1 : 0, 2);
}

export type EstimateSpec = { min: number; max: number; step: number; answer: number; unit?: string; prompt?: string };
export function readEstimate(spec: unknown): EstimateSpec {
  const s = (spec ?? {}) as Record<string, unknown>;
  const min = num(s.min) ?? 0, max = num(s.max) ?? 100;
  const step = num(s.step) && num(s.step)! > 0 ? num(s.step)! : (max - min) / 100 || 1;
  return { min, max, step, answer: num(s.answer) ?? NaN, ...(str(s.unit) ? { unit: str(s.unit) } : {}), ...(str(s.prompt) ? { prompt: str(s.prompt) } : {}) };
}
export function scoreEstimate(spec: unknown, value: number | null | undefined): TryScore {
  const { answer } = readEstimate(spec);
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(answer)) return score(0, 2);
  const rel = Math.abs(value - answer) / Math.max(Math.abs(answer), 1e-9);
  return score(rel <= 0.05 + 1e-9 ? 2 : rel <= 0.15 + 1e-9 ? 1 : 0, 2);
}

/**
 * Review #609/#615/#617: a csúszka csak a `min + k·step` (≤ max) értékeket engedi — elérhető-e így teljes pontot érő válasz?
 * A célhoz legközelebbi két rácspontot vizsgálja (a pontozás a céltól mért távolság monoton függvénye).
 */
export function sliderHasFullScore(min: number, max: number, step: number, target: number, full: (v: number) => boolean): boolean {
  if (!(step > 0) || !(min < max) || !Number.isFinite(target)) return false;
  const last = Math.floor((max - min) / step + 1e-9);
  const k = Math.floor((target - min) / step + 1e-9);
  return [k, k + 1].map((x) => min + Math.min(last, Math.max(0, x)) * step).some(full);
}
export type FlipCardSpec = { front: string; back: string };
export const readFlipCard = (spec: unknown): FlipCardSpec => { const s = (spec ?? {}) as Record<string, unknown>; return { front: str(s.front), back: str(s.back) }; };
export type StepRevealSpec = { title?: string; steps: string[] };
export const readStepReveal = (spec: unknown): StepRevealSpec => { const s = (spec ?? {}) as Record<string, unknown>; return { ...(str(s.title) ? { title: str(s.title) } : {}), steps: arr(s.steps).map(str).filter(Boolean) }; };
export type DidYouKnowSpec = { fact: string; source?: string };
export const readDidYouKnow = (spec: unknown): DidYouKnowSpec => { const s = (spec ?? {}) as Record<string, unknown>; return { fact: str(s.fact), ...(str(s.source) ? { source: str(s.source) } : {}) }; };
export type DecisionSpec = { situation: string; options: Array<{ text: string; consequence: string; best: boolean }> };
export function readDecision(spec: unknown): DecisionSpec {
  const s = (spec ?? {}) as Record<string, unknown>;
  return { situation: str(s.situation), options: arr(s.options).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return str(o.text) && str(o.consequence) ? [{ text: str(o.text), consequence: str(o.consequence), best: o.best === true }] : [];
  }) };
}
export function scoreDecision(spec: unknown, choice: number | null | undefined): TryScore {
  const { options } = readDecision(spec);
  return score(typeof choice === "number" && options[choice]?.best ? 1 : 0, 1);
}
export type FlashcardsSpec = { cards: Array<{ front: string; back: string }> };
export function readFlashcards(spec: unknown): FlashcardsSpec {
  const s = (spec ?? {}) as Record<string, unknown>;
  return { cards: arr(s.cards).flatMap((x) => { const o = (x ?? {}) as Record<string, unknown>; return str(o.front) && str(o.back) ? [{ front: str(o.front), back: str(o.back) }] : []; }) };
}

/** A séma (írás) szabályai fajtánként — üres lista: érvényes. Ismeretlen fajtára üres (azt a `tryKind` enum szűri). */
export function trySpecProblems(kind: string, spec: unknown): string[] {
  const p: string[] = [];
  if (kind === "trueFalseSeries") {
    const n = readTrueFalse(spec).statements.length;
    if (n < 2 || n > 8 || n !== arr((spec as { statements?: unknown } | null)?.statements).length) p.push("Az igaz/hamis sorozat 2–8 állításból áll, mindegyik szöveggel és igaz/hamis válasszal.");
  } else if (kind === "highlight") {
    const h = readHighlight(spec);
    const words = new Set(highlightTokens(h.text).map((t) => norm(t.word)));
    if (!h.text) p.push("A szókiemelésnek szöveg kell.");
    if (h.targets.length < 1 || h.targets.length > 8) p.push("A szókiemelés 1–8 célszót kér.");
    for (const t of h.targets) if (!words.has(norm(t))) p.push(`A célszó nem a szöveg egy szava: ${t}`);
  } else if (kind === "categorize") {
    const c = readCategorize(spec);
    if (c.categories.length < 2 || c.categories.length > 4 || new Set(c.categories).size !== c.categories.length) p.push("A kategorizálás 2–4 különböző kategóriát kér.");
    if (c.items.length < 3 || c.items.length > 12) p.push("A kategorizálás 3–12 elemet kér.");
    for (const it of c.items) if (!c.categories.includes(it.category)) p.push(`Ismeretlen kategória: ${it.category}`);
  } else if (kind === "numberLine") {
    const n = readNumberLine(spec);
    const s = (spec ?? {}) as Record<string, unknown>;
    if (num(s.min) === undefined || num(s.max) === undefined || n.min >= n.max) p.push("A számegyenesnek min < max kell.");
    if (!Number.isFinite(n.target) || n.target < n.min || n.target > n.max) p.push("A cél a számegyenesen belül legyen.");
    if (!(n.tolerance > 0) || n.tolerance > (n.max - n.min) / 4) p.push("A tűrés pozitív, és legfeljebb a tartomány negyede.");
    else if (p.length === 0 && !sliderHasFullScore(n.min, n.max, n.step, n.target, (v) => scoreNumberLine(spec, v).verdict === "teljes"))
      p.push("A csúszka lépésközével nem érhető el teljes pontot érő érték — a lépésköz legfeljebb a tűrés kétszerese legyen, és a cél essen rácspont közelébe.");
  } else if (kind === "flipCard") {
    const f = readFlipCard(spec);
    if (!f.front || !f.back) p.push("A fordítókártyának eleje és hátoldala is kell.");
  } else if (kind === "stepReveal") {
    // Review #619: a hiányos (üres / nem szöveges) lépés nem tűnhet el csendben — a nyers elemszám is egyezzen.
    const n = readStepReveal(spec).steps.length;
    if (n < 2 || n > 8 || n !== arr((spec as { steps?: unknown } | null)?.steps).length) p.push("A lépésenkénti felfedés 2–8 lépésből áll, mindegyik szöveggel.");
  } else if (kind === "didYouKnow") {
    if (!readDidYouKnow(spec).fact) p.push("A „Tudtad?” kártyának tény kell.");
  } else if (kind === "decision") {
    const d = readDecision(spec);
    if (!d.situation) p.push("A döntéshez helyzetleírás kell.");
    if (d.options.length < 2 || d.options.length > 4 || d.options.length !== arr((spec as { options?: unknown } | null)?.options).length) p.push("A döntés 2–4 lehetőséget kér, mindegyik szöveggel és következménnyel.");
    if (d.options.filter((o) => o.best).length !== 1) p.push("A döntésnek pontosan egy legjobb lehetősége van.");
  } else if (kind === "flashcards") {
    const n = readFlashcards(spec).cards.length;
    if (n < 2 || n > 12 || n !== arr((spec as { cards?: unknown } | null)?.cards).length) p.push("A villámkártya-csomag 2–12 kártyából áll, mindegyiknek eleje és hátoldala van.");
  } else if (kind === "estimate") {
    const e = readEstimate(spec);
    const s = (spec ?? {}) as Record<string, unknown>;
    if (num(s.min) === undefined || num(s.max) === undefined || e.min >= e.max) p.push("A becslésnek min < max kell.");
    if (!Number.isFinite(e.answer) || e.answer < e.min || e.answer > e.max) p.push("A helyes érték a csúszka tartományán belül legyen.");
    else if (p.length === 0 && !sliderHasFullScore(e.min, e.max, e.step, e.answer, (v) => scoreEstimate(spec, v).verdict === "teljes"))
      p.push("A csúszka lépésközével nem érhető el teljes pontot érő becslés (±5%) — kisebb lépésköz vagy más helyes érték kell.");
  }
  return p;
}
