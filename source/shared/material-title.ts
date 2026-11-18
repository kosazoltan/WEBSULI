/**
 * A tananyag megjelenítendő címe az osztállyal és a tananyagkereső illesztése — docs/specs/2026-11-17-tananyag-cim-osztaly.md.
 * A tárolt cím (`html_files.title`) nem változik: az osztály a `classroom` mezőből kerül a cím elé, és a kereső az
 * osztály-kifejezésekre is talál („5”, „5.o”, „5 osztaly”, „ötödik”, „V. osztály”, „programozás”). Tiszta függvények, DOM nélkül.
 */
import { classroomDisplayLabel, normalizeClassroom } from "./classrooms";
import { subjectLabel } from "./subjects";

/** Az osztály-felirat és a cím közti elválasztó: „5. osztály · Törtek összeadása”. */
export const TITLE_GRADE_SEPARATOR = " · ";

/** Az előtag alakja: „long” = „5. osztály” / „Programozás”; „short” = „5. o.” / „Prog.”. */
export type TitleGradeStyle = "long" | "short";
/** A cím-előtag formátuma EGY helyen váltható (tulajdonosi döntés: hosszú vagy rövid alak). */
export const TITLE_GRADE_STYLE: TitleGradeStyle = "long";

/** Az érvényes osztály (0–12) cím-előtagja a kért alakban. */
export function titleGradeLabel(grade: number, style: TitleGradeStyle = TITLE_GRADE_STYLE): string {
  if (style === "short") return grade === 0 ? "Prog." : `${grade}. o.`;
  return classroomDisplayLabel(grade);
}

/** Kis-nagybetűtől és ékezettől független összehasonlításhoz. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Sorszámnevek ékezet nélkül, az osztály számával. */
const ORDINALS: ReadonlyArray<readonly [string, number]> = [
  ["elso", 1], ["masodik", 2], ["harmadik", 3], ["negyedik", 4], ["otodik", 5], ["hatodik", 6], ["hetedik", 7],
  ["nyolcadik", 8], ["kilencedik", 9], ["tizedik", 10], ["tizenegyedik", 11], ["tizenkettedik", 12],
];
const ORDINAL_GRADE = new Map<string, number>(ORDINALS);
const ORDINAL_ALT = ORDINALS.map(([word]) => word).join("|");
/** Római szám I–XII (hajtogatva kisbetűs), az osztály számával: „V. osztály”, „IX.b osztály”. A hosszabb alak áll elöl. */
const ROMANS: ReadonlyArray<readonly [string, number]> = [
  ["xii", 12], ["xi", 11], ["ix", 9], ["x", 10], ["viii", 8], ["vii", 7], ["vi", 6], ["iv", 4], ["v", 5], ["iii", 3], ["ii", 2], ["i", 1],
];
const ROMAN_GRADE = new Map<string, number>(ROMANS);
const ROMAN_ALT = ROMANS.map(([numeral]) => numeral).join("|");
const GRADE_NUMBER = "(?:1[0-2]|[1-9])";
const GRADE_WORD = "(?:osztaly|evfolyam)";
/** Osztálybetű a szám után: „5.b”, „5/a”. */
const CLASS_LETTER = "[a-h]";
// Szóhatár a minta előtt, visszatekintés nélkül (a Safari < 16.4 a regex-visszatekintést szintaktikai hibának veszi —
// tests/no-lookbehind-client.test.ts): a határoló karakter a minta része; a keresőkifejezésnél elfogott csoport, amely visszakerül.
const WORD_START = "(?:^|[^\\p{L}\\p{N}])";
const CAPTURED_WORD_START = "(^|[^\\p{L}\\p{N}])";
const WORD_END = "(?![\\p{L}\\p{N}])";
/** „ötödikes”, „harmadikosok”, „elsősöknek”, „ötödikben” — de az „elsősegély”, „elsősorban” nem osztály. */
const ORDINAL_SUFFIX = "(?:(?:s|es|os)(?:ok|ek)?(?:nak|nek)?|ben|ban)";

