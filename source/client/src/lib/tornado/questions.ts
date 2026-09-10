import { isPlayableQuestion } from "../../../../shared/game-quiz-contract";
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
  explanation?: string | null;
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

/** At most one evaluation per second so a 60 fps loop cannot spam quizzes. */
export const QUIZ_EVAL_INTERVAL_SEC = 1;

export type RoamQuizInput = {
  elapsed: number;
  lastQuizAt: number;
  lastEvalAt: number;
  alreadyPending: boolean;
  rng: Rng;
};

export type RoamQuizResult = {
  fire: boolean;
  lastEvalAt: number;
};

/**
 * Frame-safe wrapper around `randomQuizDue`.
 *
 * The rAF loop used to call `randomQuizDue` 60×/s; after the 18 s gap the
 * per-call chance compounded into an immediate quiz. This helper evaluates
 * at most once per `QUIZ_EVAL_INTERVAL_SEC`, never while a quiz is already
 * on screen, and otherwise delegates to `randomQuizDue`.
 */
export function shouldFireRoamQuiz(input: RoamQuizInput): RoamQuizResult {
  if (input.alreadyPending) return { fire: false, lastEvalAt: input.lastEvalAt };
  if (input.elapsed - input.lastEvalAt < QUIZ_EVAL_INTERVAL_SEC) {
    return { fire: false, lastEvalAt: input.lastEvalAt };
  }
  const fire = randomQuizDue(input.elapsed - input.lastQuizAt, input.rng);
  return { fire, lastEvalAt: input.elapsed };
}

/* ===================== Material-backed questions ===================== */

export type MaterialRow = {
  id?: string;
  prompt: string;
  options: unknown;
  correctIndex: number;
  explanation?: string | null;
  topic?: string | null;
};

/**
 * Convert `/api/games/material-quizzes` rows into questions.
 *
 * Anything malformed is dropped rather than repaired: a three- or four-option multiple
 * choice with a valid answer index is the contract, and a half-broken row would
 * surface as an unanswerable question in the child's face.
 */
export function materialToQuestions(rows: readonly MaterialRow[], grade: number): Question[] {
  const out: Question[] = [];
  rows.forEach((row, idx) => {
    if (!isPlayableQuestion(row)) return;
    const options = row.options;
    const topic = (row.topic ?? "").toLowerCase();
    out.push({
      id: row.id ?? `material-${idx}`,
      subject: topic.includes("english") || topic.includes("angol") ? "english" : "math",
      grade,
      prompt: row.prompt,
      options: options as string[],
      correctIndex: row.correctIndex,
      explanation: row.explanation,
      difficulty: 3,
      source: "material",
    });
  });
  return out;
}

/* ===================== Built-in bank ===================== */

type BankSeed = [prompt: string, options: [string, string, string, string], correctIndex: number, difficulty: number, explanation: string];

function bank(subject: Subject, grade: number, seeds: BankSeed[]): Question[] {
  return seeds.map((s, i) => ({
    id: `${subject}-${grade}-${i + 1}`,
    subject,
    grade,
    prompt: s[0],
    options: s[1],
    correctIndex: s[2],
    difficulty: s[3],
    explanation: s[4],
    source: "bank" as const,
  }));
}

