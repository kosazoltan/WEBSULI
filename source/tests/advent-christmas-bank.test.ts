import assert from "node:assert/strict";
import test from "node:test";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank/index";
import { buildAdventPlan, findAdventItem, normalizePrompt, subjectOf, type ChristmasItem } from "../shared/advent/assignment";
import { CHRISTMAS_ITEMS } from "../shared/advent/christmasBank/index";
import { christmasItemsNeeded, validateChristmasBank } from "../shared/advent/christmas-validate";
import { ADVENT_CHRISTMAS_DAYS, limitsForGrade } from "../shared/advent/rules";

/**
 * Adventi naptár — a VALÓDI karácsonyi kérdéskészlet (docs/specs/2026-11-18-adventi-naptar.md 12.2, 16.4; A33–A36).
 * A tényszerűséget a független ellenőr tételenkénti tényellenőrzése igazolja — ez a teszt a formát, a mennyiséget és a
 * kiosztást bizonyítja.
 */

const good = (over: Partial<ChristmasItem> = {}): ChristmasItem => ({
  id: "xmas-001", minGrade: 1, maxGrade: 12, prompt: "Melyik hónapban van karácsony?", options: ["Decemberben", "Májusban", "Júliusban", "Októberben"], correctIndex: 0,
  explanation: "A karácsonyt decemberben ünnepeljük, az év utolsó hónapjában.", ...over,
});

test("a szükséges tételszám: 1–2. évfolyam 144 (24 ablak × 3 × 2 kör), 3–12. évfolyam 72 (8 ablak × 3 × 3 kör)", () => {
  assert.equal(ADVENT_CHRISTMAS_DAYS.length, 8);
  for (const grade of [1, 2]) assert.equal(christmasItemsNeeded(grade), 144);
  for (let grade = 3; grade <= 12; grade++) assert.equal(christmasItemsNeeded(grade), 72);
});

test("a valódi készlet átmegy a validátoron (A33)", () => {
  assert.deepEqual(validateChristmasBank(CHRISTMAS_ITEMS, GRADE_QUIZ_ITEMS.map((q) => q.prompt)), []);
  assert.ok(CHRISTMAS_ITEMS.length >= 288, `tételek: ${CHRISTMAS_ITEMS.length}`);
  for (let grade = 1; grade <= 12; grade++) {
    const have = CHRISTMAS_ITEMS.filter((c) => c.minGrade <= grade && grade <= c.maxGrade).length;
    assert.ok(have >= christmasItemsNeeded(grade), `${grade}. évfolyam: ${have}`);
  }
});

test("a validátor megfogja a hibákat (nem csak a jó készletet engedi át)", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => good({ id: `xmas-${String(i + 1).padStart(3, "0")}`, prompt: `Karácsonyi kérdés ${i + 1}?`, correctIndex: i % 4 }));
  assert.deepEqual(validateChristmasBank(many(144)), []);
  const has = (items: ChristmasItem[], pattern: RegExp, bank: string[] = []) =>
    assert.ok(validateChristmasBank(items, bank).some((e) => pattern.test(e)), `nincs ilyen hiba: ${pattern} — ${validateChristmasBank(items, bank).slice(0, 3).join(" / ")}`);
  has(many(143), /1\. évfolyam: 143 érvényes tétel van, 144 kell/);
  has([...many(144).slice(1), good({ id: "xmas-002" })], /ismétlődő azonosító/);
  has([...many(144), good({ id: "xmas-900", prompt: "  KARÁCSONYI   kérdés 1? " })], /azonos kérdés/);
  has([...many(144), good({ id: "xmas-900", prompt: "Mennyi 2 + 2?" })], /közös évfolyam-bankban/, ["mennyi 2 + 2?"]);
  has([...many(144), good({ id: "xmas-900", options: ["a", "b", "c"] })], /pontosan 4 válasz/);
  has([...many(144), good({ id: "xmas-900", options: ["a", "A ", "c", "d"] })], /ismétlődő válasz/);
  has([...many(144), good({ id: "xmas-900", correctIndex: 4 })], /indexe 0–3/);
  has([...many(144), good({ id: "xmas-900", explanation: "Rövid." })], /magyarázat/);
  has([...many(144), good({ id: "xmas-900", minGrade: 5, maxGrade: 3 })], /évfolyamsáv/);
  has([...many(144), good({ id: "xmas-900", minGrade: 0 })], /évfolyamsáv/);
  has([...many(144), good({ id: "xmas-900", prompt: `${"Nagyon hosszú kérdés ".repeat(5)}?` })], /legfeljebb 80 karakter/);
  has([...many(144), good({ id: "karacsony-1" })], /xmas-NNN/);
  has(many(144).map((item) => ({ ...item, correctIndex: 0 })), /túl gyakran/);
});

test("a valódi készlettel és a valódi bankkal minden évfolyam minden köre felépíthető, ismétlés nélkül (A34–A36)", () => {
  for (const subjectKey of ["learner:a", "learner:b", "device:3f2b8c1e-9d4a-4f6b-8a2e-5c7d9e1f0a3b"]) {
    for (let grade = 1; grade <= 12; grade++) {
      const { maxRounds, maxRepairs } = limitsForGrade(grade);
      const usedIds = new Set<string>();
      const usedPrompts = new Set<string>();
      for (let round = 1; round <= maxRounds; round++) {
        const plan = buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season: 2026, round, subjectKey, usedIds, usedPrompts });
        for (let day = 1; day <= 24; day++) {
          assert.equal(plan.doors[day]!.length, 1 + maxRepairs);
          for (const id of plan.doors[day]!) {
            const item = findAdventItem(id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS);
            assert.ok(item, id);
            const christmas = subjectOf(item) === "christmas";
            assert.equal(christmas, grade <= 2 || ADVENT_CHRISTMAS_DAYS.includes(day), `${grade}. évfolyam, ${day}. ablak`);
            if ("minGrade" in item) assert.ok(item.minGrade <= grade && grade <= item.maxGrade, `${id} nem érvényes a(z) ${grade}. évfolyamra`);
            assert.ok(!usedIds.has(id), `ismétlés: ${id}`);
            usedIds.add(id);
            usedPrompts.add(normalizePrompt(item.prompt));
          }
        }
      }
    }
  }
});

test("tapintat és forma: nincs márkanév, a kérdés kérdőjelre vagy idézett folytatásra végződik", () => {
  for (const item of CHRISTMAS_ITEMS) {
    const text = `${item.prompt} ${item.options.join(" ")} ${item.explanation}`;
    assert.doesNotMatch(text, /coca|disney|lego|milka|kinder|nestl|amazon|netflix/i, `${item.id}: márkanév`);
    assert.match(item.prompt.trim(), /[?”…"]$/, `${item.id}: a kérdés vége`);
  }
});
