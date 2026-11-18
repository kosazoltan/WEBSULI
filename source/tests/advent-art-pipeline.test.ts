import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  attemptWithinBudget, canSpend, composePrompt, estimateUsd, loadStyle, missingReferences, parseMaxUsd, parseRefs, parseSetName, planJobs, requestImage, spentFromLog,
  type AssetManifest, type Budget,
} from "../scripts/design-assets/lib";

/**
 * Adventi naptár — képgyártó-előkészítés (docs/specs/2026-11-18-adventi-naptar.md 13., 14.5, 15., 18.; A42). Valódi hálózati
 * hívás nincs: a készlet-leírót, a stílust, a költségtervet és a keretkezelést (hamis `fetch`-csel) ellenőrzi.
 */
// A munkafában a sorvég CRLF is lehet (Windows, autocrlf) — a forrás-állítások LF-re normalizált szövegen futnak.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const manifest = JSON.parse(read("design-assets/advent/prompts.json")) as AssetManifest;
const style = loadStyle(read("design-assets/advent/style.md"));
const base = JSON.parse(read("design-assets/prompts.json")) as AssetManifest;
const byId = (id: string) => manifest.items.find((i) => i.id === id)!;

test("a készlet 30 tétele érvényes: egyedi azonosító, ismert típus, 24 ablak, magyar alt a tartalmi képeken", () => {
  assert.equal(manifest.model, base.model, "a modell a meglévő készleté");
  assert.equal(manifest.items.length, 30);
  assert.equal(new Set(manifest.items.map((i) => i.id)).size, 30);
  const doors = manifest.items.filter((i) => i.id.startsWith("advent-door-")).map((i) => i.id);
  assert.deepEqual(doors, Array.from({ length: 24 }, (_, i) => `advent-door-${String(i + 1).padStart(2, "0")}`));
  for (const item of manifest.items) {
    assert.match(item.id, /^advent-[a-z0-9-]+$/);
    assert.equal(item.band, "advent");
    assert.ok(["background", "door", "scene", "ornament"].includes(item.kind), item.id);
    assert.ok(item.prompt.trim().length >= 20, `${item.id}: rövid prompt`);
    assert.ok(Number.isInteger(item.candidates) && item.candidates! >= 3 && item.candidates! <= 4, `${item.id}: jelöltek száma`);
    assert.ok(item.resolution === "1K" || item.resolution === "2K", `${item.id}: felbontás`);
    if (item.id.startsWith("advent-door-") || item.id === "advent-closing" || item.id.startsWith("advent-bg-")) assert.ok(item.alt.trim().length > 3, `${item.id}: hiányzó alt`);
    if (item.id !== "advent-bg-portrait") assert.deepEqual(item.references, ["advent-bg-portrait"], `${item.id}: stílus-referencia`);
  }
  assert.equal(manifest.items[0]!.id, "advent-bg-portrait", "a stílus-referencia készül el először");
});