const MATH_1: BankSeed[] = [
  ["Mennyi 4 + 3?", ["6", "7", "8", "9"], 1, 1, "4 + 3 = 7, mert négyhez még három egységet adva hét egységet kapunk. Például 4 alma és 3 alma együtt 7 alma."],
  ["Mennyi 9 - 4?", ["3", "4", "5", "6"], 2, 1, "9 - 4 = 5, mert kilencből négyet elvéve öt marad. Az ellenőrzés: 5 + 4 = 9."],
  ["Melyik szám nagyobb: 7 vagy 5?", ["5", "7", "egyenlők", "egyik sem"], 1, 1, "A 7 nagyobb az 5-nél, mert a számegyenesen a 7 az 5-től jobbra helyezkedik el. A jobbra lévő szám mindig nagyobb."],
  ["Hány ujjad van két kézen?", ["8", "9", "10", "12"], 2, 1, "Két kézen általában 10 ujj van: mindkét kézen 5-5. Ezért 5 + 5 = 10."],
  ["Mennyi 10 - 6?", ["3", "4", "5", "6"], 1, 2, "10 - 6 = 4, mert tízből hatot elvéve négy marad. Ellenőrzésként 6 + 4 ismét 10."],
  ["Mennyi 2 + 2 + 2?", ["4", "5", "6", "8"], 2, 2, "2 + 2 + 2 = 6, mert három darab kettes összege hat. Ez szorzással is felírható: 3 × 2 = 6."],
  ["Melyik páros szám?", ["3", "5", "8", "9"], 2, 2, "A 8 páros szám, mert maradék nélkül elosztható 2-vel: 8 ÷ 2 = 4. A páros számok egyenlő párokba rendezhetők."],
  ["Hány kereke van egy autónak?", ["2", "3", "4", "6"], 2, 1, "Egy személyautónak általában 4 kereke van: kettő elöl és kettő hátul. A kerekek segítik a jármű gurulását."],
  ["Mennyi 8 + 1?", ["7", "8", "9", "10"], 2, 1, "8 + 1 = 9, mert nyolc után a következő szám a kilenc. Egy egység hozzáadása mindig a következő egész számot adja."],
  ["Melyik a legkisebb: 4, 2, 6?", ["2", "4", "6", "mind egyenlő"], 0, 1, "A 2 a legkisebb szám, mert a számegyenesen balrább van a 4-nél és a 6-nál. Minél balrább áll egy szám, annál kisebb."],
];

const MATH_2: BankSeed[] = [
  ["Mennyi 12 + 8?", ["18", "19", "20", "22"], 2, 2, "12 + 8 = 20: a 12 két egyeséhez nyolc egyest adunk, így újabb tízest kapunk; 10 + 10 = 20."],
  ["Mennyi 25 - 9?", ["14", "15", "16", "17"], 2, 2, "25 - 9 = 16, mert 25 - 10 = 15 lenne, de egyet vissza kell adni: 15 + 1 = 16."],
  ["Mennyi 3 × 4?", ["7", "10", "12", "14"], 2, 2, "3 × 4 = 12, mert háromszor veszünk négyet: 4 + 4 + 4 = 12. A szorzás az ismételt összeadás rövidebb alakja."],
  ["Mennyi 20 ÷ 4?", ["4", "5", "6", "8"], 1, 3, "20 ÷ 4 = 5, mert húszat öt egyenlő, négyes csoportba oszthatunk. Ellenőrzés: 5 × 4 = 20."],
  ["Hány perc fél óra?", ["15", "20", "30", "45"], 2, 2, "Fél óra 30 perc, mert egy teljes óra 60 perc. Ennek a fele: 60 ÷ 2 = 30."],
  ["Mennyi 7 + 7?", ["12", "13", "14", "16"], 2, 1, "7 + 7 = 14, mert két darab hetes összege tizennégy. Szorzással is: 2 × 7 = 14."],
  ["Melyik páratlan szám?", ["10", "12", "15", "18"], 2, 2, "A 15 páratlan szám, mert 2-vel osztva maradéka 1. A páratlan számokat nem lehet teljesen két egyenlő csoportba osztani."],
  ["Mennyi 50 - 20?", ["20", "25", "30", "35"], 2, 2, "50 - 20 = 30, mert öt tízesből két tízest veszünk el, így három tízes marad. Három tízes értéke 30."],
  ["Egy dobozban 5 alma van. Hány alma van 3 dobozban?", ["8", "12", "15", "18"], 2, 3, "Három dobozban 3 × 5 alma van, mert mindegyik dobozban 5 alma található. 3 × 5 = 15."],
  ["Mennyi 6 × 2?", ["10", "12", "14", "16"], 1, 2, "6 × 2 = 12, mert a 6-ot kétszer összeadva 6 + 6 = 12."],
];

