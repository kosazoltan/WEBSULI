/**
 * Magyar nyelvű tanító/ismeretterjesztő YouTube-csatornák bankja a „Mai felfedezés” hírlevélhez
 * (docs/specs/2026-10-31-hirlevel-youtube-ajanlo.md). Kézzel gondozott, ELLENŐRZÖTT lista: minden URL 2026-10-31-én
 * böngészőben ellenőrizve létezik. A választás determinisztikus (nincs modellhívás): érdeklődés + évfolyam + napi rotáció.
 */
export type YoutubeChannel = {
  id: string;
  name: string;
  url: string;
  /** Gyereknyelvű, egy mondatos ajánló — fix szöveg, nem felhasználói/modell-tartalom. */
  description: string;
  /** Ékezet-lehajtott kulcsszótövek az érdeklődési címkék illesztéséhez. */
  keywords: readonly string[];
  /** Évfolyamsáv (zárt intervallum). */
  grades: readonly [number, number];
};

export const YOUTUBE_CHANNELS: readonly YoutubeChannel[] = [
  {
    id: "tizes-lista",
    name: "10-es lista",
    url: "https://www.youtube.com/@tizeslista",
    description: "A világ legérdekesebb történelmi és űrkutatási témái, egy-egy izgalmas tízes listában.",
    keywords: ["tortenel", "haboru", "okor", "kozepkor", "lovag", "kiraly", "egyiptom", "roma", "urkutat", "urhajo", "bolygo", "rejtely", "erdekesseg"],
    grades: [5, 12],
  },
  {
    id: "tortenelem-tananyagtar",
    name: "TÖRTÉNELEM TANANYAGTÁR",
    url: "https://www.youtube.com/channel/UCeRF89ZHgtzUGsnMN431mCQ",
    description: "Rövid, pár perces oktatóvideók az általános iskolai történelem témáihoz.",
    keywords: ["tortenel", "honfoglal", "kiraly", "varak", "okor", "kozepkor", "forradal", "magyarsag"],
    grades: [5, 8],
  },
  {
    id: "szertar",
    name: "Szertár",
    url: "https://www.youtube.com/szertar",
    description: "Látványos kísérletek és érthető tudományos magyarázatok a „miért van így?” kérdésekre.",
    keywords: ["kiserlet", "fizika", "kemia", "tudomany", "termeszet", "robban", "vegyi"],
    grades: [4, 12],
  },
  {
    id: "hogyan-mukodik",
    name: "Hogyan működik? Röviden - Tömören",
    url: "https://www.youtube.com/@HogyanMukodik",
    description: "Animációs videók arról, hogyan működik a világ: az atomoktól az űrig.",
    keywords: ["tudomany", "technika", "gep", "urkutat", "bolygo", "csillag", "termeszet", "allat", "test", "energia"],
    grades: [3, 10],
  },
  {
    id: "videotanar",
    name: "Videotanár - digitális tananyag",
    url: "https://www.youtube.com/user/videotanar",
    description: "Igazi tanárok magyarázzák el a felső tagozat tananyagát, 5-15 perces videókban.",
    keywords: ["matek", "matematik", "nyelvtan", "irodalom", "tortenel", "biologia", "foldrajz", "fizika", "kemia", "tananyag"],
    grades: [5, 8],
  },
  {
    id: "kerekmese",
    name: "KerekMese",
    url: "https://www.youtube.com/@kerekmese",
    description: "Kedves mesék, dalok és egyszerű tudományos magyarázatok a legkisebbeknek.",
    keywords: ["mese", "dal", "ének", "allat", "termeszet", "mondoka"],
    grades: [1, 3],
  },
] as const;

/** Ékezet-lehajtás és kisbetűsítés (a tanmenet-illesztő mintája — itt függőség nélkül, tisztán). */
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Egy érdeklődés-szó illik egy kulcsszótőre, ha egyik a másik prefixe, legalább 4 közös betűvel. */
function hits(word: string, keyword: string): boolean {
  const [s, l] = word.length <= keyword.length ? [word, keyword] : [keyword, word];
  return s.length >= 4 && l.startsWith(s);
}

/** 32 bites FNV-1a — determinisztikus rotációhoz (nem kriptográfiai cél). */
export function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Csatorna a tanulónak: az évfolyamhoz illők közül a legtöbb érdeklődés-kulcsszót találók halmazából determinisztikus
 * rotáció a seed szerint (a hívó a „nap|tanuló” seedet adja — így naponta változatos, újrapróbánál stabil).
 * Ha egyik csatorna sem illik az évfolyamhoz, null.
 */
export function pickYoutubeChannel(interests: readonly string[], grade: number, seed: string): YoutubeChannel | null {
  const eligible = YOUTUBE_CHANNELS.filter((c) => grade >= c.grades[0] && grade <= c.grades[1]);
  if (!eligible.length) return null;
  const words = [...new Set(interests.flatMap((i) => fold(i).split(/[^a-z0-9]+/)).filter((w) => w.length >= 4))];
  const scored = eligible.map((c) => ({ c, score: c.keywords.filter((k) => words.some((w) => hits(w, fold(k)))).length }));
  const best = Math.max(...scored.map((s) => s.score));
  const pool = best > 0 ? scored.filter((s) => s.score === best) : scored;
  return pool[fnv1a(seed) % pool.length].c;
}
