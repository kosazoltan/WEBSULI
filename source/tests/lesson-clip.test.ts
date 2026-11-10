import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { animateBlockIndexes, clip2Schema, clipDraftProblems, clipDraftSchema, clipMediaUrl, clipSource, silentSceneMs, type ClipDraft } from "../shared/lesson-clip";
import { CLIP_BAND_STYLE } from "../shared/clip-style";
import { huNumberWords, spokenHu } from "../shared/hu-numbers";
import { lessonClipMedia, lessonClips } from "../shared/schema";
import { CLIP_MEDIA_CACHE_CONTROL, mediaId, mediaReply } from "../server/lesson-clip-media";
import { CLIP_AUDIO_FORMAT, ELEVENLABS_PARALLEL, limiter, mp3DurationMs } from "../server/lesson-clips-providers";

// docs/specs/2026-11-10-fejezet-kisfilmek-v2.md — fejezetszöveg, forgatókönyv-kapuk, média, migrációk.

const GOAL = "**Cél:** A lecke végére érted a törteket.\n\n**Tipikus buktató:** Összekevered a számlálót a nevezővel.\n\n**Miért?** Mert hasonlítanak.\n\n**Így küzdöd le:** Mindig megnevezed őket.";
const explain = (text: string) => ({ kind: "explain" as const, text, depth: "core" as const, readAloud: true, coversConceptIds: [] });
const TEACH = "A tört a számlálóból és a nevezőből áll. A nevező megmutatja, hány egyenlő részre osztottuk az egészet, a számláló pedig azt, hogy hány részt veszünk.";
const lesson = { sections: [
  { heading: "Mi a tört?", probaEnabled: true, blocks: [explain(GOAL), explain("Bence pizzát rendelt, és nyolc szeletre vágta."), explain(TEACH), { kind: "animate" as const, animKind: "fraction" as const, params: {}, caption: "x" }, { kind: "recap" as const, bullets: ["A nevező a részek száma."] }] },
  { heading: "Rövid", probaEnabled: true, blocks: [explain("Túl rövid.")] },
] };

test("a fejezetszövegből a Célkártya és a mese kimarad; túl rövid fejezet nem kap kisfilmet", () => {
  const source = clipSource(lesson as never, 0)!;
  assert.ok(source.includes("A tört a számlálóból") && source.includes("A nevező a részek száma."));
  assert.ok(!source.includes("Cél:") && !source.includes("Bence"), source);
  assert.equal(clipSource(lesson as never, 1), null);
  assert.equal(clipSource(lesson as never, 7), null);
  assert.deepEqual(animateBlockIndexes(lesson as never, 0), [3]);
  assert.deepEqual(animateBlockIndexes(lesson as never, 9), []);
});

const SOURCE = "A futó lefut egy 400 m hosszú kört, és a rajtvonalnál áll meg. A megtett út 400 m, az elmozdulás 0 m.";
const scene = (say: string, overlay?: ClipDraft["scenes"][number]["overlay"]) => ({ say, image: "A runner on a red athletics track at dawn.", motion: "The runner runs around the curve of the track.", alt: "Futó a pályán.", ...(overlay ? { overlay } : {}) });
const SAY = "A futó lefut egy kört, és a rajtvonalnál áll meg.";
const draft = (scenes = [scene(SAY, { kind: "title", text: "Út és elmozdulás" }), scene(SAY), scene(SAY), scene(SAY, { kind: "formula", parts: [{ t: "s = 400 m" }, { t: "Δs = 0 m" }] })]): ClipDraft => ({ title: "Út és elmozdulás", scenes });

test("a forgatókönyv sémája: 3–4 jelenet, angol kép- és mozgásleírás, ismeretlen mező elutasítva", () => {
  assert.equal(clipDraftSchema.safeParse(draft()).success, true);
  assert.equal(clipDraftSchema.safeParse(draft(draft().scenes.slice(0, 2))).success, false);
  assert.equal(clipDraftSchema.safeParse({ ...draft(), scenes: [...draft().scenes, scene(SAY)] }).success, false, "5 jelenet");
  assert.equal(clipDraftSchema.safeParse(draft([{ ...scene(SAY), image: "rövid" }, scene(SAY), scene(SAY)])).success, false);
  assert.equal(clipDraftSchema.safeParse({ ...draft(), extra: 1 }).success, false);
});

