import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { resolveStoredArt } from "../shared/design-assets";
import { lessonCoverId } from "../shared/lesson-cover-key";
import { computeLessonArt } from "../shared/lesson-art-compute";
import { loadStyle } from "../scripts/design-assets/lib";
import type { CoverDeps, CoverStore, LessonLite } from "../server/lesson-covers";

// docs/specs/2026-11-03-leckeborito-auto.md — új leckék automatikus borítója (hálózat és adatbázis nélkül).

const NEW_TITLE = "Mátyás király udvara és a reneszánsz Buda";
const lesson = (id: string, title = NEW_TITLE, extra: Partial<LessonLite> = {}): LessonLite => ({ id, htmlFileId: `f-${id}`, subject: "Történelem", classroom: 6, title, picture: "hero-studio", ...extra });
const newId = lessonCoverId({ subject: "Történelem", title: NEW_TITLE }, "studio");

function memoryStore(lessons: LessonLite[]) {
  const ids = new Set(DESIGN_ASSET_CATALOG.map(a => a.id));
  const inserted: string[] = [];
  const links: Array<[string, string]> = [];
  const titles = new Map(lessons.map(l => [l.id, l.title]));
  const store: CoverStore = {
    lessons: async () => lessons,
    lessonJson: async id => ({ title: titles.get(id), subject: "Történelem", classroom: 6, sections: [{ heading: "Visegrád és Buda", blocks: [{ kind: "explain", text: "Mátyás udvara…" }] }] }),
    storedIds: async () => new Set(ids),
    insertCover: async row => { ids.add(row.id); inserted.push(row.id); },
    link: async (l, coverId) => { if (titles.get(l.id) !== l.title) return false; links.push([l.id, coverId]); return true; },
    insertedToday: async () => inserted.length,
    exclusive: async work => work(),
  };
  return { store, inserted, links, titles };
}
const PASS = JSON.stringify({ text: false, unsafe: false, matches: true, note: "ok" });
const TEXTY = JSON.stringify({ text: true, unsafe: false, matches: true, note: "felirat" });
function fakeDeps(qa: string[]) {
  const calls = { chat: 0, image: 0 };
  const deps: CoverDeps = {
    chat: async system => { calls.chat++; return system.includes("You check") ? qa.shift() ?? PASS : JSON.stringify({ scene: "A Renaissance royal palace courtyard on a hill above the Danube, a marble fountain, arcades, people far away.", alt: "Reneszánsz királyi palota udvara a Duna felett." }); },
    image: async () => { calls.image++; return { bytes: Buffer.from([0xff, 0xd8, 0xff]), mime: "image/jpeg" }; },
  };
  return { deps, calls };
}

test("új, saját borító nélküli publikált lecke: egy kép, a vázlat-másolat is megkapja", async () => {
  const { sweepLessonCovers } = await import("../server/lesson-covers");
  const m = memoryStore([lesson("a"), lesson("b", "Mátyás király udvara – és a reneszánsz Buda")]);
  const f = fakeDeps([]);
  const r = await sweepLessonCovers(m.store, f.deps, { maxImages: 5 });
  assert.deepEqual(m.inserted, [newId]);
  assert.deepEqual(m.links.map(([l]) => l).sort(), ["a", "b"]);
  assert.equal(r.linked, 2);
  assert.equal(f.calls.image, 1);
});

