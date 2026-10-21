import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_BUSY_MS, LEGACY_CONCURRENCY, LEGACY_CUTOFF, LEGACY_IDLE_MS, LEGACY_EXCLUDED_IDS, LEGACY_MAX_ATTEMPTS, LEGACY_MIGRATION_MODE, LEGACY_PILOT_IDS, legacyBaseline, legacyCandidates, legacySource, reconcileLegacy, type LegacyRow } from "../server/studio/legacy-migration";
import { LEGACY_BACKUP_NOTE, legacyBackupData } from "../server/studio/pipeline-store";

/* Spec 2026-10-20-regi-anyag-studio-atalakitas: a régi anyagok helyben Stúdió-leckévé — a sor tiszta döntései. */

const row = (over: Partial<LegacyRow> = {}): LegacyRow => ({
  id: "x", title: "4. osztály - Igekötők", contentType: "html", bytes: 70_000, createdAt: new Date("2025-11-06"), views: 10, hasMedia: false, ...over,
});

test("a jelöltek: csak a határnap előtti, nem lecke, nem kizárt anyag; a nézettség szerint", () => {
  const rows = [
    row({ id: "a", views: 5 }), row({ id: "b", views: 50 }),
    row({ id: "uj", createdAt: new Date("2026-06-01T00:00:00Z") }),
    row({ id: "budapest", createdAt: new Date("2026-05-31T22:30:00Z") }),
    row({ id: "kep", hasEmbed: true }),
    row({ id: "lecke", contentType: "lesson" }),
    row({ id: "pdf", contentType: "pdf" }),
    row({ id: "nagy", bytes: 841_000 }),
    row({ id: "zene", hasMedia: true }),
    row({ id: LEGACY_EXCLUDED_IDS[0], title: "8. Osztály Abigél" }),
    row({ id: "abig2", title: "Szabó Magda: ABIGÉL — a regény" }),
  ];
  const all = legacyCandidates(rows, "all");
  assert.deepEqual(all.queue, ["b", "a"]);
  assert.deepEqual(all.skipped.map((s) => s.id).sort(), ["abig2", LEGACY_EXCLUDED_IDS[0], "kep", "nagy", "pdf", "zene"].sort());
  assert.equal(LEGACY_CUTOFF.toISOString(), "2026-05-31T22:00:00.000Z", "Budapest szerinti éjfél");
  assert.ok(all.skipped.every((s) => s.reason.length > 0));
  assert.deepEqual(legacyCandidates(rows, "off").queue, []);
  const pilot = legacyCandidates([...rows, row({ id: LEGACY_PILOT_IDS[0] }), row({ id: LEGACY_PILOT_IDS[1], views: 99 })], "pilot");
  assert.deepEqual(pilot.queue, [LEGACY_PILOT_IDS[1], LEGACY_PILOT_IDS[0]]);
});

test("a kapcsoló a teljes sorra áll (a próba után); az Abigél egyik próba-anyag sem; a korlátok", () => {
  assert.equal(LEGACY_MIGRATION_MODE, "all", "a próba (#349) után mind — tulajdonosi döntés 2026-10-20");
  assert.equal(LEGACY_PILOT_IDS.length, 3);
  for (const id of LEGACY_EXCLUDED_IDS) assert.ok(!LEGACY_PILOT_IDS.includes(id));
  assert.ok(LEGACY_CONCURRENCY >= 1 && LEGACY_CONCURRENCY <= 4);
  assert.equal(LEGACY_MAX_ATTEMPTS, 2);
  // Review #349: tétlenül a Neon 5 perces elalvási küszöbénél ritkábban kérdez.
  assert.ok(LEGACY_IDLE_MS > 5 * 60_000 && LEGACY_BUSY_MS < LEGACY_IDLE_MS);
});

test("az egyeztetés: kész cél → kész; élő futás → fut; leállt futás → folytatás / újrakezdés / hiba", () => {
  const now = Date.parse("2026-10-20T20:00:00Z");
  const base = { attempt: 1, startedAt: now - 60_000, runPhase: "author" as string | null, runUpdatedAt: new Date(now - 60_000), leaseAlive: false, targetIsLesson: false, jobResumable: false };
  assert.equal(reconcileLegacy({ ...base, targetIsLesson: true, runPhase: "error" }, now), "done");
  assert.equal(reconcileLegacy(base, now), "running");
  assert.equal(reconcileLegacy({ ...base, runPhase: null }, now), "running", "a futás sora még nem íródott ki");
  assert.equal(reconcileLegacy({ ...base, runPhase: null, startedAt: now - 11 * 60_000 }, now), "restart");
  assert.equal(reconcileLegacy({ ...base, runPhase: "error", jobResumable: true }, now), "resume");
  assert.equal(reconcileLegacy({ ...base, runPhase: "error" }, now), "restart");
  assert.equal(reconcileLegacy({ ...base, runUpdatedAt: new Date(now - 50 * 60_000) }, now), "restart", "45 percnél régebben némán");
  assert.equal(reconcileLegacy({ ...base, runPhase: "error", attempt: 2 }, now), "error");
  assert.equal(reconcileLegacy({ ...base, runPhase: "done" }, now), "error", "kész, de nem a célt alakította át — nincs duplikátum");
  assert.equal(reconcileLegacy({ ...base, runUpdatedAt: new Date(now - 90 * 60_000), leaseAlive: true }, now), "running", "review #349: élő lízing → fut");
  assert.equal(reconcileLegacy({ ...base, runPhase: "error", jobRunning: true }, now), "running", "review #350: a job épp fut (másik példány folytatása)");
  for (const phase of ["parked", "draft"]) assert.equal(reconcileLegacy({ ...base, runPhase: phase, attempt: 2 }, now), "waiting", phase);
});

