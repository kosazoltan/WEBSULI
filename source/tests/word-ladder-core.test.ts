import assert from "node:assert/strict";
import test from "node:test";
import { createRng } from "../shared/game-rng";
import {
  RIVAL_WARMUP_MS,
  RUBBER_BAND,
  SLIP_STUN_MS,
  answer,
  climbTarget,
  createLadderState,
  drainEvents,
  finishBonusXp,
  freeGrab,
  leadRungs,
  lossTitle,
  rivalBaseRungPerSec,
  rivalSecPerRungForLevel,
  rivalSpeed,
  stateFingerprint,
  step,
} from "../client/src/lib/wordLadder/core";
import { ladderRungsForLevel } from "../client/src/lib/wordLadderLevels";

/**
 * J2a — a Szikla-verseny tiszta magja (végrehajtás J2a 2. és 7. lépés): gumiszalag, vereség, kombó-lépés, kábulat,
 * szabad fogás, tanító szakasz, determinizmus.
 */

const DT = 1000 / 60;
const fixed = (v: number) => ({ next: () => v });

function run(state: ReturnType<typeof createLadderState>, ms: number, intensity = 0.5, rng: { next(): number } = fixed(0.5)) {
  for (let t = 0; t < ms; t += DT) step(state, DT, intensity, rng);
}

test("jó válasz: +1 fok; a kombó ×2-től (3 jó egymás után) +2 fok; a kombó legjobbja megmarad", () => {
  const s = createLadderState({ targetRung: 30 });
  assert.equal(answer(s, "correct"), 1);
  assert.equal(answer(s, "correct"), 1);
  assert.equal(answer(s, "correct"), 2, "3. egymás utáni jó: a kombó ×2 → két fok");
  assert.equal(answer(s, "correct"), 2);
  assert.equal(s.rung, 6);
  assert.equal(s.combo.best, 4);
  const ev = drainEvents(s).filter((e) => e.kind === "climb");
  assert.deepEqual(ev.map((e) => (e.kind === "climb" ? e.gain : 0)), [1, 1, 2, 2]);
  assert.equal(drainEvents(s).length, 0, "a drainEvents kiüríti a sort");
});

test("rossz válasz: −1 fok (0 alatt 0), 600 ms kábulat, a kombó nullázódik; nem menetvég", () => {
  const s = createLadderState({ targetRung: 30 });
  answer(s, "correct");
  answer(s, "correct");
  answer(s, "correct");
  assert.equal(s.rung, 4);
  assert.equal(answer(s, "wrong"), -1);
  assert.equal(s.rung, 3);
  assert.equal(s.stunMs, SLIP_STUN_MS);
  assert.equal(s.combo.count, 0);
  assert.equal(s.combo.best, 3);
  assert.equal(s.phase, "play");
  const z = createLadderState({ targetRung: 30 });
  assert.equal(answer(z, "wrong"), 0, "a fal alján nem lehet lejjebb csúszni");
  assert.equal(z.rung, 0);
  // a kábulat a lépésekkel fogy
  run(s, SLIP_STUN_MS + 50);
  assert.equal(s.stunMs, 0);
});

test("lejárt idő: a kombó nullázódik, fok nem vész el (a gyerek habozott, nem tévedett)", () => {
  const s = createLadderState({ targetRung: 30 });
  answer(s, "correct");
  answer(s, "correct");
  assert.equal(answer(s, "timeout"), 0);
  assert.equal(s.rung, 2);
  assert.equal(s.combo.count, 0);
  assert.deepEqual(drainEvents(s).at(-1), { kind: "fumble", reason: "timeout" });
});

test("győzelem: a játékos éri el a zászlót → won; utána a válasz és a lépés nem változtat", () => {
  const s = createLadderState({ targetRung: 3 });
  answer(s, "correct");
  answer(s, "correct");
  answer(s, "correct");
  assert.equal(s.phase, "won");
  assert.equal(s.rung, 3, "a cél fölé nem lép");
  const before = stateFingerprint(s);
  answer(s, "correct");
  run(s, 2000);
  assert.equal(stateFingerprint(s), before);
  assert.ok(finishBonusXp(s) >= 50);
});

