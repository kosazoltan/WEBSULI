import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shutdownLessonClips, startLessonClipWorker, type ClipDeps, type ClipStore } from "../server/lesson-clips";

// docs/specs/2026-11-10-kisfilm-memoria.md (6. vak kör L1): a kisfilm kemény megszakítása a 60 s-os worker-kivárás lejártakor AZONNAL
// lefut — nem vár a Stúdió-kivárásra és az ürítésekre. Külön tesztfájl (külön folyamat): a leállítás a modul állapotát véglegesen
// átállítja.

test("leállítás: a megszakítás a worker-kivárás lejártakor fut, akkor is, ha a Stúdió-kivárás még tart; utána a kör lezárul", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let aborted = 0, finishRound!: () => void;
  const roundHangs = new Promise<void>((resolve) => { finishRound = resolve; });
  const store: ClipStore = {
    lesson: async () => null, freshLessons: async () => [], rows: async () => [], upsert: async () => undefined, lessonsToday: async () => [],
    putMedia: async () => "id", mediaBytes: async () => 0, pruneOrphanMedia: async () => ({ rows: 0, bytes: 0 }),
    // A futó kör egy szolgáltatói várakozásban áll, amíg a megszakítás meg nem érkezik.
    exclusive: async (work) => { await roundHangs; return work(); },
  };
  const deps = { chat: async () => "", image: async () => ({ bytes: Buffer.from("x"), mime: "image/jpeg" }), check: async () => ({ ok: true, note: "" }), still: async () => Buffer.from("x"), audioMs: () => 0 } satisfies ClipDeps;
  assert.equal(startLessonClipWorker(store, () => ({ deps, model: "m" }), { LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" }), "auto");
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  t.mock.timers.tick(90_000); await settle();
  const studioStillWaiting = new Promise<void>(() => undefined); // a Stúdió-kivárás (legfeljebb 270 s) közben végig tart
  let done = false;
  const stopped = shutdownLessonClips(() => { aborted++; finishRound(); }, 60_000, 10_000).then(() => { done = true; });
  void studioStillWaiting;
  t.mock.timers.tick(59_999); await settle();
  assert.equal(aborted, 0, "a kivárás alatt még nincs megszakítás");
  t.mock.timers.tick(1); await settle();
  assert.equal(aborted, 1, "a 60 s-os kivárás lejártakor azonnal megszakít");
  await settle();
  await stopped;
  assert.equal(done, true, "a megszakítás után a kör lezárul, a leállítás továbbléphet");
});

test("szerverleállítás: a kisfilm-megszakítás a leállítás elején indított láncban van, nem a Stúdió-kivárás és az ürítések után", () => {
  const source = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("const gracefulShutdown = async");
  const body = source.slice(start, source.indexOf("process.on(\"SIGTERM\"", start));
  const chain = body.indexOf("shutdownLessonClips(abortClipTranscodes, 60_000, 10_000)");
  const studio = body.indexOf("waitForActiveRuns(");
  assert.ok(chain > 0 && studio > 0 && chain < studio, "a kisfilm-leállítás lánca a Stúdió-kivárás előtt indul");
  assert.equal(body.slice(studio).includes("abortClipTranscodes()"), false, "a Stúdió-kivárás után nincs külön (késő) kisfilm-megszakítás");
  assert.match(body, /legrosszabb eset/i, "a leállítási sorrend legrosszabb esetű időszámítása a kód mellett");
});
