import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { lessonSchema } from "../shared/lesson-schema";
import { clipSource, type Clip2 } from "../shared/lesson-clip";
import { CLIP_BAND_STYLE, clipBandFor } from "../shared/clip-style";
import {
  CLIP_FRESH_DAYS, CLIP_MAX_ATTEMPTS, CLIP_ORPHAN_GRACE_MS, CLIP_PARALLEL, CLIP_RSS_LIMIT_BYTES, CLIP_VIDEO_MAX_BYTES, clipDailyLimit, clipMediaBudgetBytes, clipSourceHash, clipSystemPrompt, clipTodo, clipsMode,
  CLIP_SPEECH_ATTEMPTS, ClipAbortError, eligibleSections, lessonClipsResponse, makeChapterClip, runClipRound, servableClips, speakChecked, speechDistance,
  type ClipDeps, type ClipLesson, type ClipRow, type ClipStore,
} from "../server/lesson-clips";
import { mediaId } from "../server/lesson-clip-media";
import { CLIP_TMP_PREFIX, clipKeys, clipProviders, CLIP_RESPONSE_LIMITS, downloadAndShrink, readLimitedText, safeProviderFetch, sweepStaleClipDirs, webBody, type ExecLike, type ProviderTransport } from "../server/lesson-clips-providers";
import type { RawResponse } from "../server/studio/safe-fetch";
import { Readable } from "node:stream";
import { logger } from "../server/lib/logger";
/** Webes válasz → a `safe-fetch` nyers válasza (a csonkolt szállításhoz). */
const toRaw = (res: Response): RawResponse => ({ status: res.status, headers: Object.fromEntries(res.headers), body: (res.body as unknown as AsyncIterable<Uint8Array> | null) ?? (async function* () { /* üres törzs */ })(), destroy: () => { void res.body?.cancel().catch(() => undefined); } });
/** Csonkolt szállítás: nyilvános címre old fel, és a (csonkolt) globális fetch-csel küld — valódi DNS és hálózat nélkül. */
const testTransport: ProviderTransport = {
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  request: async (url, _address, _timeoutMs, signal, headers) => toRaw(await fetch(url, { headers, signal, redirect: "manual" })),
};

import { settleClips } from "../client/src/lesson-runtime/clips/useLessonClips";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// docs/specs/2026-11-10-fejezet-kisfilmek-v2.md — gyártósor, kiszolgálás, plafonok (hálózat és adatbázis nélkül, hamis szolgáltatókkal).

const NOW = new Date("2026-11-10T12:00:00Z");
function twoChapterLesson() {
  const lesson = fusionFixture();
  lesson.sections.push({ ...lesson.sections[0], heading: "Második fejezet" });
  return lessonSchema.parse(lesson);
}
const BAND = clipBandFor(twoChapterLesson().classroom);
const STYLE = CLIP_BAND_STYLE[BAND];
const SAY = "Ez egy elég hosszú, elmondható mondat a jelenethez.";
const draftScene = (i: number) => ({ say: SAY, image: `A clear drawable situation number ${"x".repeat(i + 1)} from the chapter.`, motion: "Something in the picture moves smoothly while the narrator speaks.", alt: "A jelenet képe.", ...(i === 0 ? { overlay: { kind: "title", text: "A kisfilm címe" } } : {}) });
const draft = () => JSON.stringify({ title: "Próba-kisfilm", scenes: Array.from({ length: STYLE.narration.scenes[0] }, (_, i) => draftScene(i)) });
const makeLesson = (id: string, publishedAt: Date | null = new Date(NOW.getTime() - 3_600_000), json: unknown = twoChapterLesson()): ClipLesson => ({ id, publishedAt, json });

function memoryStore(lessons: ClipLesson[], initial: ClipRow[] = []) {
  const rows = [...initial];
  const media = new Map<string, { kind: string; mime: string; size: number }>();
  const today = new Set<string>();
  const store: ClipStore = {
    lesson: async (id) => lessons.find((l) => l.id === id) ?? null,
    freshLessons: async (days) => lessons.filter((l) => l.publishedAt && NOW.getTime() - l.publishedAt.getTime() <= days * 86_400_000).sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime()),
    rows: async (lessonId) => rows.filter((r) => r.lessonId === lessonId),
    upsert: async ({ model: _model, ...row }) => { const i = rows.findIndex((r) => r.lessonId === row.lessonId && r.sectionIndex === row.sectionIndex); if (i >= 0) rows[i] = row; else rows.push(row); today.add(row.lessonId); },
    lessonsToday: async () => [...today],
    putMedia: async (kind, mime, bytes) => { const id = mediaId(bytes); media.set(id, { kind, mime, size: bytes.length }); return id; },
    mediaBytes: async () => [...media.values()].reduce((sum, m) => sum + m.size, 0),
    exclusive: async (work) => work(),
    pruneOrphanMedia: async () => ({ rows: 0, bytes: 0 }),
  };
  return { store, rows, media };
}
type Calls = { chat: string[]; image: string[]; check: number; speech: Array<{ text: string; voice: string }>; video: Array<{ prompt: string; seconds: number }> };
function fakeDeps(over: Partial<ClipDeps> & { answers?: string[]; verdicts?: boolean[] } = {}): ClipDeps & { calls: Calls } {
  const calls: Calls = { chat: [], image: [], check: 0, speech: [], video: [] };
  const answers = over.answers ?? [draft()];
  const verdicts = over.verdicts ?? [true];
  let n = 0;
  const deps: ClipDeps & { calls: Calls } = {
    calls,
    chat: async (_system, user) => { calls.chat.push(user); return answers[Math.min(calls.chat.length - 1, answers.length - 1)]; },
    image: async (prompt) => { calls.image.push(prompt); return { bytes: Buffer.from(`kép-${++n}`), mime: "image/jpeg" }; },
    check: async () => ({ ok: verdicts[Math.min(calls.check++, verdicts.length - 1)], note: "teszt" }),
    still: async (image) => Buffer.concat([Buffer.from("webp:"), image.bytes]),
    speech: async (text, voice) => { calls.speech.push({ text, voice: voice.name }); return Buffer.from(`hang:${text}:${calls.speech.length}`); },
    audioMs: () => 6400,
    video: async (image, prompt, seconds) => { calls.video.push({ prompt, seconds }); return Buffer.concat([Buffer.from("kicsi:"), image.bytes]); },
    ...over,
  };
  return deps;
}
const input = () => { const lesson = twoChapterLesson(); return { title: lesson.title, subject: lesson.subject, classroom: lesson.classroom, heading: lesson.sections[0].heading, source: clipSource(lesson, 0)!, animateIndexes: [] }; };
const OPTS = { dailyLimit: 5, mediaBudgetBytes: 10_000_000, model: "teszt-modell" };

