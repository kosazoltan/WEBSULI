import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { adventMailKey, adventMailMode, adventMailReport, deliverAdventMail, sendAdventResult, setAdventSender } from "../server/advent/result-email";
import { createAdventMailReportRouter } from "../server/advent/mail-report";
import type { AdventRow } from "../server/advent/store";

/**
 * Adventi naptár S5 — tulajdonosi P-056 (2026-11-23): „Levélküldés csak száraz összesítő után, külön jóváhagyással.”
 * A kód alapból NEM küld valódi levelet (száraz futás): a végleges eredmények nem foglalnak (`mailed_to` érintetlen), a küldő nem
 * hívódik. Valódi küldés csak a kifejezett `ADVENT_RESULT_EMAIL_MODE=send` beállítással. A száraz összesítő (admin-végpont) a
 * kiküldendő leveleket címek nélkül mutatja. A címek kitaláltak (`pelda.hu` — tests/no-real-emails-guard.test.ts).
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const attempt = (correct: boolean) => ({ questionId: "q", pick: 0, correct, at: "" });
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
const RECIPIENTS = "anya@pelda.hu, apa@pelda.hu";

/** Minden tárolóhívást számoló memóriabeli tároló: száraz futásban egyetlen író hívás sem történhet. */
function countingStore(candidates: { row: AdventRow; firstName: string | null }[] = []) {
  const calls: string[] = [];
  return {
    calls,
    planMail: async (_id: string, keys: string[]) => { calls.push("planMail"); return keys; },
    leaseMail: async () => { calls.push("leaseMail"); return true; },
    finishMail: async () => { calls.push("finishMail"); },
    releaseLease: async () => { calls.push("releaseLease"); },
    mailCandidates: async () => { calls.push("mailCandidates"); return candidates; },
  };
}

