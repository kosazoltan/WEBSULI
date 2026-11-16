/**
 * G-1 — tanulási visszacsatolás a játékokhoz.
 *
 * Measured on 2026-09-07: none of the seven games told a child why an answer was
 * wrong. Each one punished (a life, the rising water, the clock, XP) and moved on.
 * That is the one thing a teaching product must not do — the wrong idea survives
 * the punishment, and the child pays for it again on the test.
 *
 * The lesson runtime has had per-option feedback since LS-2 (`feedbackPerOption` in
 * `shared/lesson-schema.ts`, where the schema refuses a check block whose feedback
 * count does not match its options). This module brings the same guarantee to the
 * games, without requiring every quiz bank to be rewritten first: when the bank
 * carries an explanation it is used, and when it does not, the fallback still builds
 * a true sentence from what the question itself contains.
 *
 * Pure and deterministic on purpose. A child who retries a question must hear the
 * same explanation, not a new phrasing that reads like a different fact.
 */

/** Ahogy a lecke-séma is bontja a korosztályokat (`shared/lesson-schema.ts`). */
export type FeedbackAgeBand = "kid" | "teen" | "senior";

export type AnswerOutcome = "correct" | "wrong" | "timeout";

/**
 * A játékok kvíz-alakjainak közös metszete.
 *
 * A hét játék hat különböző kvíz-típust használ (`FourChoiceQuiz`, saját `Quiz`
 * aliasok, DB-bank DTO). Mind tartalmazza ezt a négy mezőt, ezért a motor ehhez
 * igazodik, és nem kényszerít séma-migrációt egyik játékra sem.
 */
export type QuizLike = {
  prompt: string;
  options: string[];
  correctIndex: number;
  /** A bank magyarázata, ha van. Opcionális: a régi bankok érvényesek maradnak. */
  explanation?: string;
};

export type FeedbackInput = {
  quiz: QuizLike;
  /** A gyerek választása; `null`, ha lejárt az idő. */
  chosenIndex: number | null;
  /** Hányadik próbálkozás ezen a kérdésen (0 = első). */
  attempt: number;
  ageBand?: FeedbackAgeBand;
  /**
   * Életek a hiba UTÁN. 0-nál nincs újrapróba: a magyarázat olvasható,
   * de új pontot élet nélkül nem lehet szerezni. Ha nincs megadva, a
   * játék nem élet-alapú, és a régi attempt-szabály marad.
   */
  remainingLives?: number;
};

export type FeedbackCard = {
  outcome: AnswerOutcome;
  /** Rövid megszólítás — ez igazodik a korosztályhoz. */
  headline: string;
  /** A MIÉRT. Rossz válasznál és lejárt időnél soha nem üres. */
  why: string;
  correctAnswer: string;
  /** Kap-e még egy esélyt ezen a kérdésen (mastery learning, egyszer). */
  retryable: boolean;
};

const HEADLINES: Record<FeedbackAgeBand, Record<AnswerOutcome, string>> = {
  kid: {
    correct: "Szuper! Eltaláltad! 🎉",
    wrong: "Semmi baj — nézzük meg együtt!",
    timeout: "Elszaladt az idő! Nézzük meg együtt!",
  },
  teen: {
    correct: "Megvan! Pontos válasz.",
    wrong: "Ez most nem jött össze — itt a megoldás.",
    timeout: "Lejárt az idő — itt a megoldás.",
  },
  senior: {
    correct: "Helyes.",
    wrong: "Nem ez a helyes válasz.",
    timeout: "Lejárt az idő.",
  },
};

/** Mondatvégi írásjel pótlása, hogy a kártyán ne csonkán álljon a szöveg. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return trimmed;
  return /[.!?][”"'»)]*$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Dicsérő / megerősítő nyitószó, amely rossz válasz mellett félrevezető volna („Helyes! …”, „Igen, …”, „Pontos. …”). */
const AFFIRMATION_PREFIX =
  /^(?:helyes|igen|így van|jól van|pontos|szuper|ügyes|kiváló|nagyszerű|remek|tökéletes|nagyon jó|jó válasz|bizony|persze)s*[!.:,;–—-]+s*/iu;

