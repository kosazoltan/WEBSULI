import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  adventIdempotencyKey, adventMailKey, adventResultFinal, buildAdventResultEmail, closeAdventSeason,
  deliverAdventMail, sendAdventResult, setAdventRetryDelay, setAdventSender,
} from "../server/advent/result-email";
import type { AdventRow } from "../server/advent/store";

/**
 * Adventi naptár S5 — szülői levél a végén (docs/specs/2026-11-18-adventi-naptar.md 12.1 (e) E1, 18.1; A25, A50; végrehajtás „S5”,
 * „Kiegészítés 5”). Valódi levél nem megy: a küldő mindenhol hamis (`setAdventSender`). A HTTP-út (párosított tanuló, három címzett):
 * tests/advent-routes-db.integration.ts „S5 (A25, A50)”.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const attempt = (correct: boolean) => ({ questionId: "q", pick: 0, correct, at: "" });
/** Egy kör ablakai: `solved` megoldott, `wrong` egyszer rontott (javítható), `failed` végleg elbukott (3 hibás próba). */
function roundDoors(solved: number, wrong = 0, failed = 0): Record<number, { attempts: ReturnType<typeof attempt>[] }> {
  const doors: Record<number, { attempts: ReturnType<typeof attempt>[] }> = {};
  let day = 1;
  for (let i = 0; i < solved; i++) doors[day++] = { attempts: [attempt(true)] };
  for (let i = 0; i < wrong; i++) doors[day++] = { attempts: [attempt(false)] };
  for (let i = 0; i < failed; i++) doors[day++] = { attempts: [attempt(false), attempt(false), attempt(false)] };
  return doors;
}
function row(over: Partial<AdventRow> & { doors: AdventRow["doors"] }): AdventRow {
  return { id: "row-1", season: 2026, subjectKind: "learner", subjectId: "L", grade: 5, round: 1, plan: {}, finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0), ...over };
}
const RECIPIENTS = "anya@pelda.hu, apa@pelda.hu, tanar@pelda.hu";
/**
 * A küldést kipróbáló esetek a jóváhagyás utáni utat mérik: kifejezett `ADVENT_RESULT_EMAIL_MODE=send` (P-056 — alapból száraz futás,
 * lásd tests/advent-s5-dry-run.test.ts). Dokumentált teszt-változás: az alapértelmezés változott, a mérce nem.
 */
function sendMode(t: { after: (fn: () => void) => void }): void {
  const prev = process.env.ADVENT_RESULT_EMAIL_MODE;
  process.env.ADVENT_RESULT_EMAIL_MODE = "send";
  t.after(() => { if (prev === undefined) delete process.env.ADVENT_RESULT_EMAIL_MODE; else process.env.ADVENT_RESULT_EMAIL_MODE = prev; });
}

test("S5 (18.1): a végleges eredmény oka — csak tanulói sor, csak a három feltétel valamelyikénél", () => {
  // 22 megoldott + 2 javítható → nincs levél.
  assert.equal(adventResultFinal(row({ doors: { 1: roundDoors(22, 2) } }), "open"), null);
  // Megfelelt (23 megoldott, mind a 24 megválaszolva) → levél.
  assert.equal(adventResultFinal(row({ doors: { 1: roundDoors(23, 0, 1) } }), "open"), "passed");
  assert.equal(adventResultFinal(row({ doors: { 1: roundDoors(1) }, passedAt: new Date() }), "open"), "passed", "korábbi körben megfelelt");
  // 1. kör sikertelen (20 + 4 végleg elbukott), de van 2. kör → nincs levél.
  assert.equal(adventResultFinal(row({ doors: { 1: roundDoors(20, 0, 4) } }), "catchup"), null);
  // Az utolsó (3.) kör sikertelen lezárása → levél.
  assert.equal(adventResultFinal(row({ round: 3, doors: { 1: roundDoors(20, 0, 4), 2: roundDoors(21, 0, 3), 3: roundDoors(20, 0, 4) } }), "open"), "last-round");
  // Az utolsó körben még van javítható ablak → nincs levél.
  assert.equal(adventResultFinal(row({ round: 3, doors: { 3: roundDoors(20, 1, 3) } }), "open"), null);
  // 1–2. évfolyam: 2 kör a maximum (terv 16.4) — a 2. kör sikertelen lezárása már végleges.
  assert.equal(adventResultFinal(row({ grade: 1, round: 2, doors: { 2: roundDoors(20, 0, 4) } }), "open"), "last-round");
  // Lezárt évad: a megkezdett tanulói sor → levél; válasz nélküli → nincs.
  assert.equal(adventResultFinal(row({ doors: { 1: roundDoors(3, 1) } }), "closed"), "season-closed");
  assert.equal(adventResultFinal(row({ doors: {} }), "closed"), null);
  // Névtelen, játékos- és előnézeti sor SOHA.
  for (const kind of ["device", "player", "preview"] as const) {
    assert.equal(adventResultFinal(row({ subjectKind: kind, doors: { 1: roundDoors(24) } }), "closed"), null, kind);
  }
});

