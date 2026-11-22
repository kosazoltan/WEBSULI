import { test } from "node:test";
import assert from "node:assert/strict";
import { ClipAbortError } from "../server/lesson-clips";
import { clipLockState, exclusiveWithLock, forceReleaseClipLock, type LockClient } from "../server/lesson-clips-lock";

// docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md („zár-életciklus”): a lefoglalt kapcsolatot EGY egyszer használható
// release-objektum birtokolja a zárkéréstől a release-ig; a normál feloldás és a kényszerített eldobás is ezen megy át, idempotensen.
// Adatbázis nélkül: csonkolt kapcsolat (a valódi Postgres-próba: tests/lesson-clips-db.integration.ts).

type Step = "ok" | "busy" | "hang" | "error";
function fakeClient(lock: Step, unlock: Step) {
  const releases: Array<Error | undefined> = [];
  const pending: Array<(e: Error) => void> = [];
  const client: LockClient = {
    query: (config) => new Promise((resolve, reject) => {
      const step = config.text.includes("unlock") ? unlock : lock;
      if (step === "hang") { pending.push(reject); return; }
      if (step === "error") { reject(new Error("query read timeout")); return; }
      resolve({ rows: [{ ok: step === "ok" }] });
    }),
    release: (error) => {
      releases.push(error instanceof Error ? error : undefined);
      // A kapcsolat bontása a függő lekérdezést hibával zárja (mint a pg-nél).
      for (const reject of pending.splice(0)) reject(new Error("Connection terminated"));
    },
  };
  return { client, releases };
}
const KEY = 42, TIMEOUT = 15_000;
const tick = () => new Promise((r) => setTimeout(r, 5));

test("zár-életciklus: normál út — munka, feloldás, egyetlen visszaadás a poolnak; utána nincs mit eldobni", async () => {
  const { client, releases } = fakeClient("ok", "ok");
  assert.equal(await exclusiveWithLock(async () => client, KEY, TIMEOUT, async () => 5), 5);
  assert.deepEqual(releases, [undefined], "egyszer, hiba nélkül (vissza a poolba)");
  assert.equal(clipLockState(), "none");
  assert.equal(forceReleaseClipLock(), false, "release után nincs zárat tartó kapcsolat");
  assert.equal(releases.length, 1);
});

test("zár-életciklus: foglalt zár — nincs munka, egyetlen visszaadás", async () => {
  const { client, releases } = fakeClient("busy", "ok");
  let worked = false;
  assert.equal(await exclusiveWithLock(async () => client, KEY, TIMEOUT, async () => { worked = true; return 1; }), null);
  assert.deepEqual([worked, releases], [false, [undefined]]);
  assert.equal(clipLockState(), "none");
});

test("zár-életciklus: kényszerített eldobás a zárkérés alatt — pontosan egy eldobás, a munka nem indul", async () => {
  const { client, releases } = fakeClient("hang", "ok");
  let worked = false;
  const run = exclusiveWithLock(async () => client, KEY, TIMEOUT, async () => { worked = true; return 1; });
  await tick();
  assert.equal(clipLockState(), "locking");
  assert.equal(forceReleaseClipLock(), true);
  await assert.rejects(run, ClipAbortError);
  assert.equal(worked, false);
  assert.equal(releases.length, 1);
  assert.ok(releases[0] instanceof Error, "eldobva (nem vissza a poolba)");
  assert.equal(forceReleaseClipLock(), false, "második eldobás nincs");
});

test("zár-életciklus: kényszerített eldobás a munka alatt — pontosan egy eldobás, utána az érvényesség-ellenőrzés dob", async () => {
  const { client, releases } = fakeClient("ok", "ok");
  let alive!: () => void, finishWork!: () => void;
  const workDone = new Promise<void>((resolve) => { finishWork = resolve; });
  const run = exclusiveWithLock(async () => client, KEY, TIMEOUT, async (check) => { alive = check; await workDone; return 1; });
  await tick();
  assert.equal(clipLockState(), "working");
  alive();
  assert.equal(forceReleaseClipLock(), true);
  await assert.rejects(run, ClipAbortError);
  assert.throws(() => alive(), ClipAbortError, "az eldobás után a munka nem indíthat DB-utasítást");
  finishWork(); await tick();
  assert.equal(releases.length, 1);
  assert.ok(releases[0] instanceof Error);
});

test("zár-életciklus: a munka kész, a feloldás válasza elakad — a kényszerített eldobás pontosan egyszer bontja a kapcsolatot", async () => {
  const { client, releases } = fakeClient("ok", "hang");
  const run = exclusiveWithLock(async () => client, KEY, TIMEOUT, async () => 7);
  await tick();
  assert.equal(clipLockState(), "unlocking", "a release-objektum a feloldás alatt is él");
  assert.equal(releases.length, 0);
  assert.equal(forceReleaseClipLock(), true, "a feloldás alatt is eldobható");
  assert.equal(await run, 7, "a munka eredménye megmarad");
  assert.equal(releases.length, 1);
  assert.ok(releases[0] instanceof Error);
  assert.equal(forceReleaseClipLock(), false);
  assert.equal(releases.length, 1, "idempotens");
});

test("zár-életciklus: a zár- vagy a feloldó lekérdezés hibája / időtúllépése a kapcsolatot eldobja (bizonytalan állapot)", async () => {
  const lockFail = fakeClient("error", "ok");
  await assert.rejects(exclusiveWithLock(async () => lockFail.client, KEY, TIMEOUT, async () => 1), /read timeout/);
  assert.equal(lockFail.releases.length, 1);
  assert.ok(lockFail.releases[0] instanceof Error);
  const unlockFail = fakeClient("ok", "error");
  assert.equal(await exclusiveWithLock(async () => unlockFail.client, KEY, TIMEOUT, async () => 2), 2);
  assert.equal(unlockFail.releases.length, 1);
  assert.ok(unlockFail.releases[0] instanceof Error);
  assert.equal(clipLockState(), "none");
});

test("zár-életciklus: egy párhuzamos (foglalt zárat kapó) második hívás nem takarja el a zárat tartó kapcsolatot", async () => {
  const holderConn = fakeClient("ok", "ok"), second = fakeClient("busy", "ok");
  let finishWork!: () => void;
  const workDone = new Promise<void>((resolve) => { finishWork = resolve; });
  const run = exclusiveWithLock(async () => holderConn.client, KEY, TIMEOUT, async () => { await workDone; return 1; });
  await tick();
  assert.equal(await exclusiveWithLock(async () => second.client, KEY, TIMEOUT, async () => 2), null);
  assert.equal(clipLockState(), "working", "a zárat tartó kapcsolat továbbra is nyilvántartott");
  assert.equal(forceReleaseClipLock(), true);
  await assert.rejects(run, ClipAbortError);
  finishWork(); await tick();
  assert.deepEqual([holderConn.releases.length, second.releases], [1, [undefined]]);
});
