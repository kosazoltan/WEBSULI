/**
 * Adventi naptár S2b — végpontok eldobható Postgresen, a szerverrel AZONOS útvonal-felcsatolással, valódi HTTP-n (süti, CSRF).
 * Terv: docs/specs/2026-11-18-adventi-naptar.md R8, 16.1, 16.5, 18.2; A2, A3, A7, A8, A10, A17–A23, A49, A51, A53.
 * A harness e2e-módot állít (WEBSULI_E2E=1): a naptár órája itt az `X-Advent-Test-Now` fejléc; a kliens IP-je az
 * `X-Forwarded-For` fejlécből jön (trust proxy), így minden teszt saját „hálózatról” dolgozik.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { dbPool, injectSession, startApp } from "./support/authz-db-harness";

const { GRADE_QUIZ_ITEMS } = await import("../client/src/data/gradeQuizBank/index");
const { CHRISTMAS_ITEMS } = await import("../shared/advent/christmasBank/index");
const { findAdventItem } = await import("../shared/advent/assignment");
const { ADVENT_GIFT_MESSAGE } = await import("../shared/advent/rules");
const { learnerTokenFor } = await import("../server/learners");
const { createPlayerAccountStore } = await import("../server/player/account-store");
const { createAdventStore } = await import("../server/advent/store");
const { createAdoptionContext, mergeAdoption } = await import("../server/advent/adoption");

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Question = { id: string; subject: string; prompt: string; options: string[] };

const DEC5 = "2026-12-05T10:00:00Z";
const DEC26 = "2026-12-26T10:00:00Z";
let app: Awaited<ReturnType<typeof startApp>>;
let ipSeq = 10;

/** Egy „böngésző”: saját sütivel, CSRF-tokennel, eszközazonosítóval, hálózati címmel és (teszt-)órával. */
class Kid {
  cookie: string | null = null;
  csrf: string | null = null;
  device: string = randomUUID();
  learner: string | null = null;
  ip = `10.77.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
  now: string | null = DEC5;

  async raw(method: string, path: string, body?: Json, opts: { csrf?: boolean } = {}): Promise<{ status: number; json: Json }> {
    const headers: Record<string, string> = { origin: app.base, accept: "application/json", "x-forwarded-for": this.ip };
    if (this.now) headers["x-advent-test-now"] = this.now;
    if (this.cookie) headers.cookie = this.cookie;
    if (method === "GET") {
      if (this.device) headers["x-advent-device"] = this.device;
      if (this.learner) headers["x-learner-token"] = this.learner;
    } else {
      headers["content-type"] = "application/json";
      if (opts.csrf !== false && this.csrf) headers["x-csrf-token"] = this.csrf;
    }
    const res = await fetch(`${app.base}${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}), signal: AbortSignal.timeout(15_000) });
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("connect.sid="));
    if (setCookie) this.cookie = setCookie.split(";")[0]!;
    const text = await res.text();
    const parse = (): Json => { try { return JSON.parse(text) as Json; } catch { return { text }; } };
    return { status: res.status, json: parse() };
  }
  async start(): Promise<this> {
    const r = await this.raw("GET", "/api/csrf-token");
    assert.equal(r.status, 200);
    this.csrf = r.json.csrfToken as string;
    return this;
  }
  ident(): Json { return { ...(this.device ? { device: this.device } : {}), ...(this.learner ? { learner: this.learner } : {}) }; }
  state() { return this.raw("GET", "/api/advent/state"); }
  post(path: string, body: Json = {}, opts?: { csrf?: boolean }) { return this.raw("POST", `/api/advent${path}`, { ...this.ident(), ...body }, opts); }
  async open(day: number): Promise<Question> {
    const r = await this.post(`/doors/${day}/open`);
    assert.equal(r.status, 200, `megnyitás ${day}: ${JSON.stringify(r.json).slice(0, 200)}`);
    return r.json.question as Question;
  }
  /** Válasz a megnyitott kérdésre: `right` szerint a helyes vagy egy hibás lehetőséget választ (a teszt a bankból tudja). */
  async answer(day: number, q: Question, right: boolean): Promise<Json> {
    const item = findAdventItem(q.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS);
    assert.ok(item, `ismeretlen kérdés: ${q.id}`);
    const correct = q.options.indexOf(item.options[item.correctIndex]!);
    assert.ok(correct >= 0, "a helyes válasz szerepel a kevert lehetőségek között");
    const r = await this.post(`/doors/${day}/answer`, { questionId: q.id, pick: right ? correct : (correct + 1) % 4 });
    assert.equal(r.status, 200, `válasz ${day}: ${JSON.stringify(r.json).slice(0, 200)}`);
    assert.equal(r.json.correct, right);
    return r.json;
  }
}
const kid = () => new Kid().start();
const q = async <T = Json>(sql: string, params: unknown[] = []) => (await dbPool.query(sql, params)).rows as T[];
async function newLearner(grade: number): Promise<{ id: string; token: string }> {
  const [row] = await q<{ id: string; token_version: number }>(`INSERT INTO learners (name, grade) VALUES ($1, $2) RETURNING id, token_version`, [`Próba Panni ${randomUUID().slice(0, 6)}`, grade]);
  const token = learnerTokenFor(row!.id, row!.token_version);
  assert.ok(token);
  return { id: row!.id, token };
}

