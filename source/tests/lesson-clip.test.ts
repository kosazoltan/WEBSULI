import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLIP_LIMITS, clipContentProblems, clipSchema, clipSource, clipTexts, silentSceneMs, type Clip } from "../shared/lesson-clip";
import { TTS_AUDIO_MAX_CHARS, ttsAudioUrl } from "../shared/speech-fallback";
import { CLIP_SEEDS } from "../server/lesson-clip-seeds";
import { lessonClips } from "../shared/schema";
import { getTableColumns } from "drizzle-orm";

// docs/specs/2026-11-10-fejezet-kisfilmek.md — adatszerződés, fejezetszöveg, tartalmi kapuk, kézi kisfilmek, migráció.

const scene = (say: string, visual: Clip["scenes"][number]["visual"] = { kind: "idea", emoji: "💡", text: "Kulcsmondat" }) => ({ say, visual });
const clip = (scenes: Clip["scenes"]): Clip => ({ v: 1, title: "Próba", scenes });
const SAY = "Ez egy elég hosszú, elmondható mondat a jelenethez.";
const valid = clip([scene(SAY, { kind: "title", emoji: "🎬", text: "Cím" }), scene(SAY), scene(SAY)]);

test("a séma a határokon belüli kisfilmet elfogadja, a határon kívülit elutasítja", () => {
  assert.equal(clipSchema.safeParse(valid).success, true);
  assert.equal(clipSchema.safeParse(clip(valid.scenes.slice(0, 2))).success, false, "3-nál kevesebb jelenet");
  assert.equal(clipSchema.safeParse(clip(Array.from({ length: 9 }, () => scene(SAY)))).success, false, "8-nál több jelenet");
  assert.equal(clipSchema.safeParse(clip([scene("rövid"), scene(SAY), scene(SAY)])).success, false, "túl rövid mondat");
  assert.equal(clipSchema.safeParse(clip([scene("a".repeat(CLIP_LIMITS.say + 1)), scene(SAY), scene(SAY)])).success, false, "túl hosszú mondat");
  assert.equal(clipSchema.safeParse({ ...valid, extra: 1 }).success, false, "ismeretlen mező");
  assert.equal(clipSchema.safeParse(clip([scene(SAY, { kind: "motion", actor: "🚗", effect: "teleport", caption: "x" } as never), scene(SAY), scene(SAY)])).success, false, "ismeretlen mozgás");
  const long = "b".repeat(230);
  assert.equal(clipSchema.safeParse(clip([scene(long), scene(long), scene(long), scene(long)])).success, false, "az összhossz 900 fölött");
});

test("minden megengedett mondat belefér a hangvégpont korlátjába", () => {
  assert.ok(CLIP_LIMITS.say <= TTS_AUDIO_MAX_CHARS);
  assert.ok(ttsAudioUrl("á".repeat(CLIP_LIMITS.say), "hu"));
});

const GOAL = "**Cél:** A lecke végére érted a törteket.\n\n**Tipikus buktató:** Összekevered a számlálót a nevezővel.\n\n**Miért?** Mert hasonlítanak.\n\n**Így küzdöd le:** Mindig megnevezed őket.";
const explain = (text: string) => ({ kind: "explain" as const, text, depth: "core" as const, readAloud: true, coversConceptIds: [] });
const TEACH = "A tört a számlálóból és a nevezőből áll. A nevező megmutatja, hány egyenlő részre osztottuk az egészet, a számláló pedig azt, hogy hány részt veszünk.";
const lesson = { sections: [
  { heading: "Mi a tört?", probaEnabled: true, blocks: [explain(GOAL), explain("Bence pizzát rendelt, és nyolc szeletre vágta."), explain(TEACH), { kind: "recap" as const, bullets: ["A nevező a részek száma."] }] },
  { heading: "Rövid", probaEnabled: true, blocks: [explain("Túl rövid.")] },
] };

test("a fejezetszövegből a Célkártya és a mese kimarad; túl rövid fejezet nem kap kisfilmet", () => {
  const source = clipSource(lesson as never, 0)!;
  assert.ok(source.includes("A tört a számlálóból"));
  assert.ok(source.includes("A nevező a részek száma."));
  assert.ok(!source.includes("Cél:") && !source.includes("Bence"), source);
  assert.equal(clipSource(lesson as never, 1), null);
  assert.equal(clipSource(lesson as never, 7), null);
  // Célkártya nélkül az első két blokk is tanítószöveg.
  const plain = { sections: [{ ...lesson.sections[0], blocks: [explain(TEACH), explain("Ez a második magyarázat a törtekről.")] }] };
  assert.ok(clipSource(plain as never, 0)!.includes("második magyarázat"));
});

