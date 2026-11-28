import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ADVENT_ART, ADVENT_ART_BASE } from "../shared/advent/art-manifest";
import { ADVENT_ART_SPECS, ADVENT_ART_TOTAL_MAX_BYTES } from "../shared/advent/art";
import { artFileName, checkSelection, fitToBudget, renderArtManifest, totalWithin } from "../scripts/design-assets/advent-approve-lib";

/** S3c (docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md, 17. kiegészítés): a beépített végleges képek őrei. */

const dir = path.join("client", "public", ADVENT_ART_BASE.replace(/^\/|\/$/g, ""));

test("A40: a jegyzék minden képe létező képhelyre mutat, a fájl megvan és tartalom-hashes webp", () => {
  for (const [id, file] of Object.entries(ADVENT_ART)) {
    assert.ok(ADVENT_ART_SPECS[id], `ismeretlen képhely: ${id}`);
    assert.match(file, new RegExp(`^${id}\\.[0-9a-f]{10}\\.webp$`), file);
    assert.ok(fs.existsSync(path.join(dir, file)), `hiányzik: ${file}`);
  }
});

test("A41: minden beépített kép a saját bájtcélján belül, az összes a keretben; a mappában nincs árva fájl", () => {
  const sizes: Record<string, number> = {};
  for (const [id, file] of Object.entries(ADVENT_ART)) {
    sizes[id] = fs.statSync(path.join(dir, file)).size;
    assert.ok(sizes[id]! <= ADVENT_ART_SPECS[id]!.maxBytes, `${id}: ${sizes[id]} > ${ADVENT_ART_SPECS[id]!.maxBytes}`);
  }
  assert.ok(totalWithin(sizes, ADVENT_ART_TOTAL_MAX_BYTES).ok);
  const listed = new Set(Object.values(ADVENT_ART));
  for (const f of fs.readdirSync(dir)) assert.ok(listed.has(f), `árva fájl: ${f}`);
});

test("kanban #161: a prompts.json és az ADVENT_ART_SPECS azonosítói egyeznek", () => {
  const prompts = JSON.parse(fs.readFileSync("design-assets/advent/prompts.json", "utf8")) as { items: Array<{ id: string }> };
  assert.deepEqual(prompts.items.map((i) => i.id).sort(), Object.keys(ADVENT_ART_SPECS).sort());
});

test("élesben a Vercel adja a képeket: /advent/(.*) immutable, egyéves gyorsítótár", () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
  const rule = vercel.headers.find((h) => h.source === "/advent/(.*)");
  assert.ok(rule, "hiányzik a /advent fejlécszabály");
  assert.equal(rule!.headers.find((h) => h.key === "Cache-Control")?.value, "public, max-age=31536000, immutable");
});

test("advent-approve-lib: kiválasztás-ellenőrzés, tartalom-hashes név, bájtcélhoz igazított minőség, jegyzék", async () => {
  const ids = ["advent-door-01", "advent-frame"];
  assert.deepEqual(checkSelection({ "advent-door-01": "advent-door-01/a.jpg" }, ids, () => true), { errors: [], missing: ["advent-frame"] });
  assert.equal(checkSelection({ "advent-x": "a.jpg" }, ids, () => true).errors.length, 1, "ismeretlen képhely");
  assert.equal(checkSelection({ "advent-door-01": "../kint.jpg" }, ids, () => true).errors.length, 1, "kilépő útvonal");
  assert.equal(checkSelection({ "advent-door-01": "a.gif" }, ids, () => true).errors.length, 1, "formátum");
  assert.equal(checkSelection({ "advent-door-01": "a.jpg" }, ids, () => false).errors.length, 1, "nem létező jelölt");
  assert.match(artFileName("advent-frame", new Uint8Array([1, 2, 3])), /^advent-frame\.[0-9a-f]{10}\.webp$/);
  const fit = await fitToBudget(async (q) => new Uint8Array(Math.round(q * 100)), 70);
  assert.deepEqual(fit && { q: fit.quality, n: fit.bytes.byteLength }, { q: 0.68, n: 68 });
  assert.equal(await fitToBudget(async () => new Uint8Array(100), 10), null);
  const src = renderArtManifest({ "advent-frame": "advent-frame.old.webp" }, { "advent-door-01": "advent-door-01.new.webp" });
  assert.ok(src.indexOf('"advent-door-01"') < src.indexOf('"advent-frame"') && src.includes("advent-frame.old.webp"));
});
