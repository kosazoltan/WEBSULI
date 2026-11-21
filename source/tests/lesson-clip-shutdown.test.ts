import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { ClipAbortError, startLessonClipWorker, stopLessonClipWorker, type ClipDeps, type ClipStore } from "../server/lesson-clips";
import { abortClipTranscodes, downloadAndShrink, type ExecLike } from "../server/lesson-clips-providers";

// Vak kör L5 (docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md): a kisfilmworker a szerver leállításakor. Külön tesztfájl (külön
// folyamat), mert a leállítás a modul állapotát véglegesen átállítja — élesben a leálló példány nem indul újra.

test("leállítás: a kisfilmworker időzítői leállnak, új kör nem indul (vak kör L5)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let rounds = 0;
  const store: ClipStore = {
    lesson: async () => null, freshLessons: async () => [], rows: async () => [], upsert: async () => undefined, lessonsToday: async () => [],
    putMedia: async () => "id", mediaBytes: async () => 0, exclusive: async (work) => { rounds++; return work(); },
  };
  const deps = { chat: async () => "", image: async () => ({ bytes: Buffer.from("x"), mime: "image/jpeg" }), check: async () => ({ ok: true, note: "" }), still: async () => Buffer.from("x"), audioMs: () => 0 } satisfies ClipDeps;
  assert.equal(startLessonClipWorker(store, () => ({ deps, model: "m" }), { LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" }), "auto");
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  t.mock.timers.tick(90_000); await settle();
  assert.equal(rounds, 1, "az első kör elindult");
  await stopLessonClipWorker();
  t.mock.timers.tick(30 * 60_000); await settle();
  assert.equal(rounds, 1, "leállítás után nincs új kör");
});

test("leállítás: a futó átkódolás SIGKILL-lel leáll, a jelenet megszakítottként (nem állóképesként) jelez; utána új nem indul (vak kör L5)", async () => {
  const calls: string[] = [];
  const killed: Array<NodeJS.Signals | undefined> = [];
  const hanging: ExecLike = (_file, args, _options, callback) => {
    calls.push(path.dirname(args.at(-1)!));
    return { kill: (signal) => { killed.push(signal); queueMicrotask(() => callback(Object.assign(new Error("killed"), { killed: true }))); return true; } };
  };
  const result = downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 90_000, { exec: hanging, rss: () => 0 });
  while (!calls.length) await new Promise((r) => setTimeout(r, 1));
  assert.equal(abortClipTranscodes(), 1, "egy futó gyerek");
  await assert.rejects(result, ClipAbortError);
  assert.deepEqual(killed, ["SIGKILL"]);
  assert.equal(existsSync(calls[0]), false, "a munkamappa törlődik");
  assert.equal(abortClipTranscodes(), 0, "nincs több futó gyerek");
  await assert.rejects(downloadAndShrink(async () => new Response(new Uint8Array([1])), "ffmpeg", 90_000, { exec: hanging, rss: () => 0 }), ClipAbortError);
  assert.equal(calls.length, 1, "leállítás után új átkódolás nem indul");
});
