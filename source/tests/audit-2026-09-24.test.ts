import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_MATERIAL_ID_BATCH, normalizeMaterialIdBatch } from "../server/lib/public-input";

/** Audit 2026-09-24 — élesben mért hibák regressziós őrei. */

test("a főoldal like-kötegei a szerver korlátján belül maradnak (mérve: 186 anyagnál 86 külön kérés)", () => {
  const client = readFileSync(new URL("../client/src/components/UserFileList.tsx", import.meta.url), "utf8");
  const limit = Number(/LIKES_BATCH_LIMIT = (\d+)/.exec(client)?.[1]);
  assert.equal(limit, MAX_MATERIAL_ID_BATCH, "a kliens kötegmérete a szerver korlátja");
  assert.match(client, /i \+= LIKES_BATCH_LIMIT/, "a kliens kötegekre bont");
  const ids = Array.from({ length: 186 }, (_, i) => `id-${i}`);
  assert.equal(normalizeMaterialIdBatch(ids).length, MAX_MATERIAL_ID_BATCH, "a szerver a korlát fölött levág — ezért kell a kliens-kötegelés");
});

test("a lecke-betöltés hálózati hibánál újrapróbál és gombot ad (nem zsákutca)", () => {
  const view = readFileSync(new URL("../client/src/lesson-runtime/LessonView.tsx", import.meta.url), "utf8");
  // Lecke megnyitása (2026-10-17-lecke-betoltes): a lekérdezés a közös lesson-query.ts-be költözött (a Preview is ezt használja).
  const query = readFileSync(new URL("../client/src/lesson-runtime/lesson-query.ts", import.meta.url), "utf8");
  assert.match(view, /useQuery\(lessonByFileQuery\(material\.id\)\)/);
  assert.match(query, /retry: 2/);
  assert.match(view, /data-testid="lesson-retry"/);
});

test("évfolyam a tanár kéréséből: a mért hamis találatok nem adnak évfolyamot", async () => {
  const { explicitClassroomOf } = await import("../server/studio/source-corrections");
  const cases: Array<[string, number | undefined]> = [
    ["8 osztályos gimnáziumi felvételire készülő negyedikeseknek, röviden", undefined],
    ["Ez nem az 5. osztályos anyag, egyszerűsítsd", undefined],
    ["a 3 osztály közül", undefined],
    ["5 osztályzat", undefined],
    ["1492 osztály", undefined],
    ["ez nem hetedik osztályos, hanem ötödik osztályos történelem", 5],
    ["Kérlek 5. osztályos szinten", 5],
    ["5 osztályos szinten", 5],
    ["7-es évfolyam", 7],
    ["ötödik osztálynak", 5],
  ];
  for (const [text, grade] of cases) assert.equal(explicitClassroomOf(text), grade, text);
});

test("az átírási-hiba szűrő számot, évszámot soha nem enged cserélni; a term hossza korlátos", async () => {
  const { isLetterLevelMisread, filterSourceCorrections, TERM_MAX } = await import("../server/studio/source-corrections");
  assert.equal(isLetterLevelMisread("1848-ban tört ki a forradalom", "1849-ban tört ki a forradalom"), false);
  assert.equal(isLetterLevelMisread("Magyarország 2000 lakosa", "Magyarország 1000 lakosa"), false);
  assert.equal(isLetterLevelMisread("bódex", "kódex"), true);
  const long = "kódex ".repeat(60).trim();
  const r = filterSourceCorrections({ corrections: [{ localId: "c1", term: long, basis: "owner", reason: "" }] }, [{ localId: "c1", term: "bódex", examWeight: "core" }], { instruction: long, transcript: true });
  assert.equal(r.corrections.length, 0);
  assert.ok(long.length > TERM_MAX && r.rejected.some((x) => /túl hosszú/.test(x)));
});

test("design a kérésből: a mért hamis triggerek nem váltanak világot vagy effektet", async () => {
  const { designFromInstruction } = await import("../shared/lesson-visuals");
  for (const text of ["Magyarázd egyszerűbben a sűrűség fogalmát", "Szűrd ki a felesleges részeket", "Legyen szó az állatok testfelépítéséről is", "A mesés elemeket hagyd ki", "ne legyen rózsaszín", "Adj változatos feladatokat", "effektívebb gyakorlás"]) {
    assert.equal(designFromInstruction(text), undefined, text);
  }
  assert.equal(designFromInstruction("Rózsaszín legyen, de effektek nélkül")?.flair, undefined);
  // Websuli Design (dokumentált spec-változás): unisex — nemi szavak nem választanak világot.
  assert.equal(designFromInstruction("rózsaszín, kislánynak, csillogó effektekkel")?.world, undefined);
});
