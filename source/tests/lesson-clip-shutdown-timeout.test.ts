import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shutdownLessonClips, startLessonClipWorker, type ClipDeps, type ClipStore } from "../server/lesson-clips";

// Ha a határidőkor nincs eldobható zárkapcsolat (a kör pl. még a poolra vár), az eredmény „timeout” — nem „forced”, és a szerver
// nem naplóz „eldobva”-t. Külön tesztfájl (külön folyamat): a leállítás a modul állapotát véglegesen átállítja.

test("leállítás: eldobható kapcsolat nélkül az eredmény »timeout«, nem hamis »forced«", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const store: ClipStore = {
    lesson: async () => null, freshLessons: async () => [], rows: async () => [], upsert: async () => undefined, lessonsToday: async () => [],
    putMedia: async () => "id", mediaBytes: async () => 0, pruneOrphanMedia: async () => ({ rows: 0, bytes: 0 }),
    exclusive: () => new Promise(() => undefined), // a kör a kapcsolatra vár, zárat még nem tart
  };
  const deps = { chat: async () => "", image: async () => ({ bytes: Buffer.from("x"), mime: "image/jpeg" }), check: async () => ({ ok: true, note: "" }), still: async () => Buffer.from("x"), audioMs: () => 0 } satisfies ClipDeps;
  startLessonClipWorker(store, () => ({ deps, model: "m" }), { LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" });
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  t.mock.timers.tick(90_000); await settle();
  let outcome: string | undefined;
  const stopped = shutdownLessonClips(() => undefined, 60_000, 10_000, () => false).then((result) => { outcome = result; });
  t.mock.timers.tick(60_000); await settle();
  t.mock.timers.tick(10_000); await settle();
  await stopped;
  assert.equal(outcome, "timeout");
});

test("szerverleállítás: „eldobva” naplósor csak valódi eldobáskor (»forced«), »timeout«-nál külön figyelmeztetés", () => {
  const source = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /outcome === "forced"\) logger\.warn\("\[lesson-clips\] a leállítási határidőn túl futó kör zárkapcsolata eldobva"\)/);
  assert.match(source, /outcome === "timeout"\) logger\.warn\(/);
});
