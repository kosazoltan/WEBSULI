import { teachingHtml } from "./helpers/teaching-html";
import { syntheticTeachingReviewEvidence } from "./helpers/teaching-review";
// Standalone real PostgreSQL contract probe; ONLY a disposable localhost database.
// DATABASE_URL=postgres://postgres@127.0.0.1:<port>/research_test node --import tsx tests/web-research-database.integration.ts
import assert from "node:assert/strict";
import pg from "pg";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { StoredResearchJob } from "../server/studio/web-research-jobs";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.pathname !== "/research_test" || process.env.DEV_DATABASE_URL) throw new Error("Only isolated localhost /research_test is allowed.");
const setup = new pg.Pool({ connectionString: url.href });
await setup.query(`CREATE TABLE users (id varchar PRIMARY KEY);
CREATE TABLE ai_generation_requests (id varchar PRIMARY KEY, user_id varchar REFERENCES users(id), prompt text NOT NULL, generated_content text, status varchar NOT NULL, error text, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE html_files (id varchar PRIMARY KEY, user_id varchar REFERENCES users(id), title text NOT NULL, content text NOT NULL, description text, classroom integer NOT NULL DEFAULT 1, content_type varchar NOT NULL DEFAULT 'html', display_order integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now());
INSERT INTO users VALUES ('owner'), ('other');`);
const { researchJobStore: store } = await import("../server/studio/web-research-job-store");
const { dbPool } = await import("../server/db");
try {
  const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és a területképlet.", subject: "matematika", experience: standardFusionFixture().experience };
  const html = `<!DOCTYPE html><html><body><a href="https://www.oktatas.hu/">Forrás</a>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script><script>const data=JSON.parse(document.getElementById('websuli-lesson-data').textContent);</script></body></html>`;
  const job: StoredResearchJob = { id: "probe", userId: "owner", input: { message: "Készíts", classroom: 4 }, state: "ready", stage: "Mentés", createdAt: Date.now(), title: "Teszt", message: "Készíts", content: "", sources: [{ url: "https://www.oktatas.hu/", title: "Forrás" }], diagnostics: [], html };
  job.reviewEvidence = syntheticTeachingReviewEvidence(html, job.sources);
  assert.deepEqual((await Promise.all([store.create(job), store.create(job)])).sort(), [false, true]);
  assert.equal(await store.read(job.id, "other"), null);
  await assert.rejects(store.publish(job.id, "other"), /nem található/);
  await store.update({ ...job, reviewEvidence: undefined }, "ready");
  await assert.rejects(store.publish(job.id, "owner"), /lektorálás/);
  assert.equal((await setup.query("SELECT count(*)::int AS n FROM html_files")).rows[0].n, 0);
  await store.update(job, "ready");
  // Force a failure AFTER inserting a material but BEFORE the job becomes done.
  await setup.query(`CREATE FUNCTION reject_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'web_research_done' THEN RAISE EXCEPTION 'simulated storage failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER reject_completion BEFORE UPDATE ON ai_generation_requests FOR EACH ROW EXECUTE FUNCTION reject_completion();`);
  await assert.rejects(store.publish(job.id, "owner"), (error: Error) => {
    assert.equal((error.cause as Error)?.message, "simulated storage failure"); return true;
  });
  assert.equal((await setup.query("SELECT count(*)::int AS n FROM html_files")).rows[0].n, 0);
  assert.equal((await store.read(job.id, "owner"))?.state, "ready");
  await setup.query("DROP TRIGGER reject_completion ON ai_generation_requests");
  const published = await Promise.all([store.publish(job.id, "owner"), store.publish(job.id, "owner")]);
  assert.ok(published.every(j => j.state === "done" && j.materialId === job.id));
  const records = (await setup.query("SELECT content, classroom FROM html_files")).rows;
  assert.equal(records.length, 1); assert.equal(records[0].content, html); assert.equal(records[0].classroom, 7);
  await store.update({ ...job, state: "error" }, "running");
  assert.equal((await store.read(job.id, "owner"))?.state, "done");
  console.log("PASS: real PostgreSQL atomic rollback, concurrent publication, idempotency, owner isolation, inferred grade, terminal-state preservation.");
} finally { await setup.end(); await dbPool.end(); }
