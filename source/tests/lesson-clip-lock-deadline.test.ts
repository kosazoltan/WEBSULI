import { test } from "node:test";
import assert from "node:assert/strict";
import { shutdownLessonClips, startLessonClipWorker, type ClipDeps, type ClipStore } from "../server/lesson-clips";
import { exclusiveWithLock, forceReleaseClipLock, type LockClient } from "../server/lesson-clips-lock";

// Zár-életciklus a leállítási határidőnél: a munka a határidő ELŐTT kész, de a zárfeloldás válasza elakad — a 70. másodpercnél a
// kapcsolat pontosan egyszer eldobódik, az eredmény „forced”. Külön tesztfájl (külön folyamat): a leállítás a modul állapotát
// véglegesen átállítja. Adatbázis nélkül (csonkolt kapcsolat).

test("leállítás: a munka kész, az unlock elakad — a 70. mp-nél pontosan egy eldobás, előtte egy sem", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const releases: Array<Error | undefined> = [];
  const pending: Array<(e: Error) => void> = [];
  const client: LockClient = {
    query: (config) => new Promise((resolve, reject) => {
      if (config.text.includes("unlock")) { pending.push(reject); return; } // a feloldás válasza nem érkezik meg
      resolve({ rows: [{ ok: true }] });
    }),
    release: (error) => { releases.push(error instanceof Error ? error : undefined); for (const reject of pending.splice(0)) reject(new Error("Connection terminated")); },
  };
  const store: ClipStore = {
    lesson: async () => null, freshLessons: async () => [], rows: async () => [], upsert: async () => undefined, lessonsToday: async () => [],
    putMedia: async () => "id", mediaBytes: async () => 0, pruneOrphanMedia: async () => ({ rows: 0, bytes: 0 }),
    exclusive: (work) => exclusiveWithLock(async () => client, 42, 15_000, () => work()),
  };
  const deps = { chat: async () => "", image: async () => ({ bytes: Buffer.from("x"), mime: "image/jpeg" }), check: async () => ({ ok: true, note: "" }), still: async () => Buffer.from("x"), audioMs: () => 0 } satisfies ClipDeps;
  startLessonClipWorker(store, () => ({ deps, model: "m" }), { LESSON_CLIPS_AUTO: "on", OPENROUTER_API_KEY: "k" });
  const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  t.mock.timers.tick(90_000); await settle();
  assert.equal(pending.length, 1, "a kör munkája kész, a feloldás függ");
  let outcome: string | undefined;
  const stopped = shutdownLessonClips(() => undefined, 60_000, 10_000, forceReleaseClipLock).then((result) => { outcome = result; });
  // A mock-óra lépésenként: a 60 s-os kivárás után indul a 10 s-os (a második időzítő a 60. mp-ben jön létre).
  t.mock.timers.tick(60_000); await settle();
  t.mock.timers.tick(9_999); await settle();
  assert.deepEqual([releases.length, outcome], [0, undefined], "a határidő előtt nincs eldobás és nincs „kész”");
  t.mock.timers.tick(1); await settle();
  await stopped;
  assert.equal(outcome, "forced");
  assert.equal(releases.length, 1, "pontosan egy eldobás");
  assert.ok(releases[0] instanceof Error, "eldobva, nem vissza a poolba");
  assert.equal(forceReleaseClipLock(), false, "nincs második eldobás");
});
