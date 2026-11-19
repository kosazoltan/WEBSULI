import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
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
const { lessonResultsRouter, roundKeyOf, resultIdempotencyKey, setResultSender, setPartialDelay, setRetryDelay, clearPendingPartials, pendingPartialCount, flushPendingPartials, setSendTimeout } = await import("../server/lesson-result-email");
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
    const previousTimeout = setSendTimeout(60_000);
    setResultSender(async () => { await new Promise(() => { /* soha nem tér vissza */ }); });
    try {
      await post({ kind: "quiz", roundId: "round-k4-hang", picks: picks(2), partial: true, fingerprint: "fp-k4-hang" });
      const t0 = Date.now();
      await flushPendingPartials(500);
      assert.ok(Date.now() - t0 < 2_000, "az ürítés az időkorlát után visszatér");
    } finally { setResultSender(sender); setSendTimeout(previousTimeout); }
  } finally { clearPendingPartials(); setPartialDelay(previousDelay); }
});
