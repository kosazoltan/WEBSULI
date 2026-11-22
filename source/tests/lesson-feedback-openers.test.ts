import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_OPENERS, LESSON_VARIETY_VERSION, feedbackOpener, feedbackOpenerKey, feedbackView, startsWithLegacyOpener, withVarietyMarker,
} from "../shared/lesson-feedback-openers";
import { AGE_BANDS } from "../shared/lesson-schema";
import { stripVerdictPrefix } from "../shared/lesson-ui-text";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a; V3–V5): a bátorító / megerősítő nyitás kódszótárból, korosztályonként,
// kérdésenként a magból — a változatosság mérhető.

const firstWord = (s: string) => s.toLocaleLowerCase("hu-HU").replace(/^[^\p{L}]+/u, "").split(/[^\p{L}]+/u)[0];

test("V3: sávonként ≥ 24 hibás- és ≥ 12 helyes-nyitás, ≤ 40 karakter, egyedi, a kezdőszó legfeljebb 15%", () => {
  for (const band of AGE_BANDS) {
    const set = FEEDBACK_OPENERS[band];
    assert.ok(set.wrong.length >= 24, `${band}: ${set.wrong.length} hibás-nyitás`);
    assert.ok(set.right.length >= 12, `${band}: ${set.right.length} helyes-nyitás`);
    for (const list of [set.wrong, set.right]) {
      assert.equal(new Set(list).size, list.length, `${band}: ismétlődő nyitás`);
      for (const o of list) {
        assert.ok(o.length <= 40, `${band}: túl hosszú: ${o}`);
        assert.match(o, /[.!?]$/u, `${band}: írásjellel zárul: ${o}`);
        assert.equal(o, o.trim());
        // A kódszótár nem ismételheti a régi, modell írta sablont.
        assert.equal(startsWithLegacyOpener(`${o} Ez itt egy hosszabb indoklás.`), false, `${band}: régi sablon: ${o}`);
      }
      const counts = new Map<string, number>();
      for (const o of list) counts.set(firstWord(o), (counts.get(firstWord(o)) ?? 0) + 1);
      for (const [word, n] of counts) assert.ok(n / list.length <= 0.15, `${band}: „${word}” ${n}/${list.length}`);
    }
  }
});

test("V4: 200 különböző kulcson a leggyakoribb nyitás aránya < 10%, mindhárom sávban, mindkét fajtára", () => {
  const keys = Array.from({ length: 200 }, (_, i) => feedbackOpenerKey(`map-${i % 7}`, `${i + 1}. kérdés: mennyi ${i} + ${i * 3}?`, ["a", "b", "c", `${i}`]));
  assert.equal(new Set(keys).size, 200);
  for (const band of AGE_BANDS) {
    for (const kind of ["right", "wrong"] as const) {
      const counts = new Map<string, number>();
      for (const key of keys) {
        const o = feedbackOpener(kind, band, key);
        assert.ok(FEEDBACK_OPENERS[band][kind].includes(o));
        counts.set(o, (counts.get(o) ?? 0) + 1);
      }
      const top = Math.max(...counts.values());
      assert.ok(top / keys.length < 0.1, `${band}/${kind}: leggyakoribb ${top}/200`);
      // Nem csak néhány nyitás forog: a készlet legalább kétharmada előfordul.
      assert.ok(counts.size >= Math.ceil(FEEDBACK_OPENERS[band][kind].length * 2 / 3), `${band}/${kind}: csak ${counts.size} különböző`);
    }
  }
});

test("V4: determinisztikus — ugyanarra a kulcsra mindig ugyanaz; a kulcs a térképtől és a kérdéstől függ", () => {
  const key = feedbackOpenerKey("map-x", "Mennyi 7 · 8?", ["54", "56", "58"]);
  assert.equal(feedbackOpener("wrong", "kid", key), feedbackOpener("wrong", "kid", key));
  assert.equal(key, feedbackOpenerKey("map-x", "Mennyi 7 · 8?", ["54", "56", "58"]));
  assert.notEqual(key, feedbackOpenerKey("map-y", "Mennyi 7 · 8?", ["54", "56", "58"]));
  assert.notEqual(key, feedbackOpenerKey("map-x", "Mennyi 7 · 9?", ["54", "56", "58"]));
});

