/**
 * Tornado Hunter 200 — the question engine.
 *
 * The brief puts a quiz at every scoring moment, and asks for it to fire
 * autonomously and at random while chasing. Two consequences shape this module:
 *
 *  1. Every draw goes through an injectable RNG (`makeRng`), so a test can pin
 *     "randomly" to an exact sequence instead of hoping.
 *  2. Questions coming from the child's own lesson material outrank the built-in
 *     bank — this is a WEBSULI game, the storm is the wrapper, the curriculum is
 *     the content.
 */

export type Subject = "math" | "english";
export type QuizMode = "math" | "english" | "mixed";
/** Menu selection: a fixed school grade, or AUTO (derived from the level). */
export type SchoolLevel = 1 | 2 | 3 | 4 | 5 | 6 | "auto";

export type Question = {
  id: string;
  subject: Subject;
  /** School grade, 1..6. */
  grade: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** 1..5 within the grade. */
  difficulty: number;
  source: "bank" | "material";
};

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) so quiz draws are reproducible in tests. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ===================== AUTO grade mapping (from the brief) ===================== */

export const AUTO_GRADE_TABLE: readonly { from: number; to: number; grades: number[] }[] = [
  { from: 1, to: 30, grades: [1, 2] },
  { from: 31, to: 70, grades: [2, 3] },
  { from: 71, to: 110, grades: [3, 4] },
  { from: 111, to: 150, grades: [4, 5] },
  { from: 151, to: 180, grades: [5] },
  { from: 181, to: 200, grades: [6] },
] as const;

export function autoGradesForLevel(level: number): number[] {
  const n = Math.max(1, Math.min(200, Math.round(level)));
  for (const row of AUTO_GRADE_TABLE) {
    if (n >= row.from && n <= row.to) return [...row.grades];
  }
  return [...AUTO_GRADE_TABLE[AUTO_GRADE_TABLE.length - 1]!.grades];
}

export function resolveGrades(school: SchoolLevel, level: number): number[] {
  return school === "auto" ? autoGradesForLevel(level) : [school];
}

/* ===================== Autonomous quiz timing ===================== */

/** No quiz may interrupt within this many seconds of the previous one. */
export const QUIZ_MIN_GAP_SEC = 18;
/** Past this gap the next scoring moment always raises one. */
export const QUIZ_MAX_GAP_SEC = 55;

/**
 * Should a free-roam quiz fire right now?
 *
 * Below the minimum gap: never (no question spam while the child is driving).
 * Above the maximum: always. In between the chance ramps linearly, evaluated
 * per call against the injected RNG.
 */
export function randomQuizDue(secondsSinceLastQuiz: number, rng: Rng = Math.random): boolean {
  if (!(secondsSinceLastQuiz > QUIZ_MIN_GAP_SEC)) return false;
  if (secondsSinceLastQuiz > QUIZ_MAX_GAP_SEC) return true;
  const t = (secondsSinceLastQuiz - QUIZ_MIN_GAP_SEC) / (QUIZ_MAX_GAP_SEC - QUIZ_MIN_GAP_SEC);
  return rng() < t;
}

/* ===================== Material-backed questions ===================== */

export type MaterialRow = {
  id?: string;
  prompt: string;
  options: unknown;
  correctIndex: number;
  topic?: string | null;
};

/**
 * Convert `/api/games/material-quizzes` rows into questions.
 *
 * Anything malformed is dropped rather than repaired: a four-option multiple
 * choice with a valid answer index is the contract, and a half-broken row would
 * surface as an unanswerable question in the child's face.
 */
export function materialToQuestions(rows: readonly MaterialRow[], grade: number): Question[] {
  const out: Question[] = [];
  rows.forEach((row, idx) => {
    const options = Array.isArray(row.options) ? row.options : null;
    if (!options || options.length !== 4) return;
    if (!options.every((o) => typeof o === "string" && o.length > 0)) return;
    if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) return;
    if (typeof row.prompt !== "string" || row.prompt.trim().length === 0) return;
    const topic = (row.topic ?? "").toLowerCase();
    out.push({
      id: row.id ?? `material-${idx}`,
      subject: topic.includes("english") || topic.includes("angol") ? "english" : "math",
      grade,
      prompt: row.prompt,
      options: options as string[],
      correctIndex: row.correctIndex,
      difficulty: 3,
      source: "material",
    });
  });
  return out;
}

/* ===================== Built-in bank ===================== */

