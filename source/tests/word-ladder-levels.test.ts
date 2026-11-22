import assert from "node:assert/strict";
import test from "node:test";

import {
  LADDER_LANG_STORAGE_KEY,
  availableLadderLanguages,
  ladderTiersFromBank,
  loadLadderLanguage,
  saveLadderLanguage,
} from "../client/src/data/wordLadder/banks";
import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import type { LadderItem } from "../client/src/data/wordLadder/types";
import { GRADE_LEVEL_COUNT, LEVEL_BAND_SPREAD, levelBand } from "../client/src/game-engine/gradeLevels";
import { ladderBaseTier, ladderTierIndex, pickUnseen, type SeenItem } from "../client/src/game-engine/no-repeat";
import { LADDER_ZONES } from "../client/src/lib/wordLadderLogic";
import {
  createLadderLevelSession,
  ladderRungsForLevel,
  ladderTierForLevel,
  milestoneForProgress,
  wordLadderGameId,
  zoneForProgress,
} from "../client/src/lib/wordLadderLevels";
import { createLadderStepSession, ladderGradeWindow, ladderStepBuckets, windowLadderSteps } from "../client/src/lib/wordLadderGrading";

/** Spec 2026-09-29-palyak-szoletra-nyelvek, 4. és 6. döntés (B szelet). */

const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LEVELS = Array.from({ length: GRADE_LEVEL_COUNT }, (_, i) => i + 1);

test("6. döntés: a létra az 1. pályán rövid (8 fok), a 10.-en hosszú (20 fok), pályánként nem rövidül", () => {
  assert.equal(ladderRungsForLevel(1), 8);
  assert.equal(ladderRungsForLevel(10), 20);
  for (const level of LEVELS.slice(1)) {
    assert.ok(ladderRungsForLevel(level) >= ladderRungsForLevel(level - 1), `${level}. pálya rövidebb az előzőnél`);
  }
  assert.equal(ladderRungsForLevel(Number.NaN), 8, "érvénytelen pálya = 1. pálya");
  assert.equal(ladderRungsForLevel(99), 20);
});

/**
 * SPEC-VÁLTOZÁS 2026-11-22 (docs/specs/2026-11-22-szoletra-szintezes.md 4.2, tulajdonosi kérés): a régi 6. döntés „10. pálya =
 * legfelső szint minden évfolyamon” helyett a pálya az évfolyam sávjában marad — az 1. pálya az évfolyam alapszintje, a
 * 10. pálya legfeljebb egy szinttel feljebb. (Mérve: a régi szabállyal a 3.-os a 8. pályától B1–B2-t kapott.)
 */
test("SPEC-VÁLTOZÁS 2026-11-22: a kérdés-szint pályánként nem csökken; 1. pálya = az évfolyam alapszintje; 10. pálya ≤ alapszint + 1", () => {
  for (const grade of GRADES) {
    const tiers = LEVELS.map((level) => ladderTierForLevel(grade, level));
    for (let i = 1; i < tiers.length; i++) assert.ok(tiers[i]! >= tiers[i - 1]!, `${grade}. évfolyam: ${tiers.join(",")}`);
    assert.equal(tiers[0], ladderBaseTier(grade), `${grade}. évfolyam 1. pálya: ${tiers[0]}`);
    assert.ok(tiers[9]! <= Math.min(4, ladderBaseTier(grade) + 1), `${grade}. évfolyam 10. pálya: ${tiers[9]}`);
  }
  assert.equal(ladderTierForLevel(3, 10), 1, "3. évfolyam 10. pálya: legfeljebb A1–A2 (régen B2)");
});

