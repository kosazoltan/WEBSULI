import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EXPLAIN_LONG_CHARS, explainIsLong, explainParagraphs } from "../client/src/lesson-runtime/explain-paragraphs";

// Review #368 (spec 2026-10-22-lecke-szeles-elrendezes): a hasábváltás csak bekezdéshatáron — bekezdés sosem törik ketté.
test("a magyarázat bekezdései az üres soroknál válnak szét", () => {
  assert.deepEqual(explainParagraphs("Első.\n\nMásodik.\n  \nHarmadik."), ["Első.", "Második.", "Harmadik."]);
  assert.deepEqual(explainParagraphs("Egy sor.\nUgyanaz a bekezdés."), ["Egy sor.\nUgyanaz a bekezdés."]);
});

test("két hasáb csak hosszú ÉS többbekezdéses magyarázatnak", () => {
  const long = "x".repeat(EXPLAIN_LONG_CHARS + 1);
  assert.equal(explainIsLong(long), false, "egyetlen hosszú bekezdés nem kap hasábot");
  assert.equal(explainIsLong(`${long}\n\nMásodik bekezdés.`), true);
  assert.equal(explainIsLong("Rövid.\n\nKét bekezdés."), false, "rövid szöveg nem kap hasábot");
});

test("a CSS a hasábos magyarázatban nem engedi a bekezdés kettétörését", () => {
  const css = fs.readFileSync("client/src/lesson-runtime/lesson-experience.css", "utf8");
  assert.doesNotMatch(css, /\[data-long\] > p \{ break-inside: auto/);
  assert.match(css, /\[data-block="explain"\]\[data-long\] > \* \{ break-inside: avoid; \}/);
});

test("felsorolás (S2a / E8): a jelölt, sortöréssel tagolt sorok listává válnak; a próza és a párbeszéd bekezdés marad", async () => {
  const { explainParts } = await import("../client/src/lesson-runtime/explain-paragraphs");
  assert.deepEqual(explainParts("Jegyezd meg:\n- az alma megszámlálható\n- a víz nem\n\nZáró mondat."), [
    { kind: "p", text: "Jegyezd meg:" }, { kind: "ul", items: ["az alma megszámlálható", "a víz nem"] }, { kind: "p", text: "Záró mondat." }]);
  assert.deepEqual(explainParts("• egy\n• kettő\n* három"), [{ kind: "ul", items: ["egy", "kettő", "három"] }]);
  assert.deepEqual(explainParts("Egy sor.\nUgyanaz a bekezdés."), [{ kind: "p", text: "Egy sor.\nUgyanaz a bekezdés." }], "sima szöveg változatlan");
  assert.deepEqual(explainParts("- egyetlen jelölt sor\nfolytatás"), [{ kind: "p", text: "- egyetlen jelölt sor\nfolytatás" }], "egyetlen jelölt sor nem lista");
  assert.deepEqual(explainParts("– Szia! – mondta.\n– Szia! – felelte."), [{ kind: "p", text: "– Szia! – mondta.\n– Szia! – felelte." }], "a gondolatjeles párbeszéd nem lista");
  assert.deepEqual(explainParts("**Cél:** tanulás\n**Buktató:** keverés"), [{ kind: "p", text: "**Cél:** tanulás\n**Buktató:** keverés" }], "a kiemelés nem listajel");
  assert.deepEqual(explainParts("-5 fok volt\n-3 fok lett"), [{ kind: "p", text: "-5 fok volt\n-3 fok lett" }], "a negatív szám nem listajel");
  // Független review J1: a kötőjel a tartalom része lehet — kétség esetén a sorok bekezdés maradnak, a jel nem tűnik el.
  const unchanged = (text: string, why: string) => assert.deepEqual(explainParts(text), [{ kind: "p", text }], why);
  unchanged("- 5 + 3 = -2\n- 4 + 1 = -3", "egyenletsor: a szóközzel írt mínuszjel megmarad");
  unchanged("- 5 fok volt reggel\n- 3 fok lett este", "előjeles szám");
  unchanged("- Hová mész? - kérdezte.\n- Haza - felelte.", "kötőjellel írt párbeszéd közbevetéssel");
  unchanged("- Hová mész?\n- Haza.", "kérdés-felelet párbeszéd");
  unchanged("- Gyere ide!\n- Megyek.", "felkiáltó párbeszédsor");
  unchanged("- az első pont\n- 3 alma\n- a harmadik pont", "egy kétes sor az egész futást bekezdésben hagyja");
  unchanged("A hőmérséklet - ahogy mondtam - csökkent.\nMásnap - 2 fok volt.", "gondolatjelként használt kötőjel a mondatban");
  assert.deepEqual(explainParts("- **many**: megszámlálható\n- „much”: megszámlálhatatlan"), [{ kind: "ul", items: ["**many**: megszámlálható", "„much”: megszámlálhatatlan"] }], "valódi lista kiemelt / idézett szóval");
  assert.deepEqual(explainParts("• 5 alma\n• -3 fok\n• Hová mész?"), [{ kind: "ul", items: ["5 alma", "-3 fok", "Hová mész?"] }], "a „•” egyértelmű listajel, a tartalma változatlan");
});