test("vereség: a rivális ér fel előbb → lost, a hiányzó fokok száma az eseményben; a cím „Majdnem! n fok hiányzott.”", () => {
  const s = createLadderState({ targetRung: 5, baseRungPerSec: 2 });
  run(s, RIVAL_WARMUP_MS + 10_000);
  assert.equal(s.phase, "lost");
  const lost = drainEvents(s).find((e) => e.kind === "lost");
  assert.deepEqual(lost, { kind: "lost", missing: 5 });
  assert.equal(lossTitle(2), "Majdnem! 2 fok hiányzott.");
  assert.equal(finishBonusXp(s), 0);
});

test("tanító szakasz (K.4/25): az első 30 mp-ben a rivális nem érhet fel, és lassabban indul", () => {
  const s = createLadderState({ targetRung: 4, baseRungPerSec: 5 });
  run(s, RIVAL_WARMUP_MS - 100);
  assert.equal(s.phase, "play", "30 mp előtt nincs vereség");
  assert.equal(s.rival.pos, 3, "a rivális a cél alatt vár");
  const a = createLadderState({ targetRung: 50 });
  const early = rivalSpeed(a, 0.5);
  a.timeMs = RIVAL_WARMUP_MS;
  assert.ok(rivalSpeed(a, 0.5) > early * 1.5, "a tanító szakasz után teljes tempó");
});

test("gumiszalag (KSZ-16: legfeljebb ±10%): vezetésnél gyorsabb, lemaradásnál lassabb a rivális, a plafon 4 foknál", () => {
  const s = createLadderState({ targetRung: 40 });
  s.timeMs = RIVAL_WARMUP_MS;
  s.rival.pos = 10;
  s.rung = 10;
  const even = rivalSpeed(s, 0.5);
  s.rung = 14;
  assert.ok(Math.abs(rivalSpeed(s, 0.5) / even - (1 + RUBBER_BAND)) < 1e-9, "4 fok előny: +10%");
  s.rung = 30;
  assert.ok(Math.abs(rivalSpeed(s, 0.5) / even - (1 + RUBBER_BAND)) < 1e-9, "nagyobb előnynél sem több");
  s.rung = 6;
  assert.ok(Math.abs(rivalSpeed(s, 0.5) / even - (1 - RUBBER_BAND)) < 1e-9, "4 fok hátrány: −10%");
  s.rung = 12;
  assert.ok(Math.abs(rivalSpeed(s, 0.5) / even - (1 + RUBBER_BAND / 2)) < 1e-9, "2 fok előny: +5%");
  assert.ok(RUBBER_BAND <= 0.1);
});

test("áramlat: az erős játékosnál (magas intenzitás) gyorsabb a rivális, a gyengénél lassabb (0,9–1,1)", () => {
  const s = createLadderState({ targetRung: 40 });
  s.timeMs = RIVAL_WARMUP_MS;
  const mid = rivalSpeed(s, 0.5);
  assert.ok(Math.abs(rivalSpeed(s, 1) / mid - 1.1) < 1e-9);
  assert.ok(Math.abs(rivalSpeed(s, 0) / mid - 0.9) < 1e-9);
});

test("előzés-események: a játékos megelőzi a riválist, majd a rivális visszaelőz", () => {
  const s = createLadderState({ targetRung: 40, baseRungPerSec: 3 });
  s.timeMs = RIVAL_WARMUP_MS;
  run(s, 800);
  assert.ok(s.rival.rung >= 2);
  drainEvents(s);
  for (let i = 0; i < 4; i++) answer(s, "correct");
  assert.ok(drainEvents(s).some((e) => e.kind === "overtake" && e.by === "player"));
  run(s, 6000);
  assert.ok(drainEvents(s).some((e) => e.kind === "overtake" && e.by === "rival"));
});

