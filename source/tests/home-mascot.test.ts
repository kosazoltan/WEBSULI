import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MASCOT_PREFS, HOME_MASCOT_META_NAME, MASCOT_BOX_CLASS, MASCOT_PHRASES, MASCOT_TITLE_MAX, daySeed, fillPhrase, homeMascotEnabled,
  mascotHref, mascotPicks, nextStep, parseMascotPrefs, phraseGroupFor, pickPhrase, serializeMascotPrefs,
  type MascotStep, type PhraseGroup,
} from "../client/src/lib/home-mascot";
import { HOME_MASCOT_META } from "../server/lib/home-flags";
import { frameKeyframes, frameTransform, liftKeyframes, sheetRows } from "../client/src/mascot/sprite-player";

// docs/specs/2026-11-18-kabala-fooldal.md — a főoldali kabala tiszta logikája (K2, K3, K5 és az állapotgép).
const NOW = new Date("2026-11-18T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const f = (id: string, classroom: number, createdAt: string) => ({ id, classroom, createdAt, title: id });
const ids = (list: { id: string }[]) => list.map((x) => x.id);

test("K3: ismert évfolyamnál az évfolyam három legújabbja, a legújabb elöl", () => {
  const files = [f("a5-regi", 5, day(200)), f("b8", 8, day(0)), f("c5", 5, day(3)), f("d5", 5, day(1)), f("e5", 5, day(40)), f("g5", 5, day(90))];
  const picks = mascotPicks(files, 5, NOW);
  // szabály: csak az 5. évfolyam, createdAt csökkenő → d5 (1 napos), c5 (3), e5 (40)
  assert.deepEqual(ids(picks.files), ["d5", "c5", "e5"]);
  assert.equal(picks.fromGrade, true);
  // „Új” = 30 napnál frissebb: d5 és c5 igen, e5 (40 napos) nem
  assert.deepEqual(picks.files.map(picks.isNew), [true, true, false]);
});

test("K3: az üdvözlő kártyával ellentétben egyetlen friss anyag mellett is HÁROM jön (a régebbiekkel kiegészítve)", () => {
  const files = [f("uj", 5, day(2)), f("regi1", 5, day(100)), f("regi2", 5, day(150)), f("regi3", 5, day(300))];
  assert.deepEqual(ids(mascotPicks(files, 5, NOW).files), ["uj", "regi1", "regi2"]);
});

test("K3: ismeretlen évfolyam, anyag nélküli évfolyam és admin (null) → minden évfolyamból", () => {
  const files = [f("a", 5, day(9)), f("b", 8, day(1)), f("c", 3, day(4)), f("d", 5, day(2))];
  for (const grade of [null, 11]) {
    const picks = mascotPicks(files, grade, NOW);
    assert.deepEqual(ids(picks.files), ["b", "d", "c"], `grade=${grade}`);
    assert.equal(picks.fromGrade, false);
  }
});

test("K3: 0, 1 és 2 tananyag — ennyi elem jön vissza, hiba nélkül", () => {
  assert.deepEqual(mascotPicks([], 5, NOW).files, []);
  assert.deepEqual(ids(mascotPicks([f("egy", 5, day(1))], 5, NOW).files), ["egy"]);
  assert.deepEqual(ids(mascotPicks([f("x", 5, day(5)), f("y", 5, day(1))], null, NOW).files), ["y", "x"]);
});

test("K3: holtversenynél azonosító szerint stabil; érvénytelen dátum a legrégebbi és nem „Új”; a bemenet nem változik", () => {
  const same = day(1);
  const files = [f("zeta", 5, same), f("alfa", 5, same), f("rossz", 5, "nem-datum"), f("beta", 5, same)];
  const copy = [...files];
  const picks = mascotPicks(files, 5, NOW);
  assert.deepEqual(ids(picks.files), ["alfa", "beta", "zeta"]);
  assert.deepEqual(files, copy);
  const all = mascotPicks([f("rossz", 5, "nem-datum")], 5, NOW);
  assert.equal(all.isNew(all.files[0]), false);
});

test("a tananyag címe: lecke /preview/, PDF /materials/pdf/ (mint a kártyáknál)", () => {
  assert.equal(mascotHref({ id: "abc" }), "/preview/abc");
  assert.equal(mascotHref({ id: "abc", contentType: "html" }), "/preview/abc");
  assert.equal(mascotHref({ id: "p1", contentType: "pdf" }), "/materials/pdf/p1");
});

test("feliratok: minden csoportban legalább 3 változat, magyarul, a {title} csak az ajánló csoportokban", () => {
  for (const [group, list] of Object.entries(MASCOT_PHRASES) as [PhraseGroup, readonly string[]][]) {
    assert.ok(list.length >= 3, `${group}: ${list.length} változat`);
    assert.equal(new Set(list).size, list.length, `${group}: ismétlődő mondat`);
    for (const text of list) {
      const hasTitle = text.includes("{title}");
      assert.equal(hasTitle, group === "pick" || group === "single", `${group}: „${text}”`);
      // a buborék 3 sora (≈ 84 karakter 360 px-en): a sablon a leghosszabb megengedett címmel is rövid marad
      assert.ok(text.replace("{title}", "").length <= 56, `${group}: túl hosszú sablon (${text.length})`);
    }
  }
});

test("mondatválasztás: determinisztikus, a magra körbejár, és nem ismétli az előzőt", () => {
  const list = MASCOT_PHRASES.pick;
  assert.equal(pickPhrase("pick", 0), list[0]);
  assert.equal(pickPhrase("pick", list.length + 1), list[1]);
  assert.equal(pickPhrase("pick", -1), list[list.length - 1]);
  assert.equal(pickPhrase("pick", 2), pickPhrase("pick", 2));
  // ha a kiválasztott egyezne az előzővel, a következő jön
  assert.equal(pickPhrase("pick", 0, list[0]), list[1]);
  assert.equal(pickPhrase("pick", list.length - 1, list[list.length - 1]), list[0]);
  // egymást követő magokra sosem ugyanaz kétszer
  let previous: string | null = null;
  for (let seed = 0; seed < 40; seed++) {
    const next = pickPhrase("rest", seed % 2 === 0 ? 0 : 3, previous);
    assert.notEqual(next, previous);
    previous = next;
  }
});

test("a cím kitöltése: rövid cím változatlan; hosszú cím legfeljebb 60 karakter, szóhatáron, „…”-tal; üres cím nem tör", () => {
  assert.equal(fillPhrase("Ezt nézd: {title}", "Törtek összeadása"), "Ezt nézd: Törtek összeadása");
  assert.equal(fillPhrase("Ezt nézd: {title}", "  Sok   szóköz \n itt "), "Ezt nézd: Sok szóköz itt");
  const long = "A honfoglalás és az államalapítás kora: fejedelmek, királyok és a kereszténység felvétele";
  const filled = fillPhrase("{title}", long);
  assert.ok(filled.length <= MASCOT_TITLE_MAX, `${filled.length}`);
  assert.ok(filled.endsWith("…"));
  assert.ok(long.startsWith(filled.slice(0, -1)), "a levágott rész a cím eleje");
  assert.equal(long[filled.length - 1], " ", "szóhatáron vág");
  const unbroken = "x".repeat(200);
  assert.equal(fillPhrase("{title}", unbroken).length, MASCOT_TITLE_MAX);
  assert.equal(fillPhrase("Szia! {title}", null), "Szia! ");
  assert.equal(fillPhrase("Nincs helyőrző", "cím"), "Nincs helyőrző");
});

test("a nap magja a helyi nap sorszáma: egy napon belül azonos, másnap eggyel több", () => {
  const morning = new Date(2026, 10, 18, 0, 5);
  const night = new Date(2026, 10, 18, 23, 55);
  const next = new Date(2026, 10, 19, 0, 5);
  assert.equal(daySeed(morning), daySeed(night));
  assert.equal(daySeed(next), daySeed(morning) + 1);
});

test("K5: beállítások — csak a pontos alak érvényes, minden más az alapállapot; oda-vissza azonos", () => {
  assert.deepEqual(parseMascotPrefs(null), DEFAULT_MASCOT_PREFS);
  assert.deepEqual(DEFAULT_MASCOT_PREFS, { v: 1, mode: "on", seen: 0 });
  for (const raw of ["", "{", "null", "[]", '"on"', '{"v":2,"mode":"on","seen":0}', '{"v":1,"mode":"loud","seen":0}', '{"v":1,"mode":"on","seen":-1}', '{"v":1,"mode":"on","seen":1.5}', '{"v":1,"mode":"on","seen":"3"}', '{"v":1,"mode":"on"}']) {
    assert.deepEqual(parseMascotPrefs(raw), DEFAULT_MASCOT_PREFS, raw);
  }
  for (const prefs of [{ v: 1, mode: "quiet", seen: 4 }, { v: 1, mode: "hidden", seen: 0 }, { v: 1, mode: "on", seen: 12 }] as const) {
    assert.deepEqual(parseMascotPrefs(serializeMascotPrefs(prefs)), prefs);
  }
  assert.equal(parseMascotPrefs('{"v":1,"mode":"on","seen":123456789}').seen, 9999);
});

test("K4: állapotgép — első látogató: köszön, sorban végigvezet, örömugrás, pihenés; utána magától nem mozdul", () => {
  const ctx = { count: 3, returning: false };
  let step: MascotStep = { kind: "enter" };
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    seen.push(step.kind === "enter" ? "enter" : `${step.kind}:${step.index}`);
    step = nextStep(step, { type: "done" }, ctx);
  }
  assert.deepEqual(seen, ["enter", "present:0", "present:1", "present:2", "cheer:2", "rest:2", "rest:2", "rest:2"]);
});

