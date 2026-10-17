import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import express from "express";
import type { AddressInfo } from "node:net";
import { designAssets, knowledgeMaps, lessons } from "../shared/schema";
import type { DesignAsset } from "../shared/design-assets";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// Websuli ikonkészlet (docs/specs/2026-10-17-websuli-ikonkeszlet.md) — a képek az adatbázisban, eldobható Postgresben.
// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { designAssetsRouter, syncDesignAssets, withLessonArt } = await import("../server/design-assets");
const { createDrizzlePipelineStore } = await import("../server/studio/pipeline-store");

const asset = (id: string, band: DesignAsset["band"]): DesignAsset => ({
  id, kind: "icon", band, subjects: ["matematika"], keywords: ["matematika"], alt: "Matematika: tantárgyikon.", src: `/design/${band}/${id}.webp`,
  origin: "MI-generált, saját (Seedream 5.0 Pro)", model: "bytedance-seed/seedream-5-0-pro", promptHash: "0123456789abcdef", approvedAt: "2026-10-17T08:00:00.000Z",
});
const catalog = [asset("icon-matematika-studio", "studio"), asset("icon-matematika-future", "future"), asset("icon-hianyzo-studio", "studio")];
let root = "";
let base = "";
let close = () => {};

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "websuli-design-"));
  await mkdir(path.join(root, "design", "studio"), { recursive: true });
  await mkdir(path.join(root, "design", "future"), { recursive: true });
  await writeFile(path.join(root, "design", "studio", "icon-matematika-studio.webp"), Buffer.from("RIFF-studio-v1"));
  await writeFile(path.join(root, "design", "future", "icon-matematika-future.webp"), Buffer.from("RIFF-future-v1"));
  const app = express();
  app.use("/api/design-assets", designAssetsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(async () => { close(); await rm(root, { recursive: true, force: true }); await dbPool.end(); });

test("valódi DB: a szinkron betölti a képeket, a hiányzó fájlt jelzi, másodszorra nem ír; változott fájlt frissít", async () => {
  const first = await syncDesignAssets(catalog, [root]);
  assert.deepEqual(first, { written: 2, unchanged: 0, missing: ["icon-hianyzo-studio"] });
  const second = await syncDesignAssets(catalog, [root]);
  assert.deepEqual(second, { written: 0, unchanged: 2, missing: ["icon-hianyzo-studio"] });
  await writeFile(path.join(root, "design", "future", "icon-matematika-future.webp"), Buffer.from("RIFF-future-v2"));
  const third = await syncDesignAssets(catalog, [root]);
  assert.deepEqual(third, { written: 1, unchanged: 1, missing: ["icon-hianyzo-studio"] });
  const [row] = await db.select().from(designAssets).where(eq(designAssets.id, "icon-matematika-future"));
  assert.equal(Buffer.from(row.bytes).toString(), "RIFF-future-v2");
  assert.deepEqual(row.subjects, ["matematika"]);
  assert.equal(row.mime, "image/webp");
});

test("valódi DB: a végpont a bájtokat ETaggel adja; egyező ETagre 304, ismeretlenre 404, hibás azonosítóra 400", async () => {
  const ok = await fetch(`${base}/api/design-assets/icon-matematika-studio`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/webp");
  assert.equal(ok.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(Buffer.from(await ok.arrayBuffer()).toString(), "RIFF-studio-v1");
  const etag = ok.headers.get("etag")!;
  assert.match(etag, /^"[a-f0-9]{64}"$/);
  assert.equal((await fetch(`${base}/api/design-assets/icon-matematika-studio`, { headers: { "If-None-Match": etag } })).status, 304);
  assert.equal((await fetch(`${base}/api/design-assets/icon-nincs-ilyen`)).status, 404);
  assert.equal((await fetch(`${base}/api/design-assets/${encodeURIComponent("../etc")}`)).status, 400);
});

test("valódi DB: mentéskor a lecke a tantárgy × sáv ikonját kapja; hiányzó kép vagy nem tanított pár esetén nincs ikon", async () => {
  const lesson = { ...fusionFixture(), subject: "Matematika", classroom: 7 };
  assert.deepEqual((await withLessonArt(lesson, "seed") as { art?: unknown }).art, { subjectIcon: "icon-matematika-studio" });
  const laboratory = await withLessonArt({ ...lesson, classroom: 9, art: { subjectIcon: "icon-regi" } }, "seed") as { art?: unknown };
  assert.equal(laboratory.art, undefined, "a 9–10. sáv képe nincs a táblában: a régi érték sem marad");
  assert.equal((await withLessonArt({ ...lesson, subject: "Fizika", classroom: 2 }, "seed") as { art?: unknown }).art, undefined);

  await db.insert(knowledgeMaps).values({ id: "icon-map", title: "Ikon próba", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "icon-integration-only" });
  const store = await createDrizzlePipelineStore();
  const id = await store.upsertLesson(null, "icon-map", lesson);
  const [saved] = await db.select({ json: lessons.json }).from(lessons).where(eq(lessons.id, id));
  assert.deepEqual((saved.json as { art?: unknown }).art, { subjectIcon: "icon-matematika-studio" });
  await store.upsertLesson(id, "icon-map", { ...lesson, classroom: 12 });
  const [updated] = await db.select({ json: lessons.json }).from(lessons).where(eq(lessons.id, id));
  assert.deepEqual((updated.json as { art?: unknown }).art, { subjectIcon: "icon-matematika-future" });
});

test("valódi DB (review #274): a javítás tranzakciójában is az új sáv ikonja kerül a leckébe", async () => {
  const lesson = { ...fusionFixture(), subject: "Matematika", classroom: 7, art: { subjectIcon: "icon-matematika-studio" } };
  const moved = await db.transaction(async tx => withLessonArt({ ...lesson, classroom: 11 }, "seed", tx)) as { art?: unknown };
  assert.deepEqual(moved.art, { subjectIcon: "icon-matematika-future" }, "a 11. évfolyamra áthelyezett lecke a 11–12. sáv ikonját kapja");
});

test("valódi DB (lecke megnyitása): a mentés a teljes arculatot rögzíti — ikon és a sáv képe, csak az adatbázisban létezőkből", async () => {
  await writeFile(path.join(root, "design", "studio", "hero-studio.webp"), Buffer.from("RIFF-hero-studio"));
  const hero: DesignAsset = { ...asset("hero-studio", "studio"), kind: "hero", subjects: [], keywords: [], alt: "Kreatív stúdió: sávhős.", src: "/design/studio/hero-studio.webp" };
  assert.equal((await syncDesignAssets([hero], [root])).written, 1);
  const lesson = { ...fusionFixture(), subject: "Matematika", classroom: 7 };
  assert.deepEqual((await withLessonArt(lesson, "seed") as { art?: unknown }).art, { subjectIcon: "icon-matematika-studio", picture: "hero-studio" });
  // A 3–5. sávhoz nincs kép és ikon a táblában: nincs art (a lejátszó a régi számolásra vált).
  assert.equal((await withLessonArt({ ...lesson, classroom: 4 }, "seed") as { art?: unknown }).art, undefined);
  const store = await createDrizzlePipelineStore();
  const id = await store.upsertLesson(null, "icon-map", lesson);
  const [saved] = await db.select({ json: lessons.json }).from(lessons).where(eq(lessons.id, id));
  assert.deepEqual((saved.json as { art?: unknown }).art, { subjectIcon: "icon-matematika-studio", picture: "hero-studio" });
});