test("2026-11-22: futáson belül nincs ismétlés az évfolyam-sávos választóval sem, és a kérdés a sávban marad — minden évfolyam × pálya", () => {
  const buckets = ladderStepBuckets(ladderTiersFromBank(WORD_LADDER_EN), "en");
  const bad: string[] = [];
  for (const grade of GRADES) {
    const windowed = windowLadderSteps(buckets, grade);
    const win = ladderGradeWindow(grade);
    const stepOf = new Map(windowed.flatMap((b, step) => b.map((q) => [q.id, step] as const)));
    for (const level of LEVELS) {
      const rng = seeded(grade * 100 + level);
      const session = createLadderStepSession(grade, level);
      const seen: SeenItem[] = [];
      for (let i = 0; i < ladderRungsForLevel(level) * 2; i++) {
        const q = pickUnseen(windowed, session.step, seen, rng);
        assert.ok(q, "van kérdés");
        if (seen.some((s) => s.id === q.id || s.prompt === q.prompt)) bad.push(`${grade}/${level}: ismétlés ${q.id}`);
        const step = stepOf.get(q.id)!;
        if (step < win.minStep || step > win.maxStep) bad.push(`${grade}/${level}: sávon kívül ${q.id}`);
        seen.push({ id: q.id, prompt: q.prompt });
        session.answer(rng() < 0.7);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("a futás sávja a pálya sávjából indul, és a pálya ±0,15-én belül marad", () => {
  for (const level of LEVELS) {
    const session = createLadderLevelSession(level);
    assert.equal(session.band, levelBand(level));
    for (let i = 0; i < 12; i++) session.answer(true);
    assert.ok(session.band <= levelBand(level) + LEVEL_BAND_SPREAD + 1e-9, `${level}: ${session.band}`);
    for (let i = 0; i < 12; i++) session.answer(false);
    assert.ok(session.band >= levelBand(level) - LEVEL_BAND_SPREAD - 1e-9, `${level}: ${session.band}`);
    session.reset(3);
    assert.equal(session.band, levelBand(3));
  }
});

test("4. döntés: haladás nyelvenként külön gameId-vel", () => {
  assert.equal(wordLadderGameId("en"), "wordladder-en");
  assert.equal(wordLadderGameId("de"), "wordladder-de");
  assert.equal(wordLadderGameId("fr"), "wordladder-fr");
});

test("a tájak a létra hosszával arányosak: alul rét, a célnál csillagok; mérföldkő csak felfelé és tájváltáskor", () => {
  for (const total of [8, 13, 16, 20]) {
    assert.equal(zoneForProgress(0, total).id, "meadow");
    assert.equal(zoneForProgress(total, total).id, "stars");
    const seen = new Set<string>();
    for (let r = 0; r <= total; r++) seen.add(zoneForProgress(r, total).id);
    assert.deepEqual([...seen], LADDER_ZONES.map((z) => z.id), `${total} fok: minden táj sorban`);
    assert.equal(milestoneForProgress(3, 2, total), null);
  }
  assert.equal(zoneForProgress(8, 16).id, "forest", "16 fokon a régi beosztás marad");
  assert.equal(milestoneForProgress(4, 5, 16), LADDER_ZONES[1]!.milestone);
});

test("nyelvválasztó: csak tételt exportáló bank választható, az angol mindig; sorrend en, de, fr", () => {
  const one = [WORD_LADDER_EN[0]!] as LadderItem[];
  assert.deepEqual(availableLadderLanguages({ en: WORD_LADDER_EN }), ["en"]);
  assert.deepEqual(availableLadderLanguages({ en: WORD_LADDER_EN, de: [], fr: undefined }), ["en"]);
  assert.deepEqual(availableLadderLanguages({ fr: one, de: one, en: WORD_LADDER_EN }), ["en", "de", "fr"]);
});

test("nyelv-tárolás: websuli.wordladder.lang; hiányzó, sérült vagy nem elérhető érték → angol; a tárolási hiba nem dob", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  assert.equal(LADDER_LANG_STORAGE_KEY, "websuli.wordladder.lang");
  assert.equal(loadLadderLanguage(["en", "de"], storage), "en");
  saveLadderLanguage("de", storage);
  assert.equal(data.get(LADDER_LANG_STORAGE_KEY), "de");
  assert.equal(loadLadderLanguage(["en", "de"], storage), "de");
  assert.equal(loadLadderLanguage(["en"], storage), "en", "a német bank nincs meg → angol");
  data.set(LADDER_LANG_STORAGE_KEY, "klingon");
  assert.equal(loadLadderLanguage(["en", "de", "fr"], storage), "en");
  const broken = { getItem: () => { throw new Error("tiltott"); }, setItem: () => { throw new Error("tiltott"); } };
  assert.equal(loadLadderLanguage(["en", "de"], broken), "en");
  assert.doesNotThrow(() => saveLadderLanguage("fr", broken));
});

test("a bank szintekre bontása a tier mező szerint", () => {
  const tiers = ladderTiersFromBank(WORD_LADDER_EN);
  assert.equal(tiers.length, 5);
  tiers.forEach((items, tier) => assert.ok(items.length > 0 && items.every((q) => q.tier === tier), `${tier}. szint`));
  assert.equal(tiers.flat().length, WORD_LADDER_EN.length);
});

/** Determinisztikus álvéletlen (mulberry32). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("6. döntés: futáson belül nincs ismétlés — minden évfolyam × pálya, a létra kétszeresének megfelelő kérdés", () => {
  const tiers = ladderTiersFromBank(WORD_LADDER_EN);
  const bad: string[] = [];
  for (const grade of GRADES) {
    for (const level of LEVELS) {
      const rng = seeded(grade * 100 + level);
      const session = createLadderLevelSession(level);
      const seen: SeenItem[] = [];
      const questions = ladderRungsForLevel(level) * 2;
      for (let i = 0; i < questions; i++) {
        const q = pickUnseen(tiers, ladderTierIndex(grade, session.band), seen, rng);
        assert.ok(q, "van kérdés");
        if (seen.some((s) => s.id === q.id || s.prompt === q.prompt)) bad.push(`${grade}/${level}: ${q.id}`);
        seen.push({ id: q.id, prompt: q.prompt });
        session.answer(rng() < 0.7);
      }
    }
  }
  assert.deepEqual(bad, []);
});