const MATH_3: BankSeed[] = [
  ["Mennyi 7 × 8?", ["49", "54", "56", "64"], 2, 3, "7 × 8 = 56: nyolc darab 7 összege 56, vagyis 7 + 7 + 7 + 7 + 7 + 7 + 7 + 7."],
  ["Mennyi 144 ÷ 12?", ["10", "11", "12", "13"], 2, 3, "144 ÷ 12 = 12, mert 12 × 12 = 144. Osztáskor azt keressük, hányszor van meg a 12 a 144-ben."],
  ["Mennyi 235 + 147?", ["372", "382", "392", "402"], 1, 3, "235 + 147 = 382. Egyesek: 5 + 7 = 12, marad 2 és átviszünk 1 tízest."],
  ["Mennyi 100 - 47?", ["43", "53", "57", "63"], 1, 2, "100 - 47 = 53. Előbb 100 - 40 = 60, majd 60 - 7 = 53."],
  ["Hány másodperc 3 perc?", ["120", "150", "180", "240"], 2, 2, "3 perc = 3 × 60 másodperc = 180 másodperc, mert egy perc 60 másodpercből áll."],
  ["Mennyi 9 × 9?", ["72", "81", "89", "99"], 1, 2, "9 × 9 = 81. Számolhatunk tízszer kilencből egy kilencest elvéve: 90 − 9 = 81."],
  ["4 polcon polconként 7 könyv áll. Hány könyv összesen?", ["21", "24", "28", "32"], 2, 3, "4 polcon egyenként 7 könyv van, ezért 4 × 7 = 28 könyv. Az egyenlő csoportok összegét szorzással számoljuk."],
  ["Mennyi 56 ÷ 7?", ["6", "7", "8", "9"], 2, 2, "56 ÷ 7 = 8, mert 7 × 8 = 56. Az osztás a szorzás fordított művelete."],
  ["Melyik szám osztható 5-tel?", ["23", "34", "45", "52"], 2, 3, "A 45 osztható 5-tel, mert az 5-tel osztható számok utolsó számjegye 0 vagy 5."],
  ["Mennyi a 100 fele?", ["25", "40", "50", "75"], 2, 1, "A 100 fele 50, mert a felezés osztás 2-vel: 100 ÷ 2 = 50."],
];

const MATH_4: BankSeed[] = [
  ["Mennyi 432 ÷ 8?", ["52", "53", "54", "55"], 2, 3, "432 ÷ 8 = 54, mert 8 × 54 = 432. Ellenőrzésként 8 × 50 = 400 és 8 × 4 = 32."],
  ["Mennyi 12 × 16?", ["182", "192", "202", "212"], 1, 3, "12 × 16 = 192, mert 16 × 10 = 160 és 16 × 2 = 32; 160 + 32 = 192."],
  ["Egy iskolában 720 tanuló van, 268 alsós. Hány felsős?", ["442", "452", "462", "472"], 1, 3, "A felsősök száma 720 - 268 = 452. Az összes tanulóból kivonjuk az alsósok számát."],
  ["Mennyi 1860 + 975?", ["2815", "2825", "2835", "2845"], 2, 4, "1860 + 975 = 2835. Számolhatjuk így: 1860 + 900 = 2760, majd +75 = 2835."],
  ["Hány méter 3 kilométer?", ["300", "1000", "3000", "30000"], 2, 2, "3 kilométer = 3 × 1000 méter = 3000 méter, mert 1 km pontosan 1000 m."],
  ["Mennyi 640 - 275?", ["355", "365", "375", "385"], 1, 3, "640 - 275 = 365. Például 640 - 200 = 440, majd 440 - 75 = 365."],
  ["4500 Ft-ból veszel 1750 Ft-os játékot. Mennyi marad?", ["2550", "2650", "2750", "2850"], 2, 3, "4500 - 1750 = 2750 Ft marad. A maradékot a teljes összegből a kiadás kivonásával kapjuk."],
  ["Mennyi 9 × 14?", ["116", "126", "136", "146"], 1, 3, "9 × 14 = 126, mert 9 × 10 = 90 és 9 × 4 = 36; 90 + 36 = 126."],
  ["Hány perc 2,5 óra?", ["120", "140", "150", "165"], 2, 3, "2,5 óra = 2 óra 30 perc, tehát 120 + 30 = 150 perc. Fél óra 30 perc."],
  ["Melyik a legnagyobb: 0,7 vagy 0,65 vagy 0,8?", ["0,7", "0,65", "0,8", "egyenlők"], 2, 4, "A 0,8 a legnagyobb, mert 0,80-ként írva nagyobb, mint 0,70 és 0,65."],
];

