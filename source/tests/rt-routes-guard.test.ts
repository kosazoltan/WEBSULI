/**
 * JM2 — a valós idejű réteg a VALÓDI felcsatoláson (`mountAppRoutes` — ugyanaz, amit az index.ts hív) + a valódi
 * `getRealtime().attach()`: a CSRF-kivétel Origin-engedélylistával őrzött, `MP_MODE` alapból kikapcsolt (jegy 404, a
 * Socket.IO-kézfogás FEATURE_DISABLED), bekapcsolva a vendég jegyet kap. Adatbázishoz nem kapcsolódunk.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import express from "express";

process.env.DATABASE_URL = "postgresql://authz:authz@127.0.0.1:1/rt_guard";
process.env.SESSION_SECRET ??= "rt-routes-guard-test-secret-0123456789";
delete process.env.MP_MODE;

const { mountAppRoutes } = await import("../server/app-routes");
const { getRealtime } = await import("../server/realtime");
const { RT_PATH } = await import("../shared/duel/protocol");

const app = express();
app.use(express.json());
const server = await mountAppRoutes(app);
getRealtime().attach(server);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const sameOrigin = `http://localhost:${port}`;

after(async () => {
  getRealtime().close();
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (headers: Record<string, string>) =>
  fetch(`${base}/api/rt/ticket`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ intent: "create" }) });

describe("JM2 — leállítási sorrend (index.ts, review #452)", () => {
  it("a gracefulShutdown a beginRealtimeShutdown-on át zár (a server.close sorrendjét az dönti el), és a pool előtt kivárja a drain-t", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = (await readFile(new URL("../server/index.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    const shutdown = src.slice(src.indexOf("const gracefulShutdown"), src.indexOf('process.on("SIGTERM"'));
    const code = shutdown.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.match(code, /beginRealtimeShutdown\(getRealtime\(\), server, \{\s*drainMs: drainMsFromEnv\(\)/);
    assert.equal((code.match(/server\.close\(/g) ?? []).length, 0, "közvetlen server.close() nincs (különben a polling-játékos leszakad)");
    assert.ok(code.indexOf("await realtimeDrained") > 0 && code.indexOf("await realtimeDrained") < code.indexOf("dbPool.end()"), "a drain a pool zárása előtt kivárva");
  });
});

describe("JM2 — valódi felcsatolás", () => {
  it("MP_MODE nincs beállítva (alap: off): jegy 404, státusz { enabled: false }, Socket.IO-kézfogás FEATURE_DISABLED", async () => {
    assert.equal((await post({ origin: sameOrigin })).status, 404);
    const st = await (await fetch(`${base}/api/rt/status`)).json();
    assert.equal(st.enabled, false);
    assert.equal(st.mode, "off");
    assert.equal(st.activeMatches, 0);
    const raw = await fetch(`${base}${RT_PATH}?EIO=4&transport=polling`, { headers: { origin: sameOrigin } });
    assert.equal(raw.status, 403);
    assert.match(await raw.text(), /FEATURE_DISABLED/);
    // A többi útvonal érintetlen (a Socket.IO csak a saját útvonalát fogja el).
    assert.equal((await fetch(`${base}/api/rt/ticket`)).status, 404, "GET a jegy-végponton nincs");
    assert.equal((await fetch(`${base}/api/rt/iox`)).status, 404, "a Socket.IO-útvonal előtagja nem nyel el idegen utat… (Express 404)");
  });

  it("MP_MODE=on: a jegy-végpont CSRF-token nélkül, de csak engedélyezett eredetről (idegen / hiányzó Origin → 403)", async () => {
    process.env.MP_MODE = "on";
    try {
      assert.equal((await post({ origin: "https://evil.example" })).status, 403);
      assert.equal((await post({})).status, 403, "Origin / Referer nélkül sem");
      const ok = await post({ origin: sameOrigin });
      assert.equal(ok.status, 200);
      const body = await ok.json();
      assert.equal(typeof body.ticket, "string");
      assert.equal(body.path, RT_PATH);
      assert.equal(ok.headers.get("cache-control"), "no-store");
      assert.equal(JSON.stringify(body).includes("@"), false);
    } finally {
      delete process.env.MP_MODE;
    }
  });
});
