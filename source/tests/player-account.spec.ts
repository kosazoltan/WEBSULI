/**
 * JM7b — a „kis fiók” (/fiok, /profile) és az admin „Játékosok” fül a böngészőben, mobil nézetben (360×640, 390×844).
 * A szerver PLAYER_ACCOUNTS flagje az e2e-ben KI marad: a /api/player/* és az admin-végpontok válaszait a böngészőben
 * helyettesítjük (a szerveroldali utat a tests/player-account-db.integration.ts méri valódi adatbázison).
 * Mérjük: elrendezés (nincs vízszintes görgetés, nincs levágott fő elem), a becenév SZÖVEGKÉNT jelenik meg (XSS),
 * becenév-választás, avatar, tanulói összekapcsolás megerősítéssel, adatletöltés, törlés beírt szóval.
 * Képernyőképek: JM7B_SHOT_DIR (ha meg van adva), különben a teszt kimeneti mappája.
 */
import { expect, test, type Page } from "@playwright/test";

const XSS_NICK = `<img src=x onerror="window.__xss=1">`;
const ACCOUNT = {
  id: "p-1", nickname: "Villám Róka", avatar: "star-sun", needsProfile: false, maskedEmail: "d***@p***.hu",
  googleLinked: true, learnerLinked: false, createdAt: "2026-11-16T10:00:00.000Z",
};

type Calls = { profile: unknown[]; link: { body: unknown; token: string | null }[]; exportN: number; del: unknown[] };

async function mockPlayer(page: Page, account: Record<string, unknown>, opts: { deleteStatus?: number; deleteCode?: string } = {}): Promise<Calls> {
  const calls: Calls = { profile: [], link: [], exportN: 0, del: [] };
  let current = { ...account };
  await page.route("**/api/player/status", (r) => r.fulfill({ json: { enabled: true } }));
  await page.route("**/api/player/me", (r) => r.fulfill({ json: { id: current.id, nickname: current.nickname, needsProfile: current.nickname === null } }));
  await page.route("**/api/player/account", (r) => r.fulfill({ json: current }));
  await page.route("**/api/player/nickname-suggestions", (r) => r.fulfill({ json: { suggestions: ["Fürge Vidra", "Okos Bagoly", "Bátor Sólyom"] } }));
  await page.route("**/api/player/profile", async (r) => {
    const body = r.request().postDataJSON() as { nickname?: string; avatar?: string };
    calls.profile.push(body);
    current = { ...current, ...(body.nickname ? { nickname: body.nickname, needsProfile: false } : {}), ...(body.avatar ? { avatar: body.avatar } : {}) };
    await r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/player/link-learner", async (r) => {
    calls.link.push({ body: r.request().postDataJSON(), token: r.request().headers()["x-learner-token"] ?? null });
    current = { ...current, learnerLinked: true };
    await r.fulfill({ json: { ok: true, learnerLinked: true } });
  });
  await page.route("**/api/player/export", async (r) => {
    calls.exportN++;
    await r.fulfill({ json: { format: "websuli-player-export-v1", account: { email: "diak@pelda.hu", nickname: current.nickname }, gameRuns: [] } });
  });
  await page.route("**/api/player/account/delete", async (r) => {
    calls.del.push(r.request().postDataJSON());
    await r.fulfill({ status: opts.deleteStatus ?? 200, json: opts.deleteStatus ? { ok: false, code: opts.deleteCode } : { ok: true, deleted: { account: 1, codes: 1, sessions: 1 } } });
  });
  return calls;
}

async function shot(page: Page, name: string) {
  const dir = process.env.JM7B_SHOT_DIR;
  await page.screenshot({ path: dir ? `${dir}/${name}.png` : test.info().outputPath(`${name}.png`), fullPage: true });
}

