/**
 * Arculati bank S4 (docs/specs/2026-10-18-arculati-bank-s4.md): a lejátszó ismétlődő feliratai kódszótárban.
 * A modell a lecke-specifikus szöveget írja; az ítéletet, a sablonos fejezetcímet és a módszercímkét a kód adja.
 */

/** A választás ítélete — a lejátszó a `correctIndex`-ből tudja, a modell szövegéből nem kell kiolvasni. */
export const VERDICT_TEXT = { right: "Helyes!", wrong: "Még nem helyes." } as const;

/**
 * A modell által írt ítélet-előtag levágása megjelenítéskor („Helyes: 45.”, „Nem helyes. A szorzás…”). Csak akkor vág, ha az
 * ítéletszó után írásjel áll — „Nem minden szám…”, „Igenis…” változatlan marad. A számhoz tapadó mínusz előjel, nem elválasztó
 * („Helyes:-3”, „Nem -5, hanem -3.”). A csak ítéletből álló szöveg („Igen.”) üres lesz — az ítéletet a kód adja. A mentett adat
 * nem változik: a minőségellenőrző (`quizCorrectIndexProblems`) az előtagra támaszkodik.
 */
const VERDICT_PREFIX = /^\s*(?:nem\s+helyes|helyes|téves|igen|nem|így\s+van|pontosan|jó\s+válasz|rossz\s+válasz)\s*(?:[.:,!]|[–—-](?!\d))+\s*/i;
export function stripVerdictPrefix(text: string): string {
  const rest = text.replace(VERDICT_PREFIX, "");
  if (rest === text) return text;
  return capitalizeProse(rest);
}

/**
 * Nagy kezdőbetű a levágás után — csak prózai szónál. A jelölés (pH, x = 2, cm-ben, kg) változatlan marad: csak a csupa
 * kisbetűs, legalább 4 betűs szó vagy egy gyakori névelő / kötőszó nagyobbodik, és nem követi egyenlőség vagy műveleti jel.
 */
const PROSE_START_WORDS = new Set(["a", "az", "egy", "ez", "ezt", "ezért", "de", "és", "ha", "itt", "így", "nem", "jó", "ami", "aki", "mi", "ki", "most"]);
function capitalizeProse(text: string): string {
  const m = /^([a-záéíóöőúüű]+)(?=[\s,;.!?]|$)(?!\s*[=<>+*/^])/.exec(text);
  if (!m || (m[1].length < 4 && !PROSE_START_WORDS.has(m[1]))) return text;
  return text.charAt(0).toLocaleUpperCase("hu") + text.slice(1);
}

/** A tervező sablonos záró fejezetei — a prompt és a lejátszó ugyanebből a szótárból veszi a címet. */
export const SECTION_ROLE_HEADING = {
  workedSolution: "A feladat megoldva lépésről lépésre",
  mistakes: "A leggyakoribb hibák",
  selfCheck: "Ellenőrzés – hogyan légy biztos magadban?",
} as const;
export type SectionRole = keyof typeof SECTION_ROLE_HEADING;
const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("hu").replace(/[„”"'.!?]/g, "").replace(/[–—-]/g, "-").replace(/\s+/g, " ").trim();
/**
 * A szerep-skill (`server/studio/role-skills.ts`, pedagógus) rövid alakjai — a tervező ezekkel is elnevezheti a sablonos fejezetet;
 * a szerep ugyanaz, a lejátszó a szótár feliratát mutatja. (A skill szövege bájtra marad: a változása a futó checkpointokat érvénytelenítené.)
 */
const SECTION_ROLE_ALIASES: Record<SectionRole, string[]> = {
  workedSolution: ["A feladat megoldva"],
  mistakes: ["Leggyakoribb hibák"],
  selfCheck: ["Ellenőrzés"],
};
export function sectionRoleOf(heading: string): SectionRole | null {
  const h = norm(heading);
  for (const role of Object.keys(SECTION_ROLE_HEADING) as SectionRole[]) {
    if ([SECTION_ROLE_HEADING[role], ...SECTION_ROLE_ALIASES[role]].some(t => norm(t) === h)) return role;
  }
  return null;
}
/** A megjelenített fejezetcím: sablonos szerepnél a szótár szövege, egyébként a lecke saját címe. */
export const displayHeading = (heading: string) => {
  const role = sectionRoleOf(heading);
  return role ? SECTION_ROLE_HEADING[role] : heading;
};

/** A kognitív módszerek címkéje (a módszer fajtája szerint). */
export const METHOD_LABEL = {
  prediction: "Jósolj!", gate: "Kapukérdés", myth: "Tévhitvadász", sorting: "Rendezd sorba!", causeEffect: "Ok és következmény",
  conflict: "Gondold újra!", selfCheck: "Önértékelés", popup: "Villámkérdés", timeline: "Lépésről lépésre", analogy: "Kapcsold össze!",
} as const;
export type MethodKind = keyof typeof METHOD_LABEL;
/** A modell által a címbe írt, a címkét ismétlő előtagok (mért: „Kapukérdés:”, „Tévhit:”, „Előrejelzés:”, „Ellenőrző ablak:”). */
const METHOD_PREFIXES: Record<MethodKind, string[]> = {
  prediction: ["Jósolj", "Előrejelzés", "Jóslat"], gate: ["Kapukérdés"], myth: ["Tévhitvadász", "Tévhit"], sorting: ["Rendezd sorba", "Sorrend"],
  causeEffect: ["Ok és következmény", "Ok-okozat"], conflict: ["Gondold újra"], selfCheck: ["Önértékelés", "Ellenőrző ablak"],
  popup: ["Villámkérdés"], timeline: ["Lépésről lépésre", "Idővonal"], analogy: ["Kapcsold össze", "Analógia", "Hasonlat"],
};
export function stripMethodPrefix(title: string, kind: MethodKind): string {
  for (const p of METHOD_PREFIXES[kind] ?? []) {
    const re = new RegExp(`^\\s*${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[!]?\\s*[:–—-]\\s*`, "i");
    if (re.test(title)) {
      const rest = title.replace(re, "");
      if (rest.trim()) return capitalizeProse(rest);
    }
  }
  return title;
}
