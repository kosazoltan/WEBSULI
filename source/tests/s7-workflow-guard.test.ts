import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeUnits, invokedInside, loadServer, parseUnit, routeHandlerText, GUARDED_TABLES } from "./helpers/workflow-write-graph";

/**
 * Spec 2026-10-06-s7-workflow-rendbetetel (§4/10, §6 első EARS): nincs lecke-/anyag-/tudástár-módosító útvonal workflow nélkül.
 * A szkenner a `server/` összes `lessons` / `html_files` / `knowledge_maps` / `km_concepts` írási helyétől visszafelé követi a
 * hívási láncot. Minden workflow nélküli végpont CSAK ezen a listán lehet, kategóriával és indokkal; az elavult elem is hiba.
 * Gépi (modelles vagy automatikus) tartalom-előállítás ide nem vehető fel — annak workflow alatt a helye.
 */

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const RUNNERS = new Set(["executeWorkflow", "runToolWorkflow"]);
type Category = "manual-admin" | "backup-restore" | "cli-script" | "scheduled" | "dead-code" | "dispatch";
/** A `dispatch` entry: a function value the PRODUCTION wiring invokes inside a workflow — proven lexically below. */
type Proof = { file: string; runner?: "executeWorkflow"; pattern: RegExp };
type Allowed = { category: Category; reason: string; proof?: Proof[] };