test("a többalakos ablakok (pásztorok, háromkirályok, betlehem) jelenet-stílust kapnak, nem „egyetlen motívum”-ot (review L4)", () => {
  for (const id of ["advent-door-19", "advent-door-20", "advent-door-24"]) {
    assert.equal(byId(id).kind, "scene", id);
    const prompt = composePrompt(byId(id), style);
    assert.match(prompt, /small, simple scene/);
    assert.doesNotMatch(prompt, /One single clearly recognisable motif/);
  }
  assert.match(composePrompt(byId("advent-door-08"), style), /One single clearly recognisable motif/);
  // A hóesés nem kerül rá minden tételre (bejgli, mézeskalács): a közös sáv-stílusban nincs.
  assert.doesNotMatch(style.band.advent!, /snowfall/);
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

test("a keret ÖSSZESÍTETT: a napló eddigi összege a kezdőérték, és a meglévő jelöltek nem készülnek újra (review M1)", () => {
  const trialLog = [
    ...Array.from({ length: 4 }, () => JSON.stringify({ id: "advent-bg-portrait", status: "ok", estUsd: 0.09 })),
    ...Array.from({ length: 6 }, () => JSON.stringify({ id: "advent-door-08", status: "ok", estUsd: 0.048 })),
    JSON.stringify({ id: "advent-door-24", status: "error", attempt: 1, estUsd: 0.048 }),
    "{ sérült sor",
    JSON.stringify({ id: "regi", status: "error", message: "estUsd nélkül" }),
    "",
  ].join("\n");
  const spent = spentFromLog(trialLog);
  assert.ok(Math.abs(spent - (0.36 + 0.288 + 0.048)) < 1e-9, `napló: ${spent}`);
  const existing = { "advent-bg-portrait": 4, "advent-door-08": 3, "advent-door-24": 3 };
  const full = planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: 7, existing, alreadySpent: 0.648 });
  assert.equal(full.skippedExisting, 10);
  assert.equal(full.jobs.length, 84);
  assert.ok(!full.jobs.some((j) => j.item.id === "advent-bg-portrait" || j.item.id === "advent-door-08"));
  assert.ok(0.648 + full.totalUsd <= 7);
  assert.ok(Math.abs(0.648 + full.totalUsd - 5.22) < 0.01, "próbakör + teljes kör együtt a teljes költség");
  // Ha a keretből már sok elfogyott, a terv az ÖSSZEGRE vág, nem a futásra.
  const tight = planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: 7, alreadySpent: 6.5 });
  assert.equal(tight.cutBy, "max-usd");
  assert.ok(6.5 + tight.totalUsd <= 7 + 1e-9);
  // Több meglévő jelölt, mint amennyi kell: nem lesz negatív darabszám.
  assert.equal(planJobs([byId("advent-frame")], { resolution: "1K", max: 10, maxUsd: 7, existing: { "advent-frame": 9 } }).jobs.length, 0);
});

test("kemény plafonok a tervben: a --max a képek számát, a --max-usd a becsült összeget vágja — túllépés nélkül", () => {
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
  assert.equal(planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: null }).jobs.length, 94);
});

/** Hamis `fetch`: megszámolja a hívásokat, és a megadott válaszokat adja sorban. */
function fakeFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return next();
  }) as typeof fetch;
  return { impl, calls };
}
const okImage = () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("kép").toString("base64"), media_type: "image/jpeg" }], usage: { cost: 0.05 } }), { status: 200 });
const emptyOk = () => new Response(JSON.stringify({ data: [] }), { status: 200 });

test("hívásonkénti keret (review B1): 6,95 USD-nál az első hívás kimegy és elszámolódik, a MÁSODIK NEM megy ki", async () => {
  const est = estimateUsd(1, 1, "1K"); // 0,048 — egy ablakkép egy referenciával
  const budget: Budget = { spent: 6.95, maxUsd: 7 };
  const net = fakeFetch([emptyOk]); // 200-as, kiszámlázott, de használhatatlan válasz
  const errors: number[] = [];
  const outcome = await attemptWithinBudget({
    budget, estUsd: est, maxAttempts: 2,
    attempt: async () => { await requestImage(net.impl, { endpoint: "https://example.invalid/images", key: "teszt-kulcs", body: {} }); },
    onError: (n) => { errors.push(n); },
  });
  assert.equal(net.calls.length, 1, "a második hívás nem indulhat el");
  assert.deepEqual(errors, [1]);
  assert.deepEqual(outcome, { saved: false, attempts: 1, stoppedByBudget: true });
  assert.ok(Math.abs(budget.spent - 6.998) < 1e-9, `elszámolva: ${budget.spent}`);
  assert.ok(budget.spent <= budget.maxUsd);
  assert.equal(canSpend(budget, est), false);
});