test("forgatókönyv-kapuk a korosztály szerint: jelenetszám, mondathossz, összhossz, címkép, számhűség, ábrahivatkozás", () => {
  assert.deepEqual(clipDraftProblems(draft(), "laboratory", SOURCE, "A mozgás leírása", []), []);
  // A kicsiknél (1–2. évfolyam) pontosan 3 jelenet és rövid mondat kell: ugyanez a forgatókönyv ott megbukik.
  const young = clipDraftProblems(draft(), "explorer", SOURCE, "x", []);
  assert.match(young.join(" "), /3 jelenet kell/);
  const long = "a".repeat(CLIP_BAND_STYLE.explorer.narration.sayMax + 1);
  assert.match(clipDraftProblems(draft([scene(long, { kind: "title", text: "Cím" }), scene(SAY), scene(SAY)]), "explorer", SOURCE, "x", []).join(" "), /legfeljebb 90 karakter/);
  const wordy = "b".repeat(170);
  assert.match(clipDraftProblems(draft([scene(wordy, { kind: "title", text: "Cím" }), scene(wordy), scene(wordy), scene(wordy)]), "laboratory", SOURCE, "x", []).join(" "), /összesen legfeljebb 480/);
  assert.match(clipDraftProblems(draft([scene(SAY), scene(SAY), scene(SAY), scene(SAY)]), "laboratory", SOURCE, "x", []).join(" "), /első jelenet ábrája/);
  // A mennyiség állhat számjeggyel (a program olvassa ki), a sorszám viszont szavakkal kell.
  assert.deepEqual(clipDraftProblems(draft([draft().scenes[0], scene("A futó 400 métert tesz meg a pályán, egy kört."), scene(SAY), scene(SAY)]), "laboratory", SOURCE, "x", []), []);
  assert.match(clipDraftProblems(draft([draft().scenes[0], scene("Newton 2. törvénye szerint ez így van, figyelj."), scene(SAY), scene(SAY)]), "laboratory", SOURCE, "Newton 2. törvénye", []).join(" "), /sorszámot szavakkal/);
  const invented = draft([draft().scenes[0], scene("A futó pontosan 999 métert tesz meg a pályán."), scene(SAY), scene(SAY)]);
  assert.match(clipDraftProblems(invented, "laboratory", SOURCE, "x", []).join(" "), /999/);
  const graph = draft([draft().scenes[0], scene(SAY, { kind: "graph", xLabel: "t (s)", yLabel: "s (m)", points: [[0, 0], [60, 777]] }), scene(SAY), scene(SAY)]);
  assert.match(clipDraftProblems(graph, "laboratory", SOURCE, "x", []).join(" "), /777/, "az ábra száma sem lehet új");
  const visual = draft([draft().scenes[0], scene(SAY, { kind: "lessonVisual", blockIndex: 4 }), scene(SAY), scene(SAY)]);
  assert.deepEqual(clipDraftProblems(visual, "laboratory", SOURCE, "x", [4]), []);
  assert.match(clipDraftProblems(visual, "laboratory", SOURCE, "x", [2]).join(" "), /nem ábra/);
  for (const bad of ["Ez **félkövér** szöveg a jelenetben, ami tilos.", "Nézd meg itt: https://pelda.hu, mert érdekes.", "Ez <b>HTML</b> jelölés a mondatban, tilos."]) {
    assert.equal(clipDraftProblems(draft([draft().scenes[0], scene(bad), scene(SAY), scene(SAY)]), "laboratory", SOURCE, "x", []).length, 1, bad);
  }
});

test("a számok magyar kiolvasása a hanghoz: egészek, tizedes törtek; a szöveg többi része változatlan", () => {
  const cases: Array<[number, string]> = [[0, "nulla"], [2, "kettő"], [10, "tíz"], [18, "tizennyolc"], [20, "húsz"], [25, "huszonöt"], [100, "száz"], [120, "százhúsz"], [200, "kétszáz"],
    [240, "kétszáznegyven"], [400, "négyszáz"], [1000, "ezer"], [1200, "ezerkétszáz"], [2000, "kétezer"], [2500, "kétezer-ötszáz"], [12000, "tizenkétezer"]];
  for (const [n, words] of cases) assert.equal(huNumberWords(n), words, String(n));
  assert.equal(spokenHu("Egy terület 120 méter magasan van, 0 és 200 méter között."), "Egy terület százhúsz méter magasan van, nulla és kétszáz méter között.");
  assert.equal(spokenHu("g értéke 9,8, a váltószám 3,6."), "g értéke kilenc egész nyolc tized, a váltószám három egész hat tized.");
  assert.equal(spokenHu("Nincs benne szám."), "Nincs benne szám.");
});

test("a hangkérések sorba állnak: egyszerre legfeljebb annyi fut, amennyit az előfizetés enged", async () => {
  assert.ok(ELEVENLABS_PARALLEL < 3, "az előfizetés 3 egyidejű kérést enged (mérve) — alatta kell maradni");
  const queue = limiter(2);
  let running = 0, peak = 0;
  const results = await Promise.all(Array.from({ length: 7 }, (_, i) => queue(async () => { peak = Math.max(peak, ++running); await new Promise((r) => setTimeout(r, 5)); running--; return i; })));
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(peak, 2);
  // Hibázó feladat nem akasztja meg a sort.
  await assert.rejects(queue(async () => { throw new Error("hiba"); }));
  assert.equal(await queue(async () => "megy tovább"), "megy tovább");
});