test("kapcsolók: vészfék, gyártás csak kapcsolóval és kulccsal; plafonok alapértéke", () => {
  assert.equal(clipsMode({}), "idle");
  assert.equal(clipsMode({ LESSON_CLIPS_AUTO: "on" }), "idle", "kulcs nélkül nincs gyártás");
  assert.equal(clipsMode({ LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" }), "auto");
  assert.equal(clipsMode({ LESSON_CLIPS_AUTO: "1", OPENROUTER_API_KEY: "k" }), "idle", "csak a pontos \"on\" kapcsol be");
  assert.equal(clipsMode({ LESSON_CLIPS: "0", LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" }), "off");
  assert.equal(clipDailyLimit({}), 2);
  assert.equal(clipDailyLimit({ LESSON_CLIP_DAILY_LIMIT: "7" }), 7);
  assert.equal(clipMediaBudgetBytes({}), 400 * 1024 * 1024);
  assert.equal(clipMediaBudgetBytes({ LESSON_CLIP_MEDIA_MAX_MB: "50" }), 50 * 1024 * 1024);
  assert.equal(clipKeys({}), null);
  assert.deepEqual(clipKeys({ OPENROUTER_API_KEY: " or ", ELEVENLABS_API_KEY: "el", OPENAI_API_KEY: "oa", FFMPEG_PATH: "/opt/ffmpeg" }), { openRouter: "or", openAi: "oa", elevenLabs: "el", ffmpeg: "/opt/ffmpeg" });
  assert.equal(clipKeys({ OPENROUTER_API_KEY: "or" })?.elevenLabs, undefined);
});

test("a forgatókönyvíró utasítása a korosztály profilját viszi: figura, mondathossz, szabályok", () => {
  const young = clipSystemPrompt("adventure"), old = clipSystemPrompt("laboratory");
  assert.ok(young.includes("Legfeljebb 130 karakter") && old.includes("Legfeljebb 200 karakter"));
  assert.ok(young.includes("állandó szereplői") && old.includes("Kabala, rajzfilmfigura nincs"));
  assert.ok(CLIP_BAND_STYLE.adventure.narration.rules.every((rule) => young.includes(rule)));
  assert.ok(!old.includes(CLIP_BAND_STYLE.adventure.narration.rules[0]));
});

test("egy fejezet kisfilmje: jelenetenként kezdőkép, a korosztály hangja, a hang hosszához igazított mozgókép, tárolt média", async () => {
  const { store, media } = memoryStore([]);
  const deps = fakeDeps();
  const result = await makeChapterClip(input(), BAND, deps, store.putMedia);
  assert.ok("clip" in result, JSON.stringify(result));
  const { clip, stats } = result;
  const n = STYLE.narration.scenes[0];
  assert.equal(clip.v, 2);
  assert.equal(clip.band, BAND);
  assert.equal(clip.scenes.length, n);
  assert.deepEqual(clip.scenes.map((s) => s.shot), Array.from({ length: n }, (_, i) => i));
  assert.ok(clip.scenes.every((s) => s.audio && s.video && s.ms === 6400 && s.camera === "still"));
  assert.equal(clip.scenes[0].overlay?.kind, "title");
  assert.deepEqual(stats, { images: n, imageRetries: 0, audio: n, audioRetries: 0, audioImperfect: 0, videos: n, videoFailures: 0, bytes: [...media.values()].reduce((s, m) => s + m.size, 0) });
  assert.deepEqual([...media.values()].map((m) => m.mime).sort(), [...Array(n).fill("audio/mpeg"), ...Array(n).fill("image/webp"), ...Array(n).fill("video/mp4")]);
  // A képbrief viszi a sáv stílusát és a tiltásokat; a hang a sáv hangja; a mozgókép 6,4 mp-es hanghoz 7 mp.
  assert.ok(deps.calls.image.every((p) => p.includes(STYLE.imageStyle) && /no text, letters, digits/i.test(p)));
  assert.ok(deps.calls.speech.every((c) => c.voice === STYLE.voice.name && c.text === SAY));
  // A hangmodell a kiolvasott számot kapja, a kisfilm felirata a számjegyest őrzi.
  const numbered = await speakChecked("A futó 400 métert tesz meg.", STYLE.voice, { speech: async (text) => Buffer.from(text) });
  assert.equal(numbered.bytes.toString(), "A futó négyszáz métert tesz meg.");
  assert.ok(deps.calls.video.every((c) => c.seconds === 7 && c.prompt.includes("Something in the picture moves") && c.prompt.includes("No text")));
});

test("hibás forgatókönyv: egy javító hívás a hibalistával; ha az is bukik, nincs kisfilm és nincs médiaköltés", async () => {
  const repaired = fakeDeps({ answers: ["nem JSON", draft()] });
  assert.ok("clip" in (await makeChapterClip(input(), BAND, repaired, memoryStore([]).store.putMedia)));
  assert.equal(repaired.calls.chat.length, 2);
  assert.match(repaired.calls.chat[1], /Ez nem felelt meg/);
  const invented = JSON.parse(draft()); invented.scenes[1].say = "Ebben a mondatban egy kitalált szám áll: 98765 darab.";
  const stubborn = fakeDeps({ answers: [JSON.stringify(invented)] });
  const failed = await makeChapterClip(input(), BAND, stubborn, memoryStore([]).store.putMedia);
  assert.ok("problems" in failed && /98765/.test(failed.problems.join(" ")), "új szám nem születhet");
  assert.equal(stubborn.calls.image.length, 0, "bukott forgatókönyvre nem készül kép");
});

test("a kezdőkép minőségkapuja: egy újrapróba; kétszeres bukásnál a kisfilm sikertelen", async () => {
  const n = STYLE.narration.scenes[0];
  const retry = fakeDeps({ verdicts: [false, ...Array(2 * n).fill(true)] });
  const ok = await makeChapterClip(input(), BAND, retry, memoryStore([]).store.putMedia);
  assert.ok("clip" in ok && ok.stats.imageRetries === 1 && retry.calls.image.length === n + 1);
  const bad = await makeChapterClip(input(), BAND, fakeDeps({ verdicts: [false] }), memoryStore([]).store.putMedia);
  assert.ok("problems" in bad && /minőségkapun/.test(bad.problems.join(" ")));
});

test("a mozgókép hibája nem buktatja a kisfilmet: a jelenet állóképes, kameramozgással", async () => {
  const cases: Array<[string, Partial<ClipDeps>]> = [
    ["a videószolgáltató hibázik", { video: async () => { throw new Error("HTTP 500"); } }],
    ["nincs ffmpeg", { video: async () => null }],
    ["az átkódolt klip túl nagy", { video: async () => Buffer.alloc(CLIP_VIDEO_MAX_BYTES + 1) }],
  ];
  for (const [name, over] of cases) {
    const { store, media } = memoryStore([]);
    const result = await makeChapterClip(input(), BAND, fakeDeps(over), store.putMedia);
    assert.ok("clip" in result, name);
    assert.ok(result.clip.scenes.every((s) => !s.video && s.audio && s.camera !== "still"), name);
    assert.equal(result.stats.videos, 0, name);
    assert.ok(![...media.values()].some((m) => m.kind === "video"), `${name}: nyers vagy túl nagy mozgókép nem tárolódik`);
  }
  // Kulcs nélkül (nincs hang- és videószolgáltató) is kész kisfilm: tartalék hang, állókép.
  const bare = fakeDeps(); delete bare.speech; delete bare.video;
  const plain = await makeChapterClip(input(), BAND, bare, memoryStore([]).store.putMedia);
  assert.ok("clip" in plain && plain.clip.scenes.every((s) => !s.audio && !s.video && s.ms === undefined));
  // A hangszolgáltató hibája: a jelenet hang nélkül, de mozgóképpel készül el.
  const mute = await makeChapterClip(input(), BAND, fakeDeps({ speech: async () => { throw new Error("HTTP 401"); } }), memoryStore([]).store.putMedia);
  assert.ok("clip" in mute && mute.clip.scenes.every((s) => !s.audio && s.video));
});

test("hangkapu: a félreolvasott mondat újra készül; a betűre egyező marad, különben a legpontosabb", async () => {
  // Az ékezethiba hiba (mért eset: „síkság” helyett „síkség”); írásjel, szóköz, kis- és nagybetű nem számít.
  assert.equal(speechDistance("Szabály: a síkság vízszintes.", "szabály a síkság vízszintes"), 0);
  assert.equal(speechDistance("százhúsz méter", "Száz húsz méter!"), 0);
  // A felismerő a kimondott számot számjeggyel adja vissza — ez nem eltérés; a rossz szám igen.
  assert.equal(speechDistance("A magassága 0 és 200 méter között van.", "A magassága nulla és kétszáz méter között van"), 0);
  assert.equal(speechDistance("nulla és kétszáz méter között", "0 és 200 méter között"), 0);
  assert.ok(speechDistance("nulla és kétszáz méter között", "0 és 2000 méter között") > 0);
  assert.equal(speechDistance("a síkság vízszintes", "a síkség vízszintes"), 1);
  assert.ok(speechDistance("Szabály: a síkság vízszintes", "A széksek vízszintes") > 5);
  const voice = STYLE.voice;
  const heardFor = (script: string[]) => { let n = 0; const made: Buffer[] = []; return { made, speech: async () => { const b = Buffer.from(`változat-${made.length + 1}`); made.push(b); return b; }, hear: async () => script[Math.min(n++, script.length - 1)] }; };
  const SENT = "A síkság vízszintes, belátható sík terület.";
  const fixed = heardFor(["A síkség vízszintes, belátható sík terület.", SENT]);
  const second = await speakChecked(SENT, voice, fixed);
  assert.deepEqual([second.attempts, second.distance, second.bytes.toString()], [2, 0, "változat-2"], "a második, hibátlan változat marad");
  const never = heardFor(["A széksek vízszintes belátható terület", "A síkség vízszintes, belátható sík terület.", "A sikseg vizszintes belathato sik terulet"]);
  const best = await speakChecked(SENT, voice, never);
  assert.deepEqual([best.attempts, best.distance, best.bytes.toString()], [CLIP_SPEECH_ATTEMPTS, 1, "változat-2"], "három próbálkozás után a legpontosabb marad");
  assert.equal(never.made.length, CLIP_SPEECH_ATTEMPTS);
  // Felismerő nélkül (vagy ha az hibázik) a hang ellenőrzés nélkül megy tovább — a kisfilm nem akad el.
  const blind = await speakChecked(SENT, voice, { speech: async () => Buffer.from("x") });
  assert.deepEqual([blind.attempts, blind.distance], [1, null]);
  const broken = await speakChecked(SENT, voice, { speech: async () => Buffer.from("x"), hear: async () => { throw new Error("HTTP 500"); } });
  assert.deepEqual([broken.attempts, broken.distance], [1, null]);
  // A gyártósorban: a pontatlan hang számolódik és naplózódik.
  let heard = 0;
  const flaky = await makeChapterClip(input(), BAND, fakeDeps({ hear: async () => (heard++ === 0 ? "valami egészen más" : SAY) }), memoryStore([]).store.putMedia);
  assert.ok("clip" in flaky && flaky.stats.audioRetries === 1 && flaky.stats.audioImperfect === 0);
});

test("a kiszolgálás csak a kész, v2, a fejezet mostani címéhez és szövegéhez illő kisfilmet adja ki", async () => {
  const lesson = twoChapterLesson();
  const [first] = eligibleSections(lesson);
  const made = await makeChapterClip(input(), BAND, fakeDeps(), memoryStore([]).store.putMedia);
  assert.ok("clip" in made);
  const row = (over: Partial<ClipRow>): ClipRow => ({ lessonId: "l", sectionIndex: 0, heading: first.heading, sourceHash: first.hash, status: "ready", clip: made.clip, attempts: 1, ...over });
  assert.deepEqual(servableClips(lesson, [row({})]).map((c) => c.sectionIndex), [0]);
  assert.deepEqual(servableClips(lesson, [row({ status: "failed", clip: null })]), []);
  assert.deepEqual(servableClips(lesson, [row({ heading: "Régi cím" })]), []);
  assert.deepEqual(servableClips(lesson, [row({ sourceHash: clipSourceHash("régi szöveg") })]), []);
  assert.deepEqual(servableClips(lesson, [row({ sourceHash: null })]), [], "lenyomat nélküli (régi kézi) sor nem megy ki");
  assert.deepEqual(servableClips(lesson, [row({ clip: { v: 1, title: "régi", scenes: [] } })]), [], "a régi (v1) kisfilm nem megy ki");
  assert.deepEqual(servableClips(lesson, [row({ sectionIndex: 9 })]), []);
  // Egy tárolt, de már érvénytelen (v1) kész sor újragyártandó.
  assert.deepEqual(clipTodo(lesson, [row({ clip: { v: 1 } })]).map((t) => t.sectionIndex), [0, 1]);
});

test("háttérkör: a friss lecke minden fejezete kisfilmet kap; a végpont kiadja; a következő kör nem gyárt újra", async () => {
  const { store, rows } = memoryStore([makeLesson("pub"), makeLesson("draft", null), makeLesson("old", new Date(NOW.getTime() - (CLIP_FRESH_DAYS + 1) * 86_400_000))]);
  assert.deepEqual(await lessonClipsResponse(store, "pub", "auto", NOW), { clips: [], pending: true });
  assert.equal(await lessonClipsResponse(store, "draft", "auto", NOW), null);
  assert.equal(await lessonClipsResponse(store, "nincs", "auto", NOW), null);
  assert.deepEqual(await lessonClipsResponse(store, "pub", "off", NOW), { clips: [], pending: false });
  assert.deepEqual(await lessonClipsResponse(store, "pub", "idle", NOW), { clips: [], pending: false }, "gyártás nélkül nincs mire várni");
  assert.deepEqual(await lessonClipsResponse(store, "old", "auto", NOW), { clips: [], pending: false });
  const deps = fakeDeps();
  const report = await runClipRound(store, deps, "auto", OPTS);
  assert.deepEqual(report, { made: 2, failed: 0, lessons: 1, videos: 2 * STYLE.narration.scenes[0], stoppedByBudget: false, stoppedByMemory: false });
  assert.deepEqual(rows.map((r) => [r.lessonId, r.sectionIndex, r.status, r.attempts]), [["pub", 0, "ready", 1], ["pub", 1, "ready", 1]]);
  const served = await lessonClipsResponse(store, "pub", "auto", NOW);
  assert.deepEqual(served!.clips.map((c) => [c.sectionIndex, (c.clip as Clip2).v]), [[0, 2], [1, 2]]);
  assert.equal(served!.pending, false);
  const chats = deps.calls.chat.length;
  assert.deepEqual(await runClipRound(store, deps, "auto", OPTS), { made: 0, failed: 0, lessons: 0, videos: 0, stoppedByBudget: false, stoppedByMemory: false });
  assert.equal(deps.calls.chat.length, chats);
  assert.equal(await runClipRound(store, deps, "idle", OPTS), null);
  assert.equal(await runClipRound(store, deps, "off", OPTS), null);
});

test("sikertelen fejezet legfeljebb két körben próbálkozik; a megváltozott fejezet újragyártandó", async () => {
  const { store, rows } = memoryStore([makeLesson("pub")]);
  const bad = fakeDeps({ answers: ["{}"] });
  assert.deepEqual(await runClipRound(store, bad, "auto", OPTS), { made: 0, failed: 2, lessons: 1, videos: 0, stoppedByBudget: false, stoppedByMemory: false });
  assert.equal((await lessonClipsResponse(store, "pub", "auto", NOW))!.pending, true, "van még próbálkozás");
  await runClipRound(store, bad, "auto", OPTS);
  assert.deepEqual(rows.map((r) => [r.status, r.attempts]), [["failed", CLIP_MAX_ATTEMPTS], ["failed", CLIP_MAX_ATTEMPTS]]);
  assert.equal((await lessonClipsResponse(store, "pub", "auto", NOW))!.pending, false, "végleg sikertelen: a kliens nem kérdez tovább");
  const chats = bad.calls.chat.length;
  await runClipRound(store, bad, "auto", OPTS);
  assert.equal(bad.calls.chat.length, chats, "a harmadik körben nincs több hívás");
  const changed = twoChapterLesson();
  const block = changed.sections[1].blocks.find((b) => b.kind === "explain")!;
  if (block.kind === "explain") block.text += " Ez egy új mondat a fejezet végén.";
  assert.deepEqual(clipTodo(changed, rows).map((t) => [t.sectionIndex, t.attempts]), [[1, 0]]);
});

test("memóriaőr és terhelés: egyszerre egy fejezet készül; túl nagy memóriafoglalásnál a kör kimarad", async () => {
  assert.equal(CLIP_PARALLEL, 1, "élesben mérve: két párhuzamos fejezet betöltötte az 512 MB-os példány memóriáját");
  const { store, rows } = memoryStore([makeLesson("pub")]);
  const deps = fakeDeps();
  assert.equal(await runClipRound(store, deps, "auto", { ...OPTS, rss: () => CLIP_RSS_LIMIT_BYTES + 1 }), null);
  assert.equal(deps.calls.chat.length, 0, "a kimaradt kör semmit sem hív és semmit sem költ");
  assert.equal(rows.length, 0);
  let active = 0, peak = 0;
  const slow = fakeDeps({ chat: async () => { peak = Math.max(peak, ++active); await new Promise((r) => setTimeout(r, 5)); active--; return draft(); } });
  assert.equal((await runClipRound(store, slow, "auto", { ...OPTS, rss: () => CLIP_RSS_LIMIT_BYTES - 1 }))!.made, 2);
  assert.equal(peak, 1, "a fejezetek egymás után készülnek");
});

test("memóriaőr fejezetenként: ha a kör közben nő a memória, a következő fejezet már nem indul (review M2)", async () => {
  const { store, rows } = memoryStore([makeLesson("pub")]);
  const deps = fakeDeps();
  let measured = 0;
  const report = await runClipRound(store, deps, "auto", { ...OPTS, rss: () => (++measured <= 2 ? CLIP_RSS_LIMIT_BYTES - 1 : CLIP_RSS_LIMIT_BYTES + 1) });
  assert.equal(report!.made, 1, "az első fejezet elkészül, a második előtt az őr megállítja a kört");
  assert.equal(report!.stoppedByMemory, true);
  assert.equal(rows.length, 1, "a kimaradt fejezet nem kap hibás sort (a következő kör újra próbálja)");
});

test("átkódolás: hibás letöltésnél null, a hibás válasz törzse lezárul, átkódolás nem indul (review L3; vak kör L11)", async () => {
  let cancelled = false, executed = 0;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const exec: ExecLike = (_file, _args, _options, callback) => { executed++; queueMicrotask(() => callback(null)); return { kill: () => true }; };
  assert.equal(await downloadAndShrink(async () => new Response(body, { status: 500 }), "ffmpeg", 90_000, { exec }), null);
  assert.equal(cancelled, true, "a hibás válasz törzse lezárul");
  assert.equal(executed, 0, "hibás letöltés után nincs átkódolás");
});

/** Csonkolt átkódoló: rögzíti a hívást, a kimenetet a megadott tartalommal írja (vagy hibával tér vissza). */
function fakeExec(behave: (args: string[], options: { timeout: number; killSignal: NodeJS.Signals }) => { out?: Buffer; error?: Error; hang?: boolean }) {
  const calls: Array<{ args: string[]; options: { timeout: number; killSignal: NodeJS.Signals }; workdir: string }> = [];
  const killed: Array<NodeJS.Signals | undefined> = [];
  const exec: ExecLike = (_file, args, options, callback) => {
    const output = args.at(-1)!;
    calls.push({ args, options, workdir: path.dirname(output) });
    const plan = behave(args, options);
    let done = false;
    const finish = (error: Error | null) => { if (!done) { done = true; callback(error); } };
    if (!plan.hang) queueMicrotask(() => { if (plan.out) writeFileSync(output, plan.out); finish(plan.error ?? null); });
    return { kill: (signal?: NodeJS.Signals) => { killed.push(signal); finish(Object.assign(new Error("killed"), { killed: true, signal })); return true; } };
  };
  return { exec, calls, killed };
}

test("átkódolás: az időkorlát SIGKILL-lel él, a munkamappa hiba és siker után is eltűnik (vak kör L11)", async () => {
  const ok = fakeExec(() => ({ out: Buffer.from("kicsi mp4") }));
  const small = await downloadAndShrink(async () => new Response(new Uint8Array([1, 2, 3])), "ffmpeg", 1234, { exec: ok.exec });
  assert.equal(small?.toString(), "kicsi mp4");
  assert.deepEqual(ok.calls.map((c) => [c.options.timeout, c.options.killSignal]), [[1234, "SIGKILL"]]);
  assert.ok(path.basename(ok.calls[0].workdir).startsWith(CLIP_TMP_PREFIX));
  assert.equal(existsSync(ok.calls[0].workdir), false, "sikeres átkódolás után a munkamappa törlődik");
  const timedOut = fakeExec(() => ({ error: Object.assign(new Error("időtúllépés"), { killed: true, signal: "SIGKILL" }) }));
  assert.equal(await downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 300, { exec: timedOut.exec }), null);
  assert.equal(existsSync(timedOut.calls[0].workdir), false, "az időkorláttal megölt átkódolás után is törlődik");
});

test("átkódolás POSIX-on valódi gyerekkel: a SIGTERM-et figyelmen kívül hagyó ffmpeg elindul, az időkorlát megöli, a munkamappa eltűnik (review L1; vak kör L11; 4. vak kör L4)", { timeout: 30_000, skip: process.platform === "win32" ? "az ál-ffmpeg POSIX-héjszkript; a Windows-ágat a csonkolt átkódolós teszt fedi" : false }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fake-ffmpeg-"));
  const stubborn = path.join(dir, "ffmpeg"), marker = path.join(dir, "elindult");
  // Az utolsó argumentum a kimenet útvonala: a jelzőfájlba írva igazolja az indulást és megadja a munkamappát.
  // A jelzőfájl a `trap` UTÁN készül: ha megvan, a gyerek már a SIGTERM-et figyelmen kívül hagyó állapotban volt (4. vak kör L4).
  writeFileSync(stubborn, `#!/bin/sh\ntrap '' TERM\nfor a; do last="$a"; done\necho "$last" > "${marker}"\nexec sleep 30\n`);
  chmodSync(stubborn, 0o755);
  const started = Date.now();
  // 2 s-os időkorlát: terhelt CI-n is bőven elindul a gyerek és beállítja a `trap`-et; a 30 s-os alvásnál jóval előbb kell végeznie.
  assert.equal(await downloadAndShrink(async () => new Response(new Uint8Array([1, 2, 3])), stubborn, 2000, { rss: () => 0 }), null);
  assert.ok(Date.now() - started < 15_000, `a beakadt átkódolás nem tartja fel a sort (${Date.now() - started} ms)`);
  assert.ok(existsSync(marker), "az ál-ffmpeg ténylegesen elindult");
  assert.equal(existsSync(path.dirname(readFileSync(marker, "utf8").trim())), false, "a munkamappa törlődött");
  rmSync(dir, { recursive: true, force: true });
});

test("átkódolás: a sorból kivételkor újramér — memóriahatár fölött nem indul ffmpeg (vak kör L3)", async () => {
  const run = fakeExec(() => ({ out: Buffer.from("x") }));
  assert.equal(await downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 90_000, { exec: run.exec, rss: () => CLIP_RSS_LIMIT_BYTES + 1 }), null);
  assert.equal(run.calls.length, 0, "a határ fölött az átkódolás kimarad, a jelenet állóképes");
  assert.ok((await downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 90_000, { exec: run.exec, rss: () => CLIP_RSS_LIMIT_BYTES - 1 })));
  assert.equal(run.calls.length, 1);
});

test("átkódolás: kemény bájtkorlát a letöltésen, a túlméretes vagy üres kimenet beolvasás nélkül elvetve (vak kör L4)", async () => {
  let pulled = 0;
  const endless = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; controller.enqueue(new Uint8Array(64 * 1024)); } });
  const never = fakeExec(() => ({ out: Buffer.from("x") }));
  assert.equal(await downloadAndShrink(async () => new Response(endless), "ffmpeg", 90_000, { exec: never.exec, rawMaxBytes: 200_000 }), null);
  assert.equal(never.calls.length, 0, "a túl nagy nyers klip nem kerül átkódolásra");
  assert.ok(pulled <= 8, `a letöltés a korlátnál megáll (${pulled} darab)`);
  const declared = fakeExec(() => ({ out: Buffer.from("x") }));
  assert.equal(await downloadAndShrink(async () => new Response(new Uint8Array(10), { headers: { "content-length": "999999999" } }), "ffmpeg", 90_000, { exec: declared.exec, rawMaxBytes: 200_000 }), null, "a bejelentett túl nagy méret el sem kezdődik");
  assert.equal(declared.calls.length, 0);
  const huge = fakeExec(() => ({ out: Buffer.alloc(CLIP_VIDEO_MAX_BYTES + 1) }));
  assert.equal(await downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 90_000, { exec: huge.exec }), null, "túlméretes kimenet");
  const empty = fakeExec(() => ({ out: Buffer.alloc(0) }));
  assert.equal(await downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 90_000, { exec: empty.exec }), null, "üres kimenet");
});

