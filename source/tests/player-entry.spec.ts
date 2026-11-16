/**
 * J8-belépő — a Játékok oldal „Belépés” / „Fiókom” belépője a böngészőben (végrehajtás „J8-belépő”).
 * A szerver PLAYER_ACCOUNTS flagje az e2e-ben KI marad (a valódi /api/player/status `{enabled:false}`): a KI eset a valódi
 * szerverrel fut; a BE esetekben a /api/player/* válaszait a böngészőben helyettesítjük (a szerveroldali utat a
 * player-*-db integrációs tesztek mérik). Mérjük: KI → nincs belépő a DOM-ban; BE → gomb ≥ 48 px, a megfelelő oldalra visz,
 * nem fed át semmit és nem görget vízszintesen 360×640, 390×844 és 844×390 nézetben; hosszú becenév csonkolódik.
 * Képernyőképek: PLAYER_ENTRY_SHOT_DIR (ha meg van adva).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "360x640", width: 360, height: 640 },
  { name: "390x844", width: 390, height: 844 },
  { name: "844x390", width: 844, height: 390 },
] as const;

const ME = { id: "p-1", nickname: "Villám Róka", needsProfile: false };
const ACCOUNT = { ...ME, avatar: "star-sun", maskedEmail: "d***@p***.hu", googleLinked: false, learnerLinked: false, createdAt: "2026-11-16T10:00:00.000Z" };

type Mode = "signed-out" | "signed-in" | "banned";

async function mockPlayer(page: Page, mode: Mode, nickname = ME.nickname) {
  await page.route("**/api/player/status", (r) => r.fulfill({ json: { enabled: true } }));
  await page.route("**/api/player/me", (r) => {
    if (mode === "signed-out") return r.fulfill({ status: 401, json: { ok: false } });
    if (mode === "banned") return r.fulfill({ status: 403, json: { ok: false, code: "BANNED" } });
    return r.fulfill({ json: { ...ME, nickname } });
  });
  await page.route("**/api/player/account", (r) => r.fulfill({ json: { ...ACCOUNT, nickname } }));
  await page.route("**/api/player/nickname-suggestions", (r) => r.fulfill({ json: { suggestions: [] } }));
}

async function shot(page: Page, name: string) {
  const dir = process.env.PLAYER_ENTRY_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function waitForLobby(page: Page) {
  await page.goto("/games");
  await expect(page.locator(".game-card").first()).toBeVisible();
}

/** Nincs vízszintes oldalgörgetés; a belépő a nézeten belül van, a fejléc alatt és a „Mai kihívás” sáv fölött (nincs átfedés). */
async function assertEntryLayout(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "nincs vízszintes görgetés").toBeLessThanOrEqual(1);
  const vw = page.viewportSize()!.width;
  const entry = (await page.getByTestId("player-entry").boundingBox())!;
  expect(entry.x, "bal szél").toBeGreaterThanOrEqual(0);
  expect(entry.x + entry.width, "jobb szél").toBeLessThanOrEqual(vw + 1);
  const header = (await page.locator(".games-lobby-top").boundingBox())!;
  const daily = (await page.locator(".games-daily").boundingBox())!;
  expect(entry.y, "a fejléc alatt").toBeGreaterThanOrEqual(header.y + header.height - 1);
  expect(entry.y + entry.height, "a Mai kihívás fölött").toBeLessThanOrEqual(daily.y + 1);
  // Minden koppintási cél a belépőn belül ≥ 48 px.
  const small = await page.getByTestId("player-entry").locator("a, button").evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).filter((r) => r.width < 48 || r.height < 48).map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  expect(small, "koppintási cél ≥ 48 px").toEqual([]);
}

test.use({ serviceWorkers: "block", hasTouch: true });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as unknown as { __errors: string[] }).__errors = errors;
  // Admin-munkamenet nélküli látogató (a /api/auth/user a valódi szerveren is null).
  await page.route("**/api/auth/user", (r) => r.fulfill({ json: null }));
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors, "nincs oldalhiba").toEqual([]);
});

