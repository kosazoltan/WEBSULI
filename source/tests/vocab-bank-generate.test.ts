import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { dedupKey, entryLine, existingKeys, ledgerTotal, nextIds, screenCandidate, stepOf, worstCaseCost, wouldExceed } from "../scripts/vocab-bank-generate";

/** Szólétra S3 — keretes szóbank-generátor tiszta részei (hálózat nélkül). Végrehajtás: 2026-11-22-szoletra-szintezes-vegrehajtas.md 10. */

test("futáskorlát: a napló-összeg + a legrosszabb hívás nem lépheti át a keretet", () => {
  const dir = mkdtempSync(join(tmpdir(), "vbg-"));
  const ledger = join(dir, "ledger.jsonl");
  assert.equal(ledgerTotal(ledger), 0, "hiányzó napló = 0");
  writeFileSync(ledger, `${JSON.stringify({ costUsd: 1.25 })}\n${JSON.stringify({ costUsd: 0.5 })}\n`);
  assert.equal(ledgerTotal(ledger), 1.75);
  const worst = worstCaseCost(3000, 1000, { prompt: 2e-6, completion: 10e-6 });
  assert.ok(Math.abs(worst - (1000 * 2e-6 + 1000 * 10e-6)) < 1e-12);
  assert.equal(wouldExceed(24.99, worst, 25), true);
  assert.equal(wouldExceed(1.75, worst, 25), false);
});

test("duplikátum-kulcs: névelő és kis-/nagybetű nélkül; a kézi bank célszavai is tiltottak", () => {
  assert.equal(dedupKey("der Hund"), "hund");
  assert.equal(dedupKey("l'eau"), "eau");
  assert.equal(dedupKey("The  Cat"), "cat");
  const en = existingKeys("en");
  assert.ok(en.has("house"), "kézi bank: „Ház” angolul → house");
  assert.ok(en.has("mother"), "szóbank");
});

test("jelölt-szűrés: duplikátum, több szó, rossz téma elutasítva; jó jelölt 0. szintű, fokozata mért", () => {
  const taken = existingKeys("de");
  const base = { hu: "x", topic: "animals", pos: "noun", example: "Die Ziege frisst Gras.", exampleHu: "A kecske füvet eszik." };
  assert.equal(screenCandidate({ ...base, term: "der Hund", example: "Der Hund bellt laut." }, "de", taken).reason, "duplikátum");
  assert.equal(screenCandidate({ ...base, term: "die kleine Ziege" }, "de", taken).reason, "nem egyes szó");
  assert.match(screenCandidate({ ...base, term: "die Ziege", topic: "zoo" }, "de", taken).reason ?? "", /^téma/);
  assert.match(screenCandidate({ ...base, term: "Ziege" }, "de", new Set()).reason ?? "", /névelő/);
  const ok = screenCandidate({ ...base, term: "die Ziege" }, "de", new Set());
  assert.ok(ok.entry, ok.reason);
  assert.equal(ok.entry!.level, 0);
  assert.equal(stepOf(ok.entry!, "de"), 1, "Ziege: 5 betű / 1,35 + 2 × (2 − 1) ≈ 5,7 → 1. fokozat");
});

test("azonosító: a téma következő sorszáma; a sor visszaolvasható alak", () => {
  const next = nextIds("de", VOCAB_DE);
  const max = Math.max(...VOCAB_DE.filter((e) => e.id.startsWith("de0-animals-")).map((e) => Number(e.id.slice(-3))));
  const id = next("animals");
  assert.equal(id, `de0-animals-${String(max + 1).padStart(3, "0")}`);
  assert.equal(next("animals"), `de0-animals-${String(max + 2).padStart(3, "0")}`);
  const line = entryLine({ id, term: "die Ziege", hu: "kecske", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Die Ziege frisst Gras.", exampleHu: "A kecske füvet eszik." });
  assert.match(line, /^ {2}\{ id: "de0-animals-\d{3}", term: "die Ziege", .* \},$/);
});
