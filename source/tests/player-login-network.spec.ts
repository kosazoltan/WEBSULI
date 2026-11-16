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
  await page.getByTestId("input-player-code").fill("123456");
  await page.getByTestId("button-player-verify").click();
  await expect(page.getByTestId("player-login-error")).toContainText("internet");
  await expect(page.getByTestId("button-player-verify")).toBeEnabled();
  await page.unroute("**/api/player/auth/verify");
  await page.route("**/api/player/auth/verify", (r) => r.fulfill({ json: OK_PLAYER }));
  await page.getByTestId("button-player-verify").click();
  await expect(page.getByTestId("player-login-done")).toBeVisible();
});

test("linkes beváltás: megszakadt kérés → hibaállapot újrapróba-gombbal (nem ragad „folyamatban”), a token nincs a címsorban", async ({ page }) => {
  await page.route("**/api/player/auth/verify", (r) => r.abort("internetdisconnected"));
  await page.goto(`/belepes/link#t=${TOKEN}`);
  await expect(page.getByTestId("player-login-link-error")).toContainText("internet");
  expect(page.url()).not.toContain(TOKEN);
  await page.unroute("**/api/player/auth/verify");
  let body = "";
  await page.route("**/api/player/auth/verify", (r) => { body = r.request().postData() ?? ""; return r.fulfill({ json: OK_PLAYER }); });
  await page.getByTestId("button-player-link-retry").click();
  await expect(page.getByTestId("player-login-done")).toBeVisible();
  expect(JSON.parse(body)).toEqual({ kind: "link", linkToken: TOKEN });
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