test("flag KI (valódi szerver): a Játékok oldalon nincs belépő, és nem kér /api/player/me-t", async ({ page }) => {
  const meCalls: string[] = [];
  page.on("request", (req) => { if (new URL(req.url()).pathname === "/api/player/me") meCalls.push(req.url()); });
  const status = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/player/status");
  await waitForLobby(page);
  const body = (await (await status).json()) as { enabled: boolean };
  expect(body.enabled, "az e2e szerveren a PLAYER_ACCOUNTS KI").toBe(false);
  await expect(page.getByTestId("player-entry")).toHaveCount(0);
  await expect(page.getByTestId("player-entry-loading")).toHaveCount(0);
  await expect(page.getByTestId("link-player-login")).toHaveCount(0);
  await expect(page.getByTestId("link-player-account")).toHaveCount(0);
  expect(meCalls).toEqual([]);
});

for (const size of SIZES) {
  test(`flag BE, kijelentkezve (${size.name}): „Belépés” ≥ 48 px, nem fed át, a /belepes-re visz, onnan vissza a játékokhoz`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockPlayer(page, "signed-out");
    await waitForLobby(page);
    const login = page.getByTestId("link-player-login");
    await expect(login).toBeVisible();
    await expect(login).toHaveText("Belépés");
    await expect(page.getByTestId("player-entry-hint")).toContainText("jelszó nem kell");
    await assertEntryLayout(page);
    await shot(page, `belepes-kijelentkezve-${size.name}`);
    await login.tap();
    await expect(page).toHaveURL(/\/belepes$/);
    await expect(page.getByTestId("page-player-login")).toBeVisible();
    await page.getByTestId("link-player-login-back").tap();
    await expect(page).toHaveURL(/\/games$/);
  });

  test(`flag BE, belépve (${size.name}): „Fiókom” a becenévvel és az avatarral, nem fed át, a /fiok-ra visz`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockPlayer(page, "signed-in");
    await waitForLobby(page);
    const account = page.getByTestId("link-player-account");
    await expect(account).toBeVisible();
    await expect(page.getByTestId("player-entry-nickname")).toHaveText("Villám Róka");
    await expect(account.locator("svg[data-avatar='star-sun']")).toBeVisible();
    await assertEntryLayout(page);
    await shot(page, `fiokom-belepve-${size.name}`);
    await account.tap();
    await expect(page).toHaveURL(/\/fiok$/);
    await expect(page.getByTestId("page-player-account")).toBeVisible();
  });
}

test("flag BE, belépve, nagyon hosszú becenév (360×640): csonkolva, az elrendezés nem törik", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const longNick = "Szuperhosszú-Becenév-Amely-Nem-Fér-El-Egy-Sorban-WWWWWWWWWWWW";
  await mockPlayer(page, "signed-in", longNick);
  await waitForLobby(page);
  await expect(page.getByTestId("player-entry-nickname")).toHaveText(longNick);
  const clipped = await page.getByTestId("player-entry-nickname").evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === "ellipsis");
  expect(clipped, "a hosszú becenév ellipszissel csonkolódik").toBe(true);
  await assertEntryLayout(page);
  await shot(page, "fiokom-hosszu-becenev-360x640");
});

test("flag BE, tiltott fiók: „Fiókom” a /fiok-ra visz, ott csak az adatkezelés látszik, nincs hiba", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPlayer(page, "banned");
  await waitForLobby(page);
  await expect(page.getByTestId("link-player-account")).toBeVisible();
  await expect(page.getByTestId("link-player-login")).toHaveCount(0);
  await assertEntryLayout(page);
  await shot(page, "fiokom-tiltott-390x844");
  await page.getByTestId("link-player-account").tap();
  await expect(page).toHaveURL(/\/fiok$/);
  await expect(page.getByTestId("player-banned-notice")).toBeVisible();
});

test("az első látogatás magyarázata csak egyszer látszik; a gomb ezután is ott van", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPlayer(page, "signed-out");
  await waitForLobby(page);
  await expect(page.getByTestId("player-entry-hint")).toBeVisible();
  await page.reload();
  await expect(page.locator(".game-card").first()).toBeVisible();
  await expect(page.getByTestId("link-player-login")).toBeVisible();
  await expect(page.getByTestId("player-entry-hint")).toHaveCount(0);
  await assertEntryLayout(page);
});
