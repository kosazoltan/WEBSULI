import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_OPENERS, LESSON_VARIETY_VERSION, feedbackOpener, feedbackOpenerKey, feedbackView, stripLegacyOpener, withVarietyMarker,
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
        assert.equal(stripLegacyOpener(`${o} Ez itt egy hosszabb indoklás.`), `${o} Ez itt egy hosszabb indoklás.`, `${band}: régi sablon: ${o}`);
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

test("régi, modell írta nyitások levágása; tartalmi kezdet és rövid maradék változatlan", () => {
  const cases: Array<[string, string]> = [
    ["Jó próba, de itt a szorzás az első lépés.", "Itt a szorzás az első lépés."],
    ["Jó próba! A zárójel előbb jön, ezért 14.", "A zárójel előbb jön, ezért 14."],
    ["Szép próbálkozás, de a négyzet oldalai egyenlők.", "A négyzet oldalai egyenlők."],
    ["Ügyes gondolat, de ez a mondat múlt időben áll.", "Ez a mondat múlt időben áll."],
    ["Jó gondolat, azonban a víz 100 °C-on forr.", "A víz 100 °C-on forr."],
    ["Majdnem jó! Ide még egy tizedesjegy kell.", "Ide még egy tizedesjegy kell."],
    ["Szuper! A háromszög szögeinek összege 180°.", "A háromszög szögeinek összege 180°."],
  ];
  for (const [input, expected] of cases) assert.equal(stripLegacyOpener(input), expected, input);
  for (const keep of [
    "Jó, hogy a négyzetet választottad, mert minden oldala egyenlő.",
    "Jóslás helyett számoljunk: 3 · 4 = 12.",
    "Szépen látszik, hogy a görbe emelkedik.",
    "Majdnem minden emlős elevenszülő, de a kacsacsőrű emlős tojik.",
  ]) assert.equal(stripLegacyOpener(keep), keep, keep);
  // A maradék 12 karakternél rövidebb → az eredeti szöveg marad.
  assert.equal(stripLegacyOpener("Jó próba, de 14."), "Jó próba, de 14.");
});

test("V5: jelöletlen lecke — a mai kimenet; jelölt lecke — ítélet után kódnyitás és a régi előtag nélküli indoklás", () => {
  const legacy = { right: false, text: "Jó próba, de itt a szorzás az első lépés." };
  assert.deepEqual(feedbackView({ ...legacy, variety: undefined }), { reason: stripVerdictPrefix(legacy.text, false) });
  assert.deepEqual(feedbackView({ right: true, text: "Helyes: 45.", variety: undefined }), { reason: "45." });
  const marked = { version: LESSON_VARIETY_VERSION };
  const key = feedbackOpenerKey("m", "q", ["a", "b"]);
  const view = feedbackView({ ...legacy, variety: { marker: marked, band: "teen", key } });
  assert.equal(view.reason, "Itt a szorzás az első lépés.");
  assert.equal(view.opener, feedbackOpener("wrong", "teen", key));
  const right = feedbackView({ right: true, text: "Pontosan! A zárójel előbb jön.", variety: { marker: marked, band: "kid", key } });
  assert.equal(right.reason, "A zárójel előbb jön.");
  assert.equal(right.opener, feedbackOpener("right", "kid", key));
  // Csak ítéletből álló szöveg: üres indoklás, a nyitás megmarad.
  assert.deepEqual(feedbackView({ right: true, text: "Igen.", variety: { marker: marked, band: "kid", key } }), { opener: feedbackOpener("right", "kid", key), reason: "" });
});

test("withVarietyMarker: KI — a jelölő (a modelltől jött is) törlődik; BE — a szerver írja be", () => {
  const lesson = { title: "T", variety: { version: "hamis" } };
  assert.deepEqual(withVarietyMarker(lesson, false), { title: "T" });
  assert.deepEqual(withVarietyMarker({ title: "T" }, false), { title: "T" });
  assert.deepEqual(withVarietyMarker(lesson, true), { title: "T", variety: { version: LESSON_VARIETY_VERSION } });
  assert.equal(withVarietyMarker(null, true), null);
  assert.deepEqual(withVarietyMarker([1], true), [1]);
});