test("kurált, katalógusos vagy kézi borítós lecke és az Antigoné-anyag nem célpont", async () => {
  const { sweepLessonCovers } = await import("../server/lesson-covers");
  const hunyadi = lessonCoverId({ subject: "Történelem", title: "Hunyadi János, a kormányzó" }, "studio");
  const m = memoryStore([
    lesson("k", "Hunyadi János, a kormányzó"), // katalógusos leckeborító
    lesson("p", "Hunyadi kormányzósága", { picture: hunyadi }), // kézi pin (átnevezett)
    lesson("x", "Szophoklész: Antigoné", { subject: "Magyar nyelv és irodalom", classroom: 9, picture: "cover-gorog-drama" }),
    lesson("z", NEW_TITLE, { htmlFileId: "7900a871-5788-4df1-95d7-77a646a9ffd6" }),
  ]);
  const f = fakeDeps([]);
  const r = await sweepLessonCovers(m.store, f.deps, { maxImages: 5 });
  assert.equal(r.missing, 0);
  assert.equal(f.calls.chat + f.calls.image, 0);
  assert.deepEqual(m.links.map(([l]) => l), ["k"], "csak a katalógusos borító összekötése (díjmentes)");
});

test("minőségkapu: feliratos kép után egy újragenerálás; két bukás → nincs beszúrás, nincs lecke-írás", async () => {
  const { sweepLessonCovers } = await import("../server/lesson-covers");
  const once = memoryStore([lesson("a")]);
  const f1 = fakeDeps([TEXTY, PASS]);
  await sweepLessonCovers(once.store, f1.deps, { maxImages: 1 });
  assert.equal(f1.calls.image, 2);
  assert.equal(once.inserted.length, 1);
  const twice = memoryStore([lesson("a")]);
  const r = await sweepLessonCovers(twice.store, fakeDeps([TEXTY, TEXTY]).deps, { maxImages: 1 });
  assert.equal(twice.inserted.length, 0);
  assert.deepEqual(r.failed, [newId]);
  assert.equal(twice.links.length, 0);
});

test("napi plafon: elfogyott keretnél nincs fizetős hívás; a sikertelen kulcs aznap nem jön újra", async () => {
  const { runCoverRound } = await import("../server/lesson-covers");
  const m = memoryStore([lesson("a")]);
  const f = fakeDeps([TEXTY, TEXTY]);
  const state = { day: "", images: 0, failed: new Set<string>() };
  const now = new Date("2026-11-04T10:00:00Z");
  await runCoverRound(m.store, f.deps, 1, state, now);
  assert.equal(f.calls.image, 2, "egy kulcs, két kép");
  await runCoverRound(m.store, f.deps, 1, state, now);
  assert.equal(f.calls.image, 2, "a képhívás-plafon (2 × 1) elfogyott, és a kulcs aznap sikertelen");
  const z = memoryStore([lesson("a")]);
  const fz = fakeDeps([]);
  await runCoverRound(z.store, fz.deps, 0, { day: "", images: 0, failed: new Set() }, now);
  assert.equal(fz.calls.chat + fz.calls.image, 0, "0-s plafon");
});

test("vészfék és kulcs: LESSON_COVERS=0 vagy kulcs nélkül nincs háttérfolyamat; az alap plafon 20", async () => {
  const { coverWorkerConfig } = await import("../server/lesson-covers");
  assert.equal(coverWorkerConfig({}), null);
  assert.equal(coverWorkerConfig({ OPENROUTER_API_KEY: "k", LESSON_COVERS: "0" }), null);
  assert.equal(coverWorkerConfig({ OPENROUTER_API_KEY: "k" })?.dailyLimit, 20);
  assert.equal(coverWorkerConfig({ OPENROUTER_API_KEY: "k", LESSON_COVER_DAILY_LIMIT: "5" })?.dailyLimit, 5);
});

