import { test } from "node:test";
import assert from "node:assert/strict";
import { METHOD_LABEL, SECTION_ROLE_HEADING, VERDICT_TEXT, displayHeading, sectionRoleOf, stripMethodPrefix, stripVerdictPrefix } from "../shared/lesson-ui-text";
import { buildPedagoguePrompt } from "../server/studio/step-io";

// Arculati bank S4 (docs/specs/2026-10-18-arculati-bank-s4.md): feliratszótár.

test("ítélet-előtag levágása: a mért nyitások mind; írásjel nélküli szókezdet és üres maradék változatlan", () => {
  const cases: Array<[string, string]> = [
    ["Helyes: 30+18–3 = 45.", "30+18–3 = 45."], ["Nem helyes: előbb szorzunk.", "Előbb szorzunk."], ["Nem helyes. A szorzás az első.", "A szorzás az első."],
    ["Helyes, mert a zárójel előbb jön.", "Mert a zárójel előbb jön."], ["Helyes. Ügyes!", "Ügyes!"], ["Igen, ez a jó út.", "Ez a jó út."],
    ["Így van, a víz körforgása.", "A víz körforgása."], ["Nem, ez túl sok.", "Ez túl sok."], ["Téves: 48 nem jó.", "48 nem jó."], ["Pontosan! 45.", "45."],
  ];
  for (const [input, expected] of cases) assert.equal(stripVerdictPrefix(input), expected, input);
  for (const keep of ["Nem minden szám osztható 3-mal.", "Igenis fontos a sorrend.", "Helyesírás szerint így írjuk.", "Nem -5, hanem -3."]) assert.equal(stripVerdictPrefix(keep), keep, keep);
  assert.deepEqual(VERDICT_TEXT, { right: "Helyes!", wrong: "Még nem helyes." });
});

// Review #285 (dokumentált spec-pontosítás, docs/specs/2026-10-18-arculati-bank-s4.md).
test("review #285: a csak ítéletből álló szöveg üres; az előjel és a jelölés kis-nagybetűje megmarad", () => {
  for (const only of ["Igen.", "Nem.", "Helyes.", "Nem helyes!", "Pontosan!"]) assert.equal(stripVerdictPrefix(only), "", only);
  const cases: Array<[string, string]> = [
    ["Helyes:-3 az eredmény.", "-3 az eredmény."], ["Helyes: –3 az eredmény.", "–3 az eredmény."], ["Helyes:–3 az eredmény.", "–3 az eredmény."],
    ["Helyes: pH = 7, ezért semleges.", "pH = 7, ezért semleges."], ["Nem helyes: x = 2 esetén 6.", "x = 2 esetén 6."],
    ["Helyes: cm-ben mérjük.", "cm-ben mérjük."], ["Helyes: a = 5, b = 3.", "a = 5, b = 3."], ["Helyes – 45.", "45."],
  ];
  for (const [input, expected] of cases) assert.equal(stripVerdictPrefix(input), expected, input);
  assert.equal(stripMethodPrefix("Kapukérdés: x = 2 esetén mennyi 3x?", "gate"), "x = 2 esetén mennyi 3x?");
  assert.equal(stripMethodPrefix("Jósolj: pH változás savban", "prediction"), "pH változás savban");
});

test("review #285: a szerep-skill rövid fejezetnevei szerep-aliasok (a lejátszó a szótár címét mutatja)", () => {
  assert.equal(sectionRoleOf("Ellenőrzés"), "selfCheck");
  assert.equal(sectionRoleOf("Leggyakoribb hibák"), "mistakes");
  assert.equal(sectionRoleOf("A feladat megoldva"), "workedSolution");
  assert.equal(displayHeading("Ellenőrzés"), SECTION_ROLE_HEADING.selfCheck);
  assert.equal(sectionRoleOf("Ellenőrzés a gyakorlatban"), null);
});

test("sablonos fejezetcím: szerep a szövegből (írásjel-, kis-nagybetű- és kötőjel-tűrés), a megjelenített cím a szótárból", () => {
  assert.equal(sectionRoleOf("A leggyakoribb hibák"), "mistakes");
  assert.equal(sectionRoleOf("Ellenőrzés - hogyan légy biztos magadban"), "selfCheck");
  assert.equal(sectionRoleOf("A törtek"), null);
  assert.equal(displayHeading("a leggyakoribb hibák"), SECTION_ROLE_HEADING.mistakes);
  assert.equal(displayHeading("Műveleti sorrend"), "Műveleti sorrend");
});

test("módszercím: a címkét ismétlő előtag kimarad, más cím változatlan; a címkék a szótárból", () => {
  assert.equal(stripMethodPrefix("Kapukérdés: melyik a nagyobb?", "gate"), "Melyik a nagyobb?");
  assert.equal(stripMethodPrefix("Tévhit: a nehezebb gyorsabban esik", "myth"), "A nehezebb gyorsabban esik");
  assert.equal(stripMethodPrefix("Ellenőrző ablak – mennyire megy?", "selfCheck"), "Mennyire megy?");
  assert.equal(stripMethodPrefix("Mi történik, ha melegítjük?", "prediction"), "Mi történik, ha melegítjük?");
  assert.equal(METHOD_LABEL.gate, "Kapukérdés");
});

test("a tervező prompt a szótárból épül, és bájtra a korábbi szöveg (a modell ugyanazt kapja)", () => {
  const prompt = buildPedagoguePrompt({ title: "T", subject: "matematika", classroom: 5, concepts: [] });
  for (const line of [
    "- „A feladat megoldva lépésről lépésre” külön fejezet CSAK ha a forrásban gyakorlófeladat van",
    "- „A leggyakoribb hibák” záró fejezet CSAK ha legalább 3,",
    "- „Ellenőrzés – hogyan légy biztos magadban?” záró fejezet CSAK ha a forrás többlépéses eljárást tanít",
  ]) assert.ok(prompt.includes(line), line);
});
