import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyItem } from "../server/catalog/verify";
import { falseArithmeticClaims } from "../server/studio/tools/arithmetic-claims";
import { singleChoiceProblems } from "../shared/single-choice-check";
import type { CatalogItemDraft } from "../server/catalog/catalog-item";

/* Spec 2026-10-05-s3-katalogus-bank — a katalógus-tétel determinisztikus ellenőrzése a szülő-ellenőrzött korpuszon mért esetekkel. */

const item = (d: Partial<CatalogItemDraft>): CatalogItemDraft => ({ kind: "quiz", provenance: "legacy_html:t", prompt: "", fingerprint: "f", ...d }) as CatalogItemDraft;

test("valódi hibák jelölve: rossz kulcs, ismétlődő opció, két egyenértékű helyes opció, hamis számítás", () => {
  assert.match(verifyItem(item({ prompt: "2/9 + 5/9 + 2/9 =", options: ["9/27", "9/9", "7/9", "6/9"], correctIndex: 2 })).problems.join(), /kulcs „7\/9”/);
  assert.match(verifyItem(item({ prompt: "Melyik szó helyesen van írva?", options: ["visszük", "viszük", "visszük"], correctIndex: 0 })).problems.join(), /ismétlődő/);
  assert.match(verifyItem(item({ prompt: "1/4 + 1/4 = ?", options: ["2/8", "1/2", "2/4", "1/8"], correctIndex: 1 })).problems.join(), /ugyanazt jelenti/);
  assert.match(verifyItem(item({ kind: "section", prompt: "Példa", body: "Számold ki: 12 × 30 = 350 nap." })).problems.join(), /hamis egyenlőség/);
  assert.match(verifyItem(item({ prompt: "Kulcs?", options: ["a", "b"], correctIndex: 5 })).problems.join(), /nem a válaszlehetőségek/);
  assert.match(verifyItem(item({ kind: "short_answer", prompt: "840 + 40 = ?", accepted: ["870"] })).problems.join(), /880/);
});

test("helyes szülői tartalom NEM jelölt: ismeretlen, implicit szorzás, gyök, helyiérték, százalék, időpont, zárójel", () => {
  for (const line of ["x + 5 = 12", "3x + 2 = 11", "__ × 5 = 15", "☐ + 4 = 9", "44 = 3(x + 8)", "535,4 + 94,5 = 6,3T f + 0,84T f", "L = 48 × π × 1 = 48π cm",
    "√25 = 5", "30 = 3 tízes", "43 = 4 tízes + 3 egyes", "1/2 = 0,5 = 50%", "11:45 → 12:45 = 1 óra", "16/24 = 2/?", "[(15 − 7) · 3] + 6 = 30",
    "8÷4 / 12÷4 = 2/3", "3 133 + 126 = 259", "2 2 = 1 félidő"]) assert.deepEqual(falseArithmeticClaims(line), [], line);
});

test("maradékos osztás minden mért írásmódja: helyes elfogadva, hibás jelölve", () => {
  for (const ok of ["13 ÷ 4 = 3 maradék 1", "45 : 12 = 3 (maradék 9)", "85 : 4 = 21 (m: 1)", "Tehát: 14 : 4 = 3, és 2 marad"]) assert.deepEqual(falseArithmeticClaims(ok), [], ok);
  assert.match(falseArithmeticClaims("14 : 4 = 3 (m: 3)").join(), /helyesen: 3 maradék 2/);
  assert.match(falseArithmeticClaims("12 : 4 = 3 maradék 4").join(), /helyesen: 3 maradék 0/, "a maradék nem lehet ≥ osztó");
});

test("a kétértelmű-olvasat kivételek nem rejtik el a valódi hibát", () => {
  assert.notDeepEqual(falseArithmeticClaims("3 133 + 126 = 300"), [], "egyik olvasat sem igaz");
  assert.notDeepEqual(falseArithmeticClaims("2 · 13 = 25 cm"), [], "a mértékegység szóközzel nem implicit szorzás");
  assert.notDeepEqual(falseArithmeticClaims("12 × 30 = 350, majd 350 + 5 = 355"), []);
});

test("egy-helyes-válasz: tagadó kérdés, gyűjtő-opció és vegyes szám alak-kérdés — az egyenértékű opciók szándékosak", () => {
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik NEM egyenlő 1/2-vel?", options: ["2/4", "3/6", "3/5", "4/8"], correctIndex: 2 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "24/36 =", options: ["4/6", "2/3", "12/18", "Mind helyes"], correctIndex: 3 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "Hogyan írható 17/5 vegyes számban?", options: ["3 2/5", "17/5", "2 7/5"], correctIndex: 0 }), []);
});

test("a „Melyik állítás hamis?” kulcsa szándékosan hamis — nem jelöljük; a kérdés szövege továbbra is ellenőrzött", () => {
  assert.equal(verifyItem(item({ prompt: "Melyik állítás hamis?", options: ["1/2 = 0,5", "1/3 = 0,5", "1/4 = 0,25"], correctIndex: 1 })).ok, true);
  assert.equal(verifyItem(item({ prompt: "Melyik igaz?", options: ["1/2 = 0,5", "1/3 = 0,5"], correctIndex: 1 })).ok, false);
});

test("soronkénti ellenőrzés: az egymás alá írt tört sorai nem olvadnak egy hamis „egyenlőséggé”", () => {
  assert.equal(verifyItem(item({ kind: "section", prompt: "Tört", body: "4\n8\n=\n1\n2" })).ok, true);
});
