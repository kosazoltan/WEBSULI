/**
 * TG-P2a (docs/specs/2026-11-26-tananyag-gyakorlati-p2-vegrehajtas.md): a forrás pontozási / adminisztratív szövege nem lehet
 * tanítandó fogalom — különben a gyártás „Hány pontot ér…?” jellegű tételt épít rá. Determinisztikus, modell nélkül.
 *
 * review #630: a döntés a fogalom NEVÉN (nem a definícióján) és az idézet maradékán alapul: a pontozási / időkeret-töredéket
 * és a lap szókincsét levonva marad-e tanított tartalom (példaszó, helyes válasz, képlet). Így a vegyes sor („Elfogadható:
 * Budapest — 1 pont”), a szakfogalom („pontozott vonal”) és a sportadat („Egy kosárért 2 pont jár.”) tanítható marad.
 * Lookbehind nélkül (a shared modulok a kliens csomagba is kerülhetnek — tests/no-lookbehind-client.test.ts).
 */

/** A fogalom NEVE a lap pontozására, időkeretére, sorszámára vagy felépítésére vonatkozik (a név elejére illesztve). */
const ADMIN_TERM = /^(?:a |az )?(?:pontozás|pontszám|részpontszám|részpont|pontérték|javítási útmutató|értékelési útmutató|javítókulcs|időkeret|munkaidő|feladatlap|feladatsor|feladattípus|sorszám|feladatszám)/iu;
const NUM = "(?:\\d+(?:[,.]\\d+)?|egy|két|kettő|három|négy|öt|hat|hét|nyolc|kilenc|tíz)";
/** Pontozási töredék: „N pont (jár / adható / ér / kap)”, „összesen N pont”, „N. feladat”. A „pontozott” szó nem ilyen. */
const SCORE_SRC = `(?:^|[^\\p{L}])(?:${NUM}\\s*pont(?:ot|ja)?(?![\\p{L}])(?:\\s+(?:jár|adható|ér|kap|kaphat|vonható le))?|összesen\\s*${NUM}\\s*pont|\\d+\\.\\s*feladat)`;
/** Időkeret-töredék: „45 perc áll rendelkezésre”, „időkeret”. */
const TIME_SRC = "(?:\\d+\\s*perc(?:\\s+(?:áll|van))?(?:\\s+rendelkezésre)?|időkeret)";
/** Sportadat: a pont itt tanított tény, nem a lap pontozása. */
const SPORT = /(kosár|gól|mérkőzés|meccs|verseny|játékos|csapat|dobás|pálya|bajnokság|szett|játszma)/iu;
/**
 * A lap és a pontozás szókincse — ami ezen kívül marad, az tanított tartalom. review #630/2: a rövid szó és a számnév csak EGÉSZ
 * szóként (különben az „alma”, „állat”, „egyenes”, „háromszög” válasz is lapszónak számítana); a hosszabb tő ragozva is.
 */
const SHEET_WORD = /^(?:(?:a|az|és|is|csak|minden|mind|jó|ér|ért|áll|van|kap|jár|rész|teljes|pont|pontot|pontja|pontért|egy|két|kettő|három|négy|öt|hat|hét|nyolc|kilenc|tíz)$|helyes|hibátlan|megold|válasz|feladat|összesen|elfogad|adható|levon|tétel|kérdés|perc|időkeret|rendelkez)/iu;

/** Tanított tartalom marad-e az idézetben a pontozási / időkeret-töredék és a lap szókincse nélkül. */
function teachingResidue(quote: string): boolean {
  const rest = quote.replace(new RegExp(SCORE_SRC, "giu"), " ").replace(new RegExp(TIME_SRC, "giu"), " ");
  return rest.split(/[\s:;,.!?()–—"„”«»/-]+/u).some((tok) => /\p{L}/u.test(tok) && !SHEET_WORD.test(tok));
}

const clean = (s: string) => s.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();

export function adminConceptProblem(c: { id: string; term: string; definition: string; quote: string }): string | null {
  const adminTerm = ADMIN_TERM.test(c.term.trim());
  const scored = new RegExp(SCORE_SRC, "iu").test(c.quote) || new RegExp(TIME_SRC, "iu").test(c.quote);
  const adminQuote = scored && !SPORT.test(c.quote) && !SPORT.test(c.term) && !teachingResidue(c.quote);
  if (!adminTerm && !adminQuote) return null;
  return `${c.id}: a fogalom a feladatlap pontozására / időkeretére / felépítésére vonatkozik („${clean(c.quote).slice(0, 100)}”) — ez nem tanítandó fogalom: hagyd ki, vagy a mellette álló tanított példát / szabályt idézd.`;
}

/** review #630: a validátor előtt mentett (vagy újrahasznált) térkép adminisztratív fogalma kiesik, naplózva. */
type StoredConcept = { id?: string; localId?: string; term?: string; definition?: string; quote?: string };
export function dropAdminConcepts<C extends StoredConcept, M extends { concepts: C[] }>(map: M, log?: (msg: string) => void): M {
  const idOf = (c: C) => c.localId ?? c.id ?? "?";
  const dropped = map.concepts.filter((c) => adminConceptProblem({ id: idOf(c), term: c.term ?? "", definition: c.definition ?? "", quote: c.quote ?? "" }));
  if (!dropped.length) return map;
  log?.(`[EGYFUTÁS] TG-P2a: a mentett térkép adminisztratív fogalma kihagyva: ${dropped.map(idOf).join(", ")}`);
  return { ...map, concepts: map.concepts.filter((c) => !dropped.includes(c)) };
}
