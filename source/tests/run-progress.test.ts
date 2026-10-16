import test from "node:test";
import assert from "node:assert/strict";
import { progressTimingText } from "../shared/studio-ui";

/* docs/specs/2026-10-16-gyartas-haladas.md: a futó gyártás időjelzése (a szerver órája szerint számolt másodpercekből). */

test("időjelzés: eltelt idő, utolsó jelzés, a háttérfolyamat állapota", () => {
  assert.equal(progressTimingText({ elapsedSec: 1080, sinceUpdateSec: 75, alive: true }), "Eltelt idő: 18 perc · utolsó jelzés: 1 perce · a háttérfolyamat él");
  assert.equal(progressTimingText({ elapsedSec: 42, sinceUpdateSec: 3 }), "Eltelt idő: 42 mp · utolsó jelzés: 3 másodperce");
  assert.equal(progressTimingText({ elapsedSec: 3725, sinceUpdateSec: 900, alive: false }), "Eltelt idő: 1 óra 2 perc · utolsó jelzés: 15 perce · a háttérfolyamat nem jelez");
  assert.equal(progressTimingText({}), null, "időadat nélkül nincs kitalált érték");
});
