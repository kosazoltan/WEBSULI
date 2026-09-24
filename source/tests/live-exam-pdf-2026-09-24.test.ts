import { test } from "node:test";
import assert from "node:assert/strict";
import { falseArithmeticClaims } from "../server/studio/tools/arithmetic-claims";
import { completeExtractionConcepts, foreignScriptLetters } from "../server/studio/extractor";

/** Élő próba 2026-09-24 — a 2021-es 6. évfolyamos felvételi feladatlap (M6_2021_1_fl_1.pdf) futásán mért hibák. */

test("aritmetikai őr: a kifejezés közepéről induló olvasat és a hányad = mennyiség jelölés nem hamis állítás", () => {
  // Mért hamis riasztások: „2 = 980 : 2”, „2 = 7,5”, „1/15 = 4” — mindegyik jó csomagot buktatott.
  assert.deepEqual(falseArithmeticClaims("Az átlag: (500 + 480) : 2 = 490 Ft."), []);
  assert.deepEqual(falseArithmeticClaims("(10 + 5) : 2 = 7,5"), []);
  assert.deepEqual(falseArithmeticClaims("A teljes út 1/15 = 4 km, tehát 15 · 4 = 60 km."), []);
  assert.deepEqual(falseArithmeticClaims("Két ár szerepel, ezért osztunk 2-vel: 980 Ft : 2 = 490 Ft."), [], "mért: run e79ab9da");
  assert.deepEqual(falseArithmeticClaims("Az út 90 km / 2 = 45 km."), []);
  assert.deepEqual(falseArithmeticClaims("Ezért 980 Ft : 2 = 480 Ft."), ["980 : 2 = 480 (helyesen: 490)"], "mértékegységgel is elkapja a valódi hibát");
  assert.deepEqual(falseArithmeticClaims("500 Ft + 480 Ft : 2 = 490 Ft"), [], "hosszabb, mértékegységes láncot nem ítél meg");
  // A valódi hibát továbbra is elkapja.
  assert.deepEqual(falseArithmeticClaims("3 · 410 = 1320 Ft"), ["3 · 410 = 1320 (helyesen: 1230)"]);
  assert.deepEqual(falseArithmeticClaims("12 · 2 = 48"), ["12 · 2 = 48 (helyesen: 24)"]);
  assert.deepEqual(falseArithmeticClaims("Nem: 12 · 2 = 48 téves."), ["12 · 2 = 48 (helyesen: 24)"], "a címke kettőspontja nem osztás");
  assert.equal(falseArithmeticClaims("9/30 = 1/3 rész").length, 1, "tört = tört állítás mértékegység előtt is ellenőrzött");
  assert.equal(falseArithmeticClaims("(500 + 480) : 2 = 490, és 3 · 410 = 1320").length, 1, "a lánc utáni valódi hiba megmarad");
  assert.deepEqual(falseArithmeticClaims("40 – 2 · 9 + 4 = 40 – 18 + 4 = 22 + 4 = 26"), []);
});

test("kivonatoló: forrásban nem szereplő idegen írásrendszerű betű célzott javítást kap (mérve: „რომლის” a c15-ben)", async () => {
  assert.deepEqual(foreignScriptLetters("keresni, რომლის harmada", "forrás"), ["რ", "ო", "მ", "ლ", "ი", "ს"]);
  assert.deepEqual(foreignScriptLetters("K = 2·r·π, α szög", ""), [], "görög matematikai betű rendben");
  assert.deepEqual(foreignScriptLetters("Привет", "Привет — orosz forrás"), [], "a forrásban szereplő írás rendben");
  const files = [{ name: "f.pdf", kind: "pdf" as const, content: "x", extractedText: "Melyik az a legnagyobb természetes szám, amelynek harmada kétjegyű?" }];
  const bad = { id: "c15", term: "Kétjegyű harmad", definition: "Olyan számot kell keresni, რომლის harmada kétjegyű.", quote: "Melyik az a legnagyobb természetes szám", sourceRef: { file: "f.pdf" }, type: "fact", examWeight: "core" };
  let repairInput: unknown;
  const concepts = await completeExtractionConcepts({ title: "t", concepts: [bad] } as never, files, async (input) => {
    repairInput = input;
    return { title: "t", concepts: [{ ...bad, definition: "Olyan számot kell keresni, amelynek harmada kétjegyű." }] } as never;
  });
  assert.match(JSON.stringify(repairInput), /idegen írásrendszerű betű/);
  assert.equal(concepts[0].definition, "Olyan számot kell keresni, amelynek harmada kétjegyű.");
});

test("workflow-keret: a hátralévő tartalmi látogatás mérhető (a csak-bank döntés ehhez igazodik)", async () => {
  const { workflowDefinition, workflowVisitsLeft } = await import("../shared/lesson-workflow");
  const { workflowStepVisitsLeft } = await import("../server/workflows/engine");
  const visit = (step: string) => ({ step, attempt: 1, startedAt: 0, finishedAt: 0, state: "done" as const, cacheHits: 0 });
  const run = { id: "r", definition: workflowDefinition("upload"), state: "running" as const, createdAt: 0, updatedAt: 0, revision: 0,
    visits: ["author", "animator", "lektor", "author", "animator", "lektor", "author", "animator", "lektor", "animator"].map(visit) };
  assert.equal(workflowVisitsLeft(run, "animator"), 0, "4 animátor-látogatás után nincs több");
  assert.equal(workflowVisitsLeft(run, "author"), 0);
  assert.equal(workflowVisitsLeft(run, "banks"), Infinity, "a módban nem létező lépés nem korlát");
  assert.equal(workflowStepVisitsLeft("animator"), Infinity, "workflow-kontextuson kívül nincs keret");
});