/** A címben megnevezett osztály alakjai (a hajtogatott címen). */
const TITLE_GRADE_PATTERNS: readonly RegExp[] = [
  // „5. osztály”, „5.osztályos”, „5 osztály”, „9. évfolyam”, „5–6. osztály”, „5.b osztály”
  new RegExp(`${WORD_START}${GRADE_NUMBER}\\s*\\.?\\s*(?:${CLASS_LETTER}\\s+)?${GRADE_WORD}`, "u"),
  // „V. osztály”, „IX.b osztály”
  new RegExp(`${WORD_START}(?:${ROMAN_ALT})\\.?\\s*(?:${CLASS_LETTER}\\s+)?${GRADE_WORD}`, "u"),
  // „osztály 5”, „osztály: 5”, „évfolyam 9”
  new RegExp(`${WORD_START}${GRADE_WORD}\\s*:?\\s*${GRADE_NUMBER}${WORD_END}`, "u"),
  // „5.o”, „5. o.”
  new RegExp(`${WORD_START}${GRADE_NUMBER}\\.\\s?o\\.?${WORD_END}`, "u"),
  // „ötödik osztály”, „ötödikes évfolyam”
  new RegExp(`${WORD_START}(?:${ORDINAL_ALT})(?:s|es|os)?\\s+${GRADE_WORD}`, "u"),
  // „ötödikeseknek”, „harmadikosok”, „elsősök”
  new RegExp(`${WORD_START}(?:${ORDINAL_ALT})${ORDINAL_SUFFIX}${WORD_END}`, "u"),
];

/** Igaz, ha a tárolt cím már megnevez egy osztályt (bármelyiket) — ilyenkor a cím elé nem kerül osztály. */
export function titleNamesClassroom(title: string): boolean {
  const folded = foldText(title);
  return TITLE_GRADE_PATTERNS.some((pattern) => pattern.test(folded));
}

/**
 * A cím elé kerülő osztály-felirat („5. osztály”, „Programozás”), vagy `null`, ha nem kell: érvénytelen osztály, üres cím,
 * a cím már megnevez osztályt, vagy a programozási sáv anyagának címében már szerepel a programozás.
 */
export function materialTitleGradePrefix(title: string, classroom: unknown, style: TitleGradeStyle = TITLE_GRADE_STYLE): string | null {
  const grade = normalizeClassroom(classroom);
  if (grade === null || !title.trim()) return null;
  if (titleNamesClassroom(title)) return null;
  if (grade === 0 && foldText(title).includes("programoz")) return null;
  return titleGradeLabel(grade, style);
}

/** A listákban megjelenítendő cím: „5. osztály · Cím”, vagy a tárolt cím változatlanul. */
export function materialDisplayTitle(title: string, classroom: unknown, style: TitleGradeStyle = TITLE_GRADE_STYLE): string {
  const prefix = materialTitleGradePrefix(title, classroom, style);
  return prefix === null ? title : `${prefix}${TITLE_GRADE_SEPARATOR}${title}`;
}

/** A keresőben az osztály-szó ragozott alakjai („osztályos”, „osztálynak”, „évfolyamban”) — az „osztályozás”, „osztályfőnöki” nem az. */
const QUERY_GRADE_WORD = "(?:osztaly|evfolyam)(?:os|es)?(?:ok|ek)?(?:nak|nek|ban|ben|ba|be|ra|re|at|t|a)?";
/**
 * Gépelés közben (review U1): az osztály-kifejezést követő, FÉLIG beírt osztály-szó („8. os”, „8. osztá”, „5. évfo”, „5. osztályo”)
 * is az osztály-kifejezés része, nem keresőszó — a találati lista ne essen össze, amíg a szó elkészül.
 */
