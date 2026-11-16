/**
 * Párbaj-kérdéssor seedelt építése (végrehajtás JM-K `questions.ts`, JM1 3. lépés; terv 10.5 „Vegyes évfolyam”).
 *
 * Tiszta TS (J19 őr alatt): kliens (egyeszközös aréna) és szerver (online szoba, JM2) is hívja. A bank és a válaszablak
 * szabálya PARAMÉTER (U-JM1-1 felderítése, 2026-11-16: a szerver esbuild-bundle-je csak a `@shared` / `@assets` aliast
 * ismeri — `source/build-server.js` —, ezért a `shared/` nem importálhat a `client/src/`-ből): a hívó adja át a
 * `GRADE_QUIZ_ITEMS`-t (vagy annak szerkezeti megfelelőjét) és a J0b `windowMsFor` szabályát.
 *
 * Szabály:
 *  - mindenki a SAJÁT évfolyamából kap tételt, a közös `band` szerinti `tier`-ből (`tierForBand`: < 0,4 könnyű,
 *    < 0,7 közepes, különben nehéz); ha az a tier elfogyott, a szomszéd tierből, utána a szomszéd évfolyamból
 *    (`pickGradeQuiz` sorrendje, `client/src/game-engine/gradeQuiz.ts`);
 *  - a választás seedje `seedFrom("duel-q", seed, round, grade)`: azonos seed + kör + évfolyam + `used` → azonos tétel,
 *    így két azonos évfolyamú játékos ugyanazt a kérdést kapja (igazságos), eltérő évfolyamú a sajátját;
 *  - a meccsen belül nincs ismétlés: a hívó a visszaadott `key`-t a `used`-ba teszi (a függvény a `used`-ot nem módosítja);
 *  - az opció-sorrend a `shared/option-order.ts` seedelt keverőjével (a helyes index ehhez igazítva).
 */
import { createRng, seedFrom } from "../game-rng";
import { optionOrder } from "../option-order";

export type DuelQuestion = {
  /** A tétel azonosítója (a `used` halmaz kulcsa). */
  key: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  grade: number;
  /** A játékos saját válaszablaka ms-ban (a J0b `windowMsFor` szabálya, mindig ≤ 9000). */
  windowMs: number;
};

/** Az évfolyam-bank tételének szerkezeti alakja (a `client/src/data/gradeQuizBank` `GradeQuizItem`-je ennek megfelel). */
export type DuelBankItem = {
  id: string;
  grade: number;
  subject: string;
  tier: 1 | 2 | 3;
  prompt: string;
  options: readonly string[];
  correctIndex: number;
  explanation?: string;
};

export type DuelWindowRule = (prompt: string, grade: number) => number;

/**
 * Hossz-őr az osztott képernyőhöz (review #447): egy térfélnek 360×640-en ~260 px magasság jut. A mért leghosszabb
 * tételek (2026-11-16: évfolyam-bank prompt 122, opció 88, opciók együtt 234 karakter; szóbank cloze-prompt 164, opció 67)
 * a lap betűméret-illesztésével elférnek; az ennél hosszabb (jövőbeli) tételt a párbaj kihagyja. A jelenlegi bankból
 * így egy tétel sem esik ki (teszt), tehát a tantárgyak aránya nem torzul.
 */
export const DUEL_MAX_PROMPT_CHARS = 170;
export const DUEL_MAX_OPTION_CHARS = 90;
export const DUEL_MAX_OPTIONS_TOTAL_CHARS = 240;

export function fitsDuelScreen(q: { prompt: string; options: readonly string[] }): boolean {
  if (q.prompt.length > DUEL_MAX_PROMPT_CHARS) return false;
  let total = 0;
  for (const o of q.options) {
    if (o.length > DUEL_MAX_OPTION_CHARS) return false;
    total += o.length;
  }
  return total <= DUEL_MAX_OPTIONS_TOTAL_CHARS;
}

export const DUEL_MIN_BANK_GRADE = 3;
export const DUEL_MAX_BANK_GRADE = 12;

/** Sáv → tier az évfolyamon belül (ugyanaz a küszöb, mint a `gradeQuiz.ts` `tierForBand`-je). */
export function duelTierForBand(band: number): 1 | 2 | 3 {
  if (!Number.isFinite(band) || band < 0.4) return 1;
  return band < 0.7 ? 2 : 3;
}

function tierOrder(band: number): (1 | 2 | 3)[] {
  const tier = duelTierForBand(band);
  if (tier === 1) return [1, 2, 3];
  if (tier === 3) return [3, 2, 1];
  return band < 0.55 ? [2, 1, 3] : [2, 3, 1];
}