test("tartalmi kapuk: címkép elöl, nincs új szám, nincs jelölőnyelv vagy webcím", () => {
  const source = "A futó 400 m-t tesz meg, g = 9,8 m/s².";
  const ok = clip([scene(SAY, { kind: "title", emoji: "🏃", text: "Futás" }), scene("A futó négyszáz métert tesz meg a pályán.", { kind: "formula", parts: [{ t: "s = 400 m" }, { t: "g = 9.8" }] }), scene(SAY)]);
  assert.deepEqual(clipContentProblems(ok, source, "1. fejezet"), []);
  assert.match(clipContentProblems(clip([scene(SAY), scene(SAY), scene(SAY)]), source, "x")[0], /title/);
  const invented = clip([ok.scenes[0], scene("A futó ötszáz métert tesz meg, pontosan 500 métert.", { kind: "idea", emoji: "🏃", text: "500 m" }), scene(SAY)]);
  assert.match(clipContentProblems(invented, source, "x").join(" "), /500/);
  assert.deepEqual(clipContentProblems(clip([ok.scenes[0], scene("A második törvény szerint ez így van, figyelj.", { kind: "idea", emoji: "2️⃣", text: "Newton 2. törvénye" }), scene(SAY)]), source, "Newton 2. törvénye"), [], "a fejezetcím száma megengedett");
  for (const bad of ["Ez **félkövér** szöveg a jelenetben, ami tilos.", "Nézd meg itt: https://pelda.hu, mert érdekes.", "Ez <b>HTML</b> jelölés a mondatban, tilos."]) {
    assert.equal(clipContentProblems(clip([ok.scenes[0], scene(bad), scene(SAY)]), source, "x").length, 1, bad);
  }
  assert.ok(clipTexts(ok).includes("s = 400 m"));
});

test("a néma jelenet legalább 2,5 mp, hosszabb mondatnál arányosan több", () => {
  assert.equal(silentSceneMs("rövid"), 2500);
  assert.equal(silentSceneMs("a".repeat(100)), 6500);
});

test("a kézi kisfilmek érvényesek: a Dinamika-lecke mind a 12 fejezete, címképpel indulva", () => {
  const seeds = CLIP_SEEDS["1f04037f-bb51-4929-940e-366337ec04b8"];
  assert.deepEqual(seeds.map((s) => s.sectionIndex), Array.from({ length: 12 }, (_, i) => i));
  for (const [lessonId, list] of Object.entries(CLIP_SEEDS)) for (const seed of list) {
    const parsed = clipSchema.safeParse(seed.clip);
    assert.ok(parsed.success, `${lessonId}/${seed.sectionIndex}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
    assert.equal(seed.clip.scenes[0].visual.kind, "title");
    assert.ok(seed.heading.trim() === seed.heading && seed.heading.length > 0);
    // A kézi kisfilm sem tartalmaz jelölőnyelvet; a számhűséget a valódi leckéhez mérve a gyártáskori ellenőrzés igazolta.
    assert.deepEqual(clipContentProblems(seed.clip, clipTexts(seed.clip).join(" "), seed.heading), []);
    assert.ok(seed.clip.scenes.reduce((n, s) => n + s.say.length, 0) <= 560, `${seed.sectionIndex}: fejezetenként kb. fél perc`);
  }
});

test("a migráció és a Drizzle-séma oszlopai egyeznek", () => {
  const sqlText = readFileSync(new URL("../migrations/0038_lesson_clips.sql", import.meta.url), "utf8");
  const body = sqlText.slice(sqlText.indexOf("CREATE TABLE IF NOT EXISTS lesson_clips"), sqlText.indexOf(");"));
  const inSql = [...body.matchAll(/^\s{2}([a-z_]+)\s+(?:varchar|integer|char|jsonb|timestamp)/gm)].map((m) => m[1]).sort();
  const inDrizzle = Object.values(getTableColumns(lessonClips)).map((c) => c.name).sort();
  assert.deepEqual(inSql, inDrizzle);
  assert.match(sqlText, /CREATE UNIQUE INDEX IF NOT EXISTS lesson_clips_section_unique ON lesson_clips\(lesson_id, section_index\)/);
  assert.match(sqlText, /REFERENCES lessons\(id\) ON DELETE CASCADE/);
});
