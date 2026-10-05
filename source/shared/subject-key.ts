import { CATALOG_SUBJECTS, SUBJECT_LABELS, type CatalogSubject } from "./catalog-taxonomy";

/**
 * Spec 2026-10-05-s4-tantargyi-skillek: a gyártás szabad szöveges tantárgya (`knowledge_maps.subject`) → katalógus-bank kulcs.
 * Determinisztikus: csak pontos (normalizált) egyezés vagy explicit szinonima; ismeretlen vagy kétértelmű → null (nincs
 * találgatás — a „Magyar nyelv és irodalom” két külön bank, a tartalom nélkül nem dönthető el). Mért értékek (éles DB,
 * 2026-10-05): Természetismeret, Matematika, Történelem, környezetismeret, magyar nyelv és irodalom, Informatika, földrajz,
 * Történelem és társadalmi ismeretek.
 */
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b\d{1,2}\s*\.?\s*(?:osztaly|evfolyam)\w*/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

const SYNONYMS: Record<string, CatalogSubject | null> = {
  "matek": "matematika",
  "tortenelem es tarsadalmi ismeretek": "tortenelem",
  "tortenelem tarsadalmi es allampolgari ismeretek": "tortenelem",
  "tarsadalmi es allampolgari ismeretek": "tarsadalmi-ismeretek",
  "termeszettudomany": "termeszetismeret",
  "nyelvtan": "magyar-nyelvtan",
  "magyar nyelv": "magyar-nyelvtan",
  "magyar nyelvtan": "magyar-nyelvtan",
  "irodalom": "magyar-irodalom",
  "magyar irodalom": "magyar-irodalom",
  "magyar nyelv es irodalom": null,
  "magyar": null,
  "angol nyelv": "angol",
  "nemet nyelv": "nemet",
  "francia nyelv": "francia",
  "digitalis kultura": "informatika",
  "enek": "enek-zene",
  "enek zene": "enek-zene",
  "etika": "hit-es-erkolcstan",
  "hittan": "hit-es-erkolcstan",
  "rajz": "vizualis-kultura",
  "vizualis kultura": "vizualis-kultura",
  "technika es tervezes": "technika",
};

// A hivatalos megjelenített nevek (zárójeles rész nélkül) is kulcsok — a szinonimák elsőbbséget élveznek (review #193, S4 spec).
const BY_KEY = new Map<string, CatalogSubject>([
  ...CATALOG_SUBJECTS.map((s) => [normalize(SUBJECT_LABELS[s].replace(/\([^)]*\)/g, " ")), s] as const),
  ...CATALOG_SUBJECTS.map((s) => [normalize(s.replace(/-/g, " ")), s] as const),
]);

const lookup = (key: string): CatalogSubject | null | undefined => (key in SYNONYMS ? SYNONYMS[key] : BY_KEY.get(key));

export function subjectKeyOf(text: string | null | undefined): CatalogSubject | null {
  if (!text) return null;
  const key = normalize(text);
  if (!key) return null;
  // Teljes szöveg előbb; ha nincs találat, a zárójeles rész nélkül (pl. „Környezetismeret (1–4. évfolyam)”).
  const exact = lookup(key);
  if (exact !== undefined) return exact;
  const bare = normalize(text.replace(/\([^)]*\)/g, " "));
  return bare && bare !== key ? lookup(bare) ?? null : null;
}