test("hívásonkénti keret: a sikertelen hívás is számít; bukó első próbánál a keret kétszer terhelődik", async () => {
  const est = 0.048;
  const budget: Budget = { spent: 0, maxUsd: 7 };
  const net = fakeFetch([emptyOk, okImage]);
  const outcome = await attemptWithinBudget({
    budget, estUsd: est, maxAttempts: 2,
    attempt: async () => { await requestImage(net.impl, { endpoint: "https://example.invalid/images", key: "k", body: {} }); },
    onError: () => undefined,
  });
  assert.deepEqual(outcome, { saved: true, attempts: 2, stoppedByBudget: false });
  assert.equal(net.calls.length, 2);
  assert.ok(Math.abs(budget.spent - 2 * est) < 1e-9);
  // Tartósan hibás válasznál is legfeljebb a keretig megy: 0,1 USD-ból két 0,048-as hívás fér ki, a harmadik nem.
  const small: Budget = { spent: 0, maxUsd: 0.1 };
  const bad = fakeFetch([emptyOk]);
  for (let image = 0; image < 5; image++) {
    await attemptWithinBudget({ budget: small, estUsd: est, maxAttempts: 2, attempt: async () => { await requestImage(bad.impl, { endpoint: "https://example.invalid/images", key: "k", body: {} }); }, onError: () => undefined });
  }
  assert.equal(bad.calls.length, 2);
  assert.ok(small.spent <= small.maxUsd);
  // Ha már az első hívás sem fér bele, egy sem megy ki.
  const none = fakeFetch([okImage]);
  const full: Budget = { spent: 6.99, maxUsd: 7 };
  const stopped = await attemptWithinBudget({ budget: full, estUsd: est, maxAttempts: 2, attempt: async () => { await requestImage(none.impl, { endpoint: "https://example.invalid/images", key: "k", body: {} }); }, onError: () => undefined });
  assert.deepEqual(stopped, { saved: false, attempts: 0, stoppedByBudget: true });
  assert.equal(none.calls.length, 0);
  assert.equal(full.spent, 6.99);
});

test("képkérés: a kulcs csak a fejlécben megy, van időkorlát, a hibaszövegből a kulcs kitakarva", async () => {
  const net = fakeFetch([okImage]);
  const img = await requestImage(net.impl, { endpoint: "https://example.invalid/images", key: "sk-or-titok123", body: { prompt: "x" } });
  assert.equal(img.ext, "jpg");
  assert.equal(img.bytes.toString(), "kép");
  const init = net.calls[0]!.init;
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer sk-or-titok123");
  assert.ok(init.signal instanceof AbortSignal, "időkorlát a híváson");
  assert.doesNotMatch(String(init.body), /titok123/);
  const denied = fakeFetch([() => new Response("invalid key sk-or-titok123", { status: 401 })]);
  await assert.rejects(requestImage(denied.impl, { endpoint: "https://example.invalid/images", key: "sk-or-titok123", body: {} }), (error: Error) => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /titok123/);
    return true;
  });
});

test("stílus-referencia (review L1): csak a kiválasztott (--ref) vagy az ugyanabban a futásban előbb készülő kép használható", () => {
  const all = planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: null }).jobs;
  assert.deepEqual(missingReferences(all, new Set()), [], "a teljes készletben a háttér készül először");
  const doorsOnly = planJobs([byId("advent-door-08")], { resolution: "2K", max: 10, maxUsd: null }).jobs;
  assert.deepEqual(missingReferences(doorsOnly, new Set()), ["advent-bg-portrait"]);
  assert.deepEqual(missingReferences(doorsOnly, new Set(["advent-bg-portrait"])), []);
  // A teljes kör a próbakör után: a háttér már megvan (nem készül újra) → kiválasztott referencia kell.
  const afterTrial = planJobs(manifest.items, { resolution: "2K", max: 1000, maxUsd: null, existing: { "advent-bg-portrait": 4 } }).jobs;
  assert.deepEqual(missingReferences(afterTrial, new Set()), ["advent-bg-portrait"]);
  const dir = "C:/x/candidates/advent";
  assert.deepEqual(parseRefs(["--ref", "advent-bg-portrait=advent-bg-portrait/2026-11-18T10-00-00-000Z.jpg"], dir), { "advent-bg-portrait": `${dir}/advent-bg-portrait/2026-11-18T10-00-00-000Z.jpg` });
  assert.deepEqual(parseRefs(["--set", "advent"], dir), {});
  for (const bad of ["advent-bg-portrait", "x=../../titok.jpg", "x=/etc/passwd.png", "x=C:/Windows/a.png", "x=a//b.png", "x=kep.txt", "=a.png"]) {
    assert.throws(() => parseRefs(["--ref", bad], dir), /--ref/, bad);
  }
});

