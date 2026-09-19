import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { respondToResume, guardResumedDrive } from "../server/studio/resume-response";
import type { JobView } from "../server/studio/step-runner";

test("uncaught resumed failure closes nonterminal jobs without losing output or rewriting terminal jobs", async () => {
  for (const state of ["pending", "running", "ok", "done", "error"]) {
    const job: JobView = { id: "job", mapId: "map", lessonId: "draft", step: state === "done" || state === "error" ? state : "animator", status: state, round: 2, inputHash: "hash", output: { preserved: true }, error: state === "error" ? "original error" : null };
    let writes = 0;
    await assert.rejects(guardResumedDrive("job", { loadJob: async () => job, saveStep: async (_id, patch) => { writes++; Object.assign(job, patch); } }, async () => { throw new Error("prompt lookup failure"); }), /prompt lookup/);
    assert.equal(writes, state === "done" || state === "error" ? 0 : 1);
    assert.equal(job.step, state === "done" ? "done" : "error");
    assert.deepEqual(job.output, { preserved: true });
    if (state === "error") assert.equal(job.error, "original error");
    assert.equal(job.round, 2);
  }
});

for (const laterFailure of [false, true]) {
  test(`resume responds before blocked work completes, late failure=${laterFailure}`, async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let completed = false;
    let workDone: Promise<void> | undefined;
    const app = express();
    app.post("/resume", (_req, res) => {
      workDone = respondToResume(res, "job", async accepted => {
        accepted();
        await gate;
        completed = true;
        if (laterFailure) throw new Error("saved provider failure");
      });
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/resume`, { method: "POST", signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { jobId: "job" });
      assert.equal(completed, false);
      release(); await workDone;
      assert.equal(completed, true);
    } finally {
      release(); await workDone;
      await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    }
  });
}

test("resume rejects before acceptance and keeps idempotent completion at 200", async () => {
  const app = express();
  app.post("/reject", (_req, res) => { void respondToResume(res, "job", async () => { throw new Error("lease conflict"); }); });
  app.post("/done", (_req, res) => { void respondToResume(res, "job", async () => {}); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  try {
    const base = `http://127.0.0.1:${address.port}`;
    const rejected = await fetch(`${base}/reject`, { method: "POST" });
    assert.equal(rejected.status, 409); assert.deepEqual(await rejected.json(), { message: "lease conflict" });
    const done = await fetch(`${base}/done`, { method: "POST" });
    assert.equal(done.status, 200); assert.deepEqual(await done.json(), { jobId: "job" });
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});