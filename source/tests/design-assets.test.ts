import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildImageRequest, composePrompt, estimateUsd, loadStyle, redact, type AssetManifest } from "../scripts/design-assets/lib";
import { designAssetSchema } from "../shared/design-assets";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";

// Websuli képkészlet (docs/specs/2026-10-17-websuli-kepkeszlet.md).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("design-assets/prompts.json")) as AssetManifest;
const style = loadStyle(read("design-assets/style.md"));

test("a képkészlet modellje a tulajdonosi döntés szerinti Seedream 5.0 Pro", () => {
  assert.equal(manifest.model, "bytedance-seed/seedream-5-0-pro");
});

test("minden tételhez van közös, sáv- és típusstílus; a prompt tiltja a szöveget és a nemi sztereotípiát", () => {
  const ids = new Set<string>();
  for (const item of manifest.items) {
    assert.ok(!ids.has(item.id), `egyedi id: ${item.id}`); ids.add(item.id);
    const prompt = composePrompt(item, style);
    assert.match(prompt, /no text, letters, numbers/i);
    assert.match(prompt, /Gender-neutral/);
    assert.ok(item.alt.length >= 8, `${item.id}: alt szöveg`);
    for (const ref of item.references ?? []) assert.ok(manifest.items.some(i => i.id === ref), `${item.id}: létező referencia ${ref}`);
  }
});

test("a kérés a /api/v1/images szerinti alakú, a kulcs nincs benne; a kitakarás a kulcsot és a tokent is elrejti", () => {
  const item = manifest.items[0];
  const body = buildImageRequest(manifest.model, item, style, ["data:image/png;base64,AAAA"]);
  assert.deepEqual(Object.keys(body).sort(), ["aspect_ratio", "input_references", "model", "n", "prompt", "resolution"]);
  assert.equal(body.resolution, "2K");
  assert.deepEqual(body.input_references, [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }]);
  const key = "sk-or-v1-abcdef0123456789";
  assert.ok(!JSON.stringify(body).includes(key));
  assert.equal(redact(`hiba ${key} Bearer ${key}`, key).includes("abcdef"), false);
  assert.equal(redact("Authorization: Bearer xyz.123", ""), "Authorization: Bearer [kulcs]");
});

test("a becsült ár az OpenRouter 2026-10-17-i ára: 2K kép 0,09 USD, referencia 0,003 USD", () => {
  assert.equal(estimateUsd(12, 2).toFixed(3), "1.086");
});

test("a katalógus minden eleme séma szerinti, MI-generált saját kép, és a fájl létezik", () => {
  for (const raw of DESIGN_ASSET_CATALOG) {
    const asset = designAssetSchema.parse(raw);
    assert.ok(existsSync(new URL(`../client/public${asset.src}`, import.meta.url)), `${asset.id}: fájl`);
  }
});

// Websuli lecke-hős (docs/specs/2026-10-17-websuli-lecke-hos.md): a választás szabályai, rögzített mintakatalóguson.
test("pickLessonArt: kulcsszavas borító, sávhős, kabala csak 1–5., ékezettűrő tárgyikon (-young a fiataloknak)", async () => {
  const { pickLessonArt, foldText } = await import("../shared/design-assets");
  const a = (id: string, kind: "mascot" | "hero" | "icon" | "cover", band: "explorer" | "adventure" | "studio" | "laboratory" | "future", subjects: string[], keywords: string[]) =>
    ({ id, kind, band, subjects, keywords, alt: "Minta kép leírása", src: `/design/${band}/${id}.webp`, origin: "MI-generált, saját (Seedream 5.0 Pro)", model: "m", promptHash: "0123456789abcdef", approvedAt: "2026-10-17" });
  const catalog = [
    a("cover-sejt", "cover", "laboratory", ["biológia"], ["sejt", "sejtmag"]),
    a("hero-studio", "hero", "studio", [], ["Föld"]), a("hero-explorer", "hero", "explorer", [], []),
    a("mascot-hello", "mascot", "explorer", [], ["kabala"]),
    a("icon-kornyezet-young", "icon", "explorer", ["kornyezet"], []), a("icon-biologia", "icon", "laboratory", ["biologia"], []),
    a("icon-matematika-young", "icon", "explorer", ["matematika"], []), a("icon-matematika", "icon", "laboratory", ["matematika"], []),
  ];
  assert.equal(foldText("Természetismeret"), "termeszetismeret");
  const bio = pickLessonArt({ subject: "Biológia", title: "Sejtmembrán, transzport, sejtmag" }, "laboratory", catalog);
  assert.equal(bio.cover?.id, "cover-sejt");
  assert.equal(bio.mascot, undefined, "9–10. évfolyamon nincs kabala");
  assert.equal(bio.subjectIcon?.id, "icon-biologia");
  const math7 = pickLessonArt({ subject: "Matematika", title: "Medve Szabadtéri Csapatverseny" }, "studio", catalog);
  assert.equal(math7.cover, undefined, "kulcsszó nélkül nincs borító");
  assert.equal(math7.hero?.id, "hero-studio");
  assert.equal(math7.subjectIcon?.id, "icon-matematika");
  const env2 = pickLessonArt({ subject: "Környezetismeret", title: "Az évszakok" }, "explorer", catalog);
  assert.equal(env2.hero?.id, "hero-explorer");
  assert.equal(env2.mascot?.id, "mascot-hello");
  assert.equal(env2.subjectIcon?.id, "icon-kornyezet-young");
  assert.equal(pickLessonArt({ subject: "Matematika", title: "Törtek" }, "adventure", catalog).subjectIcon?.id, "icon-matematika-young");
  // Review #273: csak a másik korosztály ikonja létezik → nincs ikon (nem kerül kisiskolás ikon a 9–10. évfolyamra, sem fordítva).
  assert.equal(pickLessonArt({ subject: "Környezetismeret", title: "Az évszakok" }, "laboratory", catalog).subjectIcon, undefined);
  assert.equal(pickLessonArt({ subject: "Biológia", title: "Növények" }, "explorer", catalog).subjectIcon, undefined);
  // Dokumentált spec-változás (változatos képválasztás): saját sávhős nélkül a korosztály másik sávhőse jön, nem üres hős.
  const chem = pickLessonArt({ subject: "Kémia", title: "Oldatok" }, "future", catalog);
  assert.equal(chem.hero?.id, "hero-studio");
  assert.equal(chem.cover, undefined);
  assert.equal(chem.mascot, undefined);
});

