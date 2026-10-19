import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeTypedAnswers, isValidReference, referenceValueProblems, type TypedAnswer } from "../shared/answer-value";
import { experiencePacketSchema, scoringVersionFor } from "../shared/lesson-experience";
import { parsePolynomial } from "../shared/polynomial";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-10-19-algebrai-referencia: a betűs végeredmény a típusos pontozóban (mért: „Kéttagú kifejezések négyzete”, futás a3ede678). */
const poly = (value: string, form?: TypedAnswer["form"]): TypedAnswer => ({ part: "a", kind: "polynomial", value, ...(form ? { form } : {}) });
const ok = (answer: string, a: TypedAnswer) => gradeTypedAnswers(answer, [a]).correct === 1;

test("a mért, „nem értelmezhető” referenciák polinomként érvényesek", () => {
  for (const v of ["x² + 10x + 25", "4x^2 - 4x + 1", "2a² + 20a + 50", "ab + 4b", "10b + 5", "9a² + 12a + 4", "16a^2 + 24a + 9"]) {
    assert.equal(isValidReference(poly(v)), true, v);
  }
  assert.equal(isValidReference(poly("x² + ")), false);
  assert.equal(isValidReference(poly("(x+5")), false);
  assert.equal(isValidReference(poly("x / (x+1)")), false, "racionális törtkifejezés nem-cél");
});

test("kifejtett alak: a tagsorrend, a jelölés és a szóköz nem számít; a hibás érték és a zárójeles másolat nem jó", () => {
  const ref = poly("x² + 10x + 25");
  for (const a of ["x^2+10x+25", "25 + 10x + x²", "x·x + 10x + 25", "Az eredmény: x² + 10x + 25, mert a középső tag 2·5·x.", "(x+5)² = x² + 10x + 25"]) assert.equal(ok(a, ref), true, a);
  for (const a of ["(x+5)²", "x² + 10x + 52", "x² + 25", "x² + 5x + 5x + 25", "x² + 10x + 25 + 1"]) assert.equal(ok(a, ref), false, a);
  assert.match(gradeTypedAnswers("(x+5)²", [ref]).verdicts[0].reason, /kifejtett/);
});

test("szorzattá alakítás: a zárójeles alak kell, a kifejtett nem elég", () => {
  const ref = poly("(x+5)²", "factored");
  for (const a of ["(x+5)²", "(x + 5)(x + 5)", "(5+x)^2"]) assert.equal(ok(a, ref), true, a);
  for (const a of ["x² + 10x + 25", "(x+4)²"]) assert.equal(ok(a, ref), false, a);
});

test("több rész sorrendben, részfeladat-jellel", () => {
  const parts: TypedAnswer[] = [{ ...poly("x² + 10x + 25"), part: "a" }, { ...poly("4x^2 - 4x + 1"), part: "b" }];
  assert.equal(gradeTypedAnswers("a) x² + 10x + 25 b) 4x² − 4x + 1", parts).correct, 2);
  assert.equal(gradeTypedAnswers("a) 4x² − 4x + 1 b) x² + 10x + 25", parts).correct, 1, "felcserélt részeredmény hibás");
});

test("referencia-ellenőrzés: a hibás kifejtés csomaghiba, a nem-átalakító kérdés nem", () => {
  assert.deepEqual(referenceValueProblems({ id: "t1", q: "Bontsd ki: (x+5)²", typedAnswers: [poly("x² + 10x + 25")] }), []);
  assert.match(referenceValueProblems({ id: "t1", q: "Bontsd ki: (x+5)²", typedAnswers: [poly("x² + 5x + 25")] }).join(" "), /nem egyenlő a kérdés kifejezésével/);
  assert.deepEqual(referenceValueProblems({ id: "t2", q: "Írd fel szorzatként: x² + 10x + 25", typedAnswers: [poly("(x+5)²", "factored")] }), []);
  assert.deepEqual(referenceValueProblems({ id: "t3", q: "Melyik kéttagú kifejezés négyzete az x² + 10x + 25?", typedAnswers: [poly("x + 5", "any")] }), []);
  assert.match(referenceValueProblems({ id: "t4", q: "Bontsd ki!", typedAnswers: [poly("x² +")] }).join(" "), /nem értelmezhető polinom/);
});

test("pontozási verzió: polinom → 3, csak számos típusos → 2, típus nélkül a meglévő", () => {
  assert.equal(scoringVersionFor([{ typedAnswers: [poly("ab + 4b")] }]), 3);
  assert.equal(scoringVersionFor([{ typedAnswers: [{ part: "a", kind: "number", value: "12" }] }]), 2);
  assert.equal(scoringVersionFor([{}], 1), 1);
  assert.equal(scoringVersionFor([{ typedAnswers: [{ part: "a", kind: "number", value: "12" }] }], 3), 3, "a meglévő magasabb verzió nem csökken");
});

