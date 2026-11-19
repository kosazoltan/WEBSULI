import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
import { estimateLines } from "../client/src/game-engine/play/promptFit";
import {
  CRYSTAL_ARM_MS,
  CRYSTAL_LABEL_MAX_CHARS,
  CRYSTAL_MIN_ROW_GAP_PX,
  CRYSTAL_RADIUS,
  bulletCountsAsAnswer,
  crystalAt,
  crystalLabelTier,
  labelFitsChip,
  crystalLabelsFit,
  crystalZoneFor,
  hitCrystal,
  spawnCrystals,
  worldYAtScreenFrac,
} from "../client/src/lib/spaceAsteroid/crystals";
import {
  CAMERA_FOV_DEG,
  CAMERA_LOOK_Y,
  CAMERA_Y,
  CAMERA_Z,
  MAX_BOMBS,
  MAX_LIVES,
  MAX_SHIELD_SEC,
  applyPickupEffect,
  dropChance,
  gradeEase,
  interpolate,
  lifeLossOutcome,
  PLAYER_Y_MIN,
  pickDropKind,
  playerXLimit,
  visibleHalfWidth,
  volleyFor,
} from "../client/src/lib/spaceAsteroid/physics";
import { shotCenterVx } from "../client/src/lib/spaceAsteroid/aimAssist";
import { createRng } from "../shared/game-rng";

/** Review #486 — a közös szabálymag (ütközés, felvehető elemek, évfolyam-könnyítés, élesítés, zóna) tiszta tesztjei. */

test("M1 — az ütközés szabálya: a menet vége / a főellenfél legyőzése, a sérthetetlenség és a pajzs nem sebez; a tanító szakasz nem von életet", () => {
  const base = { runOver: false, invuln: 0, shield: 0, elapsed: 100 };
  assert.equal(lifeLossOutcome(base), "life");
  assert.equal(lifeLossOutcome({ ...base, elapsed: 10 }), "tutorial");
  assert.equal(lifeLossOutcome({ ...base, runOver: true }), "none", "a vége után (győzelem is) nincs sérülés");
  assert.equal(lifeLossOutcome({ ...base, runOver: true, elapsed: 10 }), "none");
  assert.equal(lifeLossOutcome({ ...base, invuln: 0.5 }), "none");
  assert.equal(lifeLossOutcome({ ...base, shield: 3 }), "none");
});

test("felvehető elemek: a drop-tábla és a hatás (határokkal) a magban", () => {
  assert.equal(dropChance("rock"), 0.18);
  assert.equal(dropChance("alien"), 0.4);
  assert.equal(pickDropKind(0.1), "life");
  assert.equal(pickDropKind(0.5), "power");
  assert.equal(pickDropKind(0.8), "shield");
  assert.equal(pickDropKind(0.95), "bomb");
  const s0 = { lives: 3, shieldSec: 0, bombs: 0, powerLevel: 0, powerSec: 0, score: 0 };
  assert.equal(applyPickupEffect(s0, "life").lives, 4);
  assert.equal(applyPickupEffect({ ...s0, lives: MAX_LIVES }, "life").lives, MAX_LIVES);
  assert.equal(applyPickupEffect({ ...s0, shieldSec: 19 }, "shield").shieldSec, MAX_SHIELD_SEC);
  assert.equal(applyPickupEffect({ ...s0, bombs: MAX_BOMBS }, "bomb").bombs, MAX_BOMBS);
  assert.equal(applyPickupEffect({ ...s0, powerLevel: 2 }, "power").powerLevel, 2);
  assert.equal(applyPickupEffect(s0, "power").powerSec, 10);
});

test("évfolyam-könnyítés: 3–4. évfolyamon ritkább érkezés és lassabb ellenfél, 5-től nincs", () => {
  assert.deepEqual(gradeEase(3), { spawnScale: 1.3, speedScale: 0.85 });
  assert.deepEqual(gradeEase(4), gradeEase(3));
  assert.deepEqual(gradeEase(5), { spawnScale: 1, speedScale: 1 });
  assert.deepEqual(gradeEase(null), { spawnScale: 1, speedScale: 1 });
});

test("interpolate: lineáris, 0..1-re szorítva, hibás arányra a mostani érték (K.4/9)", () => {
  assert.equal(interpolate(0, 10, 0), 0);
  assert.equal(interpolate(0, 10, 0.25), 2.5);
  assert.equal(interpolate(0, 10, 1), 10);
  assert.equal(interpolate(0, 10, 1.7), 10);
  assert.equal(interpolate(0, 10, -1), 0);
  assert.equal(interpolate(2, 4, Number.NaN), 4);
});

