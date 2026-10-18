/**
 * Arculati bank S4 (docs/specs/2026-10-18-arculati-bank-s4.md): a lejátszó ismétlődő feliratai kódszótárban.
 * A modell a lecke-specifikus szöveget írja; az ítéletet, a sablonos fejezetcímet és a módszercímkét a kód adja.
 */

/** A választás ítélete — a lejátszó a `correctIndex`-ből tudja, a modell szövegéből nem kell kiolvasni. */
export const VERDICT_TEXT = { right: "Helyes!", wrong: "Még nem helyes." } as const;

/**
 * A modell által írt ítélet-előtag levágása megjelenítéskor („Helyes: 45.”, „Nem helyes. A szorzás…”). Csak akkor vág, ha az
 * ítéletszó után írásjel áll — „Nem minden szám…”, „Igenis…” változatlan marad. A mentett adat nem változik: a minőségellenőrző
 * (`quizCorrectIndexProblems`) az előtagra támaszkodik.
 */
const VERDICT_PREFIX = /^\s*(?:nem\s+helyes|helyes|téves|igen|nem|így\s+van|pontosan|jó\s+válasz|rossz\s+válasz)\s*[.:,!–—-]+\s*/i;
export function stripVerdictPrefix(text: string): string {
  const rest = text.replace(VERDICT_PREFIX, "");
  if (rest === text || !rest.trim()) return text;
  return rest.charAt(0).toLocaleUpperCase("hu") + rest.slice(1);
}

/** A tervező sablonos záró fejezetei — a prompt és a lejátszó ugyanebből a szótárból veszi a címet. */
export const SECTION_ROLE_HEADING = {
  workedSolution: "A feladat megoldva lépésről lépésre",
  mistakes: "A leggyakoribb hibák",
  selfCheck: "Ellenőrzés – hogyan légy biztos magadban?",
} as const;
export type SectionRole = keyof typeof SECTION_ROLE_HEADING;
const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("hu").replace(/[„”"'.!?]/g, "").replace(/[–—-]/g, "-").replace(/\s+/g, " ").trim();
export function sectionRoleOf(heading: string): SectionRole | null {
  const h = norm(heading);
  for (const [role, text] of Object.entries(SECTION_ROLE_HEADING) as Array<[SectionRole, string]>) if (norm(text) === h) return role;
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
      if (rest.trim()) return rest.charAt(0).toLocaleUpperCase("hu") + rest.slice(1);
    }
  }
  return title;
}
