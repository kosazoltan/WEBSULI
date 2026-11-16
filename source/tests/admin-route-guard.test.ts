/**
 * JM7a — regressziós őr (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4 (d), JM-A12; tulajdonosi G11 / D12:
 * „Az admin felülethez senki nem férhet hozzá, csak az adminok.”).
 *
 * A szerver valódi útvonal-felcsatolását (`mountAppRoutes` — ugyanaz, amit az index.ts hív) építi fel adatbázis nélkül, és a
 * router-verem bejárásával ellenőrzi:
 *  (1) az admin előtagok (`/api/admin`, `/api/studio`) alatti MINDEN végpont láncában ott van az `isAuthenticatedAdmin`
 *      (a végső kezelő ELŐTT, a saját láncában — testvér-router őre nem számít);
 *  (2) az előtagon kívüli, név szerint rögzített adminvégpontok őre megmaradt;
 *  (3) a játékos-végpontok (`/api/player/*`) nem kerülhetnek admin előtag alá.
 * A dinamikus (HTTP) mátrix: tests/admin-authz-matrix-db.integration.ts (eldobható adatbázison).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express, { type RequestHandler } from "express";
import { ADMIN_PREFIXES, isUnderAdminPrefix, routeInventory, type Endpoint } from "./support/route-inventory";

// Adatbázishoz NEM kapcsolódunk: elérhetetlen loopback-cím (a pool csak naplóz, kérés nincs).
process.env.DATABASE_URL = "postgresql://authz:authz@127.0.0.1:1/authz_guard";
process.env.SESSION_SECRET ??= "admin-route-guard-test-secret-0123456789";
// A Google-utak is felcsatolódjanak (élesben be vannak állítva), így a leltár az éles útvonal-készlet.
process.env.GOOGLE_CLIENT_ID ??= "guard-test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "guard-test-client-secret";

const { isAuthenticatedAdmin } = await import("../server/auth");
const { mountAppRoutes } = await import("../server/app-routes");

function unguardedAdminEndpoints(endpoints: readonly Endpoint[], guard: RequestHandler): string[] {
  return endpoints.filter((e) => isUnderAdminPrefix(e.path) && !e.chain.includes(guard)).map((e) => `${e.method} ${e.path}`);
}

/** Az admin előtagon KÍVÜLI adminvégpontok (terv 10.4 végpont-felmérés, 2026-11-16). Új ilyen végpont ide kerül. */
const PINNED_ADMIN_ENDPOINTS = [
  "GET /api/static-audit",
  "POST /api/html-files",
  "PATCH /api/html-files/:id",
  "POST /api/html-files/reorder",
  "DELETE /api/html-files/:id",
  "POST /api/html-files/:id/send-email",
  "GET /api/extra-emails",
  "PATCH /api/extra-emails/:id/classrooms",
  "PATCH /api/extra-emails/:id/student",
  "GET /download-source-static",
] as const;

const app = express();
await mountAppRoutes(app);
const inventory = routeInventory(app);
const key = (e: Endpoint) => `${e.method} ${e.path}`;

describe("JM7a — admin-útvonal regressziós őr", () => {
  it("a leltár nem üres és tartalmazza az ismert végpontokat (a bejárás nem csendesen üres)", () => {
    const keys = new Set(inventory.map(key));
    assert.ok(inventory.length >= 150, `legalább 150 végpont kell, ennyi lett: ${inventory.length}`);
    for (const k of ["GET /api/admin/users", "POST /api/studio/lessons/one-step", "GET /api/admin/catalog/summary", "GET /api/auth/user", "GET /auth/google/callback"]) {
      assert.ok(keys.has(k), `hiányzik a leltárból: ${k}`);
    }
    const adminCount = inventory.filter((e) => isUnderAdminPrefix(e.path)).length;
    assert.ok(adminCount >= 90, `legalább 90 admin-előtagú végpont várt, ennyi lett: ${adminCount}`);
  });

  it("az admin előtagok alatt MINDEN végpont isAuthenticatedAdmin-nal védett", () => {
    assert.deepEqual(unguardedAdminEndpoints(inventory, isAuthenticatedAdmin), []);
  });

  it("az előtagon kívüli, rögzített adminvégpontok őre megvan", () => {
    const byKey = new Map(inventory.map((e) => [key(e), e]));
    for (const k of PINNED_ADMIN_ENDPOINTS) {
      const e = byKey.get(k);
      assert.ok(e, `a rögzített adminvégpont eltűnt a leltárból (ha átnevezték, a listát is frissítsd): ${k}`);
      assert.ok(e.chain.includes(isAuthenticatedAdmin), `${k}: hiányzik az isAuthenticatedAdmin`);
    }
  });

  it("minden admin-őrzött végpont vagy admin előtag alatt van, vagy a rögzített listán (új adminvégpont nem bújhat el)", () => {
    const pinned = new Set<string>(PINNED_ADMIN_ENDPOINTS);
    const stray = inventory
      .filter((e) => e.chain.includes(isAuthenticatedAdmin) && !isUnderAdminPrefix(e.path) && !pinned.has(key(e)))
      .map(key);
    assert.deepEqual(stray, []);
  });

  it("a játékos-végpontok nem kerülnek admin előtag alá", () => {
    const misplaced = inventory.filter((e) => e.path.includes("/player") && isUnderAdminPrefix(e.path)).map(key);
    assert.deepEqual(misplaced, []);
  });
});

describe("JM7a — az őr maga is bukik, ha kell (önellenőrzés)", () => {
  it("őrizetlen admin-útvonalat, későn felrakott router-őrt és testvér-router őrét NEM fogadja el", () => {
    const probe = express();
    probe.get("/api/admin/open", (_req, res) => res.end());
    probe.get("/api/admin/ok", isAuthenticatedAdmin, (_req, res) => res.end());
    const late = express.Router();
    late.get("/late", (_req, res) => res.end());
    late.use(isAuthenticatedAdmin); // az útvonal UTÁN: nem véd
    probe.use("/api/studio", late);
    const guarded = express.Router();
    guarded.use(isAuthenticatedAdmin);
    guarded.get("/guarded", (_req, res) => res.end());
    probe.use("/api/studio", guarded);
    const sibling = express.Router(); // a fenti testvér-router őre ide nem számít
    sibling.get("/sibling", (_req, res) => res.end());
    probe.use("/api/studio", sibling);
    const pathGuarded = express.Router();
    pathGuarded.get("/users", (_req, res) => res.end());
    probe.use("/api/admin/x", isAuthenticatedAdmin, pathGuarded);
    const found = unguardedAdminEndpoints(routeInventory(probe), isAuthenticatedAdmin);
    assert.deepEqual(found.sort(), ["GET /api/admin/open", "GET /api/studio/late", "GET /api/studio/sibling"]);
  });

  it("az admin előtagok listája a terv szerinti", () => {
    assert.deepEqual([...ADMIN_PREFIXES], ["/api/admin", "/api/studio"]);
  });
});
