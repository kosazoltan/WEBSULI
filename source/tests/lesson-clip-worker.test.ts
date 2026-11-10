import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { lessonSchema } from "../shared/lesson-schema";
import { clipSource, type Clip2 } from "../shared/lesson-clip";
import { CLIP_BAND_STYLE, clipBandFor } from "../shared/clip-style";
import {
  CLIP_FRESH_DAYS, CLIP_MAX_ATTEMPTS, CLIP_PARALLEL, CLIP_RSS_LIMIT_BYTES, CLIP_VIDEO_MAX_BYTES, clipDailyLimit, clipMediaBudgetBytes, clipSourceHash, clipSystemPrompt, clipTodo, clipsMode,
  CLIP_SPEECH_ATTEMPTS, eligibleSections, lessonClipsResponse, makeChapterClip, runClipRound, servableClips, speakChecked, speechDistance, type ClipDeps, type ClipLesson, type ClipRow, type ClipStore,
} from "../server/lesson-clips";
import { mediaId } from "../server/lesson-clip-media";
import { clipKeys } from "../server/lesson-clips-providers";

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
  assert.deepEqual(report, { made: 2, failed: 0, lessons: 1, videos: 2 * STYLE.narration.scenes[0], stoppedByBudget: false });
  assert.deepEqual(rows.map((r) => [r.lessonId, r.sectionIndex, r.status, r.attempts]), [["pub", 0, "ready", 1], ["pub", 1, "ready", 1]]);
  const served = await lessonClipsResponse(store, "pub", "auto", NOW);
  assert.deepEqual(served!.clips.map((c) => [c.sectionIndex, (c.clip as Clip2).v]), [[0, 2], [1, 2]]);
  assert.equal(served!.pending, false);
  const chats = deps.calls.chat.length;
  assert.deepEqual(await runClipRound(store, deps, "auto", OPTS), { made: 0, failed: 0, lessons: 0, videos: 0, stoppedByBudget: false });
  assert.equal(deps.calls.chat.length, chats);
  assert.equal(await runClipRound(store, deps, "idle", OPTS), null);
  assert.equal(await runClipRound(store, deps, "off", OPTS), null);
});

test("sikertelen fejezet legfeljebb két körben próbálkozik; a megváltozott fejezet újragyártandó", async () => {
  const { store, rows } = memoryStore([makeLesson("pub")]);
  const bad = fakeDeps({ answers: ["{}"] });
  assert.deepEqual(await runClipRound(store, bad, "auto", OPTS), { made: 0, failed: 2, lessons: 1, videos: 0, stoppedByBudget: false });
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
