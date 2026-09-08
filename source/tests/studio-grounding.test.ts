import assert from "node:assert/strict";
import test from "node:test";

import { checkGrounding, groundingReport } from "../server/studio/grounding";
import type { MapConcept } from "../server/studio/coverage";

test("a pi matematikai jel is mérhető, de idegen szöveg nem igazolja", () => {
  const concept = { localId: "pi", term: "π" } as MapConcept;
  assert.equal(checkGrounding("A π irracionális szám, közelítő értéke 3,14.", concept), true);
  assert.equal(checkGrounding("A háromszög területe az alap és magasság szorzatának fele.", concept), false);
  assert.equal(checkGrounding("π", concept), false);
});

test("folyamatábra látható lépése igazolhat fogalmat, rejtett adat nem", () => {
  const concepts = [{ localId: "C", term: "Kör kerülete" } as MapConcept];
  const block = { kind: "animate", animKind: "process", coversConceptIds: ["C"], params: { steps: ["A kör kerülete két sugár és π szorzata."] } };
  assert.equal(groundingReport([block], concepts).ok, true);
  assert.equal(groundingReport([{ ...block, params: { hidden: block.params.steps } }], concepts).ok, false);
});

test("try látható szövege mérhető, rejtett megoldása és címkéje nem bizonyíték", () => {
  const c = [{ localId: "area", term: "Háromszög területe", examWeight: "core" }] as MapConcept[];
  for (const [tryKind, spec] of [
    ["fillBlank", { text: "A háromszög területe alap szor magasság osztva ___.", answers: ["2"] }],
    ["dragSort", { items: ["A háromszög területe", "Alap szor magasság osztva kettővel"], correctOrder: ["A háromszög területe", "Alap szor magasság osztva kettővel"] }],
    ["match", { pairs: [{ left: "A háromszög területe", right: "Alap szor magasság fele" }] }],
  ]) {
    assert.equal(groundingReport([{kind:"try",tryKind,spec,coversConceptIds:["area"]}],c).ok,true);
  }
  assert.equal(groundingReport([{kind:"try",tryKind:"fillBlank",spec:{text:"Írd be a hiányzó szót: ___",answers:["Háromszög területe"],concept:"Háromszög területe"},coversConceptIds:["area"]}],c).ok,false);
});

/**
 * #196 — a szerző MEGKERÜLTE a forrást, és hamis címkékkel átcsúszott a kapun.
 *
 * MÉRVE ÉLESBEN (Kristóf-lecke, 2026-09-06, map c53973f8):
 *  - a feltöltött forrás 8. osztályos geometria volt: „T = a · ma / 2",
 *    „K = d · π", „T = r²π", körgyűrű, körcikk, „(n-2)·180°";
 *  - a tudás-térkép ezt HELYESEN kivonatolta (28 fogalom, verbatim idézetekkel);
 *  - a lecke mégis 4. osztályos helyiértéket, írásbeli összeadást és
 *    „24 ceruzát 6 gyerek között" feladatot tanított;
 *  - a fedettségi kapu mégis `ok: true`, `core 7/7`, `supporting 15/15`.
 *
 * Miért: a `checkCoverageGate` KIZÁRÓLAG a `coversConceptIds` címkéket számolja
 * (`ids.has(c.localId)`), a blokk SZÖVEGÉT soha nem nézi. A modell ráírta a
 * `C01`("Háromszög területe") címkét egy helyiérték-magyarázatra, és a kapu
 * 100%-ot mért. Egy ID-egyezés nem bizonyíték arra, hogy a blokk tanítja is a
 * fogalmat — a lefedettség állítás, amit igazolni kell.
 */

const CONCEPTS: MapConcept[] = [
  { localId: "C01", term: "Háromszög területe", examWeight: "core" },
  { localId: "C05", term: "Kör területe", examWeight: "core" },
  { localId: "C21", term: "Körgyűrű területe", examWeight: "supporting" },
] as MapConcept[];