test("változatosság mérve: ugyanaz a kérdés, különböző mag (térkép) → eltérő nyitás, mindig a saját korosztály készletéből", () => {
  const question = "Mennyi 3 + 4 · 2?", options = ["14", "11", "10"];
  for (const band of AGE_BANDS) {
    for (const kind of ["right", "wrong"] as const) {
      const picks = Array.from({ length: 50 }, (_, i) => feedbackOpener(kind, band, feedbackOpenerKey(`map-${i}`, question, options)));
      // Korosztályon belül: minden nyitás a sáv saját kódszótárából jön.
      for (const p of picks) assert.ok(FEEDBACK_OPENERS[band][kind].includes(p), `${band}/${kind}: idegen nyitás: ${p}`);
      // Eltérő: 50 magon legalább 8 különböző nyitás, és a leggyakoribb sem több 20%-nál.
      const counts = new Map<string, number>();
      for (const p of picks) counts.set(p, (counts.get(p) ?? 0) + 1);
      assert.ok(counts.size >= 8, `${band}/${kind}: csak ${counts.size} különböző nyitás 50 magon`);
      assert.ok(Math.max(...counts.values()) / picks.length <= 0.2, `${band}/${kind}: a leggyakoribb ${Math.max(...counts.values())}/50`);
      // Ugyanaz a mag → ugyanaz a nyitás (seed-determinisztikus ujjlenyomat).
      assert.deepEqual(picks, Array.from({ length: 50 }, (_, i) => feedbackOpener(kind, band, feedbackOpenerKey(`map-${i}`, question, options))));
    }
  }
});

// Dokumentált spec-változás (tulajdonosi döntés 2026-11-22, „NINCS LEVÁGÁS”): a modell visszajelzés-szövegéhez a kód jelölt leckén
// nem nyúl; a régi levágási tesztek ezért kikerültek. Helyettük: a régi nyitás felismerése zárt listával, pontos egyezéssel.
test("a régi nyitás felismerése: zárt lista, pontos (kis- / nagybetűs) egyezés a szöveg elején, utána nem betű áll", () => {
  for (const text of [
    "Jó próba, de itt a szorzás az első lépés.", "Jó próba! A zárójel előbb jön.", "Jó próbálkozás, de a négyzet oldalai egyenlők.",
    "Szép próbálkozás, de a négyzet oldalai egyenlők.", "Ügyes gondolat, de ez múlt idő.", "Pontosan! A zárójel előbb jön.",
    "Így van: 45.", "Helyes: 45.", "Majdnem jó! Ide még egy tizedesjegy kell.", "Szuper", "Jó próba -3 az eredmény.",
  ]) assert.equal(startsWithLegacyOpener(text), true, text);
  for (const text of [
    "Jó, hogy a négyzetet választottad.", "Jóslás helyett számoljunk: 3 · 4 = 12.", "Szépen látszik, hogy a görbe emelkedik.",
    "Majdnemhogy elfelejtettük.", "Helyesen: 45.", "jó próba, de kisbetűvel.", "index - 1 adja az előző elemet.", "-index az ellentett.",
    "Nem a gyökér: az vizet vesz fel.", "",
  ]) assert.equal(startsWithLegacyOpener(text), false, text);
});

test("V5: jelöletlen lecke — a mai kimenet; jelölt lecke — a modell szövege BÁJTRA változatlan, a kódnyitás csak nyitás nélküli szöveg elé", () => {
  const legacy = { right: false, text: "Jó próba, de itt a szorzás az első lépés." };
  assert.deepEqual(feedbackView({ ...legacy, variety: undefined }), { reason: stripVerdictPrefix(legacy.text, false) });
  assert.deepEqual(feedbackView({ right: true, text: "Helyes: 45.", variety: undefined }), { reason: "45." });
  const marked = { version: LESSON_VARIETY_VERSION };
  const key = feedbackOpenerKey("m", "q", ["a", "b"]);
  // Nyitással kezdődő modellszöveg: nincs csere, nincs kódnyitás.
  assert.deepEqual(feedbackView({ ...legacy, variety: { marker: marked, band: "teen", key } }), { reason: legacy.text });
  assert.deepEqual(feedbackView({ right: true, text: "Pontosan! A zárójel előbb jön.", variety: { marker: marked, band: "kid", key } }), { reason: "Pontosan! A zárójel előbb jön." });
  // Nyitás nélküli modellszöveg: elé kerül a kódnyitás, a szöveg bájtra a modellé.
  for (const [right, text] of [
    [false, "index - 1 adja az előző elem indexét."], [false, "-index a változó ellentettje, nem maga az értéke."],
    [false, "x = -3 a megoldás."], [false, "i++ előbb olvas, utána növel."], [true, "a zárójel előbb jön, ezért 14."], [false, "–3 °C-on fagy meg."],
  ] as const) {
    const view = feedbackView({ right, text, variety: { marker: marked, band: "teen", key } });
    assert.equal(view.reason, text, text);
    assert.equal(view.opener, feedbackOpener(right ? "right" : "wrong", "teen", key));
  }
});

test("withVarietyMarker: KI — a jelölő (a modelltől jött is) törlődik; BE — a szerver írja be", () => {
  const lesson = { title: "T", variety: { version: "hamis" } };
  assert.deepEqual(withVarietyMarker(lesson, false), { title: "T" });
  assert.deepEqual(withVarietyMarker({ title: "T" }, false), { title: "T" });
  assert.deepEqual(withVarietyMarker(lesson, true), { title: "T", variety: { version: LESSON_VARIETY_VERSION } });
  assert.equal(withVarietyMarker(null, true), null);
  assert.deepEqual(withVarietyMarker([1], true), [1]);
});
