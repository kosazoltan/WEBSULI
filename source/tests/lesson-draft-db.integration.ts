import { test, before, after } from "node:test";
import assert from "node:assert/strict";

/* docs/specs/2026-10-15-hiba-gombok.md — a megszakadt piszkozat felismerése (E1) és a kifejezett újragyártás (E3), valódi Postgresen. */

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const { oneStepRunView, closeOrphanedOneStepRuns, ownerDrafts, discardDraft, discardDraftsWithPublished, redundantDraftCount, ownerDraftTotal } = await import("../server/studio/lesson-pipeline-routes");

let n = 0;
async function mapWithJob(job: { status?: string; published?: boolean; output?: Record<string, unknown>; age?: string; owner?: string | null; map?: string }) {
  n += 1;
  const map = job.map ?? (await dbPool.query("INSERT INTO knowledge_maps(title,subject,classroom,source_files,input_hash) VALUES ('T','matematika',5,'[]'::jsonb,$1) RETURNING id", [`draft-hash-${n}`])).rows[0].id as string;
  const lesson = (await dbPool.query("INSERT INTO lessons(map_id,json,published_at) VALUES ($1,'{}'::jsonb,$2) RETURNING id", [map, job.published ? new Date() : null])).rows[0].id as string;
  const output = job.output ?? { lesson: { title: "Piszkozat" } };
  const id = (await dbPool.query(`INSERT INTO studio_jobs(lesson_id,map_id,step,status,input_hash,output,created_at) VALUES ($1,$2,'author',$3,'h',$4::jsonb, now() - $5::interval) RETURNING id`,
    [lesson, map, job.status ?? "error", JSON.stringify(output), job.age ?? "1 hour"])).rows[0].id as string;
  // A job gazdája a workflow-ja (review #248: csak a saját piszkozat ajánlható fel / tehető félre).
  // owner: null → gazdátlan job (régi, workflow nélküli futás).
  if (job.owner !== null) await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,snapshot) VALUES ($1,$2,'error','{}'::jsonb)", [id, job.owner ?? "draft-owner"]);
  return { map, id };
}

