import { SCHOOL_YEARS, schoolYearPosition } from "../../shared/school-calendar";

/**
 * Anyag → NAT 2020 mintatanmenet-óra illesztése (docs/specs/2026-10-17-tanmenet-rendezes.md) — tiszta modul, a tanmenet-adatot
 * paraméterként kapja. Eredmény: a tanévbeli pozíció (0–1) és egy rövid címke.
 */
export type TanmenetData = { about: string; plans: Array<{ grade: number; subject: string; title: string; source: string; lessons: Array<[string, string]> }> };
export type CurriculumMatch = { pos: number; label: string; kind: "tanmenet" | "seasonal"; score: number };

const STOP = new Set([
  "tananyag", "tananyagok", "interaktiv", "osztaly", "osztalyos", "osztalyosoknak", "evfolyam", "evfolyamos", "temazaro", "felkeszito",
  "felkeszules", "gyakorlo", "gyakorlas", "gyakorlasa", "teljes", "lecke", "leckek", "mester", "mestere", "kaland", "verseny", "edition",
  "racing", "cyber", "mission", "ultra", "turbo", "dojo", "ninja", "arena", "kuldetes", "kuldetesek", "tanuljunk", "egyutt", "rovid",
  "bovitett", "modul", "module", "lesson", "grade", "learning", "tananyaga", "feladatlap", "feladatok", "feladat", "feladatsor",
  "megoldasi", "strategiak", "osszefoglalo", "osszefoglalas", "ismetles", "ismetlo", "bevezetes", "temak", "tema", "temakor", "resz",
  "kerdesek", "kerdes", "valaszok", "jatek", "jatekos", "varazs", "varazslat", "galaktikus", "urkaland", "orajaval", "oraja", "bacsi",
  "bandi", "focis", "stilus", "barcelona", "kristof", "medve", "szabadteri", "csapatverseny", "and", "the", "with", "for", "your",
  "egy", "egyszeru", "kezdoknek", "alapok", "alapjai", "es", "vagy", "illetve", "valamint", "akkor", "mint", "hogy", "ami", "amely",
  "azaz", "ora", "orak", "tanora", "evi", "eves", "pro", "plus", "komplex", "kompetenciameres", "felmeres", "teszt",
  // tantárgynevek: a tantárgyat a nyers címből ismerjük fel, a pontozásban nem számítanak
  "matematika", "matek", "nyelvtan", "irodalom", "irodalmi", "termeszetismeret", "termeszettudomany", "termeszettan", "kornyezetismeret",
  "foldrajz", "fizika", "kemia", "biologia", "tortenelem", "angol", "angolul", "english", "magyar", "nyelv", "digitalis", "kultura",
  "informatika", "enek", "zene",
]);

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Szavak ékezet nélkül; számok, 3 betűnél rövidebb és általános szavak nélkül. */
export function normalizeTokens(text: string): string[] {
  return fold(text).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t));
}
/** Két szó egyezik, ha azonosak, vagy a rövidebb (legalább 4 betű) a hosszabb eleje (magyar toldalékok: tört → törtek). */
export function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  // „hossz” → „hosszúságmérés” (összetett szó) igen; a 4 betűs „szám” → „számírás” csak arányos hosszon
  if (s.length >= 4 && l.startsWith(s) && (s.length >= 5 || s.length / l.length >= 0.6)) return true;
  return s.length >= 6 && l.slice(0, 6) === s.slice(0, 6);
}