// Dokumentált specváltozás (docs/specs/2026-10-19-hos-kep-sav.md, tulajdonosi döntés 2026-10-19): a kulcsszó nélküli lecke a SÁV
// SAJÁT hős-képét kapja (a 2026-10-17-i „változatos képválasztás” képrésze helyett); a kabala-rotáció és a stabilitás marad.
test("sávkép: azonosítónként stabil, kulcsszó nélkül a sáv saját hős-képe, a kabala rotál", async () => {
  const { pickLessonArt } = await import("../shared/design-assets");
  const young = new Set(["explorer", "adventure"]);
  const lesson = { subject: "Matematika", title: "Gyakorló feladatsor" };
  const first = pickLessonArt({ ...lesson, seed: "lecke-1" }, "studio", DESIGN_ASSET_CATALOG);
  assert.deepEqual(pickLessonArt({ ...lesson, seed: "lecke-1" }, "studio", DESIGN_ASSET_CATALOG), first, "ugyanarra az azonosítóra stabil");
  for (const [band, isYoung] of [["explorer", true], ["adventure", true], ["studio", false], ["laboratory", false], ["future", false]] as const) {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const art = pickLessonArt({ ...lesson, seed: `lecke-${i}` }, band, DESIGN_ASSET_CATALOG);
      const pic = art.cover ?? art.hero;
      assert.ok(pic, `${band}: van kép`);
      assert.equal(young.has(pic!.band), isYoung, `${band}: korosztályhoz illő kép (${pic!.id})`);
      assert.equal(pic!.id, `hero-${band}`, `${band}: a sáv saját hős-képe`);
      seen.add(pic!.id);
      // A kabala-portré csak 1–5. évfolyamon, és nem ismétli a rókát, ha a kép maga is a kabalát mutatja („kabala” kulcsszó).
      if (isYoung && !pic!.keywords.includes("kabala")) assert.ok(art.mascot && young.has(art.mascot.band), `${band}: kabala`);
      else assert.equal(art.mascot, undefined, `${band}: nincs kabala-portré (${pic!.id})`);
    }
    assert.deepEqual([...seen], [`hero-${band}`], `${band}: 20 kulcsszó nélküli lecke mind a sávképet kapja`);
  }
  // Az 1–2. sáv hős-képe maga a róka (nincs dupla kabala), ezért a pózrotációt a 3–5. sávon mérjük, ahol a portré megjelenik.
  const mascots = new Set(Array.from({ length: 20 }, (_, i) => pickLessonArt({ ...lesson, seed: `m-${i}` }, "adventure", DESIGN_ASSET_CATALOG).mascot?.id));
  assert.ok(mascots.size >= 2, "a kabala pózai is rotálnak");
  // Kulcsszavas borító: a cím szerint a témához illő kép (a sejt-borító a biológia-leckén).
  assert.equal(pickLessonArt({ subject: "Biológia", title: "A sejt felépítése", seed: "x" }, "laboratory", DESIGN_ASSET_CATALOG).cover?.id, "cover-sejt");
});

