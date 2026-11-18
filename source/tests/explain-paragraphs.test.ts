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

/* Spec 2026-11-18 (S2a / E8) + vak ellenőr J3: listává MOST csak az egyértelmű „•” kezdetű sorok alakulnak. A „-” / „–” / „*” kezdetű
   sorok a már kiadott leckékben előjelet, egyenletsort, párbeszédet is jelölnek — ezek megjelenése a főágéval azonos marad. */
const OLD_TEXTS: Array<[string, string]> = [
  ["egyenletsor", "- x + 5 = 2\n- x = 2 − 5"],
  ["előjeles értékadás", "- a = -3\n- b = 4"],
  ["kijelentő párbeszéd", "- Jó napot kívánok.\n- Jó napot, tessék parancsolni."],
  ["kérdés-felelet párbeszéd", "- Hová mész?\n- Haza."],
  ["kötőjeles felsorolás bevezetővel", "Jegyezd meg:\n- az alma megszámlálható\n- a víz nem\n\nZáró mondat."],
  ["csillagos felsorolás", "* alma\n* körte"],
  ["gondolatjeles párbeszéd", "– Szia! – mondta.\n– Szia! – felelte."],
  ["szószedet", "- dog – kutya\n- cat – macska"],
  ["negatív számok", "-5 fok volt\n-3 fok lett"],
  ["kiemelések", "**Cél:** tanulás\n**Buktató:** keverés"],
  ["sima próza", "Egy sor.\nUgyanaz a bekezdés.\n\nMásik bekezdés."],
  ["vegyes jelölés", "• egy\n• kettő\n- három"],
];

test("felsorolás (vak ellenőr J3): a régi tananyagszöveg („-”, „–”, „*” kezdetű sorok) kimenete a főágéval azonos — bekezdés, a jel megmarad", async () => {
  const { explainParts } = await import("../client/src/lesson-runtime/explain-paragraphs");
  // A főágon a magyarázat megjelenítése: bekezdésenként egy <p>, a bekezdés teljes szövegével (`explainParagraphs`). Az elvárt értékek
  // a főág (origin/main dc76ba52) `explain-paragraphs.ts` moduljának kimenetei ezekre a szövegekre — betűre rögzítve.
  const MAIN_PARAGRAPHS: Record<string, string[]> = {
    "egyenletsor": ["- x + 5 = 2\n- x = 2 − 5"],
    "előjeles értékadás": ["- a = -3\n- b = 4"],
    "kijelentő párbeszéd": ["- Jó napot kívánok.\n- Jó napot, tessék parancsolni."],
    "kérdés-felelet párbeszéd": ["- Hová mész?\n- Haza."],
    "kötőjeles felsorolás bevezetővel": ["Jegyezd meg:\n- az alma megszámlálható\n- a víz nem", "Záró mondat."],
    "csillagos felsorolás": ["* alma\n* körte"],
    "gondolatjeles párbeszéd": ["– Szia! – mondta.\n– Szia! – felelte."],
    "szószedet": ["- dog – kutya\n- cat – macska"],
    "negatív számok": ["-5 fok volt\n-3 fok lett"],
    "kiemelések": ["**Cél:** tanulás\n**Buktató:** keverés"],
    "sima próza": ["Egy sor.\nUgyanaz a bekezdés.", "Másik bekezdés."],
    "vegyes jelölés": ["• egy\n• kettő\n- három"],
  };
  for (const [name, text] of OLD_TEXTS) {
    assert.deepEqual(explainParagraphs(text), MAIN_PARAGRAPHS[name], `${name}: a bekezdésbontás a főágé`);
    assert.deepEqual(explainParts(text), MAIN_PARAGRAPHS[name].map((p) => ({ kind: "p", text: p })), `${name}: bekezdés marad, a jel nem tűnik el`);
  }
});

test("felsorolás (S2a / E8): a „•” kezdetű, sortöréssel tagolt sorok listává válnak; az elem tartalma érintetlen (vak ellenőr J1)", async () => {
  const { explainParts } = await import("../client/src/lesson-runtime/explain-paragraphs");
  assert.deepEqual(explainParts("Jegyezd meg:\n• az alma megszámlálható\n• a víz nem\n\nZáró mondat."), [
    { kind: "p", text: "Jegyezd meg:" }, { kind: "ul", items: ["az alma megszámlálható", "a víz nem"] }, { kind: "p", text: "Záró mondat." }]);
  assert.deepEqual(explainParts("• egyetlen jelölt sor\nfolytatás"), [{ kind: "p", text: "• egyetlen jelölt sor\nfolytatás" }], "egyetlen jelölt sor nem lista");
  assert.deepEqual(explainParts("• 5 alma\n• -3 fok\n• Hová mész?"), [{ kind: "ul", items: ["5 alma", "-3 fok", "Hová mész?"] }], "a „•” egyértelmű listajel, a tartalma változatlan");
  assert.deepEqual(explainParts("• **many**: megszámlálható\n• „much”: megszámlálhatatlan"), [{ kind: "ul", items: ["**many**: megszámlálható", "„much”: megszámlálhatatlan"] }]);
  // Vak ellenőr J1: a „•” elem tartalmának eleji „-” / „*” jel a TARTALOM része.
  const text = "A műveleti jelek:\n• - kivonás\n• + összeadás\n• * szorzás\n• : osztás";
  const parts = explainParts(text);
  assert.deepEqual(parts, [{ kind: "p", text: "A műveleti jelek:" }, { kind: "ul", items: ["- kivonás", "+ összeadás", "* szorzás", ": osztás"] }]);
  const ink = (s: string) => s.replace(/\s/g, "").length;
  assert.equal(ink(parts.map((p) => (p.kind === "p" ? p.text : p.items.join(""))).join("")), ink(text) - 4, "csak a négy listajel tűnik el");
  assert.deepEqual(explainParts("• -3 fok\n• * csillag\n• - x = 5"), [{ kind: "ul", items: ["-3 fok", "* csillag", "- x = 5"] }]);
});
