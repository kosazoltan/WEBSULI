import assert from "node:assert/strict";
import test from "node:test";

import * as extras from "../client/src/data/englishGameQuizExtras";
import type { FourChoiceQuiz } from "../client/src/types/gameQuiz";

/**
 * G-2 — a beégetett kvízbankok magyarázatai.
 *
 * A G-1 óta mind a hét játék mutat magyarázó kártyát rossz válasznál. A kártya
 * viszont csak annyit tud, amennyit a kvíz-tétel ad neki: `explanation` nélkül a
 * `buildFeedback` a semleges tartalékra esik vissza („A helyes válasz: X — a(z)
 * „Y" helyett."). Ez megmondja, MI a jó válasz, de nem tanít.
 *
 * Mérve (2026-09-07): a `englishGameQuizExtras.ts` 125 tétele — a Szökőár és a
 * Szólétra kérdéskészletének a java — NULLA magyarázattal ment ki.
 *
 * A magyarázat két dolgot köt össze: a helyes megfeleltetést, és a HORGOT, ami
 * elválasztja a leggyakoribb elgépeléstől vagy hasonló alakú szótól. A kevert
 * sorrend miatt sorszámra (»az első«, »a B válasz«) hivatkozni tilos.
 */

const BANKS: Record<string, FourChoiceQuiz[]> = Object.fromEntries(
  Object.entries(extras).filter(([, v]) => Array.isArray(v)),
) as Record<string, FourChoiceQuiz[]>;

const PLACEHOLDER = /^(todo|tbd|xxx|\.{2,}|-+|n\/a)$/i;

/** A helyes opció „tartalmas" szavai — ezek egyikének szerepelnie kell. */
function keywords(option: string): string[] {
  return option
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length >= 3)
    .map((w) => w.toLowerCase());
}

test("van mit ellenőrizni: a bankok nem üresek", () => {
  const names = Object.keys(BANKS);
  assert.ok(names.length >= 6, `csak ${names.length} bank: ${names.join(", ")}`);

  const total = Object.values(BANKS).reduce((n, b) => n + b.length, 0);
  assert.ok(total >= 120, `${total} tétel — a mérés szerint 125 van`);
});

for (const [name, bank] of Object.entries(BANKS)) {
  test(`${name}: minden tételnek van magyarázata`, () => {
    const missing = bank
      .filter((q) => !q.explanation || q.explanation.trim().length === 0)
      .map((q) => q.id);

    assert.deepEqual(missing, [], `magyarázat nélküli tételek: ${missing.join(", ")}`);
  });

  test(`${name}: a magyarázat nem helykitöltő és elfér a kártyán`, () => {
    for (const q of bank) {
      const why = (q.explanation ?? "").trim();
      assert.doesNotMatch(why, PLACEHOLDER, `${q.id}: helykitöltő`);
      assert.ok(why.length >= 15, `${q.id}: túl rövid (${why.length}): "${why}"`);
      assert.ok(why.length <= 300, `${q.id}: túl hosszú (${why.length})`);
    }
  });

  test(`${name}: a magyarázat a HELYES válaszra mutat`, () => {
    for (const q of bank) {
      const why = (q.explanation ?? "").toLowerCase();
      const correct = q.options[q.correctIndex] ?? "";
      const words = keywords(correct);

      // Van olyan tétel, ahol a helyes opció csak jelölés („— (nincs)"); ott a
      // szó-egyezés nem kérhető, de a magyarázat megléte igen.
      if (words.length === 0) continue;

      assert.ok(
        words.some((w) => why.includes(w)),
        `${q.id}: a magyarázat nem említi a helyes választ („${correct}"): "${q.explanation}"`,
      );
    }
  });

  test(`${name}: a magyarázat nem hivatkozik sorrendre`, () => {
    // A játék kevert sorrendben mutatja az opciókat: egy „az első válasz"
    // hivatkozás a gyerek képernyőjén már mást jelent.
    const ORDINAL = /\b(az? )?(első|második|harmadik|negyedik) (válasz|opció|lehetőség)\b|\b[A-D]\)\s/i;
    for (const q of bank) {
      assert.doesNotMatch(q.explanation ?? "", ORDINAL, `${q.id}: sorszámra hivatkozik`);
    }
  });
}

/* ------------------ a lapokba ÉGETETT bankok (statikus őr) ------------------ */

/**
 * A Szólétra saját, lapon belüli bankja nem importálható node-tesztből (React-lap),
 * ezért forrásból mérjük. A hibaosztály ugyanaz, mint a #183-nál: attól, hogy a
 * `englishGameQuizExtras` tele van, még maradhat magyarázat nélküli kérdés a
 * lapon — élesben pontosan ez történt (a „Víz angolul" tétel a semleges
 * tartalékot mutatta, miközben a szomszédos kérdések már tanítottak).
 */
test("WordLadderHuEn: a lapba égetett kvíz-tételeknek is van magyarázata", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(
    fileURLToPath(new URL("../client/src/pages/WordLadderHuEn.tsx", import.meta.url)),
    "utf8",
  );

  const items = [...src.matchAll(/\{ id: "([a-z]?\d+)", prompt:[\s\S]*?\},/g)];
  assert.ok(items.length >= 40, `csak ${items.length} tételt találtam — a minta elavult`);

  const missing = items.filter(([whole]) => !/explanation:\s*"/.test(whole)).map((m) => m[1]);
  assert.deepEqual(missing, [], `magyarázat nélküli tételek: ${missing.join(", ")}`);
});

test("BrainRotSteal: a lapba égetett kvíz-tételeknek is van magyarázata", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(
    fileURLToPath(new URL("../client/src/pages/BrainRotSteal.tsx", import.meta.url)),
    "utf8",
  );

  // Soralapú keresés: a promptokban escape-elt idézőjelek is vannak
  // (`\"Brother\" magyarul:`), amiken egy objektum-mintás regex elcsúszik —
  // az első próbám emiatt 75 helyett 45 tételt „talált", és hamis zöldet adott.
  const items = src
    .split("\n")
    .filter((line) => /\{ prompt:/.test(line) && /correctIndex:\s*\d/.test(line));

  assert.ok(items.length >= 70, `csak ${items.length} tételt találtam — a minta elavult`);

  const missing = items
    .filter((line) => !/explanation:\s*"/.test(line))
    .map((line) => line.trim().slice(0, 50));
  assert.deepEqual(missing, [], `magyarázat nélküli tételek:\n${missing.join("\n")}`);
});