test("a forrás: a régi anyag szövege a script és a stílus nélkül, a címmel; az utasítás a tanított tartalmat kéri", () => {
  const html = "<html><head><title>T</title><style>.a{}</style><script>var tasks=[1,2]</script></head><body><h1>Igekötők</h1><p>Az igekötő az ige előtt áll.</p></body></html>";
  const src = legacySource({ title: "4. osztály - Igekötők: és / igék", content: html });
  assert.equal(src.files.length, 1);
  assert.equal(src.files[0].kind, "text");
  assert.equal(src.files[0].name, "4. osztály - Igekötők  és   igék.txt");
  assert.match(src.files[0].content, /^4\. osztály - Igekötők: és \/ igék\n\n/);
  assert.match(src.files[0].content, /Az igekötő az ige előtt áll\./);
  assert.doesNotMatch(src.files[0].content, /var tasks|\.a\{\}/);
  assert.match(src.instructions, /TANÍTOTT tartalmat/);
  assert.match(src.instructions, /évfolyamot a tartalomból/);
});

test("a mentésrekord: a régi sor teljes tartalma visszaállítható", () => {
  const old = { id: "f1", title: "Régi", content: "<html>régi</html>", description: "leírás", classroom: 4, contentType: "html" };
  assert.deepEqual(legacyBackupData({ ...old, ...{} }), old);
  assert.equal(LEGACY_BACKUP_NOTE, "legacy-studio-migration");
  assert.equal(legacyBaseline("a"), legacyBaseline("a"));
  assert.notEqual(legacyBaseline("a"), legacyBaseline("b"));
});

test("fogalomtípus-hossz (2026-10-21): a címkék az oszlophatárra vágva; a csak emiatt hibás elem egyszer kerül újra sorba", async () => {
  const { kmConceptColumns } = await import("../server/studio/single-run/live");
  const { shouldRequeue } = await import("../server/studio/legacy-migration");
  assert.deepEqual(kmConceptColumns({ type: "irodalomtörténeti esemény", correction: null }), { type: "irodalomtörténeti esemén", verbatimReason: null });
  // Review #352: nem ismétlődő szöveg, pontos elvárás (az ELSŐ 32 karakter).
  const correction = "A forrás szerint 1877-ben született, nem 1878-ban.";
  assert.equal(kmConceptColumns({ type: "fact", correction }).verbatimReason, correction.slice(0, 32));
  assert.equal(kmConceptColumns({ type: "fact", correction }).verbatimReason, "A forrás szerint 1877-ben szület");
  const err = 'Failed query: insert into "km_concepts" ("id", …';
  assert.equal(shouldRequeue({ status: "error", error: err, payload: {} }), true);
  assert.equal(shouldRequeue({ status: "error", error: err, payload: { requeued: true } }), false, "másodszor nem");
  assert.equal(shouldRequeue({ status: "error", error: "a futás megállt", payload: {} }), false);
  assert.equal(shouldRequeue({ status: "done", error: err, payload: {} }), false);
  // Review #351: az újrapróba megőrzi a jelzőt — a második ugyanilyen hiba már nem sorol újra.
  const { retryPayload } = await import("../server/studio/legacy-migration");
  const next = retryPayload({ htmlFileId: "f", attempt: 0, startedAt: 0, requeued: true }, "r1", 1, 5);
  assert.deepEqual(next, { htmlFileId: "f", runId: "r1", attempt: 1, startedAt: 5, requeued: true });
  assert.equal(shouldRequeue({ status: "error", error: err, payload: next }), false);
  assert.equal("requeued" in retryPayload({ htmlFileId: "f" }, "r2", 2, 6), false);
});

test("ciklus-kapu (2026-10-21): a korlátig indul új anyag; a 0-s kategória megmarad", async () => {
  const { batchRoom, LEGACY_BATCH_LIMIT } = await import("../server/studio/legacy-migration");
  const { legacyClassroom } = await import("../server/studio/pipeline-store");
  assert.equal(batchRoom(100, 100), 0);
  assert.equal(batchRoom(97, 100), 3);
  assert.equal(batchRoom(120, 100), 0);
  // Review #352: a korlát pontosan rögzített (a ciklus-PR emeli, a tényleges sorelemszám + 5 szerint).
  assert.equal(LEGACY_BATCH_LIMIT, 100);
  assert.equal(batchRoom(99), 1);
  assert.equal(batchRoom(100), 0);
  assert.equal(legacyClassroom(0, 12), 0, "Programozási alapismeretek marad");
  assert.equal(legacyClassroom(4, 4), 4);
  assert.equal(legacyClassroom(5, 6), 6, "egyébként a forrásból felismert évfolyam");
});