before(async () => { await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('draft-owner','draft@test.invalid',true),('draft-other','draft-other@test.invalid',true)"); });
// A workflow-sorok fixtúrák (nincs teljes pillanatképük): a fájl végén eltűnnek, hogy a minden sort átfésülő tesztek (lesson-skill) ne lássák.
after(async () => { await dbPool.query("DELETE FROM users WHERE id IN ('draft-owner','draft-other')"); await dbPool.end(); });

test("E2: a választó futás a piszkozat régi futására mutat; folytatás után a job valódi állapotát mutatja (régi futás nélkül is)", async () => {
  const { map, id } = await mapWithJob({ output: { lesson: { title: "P" }, teaching: [] } });
  await dbPool.query("INSERT INTO one_step_runs(id,phase,map_id,job_id) VALUES ('old-run-1','error',$1,$2),('choice-run-1','draft',$1,$2)", [map, id]);
  const choice = await oneStepRunView("choice-run-1");
  assert.equal(choice?.phase, "draft");
  assert.equal((choice as { draftRunId?: string }).draftRunId, "old-run-1");
  assert.ok("resumable" in (choice ?? {}), "a választásnál a folytathatóság is látszik");
  // A folytatás elindult: a job ismét fut — a választó futás már nem ragad a választásnál.
  await dbPool.query("DELETE FROM one_step_runs WHERE id = 'old-run-1'");
  await dbPool.query("UPDATE studio_jobs SET status = 'running', step = 'animator', error = NULL WHERE id = $1", [id]);
  const progressing = await oneStepRunView("choice-run-1");
  assert.equal(progressing?.phase, "animator");
  assert.equal(progressing?.error, null);
});

test("review #247 / S4b (docs/specs/2026-10-16-egy-futas.md): újraindításkor csak az ÉPP MÁSHOL vitt job futása marad nyitva; a többi lezárul (nincs automatikus folytatás)", async () => {
  // S4b (docs/specs/2026-10-16-egy-futas.md): a régi lépésgép automatikus folytatása megszűnt — a lejárt lízingű, félbemaradt job futása is lezárul (a piszkozat megmarad,
  // újragyártható); csak az élő lízingű (egy másik folyamat által épp vitt) job futása marad nyitva.
  const expired = await mapWithJob({ status: "running" });
  await dbPool.query("UPDATE lesson_workflow_runs SET state='running', lease_until = now() - interval '1 minute', snapshot='{\"executions\":1}'::jsonb WHERE id=$1", [expired.id]);
  const driven = await mapWithJob({ status: "running" });
  await dbPool.query("UPDATE lesson_workflow_runs SET state='running', lease_until = now() + interval '1 minute', snapshot='{\"executions\":1}'::jsonb WHERE id=$1", [driven.id]);
  const failed = await mapWithJob({ status: "error" });
  await dbPool.query("INSERT INTO one_step_runs(id,phase,map_id,job_id) VALUES ('boot-expired','animator',$1,$2),('boot-driven','animator',$3,$4),('boot-failed','animator',$5,$6)",
    [expired.map, expired.id, driven.map, driven.id, failed.map, failed.id]);
  await closeOrphanedOneStepRuns();
  const run = async (id: string) => (await dbPool.query("SELECT phase FROM one_step_runs WHERE id=$1", [id])).rows[0];
  assert.equal((await run("boot-expired")).phase, "error", "lejárt lízing: nincs automatikus folytatás, a futás lezárul");
  assert.equal((await run("boot-driven")).phase, "animator", "élő lízing: egy másik folyamat viszi, a futás nyitva marad");
  assert.equal((await run("boot-failed")).phase, "error", "nem folytatható job futása nem pollozhat örökké");
});

test("admin „Tananyag draft” (A1/A2): a saját megállt és futó piszkozat látszik, a publikált / félretett / sikeres / idegen nem", async () => {
  await dbPool.query("DELETE FROM users WHERE id = 'draft-lister'");
  await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('draft-lister','lister@test.invalid',true)");
  try {
    const parts = { experienceCheckpoint: { parts: { a: {}, b: {} } } };
    const stopped = await mapWithJob({ owner: "draft-lister", output: { lesson: { title: "Virágos növények", sections: [{}, {}, {}] }, ...parts } });
    const running = await mapWithJob({ owner: "draft-lister", status: "running", output: { lesson: { sections: [{}] } } });
    await mapWithJob({ owner: "draft-lister", published: true });
    await mapWithJob({ owner: "draft-lister", status: "ok" });
    await mapWithJob({ owner: "draft-lister", output: { lesson: {}, recoveryState: "superseded" } });
    await mapWithJob({ owner: "draft-lister", output: { title: "nincs lecke" } });
    await mapWithJob({ owner: "draft-other" });
    // Review #253: a workflow-pillanatkép a kötegelt lekérdezésből jön (megállási lépés + végrehajtásszám).
    await dbPool.query(`UPDATE lesson_workflow_runs SET snapshot = '{"visits":[{"step":"author","state":"done"},{"step":"gate","state":"error"}],"executions":1}'::jsonb WHERE id=$1`, [stopped.id]);
    const list = await ownerDrafts("draft-lister");
    assert.deepEqual(list.map((d) => d.jobId).sort(), [stopped.id, running.id].sort());
    const s = list.find((d) => d.jobId === stopped.id)!;
    assert.equal(s.title, "Virágos növények");
    assert.deepEqual(s.draft, { teachingSections: 3, savedBankPackets: 2 });
    assert.equal(s.running, false);
    assert.equal(typeof s.resumable, "boolean");
    assert.equal(s.stoppedAt, "gate", "a megállási lépés a workflow-pillanatképből");
    const r = list.find((d) => d.jobId === running.id)!;
    assert.equal(r.running, true);
    assert.equal(r.resumable, false, "futó jobnál nincs folytatás gomb");
    assert.equal(r.title, "T", "lecke-cím nélkül a térkép címe");
  } finally {
    await dbPool.query("DELETE FROM users WHERE id = 'draft-lister'");
  }
});

test("review #250: a megállt futás nézete visszaadja az eredeti tanári kérést (oldalfrissítés utáni újragyártáshoz)", async () => {
  const { map, id } = await mapWithJob({ output: { lesson: { sections: [{}] }, ownerInstruction: "csak a törtek" } });
  await dbPool.query("INSERT INTO one_step_runs(id,phase,map_id,job_id,error) VALUES ('instr-run-1','error',$1,$2,'x')", [map, id]);
  assert.equal((await oneStepRunView("instr-run-1"))?.ownerInstruction, "csak a törtek");
});

test("draft-kezelés (D1–D5): törlés, kötegelt törlés, gazdátlan és kész párral rendelkező jelzés, futó gyártás", async () => {
  await dbPool.query("DELETE FROM users WHERE id = 'draft-mgr'");
  await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('draft-mgr','mgr@test.invalid',true)");
  // A teszt összes jobja (takarításhoz).
  const ownerless: string[] = [];
  try {
    const mine = await mapWithJob({ owner: "draft-mgr" });
    const orphan = await mapWithJob({ owner: null });
    ownerless.push(orphan.id);
    const foreign = await mapWithJob({ owner: "draft-other" });
    const running = await mapWithJob({ owner: "draft-mgr", status: "running" });
    // Kész pár: ugyanabból a térképből publikált lecke van.
    const dup = await mapWithJob({ owner: "draft-mgr" });
    await dbPool.query("INSERT INTO lessons(map_id,json,published_at) VALUES ($1,'{}'::jsonb,now())", [dup.map]);
    const orphanDup = await mapWithJob({ owner: null, map: dup.map });
    ownerless.push(orphanDup.id);
    // Futó gyártás lecke nélkül (újragyártás eleje): a listában, futóként.
    const fresh = (await dbPool.query(`INSERT INTO studio_jobs(map_id,step,status,input_hash,output) VALUES ($1,'pedagogue','running','h','{}'::jsonb) RETURNING id`, [mine.map])).rows[0].id as string;
    await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,snapshot) VALUES ($1,'draft-mgr','running','{}'::jsonb)", [fresh]);
    ownerless.push(mine.id, foreign.id, running.id, dup.id, fresh);

    const list = await ownerDrafts("draft-mgr");
    const ids = list.map((d) => d.jobId);
    for (const id of [mine.id, orphan.id, running.id, dup.id, orphanDup.id, fresh]) assert.ok(ids.includes(id), id);
    assert.ok(!ids.includes(foreign.id), "másik admin piszkozata nem látszik");
    assert.equal(list[0].running, true, "a futó tételek elöl");
    const byId = (id: string) => list.find((d) => d.jobId === id)!;
    assert.equal(byId(orphan.id).ownerless, true);
    assert.equal(byId(orphan.id).resumable, false, "gazdátlan: nincs folytatás (csak újragyártás / törlés)");
    assert.equal(byId(dup.id).hasPublished, true);
    assert.equal(byId(mine.id).hasPublished, false);
    assert.equal(byId(fresh).running, true);
    assert.equal(byId(fresh).step, "pedagogue");

    // D5: másik admin és futó job nem törölhető.
    assert.equal(await discardDraft(foreign.id, "draft-mgr"), false);
    assert.equal(await discardDraft(running.id, "draft-mgr"), false);
    // D1: saját és gazdátlan törölhető; utána nem látszik, és a feltöltési piszkozat-felismerés sem adja vissza.
    assert.equal(await discardDraft(mine.id, "draft-mgr"), true);
    assert.equal(await discardDraft(mine.id, "draft-mgr"), true, "ismételt elvetés: idempotens (az állapot marad)");
    assert.equal(await discardDraft(orphan.id, "draft-mgr"), true);
    // S4b (docs/specs/2026-10-16-egy-futas.md): a feltöltési piszkozat-felajánlás (resumableDraftFor) a régi lépésgéppel együtt megszűnt.
    // D2: a kötegelt törlés csak a kész párral rendelkezőkre hat (saját + gazdátlan). Review #255: a felület által megerősített szám
    // ellenőrzés — eltérésnél nincs törlés; a szerver összesítése ugyanazt a halmazt számolja.
    assert.equal(await redundantDraftCount("draft-mgr"), 2);
    assert.equal(await discardDraftsWithPublished("draft-mgr", 1), null, "eltérő megerősített szám → nincs törlés");
    assert.equal(await redundantDraftCount("draft-mgr"), 2);
    assert.equal(await discardDraftsWithPublished("draft-mgr", 2), 2);
    const after = (await ownerDrafts("draft-mgr")).map((d) => d.jobId);
    for (const id of [mine.id, orphan.id, dup.id, orphanDup.id]) assert.ok(!after.includes(id), `eltűnt: ${id}`);
    assert.ok(after.includes(running.id) && after.includes(fresh));
    assert.equal(await ownerDraftTotal("draft-mgr"), after.length, "a teljes szám a lista feltételével (itt nincs csonkolás)");
    // Review #255 (P2): élő workflow-lízing (épp viszik) mellett nem vethető el — a folytatás a lízing alatt újraellenőriz.
    const leased = await mapWithJob({ owner: "draft-mgr" });
    ownerless.push(leased.id);
    await dbPool.query("UPDATE lesson_workflow_runs SET lease_until = now() + interval '1 minute' WHERE id=$1", [leased.id]);
    assert.equal(await discardDraft(leased.id, "draft-mgr"), false, "élő lízing mellett nincs elvetés");
    await dbPool.query("UPDATE lesson_workflow_runs SET lease_until = now() - interval '1 minute' WHERE id=$1", [leased.id]);
    assert.equal(await discardDraft(leased.id, "draft-mgr"), true, "lejárt lízing után elvethető");
    const state = (await dbPool.query("SELECT output->>'recoveryState' AS s, output->>'discardedBy' AS b FROM studio_jobs WHERE id=$1", [mine.id])).rows[0];
    assert.deepEqual(state, { s: "discarded", b: "draft-mgr" }, "visszaállítható elvetés, a törlő azonosítójával");
  } finally {
    await dbPool.query("DELETE FROM users WHERE id = 'draft-mgr'");
    // A teszt jobjai (a gazda törlése után gazdátlanná válnának) nem jelenhetnek meg más tesztek listájában: az eldobható DB-ből törlődnek.
    if (ownerless.length) await dbPool.query("DELETE FROM studio_jobs WHERE map_id IN (SELECT map_id FROM studio_jobs WHERE id = ANY($1))", [ownerless]);
  }
});

test("újragyártás jóváhagyása (J2): a tervre váró saját job látszik, folytatható jelzéssel és törölhető; másé nem látszik", async () => {
  await dbPool.query("DELETE FROM users WHERE id = 'draft-appr'");
  await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('draft-appr','appr@test.invalid',true)");
  const created: string[] = [];
  try {
    const map = (await dbPool.query("INSERT INTO knowledge_maps(title,subject,classroom,source_files,input_hash) VALUES ('Terv','matematika',6,'[]'::jsonb,'appr-hash') RETURNING id")).rows[0].id as string;
    const job = async (owner: string, output: object) => {
      const id = (await dbPool.query(`INSERT INTO studio_jobs(map_id,step,status,input_hash,output) VALUES ($1,'author','ok','h',$2::jsonb) RETURNING id`, [map, JSON.stringify(output)])).rows[0].id as string;
      await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,snapshot) VALUES ($1,$2,'waiting','{}'::jsonb)", [id, owner]);
      created.push(id);
      return id;
    };
    const waiting = await job("draft-appr", { outline: { sections: [] }, remanufacturedFrom: "x" });
    const approvedAlready = await job("draft-appr", { outline: { sections: [] }, approvedOutline: { sections: [] } });
    const foreign = await job("draft-other", { outline: { sections: [] } });
    const list = await ownerDrafts("draft-appr");
    const w = list.find((d) => d.jobId === waiting);
    assert.ok(w, "a tervre váró job a listában");
    assert.equal(w!.awaitingApproval, true);
    assert.equal(w!.running, false);
    assert.equal(w!.title, "Terv");
    assert.ok(!list.some((d) => d.jobId === approvedAlready), "a már jóváhagyott (nem váró, nem futó) nem jelenik meg ebben az ágban");
    assert.ok(!list.some((d) => d.jobId === foreign), "másik admin jobja nem látszik");
    assert.equal(await discardDraft(foreign, "draft-appr"), false);
    // Review #256 (P2): a folytatott, két napnál régebbi job futás közben sem tűnik el a listából (7 napos ablak).
    const older = (await dbPool.query(`INSERT INTO studio_jobs(map_id,step,status,input_hash,output,created_at) VALUES ($1,'author','running','h','{}'::jsonb, now() - interval '3 days') RETURNING id`, [map])).rows[0].id as string;
    created.push(older);
    await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,snapshot) VALUES ($1,'draft-appr','running','{}'::jsonb)", [older]);
    assert.equal((await ownerDrafts("draft-appr")).find((d) => d.jobId === older)?.running, true, "3 napos futó job látszik");
    assert.equal(await discardDraft(waiting, "draft-appr"), true, "a tervre váró saját job törölhető");
    assert.ok(!(await ownerDrafts("draft-appr")).some((d) => d.jobId === waiting));
  } finally {
    await dbPool.query("DELETE FROM studio_jobs WHERE id = ANY($1)", [created]);
    await dbPool.query("DELETE FROM knowledge_maps WHERE input_hash = 'appr-hash'");
    await dbPool.query("DELETE FROM users WHERE id = 'draft-appr'");
  }
});