const TYPED_GRADE_WORD_START = "(?:osz(?:t(?:a(?:l)?)?)?|evf(?:o(?:l(?:y(?:a)?)?)?)?)";
const TYPED_GRADE_WORD_TAIL = "(?:osztaly|evfolyam)(?:[oe]s?)?(?:[oe]k?)?(?:n[ae]?k?|b[ae]?n?|r[ae]?|at?|t)?";
const TYPED_GRADE_WORD = `(?:${TYPED_GRADE_WORD_TAIL}|${TYPED_GRADE_WORD_START}|os?|ev?)`;
/** Tört, tizedes, tartomány vagy művelet része nem osztály: „3/4”, „3,5”, „1-2”. */
const NUMBER_GLUE = ".,/:+*=\\-";
const QUERY_NUMBER = new RegExp(
  `(^|[^\\p{L}\\p{N}${NUMBER_GLUE}])(\\d{1,2})`
  // Osztálybetű („5.b”, „5/a”) vagy pont („5.”).
  + `(?:[./]${CLASS_LETTER}(?![\\p{L}\\p{N}])|\\s*\\.)?`
  // A képző közvetlenül vagy kötőjellel kapcsolódik („5-ös”, „5.-es”, „5-ösöknek”, „5-ödikes”); szóközzel nem („5. és 6.”).
  + `(?:(?:\\s?-\\s?)?(?:(?:edik|odik|adik|dik|ik)(?:es|os)?|es|os|as)(?:ek|ok|ak)?(?:nek|nak)?)?`
  + `(?:\\s*(?:${TYPED_GRADE_WORD}|oszt\\.?|evf\\.?|o\\.?))?`
  + `(?![\\p{L}\\p{N}]|[${NUMBER_GLUE}]\\S)`,
  "gu",
);
const QUERY_ORDINAL = new RegExp(
  `${CAPTURED_WORD_START}(${ORDINAL_ALT})(?:${ORDINAL_SUFFIX})?(?:\\s+${TYPED_GRADE_WORD})?${WORD_END}`,
  "gu",
);
// Római szám csak osztály-szóval együtt osztály („V. osztály”, „IX.b osztály”) — a „IV. Béla”, „i.e.” nem az.
const QUERY_ROMAN = new RegExp(
  `${CAPTURED_WORD_START}(${ROMAN_ALT})\\.?(?:[./]?${CLASS_LETTER})?\\s*(?:${TYPED_GRADE_WORD_TAIL}|${TYPED_GRADE_WORD_START}|oszt\\.?|evf\\.?)${WORD_END}`,
  "gu",
);
const QUERY_PROGRAMMING = new RegExp(
  `${CAPTURED_WORD_START}prog(?:r(?:a(?:m(?:o(?:z\\p{L}*)?)?)?)?)?\\.?(?:\\s+(?:alapismeret\\p{L}*|alapok))?${WORD_END}`,
  "gu",
);
const BARE_NUMBER = /^\d{1,2}\s*\.?\s*$/u;
const GRADE_WORD_ONLY = new RegExp(`^${QUERY_GRADE_WORD}$`, "u");

/** Kötőszó, névelő az osztály-kifejezések között („5. és 6. osztály”, „a 4. osztály”) — nem keresőszó. */
const FILLER_WORDS = new Set(["es", "vagy", "a", "az"]);

export type GradeQuery = {
  /** A kifejezésből kiolvasott osztályok (0–12), növekvő sorrendben, ismétlés nélkül. */
  grades: number[];
  /** A maradék szavak (hajtogatva), az osztály-szó ragozott alakjai és a kötőszók nélkül. */
  rest: string[];
};

type AnalyzedGradeQuery = GradeQuery & {
  /**
   * A KIFEJEZETT osztály-alakból kiolvasott osztályok („5. osztály”, „5.o”, „5.b”, „5-ös”, „ötödikes”, „ötödik osztály”, „V. osztály”,
   * „prog…”) — a puszta szám („5”, „5.”) és a puszta sorszámnév („első”) nincs köztük (tulajdonosi döntés 2026-11-18, U2).
   */
  explicitGrades: number[];
};

/** A keresőkifejezés osztály-kifejezései és a maradék szavak. */
export function parseGradeQuery(query: string): GradeQuery {
  const { grades, rest } = analyzeGradeQuery(query);
  return { grades, rest };
}