test("S5: a levél tárgya és törzse — keresztnév HTML-escape-elve, a legjobb kör, megoldott / elsőre jó / 24, megfelelt; token, eszköz, link nincs benne", () => {
  const r = row({ round: 2, doors: { 1: roundDoors(20, 0, 4), 2: roundDoors(23, 0, 1) }, passedAt: new Date() });
  const mail = buildAdventResultEmail({ firstName: "Zsófi<script>", grade: 5, season: 2026, reason: "passed", row: r });
  assert.equal(mail.subject, "Adventi naptár: Zsófi<script> végigért — 23 / 24");
  assert.ok(mail.html.includes("Zsófi&lt;script&gt;"), "a név escape-elve");
  assert.ok(!mail.html.includes("<script>"), "nyers HTML nincs a törzsben");
  assert.match(mail.html, /2\. kör \(összesen 2 kör\)/);
  assert.match(mail.html, /23 \/ 24 \(95%\)/, "a százalék lefelé kerekítve, mint a felületen (adventPercent)");
  assert.match(mail.html, /Megfelelt<\/td><td[^>]*><strong>igen/);
  assert.doesNotMatch(mail.html, /https?:|\?t=|token|eszköz/i, "link / token / eszközazonosító nincs benne");
  const closed = buildAdventResultEmail({ firstName: null, grade: null, season: 2026, reason: "season-closed", row: row({ doors: { 1: roundDoors(7, 1) } }) });
  assert.equal(closed.subject, "Adventi naptár: A tanuló — az évad lezárult, 7 / 24");
});

/**
 * Memóriabeli tároló a tartós kézbesítés API-jával (S5/S6 1. vak L1 — dokumentált teszt-változás: a korábbi claimMail / releaseMail
 * helyett): terv (`want`), bérlet (`pending`), kézbesítve (`final` — a `claimed` halmaz), felszabadítás.
 */
function memoryStore() {
  const claimed = new Set<string>();
  const wants = new Map<string, string[]>();
  const leases = new Map<string, number>();
  const sentMarkers = new Map<string, number>(); // key → timestamp (service accepted, finishMail failed)
  return {
    claimed,
    sentMarkers,
    planMail: async (id: string, keys: string[]) => { if (!wants.has(id)) wants.set(id, keys); return wants.get(id)!; },
    leaseMail: async (id: string, hash: string, nowMs: number, leaseMs: number) => {
      const k = `${id}|${hash}`;
      if (!wants.get(id)?.includes(`want:${hash}`) || claimed.has(k)) return false;
      // A `sent:` jelölő megakadályozza az újbóli bérletszerzést (Thread 7 javítás).
      if (sentMarkers.has(k)) return false;
      const until = leases.get(k);
      if (until !== undefined && until > nowMs - leaseMs) return false;
      leases.set(k, nowMs);
      return true;
    },
    finishMail: async (id: string, hash: string) => { const k = `${id}|${hash}`; leases.delete(k); sentMarkers.delete(k); claimed.add(k); },
    releaseLease: async (id: string, hash: string) => { leases.delete(`${id}|${hash}`); },
    markSent: async (id: string, hash: string, _nowMs: number) => { sentMarkers.set(`${id}|${hash}`, _nowMs); },
    recoverSent: async () => {
      let recovered = 0;
      for (const [k] of sentMarkers) {
        sentMarkers.delete(k);
        claimed.add(k);
        recovered++;
      }
      return recovered;
    },
  };
}

