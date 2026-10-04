import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding, formulaOf, formulaPresent } from "../server/studio/grounding";
import type { MapConcept } from "../server/studio/coverage";

/* Spec 2026-10-04-elo-proba-leletek (0. pont) — mért: job bce352a5 50/52, job 3b4b165c 74/74 képlet-fogalom „megalapozatlan”
 * volt, holott a blokk szó szerint tartalmazta (pl. „Számold ki: 5+(+8)! 5+(+8)=+13”). */
const concept = (term: string, quote: string): MapConcept => ({ localId: term, term, quote, definition: "A forrásban szereplő kivonási példa eredménye +3.", examWeight: "core" });

test("élő kivonatok: a képletet szó szerint tartalmazó blokk megalapozza a képlet-fogalmat", () => {
  assert.equal(checkGrounding("Számold ki: 5+(+8)! 5+(+8)=+13 Az első tag 5, a második tag +8. Add össze a 5-öt és a 8-at: 5+8=13.", concept("5+(+8)", "5+(+8)=+13")), true);
  assert.equal(checkGrounding("Számold ki: -5+(-8)! -5+(-8)=-13 Mindkét tag negatív: -5 és -8. Az 5 és a 8 összege 13.", concept("-5+(-8)", "-5+(-8)=-13 ✓")), true);
  assert.equal(checkGrounding("Számold ki: 9 − (+6)! Indulj a 9-ről a számegyenesen, haladj 6-ot balra. A végpont 3.", concept("9-(+6)", "9-(+6)=+3 ✓")), true, "szóköz és „−” jel normalizálva");
});

test("előjel-pontosság: a testvér-fogalmat tanító blokk NEM alapozza meg (az idézet-számok előjel-vak tartaléka itt nem számít)", () => {
  const block = "Számold ki: 9-(+6)! 9-(+6)=+3 Indulj a 9-ről a számegyenesen. Haladj 6-ot balra: 9, 8, 7, 6, 5, 4, 3. A végpont 3.";
  assert.equal(checkGrounding(block, concept("9-(-6)", "9-(-6)=+3")), false);
  assert.equal(checkGrounding("Számold ki: -2-89 eredményét, és indokold a lépéseket a számegyenesen.", concept("-2-8", "-2-8=-+6")), false, "számhatár: -2-89 ≠ -2-8");
  assert.equal(checkGrounding("Számold ki: 15+(+8) eredményét a számegyenesen lépésenként.", concept("5+(+8)", "5+(+8)=+13")), false, "számhatár: 15+(+8) ≠ 5+(+8)");
});

test("változatlan: rövid blokk nem alapoz meg; szöveges fogalom a régi szabály szerint; képlet-felismerés", () => {
  assert.equal(checkGrounding("5+(+8)=+13", concept("5+(+8)", "5+(+8)=+13")), false, "4 szónál rövidebb blokk");
  const text: MapConcept = { localId: "t", term: "Negatív számok kivonása", definition: "A téma a negatív számok kivonása.", examWeight: "core" };
  assert.equal(checkGrounding("A negatív számok kivonásakor az ellentett hozzáadására gondolunk.", text), true);
  assert.equal(checkGrounding("A példák ellenőrzéséhez haladj végig ezen a meneten lépésről lépésre.", text), false);
  assert.equal(formulaOf("9 − (−6)"), "9-(-6)");
  assert.equal(formulaOf("Számegyenes jelölései"), null);
  assert.equal(formulaOf("12 cm"), null, "betűt tartalmazó név nem képlet");
  assert.equal(formulaPresent("-8-6", "a -8-6=-14 sor"), true);
  assert.equal(formulaPresent("-8-6", "a -8-60 sor"), false);
});
