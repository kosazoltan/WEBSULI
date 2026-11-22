import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildImageRequest, composePrompt, estimateUsd, loadStyle, redact, redactClip, REDACT_WINDOW, requestImage, type AssetManifest } from "../scripts/design-assets/lib";
import { designAssetSchema } from "../shared/design-assets";
import { CALLER_KEY, ENCODINGS, OVERLAP_KEY, OVERLAP_TEXT, SECRET_CASES, clipPlacements, leak } from "../../scripts/qa/gates/kitakaro-cases.mjs";
import { lessonCoverId } from "../shared/lesson-cover-key";
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
  // Spec-változás 2026-11-03-leckeborito (tulajdonosi döntés): a saját, tartalomkulcsú borítóval rendelkező lecke azt kapja;
  // a borító nélküli cím továbbra is a sáv hősét (idegen témaborítót nem).
  assert.equal(pic("Természettudomány", "A vulkánok – vulkáni működés", "studio"), lessonCoverId({ subject: "Természettudomány", title: "A vulkánok – vulkáni működés" }, "studio"));
  assert.equal(pic("Természettudomány", "A vulkánok – gyakorló feladatsor", "studio"), "hero-studio");
  for (let i = 0; i < 30; i++) assert.notEqual(pickLessonArt({ subject: "Matematika", title: `Feladatsor ${i}`, seed: `x${i}` }, "laboratory", DESIGN_ASSET_CATALOG).cover?.id, "cover-ismetlodes");
  assert.notEqual(pic("Matematika", "Ismétlődő minta és füzér", "laboratory"), "cover-ismetlodes", "más sáv témaborítója nem jöhet");
  assert.equal(pic("Matematika", "Ismétlődő minta és füzér", "studio"), "cover-ismetlodes", "a saját sávban a kulcsszóra igen");
});

// docs/specs/2026-11-19-kitakaro-negyzetes-regex.md: vágás a kitakarás előtt, határon félbevágott kulcs nélkül.
// #521: a kulcs NEM illeszkedik az általános mintákra (sk-or- / Bearer), így a kulcs-kitakarást és a farok-kezelést méri; > 64 karakter.
const clipKey = "kulcs#" + "abcdef0123456789".repeat(4) + "#vege";

test("redactClip: az ablakhatáron félbevágott kulcs nem marad, a hossz korlátos; rövid szövegen a régi viselkedés", () => {
  for (const d of [1, 8, 20, clipKey.length - 1]) {
    const s = "x".repeat(REDACT_WINDOW - d) + clipKey + "y".repeat(1000);
    assert.equal(redactClip(s, clipKey, REDACT_WINDOW).includes(clipKey.slice(0, Math.min(d, 8))), false, `eltolás ${d}`);
    assert.ok(redactClip(s, clipKey, 300).length <= 300);
  }
  const t = `hiba ${clipKey} ` + "z".repeat(1000);
  assert.equal(redactClip(t, clipKey, 300), redact(t, clipKey).slice(0, 300));
});

test("redactClip (#521): az ablakhatáron átnyúló általános token (sk-or- / Bearer) eleje sem marad", () => {
  for (const inWindow of [7, 30, 100, 5000]) {
    for (const tok of ["sk-or-v1-" + "Q".repeat(inWindow + 500), "Bearer " + "Q".repeat(inWindow + 500)]) {
      const s = "#".repeat(REDACT_WINDOW - inWindow) + tok + " vége";
      const out = redactClip(s, clipKey, REDACT_WINDOW);
      assert.equal(out.includes("QQ"), false, `${tok.slice(0, 7)} ablakban ${inWindow}`);
      assert.equal(/sk-or|Bearer\s*$/.test(out), false);
    }
  }
});