const MATH_5: BankSeed[] = [
  ["Egy táborban 36 gyerek van, 3/4-e kirándul. Hányan?", ["24", "26", "27", "28"], 2, 4, "36 háromnegyede: 36 ÷ 4 = 9, majd 9 × 3 = 27. A tört számlálója jelzi, hány részt veszünk."],
  ["Mennyi 2,5 km - 0,8 km?", ["1,5 km", "1,6 km", "1,7 km", "1,8 km"], 2, 4, "2,5 km - 0,8 km = 1,7 km. Tizedekre bontva: 25 tized km - 8 tized km = 17 tized km."],
  ["Mennyi 24 × 18 - 12?", ["408", "418", "420", "432"], 2, 4, "Először szorzunk: 24 × 18 = 432, majd kivonunk 12-t: 432 - 12 = 420. A szorzás megelőzi a kivonást."],
  ["Hány cm² egy 6 cm × 7 cm-es téglalap területe?", ["36", "40", "42", "48"], 2, 3, "A téglalap területe oldalai szorzata: 6 cm × 7 cm = 42 cm². A cm² négyzetcentimétert jelent."],
  ["Mennyi 5600 - (2380 + 1740)?", ["1380", "1480", "1580", "1680"], 1, 4, "Előbb a zárójel: 2380 + 1740 = 4120. Ezután 5600 - 4120 = 1480."],
  ["Mennyi az 1/2 + 1/4?", ["1/6", "2/6", "3/4", "1/8"], 2, 4, "1/2 = 2/4, ezért 1/2 + 1/4 = 2/4 + 1/4 = 3/4. Összeadáskor azonos nevező kell."],
  ["Hány fokos a derékszög?", ["45°", "60°", "90°", "180°"], 2, 2, "A derékszög 90°-os. Ilyen szöget alkot például egy téglalap két egymás melletti oldala."],
  ["Mennyi 0,25 százalékos alakban?", ["2,5%", "25%", "0,25%", "250%"], 1, 4, "0,25 = 25/100, ezért százalékos alakban 25%. A százalék azt jelenti: századból mennyi."],
  ["Egy négyzet oldala 9 cm. Mennyi a kerülete?", ["27 cm", "36 cm", "45 cm", "81 cm"], 1, 3, "A négyzet kerülete négy oldal összege: 4 × 9 cm = 36 cm."],
  ["Mennyi 720 ÷ 15?", ["42", "46", "48", "52"], 2, 4, "720 ÷ 15 = 48, mert 15 × 48 = 720. Osztáskor azt keressük, hányszor fér meg az osztó az osztandóban."],
];