test("K5: állapotgép — visszatérő látogatónál nincs körbevezetés: az első ajánlás után pihen", () => {
  const ctx = { count: 3, returning: true };
  const first = nextStep({ kind: "enter" }, { type: "done" }, ctx);
  assert.deepEqual(first, { kind: "present", index: 0, auto: false });
  assert.deepEqual(nextStep(first, { type: "done" }, ctx), { kind: "rest", index: 0 });
});

test("K4: koppintás — a következő tananyag (körbe), a körbevezetést leállítja; köszönés közben az elsőre lép", () => {
  const ctx = { count: 3, returning: false };
  assert.deepEqual(nextStep({ kind: "enter" }, { type: "tap" }, ctx), { kind: "present", index: 0, auto: false });
  assert.deepEqual(nextStep({ kind: "present", index: 0, auto: true }, { type: "tap" }, ctx), { kind: "present", index: 1, auto: false });
  assert.deepEqual(nextStep({ kind: "rest", index: 2 }, { type: "tap" }, ctx), { kind: "present", index: 0, auto: false });
  assert.deepEqual(nextStep({ kind: "cheer", index: 2, single: false }, { type: "tap" }, ctx), { kind: "present", index: 0, auto: false });
  // a kézi lépés után nincs önműködő továbblépés
  assert.deepEqual(nextStep({ kind: "present", index: 1, auto: false }, { type: "done" }, ctx), { kind: "rest", index: 1 });
});

