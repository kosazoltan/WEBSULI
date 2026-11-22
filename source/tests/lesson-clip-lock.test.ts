import { test } from "node:test";
import assert from "node:assert/strict";
import { ClipAbortError } from "../server/lesson-clips";
import { clipLockState, exclusiveWithLock, forceReleaseClipLock, terminateClipBackend, type LockClient } from "../server/lesson-clips-lock";

// docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md („zár-életciklus”): a zárat tartó kapcsolatot egyetlen, egyszer használható
// release birtokolja a zárkéréstől a release-ig; normál feloldás és kényszerített eldobás is ezen megy át, pontosan egyszer.
// Adatbázis nélkül: csonkolt kapcsolat (a valódi Postgres-próba: tests/lesson-clips-db.integration.ts).

type Step = "ok" | "busy" | "hang" | "error";
function fakeClient(lock: Step, unlock: Step) {
  const releases: Array<Error | undefined> = [], terminated: number[] = [];
  const pending: Array<(e: Error) => void> = [];
  const client: LockClient = {
    processID: 4242,
    query: (config) => new Promise((resolve, reject) => {
      const step = config.text.includes("unlock") ? unlock : lock;
      if (step === "hang") { pending.push(reject); return; }
      if (step === "error") { reject(new Error("query read timeout")); return; }
      resolve({ rows: [{ ok: step === "ok" }] });
    }),
    // A kapcsolat bontása a függő lekérdezést hibával zárja (mint a pg-nél).
    release: (error) => { releases.push(error instanceof Error ? error : undefined); for (const reject of pending.splice(0)) reject(new Error("Connection terminated")); },
  };
  const run = <T>(work: () => Promise<T>) => exclusiveWithLock(async () => client, 42, 15_000, work, (pid) => { terminated.push(pid); });
  return { run, releases, terminated };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("zár-életciklus: normál út és foglalt zár — egyetlen visszaadás a poolnak, szerveroldali leállítás nélkül", async () => {
  const normal = fakeClient("ok", "ok"), busy = fakeClient("busy", "ok");
  assert.equal(await normal.run(async () => 5), 5);
  assert.equal(await busy.run(async () => 6), null);
  assert.deepEqual([normal.releases, busy.releases, normal.terminated], [[undefined], [undefined], []]);
  assert.equal(clipLockState(), "none");
  assert.equal(forceReleaseClipLock(), false, "release után nincs mit eldobni");
});

for (const [phase, lock, unlock, state] of [["zárkérés", "hang", "ok", "locking"], ["munka", "ok", "ok", "working"], ["feloldás", "ok", "hang", "unlocking"]] as const) {
  test(`zár-életciklus: kényszerített eldobás a(z) ${phase} alatt — pontosan egy eldobás + szerveroldali leállítás, utána nincs második`, async () => {
    const conn = fakeClient(lock, unlock);
    let finishWork: () => void = () => undefined;
    const workDone = phase === "munka" ? new Promise<void>((resolve) => { finishWork = resolve; }) : Promise.resolve();
    const result = conn.run(async () => { await workDone; return 7; });
    result.catch(() => undefined);
    await tick();
    assert.equal(clipLockState(), state);
    assert.equal(forceReleaseClipLock(), true);
    if (phase === "feloldás") assert.equal(await result, 7, "a kész munka eredménye megmarad");
    else await assert.rejects(result, ClipAbortError);
    finishWork(); await tick();
    assert.equal(conn.releases.length, 1);
    assert.ok(conn.releases[0] instanceof Error, "eldobva, nem vissza a poolba");
    assert.deepEqual(conn.terminated, [4242], "a szerveroldali folyamat is leáll (visszagörgetés, zárfelengedés)");
    assert.equal(forceReleaseClipLock(), false);
    assert.equal(clipLockState(), "none");
  });
}

test("zár-életciklus: a zár- vagy a feloldó lekérdezés hibája a kapcsolatot eldobja; egy párhuzamos második hívás nem takarja el a zárat tartót", async () => {
  const lockFail = fakeClient("error", "ok"), unlockFail = fakeClient("ok", "error");
  await assert.rejects(lockFail.run(async () => 1), /read timeout/);
  assert.equal(await unlockFail.run(async () => 2), 2);
  assert.ok(lockFail.releases[0] instanceof Error && unlockFail.releases[0] instanceof Error);
  const holder = fakeClient("ok", "ok"), second = fakeClient("busy", "ok");
  let finishWork!: () => void;
  const running = holder.run(async () => { await new Promise<void>((resolve) => { finishWork = resolve; }); return 1; });
  running.catch(() => undefined);
  await tick();
  assert.equal(await second.run(async () => 2), null);
  assert.equal(clipLockState(), "working", "a zárat tartó kapcsolat továbbra is nyilvántartott");
  assert.equal(forceReleaseClipLock(), true);
  await assert.rejects(running, ClipAbortError);
  finishWork(); await tick();
  assert.deepEqual([holder.releases.length, second.releases], [1, [undefined]]);
});

test("DB-oldali leállítás: a kérés eredménye és hibája nem vész el csendben — figyelmeztetés, ha nem igazolt (vállalt korlát, 4. vak kör L1)", async () => {
  const warned: string[] = [];
  const warn = (message: string) => { warned.push(message); };
  assert.equal(await terminateClipBackend(async () => ({ rows: [{ pg_terminate_backend: true }] }), 4242, warn), true);
  assert.deepEqual(warned, [], "visszaigazolt leállítás: nincs figyelmeztetés");
  assert.equal(await terminateClipBackend(async () => ({ rows: [{ pg_terminate_backend: false }] }), 4242, warn), false);
  assert.equal(await terminateClipBackend(async () => { throw new Error("pool timeout"); }, 4242, warn), false);
  assert.deepEqual(warned, [
    "[lesson-clips] a DB-oldali leállítás nem igazolt (folyamat 4242: a backend nem állt le vagy már nem létezett) — a zár felszabadulása nincs visszaigazolva",
    "[lesson-clips] a DB-oldali leállítás kérése nem sikerült (folyamat 4242: pool timeout) — a zár felszabadulása nincs visszaigazolva",
  ]);
});