const MATH_6: BankSeed[] = [
  ["Mennyi a 3/5 tizedes tört alakja?", ["0,35", "0,6", "0,53", "0,65"], 1, 4, "A 3/5 tizedes alakja 0,6, mert 3 ÷ 5 = 0,6. Az ötödök közül egy ötöd 0,2, így három ötöd 0,6."],
  ["Egy kör sugara 5 cm. Mennyi a kerülete? (π ≈ 3,14)", ["15,7 cm", "31,4 cm", "78,5 cm", "10 cm"], 1, 5, "A kör kerülete K = 2rπ, ezért 2 × 5 × 3,14 = 31,4 cm. A sugár a középponttól a körvonalig tart."],
  ["Mennyi (-7) + 12?", ["-19", "-5", "5", "19"], 2, 4, "(-7) + 12 = 5, mert 12-nek 7 egységét ellensúlyozza a negatív szám. Ellentétes előjelű számoknál kivonunk."],
  ["Egy áru 4000 Ft, 15% kedvezmény. Mennyi a kedvezmény?", ["400 Ft", "500 Ft", "600 Ft", "750 Ft"], 2, 5, "A kedvezmény 4000 × 0,15 = 600 Ft. A százalék azt jelenti, hogy az ár 100 egyenlő részéből 15 részt veszünk."],
  ["Mennyi a háromszög belső szögeinek összege?", ["90°", "180°", "270°", "360°"], 1, 3, "Egy háromszög belső szögeinek összege mindig 180°. Ez a síkgeometria alapvető tétele, alakjától függetlenül."],
  ["Mennyi 2³ (2 a köbön)?", ["6", "8", "9", "12"], 1, 4, "2³ = 2 × 2 × 2 = 8. A kitevő megmutatja, hányszor szorozzuk össze az alapot önmagával."],
  ["Mennyi az 5 : 2 arány 35-re alkalmazva? (nagyobb rész)", ["10", "15", "20", "25"], 3, 5, "Az 5 : 2 arány összesen 7 rész; 35 ÷ 7 = 5. A nagyobb rész 5 × 5 = 25."],
  ["Egy téglatest élei 2, 3 és 4 cm. Mennyi a térfogata?", ["9 cm³", "18 cm³", "24 cm³", "36 cm³"], 2, 4, "A téglatest térfogata V = a × b × c, tehát 2 × 3 × 4 = 24 cm³. A térfogat a test által kitöltött helyet méri."],
  ["Mennyi (-4) × (-6)?", ["-24", "-10", "10", "24"], 3, 4, "(-4) × (-6) = 24, mert két negatív szám szorzata pozitív. Az előjelek azonosak, ezért az eredmény plusz."],
  ["Mennyi a legkisebb közös többszöröse 6-nak és 8-nak?", ["12", "16", "24", "48"], 2, 5, "A 6 és 8 legkisebb közös többszöröse 24, mert 24 osztható 6-tal és 8-cal is. Kisebb pozitív közös többszörös nincs."],
];

const ENG_1: BankSeed[] = [
  ["Cat magyarul:", ["kutya", "macska", "madár", "hal"], 1, 1, "A cat jelentése macska. Egyszerű példa: „The cat is sleeping.” – „A macska alszik.”"],
  ["Dog magyarul:", ["macska", "ló", "kutya", "egér"], 2, 1, "A dog jelentése kutya. Egyszerű példa: „My dog is friendly.” – „A kutyám barátságos.”"],
  ["Red magyarul:", ["kék", "zöld", "piros", "sárga"], 2, 1, "A red jelentése piros. Egyszerű példa: „The apple is red.” – „Az alma piros.”"],
  ["Melyik szám az 'three'?", ["2", "3", "4", "5"], 1, 1, "A three jelentése három. Egyszerű példa: „I have three books.” – „Három könyvem van.”"],
  ["House magyarul:", ["ház", "kert", "autó", "hajó"], 0, 1, "A house jelentése ház. Egyszerű példa: „This house is big.” – „Ez a ház nagy.”"],
  ["Sun magyarul:", ["hold", "csillag", "nap", "felhő"], 2, 1, "A sun jelentése nap, vagyis a Földet megvilágító csillag. Példa: „The sun is bright.” – „A nap fényes.”"],
  ["Book magyarul:", ["toll", "könyv", "füzet", "táska"], 1, 1, "A book jelentése könyv. Egyszerű példa: „This book is interesting.” – „Ez a könyv érdekes.”"],
  ["Water magyarul:", ["tűz", "víz", "föld", "levegő"], 1, 1, "A water jelentése víz. Egyszerű példa: „I drink water.” – „Vizet iszom.”"],
  ["Milyen szín a 'blue'?", ["piros", "kék", "zöld", "fekete"], 1, 1, "A blue jelentése kék. Egyszerű példa: „The sky is blue.” – „Az ég kék.”"],
  ["Big ellentéte:", ["small", "tall", "long", "fast"], 0, 2, "A big, vagyis nagy ellentéte a small, azaz kicsi. Példa: „The box is small.” – „A doboz kicsi.”"],
];

