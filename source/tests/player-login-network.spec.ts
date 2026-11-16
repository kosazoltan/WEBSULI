/**
 * JM7a — review #445 (Codex P2): a /belepes felület hálózati hibánál nem ragadhat be. Megszakított kérés (route.abort())
 * mindhárom úton — kódkérés, kódbeváltás, linkes beváltás → magyar hibaüzenet, a gomb újra aktív, az újrapróba működik.
 * A szerver PLAYER_ACCOUNTS flagje az e2e-ben KI marad: a /api/player/* válaszokat a böngészőben helyettesítjük
 * (a szerveroldali utat a tests/player-auth-db.integration.ts méri). Mobil nézet: 360×640.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN = "A".repeat(43);
const OK_PLAYER = { ok: true, player: { id: "p-1", nickname: null, needsProfile: true } };

async function enablePlayerUi(page: Page) {
  await page.route("**/api/player/status", (r) => r.fulfill({ json: { enabled: true } }));
  await page.route("**/api/player/me", (r) => r.fulfill({ json: null }));
}

// A service worker által vezérelt oldal kéréseit a page.route nem látja megbízhatóan — itt nem a SW-t mérjük.
test.use({ viewport: { width: 360, height: 640 }, serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as unknown as { __errors: string[] }).__errors = errors;
  await enablePlayerUi(page);
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors, "nincs kezeletlen oldalhiba").toEqual([]);
});

test("kódkérés: megszakadt kérés → hibaüzenet, a gomb újra aktív, újrapróbával tovább", async ({ page }) => {
  await page.route("**/api/player/auth/start", (r) => r.abort("internetdisconnected"));
  await page.goto("/belepes");
  await page.getByTestId("input-player-email").fill("diak@pelda.hu");
  await page.getByTestId("button-player-request-code").click();
  await expect(page.getByTestId("player-login-error")).toContainText("internet");
  await expect(page.getByTestId("button-player-request-code")).toBeEnabled();
  await page.unroute("**/api/player/auth/start");
  await page.route("**/api/player/auth/start", (r) => r.fulfill({ status: 202, json: { ok: true } }));
  await page.getByTestId("button-player-request-code").click();
  const code = page.getByTestId("input-player-code");
  await expect(code).toBeVisible();
  // Mobil: numerikus billentyűzet és egyszeri kód automatikus kitöltése.
  await expect(code).toHaveAttribute("inputmode", "numeric");
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
});

test("kódbeváltás: megszakadt kérés → hibaüzenet, a gomb újra aktív, újrapróbával belép", async ({ page }) => {
  await page.route("**/api/player/auth/start", (r) => r.fulfill({ status: 202, json: { ok: true } }));
  await page.route("**/api/player/auth/verify", (r) => r.abort("internetdisconnected"));
  await page.goto("/belepes");
  await page.getByTestId("input-player-email").fill("diak@pelda.hu");
  await page.getByTestId("button-player-request-code").click();
  await page.getByTestId("input-player-code").fill("12345678");
  await page.getByTestId("button-player-verify").click();
  await expect(page.getByTestId("player-login-error")).toContainText("internet");
  await expect(page.getByTestId("button-player-verify")).toBeEnabled();
  await page.unroute("**/api/player/auth/verify");
  await page.route("**/api/player/auth/verify", (r) => r.fulfill({ json: OK_PLAYER }));
  await page.getByTestId("button-player-verify").click();
  await expect(page.getByTestId("player-login-done")).toBeVisible();
});

const LINK_INFO = { ok: true, maskedEmail: "d***@p***.hu", current: "none", accountSession: false };

test("linkes út: megszakadt ellenőrzés / beváltás → hibaállapot újrapróba-gombbal (nem ragad „folyamatban”), a token nincs a címsorban", async ({ page }) => {
  await page.route("**/api/player/auth/link-info", (r) => r.abort("internetdisconnected"));
  await page.route("**/api/player/auth/verify", (r) => r.abort("internetdisconnected"));
  await page.goto(`/belepes/link#t=${TOKEN}`);
  await expect(page.getByTestId("player-login-link-error")).toContainText("internet");
  expect(page.url()).not.toContain(TOKEN);
  await page.unroute("**/api/player/auth/link-info");
  await page.route("**/api/player/auth/link-info", (r) => r.fulfill({ json: LINK_INFO }));
  await page.getByTestId("button-player-link-retry").click();
  await page.getByTestId("button-player-link-confirm").click();
  await expect(page.getByTestId("player-login-link-error")).toContainText("internet");
  await page.unroute("**/api/player/auth/verify");
  let body = "";
  await page.route("**/api/player/auth/verify", (r) => { body = r.request().postData() ?? ""; return r.fulfill({ json: OK_PLAYER }); });
  await page.getByTestId("button-player-link-retry").click();
  await expect(page.getByTestId("player-login-done")).toBeVisible();
  expect(JSON.parse(body)).toEqual({ kind: "link", linkToken: TOKEN });
});

test("review #445 (K3): a link megnyitása NEM léptet be — megerősítő képernyő, beváltás csak gombnyomásra", async ({ page }) => {
  const verifies: string[] = [];
  await page.route("**/api/player/auth/link-info", (r) => r.fulfill({ json: LINK_INFO }));
  await page.route("**/api/player/auth/verify", (r) => { verifies.push(r.request().postData() ?? ""); return r.fulfill({ json: OK_PLAYER }); });
  await page.goto(`/belepes/link#t=${TOKEN}`);
  await expect(page.getByTestId("player-login-link-account")).toHaveText("d***@p***.hu");
  await page.waitForTimeout(2000);
  expect(verifies, "gombnyomás előtt nincs beváltás").toEqual([]);
  await page.getByTestId("button-player-link-confirm").click();
  await expect(page.getByTestId("player-login-done")).toBeVisible();
  expect(verifies.length).toBe(1);
});

test("review #445 (K3): élő admin / felnőtt munkamenet mellett nincs belépés-gomb, csak figyelmeztetés", async ({ page }) => {
  const verifies: string[] = [];
  await page.route("**/api/player/auth/link-info", (r) => r.fulfill({ json: { ...LINK_INFO, accountSession: true } }));
  await page.route("**/api/player/auth/verify", (r) => { verifies.push("x"); return r.fulfill({ json: OK_PLAYER }); });
  await page.goto(`/belepes/link#t=${TOKEN}`);
  await expect(page.getByTestId("player-login-account-session")).toBeVisible();
  await expect(page.getByTestId("button-player-link-confirm")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(verifies).toEqual([]);
});

test("review #445 (K3): ha egy MÁSIK játékfiókkal van belépve, külön figyelmeztet a csere előtt", async ({ page }) => {
  await page.route("**/api/player/auth/link-info", (r) => r.fulfill({ json: { ...LINK_INFO, current: "other" } }));
  await page.goto(`/belepes/link#t=${TOKEN}`);
  await expect(page.getByTestId("player-login-link-switch")).toBeVisible();
  await expect(page.getByTestId("button-player-link-confirm")).toBeVisible();
});

test("elnavigálás függő kérés közben: nincs oldalhiba (lecsatolás utáni állapotírás nincs)", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/player/auth/start", async (r) => { await held; await r.abort("internetdisconnected").catch(() => undefined); });
  await page.goto("/belepes");
  await page.getByTestId("input-player-email").fill("diak@pelda.hu");
  await page.getByTestId("button-player-request-code").click();
  await page.evaluate(() => { window.history.pushState(null, "", "/games"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await expect(page.getByTestId("page-player-login")).toHaveCount(0);
  release();
  await page.waitForTimeout(300);
});
