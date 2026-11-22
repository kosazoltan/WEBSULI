import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { and, eq, inArray } from "drizzle-orm";
import { knowledgeMaps, lessonResultEmails, lessons } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { experienceRoundSizes } from "../shared/lesson-experience";
import { randomBytes } from "node:crypto";
import { PROXY_SECRET_ENV, PROXY_SECRET_HEADER } from "../server/lib/client-ip";

/**
 * Spec 2026-11-17-eredmeny-email-kviz, R1–R7 (a vak ellenőrzés leletei, 2026-11-18) — eldobható Postgresben, valódi HTTP-n, teszt-küldővel
 * (valódi levél nem megy). A kérések címét a megosztott titokfejléces `X-Forwarded-For` adja, így a keretek kérésenként külön kulcsra esnek.
 */
// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const RECIPIENTS = ["partial-a@example.test", "partial-b@example.test"];
process.env.ADMIN_EMAILS = RECIPIENTS.join(", ");
// A megosztott titok futásonként véletlen (nem beégetett érték); csak ez a tesztfolyamat ismeri.
const PROXY_SECRET = randomBytes(24).toString("hex");
process.env[PROXY_SECRET_ENV] = PROXY_SECRET;
const { db, dbPool } = await import("../server/db");
const { lessonResultsRouter, roundKeyOf, resultIdempotencyKey, setResultSender, setPartialDelay, setRetryDelay, clearPendingPartials, pendingPartialCount, flushPendingPartials, setSendTimeout, clearFinalizedRounds, setFinalizedCheckFault, setPartialIntakeHook, setGateCheckHook, resultSubjectOf, setPartialScheduleHook, setAttributionFault, setFinalClaimFault, sendingPartialWho, setLearnerResolveFault, setOwnerCheckFault, setFinalMarkerFault, pruneRoundIdentity, roundIdentityKeysOf } = await import("../server/lesson-result-email");
const { formatBudapest } = await import("../shared/lesson-result-email");
/** Terv R11: a pillanatkép körkulcsa a nyilvántartásban tanulótól független (lecke + kör). */
const partialRoundKey = (roundId: string) => roundKeyOf("partial-round", "quiz-partial", roundId);

const LESSON = "partial-published";
type Mail = { subject: string; html: string; to: string; key: string; startSeq: number; endSeq: number };
const sent: Mail[] = [];
let seq = 0;
let sendDelayMs = 0;
/** Teszthez: a küldő kísérletenként eldönti, bukik-e (a kísérlet így is sorszámot kap). */
let shouldFail: (mail: { subject: string; to: string }) => boolean = () => false;
const attempts: Array<{ subject: string; to: string; failed: boolean }> = [];
const sender = async (subject: string, html: string, to: string, key: string) => {
  const startSeq = ++seq;
  const failed = shouldFail({ subject, to });
  attempts.push({ subject, to, failed });
  if (sendDelayMs) await new Promise(resolve => setTimeout(resolve, sendDelayMs));
  if (failed) throw new Error("átmeneti hiba");
  sent.push({ subject, html, to, key, startSeq, endSeq: ++seq });
};
const isPartial = (mail: { subject: string }) => /félbehagyva/.test(mail.subject);
const supersedes = (mail: { html: string }) => /a korábbi, „félbehagyva” jelzésű levél helyébe lép/.test(mail.html);
const lesson = fusionFixture();
const ROUND_SIZE = experienceRoundSizes(lesson.experience!).quizRound;
const q = lesson.experience!.quiz.slice(0, 5);
const picks = (answered: number) => Object.fromEntries(q.map((item, i) => [item.id, i < answered ? item.correctIndex : -1]));
let base = "";
let close = () => {};
let ipCounter = 0;
const freshIp = () => { ipCounter++; return `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`; };
const post = (body: object, ip = freshIp(), user?: string) => fetch(`${base}/api/lessons/${LESSON}/results`, { method: "POST",
  headers: { "content-type": "application/json", [PROXY_SECRET_HEADER]: PROXY_SECRET, "x-forwarded-for": ip, ...(user ? { "x-test-user": user } : {}) }, body: JSON.stringify(body) });