test("induláskor a régi, saját kisfilm-munkamappák törlődnek, a friss és az idegen mappák maradnak (vak kör L5)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sweep-"));
  const now = Date.now();
  const old = path.join(root, `${CLIP_TMP_PREFIX}regi`), fresh = path.join(root, `${CLIP_TMP_PREFIX}friss`), foreign = path.join(root, "clip-idegen");
  for (const dir of [old, fresh, foreign]) { mkdirSync(dir); writeFileSync(path.join(dir, "in.mp4"), "x"); }
  const past = new Date(now - 3 * 3_600_000);
  utimesSync(old, past, past); utimesSync(foreign, past, past);
  assert.equal(sweepStaleClipDirs(root, now), 1);
  assert.deepEqual([existsSync(old), existsSync(fresh), existsSync(foreign)], [false, true, true]);
  rmSync(root, { recursive: true, force: true });
});

test("képhiba után a testvérjelenetek leállnak és lezárulnak, mielőtt a következő fejezet indul; árva média nem keletkezik (vak kör L1)", async () => {
  const n = STYLE.narration.scenes[0];
  assert.ok(n >= 3, "a próba legalább három jelenetet feltételez");
  const { store, rows, media } = memoryStore([makeLesson("pub")]);
  let release!: () => void;
  const slow = new Promise<void>((resolve) => { release = resolve; });
  let imageCalls = 0;
  const deps = fakeDeps({
    image: async (prompt) => {
      const i = imageCalls++;
      deps.calls.image.push(prompt);
      if (i === 0) throw new Error("kép: HTTP 502");
      if (i === 1) await slow;
      return { bytes: Buffer.from(`kép-${i}`), mime: "image/jpeg" };
    },
  });
  const round = runClipRound(store, deps, "auto", OPTS);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(deps.calls.chat.length, 1, "a lassú testvér lezárulásáig a második fejezet forgatókönyve sem indul");
  release();
  const report = await round;
  assert.deepEqual([report!.made, report!.failed], [1, 1]);
  assert.deepEqual(rows.map((r) => [r.sectionIndex, r.status]), [[0, "failed"], [1, "ready"]]);
  // Csak a sikeres (második) fejezet médiája tárolódik: jelenetenként kép, hang, mozgókép.
  assert.equal(media.size, 3 * n, "a sikertelen fejezet testvérjelenetei nem írnak médiát");
  assert.equal(deps.calls.speech.length, n, "a sikertelen fejezet testvérjelenetei nem kérnek hangot");
  assert.equal(deps.calls.video.length, n, "és mozgóképet sem");
});

