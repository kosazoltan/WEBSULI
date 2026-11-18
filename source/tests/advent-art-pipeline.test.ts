import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { composePrompt, loadStyle, parseMaxUsd, parseSetName, planJobs, type AssetManifest } from "../scripts/design-assets/lib";

/**
 * Adventi naptár — képgyártó-előkészítés (docs/specs/2026-11-18-adventi-naptar.md 13., 14.5; A42). Hálózati hívás nincs:
 * a készlet-leírót, a stílust, a költségtervet és a plafonokat ellenőrzi.
 */
// A munkafában a sorvég CRLF is lehet (Windows, autocrlf) — a forrás-állítások LF-re normalizált szövegen futnak.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const manifest = JSON.parse(read("design-assets/advent/prompts.json")) as AssetManifest;
const style = loadStyle(read("design-assets/advent/style.md"));
const base = JSON.parse(read("design-assets/prompts.json")) as AssetManifest;

test("a készlet 30 tétele érvényes: egyedi azonosító, ismert típus, 24 ablak, magyar alt a tartalmi képeken", () => {
  assert.equal(manifest.model, base.model, "a modell a meglévő készleté");
  assert.equal(manifest.items.length, 30);
  assert.equal(new Set(manifest.items.map((i) => i.id)).size, 30);
  const doors = manifest.items.filter((i) => i.kind === "door").map((i) => i.id);
  assert.deepEqual(doors, Array.from({ length: 24 }, (_, i) => `advent-door-${String(i + 1).padStart(2, "0")}`));
  for (const item of manifest.items) {
    assert.match(item.id, /^advent-[a-z0-9-]+$/);
    assert.equal(item.band, "advent");
    assert.ok(["background", "door", "ornament"].includes(item.kind), item.id);
    assert.ok(item.prompt.trim().length >= 20, `${item.id}: rövid prompt`);
    assert.ok(Number.isInteger(item.candidates) && item.candidates! >= 3 && item.candidates! <= 4, `${item.id}: jelöltek száma`);
    assert.ok(item.resolution === "1K" || item.resolution === "2K", `${item.id}: felbontás`);
    if (item.kind === "door" || item.id === "advent-closing" || item.id.startsWith("advent-bg-")) assert.ok(item.alt.trim().length > 3, `${item.id}: hiányzó alt`);
    if (item.id !== "advent-bg-portrait") assert.deepEqual(item.references, ["advent-bg-portrait"], `${item.id}: stílus-referencia`);
  }
  assert.equal(manifest.items[0]!.id, "advent-bg-portrait", "a stílus-referencia készül el először");
});

test("minden tétel promptja összeáll a stílussal; tiltja a feliratot és a létező szereplőket (szerzői jog)", () => {
  assert.match(style.common, /no text/i);
  assert.match(style.common, /No existing artwork/i);
  assert.match(style.common, /Not a photograph/i);
  for (const item of manifest.items) {
    const prompt = composePrompt(item, style);
    assert.ok(prompt.startsWith(item.prompt));
    assert.ok(prompt.endsWith(style.common));
    assert.doesNotMatch(item.prompt, /disney|coca|pixar|grinch|rudolph|frozen|santa claus/i, `${item.id}: márka / létező szereplő`);
  }
});

test("költségterv: 94 kép ≈ 5,22 USD; a próbakör 10 kép ≈ 0,65 USD (terv 13.6, 14.5)", () => {
  const full = planJobs(manifest.items, { resolution: "2K", max: 94, maxUsd: 7 });
  assert.equal(full.jobs.length, 94);
  assert.equal(full.requested, 94);
  assert.equal(full.cutBy, null);
  assert.ok(Math.abs(full.totalUsd - 5.22) < 0.01, `összeg: ${full.totalUsd}`);
  const trialIds = ["advent-bg-portrait", "advent-door-08", "advent-door-24"];
  const trial = planJobs(manifest.items.filter((i) => trialIds.includes(i.id)), { resolution: "2K", max: 10, maxUsd: 7 });
  assert.equal(trial.jobs.length, 10);
  assert.ok(Math.abs(trial.totalUsd - 0.648) < 0.001, `próbakör: ${trial.totalUsd}`);
});

test("kemény plafonok: a --max a képek számát, a --max-usd a becsült összeget vágja — túllépés nélkül", () => {
  const byCount = planJobs(manifest.items, { resolution: "2K", max: 10, maxUsd: 7 });
  assert.equal(byCount.jobs.length, 10);
  assert.equal(byCount.cutBy, "max");
  for (const cap of [0.05, 0.36, 0.5, 1, 3, 5.21]) {
    const plan = planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: cap });
    assert.ok(plan.totalUsd <= cap + 1e-9, `plafon ${cap}: ${plan.totalUsd}`);
    assert.equal(plan.cutBy, "max-usd");
    assert.ok(plan.jobs.length < 94);
  }
  assert.equal(planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: 0.05 }).jobs.length, 0);
  // Plafon nélkül a terv teljes (az éles futást a generate.ts ilyenkor megtagadja).
  assert.equal(planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: null }).jobs.length, 94);
});

test("a régi készlet terve változatlan: tételenként egy kép a parancssori felbontással", () => {
  const items = base.items.slice(0, 5);
  const plan = planJobs(items, { resolution: "1K", max: 12, maxUsd: null });
  assert.equal(plan.jobs.length, 5);
  for (const job of plan.jobs) assert.equal(job.resolution, "1K");
});

test("kapcsolók: a készletnév nem lehet útvonal, a költségplafon pozitív szám", () => {
  assert.equal(parseSetName(undefined), null);
  assert.equal(parseSetName("advent"), "advent");
  for (const bad of ["", "../x", "a/b", "Advent", "candidates", "a b", "-x"]) assert.throws(() => parseSetName(bad), /--set/, bad);
  assert.equal(parseMaxUsd(undefined), null);
  assert.equal(parseMaxUsd("7"), 7);
  assert.equal(parseMaxUsd("0.6"), 0.6);
  for (const bad of ["", "0", "-1", "abc", "7usd", "1e3"]) assert.throws(() => parseMaxUsd(bad), /--max-usd/, bad);
});

test("a generátor külön készletet csak költségplafonnal futtat élesben, és a jelöltek a nem követett mappába mennek", () => {
  const src = read("scripts/design-assets/generate.ts");
  assert.match(src, /Külön készlet éles futása csak --max-usd költségplafonnal indul\./);
  assert.match(src, /path\.join\(ROOT, "design-assets", "candidates", SET\)/);
  assert.match(read(".gitignore"), /^design-assets\/candidates\/$/m);
  // A plafon-ellenőrzés a hálózati hívás (generateOne) ELŐTT áll a ciklusban.
  const loop = src.slice(src.indexOf("for (const job of plan.jobs) {\n    //"));
  assert.ok(loop.indexOf("KÖLTSÉGPLAFON elérve") < loop.indexOf("await generateOne("));
});
