import test from "node:test";
import assert from "node:assert/strict";
import { decideNonWordLines, locateOcrDisagreements, markUnresolvedDisputes, UNCERTAIN_MARK } from "../server/studio/ocr";
import { nonWordLines } from "../server/studio/ocr-lexicon";
import { checkVerbatim } from "../server/studio/verbatim";
import { autoReviewDecision } from "../server/studio/auto-approve";

/* Spec 2026-10-05 S11/6 + S9/7 — a 4 történelem-lap futásának hibái (mért: job 8953db4b, map d70d8f67). */

const mark = UNCERTAIN_MARK.replace(/[?[\]]/g, "\\$&");
const count = (s: string) => s.split(UNCERTAIN_MARK).length - 1;

// A mért kódex-lap (5-kodex-forrasok.jpg) forrás-ábrája: erős (gpt-6.1-sol) olvasat, gyenge (qwen) olvasat, a döntő olvasat.
const STRONG = "A történelem forrásai\n→ tárgyak\n→ írott emlékek\n→ szellemi (\nszóbeli [olvashatatlan]\n\nírott emlékek\n→ elsődleges\nforrások\n→ másodlagos\nforrások";
const WEAK = "Történelem forrásai  \n↓  \nháttér emlékek  \n←→ szellemit/  \nsóbeli fo  \n↓ ↓  \nelsődleges  \nforrások  \nmásodlagos  \nforrások";
const DECIDED = "A történelem forrásai\n↙ tárgyak\n↓ írott emlékek\n↘ szellemi (\nszóbeli [olvashatatlan]\n\nírott emlékek\n↙ elsődleges\nforrások\n↘ másodlagos\nforrások";

test("(2a) csak-nyíl/írásjel változtatás nem harmadik alak és nem vita — a mért kódex-lapon a nyilak jel nélkül", () => {
  const located = locateOcrDisagreements(STRONG, WEAK);
  const out = markUnresolvedDisputes(DECIDED, located, STRONG, { thirdFormOnly: true });
  assert.doesNotMatch(out, /[↙↘↓]⟦\?⟧/u, out);
  assert.match(out, /↙ elsődleges\nforrások\n↘ másodlagos/u);
});

test("(2a) csak-írásjel/nyíl/szóköz vita a vita-alapú jelölésben sem jelölt; az érdemi szó-vita igen", () => {
  const first = "Keresztény időszámítás ← | → Jézus Krisztus születése";
  const second = "Keresztény időszámítás Jézus Krisztus születése";
  assert.equal(markUnresolvedDisputes(first, locateOcrDisagreements(first, second), first), first, "a „← | →” egyoldalú eltérés nem vita");
  const a = "→ teremtéstörténet → intelligens kezdet?", b = "→ teremtéstörténet → intelligens teremtés?";
  assert.match(markUnresolvedDisputes(a, locateOcrDisagreements(a, b), a), new RegExp(`kezdet\\?${mark}`), "a szó-vita marad jelölt");
});

test("(3) a harmadik alak MINDEN új szava jelet kap (mért: „a fáraók uralkodási évének” → „a Nílus áradási éveinek”)", () => {
  const first = "Egyiptom: a fáraók uralkodási évének őskori kezdetétől";
  const second = "Egyiptom: a fáraók uralkodási évenek őskori kezdetétől";
  const decided = "Egyiptom: a Nílus áradási éveinek őskori kezdetétől";
  const located = locateOcrDisagreements(first, second);
  const expected = `Egyiptom: a Nílus${UNCERTAIN_MARK} áradási${UNCERTAIN_MARK} éveinek${UNCERTAIN_MARK} őskori kezdetétől`;
  assert.equal(markUnresolvedDisputes(decided, located, first, { thirdFormOnly: true }), expected);
  assert.equal(markUnresolvedDisputes(decided, located, first), expected, "a vita-alapú úton is");
  // az olvasatokban szereplő szó nem kap jelet (csak az új)
  const partly = "Egyiptom: a fáraók áradási évének őskori kezdetétől";
  assert.equal(markUnresolvedDisputes(partly, located, first, { thirdFormOnly: true }), `Egyiptom: a fáraók áradási${UNCERTAIN_MARK} évének őskori kezdetétől`);
});