type BankSeed = [prompt: string, options: [string, string, string, string], correctIndex: number, difficulty: number];

function bank(subject: Subject, grade: number, seeds: BankSeed[]): Question[] {
  return seeds.map((s, i) => ({
    id: `${subject}-${grade}-${i + 1}`,
    subject,
    grade,
    prompt: s[0],
    options: s[1],
    correctIndex: s[2],
    difficulty: s[3],
    source: "bank" as const,
  }));
}

const MATH_1: BankSeed[] = [
  ["Mennyi 4 + 3?", ["6", "7", "8", "9"], 1, 1],
  ["Mennyi 9 - 4?", ["3", "4", "5", "6"], 2, 1],
  ["Melyik szám nagyobb: 7 vagy 5?", ["5", "7", "egyenlők", "egyik sem"], 1, 1],
  ["Hány ujjad van két kézen?", ["8", "9", "10", "12"], 2, 1],
  ["Mennyi 10 - 6?", ["3", "4", "5", "6"], 1, 2],
  ["Mennyi 2 + 2 + 2?", ["4", "5", "6", "8"], 2, 2],
  ["Melyik páros szám?", ["3", "5", "8", "9"], 2, 2],
  ["Hány kereke van egy autónak?", ["2", "3", "4", "6"], 2, 1],
  ["Mennyi 8 + 1?", ["7", "8", "9", "10"], 2, 1],
  ["Melyik a legkisebb: 4, 2, 6?", ["2", "4", "6", "mind egyenlő"], 0, 1],
];

const MATH_2: BankSeed[] = [
  ["Mennyi 12 + 8?", ["18", "19", "20", "22"], 2, 2],
  ["Mennyi 25 - 9?", ["14", "15", "16", "17"], 2, 2],
  ["Mennyi 3 × 4?", ["7", "10", "12", "14"], 2, 2],
  ["Mennyi 20 ÷ 4?", ["4", "5", "6", "8"], 1, 3],
  ["Hány perc fél óra?", ["15", "20", "30", "45"], 2, 2],
  ["Mennyi 7 + 7?", ["12", "13", "14", "16"], 2, 1],
  ["Melyik páratlan szám?", ["10", "12", "15", "18"], 2, 2],
  ["Mennyi 50 - 20?", ["20", "25", "30", "35"], 2, 2],
  ["Egy dobozban 5 alma van. Hány alma van 3 dobozban?", ["8", "12", "15", "18"], 2, 3],
  ["Mennyi 6 × 2?", ["10", "12", "14", "16"], 1, 2],
];

const MATH_3: BankSeed[] = [
  ["Mennyi 7 × 8?", ["49", "54", "56", "64"], 2, 3],
  ["Mennyi 144 ÷ 12?", ["10", "11", "12", "13"], 2, 3],
  ["Mennyi 235 + 147?", ["372", "382", "392", "402"], 1, 3],
  ["Mennyi 100 - 47?", ["43", "53", "57", "63"], 1, 2],
  ["Hány másodperc 3 perc?", ["120", "150", "180", "240"], 2, 2],
  ["Mennyi 9 × 9?", ["72", "81", "89", "99"], 1, 2],
  ["4 polcon polconként 7 könyv áll. Hány könyv összesen?", ["21", "24", "28", "32"], 2, 3],
  ["Mennyi 56 ÷ 7?", ["6", "7", "8", "9"], 2, 2],
  ["Melyik szám osztható 5-tel?", ["23", "34", "45", "52"], 2, 3],
  ["Mennyi a 100 fele?", ["25", "40", "50", "75"], 2, 1],
];

const MATH_4: BankSeed[] = [
  ["Mennyi 432 ÷ 8?", ["52", "53", "54", "55"], 2, 3],
  ["Mennyi 12 × 16?", ["182", "192", "202", "212"], 1, 3],
  ["Egy iskolában 720 tanuló van, 268 alsós. Hány felsős?", ["442", "452", "462", "472"], 1, 3],
  ["Mennyi 1860 + 975?", ["2815", "2825", "2835", "2845"], 2, 4],
  ["Hány méter 3 kilométer?", ["300", "1000", "3000", "30000"], 2, 2],
  ["Mennyi 640 - 275?", ["355", "365", "375", "385"], 1, 3],
  ["4500 Ft-ból veszel 1750 Ft-os játékot. Mennyi marad?", ["2550", "2650", "2750", "2850"], 2, 3],
  ["Mennyi 9 × 14?", ["116", "126", "136", "146"], 1, 3],
  ["Hány perc 2,5 óra?", ["120", "140", "150", "165"], 2, 3],
  ["Melyik a legnagyobb: 0,7 vagy 0,65 vagy 0,8?", ["0,7", "0,65", "0,8", "egyenlők"], 2, 4],
];

