import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { acquireRunLock } from "../scripts/design-assets/run-lock";
import * as artLib from "../scripts/design-assets/lib";

import {
  attemptWithinBudget, canSpend, composePrompt, estimateUsd, ledgerProblem, loadStyle, missingReferences, parseMaxUsd, parseRefs, parseSetName, planJobs, readLedger, requestImage, runJobs, spentFromLog,
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

test("költségkönyv (review G2, L5): a „started” sor számít, a lezáró sor nem duplázza; a sérült sor sorszáma megvan", () => {
  const log = [
    JSON.stringify({ id: "advent-bg-portrait", status: "ok", estUsd: 0.09 }), // régi alak (próbakör)
    JSON.stringify({ id: "advent-door-08", status: "error", attempt: 1, estUsd: 0.048 }), // régi alak
    JSON.stringify({ id: "advent-door-08", status: "started", attempt: 2, estUsd: 0.048 }), // új alak
    JSON.stringify({ id: "advent-door-08", status: "ok", imageUsd: 0.048, file: "advent-door-08/x.jpg" }),
    JSON.stringify({ id: "advent-door-24", status: "started", attempt: 1, estUsd: 0.048 }), // megszakadt hívás: nincs lezáró sor
    "",
  ].join("\n");
  const clean = readLedger(log);
  assert.deepEqual(clean.corruptLines, []);
  assert.ok(Math.abs(clean.spentUsd - (0.09 + 0.048 + 0.048 + 0.048)) < 1e-9, `összeg: ${clean.spentUsd}`);
  const broken = readLedger(`${log}{ "id": "félbeszakadt\nnull\n${JSON.stringify({ status: "started", estUsd: 0.09 })}\n`);
  assert.deepEqual(broken.corruptLines, [6, 7]);
  assert.ok(broken.spentUsd > clean.spentUsd, "az ép sorok a sérült után is számítanak");
});

test("naplóhiba (review G1, G2): hiányzó napló meglévő jelöltekkel, vagy sérült sor → az éles futás megáll", () => {
  assert.equal(ledgerProblem({ logExists: false, candidateFiles: 0, corruptLines: [] }), null, "első futás: nincs napló, nincs jelölt");
  assert.equal(ledgerProblem({ logExists: true, candidateFiles: 10, corruptLines: [] }), null);
  assert.match(ledgerProblem({ logExists: false, candidateFiles: 10, corruptLines: [] }) ?? "", /hiányzik, de 10 jelölt már van/);
  assert.match(ledgerProblem({ logExists: true, candidateFiles: 10, corruptLines: [3, 9] }) ?? "", /sérült sort tartalmaz \(sor: 3, 9\)/);
  // A generátor a naplóhibánál a kulcs beolvasása és a zár előtt áll meg.
  const run = read("scripts/design-assets/generate.ts");
  const body = run.slice(run.indexOf("async function runSet("), run.indexOf("async function main()"));
  assert.ok(body.indexOf("if (problem) throw new Error(problem);") > 0);
  assert.ok(body.indexOf("if (problem) throw new Error(problem);") < body.indexOf("readKey()"));
  assert.ok(body.indexOf("readKey()") < body.indexOf("acquireRunLock(CANDIDATES)"));
});

test("„indult” sor a hívás ELŐTT (review L5): a megszakadt és a sikertelen hívás is a könyvben marad", async () => {
  const rows: string[] = [];
  const budget: Budget = { spent: 0, maxUsd: 7 };
  const net = fakeFetch([emptyOk, okImage]);
  await attemptWithinBudget({
    budget, estUsd: 0.048, maxAttempts: 2,
    onStart: (n) => { rows.push(JSON.stringify({ status: "started", attempt: n, estUsd: 0.048, callsBefore: net.calls.length })); },
    attempt: async () => { await requestImage(net.impl, { endpoint: "https://example.invalid/images", key: "k", body: {} }); rows.push(JSON.stringify({ status: "ok", imageUsd: 0.048 })); },
    onError: (n) => { rows.push(JSON.stringify({ status: "error", attempt: n })); },
  });
  assert.deepEqual(rows.map((r) => (JSON.parse(r) as { status: string }).status), ["started", "error", "started", "ok"]);
  // Az „indult” sor a hálózati hívás előtt íródik (az elsőnél még 0, a másodiknál 1 hívás ment ki).
  assert.deepEqual(rows.filter((r) => r.includes("started")).map((r) => (JSON.parse(r) as { callsBefore: number }).callsBefore), [0, 1]);
  assert.ok(Math.abs(readLedger(rows.join("\n")).spentUsd - budget.spent) < 1e-9, "a könyv és a keret ugyanazt mutatja");
  // Megszakítás a hívás közben (a folyamat leáll): a lezáró sor hiányzik, de az „indult” sor megvan.
  const killed: string[] = [];
  await assert.rejects(attemptWithinBudget({
    budget: { spent: 0, maxUsd: 7 }, estUsd: 0.09, maxAttempts: 2,
    onStart: () => { killed.push(JSON.stringify({ status: "started", estUsd: 0.09 })); },
    attempt: async () => { throw new Error("megszakítva"); },
    onError: () => { throw new Error("a folyamat leállt"); },
  }), /leállt/);
  assert.ok(Math.abs(readLedger(killed.join("\n")).spentUsd - 0.09) < 1e-9);
});

test("referencia nélkül nincs fizetős kép (review L6): ha a futásban készülő háttér mind elbukik, az ablakképek nem indulnak", async () => {
  const jobs = planJobs([byId("advent-bg-portrait"), byId("advent-door-08"), byId("advent-door-24")], { resolution: "2K", max: 10, maxUsd: 7 }).jobs;
  assert.equal(jobs.length, 10);
  const runWith = async (responses: Array<() => Response>, chosen: string[] = []) => {
    const net = fakeFetch(responses);
    const budget: Budget = { spent: 0, maxUsd: 7 };
    const outcome = await runJobs({
      jobs, chosenRefs: new Set(chosen),
      generate: async (job) => attemptWithinBudget({
        budget, estUsd: job.estUsd, maxAttempts: 2,
        attempt: async () => { await requestImage(net.impl, { endpoint: "https://example.invalid/images", key: "k", body: {} }); },
        onError: () => undefined,
      }),
    });
    return { outcome, calls: net.calls.length, budget };
  };
  // Minden háttér-hívás használhatatlan választ ad: 4 jelölt × 2 hívás megy ki, utána megáll — ablakkép-hívás nincs.
  const failed = await runWith([emptyOk]);
  assert.deepEqual(failed.outcome, { made: 0, stopped: "reference", missingRef: "advent-bg-portrait" });
  assert.equal(failed.calls, 8);
  assert.ok(Math.abs(failed.budget.spent - 8 * 0.09) < 1e-9, "a sikertelen hívások elszámolva");
  // Ha a háttér elkészül, az ablakképek is készülnek.
  const fine = await runWith([okImage]);
  assert.deepEqual(fine.outcome, { made: 10, stopped: null, missingRef: null });
  assert.equal(fine.calls, 10);
  // Kiválasztott referenciával a háttér hibája nem állítja meg az ablakképeket (a referencia a kiválasztott kép).
  const chosen = await runWith([emptyOk, emptyOk, emptyOk, emptyOk, emptyOk, emptyOk, emptyOk, emptyOk, okImage], ["advent-bg-portrait"]);
  assert.deepEqual(chosen.outcome, { made: 6, stopped: null, missingRef: null });
  // A keret itt is megállít.
  const tight = fakeFetch([okImage]);
  const small: Budget = { spent: 6.9, maxUsd: 7 };
  const stopped = await runJobs({ jobs, chosenRefs: new Set(), generate: async (job) => attemptWithinBudget({ budget: small, estUsd: job.estUsd, maxAttempts: 2, attempt: async () => { await requestImage(tight.impl, { endpoint: "https://example.invalid/images", key: "k", body: {} }); }, onError: () => undefined }) });
  assert.deepEqual(stopped, { made: 1, stopped: "budget", missingRef: null });
  assert.equal(tight.calls.length, 1);
});

test("futás-zár (review L7): ugyanarra a készletre második futás nem indul, felszabadítás után igen", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "advent-lock-"));
  try {
    const release = acquireRunLock(dir, new Date("2026-11-18T12:00:00.000Z"));
    assert.throws(() => acquireRunLock(dir), /Már fut egy generálás erre a készletre \(pid \d+, indult: 2026-11-18T12:00:00\.000Z\)/);
    release();
    release(); // kétszeri felszabadítás ártalmatlan
    const again = acquireRunLock(dir);
    again();
    // A zár nem létező mappát is létrehoz (első futás).
    const fresh = path.join(dir, "uj", "keszlet");
    acquireRunLock(fresh)();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a jelöltszám (candidates) 1–10 közötti egész; érvénytelen értékre a terv hibaüzenettel áll meg, nem fut el (vak ellenőr KICSI-1)", () => {
  const item = byId("advent-frame");
  assert.equal(planJobs([{ ...item, candidates: 10 }], { resolution: "1K", max: 1000, maxUsd: null }).jobs.length, 10);
  assert.equal(planJobs([{ ...item, candidates: undefined }], { resolution: "1K", max: 1000, maxUsd: null }).jobs.length, 1, "hiányzó érték: 1");
  for (const bad of [11, 1000, 0, -1, 2.5, Number.NaN, "3" as unknown as number]) {
    assert.throws(() => planJobs([{ ...item, candidates: bad }], { resolution: "1K", max: 1000, maxUsd: null }), /advent-frame: hibás candidates érték.*1–10/, String(bad));
  }
  // A generátor a hibát üzenetként írja ki (main().catch → error.message), nem veremnyomattal.
  assert.match(read("scripts/design-assets/generate.ts"), /main\(\)\.catch\(error => \{ console\.error\(error instanceof Error \? error\.message/);
});

test("a költségkeret a szolgáltató valódi árával (usage.cost) is számol: max(becslés, valódi ár) a keretben és a könyvben (vak ellenőr KICSI-2)", () => {
  const settle = (artLib as unknown as { settleActualCost?: (budget: Budget | null, estUsd: number, usage: unknown) => number }).settleActualCost;
  assert.equal(typeof settle, "function", "settleActualCost hiányzik");
  const budget: Budget = { spent: 0.09, maxUsd: 7 }; // a hívás indításakor a becslés már terhelve
  const extra = settle!(budget, 0.09, { cost: 0.12, prompt_tokens: 10 });
  assert.ok(Math.abs(extra - 0.03) < 1e-9 && Math.abs(budget.spent - 0.12) < 1e-9, "drágább valódi ár: a különbözet is terhel");
  assert.equal(settle!(budget, 0.09, { cost: 0.05 }), 0, "olcsóbb valódi ár: marad a becslés (max)");
  for (const usage of [null, undefined, {}, { cost: "0.5" }, { cost: -1 }, { cost: Number.POSITIVE_INFINITY }]) assert.equal(settle!(budget, 0.09, usage), 0, JSON.stringify(usage));
  assert.ok(Math.abs(budget.spent - 0.12) < 1e-9);
  assert.ok(Math.abs(settle!(null, 0.09, { cost: 0.5 }) - 0.41) < 1e-9, "keret nélkül (régi készlet) is kiszámolja a különbözetet");
  // A könyv: az „ok” sor extraUsd mezője is a költésbe számít — a következő futás kerete a valódi árból indul.
  const log = [JSON.stringify({ status: "started", estUsd: 0.09 }), JSON.stringify({ status: "ok", imageUsd: 0.09, extraUsd: 0.03, usage: { cost: 0.12 } })].join("\n");
  assert.ok(Math.abs(readLedger(log).spentUsd - 0.12) < 1e-9, `könyv: ${readLedger(log).spentUsd}`);
  // A generátor az „ok” sorba írja és a keretbe terheli a különbözetet.
  const run = read("scripts/design-assets/generate.ts");
  assert.match(run, /settleActualCost\(ctx\.budget, cost, img\.usage\)/);
  assert.match(run, /extraUsd/);
});