test("a valós Kristóf-eset: helyiérték-szöveg geometriai címkékkel MEGBUKIK", () => {
  // Szó szerint a publikált leckéből (lessons.json, map c53973f8).
  const blocks = [
    {
      kind: "explain",
      text:
        "A természetes számokat számjegyekkel írjuk le. Egy számjegy értéke attól is függ, " +
        "melyik helyen áll. Jobbról balra haladva az egyesek, tízesek, százasok és ezresek helye következik.",
      coversConceptIds: ["C01", "C05"],
    },
    {
      kind: "example",
      problem: "24 ceruzát 6 gyermek között egyenlően osztunk szét. Hány ceruzát kap egy gyermek?",
      coversConceptIds: ["C21"],
    },
  ];

  const report = groundingReport(blocks, CONCEPTS);
  assert.equal(report.ok, false, "a hamis címkézésnek buknia kell");
  assert.ok(
    report.ungrounded.length >= 2,
    `legalább két megalapozatlan címke várt, kapott: ${report.ungrounded.length}`,
  );
  const ids = report.ungrounded.map((u) => u.conceptId);
  assert.ok(ids.includes("C01"), "a 'Háromszög területe' címke helyiérték-szövegen megalapozatlan");
  assert.ok(ids.includes("C21"), "a 'Körgyűrű területe' címke ceruzaosztáson megalapozatlan");
});

test("a valódi tanítás átmegy: a fogalom szava szerepel a blokkban", () => {
  const blocks = [
    {
      kind: "explain",
      text:
        "A háromszög területe a T = a · ma / 2 képlettel számolható, ahol ma az a oldalhoz " +
        "tartozó magasság.",
      coversConceptIds: ["C01"],
    },
  ];
  const r = groundingReport(blocks, CONCEPTS);
  assert.equal(r.ok, true, `helyes blokk nem bukhat: ${JSON.stringify(r.ungrounded)}`);
});

test("ékezet- és toldalék-tűrő: a magyar ragozás nem okoz hamis bukást", () => {
  // „Kör területe" -> „a kör területét" — a szótő egyezik, ez elfogadott.
  assert.equal(
    checkGrounding("Kiszámoljuk a kör területét: T = r²π.", { localId: "C05", term: "Kör területe" } as MapConcept),
    true,
  );
  // Nem elég egyetlen közös szó: a „terület" önmagában nem bizonyítja a kört.
  assert.equal(
    checkGrounding("A téglalap területe a · b.", { localId: "C05", term: "Kör területe" } as MapConcept),
    false,
  );
});

test("üres/rövid blokkszöveg nem alapozhat meg címkét", () => {
  assert.equal(checkGrounding("", { localId: "C01", term: "Háromszög területe" } as MapConcept), false);
  assert.equal(checkGrounding("Lásd fent.", { localId: "C01", term: "Háromszög területe" } as MapConcept), false);
});

test("`term` nélküli fogalom NEM buktat vakon, de láthatóan mérhetetlen marad", () => {
  // Régi térkép-sorok/fixture-ök nem tartalmaznak megnevezést. Egy kapu, ami
  // mérés nélkül ítél, ugyanolyan hazug, mint amelyik mérés nélkül átenged —
  // ezért itt nem buktatunk, de a `measurable` számláló megmutatja, hogy erről
  // a leckéről a kapu NEM mondott ítéletet.
  const blocks = [{ kind: "explain", text: "Bármi.", coversConceptIds: ["X1"] }];
  const r = groundingReport(blocks, [{ localId: "X1", examWeight: "core" } as MapConcept]);
  assert.equal(r.ok, true, "mérhetetlen fogalom nem buktathat");
  assert.equal(r.measurable, 0, "és látszania kell, hogy semmit nem mértünk");
  assert.deepEqual(r.groundedIds, [], "mérés nélkül nem is igazolunk semmit");
});

test("a mérhető és a mérhetetlen fogalmak keveredhetnek — a mérhetőt megítéli", () => {
  const blocks = [
    { kind: "explain", text: "A természetes számokat számjegyekkel írjuk le, helyiérték szerint.", coversConceptIds: ["X1", "C01"] },
  ];
  const r = groundingReport(blocks, [
    { localId: "X1", examWeight: "core" } as MapConcept,
    { localId: "C01", term: "Háromszög területe", examWeight: "core" } as MapConcept,
  ]);
  assert.equal(r.measurable, 1, "csak a term-mel rendelkező fogalom mérhető");
  assert.equal(r.ok, false, "a mérhető címke viszont megbukik a helyiérték-szövegen");
});
