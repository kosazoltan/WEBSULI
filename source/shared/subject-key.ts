import { CATALOG_SUBJECTS, type CatalogSubject } from "./catalog-taxonomy";

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

const BY_KEY = new Map<string, CatalogSubject>(CATALOG_SUBJECTS.map((s) => [normalize(s.replace(/-/g, " ")), s]));

export function subjectKeyOf(text: string | null | undefined): CatalogSubject | null {
  if (!text) return null;
  const key = normalize(text);
  if (!key) return null;
  if (key in SYNONYMS) return SYNONYMS[key];
  return BY_KEY.get(key) ?? null;
}