test("review #260: az egyfutásos újragyártás foglalása csak saját / gazdátlan, épp nem vitt jobra hat", async () => {
  const { remakeAsSingleRun } = await import("../server/studio/lesson-pipeline-routes");
  const foreign = await mapWithJob({ owner: "draft-other" });
  const leased = await mapWithJob({ owner: "draft-owner" });
  const mine = await mapWithJob({ owner: "draft-owner" });
  try {
    await dbPool.query("UPDATE lesson_workflow_runs SET lease_until = now() + interval '1 minute' WHERE id=$1", [leased.id]);
    await assert.rejects(remakeAsSingleRun(foreign.id, "draft-owner"), /nem a tiéd/);
    await assert.rejects(remakeAsSingleRun(leased.id, "draft-owner"), /épp fut/);
    // A saját job foglalása sikerül; tanítható fogalom nélkül a foglalás visszaáll (nem indul fizetős gyártás). Review #262: az újragyártás
    // a gondozott térképről indul (nem a forrásszövegből), ezért a feltétel a tanítható fogalom.
    await assert.rejects(remakeAsSingleRun(mine.id, "draft-owner"), /nincs tanítható fogalom/);
    const states = (await dbPool.query("SELECT id, output->>'recoveryState' AS s FROM studio_jobs WHERE id = ANY($1)", [[foreign.id, leased.id, mine.id]])).rows;
    for (const row of states) assert.equal(row.s, null, `${row.id}: érintetlen / visszaállt`);
  } finally {
    await dbPool.query("DELETE FROM studio_jobs WHERE id = ANY($1)", [[foreign.id, leased.id, mine.id]]);
  }
});

