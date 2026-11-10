import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gradeTypedAnswers } from "../shared/answer-value";
import { matchRightOrder } from "../shared/match-order";
import { newsletterSubject } from "../shared/newsletter";
import { SPEECH_START_TIMEOUT_MS, SPEECH_START_TIMEOUT_REMOTE_MS, speechStartTimeoutMs } from "../shared/speech-fallback";

// Spec 2026-11-10-hibavadaszat, A szelet.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("A5 — párosító: a jobb oszlop sorrendje permutáció, determinisztikus, és 3+ párnál eltér a bal oszlopétól", () => {
  const sets = [
    [["kutya", "dog"], ["macska", "cat"], ["ló", "horse"]],
    [["2 · 3", "6"], ["4 · 5", "20"], ["7 · 8", "56"], ["9 · 9", "81"]],
    [["a", "1"], ["b", "2"], ["c", "3"], ["d", "4"], ["e", "5"], ["f", "6"]],
    ...Array.from({ length: 40 }, (_, n) => Array.from({ length: 3 + (n % 5) }, (_, i) => [`bal ${n}-${i}`, `jobb ${n}-${i}`])),
  ].map((set) => set.map(([left, right]) => ({ left, right })));
  for (const pairs of sets) {
    const order = matchRightOrder(pairs);
    assert.deepEqual([...order].sort((a, b) => a - b), pairs.map((_, i) => i), "minden eredeti index pontosan egyszer");
    assert.deepEqual(matchRightOrder(pairs), order, "ugyanarra a bemenetre ugyanaz a sorrend");
    assert.ok(order.some((original, shown) => original !== shown), `nem azonos a bal oszloppal: ${JSON.stringify(pairs[0])}`);
  }
  assert.deepEqual(matchRightOrder([]), []);
  assert.deepEqual(matchRightOrder([{ left: "a", right: "b" }]), [0]);
  assert.equal(matchRightOrder([{ left: "a", right: "1" }, { left: "b", right: "2" }]).length, 2);
});

test("A6 — mértékegység: az „m” nem „mm”, „másodperc”, „m²” vagy „m/s”; a helyes alakok továbbra is jók", () => {
  const grade = (answer: string, unit: string) => gradeTypedAnswers(answer, [{ part: "a", kind: "number", value: "5", unit }]).correct;
  for (const wrong of ["5 mm", "5 másodperc", "5 m²", "5 m/s", "5 m2", "5 cm"]) assert.equal(grade(wrong, "m"), 0, wrong);
  for (const right of ["5 m", "5m", "5 m.", "5 m, mert ennyi", "(5 m)", "Az eredmény 5 m"]) assert.equal(grade(right, "m"), 1, right);
  assert.equal(grade("5 m²", "m²"), 1);
  assert.equal(grade("5 cm²", "cm²"), 1);
  assert.equal(grade("5 Ft", "Ft"), 1);
  assert.equal(grade("5 °C", "°C"), 1);
});

test("A3 — az indulási őr ideje: hálózati hangnak több idő jár", () => {
  assert.equal(speechStartTimeoutMs(true), SPEECH_START_TIMEOUT_MS);
  assert.equal(speechStartTimeoutMs(undefined), SPEECH_START_TIMEOUT_MS);
  assert.equal(speechStartTimeoutMs(false), SPEECH_START_TIMEOUT_REMOTE_MS);
  assert.ok(SPEECH_START_TIMEOUT_REMOTE_MS > SPEECH_START_TIMEOUT_MS);
});

test("A8 — a hírlevél tárgya nem vág félbe emojit", () => {
  const prefix = newsletterSubject("Marci", "");
  // A 69. és a 70. UTF-16 egység határára eső emoji: a régi `slice(0, 69)` árva helyettesítőt hagyott.
  const title = `${"a".repeat(68)}🚀${"b".repeat(10)}`;
  const subject = newsletterSubject("Marci", title);
  assert.equal(subject, `${prefix}${"a".repeat(68)}🚀…`);
  assert.equal(subject.isWellFormed(), true);
  assert.equal(newsletterSubject("Marci", "Hogyan működik a villanymotor?"), `${prefix}Hogyan működik a villanymotor?`);
  assert.equal(newsletterSubject("Marci", "x".repeat(70)), `${prefix}${"x".repeat(70)}`, "70 karakterig nincs vágás");
  assert.equal(newsletterSubject("Marci", "x".repeat(71)), `${prefix}${"x".repeat(69)}…`);
});

test("A1, A2 — forrásőr: a fülváltás a közös leállítót hívja; az el nem indult kimondás megszakítása tartalékot ad", () => {
  const view = source("../client/src/lesson-runtime/LessonExperienceView.tsx");
  assert.match(view, /useEffect\(\(\) => \(\) => \{ stopSpeech\(\); \}, \[tab\]\);/);
  assert.doesNotMatch(view, /speechSynthesis\.cancel\(\)/);
  const speech = source("../client/src/lesson-runtime/ExperienceSpeech.tsx");
  assert.match(speech, /export function stopSpeech\(\)/);
  assert.match(speech, /isSoftSpeechError\(e\?\.error\) && started/);
  assert.match(speech, /utterance\.onboundary = /);
});

test("A4 — forrásőr: a hálózati hiba felismerése nem függ a böngésző hibaszövegétől", () => {
  const client = source("../client/src/lib/queryClient.ts");
  assert.doesNotMatch(client, /includes\('fetch'\)/);
  assert.equal(client.match(/error instanceof TypeError/g)?.length, 2);
});

test("A7 — forrásőr: az értesítés célcíme az oldal eredetéhez oldódik fel", () => {
  const worker = source("../client/public/service-worker.js");
  assert.match(worker, /new URL\(event\.notification\.data\?\.url \|\| '\/', self\.location\.origin\)\.href/);
});
