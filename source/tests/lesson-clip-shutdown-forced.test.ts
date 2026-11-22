import { test } from "node:test";
import assert from "node:assert/strict";
import { shutdownLessonClips, startLessonClipWorker, type ClipDeps, type ClipStore } from "../server/lesson-clips";

// docs/specs/2026-11-10-kisfilm-memoria.md (leállítási határidő): ha a kör egy lassú DB-műveletben a határidő után is tart, a
// leállítás NEM állít hamis „kész”-t — a zárat tartó kapcsolatot a határidőkor eldobja, és a kör utána már nem indít DB-műveletet.
// Külön tesztfájl (külön folyamat): a leállítás a modul állapotát véglegesen átállítja.

test("leállítás: a határidő után is tartó DB-művelet mellett a zárat tartó kapcsolat eldobódik, az eredmény »forced«, további DB-hívás nincs", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const calls: string[] = [];
  let finishSlowDb!: () => void, abandonLock!: (e: Error) => void;
  const slowDb = new Promise<void>((resolve) => { finishSlowDb = resolve; });
  const store: ClipStore = {
    lesson: async () => null, freshLessons: async () => { calls.push("freshLessons"); return []; }, rows: async () => [], upsert: async () => { calls.push("upsert"); },
    lessonsToday: async () => { calls.push("lessonsToday"); return []; }, putMedia: async () => "id", mediaBytes: async () => 0,
    // Lassú DB-söprés: a szolgáltatói megszakítás nem éri el, a határidő után is tart.
    pruneOrphanMedia: async () => { calls.push("prune"); await slowDb; return { rows: 0, bytes: 0 }; },
    // A zárat tartó „kapcsolat”: csak az eldobás (vagy a munka vége) zárja le.
    exclusive: (work) => new Promise((resolve, reject) => { abandonLock = reject; work().then(resolve, reject); }),
  };
  const deps = { chat: async () => "", image: async () => ({ bytes: Buffer.from("x"), mime: "image/jpeg" }), check: async () => ({ ok: true, note: "" }), still: async () => Buffer.from("x"), audioMs: () => 0 } satisfies ClipDeps;
  startLessonClipWorker(store, () => ({ deps, model: "m" }), { LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" });
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  t.mock.timers.tick(90_000); await settle();
  assert.deepEqual(calls, ["prune"], "a kör a lassú DB-söprésben áll");
  let aborted = 0, forced = 0, outcome: string | undefined;
  const stopped = shutdownLessonClips(() => { aborted++; }, 60_000, 10_000, () => { forced++; abandonLock(new Error("a zárat tartó kapcsolat eldobva")); return true; })
    .then((result) => { outcome = result; });
  t.mock.timers.tick(60_000); await settle();
  assert.deepEqual([aborted, forced, outcome], [1, 0, undefined], "60 s: megszakítás, de a DB-művelet még tart — nincs „kész”");
  t.mock.timers.tick(10_000); await settle();
  await stopped;
  assert.deepEqual([forced, outcome], [1, "forced"], "70 s: a zárat tartó kapcsolat eldobva, az eredmény nem hamis „kész”");
  // A lassú DB-művelet később befejeződik — a kör ekkor már semmilyen további DB-műveletet nem indíthat.
  finishSlowDb(); await settle();
  assert.deepEqual(calls, ["prune"], "az eldobás után nincs további DB-hívás");
});
