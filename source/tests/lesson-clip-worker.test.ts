import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { lessonSchema } from "../shared/lesson-schema";
import { clipSource, type Clip } from "../shared/lesson-clip";
import {
  CLIP_FRESH_DAYS, CLIP_MAX_ATTEMPTS, CLIP_SYSTEM, CLIP_TEXT_MODEL, autoTodo, clipDailyLimit, clipSourceHash, clipsMode, eligibleSections, lessonClipsResponse,
  makeClip, runClipRound, seedHandmade, servableClips, type ClipDeps, type ClipLesson, type ClipRow, type ClipStore,
} from "../server/lesson-clips";
import type { ClipSeed } from "../server/lesson-clip-seeds";

// docs/specs/2026-11-10-fejezet-kisfilmek.md — kiszolgálási szűrő, kézi beírás, háttérgyártás (hálózat és adatbázis nélkül).

const NOW = new Date("2026-11-10T12:00:00Z");
const SAY = "Ez egy elég hosszú, elmondható mondat a jelenethez.";
const goodClip = (title = "Kisfilm"): Clip => ({ v: 1, title, scenes: [
  { say: SAY, visual: { kind: "title", emoji: "🎬", text: "Cím" } },
  { say: SAY, visual: { kind: "idea", emoji: "💡", text: "Kulcsmondat" } },
  { say: SAY, visual: { kind: "steps", items: [{ text: "Első" }, { text: "Második" }] } },
] });

function twoChapterLesson() {
  const lesson = fusionFixture();
  lesson.sections.push({ ...lesson.sections[0], heading: "Második fejezet" });
  return lessonSchema.parse(lesson);
}
const makeLesson = (id: string, publishedAt: Date | null = new Date(NOW.getTime() - 3_600_000), json: unknown = twoChapterLesson()): ClipLesson => ({ id, publishedAt, json });

function memoryStore(lessons: ClipLesson[], initial: ClipRow[] = []) {
  const rows = [...initial];
  const autoToday = new Set<string>();
  const put = (row: ClipRow) => { const i = rows.findIndex((r) => r.lessonId === row.lessonId && r.sectionIndex === row.sectionIndex); if (i >= 0) rows[i] = row; else rows.push(row); };
  const store: ClipStore = {
    lesson: async (id) => lessons.find((l) => l.id === id) ?? null,
    freshLessons: async (days) => lessons.filter((l) => l.publishedAt && NOW.getTime() - l.publishedAt.getTime() <= days * 86_400_000).sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime()),
    rows: async (lessonId) => rows.filter((r) => r.lessonId === lessonId),
    upsertHandmade: async (row) => put({ ...row, sourceHash: null, status: "ready", origin: "handmade", attempts: 0 }),
    upsertAuto: async ({ model: _model, ...row }) => {
      const old = rows.find((r) => r.lessonId === row.lessonId && r.sectionIndex === row.sectionIndex);
      if (old?.origin === "handmade") return; // ugyanaz a szabály, mint az éles tár WHERE … origin = 'auto' feltétele
      put({ ...row, origin: "auto" }); autoToday.add(row.lessonId);
    },
    autoLessonsToday: async () => [...autoToday],
    exclusive: async (work) => work(),
  };
  return { store, rows, autoToday };
}
const deps = (answers: Array<string | Error>): ClipDeps & { calls: Array<{ system: string; user: string }> } => {
  const calls: Array<{ system: string; user: string }> = [];
  return { calls, chat: async (system, user) => { calls.push({ system, user }); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; if (a instanceof Error) throw a; return a; } };
};