/** A cím → tantárgycsoport (a tanmenet `subject` kulcsai). Ismeretlen: null (az évfolyam minden tanmenete jelölt). */
const SUBJECT_PATTERNS: Array<[RegExp, string[]]> = [
  [/\b(angol|english|grammar|vocabulary|present|nouns|whose|who.s|have got|there (is|are)|daily routines?|full blast|my cousin|module|vegetables|fruits|jobs|snowman|peru|telling the time|all about me|where i live|countable|poems|interactive learning)/, ["angol"]],
  [/\b(francia|french|francais)\b/, ["francia"]],
  [/\b(digitalis kultura|informatika|programoz|tomb|ciklus|algoritm|robot|replit|github|chatgpt|vs code)/, ["informatika"]],
  [/\b(enek|zene|nepzene|hangkoz|gitar|dal\b)/, ["enek-zene"]],
  [/\b(biblia|hittan|etika|erkolcs)/, ["hit-es-erkolcstan"]],
  [/\b(kemia|savak?|savmaradek|ion|molekul|vegyulet|reakcio|egese?|egesi)/, ["kemia", "termeszetismeret"]],
  [/\b(fizika|elektrom|aram|energia|hotan|homerseklet|nyomas|fogyaszto)/, ["fizika", "termeszetismeret"]],
  [/\b(foldrajz|kozephegyseg|alfold|dunantul|alpokalja|alpok|tersege|orszag|gazdasag|nagy-britannia|csehorszag|naprendszer|fold kering)/, ["foldrajz", "termeszetismeret", "kornyezetismeret"]],
  [/\b(tortenel|okor|okori|kozepkor|kiraly|kiralyok|honfoglal|egyiptom|mezopotam|hellasz|gorog|arpad|hunyadi|karoly|emberre valas|idoszamit|civiliz|kereszteny|iszlam|brankovic|identitas)/, ["tortenelem", "tarsadalmi-ismeretek"]],
  [/\b(biologia|termeszettud|termeszetism|kornyezetism|noveny|allat|test|szerv|legzes|taplalk|anyagforgalom|sejt|eloleny|erdo|mezo|ret\b|vizpart|talaj|kert|meh\b|zoldseg|gyumolcs|betegseg|egeszseg|viz korforgas|elobel)/, ["biologia", "termeszetismeret", "kornyezetismeret"]],
  [/\b(nyelvtan|helyesiras|szofaj|fonev|igek?\b|igekot|mellekn|hatarozo|mondat|elvalasztas|betur|szoalkot|osszetett szav|tulajdonsag|kommunikacio|szamot, mennyiseget)/, ["magyar-nyelvtan", "magyar-nyelv-es-irodalom"]],
  [/\b(irodalom|vers|mese|nepmese|regeny|arany janos|petofi|jokai|pal utcai|abigel|ady|nyugat|lira|novella|odysseus|csaladi kor|green war)/, ["magyar-irodalom", "magyar-nyelv-es-irodalom"]],
  [/\b(matek|matematik|szorzas|osztas|osszeadas|kivonas|tort|szamkor|geometri|egyenlet|szog|terulet|kerulet|mertek|szamol|romai szam|negativ|pitagor|koordinat|algebra|halmaz|hatvany|oszthat|szazalek|aranyossag|statisztik|fuggveny|hozzarendel|transzform|terfogat|felszin|alakzat|becsles|muveleti sorrend|hossz|urmertek|tomeg)/, ["matematika"]],
];
export function subjectsOfTitle(title: string): string[] | null {
  const t = fold(title);
  for (const [re, subjects] of SUBJECT_PATTERNS) if (re.test(t)) return subjects;
  return null;
}