test("szabad fogás (kérdés nélkül): siker +1 fok kombó nélkül; kudarc vagy kábulat alatt nincs lépés", () => {
  const s = createLadderState({ targetRung: 10 });
  assert.equal(freeGrab(s, true), 1);
  assert.equal(s.combo.count, 0);
  assert.equal(freeGrab(s, false), 0);
  assert.equal(s.stunMs, SLIP_STUN_MS);
  assert.equal(freeGrab(s, true), 0, "kábulat alatt nem sikerül");
  run(s, SLIP_STUN_MS + 20);
  assert.equal(freeGrab(s, true), 1);
});

test("determinizmus: azonos seed + bemenetsor → azonos végállapot; más seed → más rivális-út", () => {
  const play = (seed: number) => {
    const s = createLadderState({ targetRung: 30 });
    const rng = createRng(seed);
    for (let i = 0; i < 60 * 90; i++) {
      step(s, DT, 0.5, rng);
      if (i % 180 === 90) answer(s, i % 540 === 90 ? "wrong" : "correct");
    }
    return stateFingerprint(s);
  };
  assert.equal(play(7), play(7));
  assert.notEqual(play(7), play(8));
});

test("pálya-hosszak: 24 (1. pálya) … 42 fok (10. pálya), monoton; a rivális a magasabb pályán gyorsabb", () => {
  const walls = Array.from({ length: 10 }, (_, i) => climbTarget(ladderRungsForLevel(i + 1)));
  assert.equal(walls[0], 24);
  assert.equal(walls[9], 42);
  for (let i = 1; i < walls.length; i++) assert.ok(walls[i]! >= walls[i - 1]!);
  assert.ok(rivalBaseRungPerSec(rivalSecPerRungForLevel(10)) > rivalBaseRungPerSec(rivalSecPerRungForLevel(1)));
  const s = createLadderState({ targetRung: 30 });
  s.rung = 5;
  s.rival.pos = 3.26;
  assert.equal(leadRungs(s), 1.7);
});

test("review #454: a közös ismétlési sorból csak a mostani nyelv saját tétele jön vissza (a bankkulcs gameId-je minden nyelven azonos)", async () => {
  const { ownsReviewKey } = await import("../client/src/lib/wordLadder/review");
  const ctx = { gameId: "word-ladder-hu-en", lang: "de", bankIds: new Set(["de0-001", "de1-004"]), materialKeys: new Set<string>() };
  assert.equal(ownsReviewKey("bank:word-ladder-hu-en:de0-001", ctx), true);
  assert.equal(ownsReviewKey("bank:word-ladder-hu-en:en0-001", ctx), false, "angol kézi tétel német menetben");
  assert.equal(ownsReviewKey("bank:speed-quiz-math:x1", ctx), false, "más játék tétele");
  assert.equal(ownsReviewKey("vocab:de:de-hund", ctx), true);
  assert.equal(ownsReviewKey("vocab:en:en-dog", ctx), false, "más nyelv szóbankja");
  assert.equal(ownsReviewKey("mat:m1", ctx), false, "nem a mostani tananyag");
  assert.equal(ownsReviewKey("mat:m1", { ...ctx, materialKeys: new Set(["mat:m1"]) }), true);
  assert.equal(ownsReviewKey("grade:g1", ctx), false, "évfolyam-bank tétele nem a Szólétráé");
});