/**
 * Az elemzés közben minden felismert osztály-kifejezés helyére egy-egy jelölő karakter kerül (magánhasználatú Unicode-tartomány:
 * se betű, se szám, így a későbbi minták szóhatárnak látják). A jelölő sorszáma a felismert kifejezés indexe.
 */
const MARK_BASE = 0xe000;
const MAX_MARKS = 0x100;
const MARK_CLASS = "\\ue000-\\ue0ff";
/** Felsorolás: jelölők, köztük csak szóköz, vessző, pontosvessző, kötőjel / nagykötőjel, „és”, „vagy” („5. és 6. osztály”, „5., 6. osztály”). */
const GRADE_LIST = new RegExp(`[${MARK_CLASS}](?:(?:\\s|[,;–-]|\\bes\\b|\\bvagy\\b)*[${MARK_CLASS}])*`, "gu");
const ANY_MARK = new RegExp(`[${MARK_CLASS}]`, "gu");

function analyzeGradeQuery(query: string): AnalyzedGradeQuery {
  const found: Array<{ grade: number; explicit: boolean }> = [];
  /** A felismert kifejezés rögzítése; a visszaadott szöveg kerül a helyére (túl sok kifejezésnél az eredeti marad). */
  const mark = (match: string, before: string, grade: number, explicit: boolean): string => {
    if (found.length >= MAX_MARKS) return match;
    found.push({ grade, explicit });
    return `${before}${String.fromCharCode(MARK_BASE + found.length - 1)}`;
  };
  let text = foldText(query).replace(ANY_MARK, " ");
  text = text.replace(QUERY_PROGRAMMING, (match, before: string) => mark(match, before, 0, true));
  text = text.replace(QUERY_ORDINAL, (match, before: string, word: string) => {
    const grade = ORDINAL_GRADE.get(word);
    // Kifejezett alak: képzővel vagy osztály-szóval („ötödikes”, „ötödik osztály”); a puszta „ötödik” nem az.
    return grade === undefined ? match : mark(match, before, grade, match.slice(before.length) !== word);
  });
  text = text.replace(QUERY_ROMAN, (match, before: string, numeral: string) => {
    const grade = ROMAN_GRADE.get(numeral);
    return grade === undefined ? match : mark(match, before, grade, true);
  });
  text = text.replace(QUERY_NUMBER, (match, before: string, digits: string) => {
    const grade = normalizeClassroom(Number(digits));
    // Kifejezett alak: osztály-szó, „.o”, képző vagy osztálybetű áll a szám után; a puszta „5” / „5.” nem az.
    return grade === null ? match : mark(match, before, grade, !BARE_NUMBER.test(match.slice(before.length)));
  });
  // Felsorolásban az osztály-szó az egész felsorolásra vonatkozik: „5. és 6. osztály” mindkét tagja kifejezett osztály
  // (Vercel Agent lelet, PR #494) — különben a 6. osztály szűrője mellett az 5. osztály találatai kimaradnának.
  for (const list of text.match(GRADE_LIST) ?? []) {
    const members = [...list]
      .map((char) => char.charCodeAt(0) - MARK_BASE)
      .filter((index) => index >= 0 && index < found.length)
      .map((index) => found[index]);
    if (members.some((member) => member.explicit)) for (const member of members) member.explicit = true;
  }
  const rest = text.replace(ANY_MARK, " ").split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !GRADE_WORD_ONLY.test(word) && !FILLER_WORDS.has(word));
  const sorted = (list: number[]) => [...new Set(list)].sort((x, y) => x - y);
  return {
    grades: sorted(found.map((item) => item.grade)),
    rest,
    explicitGrades: sorted(found.filter((item) => item.explicit).map((item) => item.grade)),
  };
}

export type SearchableMaterial = {
  title: string;
  description?: string | null;
  subject?: string | null;
  classroom?: unknown;
};

