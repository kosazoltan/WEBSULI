import assert from "node:assert/strict";
import test from "node:test";

import { createRng, seedFrom } from "../shared/game-rng";
import { bankPlayQuestion, createQuestionDirector, restoreReviewQuestion } from "../client/src/game-engine/play/questionDirector";
import { readingWpm, wordsOf } from "../client/src/game-engine/play/reading";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import {
  DEFAULT_LADDER_TEMPO,
  LADDER_TEMPO_STORAGE_KEY,
  LEAD_IN_MS,
  armedAt,
  ladderFreeGripMs,
  ladderRivalSecPerRung,
  ladderWallRungs,
  ladderWindowMs,
  ladderXpScale,
  loadLadderTempo,
  paceDirector,
  saveLadderTempo,
  sharedWindowMs,
  tempoParams,
  type LadderTempo,
} from "../client/src/lib/wordLadder/pacing";
import { SIM_REVEAL_WRONG_MS, wordLadderDirectorConfig } from "../client/src/lib/wordLadder/sim";

/**
 * Szólétra olvashatóság (docs/specs/2026-11-17-szoletra-olvashatosag.md A–C, SZ-1…SZ-4, SZ-8). Az elvárások a szabályból
 * (C-15): a nyugodt ablak ≥ tájékozódás (1,5 s) + a teljes szöveg olvasása (prompt + MIND a négy opció) az évfolyam
 * közös olvasási becslésének 0,45-szörösével + döntés (3–4. évf. 5 s, egyébként 4,5 s), és ≥ 2× a mostani (közös) ablak.
 */

const GRADES = [3, 4, 5, 6, 7, 8, 9, 11, 12];
const ITEMS: { name: string; prompt: string; options: string[] }[] = [
  { name: "rövid szó", prompt: "„Kutya” angolul:", options: ["dog", "duck", "door", "desk"] },
  { name: "átlagos szó", prompt: "Mit jelent: „raise your hand”?", options: ["jelentkezik", "integet búcsúzóul", "mi a foglalkozásod?", "hetente egyszer"] },
  { name: "hiányos mondat", prompt: "Our _____ is on the first floor.", options: ["closed", "surprised", "difficult", "classroom"] },
  {
    name: "hosszú mondat",
    prompt: "Mit jelent ez a mondat? „Today is a national holiday, so there is no school.”",
    options: ["Ma nemzeti ünnep van, ezért nincs iskola.", "Ne mutogass emberekre, az udvariatlan.", "Gondold meg alaposan, mielőtt közzéteszel valamit.", "Az új könyve májusban jelenik meg."],
  },
];

const expectedCalmFloor = (prompt: string, options: string[], grade: number) => {
  const words = wordsOf(prompt) + options.reduce((n, o) => n + wordsOf(o), 0);
  const read = (words / (readingWpm(grade) * 0.45)) * 60_000;
  return 1500 + read + (grade <= 4 ? 5000 : 4500);
};

test("SZ-1: évfolyam × prompthossz táblázat — a nyugodt ablak ≥ teljes olvasás + döntés, ≥ 2× a mostani, ≤ 40 s", () => {
  for (const g of GRADES) {
    for (const it of ITEMS) {
      const w = ladderWindowMs({ prompt: it.prompt, options: it.options, grade: g, tempo: "calm" });
      const shared = sharedWindowMs(it.prompt, it.options, g);
      assert.ok(w >= Math.min(40_000, Math.round(expectedCalmFloor(it.prompt, it.options, g))) - 1, `${g}. évf ${it.name}: ${w} < olvasás + döntés`);
      assert.ok(w >= Math.min(40_000, 2 * shared) - 1, `${g}. évf ${it.name}: ${w} < 2 × ${shared}`);
      assert.ok(w <= 40_000, `${g}. évf ${it.name}: ${w} > plafon`);
    }
  }
});

test("SZ-1: 3–4. évfolyamon egy átlagos szókérdésnél a nyugodt ablak ≥ 12 s (a mostani 5,6 s)", () => {
  for (const g of [3, 4]) {
    for (const it of ITEMS.slice(0, 2)) {
      const w = ladderWindowMs({ prompt: it.prompt, options: it.options, grade: g, tempo: "calm" });
      assert.ok(w >= 12_000, `${g}. évf ${it.name}: ${w}`);
    }
  }
});

