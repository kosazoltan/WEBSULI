import assert from "node:assert/strict";
import test from "node:test";

import { windowMsFor } from "../client/src/game-engine/play/questionDirector";
import { readingMsFor } from "../client/src/game-engine/play/reading";
import { DUEL_BASE_WINDOW_MS, DUEL_WINDOW_CAP_MS, buildRoundQuestion, duelReadingWindowMs, type DuelBankItem } from "../shared/duel/questions";
import { SERVER_GRADE_BANK, createQuestionProvider, rtReadable, rtWindowMs } from "../server/realtime/question-provider";

/**
 * JM3a — a párbaj válaszablaka az olvasási időhöz igazodik (JBb lelete: a régi fix 6 s-os alap a sok szavas kérdésnél kevés),
 * legfeljebb 9 mp; a kérdésválasztás a 9 mp alatt elolvasható tételt részesíti előnyben (J0c-b `accept` mintája).
 */

test("duelReadingWindowMs: a szöveghossz-ablak és az olvasási idő közül a nagyobb, legfeljebb 9 mp; érvénytelen bemenetre biztonságos", () => {
  assert.equal(duelReadingWindowMs(6000, 4000), 6000);
  assert.equal(duelReadingWindowMs(6000, 7400), 7400);
  assert.equal(duelReadingWindowMs(6000, 12_000), DUEL_WINDOW_CAP_MS);
  assert.equal(duelReadingWindowMs(Number.NaN, 7000), 7000);
  assert.equal(duelReadingWindowMs(Number.NaN, Number.NaN), DUEL_BASE_WINDOW_MS);
});

test("szerveroldali ablak a valódi bankon: ≥ a régi szöveghossz-ablak, ≥ az olvasási idő (9 mp-ig), ≤ 9 mp — évfolyamonként", () => {
  for (const q of SERVER_GRADE_BANK) {
    const w = rtWindowMs(q.prompt, q.grade, q.options);
    const old = windowMsFor(q.prompt, q.grade, DUEL_BASE_WINDOW_MS);
    const read = readingMsFor(q.prompt, q.options, q.grade);
    assert.ok(w <= DUEL_WINDOW_CAP_MS, `${q.id}: ${w}`);
    assert.ok(w >= old, `${q.id}: nem rövidebb a régi ablaknál`);
    assert.ok(w >= Math.min(read, DUEL_WINDOW_CAP_MS), `${q.id}: az olvasási idő (${read}) belefér`);
  }
});

test("előnyben az olvasható tétel: ha a tierben van 9 mp alatt olvasható, azt választja; ha nincs, a többit (nem fogy el)", () => {
  const long = Array.from({ length: 25 }, () => "ma").join(" "); // 25 szó, 74 karakter: rövid, de 4. évfolyamon > 9 mp olvasás
  const items: DuelBankItem[] = [
    { id: "hosszu", grade: 4, subject: "math", tier: 2, prompt: `${long}?`, options: ["a", "b", "c", "d"], correctIndex: 0 },
    { id: "rovid", grade: 4, subject: "math", tier: 2, prompt: "Mennyi 2 + 2?", options: ["3", "4", "5", "6"], correctIndex: 1 },
  ];
  assert.equal(rtReadable(items[0]!, 4), false);
  assert.equal(rtReadable(items[1]!, 4), true);
  for (let r = 1; r <= 20; r++) {
    const q = buildRoundQuestion({ seed: `s${r}`, round: r, grade: 4, band: 0.55, used: new Set(), items, windowMs: rtWindowMs, prefer: rtReadable });
    assert.equal(q!.key, "rovid");
  }
  const onlyLong = buildRoundQuestion({ seed: "x", round: 1, grade: 4, band: 0.55, used: new Set(), items: [items[0]!], windowMs: rtWindowMs, prefer: rtReadable });
  assert.equal(onlyLong!.key, "hosszu", "olvasható híján a hosszabb tétel is jöhet");
  assert.equal(onlyLong!.windowMs, DUEL_WINDOW_CAP_MS);
});

test("a szerver kérdés-szolgáltatója az olvasási idő-alapú ablakot adja (4. évfolyam: a kérdések ablaka ≥ az olvasási idő, ≤ 9 mp)", () => {
  const provider = createQuestionProvider();
  for (let r = 1; r <= 30; r++) {
    const q = provider({ seed: "ablak", round: r, grade: 4, band: (r % 10) / 10, subjects: [], used: new Set() })!;
    assert.ok(q.windowMs <= DUEL_WINDOW_CAP_MS);
    assert.ok(q.windowMs >= Math.min(DUEL_WINDOW_CAP_MS, readingMsFor(q.prompt, q.options, 4)));
  }
});
