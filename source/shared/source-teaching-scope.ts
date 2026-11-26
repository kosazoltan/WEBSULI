/**
 * TG-P2a (docs/specs/2026-11-26-tananyag-gyakorlati-p2-vegrehajtas.md): a forrás pontozási / adminisztratív szövege nem lehet
 * tanítandó fogalom — különben a gyártás „Hány pontot ér…?” jellegű tételt épít rá. Determinisztikus, modell nélkül.
 * A vegyes sor (pl. „Elfogadható: osz-tály — 1 pont”) tanított része (a példaszó) miatt elfogadott.
 */

/** A fogalom neve / definíciója a lap pontozására, időkeretére vagy felépítésére vonatkozik. */
const ADMIN_TERM = /(pontoz|pontszám|részpont|pontérték|javítási útmutató|értékelési útmutató|javítókulcs|időkeret|munkaidő|feladatlap|feladatsor|feladattípus)/iu;
/** Pontozási mondat: „N pont jár / adható / ér / kap”, „összesen N pont”. A „két pont meghatároz…” (geometria) nem ilyen. */
const SCORE_SENTENCE = /(\d+\s*pont(?:ot)?(?![\p{L}])[^.]*?(?:jár|adható|(?<![\p{L}])ér(?![\p{L}])|kap|levon)|(?:jár|adható)[^.]*\d+\s*pont|összesen\s*\d+\s*pont)/iu;
/** Időkeret-mondat: „45 perc áll rendelkezésre”. */
const TIME_SENTENCE = /(\d+\s*perc(?![\p{L}])[^.]*(?:rendelkezés|időkeret)|időkeret)/iu;
/** Tanított tartalom a mondatban: elválasztott alak, egyenlőség, idézett szöveg, kémiai / matematikai jelölés. */
const TEACHING_PAYLOAD = /(\p{L}+-\p{L}+|=|„[^”]+”|"[^"]+"|«[^»]+»|(?<![\p{L}])[A-Z][a-z]?\d)/u;

export function adminConceptProblem(c: { id: string; term: string; definition: string; quote: string }): string | null {
  const adminTerm = ADMIN_TERM.test(c.term) || ADMIN_TERM.test(c.definition);
  const adminQuote = (SCORE_SENTENCE.test(c.quote) || TIME_SENTENCE.test(c.quote)) && !TEACHING_PAYLOAD.test(c.quote);
  if (!adminTerm && !adminQuote) return null;
  return `${c.id}: a fogalom a feladatlap pontozására / időkeretére / felépítésére vonatkozik („${c.quote.slice(0, 100)}”) — ez nem tanítandó fogalom: hagyd ki, vagy a mellette álló tanított példát / szabályt idézd.`;
}
