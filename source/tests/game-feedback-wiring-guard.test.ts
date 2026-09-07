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

/** Azok a játékok, amelyekbe a magyarázó kártya már be van kötve. */
const WIRED = ["SpeedQuizMath.tsx"];

for (const file of WIRED) {
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

test("a komment-szűrő önellenőrzése", () => {
  const fake = `buildFeedback(x);\n// buildFeedback(\n/* buildFeedback( */`;
  const hits = (stripComments(fake).match(/buildFeedback\s*\(/g) ?? []).length;
  assert.equal(hits, 1);
});
