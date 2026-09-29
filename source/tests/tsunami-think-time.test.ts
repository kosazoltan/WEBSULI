import assert from "node:assert/strict";
import test from "node:test";

import { startingDifficulty } from "../client/src/game-engine/difficulty";
import { tsunamiQuizSeconds, type TsunamiDifficulty } from "../client/src/game-engine/tsunamiTiming";

// Spec 2026-09-29-tobb-gondolkodasi-ido: fejben is ki lehessen számolni a feladatot.
const DIFFICULTIES: TsunamiDifficulty[] = ["easy", "normal", "hard"];
const BANDS = [0, 0.15, 0.25, 0.5, 0.75, 1];

test("E3 Szökőár: a kérdésidő minden nehézségen és sávon ≥ 24 s", () => {
  for (const d of DIFFICULTIES) {
    for (const band of BANDS) {
      const s = tsunamiQuizSeconds(d, band);
      assert.ok(s >= 24, `${d}, sáv ${band}: ${s} s < 24 s`);
    }
  }
});

test("E3 Szökőár: könnyebb nehézségen nem kevesebb az idő", () => {
  for (const band of BANDS) {
    assert.ok(tsunamiQuizSeconds("easy", band) >= tsunamiQuizSeconds("normal", band), `sáv ${band}: easy < normal`);
    assert.ok(tsunamiQuizSeconds("normal", band) >= tsunamiQuizSeconds("hard", band), `sáv ${band}: normal < hard`);
  }
});

test("a kiinduló normál sávon az időtúllépés 35 s-on belül bekövetkezik (remaining-learning E2E feltétele)", () => {
  const s = tsunamiQuizSeconds("normal", startingDifficulty(4));
  assert.ok(s <= 32, `normál kiinduló kérdésidő ${s} s — az időtúllépéses E2E 35 s-ot vár`);
});
