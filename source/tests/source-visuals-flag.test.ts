import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../server/studio/single-run/engine";
import { LessonConversation } from "../server/studio/single-run/conversation";
import { singleRunMapHash, sourceFileRow } from "../server/studio/single-run/live";
import { sourceVisualsEnabled, SOURCE_VISUALS_ENV } from "../server/studio/source-visuals-flag";
import type { SingleRunMap } from "../server/studio/single-run/engine";
import { FINGERPRINT_FILES, productionPromptRun, type FingerprintScenario } from "./helpers/production-prompt-fingerprint";

/* docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, 0. elv (önálló beolvaszthatóság): a forrás vizuális leltára funkciókapcsoló
   mögött áll, alapból KI. KI állapotban a gyártás MINDEN modellnek küldött kérése azonos a kapcsoló előtti főágéval.

   A FŐÁG ÉRTÉKEI (origin/main, 21c81998) — nem ebből a fából számolva, hanem a főág kódján lefuttatott ugyanazon mintafutásból;
   az előállítás lépései a `tests/helpers/production-prompt-fingerprint.ts` fejlécében (git archive origin/main:source … → parancssori mód).
   Ha a főágon a gyártó promptjai SZÁNDÉKOSAN változnak, a három érték ugyanazzal a paranccsal frissítendő. */
const MAIN = {
  source: "aa0647647b45d862b39226078e04538a7c475dc3975f3ba4b6f39316da59887d",
  map: "cecf327e9c72bcda15276ded17c6e030dab2279113a235695a3b3c46166970ee",
  mapHash: "c7d260ebb64bc71781e1243a6fef0870474499fe82ba20cc34fca4daf3d45789",
} as const;

const run = (scenario: FingerprintScenario, extra: Record<string, unknown> = {}) => productionPromptRun(engine as never, LessonConversation as never, scenario, extra);

/** A teszt idejére a környezeti kapcsoló a megadott értéken (undefined: nincs beállítva), utána visszaáll. */
async function withEnv<T>(value: string | undefined, body: () => Promise<T> | T): Promise<T> {
  const prev = process.env[SOURCE_VISUALS_ENV];
  if (value === undefined) delete process.env[SOURCE_VISUALS_ENV]; else process.env[SOURCE_VISUALS_ENV] = value;
  try { return await body(); }
  finally { if (prev === undefined) delete process.env[SOURCE_VISUALS_ENV]; else process.env[SOURCE_VISUALS_ENV] = prev; }
}

test("a kapcsoló alapértéke KI: csak az `on` érték kapcsol be", () => {
  assert.equal(SOURCE_VISUALS_ENV, "STUDIO_SOURCE_VISUALS");
  assert.equal(sourceVisualsEnabled({} as NodeJS.ProcessEnv), false, "környezeti változó nélkül KI");
  for (const off of ["", "0", "1", "true", "off", "igen", "onn", "enforce"]) assert.equal(sourceVisualsEnabled({ STUDIO_SOURCE_VISUALS: off } as NodeJS.ProcessEnv), false, `„${off}” → KI`);
  for (const on of ["on", "ON", " On "]) assert.equal(sourceVisualsEnabled({ STUDIO_SOURCE_VISUALS: on } as NodeJS.ProcessEnv), true, `„${on}” → BE`);
});

test("KI (környezeti változó nélkül): új forrásból a gyártás MINDEN kérése a főágéval azonos; a kéretlen leltár nem jut a térképbe", async () => {
  const off = await withEnv(undefined, () => run("source"));
  assert.deepEqual([...new Set(off.stations)], ["1", "2", "3", "4", "5", "?", "6"], "a mintafutás minden állomást érint (nem üres egyezés)");
  assert.equal(off.fingerprint, MAIN.source, "a modellnek küldött kérések sokasága a főágéval bájtra azonos");
  // A forgatókönyv 1. állomása KÉRETLENÜL két érvényes tételt ad — KI állapotban egyik sem kerülhet a térképre, a számlálókba, a naplóba.
  assert.deepEqual(off.maps[0].visuals, []);
  for (const file of FINGERPRINT_FILES) assert.equal("visuals" in sourceFileRow(file, off.maps[0] as SingleRunMap), false, "a source_files sorában nincs visuals kulcs");
  assert.deepEqual(Object.keys(off.gates).filter((k) => k.startsWith("visuals")), [], "a telemetriában nincs leltár-számláló");
  assert.equal(off.logs.filter((l) => l.includes("Vizuális leltár")).length, 0);
  assert.ok(!off.prompts.some((p) => p.includes('\\"visuals\\": [...]')), "a leltár szerződése egyetlen kérésben sem szerepel");
  // Bármely nem `on` érték és a befecskendezett `false` ugyanez (a befecskendezés a környezet előtt áll).
  assert.equal((await withEnv("off", () => run("source"))).fingerprint, MAIN.source);
  assert.equal((await withEnv("on", () => run("source", { sourceVisuals: false }))).fingerprint, MAIN.source, "befecskendezett KI a BE környezet ellenére");
});

test("BE: az 1. állomás kéri a leltárt, és a tételek a térképre kerülnek (ellenpróba: a KI-egyezés nem üres)", async () => {
  for (const on of [await withEnv("on", () => run("source")), await withEnv(undefined, () => run("source", { sourceVisuals: true }))]) {
    assert.notEqual(on.fingerprint, MAIN.source);
    assert.ok(on.prompts.some((p) => p.includes("1. ÁLLOMÁS") && p.includes('\\"visuals\\": [...]')), "az 1. állomás kérése a leltár szerződését tartalmazza");
    assert.deepEqual((on.maps[0].visuals as Array<{ id: string }>).map((v) => v.id), ["v1", "v2"]);
    assert.ok("visuals" in sourceFileRow(FINGERPRINT_FILES[0], on.maps[0] as SingleRunMap));
    assert.equal(on.gates.visualsFound, 2);
    assert.equal(on.gates.visualsMissing, 0);
  }
});

test("KI: a térképen KORÁBBAN mentett leltárral indított gyártás kérései is a főágéval azonosak; BE állapotban a leltár elérhető", async () => {
  const off = await withEnv(undefined, () => run("map"));
  assert.ok(!off.stations.includes("1"), "térképről indítva nincs forrás-állomás");
  assert.equal(off.fingerprint, MAIN.map);
  assert.deepEqual(Object.keys(off.gates).filter((k) => k.startsWith("visuals")), []);
  const on = await withEnv(undefined, () => run("map", { sourceVisuals: true }));
  assert.equal(on.gates.visualsFound, 2);
});

test("a különálló kinyerés tartalmi lenyomata KI állapotban a főágéval azonos; BE állapotban külön térkép", async () => {
  await withEnv(undefined, () => assert.equal(singleRunMapHash(FINGERPRINT_FILES, "Terület"), MAIN.mapHash));
  assert.equal(singleRunMapHash(FINGERPRINT_FILES, "Terület", false), MAIN.mapHash);
  await withEnv("on", () => assert.notEqual(singleRunMapHash(FINGERPRINT_FILES, "Terület"), MAIN.mapHash, "a leltár nélkül kinyert térkép nem jön vissza gyorsítótárból"));
  assert.notEqual(singleRunMapHash(FINGERPRINT_FILES, "Terület", true), MAIN.mapHash);
});