test("(2b) a szó szerinti ellenőrzés a jelölőket, a nyilakat és a soremelést figyelmen kívül hagyja; a ⟦?⟧ a nyers idézetből pending", () => {
  const source = "A történelem forrásai\n↙⟦?⟧ tárgyak\n↓ írott emlékek\n\nírott emlékek\n↙⟦?⟧ elsődleges\nforrások\n↘⟦?⟧ másodlagos\nforrások\n[KERET: társadalom]\n1. élén: a király\n[KERET VÉGE]";
  assert.equal(checkVerbatim("írott emlékek elsődleges források", source).ok, true);
  assert.equal(checkVerbatim("írott emlékek\n↙⟦?⟧ elsődleges\nforrások", source).ok, true);
  assert.equal(checkVerbatim("↓ írott emlékek", "A történelem forrásai\n→ tárgyak\n→ írott emlékek").ok, true, "más nyíl a forrásban");
  assert.equal(checkVerbatim("társadalom 1. élén: a király", source).ok, false, "a keret felirata jelölő, nem forrásszöveg");
  assert.equal(checkVerbatim("1. élén: a király", source).ok, true);
  // mért c41: az idézet átugorja az elsődleges sorokat → továbbra sem szó szerinti
  assert.deepEqual(checkVerbatim("írott emlékek\n↘⟦?⟧ másodlagos\nforrások", source), { ok: false, reason: "not_found" });
  // a jelölt szót tartalmazó idézet igazolt, de továbbra sem tény (S11, változatlan)
  const quote = "Hold változása → kőnaptár⟦?⟧ készítése az őskorban";
  const verbatimOk = checkVerbatim(quote, "Hold változása → kőnaptár készítése az őskorban").ok;
  assert.equal(verbatimOk, true);
  assert.equal(autoReviewDecision({ examWeight: "core", verbatimOk, uncertainQuote: quote.includes(UNCERTAIN_MARK) }), "pending");
  assert.equal(autoReviewDecision({ examWeight: "core", verbatimOk: checkVerbatim("Hold változása → kőnaptár készítése", source + "\nHold változása → kőnaptár készítése").ok }), "kept");
});

test("(4) szótár-őr: ≤ 2 betűs „javítás” nem cserél és nem jelöl („Negrid” marad); érdemi eltérés cserél („Kesia” → „Ázsia”)", () => {
  const KNOWN = new Set(["negroid", "feketék", "mongolid", "sárgák", "ázsia", "közel-kelet", "közel", "kelet", "föld", "térsége"]);
  const isWord = (w: string) => KNOWN.has(w.toLowerCase());
  const page = "↙ Europid\n(fehérek)\n↓ Negrid\n(feketék)";
  const lines = nonWordLines(page, (w) => isWord(w) || ["europid", "fehérek"].includes(w.toLowerCase()));
  assert.deepEqual(lines.map((l) => l.words), [["Negrid"]]);
  const kept = decideNonWordLines(page, lines, new Map([[lines[0].line, "Negroid"]]), isWord);
  assert.equal(kept.text, page, "az eredeti „Negrid” marad, jel nélkül");
  assert.equal(kept.replaced.length, 0);
  assert.equal(kept.kept.length, 1);
  assert.equal(count(kept.text), 0);

  const kesia = "Kesia, Föld - Felt. térsége";
  const swapped = decideNonWordLines(kesia, nonWordLines(kesia, isWord), new Map([[1, "Ázsia, Közel-Kelet térsége"]]), isWord);
  assert.equal(swapped.text, "Ázsia, Közel-Kelet térsége");
  assert.equal(swapped.replaced.length, 1);
  // a kérdéses szó > 2 betűs eltérése ugyanannyi szóval is csere
  const far = "Kesia térsége";
  assert.equal(decideNonWordLines(far, nonWordLines(far, isWord), new Map([[1, "Mongolid térsége"]]), isWord).text, "Mongolid térsége");
});
