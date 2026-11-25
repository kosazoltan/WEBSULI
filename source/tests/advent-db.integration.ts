/**
 * Adventi naptár S2a — adatmodell és tároló eldobható Postgresen (scripts/run-learning-db-tests.ts; a 0042-es migráció a
 * futtatóban kétszer fut le). Terv: docs/specs/2026-11-18-adventi-naptar.md R7, 16.3, 16.8; A20 (zár), A24 (migráció ↔ séma), E23.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { dbPool } from "./support/authz-db-harness";

const { createAdventStore, DEVICE_ROW_RETENTION_DAYS, PREVIEW_ROW_RETENTION_DAYS } = await import("../server/advent/store");
const { db } = await import("../server/db");
const { adventAnnouncements, adventProgress } = await import("../shared/schema");

const store = createAdventStore(dbPool);
const SEASON = 2026;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await dbPool.query(sql, params)).rows as T[];
const device = () => ({ kind: "device" as const, id: randomUUID() });
const attempt = (correct: boolean) => ({ questionId: "xmas-001", pick: 0, correct, at: new Date().toISOString() });

async function newLearner(grade = 5): Promise<string> {
  const [row] = await q<{ id: string }>(`INSERT INTO learners (name, grade) VALUES ($1, $2) RETURNING id`, [`Teszt ${randomUUID().slice(0, 8)}`, grade]);
  return row!.id;
}
async function newPlayer(): Promise<string> {
  const [row] = await q<{ id: string }>(`INSERT INTO player_accounts (email) VALUES ($1) RETURNING id`, [`advent-${randomUUID()}@websuli.example`]);
  return row!.id;
}

describe("adventi naptár — adatmodell és tároló", () => {
  after(async () => {
    await dbPool.query(`DELETE FROM advent_progress`);
    await dbPool.query(`DELETE FROM advent_announcements`);
  });

  it("a migráció táblái egyeznek a Drizzle-sémával: minden oszlop olvasható, a kényszerek megvannak (A24)", async () => {
    assert.deepEqual(await db.select().from(adventProgress).limit(1), []);
    assert.deepEqual(await db.select().from(adventAnnouncements).limit(1), []);
    const constraints = (await q<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE conrelid = 'advent_progress'::regclass ORDER BY conname`)).map((r) => r.conname);
    for (const name of ["advent_progress_kind_check", "advent_progress_learner_check", "advent_progress_player_check", "advent_progress_learner_id_learners_id_fk", "advent_progress_player_id_player_accounts_id_fk"]) {
      assert.ok(constraints.includes(name), `hiányzó kényszer: ${name} (${constraints.join(", ")})`);
    }
    const indexes = (await q<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename IN ('advent_progress', 'advent_announcements')`)).map((r) => r.indexname);
    for (const name of ["advent_progress_subject_unique", "advent_progress_kind_updated_idx", "advent_announcements_recipient_unique"]) {
      assert.ok(indexes.includes(name), `hiányzó index: ${name}`);
    }
  });

  it("olvasás nem hoz létre sort; az első módosítás létrehozza, a második már nem", async () => {
    const subject = device();
    assert.equal(await store.read(SEASON, subject), null);
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [subject.id]), []);
    const first = await store.mutate(SEASON, subject, () => ({ patch: { grade: 4 }, result: "első" }));
    assert.equal(first.created, true);
    assert.equal(first.result, "első");
    assert.equal(first.row.grade, 4);
    assert.equal(first.row.round, 1);
    assert.deepEqual(first.row.plan, {});
    assert.deepEqual(first.row.mailedTo, []);
    const second = await store.mutate(SEASON, subject, (row, created) => ({ patch: null, result: { created, grade: row.grade } }));
    assert.equal(second.created, false);
    assert.deepEqual(second.result, { created: false, grade: 4 });
    const read = await store.read(SEASON, subject);
    assert.equal(read?.id, first.row.id);
    assert.equal(read?.subjectKind, "device");
    // Más évad külön sor.
    assert.equal(await store.read(SEASON + 1, subject), null);
  });

  it("a terv és a válaszok körönként, JSON-ban, veszteség nélkül mennek oda-vissza", async () => {
    const subject = device();
    const plan = { 1: { round: 1, layout: [3, 1, 2], doors: { 1: ["g05-math-001", "g05-math-002", "g05-math-003"] }, subjects: { 1: "math" } } };
    const doors = { 1: { 1: { attempts: [attempt(false), attempt(true)] } } };
    const finishedAt = new Date("2026-12-24T18:00:00.000Z");
    await store.mutate(SEASON, subject, () => ({ patch: { grade: 5, plan, doors, finishedAt, passedAt: finishedAt }, result: null }));
    const row = await store.read(SEASON, subject);
    assert.deepEqual(row?.plan, plan);
    assert.deepEqual(row?.doors, doors);
    assert.equal(row?.finishedAt?.toISOString(), finishedAt.toISOString());
    assert.equal(row?.passedAt?.toISOString(), finishedAt.toISOString());
    // A hiányzó mező változatlan marad.
    await store.mutate(SEASON, subject, () => ({ patch: { round: 2 }, result: null }));
    const after2 = await store.read(SEASON, subject);
    assert.equal(after2?.round, 2);
    assert.deepEqual(after2?.plan, plan);
    assert.equal(after2?.grade, 5);
  });

  it("soronkénti zár: 20 egyidejű módosításból egy sem vész el, és pontosan egy hozza létre a sort (A20)", async () => {
    const subject = device();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      store.mutate(SEASON, subject, (row) => {
        const attempts = [...(row.doors[1]?.[1]?.attempts ?? []), { ...attempt(false), questionId: `q-${i}` }];
        return { patch: { doors: { 1: { 1: { attempts } } } }, result: attempts.length };
      })));
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.deepEqual(results.map((r) => r.result).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
    const row = await store.read(SEASON, subject);
    assert.equal(row?.doors[1]?.[1]?.attempts.length, 20);
    assert.equal(new Set(row?.doors[1]?.[1]?.attempts.map((a) => a.questionId)).size, 20);
    assert.equal((await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [subject.id])).length, 1);
  });

  it("ha a módosító függvény dob, minden visszagördül — a most létrehozott sor is", async () => {
    const subject = device();
    await assert.rejects(store.mutate(SEASON, subject, () => { throw new RangeError("advent: elfogyott a kérdés"); }), /elfogyott/);
    assert.equal(await store.read(SEASON, subject), null);
    // Meglévő sornál a dobás az addigi állapotot nem bántja.
    await store.mutate(SEASON, subject, () => ({ patch: { grade: 7 }, result: null }));
    await assert.rejects(store.mutate(SEASON, subject, () => { throw new Error("hiba"); }));
    assert.equal((await store.read(SEASON, subject))?.grade, 7);
    // A kapcsolat visszakerült a készletbe: a tároló tovább használható.
    assert.equal((await store.mutate(SEASON, subject, () => ({ patch: null, result: 1 }))).result, 1);
  });

  it("alany ↔ idegen kulcs: a tanulói és a játékos-sor a gazdájával együtt törlődik; a kényszerek őrzik az összhangot (16.8)", async () => {
    const learnerId = await newLearner();
    const playerId = await newPlayer();
    await store.mutate(SEASON, { kind: "learner", id: learnerId }, () => ({ patch: { grade: 5 }, result: null }));
    await store.mutate(SEASON, { kind: "player", id: playerId }, () => ({ patch: { grade: 6 }, result: null }));
    const [learnerRow] = await q<{ learner_id: string | null; player_id: string | null }>(`SELECT learner_id, player_id FROM advent_progress WHERE subject_id = $1`, [learnerId]);
    assert.deepEqual(learnerRow, { learner_id: learnerId, player_id: null });
    const [playerRow] = await q<{ learner_id: string | null; player_id: string | null }>(`SELECT learner_id, player_id FROM advent_progress WHERE subject_id = $1`, [playerId]);
    assert.deepEqual(playerRow, { learner_id: null, player_id: playerId });
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learnerId]);
    await dbPool.query(`DELETE FROM player_accounts WHERE id = $1`, [playerId]);
    assert.equal(await store.read(SEASON, { kind: "learner", id: learnerId }), null);
    assert.equal(await store.read(SEASON, { kind: "player", id: playerId }), null);
    // Nem létező tanulóra nem jöhet létre tanulói sor (idegen kulcs).
    await assert.rejects(store.mutate(SEASON, { kind: "learner", id: randomUUID() }, () => ({ patch: null, result: null })));
    // A kényszerek kézi beszúrásnál is védenek.
    await assert.rejects(dbPool.query(`INSERT INTO advent_progress (season, subject_kind, subject_id) VALUES ($1, 'learner', $2)`, [SEASON, randomUUID()]), /advent_progress_learner_check/);
    await assert.rejects(dbPool.query(`INSERT INTO advent_progress (season, subject_kind, subject_id) VALUES ($1, 'player', $2)`, [SEASON, randomUUID()]), /advent_progress_player_check/);
    await assert.rejects(dbPool.query(`INSERT INTO advent_progress (season, subject_kind, subject_id) VALUES ($1, 'admin', $2)`, [SEASON, randomUUID()]), /advent_progress_kind_check/);
    const other = await newLearner();
    await assert.rejects(dbPool.query(`INSERT INTO advent_progress (season, subject_kind, subject_id, learner_id) VALUES ($1, 'device', $2, $3)`, [SEASON, randomUUID(), other]), /advent_progress_learner_check/);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [other]);
  });

  it("egyedi kulcs: ugyanarra az évadra és alanyra nem lehet második sor", async () => {
    const subject = device();
    await store.mutate(SEASON, subject, () => ({ patch: null, result: null }));
    await assert.rejects(dbPool.query(`INSERT INTO advent_progress (season, subject_kind, subject_id) VALUES ($1, 'device', $2)`, [SEASON, subject.id]), /advent_progress_subject_unique/);
  });

  it("levél-foglalás: egyidejű kérésekből pontosan egy foglal; felszabadítás után újra foglalható (16.3)", async () => {
    const { row } = await store.mutate(SEASON, device(), () => ({ patch: null, result: null }));
    const key = "1:passed:0f3a";
    const claims = await Promise.all(Array.from({ length: 8 }, () => store.claimMail(row.id, key)));
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(await store.claimMail(row.id, key), false);
    assert.equal(await store.claimMail(row.id, "1:final:0f3a"), true, "más fajta külön foglalás");
    assert.deepEqual((await store.read(SEASON, { kind: "device", id: row.subjectId }))?.mailedTo.sort(), ["1:final:0f3a", key]);
    await store.releaseMail(row.id, key);
    assert.equal(await store.claimMail(row.id, key), true);
    assert.equal(await store.claimMail("nem-letezo-sor", key), false);
  });

  it("takarítás: csak a régi névtelen és előnézeti sorok és a korábbi évadok értesítő-foglalásai törlődnek (E23)", async () => {
    await dbPool.query(`DELETE FROM advent_progress`);
    const now = new Date("2027-03-01T12:00:00.000Z");
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const aged = async (subject: { kind: "learner" | "device" | "preview"; id: string }, days: number) => {
      const { row } = await store.mutate(SEASON, subject, () => ({ patch: null, result: null }));
      await dbPool.query(`UPDATE advent_progress SET updated_at = $2 WHERE id = $1`, [row.id, daysAgo(days)]);
      return row.id;
    };
    const learnerId = await newLearner();
    const keep = [
      await aged(device(), DEVICE_ROW_RETENTION_DAYS - 1),
      await aged({ kind: "preview", id: randomUUID() }, PREVIEW_ROW_RETENTION_DAYS - 1),
      await aged({ kind: "learner", id: learnerId }, 400),
    ];
    await aged(device(), DEVICE_ROW_RETENTION_DAYS + 1);
    await aged({ kind: "preview", id: randomUUID() }, PREVIEW_ROW_RETENTION_DAYS + 1);
    await dbPool.query(`INSERT INTO advent_announcements (season, recipient_hash, source) VALUES ($1, $2, 'subscription'), ($3, $4, 'extra')`, [SEASON - 1, "a".repeat(64), SEASON, "b".repeat(64)]);
    assert.deepEqual(await store.sweep(now, SEASON), { devices: 1, previews: 1, announcements: 1 });
    assert.deepEqual((await q<{ id: string }>(`SELECT id FROM advent_progress ORDER BY id`)).map((r) => r.id), [...keep].sort());
    assert.deepEqual((await q<{ season: number }>(`SELECT season FROM advent_announcements`)).map((r) => r.season), [SEASON]);
    assert.deepEqual(await store.sweep(now, SEASON), { devices: 0, previews: 0, announcements: 0 });
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learnerId]);
  });

  it("értesítő-foglalás: évadonként és címzett-lenyomatonként egy sor", async () => {
    await dbPool.query(`DELETE FROM advent_announcements`);
    await dbPool.query(`INSERT INTO advent_announcements (season, recipient_hash, source) VALUES ($1, $2, 'subscription')`, [SEASON, "c".repeat(64)]);
    await assert.rejects(dbPool.query(`INSERT INTO advent_announcements (season, recipient_hash, source) VALUES ($1, $2, 'extra')`, [SEASON, "c".repeat(64)]), /advent_announcements_recipient_unique/);
    const [row] = await q<{ status: string }>(`SELECT status FROM advent_announcements WHERE recipient_hash = $1`, ["c".repeat(64)]);
    assert.equal(row?.status, "pending");
  });
  it("levél-kézbesítés >24h bizonytalanság: az első kísérlet ideje (`try:`) megmarad; 23 óra után nincs új bérlet, a pótlás `check:`-re jelöl (#562 A2)", async () => {
    const { row } = await store.mutate(SEASON, device(), () => ({ patch: null, result: null }));
    const h = "abc123";
    const T0 = 1_800_000_000_000;
    const HOUR = 60 * 60_000;
    const LEASE = 10 * 60_000;
    const keys = async () => ((await store.read(SEASON, { kind: "device", id: row.subjectId }))?.mailedTo ?? []).slice().sort();
    await store.planMail(row.id, [`want:${h}`]);
    assert.equal(await store.leaseMail(row.id, h, T0, LEASE), true, "első bérlet");
    assert.ok((await keys()).includes(`try:${h}@${T0}`), "az első kísérlet ideje rögzül");
    // Leállás a szolgáltatói elfogadás és bármilyen jelölő között: a bérlet lejár, 1 óra múlva ugyanazzal a kulccsal pótolható.
    assert.equal(await store.leaseMail(row.id, h, T0 + HOUR, LEASE), true, "lejárt bérlet után a Resend-ablakon belül újrapróbálható");
    await store.releaseLease(row.id, h);
    const afterRelease = await keys();
    assert.ok(afterRelease.includes(`try:${h}@${T0}`), "a felszabadítás után is az ELSŐ kísérlet ideje marad");
    assert.equal(afterRelease.filter((k) => k.startsWith("try:")).length, 1);
    // 25 óra múlva a szolgáltató már nem deduplikál: automatikus küldés tilos.
    assert.equal(await store.leaseMail(row.id, h, T0 + 25 * HOUR, LEASE), false, "a bizonytalan kézbesítés nem küldhető újra automatikusan");
    await store.recoverSent(T0 + 25 * HOUR);
    const flagged = await keys();
    assert.ok(flagged.includes(`check:${h}`), "ellenőrizendőnek jelölve");
    assert.ok(!flagged.some((k) => k.startsWith("try:") || k.startsWith("pending:")), "a try:/pending: jelölő eltűnik");
    assert.equal(await store.leaseMail(row.id, h, T0 + 26 * HOUR, LEASE), false);
    // Sikeres kézbesítésnél a try: jelölő törlődik, csak final: marad.
    const h2 = "def456";
    await dbPool.query(`UPDATE advent_progress SET mailed_to = array_append(mailed_to, $2) WHERE id = $1`, [row.id, `want:${h2}`]);
    assert.equal(await store.leaseMail(row.id, h2, T0, LEASE), true);
    await store.finishMail(row.id, h2);
    const done = await keys();
    assert.ok(done.includes(`final:${h2}`) && !done.some((k) => k.startsWith(`try:${h2}`) || k.startsWith(`pending:${h2}`)));
  });
});