test("a régi készlet terve változatlan: tételenként egy kép a parancssori felbontással", () => {
  const items = base.items.slice(0, 5);
  const plan = planJobs(items, { resolution: "1K", max: 12, maxUsd: null });
  assert.equal(plan.jobs.length, 5);
  for (const job of plan.jobs) assert.equal(job.resolution, "1K");
});

test("kapcsolók: a készletnév nem lehet útvonal, a költségplafon pozitív szám, elütés ellen felső korláttal", () => {
  assert.equal(parseSetName(undefined), null);
  assert.equal(parseSetName("advent"), "advent");
  for (const bad of ["", "../x", "a/b", "Advent", "candidates", "a b", "-x"]) assert.throws(() => parseSetName(bad), /--set/, bad);
  assert.equal(parseMaxUsd(undefined), null);
  assert.equal(parseMaxUsd("7"), 7);
  assert.equal(parseMaxUsd("0.6"), 0.6);
  for (const bad of ["", "0", "-1", "abc", "7usd", "1e3", "70", "20.01"]) assert.throws(() => parseMaxUsd(bad), /--max-usd/, bad);
});

test("a generátor külön készletet csak plafonnal és referenciával futtat élesben; a jelöltek a nem követett mappába mennek", () => {
  const src = read("scripts/design-assets/generate.ts");
  assert.match(src, /Külön készlet éles futása csak --max-usd költségplafonnal indul\./);
  assert.match(src, /csak kiválasztott \(--ref\) vagy ugyanebben a futásban készülő stílus-referenciával indul\./);
  assert.match(src, /path\.join\(ROOT, "design-assets", "candidates", SET\)/);
  assert.match(read(".gitignore"), /^design-assets\/candidates\/$/m);
  // A két megtagadás a kulcs beolvasása ELŐTT áll; a hálózati hívás egyetlen helyen, a keretkezelőn belül történik.
  const run = src.slice(src.indexOf("async function runSet("), src.indexOf("async function main()"));
  assert.ok(run.indexOf("csak --max-usd költségplafonnal indul") < run.indexOf("readKey()"));
  assert.ok(run.indexOf("stílus-referenciával indul") < run.indexOf("readKey()"));
  assert.match(run, /const budget: Budget = \{ spent: alreadySpent, maxUsd \}/);
  assert.equal(src.split("requestImage(fetch").length - 1, 1, "egyetlen hálózati hívóhely");
  assert.equal(src.split("fetch(").length - 1, 0, "közvetlen fetch-hívás nincs — csak a requestImage-en át");
  assert.match(src.slice(src.indexOf("async function generateOne(")), /attemptWithinBudget\(\{\s*budget: ctx\.budget,/);
  // A félrevezető „Csak az első N tétel fut” üzenet külön készletnél nem jelenik meg (review L2): a készlet-ág előbb tér vissza.
  const main = src.slice(src.indexOf("async function main()"));
  assert.ok(main.indexOf("if (SET)") < main.indexOf("Csak az első"));
});