test("összekötés: csak az art.picture változhat; a közben változott lecke kimarad", async () => {
  const { planLink } = await import("../server/lesson-covers");
  const { pinnedArt, verifyPinned } = await import("../server/lib/lesson-art-pin");
  const l = lesson("a");
  const json = { title: NEW_TITLE, subject: "Történelem", classroom: 6, sections: [{ heading: "H", blocks: [] }], art: { subjectIcon: "icon-x", picture: "hero-studio" } };
  const pin = planLink(json, l, newId)!;
  assert.deepEqual(pinnedArt(pin), { subjectIcon: "icon-x", picture: newId });
  assert.doesNotThrow(() => verifyPinned(pin, { ...json, art: pinnedArt(pin) }));
  assert.throws(() => verifyPinned(pin, { ...json, title: "más", art: pinnedArt(pin) }), /art-on kívüli/);
  assert.equal(planLink({ ...json, title: "Átnevezve" }, l, newId), null);
  assert.equal(planLink({ ...json, art: { picture: "cover-mas" } }, l, newId), null);
  const { art: _art, ...noArt } = json;
  assert.equal(planLink(noArt, { ...l, picture: null }, newId), null, "art nélküli leckéhez nem ír");
});

test("a gyártott (katalógusban nem szereplő) borító: mentéskor nyer és megmarad, a lejátszó a kulcsával mutatja", () => {
  const ids = new Set([...DESIGN_ASSET_CATALOG.map(a => a.id), newId]);
  const l = { subject: "Történelem", classroom: 6, title: NEW_TITLE };
  assert.equal(computeLessonArt(l, "a", ids)?.picture, newId);
  assert.equal(computeLessonArt(l, "a", ids, undefined, newId)?.picture, newId, "pin");
  assert.notEqual(computeLessonArt(l, "a", new Set(DESIGN_ASSET_CATALOG.map(a => a.id)))?.picture, newId, "a táblában nincs");
  const shown = resolveStoredArt({ picture: newId }, "studio", DESIGN_ASSET_CATALOG, l);
  assert.equal(shown?.cover?.id, newId);
  assert.match(shown!.cover!.src, /^\/design\/studio\//, "tartalékkép a katalógusból");
  assert.equal(resolveStoredArt({ picture: newId }, "studio", DESIGN_ASSET_CATALOG, { ...l, title: "Más cím" }), null, "más kulcs");
});

test("a szerver borítóstílusa a design-assets/style.md soraival egyezik; az évfolyam-hangulat a promptban", async () => {
  const { COVER_STYLE, coverPrompt } = await import("../server/lesson-covers");
  const style = loadStyle(readFileSync("design-assets/style.md", "utf8"));
  assert.equal(COVER_STYLE.kind, style.kind.cover);
  assert.equal(COVER_STYLE.common, style.common);
  for (const [band, text] of Object.entries(COVER_STYLE.band)) assert.equal(text, style.band[band], band);
  assert.match(coverPrompt("A scene.", 3), /picture-book.*Painterly adventure/);
  assert.match(coverPrompt("A scene.", 10), /sophisticated.*photographic/);
});

test("review #384: a beolvasáskor már átnevezett lecke tartalma nem kerül a régi kulcs alá", async () => {
  const { sweepLessonCovers } = await import("../server/lesson-covers");
  const m = memoryStore([lesson("a")]);
  m.titles.set("a", "Egészen más lecke"); // a lessonJson már az új címet adja
  const f = fakeDeps([]);
  const r = await sweepLessonCovers(m.store, f.deps, { maxImages: 1 });
  assert.equal(f.calls.chat + f.calls.image, 0);
  assert.equal(m.inserted.length, 0);
  assert.equal(r.made.length, 0);
});

test("review #384: foglalt zárnál (másik példány) a kör kimarad; összekötés után a főoldali lista ürül", async () => {
  const { runCoverRound } = await import("../server/lesson-covers");
  const m = memoryStore([lesson("a")]);
  const f = fakeDeps([]);
  const locked = { ...m.store, exclusive: async () => null };
  assert.equal(await runCoverRound(locked, f.deps, 5, { day: "", images: 0, failed: new Set() }), null);
  assert.equal(f.calls.chat + f.calls.image, 0);
  let invalidated = 0;
  const r = await runCoverRound(m.store, f.deps, 5, { day: "", images: 0, failed: new Set() }, new Date(), () => { invalidated++; });
  assert.equal(r?.linked, 1);
  assert.equal(invalidated, 1);
});
