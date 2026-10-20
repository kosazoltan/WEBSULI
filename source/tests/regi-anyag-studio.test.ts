import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_CONCURRENCY, LEGACY_EXCLUDED_IDS, LEGACY_MAX_ATTEMPTS, LEGACY_MIGRATION_MODE, LEGACY_PILOT_IDS, legacyCandidates, legacySource, reconcileLegacy, type LegacyRow } from "../server/studio/legacy-migration";
import { LEGACY_BACKUP_NOTE, legacyBackupData } from "../server/studio/pipeline-store";

/* Spec 2026-10-20-regi-anyag-studio-atalakitas: a régi anyagok helyben Stúdió-leckévé — a sor tiszta döntései. */

const row = (over: Partial<LegacyRow> = {}): LegacyRow => ({
  id: "x", title: "4. osztály - Igekötők", contentType: "html", bytes: 70_000, createdAt: new Date("2025-11-06"), views: 10, hasMedia: false, ...over,
});

test("a jelöltek: csak a határnap előtti, nem lecke, nem kizárt anyag; a nézettség szerint", () => {
  const rows = [
    row({ id: "a", views: 5 }), row({ id: "b", views: 50 }),
    row({ id: "uj", createdAt: new Date("2026-06-01T00:00:00Z") }),
    row({ id: "lecke", contentType: "lesson" }),
    row({ id: "pdf", contentType: "pdf" }),
    row({ id: "nagy", bytes: 841_000 }),
    row({ id: "zene", hasMedia: true }),
    row({ id: LEGACY_EXCLUDED_IDS[0], title: "8. Osztály Abigél" }),
    row({ id: "abig2", title: "Szabó Magda: ABIGÉL — a regény" }),
  ];
  const all = legacyCandidates(rows, "all");
  assert.deepEqual(all.queue, ["b", "a"]);
  assert.deepEqual(all.skipped.map((s) => s.id).sort(), ["abig2", LEGACY_EXCLUDED_IDS[0], "nagy", "pdf", "zene"].sort());
  assert.ok(all.skipped.every((s) => s.reason.length > 0));
  assert.deepEqual(legacyCandidates(rows, "off").queue, []);
  const pilot = legacyCandidates([...rows, row({ id: LEGACY_PILOT_IDS[0] }), row({ id: LEGACY_PILOT_IDS[1], views: 99 })], "pilot");
  assert.deepEqual(pilot.queue, [LEGACY_PILOT_IDS[1], LEGACY_PILOT_IDS[0]]);
});

test("a kapcsoló a próbára áll; az Abigél egyik próba-anyag sem; a korlátok", () => {
  assert.equal(LEGACY_MIGRATION_MODE, "pilot");
  assert.equal(LEGACY_PILOT_IDS.length, 3);
  for (const id of LEGACY_EXCLUDED_IDS) assert.ok(!LEGACY_PILOT_IDS.includes(id));
  assert.ok(LEGACY_CONCURRENCY >= 1 && LEGACY_CONCURRENCY <= 4);
  assert.equal(LEGACY_MAX_ATTEMPTS, 2);
});

test("az egyeztetés: kész cél → kész; élő futás → fut; leállt futás → folytatás / újrakezdés / hiba", () => {
  const now = Date.parse("2026-10-20T20:00:00Z");
  const base = { status: "running", attempt: 1, startedAt: now - 60_000, runPhase: "author", runUpdatedAt: new Date(now - 60_000), targetIsLesson: false, jobResumable: false };
  assert.equal(reconcileLegacy({ ...base, targetIsLesson: true, runPhase: "error" }, now), "done");
  assert.equal(reconcileLegacy(base, now), "running");
  assert.equal(reconcileLegacy({ ...base, runPhase: null }, now), "running", "a futás sora még nem íródott ki");
  assert.equal(reconcileLegacy({ ...base, runPhase: null, startedAt: now - 11 * 60_000 }, now), "restart");
  assert.equal(reconcileLegacy({ ...base, runPhase: "error", jobResumable: true }, now), "resume");
  assert.equal(reconcileLegacy({ ...base, runPhase: "error" }, now), "restart");
  assert.equal(reconcileLegacy({ ...base, runUpdatedAt: new Date(now - 50 * 60_000) }, now), "restart", "45 percnél régebben némán");
  assert.equal(reconcileLegacy({ ...base, runPhase: "error", attempt: 2 }, now), "error");
  assert.equal(reconcileLegacy({ ...base, runPhase: "done" }, now), "error", "kész, de nem a célt alakította át — nincs duplikátum");
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
  const old = { title: "Régi", content: "<html>régi</html>", description: "leírás", classroom: 4, contentType: "html" };
  assert.deepEqual(legacyBackupData({ ...old, ...{} }), old);
  assert.equal(LEGACY_BACKUP_NOTE, "legacy-studio-migration");
});
