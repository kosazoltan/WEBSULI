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

// Review #289
const contrast = (fg: string, bg: string) => {
  const lum = (c: string) => { const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

test("review #289: bejelentkezve a módosítás megmarad (fiókhoz kötve), fiókváltáskor nem öröklődik", async ({ page }) => {
  await open(page, { id: "u1", firstName: "Anna", lastName: "Kiss", isAdmin: false });
  await page.getByTestId("welcome-edit").click();
  await expect(page.getByTestId("welcome-name")).toHaveValue("Anna");
  await page.getByTestId("welcome-name").fill("Panni");
  await page.getByTestId("welcome-save").click();
  await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 2 })).toHaveText("Szia, Panni!");
  await page.reload();
  await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 2 })).toHaveText("Szia, Panni!");
  // másik fiók: a saját keresztneve, nem Panni
  await page.unroute("**/api/auth/user");
  await page.route("**/api/auth/user", route => route.fulfill({ json: { id: "u2", firstName: "Dóri", lastName: "Nagy", isAdmin: false } }));
  await page.reload();
  await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 2 })).toHaveText("Szia, Dóri!");
});

test("a megadott évfolyam nem törölhető (dokumentált spec-változás); a tartalékág nem ír évfolyamot; AA-kontraszt", async ({ page }) => {
  await open(page);
  await page.getByTestId("welcome-name").fill("Bence");
  const save = page.getByTestId("welcome-save");
  const { color, bg } = await save.evaluate(el => ({ color: getComputedStyle(el).color, bg: "rgb(251, 146, 60)" }));
  expect(contrast(color, bg), "„Mehet” a gradiens narancs végén").toBeGreaterThanOrEqual(4.5);
  expect(contrast(color, "rgb(234, 179, 8)"), "„Mehet” a gradiens sárga végén").toBeGreaterThanOrEqual(4.5);
  await page.getByTestId("welcome-grade").selectOption("3");
  await save.click();
  const greet = page.getByTestId("welcome-greet");
  // a 3. évfolyamon nincs anyag → mindből ajánl, és a cím nem állítja, hogy harmadikos
  await expect(greet.getByRole("heading", { level: 3 })).toHaveText("A legújabb tananyagok");
  const nameColor = await greet.getByRole("heading", { level: 2 }).locator("span").evaluate(el => getComputedStyle(el).color);
  expect(contrast(nameColor, "rgb(15, 23, 42)"), "a név állandó, olvasható színű").toBeGreaterThanOrEqual(4.5);
  await page.getByTestId("welcome-edit").click();
  await page.getByTestId("welcome-grade").selectOption("5");
  await page.getByTestId("welcome-save").click();
  await expect(greet.getByRole("heading", { level: 3 })).toHaveText("A legújabb tananyagaid (5. osztály)");
  // Tulajdonosi kérés 2026-10-18 (docs/specs/2026-10-18-evfolyam-nem-torolheto.md): tárolt évfolyamnál nincs „nincs évfolyam”.
  await page.getByTestId("welcome-edit").click();
  await expect(page.getByTestId("welcome-grade").locator('option[value=""]')).toHaveCount(0);
  await page.getByTestId("welcome-save").click();
  await page.reload();
  await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 3 })).toHaveText("A legújabb tananyagaid (5. osztály)");
  expect(await page.evaluate(() => localStorage.getItem("websuli.classroomGrade"))).toBe("5");
});

test("az üres évfolyamok jelvényei nem jelennek meg", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("button-filter-classroom-5")).toBeVisible();
  await expect(page.getByTestId("button-filter-classroom-8")).toBeVisible();
  await expect(page.getByTestId("button-filter-classroom-3")).toHaveCount(0);
  await expect(page.getByText("(0)")).toHaveCount(0);
});

// Tulajdonosi jelzés 2026-10-18 (docs/specs/2026-10-18-tanulo-evfolyam-szuro.md): egy ötödikesnek ne 4. osztályos anyag álljon elöl.
test("a lista a tanuló évfolyamára szűrve nyílik; „Mind” mindent mutat; évfolyamváltásra a lista is vált", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("websuli.classroomGrade", "5"); localStorage.setItem("websuli.learnerName", "Léna"); } catch { /* nincs tárhely */ } });
  await open(page);
  await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 2 })).toHaveText("Szia, Léna!");
  await expect(page.getByTestId("button-filter-classroom-5")).toHaveAttribute("aria-pressed", "true");
  const ids = () => page.locator('[data-testid^="link-file-"]').evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.replace("link-file-", "")));
  expect((await ids()).every(id => id.startsWith("r5-")), "csak 5. osztályos anyag").toBe(true);
  await page.getByTestId("button-filter-all").click();
  await expect(page.getByTestId("link-file-r8-a")).toBeVisible();
  await page.getByTestId("welcome-edit").click();
  await page.getByTestId("welcome-grade").selectOption("8");
  await page.getByTestId("welcome-save").click();
  await expect(page.getByTestId("button-filter-classroom-8")).toHaveAttribute("aria-pressed", "true");
  expect(await ids()).toEqual(["r8-a"]);
  // Review #291: anyag nélküli évfolyamra váltva „Mind” (nem ragad a 8. osztályon). Az évfolyam törlése nem lehetséges
  // (docs/specs/2026-10-18-evfolyam-nem-torolheto.md).
  await page.getByTestId("welcome-edit").click();
  await expect(page.getByTestId("welcome-grade").locator('option[value=""]')).toHaveCount(0);
  await page.getByTestId("welcome-grade").selectOption("3");
  await page.getByTestId("welcome-save").click();
  await expect(page.getByTestId("button-filter-all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("link-file-r5-a")).toBeVisible();
});

test("review #293: tárolt évfolyammal, de név nélkül a választó a tárolt évfolyamot mutatja, és az marad meg", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("websuli.classroomGrade", "5"); } catch { /* nincs tárhely */ } });
  await open(page);
  await expect(page.getByTestId("welcome-ask")).toBeVisible();
  await expect(page.getByTestId("welcome-grade")).toHaveValue("5");
  await expect(page.getByTestId("welcome-grade").locator('option[value=""]')).toHaveCount(0);
  await page.getByTestId("welcome-name").fill("Léna");
  await page.getByTestId("welcome-save").click();
  await expect(page.getByTestId("welcome-greet").getByRole("heading", { level: 3 })).toHaveText("A legújabb tananyagaid (5. osztály)");
  expect(await page.evaluate(() => localStorage.getItem("websuli.classroomGrade"))).toBe("5");
});
