/**
 * A tanmenet-tantárgykulcsok (server/data/*tanmenet*.json `plans[].subject`) megjelenített neve a nyilvános főoldal
 * „Tantárgyanként” nézetéhez (docs/specs/2026-11-03-fooldal-nezetek.md). Az alsós és felsős magyar nyelvi kulcs ugyanaz a tantárgy.
 */
export const SUBJECT_LABELS: Readonly<Record<string, string>> = {
  angol: "Angol",
  biologia: "Biológia",
  "enek-zene": "Ének-zene",
  fizika: "Fizika",
  foldrajz: "Földrajz",
  francia: "Francia",
  "hit-es-erkolcstan": "Etika",
  informatika: "Digitális kultúra",
  kemia: "Kémia",
  kornyezetismeret: "Környezetismeret",
  "magyar-irodalom": "Irodalom",
  "magyar-nyelv-es-irodalom": "Magyar nyelv",
  "magyar-nyelvtan": "Magyar nyelv",
  matematika: "Matematika",
  "tarsadalmi-ismeretek": "Társadalmi ismeretek",
  termeszetismeret: "Természettudomány",
  tortenelem: "Történelem",
};

/** Tantárgy nélküli vagy ismeretlen kulcsú anyag csoportja — a lista végén. */
export const OTHER_SUBJECT = "Egyéb";

export function subjectLabel(key: string | null | undefined): string {
  return (key && SUBJECT_LABELS[key]) || OTHER_SUBJECT;
}
