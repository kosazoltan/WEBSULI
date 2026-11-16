/**
 * JM2 — a valós idejű réteg a VALÓDI felcsatoláson (`mountAppRoutes` — ugyanaz, amit az index.ts hív):
 *  - `MP_MODE` alapból kikapcsolt: a Socket.IO NEM csatolódik fel (nincs figyelő az úton), a kérdésbank nincs a
 *    memóriában, a jegy-végpont 404 (review #452 ALACSONY-2);
 *  - bekapcsolva (`getRealtime().attach()`): a jegy-végpont CSRF-token nélkül, de csak engedélyezett eredetről;
 *  - a leállítási sorrend az index.ts-ben a `beginRealtimeShutdown`-on át megy.
 * Adatbázishoz nem kapcsolódunk.
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
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const sameOrigin = `http://localhost:${port}`;

after(async () => {
  getRealtime().close();
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// SPEC-VÁLTOZÁS 2026-11-16 (terv D21): vendég `on` módban csak csatlakozó jegyet kap — az eredet-őrt ezen az úton mérjük.
const post = (headers: Record<string, string>, body: unknown = { intent: "join", code: "ABC234" }) =>
  fetch(`${base}/api/rt/ticket`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("JM2 — leállítási sorrend (index.ts)", () => {
  it("a gracefulShutdown a beginRealtimeShutdown-on át zár (rövid üzenet-ablak, a server.close sorrendjét az dönti el), és a pool előtt kivárja", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = (await readFile(new URL("../server/index.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    const shutdown = src.slice(src.indexOf("const gracefulShutdown"), src.indexOf('process.on("SIGTERM"'));
    const code = shutdown.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.match(code, /beginRealtimeShutdown\(getRealtime\(\), server, \{\s*windowMs: drainWindowMsFromEnv\(\)/);
    assert.equal((code.match(/server\.close\(/g) ?? []).length, 0, "közvetlen server.close() nincs (a beginRealtimeShutdown dönti el: szoba nélkül azonnal)");
    assert.ok(code.indexOf("await realtimeDrained") > 0 && code.indexOf("await realtimeDrained") < code.indexOf("dbPool.end()"), "a pool zárása előtt kivárva");
    // Az indításnál a felcsatolás feltételes és hibatűrő.
    const startup = src.slice(0, src.indexOf("const gracefulShutdown"));
    assert.match(startup, /if \(mpMode\(\) !== "off"\) \{/);
    assert.match(startup, /await realtime\.attach\(server/);
    assert.match(startup, /catch \(err\) \{\s*logger\.error\("\[RT\] a valós idejű réteg nem indult el/);
  });
});

describe("JM2 — valódi felcsatolás", () => {
  it("MP_MODE nincs beállítva (alap: off): nincs Socket.IO-figyelő, a bank nincs betöltve, jegy 404, státusz { enabled: false }", async () => {
    assert.equal(server.listeners("upgrade").length, 0, "nincs upgrade-figyelő");
    assert.equal(server.listeners("request").length, 1, "csak az Express kérés-figyelője");
    assert.equal(getRealtime().gateway, null);
    assert.equal(getRealtime().bankLoaded, false, "a kérdésbank nincs a memóriában");
    assert.equal((await post({ origin: sameOrigin })).status, 404);
    const st = await (await fetch(`${base}/api/rt/status`)).json();
    assert.deepEqual(st, { enabled: false, mode: "off", games: [], available: "off", activeMatches: 0, protocol: 1 });
    const raw = await fetch(`${base}${RT_PATH}?EIO=4&transport=polling`, { headers: { origin: sameOrigin } });
    assert.equal(raw.status, 404, "az út az Expresshez jut (mintha a réteg nem is létezne)");
    assert.equal((await fetch(`${base}/api/rt/ticket`)).status, 404, "GET a jegy-végponton nincs");
  });

  it("MP_MODE=on + attach: a jegy-végpont CSRF-token nélkül, de csak engedélyezett eredetről (idegen / hiányzó Origin → 403); az előtag nem nyel el idegen utat", async () => {
    process.env.MP_MODE = "on";
    try {
      assert.equal((await post({ origin: sameOrigin })).status, 503, "felcsatolás nélkül nincs jegy");
      await getRealtime().attach(server);
      assert.equal(getRealtime().bankLoaded, true);
      assert.equal((await post({ origin: "https://evil.example" })).status, 403);
      assert.equal((await post({})).status, 403, "Origin / Referer nélkül sem");
      const ok = await post({ origin: sameOrigin });
      assert.equal(ok.status, 200);
      const body = await ok.json();
      assert.equal(typeof body.ticket, "string");
      assert.equal(body.path, RT_PATH);
      assert.equal(ok.headers.get("cache-control"), "no-store");
      assert.equal(JSON.stringify(body).includes("@"), false);
      const guestCreate = await post({ origin: sameOrigin }, { intent: "create" });
      assert.equal(guestCreate.status, 403, "vendég nem nyithat szobát (D21)");
      assert.deepEqual(await guestCreate.json(), { code: "ACCOUNT_REQUIRED" });
      assert.equal((await fetch(`${base}/api/rt/iox`)).status, 404, "a Socket.IO-útvonal előtagja nem nyel el idegen utat");
      const adminSt = await fetch(`${base}/api/admin/rt/status`);
      assert.equal(adminSt.status, 401, "a részletes státusz admin-őr mögött");
    } finally {
      delete process.env.MP_MODE;
    }
  });
});