/** The web-research production wiring: the job runner always has the workflow store; run() executes runWork in a workflow. */
const WEB_WIRING: Proof[] = [
  { file: "server/studio/web-research-routes.ts", pattern: /createResearchJobs\(researchJobStore, generate, workflowStore, \{ mode: studioPipeline \? "webStudio" : "web" \}\)/ },
  { file: "server/studio/web-research-jobs.ts", runner: "executeWorkflow", pattern: /return runWork\(job, onStarted\);/ },
  { file: "server/studio/web-research-jobs.ts", pattern: /if \(workflows\) throw new WebResearchFailure\("Ehhez a készítéshez nincs workflow-napló/ },
];

const ALLOWLIST: Record<string, Allowed> = {
  // ── Kézi (emberi) anyagkezelés: a tanár/admin maga írja vagy rendezi az anyagot; nincs gépi tartalom-előállítás.
  "route:POST /api/html-files@server/routes.ts": { category: "manual-admin", reason: "Kézi anyagfeltöltés: a tanár által adott HTML kerül be, modell nem állít elő tartalmat." },
  "route:PATCH /api/html-files/:id@server/routes.ts": { category: "manual-admin", reason: "Kézi metaadat-szerkesztés (cím, leírás, osztály); a tartalom nem változik (updateHtmlFile)." },
  "route:POST /api/html-files/reorder@server/routes.ts": { category: "manual-admin", reason: "Kézi sorrendezés (displayOrder); a tananyag tartalma nem változik." },
  "route:DELETE /api/html-files/:id@server/routes.ts": { category: "manual-admin", reason: "Kézi anyagtörlés az admin felületről; nincs gépi tartalom-módosítás." },
  "route:POST /materials/bulk-delete@server/routes.ts": { category: "manual-admin", reason: "Kézi tömeges törlés az admin felületről; nincs gépi tartalom-módosítás." },
  "route:POST /materials/bulk-move@server/routes.ts": { category: "manual-admin", reason: "Kézi tömeges áthelyezés (osztály); a tananyag tartalma nem változik." },
  "route:PATCH /concepts/:id@server/studio/routes.ts": { category: "manual-admin", reason: "Tanári kurálás a tudástárban; a verbatimOk-ot a szerver számolja (D1), jóváhagyott térkép nem módosítható." },
  "route:POST /maps/:id/approve@server/studio/routes.ts": { category: "manual-admin", reason: "Emberi jóváhagyás a canApprove kapun át; csak az állapot változik, tartalom nem." },
  "route:DELETE /maps/:id@server/studio/routes.ts": { category: "manual-admin", reason: "Piszkozat-térkép kézi törlése (csak draft); nincs gépi tartalom-előállítás." },
  // ── Mentés/visszaállítás/szinkron: katasztrófa-helyreállítás, korábbi állapot visszatöltése.
  "route:POST /backups/:id/restore@server/routes.ts": { category: "backup-restore", reason: "Adatbázis-mentés kézi visszaállítása; korábbi, már ellenőrzött állapot kerül vissza." },
  "route:POST /backups/import@server/routes.ts": { category: "backup-restore", reason: "Exportált mentés kézi importja; korábbi, már ellenőrzött állapot kerül vissza." },
  "route:POST /file-backups/restore/:filename@server/routes.ts": { category: "backup-restore", reason: "Fájl-mentés kézi visszaállítása; korábbi, már ellenőrzött állapot kerül vissza." },
  "route:POST /improvement-backups/:id/restore@server/routes.ts": { category: "backup-restore", reason: "Javítás előtti mentés kézi visszaállítása (visszavonás); a javítás maga apply workflow-ban futott." },
  "route:POST /sync-from-production@server/routes.ts": { category: "backup-restore", reason: "Fejlesztői adatbázis szinkronja az élesből (admin); tartalmat nem állít elő." },
  // ── Parancssori szkriptek (nem a szerver kérés-útján futnak).
  "module@server/clearDevDatabase.ts": { category: "cli-script", reason: "Fejlesztői adatbázis-ürítő parancssori szkript; a szerver nem hívja." },
  "module@server/copyProductionToDev.ts": { category: "cli-script", reason: "Élesből fejlesztőibe másoló szkript (a /sync-from-production admin útvonal is ezt hívja)." },
  "module@server/migrateFromNeon.ts": { category: "cli-script", reason: "Egyszeri adatbázis-migráló parancssori szkript; a szerver nem hívja." },
  "module@server/restoreFromJson.ts": { category: "cli-script", reason: "JSON-mentésből visszaállító parancssori szkript; a szerver nem hívja." },
  "module@server/scripts/dbDiagnose.ts": { category: "cli-script", reason: "Diagnosztikai parancssori szkript (kézi javítás); a szerver nem hívja." },
  "module@server/scripts/debugApply.ts": { category: "cli-script", reason: "Hibakereső parancssori szkript (kézi alkalmazás); a szerver nem hívja." },
  "module@server/scripts/repairMaterialTitles.ts": { category: "cli-script", reason: "Címjavító parancssori szkript (visszafordítható); a szerver nem hívja." },
  "module@server/updateClassroom0Titles.ts": { category: "cli-script", reason: "Egyszeri címfrissítő parancssori szkript; a szerver nem hívja." },
  // ── Ütemezett, tartalmat nem érintő írás.
  "value:runScheduledPublishingCheck@server/scheduledPublishing.ts": { category: "scheduled", reason: "Ütemezett közzététel: csak a tulajdonos (user_id) áll be a láthatósághoz, a tartalom nem változik." },
  // ── Hívó nélküli kód.
  "unreferenced:deleteUser@server/storage.ts": { category: "dead-code", reason: "Nincs hívója; felhasználó-törlésnél csak az anyag tulajdonosát nullázná, tartalmat nem." },
  // ── Termelési összerakás: függvényérték, amelyet a workflow-n belül hívnak (gépi bizonyítékkal).
  "route:POST /web-research/jobs@server/studio/web-research-routes.ts": { category: "dispatch", reason: "A HTML-út (rollback) írása a jobs.run → executeWorkflow → runWork láncon fut; a futtató mindig workflow-tárolóval épül.", proof: WEB_WIRING },
  "route:POST /web-research/jobs/:id/publish@server/studio/web-research-routes.ts": { category: "dispatch", reason: "Folytatás csak workflow-ban (run → executeWorkflow); napló nélküli job workflow-tárolóval nem publikálható.", proof: WEB_WIRING },
  "route:POST /web-research/chat@server/studio/web-research-routes.ts": { category: "dispatch", reason: "A régi stream-kliens is a jobs.start → run → executeWorkflow úton indít; közvetlen írás nincs.", proof: WEB_WIRING },
  "value:publish@server/studio/web-research-jobs.ts": { category: "dispatch", reason: "A jobs objektum publish metódusa: nyomon követett jobnál run → executeWorkflow, különben workflow-tárolóval hiba.", proof: WEB_WIRING },
  "value:runOneStepInWorkflow@server/studio/web-research-routes.ts": { category: "dispatch", reason: "A webes Studio-gyártás: generate → manufacture a webStudio futás runWork-jében, executeWorkflow alatt.", proof: [
    ...WEB_WIRING,
    { file: "server/studio/web-research-routes.ts", pattern: /manufacture: runOneStepInWorkflow/ },
    { file: "server/studio/web-research-jobs.ts", pattern: /const studio = await generate\(job\.input, observer\);/ },
  ] },
};

const units = loadServer(ROOT);

test("a futtató bizonyítottan workflow-ban hív: runToolWorkflow a munkát executeWorkflow argumentumában futtatja", () => {
  assert.ok(invokedInside(units, "server/workflows/tool-run.ts", "executeWorkflow", /await work\(\)/));
});

test("forrás-ellenőrzés: minden védett írás workflow alatt fut, vagy indokolt engedélylistán van (és fordítva)", () => {
  const { sites, terminals } = analyzeUnits(units, RUNNERS);
  assert.ok(sites.length >= 40, `túl kevés írási hely (${sites.length}) — a szkenner elromlott?`);
  for (const table of GUARDED_TABLES) assert.ok(sites.some((s) => s.table === table), `nincs írási hely: ${table}`);
  const found = [...terminals.keys()].sort();
  const allowed = Object.keys(ALLOWLIST).sort();
  const missing = found.filter((k) => !Object.hasOwn(ALLOWLIST, k)).map((k) => `${k} <- ${[...terminals.get(k)!.sites].join(", ")}`);
  const stale = allowed.filter((k) => !terminals.has(k));
  assert.deepEqual(missing, [], `workflow nélküli lecke/anyag/tudástár-írás:\n${missing.join("\n")}`);
  assert.deepEqual(stale, [], `elavult engedély (már nincs ilyen végpont):\n${stale.join("\n")}`);
});

test("minden engedély kategorizált és indokolt; a dispatch-elemek bizonyítéka a kódban igaz", () => {
  const categories: Category[] = ["manual-admin", "backup-restore", "cli-script", "scheduled", "dead-code", "dispatch"];
  for (const [key, entry] of Object.entries(ALLOWLIST)) {
    assert.ok(categories.includes(entry.category), key);
    assert.ok(entry.reason.trim().length >= 20, `rövid indok: ${key}`);
    if (entry.category === "dispatch") {
      assert.ok(entry.proof?.length, `dispatch bizonyíték nélkül: ${key}`);
      for (const proof of entry.proof!) {
        const ok = proof.runner ? invokedInside(units, proof.file, proof.runner, proof.pattern)
          : proof.pattern.test(readFileSync(join(ROOT, proof.file), "utf8"));
        assert.ok(ok, `${key}: a bizonyíték nem igaz (${proof.file} ${proof.pattern})`);
      }
    } else assert.equal(entry.proof, undefined, key);
  }
});

test("a korábban workflow nélküli utak a kijelölt módban futnak (H, I, J, K, B)", () => {
  const expectations: Array<[string, string, string, RegExp]> = [
    ["server/routes.ts", "post", "/html-fix/errors", /runToolWorkflow\(\{ mode: "htmlAssist"/],
    ["server/routes.ts", "post", "/html-fix/theme", /runToolWorkflow\(\{ mode: "htmlAssist"/],
    ["server/routes.ts", "post", "/html-fix/chat", /runToolWorkflow\(\{ mode: "htmlAssist"/],
    ["server/routes.ts", "post", "/html-fix/apply", /runToolWorkflow\(\{ mode: "apply"/],
    ["server/routes.ts", "post", "/material-creator/chat", /runToolWorkflow\(\{ mode: "creator"/],
    ["server/routes.ts", "post", "/api/ai/enhanced-creator/analyze-files", /runToolWorkflow\(\{ mode: "creator"/],
    ["server/routes.ts", "post", "/api/ai/enhanced-creator/analyze-file", /runToolWorkflow\(\{ mode: "creator"/],
    ["server/routes.ts", "post", "/api/ai/enhanced-creator/chatgpt-chat", /runToolWorkflow\(\{ mode: "creator"/],
    ["server/routes.ts", "post", "/api/ai/enhanced-creator/claude-chat", /runToolWorkflow\(\{ mode: "creator"/],
    ["server/routes.ts", "post", "/api/admin/materials/:id/generate-quiz", /generateMaterialQuiz\(id, countRaw, req\.user!\.id\)/],
    ["server/studio/routes.ts", "post", "/maps/extract", /runToolWorkflow\(\{ mode: "map"/],
    ["server/studio/routes.ts", "post", "/maps/:id/recheck", /runToolWorkflow\(\{ mode: "mapCheck"/],
    ["server/studio/lesson-pipeline-routes.ts", "post", "/lessons/from-map/:mapId", /correctMapInWorkflow\(/],
  ];
  for (const [file, method, path, pattern] of expectations) {
    const handler = routeHandlerText(units, file, method, path);
    assert.ok(handler, `nincs ilyen útvonal: ${method.toUpperCase()} ${path}`);
    assert.match(handler, pattern, `${path}: nem a kijelölt workflow-módban fut`);
  }
  assert.ok(invokedInside(units, "server/gameQuizGeneratorService.ts", "runToolWorkflow", /workflowPhase\("save"\)/), "J: a mentés a quiz futás save lépésében");
  assert.ok(invokedInside(units, "server/studio/lesson-pipeline-routes.ts", "runToolWorkflow", /correctMapFromOwner\(mapId, undefined, false\)/), "B: a helyesbítés mapCheck futásban");
});

test("C egy futásban: nincs külön indított upload-futás és nincs utólag kitöltött lépés a webes Studio-úton", () => {
  for (const unit of units) assert.doesNotMatch(unit.source.text, /outsideWorkflow\(/, `${unit.rel}: workflow-kontextusból kilépő futás`);
  const handoff = readFileSync(join(ROOT, "server/studio/web-studio-handoff.ts"), "utf8");
  assert.doesNotMatch(handoff, /startOneStepRun|deps\.start\(/);
  const jobs = readFileSync(join(ROOT, "server/studio/web-research-jobs.ts"), "utf8");
  const studioBranch = jobs.slice(jobs.indexOf('if (mode === "webStudio") {'), jobs.indexOf('const artifact = await workflowCheckpoint("web-result"'));
  assert.ok(studioBranch.length > 0);
  assert.doesNotMatch(studioBranch, /workflowPhase\("(knowledge|author|gate|publish)"\)/, "a webStudio ág nem tölt ki lépést utólag");
});

test("B′: workflow-napló nélküli job folytatása nem hajt lecke-írást (WorkflowConflict)", () => {
  const routes = readFileSync(join(ROOT, "server/studio/lesson-pipeline-routes.ts"), "utf8");
  const branch = routes.slice(routes.indexOf("if (!start && !previous) {"), routes.indexOf("let drove = false;"));
  assert.match(branch, /throw new WorkflowConflict\("Ehhez a készítéshez nincs workflow-napló/);
  assert.doesNotMatch(branch, /guardedDrive\(/);
});

test("negatív kontroll: a szkenner a workflow nélküli írást jelzi, a workflow-n belülit nem", () => {
  const source = parseUnit("server/fixture.ts", `
    import express from "express";
    const router = express.Router();
    async function save(id: string) { await db.update(lessons).set({}).where(id); }
    async function guarded(id: string) { await executeWorkflow(store, { id }, async () => { await save(id); return { kind: "material", id }; }); }
    async function viaTool(id: string) { await runToolWorkflow({ mode: "quiz" }, async () => { await db.insert(htmlFiles).values({}); return { value: 1, result: { kind: "material", id } }; }); }
    router.post("/guarded", async () => { await guarded("a"); await viaTool("b"); });
    router.post("/naked", async () => { await save("x"); });
    await db.execute(sql\`DELETE FROM km_concepts\`);
  `);
  const { terminals } = analyzeUnits([source], RUNNERS);
  assert.deepEqual([...terminals.keys()].sort(), ["module@server/fixture.ts", "route:POST /naked@server/fixture.ts"]);
  assert.deepEqual([...analyzeUnits([source], new Set(["executeWorkflow"])).terminals.keys()].sort(),
    ["module@server/fixture.ts", "route:POST /guarded@server/fixture.ts", "route:POST /naked@server/fixture.ts"], "bizonyítatlan futtató nem véd");
});
