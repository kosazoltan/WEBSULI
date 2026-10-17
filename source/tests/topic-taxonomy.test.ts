import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { designAssetSchema, pickLessonArt, type DesignAsset } from "../shared/design-assets";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { SUBJECT_BANDS } from "../shared/subject-icons";
import { TOPICS, topicCoverId, topicKeyOf } from "../shared/topic-taxonomy";

// Websuli arculati bank, S1 (docs/specs/2026-10-17-arculati-bank.md): témakör-taxonómia és témaköri borító.

test("a taxonómia csak tanított párokat tartalmaz, mind a 72 párnak 2–6 témaköre van, a borító-azonosítók egyediek", () => {
  const ids = new Set<string>();
  for (const t of TOPICS) {
    assert.ok(SUBJECT_BANDS[t.subject].includes(t.band), `tanított pár: ${t.subject}/${t.band}`);
    assert.match(t.key, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(topicCoverId(t)), `egyedi: ${topicCoverId(t)}`); ids.add(topicCoverId(t));
    assert.ok(t.keywords.length > 0 && t.keywords.every(k => k.length >= 3 && k === k.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()), `${t.key}: ékezet nélküli, ≥3 karakteres kulcsszavak`);
    assert.ok(t.motif.length > 10 && t.label.length > 2);
  }
  for (const [subject, bands] of Object.entries(SUBJECT_BANDS)) for (const band of bands) {
    const n = TOPICS.filter(t => t.subject === subject && t.band === band).length;
    assert.ok(n >= 2 && n <= 6, `${subject}/${band}: ${n} témakör`);
  }
});

test("témakör-besorolás: katalógus-témakör, cím, ismeretlen, nem tanított pár; a leghosszabb kulcsszó nyer", () => {
  assert.equal(topicKeyOf({ subject: "Környezetismeret", classroom: 4, title: "A víz körforgása" })?.key, "viz");
  assert.equal(topicKeyOf({ subject: "Matematika", classroom: 5, title: "Törtek összeadása" })?.key, "tortek");
  assert.equal(topicKeyOf({ subject: "Fizika", classroom: 8, title: "Áramkörök", topicArea: "Elektromosságtan" })?.key, "elektromossag");
  assert.equal(topicKeyOf({ subject: "Matematika", classroom: 9, title: "Medve csapatverseny" }), null);
  assert.equal(topicKeyOf({ subject: "Fizika", classroom: 2, title: "Áramkör" }), null, "1–2. sávban nem tanított");
  assert.equal(topicKeyOf({ subject: "constructor", classroom: 7, title: "x" }), null);
  // A katalógus-témakör elsőbbséget kap a címmel szemben.
  assert.equal(topicKeyOf({ subject: "Matematika", classroom: 5, title: "Törtek", topicArea: "Geometria és kerület" })?.key, "geometria");
});

test("a témakör borítója nyer, de csak a lecke sávjában; a témaköri borító nem kerül az általános rotációba", () => {
  const base = DESIGN_ASSET_CATALOG.find(a => a.kind === "cover")!;
  const topical: DesignAsset = { ...base, id: "cover-matematika-adventure-tortek", band: "adventure", subjects: ["matematika"], keywords: ["Törtek", "tort"], topic: "tortek", src: "/design/adventure/cover-matematika-adventure-tortek.webp" };
  const catalog = [...DESIGN_ASSET_CATALOG, topical];
  assert.equal(pickLessonArt({ subject: "Matematika", title: "Törtek", seed: "a", topicCoverId: topical.id }, "adventure", catalog).cover?.id, topical.id);
  assert.notEqual(pickLessonArt({ subject: "Matematika", title: "Törtek", seed: "a", topicCoverId: topical.id }, "studio", catalog).cover?.id, topical.id, "más sávban nem");
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const art = pickLessonArt({ subject: "Matematika", title: "Szorzás", seed }, "adventure", catalog);
    assert.notEqual(art.cover?.id, topical.id, "témakör nélkül nem rotál be");
  }
});

test("lefedettség: minden témakörhöz van jóváhagyott, sémának megfelelő borító a saját sávjában, létező fájllal", () => {
  for (const t of TOPICS) {
    const asset = DESIGN_ASSET_CATALOG.find(a => a.id === topicCoverId(t));
    assert.ok(asset, `jóváhagyott borító: ${topicCoverId(t)}`);
    assert.ok(designAssetSchema.safeParse(asset).success, `${asset.id}: séma`);
    assert.equal(asset.kind, "cover"); assert.equal(asset.band, t.band); assert.equal(asset.topic, t.key);
    assert.ok(existsSync(new URL(`../client/public${asset.src}`, import.meta.url)), `${asset.id}: fájl`);
  }
});