const ENG_2: BankSeed[] = [
  ["Storm magyarul:", ["eső", "vihar", "szél", "hó"], 1, 2, "A storm jelentése vihar, amely erős széllel és gyakran esővel jár. Példa: „The storm is coming.” – „Közeleg a vihar.”"],
  ["Wind magyarul:", ["szél", "felhő", "villám", "eső"], 0, 2, "A wind jelentése szél. Példa: „The wind is strong today.” – „Ma erős a szél.”"],
  ["Melyik a helyes: I ___ a student.", ["is", "am", "are", "be"], 1, 2, "Az „I” névmás után az am áll: „I am a student.” – „Diák vagyok.” Az is és are más alanyokhoz tartozik."],
  ["Rain magyarul:", ["hó", "eső", "jég", "köd"], 1, 1, "A rain jelentése eső. Egyszerű példa: „The rain is cold.” – „Az eső hideg.”"],
  ["Car magyarul:", ["bicikli", "autó", "vonat", "busz"], 1, 1, "A car jelentése autó. Egyszerű példa: „The car is new.” – „Az autó új.”"],
  ["Fast ellentéte:", ["slow", "big", "old", "hot"], 0, 2, "A fast, vagyis gyors ellentéte a slow, azaz lassú. Példa: „The turtle is slow.” – „A teknős lassú.”"],
  ["Melyik többes szám: one box → two ___", ["boxs", "boxes", "boxen", "box"], 1, 3, "A box többes száma boxes, mert az -x végű főnevekhez általában -es végződést teszünk. „Two boxes” – „Két doboz.”"],
  ["Hot magyarul:", ["hideg", "meleg", "nedves", "száraz"], 1, 1, "A hot jelentése meleg vagy forró; a hideg angolul cold. Példa: „The tea is hot.” – „A tea forró.”"],
  ["Melyik napszak a 'morning'?", ["reggel", "dél", "este", "éjjel"], 0, 2, "A morning jelentése reggel vagy délelőtt. Egyszerű példa: „Good morning!” – „Jó reggelt!”"],
  ["Friend magyarul:", ["testvér", "barát", "szomszéd", "tanár"], 1, 2, "A friend jelentése barát. Példa: My friend is kind. – A barátom kedves."],
];

const ENG_3: BankSeed[] = [
  ["Cloud magyarul:", ["felhő", "villám", "szivárvány", "égbolt"], 0, 2, "A cloud jelentése felhő. Példa: A cloud is in the sky. – Egy felhő van az égen."],
  ["Melyik a helyes: She ___ to school every day.", ["go", "goes", "going", "gone"], 1, 3, "Egyes szám harmadik személyben, egyszerű jelen időben a go alakja goes: She goes to school every day. = Mindennap iskolába jár."],
  ["Lightning magyarul:", ["mennydörgés", "villámlás", "zápor", "szélvihar"], 1, 3, "A lightning villámlást jelent, míg a thunder a mennydörgés. Példa: Lightning is dangerous. – A villámlás veszélyes."],
  ["Dangerous magyarul:", ["biztonságos", "veszélyes", "gyors", "csendes"], 1, 3, "A dangerous jelentése veszélyes. Példa: This road is dangerous. – Ez az út veszélyes."],
  ["Melyik a múlt idő: play → ___", ["playd", "played", "plaied", "playing"], 1, 3, "A play szabályos ige, ezért múlt időben -ed végződést kap: played. Példa: We played outside. – Kint játszottunk."],
  ["Truck magyarul:", ["teherautó", "traktor", "motor", "hajó"], 0, 2, "A truck jelentése teherautó. Példa: The truck carries food. – A teherautó élelmiszert szállít."],
  ["Melyik a helyes kérdés?", ["You are ready?", "Are you ready?", "Ready you are?", "Is you ready?"], 1, 3, "A létigés kérdésben az am, is vagy are az alany elé kerül: Are you ready? – Készen állsz?"],
  ["Field magyarul:", ["erdő", "mező", "hegy", "tó"], 1, 2, "A field jelentése mező vagy szántóföld. Példa: Cows are in the field. – Tehenek vannak a mezőn."],
  ["Bridge magyarul:", ["híd", "út", "alagút", "torony"], 0, 2, "A bridge jelentése híd. Példa: The bridge crosses the river. – A híd átíveli a folyót."],
  ["Heavy ellentéte:", ["light", "hard", "strong", "deep"], 0, 3, "A heavy jelentése nehéz, ennek ellentéte a light, vagyis könnyű. Példa: This bag is light. – Ez a táska könnyű."],
];