function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();
}

/** Kulcs a promptból (a `used` halmazban a tétel-azonosító mellett: két tétel azonos szöveggel sem ismétlődik). */
export function duelPromptKey(prompt: string): string {
  return `p:${normalizePrompt(prompt)}`;
}

/**
 * Egy tétel párbaj-kérdéssé alakítása: seedelt opció-sorrend (a helyes index követi), saját ablak. Hibás tételre
 * (kevesebb mint 2 opció, érvénytelen helyes index) `null`.
 */
export function toDuelQuestion(
  item: { key: string; prompt: string; options: readonly string[]; correctIndex: number; explanation?: string },
  args: { grade: number; orderSeed: string; windowMs: number },
): DuelQuestion | null {
  const n = item.options.length;
  if (n < 2 || !Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= n) return null;
  const order = optionOrder(args.orderSeed, n);
  const options = order.map((i) => item.options[i]!);
  const correctIndex = order.indexOf(item.correctIndex);
  const out: DuelQuestion = { key: item.key, prompt: item.prompt, options, correctIndex, grade: args.grade, windowMs: args.windowMs };
  if (item.explanation) out.explanation = item.explanation;
  return out;
}

export type BuildRoundQuestionArgs = {
  /** A meccs seedje (pl. `seedFrom("duel-arena", n)` vagy a szobakód). */
  seed: string;
  /** A kör sorszáma (1-től; a döntő körök is folytatják). */
  round: number;
  /** A játékos évfolyama (3..12). */
  grade: number;
  /** A közös nehézségi sáv [0, 1] — mindkét játékosnak ugyanaz. */
  band: number;
  /** Csak ezek a tárgyak; hiányzó / üres = mind. */
  subjects?: string[];
  /** A meccsen (és a visszavágókon) már feltett kulcsok: tétel-azonosító és `duelPromptKey`. Nem módosul. */
  used: Set<string>;
  /** A bank (a kliens `GRADE_QUIZ_ITEMS`-e; a szerver ugyanezt importálja). */
  items: readonly DuelBankItem[];
  /** A válaszablak szabálya (a J0b `windowMsFor(prompt, grade, DUEL_BASE_WINDOW_MS)`). */
  windowMs: DuelWindowRule;
};

/**
 * A kör kérdése egy játékosnak. `null`, ha az évfolyam a bankon kívül esik, vagy minden illeszkedő tétel elfogyott
 * (a hívó ilyenkor ürítheti a `used`-ot — visszavágósorozat végén —, és újrapróbálhat).
 */
export function buildRoundQuestion(args: BuildRoundQuestionArgs): DuelQuestion | null {
  const { seed, round, grade, band, used, items } = args;
  if (!Number.isInteger(grade) || grade < DUEL_MIN_BANK_GRADE || grade > DUEL_MAX_BANK_GRADE) return null;
  const subjects = args.subjects && args.subjects.length > 0 ? new Set(args.subjects) : null;
  const unseen = items.filter(
    (q) => (!subjects || subjects.has(q.subject)) && !used.has(q.id) && !used.has(duelPromptKey(q.prompt)) && fitsDuelScreen(q),
  );
  if (unseen.length === 0) return null;
  const rng = createRng(seedFrom("duel-q", seed, round, grade));
  for (const g of [grade, grade - 1, grade + 1]) {
    if (g < DUEL_MIN_BANK_GRADE || g > DUEL_MAX_BANK_GRADE) continue;
    const inGrade = unseen.filter((q) => q.grade === g);
    if (inGrade.length === 0) continue;
    for (const tier of tierOrder(band)) {
      const candidates = inGrade.filter((q) => q.tier === tier);
      if (candidates.length === 0) continue;
      const item = candidates[rng.int(candidates.length)]!;
      const windowMs = args.windowMs(item.prompt, grade);
      return toDuelQuestion(
        { key: item.id, prompt: item.prompt, options: item.options, correctIndex: item.correctIndex, explanation: item.explanation },
        { grade, orderSeed: seedFrom("duel-o", seed, round, item.id), windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 6000 },
      );
    }
  }
  return null;
}

/** A visszaadott kérdés megjelölése látottként (tétel-azonosító + prompt-kulcs). */
export function markDuelQuestionUsed(used: Set<string>, q: Pick<DuelQuestion, "key" | "prompt">): void {
  used.add(q.key);
  used.add(duelPromptKey(q.prompt));
}