/** R52: a kör kilét-rögzítő sorainak kulcsai (a jelzősor + az eddig ismert tulajdonosok). */
const postClaimRows = async (roundId: string) => (await db.select({ roundKey: lessonResultEmails.roundKey }).from(lessonResultEmails).where(eq(lessonResultEmails.lessonId, LESSON))).map(row => row.roundKey).filter(key => roundIdentityKeysOf("quiz", roundId).some(prefix => key.startsWith(prefix)));
/** R51: a kör kilét-rögzítő kérése (az első válasznál). */
const postClaim = (body: object, ip = freshIp(), user?: string) => fetch(`${base}/api/lessons/${LESSON}/results/claim`, { method: "POST",
  headers: { "content-type": "application/json", [PROXY_SECRET_HEADER]: PROXY_SECRET, "x-forwarded-for": ip, ...(user ? { "x-test-user": user } : {}) }, body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (pred: () => boolean, ms = 4000) => { for (const end = Date.now() + ms; Date.now() < end && !pred();) await sleep(20); return pred(); };
const reset = () => { sent.length = 0; attempts.length = 0; shouldFail = () => false; sendDelayMs = 0; };

before(async () => {
  setResultSender(sender);
  await db.insert(knowledgeMaps).values({ id: "partial-map", title: "Félbehagyott kvíz próba", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "partial-integration-only" });
  await db.insert(lessons).values({ id: LESSON, mapId: "partial-map", json: lesson, version: 1, publishedAt: new Date() });
  const app = express();
  app.use(express.json());
  // Csak ebben a teszt-alkalmazásban: a bejelentkezett (igazolt) tanuló utánzása fejlécből (az éles útvonalon a passport állítja).
  app.use((req, _res, next) => { const user = req.header("x-test-user"); if (user) (req as unknown as { user: { id: string } }).user = { id: user }; next(); });
  app.use("/api/lessons", lessonResultsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(async () => { clearPendingPartials(); close(); setResultSender(null); await dbPool.end(); });

test("R1 / K1: a „félbehagyva” levél első kísérlete bukik, az ÚJRAPRÓBA előtt megjön a végleges → az újrapróba nem küld; csak a végleges megy, felülíró mondat nélkül", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  const previousRetry = setRetryDelay(500);
  try {
    // A „félbehagyva” levél első kísérlete mindkét címzettnél bukik (a foglalás felszabadul, újrapróba ütemeződik).
    const failedOnce = new Set<string>();
    shouldFail = mail => { if (!isPartial(mail) || failedOnce.has(mail.to)) return false; failedOnce.add(mail.to); return true; };
    const snapshot = await post({ kind: "quiz", roundId: "round-k1-retry", picks: picks(2), partial: true, fingerprint: "fp-k1-retry" });
    assert.deepEqual([snapshot.status, await snapshot.json()], [202, { queued: true, partial: true }]);
    assert.ok(await waitFor(() => attempts.filter(a => a.failed).length === 2), "a „félbehagyva” levél első kísérlete mindkét címzettnél elbukott");
    assert.deepEqual(sent, [], "a bukás után még semmi nem ment ki");
    // Az újrapróba ablakában a gyerek befejezi a kört.
    assert.equal((await post({ kind: "quiz", roundId: "round-k1-retry", picks: picks(5), fingerprint: "fp-k1-retry" })).status, 202);
    assert.ok(await waitFor(() => sent.filter(mail => !isPartial(mail)).length === 2), "a végleges levél mindkét címzettnek kiment");
    await sleep(1300); // az újrapróba (500 ms) bőven lejár
    assert.deepEqual(sent.map(mail => (isPartial(mail) ? "PARTIAL" : "FINAL")), ["FINAL", "FINAL"], "véglegesített körre az újrapróba sem küld „félbehagyva” levelet");
    assert.ok(sent.every(mail => !supersedes(mail)), "részleges levél nem ment ki → a végleges levélben nincs felülíró mondat");
    assert.equal(attempts.filter(a => isPartial(a)).length, 2, "a „félbehagyva” levélnek nem volt második küldési kísérlete");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); setRetryDelay(previousRetry); }
});

test("R1: végleges beküldés NÉLKÜL az újrapróba továbbra is pótolja a bukott „félbehagyva” levelet (a kapu csak a véglegesített kört fogja meg)", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  const previousRetry = setRetryDelay(300);
  try {
    const failedOnce = new Set<string>();
    shouldFail = mail => { if (!isPartial(mail) || failedOnce.has(mail.to)) return false; failedOnce.add(mail.to); return true; };
    await post({ kind: "quiz", roundId: "round-k1-plain", picks: picks(3), partial: true, fingerprint: "fp-k1-plain" });
    assert.ok(await waitFor(() => sent.length === 2), "az újrapróba mindkét címzettnek pótolt");
    await sleep(500);
    assert.deepEqual(sent.map(mail => (isPartial(mail) ? "PARTIAL" : "FINAL")), ["PARTIAL", "PARTIAL"]);
    assert.deepEqual(sent.map(mail => mail.to).sort(), RECIPIENTS);
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); setRetryDelay(previousRetry); }
});

test("R1 / S1: az időzített „félbehagyva” levél és a végleges beküldés versenye — 60 próba: vagy csak a végleges megy (felülíró mondat nélkül), vagy a részleges ELŐBB megy ki és a végleges tartalmazza a felülíró mondatot", async () => {
  reset();
  const TRIALS = 60, BATCH = 6, DELAY = 150;
  const previousDelay = setPartialDelay(DELAY);
  sendDelayMs = 40; // a küldés valós időt vesz igénybe: a foglalás és a kézbesítés közti ablak látszik
  const who = (i: number) => `guest:fp-race-${i}`;
  // Terv R11: a végleges körkulcs a tanulóé, a pillanatképé a lecke + köré.
  const keysOf = (i: number, part: "quiz" | "quiz-partial") => RECIPIENTS.map(to => resultIdempotencyKey(LESSON, "quiz", part === "quiz" ? roundKeyOf(who(i), "quiz", `round-race-${i}`) : partialRoundKey(`round-race-${i}`), to));
  const outcomes: Record<string, number> = {};
  const bad: string[] = [];
  try {
    for (let start = 0; start < TRIALS; start += BATCH) {
      await Promise.all(Array.from({ length: BATCH }, (_, n) => start + n).map(async i => {
        // A végleges beküldés az időzítő lejárta körül: −45 … +43 ms (12 lépésben), próbánként más eltolással.
        const offset = -45 + (i % 12) * 8;
        const body = { roundId: `round-race-${i}`, fingerprint: `fp-race-${i}` };
        const snapshot = await post({ kind: "quiz", ...body, picks: picks(2), partial: true });
        assert.equal(snapshot.status, 202);
        await sleep(DELAY + offset);
        assert.equal((await post({ kind: "quiz", ...body, picks: picks(5) })).status, 202);
        const finalKeys = keysOf(i, "quiz"), partialKeys = keysOf(i, "quiz-partial");
        assert.ok(await waitFor(() => sent.filter(mail => finalKeys.includes(mail.key)).length === 2), `${i}. próba: a végleges levél kiment`);
        await sleep(400); // egy esetleges késői „félbehagyva” levél is megérkezik
        const finals = sent.filter(mail => finalKeys.includes(mail.key));
        const partials = sent.filter(mail => partialKeys.includes(mail.key));
        const label = `${partials.length ? "PARTIAL → " : ""}FINAL${finals.some(supersedes) ? "+felülírás" : ""}`;
        const ok = partials.length === 0
          ? finals.length === 2 && finals.every(mail => !supersedes(mail))
          : finals.length === 2 && finals.every(supersedes) && Math.max(...partials.map(mail => mail.endSeq)) < Math.min(...finals.map(mail => mail.startSeq));
        const key = ok ? label : `HIBÁS: ${partials.length} részleges, ${finals.filter(supersedes).length} / ${finals.length} felülíró, sorrend: ${[...partials, ...finals].sort((a, b) => a.startSeq - b.startSeq).map(mail => (isPartial(mail) ? "P" : "F")).join("")}`;
        outcomes[key] = (outcomes[key] ?? 0) + 1;
        if (!ok) bad.push(`${i}. próba (eltolás ${offset} ms): ${key}`);
      }));
    }
    console.log(`[R1 / S1] ${TRIALS} próba kimenetei: ${JSON.stringify(outcomes)}`);
    assert.deepEqual(bad, [], "ellentmondó levélpár (részleges a végleges mellett felülíró mondat nélkül, vagy részleges a végleges után)");
    assert.equal(Object.values(outcomes).reduce((sum, n) => sum + n, 0), TRIALS);
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R5 / S3: a „félbehagyva” levél összes-száma a SZERVER körmérete, nem a kliens által küldött azonosítók száma", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  try {
    // Csak 2 azonosító megy (mindkettő megválaszolva): a levél nem állíthat „2 / 2”-t.
    const two = Object.fromEntries(q.slice(0, 2).map(item => [item.id, item.correctIndex]));
    const res = await post({ kind: "quiz", roundId: "round-s3-total", picks: two, partial: true, fingerprint: "fp-s3-total" });
    assert.deepEqual(await res.json(), { queued: true, partial: true });
    assert.ok(await waitFor(() => sent.length === 2));
    assert.ok(ROUND_SIZE > 2);
    assert.match(sent[0].subject, new RegExp(`— Kvíz \\(félbehagyva: 2 / ${ROUND_SIZE}\\) — `));
    assert.match(sent[0].html, new RegExp(`félbehagyva — 2 / ${ROUND_SIZE} kérdésre válaszolt`));
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R5 / S3: a szerver sem fogadja el a pillanatképet, ha az utolsó tevékenység 7 napnál régebbi; a régen KEZDETT, de most megválaszolt kör megy", async () => {
  reset();
  const previousDelay = setPartialDelay(60_000);
  const DAY = 86_400_000, now = Date.now();
  try {
    clearPendingPartials();
    const staleAnswer = await post({ kind: "quiz", roundId: "round-s3-stale-a", picks: picks(2), partial: true, fingerprint: "fp-s3-stale", startedAt: now - 30 * DAY, lastAnsweredAt: now - 8 * DAY });
    assert.deepEqual([staleAnswer.status, await staleAnswer.json()], [202, { queued: false, stale: true }]);
    const staleStart = await post({ kind: "quiz", roundId: "round-s3-stale-b", picks: picks(2), partial: true, fingerprint: "fp-s3-stale", startedAt: now - 30 * DAY });
    assert.deepEqual([staleStart.status, await staleStart.json()], [202, { queued: false, stale: true }], "utolsó válasz nélkül a kezdés számít");
    assert.equal(pendingPartialCount(), 0, "a régi pillanatkép nem ütemeződött");
    const fresh = await post({ kind: "quiz", roundId: "round-s3-stale-c", picks: picks(2), partial: true, fingerprint: "fp-s3-stale", startedAt: now - 30 * DAY, lastAnsweredAt: now - 60_000 });
    assert.deepEqual([fresh.status, await fresh.json()], [202, { queued: true, partial: true }], "régen megnyitott, most megválaszolt kör megy");
    assert.equal(pendingPartialCount(), 1);
    for (const lastAnsweredAt of [0, -1, 1.5, "ma"]) assert.equal((await post({ kind: "quiz", roundId: "round-s3-stale-d", picks: picks(2), partial: true, lastAnsweredAt })).status, 400, String(lastAnsweredAt));
    assert.equal((await post({ kind: "tasks", roundId: "round-s3-stale-e", answers: { x: "y" }, lastAnsweredAt: now })).status, 400, "a feladatoknak nincs ilyen mezője");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R6 / S4: a már kiment „félbehagyva” levél utáni pillanatképre a válasz igaz — nem ütemeződik, `queued: false, alreadySent: true`", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  try {
    clearPendingPartials();
    const body = { kind: "quiz", roundId: "round-s4-truth", partial: true, fingerprint: "fp-s4-truth" };
    assert.deepEqual(await (await post({ ...body, picks: picks(1) })).json(), { queued: true, partial: true });
    assert.ok(await waitFor(() => sent.length === 2), "az 1 válaszos „félbehagyva” levél kiment");
    const later = await post({ ...body, picks: picks(4) });
    assert.deepEqual([later.status, await later.json()], [202, { queued: false, partial: true, alreadySent: true }]);
    assert.equal(pendingPartialCount(), 0, "a későbbi pillanatkép nem ütemeződött");
    await sleep(500);
    assert.equal(sent.length, 2, "körönként legfeljebb egy „félbehagyva” levél");
    const [row] = await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, LESSON), eq(lessonResultEmails.roundKey, partialRoundKey("round-s4-truth"))));
    assert.deepEqual([...row.delivered].sort(), RECIPIENTS);
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R7 / S5: körönként a LEGTÖBB választ tartalmazó pillanatkép marad — a később érkező, kevesebb válaszú nem írja felül", async () => {
  reset();
  // Az időablakok a mért időpontokhoz igazodnak, nem fix várakozáshoz: terhelt gépen (lassú kérés) is egyértelmű a kimenet.
  const DELAY = 3000, GAP = 1500;
  const previousDelay = setPartialDelay(DELAY);
  try {
    clearPendingPartials();
    const body = { kind: "quiz", roundId: "round-s5-most", partial: true, fingerprint: "fp-s5-most" };
    assert.deepEqual(await (await post({ ...body, picks: picks(4) })).json(), { queued: true, partial: true });
    const firstQueuedBy = Date.now(); // az első időzítő legkésőbb firstQueuedBy + DELAY-kor járna le
    await sleep(GAP);
    const secondSentAt = Date.now(); // a második időzítő legkorábban secondSentAt + DELAY-kor jár le
    assert.deepEqual(await (await post({ ...body, picks: picks(2) })).json(), { queued: true, partial: true }); // sorrendcsere / másik fül régebbi állapota
    assert.equal(pendingPartialCount(), 1, "körönként egy várakozó");
    // A mérési pont az első időzítő lejárta UTÁN, de a második előtt van (mindkét oldalon ≥ 700 ms tartalék).
    const checkAt = firstQueuedBy + DELAY + 700;
    assert.ok(checkAt < secondSentAt + DELAY - 700, "a mérési ablak egyértelmű");
    await sleep(Math.max(0, checkAt - Date.now()));
    assert.equal(sent.length, 0, "a később érkező pillanatkép az időzítőt újraindította");
    assert.ok(await waitFor(() => sent.length === 2));
    await sleep(400);
    assert.equal(sent.length, 2);
    assert.match(sent[0].subject, new RegExp(`félbehagyva: 4 / ${ROUND_SIZE}\\)`), "a 4 válaszos állapot ment ki");
    // Az újabb, TÖBB választ tartalmazó pillanatkép viszont felülír.
    reset();
    const more = { kind: "quiz", roundId: "round-s5-more", partial: true, fingerprint: "fp-s5-more" };
    await post({ ...more, picks: picks(2) });
    await post({ ...more, picks: picks(3) });
    assert.ok(await waitFor(() => sent.length === 2));
    assert.match(sent[0].subject, new RegExp(`félbehagyva: 3 / ${ROUND_SIZE}\\)`));
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* Második vak ellenőrzés (2026-11-18), terv R11, R13, R14. */
test("R11 / K1: ujjlenyomat NÉLKÜLI, majd ujjlenyomatos pillanatkép ugyanarról a körről → egy „félbehagyva” levél címzettenként (a későbbi állapotból)", async () => {
  reset();
  const previousDelay = setPartialDelay(300);
  try {
    clearPendingPartials();
    const ip = freshIp();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-k1-dual", picks: picks(1), partial: true }, ip)).json(), { queued: true, partial: true });
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-k1-dual", picks: picks(3), partial: true, fingerprint: "fp-k1-dual" }, ip)).json(), { queued: true, partial: true });
    assert.equal(pendingPartialCount(), 1, "körönként EGY várakozó, a tanuló-kulcstól függetlenül");
    assert.ok(await waitFor(() => sent.length >= 2));
    await sleep(700);
    assert.equal(sent.length, 2, "körönként legfeljebb egy „félbehagyva” levél címzettenként");
    assert.ok(sent.every(mail => new RegExp(`félbehagyva: 3 / ${ROUND_SIZE}\\)`).test(mail.subject)), "a későbbi (több válaszú) állapot ment ki");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R11 / K1: IP-váltás a két ujjlenyomat nélküli pillanatkép között → egy levél címzettenként", async () => {
  reset();
  const previousDelay = setPartialDelay(300);
  try {
    clearPendingPartials();
    await post({ kind: "quiz", roundId: "round-k1-ip", picks: picks(2), partial: true }, freshIp());
    await post({ kind: "quiz", roundId: "round-k1-ip", picks: picks(4), partial: true }, freshIp());
    assert.equal(pendingPartialCount(), 1);
    assert.ok(await waitFor(() => sent.length >= 2));
    await sleep(700);
    assert.equal(sent.length, 2);
    assert.ok(sent.every(mail => new RegExp(`félbehagyva: 4 / ${ROUND_SIZE}\\)`).test(mail.subject)));
    // A már kiment levél után más kulcsú pillanatkép sem küld újat (R6 a lecke + kör szerint).
    const later = await post({ kind: "quiz", roundId: "round-k1-ip", picks: picks(5), partial: true, fingerprint: "fp-k1-ip" }, freshIp());
    assert.deepEqual(await later.json(), { queued: false, partial: true, alreadySent: true });
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R11 / K2: a részleges levél IP1-ről ujjlenyomat nélkül ment ki, a végleges IP2-ről ujjlenyomattal jön → a végleges levél felülíró mondatot tartalmaz", async () => {
  reset();
  const previousDelay = setPartialDelay(150);
  try {
    clearPendingPartials();
    await post({ kind: "quiz", roundId: "round-k2-move", picks: picks(2), partial: true }, freshIp());
    assert.ok(await waitFor(() => sent.length === 2), "a „félbehagyva” levél kiment");
    assert.equal((await post({ kind: "quiz", roundId: "round-k2-move", picks: picks(5), fingerprint: "fp-k2-move" }, freshIp())).status, 202);
    assert.ok(await waitFor(() => sent.filter(mail => !isPartial(mail)).length === 2));
    const finals = sent.filter(mail => !isPartial(mail));
    assert.ok(finals.every(supersedes), "a végleges levél kimondja, hogy a korábbi „félbehagyva” levél helyébe lép");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

// Terv R15 / R16 (harmadik vak ellenőrzés, dokumentált spec-változás): az első rögzítő védelme csak a TARTALOM felülírására vonatkozik;
// bármely véglegesítés elnyomja a kör „félbehagyva” levelét; a vendég kör átvételekor a levél neve „Vendég tanuló” marad.
test("R11 + R15 + R16 (első rögzítő): igazolt tanuló pillanatképének TARTALMÁT vendég nem írja felül; bármely véglegesítés elnyomja; vendég kör átvétele „Vendég tanuló” névvel", async () => {
  reset();
  const previousDelay = setPartialDelay(400);
  try {
    clearPendingPartials();
    // Az igazolt (bejelentkezett) tanuló pillanatképe várakozik …
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-owner", picks: picks(2), partial: true }, freshIp(), "user-owner")).json(), { queued: true, partial: true });
    // … a körazonosítót ismerő vendég nem írhatja felül (több válasszal sem) …
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-owner", picks: picks(4), partial: true, fingerprint: "fp-intruder" }, freshIp())).json(), { queued: false, partial: true, conflict: true });
    assert.equal(pendingPartialCount(), 1, "a tartalom-felülírás elutasítva, a várakozó az igazolt tanulóé");
    // R15: a végleges beküldés — bárki küldi — elnyomja a kör „félbehagyva” levelét (ártalmatlan irány: legfeljebb ez a levél marad el).
    assert.equal((await post({ kind: "quiz", roundId: "round-owner", picks: picks(5), fingerprint: "fp-intruder" }, freshIp())).status, 202);
    assert.equal(pendingPartialCount(), 0, "a véglegesítés törölte a várakozót");
    assert.ok(await waitFor(() => sent.length === 2), "a végleges levél kiment");
    await sleep(700);
    assert.equal(sent.filter(isPartial).length, 0, "a véglegesített kör után nem megy „félbehagyva” levél");
    // Vendég kör → az igazolt tanuló (pl. bejelentkezés a kör közben) átveheti.
    reset();
    clearPendingPartials();
    await post({ kind: "quiz", roundId: "round-owner-guest", picks: picks(1), partial: true, fingerprint: "fp-owner-guest" }, freshIp());
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-owner-guest", picks: picks(3), partial: true }, freshIp(), "user-later")).json(), { queued: true, partial: true });
    assert.equal(pendingPartialCount(), 1);
    assert.ok(await waitFor(() => sent.length === 2));
    await sleep(600);
    assert.equal(sent.length, 2);
    assert.ok(sent.every(mail => new RegExp(`félbehagyva: 3 / ${ROUND_SIZE}\\)`).test(mail.subject)));
    // R16: a vendég kör vendég kör marad — a levél neve „Vendég tanuló”, nem az átvevőé.
    assert.ok(sent.every(mail => mail.html.includes("Vendég tanuló")), "vendég-attribúció");
    assert.ok(sent.every(mail => !mail.html.includes("Bejelentkezett tanuló")), "az átvevő (fiók) neve nincs a levélben");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R15 / L1: a bejelentkezett tanuló munkamenete a kör közben megszűnik, vendégként fejezi be → csak végleges levelek, „félbehagyva” a végleges után nem megy", async () => {
  reset();
  const previousDelay = setPartialDelay(300);
  try {
    clearPendingPartials();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-l1-logout", picks: picks(2), partial: true }, freshIp(), "u-anna")).json(), { queued: true, partial: true });
    assert.equal((await post({ kind: "quiz", roundId: "round-l1-logout", picks: picks(5), fingerprint: "fp-l1" }, freshIp())).status, 202);
    assert.equal(pendingPartialCount(), 0, "a vendégként küldött végleges beküldés is törölte a várakozót");
    assert.ok(await waitFor(() => sent.length === 2));
    await sleep(900); // a pillanatkép időzítője (300 ms) bőven lejárt volna
    assert.deepEqual(sent.map(mail => (isPartial(mail) ? "P" : "F")), ["F", "F"], "csak a két végleges levél");
    assert.ok(sent.every(mail => !supersedes(mail)), "részleges nem ment ki → felülíró mondat sincs");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R17 / L3 (K5): a körmérettel egyenlő számú válaszú pillanatkép nem ütemez „félbehagyva” levelet", async () => {
  reset();
  const previousDelay = setPartialDelay(150);
  try {
    clearPendingPartials();
    const full = Object.fromEntries(lesson.experience!.quiz.slice(0, ROUND_SIZE).map(item => [item.id, item.correctIndex]));
    const res = await post({ kind: "quiz", roundId: "round-l3-full", picks: full, partial: true, fingerprint: "fp-l3" });
    assert.deepEqual([res.status, await res.json()], [202, { queued: false, partial: true, complete: true }]);
    assert.equal(pendingPartialCount(), 0);
    await sleep(500);
    assert.equal(sent.length, 0, "nincs „félbehagyva: N / N” levél");
    // Egy válasszal kevesebb: továbbra is rendes pillanatkép.
    const almost = Object.fromEntries(lesson.experience!.quiz.slice(0, ROUND_SIZE - 1).map(item => [item.id, item.correctIndex]));
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-l3-almost", picks: almost, partial: true, fingerprint: "fp-l3" })).json(), { queued: true, partial: true });
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R13 / K7: a kliens órája 30 nappal késik — a frissen megválaszolt kör pillanatképe elfogadva, a levél időpontjai a szerver órája szerint", async () => {
  reset();
  const previousDelay = setPartialDelay(150);
  const DAY = 86_400_000, skew = 30 * DAY;
  try {
    clearPendingPartials();
    const clientNow = Date.now() - skew;
    const res = await post({ kind: "quiz", roundId: "round-k7-skew", picks: picks(2), partial: true, fingerprint: "fp-k7", startedAt: clientNow - 10 * 60_000, lastAnsweredAt: clientNow - 2 * 60_000, clientNow });
    assert.deepEqual(await res.json(), { queued: true, partial: true }, "a késő kliensóra nem dob el valódi pillanatképet");
    assert.ok(await waitFor(() => sent.length === 2));
    const html = sent[0].html;
    assert.match(html, /<strong>Utolsó válasz:<\/strong>/);
    const lastAnswered = Date.now() - 2 * 60_000;
    assert.ok([-1, 0, 1].some(m => html.includes(formatBudapest(new Date(lastAnswered + m * 60_000)))), "az utolsó válasz ideje a szerver órájára számolva");
    assert.ok(!html.includes(formatBudapest(new Date(clientNow - 2 * 60_000))), "a kliens hibás órája nem kerül a levélbe");
    // A valóban régi (a kliens saját órája szerint is 8 napos) kör továbbra is elutasítva.
    const stale = await post({ kind: "quiz", roundId: "round-k7-stale", picks: picks(2), partial: true, lastAnsweredAt: clientNow - 8 * DAY, clientNow });
    assert.deepEqual(await stale.json(), { queued: false, stale: true });
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R14 / K4: leállításkor a várakozó „félbehagyva” levél a késleltetés kivárása nélkül kimegy; lefagyott küldőnél az ürítés az időkorláton belül visszatér", async () => {
  reset();
  const previousDelay = setPartialDelay(60_000);
  try {
    clearPendingPartials();
    await post({ kind: "quiz", roundId: "round-k4-flush", picks: picks(2), partial: true, fingerprint: "fp-k4" });
    assert.equal(pendingPartialCount(), 1);
    const started = Date.now();
    await flushPendingPartials(5_000);
    assert.equal(sent.length, 2, "a várakozó levél az ürítéskor kiment");
    assert.ok(Date.now() - started < 5_000);
    assert.equal(pendingPartialCount(), 0);
    // Lefagyott küldő: az ürítés legfeljebb az időkorlátig vár.
    reset();
    clearPendingPartials(); // R45: a lezárult ürítés után a felvétel zárva (503) — új „példány” utánzása, hogy a pillanatkép befogadódjon
    assert.equal(pendingPartialCount(), 0);
    const previousTimeout = setSendTimeout(60_000);
    setResultSender(async () => { await new Promise(() => { /* soha nem tér vissza */ }); });
    try {
      assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-k4-hang", picks: picks(2), partial: true, fingerprint: "fp-k4-hang" })).json(), { queued: true, partial: true });
      const t0 = Date.now();
      await flushPendingPartials(500);
      assert.ok(Date.now() - t0 < 2_000, "az ürítés az időkorlát után visszatér");
    } finally { setResultSender(sender); setSendTimeout(previousTimeout); }
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* Negyedik vak ellenőrzés (2026-11-19), terv R18: a véglegesítés tartós, tanulófüggetlen nyoma. */
test("R18 / M1: véglegesítés → újraindítás → MÁS kilétű pillanatkép ugyanarra a körre → nem ütemez „félbehagyva” levelet; a 24 óránál régebbi jelzősor nem számít", async () => {
  reset();
  const previousDelay = setPartialDelay(200);
  const finalMarker = (roundId: string) => roundKeyOf("final-round", "quiz", roundId);
  try {
    clearPendingPartials();
    // 1. Vendég (ujjlenyomattal) véglegesít IP-A-ról, majd a szerver „újraindul” (a memóriabeli jelző elvész).
    assert.equal((await post({ kind: "quiz", roundId: "round-r18-guest", picks: picks(5), fingerprint: "fp-r18" }, freshIp())).status, 202);
    assert.ok(await waitFor(() => sent.length === 2), "a végleges levél kiment");
    clearFinalizedRounds();
    // 2. Ujjlenyomat nélküli pillanatkép más IP-ről, ugyanarra a körre.
    const late = await post({ kind: "quiz", roundId: "round-r18-guest", picks: picks(2), partial: true }, freshIp());
    assert.deepEqual(await late.json(), { queued: false, finalized: true }, "a tartós, tanulófüggetlen nyom újraindítás után is megfogja");
    assert.equal(pendingPartialCount(), 0);
    // 3. Fiók véglegesít, újraindítás, vendég-pillanatkép (kilétváltás).
    assert.equal((await post({ kind: "quiz", roundId: "round-r18-user", picks: picks(5) }, freshIp(), "u-r18")).status, 202);
    assert.ok(await waitFor(() => sent.length === 4));
    clearFinalizedRounds();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r18-user", picks: picks(3), partial: true, fingerprint: "fp-r18-guest" }, freshIp())).json(), { queued: false, finalized: true });
    await sleep(500);
    assert.equal(sent.filter(isPartial).length, 0, "véglegesített körre „félbehagyva” levél nem ment");
    // 4. Korlátos élettartam: a 24 óránál régebbi jelzősor már nem számít.
    const [marker] = await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, LESSON), eq(lessonResultEmails.roundKey, finalMarker("round-r18-guest"))));
    assert.ok(marker, "a jelzősor a nyilvántartásban van");
    assert.deepEqual(marker.delivered, [], "a jelzősor nem kézbesítés");
    await db.update(lessonResultEmails).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(lessonResultEmails.id, marker.id));
    clearFinalizedRounds();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r18-guest", picks: picks(2), partial: true }, freshIp())).json(), { queued: true, partial: true }, "a lejárt jelzősor nem nyom el");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* Vercel review (2026-11-19, szál 4626976445), terv R19: a küldés előtti ellenőrzés átmeneti hibája után is egy újrapróba. */
test("R19: a kapu véglegesítés-ellenőrzése átmeneti DB-hibát kap → a „félbehagyva” levél egy újrapróbával kimegy; ha közben a kör véglegesül, nem megy ki", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  const previousRetry = setRetryDelay(400);
  const oneShot = () => { let left = 1; return () => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } }; };
  try {
    clearPendingPartials();
    // 1. Egyszeri hiba a kapuban (a pillanatkép fogadása után injektálva) → az újrapróba kiküldi.
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r19-retry", picks: picks(2), partial: true, fingerprint: "fp-r19" })).json(), { queued: true, partial: true });
    setFinalizedCheckFault(oneShot());
    await sleep(250); // az időzítő lejárt, a kapu hibát kapott
    assert.equal(sent.length, 0, "a hibás kísérlet nem küldött");
    assert.ok(await waitFor(() => sent.length === 2, 3000), "az újrapróba kiküldte a „félbehagyva” levelet (nem veszett el)");
    assert.ok(sent.every(isPartial));
    // 2. Egyszeri hiba, majd az újrapróba előtt véglegesül a kör → az újrapróba sem küld részleges levelet.
    reset();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r19-final", picks: picks(2), partial: true, fingerprint: "fp-r19b" })).json(), { queued: true, partial: true });
    setFinalizedCheckFault(oneShot());
    await sleep(250);
    setFinalizedCheckFault(null);
    assert.equal((await post({ kind: "quiz", roundId: "round-r19-final", picks: picks(5), fingerprint: "fp-r19b" })).status, 202);
    assert.ok(await waitFor(() => sent.length === 2));
    await sleep(700); // az újrapróba (400 ms) lefutott
    assert.deepEqual(sent.map(mail => (isPartial(mail) ? "P" : "F")), ["F", "F"], "véglegesített körre az újrapróba sem küld részlegest");
  } finally { setFinalizedCheckFault(null); clearPendingPartials(); setPartialDelay(previousDelay); setRetryDelay(previousRetry); }
});

/* Gépi vak ellenőrzés (GPT-6.2 Sol, 2026-11-19), terv R21 / R22. */
test("R21 / L2: kapuhiba után frissebb pillanatkép érkezik → az eredeti újrapróba idején nincs levél, csak a frissebb (4 válaszos) állapot megy ki", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  const previousRetry = setRetryDelay(500);
  let left = 1;
  try {
    clearPendingPartials();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-l2-stale", picks: picks(2), partial: true, fingerprint: "fp-l2" })).json(), { queued: true, partial: true });
    setFinalizedCheckFault(() => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } });
    await sleep(250); // az első időzítő lejárt, a kapu hibát kapott, az újrapróba ~500 ms múlva jönne
    assert.equal(left, 0, "a kapuhiba megtörtént");
    setPartialDelay(1500); // a frissebb pillanatkép saját, hosszabb időzítőt kap (élesben 15 perc a 60 s-os újrapróbával szemben)
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-l2-stale", picks: picks(4), partial: true, fingerprint: "fp-l2" })).json(), { queued: true, partial: true });
    await sleep(800); // az eredeti újrapróba ideje lejárt
    assert.equal(sent.length, 0, "az elavult (2 válaszos) újrapróba nem küldött");
    assert.ok(await waitFor(() => sent.length === 2, 4000), "a frissebb állapot kiment");
    assert.ok(sent.every(mail => new RegExp(`félbehagyva: 4 / ${ROUND_SIZE}\\)`).test(mail.subject)), "csak a 4 válaszos állapot");
  } finally { setFinalizedCheckFault(null); clearPendingPartials(); setPartialDelay(previousDelay); setRetryDelay(previousRetry); }
});

test("R22 / L4: párhuzamos pillanatképek — a vendég kérése az utolsó várakozásnál áll, közben az igazolt tanuló rögzít → a vendég nem írja felül (conflict), a levél az igazolt tanulóé", async () => {
  reset();
  const previousDelay = setPartialDelay(300);
  let releaseGuest!: () => void;
  const parked = new Promise<void>(resolve => { releaseGuest = resolve; });
  let guestParked = false;
  setPartialIntakeHook(async who => { if (who === "guest:fp-l4-guest") { guestParked = true; await parked; } });
  try {
    clearPendingPartials();
    // R51 (dokumentált spec-változás): a kör kilétét a szerver az első válasznál rögzíti — itt az igazolt tanuló az első rögzítő.
    assert.equal((await postClaim({ kind: "quiz", roundId: "round-l4-race", claim: true }, freshIp(), "u-l4")).status, 202);
    const guestRequest = post({ kind: "quiz", roundId: "round-l4-race", picks: picks(4), partial: true, fingerprint: "fp-l4-guest" });
    assert.ok(await waitFor(() => guestParked, 3000), "a vendég kérése az utolsó várakozás után áll");
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-l4-race", picks: picks(2), partial: true }, freshIp(), "u-l4")).json(), { queued: true, partial: true });
    releaseGuest();
    assert.deepEqual(await (await guestRequest).json(), { queued: false, partial: true, conflict: true }, "az igazolt első rögzítőt a párhuzamos vendég sem írja felül");
    assert.equal(pendingPartialCount(), 1);
    assert.ok(await waitFor(() => sent.length === 2));
    assert.ok(sent.every(mail => new RegExp(`félbehagyva: 2 / ${ROUND_SIZE}\\)`).test(mail.subject)), "az igazolt tanuló (2 válaszos) állapota");
    assert.ok(sent.every(mail => !mail.html.includes("Vendég tanuló")), "nem vendég-attribúcióval");
  } finally { releaseGuest(); setPartialIntakeHook(null); clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* Gépi vak ellenőrzés, 2. célzott kör (GPT-6.2 Sol, 2026-11-19), terv R25. */
test("R25 / L3: a régi pillanatkép küldése a kapuban (lassú ellenőrzés) áll, közben új pillanatkép érkezik → nem kap queued:true választ, miközben a régi levél megy ki", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  let releaseGate!: () => void;
  const held = new Promise<void>(resolve => { releaseGate = resolve; });
  let parked = false;
  setGateCheckHook(async lockKey => { if (lockKey.endsWith("|round-l3-lock")) { parked = true; await held; } });
  try {
    clearPendingPartials();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-l3-lock", picks: picks(2), partial: true, fingerprint: "fp-l3-lock" })).json(), { queued: true, partial: true });
    assert.ok(await waitFor(() => parked, 3000), "a régi kísérlet a kapuban áll (a véglegesítés-ellenőrzés után)");
    setPartialDelay(60_000);
    const fresh = post({ kind: "quiz", roundId: "round-l3-lock", picks: picks(4), partial: true, fingerprint: "fp-l3-lock" });
    await sleep(400);
    releaseGate();
    const answer = await (await fresh).json();
    assert.ok(await waitFor(() => sent.length === 2));
    await sleep(300);
    assert.equal(sent.length, 2);
    const oldWentOut = sent.every(mail => new RegExp(`félbehagyva: 2 / ${ROUND_SIZE}\\)`).test(mail.subject));
    assert.ok(oldWentOut, "a már elindult régi küldés befejeződött");
    assert.deepEqual(answer, { queued: false, partial: true, alreadySent: true }, "az új pillanatkép igaz választ kap — nem fogadtuk el úgy, hogy a régi levél megy ki");
    assert.equal(pendingPartialCount(), 0);
  } finally { releaseGate(); setGateCheckHook(null); clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* Gépi vak ellenőrzés, 3. célzott kör (GPT-6.2 Sol, 2026-11-19), terv R27 / R29. */
test("R27 / L3: a vendégként elfogadott végleges kört (elveszett 202 után) ugyanazon az eszközön fiókba lépve újraküldik → második levél nincs, az eredeti név marad", async () => {
  reset();
  try {
    const body = { kind: "quiz", roundId: "round-l3-identity", picks: picks(5), fingerprint: "fp-l3-identity" };
    assert.equal((await post(body)).status, 202);
    assert.ok(await waitFor(() => sent.length === 2), "az első (vendég) végleges levél kiment");
    const again = await post(body, freshIp(), "u-l3-account");
    assert.deepEqual([again.status, await again.json()], [202, { queued: false, duplicate: true }], "más kiléttel ismételt végleges beküldés");
    await sleep(800);
    assert.equal(sent.length, 2, "körönként egy végleges levél címzettenként");
    assert.ok(sent.every(mail => mail.html.includes("Vendég tanuló") && !mail.html.includes("Bejelentkezett tanuló")), "az eredeti attribúció");
    // Ugyanazon kilét ismétlése változatlanul a meglévő úton fut (nem kap duplicate-választ, levél sem megy újra).
    assert.deepEqual(await (await post(body)).json(), { queued: true });
    await sleep(500);
    assert.equal(sent.length, 2);
  } finally { /* nincs várakozó */ }
});

test("R29 / L5: a pillanatkép a felvétel utolsó várakozásánál áll, közben véglegesítik a kört → a pillanatkép nem kap queued:true választ, várakozó nem marad", async () => {
  reset();
  const previousDelay = setPartialDelay(60_000);
  let release!: () => void;
  const parked = new Promise<void>(resolve => { release = resolve; });
  let isParked = false;
  setPartialIntakeHook(async who => { if (who === "guest:fp-l5-final") { isParked = true; await parked; } });
  try {
    clearPendingPartials();
    const snapshot = post({ kind: "quiz", roundId: "round-l5-final", picks: picks(2), partial: true, fingerprint: "fp-l5-final" });
    assert.ok(await waitFor(() => isParked, 3000));
    assert.equal((await post({ kind: "quiz", roundId: "round-l5-final", picks: picks(5), fingerprint: "fp-l5-final" })).status, 202);
    release();
    assert.deepEqual(await (await snapshot).json(), { queued: false, finalized: true });
    assert.equal(pendingPartialCount(), 0, "a véglegesített körre nem keletkezett várakozó");
  } finally { release(); setPartialIntakeHook(null); clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* PR-review a 44487292-es fejre (2026-11-20), terv R31 / R34. */
test("R31 (4642333188): a sorban maradt végleges eredményt más fiók munkamenete küldi → nem a mostani fiók nevére kerül; egyező címkénél a fiók neve", async () => {
  reset();
  // Csak a saját kör levelei számítanak (az előző teszt háttérben futó végleges levelei a reset után is megérkezhetnek).
  const mailsOf = (who: string, roundId: string) => { const keys = RECIPIENTS.map(to => resultIdempotencyKey(LESSON, "quiz", roundKeyOf(who, "quiz", roundId), to)); return sent.filter(mail => keys.includes(mail.key)); };
  // A sorba kerüléskor az u-r31-a fiók volt bejelentkezve; a küldéskor már u-r31-b munkamenete él (ugyanabban a böngészőben).
  assert.equal((await post({ kind: "quiz", roundId: "round-r31-switch", picks: picks(5), fingerprint: "fp-r31", subject: resultSubjectOf("u-r31-a") }, freshIp(), "u-r31-b")).status, 202);
  assert.ok(await waitFor(() => mailsOf("guest:fp-r31", "round-r31-switch").length === 2), "a levél vendég-kulcson kiment (nem a mostani fiókén)");
  assert.equal(mailsOf("u-r31-b", "round-r31-switch").length, 0, "a mostani fiók kulcsán nem ment levél");
  assert.ok(mailsOf("guest:fp-r31", "round-r31-switch").every(mail => mail.html.includes("Vendég tanuló") && !mail.html.includes("Bejelentkezett tanuló")), "nem a mostani fiók nevére");
  // Fiók nélkül tette a sorba (vendég), azóta valaki bejelentkezett → továbbra is vendég.
  assert.equal((await post({ kind: "quiz", roundId: "round-r31-anon", picks: picks(5), fingerprint: "fp-r31b", subject: resultSubjectOf(undefined) }, freshIp(), "u-r31-b")).status, 202);
  assert.ok(await waitFor(() => mailsOf("guest:fp-r31b", "round-r31-anon").length === 2));
  assert.equal(mailsOf("u-r31-b", "round-r31-anon").length, 0);
  assert.ok(mailsOf("guest:fp-r31b", "round-r31-anon").every(mail => mail.html.includes("Vendég tanuló") && !mail.html.includes("Bejelentkezett tanuló")));
  // Egyező címke: a fiók neve (a megszokott út).
  assert.equal((await post({ kind: "quiz", roundId: "round-r31-same", picks: picks(5), subject: resultSubjectOf("u-r31-c") }, freshIp(), "u-r31-c")).status, 202);
  assert.ok(await waitFor(() => mailsOf("u-r31-c", "round-r31-same").length === 2));
  assert.ok(mailsOf("u-r31-c", "round-r31-same").every(mail => mail.html.includes("Bejelentkezett tanuló") && !mail.html.includes("Vendég tanuló")));
  // A címke a fiókhoz kötött, nem visszafejthető azonosító.
  assert.notEqual(resultSubjectOf("u-r31-a"), resultSubjectOf("u-r31-b"));
  assert.ok(!resultSubjectOf("u-r31-a").includes("u-r31-a"));
  assert.equal(resultSubjectOf(undefined), "anon");
});

test("R34 (4642333345): igazolt tanuló pillanatképe, az első küldés kapuja hibát kap → a vendég pillanatképe conflict; az újrapróba az igazolt tanuló állapotát küldi ki", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  const previousRetry = setRetryDelay(500);
  let left = 1;
  try {
    clearPendingPartials();
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r34-owner", picks: picks(2), partial: true }, freshIp(), "u-r34")).json(), { queued: true, partial: true });
    setFinalizedCheckFault(() => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } });
    await sleep(250); // az időzítő lejárt, a kapu hibát kapott, az újrapróba ~500 ms múlva jön
    assert.equal(left, 0, "a kapuhiba megtörtént");
    assert.equal(sent.length, 0);
    setPartialDelay(60_000);
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r34-owner", picks: picks(4), partial: true, fingerprint: "fp-r34-guest" })).json(), { queued: false, partial: true, conflict: true }, "a vendég a küldési ciklus alatt sem veheti át a kört");
    assert.ok(await waitFor(() => sent.length === 2, 3000), "az igazolt tanuló pótlása kiment");
    assert.ok(sent.every(mail => new RegExp(`félbehagyva: 2 / ${ROUND_SIZE}\\)`).test(mail.subject)), "az igazolt tanuló (2 válaszos) állapota");
    assert.ok(sent.every(mail => !mail.html.includes("Vendég tanuló")));
  } finally { setFinalizedCheckFault(null); clearPendingPartials(); setPartialDelay(previousDelay); setRetryDelay(previousRetry); }
});

/* Gépi vak ellenőrzés, 6. kör (GPT-6.2 Sol, 804569c1, 2026-11-20), terv R36 / R38. */
test("R36 / L3: a véglegesítés a „már kiment” lekérdezés alatt történik → a pillanatkép nem kap queued:true választ, várakozó nem marad", async () => {
  reset();
  const previousDelay = setPartialDelay(60_000);
  let release!: () => void;
  const parked = new Promise<void>(resolve => { release = resolve; });
  let isParked = false;
  setPartialScheduleHook(async who => { if (who === "guest:fp-r36") { isParked = true; await parked; } });
  try {
    clearPendingPartials();
    const snapshot = post({ kind: "quiz", roundId: "round-r36", picks: picks(2), partial: true, fingerprint: "fp-r36" });
    assert.ok(await waitFor(() => isParked, 3000), "a pillanatkép a „már kiment” lekérdezés után áll");
    assert.equal((await post({ kind: "quiz", roundId: "round-r36", picks: picks(5), fingerprint: "fp-r36" })).status, 202);
    release();
    assert.deepEqual(await (await snapshot).json(), { queued: false, finalized: true });
    assert.equal(pendingPartialCount(), 0, "a véglegesített körre nem keletkezett várakozó");
  } finally { release(); setPartialScheduleHook(null); clearPendingPartials(); setPartialDelay(previousDelay); }
});

test("R38 / L5: a névfeloldás átmeneti hibája után a „félbehagyva” levél egy újrapróbával kimegy; kétszeri hibánál nincs levél, és az első rögzítő felszabadul", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  const previousRetry = setRetryDelay(300);
  let left = 0;
  // Csak a saját kör „félbehagyva” levelei számítanak (az előző teszt háttérben futó végleges levelei a reset után is megérkezhetnek).
  const partialMailsOf = (roundId: string) => { const keys = RECIPIENTS.map(to => resultIdempotencyKey(LESSON, "quiz", partialRoundKey(roundId), to)); return sent.filter(mail => keys.includes(mail.key)); };
  setAttributionFault(() => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } });
  try {
    clearPendingPartials();
    left = 1;
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r38-once", picks: picks(2), partial: true }, freshIp(), "u-r38")).json(), { queued: true, partial: true });
    assert.ok(await waitFor(() => partialMailsOf("round-r38-once").length === 2, 3000), "az újrapróba kiküldte a „félbehagyva” levelet");
    assert.equal(left, 0, "a névfeloldás egyszer hibázott");
    assert.ok(partialMailsOf("round-r38-once").every(isPartial));
    // Kétszeri hiba: a ciklus levél nélkül zárul, és az első rögzítő bejegyzése felszabadul (nem ragad be).
    reset();
    left = 2;
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r38-twice", picks: picks(2), partial: true }, freshIp(), "u-r38b")).json(), { queued: true, partial: true });
    assert.ok(await waitFor(() => left === 0, 3000), "mindkét kísérlet lefutott");
    await sleep(200);
    assert.equal(partialMailsOf("round-r38-twice").length, 0);
    setPartialDelay(60_000);
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r38-twice", picks: picks(3), partial: true, fingerprint: "fp-r38-guest" })).json(), { queued: true, partial: true }, "a lezárult ciklus után az első rögzítő nem tartja a kört");
  } finally { setAttributionFault(null); clearPendingPartials(); setPartialDelay(previousDelay); setRetryDelay(previousRetry); }
});

/* Gépi vak ellenőrzés, 7. kör (GPT-6.2 Sol, 0ec08148, 2026-11-21), terv R41 / R42. */
test("R41 / L3: leállítás a kapuhiba utáni újrapróba-várakozás alatt → az ürítés előrehozza a halasztott „félbehagyva” levelet (ugyanazon a kapun); a küldés alatt álló levelet is megvárja", async () => {
  reset();
  const previousDelay = setPartialDelay(100);
  const previousRetry = setRetryDelay(10 * 60_000); // a halasztott újrapróba magától a teszt alatt nem futna le
  const partialMailsOf = (roundId: string) => { const keys = RECIPIENTS.map(to => resultIdempotencyKey(LESSON, "quiz", partialRoundKey(roundId), to)); return sent.filter(mail => keys.includes(mail.key)); };
  try {
    clearPendingPartials();
    // 1. Az időzítő lejár, a kapu átmeneti DB-hibát kap → újrapróba 10 percre; közben leállítás.
    let left = 1;
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r41-retry", picks: picks(2), partial: true, fingerprint: "fp-r41" })).json(), { queued: true, partial: true });
    // A kapu hibája a felvétel UTÁN (a felvétel is nézi a véglegesítést), az időzítő lejárta előtt.
    setFinalizedCheckFault(() => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } });
    assert.ok(await waitFor(() => left === 0, 2000), "a kapu hibát kapott");
    await sleep(100);
    assert.equal(pendingPartialCount(), 0, "a kör már nincs a várakozók között");
    assert.equal(partialMailsOf("round-r41-retry").length, 0);
    await flushPendingPartials(3_000);
    assert.equal(partialMailsOf("round-r41-retry").length, 2, "az ürítés kiküldte a halasztott újrapróbát");
    // 2. A küldés éppen fut (lassú küldő), amikor a leállítás jön → az ürítés megvárja.
    reset();
    clearPendingPartials(); // R45: a lezárult ürítés után a felvétel zárva — új „példány” utánzása
    setFinalizedCheckFault(null);
    sendDelayMs = 700;
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r41-active", picks: picks(2), partial: true, fingerprint: "fp-r41b" })).json(), { queued: true, partial: true });
    await sleep(300); // az időzítő lejárt, a küldés fut
    assert.equal(pendingPartialCount(), 0);
    await flushPendingPartials(3_000);
    assert.equal(partialMailsOf("round-r41-active").length, 2, "az ürítés a futó küldés végét megvárta");
    // 3. A halasztott újrapróba is a kapun megy: véglegesített körre az előrehozott kísérlet sem küld.
    reset();
    clearPendingPartials();
    left = 1;
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r41-final", picks: picks(2), partial: true, fingerprint: "fp-r41c" })).json(), { queued: true, partial: true });
    // A kapu hibája a felvétel UTÁN (a felvétel is nézi a véglegesítést), az időzítő lejárta előtt.
    setFinalizedCheckFault(() => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } });
    assert.ok(await waitFor(() => left === 0, 2000));
    assert.equal((await post({ kind: "quiz", roundId: "round-r41-final", picks: picks(5), fingerprint: "fp-r41c" })).status, 202);
    assert.ok(await waitFor(() => sent.length === 2), "a végleges levél kiment");
    await flushPendingPartials(3_000);
    assert.equal(partialMailsOf("round-r41-final").length, 0, "véglegesített körre az előrehozott újrapróba sem küld");
  } finally { setFinalizedCheckFault(null); clearPendingPartials(); setPartialDelay(previousDelay); setRetryDelay(previousRetry); }
});

test("R42 / L4: a tanulófüggetlen végleges jelzősor rögzült, de a kérés a 202 előtt megszakadt → az EREDETI beküldő ismétlése kiküldi a levelet; más kilét továbbra is duplikátum", async () => {
  reset();
  const body = { kind: "quiz", roundId: "round-r42-crash", picks: picks(5), fingerprint: "fp-r42" };
  let left = 1;
  setFinalClaimFault(() => { if (left > 0) { left--; throw new Error("a folyamat megszakadt"); } });
  try {
    const first = await post(body);
    assert.equal(first.status, 500, "a jelzősor után, a 202 előtt megszakadt kérés");
    assert.equal(left, 0);
    const [marker] = await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, LESSON), eq(lessonResultEmails.roundKey, roundKeyOf("final-round", "quiz", "round-r42-crash"))));
    assert.ok(marker, "a jelzősor rögzült");
    await sleep(300);
    assert.equal(sent.length, 0, "levél még nem ment");
    // Más kilét (fiók) ismétlése: duplikátum, levél nem megy (R27 változatlan).
    assert.deepEqual(await (await post(body, freshIp(), "u-r42-other")).json(), { queued: false, duplicate: true });
    await sleep(300);
    assert.equal(sent.length, 0);
    // Az eredeti beküldő (ugyanaz az ujjlenyomat) ismétlése folytatja a félbemaradt utat.
    assert.deepEqual(await (await post(body)).json(), { queued: true });
    assert.ok(await waitFor(() => sent.length === 2), "az eredeti beküldő levele kiment");
    assert.ok(sent.every(mail => mail.html.includes("Vendég tanuló")));
  } finally { setFinalClaimFault(null); }
});

/* Gépi vak ellenőrzés, 8. kör (GPT-6.2 Sol, e36518e5, 2026-11-21), terv R45. */
test("R45 / L3: leállítás közben befogadott pillanatkép az ürítéssel kimegy; az ürítés az első rögzítőt átadja; a lezárult ürítés után a felvétel 503", async () => {
  reset();
  const previousDelay = setPartialDelay(60_000);
  const partialMailsOf = (roundId: string) => { const keys = RECIPIENTS.map(to => resultIdempotencyKey(LESSON, "quiz", partialRoundKey(roundId), to)); return sent.filter(mail => keys.includes(mail.key)); };
  try {
    clearPendingPartials();
    // Igazolt tanuló várakozó köre; a küldő lassú, így az ürítés egy ideig fut.
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r45-user", picks: picks(2), partial: true }, freshIp(), "u-r45")).json(), { queued: true, partial: true });
    sendDelayMs = 700;
    const flushing = flushPendingPartials(5_000);
    await sleep(100);
    // 1. Az ürítés ugyanazon az indító úton indít, mint az időzítő: az első rögzítő (igazolt tanuló) a küldés alatt nyilvántartott (R34).
    assert.equal(sendingPartialWho(LESSON, "round-r45-user"), "u-r45", "az ürítés átadta az első rögzítőt");
    // 2. Az ürítés alatt befogadott ÚJ kör: nem marad a (le nem futó) 60 s-os időzítőn — az ürítés kiküldi.
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r45-late", picks: picks(2), partial: true, fingerprint: "fp-r45-late" })).json(), { queued: true, partial: true });
    await flushing;
    assert.equal(partialMailsOf("round-r45-user").length, 2, "a várakozó kör kiment");
    assert.equal(partialMailsOf("round-r45-late").length, 2, "az ürítés közben befogadott kör is kiment");
    assert.equal(pendingPartialCount(), 0);
    // 3. A lezárult ürítés után: nincs elfogadó 202 (a kliens nem jelöli elküldöttnek), várakozó sem keletkezik.
    const closed = await post({ kind: "quiz", roundId: "round-r45-after", picks: picks(2), partial: true, fingerprint: "fp-r45-after" });
    assert.equal(closed.status, 503);
    assert.equal(pendingPartialCount(), 0);
  } finally { sendDelayMs = 0; clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* Gépi vak ellenőrzés, 9. kör (GPT-6.2 Sol, 87631382, 2026-11-22), terv R47 / L3. */
test("R47 / L3: a párosítás feloldásának átmeneti DB-hibája nem vendégként rögzít — újrapróbálható 503, várakozó és jelzősor nélkül; utána a kérés rendben átmegy", async () => {
  reset();
  const previousDelay = setPartialDelay(60_000);
  const learner = "tanulo-r47a.1.AAAAAAAAAAAAAAAAAAAAAA";
  let left = 0;
  setLearnerResolveFault(() => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } });
  try {
    clearPendingPartials();
    // Pillanatkép: átmeneti hiba → 503, nincs (vendég) várakozó.
    left = 1;
    const partial = await post({ kind: "quiz", roundId: "round-r47-partial", picks: picks(2), partial: true, learner, fingerprint: "fp-r47" });
    assert.equal(partial.status, 503, "újrapróbálható hiba, nem elfogadó 202");
    assert.equal(pendingPartialCount(), 0, "vendégként sem rögzült várakozó");
    // Végleges: átmeneti hiba → 503, a tanulófüggetlen jelzősor sem íródik, levél nem megy.
    left = 1;
    const final = await post({ kind: "quiz", roundId: "round-r47-final", picks: picks(5), learner, fingerprint: "fp-r47" });
    assert.equal(final.status, 503);
    const markers = await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, LESSON), eq(lessonResultEmails.roundKey, roundKeyOf("final-round", "quiz", "round-r47-final"))));
    assert.equal(markers.length, 0, "a jelzősor nem íródott");
    await sleep(300);
    assert.equal(sent.length, 0);
    // A hiba elmúltával az ismétlés rendben fut (a teszt-tokenhez nincs párosított tanuló: vendég).
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r47-final", picks: picks(5), learner, fingerprint: "fp-r47" })).json(), { queued: true });
    assert.ok(await waitFor(() => sent.length === 2), "az ismételt végleges kérés levele kiment");
  } finally { setLearnerResolveFault(null); clearPendingPartials(); setPartialDelay(previousDelay); }
});

/* Gépi vak ellenőrzés, 10. kör (GPT-6.2 Sol, 025d3d34, 2026-11-22), terv R49 (c). */
test("R49 / L3 (c): a végleges jelzősor már megvan, más kilét ismétel, a tulajdonos-lekérdezés átmenetileg hibázik → 503, nincs második levél; utána duplikátum", async () => {
  reset();
  const body = { kind: "quiz", roundId: "round-r49-owner", picks: picks(5), fingerprint: "fp-r49" };
  let left = 0;
  setOwnerCheckFault(() => { if (left > 0) { left--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } });
  try {
    assert.equal((await post(body)).status, 202);
    assert.ok(await waitFor(() => sent.length === 2), "az első (vendég) végleges levél kiment");
    left = 1;
    const again = await post(body, freshIp(), "u-r49-other");
    assert.equal(again.status, 503, "a tulajdonos nem igazolható: újrapróbálható hiba, nem küldés");
    await sleep(800);
    assert.equal(sent.length, 2, "nincs második levél");
    assert.deepEqual(await (await post(body, freshIp(), "u-r49-other")).json(), { queued: false, duplicate: true }, "a hiba után: duplikátum");
    await sleep(500);
    assert.equal(sent.length, 2);
  } finally { setOwnerCheckFault(null); }
});

/* Mélyebb vak kör (13b3755e, 2026-11-22) — tulajdonosi döntés: „Szerver rögzíti a kilétet”, terv R51. */
const finalMailsOf = (roundId: string, who: string) => { const keys = RECIPIENTS.map(to => resultIdempotencyKey(LESSON, "quiz", roundKeyOf(who, "quiz", roundId), to)); return sent.filter(mail => keys.includes(mail.key)); };

test("R51 / L1: A → B adja az első választ (másik fülön belépve) → A küld friss A-CSRF-fel és A címkéjével → az eredmény NEM megy A nevére", async () => {
  reset();
  // 1. Rögzítő kérés nélkül: az ELSŐ beérkező kérés (B pillanatképe) rögzít; A végleges beküldése ugyanígy nem A nevére megy.
  const previousDelay = setPartialDelay(60_000);
  try {
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-r51-first", picks: picks(2), partial: true, subject: resultSubjectOf("u-r51-b") }, freshIp(), "u-r51-b")).json(), { queued: true, partial: true });
    assert.equal((await post({ kind: "quiz", roundId: "round-r51-first", picks: picks(5), fingerprint: "fp-r51b", subject: resultSubjectOf("u-r51-a") }, freshIp(), "u-r51-a")).status, 202);
    assert.ok(await waitFor(() => sent.length >= 2));
    assert.ok(sent.every(mail => mail.html.includes("Vendég tanuló")), "az első kérés B-t rögzítette: A nem kapja meg");
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
  reset();
  // 2. A kör első válaszánál a szerver a SAJÁT munkamenetéből rögzít (itt: B).
  assert.equal((await postClaim({ kind: "quiz", roundId: "round-r51-claim", claim: true }, freshIp(), "u-r51-b")).status, 202, "kilét-rögzítés az első válasznál");
  const late = await post({ kind: "quiz", roundId: "round-r51-claim", picks: picks(5), fingerprint: "fp-r51", subject: resultSubjectOf("u-r51-a") }, freshIp(), "u-r51-a");
  assert.equal(late.status, 202);
  assert.ok(await waitFor(() => sent.filter(mail => mail.subject.includes("Kvíz")).length >= 2), "a végleges levél kiment");
  assert.equal(finalMailsOf("round-r51-claim", "u-r51-a").length, 0, "nem A kulcsán / nevén");
  assert.ok(sent.every(mail => mail.html.includes("Vendég tanuló") && !mail.html.includes("Bejelentkezett tanuló")), "kilét nélkül (a rögzített B nem igazolható az A munkamenetből)");
  // 3. Kontroll: A rögzít és A küld → A neve.
  reset();
  assert.equal((await postClaim({ kind: "quiz", roundId: "round-r51-same", claim: true }, freshIp(), "u-r51-a")).status, 202);
  assert.equal((await post({ kind: "quiz", roundId: "round-r51-same", picks: picks(5), subject: resultSubjectOf("u-r51-a") }, freshIp(), "u-r51-a")).status, 202);
  assert.ok(await waitFor(() => sent.length >= 2));
  assert.ok(sent.every(mail => mail.html.includes("Bejelentkezett tanuló")), "egyező rögzítésnél a fiók neve");
});

test("R51 / L2: meglévő végleges jelző mellett a TTL-frissítés hibája nem kerüli meg a tulajdonos-ellenőrzést; a jelzősor-írás hibája 503", async () => {
  reset();
  const body = { kind: "quiz", roundId: "round-r51-ttl", picks: picks(5), fingerprint: "fp-r51-ttl" };
  let stage: "insert" | "ttl" | null = null;
  setFinalMarkerFault(current => { if (current === stage) { stage = null; throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }); } });
  try {
    assert.equal((await post(body)).status, 202);
    assert.ok(await waitFor(() => sent.length === 2), "az első (vendég) levél kiment");
    stage = "ttl";
    const again = await post(body, freshIp(), "u-r51-other");
    assert.deepEqual([again.status, await again.json()], [202, { queued: false, duplicate: true }], "a TTL-frissítés hibája után is duplikátum");
    await sleep(800);
    assert.equal(sent.length, 2, "nincs második levél");
    stage = "insert";
    const unprovable = await post({ ...body, roundId: "round-r51-insert" });
    assert.equal(unprovable.status, 503, "a jelzősor állapota nem bizonyítható: 503 a 202 előtt");
    await sleep(500);
    assert.equal(sent.length, 2);
  } finally { setFinalMarkerFault(null); }
});