test("SZ-1: monoton — hosszabb szöveg ≥ ablak; azonos szövegnél magasabb évfolyam ≤ ablak (minden tempón)", () => {
  for (const tempo of ["calm", "normal", "fast"] as LadderTempo[]) {
    for (const g of GRADES) {
      let prev = 0;
      for (let words = 1; words <= 40; words += 3) {
        const prompt = `Mit jelent: ${Array.from({ length: words }, (_, i) => `w${i}`).join(" ")}?`;
        const w = ladderWindowMs({ prompt, options: ["a", "b", "c", "d"], grade: g, tempo });
        assert.ok(w >= prev, `${tempo} ${g}. évf ${words} szó: ${w} < ${prev}`);
        prev = w;
      }
    }
    for (const it of ITEMS) {
      let prev = Number.POSITIVE_INFINITY;
      for (const g of GRADES) {
        const w = ladderWindowMs({ prompt: it.prompt, options: it.options, grade: g, tempo });
        assert.ok(w <= prev, `${tempo} ${it.name} ${g}. évf: ${w} > ${prev}`);
        prev = w;
      }
    }
  }
});

test("C: a Gyors tempó pontosan a mostani (közös) ablak; Normál a kettő között", () => {
  for (const g of GRADES) {
    for (const it of ITEMS) {
      const fast = ladderWindowMs({ prompt: it.prompt, options: it.options, grade: g, tempo: "fast" });
      const normal = ladderWindowMs({ prompt: it.prompt, options: it.options, grade: g, tempo: "normal" });
      const calm = ladderWindowMs({ prompt: it.prompt, options: it.options, grade: g, tempo: "calm" });
      assert.equal(fast, sharedWindowMs(it.prompt, it.options, g));
      assert.ok(fast <= normal && normal <= calm, `${g}. évf ${it.name}: ${fast} / ${normal} / ${calm}`);
    }
  }
});

test("SZ-4: tempó-tárolás — alap Nyugodt; ismeretlen / hibás / dobó tárolás → Nyugodt; mentés-visszaolvasás", () => {
  assert.equal(DEFAULT_LADDER_TEMPO, "calm");
  assert.equal(loadLadderTempo(null), "calm");
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(loadLadderTempo(storage), "calm");
  mem.set(LADDER_TEMPO_STORAGE_KEY, "turbo");
  assert.equal(loadLadderTempo(storage), "calm");
  for (const t of ["calm", "normal", "fast"] as LadderTempo[]) {
    saveLadderTempo(t, storage);
    assert.equal(loadLadderTempo(storage), t);
  }
  saveLadderTempo("turbo" as LadderTempo, storage);
  assert.equal(mem.get(LADDER_TEMPO_STORAGE_KEY), "fast", "ismeretlen érték nem kerül a tárolóba");
  const throwing = { getItem: () => { throw new Error("tiltva"); }, setItem: () => { throw new Error("tiltva"); } };
  assert.equal(loadLadderTempo(throwing), "calm");
  assert.doesNotThrow(() => saveLadderTempo("fast", throwing));
});

test("SZ-3: a rivális Nyugodt / Normál tempón minden évfolyamon és pályán lassabb, a szintenkénti gyorsulás szelídebb; Gyors = a mostani", () => {
  for (const g of GRADES) {
    for (let level = 1; level <= 10; level++) {
      const fast = ladderRivalSecPerRung(level, g, "fast");
      assert.ok(Math.abs(fast - (6.3 - 0.1 * (level - 1))) < 1e-9, "Gyors = 6,3 s − 0,1 s / pálya");
      assert.ok(ladderRivalSecPerRung(level, g, "normal") >= fast);
      assert.ok(ladderRivalSecPerRung(level, g, "calm") >= ladderRivalSecPerRung(level, g, "normal"));
    }
  }
  assert.ok(tempoParams("calm").rivalLevelSpeedup < tempoParams("fast").rivalLevelSpeedup);
  assert.equal(wordLadderDirectorConfig(5, "calm").slowMo, 0.35, "a kérdés alatt alig halad (terv 4.1/3 minimuma)");
  assert.equal(wordLadderDirectorConfig(5, "normal").slowMo, 0.5);
  assert.equal(wordLadderDirectorConfig(5, "fast").slowMo, 1);
  assert.equal(wordLadderDirectorConfig(5).slowMo, 0.35, "alapérték: Nyugodt");
});