const MATH_5: BankSeed[] = [
  ["Egy táborban 36 gyerek van, 3/4-e kirándul. Hányan?", ["24", "26", "27", "28"], 2, 4],
  ["Mennyi 2,5 km - 0,8 km?", ["1,5 km", "1,6 km", "1,7 km", "1,8 km"], 2, 4],
  ["Mennyi 24 × 18 - 12?", ["408", "418", "420", "432"], 2, 4],
  ["Hány cm² egy 6 cm × 7 cm-es téglalap területe?", ["36", "40", "42", "48"], 2, 3],
  ["Mennyi 5600 - (2380 + 1740)?", ["1380", "1480", "1580", "1680"], 1, 4],
  ["Mennyi az 1/2 + 1/4?", ["1/6", "2/6", "3/4", "1/8"], 2, 4],
  ["Hány fokos a derékszög?", ["45°", "60°", "90°", "180°"], 2, 2],
  ["Mennyi 0,25 százalékos alakban?", ["2,5%", "25%", "0,25%", "250%"], 1, 4],
  ["Egy négyzet oldala 9 cm. Mennyi a kerülete?", ["27 cm", "36 cm", "45 cm", "81 cm"], 1, 3],
  ["Mennyi 720 ÷ 15?", ["42", "46", "48", "52"], 2, 4],
];

const MATH_6: BankSeed[] = [
  ["Mennyi a 3/5 tizedes tört alakja?", ["0,35", "0,6", "0,53", "0,65"], 1, 4],
  ["Egy kör sugara 5 cm. Mennyi a kerülete? (π ≈ 3,14)", ["15,7 cm", "31,4 cm", "78,5 cm", "10 cm"], 1, 5],
  ["Mennyi (-7) + 12?", ["-19", "-5", "5", "19"], 2, 4],
  ["Egy áru 4000 Ft, 15% kedvezmény. Mennyi a kedvezmény?", ["400 Ft", "500 Ft", "600 Ft", "750 Ft"], 2, 5],
  ["Mennyi a háromszög belső szögeinek összege?", ["90°", "180°", "270°", "360°"], 1, 3],
  ["Mennyi 2³ (2 a köbön)?", ["6", "8", "9", "12"], 1, 4],
  ["Mennyi az 5 : 2 arány 35-re alkalmazva? (nagyobb rész)", ["10", "15", "20", "25"], 3, 5],
  ["Egy téglatest élei 2, 3 és 4 cm. Mennyi a térfogata?", ["9 cm³", "18 cm³", "24 cm³", "36 cm³"], 2, 4],
  ["Mennyi (-4) × (-6)?", ["-24", "-10", "10", "24"], 3, 4],
  ["Mennyi a legkisebb közös többszöröse 6-nak és 8-nak?", ["12", "16", "24", "48"], 2, 5],
];

const ENG_1: BankSeed[] = [
  ["Cat magyarul:", ["kutya", "macska", "madár", "hal"], 1, 1],
  ["Dog magyarul:", ["macska", "ló", "kutya", "egér"], 2, 1],
  ["Red magyarul:", ["kék", "zöld", "piros", "sárga"], 2, 1],
  ["Melyik szám az 'three'?", ["2", "3", "4", "5"], 1, 1],
  ["House magyarul:", ["ház", "kert", "autó", "hajó"], 0, 1],
  ["Sun magyarul:", ["hold", "csillag", "nap", "felhő"], 2, 1],
  ["Book magyarul:", ["toll", "könyv", "füzet", "táska"], 1, 1],
  ["Water magyarul:", ["tűz", "víz", "föld", "levegő"], 1, 1],
  ["Milyen szín a 'blue'?", ["piros", "kék", "zöld", "fekete"], 1, 1],
  ["Big ellentéte:", ["small", "tall", "long", "fast"], 0, 2],
];

