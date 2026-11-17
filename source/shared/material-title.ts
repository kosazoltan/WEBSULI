/**
 * A tananyag megjelenítendő címe az osztállyal és a tananyagkereső illesztése — docs/specs/2026-11-17-tananyag-cim-osztaly.md.
 * A tárolt cím (`html_files.title`) nem változik: az osztály a `classroom` mezőből kerül a cím elé, és a kereső az
 * osztály-kifejezésekre is talál („5”, „5.o”, „5 osztaly”, „ötödik”, „programozás”). Tiszta függvények, DOM nélkül.
 */
import { classroomDisplayLabel, normalizeClassroom } from "./classrooms";
import { subjectLabel } from "./subjects";

/** Az osztály-felirat és a cím közti elválasztó: „5. osztály · Törtek összeadása”. */
export const TITLE_GRADE_SEPARATOR = " · ";

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
const GRADE_NUMBER = "(?:1[0-2]|[1-9])";
const GRADE_WORD = "(?:osztaly|evfolyam)";
const WORD_START = "(?<![\\p{L}\\p{N}])";
const WORD_END = "(?![\\p{L}\\p{N}])";
/** „ötödikes”, „harmadikosok”, „elsősöknek” — de az „elsősegély”, „elsősorban” nem osztály. */
const ORDINAL_SUFFIX = "(?:s|es|os)(?:ok|ek)?(?:nak|nek)?";

/** A címben megnevezett osztály alakjai (a hajtogatott címen). */
const TITLE_GRADE_PATTERNS: readonly RegExp[] = [
  // „5. osztály”, „5.osztályos”, „5 osztály”, „9. évfolyam”, „5–6. osztály”
  new RegExp(`${WORD_START}${GRADE_NUMBER}\\s*\\.?\\s*${GRADE_WORD}`, "u"),
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
export function materialTitleGradePrefix(title: string, classroom: unknown): string | null {
  const grade = normalizeClassroom(classroom);
  if (grade === null || !title.trim()) return null;
  if (titleNamesClassroom(title)) return null;
  if (grade === 0 && foldText(title).includes("programoz")) return null;
  return classroomDisplayLabel(grade);
}

/** A listákban megjelenítendő cím: „5. osztály · Cím”, vagy a tárolt cím változatlanul. */
export function materialDisplayTitle(title: string, classroom: unknown): string {
  const prefix = materialTitleGradePrefix(title, classroom);
  return prefix === null ? title : `${prefix}${TITLE_GRADE_SEPARATOR}${title}`;
}

/** Tört, tizedes, tartomány vagy művelet része nem osztály: „3/4”, „3,5”, „1-2”. */
const NUMBER_GLUE = ".,/:+*=\\-";
const QUERY_NUMBER = new RegExp(
  `(?<![\\p{L}\\p{N}${NUMBER_GLUE}])(\\d{1,2})(?:\\s*\\.)?`
  // A képző közvetlenül vagy kötőjellel kapcsolódik („5-ös”, „5.-es”); szóközzel nem („5. és 6.” — az „és” nem képző).
  + `(?:(?:\\s?-\\s?)?(?:edik|odik|adik|dik|ik|es|os|as))?`
  + `(?:\\s*(?:osztaly\\p{L}*|evfolyam\\p{L}*|oszt\\.?|evf\\.?|o\\.?))?`
  + `(?![\\p{L}\\p{N}]|[${NUMBER_GLUE}]\\S)`,
  "gu",
);
const QUERY_ORDINAL = new RegExp(
  `${WORD_START}(${ORDINAL_ALT})(?:${ORDINAL_SUFFIX})?(?:\\s+(?:osztaly|evfolyam)\\p{L}*)?${WORD_END}`,
  "gu",
);
const QUERY_PROGRAMMING = new RegExp(
  `${WORD_START}prog(?:ramoz\\p{L}*)?\\.?(?:\\s+(?:alapismeret\\p{L}*|alapok))?${WORD_END}`,
  "gu",
);

/** Kötőszó, névelő az osztály-kifejezések között („5. és 6. osztály”, „a 4. osztály”) — nem keresőszó. */
const FILLER_WORDS = new Set(["es", "vagy", "a", "az"]);

export type GradeQuery = {
  /** A kifejezésből kiolvasott osztályok (0–12), növekvő sorrendben, ismétlés nélkül. */
  grades: number[];
  /** A maradék szavak (hajtogatva), az „osztály…” / „évfolyam…” szavak nélkül. */
  rest: string[];
};

/** A keresőkifejezés osztály-kifejezései és a maradék szavak. */
export function parseGradeQuery(query: string): GradeQuery {
  const grades = new Set<number>();
  let text = foldText(query);
  text = text.replace(QUERY_PROGRAMMING, () => {
    grades.add(0);
    return " ";
  });
  text = text.replace(QUERY_ORDINAL, (_match, word: string) => {
    const grade = ORDINAL_GRADE.get(word);
    if (grade !== undefined) grades.add(grade);
    return " ";
  });
  text = text.replace(QUERY_NUMBER, (match, digits: string) => {
    const grade = normalizeClassroom(Number(digits));
    if (grade === null) return match;
    grades.add(grade);
    return " ";
  });
  const rest = text.split(/[^\p{L}\p{N}]+/u).filter((word) => word && !/^(?:osztaly|evfolyam)/.test(word) && !FILLER_WORDS.has(word));
  return { grades: [...grades].sort((a, b) => a - b), rest };
}

export type SearchableMaterial = {
  title: string;
  description?: string | null;
  subject?: string | null;
  classroom?: unknown;
};

/**
 * Tananyagkereső: szöveges találat (a teljes kifejezés a megjelenítendő címben, a leírásban vagy a tantárgynévben — ahogy eddig),
 * VAGY osztály-találat (a kifejezésből kiolvasott osztály egyezik, és minden maradék szó szerepel az anyag szövegében).
 */
export function matchesMaterialSearch(file: SearchableMaterial, query: string): boolean {
  const phrase = foldText(query.trim());
  if (!phrase) return true;
  const fields = [
    materialDisplayTitle(file.title, file.classroom),
    file.description ?? "",
    file.subject ? subjectLabel(file.subject) : "",
  ].map(foldText);
  if (fields.some((field) => field.includes(phrase))) return true;

  const grade = normalizeClassroom(file.classroom);
  if (grade === null) return false;
  const { grades, rest } = parseGradeQuery(query);
  if (!grades.includes(grade)) return false;
  const haystack = `${fields.join(" ")} ${foldText(classroomDisplayLabel(grade))}`;
  return rest.every((word) => haystack.includes(word));
}