function withEnv(t: { after: (fn: () => void) => void }, values: Record<string, string | undefined>): void {
  const prev = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  t.after(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test("P-056: a levélmód alapból száraz futás — csak a pontos „send” küld (elírás, régi kapcsolóérték, üres: száraz)", () => {
  for (const off of [undefined, "", "dry-run", "on", "1", "true", "yes", "igen", "sending", "send-now", "küld"]) {
    assert.equal(adventMailMode({ ADVENT_RESULT_EMAIL_MODE: off }), "dry-run", String(off));
  }
  for (const on of ["send", " send ", "SEND", "Send"]) assert.equal(adventMailMode({ ADVENT_RESULT_EMAIL_MODE: on }), "send", on);
});

test("P-056: száraz futásban a végleges eredmény sem küld és nem foglal — a küldő nem hívódik, a mailed_to érintetlen", async (t) => {
  withEnv(t, { ADMIN_EMAILS: RECIPIENTS, ADVENT_RESULT_EMAIL_MODE: undefined });
  const sent: string[] = [];
  setAdventSender(async (_s, _h, to) => { sent.push(to); });
  t.after(() => setAdventSender(null));
  const store = countingStore();
  const passed = row({ doors: { 1: roundDoors(23, 0, 1) } });
  assert.deepEqual(await sendAdventResult({ store, row: passed, phase: "open", firstName: "Panni" }), { sent: 0, failed: 0, skipped: "dry-run" });
  assert.deepEqual(sent, [], "száraz futásban nincs küldés");
  assert.deepEqual(store.calls, [], "száraz futásban nincs foglalás (a későbbi jóváhagyás után is kimehet a levél)");
  // A pótlás (takarító) is száraz.
  const store2 = countingStore([{ row: passed, firstName: "Panni" }]);
  assert.equal(await deliverAdventMail(store2, { season: 2026, phase: "open" }), 0);
  assert.deepEqual(store2.calls, ["mailCandidates"], "a pótlás csak olvas");
  assert.deepEqual(sent, []);
});

test("P-056: kifejezett „send” módban ugyanaz a végleges eredmény címzettenként egy levelet küld (a jóváhagyás utáni út)", async (t) => {
  withEnv(t, { ADMIN_EMAILS: RECIPIENTS, ADVENT_RESULT_EMAIL_MODE: "send" });
  const sent: string[] = [];
  setAdventSender(async (_s, _h, to) => { sent.push(to); });
  t.after(() => setAdventSender(null));
  const store = countingStore();
  assert.deepEqual(await sendAdventResult({ store, row: row({ doors: { 1: roundDoors(23, 0, 1) } }), phase: "open", firstName: "Panni" }), { sent: 2, failed: 0 });
  assert.deepEqual(sent.sort(), ["anya@pelda.hu", "apa@pelda.hu"]);
});

test("P-056: a száraz összesítő — a kiküldendő levelek tanulónként, a címek nélkül; a nem végleges sor kimarad", async (t) => {
  withEnv(t, { ADMIN_EMAILS: RECIPIENTS, ADVENT_RESULT_EMAIL_MODE: undefined });
  const store = countingStore([
    { row: row({ id: "a", doors: { 1: roundDoors(23, 0, 1) } }), firstName: "Ada" },
    { row: row({ id: "b", doors: { 1: roundDoors(22, 2) } }), firstName: "Bea" },
    { row: row({ id: "c", round: 3, doors: { 1: roundDoors(20, 0, 4), 2: roundDoors(21, 0, 3), 3: roundDoors(20, 0, 4) } }), firstName: "Cili" },
    // Thread 9: részben kézbesített (korábbi „send” mód): csak a JELENLEGI címzettek kézbesítetlen terve számít.
    // A hash-ek a valódi `adventMailKey`-ből, mint a produkciós kódban.
    { row: row({ id: "d", doors: { 1: roundDoors(24) }, mailedTo: [`want:${adventMailKey("websuli-dev-learner-link", "anya@pelda.hu").slice("final:".length)}`, `want:${adventMailKey("websuli-dev-learner-link", "apa@pelda.hu").slice("final:".length)}`, `final:${adventMailKey("websuli-dev-learner-link", "anya@pelda.hu").slice("final:".length)}`] }), firstName: "Dóri" },
  ]);
  const report = await adventMailReport(store, { season: 2026, phase: "open" });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.season, 2026);
  assert.equal(report.recipients, 2);
  assert.deepEqual(report.results.map((r) => [r.firstName, r.reason, r.solved, r.pendingRecipients]), [
    ["Ada", "passed", 23, 2], ["Cili", "last-round", 21, 2], ["Dóri", "passed", 24, 1],
  ]);
  assert.deepEqual(report.totals, { results: 3, mails: 5, passed: 2, lastRound: 1, seasonClosed: 0 });
  assert.doesNotMatch(JSON.stringify(report), /@|pelda/, "cím nincs az összesítőben");
  assert.deepEqual(store.calls, ["mailCandidates"], "az összesítő csak olvas");
  // Lezárt évadban a megkezdett, levél nélküli sor is (18.1 3.) — az évadzáró okkal.
  const closed = await adventMailReport(countingStore([{ row: row({ id: "e", doors: { 1: roundDoors(5, 1) } }), firstName: "Edit" }]), { season: 2026, phase: "closed" });
  assert.deepEqual(closed.results.map((r) => r.reason), ["season-closed"]);
});

test("P-056: a száraz összesítő HTTP-végpontja — JSON, no-store, a kapcsolótól függetlenül; cím nélkül", async (t) => {
  withEnv(t, { ADMIN_EMAILS: RECIPIENTS, ADVENT_RESULT_EMAIL_MODE: undefined });
  const app = express();
  app.use("/r", createAdventMailReportRouter({ store: countingStore([{ row: row({ doors: { 1: roundDoors(23, 0, 1) } }), firstName: "Ada" }]), now: () => new Date("2026-12-10T10:00:00Z") }));
  const server = await new Promise<import("node:http").Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/r`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.text();
  const json = JSON.parse(body) as { mode: string; season: number; totals: { mails: number } };
  assert.deepEqual({ mode: json.mode, season: json.season, mails: json.totals.mails }, { mode: "dry-run", season: 2026, mails: 2 });
  assert.doesNotMatch(body, /@/);
});

test("P-056: bekötés — a száraz összesítő az admin-őr mögött, és a render.yaml nem kapcsolja be a küldést", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /app\.use\("\/api\/admin\/advent\/mail-report", isAuthenticatedAdmin, createAdventMailReportRouter\(/);
  assert.doesNotMatch(read("../render.yaml"), /ADVENT_RESULT_EMAIL_MODE/, "a valódi küldés bekapcsolása külön tulajdonosi lépés (P-056)");
});
