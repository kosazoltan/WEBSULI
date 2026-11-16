/**
 * JM7a (G11 / JM-A12, terv 10.4 (b)(c)): frissen regisztrált játékos — és vendég — közvetlen URL-lel sem éri el az admin
 * felületet. Valós (buildelt) szerver + eldobható Postgres: `npm run test:e2e -- tests/player-admin-isolation.spec.ts`.
 *
 * A „frissen regisztrált játékos” állapota pontosan az, amit a beváltás létrehoz: `player_accounts` sor a szerver saját
 * `confirmVerifiedEmail` függvényével, és egy munkamenet, amelyben csak `player` kulcs van (req.user nincs) — a süti a
 * szerverrel azonos SESSION_SECRET-tel aláírva. (A valódi kód-beváltás HTTP-útja a PLAYER_ACCOUNTS flag mögött van; azt a
 * tests/player-auth-db.integration.ts és a mátrix-teszt fedi le.) Elvárás: /admin, /admin/stats, /admin/help → `/`, és
 * a hálózati naplóban nincs /api/admin* vagy /api/studio* 2xx; az /admin/stats egyáltalán nem kér admin-statisztikát.
 */
import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { createPlayerStore } from "../server/player/store";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "";
const PORT = process.env.WEBSULI_E2E_PORT ?? "5000";
const ADMIN_PATHS = ["/admin", "/admin/stats", "/admin/help"] as const;

let pool: pg.Pool;
const createdPlayers: string[] = [];
const createdSessions: string[] = [];

function signedCookieValue(sid: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(sid).digest("base64").replace(/=+$/, "");
  return encodeURIComponent(`s:${sid}.${sig}`);
}

async function freshPlayerSession(context: BrowserContext): Promise<string> {
  const email = `jm7a.${randomBytes(5).toString("hex")}@teszt-iskola.example`;
  const player = await createPlayerStore(pool).confirmVerifiedEmail(email);
  createdPlayers.push(player.id);
  expect(player.banned).toBe(false);
  const sid = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + 3_600_000);
  const sess = { cookie: { originalMaxAge: 3_600_000, expires: expires.toISOString(), secure: true, httpOnly: true, path: "/", sameSite: "lax" }, player: { id: player.id } };
  await pool.query(`INSERT INTO session (sid, sess, expire) VALUES ($1, $2, $3)`, [sid, JSON.stringify(sess), expires]);
  createdSessions.push(sid);
  await context.addCookies([{ name: "connect.sid", value: signedCookieValue(sid), domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
  return player.id;
}

/** Az admin-útvonal megnyitása; visszaadja az összes /api/admin* és /api/studio* választ. */
async function openAdminPath(page: Page, path: string): Promise<{ url: string; status: number }[]> {
  const adminResponses: { url: string; status: number }[] = [];
  page.on("response", (res) => {
    const u = new URL(res.url());
    if (u.pathname.startsWith("/api/admin") || u.pathname.startsWith("/api/studio")) adminResponses.push({ url: u.pathname, status: res.status() });
  });
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`^http://localhost:${PORT}/(?:\\?.*)?$`), { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  return adminResponses;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect(DATABASE_URL, "DATABASE_URL (eldobható adatbázis)").not.toBe("");
  expect(SESSION_SECRET, "SESSION_SECRET (a szerverrel közös)").not.toBe("");
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  // A connect-pg-simple a munkamenet-táblát az első használatkor hozza létre.
  expect((await request.get("/api/csrf-token")).status()).toBe(200);
});

test.afterAll(async () => {
  if (createdSessions.length) await pool.query(`DELETE FROM session WHERE sid = ANY($1)`, [createdSessions]);
  if (createdPlayers.length) await pool.query(`DELETE FROM player_accounts WHERE id = ANY($1)`, [createdPlayers]);
  await pool?.end();
});

test("frissen regisztrált játékos: az admin-útvonalak a főoldalra visznek, admin-adat nem töltődik", async ({ browser }) => {
  const context = await browser.newContext();
  await freshPlayerSession(context);
  const page = await context.newPage();
  // A munkamenet él (a szerver elfogadja), de req.user nincs: a meglévő auth-végpont null.
  const auth = await page.request.get("/api/auth/user");
  expect(await auth.json()).toBeNull();
  expect((await page.request.get("/api/admin/users")).status()).toBe(401);
  for (const path of ADMIN_PATHS) {
    const responses = await openAdminPath(page, path);
    expect(responses.filter((r) => r.status >= 200 && r.status < 300), `${path}: admin-végpont 2xx`).toEqual([]);
    if (path === "/admin/stats") expect(responses.filter((r) => r.url.startsWith("/api/admin/stats")), "/admin/stats nem kér statisztikát").toEqual([]);
  }
  await context.close();
});

test("vendég: ugyanígy átirányul, admin-adat nélkül", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of ADMIN_PATHS) {
    const responses = await openAdminPath(page, path);
    expect(responses.filter((r) => r.status >= 200 && r.status < 300), `${path}: admin-végpont 2xx`).toEqual([]);
    if (path === "/admin/stats") expect(responses.filter((r) => r.url.startsWith("/api/admin/stats"))).toEqual([]);
  }
  await context.close();
});