async function assertLayout(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "nincs vízszintes görgetés").toBeLessThanOrEqual(1);
  for (const id of ["player-account-hero", "player-stats", "player-records", "player-account-actions"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    const width = page.viewportSize()!.width;
    expect(box!.x, `${id} bal széle`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${id} jobb széle`).toBeLessThanOrEqual(width + 1);
  }
}

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { errors.push(`váratlan párbeszéd: ${d.message()}`); void d.dismiss(); });
  (page as unknown as { __errors: string[] }).__errors = errors;
  // Helyi haladás, hogy a rekordok / jelvények ne legyenek üresek.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("websuli.lifetime-stats", JSON.stringify({ totalXp: 1340, totalGames: 23, totalCorrectAnswers: 187, totalWrongAnswers: 30, bestStreak: 14, blocksMined: 412, enemiesKilled: 96, brainRotsCaught: 11, diamondsMined: 7, bossesDefeated: 2, perfectQuizzes: 3, dailyStreakDays: 2, totalDailyDays: 5 }));
      localStorage.setItem("websuli.achievements", JSON.stringify(["first_play", "xp_100", "xp_1000", "games_5"]));
      localStorage.setItem("websuli-tsunami-en-xp", "520");
      localStorage.setItem("websuli-tsunami-en-best-streak", "9");
    } catch { /* privát mód */ }
  });
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors, "nincs oldalhiba / váratlan párbeszéd").toEqual([]);
});

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
  test(`fiókoldal ${vp.width}×${vp.height}: elrendezés, adatok, képernyőkép`, async ({ page }) => {
    await page.setViewportSize(vp);
    await mockPlayer(page, ACCOUNT);
    await page.goto("/fiok");
    await expect(page.getByTestId("player-nickname")).toHaveText("Villám Róka");
    await expect(page.getByTestId("player-level")).toHaveText("4. szint");
    await expect(page.getByTestId("player-masked-email")).toHaveText("d***@p***.hu");
    await expect(page.getByTestId("player-records")).toContainText("Szökőár szökés");
    await expect(page.getByTestId("player-records")).toContainText("XP: 520");
    await assertLayout(page);
    await shot(page, `fiok-${vp.width}x${vp.height}`);
  });
}

test("XSS: a becenév szövegként jelenik meg (nincs injektált elem, nem fut szkript)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await mockPlayer(page, { ...ACCOUNT, nickname: XSS_NICK });
  await page.goto("/fiok");
  await expect(page.getByTestId("player-nickname")).toHaveText(XSS_NICK);
  expect(await page.locator('[data-testid="player-nickname"] img').count()).toBe(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test("első belépés: becenév-választás ajánlással + avatar, 360×640", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const calls = await mockPlayer(page, { ...ACCOUNT, nickname: null, avatar: null, needsProfile: true });
  await page.goto("/fiok");
  await expect(page.getByTestId("player-profile-editor")).toBeVisible();
  await shot(page, "fiok-elso-belepes-360x640");
  // Helyi szűrő: tiltott név → magyar hibaüzenet, mentés nélkül.
  await page.getByTestId("input-player-nickname").fill("Admin");
  await expect(page.getByTestId("player-nickname-errors")).toContainText("hivatalos");
  await page.getByTestId("button-save-profile").click();
  expect(calls.profile).toHaveLength(0);
  await page.getByTestId("nickname-suggestion").first().click();
  await page.getByTestId("avatar-ghost-lime").click();
  await page.getByTestId("button-save-profile").click();
  await expect(page.getByTestId("player-account-notice")).toBeVisible();
  expect(calls.profile).toEqual([{ nickname: "Fürge Vidra", avatar: "ghost-lime" }]);
  await expect(page.getByTestId("player-nickname")).toHaveText("Fürge Vidra");
  await expect(page.locator('[data-testid="player-account-hero"] svg[data-avatar="ghost-lime"]')).toBeVisible();
});

test("tanulói profil összekapcsolása: csak megerősítés után, a token fejlécben megy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const token = `abcdefgh-1234.1.${"A".repeat(22)}`;
  await page.addInitScript((t) => { localStorage.setItem("websuli.learnerToken", t); }, token);
  // A párosított eszköz tanulói profilja (a valódi szerver a hamis tesztjelet 401-gyel elutasítaná és törölné).
  await page.route("**/api/learner/me", (r) => r.fulfill({ json: { firstName: "Anna", grade: 5 } }));
  const calls = await mockPlayer(page, ACCOUNT);
  await page.goto("/fiok");
  await page.getByTestId("button-link-learner").click();
  await expect(page.getByTestId("button-link-learner-confirm")).toBeVisible();
  expect(calls.link, "a megerősítés előtt nincs kérés").toHaveLength(0);
  await page.waitForTimeout(300);
  await shot(page, "fiok-tanulo-megerosites-390x844");
  await page.getByTestId("button-link-learner-confirm").click();
  await expect(page.getByTestId("player-learner")).toContainText("Összekapcsolva");
  expect(calls.link).toEqual([{ body: { confirm: true }, token }]);
});

test("adatletöltés és fióktörlés: a törlés csak a beírt szóval indul, utána a játékokra visz", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const calls = await mockPlayer(page, ACCOUNT);
  await page.goto("/fiok");
  const download = page.waitForEvent("download");
  await page.getByTestId("button-export-data").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("websuli-fiokom.json");
  expect(calls.exportN).toBe(1);

  await page.getByTestId("button-delete-account").click();
  await expect(page.getByTestId("button-delete-confirm")).toBeDisabled();
  await page.getByTestId("input-delete-confirm").fill("igen");
  await expect(page.getByTestId("button-delete-confirm")).toBeDisabled();
  await page.getByTestId("input-delete-confirm").fill("törlöm");
  await expect(page.getByTestId("button-delete-confirm")).toBeEnabled();
  await page.waitForTimeout(300); // a párbeszéd beúszó animációja (a képernyőképhez)
  await shot(page, "fiok-torles-360x640");
  await page.getByTestId("button-delete-confirm").click();
  await expect(page).toHaveURL(/\/games$/);
  expect(calls.del).toEqual([{ confirm: "TÖRLÖM" }]);
});

test("fióktörlés régi belépéssel: újra belépést kér, nem töröl csendben", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await mockPlayer(page, ACCOUNT, { deleteStatus: 401, deleteCode: "REAUTH_REQUIRED" });
  await page.goto("/fiok");
  await page.getByTestId("button-delete-account").click();
  await page.getByTestId("input-delete-confirm").fill("TÖRLÖM");
  await page.getByTestId("button-delete-confirm").click();
  await expect(page.getByTestId("player-delete-error")).toContainText("lépj be újra");
  await expect(page.getByTestId("button-reauth")).toBeVisible();
});

test("vendég a /profile-on a régi, helyi Profil oldalt látja (kikapcsolt flag: a valódi szerver)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/profile");
  await expect(page.getByText("Profil & Jelvények")).toBeVisible();
});

test("belépő oldal: Google-gomb a játékos-útra, és a visszatérési hibakód magyarul", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.route("**/api/player/status", (r) => r.fulfill({ json: { enabled: true } }));
  await page.route("**/api/player/me", (r) => r.fulfill({ json: null }));
  await page.goto("/belepes?hiba=fiok-munkamenet");
  await expect(page.getByTestId("player-login-error")).toContainText("felnőtt vagy admin");
  await expect(page).toHaveURL(/\/belepes$/);
  await expect(page.getByTestId("button-player-google")).toHaveAttribute("href", "/auth/player/google?returnTo=/fiok");
  await shot(page, "belepes-google-360x640");
});

test("admin „Játékosok” fül: maszkolt cím, becenév szövegként, tiltás gomb", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/user", (r) => r.fulfill({ json: { id: "a-1", email: "admin@pelda.hu", isAdmin: true, firstName: "Admin", lastName: "" } }));
  let banned = false;
  await page.route("**/api/admin/game-accounts**", async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("/ban")) { banned = true; return r.fulfill({ json: { ok: true, banned: true } }); }
    return r.fulfill({ json: { players: [
      { id: "p-1", nickname: XSS_NICK, avatar: "hex-rose", maskedEmail: "d***@p***.hu", createdAt: "2026-11-16T10:00:00Z", lastSeenAt: null, banned, bannedAt: null, googleLinked: true, learnerLinked: false },
      { id: "p-2", nickname: "Okos Bagoly", avatar: null, maskedEmail: "o***@g***.com", createdAt: "2026-11-15T09:00:00Z", lastSeenAt: "2026-11-16T08:00:00Z", banned: false, bannedAt: null, googleLinked: false, learnerLinked: true },
    ] } });
  });
  await page.goto("/admin?tab=players");
  await expect(page.getByTestId("players-list")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("player-row-p-1")).toContainText(XSS_NICK);
  expect(await page.locator('[data-testid="player-row-p-1"] img').count()).toBe(0);
  await expect(page.getByTestId("player-row-p-2")).toContainText("o***@g***.com");
  await shot(page, "admin-jatekosok-390x844");
  await page.getByTestId("button-player-ban-p-1").click();
  await expect(page.getByTestId("player-row-p-1")).toContainText("Tiltva");
});