test("K3/K4: egyetlen tananyagnál nincs körbevezetés; a koppintás helyben ugrat, és ott marad; két tananyagnál kettőig megy", () => {
  const one = { count: 1, returning: false };
  assert.deepEqual(nextStep({ kind: "enter" }, { type: "done" }, one), { kind: "present", index: 0, auto: false });
  assert.deepEqual(nextStep({ kind: "rest", index: 0 }, { type: "tap" }, one), { kind: "cheer", index: 0, single: true });
  assert.deepEqual(nextStep({ kind: "cheer", index: 0, single: true }, { type: "done" }, one), { kind: "rest", index: 0 });
  const two = { count: 2, returning: false };
  assert.deepEqual(nextStep({ kind: "present", index: 1, auto: true }, { type: "done" }, two), { kind: "cheer", index: 1, single: false });
  assert.deepEqual(nextStep({ kind: "present", index: 1, auto: false }, { type: "tap" }, two), { kind: "present", index: 0, auto: false });
  // ha a lista közben rövidebb lett, az index nem mutat a listán kívülre
  assert.deepEqual(nextStep({ kind: "rest", index: 2 }, { type: "done" }, two), { kind: "rest", index: 1 });
});

test("a lépés mondatcsoportja", () => {
  assert.equal(phraseGroupFor({ kind: "enter" }, false), "greeting");
  assert.equal(phraseGroupFor({ kind: "enter" }, true), "returning");
  assert.equal(phraseGroupFor({ kind: "present", index: 1, auto: true }, false), "pick");
  assert.equal(phraseGroupFor({ kind: "cheer", index: 2, single: false }, false), "closing");
  assert.equal(phraseGroupFor({ kind: "cheer", index: 0, single: true }, false), "single");
  assert.equal(phraseGroupFor({ kind: "rest", index: 0 }, false), "rest");
});