const ENG_4: BankSeed[] = [
  ["Speed magyarul:", ["súly", "sebesség", "magasság", "hossz"], 1, 3, "A speed jelentése sebesség. Példa: The car has high speed. – Az autónak nagy a sebessége."],
  ["Melyik a helyes: There ___ many clouds in the sky.", ["is", "are", "be", "was"], 1, 3, "A many clouds többes számú szerkezet, ezért a többes számú are szükséges: There are many clouds."],
  ["Shelter magyarul:", ["menedék", "kirándulás", "határ", "kapu"], 0, 4, "A shelter jelentése menedék vagy óvóhely. Példa: We found shelter from the rain. – Menedéket találtunk az eső elől."],
  ["Melyik a helyes folyamatos alak: He is ___ the storm.", ["chase", "chasing", "chased", "chases"], 1, 3, "A folyamatos jelen alakja: alany + am/is/are + -ing végű ige. A chase végéről az e kiesik: He is chasing the storm. = Üldözi a vihart."],
  ["Warning magyarul:", ["jutalom", "figyelmeztetés", "bejelentés", "kérdés"], 1, 3, "A warning jelentése figyelmeztetés. Példa: The warning was clear. – A figyelmeztetés egyértelmű volt."],
  ["Melyik a helyes: I have ___ apple.", ["a", "an", "the", "some"], 1, 3, "Magánhangzóhanggal kezdődő szó előtt az an névelőt használjuk: an apple. Az apple első hangja magánhangzó."],
  ["Damage magyarul:", ["kár", "javítás", "épület", "eszköz"], 0, 4, "A damage jelentése kár vagy sérülés. Példa: The storm caused damage. – A vihar kárt okozott."],
  ["Measure magyarul:", ["mérni", "számolni", "írni", "olvasni"], 0, 3, "A measure igeként azt jelenti: mérni. Példa: Measure the table. – Mérd meg az asztalt."],
  ["Melyik a helyes összehasonlítás: fast → ___", ["faster", "more fast", "fastest", "fasted"], 0, 3, "Az egy szótagú fast melléknév középfokát -er végződéssel képezzük: fast, faster. Jelentése: gyorsabb."],
  ["Safe magyarul:", ["gyors", "biztonságos", "erős", "nehéz"], 1, 2, "A safe jelentése biztonságos. Példa: This place is safe. – Ez a hely biztonságos."],
];

const ENG_5: BankSeed[] = [
  ["Forecast magyarul:", ["előrejelzés", "visszatekintés", "beszámoló", "kísérlet"], 0, 4, "A forecast jelentése előrejelzés, gyakran időjárással kapcsolatban. Példa: The forecast says rain. – Az előrejelzés esőt jelez."],
  ["Melyik a helyes múlt idő: catch → ___", ["catched", "caught", "catchen", "cought"], 1, 4, "A catch rendhagyó ige, múlt ideje caught, nem -ed végződésű. Példa: She caught the ball. – Elkapta a labdát."],
  ["Equipment magyarul:", ["felszerelés", "épület", "utazás", "üzenet"], 0, 4, "Az equipment jelentése felszerelés, és angolul általában megszámlálhatatlan főnév. Példa: The equipment is new. – A felszerelés új."],
  ["Melyik a helyes: If it ___, we will stop.", ["rain", "rains", "rained", "raining"], 1, 4, "Az if utáni mellékmondatban jövőre is jelen időt használunk: If it rains, we will stop. – Ha esik, megállunk."],
  ["Shelter in place jelentése:", ["maradj a helyeden fedezékben", "költözz el", "indulj útnak", "keress segítséget"], 0, 5, "A shelter in place azt jelenti, hogy maradj a jelenlegi helyeden biztonságban, fedezékben. Veszélyhelyzeti utasítás lehet."],
  ["Melyik a helyes szenvedő szerkezet: The road ___ blocked.", ["is", "does", "has", "have"], 0, 4, "A szenvedő szerkezet alapja a be ige és a befejezett melléknévi igenév: is blocked, vagyis el van zárva."],
  ["Rotate magyarul:", ["forogni", "esni", "olvadni", "égni"], 0, 4, "A rotate jelentése forogni vagy forgatni. Példa: The wheel rotates. – A kerék forog."],
  ["Melyik a legerősebb: strong, stronger, strongest", ["strong", "stronger", "strongest", "mind egyforma"], 2, 3, "A strong felsőfoka strongest: strong, stronger, strongest. A -est végződés azt fejezi ki, hogy valami a legerősebb."],
  ["Evacuate magyarul:", ["kiüríteni", "megtölteni", "lezárni", "kinyitni"], 0, 5, "Az evacuate jelentése kiüríteni, például egy épületet veszély esetén. Példa: They evacuated the school. – Kiürítették az iskolát."],
  ["Melyik a helyes: I have ___ seen a tornado.", ["never", "not never", "no", "nothing"], 0, 4, "A present perfectben a never jelentése: „soha”: I have never seen a tornado. – Soha nem láttam tornádót."],
];

