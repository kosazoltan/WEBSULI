import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import express from "express";
import { PROXY_SECRET_ENV, PROXY_SECRET_HEADER } from "../server/lib/client-ip";

/**
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