/* ------------------------------ M2: élesítés és szándékos célzás ------------------------------ */

test("M2 — az élesítés: a kérdés megjelenése + 500 ms előtt és a korábbi tűz-nyomással nem válaszol; csak az élesítés UTÁNI nyomás igen", () => {
  assert.ok(CRYSTAL_ARM_MS >= 400, "KSZ-11: ≥ 400 ms előjelzés");
  const shownAtMs = 10_000;
  const armed = shownAtMs + CRYSTAL_ARM_MS;
  // a kérdés ELŐTT nyomott tűz (tartott tűz): soha
  for (const nowMs of [shownAtMs, armed - 1, armed, armed + 5_000, armed + 60_000]) {
    assert.equal(bulletCountsAsAnswer({ nowMs, shownAtMs, pressAtMs: shownAtMs - 3 }), false, `régi nyomás, ${nowMs}`);
    assert.equal(bulletCountsAsAnswer({ nowMs, shownAtMs, pressAtMs: Number.NEGATIVE_INFINITY }), false);
  }
  // élesítés alatt nyomott tűz sem
  assert.equal(bulletCountsAsAnswer({ nowMs: armed + 200, shownAtMs, pressAtMs: armed - 1 }), false);
  // az élesítés alatt kilőtt lövedék az élesítés után sem (a nyomás ideje számít)
  assert.equal(bulletCountsAsAnswer({ nowMs: armed + 50, shownAtMs, pressAtMs: shownAtMs + 100 }), false);
  // szándékos: új nyomás az élesítés után
  assert.equal(bulletCountsAsAnswer({ nowMs: armed + 300, shownAtMs, pressAtMs: armed }), true);
  assert.equal(bulletCountsAsAnswer({ nowMs: armed - 1, shownAtMs, pressAtMs: armed }), false, "a lövedék is csak élesítés után válaszol");
});

const presentation = { id: 3, options: [{ label: "a", correct: false }, { label: "b", correct: true }, { label: "c", correct: false }, { label: "d", correct: false }] };
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

/** A lap lövedék–kristály ítélete (a lap `tick`-je): a lövedék a hajó x-éről halad felfelé; az első találat válaszol, ha jogosult. */
function shotAnswer(args: { shipX: number; crystals: ReturnType<typeof spawnCrystals>; nowMs: number; shownAtMs: number; pressAtMs: number }) {
  if (!bulletCountsAsAnswer({ nowMs: args.nowMs, shownAtMs: args.shownAtMs, pressAtMs: args.pressAtMs })) return null;
  for (let y = -8; y < 12; y += 0.1) {
    const c = crystalAt(args.crystals, args.shipX, y);
    if (c) return hitCrystal(args.crystals, c.id);
  }
  return null;
}

test("M2 — tartott tűzzel, célzás nélkül a bot 0 választ ad: az élesítés alatt és utána is (a nyomás a kérdés előtti)", () => {
  const rng = createRng(11);
  let wrong = 0;
  let answered = 0;
  for (const vp of VIEWPORTS) {
    for (let trial = 0; trial < 200; trial++) {
      const zone = crystalZoneFor({ boxWidthPx: vp.width, boxHeightPx: vp.height * 0.7, boxTopPx: 70, viewport: vp, prompt: "Melyik a terület mértékegysége?", safeTopPx: 0 });
      const crystals = spawnCrystals(presentation, zone, rng.next);
      const shownAtMs = 1000 * trial;
      const shipX = (rng.next() - 0.5) * 2 * zone.maxX;
      // a tűz a kérdés előtt nyomódott le és végig tartott: a lövedékek 180 ms-onként indulnak, 0 – 6 mp-ig
      for (let t = 0; t <= 6000; t += 180) {
        const hit = shotAnswer({ shipX, crystals, nowMs: shownAtMs + t, shownAtMs, pressAtMs: shownAtMs - 250 });
        if (hit) {
          answered += 1;
          if (!hit.correct) wrong += 1;
        }
      }
    }
  }
  assert.equal(answered, 0, "tartott tűz sosem válaszol");
  assert.equal(wrong, 0);
});