/* R52 (2026-11-22): a szerveres kilét-rögzítés sorainak korlátos élettartama. */
test("R52: a kilét-rögzítés lejárt sorai adagosan törlődnek, az élők és a végleges jelzőhöz kötött (duplikátum-védelmi) sorok nem; lejárt kör késői első kérése nem kap kilétet", async () => {
  reset();
  // A lejárt kör késői első kérése (a rögzítés már nincs meg): a kilét nem igazolható → nem a mostani fiók nevére.
  const lateStart = Date.now() - 10 * 86_400_000;
  assert.equal((await post({ kind: "quiz", roundId: "round-r52-late", picks: picks(5), fingerprint: "fp-r52-late", startedAt: lateStart, clientNow: Date.now() }, freshIp(), "u-r52-late")).status, 202);
  assert.ok(await waitFor(() => sent.length === 2));
  assert.ok(sent.every(mail => mail.html.includes("Vendég tanuló") && !mail.html.includes("Bejelentkezett tanuló")), "a kör első tevékenysége a rögzítési élettartamon túl volt: kilét nélkül");
  reset();
  // Két kör: az egyik régi (lejárt), a másik friss; a régi körnek végleges jelzője és tulajdonos-sora is van.
  assert.equal((await postClaim({ kind: "quiz", roundId: "round-r52-old", claim: true }, freshIp(), "u-r52")).status, 202);
  assert.equal((await post({ kind: "quiz", roundId: "round-r52-old", picks: picks(5), fingerprint: "fp-r52" }, freshIp(), "u-r52")).status, 202);
  assert.ok(await waitFor(() => sent.length === 2));
  assert.equal((await postClaim({ kind: "quiz", roundId: "round-r52-new", claim: true }, freshIp(), "u-r52")).status, 202);
  assert.equal((await postClaimRows("round-r52-old")).length, 2, "a régi kör kilét-sorai (round-claim + round-owner) azonosíthatók");
  assert.equal((await postClaimRows("round-r52-new")).length, 2);
  const finalKeys = [roundKeyOf("final-round", "quiz", "round-r52-old"), roundKeyOf("final-owner", "quiz", "round-r52-old", "u-r52")];
  // A régi kör minden sorát 30 napra visszaállítjuk (a végleges jelzőét is).
  const old = new Date(Date.now() - 30 * 86_400_000);
  const oldIdentity = await postClaimRows("round-r52-old");
  await db.update(lessonResultEmails).set({ createdAt: old }).where(and(eq(lessonResultEmails.lessonId, LESSON), inArray(lessonResultEmails.roundKey, [...oldIdentity, ...finalKeys])));
  const removed = await pruneRoundIdentity(new Date(), 1);
  assert.equal(removed, oldIdentity.length, "a lejárt kilét-sorok (egyesével, adagosan) törlődtek");
  const left = (await db.select({ roundKey: lessonResultEmails.roundKey }).from(lessonResultEmails).where(eq(lessonResultEmails.lessonId, LESSON))).map(row => row.roundKey);
  assert.ok(oldIdentity.every(key => !left.includes(key)), "a régi kör kilét-sorai nincsenek meg");
  assert.ok((await postClaimRows("round-r52-new")).every(key => left.includes(key)), "a friss kör kilét-sorai megmaradtak");
  assert.ok(finalKeys.every(key => left.includes(key)), "a végleges jelző és a tulajdonos-sor (duplikátum-védelem) nem törlődött");
});
