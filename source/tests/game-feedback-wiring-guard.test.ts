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

  test(`${file}: a rossz válasz ága nem léptet automatikusan tovább`, () => {
    // A régi viselkedés: `setTimeout(nextTask, 140)` a hibás ágon — a magyarázat
    // elolvasása előtt betöltött egy új feladatot. A HELYES válasz időzített
    // továbblépése ellenben maradjon: ott nincs mit olvasni, és a lendület
    // megtörése büntetésnek érződne a jó válaszért. Ezért csak a hibás ágat nézzük.
    const start = code.search(/if\s*\(\s*idx\s*!==\s*task\.correctIndex\s*\)/);
    assert.ok(start >= 0, "nem találom a hibás válasz ágát — a teszt elavult");

    const branch = code.slice(start, code.indexOf("return;", start) + "return;".length);
    assert.doesNotMatch(
      branch,
      /setTimeout\s*\(\s*nextTask\s*,/,
      "időzített továbblépés a hibás ágon: nem marad idő elolvasni a magyarázatot",
    );
    assert.match(branch, /showFeedbackFor\s*\(/, "a hibás ág nem mutat magyarázatot");
  });

  test(`${file}: a magyarázat olvasása közben áll az óra`, () => {
    assert.match(
      code,
      /if\s*\(\s*feedback\s*\)\s*return;/,
      "a köridő nem áll meg a kártya alatt — az olvasás büntetve lenne",
    );
  });
}

for (const file of WIRED) guardGame(file);

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