test("leállításkor nem indul új fejezet, és a megszakított fejezet nem kap hibás sort (vak kör L5)", async () => {
  const { store, rows } = memoryStore([makeLesson("pub")]);
  let stopping = false;
  const deps = fakeDeps({ video: async () => { stopping = true; throw new ClipAbortError(); } });
  const report = await runClipRound(store, deps, "auto", { ...OPTS, shouldStop: () => stopping });
  assert.deepEqual([report!.made, report!.failed], [0, 0]);
  assert.equal(rows.length, 0, "a megszakított fejezet a következő indulás után újra próbálkozik (nem ég el próbálkozás)");
  assert.equal(deps.calls.chat.length, 1, "a második fejezet nem indult");
});

test("plafonok: a túlcsorduló számszöveg nem kapcsolja ki a napi és a tárplafont (vak kör L9)", () => {
  const huge = "9".repeat(309);
  assert.equal(clipDailyLimit({ LESSON_CLIP_DAILY_LIMIT: huge }), 2);
  assert.equal(clipMediaBudgetBytes({ LESSON_CLIP_MEDIA_MAX_MB: huge }), 400 * 1024 * 1024);
  assert.equal(clipMediaBudgetBytes({ LESSON_CLIP_MEDIA_MAX_MB: String(2 ** 53) }), 400 * 1024 * 1024, "a bájtra váltott érték is biztonságos egész");
  assert.equal(clipDailyLimit({ LESSON_CLIP_DAILY_LIMIT: "12" }), 12);
});