const ENG_2: BankSeed[] = [
  ["Storm magyarul:", ["eső", "vihar", "szél", "hó"], 1, 2],
  ["Wind magyarul:", ["szél", "felhő", "villám", "eső"], 0, 2],
  ["Melyik a helyes: I ___ a student.", ["is", "am", "are", "be"], 1, 2],
  ["Rain magyarul:", ["hó", "eső", "jég", "köd"], 1, 1],
  ["Car magyarul:", ["bicikli", "autó", "vonat", "busz"], 1, 1],
  ["Fast ellentéte:", ["slow", "big", "old", "hot"], 0, 2],
  ["Melyik többes szám: one box → two ___", ["boxs", "boxes", "boxen", "box"], 1, 3],
  ["Hot magyarul:", ["hideg", "meleg", "nedves", "száraz"], 1, 1],
  ["Melyik napszak a 'morning'?", ["reggel", "dél", "este", "éjjel"], 0, 2],
  ["Friend magyarul:", ["testvér", "barát", "szomszéd", "tanár"], 1, 2],
];

const ENG_3: BankSeed[] = [
  ["Cloud magyarul:", ["felhő", "villám", "szivárvány", "égbolt"], 0, 2],
  ["Melyik a helyes: She ___ to school every day.", ["go", "goes", "going", "gone"], 1, 3],
  ["Lightning magyarul:", ["mennydörgés", "villámlás", "zápor", "szélvihar"], 1, 3],
  ["Dangerous magyarul:", ["biztonságos", "veszélyes", "gyors", "csendes"], 1, 3],
  ["Melyik a múlt idő: play → ___", ["playd", "played", "plaied", "playing"], 1, 3],
  ["Truck magyarul:", ["teherautó", "traktor", "motor", "hajó"], 0, 2],
  ["Melyik a helyes kérdés?", ["You are ready?", "Are you ready?", "Ready you are?", "Is you ready?"], 1, 3],
  ["Field magyarul:", ["erdő", "mező", "hegy", "tó"], 1, 2],
  ["Bridge magyarul:", ["híd", "út", "alagút", "torony"], 0, 2],
  ["Heavy ellentéte:", ["light", "hard", "strong", "deep"], 0, 3],
];

const ENG_4: BankSeed[] = [
  ["Speed magyarul:", ["súly", "sebesség", "magasság", "hossz"], 1, 3],
  ["Melyik a helyes: There ___ many clouds in the sky.", ["is", "are", "be", "was"], 1, 3],
  ["Shelter magyarul:", ["menedék", "kirándulás", "határ", "kapu"], 0, 4],
  ["Melyik a helyes folyamatos alak: He is ___ the storm.", ["chase", "chasing", "chased", "chases"], 1, 3],
  ["Warning magyarul:", ["jutalom", "figyelmeztetés", "bejelentés", "kérdés"], 1, 3],
  ["Melyik a helyes: I have ___ apple.", ["a", "an", "the", "some"], 1, 3],
  ["Damage magyarul:", ["kár", "javítás", "épület", "eszköz"], 0, 4],
  ["Measure magyarul:", ["mérni", "számolni", "írni", "olvasni"], 0, 3],
  ["Melyik a helyes összehasonlítás: fast → ___", ["faster", "more fast", "fastest", "fasted"], 0, 3],
  ["Safe magyarul:", ["gyors", "biztonságos", "erős", "nehéz"], 1, 2],
];

const ENG_5: BankSeed[] = [
  ["Forecast magyarul:", ["előrejelzés", "visszatekintés", "beszámoló", "kísérlet"], 0, 4],
  ["Melyik a helyes múlt idő: catch → ___", ["catched", "caught", "catchen", "cought"], 1, 4],
  ["Equipment magyarul:", ["felszerelés", "épület", "utazás", "üzenet"], 0, 4],
  ["Melyik a helyes: If it ___, we will stop.", ["rain", "rains", "rained", "raining"], 1, 4],
  ["Shelter in place jelentése:", ["maradj a helyeden fedezékben", "költözz el", "indulj útnak", "keress segítséget"], 0, 5],
  ["Melyik a helyes szenvedő szerkezet: The road ___ blocked.", ["is", "does", "has", "have"], 0, 4],
  ["Rotate magyarul:", ["forogni", "esni", "olvadni", "égni"], 0, 4],
  ["Melyik a legerősebb: strong, stronger, strongest", ["strong", "stronger", "strongest", "mind egyforma"], 2, 3],
  ["Evacuate magyarul:", ["kiüríteni", "megtölteni", "lezárni", "kinyitni"], 0, 5],
  ["Melyik a helyes: I have ___ seen a tornado.", ["never", "not never", "no", "nothing"], 0, 4],
];