test("S4a: a különálló kinyerés draft térképet ment (jóváhagyásra váró fogalmak), és a tartalmi lenyomaton idempotens", async () => {
  const { saveSingleRunMap, singleRunMapHash, extractMapSingleRun } = await import("../server/studio/single-run/live");
  const files = [{ name: "lap.txt", kind: "text" as const, content: "A víz körforgása: párolgás, lecsapódás, csapadék." }];
  const hash = singleRunMapHash(files, "Víz");
  assert.equal(hash, singleRunMapHash(files, "Víz"), "determinisztikus lenyomat");
  assert.notEqual(hash, singleRunMapHash(files, "Más cím"));
  const map = { title: "Víz", subject: "természettudomány", classroom: 5, transcript: files[0].content, fileTranscripts: { "lap.txt": files[0].content },
    concepts: [{ id: "parolgas", term: "párolgás", definition: "A víz gőzzé válása.", quote: "párolgás", type: "concept", examWeight: "core" as const, relatedIds: [], verbatimOk: true, sourceFile: "lap.txt" }], corrections: [] };
  const mapId = await saveSingleRunMap(map, files, "draft-owner", "claude-opus-5-5", { draft: true, inputHash: hash });
  try {
    const row = (await dbPool.query("SELECT status, approved_by, source_text, source_files FROM knowledge_maps WHERE id=$1", [mapId])).rows[0];
    assert.equal(row.status, "draft");
    assert.equal(row.approved_by, null);
    assert.equal(row.source_text, files[0].content);
    assert.equal(row.source_files[0].extractedText, files[0].content);
    const concept = (await dbPool.query("SELECT review_state, source_ref FROM km_concepts WHERE map_id=$1", [mapId])).rows[0];
    assert.equal(concept.review_state, "pending", "a fogalom a tanári jóváhagyásra vár");
    assert.deepEqual(concept.source_ref, { file: "lap.txt" });
    // Ugyanaz a tartalom: a meglévő térkép jön vissza, modellhívás nélkül.
    assert.deepEqual(await extractMapSingleRun({ files, title: "Víz", ownerId: "draft-owner" }), { mapId, cached: true });
  } finally {
    await dbPool.query("DELETE FROM km_concepts WHERE map_id=$1", [mapId]);
    await dbPool.query("DELETE FROM knowledge_maps WHERE id=$1", [mapId]);
  }
});

