import { expect, test, type Page } from "@playwright/test";

// Spec: docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md — személyes üdvözlő ajánló a nyilvános listán (valós render).
test.use({ serviceWorkers: "block" });

const NOW = new Date("2026-10-19T09:00:00");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const base = { userId: null, content: "", description: "", curriculum: null };
const FILES = [
  { ...base, id: "r5-regi", title: "Régi ötödikes anyag", classroom: 5, createdAt: day(300) },
  { ...base, id: "r5-a", title: "Törtek összeadása gyakorló", classroom: 5, createdAt: day(1) },
  { ...base, id: "r5-b", title: "A Naprendszer bolygói", classroom: 5, createdAt: day(5) },
  { ...base, id: "r5-c", title: "Mondatfajták játékosan", classroom: 5, createdAt: day(9) },
  { ...base, id: "r5-d", title: "Negyedik új ötödikes", classroom: 5, createdAt: day(12) },
  { ...base, id: "r8-a", title: "Nyolcadikos újdonság", classroom: 8, createdAt: day(0) },
];

async function open(page: Page, user: unknown = null) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/user", route => route.fulfill({ json: user }));
  await page.route("**/api/html-files", route => route.fulfill({ json: FILES }));
  await page.goto("/");
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`névkérés, üdvözlés a legújabb anyagokkal, módosítás ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    const ask = page.getByTestId("welcome-ask");
    await expect(ask).toBeVisible();
    await expect(ask.getByRole("heading")).toHaveText(/Szia! Hogy hívnak\?/);
    // a lista a kérdés mellett is használható (nem felugró ablak)
    await expect(page.getByTestId("link-file-r5-a")).toBeVisible();
    await expect(page.getByTestId("welcome-save")).toBeDisabled();

    await page.getByTestId("welcome-name").fill("  Bence ");
    await page.getByTestId("welcome-grade").selectOption("5");
    await page.getByTestId("welcome-save").click();
    const greet = page.getByTestId("welcome-greet");
    await expect(greet.getByRole("heading", { level: 2 })).toHaveText("Szia, Bence!");
    await expect(page.getByTestId("welcome-motivation")).not.toBeEmpty();
    const picks = greet.locator('[data-testid^="welcome-pick-"]');
    await expect(picks).toHaveCount(3);
    expect(await picks.evaluateAll(els => els.map(e => e.getAttribute("data-testid")))).toEqual(["welcome-pick-r5-a", "welcome-pick-r5-b", "welcome-pick-r5-c"]);
    await expect(picks.first()).toContainText("Új");

    // újratöltés után is üdvözöl
    await page.reload();
    await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 2 })).toHaveText("Szia, Bence!");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "nincs vízszintes túlcsordulás").toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`welcome-${viewport.width}.png`) });

    // módosítás
    await page.getByTestId("welcome-edit").click();
    await expect(page.getByTestId("welcome-name")).toHaveValue("Bence");
    await page.getByTestId("welcome-name").fill("Panni");
    await page.getByTestId("welcome-save").click();
    await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 2 })).toHaveText("Szia, Panni!");

    // a kiválasztott anyag megnyílik
    await page.getByTestId("welcome-pick-r5-a").click();
    await expect(page).toHaveURL(/r5-a/);
  });
}

test("„Most nem” után a munkamenetben nem kérdez újra", async ({ page }) => {
  await open(page);
  await page.getByTestId("welcome-dismiss").click();
  await expect(page.getByTestId("welcome-ask")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("link-file-r5-a")).toBeVisible();
  await expect(page.getByTestId("welcome-ask")).toHaveCount(0);
});

test("bejelentkezett tanuló: a fiók keresztnevével köszön, nem kérdez", async ({ page }) => {
  await open(page, { id: "u1", firstName: "Anna", lastName: "Kiss", isAdmin: false });
  await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 2 })).toHaveText("Szia, Anna!");
  await expect(page.getByTestId("welcome-ask")).toHaveCount(0);
  // évfolyam nélkül a legújabb az összes évfolyamból
  await expect(page.getByTestId("welcome-greet").locator('[data-testid^="welcome-pick-"]').first()).toHaveAttribute("data-testid", "welcome-pick-r8-a");
});

test("az üres évfolyamok jelvényei nem jelennek meg", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("button-filter-classroom-5")).toBeVisible();
  await expect(page.getByTestId("button-filter-classroom-8")).toBeVisible();
  await expect(page.getByTestId("button-filter-classroom-3")).toHaveCount(0);
  await expect(page.getByText("(0)")).toHaveCount(0);
});