describe("adventi naptár — végpontok", () => {
  before(async () => { process.env.ADVENT_CALENDAR = "on"; app = await startApp(); });
  after(async () => {
    await dbPool.query(`DELETE FROM advent_progress`);
    delete process.env.ADVENT_CALENDAR;
    await app.close();
  });

  it("flag és e2e-szezon: kikapcsolva vagy tesztidő nélkül a naptár nem létezik (A23, A51)", async () => {
    const k = await kid();
    const on = await k.raw("GET", "/api/advent/status");
    assert.deepEqual({ enabled: on.json.enabled, phase: on.json.phase, openDay: on.json.openDay, season: on.json.season }, { enabled: true, phase: "open", openDay: 5, season: 2026 });
    k.now = null; // e2e-módban fejléc nélkül: kikapcsolt, a valódi dátumtól függetlenül
    assert.deepEqual((await k.raw("GET", "/api/advent/status")).json, { enabled: false });
    assert.equal((await k.state()).status, 404);
    assert.equal((await k.post("/doors/1/open")).status, 404);
    k.now = "nem-datum";
    assert.deepEqual((await k.raw("GET", "/api/advent/status")).json, { enabled: false });
    k.now = DEC5;
    process.env.ADVENT_CALENDAR = "off";
    try {
      assert.deepEqual((await k.raw("GET", "/api/advent/status")).json, { enabled: false });
      assert.equal((await k.state()).status, 404);
      assert.equal((await k.post("/grade", { grade: 5 })).status, 404);
    } finally { process.env.ADVENT_CALENDAR = "on"; }
  });

  it("állapot írás nélkül: 24 ablak, december 5-én az 1–5. nyitható; sor nem jön létre (A1, A12)", async () => {
    const k = await kid();
    const r = await k.state();
    assert.equal(r.status, 200);
    assert.equal(r.json.identity, "device");
    assert.equal(r.json.needsGrade, true);
    assert.equal(r.json.doors.length, 24);
    assert.deepEqual(r.json.doors.map((d: Json) => d.state), [...Array(5).fill("open"), ...Array(19).fill("locked")]);
    assert.equal(r.json.closing.kind, "progress");
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [k.device]), []);
    // Azonosító nélkül is olvasható (üres naptár), de írni nem lehet.
    const anon = await kid();
    anon.device = "nem-uuid";
    assert.equal((await anon.state()).json.identity, null);
    assert.equal((await anon.post("/grade", { grade: 5 })).status, 400);
  });

  it("CSRF: token nélkül minden író kérés 403, állapotváltozás nélkül (A19)", async () => {
    const k = await kid();
    for (const [path, body] of [["/grade", { grade: 5 }], ["/doors/1/open", {}], ["/doors/1/answer", { questionId: "x", pick: 0 }], ["/round", {}]] as const) {
      assert.equal((await k.post(path, body, { csrf: false })).status, 403, path);
    }
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [k.device]), []);
  });

  it("névtelen út: évfolyam, megnyitás, hibás válasz, javítás új kérdéssel, megoldás (A2, A3, A6, A7, A18, A20, A21, E17)", async () => {
    const k = await kid();
    assert.equal((await k.post("/doors/1/open")).status, 409, "évfolyam nélkül nem nyitható");
    assert.equal((await k.post("/grade", { grade: 13 })).status, 400);
    const graded = await k.post("/grade", { grade: 7 });
    assert.equal(graded.status, 200);
    assert.equal(graded.json.grade, 7);
    assert.equal(graded.json.needsGrade, false);
    assert.equal((await k.post("/doors/6/open")).status, 403, "holnapi ablak");
    assert.equal((await k.post("/doors/25/open")).status, 400);
    assert.equal((await k.post("/doors/01/open")).status, 400);

    const first = await k.open(3); // karácsonyi ablak
    assert.deepEqual(Object.keys(first).sort(), ["id", "options", "prompt", "subject"], "a kérdésben nincs helyes válasz és magyarázat");
    assert.equal(first.subject, "christmas");
    assert.match(first.id, /^xmas-\d{3}$/);
    assert.equal(first.options.length, 4);
    assert.deepEqual(await k.open(3), first, "újranyitáskor ugyanaz a kérdés, ugyanabban a sorrendben");
    const bankQ = await k.open(1);
    assert.match(bankQ.id, /^g07-/);

    const wrong = await k.answer(3, first, false);
    assert.equal(wrong.door.state, "repairable");
    assert.equal(wrong.door.repairsLeft, 2);
    assert.ok(typeof wrong.explanation === "string" && wrong.explanation.length >= 30);
    assert.equal(first.options[wrong.correctIndex], findAdventItem(first.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!.options[findAdventItem(first.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!.correctIndex]);
    assert.deepEqual({ answered: wrong.summary.answered, solved: wrong.summary.solved, repairable: wrong.summary.repairable }, { answered: 1, solved: 0, repairable: 1 });
    // Ugyanarra a kérdésre a második beküldés (akár más választással): a tárolt eredmény, változás nélkül.
    const again = await k.post("/doors/3/answer", { questionId: first.id, pick: wrong.correctIndex });
    assert.equal(again.status, 200);
    assert.equal(again.json.correct, false);
    assert.deepEqual(again.json.summary, wrong.summary);
    // A javítás ÚJ kérdés ugyanabból a tárgyból.
    const repair = await k.open(3);
    assert.notEqual(repair.id, first.id);
    assert.notEqual(repair.prompt, first.prompt);
    assert.equal(repair.subject, "christmas");
    // Soha ki nem osztott kérdésazonosító: 409 a friss állapottal.
    const stale = await k.post("/doors/3/answer", { questionId: "xmas-999", pick: 0 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.state.doors[2].state, "repairable");
    const solved = await k.answer(3, repair, true);
    assert.equal(solved.door.state, "solved");
    assert.deepEqual({ answered: solved.summary.answered, solved: solved.summary.solved, firstTry: solved.summary.firstTry }, { answered: 1, solved: 1, firstTry: 0 });
    // Megoldott ablak újranyitása: csak olvasás, a tárolt eredménnyel.
    const reopened = await k.post("/doors/3/open");
    assert.equal(reopened.json.question.id, repair.id);
    assert.equal(reopened.json.answered.correct, true);
    // Az évfolyam az első válasz után rögzül.
    assert.equal((await k.post("/grade", { grade: 3 })).status, 409);
    // Újratöltés után megmarad.
    const state = (await k.state()).json;
    assert.equal(state.doors[2].state, "solved");
    assert.equal(state.doors[2].subject, "christmas");
    assert.equal(state.grade, 7);
  });

  it("párosított tanuló: az évfolyam a profilból, a sor a tanulóhoz kötve, eszköztől függetlenül (A17); érvénytelen token jelezve (A53)", async () => {
    const learner = await newLearner(2);
    const k = await kid();
    k.learner = learner.token;
    const state = (await k.state()).json;
    assert.deepEqual({ identity: state.identity, grade: state.grade, needsGrade: state.needsGrade, pairing: state.pairing, maxRounds: state.maxRounds }, { identity: "learner", grade: 2, needsGrade: false, pairing: "ok", maxRounds: 2 });
    assert.match(state.firstName, /Panni/);
    assert.ok(state.doors.every((d: Json) => d.subject === "christmas"), "1–2. évfolyamon minden ablak karácsonyi");
    assert.equal((await k.post("/grade", { grade: 9 })).status, 409, "a tanuló évfolyama nem írható át");
    const question = await k.open(1);
    assert.match(question.id, /^xmas-/);
    await k.answer(1, question, true);
    // Másik eszköz ugyanazzal a tanulóval: ugyanaz a naptár.
    const other = await kid();
    other.learner = learner.token;
    assert.equal((await other.state()).json.doors[0].state, "solved");
    const rows = await q<{ subject_kind: string; learner_id: string }>(`SELECT subject_kind, learner_id FROM advent_progress WHERE subject_id = $1`, [learner.id]);
    assert.deepEqual(rows, [{ subject_kind: "learner", learner_id: learner.id }]);
    // Év közben átírt évfolyam nem cseréli ki a rögzült évfolyamot.
    await dbPool.query(`UPDATE learners SET grade = 9 WHERE id = $1`, [learner.id]);
    assert.equal((await k.state()).json.grade, 2);
    // Érvénytelen token: a szerver jelzi, és nem tanulóként kezeli.
    const broken = await kid();
    broken.learner = `${learner.id}.99.${"x".repeat(22)}`;
    const invalid = (await broken.state()).json;
    assert.deepEqual({ identity: invalid.identity, pairing: invalid.pairing }, { identity: "device", pairing: "invalid" });
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("végigjátszás: 24 / 24 → a szó szerinti üzenet; 22 / 24 → nincs üzenet; javítás után 23 / 24 → megvan (A8, A9, E1)", async () => {
    const play = async (wrongDays: number[]) => {
      const k = await kid();
      k.now = DEC26; // pótlási időszak: mind nyitható
      assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
      let last: Json = {};
      for (let day = 1; day <= 24; day++) last = await k.answer(day, await k.open(day), !wrongDays.includes(day));
      return { k, last };
    };
    const perfect = await play([]);
    assert.equal(perfect.last.summary.passed, true);
    assert.deepEqual({ kind: perfect.last.closing.kind, text: perfect.last.closing.text }, { kind: "gift", text: ADVENT_GIFT_MESSAGE });
    assert.equal(perfect.last.summary.firstTry, 24);
    assert.equal((await perfect.k.post("/round")).status, 409, "aki megfelelt, nem kérhet új kört");
    const [row] = await q<{ passed_at: Date | null; finished_at: Date | null }>(`SELECT passed_at, finished_at FROM advent_progress WHERE subject_id = $1`, [perfect.k.device]);
    assert.ok(row?.passed_at && row.finished_at);

    const twoWrong = await play([7, 12]);
    assert.equal(twoWrong.last.summary.solved, 22);
    assert.equal(twoWrong.last.summary.passed, false);
    assert.equal(twoWrong.last.closing.kind, "repair");
    assert.notEqual(twoWrong.last.closing.text, ADVENT_GIFT_MESSAGE);
    assert.match(twoWrong.last.closing.text, /meglepetés vár/);
    // Az egyik javítása után 23 megoldott + 1 javítható, mind megválaszolva: megfelel (a 23 / 24-es határ).
    const fixed = await twoWrong.k.answer(7, await twoWrong.k.open(7), true);
    assert.deepEqual({ solved: fixed.summary.solved, repairable: fixed.summary.repairable, passed: fixed.summary.passed }, { solved: 23, repairable: 1, passed: true });
    assert.equal(fixed.closing.text, ADVENT_GIFT_MESSAGE);
  });

  it("legrosszabb eset egy alanytól: 24 ablak × 3 kérdés × (megnyitás + válasz) = 144 írás korlát nélkül; utána új kör új kérdésekkel (A10, A49)", async () => {
    const k = await kid();
    k.now = DEC26;
    assert.equal((await k.post("/grade", { grade: 9 })).status, 200);
    const seen = new Set<string>();
    let last: Json = {};
    for (let day = 1; day <= 24; day++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const question = await k.open(day);
        assert.ok(!seen.has(question.id), `ismétlődő kérdés: ${question.id}`);
        seen.add(question.id);
        last = await k.answer(day, question, false);
      }
      assert.equal(last.door.state, "failed");
    }
    assert.equal(seen.size, 72);
    assert.deepEqual({ answered: last.summary.answered, solved: last.summary.solved, failed: last.summary.failed }, { answered: 24, solved: 0, failed: 24 });
    assert.equal(last.closing.kind, "new-round");
    // Sorsolásfüggetlen (CI-bukás 2026-11-22, 442a9653 és #522): a rögzített „g09-math-001” néha éppen az 1. ablak egyik kérdése volt — arra
    // a szerver helyesen, idempotens ismétlésként 200-zal a tárolt eredményt adja. Az állítás tárgya az ÚJ válasz elutasítása, ezért a
    // kör által NEM mutatott kérdéssel kérdezünk.
    const unseen = GRADE_QUIZ_ITEMS.find((item) => item.id.startsWith("g09-") && !seen.has(item.id))?.id;
    assert.ok(unseen, "van a körben nem mutatott 9. évfolyamos kérdés");
    assert.equal((await k.post("/doors/1/answer", { questionId: unseen, pick: 0 })).status, 409, "végleg hibás ablakra nincs több válasz");
    const next = await k.post("/round");
    assert.equal(next.status, 200);
    assert.equal(next.json.round, 2);
    assert.ok(next.json.doors.every((d: Json) => d.state === "open"));
    const fresh = await k.open(1);
    assert.ok(!seen.has(fresh.id), "az új kör kérdése nem szerepelt az előzőben");
    assert.equal((await k.post("/round")).status, 409, "új kör csak végigjátszás után");
  });

  it("szezon előtt és után: olvasható, de nem írható (E6, E7); a játékos adatletöltése tartalmazza a naptárat (E19)", async () => {
    const k = await kid();
    k.now = "2026-11-29T10:00:00Z";
    const teaser = (await k.state()).json;
    assert.deepEqual({ phase: teaser.phase, kind: teaser.closing.kind }, { phase: "teaser", kind: "soon" });
    assert.ok(teaser.doors.every((d: Json) => d.state === "locked"));
    assert.equal((await k.post("/grade", { grade: 5 })).status, 409);
    k.now = DEC5;
    assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await k.answer(1, await k.open(1), true);
    k.now = "2027-01-07T10:00:00Z";
    const closed = (await k.state()).json;
    assert.deepEqual({ phase: closed.phase, season: closed.season, kind: closed.closing.kind }, { phase: "closed", season: 2026, kind: "closed" });
    assert.match(closed.closing.text, /Nálad 1 ablak világított/);
    assert.equal((await k.post("/doors/2/open")).status, 409);
    assert.equal((await k.post("/round")).status, 409);

    const [player] = await q<{ id: string }>(`INSERT INTO player_accounts (email) VALUES ($1) RETURNING id`, [`advent-${randomUUID()}@websuli.example`]);
    await createAdventStore(dbPool).mutate(2026, { kind: "player", id: player!.id }, () => ({ patch: { grade: 6 }, result: null }));
    const exported = await createPlayerAccountStore(dbPool).exportAccount(player!.id, () => []);
    assert.deepEqual((exported?.adventCalendar as Json[]).map((r) => ({ season: r.season, grade: r.grade, round: r.round })), [{ season: 2026, grade: 6, round: 1 }]);
    await dbPool.query(`DELETE FROM player_accounts WHERE id = $1`, [player!.id]);
  });
  it("játékos-fiók valódi munkamenettel: sima játékos, tanulóhoz kötött fiók, tiltott fiók (review K1); a kötött fiók adatletöltése a tanuló sorát adja (C2)", async () => {
    process.env.PLAYER_ACCOUNTS = "on";
    try {
      const mk = async (banned = false) => (await q<{ id: string }>(`INSERT INTO player_accounts (email, banned_at) VALUES ($1, $2) RETURNING id`, [`advent-${randomUUID()}@websuli.example`, banned ? new Date() : null]))[0]!.id;
      const signIn = async (playerId: string) => { const k = new Kid(); k.cookie = await injectSession({ player: { id: playerId, at: Date.now() } }); k.device = ""; return k.start(); };

      // (a) sima játékos: saját sor, az évfolyamot egyszer megadja.
      const plainId = await mk();
      const plain = await signIn(plainId);
      const first = (await plain.state()).json;
      assert.deepEqual({ identity: first.identity, needsGrade: first.needsGrade }, { identity: "player", needsGrade: true });
      assert.equal((await plain.post("/grade", { grade: 6 })).status, 200);
      await plain.answer(1, await plain.open(1), true);
      assert.deepEqual(await q(`SELECT subject_kind, player_id, learner_id, grade FROM advent_progress WHERE subject_id = $1`, [plainId]),
        [{ subject_kind: "player", player_id: plainId, learner_id: null, grade: 6 }]);

      // (b) tanulóhoz kötött fiók: a TANULÓ sora — ugyanaz, mint a párosított eszközé.
      const learner = await newLearner(4);
      const linkedId = await mk();
      await dbPool.query(`UPDATE player_accounts SET linked_learner_id = $2 WHERE id = $1`, [linkedId, learner.id]);
      const linked = await signIn(linkedId);
      const linkedState = (await linked.state()).json;
      assert.deepEqual({ identity: linkedState.identity, grade: linkedState.grade, needsGrade: linkedState.needsGrade }, { identity: "learner", grade: 4, needsGrade: false });
      assert.equal((await linked.post("/grade", { grade: 9 })).status, 409, "a kötött fiók évfolyama a tanulóé");
      await linked.answer(2, await linked.open(2), true);
      const paired = await kid();
      paired.learner = learner.token;
      assert.equal((await paired.state()).json.doors[1].state, "solved", "a párosított eszköz ugyanazt a naptárat látja");
      assert.deepEqual(await q(`SELECT subject_kind FROM advent_progress WHERE subject_id = $1`, [linkedId]), [], "a fióknak nincs külön sora");
      const exported = await createPlayerAccountStore(dbPool).exportAccount(linkedId, () => []);
      assert.deepEqual((exported?.adventCalendar as Json[]).map((r) => ({ season: r.season, grade: r.grade, solvedDoors: r.solvedDoors })), [{ season: 2026, grade: 4, solvedDoors: 1 }]);
      // Tulajdonosi döntés (2026-11-18): a kötött játékos-fiók TÖRLÉSEKOR a tanuló adventi haladása megmarad (a tanulóé).
      const deleted = await createPlayerAccountStore(dbPool).deleteAccount(linkedId, () => []);
      assert.ok(deleted, "a fióktörlés lefutott");
      assert.deepEqual(await q(`SELECT 1 FROM player_accounts WHERE id = $1`, [linkedId]), [], "a fiók törlődött");
      assert.deepEqual(await q(`SELECT subject_kind, learner_id FROM advent_progress WHERE learner_id = $1`, [learner.id]), [{ subject_kind: "learner", learner_id: learner.id }], "a tanuló sora megmaradt");
      assert.equal((await paired.state()).json.doors[1].state, "solved", "a párosított eszközön ugyanaz a haladás");

      // (c) tiltott fiók: nem játékos — a naptár azonosító nélkül látszik, írni nem lehet a fiók nevében.
      const bannedId = await mk(true);
      const banned = await signIn(bannedId);
      assert.equal((await banned.state()).json.identity, null);
      assert.equal((await banned.post("/grade", { grade: 5 })).status, 400);
      assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [bannedId]), []);

      // Kikapcsolt játékos-fiókoknál a munkamenet nem számít alanynak.
      process.env.PLAYER_ACCOUNTS = "off";
      assert.equal((await plain.state()).json.identity, null);
      await dbPool.query(`DELETE FROM player_accounts WHERE id = ANY($1)`, [[plainId, linkedId, bannedId]]);
      await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
    } finally { delete process.env.PLAYER_ACCOUNTS; }
  });

  it("érvénytelen tanulói token íráskor: 409 és pairing: invalid — nem ír csendben az eszköz sorába (review C3)", async () => {
    const learner = await newLearner(5);
    const k = await kid();
    k.learner = `${learner.id}.99.${"x".repeat(22)}`;
    for (const [path, body] of [["/grade", { grade: 5 }], ["/doors/1/open", {}], ["/doors/1/answer", { questionId: "xmas-001", pick: 0 }], ["/round", {}]] as const) {
      const r = await k.post(path, body);
      assert.deepEqual({ status: r.status, pairing: r.json.pairing }, { status: 409, pairing: "invalid" }, path);
    }
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id IN ($1, $2)`, [k.device, learner.id]), []);
    // „Folytatom vendégként”: token nélkül ugyanaz az eszköz játszhat.
    k.learner = null;
    assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("új névtelen sorok: óránként 240 / hálózat és 3 / munkamenet; csak a LÉTREJÖTT sor számít — a visszagördült kísérlet nem (A49, review K2, vak ellenőr K1 / K2)", async () => {
    const ip = "10.98.0.1";
    const kidsAt = (count: number) => Promise.all(Array.from({ length: count }, async () => { const k = await kid(); k.ip = ip; return k; }));
    // 12 eszköz évfolyam nélkül próbál ablakot nyitni: mind 409, sor nem jön létre, a keret érintetlen.
    for (const k of await kidsAt(12)) assert.equal((await k.post("/doors/1/open")).status, 409);
    assert.deepEqual(await q(`SELECT count(*)::int AS n FROM advent_progress WHERE created_at > now() - interval '1 minute' AND subject_kind = 'device' AND grade IS NULL`), [{ n: 0 }]);
    // Meglévő sor ismételt írása sem fogyaszt keretet: csak az első létrehozás számít.
    const first = await kid(); first.ip = ip;
    for (let i = 0; i < 5; i++) assert.equal((await first.post("/grade", { grade: 4 })).status, 200);
    // Egy munkamenet (süti) legfeljebb 3 új naptárat kezdhet: a 4. eszköz 429 (limit: new-row-session), sor nem jön létre.
    const hoarder = await kid(); hoarder.ip = ip;
    const hoarded: string[] = [];
    for (let i = 0; i < 4; i++) { hoarder.device = randomUUID(); hoarded.push(hoarder.device); }
    const hoardResults: Array<{ status: number; json: Json }> = [];
    for (const device of hoarded) { hoarder.device = device; hoardResults.push(await hoarder.post("/grade", { grade: 4 })); }
    assert.deepEqual(hoardResults.map((r) => r.status), [200, 200, 200, 429]);
    assert.equal(hoardResults[3]!.json.limit, "new-row-session");
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [hoarded[3]]), []);
    // Eddig 4 sor (first + 3). Ezután 266 eszköz kér új sort (valódi adatbázissal), hullámokban: 40 × 5 + 30 mind bejut (236),
    // a 7. hullám 36 EGYIDEJŰ kéréséből pontosan 6 jut be, 30 kap 429-et — a keret (240) határa egyidejű kérésekkel van megtámadva (review U1, M2).
    const crowd: Kid[] = [];
    const outcomes: Array<{ status: number; json: Json }> = [];
    for (const [size, admitted] of [[40, 40], [40, 40], [40, 40], [40, 40], [40, 40], [30, 30], [36, 6]] as const) {
      const wave = await kidsAt(size);
      const results = await Promise.all(wave.map((k) => k.post("/grade", { grade: 4 })));
      assert.equal(results.filter((o) => o.status === 200).length, admitted, size + " fős hullám");
      crowd.push(...wave); outcomes.push(...results);
    }
    assert.equal(outcomes.filter((o) => o.status === 200).length, 236);
    assert.equal(outcomes.filter((o) => o.status === 429 && o.json.limit === "new-row").length, 30);
    assert.deepEqual(await q(`SELECT count(*)::int AS n FROM advent_progress WHERE subject_id = ANY($1)`, [[first.device, ...hoarded, ...crowd.map((k) => k.device)]]), [{ n: 240 }]);
    const blocked = await kid(); blocked.ip = ip;
    const r = await blocked.post("/grade", { grade: 4 });
    assert.deepEqual({ status: r.status, limit: r.json.limit }, { status: 429, limit: "new-row" });
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [blocked.device]), []);
    assert.equal((await first.post("/doors/1/open")).status, 200, "a meglévő sor tovább játszhat");
    // Másik hálózatról a létrehozás megy.
    assert.equal((await (await kid()).post("/grade", { grade: 4 })).status, 200);
  });

  it("sérült terv / próbák a tárolt sorban: 500 helyett érthető 409 (corrupt) minden végponton; a többi alany nem érintett (vak ellenőr k3)", async () => {
    const k = await kid();
    assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await k.open(1);
    const check = async (label: string) => {
      const reads = await k.state();
      assert.deepEqual({ status: reads.status, corrupt: reads.json.corrupt }, { status: 409, corrupt: true }, label + ": állapot");
      assert.match(String(reads.json.message), /mentésében hibát találtunk/);
      for (const [path, body] of [["/doors/1/open", {}], ["/doors/1/answer", { questionId: "x", pick: 0 }], ["/round", {}], ["/grade", { grade: 6 }]] as const) {
        const r = await k.post(path, body);
        assert.deepEqual({ status: r.status, corrupt: r.json.corrupt }, { status: 409, corrupt: true }, label + ": " + path);
      }
    };
    await dbPool.query(`UPDATE advent_progress SET plan = '{"1": 5}'::jsonb WHERE subject_id = $1`, [k.device]);
    await check("sérült terv");
    await dbPool.query(`UPDATE advent_progress SET plan = '{}'::jsonb, doors = '{"1": {"1": {"attempts": 5}}}'::jsonb WHERE subject_id = $1`, [k.device]);
    await check("sérült próbák");
    // Más alany zavartalanul játszik.
    const other = await kid();
    assert.equal((await other.post("/grade", { grade: 5 })).status, 200);
    await other.open(1);
  });

  it("párosított tanuló: az évfolyam az első VÁLASZNÁL rögzül, nem a megnyitáskor — a válasz előtti profilváltás új kérdést ad (vak ellenőr k6, terv R6 / E10)", async () => {
    const learner = await newLearner(7);
    const k = await kid();
    k.learner = learner.token;
    const seventh = await k.open(1);
    assert.match(seventh.id, /^g07-/);
    assert.deepEqual(await q(`SELECT grade FROM advent_progress WHERE subject_id = $1`, [learner.id]), [{ grade: null }], "megnyitáskor nem rögzül");
    // A profil a válasz előtt 5. évfolyamra változik: az állapot és az újranyitott ablak már az 5. évfolyamé.
    await dbPool.query(`UPDATE learners SET grade = 5 WHERE id = $1`, [learner.id]);
    assert.equal((await k.state()).json.grade, 5);
    const fifth = await k.open(1);
    assert.match(fifth.id, /^g05-/);
    await k.answer(1, fifth, true);
    assert.deepEqual(await q(`SELECT grade FROM advent_progress WHERE subject_id = $1`, [learner.id]), [{ grade: 5 }], "az első válasz rögzíti");
    // Ezután a profil változása már nem írja át.
    await dbPool.query(`UPDATE learners SET grade = 9 WHERE id = $1`, [learner.id]);
    assert.equal((await k.state()).json.grade, 5);
    assert.match((await k.open(2)).id, /^(g05-|xmas-)/);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("névtelen → párosított (tulajdonosi döntés 2026-11-18): nincs tanulói sor → az eszköz sora ÁTKERÜL; olvasáskor csak előnézet; utána egyetlen élő sor (terv 21., #170)", async () => {
    const learner = await newLearner(5);
    const k = await kid();
    assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await k.answer(1, await k.open(1), true);
    await k.answer(2, await k.open(2), true);
    // A gyerek megkapja a személyes linket ugyanazon az eszközön.
    k.learner = learner.token;
    const preview = (await k.state()).json;
    assert.deepEqual({ identity: preview.identity, solved: preview.summary.solved }, { identity: "learner", solved: 2 }, "az olvasás már a megtartandó haladást mutatja");
    assert.deepEqual(await q(`SELECT subject_kind FROM advent_progress WHERE subject_id = ANY($1) ORDER BY subject_kind`, [[k.device, learner.id]]), [{ subject_kind: "device" }], "az olvasás NEM ír");
    // Az első írás elvégzi az átvételt.
    await k.open(3);
    assert.deepEqual(await q(`SELECT subject_kind, subject_id, learner_id FROM advent_progress WHERE subject_id = ANY($1)`, [[k.device, learner.id]]),
      [{ subject_kind: "learner", subject_id: learner.id, learner_id: learner.id }], "egyetlen, a tanulóhoz kötött sor");
    const after = (await k.state()).json;
    assert.deepEqual({ solved: after.summary.solved, door1: after.doors[0].state, door2: after.doors[1].state }, { solved: 2, door1: "solved", door2: "solved" });
    // Másik eszköz ugyanazzal a linkkel ugyanazt látja.
    const other = await kid(); other.learner = learner.token;
    assert.equal((await other.state()).json.summary.solved, 2);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("névtelen → párosított: van tanulói sor → ABLAKONKÉNT a jobb eredmény marad, egyenlőségnél a tanulóé; az eszköz sora az egyesítés után törlődik (tulajdonosi döntés 2026-11-19; terv 21.)", async () => {
    // a) Az eszközön több a megoldott ablak → az eszköz haladása lép a tanulóé helyére.
    const l1 = await newLearner(5);
    const onTablet = await kid(); onTablet.learner = l1.token;
    await onTablet.answer(1, await onTablet.open(1), true);
    const phone = await kid();
    assert.equal((await phone.post("/grade", { grade: 5 })).status, 200);
    await phone.answer(1, await phone.open(1), true);
    await phone.answer(2, await phone.open(2), true);
    phone.learner = l1.token;
    await phone.post("/doors/3/open");
    assert.deepEqual(await q(`SELECT subject_kind FROM advent_progress WHERE subject_id = ANY($1)`, [[phone.device, l1.id]]), [{ subject_kind: "learner" }]);
    assert.equal((await onTablet.state()).json.summary.solved, 2, "a tableten is az eszköz (jobb) haladása látszik");
    // b) Különböző ablakok (a tanuló az 1.-et, a vendég a 2.-at oldotta meg) → MINDKETTŐ megmarad a tanulónál (ablakonkénti egyesítés).
    const l2 = await newLearner(5);
    const home = await kid(); home.learner = l2.token;
    const homeQuestion = await home.open(1);
    await home.answer(1, homeQuestion, true);
    const guest = await kid();
    assert.equal((await guest.post("/grade", { grade: 5 })).status, 200);
    await guest.answer(2, await guest.open(2), true);
    guest.learner = l2.token;
    await guest.post("/doors/3/open");
    assert.deepEqual(await q(`SELECT subject_kind FROM advent_progress WHERE subject_id = ANY($1)`, [[guest.device, l2.id]]), [{ subject_kind: "learner" }]);
    const kept = (await home.state()).json;
    assert.deepEqual({ door1: kept.doors[0].state, door2: kept.doors[1].state }, { door1: "solved", door2: "solved" }, "a tanuló saját ablaka is, a vendég ablaka is megvan");
    await dbPool.query(`DELETE FROM learners WHERE id = ANY($1)`, [[l1.id, l2.id]]);
  });

  it("névtelen → párosított: a válaszok sorrendje az átvétel után is ugyanaz — a tárolt választás és a helyes válasz jelölése változatlan, a vendégként megnyitott kérdés a tokennel is a mutatott sorrendben pontozódik (vak ellenőr K1)", async () => {
    for (let round = 0; round < 4; round++) {
      const learner = await newLearner(5);
      const k = await kid();
      assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
      // A) vendégként megoldott ablak
      const solvedQ = await k.open(1);
      const solved = await k.answer(1, solvedQ, true);
      const storedPick = solvedQ.options.indexOf(findAdventItem(solvedQ.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!.options[findAdventItem(solvedQ.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!.correctIndex]!);
      assert.equal(solved.correctIndex, storedPick);
      // B) vendégként MEGNYITOTT, még meg nem válaszolt ablak
      const pendingQ = await k.open(2);
      // A személyes link érkezik; a következő írás (a válasz) már a tokennel megy, és elvégzi az átvételt.
      k.learner = learner.token;
      const pendingItem = findAdventItem(pendingQ.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!;
      const pick = pendingQ.options.indexOf(pendingItem.options[pendingItem.correctIndex]!);
      const graded = await k.post("/doors/2/answer", { questionId: pendingQ.id, pick });
      assert.equal(graded.status, 200, JSON.stringify(graded.json).slice(0, 160));
      assert.equal(graded.json.correct, true, "a gyereknek mutatott sorrend szerinti helyes koppintás helyes marad");
      assert.equal(graded.json.correctIndex, pick);
      // Az átvett, megoldott ablak újranyitva: ugyanaz a kérdés, ugyanaz a sorrend, a helyes jelölés a tárolt választáson.
      const reopened = await k.post("/doors/1/open");
      assert.equal(reopened.status, 200);
      assert.deepEqual(reopened.json.question.options, solvedQ.options, "a sorrend nem változott");
      assert.equal(reopened.json.answered.correctIndex, storedPick);
      assert.deepEqual(await q(`SELECT subject_kind FROM advent_progress WHERE subject_id = ANY($1)`, [[k.device, learner.id]]), [{ subject_kind: "learner" }]);
      await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
    }
  });

  it("névtelen → párosított: a tanuló körszáma, korábbi köre, megfelelése és levél-foglalásai az átvétel után is megmaradnak (vak ellenőr K2)", async () => {
    const learner = await newLearner(5);
    const tablet = await kid(); tablet.learner = learner.token;
    await tablet.answer(1, await tablet.open(1), true);
    // A tanuló sorát közvetlenül a 2. körre állítjuk, egy 1. körös előzménnyel, levél-foglalással és megfeleléssel.
    await dbPool.query(
      `UPDATE advent_progress SET round = 2, doors = jsonb_build_object('1', doors->'1', '2', '{}'::jsonb), plan = plan || jsonb_build_object('2', plan->'1'),
         mailed_to = ARRAY['1:final:abc'], passed_at = now() - interval '1 day' WHERE learner_id = $1`, [learner.id]);
    const phone = await kid();
    assert.equal((await phone.post("/grade", { grade: 5 })).status, 200);
    await phone.answer(3, await phone.open(3), true);
    phone.learner = learner.token;
    await phone.post("/doors/4/open");
    const [row] = await q<{ round: number; mailed_to: string[]; passed: boolean; round1: Json; round2: Json }>(
      `SELECT round, mailed_to, passed_at IS NOT NULL AS passed, doors->'1' AS round1, doors->'2' AS round2 FROM advent_progress WHERE learner_id = $1`, [learner.id]);
    assert.equal(row!.round, 2, "a körszám nem áll vissza");
    assert.deepEqual(row!.mailed_to, ["1:final:abc"], "a levél-foglalás megmaradt (nem megy ki újra levél)");
    assert.equal(row!.passed, true);
    assert.equal(row!.round1["1"].attempts.length, 1, "az 1. kör előzménye érintetlen");
    assert.equal(row!.round2["3"].attempts[0].correct, true, "a vendég ablaka a tanuló aktuális körébe került");
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [phone.device]), []);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("névtelen → párosított: az átvétel a korlátok és a fázis-ellenőrzés UTÁN fut — bezárt évadban az írás nem írja át a sorokat (vak ellenőr KICSI-5)", async () => {
    const learner = await newLearner(5);
    const k = await kid();
    assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await k.answer(1, await k.open(1), true);
    k.learner = learner.token;
    k.now = "2027-01-07T10:00:00Z";
    assert.equal((await k.post("/doors/1/open")).status, 409, "bezárt évad");
    assert.deepEqual(await q(`SELECT subject_kind FROM advent_progress WHERE subject_id = ANY($1) ORDER BY subject_kind`, [[k.device, learner.id]]), [{ subject_kind: "device" }], "nem történt átvétel");
    // Az olvasás közben is az egyesített előnézetet mutatja (írás nélkül).
    assert.equal((await k.state()).json.summary.solved, 1);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("névtelen → párosított: más gyerek (testvér) rontott próbája a közös eszközön nem rontja a gyerek érintetlen ablakát (vak ellenőr 3. kör KÖZEPES-A, V5)", async () => {
    const learner = await newLearner(5);
    const tablet = await kid(); tablet.learner = learner.token;
    await tablet.answer(1, await tablet.open(1), true);
    const shared = await kid();
    assert.equal((await shared.post("/grade", { grade: 5 })).status, 200);
    await shared.answer(4, await shared.open(4), false);
    shared.learner = learner.token;
    assert.equal((await shared.post("/doors/2/open")).status, 200);
    const [row] = await q<{ d1: Json; d4: Json }>(`SELECT doors->(round::text)->'1' AS d1, doors->(round::text)->'4' AS d4 FROM advent_progress WHERE learner_id = $1`, [learner.id]);
    assert.equal(row!.d1.attempts[0].correct, true, "a gyerek megoldott ablaka marad");
    assert.equal(row!.d4, null, "a testvér rontott próbája nem került a gyerekhez");
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [shared.device]), []);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("névtelen → párosított: az elutasított írás (holnapi ablak 403, érvénytelen válasz 400, elavult kérdés 409) NEM véglegesíti az átvételt — mindkét sor tartalma változatlan (GPT-vak L2)", async () => {
    const learner = await newLearner(5);
    const tablet = await kid(); tablet.learner = learner.token;
    await tablet.answer(1, await tablet.open(1), true);
    const phone = await kid();
    phone.now = "2026-12-03T10:00:00Z";
    tablet.now = phone.now;
    assert.equal((await phone.post("/grade", { grade: 5 })).status, 200);
    await phone.answer(2, await phone.open(2), true);
    await phone.answer(3, await phone.open(3), false); // a 3. ablak még javítható
    const snapshot = async () => q<{ kind: string; doors: Json; plan: Json }>(`SELECT subject_kind AS kind, doors, plan FROM advent_progress WHERE subject_id = ANY($1) ORDER BY subject_kind`, [[phone.device, learner.id]]);
    const before = await snapshot();
    assert.deepEqual(before.map((r) => r.kind), ["device", "learner"]);
    phone.learner = learner.token;
    // Holnapi ablak: 403, állapotváltozás nélkül.
    assert.equal((await phone.post("/doors/4/open")).status, 403);
    assert.deepEqual(await snapshot(), before, "403 után mindkét sor érintetlen");
    // Érvénytelen választest: 400, állapotváltozás nélkül.
    assert.equal((await phone.post("/doors/3/answer", { questionId: 42, pick: "x" })).status, 400);
    assert.deepEqual(await snapshot(), before, "400 után mindkét sor érintetlen");
    // DB-függő elutasítás (elavult kérdés): 409, állapotváltozás nélkül — az ellenőrzés és az átvétel egy tranzakcióban.
    assert.equal((await phone.post("/doors/3/answer", { questionId: "nem-letezo-kerdes", pick: 0 })).status, 409);
    assert.deepEqual(await snapshot(), before, "409 után mindkét sor érintetlen");
    // Az első SIKERES írás végzi el az átvételt.
    assert.equal((await phone.post("/doors/1/open")).status, 200);
    const after = await snapshot();
    assert.deepEqual(after.map((r) => r.kind), ["learner"]);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("sérült próbaelem ([null], hiányzó mező) a tárolt sorban: 500 helyett 409 corrupt — olvasáskor és az átvételkor is, a sorok érintetlenek (GPT-vak L4)", async () => {
    const k = await kid();
    assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await k.answer(1, await k.open(1), true);
    for (const bad of ['{"1": {"1": {"attempts": [null]}}}', '{"1": {"1": {"attempts": [{"questionId": "x"}]}}}']) {
      await dbPool.query(`UPDATE advent_progress SET doors = $2::jsonb WHERE subject_id = $1`, [k.device, bad]);
      const r = await k.state();
      assert.deepEqual({ status: r.status, corrupt: r.json.corrupt }, { status: 409, corrupt: true }, bad);
      const w = await k.post("/doors/1/open");
      assert.deepEqual({ status: w.status, corrupt: w.json.corrupt }, { status: 409, corrupt: true }, bad + " (írás)");
    }
    // Átvételkor: a sérült vendégsor nem kerül át és nem törlődik; 409 corrupt, a tanulói sor érintetlen.
    const learner = await newLearner(5);
    const tablet = await kid(); tablet.learner = learner.token;
    await tablet.answer(2, await tablet.open(2), true);
    const learnerBefore = await q(`SELECT doors, plan FROM advent_progress WHERE learner_id = $1`, [learner.id]);
    k.learner = learner.token;
    const adopt = await k.post("/doors/2/open");
    assert.deepEqual({ status: adopt.status, corrupt: adopt.json.corrupt }, { status: 409, corrupt: true });
    assert.deepEqual(await q(`SELECT doors, plan FROM advent_progress WHERE learner_id = $1`, [learner.id]), learnerBefore, "a tanulói sor érintetlen");
    assert.equal((await q(`SELECT 1 FROM advent_progress WHERE subject_id = $1`, [k.device])).length, 1, "a sérült vendégsor megmaradt");
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("két eszköz ELSŐ, párhuzamos átvétele (READ COMMITTED, két kapcsolat, szinkronizációs pont): mindkét eszköz megoldása megmarad (GPT-vak 3. kör L1)", async () => {
    const learner = await newLearner(5);
    const phone = await kid(); const tablet = await kid();
    for (const k of [phone, tablet]) assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await phone.answer(1, await phone.open(1), true);
    await tablet.answer(2, await tablet.open(2), true);
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE learner_id = $1`, [learner.id]), [], "még nincs tanulói sor");
    // Mindkét tranzakció az első (zároló) olvasás után a beszúrásnál találkozik: egyik sem látja a másik tanulói sorát.
    let arrived = 0; let open!: () => void;
    const barrier = new Promise<void>((resolve) => { open = resolve; });
    const syncedPool = {
      query: dbPool.query.bind(dbPool),
      connect: async () => {
        const client = await dbPool.connect();
        const query = client.query.bind(client);
        return new Proxy(client, { get(target, prop) {
          if (prop !== "query") return Reflect.get(target, prop);
          return async (text: unknown, params?: unknown[]) => {
            if (typeof text === "string" && /^\s*INSERT INTO advent_progress/.test(text)) {
              if (++arrived === 2) open();
              await barrier;
            }
            return query(text as string, params as unknown[]);
          };
        } });
      },
    };
    const store = createAdventStore(syncedPool as never);
    const ctxFor = (device: string) => createAdoptionContext({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, season: 2026, learnerId: learner.id, learnerGrade: 5, deviceId: device, now: new Date("2026-12-05T10:00:00Z") });
    const adoptFor = (device: string) => ({ deviceId: device, merge: (l: never, d: never) => mergeAdoption(l, d, ctxFor(device)) });
    const subject = { kind: "learner" as const, id: learner.id };
    const results = await Promise.allSettled([phone.device, tablet.device].map((device) => store.mutate(2026, subject, () => ({ patch: null, result: null }), adoptFor(device) as never)));
    assert.deepEqual(results.map((r) => r.status), ["fulfilled", "fulfilled"]);
    const [row] = await q<{ d1: Json; d2: Json }>(`SELECT doors->(round::text)->'1' AS d1, doors->(round::text)->'2' AS d2 FROM advent_progress WHERE learner_id = $1`, [learner.id]);
    assert.equal(row!.d1?.attempts?.[0]?.correct, true, "a telefon megoldása megmaradt");
    assert.equal(row!.d2?.attempts?.[0]?.correct, true, "a tablet megoldása megmaradt");
    assert.deepEqual(await q(`SELECT 1 FROM advent_progress WHERE subject_id = ANY($1)`, [[phone.device, tablet.device]]), [], "mindkét vendégsor átkerült");
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("a profil évfolyama a megnyitás és a válasz között változik: a régi kérdésre adott válasz 409 mentés nélkül, az újranyitott kérdésre adott válasz a helyes évfolyamot rögzíti (GPT-vak 3. kör L3)", async () => {
    const learner = await newLearner(7);
    const k = await kid(); k.learner = learner.token;
    const oldQ = await k.open(1);
    await dbPool.query(`UPDATE learners SET grade = 5 WHERE id = $1`, [learner.id]);
    const item = findAdventItem(oldQ.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!;
    const before = await q(`SELECT grade, doors FROM advent_progress WHERE learner_id = $1`, [learner.id]);
    const stale = await k.post("/doors/1/answer", { questionId: oldQ.id, pick: oldQ.options.indexOf(item.options[item.correctIndex]!) });
    assert.equal(stale.status, 409, "a régi évfolyamú kérdésre adott válasz nem rögzül");
    assert.deepEqual(await q(`SELECT grade, doors FROM advent_progress WHERE learner_id = $1`, [learner.id]), before, "mentés nélkül");
    await k.answer(1, await k.open(1), true);
    assert.deepEqual(await q(`SELECT grade FROM advent_progress WHERE learner_id = $1`, [learner.id]), [{ grade: 5 }]);
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("sérült vendégsor párosított OLVASÁSKOR is 409 corrupt (nem csendes kihagyás); a terv hiányzó subjects mezője is 409 corrupt, nem kivétel; a sorok érintetlenek (GPT-vak 3. kör L4)", async () => {
    const learner = await newLearner(5);
    const tablet = await kid(); tablet.learner = learner.token;
    await tablet.answer(2, await tablet.open(2), true);
    const k = await kid();
    assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
    await k.answer(1, await k.open(1), true);
    await dbPool.query(`UPDATE advent_progress SET doors = '{"1": {"1": {"attempts": [null]}}}'::jsonb WHERE subject_id = $1`, [k.device]);
    const snapshot = () => q(`SELECT subject_kind, doors, plan FROM advent_progress WHERE subject_id = ANY($1) ORDER BY subject_kind`, [[k.device, learner.id]]);
    const before = await snapshot();
    k.learner = learner.token;
    const r = await k.state();
    assert.deepEqual({ status: r.status, corrupt: r.json.corrupt }, { status: 409, corrupt: true }, "párosított olvasás");
    assert.deepEqual(await snapshot(), before);
    // A tanulói sor tervéből hiányzik a subjects (megválaszolt ablakkal): 409 corrupt, nem 500.
    await dbPool.query(`UPDATE advent_progress SET plan = (SELECT jsonb_object_agg(key, value - 'subjects') FROM jsonb_each(plan)) WHERE learner_id = $1`, [learner.id]);
    const r2 = await tablet.state();
    assert.deepEqual({ status: r2.status, corrupt: r2.json.corrupt }, { status: 409, corrupt: true }, "hiányzó subjects");
    await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
  });

  it("sérült adventi próba ([null]) nem töri el a játékos adatletöltését: az alap-export megy, a sérült adventi rész jelölve — kikapcsolt naptárral is (GPT-vak 3. kör L5)", async () => {
    const [player] = await q<{ id: string }>(`INSERT INTO player_accounts (email) VALUES ($1) RETURNING id`, [`advent-${randomUUID()}@websuli.example`]);
    await createAdventStore(dbPool).mutate(2026, { kind: "player", id: player!.id }, () => ({ patch: { grade: 6, doors: { 1: { 1: { attempts: [null as never] } } } }, result: null }));
    const flag = process.env.ADVENT_CALENDAR;
    try {
      for (const value of ["on", ""]) {
        process.env.ADVENT_CALENDAR = value;
        const exported = await createPlayerAccountStore(dbPool).exportAccount(player!.id, () => []) as Json;
        assert.ok(exported?.account?.email, "az alap-export megvan (" + (value || "KI") + ")");
        assert.equal(exported.adventCalendar.length, 1);
        assert.equal(exported.adventCalendar[0].corrupt, true, "a sérült adventi rész jelölve");
      }
    } finally {
      process.env.ADVENT_CALENDAR = flag;
      await dbPool.query(`DELETE FROM player_accounts WHERE id = $1`, [player!.id]);
    }
  });

  it("névtelen → párosított, versenyhelyzet: az átvétellel egyidejű válasz sem ad 500-at, és nem vész el — végül egyetlen tanulói sor (terv 21., #170)", async () => {
    for (let round = 0; round < 3; round++) {
      const learner = await newLearner(5);
      const k = await kid();
      assert.equal((await k.post("/grade", { grade: 5 })).status, 200);
      await k.answer(2, await k.open(2), true);
      const question = await k.open(1);
      const item = findAdventItem(question.id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!;
      const pick = question.options.indexOf(item.options[item.correctIndex]!);
      // Ugyanaz a böngésző két lapon: az egyik még link nélkül válaszol, a másik már a linkkel ír (átvétel).
      const paired = Object.assign(new Kid(), { cookie: k.cookie, csrf: k.csrf, device: k.device, ip: k.ip, learner: learner.token });
      const [answer, adopt] = await Promise.all([
        k.post("/doors/1/answer", { questionId: question.id, pick }),
        paired.post("/doors/3/open"),
      ]);
      assert.ok([200, 409].includes(answer.status), "válasz: " + answer.status + " " + JSON.stringify(answer.json).slice(0, 120));
      assert.equal(adopt.status, 200, JSON.stringify(adopt.json).slice(0, 160));
      const rows = await q<{ subject_kind: string; doors: Json }>(`SELECT subject_kind, doors FROM advent_progress WHERE subject_id = ANY($1)`, [[k.device, learner.id]]);
      assert.deepEqual(rows.map((r) => r.subject_kind), ["learner"], "egyetlen élő sor");
      const door1 = rows[0]!.doors["1"]?.["1"]?.attempts ?? [];
      if (answer.status === 200) assert.equal(door1.length, 1, "a sikeres válasz átkerült a tanulóhoz");
      assert.equal((rows[0]!.doors["1"]?.["2"]?.attempts ?? []).length, 1, "a korábbi haladás megmaradt");
      await dbPool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
    }
  });

  it("bankból eltűnt, már megválaszolt kérdés: a megoldott ablak újranyitása a tárolt eredményt adja, nem hibát (review C5)", async () => {
    const k = await kid();
    assert.equal((await k.post("/grade", { grade: 7 })).status, 200);
    const question = await k.open(2);
    await k.answer(2, question, true);
    // A tervben és a próbában a kérdés azonosítóját olyanra írjuk át, amely a bankban nincs (mintha a tétel kikerült volna).
    await dbPool.query(`UPDATE advent_progress SET plan = replace(plan::text, $2, 'g07-torolt-001')::jsonb, doors = replace(doors::text, $2, 'g07-torolt-001')::jsonb WHERE subject_id = $1`, [k.device, question.id]);
    const reopened = await k.post("/doors/2/open");
    assert.equal(reopened.status, 200);
    assert.equal(reopened.json.question, null);
    assert.deepEqual({ correct: reopened.json.answered.correct, correctIndex: reopened.json.answered.correctIndex, state: reopened.json.answered.door.state }, { correct: true, correctIndex: -1, state: "solved" });
    // A duplán küldött válasz is a tárolt eredményt adja.
    const again = await k.post("/doors/2/answer", { questionId: "g07-torolt-001", pick: 0 });
    assert.deepEqual({ status: again.status, correct: again.json.correct }, { status: 200, correct: true });
    // A naptár többi része működik.
    assert.equal((await k.state()).json.doors[1].state, "solved");
    await k.answer(1, await k.open(1), true);
  });
});