const ENG_6: BankSeed[] = [
  ["Melyik a helyes present perfect: She ___ the storm twice.", ["saw", "has seen", "seeing", "seen"], 1, 5],
  ["Severe magyarul:", ["enyhe", "súlyos", "rövid", "ritka"], 1, 4],
  ["Melyik a helyes feltételes mondat?", ["If I would be there, I helped.", "If I were there, I would help.", "If I am there, I helped.", "If I be there, I help."], 1, 5],
  ["Debris magyarul:", ["törmelék", "por", "jég", "hab"], 0, 5],
  ["Melyik a helyes: The vehicle ___ by the wind.", ["was moved", "was move", "were moving", "is move"], 0, 5],
  ["Anchor (ige) magyarul:", ["lehorgonyozni", "elindulni", "megfordulni", "felgyorsítani"], 0, 4],
  ["Melyik szó melléknév?", ["quickly", "quick", "quickness", "quicken"], 1, 4],
  ["Approach magyarul:", ["megközelíteni", "elkerülni", "elhagyni", "megállni"], 0, 4],
  ["Melyik a helyes: He said he ___ tired.", ["is", "was", "be", "are"], 1, 5],
  ["Intensity magyarul:", ["intenzitás", "irány", "időtartam", "távolság"], 0, 4],
];

export const QUESTION_BANK: readonly Question[] = Object.freeze([
  ...bank("math", 1, MATH_1),
  ...bank("math", 2, MATH_2),
  ...bank("math", 3, MATH_3),
  ...bank("math", 4, MATH_4),
  ...bank("math", 5, MATH_5),
  ...bank("math", 6, MATH_6),
  ...bank("english", 1, ENG_1),
  ...bank("english", 2, ENG_2),
  ...bank("english", 3, ENG_3),
  ...bank("english", 4, ENG_4),
  ...bank("english", 5, ENG_5),
  ...bank("english", 6, ENG_6),
]);

/* ===================== Drawing ===================== */

export type PickArgs = {
  level: number;
  school: SchoolLevel;
  mode: QuizMode;
  /** Questions harvested from the child's own lesson material — preferred. */
  material?: readonly Question[];
  /** Ids asked recently; avoided while alternatives exist. */
  recent?: readonly string[];
  rng?: Rng;
};

function subjectFor(mode: QuizMode, rng: Rng): Subject {
  if (mode === "math") return "math";
  if (mode === "english") return "english";
  return rng() < 0.5 ? "math" : "english";
}

/**
 * Draw the next question.
 *
 * Order of preference: unseen material question → any material question →
 * unseen bank question → any bank question. Material rows carry no reliable
 * grade of their own, so the grade filter only applies to the built-in bank.
 */
export function pickQuestion(args: PickArgs): Question {
  const rng = args.rng ?? Math.random;
  const subject = subjectFor(args.mode, rng);
  const grades = new Set(resolveGrades(args.school, args.level));
  const recent = new Set(args.recent ?? []);

  const material = (args.material ?? []).filter((q) => args.mode === "mixed" || q.subject === subject);
  const bankPool = QUESTION_BANK.filter((q) => q.subject === subject && grades.has(q.grade));

  const tiers = [
    material.filter((q) => !recent.has(q.id)),
    material,
    bankPool.filter((q) => !recent.has(q.id)),
    bankPool,
    // Last resort: the whole bank, ignoring grade — never leave the player
    // without a question at a scoring moment.
    QUESTION_BANK.filter((q) => q.subject === subject),
    QUESTION_BANK,
  ];

  for (const tier of tiers) {
    if (tier.length > 0) return tier[Math.floor(rng() * tier.length) % tier.length]!;
  }
  return QUESTION_BANK[0]!;
}

/** Shuffle the option order deterministically, keeping the correct index in sync. */
export function shuffleOptions(q: Question, rng: Rng = Math.random): Question {
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return {
    ...q,
    options: idx.map((i) => q.options[i]!),
    correctIndex: idx.indexOf(q.correctIndex),
  };
}

export const SUBJECT_LABEL: Record<Subject, string> = {
  math: "Matek",
  english: "Angol",
};

export const QUIZ_MODE_LABEL: Record<QuizMode, string> = {
  math: "Math",
  english: "English",
  mixed: "Mixed",
};

export function schoolLevelLabel(school: SchoolLevel): string {
  return school === "auto" ? "AUTO" : `${school}. osztály`;
}