test("a néma jelenet legalább 2,5 mp, hosszabb mondatnál arányosan több", () => {
  assert.equal(silentSceneMs("rövid"), 2500);
  assert.equal(silentSceneMs("a".repeat(100)), 6500);
});

test("média: tartalomcímzett azonosító, korlátlan gyorsítótár, tartománykérés, hibás azonosítóra 404", () => {
  const bytes = Buffer.from("0123456789");
  const id = mediaId(bytes);
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal(mediaId(Buffer.from("0123456789")), id, "azonos tartalom, azonos azonosító");
  assert.equal(clipMediaUrl(id), `/api/lesson-clips/media/${id}`);
  const media = { mime: "video/mp4", bytes };
  const full = mediaReply(id, media, undefined);
  assert.equal(full.status, 200);
  assert.equal(full.headers["Cache-Control"], CLIP_MEDIA_CACHE_CONTROL);
  assert.match(CLIP_MEDIA_CACHE_CONTROL, /immutable/);
  assert.equal(full.headers["Content-Type"], "video/mp4");
  assert.equal(full.headers["X-Content-Type-Options"], "nosniff");
  const part = mediaReply(id, media, "bytes=2-5");
  assert.equal(part.status, 206);
  assert.equal(part.body?.toString(), "2345");
  assert.equal(part.headers["Content-Range"], "bytes 2-5/10");
  assert.equal(mediaReply(id, media, "bytes=50-60").status, 416);
  assert.equal(mediaReply(id, null, undefined).status, 404);
  assert.equal(mediaReply("../../etc/passwd", media, undefined).status, 404);
  assert.equal(mediaReply("ABCDEF0123456789ABCDEF0123456789", media, undefined).status, 404, "csak kisbetűs hexa");
});

test("az MP3 hossza a keretek megszámolásával — eltérő bitrátájú első keret sem téveszti meg", () => {
  // MPEG-1 Layer III, 44,1 kHz: egy keret 1152 minta; 128 kbit/s-on 417 bájt.
  const frame = (kbpsIndex: number, length: number) => { const f = Buffer.alloc(length); f[0] = 0xff; f[1] = 0xfb; f[2] = kbpsIndex << 4; return f; };
  const id3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 20]), Buffer.alloc(20)]);
  const hundred = Buffer.concat([id3, frame(5, 208), ...Array.from({ length: 99 }, () => frame(9, 417))]); // az első keret 64 kbit/s-os
  assert.equal(mp3DurationMs(hundred), Math.round((100 * 1152 / 44100) * 1000));
  assert.equal(mp3DurationMs(Buffer.from("nem hang")), 0);
  assert.equal(CLIP_AUDIO_FORMAT, "mp3_44100_128", "a jóváhagyott hangminőség");
});

test("a v2 kisfilm sémája a korosztály mondathosszát is ellenőrzi", () => {
  const ID = (n: number) => String(n).repeat(32);
  const clip = (band: "adventure" | "future", say: string) => ({ v: 2, band, title: "Próba", shots: [{ image: ID(1), alt: "a" }, { image: ID(2), alt: "b" }, { image: ID(3), alt: "c" }],
    scenes: [0, 1, 2].map((i) => ({ say, shot: i, camera: "still", video: ID(4), audio: ID(5), ms: 4000 })) });
  const long = "a".repeat(CLIP_BAND_STYLE.adventure.narration.sayMax + 1);
  assert.equal(clip2Schema.safeParse(clip("adventure", SAY)).success, true);
  assert.equal(clip2Schema.safeParse(clip("adventure", long)).success, false);
  assert.equal(clip2Schema.safeParse(clip("future", long)).success, true);
  assert.equal(clip2Schema.safeParse({ ...clip("adventure", SAY), v: 1 }).success, false, "a régi változat nem érvényes kisfilm");
});

for (const [file, table, name] of [["0038_lesson_clips.sql", lessonClips, "lesson_clips"], ["0039_lesson_clip_media.sql", lessonClipMedia, "lesson_clip_media"]] as const) {
  test(`a migráció és a Drizzle-séma oszlopai egyeznek (${name})`, () => {
    const sqlText = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    const body = sqlText.slice(sqlText.indexOf(`CREATE TABLE IF NOT EXISTS ${name}`), sqlText.indexOf(");"));
    const inSql = [...body.matchAll(/^\s{2}([a-z_]+)\s+(?:varchar|integer|char|jsonb|timestamp|bytea)/gm)].map((m) => m[1]).sort();
    assert.deepEqual(inSql, Object.values(getTableColumns(table)).map((c) => c.name).sort());
  });
}