test("a lejárt várakozás után a „Készülnek a kisfilmek…” jelzés eltűnik (vak kör L7)", () => {
  const next = { clips: new Map(), pending: true };
  assert.deepEqual(settleClips(next, 1000), { state: next, poll: true });
  const expired = settleClips(next, 30 * 60_000 + 1);
  assert.equal(expired.poll, false);
  assert.equal(expired.state.pending, false, "a kliens már nem kérdez, a jelzés nem maradhat kint");
  assert.deepEqual(settleClips({ clips: new Map(), pending: false }, 10), { state: { clips: new Map(), pending: false }, poll: false });
});

test("szolgáltatói címek: hitelesítés csak a szolgáltató HTTPS-originjére megy (vak kör L8)", async () => {
  const realFetch = globalThis.fetch;
  const seen: Array<{ url: string; auth: string | null }> = [];
  const reply = (job: unknown) => async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ url, auth: new Headers(init?.headers).get("authorization") });
    if (url.endsWith("/api/v1/videos")) return new Response(JSON.stringify(job), { status: 200 });
    return new Response("nincs", { status: 404 });
  };
  const image = { bytes: Buffer.from("x"), mime: "image/jpeg" };
  try {
    const deps = clipProviders({ openRouter: "titok" }, testTransport);
    globalThis.fetch = reply({ status: "completed", polling_url: "https://evil.example/poll", unsigned_urls: ["https://evil.example/v.mp4"] }) as typeof fetch;
    await assert.rejects(deps.video!(image, "p", 5), /lekérdezési cím/);
    assert.ok(!seen.some((s) => s.url.startsWith("https://evil.example")), "idegen lekérdezési címre semmi nem megy");
    seen.length = 0;
    globalThis.fetch = reply({ status: "completed", polling_url: "/api/v1/videos/1", unsigned_urls: ["https://cdn.example/v.mp4"] }) as typeof fetch;
    assert.equal(await deps.video!(image, "p", 5), null);
    assert.deepEqual(seen.filter((s) => s.url.startsWith("https://cdn.example")).map((s) => s.auth), [null], "idegen letöltési címre kulcs nélkül");
    seen.length = 0;
    globalThis.fetch = reply({ status: "completed", polling_url: "/api/v1/videos/1", unsigned_urls: ["http://cdn.example/v.mp4"] }) as typeof fetch;
    await assert.rejects(deps.video!(image, "p", 5), /letöltési cím/);
    assert.ok(!seen.some((s) => s.url.startsWith("http://cdn.example")), "titkosítatlan címre semmi nem megy");
    seen.length = 0;
    globalThis.fetch = reply({ status: "completed", polling_url: "/api/v1/videos/1", unsigned_urls: ["/api/v1/videos/1/content"] }) as typeof fetch;
    assert.equal(await deps.video!(image, "p", 5), null);
    assert.deepEqual(seen.filter((s) => s.url.endsWith("/content")).map((s) => s.auth), ["Bearer titok"], "a szolgáltató saját címére a kulccsal");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("napi plafon és tárkeret: a plafon fölötti lecke kimarad, betelt tárnál a gyártás megáll", async () => {
  const lessons = [makeLesson("b", new Date(NOW.getTime() - 7_200_000)), makeLesson("a")];
  const capped = memoryStore(lessons);
  assert.deepEqual((await runClipRound(capped.store, fakeDeps(), "auto", { ...OPTS, dailyLimit: 1 }))!.lessons, 1);
  assert.deepEqual([...new Set(capped.rows.map((r) => r.lessonId))], ["a"], "a legfrissebb lecke kap gyártást");
  const full = memoryStore(lessons);
  const report = await runClipRound(full.store, fakeDeps(), "auto", { ...OPTS, mediaBudgetBytes: 1 });
  // Az első fejezet még a keret alatt indul; utána a tár betelt, és a gyártás megáll.
  assert.equal(report!.stoppedByBudget, true);
  assert.equal(report!.made, 1);
  assert.deepEqual([...new Set(full.rows.map((r) => r.lessonId))], ["a"]);
});

test("a kör a zár alatt, a fejezetek előtt egyszer söpri az árva médiát a türelmi idővel (2. vak kör L6)", async () => {
  const { store } = memoryStore([makeLesson("pub")]);
  const events: string[] = [];
  const traced: ClipStore = { ...store, exclusive: async (work) => { events.push("zár"); return work(); }, pruneOrphanMedia: async (graceMs) => { events.push(`söprés:${graceMs}`); return { rows: 0, bytes: 0 }; } };
  const deps = fakeDeps({ chat: async () => { events.push("fejezet"); return draft(); } });
  await runClipRound(traced, deps, "auto", OPTS);
  assert.deepEqual(events, ["zár", `söprés:${CLIP_ORPHAN_GRACE_MS}`, "fejezet", "fejezet"]);
  assert.ok(CLIP_ORPHAN_GRACE_MS >= 6 * 3_600_000, "a türelmi idő sokszorosa egy fejezet gyártási idejének");
});

test("leállításkor a megszakítás miatt sikertelen fejezet sem kap hibás sort (2. vak kör L2)", async () => {
  const { store, rows } = memoryStore([makeLesson("pub")]);
  let stopping = false;
  // Az elvágott szolgáltatói kérés (pl. a kép) a leállítás alatt hibát ad — ez nem a fejezet valódi hibája.
  const deps = fakeDeps({ image: async () => { stopping = true; throw new Error("This operation was aborted"); } });
  const report = await runClipRound(store, deps, "auto", { ...OPTS, shouldStop: () => stopping });
  assert.deepEqual([report!.made, report!.failed, rows.length], [0, 0, 0]);
});

/** Egy nem futó folyamat azonosítója (a `process.kill(pid, 0)` ESRCH-t ad). */
function deadPid(): number {
  for (let pid = 4_194_301; pid > 100_000; pid -= 7) {
    try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return pid; }
  }
  throw new Error("nincs szabad folyamatazonosító");
}

