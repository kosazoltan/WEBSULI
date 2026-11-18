import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { VOCAB_EN, VOCAB_EN_STAGE } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_DE, VOCAB_DE_STAGE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_FR, VOCAB_FR_STAGE } from "../client/src/data/vocabBank/vocab-fr";
import type { GameMobileCase } from "./support/game-mobile-quality";
import type { VocabWiringCase } from "./support/vocab-wiring-case";

/**
 * S13 — záró őr (végrehajtás S13/3; terv A1, A7, A8, M1–M11):
 *  - mind a 7 játék mobil-esete `status: "full"`, van `playReady`-je és `answerWrong`-ja (M9 / M10 / K1-K3 mérés),
 *    és (S13 / K2) `quizScope`-ja a kvíz-állapotú méréshez;
 *  - mind a 6 nyelvi játék szóbank-esete `wired: true` — a 7. (Gyors matek sprint) szándékosan nincs a listán:
 *    a terv 2. szakasza szerint „csak a nyelvi kérdések forrása változik”, a matek sprint nem kérdez nyelvet;
 *  - mindhárom nyelv `stage: "full"`, és a bank mérete eléri a terv 4.2 minimumát (EN 2500, DE 2000, FR 2000).
 */
const dir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const GAMES = ["block-craft-quiz", "brain-rot-steal", "space-asteroid-quiz", "speed-quiz-math", "tornado-hunter-200", "tsunami-english", "word-ladder-hu-en"];
const VOCAB_GAMES = GAMES.filter((g) => g !== "speed-quiz-math");

test("mind a 7 játék mobil-esete létezik és „full”, playReady + answerWrong + quizScope mellett", async () => {
  const files = readdirSync(dir("./game-mobile-cases/")).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, "")).sort();
  assert.deepEqual(files, [...GAMES].sort());
  for (const g of GAMES) {
    const { CASE } = (await import(`./game-mobile-cases/${g}.ts`)) as { CASE: GameMobileCase };
    assert.equal(CASE.id, g);
    assert.equal(CASE.status, "full", `${g}: nem full`);
    assert.equal(typeof CASE.playReady, "function", `${g}: nincs playReady`);
    assert.equal(typeof CASE.answerWrong, "function", `${g}: nincs answerWrong`);
    assert.ok(CASE.quizScope && CASE.quizScope.length > 0, `${g}: nincs quizScope`);
    assert.ok(CASE.path.startsWith(`/games/${g}`), `${g}: útvonal ${CASE.path}`);
  }
});

test("mind a 6 nyelvi játék szóbank-esete wired: true (a matek sprint kivétel — terv 2.)", async () => {
  const files = readdirSync(dir("./vocab-wiring-cases/")).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, "")).sort();
  assert.deepEqual(files, [...VOCAB_GAMES].sort());
  for (const g of VOCAB_GAMES) {
    const { CASE } = (await import(`./vocab-wiring-cases/${g}.ts`)) as { CASE: VocabWiringCase };
    assert.equal(CASE.wired, true, `${g}: nincs bekötve`);
  }
});

test("mindhárom nyelv stage „full”, és a bank eléri a terv 4.2 minimumát (EN 2500, DE 2000, FR 2000)", () => {
  assert.equal(VOCAB_EN_STAGE, "full");
  assert.equal(VOCAB_DE_STAGE, "full");
  assert.equal(VOCAB_FR_STAGE, "full");
  assert.ok(VOCAB_EN.length >= 2500, `EN ${VOCAB_EN.length}`);
  assert.ok(VOCAB_DE.length >= 2000, `DE ${VOCAB_DE.length}`);
  assert.ok(VOCAB_FR.length >= 2000, `FR ${VOCAB_FR.length}`);
});
