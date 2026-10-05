/**
 * Spec 2026-10-05-s2-tartalom-besorolas: a tantárgyi katalógus-bankok taxonómiája.
 *
 * Tulajdonosi döntés (2026-10-05): minden tantárgy és MINDEN természettudományi ág KÜLÖN bank — a közös bank a lektornak
 * ellentmondó mércéket adna. Ugyanezért külön a magyar nyelvtan és irodalom, és külön minden idegen nyelv.
 * Szándékosan import nélküli (a kliens is használhatja).
 */
export const CATALOG_SUBJECTS = [
  "matematika",
  "magyar-nyelvtan",
  "magyar-irodalom",
  "tortenelem",
  "tarsadalmi-ismeretek",
  "kornyezetismeret",
  "termeszetismeret",
  "biologia",
  "kemia",
  "fizika",
  "foldrajz",
  "angol",
  "nemet",
  "francia",
  "informatika",
  "enek-zene",
  "hit-es-erkolcstan",
  "vizualis-kultura",
  "technika",
] as const;
export type CatalogSubject = (typeof CATALOG_SUBJECTS)[number];

/** Emberi megnevezés (admin-felület, prompt). */
export const SUBJECT_LABELS: Record<CatalogSubject, string> = {
  matematika: "Matematika",
  "magyar-nyelvtan": "Magyar nyelvtan",
  "magyar-irodalom": "Magyar irodalom",
  tortenelem: "Történelem",
  "tarsadalmi-ismeretek": "Társadalmi és állampolgári ismeretek",
  kornyezetismeret: "Környezetismeret (1–4. évfolyam)",
  termeszetismeret: "Természettudomány / természetismeret (5–6. évfolyam, integrált)",
  biologia: "Biológia",
  kemia: "Kémia",
  fizika: "Fizika",
  foldrajz: "Földrajz",
  angol: "Angol nyelv",
  nemet: "Német nyelv",
  francia: "Francia nyelv",
  informatika: "Informatika / digitális kultúra",
  "enek-zene": "Ének-zene",
  "hit-es-erkolcstan": "Hit- és erkölcstan / bibliaismeret / etika",
  "vizualis-kultura": "Vizuális kultúra",
  technika: "Technika és tervezés",
};

export const LESSON_TYPES = [
  "fogalomtanito",
  "gyakorlo-feladatlap",
  "szokincs-nyelvi",
  "irodalmi-mu",
  "temazaro-felkeszito",
  "tanuloi-munka-javitas",
  "gyakorlati-projekt",
  "egyeb",
] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export const LESSON_TYPE_LABELS: Record<LessonType, string> = {
  fogalomtanito: "fogalom-tanító tartalomlecke (fejezetek, magyarázat, ellenőrző kérdések)",
  "gyakorlo-feladatlap": "gyakorló feladatlap (sok feladat, kevés magyarázat)",
  "szokincs-nyelvi": "szókincs- és nyelvi forma lecke (sok rövid kérdés, kifejezések, kiejtés)",
  "irodalmi-mu": "irodalmi mű feldolgozása / szövegértés",
  "temazaro-felkeszito": "témazáró / versenyre vagy mérésre felkészítő (több témakör)",
  "tanuloi-munka-javitas": "tanulói munka (hibás megoldások) javítása",
  "gyakorlati-projekt": "gyakorlati / projekt jellegű (pl. programozás, eszközhasználat)",
  egyeb: "egyéb",
};

/** A katalógus-bank kulcsa: tantárgyanként (és águnként) külön. */
export const subjectBankKey = (subject: CatalogSubject): string => `bank:${subject}`;