test("munkamappa-söprés: a saját régi és a halott folyamat mappája törlődik, az élő folyamaté és a futó átkódolásé marad (2. vak kör L3)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sweep2-"));
  const now = Date.now(), old = new Date(now - 5 * 60_000);
  const make = (name: string, age = old) => { const dir = path.join(root, name); mkdirSync(dir); utimesSync(dir, age, age); return dir; };
  const ownStale = make(`${CLIP_TMP_PREFIX}${process.pid}-a`), dead = make(`${CLIP_TMP_PREFIX}${deadPid()}-b`);
  const alive = make(`${CLIP_TMP_PREFIX}${process.ppid}-c`), ownFresh = make(`${CLIP_TMP_PREFIX}${process.pid}-d`, new Date(now));
  assert.equal(sweepStaleClipDirs(root, now), 2);
  assert.deepEqual([ownStale, dead, alive, ownFresh].map((d) => existsSync(d)), [false, false, true, true]);
  rmSync(root, { recursive: true, force: true });
  // A futó átkódolás saját mappája akkor is marad, ha régi.
  let finish!: () => void;
  let workdir = "";
  const exec: ExecLike = (_file, args, _options, callback) => { workdir = path.dirname(args.at(-1)!); finish = () => callback(new Error("vége")); return { kill: () => true }; };
  const running = downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 90_000, { exec, rss: () => 0 });
  while (!workdir) await new Promise((r) => setTimeout(r, 1));
  assert.ok(path.basename(workdir).startsWith(`${CLIP_TMP_PREFIX}${process.pid}-`), "a munkamappa neve a folyamat azonosítóját viszi");
  utimesSync(workdir, old, old);
  sweepStaleClipDirs(tmpdir(), now);
  assert.equal(existsSync(workdir), true, "a futó átkódolás mappája nem törlődik");
  finish();
  assert.equal(await running, null);
  assert.equal(existsSync(workdir), false);
});