test("SZ-8: hibás / lejárt válasz után a megoldás ≥ 3 s-ig látszik (minden tempón — a közös sáv egyszer jön létre)", () => {
  assert.ok(SIM_REVEAL_WRONG_MS >= 3000);
});

test("B/C: a nyugodt fal alacsonyabb (≥ 8 fok), a menet-XP szorzója a fal-szorzó reciproka (a nyugodt mód nem büntetés)", () => {
  for (const rungs of [24, 30, 35, 42]) {
    const calm = ladderWallRungs(rungs, "calm");
    assert.ok(calm >= 8 && calm < rungs);
    assert.equal(ladderWallRungs(rungs, "fast"), rungs);
    // Teljes falnyi helyes fogás XP-je tempótól függetlenül ~ ugyanannyi (kerekítési tűréssel).
    const ratio = (calm * ladderXpScale("calm")) / rungs;
    assert.ok(ratio > 0.9 && ratio < 1.1, `calm XP-arány ${ratio}`);
  }
  assert.equal(ladderXpScale("fast"), 1);
});

test("B: a szabad fogás (kérdés nélkül) ütemezése a tempóval arányos — Gyors tempón a régi 4,2 s", () => {
  for (let level = 1; level <= 10; level++) {
    assert.equal(ladderFreeGripMs(4200, level, 7, "fast"), 4200);
    assert.ok(ladderFreeGripMs(4200, level, 7, "calm") > 4200);
  }
});

function makeDirector(n = 30) {
  let i = 0;
  const items = Array.from({ length: n }, (_, k) => ({ id: `t${k}`, prompt: `Mit jelent: word${k}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }));
  return createQuestionDirector({
    config: wordLadderDirectorConfig(4, "calm"),
    provider: { couponOnly: false, material: () => null, fresh: () => (i < n ? bankPlayQuestion("word-ladder-hu-en", items[i++]!) : null), restore: (it) => restoreReviewQuestion(it, {}) },
    review: createReviewQueue(null, { now: () => 0, rng: createRng(seedFrom("p", 1)) }),
    rng: createRng(seedFrom("pq", 1)),
    startBand: 0.4,
    now: () => 0,
  });
}

test("SZ-2: paceDirector — az óra az előjelzés után indul, az ablak a tempóé, azonos identitás, a director kimenete változatlan", () => {
  let tempo: LadderTempo = "calm";
  const base = makeDirector();
  const d = paceDirector(base, { grade: () => 4, tempo: () => tempo });
  const p = d.request("trigger", 5000)!;
  assert.ok(p);
  assert.ok(LEAD_IN_MS >= 400, "KSZ-11: ≥ 400 ms előjelzés");
  assert.equal(p.startedAtSimMs, 5000 + LEAD_IN_MS);
  assert.equal(armedAt(p), 5000 + LEAD_IN_MS);
  assert.equal(p.windowMs, ladderWindowMs({ prompt: p.question.quiz.prompt, options: p.options.map((o) => o.label), grade: 4, tempo: "calm" }));
  assert.ok(p.windowMs > base.active()!.windowMs, "a burkolt ablak nagyobb a director saját (≤ 9 s) ablakánál");
  assert.equal(d.active(), p, "azonos objektum (a kérdés-sáv identitás szerint figyel)");
  assert.equal(d.active(), d.active());
  // Szünet menüben váltott tempó: a nyitott kérdés ablaka nem változik.
  tempo = "fast";
  assert.equal(d.active()!.windowMs, p.windowMs);
  const o = d.answer(p.id, p.options.findIndex((x) => x.correct), 9000)!;
  assert.equal(o.result, "correct");
  assert.equal(o.responseMs, 9000 - 5000, "a menet-statisztika valós (a kérés óta eltelt) időt mér");
  assert.equal(d.active(), null);
  // A következő kérdés már a Gyors tempó ablakát kapja.
  const q = d.request("trigger", 20_000)!;
  assert.equal(q.windowMs, sharedWindowMs(q.question.quiz.prompt, q.options.map((x) => x.label), 4));
});