/** Rögzített időpontú témák (hónapnév, ünnep) — elsősorban a nyelvi anyagokra; a 2026/2027-es tanév napjaira vetítve. */
const SEASONAL: Array<[RegExp, string, string]> = [
  [/\bszeptember/, "2026-09-15", "szeptember"], [/\boktober(i)?\b/, "2026-10-14", "október"], [/\bnovember/, "2026-11-16", "november"],
  [/\bdecember/, "2026-12-09", "december"], [/\bjanuar/, "2027-01-18", "január"], [/\bfebruar/, "2027-02-15", "február"],
  [/\bmarcius\b/, "2027-03-10", "március"], [/\baprilis/, "2027-04-14", "április"], [/\bmajus/, "2027-05-14", "május"],
  [/\bjunius/, "2027-06-07", "június"],
  [/halloween/, "2026-10-21", "Halloween"], [/christmas|karacsony|advent|snowman|hoember|mikulas/, "2026-12-09", "karácsony"],
  [/easter|husvet/, "2027-03-22", "húsvét"], [/valentin/, "2027-02-12", "Valentin-nap"], [/farsang|carnival/, "2027-02-08", "farsang"],
  [/anyak napja|mother.?s day/, "2027-04-30", "anyák napja"], [/marcius 15|1848/, "2027-03-12", "március 15."],
  [/oktober 23|1956/, "2026-10-21", "október 23."],
];
export function seasonalMatch(title: string): CurriculumMatch | null {
  const t = fold(title);
  for (const [re, iso, label] of SEASONAL) if (re.test(t)) return { pos: schoolYearPosition(new Date(`${iso}T12:00:00`), SCHOOL_YEARS), label, kind: "seasonal", score: 1 };
  return null;
}

type IndexedLesson = { topic: string[]; section: string[]; label: string; weight: number };
/** Ismétlő / összefoglaló / felmérő óra: a valódi témaóra elé ne kerüljön. */
const REVIEW = /ismetl|osszefoglal|felmer|ev vegi|ev eleji|szamonker|dolgozat|temazaro|gyakorlas|ertekel/;
type IndexedPlan = { grade: number; subject: string; title: string; lessons: IndexedLesson[] };
export type CurriculumIndex = { plans: IndexedPlan[]; idf: Map<string, number> };

export function buildIndex(data: TanmenetData): CurriculumIndex {
  const df = new Map<string, number>();
  let docs = 0;
  const plans = data.plans.map(p => ({
    grade: p.grade, subject: p.subject, title: p.title,
    lessons: p.lessons.map(([section, topic]) => {
      const l = { topic: normalizeTokens(topic), section: normalizeTokens(section), label: `${section ? `${section} — ` : ""}${topic}`.slice(0, 160), weight: REVIEW.test(fold(`${section} ${topic}`)) ? 0.6 : 1 };
      docs++;
      for (const t of new Set([...l.topic, ...l.section])) df.set(t, (df.get(t) ?? 0) + 1);
      return l;
    }),
  }));
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log(1 + docs / n));
  return { plans, idf };
}

/** Egy cím-szó legjobb súlya az óra szavai között (tőegyezés; a témakör-fejléc 0,7-es súllyal). */
function tokenScore(word: string, lesson: IndexedLesson, idf: Map<string, number>): number {
  let best = 0;
  for (const t of lesson.topic) if (sameStem(word, t)) best = Math.max(best, idf.get(t) ?? 0);
  for (const t of lesson.section) if (sameStem(word, t)) best = Math.max(best, 0.7 * (idf.get(t) ?? 0));
  return best;
}

/** A küszöb a 207 éles anyag kézi átnézésével hangolva (lásd a PR mérését). */
export const MIN_SCORE = 5;

export function matchMaterial(input: { title: string; classroom: number }, index: CurriculumIndex): CurriculumMatch | null {
  const seasonal = seasonalMatch(input.title);
  if (seasonal) return seasonal;
  if (!input.classroom) return null;
  const words = [...new Set(normalizeTokens(input.title))];
  if (!words.length) return null;
  const subjects = subjectsOfTitle(input.title);
  let best: CurriculumMatch | null = null;
  for (const plan of index.plans) {
    if (plan.grade !== input.classroom || (subjects && !subjects.includes(plan.subject))) continue;
    plan.lessons.forEach((lesson, i) => {
      const score = lesson.weight * words.reduce((s, w) => s + tokenScore(w, lesson, index.idf), 0);
      if (score > (best?.score ?? 0)) best = { pos: (i + 0.5) / plan.lessons.length, label: `${plan.title}: ${lesson.label}`, kind: "tanmenet", score };
    });
  }
  return best && (best as CurriculumMatch).score >= MIN_SCORE ? best : null;
}
