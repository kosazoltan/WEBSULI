import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import rateLimit from "express-rate-limit";

import {
  clientIpKey,
  clientIpKeyGenerator,
  hasValidProxySecret,
  MIN_PROXY_SECRET_LENGTH,
  normalizeIp,
  PROXY_SECRET_ENV,
  PROXY_SECRET_HEADER,
  resolveClientIp,
} from "../server/lib/client-ip";

// Spec 2026-11-10-korlat-kliens-ip. A teszt-titok futásonként véletlen: titokszerű érték nem kerül a repóba.
const SECRET = randomBytes(32).toString("hex");
const OTHER_SECRET = randomBytes(32).toString("hex");
const ENV = { [PROXY_SECRET_ENV]: SECRET };
const SOCKET_IP = "10.20.30.40";

test("normalizeIp: érvényes cím, IPv4-be ágyazott IPv6, érvénytelen érték", () => {
  assert.equal(normalizeIp(" 203.0.113.7 "), "203.0.113.7");
  assert.equal(normalizeIp("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeIp("2001:db8::1"), "2001:db8::1");
  assert.equal(normalizeIp("203.0.113.7:443"), null);
  assert.equal(normalizeIp("unknown"), null);
  assert.equal(normalizeIp(""), null);
  assert.equal(normalizeIp(undefined), null);
});

test("A3: beállított (elég hosszú) titok nélkül semmilyen fejlécérték nem érvényes", () => {
  assert.equal(hasValidProxySecret(SECRET, {}), false);
  assert.equal(hasValidProxySecret("", { [PROXY_SECRET_ENV]: "" }), false);
  assert.equal(hasValidProxySecret(undefined, ENV), false);
  const short = "x".repeat(MIN_PROXY_SECRET_LENGTH - 1);
  assert.equal(hasValidProxySecret(short, { [PROXY_SECRET_ENV]: short }), false);
  // Vesszővel tagolt üres elemek: az üres fejléc sem egyezhet.
  assert.equal(hasValidProxySecret("", { [PROXY_SECRET_ENV]: "," }), false);
});

test("titok: pontos egyezés, rossz érték, tömbfejléc, titokcsere alatt régi + új", () => {
  assert.equal(hasValidProxySecret(SECRET, ENV), true);
  assert.equal(hasValidProxySecret([SECRET, "x"], ENV), true);
  assert.equal(hasValidProxySecret(OTHER_SECRET, ENV), false);
  assert.equal(hasValidProxySecret(SECRET.slice(0, -1), ENV), false);
  assert.equal(hasValidProxySecret(`${SECRET},${OTHER_SECRET}`, ENV), false);
  const rotating = { [PROXY_SECRET_ENV]: `${SECRET}, ${OTHER_SECRET}` };
  assert.equal(hasValidProxySecret(SECRET, rotating), true);
  assert.equal(hasValidProxySecret(OTHER_SECRET, rotating), true);
});

test("A1: érvényes titokkal a kulcs az X-Forwarded-For bal szélső címe", () => {
  const headers = { [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": "198.51.100.4, 76.76.21.9, 172.70.1.1" };
  assert.deepEqual(resolveClientIp({ headers, ip: SOCKET_IP }, ENV), { ip: "198.51.100.4", source: "vercel" });
  assert.equal(clientIpKey({ headers, ip: SOCKET_IP }, ENV), "198.51.100.4");
});

test("érvényes titokkal: érvénytelen XFF → x-real-ip; az sem érvényes → közvetlen ág", () => {
  const realIp = { [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": "unknown", "x-real-ip": "198.51.100.5" };
  assert.deepEqual(resolveClientIp({ headers: realIp, ip: SOCKET_IP }, ENV), { ip: "198.51.100.5", source: "vercel" });
  const nothing = { [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": "unknown" };
  assert.deepEqual(resolveClientIp({ headers: nothing, ip: SOCKET_IP }, ENV), { ip: SOCKET_IP, source: "socket" });
});

test("A2: titok nélkül vagy rossz titokkal a kliens által írt fejléc nem változtat a kulcson", () => {
  const spoofed = { "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7" };
  assert.deepEqual(resolveClientIp({ headers: spoofed, ip: SOCKET_IP }, ENV), { ip: SOCKET_IP, source: "socket" });
  const wrongSecret = { ...spoofed, [PROXY_SECRET_HEADER]: OTHER_SECRET };
  assert.deepEqual(resolveClientIp({ headers: wrongSecret, ip: SOCKET_IP }, ENV), { ip: SOCKET_IP, source: "socket" });
  // A szerveren nincs titok: a helyes értéknek látszó fejléc sem számít.
  const noServerSecret = { ...spoofed, [PROXY_SECRET_HEADER]: SECRET };
  assert.deepEqual(resolveClientIp({ headers: noServerSecret, ip: SOCKET_IP }, {}), { ip: SOCKET_IP, source: "socket" });
});

test("A4: a CF-Connecting-IP csak Renderen számít; érvényes titok mellett a Vercel címe az első", () => {
  const headers = { "cf-connecting-ip": "198.51.100.77", "x-forwarded-for": "203.0.113.7" };
  assert.deepEqual(resolveClientIp({ headers, ip: SOCKET_IP }, { ...ENV, RENDER: "true" }), { ip: "198.51.100.77", source: "cloudflare" });
  assert.deepEqual(resolveClientIp({ headers, ip: SOCKET_IP }, ENV), { ip: SOCKET_IP, source: "socket" });
  assert.deepEqual(resolveClientIp({ headers: { "cf-connecting-ip": "nem-cím" }, ip: SOCKET_IP }, { RENDER: "true" }), { ip: SOCKET_IP, source: "socket" });
  const viaVercel = { ...headers, [PROXY_SECRET_HEADER]: SECRET };
  assert.deepEqual(resolveClientIp({ headers: viaVercel, ip: SOCKET_IP }, { ...ENV, RENDER: "true" }), { ip: "203.0.113.7", source: "vercel" });
});

test("A5: IPv6-nál a /56 alhálózat a kulcs; ::ffff: előtag IPv4-ként számol", () => {
  const key = (ip: string) => clientIpKey({ headers: { [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": ip }, ip: SOCKET_IP }, ENV);
  assert.equal(key("2001:db8:1:aa01::1"), key("2001:db8:1:aaff:ffff::2"));
  assert.notEqual(key("2001:db8:1:aa01::1"), key("2001:db8:1:ab01::1"));
  assert.equal(key("::ffff:198.51.100.4"), "198.51.100.4");
  assert.equal(clientIpKey({ headers: {}, ip: "::ffff:127.0.0.1" }, {}), "127.0.0.1");
});

// --- Valódi Express + express-rate-limit, a termelési `trust proxy: 1` beállítással -------------------------------------------

async function get(server: http.Server, headers: Record<string, string>): Promise<{ status: number; remaining: number }> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: address.port, path: "/limited", method: "GET", headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, remaining: Number(res.headers["ratelimit-remaining"]) }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function withLimitedApp(max: number, run: (server: http.Server) => Promise<void>): Promise<void> {
  const previous = process.env[PROXY_SECRET_ENV];
  process.env[PROXY_SECRET_ENV] = SECRET;
  const app = express();
  app.set("trust proxy", 1);
  app.get("/limited", rateLimit({ keyGenerator: clientIpKeyGenerator, windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false }), (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(server);
  } finally {
    if (previous === undefined) delete process.env[PROXY_SECRET_ENV];
    else process.env[PROXY_SECRET_ENV] = previous;
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * A termelési láncot modellezi: az Express előtt álló terheléselosztó a kliens által küldött X-Forwarded-For végére fűzi a
 * hozzá csatlakozó fél címét (`trust proxy: 1` mellett ez a `req.ip`). A bal oldali elemeket a kliens írja.
 */
const behindLoadBalancer = (peerIp: string, clientHeaders: Record<string, string> = {}): Record<string, string> => ({
  ...clientHeaders,
  "x-forwarded-for": [clientHeaders["x-forwarded-for"], peerIp].filter(Boolean).join(", "),
});

test("A2 (élő korlát): hamisított X-Forwarded-For közvetlen hívásnál nem ad új keretet", async () => {
  await withLimitedApp(3, async (server) => {
    const attacker = "192.0.2.10";
    const seen: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await get(server, behindLoadBalancer(attacker, { "x-forwarded-for": `203.0.113.${i + 1}`, "x-real-ip": `203.0.113.${i + 1}` }));
      assert.equal(response.status, 200);
      seen.push(response.remaining);
    }
    assert.deepEqual(seen, [2, 1, 0]);
    assert.equal((await get(server, behindLoadBalancer(attacker, { "x-forwarded-for": "203.0.113.99" }))).status, 429);
    // Rossz titok + hamis cím: ugyanaz a (kimerült) közvetlen keret.
    assert.equal((await get(server, behindLoadBalancer(attacker, { "x-forwarded-for": "203.0.113.100", [PROXY_SECRET_HEADER]: OTHER_SECRET }))).status, 429);
    // Másik közvetlen hívó: saját keret.
    assert.equal((await get(server, behindLoadBalancer("192.0.2.11"))).remaining, 2);
  });
});

test("A1 (élő korlát): a proxyn át két különböző kliens külön keretet kap, ugyanaz a kliens közöset", async () => {
  await withLimitedApp(3, async (server) => {
    const viaProxy = (clientIp: string) => get(server, behindLoadBalancer("76.76.21.9", { [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": clientIp }));
    assert.equal((await viaProxy("198.51.100.1")).remaining, 2);
    assert.equal((await viaProxy("198.51.100.1")).remaining, 1);
    assert.equal((await viaProxy("198.51.100.2")).remaining, 2);
    assert.equal((await viaProxy("198.51.100.1")).remaining, 0);
    assert.equal((await viaProxy("198.51.100.1")).status, 429);
    assert.equal((await viaProxy("198.51.100.2")).status, 200);
    // A közvetlen hívó kerete független a proxyn át érkező kliensekétől.
    assert.equal((await get(server, behindLoadBalancer("192.0.2.10"))).remaining, 2);
  });
});

// --- Forrásőrök ---------------------------------------------------------------------------------------------------------------

const SERVER_DIR = fileURLToPath(new URL("../server", import.meta.url));

function serverSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return serverSources(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** A `rateLimit(` hívás teljes szövege a záró zárójelig. */
function rateLimitCalls(source: string): string[] {
  const calls: string[] = [];
  for (const match of source.matchAll(/\brateLimit\(/g)) {
    let depth = 0;
    for (let i = match.index + match[0].length - 1; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")" && (depth -= 1) === 0) {
        calls.push(source.slice(match.index, i + 1));
        break;
      }
    }
  }
  return calls;
}

test("A7: a server/ alatt minden rateLimit( hívásnak van keyGenerator-a (nincs alapértelmezett req.ip kulcs)", () => {
  let total = 0;
  for (const file of serverSources(SERVER_DIR)) {
    for (const call of rateLimitCalls(readFileSync(file, "utf8"))) {
      total += 1;
      assert.match(call, /\bkeyGenerator\b/, `${file}: rateLimit keyGenerator nélkül — használd a clientIpKeyGenerator-t (server/lib/client-ip.ts)`);
    }
  }
  assert.ok(total >= 12, `várt legalább 12 korlát, talált: ${total}`);
});

test("A8: a vercel.json /api szabálya set művelettel állítja a titokfejlécet a környezeti változóból; érték nincs a fájlban", () => {
  const raw = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  const config = JSON.parse(raw) as {
    routes?: Array<{ src: string; dest?: string; continue?: boolean; transforms?: Array<{ type: string; op: string; target: { key: string }; args: string; env: string[] }> }>;
    rewrites: Array<{ source: string; destination: string }>;
  };
  assert.equal(config.routes?.length, 1);
  const [route] = config.routes ?? [];
  assert.equal(route.src, "/api/(.*)");
  assert.equal(route.continue, true);
  assert.equal(route.dest, undefined);
  assert.deepEqual(route.transforms, [
    { type: "request.headers", op: "set", target: { key: PROXY_SECRET_HEADER }, args: `$${PROXY_SECRET_ENV}`, env: [PROXY_SECRET_ENV] },
  ]);
  assert.doesNotMatch(raw, /[A-Fa-f0-9]{32,}/);
  // Az átírások változatlanok: az /api továbbra is a Renderre megy, a végén az SPA-tartalék áll.
  assert.deepEqual(config.rewrites[0], { source: "/api/:path*", destination: "https://websuli-api-eu.onrender.com/api/:path*" });
  assert.deepEqual(config.rewrites.at(-1), { source: "/:path*", destination: "/index.html" });
});