test("M2 — a nyugvó hajó (x = 0) szándékos nyomása sem talál kristályt: a válaszsor nincs a lövés vonalában (4 válasz, minden képarány)", () => {
  const rng = createRng(5);
  // A mért játékterek (mobil mérő: 360×~450, 390×~600, 844×~330 és az asztali nézetek) képaránya >= 0,65; ennél keskenyebb vászon
  // nem valós elrendezés (a kristály-sávok ott a középre esnének).
  for (const w of [320, 360, 390, 430, 560, 844, 1100]) {
    for (const h of [330, 390, 450, 520, 600]) {
      if (w / h < 0.65) continue;
      const zone = crystalZoneFor({ boxWidthPx: w, boxHeightPx: h, boxTopPx: 70, viewport: { width: Math.max(w, 360), height: 640 }, prompt: "Mennyi?", safeTopPx: 0 });
      const crystals = spawnCrystals(presentation, zone, rng.next);
      const hit = shotAnswer({ shipX: 0, crystals, nowMs: 5000, shownAtMs: 0, pressAtMs: 4000 });
      assert.equal(hit, null, `${w}×${h}: a középen álló hajó lövése kristályt talált`);
    }
  }
});

test("M2 — a mindig jó választ lövő bot (C-56) 0 rosszat ad; a szándékosan, de találomra célzó bot válasza vegyes (a kristály a játékosé)", () => {
  const rng = createRng(9);
  let wrongAlways = 0;
  let answeredAlways = 0;
  let wrongRandom = 0;
  let answeredRandom = 0;
  for (let trial = 0; trial < 300; trial++) {
    const zone = crystalZoneFor({ boxWidthPx: 360, boxHeightPx: 450, boxTopPx: 70, viewport: VIEWPORTS[0], prompt: "Mennyi?", safeTopPx: 0 });
    const crystals = spawnCrystals(presentation, zone, rng.next);
    // „mindig jó”: a bot a helyes kristály x-ére áll és az élesítés után nyom
    const good = crystals.find((c) => c.correct)!;
    const a = shotAnswer({ shipX: good.x, crystals, nowMs: 2000, shownAtMs: 0, pressAtMs: CRYSTAL_ARM_MS + 10 });
    if (a) {
      answeredAlways += 1;
      if (!a.correct) wrongAlways += 1;
    }
    const crystals2 = spawnCrystals(presentation, zone, rng.next);
    const b = shotAnswer({ shipX: (rng.next() - 0.5) * 2 * zone.maxX, crystals: crystals2, nowMs: 2000, shownAtMs: 0, pressAtMs: CRYSTAL_ARM_MS + 10 });
    if (b) {
      answeredRandom += 1;
      if (!b.correct) wrongRandom += 1;
    }
  }
  assert.equal(answeredAlways, 300);
  assert.equal(wrongAlways, 0);
  assert.ok(answeredRandom > 0, "a szándékos célzás válaszol");
  assert.ok(answeredRandom < 300 * 0.7, `a találomra lövés csak ritkán talál (${answeredRandom}/300): a kristály kiválasztása szándékos`);
  assert.ok(wrongRandom > 0, "a találomra célzás vegyes");
});

/* ------------------------------ zóna a magban (KSZ-1) ------------------------------ */

test("a világ-y a vászon-hányadnál megegyezik a three.js kamera `unproject` számításával", () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 0.8, 0.1, 100);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.lookAt(0, CAMERA_LOOK_Y, 0);
  camera.updateMatrixWorld(true);
  for (const frac of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    const v = new THREE.Vector3(0, 1 - 2 * frac, 0.5).unproject(camera);
    v.sub(camera.position);
    const t = -camera.position.z / v.z;
    const expected = camera.position.y + v.y * t;
    assert.ok(Math.abs(worldYAtScreenFrac(frac) - expected) < 1e-6, `frac ${frac}: ${worldYAtScreenFrac(frac)} != ${expected}`);
  }
});

