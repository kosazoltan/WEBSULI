import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import express from "express";
import { PROXY_SECRET_ENV, PROXY_SECRET_HEADER } from "../server/lib/client-ip";

/**
 * Eredmény-e-mail B2 (docs/specs/2026-11-22-eredmeny-email-bontas.md; a #510 R9 / R46 követelménye, a #510 ágából átvéve).
 * Spec 2026-11-17-eredmeny-email-kviz, R9 (tulajdonosi döntés, 2026-11-18: „Egy osztályra méretezve”): a pillanatkép- és a végleges
 * beküldés kerete is 60 / 15 perc / IP, egymástól függetlenül; a kulcs a valódi kliens-IP. A korlátozók valódi HTTP-n, üres kezelővel
 * (adatbázis és levél nélkül); a cím a megosztott titokfejléces `X-Forwarded-For` (a titok futásonként véletlen).
 */
const SECRET = randomBytes(24).toString("hex");
process.env[PROXY_SECRET_ENV] = SECRET;
const { RESULT_RATE_LIMIT, partialLimiter, resultLimiter, resetPartialLimiter } = await import("../server/lesson-result-limits");

let base = "";
let close = () => {};
before(async () => {
  const app = express();
  app.use(express.json());
  app.post("/api/lessons/:lessonId/results", resultLimiter, partialLimiter, (_req, res) => { res.status(202).json({ queued: false }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

const post = (ip: string, partial: boolean) => fetch(`${base}/api/lessons/lecke/results`, { method: "POST",
  headers: { "content-type": "application/json", [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": ip },
  body: JSON.stringify({ kind: "quiz", roundId: "round-limit", picks: {}, ...(partial ? { partial: true } : {}) }) }).then(res => res.status);
async function statuses(ip: string, partial: boolean, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(await post(ip, partial));
  return out;
}

test("R9: a konstans a tulajdonosi döntés — 60 / 15 perc / IP mindkét fajtára", () => {
  assert.deepEqual(RESULT_RATE_LIMIT, { windowMs: 15 * 60 * 1000, final: 60, partial: 60 });
});

test("R9: pillanatkép — ugyanarról a címről a 60. átmegy, a 61. 429; másik cím kerete független; a végleges kerete érintetlen", async () => {
  resetPartialLimiter();
  const a = await statuses("10.88.1.1", true, 61);
  assert.deepEqual(a.slice(0, 60), Array(60).fill(202), "az első 60 pillanatkép átmegy");
  assert.equal(a[60], 429, "a 61. pillanatkép 429");
  assert.equal(await post("10.88.1.2", true), 202, "másik cím (másik osztály) pillanatképe átmegy");
  assert.equal(await post("10.88.1.1", false), 202, "ugyanerről a címről a VÉGLEGES beküldés átmegy (külön keret)");
});

test("R9: végleges beküldés — ugyanarról a címről a 60. átmegy, a 61. 429; másik cím független; a pillanatkép-keret érintetlen", async () => {
  resetPartialLimiter();
  const a = await statuses("10.88.2.1", false, 61);
  assert.deepEqual(a.slice(0, 60), Array(60).fill(202), "az első 60 végleges beküldés átmegy");
  assert.equal(a[60], 429, "a 61. végleges beküldés 429");
  assert.equal(await post("10.88.2.2", false), 202, "másik cím végleges beküldése átmegy");
  assert.equal(await post("10.88.2.1", true), 202, "ugyanerről a címről a pillanatkép átmegy (külön keret)");
});

test("R9: a kulcs a valódi kliens-IP — a titokfejléc nélküli `X-Forwarded-For` nem ad új keretet", async () => {
  resetPartialLimiter();
  // Titok nélkül a hamis fejléc nem számít: minden kérés a socket címére (127.0.0.1) esik, változó fejléccel is.
  const spoofed = async (i: number) => (await fetch(`${base}/api/lessons/lecke/results`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.99.${Math.floor(i / 250)}.${(i % 250) + 1}` },
    body: JSON.stringify({ kind: "quiz", roundId: "round-limit", picks: {}, partial: true }) })).status;
  const out: number[] = [];
  for (let i = 0; i < 61; i++) out.push(await spoofed(i));
  assert.deepEqual(out.slice(0, 60), Array(60).fill(202));
  assert.equal(out[60], 429, "a fejléc cserélgetése nem kerüli meg a keretet");
});

/* Gépi vak ellenőrzés, 8. kör (e36518e5, 2026-11-21), terv R46 / L5: a `/api/lessons` közös írási kerete (100 / 15 perc / IP) nem írhatja
   felül a két független eredménykeretet. Az alkalmazás belépési rétege (`lessonsWriteGate`, amelyet a `server/index.ts` szerel fel) és a
   router saját két korlátozója együtt, valódi HTTP-n. */
test("R46 / L5: a közös írási kapu mögött ugyanarról a címről 60 pillanatkép ÉS 60 végleges beküldés is átmegy; a többi lecke-írást a közös keret továbbra is fogja", async () => {
  const { lessonsWriteGate } = await import("../server/lesson-result-limits");
  const rateLimit = (await import("express-rate-limit")).default;
  const { clientIpKeyGenerator } = await import("../server/lib/client-ip");
  const shared = rateLimit({ keyGenerator: clientIpKeyGenerator, windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
  const app = express();
  app.use(express.json());
  app.use("/api/lessons", lessonsWriteGate(shared));
  app.post("/api/lessons/:lessonId/results", resultLimiter, partialLimiter, (_req, res) => { res.status(202).json({ queued: false }); });
  app.post("/api/lessons/:lessonId/other", (_req, res) => { res.status(200).json({}); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const gated = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    resetPartialLimiter();
    const ip = "10.88.9.1";
    const send = (path: string, body: object) => fetch(`${gated}${path}`, { method: "POST",
      headers: { "content-type": "application/json", [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": ip }, body: JSON.stringify(body) }).then(res => res.status);
    const out: number[] = [];
    for (let i = 0; i < 60; i++) out.push(await send("/api/lessons/lecke/results", { kind: "quiz", roundId: "r", picks: {}, partial: true }));
    for (let i = 0; i < 60; i++) out.push(await send("/api/lessons/lecke/results", { kind: "quiz", roundId: "r", picks: {} }));
    assert.deepEqual(out, Array(120).fill(202), "60 pillanatkép + 60 végleges ugyanarról a címről (a saját keretek szerint) átmegy");
    assert.equal(await send("/api/lessons/lecke/results", { kind: "quiz", roundId: "r", picks: {} }), 429, "a végleges saját kerete (60) érvényes");
    const others: number[] = [];
    for (let i = 0; i < 101; i++) others.push(await send("/api/lessons/lecke/other", {}));
    assert.deepEqual(others.slice(0, 100), Array(100).fill(200));
    assert.equal(others[100], 429, "más lecke-írásra a közös keret változatlanul érvényes");
  } finally { server.close(); }
});

test("R46: a szerver a közös kaput használja (nem saját, a kivételt nem ismerő köztes réteget)", async () => {
  const { readFileSync } = await import("node:fs");
  const index = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(index, /app\.use\("\/api\/lessons", lessonsWriteGate\(publicWriteLimiter\)\);/);
});

test("U4d (review #591): a /results/status saját kerete — 600 lekérdezés sem fogyasztja a végleges beküldés és a közös írás keretét", async () => {
  const { lessonsWriteGate, statusLimiter, resetStatusLimiter, RESULT_STATUS_RATE_LIMIT } = await import("../server/lesson-result-limits");
  const rateLimit = (await import("express-rate-limit")).default;
  const { clientIpKeyGenerator } = await import("../server/lib/client-ip");
  const shared = rateLimit({ keyGenerator: clientIpKeyGenerator, windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
  const app = express();
  app.use(express.json());
  app.use("/api/lessons", lessonsWriteGate(shared));
  app.post("/api/lessons/:lessonId/results/status", statusLimiter, (_req, res) => { res.status(200).json({ awaiting: null }); });
  app.post("/api/lessons/:lessonId/results", resultLimiter, partialLimiter, (_req, res) => { res.status(202).json({ queued: false }); });
  app.post("/api/lessons/:lessonId/other", (_req, res) => { res.status(200).json({}); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const gated = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    resetStatusLimiter();
    const ip = "10.88.9.77";
    const send = (path: string, body: object) => fetch(`${gated}${path}`, { method: "POST",
      headers: { "content-type": "application/json", [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": ip }, body: JSON.stringify(body) }).then(res => res.status);
    const st: number[] = [];
    for (let i = 0; i < RESULT_STATUS_RATE_LIMIT; i++) st.push(await send("/api/lessons/lecke/results/status", {}));
    assert.deepEqual(st, Array(RESULT_STATUS_RATE_LIMIT).fill(200));
    assert.equal(await send("/api/lessons/lecke/results/status", {}), 429, "a saját keret végén 429");
    assert.equal(await send("/api/lessons/lecke/results", { kind: "quiz", roundId: "r", picks: {} }), 202, "a végleges beküldés kerete érintetlen");
    assert.equal(await send("/api/lessons/lecke/other", {}), 200, "a közös írási keret érintetlen");
  } finally { server.close(); }
});