test("átirányítás: minden lépés csak HTTPS, a kulcs csak a szolgáltató originjére megy, a lekérdezés nem hagyhatja el a szolgáltatót (2. vak kör L7)", async () => {
  const realFetch = globalThis.fetch;
  const seen: Array<{ url: string; auth: string | null; redirect?: RequestRedirect }> = [];
  const routes: Record<string, () => Response> = {
    "https://cdn.example/a": () => new Response(null, { status: 302, headers: { location: "http://cdn.example/b" } }),
    "https://openrouter.ai/api/v1/videos/1/content": () => new Response(null, { status: 302, headers: { location: "https://cdn.example/c" } }),
    "https://cdn.example/c": () => new Response("mp4", { status: 200 }),
    "https://openrouter.ai/api/v1/videos/1": () => new Response(null, { status: 307, headers: { location: "https://evil.example/poll" } }),
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ url, auth: new Headers(init?.headers).get("authorization"), redirect: init?.redirect });
    return (routes[url] ?? (() => new Response("nincs", { status: 404 })))();
  }) as typeof fetch;
  const auth = { Authorization: "Bearer titok" };
  try {
    await assert.rejects(safeProviderFetch(new URL("https://cdn.example/a"), { headers: {} }, { sameOrigin: false, transport: testTransport }), /BAD_URL/);
    assert.ok(!seen.some((s) => s.url.startsWith("http:")), "titkosítatlan címre nem megy kérés");
    seen.length = 0;
    const res = await safeProviderFetch(new URL("https://openrouter.ai/api/v1/videos/1/content"), { headers: auth }, { sameOrigin: false, transport: testTransport });
    assert.equal(await res.text(), "mp4");
    assert.deepEqual(seen.map((s) => [s.url, s.auth]), [["https://openrouter.ai/api/v1/videos/1/content", "Bearer titok"], ["https://cdn.example/c", null]], "idegen célra kulcs nélkül");
    assert.ok(seen.every((s) => s.redirect === "manual"), "az átirányítást a kód követi, nem a fetch");
    seen.length = 0;
    await assert.rejects(safeProviderFetch(new URL("https://openrouter.ai/api/v1/videos/1"), { headers: auth }, { sameOrigin: true, transport: testTransport }), /FORBIDDEN_TARGET/);
    assert.ok(!seen.some((s) => s.url.startsWith("https://evil.example")), "a lekérdezés nem megy idegen originre");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("SSRF: belső IP-re, belső címre feloldódó gépnévre, nem alapértelmezett portra — átirányításon át sem — nem megy kérés; a kapcsolat az ellenőrzött címhez rögzített (Copilot 4655721837)", async () => {
  const sent: Array<{ url: string; address: string }> = [];
  const dnsTable: Record<string, string[]> = { "cdn.example": ["93.184.216.34"], "belso.example": ["10.0.0.5"], "vegyes.example": ["93.184.216.34", "127.0.0.1"], "openrouter.ai": ["104.18.2.115"] };
  const redirects: Record<string, string> = { "https://cdn.example/atiranyit": "https://belso.example/titok", "https://cdn.example/meta": "https://169.254.169.254/latest/meta-data" };
  const transport: ProviderTransport = {
    lookup: async (host) => (dnsTable[host] ?? []).map((address) => ({ address, family: 4 })),
    request: async (url, address) => {
      sent.push({ url: url.href, address: address.address });
      const location = redirects[url.href];
      return toRaw(location ? new Response(null, { status: 302, headers: { location } }) : new Response("mp4", { status: 200 }));
    },
  };
  const get = (raw: string) => safeProviderFetch(new URL(raw), { headers: {} }, { sameOrigin: false, transport });
  for (const raw of ["https://10.0.0.5/v.mp4", "https://[::1]/v.mp4", "https://169.254.169.254/latest", "https://localhost/v.mp4", "https://cdn.example:8443/v.mp4", "https://belso.example/v.mp4", "https://vegyes.example/v.mp4", "https://ismeretlen.example/v.mp4"]) {
    await assert.rejects(get(raw), Error, raw);
  }
  assert.equal(sent.length, 0, "tiltott célra egyetlen kérés sem indult");
  await assert.rejects(get("https://cdn.example/atiranyit"));
  await assert.rejects(get("https://cdn.example/meta"));
  assert.deepEqual(sent.map((s) => s.url), ["https://cdn.example/atiranyit", "https://cdn.example/meta"], "az átirányítás belső célja nem kapott kérést");
  sent.length = 0;
  assert.equal(await (await get("https://cdn.example/v.mp4")).text(), "mp4");
  assert.deepEqual(sent, [{ url: "https://cdn.example/v.mp4", address: "93.184.216.34" }], "a kérés az ellenőrzött címre megy");
});

test("testvérjelenet hibája után a futó jelenet hangkapuja és újabb hangkérése nem indul (Copilot 4655721937)", async () => {
  const n = STYLE.narration.scenes[0];
  let failImage!: () => void, releaseSpeech!: () => void;
  const imageGate = new Promise<void>((resolve) => { failImage = resolve; });
  const speechGate = new Promise<void>((resolve) => { releaseSpeech = resolve; });
  let imageCalls = 0, hearCalls = 0;
  const deps = fakeDeps({
    image: async () => { const i = imageCalls++; if (i === 0) { await imageGate; throw new Error("kép: HTTP 502"); } return { bytes: Buffer.from(`kép-${i}`), mime: "image/jpeg" }; },
    speech: async (text, voice) => { deps.calls.speech.push({ text, voice: voice.name }); await speechGate; return Buffer.from(`hang-${deps.calls.speech.length}`); },
    hear: async () => { hearCalls++; return SAY; },
  });
  const result = makeChapterClip(input(), BAND, deps, memoryStore([]).store.putMedia);
  while (deps.calls.speech.length < n - 1) await new Promise((r) => setTimeout(r, 1));
  const speechBefore = deps.calls.speech.length;
  failImage();
  await new Promise((r) => setTimeout(r, 10));
  releaseSpeech();
  const out = await result;
  assert.ok("problems" in out && /502/.test(out.problems.join(" ")));
  assert.equal(hearCalls, 0, "a hiba után nincs hangkapu-hívás");
  assert.equal(deps.calls.speech.length, speechBefore, "a hiba után nincs újabb hangkérés");
});

test("a HTTP-adapter választeste bájtalapú, kis sorral jön: lassú fogyasztónál a memóriában pufferelt nyers adat korlátos (4. vak kör L1)", async () => {
  let produced = 0;
  // Véges, gyors termelő (4 MiB): korlátlan sorral mind a memóriába kerülne, mielőtt a fogyasztó egy bájtot is kérne.
  const fast = new Readable({ read() { if (produced >= 4 * 1024 * 1024) { this.push(null); return; } produced += 16 * 1024; this.push(Buffer.alloc(16 * 1024)); } });
  const body = webBody(fast);
  // A fogyasztó (a lemezre író pipeline) még nem olvas: ennyit tölt elő az adapter magától.
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  assert.ok(produced <= 256 * 1024, `előtöltve ${produced} bájt (határ: 256 KiB)`);
  await body.cancel();
  fast.destroy();
});

test("a lekérdezés JSON-válasza bájtkorlátos: a túl hosszú törzs olvasása a korlátnál megszakad (4. vak kör L1)", async () => {
  let pulled = 0;
  // 2 MiB-os törzs (véges, hogy a korlát nélküli olvasás is befejeződjön, és a teszt bukjon, ne akadjon el).
  const endless = new ReadableStream<Uint8Array>({ pull(controller) { if (++pulled > 128) { controller.close(); return; } controller.enqueue(new Uint8Array(16 * 1024)); } });
  await assert.rejects(readLimitedText(new Response(endless), 64 * 1024), /bájt/);
  assert.ok(pulled <= 8, `a korlát után nem olvas tovább (${pulled} darab)`);
  assert.equal(await readLimitedText(new Response('{"status":"completed"}'), 64 * 1024), '{"status":"completed"}');
});

test("a DNS-feloldás várakozását az időkorlát megszakítja, és a későn beérő címre nem indul kérés (4. vak kör L2)", async () => {
  let sent = 0, resolveLookup!: (v: Array<{ address: string; family: number }>) => void;
  const transport: ProviderTransport = {
    lookup: () => new Promise((resolve) => { resolveLookup = resolve; }),
    request: async () => { sent++; return toRaw(new Response("x")); },
  };
  const started = Date.now();
  await assert.rejects(safeProviderFetch(new URL("https://cdn.example/v.mp4"), { headers: {}, signal: AbortSignal.timeout(50) }, { sameOrigin: false, transport }));
  assert.ok(Date.now() - started < 2000, `a függő DNS nem tartja fel (${Date.now() - started} ms)`);
  resolveLookup([{ address: "93.184.216.34", family: 4 }]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent, 0, "a későn beérő feloldás után sem indul kérés");
});

/** Véges, de a korlátnál nagyobb törzs, darabszámlálóval (a korlát nélküli olvasás is befejeződik — a teszt bukik, nem akad el). */
function oversized(bytes: number) {
  const chunk = 64 * 1024;
  const state = { pulled: 0 };
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (state.pulled * chunk >= bytes) { controller.close(); return; } state.pulled++; controller.enqueue(new Uint8Array(chunk)); } });
  return { stream, state, chunk };
}

