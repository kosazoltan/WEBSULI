/**
 * JM7c-1 (terv 10.4a) — hibrid jogosultság valódi böngészőben, a BUILDELT szerveren, eldobható Postgresen.
 * A szerver e2e-környezete (playwright.config.ts): ADMIN_ALLOWLIST = E2E_ALLOWLISTED_ADMIN, csonk Google-kliensazonosító.
 *  - listás admin (is_admin) → az /admin oldal betölt;
 *  - is_admin jelzős, de listán KÍVÜLI fiók (= a listáról levett admin állapota) → az /admin átirányít a főoldalra;
 *  - nem admin felhasználó → az /admin átirányít;
 *  - a Google-belépés indítása `a.` előtagú state-et + PKCE-t küld (a Google-oldalt a böngészőben elfogjuk — valódi
 *    Google-hívás nincs); a state nélküli (a telepítéskor folyamatban lévő, régi) visszahívás érthető hibaoldalra visz.
 * A sikeres Google-belépést (csonkolt Google-válasszal) és a futás közbeni listáról levételt a
 * tests/admin-allowlist-db.integration.ts és a tests/admin-authz-matrix-db.integration.ts méri valódi HTTP-n.
 * Megjegyzés: éles módban a munkamenet-süti Secure, ezért a belépés API-kéréssel (x-forwarded-proto: https) történik, és a
 * kapott munkamenet-süti kerül a böngészőbe — az oldalbetöltés és minden admin-döntés valódi.
 */
import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import pg from "pg";

const E2E_ALLOWLISTED_ADMIN = "e2e-allowlisted-admin@websuli.example";
const UNLISTED_ADMIN = "e2e-unlisted-admin@websuli.example";
const PLAIN_USER = "e2e-plain-user@websuli.example";
const PASSWORD = `Jm7c-${randomBytes(9).toString("hex")}`;
const PORT = process.env.WEBSULI_E2E_PORT ?? "5000";
const ORIGIN = `https://localhost:${PORT}`;
const SHOT_DIR = process.env.JM7C_SHOT_DIR;

let pool: pg.Pool;

test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const [id, email, isAdmin] of [["jm7c-e2e-listed", E2E_ALLOWLISTED_ADMIN, true], ["jm7c-e2e-unlisted", UNLISTED_ADMIN, true], ["jm7c-e2e-plain", PLAIN_USER, false]] as const) {
    await pool.query(
      `INSERT INTO users (id, email, password, is_admin, is_banned) VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (id) DO UPDATE SET password = EXCLUDED.password, is_admin = EXCLUDED.is_admin, is_banned = false`,
      [id, email, hash, isAdmin],
    );
  }
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE id IN ('jm7c-e2e-listed', 'jm7c-e2e-unlisted', 'jm7c-e2e-plain')`);
  await pool.end();
});

/** Valódi /api/login (a proxy mögötti https-t utánozva), a munkamenet-süti átadása a böngészőnek. */
async function loginInto(request: APIRequestContext, context: BrowserContext, email: string): Promise<{ isAdmin: boolean }> {
  const res = await request.post("/api/login", {
    headers: { origin: ORIGIN, "x-forwarded-proto": "https", "content-type": "text/plain" },
    data: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status(), `belépés: ${email}`).toBe(200);
  const cookie = res.headersArray().find((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("connect.sid="));
  expect(cookie, "munkamenet-süti").toBeTruthy();
  const value = cookie!.value.split(";")[0]!.slice("connect.sid=".length);
  await context.addCookies([{ name: "connect.sid", value, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return (await res.json()) as { isAdmin: boolean };
}

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/${name}.png` : test.info().outputPath(`${name}.png`), fullPage: true });
}

test("listás admin (jelszóval): az /admin betölt, a felület admin-adatot kap", async ({ page, request, context }) => {
  const body = await loginInto(request, context, E2E_ALLOWLISTED_ADMIN);
  expect(body.isAdmin).toBe(true);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-panel")).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe("/admin");
  const me = await page.evaluate(async () => (await fetch("/api/auth/user", { credentials: "include" })).json());
  expect(me.isAdmin).toBe(true);
  await shot(page, "admin-listas");
});

for (const [label, email] of [["is_admin, de listán kívüli (= listáról levett) fiók", UNLISTED_ADMIN], ["nem admin felhasználó", PLAIN_USER]] as const) {
  test(`${label}: belép, de az /admin a főoldalra irányít, admin-adatot nem kap`, async ({ page, request, context }) => {
    const body = await loginInto(request, context, email);
    expect(body.isAdmin).toBe(false);
    const adminCalls: number[] = [];
    page.on("response", (r) => { if (/\/api\/admin\//.test(r.url())) adminCalls.push(r.status()); });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.getByTestId("admin-panel")).toHaveCount(0);
    expect(adminCalls.filter((s) => s < 400), "admin-végpont nem adhat adatot").toEqual([]);
    const direct = await page.evaluate(async () => (await fetch("/api/admin/users", { credentials: "include" })).status);
    expect(direct).toBe(403);
  });
}

test("Google-belépés: az indítás `a.` state-et + PKCE-t küld; a state nélküli régi visszahívás érthető hibaoldalra visz", async ({ page, context }) => {
  let googleUrl: URL | null = null;
  // A Playwright az átirányítás célját nem route-olja, ezért a szerver /auth/google válaszát (302) magunk kérjük le
  // (átirányítás-követés nélkül), a Location-t rögzítjük, és a böngészőnek csonk oldalt adunk — a Google felé nem megy kérés.
  // Biztonsági háló: minden Google-kérés megszakítva.
  await context.route("https://accounts.google.com/**", (route) => route.abort());
  await page.route(/\/auth\/google(\?|$)/, async (route) => {
    const res = await route.fetch({ maxRedirects: 0 });
    expect(res.status()).toBe(302);
    googleUrl = new URL(res.headers()["location"] ?? "about:blank");
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>google-csonk</title><p>google-csonk</p>" });
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/login");
  await page.getByRole("button", { name: /Bejelentkezés Google fiókkal/ }).click();
  await expect(page.getByText("google-csonk")).toBeVisible({ timeout: 20_000 });
  expect(googleUrl, "a Google felé irányított").not.toBeNull();
  const g = googleUrl as unknown as URL;
  expect(g.searchParams.get("state") ?? "").toMatch(/^a\.[A-Za-z0-9_-]{32}$/);
  expect(g.searchParams.get("code_challenge_method")).toBe("S256");
  expect(g.searchParams.get("code_challenge") ?? "").not.toBe("");

  // A telepítés pillanatában folyamatban lévő belépés: a Google state nélkül tér vissza.
  await page.goto("/auth/google/callback?code=regi-belepes");
  await expect(page).toHaveURL(/\/login\?hiba=google$/);
  const alert = page.getByTestId("login-google-error");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Próbáld újra");
  await expect(page.getByRole("button", { name: /Bejelentkezés Google fiókkal/ })).toBeVisible();
  const me = await page.evaluate(async () => (await fetch("/api/auth/user", { credentials: "include" })).json());
  expect(me).toBeNull();
  for (const [w, h, name] of [[360, 640, "login-hiba-360"], [390, 844, "login-hiba-390"], [1280, 800, "login-hiba-asztali"]] as const) {
    await page.setViewportSize({ width: w, height: h });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name}: nincs vízszintes görgetés`).toBeLessThanOrEqual(1);
    const box = await alert.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= w + 1, `${name}: a hibaüzenet nem lóg ki`).toBe(true);
    await shot(page, name);
  }
});
