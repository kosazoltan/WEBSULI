import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { enforceOriginAllowlist } from "../server/lib/origin-guard";

/**
 * AUDIT 2026-09-01 — a login/logout Origin-őr halott kód volt.
 *
 * Az Express regisztrációs sorrendben fut: a setupAuth() (index.ts) ELŐBB regisztrálja a
 * POST /api/login és /api/logout handlereket, mint a routes.ts globális app.use() őre, ezért
 * a kérés a handlerben lezárult, az őr sosem futott. A meglévő csrf-origin.test.ts a
 * middleware-t a route-ok ELÉ tette, ezért nem bukott ki.
 *
 * Ez a teszt a VALÓS sorrendet reprodukálja: a route ELŐBB (az őrrel, ahogy most az auth.ts
 * teszi), a globális app.use() UTÁNA — és elvárja, hogy az idegen Origin 403-at kapjon.
 */

async function request(
  server: http.Server,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: addr.port, path, method: "POST", headers: { "content-type": "application/json", ...headers } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end("{}");
  });
}

function buildAppInProductionOrder(): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  // 1) auth.ts (setupAuth) — route-ok az őrrel, ELŐBB
  app.post("/api/login", enforceOriginAllowlist, (_req, res) => res.json({ ok: "login" }));
  app.post("/api/logout", enforceOriginAllowlist, (_req, res) => res.json({ ok: "logout" }));
  // 2) routes.ts — globális őr, UTÁNA (ide a fenti kérések már nem jutnak el)
  app.use((req, res, next) => {
    if (req.path === "/api/login" || req.path === "/api/logout") return enforceOriginAllowlist(req, res, next);
    next();
  });
  return app;
}

test("valós regisztrációs sorrend: idegen Origin a /api/login-on 403", async () => {
  const server = buildAppInProductionOrder().listen(0);
  try {
    const r = await request(server, "/api/login", { origin: "https://evil.example" });
    assert.equal(r.status, 403);
    assert.match(r.body, /Origin not allowed/);
  } finally {
    server.close();
  }
});

test("valós regisztrációs sorrend: idegen Origin a /api/logout-on 403", async () => {
  const server = buildAppInProductionOrder().listen(0);
  try {
    const r = await request(server, "/api/logout", { origin: "https://evil.example" });
    assert.equal(r.status, 403);
  } finally {
    server.close();
  }
});

test("valós regisztrációs sorrend: Origin nélkül (cross-site form) is 403 — fail-closed", async () => {
  const server = buildAppInProductionOrder().listen(0);
  try {
    const r = await request(server, "/api/login", {});
    assert.equal(r.status, 403);
  } finally {
    server.close();
  }
});

test("valós regisztrációs sorrend: same-origin kérés átmegy", async () => {
  const server = buildAppInProductionOrder().listen(0);
  try {
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    const self = `http://127.0.0.1:${addr.port}`;
    const r = await request(server, "/api/login", { origin: self, host: `127.0.0.1:${addr.port}` });
    assert.equal(r.status, 200);
    assert.match(r.body, /login/);
  } finally {
    server.close();
  }
});

test("auth.ts: a login és logout route-on közvetlenül rajta van az Origin-őr", () => {
  const src = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "server", "auth.ts"), "utf8");
  assert.match(src, /app\.post\("\/api\/login",\s*enforceOriginAllowlist,/);
  assert.match(src, /app\.post\("\/api\/logout",\s*enforceOriginAllowlist,/);
});