test("a lecke-séma a polinom-részt elfogadja 3-as szerződéssel, 2-essel nem", () => {
  const e = standardFusionFixture().experience!;
  const tasks = e.tasks.map((t, i) => (i === 0 ? { ...t, q: "Bontsd ki: (x+5)²", sample: "Kifejtve x² + 10x + 25.", typedAnswers: [poly("x² + 10x + 25")] } : t));
  const issues = (v: number) => JSON.stringify(experiencePacketSchema.safeParse({ ...e, tasks, scoringVersion: v }).error?.issues ?? []);
  assert.match(issues(2), /polynomial\) feladathoz scoringVersion=3/);
  assert.doesNotMatch(issues(3), /scoringVersion|referenciaértéke/);
  assert.match(JSON.stringify(experiencePacketSchema.safeParse({ ...e, tasks: tasks.map((t, i) => (i === 0 ? { ...t, typedAnswers: [poly("x² +")] } : t)), scoringVersion: 3 }).error?.issues ?? []), /referenciaértéke/);
});

test("a polinom-értelmező a zárójeles hatványt és az implicit szorzást kifejti", () => {
  const p = parsePolynomial("16[(a+1)² - 1/2(a+1)] + 1");
  assert.ok(p);
  assert.equal(gradeTypedAnswers("16a² + 24a + 9", [poly("16[(a+1)² - 1/2(a+1)] + 1", "any")]).correct, 1);
});

test("review #319: a szorzatalak valódi felső szintű szorzat — a zárójeles tagú vagy egészében zárójelezett összeg nem", () => {
  const ref = poly("(x+5)²", "factored");
  for (const a of ["x² + 10x + (25)", "(x² + 10x + 25)", "((x² + 10x + 25))"]) assert.equal(ok(a, ref), false, a);
  for (const a of ["((x+5)²)", "2(x+5)²/2", "(x+5)·(x+5)"]) assert.equal(ok(a, ref), true, a);
});

test("review #319: a mondatzáró „?” és „!” leválik — a kérdés-ellenőrzés és a tanulói válasz sem vész el", () => {
  assert.match(referenceValueProblems({ id: "t1", q: "Bontsd ki: (x+5)²!", typedAnswers: [poly("x² + 5x + 25")] }).join(" "), /nem egyenlő a kérdés kifejezésével/);
  assert.match(referenceValueProblems({ id: "t1", q: "Mennyi (x+5)²?", typedAnswers: [poly("x² + 5x + 25")] }).join(" "), /nem egyenlő/);
  assert.equal(ok("Kész: x² + 10x + 25!", poly("x² + 10x + 25")), true);
});

test("review #319: vegyes (betűs + számos) részeredményeknél egy közös sorrend érvényes", () => {
  const parts: TypedAnswer[] = [{ ...poly("x + 1", "any"), part: "a" }, { part: "b", kind: "number", value: "5" }];
  assert.equal(gradeTypedAnswers("a) x + 1 b) 5", parts).correct, 2);
  assert.equal(gradeTypedAnswers("5; x + 1", parts).correct, 1, "felcserélt sorrend: a szám a polinom ELŐTT áll");
});

test("review #319: a „^(n)” és a „^n” kitevő; a nyitó pár nélküli „)” nem nyelődik el", () => {
  assert.ok(parsePolynomial("(x^2)"));
  assert.ok(parsePolynomial("x^(2) + 1"));
  assert.equal(parsePolynomial("x^2)"), null);
  assert.equal(parsePolynomial("x^(2"), null);
});

test("review #319 (Vercel): a „(x + 5) (x + 5)” nem esik szét részfeladat-jelnél; a valódi „a)” jel igen", () => {
  assert.equal(ok("(x + 5) (x + 5)", poly("(x+5)²", "factored")), true);
  assert.equal(gradeTypedAnswers("a) x² + 1 b) x² - 1", [{ ...poly("x² + 1"), part: "a" }, { ...poly("x² - 1"), part: "b" }]).correct, 2);
});

test("review #319: az önálló betűs válasz („x”, „ab”) kifejezés; a névelő próza marad", () => {
  assert.equal(ok("x", poly("x", "any")), true);
  assert.equal(ok("ab", poly("ab", "any")), true);
  assert.equal(ok("Az eredmény x", poly("x", "any")), true);
  assert.equal(ok("ez a válasz", poly("a", "any")), false);
});

test("review #319: a szóközös implicit szorzás („2 x + 1”) egy jelölt — a levágott részlet nem ér pontot", () => {
  assert.equal(ok("2 x + 1", poly("2x + 1")), true);
  assert.equal(ok("2 x + 1", poly("x + 1")), false);
});

test("review #319: a polinom-rész mértékegysége kötelező", () => {
  const a: TypedAnswer = { ...poly("2x"), unit: "cm²" };
  assert.equal(ok("2x cm²", a), true);
  assert.equal(ok("A terület 2x cm².", a), true);
  assert.equal(ok("2x", a), false);
  assert.equal(ok("2x m²", a), false);
  assert.match(gradeTypedAnswers("2x", [a]).verdicts[0].reason, /mértékegység/);
});
