import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { pickBlockCraftGradeSlot } from "../client/src/lib/blockCraftSubjects";
import { createGradeQuizSeen, isGradeQuizSeen, pickGradeQuiz } from "../client/src/game-engine/gradeQuiz";
import { GRADE_QUIZ_ITEMS, GRADE_SUBJECTS, type GradeSubject } from "../client/src/data/gradeQuizBank";

/**
 * S11 — Kockavadász mobilra + szóbank (végrehajtás S11 / „Megírandó tesztek”).
 * Forrásőr a lap valós forrásán (kommentek nélkül, #183) és szimuláció a tárgy-körforgás szóbankos kiváltására.
 */

function pageCode(): string {
  const src = readFileSync(fileURLToPath(new URL("../client/src/pages/BlockCraftQuiz.tsx", import.meta.url)), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A forrás egészét nem írjuk ki a hibaüzenetbe — csak a hiányzó mintát. */
function has(code: string, re: RegExp, msg: string) {
  assert.ok(re.test(code), msg);
}

/** Egy JSX-elem nyitótagje a benne álló szöveg alapján (a `>`-ig, a kapcsos zárójeleken belüli `>`-t átugorva). */
function openingTagBefore(code: string, marker: string): string {
  const at = code.indexOf(marker);
  assert.ok(at >= 0, `nem található: ${marker}`);
  const start = Math.max(code.lastIndexOf("<button", at), code.lastIndexOf("<HoldButton", at), code.lastIndexOf("<Button", at));
  assert.ok(start >= 0, `nincs gomb a(z) ${marker} előtt`);
  return code.slice(start, at);
}

test("akciógombok: Ugrás = HoldButton size=\"auto\", Bányász és Lerak = game-action-btn, egyiken sincs size=\"sm\"", () => {
  const code = pageCode();
  const jump = openingTagBefore(code, ">Ugrás<");
  assert.match(jump, /^<HoldButton\b/, "az Ugrás nem HoldButton");
  assert.match(jump, /size="auto"/, "az Ugrás nem képernyőhöz méretezett (size=\"auto\")");
  for (const label of ["Bányász", "Lerak"]) {
    const tag = openingTagBefore(code, `>${label}<`);
    assert.match(tag, /game-action-btn/, `a(z) ${label} gombon nincs game-action-btn (≥ 56 px)`);
    assert.doesNotMatch(tag, /size="sm"/, `a(z) ${label} gomb 36 px-es size="sm"`);
  }
  assert.doesNotMatch(jump, /size="sm"/, "az Ugrás gomb 36 px-es size=\"sm\"");
  // Az Ugrás a legnagyobb: --game-action-size × 1,15 (terv 4.6/3; végrehajtás S11 / 3. lépés).
  has(code, /\.bc-act-jump\.game-action-btn\s*\{[^}]*width:\s*calc\(var\(--game-action-size\)\s*\*\s*1\.15\)/, "az Ugrás nem 1,15-szörös");
});

test("vezérlősáv: game-touch-layer + data-game-controls, joystick radius=\"auto\", touch-action: none", () => {
  const code = pageCode();
  has(code, /className="game-touch-layer[^"]*"\s+data-game-controls\s+data-testid="bc-touch-controls"/, "a vezérlősáv nem a közös game-touch-layer");
  has(code, /<VirtualJoystick[\s\S]{0,80}radius="auto"/, "a joystick nem képernyőhöz méretezett");
  has(code, /resetSignal=\{joyReset\}/, "a joystick futó húzása szünetkor / kvízkor nem szakad meg");
});

test("érintés-észlelés: useTouchCapable (a régi useCoarsePointer helyett)", () => {
  const code = pageCode();
  has(code, /useTouchCapable\(\)/, "nincs useTouchCapable(");
  assert.doesNotMatch(code, /useCoarsePointer/, "maradt a régi useCoarsePointer");
});

test("szünet: a render-ciklus, a játékóra és a vezérlés szünetben áll", () => {
  const code = pageCode();
  // SPEC-VÁLTOZÁS 2026-11-17 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 5.3 „Megszűnik”, 9.; végrehajtás J3a 3.): a
  // „quiz” fázis megszűnt — a kérdés a „play” al-állapota (Rúna-zár). A szigor marad: a render-ciklus feltételében a
  // szünet (és a „Miért?” kártya) is benne van.
  has(code, /const shouldRun = phase === "play" && !paused && !why\b[^;]*;/, "a shouldRun feltételből hiányzik a paused / a „Miért?”");
  has(code, /if \(phase !== "play" \|\| paused\) return;\s*const id = setInterval/, "a játékóra szünetben is jár");
  has(code, /<PauseMenu\b[\s\S]{0,80}open=\{paused && inRun\}/, "nincs PauseMenu a szünethez");
  has(code, /<GameShell\b[\s\S]{0,120}onAutoPause=\{pauseGame\}/, "nincs automatikus szünet (GameShell onAutoPause)");
  has(code, /exitPointerLock/, "szünetkor nem enged el a pointer lock");
  // A kvízréteg eltakarja a HUD szünetgombját — a kvízen is kell egy (#426 review-lelet).
  has(code, /data-testid="bc-quiz-pause"[\s\S]{0,120}onClick=\{pauseGame\}/, "a kvízrétegen nincs szünetgomb");
  // A játékos mozgása a „play” ágban, a fix lépésű hurokban (a kérdés alatt lassítva fut — terv 4.1/3).
  has(code, /if \(phaseRef\.current === "play"\) \{[\s\S]{0,900}stepPlayerPhysics\(/, "a fizika nem a play ágban lép");
});

test("késleltetett írás: az elismerő felirat időzítője feliratonként él, nem törli a későbbit", () => {
  const code = pageCode();
  assert.doesNotMatch(code, /[^.]setTimeout\(\(\) => setAchievement\(null\)/, "hívásonkénti, elavult időzítő törli a feliratot");
  has(code, /if \(!achievement\) return;\s*const id = window\.setTimeout\(\(\) => setAchievement\(null\), 2500\);\s*return \(\) => window\.clearTimeout\(id\);/, "nincs feliratonkénti, takarított időzítő");
});

test("kétujjas vezérlés: a körbenézés csak a vászon jobb 60%-án indul", () => {
  const code = pageCode();
  has(code, /const LOOK_ZONE_START = 0\.4;/, "a körbenézés-zóna nem a jobb 60%");
  has(code, /isLookZone\(e\.clientX - rect\.left, rect\.width\)/, "a vászon-érintés nem nézi a zónát");
  has(code, /if \(!tl\.look \|\| pausedRef\.current/, "a bal oldali érintés is forgat");
});

test("visszajelzés: rezgés bányászásra, jó és rossz válaszra; rázás csak csökkentett mozgás nélkül", () => {
  const code = pageCode();
  has(code, /useHaptics\(\)/, "nincs useHaptics(");
  for (const kind of ["tap", "success", "error"]) has(code, new RegExp(`haptics\\("${kind}"\\)`), `nincs haptics("${kind}")`);
  has(code, /wrongShake && !reducedMotion \? "animate-shake"/, "a rázás csökkentett mozgásnál is fut");
});

test("keret: GameShell, GameHud (idő a progress-ben), StartScreen bc-start, ResultScreen bc-level-complete / bc-over", () => {
  const code = pageCode();
  has(code, /<GameShell\b[\s\S]{0,40}gameId="BlockCraftQuiz"/, "nincs GameShell gameId=\"BlockCraftQuiz\"");
  has(code, /<GameHud\b[\s\S]{0,120}progress=\{\{ value: timeLeft/, "a HUD nem a GameHud, vagy az idő nem a progress-ben");
  has(code, /<StartScreen\b[\s\S]{0,400}startTestId="bc-start"/, "a StartScreen nem a bc-start testid-t kapja");
  has(code, /testId="bc-level-complete"/, "nincs bc-level-complete eredményképernyő");
  has(code, /testId="bc-over"/, "nincs bc-over eredményképernyő");
  assert.doesNotMatch(code, /text-\[(9|10|11)px\]/, "maradt 12 px alatti szöveg (text-[9–11px])");
});

test("szóbank: a tárgy-körforgás a fogyást nyilvántartó segéden át megy, a tananyag-ág elöl", () => {
  const code = pageCode();
  has(code, /pickBlockCraftGradeSlot\(\{\s*subject,\s*pick: \(\) => pickGradeQuiz\(\{ grade: sharedGrade/, "a körforgás nem a pickBlockCraftGradeSlot-ot használja");
  has(code, /const vocab = useVocabQuizSource\("en", true\);/, "nincs angol szóbank-forrás");
  has(code, /vocab\?\.next\(vocabLevelForGrade\(userGrade, adaptiveRef\.current\.band\)\)/, "a szóbank nem az évfolyam + sáv szintjén kérdez");
  assert.ok(code.indexOf("pickUnseenMaterial(") < code.indexOf("vocab?.next("), "a szóbank a tananyag-ág előtt áll");
});

/* ---------- szimuláció: a szóbankos kiváltás nem akasztja meg a többtantárgyas körforgást ---------- */

/**
 * A lap körforgásának pontos mása (BlockCraftQuiz pickQuiz, 3–12. évfolyam ág): a `GRADE_SUBJECTS` sorrendjében
 * helyenként `pickBlockCraftGradeSlot`; üres tárgy kimarad. A szóbank végtelen (`vocab-<n>`), így az angol hely
 * mindig a szóbankból jön.
 */
function simulate(grade: number, band: number, rounds: number) {
  const seen = createGradeQuizSeen();
  let cursor = 0;
  let vocabN = 0;
  const picks: Array<{ subject: GradeSubject; grade: number | null; tier: number | null; vocab: boolean; replacedId: string | null }> = [];
  for (let n = 0; n < rounds; n++) {
    let got = false;
    for (let i = 0; i < GRADE_SUBJECTS.length; i++) {
      const subject = GRADE_SUBJECTS[cursor++ % GRADE_SUBJECTS.length]!;
      const slot = pickBlockCraftGradeSlot({
        subject,
        pick: () => pickGradeQuiz({ grade, band, subjects: [subject], seen, rng: () => 0.37 }),
        seen,
        vocabNext: () => ({ id: `vocab-${vocabN++}` }),
      });
      if (!slot) continue;
      const item = slot.kind === "vocab" ? slot.replaced : slot.item;
      picks.push({ subject, grade: item?.grade ?? null, tier: item?.tier ?? null, vocab: slot.kind === "vocab", replacedId: item?.id ?? null });
      got = true;
      break;
    }
    if (!got) break;
  }
  return { picks, seen };
}

for (const [grade, band] of [[3, 0.9], [4, 0.1], [7, 0.5], [12, 0.9]] as const) {
  test(`szimuláció: ${grade}. évf., sáv ${band} — minden tárgy sorra kerül, minden angol sáv fogy, az arány nem torzul`, () => {
    const inGrade = GRADE_QUIZ_ITEMS.filter((q) => q.grade === grade);
    assert.ok(inGrade.length > 0, "üres évfolyam-bank — a minta elavult");
    const subjects = [...new Set(inGrade.map((q) => q.subject))];
    const perSubject = (s: GradeSubject) => inGrade.filter((q) => q.subject === s).length;
    // Egy forduló = egy hely a GRADE_SUBJECTS körforgásában; a pickGradeQuiz az évfolyam saját tételeit veszi előre
    // (utána a szomszéd évfolyamét), így ennyi forduló alatt minden tárgy saját évfolyamú tételei elfogynak.
    const rounds = Math.max(...subjects.map(perSubject)) * GRADE_SUBJECTS.length;
    const { picks, seen } = simulate(grade, band, rounds);

    // 1) Szigorú váltakozás: az első GRADE_SUBJECTS.length hely mind különböző tárgy (az angol nem tolakszik előre).
    const firstWindow = picks.slice(0, GRADE_SUBJECTS.length).map((p) => p.subject);
    assert.equal(new Set(firstWindow).size, firstWindow.length, `az első kör tárgyai ismétlődnek: ${firstWindow.join(", ")}`);
    // 2) Az angol hely nem szorítja ki a többit: minden tárgy MINDEN saját évfolyamú tétele pontosan egyszer került sorra.
    const inGradeCount = (s: GradeSubject) => picks.filter((p) => p.subject === s && p.grade === grade).length;
    for (const s of subjects) {
      assert.equal(inGradeCount(s), perSubject(s), `${s}: ${inGradeCount(s)} ≠ ${perSubject(s)} (a tárgy saját évfolyamú tételei)`);
    }
    for (const q of inGrade) assert.ok(isGradeQuizSeen(seen, q), `nem fogyott: ${q.id}`);
    // 3) Minden angol hely a szóbankból jött, ÉS a kiváltott angol évfolyam-tétel is fogyott (#424 csapda):
    //    az évfolyam MINDEN angol tétele (minden sávból) pontosan egyszer került kiváltásra, utána is jön szóbankos kérdés.
    const english = picks.filter((p) => p.subject === "english");
    assert.ok(english.every((p) => p.vocab), "angol helyen kézi tétel ment, pedig van szóbank");
    const replaced = english.map((p) => p.replacedId).filter((id): id is string => id != null);
    assert.equal(new Set(replaced).size, replaced.length, "ugyanaz az angol tétel többször került kiváltásra (nem fogyott)");
    for (const q of inGrade.filter((x) => x.subject === "english")) {
      assert.ok(isGradeQuizSeen(seen, q), `nem fogyott angol tétel: ${q.id}`);
    }
    const tiersInOrder: number[] = [];
    for (const p of english) if (p.tier != null && tiersInOrder[tiersInOrder.length - 1] !== p.tier) tiersInOrder.push(p.tier);
    assert.equal(new Set(tiersInOrder).size, tiersInOrder.length, `az angol sávok sorrendje ugrál: ${tiersInOrder.join(" → ")}`);
  });
}

test("szimuláció: szóbank nélkül (vocabNext → null) a kézi angol tétel megy, és az is fogy", () => {
  const seen = createGradeQuizSeen();
  const first = pickBlockCraftGradeSlot({
    subject: "english",
    pick: () => pickGradeQuiz({ grade: 3, band: 0.9, seen, subjects: ["english"] }),
    seen,
    vocabNext: () => null,
  });
  assert.equal(first?.kind, "grade");
  assert.ok(first && first.kind === "grade" && isGradeQuizSeen(seen, first.item));
});

test("szimuláció: nem angol tárgynál a szóbank nem is kerül hívásra", () => {
  const seen = createGradeQuizSeen();
  let called = 0;
  const slot = pickBlockCraftGradeSlot({
    subject: "math",
    pick: () => pickGradeQuiz({ grade: 5, band: 0.5, seen, subjects: ["math"] }),
    seen,
    vocabNext: () => {
      called++;
      return { id: "x" };
    },
  });
  assert.equal(slot?.kind, "grade");
  assert.equal(called, 0);
});

test("szimuláció: elfogyott angol évfolyam-tétel után is a szóbank ad angol kérdést (nem esik ki a tárgy)", () => {
  const seen = createGradeQuizSeen();
  const slot = pickBlockCraftGradeSlot({ subject: "english", pick: () => null, seen, vocabNext: () => ({ id: "v" }) });
  assert.deepEqual(slot, { kind: "vocab", quiz: { id: "v" }, replaced: null });
  assert.equal(pickBlockCraftGradeSlot({ subject: "english", pick: () => null, seen, vocabNext: () => null }), null);
});