test("review #454: angol menetben elrontott kézi tétel → német menetben nem tér vissza (a sorban marad), angolra váltva visszajön", async () => {
  const { ownsReviewKey } = await import("../client/src/lib/wordLadder/review");
  const { createQuestionDirector, bankPlayQuestion, restoreReviewQuestion } = await import("../client/src/game-engine/play/questionDirector");
  const { createReviewQueue } = await import("../client/src/game-engine/play/reviewQueue");
  const { wordLadderDirectorConfig } = await import("../client/src/lib/wordLadder/sim");
  const { seedFrom } = await import("../shared/game-rng");
  const T0 = 1_800_000_000_000;
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  const bank = (lang: string) => Array.from({ length: 30 }, (_, i) => ({ id: `${lang}0-${String(i + 1).padStart(3, "0")}`, prompt: `${lang} kérdés ${i}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }));
  const run = (lang: string, wrongFirst: boolean) => {
    const items = bank(lang);
    let i = 0;
    const d = createQuestionDirector({
      config: wordLadderDirectorConfig(7),
      provider: {
        couponOnly: false,
        material: () => null,
        fresh: () => (i < items.length ? bankPlayQuestion("word-ladder-hu-en", items[i++]!) : null),
        restore: (it) =>
          ownsReviewKey(it.key, { gameId: "word-ladder-hu-en", lang, bankIds: new Set(items.map((q) => q.id)), materialKeys: new Set() })
            ? restoreReviewQuestion(it, {})
            : null,
      },
      review: createReviewQueue(storage, { now: () => T0, rng: createRng(seedFrom("rv", lang)) }),
      rng: createRng(seedFrom("q", lang)),
      startBand: 0.4,
      now: () => T0,
    });
    const keys: string[] = [];
    for (let n = 0; n < 12; n++) {
      const p = d.request("trigger", 10_000 + n * 2000);
      if (!p) break;
      keys.push(p.question.key);
      const pick = wrongFirst && n === 0 ? p.options.findIndex((o) => !o.correct) : p.options.findIndex((o) => o.correct);
      d.answer(p.id, pick, 10_000 + n * 2000 + 500);
    }
    return keys;
  };
  const en1 = run("en", true);
  const missed = en1[0]!;
  assert.ok(missed.startsWith("bank:word-ladder-hu-en:en0-"));
  const de = run("de", false);
  assert.ok(!de.includes(missed), "az angol tétel nem jöhet a német menetben");
  assert.ok(de.every((k) => k.startsWith("bank:word-ladder-hu-en:de0-")));
  assert.ok(mem.get("websuli.gameReview.v1")?.includes(missed), "a tétel a sorban maradt");
  const en2 = run("en", false);
  assert.ok(en2.slice(0, 10).includes(missed), "angol menetben visszatér (a következő menet első 10 kérdésében)");
});

test("review #454: egy menetben egy szó csak egy irányban — az ismétlés a már látott kérdés, új tételként nem jön újra", async () => {
  const { createRunWordGuard } = await import("../client/src/lib/wordLadder/review");
  const g = createRunWordGuard<{ prompt: string }>();
  const huToEn = { prompt: "Hogy mondod angolul: kutya?" };
  g.remember("vocab:en:en-dog", huToEn);
  assert.equal(g.freshAllowed("vocab:en:en-dog"), false, "az EN→HU változat (ugyanaz a bejegyzés) nem jöhet új tételként");
  assert.equal(g.sameAsShown("vocab:en:en-dog"), huToEn, "az ismétlés ugyanaz a (HU→EN) kérdés");
  assert.equal(g.freshAllowed("vocab:en:en-cat"), true);
  g.reset();
  assert.equal(g.freshAllowed("vocab:en:en-dog"), true, "új menetben újra jöhet");
});

test("review #454: a felolvasás csak akkor a megjelenéskor, ha a célnyelvi szó ÖNÁLLÓ szóként a promptban van", async () => {
  const { promptHasTerm } = await import("../client/src/lib/wordLadder/review");
  assert.equal(promptHasTerm("„Megy” angolul:", "go"), false, "a „go” az „angolul” részszava — nem árulhatja el a választ");
  assert.equal(promptHasTerm("Mit jelent: „go”?", "go"), true);
  assert.equal(promptHasTerm("Mit jelent: brush your teeth?", "brush your teeth"), true);
  assert.equal(promptHasTerm("Mit jelent: der Hund?", "Hund"), true);
  assert.equal(promptHasTerm("Hogy mondod németül: kutya?", "Hund"), false);
  assert.equal(promptHasTerm("Mit jelent: l'école?", "école"), true);
  assert.equal(promptHasTerm("Bármi", ""), false);
});