/**
 * A magyarázat elejéről levágja az affirmációs nyitószót. `null`: nem volt ilyen előtag (a szöveg változatlan marad);
 * üres szöveg: a magyarázat csak ennyiből állt. A maradék első betűje nagybetűs.
 */
export function stripAffirmationPrefix(text: string): string | null {
  const m = AFFIRMATION_PREFIX.exec(text);
  if (!m) return null;
  const rest = text.slice(m[0].length).trim();
  return rest.length > 0 ? rest.charAt(0).toLocaleUpperCase("hu-HU") + rest.slice(1) : "";
}

function optionAt(options: string[], index: number | null): string | null {
  if (index === null) return null;
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return null;
  return options[index] ?? null;
}

/**
 * Tartalék magyarázat, ha a bank nem hozott sajátot.
 *
 * Két dolgot mond ki, mert a tanulás ezen a kettőn múlik: mi a helyes válasz, és
 * mit választott helyette a gyerek. Sorszámra sosem hivatkozik — a játékok a
 * válaszokat kevert sorrendben rajzolják ki, ott a "2. válasz" értelmetlen.
 */
function fallbackWhy(correctAnswer: string | null, chosenAnswer: string | null): string {
  if (correctAnswer === null) {
    // Romlott bank (a correctIndex a lehetőségeken kívülre mutat). A gyereknek
    // ilyenkor sem maradhat néma a kártya.
    return "Ezt a kérdést most nem tudjuk kiértékelni — lépj tovább, nem számít bele.";
  }
  if (chosenAnswer === null || chosenAnswer === correctAnswer) {
    return `A helyes válasz: ${correctAnswer}.`;
  }
  return `A helyes válasz: ${correctAnswer} — a(z) „${chosenAnswer}” helyett.`;
}

export function buildFeedback(input: FeedbackInput): FeedbackCard {
  const { quiz, chosenIndex, attempt } = input;
  const ageBand: FeedbackAgeBand = input.ageBand ?? "teen";

  const correctAnswer = optionAt(quiz.options, quiz.correctIndex);
  const chosenAnswer = optionAt(quiz.options, chosenIndex);

  const outcome: AnswerOutcome =
    chosenIndex === null
      ? "timeout"
      : correctAnswer !== null && chosenIndex === quiz.correctIndex
        ? "correct"
        : "wrong";

  const rawExplanation = quiz.explanation?.trim() ?? "";
  // E24 (éles próba): a generált magyarázat sokszor dicsérettel kezdődik („Helyes! A helyesírás…”) — rossz
  // válasznál vagy lejárt időnél ez ellentmond a kártya címének. Ilyenkor az előtagot levágjuk, és a helyes választ
  // mondjuk ki helyette; a helyes választ és a változatlan magyarázatokat ez nem érinti.
  const stripped = outcome === "correct" ? null : stripAffirmationPrefix(rawExplanation);
  const bankExplanation =
    stripped === null
      ? rawExplanation
      : stripped.length > 0 && correctAnswer !== null
        ? `A helyes válasz: ${correctAnswer}. ${stripped}`
        : "";

  const why =
    outcome === "correct"
      ? bankExplanation.length > 0
        ? asSentence(bankExplanation)
        : correctAnswer !== null
          ? `Így van: ${correctAnswer}.`
          : ""
      : bankExplanation.length > 0
        ? asSentence(bankExplanation)
        : fallbackWhy(correctAnswer, chosenAnswer);

  return {
    outcome,
    headline: HEADLINES[ageBand][outcome],
    why,
    correctAnswer: correctAnswer ?? "",
    // Egyetlen javítási esély az első hiba után: a gyerek ne bukott kérdéssel
    // lépjen tovább, de a végtelen próbálkozás már nem tanulás, hanem találgatás.
    retryable:
      outcome !== "correct" &&
      attempt === 0 &&
      (input.remainingLives === undefined || input.remainingLives > 0),
  };
}
