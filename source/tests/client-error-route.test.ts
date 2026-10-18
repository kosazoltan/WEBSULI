import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import test from "node:test";
import express from "express";

import type { ErrorReportPayload } from "../server/lib/error-mailer";
import { createClientErrorRouter, type ClientErrorRouterOptions } from "../server/routes/client-error";

/** Kanban #127 — docs/specs/2026-10-18-kliens-hibariport.md */

async function withServer(
  opts: ClientErrorRouterOptions,
  run: (baseUrl: string, sent: ErrorReportPayload[]) => Promise<void>,
): Promise<void> {
  const sent: ErrorReportPayload[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    "/api/client-error",
    createClientErrorRouter({
      reportSender: async (p) => {
        sent.push(p);
      },
      ...opts,
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`, sent);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function post(baseUrl: string, body: unknown, origin: string | null = baseUrl): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  return fetch(`${baseUrl}/api/client-error`, { method: "POST", headers, body: JSON.stringify(body) });
}

test("same-origin kérés → 202, a küldő a megtisztított adatot kapja", async () => {
  await withServer({}, async (baseUrl, sent) => {
    const res = await post(baseUrl, {
      errorType: "UnhandledError",
      message: "boom",
      userEmail: "hamis@example.com",
      userId: "admin",
      environment: "hamis",
      requestBody: "secret-ish",
      commitSha: "deadbeef",
    });
    assert.equal(res.status, 202);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].errorType, "UnhandledError");
    assert.equal(sent[0].message, "boom");
    assert.equal(sent[0].userEmail, undefined);
    assert.equal(sent[0].userId, undefined);
    assert.equal(sent[0].requestBody, undefined);
    assert.equal(sent[0].commitSha, undefined);
    assert.equal(sent[0].environment, (process.env.NODE_ENV ?? "production").substring(0, 20));
  });
});

test("idegen Origin → 403, nincs küldés", async () => {
  await withServer({}, async (baseUrl, sent) => {
    const res = await post(baseUrl, { message: "x" }, "https://evil.example");
    assert.equal(res.status, 403);
    assert.equal(sent.length, 0);
  });
});

test("Origin és Referer nélkül → 403", async () => {
  await withServer({}, async (baseUrl, sent) => {
    const res = await post(baseUrl, { message: "x" }, null);
    assert.equal(res.status, 403);
    assert.equal(sent.length, 0);
  });
});

test("üres üzenet → 400", async () => {
  await withServer({}, async (baseUrl, sent) => {
    assert.equal((await post(baseUrl, { message: "   " })).status, 400);
    assert.equal((await post(baseUrl, {})).status, 400);
    assert.equal(sent.length, 0);
  });
});

test("napi plafon: a 3. jelentés 429, budapesti éjfél után újra 202", async () => {
  let now = new Date("2026-10-18T21:30:00Z"); // 23:30 Budapest (CEST)
  await withServer({ dailyCap: 2, now: () => now }, async (baseUrl, sent) => {
    assert.equal((await post(baseUrl, { message: "a" })).status, 202);
    assert.equal((await post(baseUrl, { message: "b" })).status, 202);
    assert.equal((await post(baseUrl, { message: "c" })).status, 429);
    assert.equal(sent.length, 2);
    now = new Date("2026-10-18T22:05:00Z"); // 00:05 Budapest, new day
    assert.equal((await post(baseUrl, { message: "d" })).status, 202);
    assert.equal(sent.length, 3);
  });
});

test("breadcrumbs: legfeljebb 50, a túl hosszú elem kimarad; rossz errorType → ClientError", async () => {
  await withServer({}, async (baseUrl, sent) => {
    const crumbs = Array.from({ length: 60 }, (_, i) => ({ type: "click", message: `c${i}` }));
    crumbs[59] = { type: "click", message: "x".repeat(600) };
    const res = await post(baseUrl, { errorType: "<script>", message: "m", breadcrumbs: crumbs });
    assert.equal(res.status, 202);
    assert.equal(sent[0].errorType, "ClientError");
    assert.equal(sent[0].breadcrumbs?.length, 49);
    assert.deepEqual(sent[0].breadcrumbs?.[0], { type: "click", message: "c10" });
  });
});

test("index.ts: a /api/client-error a routes.ts CSRF-őre előtt van bekötve (különben 403)", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "server", "index.ts"), "utf8");
  const mount = src.indexOf('app.use("/api/client-error", clientErrorRouter)');
  const routes = src.indexOf("await registerRoutes(app)");
  assert.ok(mount > 0 && routes > 0 && mount < routes);
});

test("a böngészős reportError az új végpontot hívja, a HMAC-osat nem", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "client", "src", "components", "ErrorReporter.tsx"), "utf8");
  assert.match(src, /fetch\("\/api\/client-error"/);
  assert.doesNotMatch(src, /\/api\/error-report"/);
});