test("I/O-leltár: minden szolgáltatói választörzs bájtkorlátos — a korlát fölött az olvasás megáll, a hívás hibával zárul (sikeres és hibás státusznál is)", async () => {
  const realFetch = globalThis.fetch;
  const image = { bytes: Buffer.from("x"), mime: "image/jpeg" };
  const cases: Array<{ name: string; limit: number; status: number; call: () => Promise<unknown> }> = [];
  const full = clipProviders({ openRouter: "k", openAi: "o", elevenLabs: "e" }, testTransport);
  const orOnly = clipProviders({ openRouter: "k", elevenLabs: "e" }, testTransport);
  for (const status of [200, 500]) {
    cases.push(
      { name: "forgatókönyv", limit: CLIP_RESPONSE_LIMITS.text, status, call: () => full.chat("s", "u") },
      { name: "képkapu", limit: CLIP_RESPONSE_LIMITS.text, status, call: () => full.check(image, "jelenet") },
      { name: "kép (OpenAI)", limit: CLIP_RESPONSE_LIMITS.image, status, call: () => full.image("p") },
      { name: "kép (OpenRouter)", limit: CLIP_RESPONSE_LIMITS.image, status, call: () => orOnly.image("p") },
      { name: "mozgókép-beküldés", limit: CLIP_RESPONSE_LIMITS.text, status, call: () => full.video!(image, "p", 5) },
      { name: "hang", limit: CLIP_RESPONSE_LIMITS.audio, status, call: () => full.speech!("szöveg", STYLE.voice) },
      { name: "hangkapu (OpenAI)", limit: CLIP_RESPONSE_LIMITS.text, status, call: () => full.hear!(Buffer.from("x")) },
      { name: "hangkapu (ElevenLabs)", limit: CLIP_RESPONSE_LIMITS.text, status, call: () => orOnly.hear!(Buffer.from("x")) },
    );
  }
  try {
    for (const c of cases) {
      const body = oversized(c.limit + 2 * 1024 * 1024);
      globalThis.fetch = (async () => new Response(body.stream, { status: c.status })) as typeof fetch;
      await assert.rejects(c.call(), Error, `${c.name} (${c.status})`);
      assert.ok(body.state.pulled * body.chunk <= c.limit + 4 * body.chunk, `${c.name} (${c.status}): ${body.state.pulled * body.chunk} bájtot olvasott (korlát: ${c.limit})`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("I/O-leltár: az elakadt letöltési törzs olvasását a kérés határideje megszakítja, a kapcsolat lezárul", async () => {
  let destroyed = 0;
  const transport: ProviderTransport = {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    request: async () => ({ status: 200, headers: {}, body: { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<Uint8Array>>(() => undefined) }) }, destroy: () => { destroyed++; } }),
  };
  const started = Date.now();
  const res = await safeProviderFetch(new URL("https://cdn.example/v.mp4"), { headers: {}, signal: AbortSignal.timeout(100) }, { sameOrigin: false, transport });
  await assert.rejects(res.arrayBuffer());
  assert.ok(Date.now() - started < 2000, `az elakadt törzs nem tartja fel (${Date.now() - started} ms)`);
  assert.ok(destroyed >= 1, "a kapcsolat lezárul");
});

test("szolgáltatói letöltési hiba: a hibaüzenet és a napló strukturált kódot és legfeljebb hostot tartalmaz, a query értékét nem (6. vak kör L4)", async () => {
  const PROBE = "probaertek-query-123"; // próba-query értéke (nem titok)
  const transport: ProviderTransport = {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    // Location nélküli átirányítás: a közös út hibaüzenete a teljes URL-t tartalmazná.
    request: async () => toRaw(new Response(null, { status: 302 })),
  };
  const error = await safeProviderFetch(new URL(`https://cdn.example/v.mp4?token=${PROBE}`), { headers: {} }, { sameOrigin: false, transport }).then(() => null, (e: unknown) => e as Error);
  assert.ok(error, "a hívás hibával zárul");
  assert.equal(error.message.includes(PROBE), false, `a query értéke nincs a hibaüzenetben: ${error.message}`);
  assert.match(error.message, /cdn\.example/);
  assert.match(error.message, /\b[A-Z_]{4,}\b/, "strukturált hibakód");
  // A teljes úton (beküldés → letöltés) a napló sem tartalmazza.
  const realFetch = globalThis.fetch, realWarn = logger.warn;
  const logged: string[] = [];
  logger.warn = ((...args: unknown[]) => { logged.push(args.map(String).join(" ")); }) as typeof logger.warn;
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: "completed", polling_url: "/api/v1/videos/1", unsigned_urls: [`https://cdn.example/v.mp4?token=${PROBE}`] }), { status: 200 })) as typeof fetch;
  try {
    assert.equal(await clipProviders({ openRouter: "k" }, transport).video!({ bytes: Buffer.from("x"), mime: "image/jpeg" }, "p", 5), null);
  } finally {
    globalThis.fetch = realFetch; logger.warn = realWarn;
  }
  assert.ok(logged.length > 0, "a letöltési hiba naplózódik");
  assert.equal(logged.some((line) => line.includes(PROBE)), false, `a query értéke nincs a naplóban: ${logged.join(" | ")}`);
});