test("S5: címzettenként pontosan egy levél; ismételt hívás nem küld újra; bukó küldő felszabadít és pótolható; nem végleges / nincs címzett → 0", async (t) => {
  sendMode(t);
  const prevEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = RECIPIENTS;
  const prevDelay = setAdventRetryDelay(5);
  t.after(() => { setAdventSender(null); setAdventRetryDelay(prevDelay); if (prevEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevEmails; });
  const sent: { to: string; subject: string; key: string }[] = [];
  setAdventSender(async (subject, _html, to, key) => { sent.push({ to, subject, key }); });
  const store = memoryStore();
  const passed = row({ doors: { 1: roundDoors(23, 0, 1) } });
  assert.deepEqual(await sendAdventResult({ store, row: passed, phase: "open", firstName: "Panni" }), { sent: 3, failed: 0 });
  assert.deepEqual(sent.map((s) => s.to).sort(), ["anya@pelda.hu", "apa@pelda.hu", "tanar@pelda.hu"]);
  assert.equal(new Set(sent.map((s) => s.key)).size, 3, "címzettenként külön idempotencia-kulcs");
  assert.ok(sent.every((s) => /^advent-result\/[0-9a-f]{64}$/.test(s.key) && !s.key.includes("@")), "a kulcsban nincs cím");
  // Ismételt hívás (újabb válasz, évadzárás): nincs második levél.
  assert.deepEqual(await sendAdventResult({ store, row: passed, phase: "closed", firstName: "Panni" }), { sent: 0, failed: 0 });
  // A sorban már rögzített foglalás (final:<HMAC>) esetén nincs foglalási kísérlet sem.
  const key = adventMailKey("titok", "anya@pelda.hu");
  assert.match(key, /^final:[0-9a-f]{32}$/);
  assert.ok(!key.includes("anya"));
  // Nem végleges (22 + 2 javítható) → nincs levél.
  assert.deepEqual(await sendAdventResult({ store: memoryStore(), row: row({ id: "row-2", doors: { 1: roundDoors(22, 2) } }), phase: "open", firstName: null }), { sent: 0, failed: 0 });
  // Bukó küldő az egyik címzettnél: a foglalása felszabadul, a késleltetett újrapróba pótolja (a többiek nem kapnak másodikat).
  sent.length = 0;
  let failOnce = true;
  setAdventSender(async (subject, _html, to, key2) => {
    if (to === "apa@pelda.hu" && failOnce) { failOnce = false; throw new Error("átmeneti szolgáltatói hiba"); }
    sent.push({ to, subject, key: key2 });
  });
  const store3 = memoryStore();
  assert.deepEqual(await sendAdventResult({ store: store3, row: row({ id: "row-3", doors: { 1: roundDoors(23, 0, 1) } }), phase: "open", firstName: "Bence" }), { sent: 2, failed: 1 });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(sent.map((s) => s.to).sort(), ["anya@pelda.hu", "apa@pelda.hu", "tanar@pelda.hu"], "a bukott címzett pótlódott, más nem kapott kettőt");
  assert.equal(store3.claimed.size, 3);
  // Nincs címzett → 0 (és nincs hiba).
  process.env.ADMIN_EMAILS = "";
  assert.deepEqual(await sendAdventResult({ store: memoryStore(), row: passed, phase: "open", firstName: null }), { sent: 0, failed: 0, skipped: "no-recipients" });
});

test("S5: teszt-módban valódi levél soha — hamis küldő nélkül a küldés hibára fut, a foglalás felszabadul", async (t) => {
  sendMode(t);
  const prevEmails = process.env.ADMIN_EMAILS;
  const prevEnv = process.env.NODE_ENV;
  process.env.ADMIN_EMAILS = "anya@pelda.hu";
  process.env.NODE_ENV = "test";
  t.after(() => { process.env.NODE_ENV = prevEnv; if (prevEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevEmails; });
  setAdventSender(null);
  const store = memoryStore();
  assert.deepEqual(await sendAdventResult({ store, row: row({ doors: { 1: roundDoors(24) } }), phase: "open", firstName: null }, false), { sent: 0, failed: 1 });
  assert.equal(store.claimed.size, 0, "a sikertelen küldés foglalása felszabadult");
});

test("S5 (18.1 3.): évadzárás — csak lezárt fázisban, a levél nélküli tanulói sorokra, egyszer", async (t) => {
  sendMode(t);
  const prevEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = RECIPIENTS;
  t.after(() => { setAdventSender(null); if (prevEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevEmails; });
  const sent: string[] = [];
  setAdventSender(async (_s, _h, to) => { sent.push(to); });
  const mem = memoryStore();
  const store = { ...mem, mailCandidates: async () => [{ row: row({ id: "a", doors: { 1: roundDoors(5, 1) } }), firstName: "Ada" }, { row: row({ id: "b", doors: {} }), firstName: "Bea" }] };
  assert.equal(await closeAdventSeason(store, { season: 2026, phase: "catchup" }), 0, "pótlási időszakban nem");
  assert.equal(sent.length, 0);
  assert.equal(await closeAdventSeason(store, { season: 2026, phase: "closed" }), 3, "a megkezdett sorra címzettenként egy; a válasz nélkülire nem");
  assert.equal(await closeAdventSeason(store, { season: 2026, phase: "closed" }), 0, "másodszor nincs");
});

test("S5: bekötés — a levél csak a nyilvános (kapcsolós) router útján és a takarító bekapcsolt-naptáras lépésében indulhat; az előnézetről soha", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /onResult: \(\{ row, subject, phase \}\) => \{ void sendAdventResult\(\{ store: adventStore, row, phase, firstName: subject\.firstName \}\); \},/);
  assert.equal((routes.match(/onResult:/g) ?? []).length, 1, "egyetlen bekötés (a nyilvános routeré)");
  assert.doesNotMatch(read("server/advent/preview.ts"), /onResult|sendAdventResult/);
  // S5/S6 1. vak L1 (dokumentált): az évadzáró lépés helyett a tartós pótlás (benne a lezárt évad) fut, ugyanígy a kapcsoló mögött.
  assert.match(read("server/index.ts"), /resumeMail: async \(now\) => \(adventEnabled\(\) \? deliverAdventMail\(adventStore, adventNow\(now\)\) : 0\),/);
  const advent = read("server/advent/routes.ts");
  assert.match(advent, /if \(result\.recorded && deps\.onResult\) \{/, "csak rögzített válasz után");
  assert.match(advent, /\/\/ Az átvett \(kész\) vendégeredmény is lehet végleges \(18\.1\)/);
});

// === Thread 2/6 javítás: stabil idempotencia-kulcs (nem tartalomfüggő) ===

test("S5 (Thread 2/6): az idempotencia-kulcs tartalomfüggetlen — a tárgy változása NEM ad új kulcsot", () => {
  const key1 = adventIdempotencyKey("row-1", "anya@pelda.hu");
  const key2 = adventIdempotencyKey("row-1", "anya@pelda.hu");
  assert.equal(key1, key2, "azonos sor + cím → azonos kulcs");
  // A kulcs determinisztikus, nem tartalmaz címet, és az 'advent-result/' előtaggal indul.
  assert.match(key1, /^advent-result\/[0-9a-f]{64}$/);
  assert.ok(!key1.includes("@"), "a kulcsban nincs e-mail-cím");
  // Más sor → más kulcs.
  assert.notEqual(adventIdempotencyKey("row-2", "anya@pelda.hu"), key1);
  // Más címzett → más kulcs.
  assert.notEqual(adventIdempotencyKey("row-1", "apa@pelda.hu"), key1);
});

// === Thread 7 javítás: finishMail hiba → sent: jelölő megvédi az újraküldéstől ===

test("S5 (Thread 7): szolgáltató elfogadta, finishMail elbukott → sent: jelölő, nincs újraküldés; a pótlás recoverSent-tel javít", async (t) => {
  sendMode(t);
  const prevEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "anya@pelda.hu";
  const prevDelay = setAdventRetryDelay(5);
  t.after(() => { setAdventSender(null); setAdventRetryDelay(prevDelay); if (prevEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevEmails; });
  const sent: string[] = [];
  setAdventSender(async (_s, _h, to) => { sent.push(to); });
  const store = memoryStore();
  // A finishMail hibát dob: a szolgáltató elfogadta, de a DB rögzítés elmaradt.
  let finishFails = true;
  const originalFinish = store.finishMail;
  store.finishMail = async (id: string, hash: string) => {
    if (finishFails) throw new Error("DB-hiba: finishMail");
    return originalFinish(id, hash);
  };
  const passed = row({ doors: { 1: roundDoors(23, 0, 1) } });
  // Az első hívás: a levél elmegy, a finishMail hibázik, de a sent: jelölő megőrzi.
  const r1 = await sendAdventResult({ store, row: passed, phase: "open", firstName: "Panni" }, false);
  assert.equal(r1.sent, 0, "a finishMail hibája miatt sent=0 (de a levél elment)");
  assert.equal(sent.length, 1, "pontosan egy levél ment el a szolgáltatónak");
  assert.equal(store.sentMarkers.size, 1, "a sent: jelölő rögzült");
  assert.equal(store.claimed.size, 0, "a final: jelölő NEM rögzült");

  // Második hívás: a sent: jelölő megakadályozza az újraküldést.
  sent.length = 0;
  const r2 = await sendAdventResult({ store, row: passed, phase: "open", firstName: "Panni" }, false);
  assert.equal(r2.sent, 0);
  assert.equal(sent.length, 0, "NEM ment újabb levél a sent: jelölő miatt");

  // A pótlás (deliverAdventMail) meghívja a recoverSent-et: sent: → final:.
  finishFails = false;
  const deliverStore = {
    ...store,
    mailCandidates: async () => [{ row: passed, firstName: "Panni" }],
  };
  await deliverAdventMail(deliverStore, { season: 2026, phase: "open" });
  assert.equal(store.sentMarkers.size, 0, "a sent: jelölő eltűnt (recoverSent)");
  assert.equal(store.claimed.size, 1, "a final: jelölő rögzült (recoverSent)");
  assert.equal(sent.length, 0, "NEM ment újabb levél a recoverSent során");
});

test("S5 (Thread 7): szöveg változott (23→24), de a sent: jelölő megakadályozza az újraküldést", async (t) => {
  sendMode(t);
  const prevEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "anya@pelda.hu";
  const prevDelay = setAdventRetryDelay(5);
  t.after(() => { setAdventSender(null); setAdventRetryDelay(prevDelay); if (prevEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevEmails; });
  const sent: { to: string; subject: string }[] = [];
  setAdventSender(async (subject, _h, to) => { sent.push({ to, subject }); });
  const store = memoryStore();
  // A finishMail hibát dob.
  let finishFails = true;
  const originalFinish = store.finishMail;
  store.finishMail = async (id: string, hash: string) => {
    if (finishFails) throw new Error("DB-hiba");
    return originalFinish(id, hash);
  };
  // 1. küldés: 23/24-es eredmény (a finishMail hibázik).
  const passed23 = row({ doors: { 1: roundDoors(23, 0, 1) } });
  await sendAdventResult({ store, row: passed23, phase: "open", firstName: "Zsófi" }, false);
  assert.equal(sent.length, 1, "1. levél elment");
  assert.match(sent[0]!.subject, /23 \/ 24/);

  // 2. a tanuló javít 24/24-re → más tárgy, de a sent: jelölő megvédi.
  sent.length = 0;
  const passed24 = row({ doors: { 1: roundDoors(24) } });
  await sendAdventResult({ store, row: passed24, phase: "open", firstName: "Zsófi" }, false);
  assert.equal(sent.length, 0, "NEM ment második levél, mert a sent: jelölő él");
});

test("S5 (Thread 7): több worker — a sent: jelölő megvédi a párhuzamos küldéstől is", async (t) => {
  sendMode(t);
  const prevEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "anya@pelda.hu";
  const prevDelay = setAdventRetryDelay(5);
  t.after(() => { setAdventSender(null); setAdventRetryDelay(prevDelay); if (prevEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevEmails; });
  const sent: string[] = [];
  setAdventSender(async (_s, _h, to) => { sent.push(to); });
  const store = memoryStore();
  // A finishMail hibát dob: a sent: jelölő rögzül.
  let finishFails = true;
  const originalFinish = store.finishMail;
  store.finishMail = async (id: string, hash: string) => {
    if (finishFails) throw new Error("DB-hiba");
    return originalFinish(id, hash);
  };
  const passed = row({ doors: { 1: roundDoors(24) } });
  // 1. worker: elküldi, finishMail hibázik, sent: jelölő rögzül.
  await sendAdventResult({ store, row: passed, phase: "open", firstName: "Bence" }, false);
  assert.equal(sent.length, 1);
  // 2. worker (párhuzamos): a sent: jelölő miatt nem kap bérletet → nem küld.
  sent.length = 0;
  await sendAdventResult({ store, row: passed, phase: "open", firstName: "Bence" }, false);
  assert.equal(sent.length, 0, "a 2. worker nem küld, a sent: jelölő blokkolja");
});