/** Az egyszer elemzett keresőkifejezés (leütésenként egyszer készül, nem anyagonként). */
export type MaterialSearch = AnalyzedGradeQuery & {
  /** A teljes kifejezés hajtogatva, a szélső szóközök nélkül; üres = nincs keresés. */
  phrase: string;
};

export function prepareMaterialSearch(query: string): MaterialSearch {
  const phrase = foldText(query.trim());
  return phrase ? { phrase, ...analyzeGradeQuery(query) } : { phrase, grades: [], rest: [], explicitGrades: [] };
}

/**
 * Tananyagkereső: szöveges találat (a teljes kifejezés a TÁROLT címben, a leírásban vagy a tantárgynévben — ahogy eddig),
 * VAGY osztály-találat (a kifejezésből kiolvasott osztály egyezik a `classroom` mezővel, és minden maradék szó az anyag
 * szövegének valamelyik szavát kezdi). A szöveges ág szándékosan a nyers címen keres: a megjelenített előtagon az „1. osztály” a „11. osztály”-t is hozná.
 */
export function matchesPreparedSearch(file: SearchableMaterial, search: MaterialSearch): boolean {
  if (!search.phrase) return true;
  const fields = [file.title, file.description ?? "", file.subject ? subjectLabel(file.subject) : ""].map(foldText);
  if (fields.some((field) => field.includes(search.phrase))) return true;

  const grade = normalizeClassroom(file.classroom);
  if (grade === null || !search.grades.includes(grade)) return false;
  // Szókezdetre illik („tört” → „törtek”), szó belsejére nem: az „ötödik elem” ne találja a „Történelem” tantárgy anyagait.
  const words = fields.join(" ").split(/[^\p{L}\p{N}]+/u);
  return search.rest.every((word) => words.some((candidate) => candidate.startsWith(word)));
}

export function matchesMaterialSearch(file: SearchableMaterial, query: string): boolean {
  return matchesPreparedSearch(file, prepareMaterialSearch(query));
}

/**
 * Ha a kifejezés KIFEJEZETT osztály-alakkal az aktív osztályszűrőtől ELTÉRŐ osztályt nevez meg („5. osztály” a 4. osztály szűrője
 * mellett), a keresés minden osztályban fut — különben az osztály-keresés üres lenne. A puszta szám és a puszta sorszámnév („1”,
 * „Első”) önmagában nem lépi át a szűrőt (tulajdonosi döntés 2026-11-18, U2) — lásd `filterMaterialsBySearch`.
 */
export function searchSpansAllClassrooms(search: MaterialSearch, selectedClassroom: number | null): boolean {
  return selectedClassroom !== null && search.explicitGrades.some((grade) => grade !== selectedClassroom);
}

/**
 * Keresés ÉS osztályszűrő. A szűrő érvényes, kivéve ha (a) a kifejezés kifejezett osztály-alakkal más osztályt nevez meg, vagy
 * (b) a szűrt találat üres, és a kifejezés (akár puszta számmal / sorszámnévvel) más osztályt nevez meg, amelyben van találat.
 * Ilyenkor a keresés minden osztályban fut (`allClassrooms`); a szűrő állapota nem változik. `alsoMatches`: a felület saját
 * kiegészítő illesztése (admin: „Nincs osztály”).
 */
export function filterMaterialsBySearch<T extends SearchableMaterial>(
  files: readonly T[],
  search: MaterialSearch,
  selectedClassroom: number | null,
  alsoMatches?: (file: T) => boolean,
): { files: T[]; allClassrooms: boolean } {
  const matched = files.filter((file) => matchesPreparedSearch(file, search) || alsoMatches?.(file) === true);
  if (selectedClassroom === null) return { files: matched, allClassrooms: false };
  if (searchSpansAllClassrooms(search, selectedClassroom)) return { files: matched, allClassrooms: true };
  const scoped = matched.filter((file) => file.classroom === selectedClassroom);
  if (scoped.length === 0 && matched.length > 0 && search.grades.some((grade) => grade !== selectedClassroom)) {
    return { files: matched, allClassrooms: true };
  }
  return { files: scoped, allClassrooms: false };
}