const ENG_6: BankSeed[] = [
  ["Melyik a helyes present perfect: She ___ the storm twice.", ["saw", "has seen", "seeing", "seen"], 1, 5, "A present perfect alakja have/has + befejezett melléknévi igenév: She has seen the storm twice. – Kétszer látta a vihart."],
  ["Severe magyarul:", ["enyhe", "súlyos", "rövid", "ritka"], 1, 4, "A severe jelentése súlyos vagy heves. Példa: severe damage = súlyos kár; a severe storm = heves vihar."],
  ["Melyik a helyes feltételes mondat?", ["If I would be there, I helped.", "If I were there, I would help.", "If I am there, I helped.", "If I be there, I help."], 1, 5, "A második típusú feltételesben az if-mondatban past simple, a főmondatban would + ige szerepel: If I were there, I would help."],
  ["Debris magyarul:", ["törmelék", "por", "jég", "hab"], 0, 5, "A debris jelentése „törmelék”, gyakran vihar vagy rombolás után: Debris covered the road. – Törmelék borította az utat."],
  ["Melyik a helyes: The vehicle ___ by the wind.", ["was moved", "was move", "were moving", "is move"], 0, 5, "A szenvedő szerkezet past simple alakja was/were + past participle: The vehicle was moved by the wind. – A járművet elmozdította a szél."],
  ["Anchor (ige) magyarul:", ["lehorgonyozni", "elindulni", "megfordulni", "felgyorsítani"], 0, 4, "Az anchor igeként azt jelenti, „lehorgonyozni”: The captain anchored the boat. – A kapitány lehorgonyozta a hajót."],
  ["Melyik szó melléknév?", ["quickly", "quick", "quickness", "quicken"], 1, 4, "A quick melléknév, ezért főnevet jellemez: a quick response. A quickly határozószó, igét módosít: respond quickly."],
  ["Approach magyarul:", ["megközelíteni", "elkerülni", "elhagyni", "megállni"], 0, 4, "Az approach jelentése „megközelíteni”: The storm is approaching the city. – A vihar közeledik a városhoz."],
  ["Melyik a helyes: He said he ___ tired.", ["is", "was", "be", "are"], 1, 5, "Múlt idejű függő beszédben a jelen idejű is gyakran was-ra változik: He said he was tired. – Azt mondta, fáradt volt."],
  ["Intensity magyarul:", ["intenzitás", "irány", "időtartam", "távolság"], 0, 4, "Az intensity jelentése „intenzitás”, vagyis egy jelenség erőssége: The storm's intensity increased. – A vihar intenzitása nőtt."],
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
  /** Mastery band within the selected school grade. */
  adaptiveBand?: number;
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
    if (tier.length > 0) {
      const target = 1 + Math.min(1, Math.max(0.15, args.adaptiveBand ?? 0.5)) * 4;
      const distance = Math.min(...tier.map(q => Math.abs(q.difficulty - target)));
      const candidates = args.adaptiveBand === undefined ? tier : tier.filter(q => Math.abs(q.difficulty - target) <= distance + 0.5);
      return candidates[Math.floor(rng() * candidates.length) % candidates.length]!;
    }
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