test("a kristály-zóna a magból: érvényes, a sorok ≥ 72 px-re, és a hosszú prompt nem teszi magasabbra a zónát (a kártya alá nem csúszik)", () => {
  for (const vp of VIEWPORTS) {
    const box = { boxWidthPx: vp.width, boxHeightPx: vp.height * 0.72, boxTopPx: 60, viewport: vp, safeTopPx: 0 };
    const short = crystalZoneFor({ ...box, prompt: "Mennyi?" });
    const long = crystalZoneFor({ ...box, prompt: "Melyik állítás igaz a felszíni vizek és a talajvíz kapcsolatára, ha a csapadék hosszabb ideig elmarad egy területen?" });
    for (const z of [short, long]) {
      assert.ok(z.maxY > z.minY && z.maxX > z.minX);
      assert.ok(z.maxY - z.minY >= 3 - 1e-9, "legalább a legkisebb zónamagasság");
    }
    assert.ok(long.maxY <= short.maxY + 1e-9, "a hosszabb kártya alatt a zóna teteje nem magasabb");
    // a két sor közti képpont-távolság >= 72: a világ-y visszafordítva vászon-hányadra (a kamera nem lineáris)
    const fracOf = (y: number): number => {
      let lo = -0.5;
      let hi = 1.5;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (worldYAtScreenFrac(mid) > y) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const rowGapPx = (fracOf(long.minY) - fracOf(long.maxY)) * box.boxHeightPx;
    assert.ok(rowGapPx >= CRYSTAL_MIN_ROW_GAP_PX - 1, `${vp.width}×${vp.height}: sortávolság ${rowGapPx.toFixed(1)} px`);
  }
});

/* ------------------------------ hosszú válaszok: mért legrosszabb eset ------------------------------ */

test("hosszú válaszok (> 22 karakter): a leghosszabb tétel a bankban megkeresve, a lista (360×640) a vászon 72%-ába belefér, teljes szöveggel", () => {
  let long = 0;
  let maxLen = 0;
  let worstHeight = 0;
  let worst: readonly string[] = [];
  const widthPx = 360 - 12 - 16 - 20 - 36; // a lista belső szélessége: oldalsáv, belső térköz, gombtérköz, sorszám-jel
  const fontPx = 15;
  const lineHeight = fontPx * 1.25;
  for (const q of GRADE_QUIZ_ITEMS) {
    const labels = q.options as readonly string[];
    if (!crystalLabelsFit(labels)) long += 1;
    maxLen = Math.max(maxLen, ...labels.map((l) => l.length));
    // egy lista-gomb magassága: >= 48, vagy sorok x sormagasság + térköz
    const h = labels.reduce((sum, l) => sum + Math.max(48, estimateLines(l, widthPx, fontPx) * lineHeight + 16), 0) + 6 * labels.length + 44 + 16;
    if (h > worstHeight) {
      worstHeight = h;
      worst = labels;
    }
  }
  console.log(
    `[space-asteroid-rules] banki tételek ${GRADE_QUIZ_ITEMS.length}, hosszú válaszú: ${long} (${((long / GRADE_QUIZ_ITEMS.length) * 100).toFixed(1)}%), leghosszabb válasz ${maxLen} karakter, a lista legrosszabb becsült magassága ${Math.round(worstHeight)} px (${JSON.stringify(worst)})`,
  );
  assert.ok(long > 0, "van hosszú válaszú tétel (a lista nem holt kód)");
  assert.ok(maxLen > CRYSTAL_LABEL_MAX_CHARS);
  // a vászon 360×640-en ~ 640 - 70 (HUD) - 140 (vezérlősáv) = 430 px; a lista legfeljebb 72% (max-height), fölötte görgethető
  const sceneHeight = 640 - 70 - 140;
  assert.ok(worstHeight <= sceneHeight * 0.72 + 1, `a legrosszabb lista ${Math.round(worstHeight)} px > ${Math.round(sceneHeight * 0.72)} px`);
});

/* ------------------------------ L1: hármas lövés (review #486, vak ellenőrzés) ------------------------------ */

test("L1 — hármas lövéssel (a játék saját `volleyFor`-ja) 0% téves válasz: az oldalsó lövedék nem válaszolhat, a célzott kristályt a középső találja (minden nézet, hajó-magasság, célzási hiba)", () => {
  const VPS = [
    { width: 360, height: 640, box: 0.7 },
    { width: 390, height: 844, box: 0.72 },
    { width: 412, height: 915, box: 0.72 },
    { width: 844, height: 390, box: 0.77 },
  ] as const;
  const rng = createRng(21);
  let volleys = 0;
  let wrong = 0;
  let missedTarget = 0;
  for (const vp of VPS) {
    const zone = crystalZoneFor({ boxWidthPx: vp.width, boxHeightPx: vp.height * vp.box, boxTopPx: 70, viewport: { width: vp.width, height: vp.height }, prompt: "Mennyi?", safeTopPx: 0 });
    for (const shipY of [-9.6, -8, -6, -4, -2.4]) {
      for (let target = 0; target < 4; target++) {
        for (const err of [-0.6, -0.3, 0, 0.3, 0.6]) {
          const crystals = spawnCrystals(presentation, zone, rng.next);
          const aimed = crystals[target]!;
          // a hajó a célpont alatt (célzási hiba: ±0,6 egység), a hajó nem repülhet a kristály fölé: csak ha a kristály a hajó fölött van
          if (aimed.y - CRYSTAL_RADIUS < shipY + 0.7) continue;
          const shipX = aimed.x + err;
          const bullets = volleyFor(1, 0).map((s) => ({ x: shipX + s.dx, y: shipY + s.dy, vx: s.vx, vy: s.vy, side: s.side }));
          let answered: number | null = null;
          // a lap tick-je: előbb minden lövedék mozog, aztán sorban az ütközés-vizsgálat; az első jogosult találat válaszol
          for (let step = 0; step < 100 && answered === null; step++) {
            for (const b of bullets) {
              b.x += b.vx / 60;
              b.y += b.vy / 60;
            }
            for (const b of bullets) {
              if (!bulletCountsAsAnswer({ nowMs: 5000, shownAtMs: 0, pressAtMs: 4000, side: b.side })) continue;
              const c = crystalAt(crystals, b.x, b.y);
              if (c) {
                answered = c.optionIndex;
                break;
              }
            }
          }
          volleys++;
          if (answered === null) missedTarget++;
          else if (answered !== target) wrong++;
        }
      }
    }
  }
  assert.ok(volleys > 100, `kevés próba: ${volleys}`);
  assert.equal(wrong, 0, `${wrong}/${volleys} hármas lövés a NEM célzott kristályra válaszolt`);
  assert.equal(missedTarget, 0, `${missedTarget}/${volleys} lövés a célzott kristályt sem találta (a középső lövedék legyen elég)`);
});

test("L1 — a `volleyFor`: egyes lövésnél 1 középső, hármasnál +2 oldalsó (side) lövedék; az oldalsó soha nem válaszol", () => {
  assert.equal(volleyFor(0, 0).length, 1);
  assert.equal(volleyFor(0, 0)[0]!.side, false);
  const triple = volleyFor(2, 0);
  assert.equal(triple.length, 3);
  assert.deepEqual(triple.map((b) => b.side), [false, true, true]);
  for (const s of triple.filter((b) => b.side)) {
    assert.equal(bulletCountsAsAnswer({ nowMs: 9000, shownAtMs: 0, pressAtMs: 5000, side: s.side }), false);
  }
  assert.equal(bulletCountsAsAnswer({ nowMs: 9000, shownAtMs: 0, pressAtMs: 5000, side: false }), true);
});

/* ------------------------------ L2: kristály-felirat méret-fok (review #486) ------------------------------ */

test("L2 — a kristály-felirat méret-foka a leghosszabb szó szerint (kötőjel törési hely); a regex-hiba (`S{9,}`) nem tér vissza", () => {
  assert.equal(crystalLabelTier("kör"), "normal");
  assert.equal(crystalLabelTier("paradicsom"), "long"); // 10 karakter
  assert.equal(crystalLabelTier("környezetszennyezés"), "xwide"); // 19
  assert.equal(crystalLabelTier("jobbágyfelszabadítást"), "xwide"); // 21
  assert.equal(crystalLabelTier("Dunántúli-középhegység"), "long"); // a kötőjel két szóra bontja: 9 és 12
  assert.equal(crystalLabelTier("tizennégykarakter"), "xwide");
  assert.equal(crystalLabelTier("tizenkétbetűs1"), "wide"); // 14
  assert.equal(crystalLabelTier("nyolcbetű"), "long"); // 9
  assert.equal(crystalLabelTier("nyolcbet"), "normal"); // 8
});

test("L3 — minden nézetben (fekvőben is) MINDEN kristály lövéssel választható: a hajó a legalsó helyéről a kristály alá áll, és a középső lövedék pontosan azt találja", () => {
  const VPS = [
    { width: 360, height: 640, box: 0.7 },
    { width: 390, height: 844, box: 0.72 },
    { width: 412, height: 915, box: 0.72 },
    { width: 844, height: 390, box: 0.77 },
  ] as const;
  const rng = createRng(33);
  for (const vp of VPS) {
    const zone = crystalZoneFor({ boxWidthPx: vp.width, boxHeightPx: vp.height * vp.box, boxTopPx: 70, viewport: { width: vp.width, height: vp.height }, prompt: "Melyik a terület mértékegysége?", safeTopPx: 0 });
    const aspect = vp.width / (vp.height * vp.box);
    const limit = playerXLimit(visibleHalfWidth(CAMERA_FOV_DEG, aspect, CAMERA_Z));
    const crystals = spawnCrystals(presentation, zone, rng.next);
    for (const c of crystals) {
      assert.ok(Math.abs(c.x) <= limit + 1e-9, `${vp.width}×${vp.height}: a ${c.optionIndex}. kristály (x ${c.x.toFixed(2)}) a hajó vízszintes határán (±${limit.toFixed(2)}) kívül van`);
      assert.ok(c.y - CRYSTAL_RADIUS > PLAYER_Y_MIN + 0.7, `${vp.width}×${vp.height}: a ${c.optionIndex}. kristály a hajó legalsó helye alatt van`);
      // a legalsó helyről, a kristály alól lőve a középső lövedék pontosan ezt a kristályt találja
      let hit: number | null = null;
      for (let y = PLAYER_Y_MIN + 0.7; y < 12 && hit === null; y += 0.1) hit = crystalAt(crystals, c.x, y)?.optionIndex ?? null;
      assert.equal(hit, c.optionIndex, `${vp.width}×${vp.height}: a ${c.optionIndex}. kristály nem választható egyenes lövéssel`);
    }
  }
});

/* ------------------------------ vak ellenőrzés L2 / L5 ------------------------------ */

test("vak L2 — nyitott kérdésnél a célzássegéd nem téríti el a középső lövedéket; az eltérített (segített) középső lövedék sem válaszolhat", () => {
  // kérdés nyitva, a segéd egy oldalra levő sziklára mutatna (3,31): a lövés EGYENES marad
  assert.equal(shotCenterVx({ touchAssist: true, questionOpen: true, assistVx: 3.31 }), 0);
  // nincs nyitott kérdés: a segéd az ellenfél felé téríthet
  assert.equal(shotCenterVx({ touchAssist: true, questionOpen: false, assistVx: 3.31 }), 3.31);
  // billentyűzetnél soha
  assert.equal(shotCenterVx({ touchAssist: false, questionOpen: false, assistVx: 3.31 }), 0);
  // egy a kérdés előtt kilőtt, eltérített középső lövedék a kristályon áthalad (nem válaszol)
  const assisted = volleyFor(0, 3.31)[0]!;
  assert.equal(assisted.side, true, "az eltérített középső lövedék nem jogosult válaszra");
  assert.equal(bulletCountsAsAnswer({ nowMs: 9000, shownAtMs: 0, pressAtMs: 5000, side: assisted.side }), false);
  assert.equal(volleyFor(0, 0)[0]!.side, false, "az egyenes középső lövedék jogosult");
  // a vak ellenőrzés számolt ellenpéldája: a helyes alól lőve, a rossz cél magasságán a lövedék x-e a hibás kristály közelében járna
  const start = { x: -1.299, y: -8.9 };
  const wrongTarget = { x: 1.299, y: 2.622 };
  const t = (wrongTarget.y - start.y) / 14;
  const xAtWrong = start.x + 3.31 * t;
  assert.ok(Math.abs(xAtWrong - wrongTarget.x) < 0.3, `a segített lövedék a rossz célt találná (x ${xAtWrong.toFixed(2)} vs ${wrongTarget.x})`);
});

test("vak L5 — a kristály-felirat beférése a VALÓDI szélességgel számol: a törhetetlen, széles szó (22 × W) nem fér, a banki szavak igen", () => {
  // modellezett betűszélesség (px, félkövér): W széles (0,95 em), kisbetű ~0,56 em
  const measure = (word: string, px: number) => [...word].reduce((n, ch) => n + (ch === "W" || ch === "M" ? 0.95 : 0.56) * px, 0);
  assert.equal(labelFitsChip("W".repeat(22), measure, 360), false, "22 × W 360 px-en nem fér");
  assert.equal(labelFitsChip("W".repeat(22), measure, 844), false, "22 × W fekvőn sem");
  assert.equal(labelFitsChip("Dunántúli-középhegység", measure, 360), true);
  assert.equal(labelFitsChip("paradicsom", measure, 360), true);
  assert.equal(crystalLabelsFit(["kör", "W".repeat(22)], (o) => labelFitsChip(o, measure, 360)), false, "a mért beférés a listát indítja");
  assert.equal(crystalLabelsFit(["kör", "négyzet"], (o) => labelFitsChip(o, measure, 360)), true);
  // a karakterszám-küszöb továbbra is él
  assert.equal(crystalLabelsFit(["a".repeat(23)], () => true), false);
});