test("K2: a kliens a kapcsolót a szerver meta-sorából olvassa — csak a pontos „on” kapcsol", () => {
  const doc = (content: string | null) => ({
    querySelector: (selector: string) => {
      assert.equal(selector, `meta[name="${HOME_MASCOT_META_NAME}"]`);
      return content === null ? null : ({ getAttribute: (name: string) => (name === "content" ? content : null) } as unknown as Element);
    },
  });
  assert.equal(homeMascotEnabled(doc("on")), true);
  for (const value of [null, "", "off", "ON", "true", "1"]) assert.equal(homeMascotEnabled(doc(value)), false, String(value));
  assert.equal(homeMascotEnabled(undefined), false, "dokumentum nélkül (szerver / teszt) kikapcsolva");
  // a szerver sora és a kliens által keresett név ugyanaz
  assert.ok(HOME_MASCOT_META.includes(`name="${HOME_MASCOT_META_NAME}"`) && HOME_MASCOT_META.includes('content="on"'));
});

test("K8: a lefoglalt magasság a CSS méreteiből számolva (telefon / ≥ 640 px), tananyagszám szerint", () => {
  // home-mascot.css: belső térköz 12 / 16, buborék 72, hézag 10, a sorok területe max(figura, n·68 + (n−1)·hézag)
  const box = (n: number, pad: number, maki: number, gap: number) => pad + 72 + 10 + Math.max(maki, n * 68 + (n - 1) * gap) + pad;
  for (const n of [1, 2, 3] as const) {
    assert.equal(MASCOT_BOX_CLASS[n], `h-[${box(n, 12, 140, 6)}px] sm:h-[${box(n, 16, 170, 8)}px]`, `n=${n}`);
  }
});

test("lejátszó: a képkocka helye a lap százalékában, lépcsős kulcskockák, az emelkedés a végén a talajon", () => {
  assert.equal(sheetRows({ cols: 8, frames: 44 }), 6);
  assert.equal(frameTransform(0, 8, 6), "translate(0, 0)");
  // 9. képkocka: 2. sor 2. oszlop → x = 1/8 = 12,5%, y = 1/6 = 16,6667%
  assert.equal(frameTransform(9, 8, 6), "translate(-12.5%, -16.6667%)");
  const clip = { frames: [8, 9, 10], fps: 12, loop: false, lift: [0, 0.1, 0] };
  const frames = frameKeyframes(clip, 8, 6);
  assert.deepEqual(frames.map((k) => k.offset), [0, 1 / 3, 2 / 3, 1]);
  assert.ok(frames.slice(0, 3).every((k) => k.easing === "steps(1, end)"));
  assert.equal(frames[3].transform, frames[2].transform);
  assert.deepEqual(liftKeyframes(clip, 140)?.map((k) => k.transform), ["translateY(0px)", "translateY(-14px)", "translateY(0px)", "translateY(0px)"]);
  assert.equal(liftKeyframes({ ...clip, lift: [0, 0, 0] }, 140), null);
});