// Ikonkészlet (2026-10-17-websuli-ikonkeszlet, dokumentált specváltozás): minden tantárgy × sáv a saját ikonját kapja; a 6–8.
// „Természettudomány” korábbi icon-kemia ikonja helyett a saját icon-termeszetismeret-studio jár.
test("tárgyikon a valódi katalógusból: a tantárgy × sáv saját ikonja", async () => {
  const { pickLessonArt } = await import("../shared/design-assets");
  assert.equal(pickLessonArt({ subject: "Természettudomány", title: "Az anyag részecskéi", seed: "t" }, "studio", DESIGN_ASSET_CATALOG).subjectIcon?.id, "icon-termeszetismeret-studio");
  assert.equal(pickLessonArt({ subject: "Természetismeret", title: "Az évszakok", seed: "t" }, "adventure", DESIGN_ASSET_CATALOG).subjectIcon?.id, "icon-termeszetismeret-adventure");
  assert.equal(pickLessonArt({ subject: "Kémia", title: "Oldatok", seed: "t" }, "laboratory", DESIGN_ASSET_CATALOG).subjectIcon?.id, "icon-kemia-laboratory");
});

// Review #273: a kulcsszavas borítóhoz a tantárgy is kell; a --max csak nemnegatív egész; az eredet a kiválasztott fájl naplójából.
test("review #273: tantárgy nélküli kulcsszó-egyezés nem ad borítót; --max ellenőrzés; eredet a naplóból", async () => {
  const { pickLessonArt } = await import("../shared/design-assets");
  const { parseMax, provenanceFor } = await import("../scripts/design-assets/lib");
  assert.notEqual(pickLessonArt({ subject: "Matematika", title: "Sejtések és bizonyítások", seed: "s" }, "laboratory", DESIGN_ASSET_CATALOG).cover?.id, "cover-sejt");
  assert.equal(parseMax(undefined), 12);
  assert.equal(parseMax("30"), 30);
  for (const bad of ["bogus", "-1", "", "1.5", "99999999999999999999"]) assert.throws(() => parseMax(bad), `--max ${bad}`);
  const log = [
    JSON.stringify({ id: "a", status: "ok", file: "a\\1.jpg", model: "m-old", promptHash: "1111111111111111" }),
    "nem json",
    JSON.stringify({ id: "a", status: "error", file: "a\\2.jpg" }),
    JSON.stringify({ id: "a", status: "ok", file: "a\\3.jpg", model: "m-new", promptHash: "3333333333333333" }),
  ].join("\n");
  assert.deepEqual(provenanceFor(log, "a/1.jpg"), { model: "m-old", promptHash: "1111111111111111" }, "a régebbi kép a saját eredetét kapja");
  assert.deepEqual(provenanceFor(log, "a/3.jpg"), { model: "m-new", promptHash: "3333333333333333" });
  assert.throws(() => provenanceFor(log, "a/2.jpg"), /Nincs sikeres/);
  // A jelenlegi katalógus minden promptlenyomata egy sikeres generálási bejegyzésből való (a generate.ts sha256-ja, 16 hexa).
  for (const a of DESIGN_ASSET_CATALOG) assert.match(a.promptHash, /^[a-f0-9]{16}$/);
});

// Spec 2026-10-19-hos-kep-sav: a tulajdonos jelzése — halloweeni füzér a 9. o. matek-leckén, a Föld és a híd hiányzik.
test("sávkép: 9. o. matek → híd, 6–8. o. → Föld; a halloweeni borító csak a saját sávjában, a kulcsszóra", async () => {
  const { pickLessonArt } = await import("../shared/design-assets");
  const pic = (subject: string, title: string, band: "studio" | "laboratory") => { const a = pickLessonArt({ subject, title, seed: "s" }, band, DESIGN_ASSET_CATALOG); return (a.cover ?? a.hero)?.id; };
  assert.equal(pic("Matematika", "Kéttagú kifejezések négyzete – azonos kifejezések párosítása", "laboratory"), "hero-laboratory");
  assert.equal(pic("Természettudomány", "A vulkánok – vulkáni működés", "studio"), "hero-studio");
  for (let i = 0; i < 30; i++) assert.notEqual(pickLessonArt({ subject: "Matematika", title: `Feladatsor ${i}`, seed: `x${i}` }, "laboratory", DESIGN_ASSET_CATALOG).cover?.id, "cover-ismetlodes");
  assert.notEqual(pic("Matematika", "Ismétlődő minta és füzér", "laboratory"), "cover-ismetlodes", "más sáv témaborítója nem jöhet");
  assert.equal(pic("Matematika", "Ismétlődő minta és füzér", "studio"), "cover-ismetlodes", "a saját sávban a kulcsszóra igen");
});
