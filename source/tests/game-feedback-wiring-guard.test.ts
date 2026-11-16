import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * G-1 kötés-őr.
 *
 * A `feedback.ts` zöld unit-suite-ja semmit nem ér, ha a játékoldal továbbra is
 * 140 ms piros villanással lép tovább. Ez az őr azt méri, amit a gyerek lát: a
 * lapon tényleg ott a magyarázó kártya, és a rossz válasz NEM léptet automatikusan.
 *
 * Ugyanaz a minta, mint a `space-asteroid-wiring-guard.test.ts`-ben (#183 osztály):
 * komment-szűrés kötelező, különben egy kikommentezett hívás is „bekötésnek" számít.
 *
 * A lista játékonként bővül, ahogy a G-6 szelet halad. Egy játék felvétele ide azt
 * jelenti: onnantól nem lehet észrevétlenül visszavenni belőle a magyarázatot.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function pageCode(file: string): string {
  return stripComments(readFileSync(join(root, "client/src/pages", file), "utf8"));
}

/** Azok a játékok, amelyekbe a magyarázó kártya be van kötve — mind a hét. */
const WIRED = [
  "SpeedQuizMath.tsx",
  "TornadoHunter200.tsx",
  "BrainRotSteal.tsx",
  "WordLadderHuEn.tsx",
  "TsunamiEscapeEnglish.tsx",
  "SpaceAsteroidQuiz.tsx",
  "BlockCraftQuiz.tsx",
];

function guardGame(file: string) {
  const code = pageCode(file);

  test(`${file}: importálja a visszacsatolás motorját és a kártyát`, () => {
    assert.match(code, /from\s+"@\/game-engine\/feedback"/, "buildFeedback import hiányzik");
    assert.match(
      code,
      /from\s+"@\/game-engine\/QuizFeedbackCard"/,
      "QuizFeedbackCard import hiányzik",
    );
  });

  test(`${file}: rossz válaszra tényleg épít visszajelzést`, () => {
    assert.match(code, /buildFeedback\s*\(/, "buildFeedback hívás hiányzik");
  });

  test(`${file}: ki is rajzolja a kártyát`, () => {
    assert.match(code, /<QuizFeedbackCard\b/, "a kártya nincs a JSX-ben");
  });

  test(`${file}: a kártya a JSX-ben van, nem egy sablon-literál belsejében`, () => {
    // Megtörtént hiba (2026-09-07): a beszúrás három játékban a `<style>` blokk
    // CSS-sablonja KÖZÉ került, ahol a JSX puszta szöveg — a teszt zöld volt, a
    // kártya viszont sosem jelent meg. Ezért a stílusblokkokat kivágjuk, és úgy
    // keressük.
    const withoutStyles = code.replace(/<style>\{`[\s\S]*?`\}<\/style>/g, "");
    assert.match(
      withoutStyles,
      /<QuizFeedbackCard\b/,
      "a kártya csak stílus-sablonon belül szerepel — sosem renderelődik",
    );
  });

  if (file !== "SpeedQuizMath.tsx") return;

  // SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.) — J4a „Neon védőtorony”.
  // A régi három eset a BLOKKOLÓ kártyát rögzítette (hibás ág → kártya, a kártya alatt áll az óra, 0 életnél nincs
  // „Újrapróbálom”). Az új követelmény nem lazább: (a) hibánál a helyes válasz a játéktérben ≥ 1,8 mp-ig látszik, időzített
  // továbblépés nincs, és a tétel az ismétlési sorba kerül; (b) a teljes magyarázat a „Miért?”-re nyílik, és amíg nyitva
  // van, áll a játék és a kérdés-óra; (c) a megoldás mutatása utáni újrapróba (retry) megszűnt — a célba nem számít.
  test(`${file}: hibás válasz → a megoldás ≥ 1,8 mp-ig a játéktérben, időzített továbblépés nélkül (SPEC-VÁLTOZÁS, a)`, () => {
    // A kérdés-életciklus a közös horogé (usePlayQuestion → createQuestionUi): a hibás / lejárt válasz megoldás-kijelzése
    // a horog REVEAL_WRONG_MS konstansa, a vezérlő `Math.max(1800, …)`-szel alulról korlátozza.
    assert.match(code, /usePlayQuestion\s*\(/, "a lap nem a közös kérdés-horgot használja");
    const hook = stripComments(readFileSync(join(root, "client/src/game-engine/play/useQuestionDirector.ts"), "utf8"));
    const m = /export const REVEAL_WRONG_MS\s*=\s*(\d[\d_]*)/.exec(hook);
    assert.ok(m, "nincs REVEAL_WRONG_MS a közös horogban — a teszt elavult");
    assert.ok(Number(m[1]!.replace(/_/g, "")) >= 1800, `REVEAL_WRONG_MS = ${m[1]} < 1800`);
    assert.match(hook, /Math\.max\(\s*1800\s*,\s*opts\.revealWrongMs/, "a megoldás-kijelzés alsó korlátja (1,8 mp) elveszett");
    const own = /revealWrongMs:\s*(\d[\d_]*)/.exec(code);
    if (own) assert.ok(Number(own[1]!.replace(/_/g, "")) >= 1800, `a lap ${own[1]} ms-ra rövidítené a megoldás-kijelzést`);
    assert.doesNotMatch(code, /setTimeout\s*\(\s*nextTask\b/, "időzített továbblépés a lapon: nem marad idő a megoldásra");
    // A drón-célpontok a megoldást a játéktérben is mutatják (zöld helyes / narancs választott), nem csak a sávban.
    assert.match(code, /data-state=\{st\}/, "a számdrónok nem kapják meg a megoldás-állapotot");
    assert.match(code, /view\.reveal\.correctOptionIndex/, "a helyes drón nem jelölődik a megoldás-kijelzéskor");
  });

  test(`${file}: a „Miért?” megnyitja a kártyát, és amíg nyitva van, áll a játék (SPEC-VÁLTOZÁS, b)`, () => {
    assert.match(code, /onWhy=\{openWhy\}/, "a kérdés-sáv „Miért?” gombja nincs bekötve");
    const why = code.slice(code.search(/const openWhy = useCallback/));
    assert.match(why.slice(0, 900), /setFeedback\(\s*buildFeedback\(/, "a „Miért?” nem a valódi magyarázatot építi");
    assert.match(code, /const whyOpen = feedback !== null/, "a nyitott kártya nem számít szünetnek");
    assert.match(code, /pausedRef\.current = paused \|\| whyOpen/, "a játékhurok nem áll meg a kártya alatt");
    assert.match(code, /if \(!isPaused\) clockRef\.current \+= dt/, "a kérdés-óra a kártya alatt is járna");
    assert.match(code, /loop\.setTimeScale\(isPaused \? 0 : /, "a szimuláció a kártya alatt is futna");
    assert.match(code, /if\s*\(\s*feedback\s*\)\s*return;/, "a HUD-óra a kártya alatt is frissülne");
  });

  test(`${file}: nincs újrapróba a játékmenetben — a megoldás mutatása után nem lehet „visszakoppintani” (SPEC-VÁLTOZÁS, c)`, () => {
    assert.doesNotMatch(code, /onRetry=/, "újrapróba-kötés a lapon (végrehajtás J4 elfogadás: grep 0 találat)");
    assert.doesNotMatch(code, /retryTask/, "a régi újrapróba-ág a lapon maradt");
    const card = code.slice(code.search(/<QuizFeedbackCard\b/));
    assert.doesNotMatch(card.slice(0, card.indexOf("/>")), /onRetry/, "a „Miért?” kártya újrapróbát kínálna");
  });
}

for (const file of WIRED) guardGame(file);

test("WordLadderHuEn: a magyarázó kártya bezárása indítja a lépés-láncot (A1)", () => {
  const code = pageCode("WordLadderHuEn.tsx");
  assert.match(code, /pendingStepRef/, "pendingStepRef hiányzik — a kártya alatt tovább lépne a kérdés");
  assert.match(
    code,
    /onDismiss=\{dismissExplain\}/,
    "a kártya onDismiss-e nem a pending lépés-láncot futtatja",
  );
  assert.match(
    code,
    /if\s*\(\s*explainOpenRef\.current\s*\)\s*return;/,
    "a futamidő a kártya alatt is ketyegne",
  );
});

test("a komment-szűrő önellenőrzése", () => {
  const fake = `buildFeedback(x);\n// buildFeedback(\n/* buildFeedback( */`;
  const hits = (stripComments(fake).match(/buildFeedback\s*\(/g) ?? []).length;
  assert.equal(hits, 1);
});

/* ------------------------- rétegsorrend (z-index) ------------------------- */

test("a magyarázó kártya minden játék-felugró FÖLÖTT van", () => {
  // Komment-szűrés itt is kötelező: az első próbámban a magyarázó KOMMENTBEN
  // szereplő „z-[60]" hivatkozást olvasta ki a minta, nem a tényleges osztályt.
  const card = stripComments(
    readFileSync(join(root, "client/src/game-engine/QuizFeedbackCard.tsx"), "utf8"),
  );
  const cardZ = Number(/z-\[(\d+)\]/.exec(card)?.[1] ?? "0");
  assert.ok(cardZ > 0, "a kártyának explicit z-indexe legyen, ne öröklött");

  /*
   * Mért hiba (2026-09-07): az Aszteroida kvíz-overlay `z-[60]`, a kártya
   * `z-50` volt. A kártya alá került, a bezáró gomb kattinthatatlan lett, és
   * mivel a továbblépést az a gomb intézi, a játék ÖRÖKRE megállt volna. Ez a
   * teszt minden játékoldalon megkeresi a legnagyobb z-indexet.
   */
  for (const file of WIRED) {
    const code = pageCode(file);
    const zs = [...code.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
    const highest = zs.length ? Math.max(...zs) : 0;
    assert.ok(
      cardZ > highest,
      `${file}: a lap legmagasabb rétege z-[${highest}], a kártya z-[${cardZ}] — alá kerülne, és a játék megállna`,
    );
  }
});