// J5 (docs/specs/2026-10-16-egyfutas-atvilagitas.md): a megállt egyfutásos job a mentett részeiből folytatható, ugyanazon a jobon.
test("J5: a megállt egyfutásos piszkozat folytatható; a foglalás saját / nem vitt jobra hat; ha a motor el sem indul, a job nem ragad „fut” állapotban", async () => {
  const { resumeSingleRun } = await import("../server/studio/lesson-pipeline-routes");
  const { standardFusionFixture } = await import("../shared/fixtures/lesson-fusion");
  const { experience: _bank, ...teaching } = standardFusionFixture();
  const outline = { sections: [{ heading: teaching.sections[0].heading, conceptIds: ["area"], plannedBlocks: ["explain"], animationSuggestions: [] }], misconceptions: [] };
  const output = { outline, lesson: teaching, singleRun: { version: "single-run-1", conversation: { model: "claude-opus-5-5", switchedToFallback: false, turns: [] } } };
  const mine = await mapWithJob({ owner: "draft-owner", output });
  const foreign = await mapWithJob({ owner: "draft-other", output });
  const legacy = await mapWithJob({ owner: "draft-owner" });
  // Fizetős hívás nem indulhat: modellkulcs nélkül a motor nem indul el.
  const keys = ["AI_INTEGRATIONS_ANTHROPIC_API_KEY", "AI_INTEGRATIONS_OPENAI_API_KEY", "OPENAI_API_KEY"] as const;
  const savedKeys = keys.map((k) => process.env[k]);
  for (const k of keys) process.env[k] = "";
  try {
    const drafts = await ownerDrafts("draft-owner");
    const byId = (id: string) => drafts.find((d) => d.jobId === id)!;
    assert.equal(byId(mine.id).resumable, true, "egyfutásos, mentett tanítással: folytatható");
    assert.equal(byId(mine.id).resumeKind, "bank");
    assert.equal(byId(legacy.id).resumable, false, "régi lépésgép jobja: újragyártás");
    await assert.rejects(resumeSingleRun(foreign.id, "draft-owner"), /nem a tiéd/);
    const runId = await resumeSingleRun(mine.id, "draft-owner");
    assert.ok(runId);
    await assert.rejects(resumeSingleRun(mine.id, "draft-owner"), /már elindult|épp fut/, "dupla kattintás nem indít kettőt");
    let row: { status: string; error: string | null } | undefined;
    for (let i = 0; i < 100; i++) {
      row = (await dbPool.query("SELECT status, error FROM studio_jobs WHERE id=$1", [mine.id])).rows[0];
      if (row?.status === "error") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(row?.status, "error", "a motor nem indult (nincs kulcs) — a foglalás visszaállt");
    assert.match(row?.error ?? "", /modell/);
  } finally {
    keys.forEach((k, i) => { if (savedKeys[i] === undefined) delete process.env[k]; else process.env[k] = savedKeys[i]; });
    // A folytatás workflow-ja a háttérben zárul — megvárjuk, mielőtt a sorokat töröljük.
    for (let i = 0; i < 100; i++) {
      const open = (await dbPool.query("SELECT 1 FROM lesson_workflow_runs WHERE snapshot->>'resourceId' = $1 AND lease_until > now()", [mine.id])).rows.length;
      if (!open) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await dbPool.query("DELETE FROM lesson_workflow_runs WHERE id IN (SELECT id FROM lesson_workflow_runs WHERE snapshot->'request'->>'resumeJobId' = $1)", [mine.id]);
    await dbPool.query("DELETE FROM studio_jobs WHERE id = ANY($1)", [[mine.id, foreign.id, legacy.id]]);
  }
});

// Spec 2026-10-16-gyartas-haladas: a draftlista futó tétele a futás részletét, idejét és a háttérfolyamat élő voltát mutatja.
test("haladásjelzés: a futó tétel a legutóbbi futás részletét, eltelt idejét és a lízinget adja (a szerver órája szerint)", async () => {
  const running = await mapWithJob({ owner: "draft-owner", status: "running", age: "5 minutes" });
  const runId = `progress-run-${running.id.slice(0, 8)}`;
  try {
    await dbPool.query("UPDATE studio_jobs SET step='animator' WHERE id=$1", [running.id]);
    await dbPool.query("UPDATE lesson_workflow_runs SET owner_id='draft-owner' WHERE id=$1", [running.id]);
    await dbPool.query("INSERT INTO one_step_runs(id,phase,detail,job_id,started_at,updated_at) VALUES ($1,'animator','Gyakorlóbank: 2/5 csomag kész — a 3. fejezet csomagja készül…',$2, now() - interval '18 minutes', now() - interval '75 seconds')", [runId, running.id]);
    await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,snapshot,lease_until) VALUES ($1,'draft-owner','running','{}'::jsonb, now() + interval '2 minutes')", [runId]);
    const item = (await ownerDrafts("draft-owner")).find((d) => d.jobId === running.id)!;
    assert.equal(item.running, true);
    assert.equal(item.progress?.detail, "Gyakorlóbank: 2/5 csomag kész — a 3. fejezet csomagja készül…");
    assert.ok(Math.abs((item.progress?.elapsedSec ?? 0) - 1080) <= 5, String(item.progress?.elapsedSec));
    assert.ok(Math.abs((item.progress?.sinceUpdateSec ?? 0) - 75) <= 5, String(item.progress?.sinceUpdateSec));
    assert.equal(item.progress?.alive, true);
  } finally {
    await dbPool.query("DELETE FROM lesson_workflow_runs WHERE id=$1", [runId]);
    await dbPool.query("DELETE FROM one_step_runs WHERE id=$1", [runId]);
    await dbPool.query("DELETE FROM studio_jobs WHERE id=$1", [running.id]);
  }
});