// Vak ellenőr (GPT, ff3ba86d) L1: a hosszabbító csere (`Bearer x` → `Bearer [kulcs]`) után a maszkolt kimenet végéből
// eldobott kulcshossz nem fedi a félbevágott kulcsot — a vágásnak forrás-koordinátában kell történnie.
test("requestImage hibaága (vak L1): ablaknál hosszabb, hosszabbító mintákat tartalmazó kulcs sem szivárog", async () => {
  const key = "SYNTHETIC_PRIVATE_MARKER " + "Bearer x ".repeat(8000);
  const fetchImpl = (async () => new Response(key, { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(requestImage(fetchImpl, { endpoint: "https://example.invalid/images", key, body: {} }), (e: Error) => {
    assert.equal(e.message.includes("SYNTHETIC"), false);
    assert.ok(e.message.length <= "HTTP 500: ".length + 300);
    return true;
  });
});

test("redactClip (vak L1): ablakhatáron félbevágott, hosszabbító mintákat tartalmazó kulcs eleje sem marad", () => {
  const key = "MARKER#" + "Bearer x ".repeat(3000);
  for (const missing of [5, 100, 2000]) {
    const s = "y ".repeat((REDACT_WINDOW - (key.length - missing)) / 2 + 1) + key + " vége";
    const out = redactClip(s, key, REDACT_WINDOW * 2);
    assert.equal(out.includes("MARKER"), false, `a kulcsból ${missing} karakter esik az ablakon kívül`);
  }
  // a teljes, ablakon belüli kulcs-előfordulás kitakarva, a határ előtti szöveg megmarad
  const inside = "elotte " + key + " utana " + "z ".repeat(REDACT_WINDOW);
  const out2 = redactClip(inside, key, REDACT_WINDOW * 2);
  assert.ok(out2.startsWith("elotte [kulcs] utana "));
  assert.equal(out2.includes("MARKER"), false);
});

// Vak kör (a188a33d): a szintetikus címet / tokent futásidőben rakjuk össze.
const vakMail = ["fiok.tulaj", "pelda.hu"].join("@");
const vakTok = ["ya29", "+AbC/dEf=~", "Q".repeat(12)].join("");
const noLeak = (s: string, msg: string) => {
  for (const frag of ["fiok.tulaj", "pelda.hu", "AbC/dEf", "QQQQ"]) assert.equal(s.includes(frag), false, `${msg}: ${frag}`);
};

test("redact (vak L1, a188a33d): az e-mail és a teljes Bearer-token (+ / = ~) is kitakarva — a generate.ts naplója is ezt hívja", () => {
  const out = redact(`account ${vakMail}; Bearer ${vakTok} vége`, clipKey);
  noLeak(out, "redact");
  assert.equal(out, "account [e-mail]; Bearer [kulcs] vége");
});

test("requestImage hibaága (vak L1, a188a33d): rövid szolgáltatói hibában sincs e-mail és Bearer-token", async () => {
  const fetchImpl = (async () => new Response(`{"error":"account ${vakMail}; Bearer ${vakTok}"}`, { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(requestImage(fetchImpl, { endpoint: "https://example.invalid/images", key: clipKey, body: {} }), (e: Error) => {
    noLeak(e.message, "hiba");
    return true;
  });
});

test("redactClip (vak L1 / L3, a188a33d): határon átnyúló e-mail nem marad; a futás előtti diagnosztika megmarad", () => {
  for (const sep of ["%M@", "@"]) {
    const s = " ".repeat(REDACT_WINDOW - 150) + "L".repeat(150) + sep + "pelda.hu vége";
    assert.equal(redactClip(s, clipKey, REDACT_WINDOW).includes("L"), false, `elválasztó ${sep}`);
  }
  assert.equal(redactClip("Image backend is offline\n" + "x".repeat(REDACT_WINDOW + 1), clipKey, 300), "Image backend is offline\n");
  const h = "#".repeat(65_537);
  assert.equal(redactClip(h, "", 65_538), h);
});

test("requestImage hibaága: nagy válaszban sincs kulcs, legfeljebb 300 karakteres részlet", async () => {
  const body = "x".repeat(REDACT_WINDOW - 10) + clipKey + "z".repeat(5_000_000);
  const fetchImpl = (async () => new Response(body, { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(requestImage(fetchImpl, { endpoint: "https://example.invalid/images", key: clipKey, body: {} }), (e: Error) => {
    assert.equal(e.message.includes(clipKey.slice(0, 8)), false);
    assert.ok(e.message.length <= "HTTP 500: ".length + 300);
    return true;
  });
});

// 2. vak kör (169cb025): ugyanaz a táblázatos tulajdonság-teszt, mint a kapuknál (scripts/qa/gates/kitakaro.test.mjs) —
// minden forma × alak × út (redact, redactClip rövid / nagy vágási helyzetekkel, requestImage hibaág), átfedés, L5, L6.
test("design-assets kitakaró: minden forma × alak — redact, rövid redactClip és requestImage hibaág titokmentes", async () => {
  for (const c of SECRET_CASES) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      for (const [fn, out] of [["redact", redact(enc(c.raw), CALLER_KEY)], ["redactClip", redactClip(enc(c.raw), CALLER_KEY, 300)]] as const) {
        assert.equal(leak(out, c.body), null, `${fn} ${c.name} / ${encName}: ${JSON.stringify(out)}`);
        assert.ok(out.includes("pre") && out.includes("post"), `${fn} ${c.name} / ${encName}: környezet`);
      }
      const fetchImpl = (async () => new Response(enc(c.raw), { status: 401 })) as unknown as typeof fetch;
      await assert.rejects(requestImage(fetchImpl, { endpoint: "https://example.invalid/images", key: CALLER_KEY, body: {} }), (e: Error) => {
        assert.equal(leak(e.message, c.body), null, `requestImage ${c.name} / ${encName}`);
        return true;
      });
    }
  }
});

test("design-assets redactClip (nagy): minden forma × alak × vágási helyzet — nincs titokdarab, a kimenet nem üres", () => {
  const margin = Math.max(64, CALLER_KEY.length);
  for (const c of SECRET_CASES) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      for (const { pos, text } of clipPlacements(enc(c.raw), REDACT_WINDOW, margin)) {
        const out = redactClip(text, CALLER_KEY, REDACT_WINDOW);
        assert.equal(leak(out, c.body), null, `${c.name} / ${encName} / ${pos}`);
        assert.ok(out.length > 1000, `${c.name} / ${encName} / ${pos}: hossz ${out.length}`);
      }
    }
  }
});

test("design-assets (vak L4 / L5 / L6, 169cb025): átfedő kulcs, kulcs a vágásponton, `Bearer` végű ártalmatlan szó", () => {
  assert.equal(redact(`pre ${OVERLAP_TEXT} post`, OVERLAP_KEY).includes("RTY#RT"), false);
  const m4 = Math.max(64, OVERLAP_KEY.length);
  for (let shift = 1; shift < OVERLAP_TEXT.length; shift++) {
    const start = REDACT_WINDOW - m4 - shift;
    const out = redactClip("y".repeat(start - 1) + " " + OVERLAP_TEXT + " " + "z ".repeat(3000), OVERLAP_KEY, REDACT_WINDOW);
    assert.ok(!out.includes("RTY#RT") && !out.includes("#QWE"), `eltolás ${shift}`);
  }
  const key = "ab#cd#" + "ef#01#".repeat(12);
  const m5 = Math.max(64, key.length);
  for (const back of [1, 5, 30]) {
    const start = REDACT_WINDOW - m5 - back;
    const s = "w ".repeat(start).slice(0, start) + key + " " + "v ".repeat(3000);
    assert.ok(s.length > REDACT_WINDOW);
    const out = redactClip(s, key, REDACT_WINDOW);
    assert.equal(out.includes("ab#cd"), false, `vissza ${back}`);
    assert.equal(out.includes("[kulcs]"), false, `vissza ${back}: a vágáspont a kulcs elé kerül`);
  }
  assert.equal(redactClip("MODE: LifeboatBearer\n" + "A".repeat(REDACT_WINDOW + 10), CALLER_KEY, 300), "MODE: LifeboatBearer\n");
});

test("design-assets (vak L5 / L6, 25de6739): JSON-hibában a DB-URL határa; nagy HTTP-hiba pontos, maszkolt előtagja", async () => {
  const dsn = ["postgres", "://admin:", "titok123", "@", "ep-pelda.neon.tech/db"].join("");
  const a = JSON.stringify({ error: `connect ${dsn}\nConnectionRefused` });
  assert.equal(JSON.parse(redact(a, CALLER_KEY)).error, "connect [kulcs]\nConnectionRefused");
  assert.equal(JSON.parse(redactClip(a, CALLER_KEY, 300)).error, "connect [kulcs]\nConnectionRefused");
  const body = `pre ${CALLER_KEY} kozte Bearer ` + "c".repeat(5_000_000);
  const fetchImpl = (async () => new Response(body, { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(requestImage(fetchImpl, { endpoint: "https://example.invalid/images", key: CALLER_KEY, body: {} }), (e: Error) => {
    assert.equal(e.message, "HTTP 500: pre [kulcs] kozte ");
    return true;
  });
});

// Szűkítés (tulajdonos, 2026-11-22): a képgyártó kitakarása a főágénál semmilyen esetben nem gyengébb.
test("design-assets: nem gyengébb a főágnál — redact / redactClip (rövid és nagy) minden eset × alak esetén", async () => {
  const { mainDesignRedact } = await import("../../scripts/qa/gates/kitakaro-main-baseline.mjs");
  // 6. vak kör L5: halmaz-alapú orákulum (rövid titoknál a teljes titok); plusz L3 / L4 regressziós minták.
  const { extraLeaks, leakSet } = await import("../../scripts/qa/gates/kitakaro-cases.mjs");
  const sub = (now: string, base: string, body: string, msg: string) =>
    assert.deepEqual(extraLeaks(leakSet(now, body), leakSet(base, body)), [], msg);
  const margin = Math.max(64, CALLER_KEY.length);
  const extra = [
    { name: "L3(6) authBearer", raw: "rejected (authBearer SYNTHETICSECRET)", body: "SYNTHETICSECRET" },
    { name: "L3(6) rövid", raw: "rejected (authBearer abcde)", body: "abcde" },
    { name: "L3(6) hosszú törzs", raw: "rejected (authBearer SYNTHETICSECRET)" + " !".repeat(40_000), body: "SYNTHETICSECRET" },
    { name: "L4(6) rövidülő előtag", raw: "build-id=" + "a1".repeat(160) + "; key prefix kulcs#abcdef0123", body: "kulcs#abcdef0123" },
  ];
  for (const c of [...SECRET_CASES, ...extra]) {
    for (const [encName, enc] of [...Object.entries(ENCODINGS), ["nyers", (r: string) => r] as const]) {
      const s = enc(c.raw);
      const base = mainDesignRedact(s, CALLER_KEY);
      sub(redact(s, CALLER_KEY), base, c.body, `redact ${c.name} / ${encName}`);
      sub(redactClip(s, CALLER_KEY, 300), base.slice(0, 300), c.body, `redactClip ${c.name} / ${encName}`);
      if (s.length > 20_000) continue;
      for (const { pos, text } of clipPlacements(s, REDACT_WINDOW, margin)) {
        sub(redactClip(text, CALLER_KEY, REDACT_WINDOW), mainDesignRedact(text, CALLER_KEY).slice(0, REDACT_WINDOW), c.body, `redactClip nagy ${c.name} / ${encName} / ${pos}`);
      }
    }
  }
  // a teljes HTTP-hibaüzenet (requestImage) rövid és ablaknál hosszabb törzzsel
  for (const body of ["rejected (authBearer SYNTHETICSECRET)", "rejected (authBearer SYNTHETICSECRET)" + " !".repeat(40_000)]) {
    const fetchImpl = (async () => new Response(body, { status: 403 })) as unknown as typeof fetch;
    await assert.rejects(requestImage(fetchImpl, { endpoint: "https://example.invalid/images", key: CALLER_KEY, body: {} }), (e: Error) => {
      assert.equal(e.message.includes("SYNTHETICSECRET"), false, e.message.slice(0, 80));
      return true;
    });
  }
});
