import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRng, seedFrom } from "../shared/game-rng";
import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import { bankPlayQuestion, restoreReviewQuestion } from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import { ladderFocusFor, manualFocusIndex } from "../client/src/lib/wordLadder/focus";

/**
 * Review K1 (docs/specs/2026-11-17-szoletra-olvashatosag.md D): a menetek közötti ismétlésből (új lapbetöltés után)
 * visszatérő kézi banki tétel a közös ismétlési sor tárolt pillanatképéből épül — `focus` nélkül. A lap a kézi bank
 * célrészét azonosító szerint is megkeresi, így a korábban ELRONTOTT szó is kiemelve jön.
 */

test("K1: a menetek közötti ismétlésből visszajövő kézi tétel célrésze azonosító szerint megvan (új lapbetöltés után is)", () => {
  const item = WORD_LADDER_EN.find((i) => i.id === "en0-016")!;
  assert.ok(item.focus, "a mintatételnek van célrésze");
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  let now = 1_800_000_000_000;
  // 1. nap: a gyerek elrontja a tételt (a lap a megjelenítéskor tudta a célrészt — ez a tár most elvész).
  const day1 = createReviewQueue(storage, { now: () => now, rng: createRng(seedFrom("k1", 1)) });
  day1.startRun();
  const q = bankPlayQuestion("word-ladder-hu-en", { id: item.id, prompt: item.prompt, options: item.options.slice(), correctIndex: item.correctIndex });
  day1.record(q, "wrong", 0);
  // 2. nap: új lapbetöltés — új sor ugyanabból a tárból, üres munkamenet-tár.
  now += 3 * 24 * 3600_000;
  const day2 = createReviewQueue(storage, { now: () => now, rng: createRng(seedFrom("k1", 2)) });
  day2.startRun();
  const due = day2.dueAcrossRuns(now);
  assert.ok(due, "esedékes ismétlés");
  const restored = restoreReviewQuestion(due!, {});
  assert.ok(restored, "a pillanatképből visszaépül");
  assert.equal((restored!.quiz as { focus?: string }).focus, undefined, "a tárolt pillanatképben nincs célrész (ez a hiba oka)");
  const session = new Map<string, string>();
  assert.equal(ladderFocusFor(restored!.quiz, session, new Map()), null, "csak a munkamenet-tárral (a javítás előtt): nincs kiemelés");
  assert.equal(ladderFocusFor(restored!.quiz, session, manualFocusIndex(WORD_LADDER_EN)), item.focus, "a kézi bank tartaléka megtalálja");
});

test("K1: ladderFocusFor — a munkamenet-tár elsőbbsége, rész-szöveg biztonsági háló", () => {
  const manual = new Map([["x1", "Kutya"]]);
  assert.equal(ladderFocusFor({ id: "x1", prompt: "„Kutya” angolul:" }, new Map([["x1", "angolul"]]), manual), "angolul");
  assert.equal(ladderFocusFor({ id: "x1", prompt: "„Macska” angolul:" }, new Map(), manual), null, "nem rész-szöveg → nincs kiemelés");
  assert.equal(ladderFocusFor({ prompt: "x" }, new Map(), manual), null);
});

test("K1: a lap a kérdés-sávnak a tartalékos keresést adja (nem csak a munkamenet-tárat)", () => {
  const src = readFileSync(new URL("../client/src/pages/WordLadderHuEn.tsx", import.meta.url), "utf8");
  assert.match(src, /const manualFocus = useMemo\(\(\) => manualFocusIndex\(WORD_LADDER_BANKS\[lang\] \?\? \[\]\), \[lang\]\);/);
  assert.match(src, /promptFocus=\{presentation \? ladderFocusFor\(presentation\.question\.quiz, focusByIdRef\.current, manualFocus\) : null\}/);
});