test("kapcsolók: vészfék, kézi alapállapot, gyártás csak kapcsolóval és kulccsal (E10)", () => {
  assert.equal(clipsMode({}), "seeds");
  assert.equal(clipsMode({ LESSON_CLIPS_AUTO: "on" }), "seeds", "kulcs nélkül nincs gyártás");
  assert.equal(clipsMode({ LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" }), "auto");
  assert.equal(clipsMode({ LESSON_CLIPS_AUTO: "1", OPENROUTER_API_KEY: "k" }), "seeds", "csak a pontos \"on\" kapcsol be");
  assert.equal(clipsMode({ LESSON_CLIPS: "0", LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" }), "off");
  assert.equal(clipDailyLimit({}), 10);
  assert.equal(clipDailyLimit({ LESSON_CLIP_DAILY_LIMIT: "3" }), 3);
  assert.equal(clipDailyLimit({ LESSON_CLIP_DAILY_LIMIT: "sok" }), 10);
});

test("a kiszolgálás csak a kész, a fejezet mostani címéhez és szövegéhez illő kisfilmet adja ki (E9, E11)", () => {
  const lesson = twoChapterLesson();
  const [first, second] = eligibleSections(lesson);
  const row = (over: Partial<ClipRow>): ClipRow => ({ lessonId: "l", sectionIndex: 0, heading: first.heading, sourceHash: first.hash, status: "ready", clip: goodClip(), origin: "auto", attempts: 1, ...over });
  assert.deepEqual(servableClips(lesson, [row({})]).map((c) => c.sectionIndex), [0]);
  assert.deepEqual(servableClips(lesson, [row({ status: "failed", clip: null })]), [], "sikertelen sor");
  assert.deepEqual(servableClips(lesson, [row({ heading: "Régi cím" })]), [], "megváltozott fejezetcím");
  assert.deepEqual(servableClips(lesson, [row({ sourceHash: clipSourceHash("régi szöveg") })]), [], "megváltozott fejezetszöveg");
  assert.deepEqual(servableClips(lesson, [row({ clip: { v: 1, title: "x", scenes: [] } })]), [], "a sémának nem megfelelő tárolt kisfilm");
  assert.deepEqual(servableClips(lesson, [row({ sectionIndex: 9 })]), [], "túlnyúló fejezetindex");
  // Kézi sor: a lenyomat NULL, csak a cím köti. A válasz fejezetsorrendben megy ki.
  const both = servableClips(lesson, [row({ sectionIndex: 1, heading: second.heading, sourceHash: null, origin: "handmade" }), row({})]);
  assert.deepEqual(both.map((c) => c.sectionIndex), [0, 1]);
});

test("a végpont válasza: 404 a nem publikált leckére, vészféknél üres, gyártás közben pending", async () => {
  const { store } = memoryStore([makeLesson("pub"), makeLesson("draft", null), makeLesson("old", new Date(NOW.getTime() - (CLIP_FRESH_DAYS + 1) * 86_400_000))]);
  assert.equal(await lessonClipsResponse(store, "nincs", "auto", NOW), null);
  assert.equal(await lessonClipsResponse(store, "draft", "auto", NOW), null);
  assert.deepEqual(await lessonClipsResponse(store, "pub", "off", NOW), { clips: [], pending: false });
  assert.deepEqual(await lessonClipsResponse(store, "pub", "auto", NOW), { clips: [], pending: true }, "friss lecke, gyártás bekapcsolva");
  assert.deepEqual(await lessonClipsResponse(store, "pub", "seeds", NOW), { clips: [], pending: false }, "gyártás nélkül nincs mire várni");
  assert.deepEqual(await lessonClipsResponse(store, "old", "auto", NOW), { clips: [], pending: false }, "a friss ablakon kívül nincs gyártás");
});

test("a kézi kisfilmek beírása: publikált lecke, egyező fejezetcím; ismételt kör nem ír újra (E7)", async () => {
  const lesson = twoChapterLesson();
  const seeds: Record<string, ClipSeed[]> = {
    pub: [{ sectionIndex: 0, heading: lesson.sections[0].heading, clip: goodClip("Kézi") }, { sectionIndex: 1, heading: "Nem ez a cím", clip: goodClip() }],
    draft: [{ sectionIndex: 0, heading: lesson.sections[0].heading, clip: goodClip() }],
    missing: [{ sectionIndex: 0, heading: "x", clip: goodClip() }],
  };
  const { store, rows } = memoryStore([makeLesson("pub"), makeLesson("draft", null)]);
  assert.equal(await seedHandmade(store, seeds), 1);
  assert.deepEqual(rows.map((r) => [r.lessonId, r.sectionIndex, r.origin, r.status, r.sourceHash]), [["pub", 0, "handmade", "ready", null]]);
  assert.equal(await seedHandmade(store, seeds), 0, "már be van írva");
  // A kézi kisfilm módosítása a repóban felülírja a tárolt sort; a végpont azt adja ki, és jelzi a még be nem írt kézi kisfilmet.
  seeds.pub[0] = { ...seeds.pub[0], clip: goodClip("Kézi, javítva") };
  assert.equal(await seedHandmade(store, seeds), 1);
  assert.equal((rows[0].clip as Clip).title, "Kézi, javítva");
});

test("háttérgyártás: a friss lecke minden jogosult fejezete kisfilmet kap, a Célkártya és a mese szövege nélkül (E8)", async () => {
  const { store, rows } = memoryStore([makeLesson("pub")]);
  const model = deps([JSON.stringify(goodClip())]);
  const report = await runClipRound(store, model, "auto", { dailyLimit: 10, seeds: {} });
  assert.deepEqual(report, { seeded: 0, made: 2, failed: 0, lessons: 1 });
  assert.deepEqual(rows.map((r) => [r.sectionIndex, r.status, r.origin, r.attempts]), [[0, "ready", "auto", 1], [1, "ready", "auto", 1]]);
  assert.equal(model.calls.length, 2, "fejezetenként egy hívás");
  assert.equal(model.calls[0].system, CLIP_SYSTEM);
  const lesson = twoChapterLesson();
  assert.ok(model.calls.some((c) => c.user.includes(clipSource(lesson, 0)!.slice(0, 60))));
  assert.ok(model.calls.every((c) => c.user.includes(`A lecke címe: ${lesson.title}`)));
  assert.deepEqual((await lessonClipsResponse(store, "pub", "auto", NOW))!.clips.map((c) => c.sectionIndex), [0, 1]);
  assert.equal((await lessonClipsResponse(store, "pub", "auto", NOW))!.pending, false);
  // A következő kör nem gyárt újra.
  assert.deepEqual(await runClipRound(store, model, "auto", { dailyLimit: 10, seeds: {} }), { seeded: 0, made: 0, failed: 0, lessons: 0 });
  assert.equal(model.calls.length, 2);
  assert.match(CLIP_TEXT_MODEL, /haiku/);
});

test("hibás modellválasz: egy javító hívás a hibalistával; ha az is bukik, a sor sikertelen, és legfeljebb két körben próbálkozik (E9)", async () => {
  const input = { title: "Lecke", subject: "Fizika", classroom: 9, heading: "Fejezet", source: "A futó 400 m-t tesz meg." };
  const repaired = deps(["nem JSON", JSON.stringify(goodClip())]);
  assert.ok("clip" in (await makeClip(input, repaired)));
  assert.equal(repaired.calls.length, 2);
  assert.match(repaired.calls[1].user, /Ez nem felelt meg/);
  const invented = { ...goodClip(), scenes: [goodClip().scenes[0], { say: "A futó pontosan 999 métert tesz meg a pályán.", visual: { kind: "idea", emoji: "🏃", text: "999 m" } }, goodClip().scenes[2]] };
  const stubborn = deps([JSON.stringify(invented)]);
  const failed = await makeClip(input, stubborn);
  assert.ok("problems" in failed && /999/.test(failed.problems.join(" ")), "új szám nem születhet");

  const { store, rows } = memoryStore([makeLesson("pub")]);
  const bad = deps(["{}"]);
  assert.deepEqual(await runClipRound(store, bad, "auto", { dailyLimit: 10, seeds: {} }), { seeded: 0, made: 0, failed: 2, lessons: 1 });
  assert.deepEqual(rows.map((r) => [r.status, r.attempts, r.clip]), [["failed", 1, null], ["failed", 1, null]]);
  assert.deepEqual(await lessonClipsResponse(store, "pub", "auto", NOW), { clips: [], pending: true }, "van még próbálkozás");
  await runClipRound(store, bad, "auto", { dailyLimit: 10, seeds: {} });
  assert.deepEqual(rows.map((r) => r.attempts), [CLIP_MAX_ATTEMPTS, CLIP_MAX_ATTEMPTS]);
  assert.deepEqual(await lessonClipsResponse(store, "pub", "auto", NOW), { clips: [], pending: false }, "végleg sikertelen: a kliens nem kérdez tovább");
  const callsBefore = bad.calls.length;
  await runClipRound(store, bad, "auto", { dailyLimit: 10, seeds: {} });
  assert.equal(bad.calls.length, callsBefore, "a harmadik körben nincs több hívás");
  // A hálózati hiba is sikertelen sor, nem elszálló kör.
  const net = memoryStore([makeLesson("pub")]);
  assert.deepEqual(await runClipRound(net.store, deps([new Error("HTTP 500")]), "auto", { dailyLimit: 10, seeds: {} }), { seeded: 0, made: 0, failed: 2, lessons: 1 });
});

test("napi plafon, friss ablak, a kézi sor védelme, megváltozott fejezet újragyártása", async () => {
  const older = makeLesson("b", new Date(NOW.getTime() - 7_200_000));
  const stale = makeLesson("old", new Date(NOW.getTime() - (CLIP_FRESH_DAYS + 1) * 86_400_000));
  const lesson = twoChapterLesson();
  const handmade: ClipRow = { lessonId: "a", sectionIndex: 0, heading: lesson.sections[0].heading, sourceHash: null, status: "ready", clip: goodClip("Kézi"), origin: "handmade", attempts: 0 };
  const { store, rows } = memoryStore([older, makeLesson("a"), stale], [handmade]);
  const model = deps([JSON.stringify(goodClip("Gépi"))]);
  // Plafon 1: csak a legfrissebb lecke („a”) kap gyártást, és csak a kézi sor nélküli fejezete.
  assert.deepEqual(await runClipRound(store, model, "auto", { dailyLimit: 1, seeds: {} }), { seeded: 0, made: 1, failed: 0, lessons: 1 });
  assert.deepEqual(rows.map((r) => [r.lessonId, r.sectionIndex, r.origin, (r.clip as Clip).title]), [["a", 0, "handmade", "Kézi"], ["a", 1, "auto", "Gépi"]]);
  // Nagyobb plafonnal a „b” is sorra kerül; a friss ablakon kívüli „old” soha.
  await runClipRound(store, model, "auto", { dailyLimit: 5, seeds: {} });
  assert.deepEqual([...new Set(rows.map((r) => r.lessonId))].sort(), ["a", "b"]);
  // A fejezet szövege megváltozik: a régi kisfilm nem megy ki, és a sor újragyártandó (a próbálkozások elölről indulnak).
  const changed = twoChapterLesson();
  const block = changed.sections[1].blocks.find((b) => b.kind === "explain")!;
  if (block.kind === "explain") block.text += " Ez egy új mondat a fejezet végén.";
  const autoRows = rows.filter((r) => r.lessonId === "b");
  assert.deepEqual(servableClips(changed, autoRows).map((c) => c.sectionIndex), [0]);
  assert.deepEqual(autoTodo(changed, autoRows).map((t) => [t.sectionIndex, t.attempts]), [[1, 0]]);
  // Kézi módban és vészféknél nincs modellhívás.
  const calls = model.calls.length;
  assert.deepEqual(await runClipRound(memoryStore([makeLesson("x")]).store, model, "seeds", { dailyLimit: 5, seeds: {} }), { seeded: 0, made: 0, failed: 0, lessons: 0 });
  assert.equal(await runClipRound(memoryStore([makeLesson("x")]).store, model, "off", { dailyLimit: 5, seeds: {} }), null);
  assert.equal(model.calls.length, calls);
});
