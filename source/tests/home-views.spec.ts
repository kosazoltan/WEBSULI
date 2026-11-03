import { expect, test, type Page } from "@playwright/test";

// Nyilvános főoldal: „Legfrissebb” és „Tantárgyanként” nézet, külön (VAGY) és együtt (ÉS) — docs/specs/2026-11-03-fooldal-nezetek.md.
test.use({ serviceWorkers: "block" });

const NOW = new Date("2026-10-19T09:00:00");
const base = { userId: null, content: "", description: "" };
const file = (id: string, classroom: number, createdAt: string, subject: string | null | undefined, pos: number | null) => ({
  ...base, id, title: `Anyag ${id}`, classroom, createdAt, subject,
  curriculum: pos === null ? null : { pos, label: `Tanmenet ${id}` },
});
// 5. évfolyam: 10 anyag (több mint a 8-as sáv), vegyes tantárgy; egy régi szerver szerinti (subject nélküli) anyag.
const FILES = [
  file("m1", 5, "2026-10-01T10:00:00Z", "matematika", 0.19),
  file("m2", 5, "2026-10-12T10:00:00Z", "matematika", 0.5),
  file("m3", 5, "2026-09-01T10:00:00Z", "matematika", 0.05),
  file("t1", 5, "2026-10-15T10:00:00Z", "tortenelem", 0.2),
  file("t2", 5, "2026-08-20T10:00:00Z", "tortenelem", 0.7),
  file("a1", 5, "2026-10-18T10:00:00Z", "angol", null),
  file("e1", 5, "2026-10-17T10:00:00Z", "enek-zene", 0.3),
  file("x1", 5, "2026-10-16T10:00:00Z", null, null),
  file("x2", 5, "2026-07-01T10:00:00Z", undefined, null),
  file("n1", 5, "2026-10-10T10:00:00Z", "magyar-nyelvtan", 0.4),
  file("h1", 8, "2026-10-19T08:00:00Z", "fizika", 0.2),
];
const in5 = FILES.filter((f) => f.classroom === 5);
const byNewest = (list: typeof FILES) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((f) => f.id);

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/user", (route) => route.fulfill({ json: null }));
  await page.route("**/api/html-files", (route) => route.fulfill({ json: FILES }));
  await page.goto("/");
  await page.getByTestId("button-filter-classroom-5").click();
}
const ids = (page: Page, scope: string) =>
  page.locator(`${scope} [data-testid^="link-file-"]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("link-file-", "")));
async function noOverlapOrScroll(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label}: vízszintes görgetés`).toBeLessThanOrEqual(1);
  for (const id of ["home-view-newest", "home-view-by-subject"]) {
    const el = page.getByTestId(id);
    await el.scrollIntoViewIfNeeded();
    const covered = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && (node === hit || node.contains(hit)) ? "" : hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "semmi";
    });
    expect(covered, `${label}: ${id} takarva`).toBe("");
    expect((await el.boundingBox())!.height, `${label}: ${id} érintési cél`).toBeGreaterThanOrEqual(page.viewportSize()!.width < 640 ? 44 : 30);
  }
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`nézetek egyenként és együtt, megmaradó választás ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    const newest = page.getByTestId("home-view-newest");
    const bySubject = page.getByTestId("home-view-by-subject");
    await expect(newest).toHaveAttribute("aria-pressed", "false");
    await expect(bySubject).toHaveAttribute("aria-pressed", "false");

    // Alapnézet: a mai rács, szakaszok nélkül.
    await expect(page.getByTestId("list-files")).toBeVisible();
    await expect(page.getByTestId("home-subject-section")).toHaveCount(0);
    expect((await ids(page, '[data-testid="list-files"]')).length).toBe(in5.length);
    await noOverlapOrScroll(page, "alap");

    // Csak „Legfrissebb” (VAGY): az évfolyam minden anyaga, a legújabb elöl.
    await newest.click();
    await expect(newest).toHaveAttribute("aria-pressed", "true");
    expect(await ids(page, '[data-testid="list-files"]')).toEqual(byNewest(in5));
    await expect(page.getByTestId("home-newest-strip")).toHaveCount(0);
    await noOverlapOrScroll(page, "legfrissebb");

    // Mindkettő (ÉS): felül a 8 legújabb, alatta tantárgyi szakaszok, belül legújabb elöl.
    await bySubject.click();
    expect(await ids(page, '[data-testid="home-newest-strip"]')).toEqual(byNewest(in5).slice(0, 8));
    const sections = page.getByTestId("home-subject-section");
    expect(await sections.evaluateAll((els) => els.map((e) => e.getAttribute("data-subject")))).toEqual(
      ["Angol", "Ének-zene", "Magyar nyelv", "Matematika", "Történelem", "Egyéb"],
    );
    expect(await ids(page, '[data-subject="Matematika"]')).toEqual(["m2", "m1", "m3"]);
    expect(await ids(page, '[data-subject="Egyéb"]')).toEqual(["x1", "x2"]);
    await expect(page.locator('[data-subject="Matematika"] [data-testid="home-subject-count"]')).toHaveText("3");
    await noOverlapOrScroll(page, "mindkettő");
    // Rámutatva is olvasható: az outline változat hover:text-orange-800-a nem kerülhet a narancs háttérre.
    for (const button of [newest, bySubject]) {
      await button.hover();
      expect(await button.evaluate((el) => getComputedStyle(el).color), "rámutatott gomb szövegszíne").toBe("rgb(255, 255, 255)");
    }
    await page.screenshot({ path: `tests/screenshots/home-views-both-${viewport.width}.png`, fullPage: true });

    // Csak „Tantárgyanként” (VAGY): sáv nélkül, szakaszon belül a tanmenet szerinti sorrend (a mai téma elöl).
    await newest.click();
    await expect(page.getByTestId("home-newest-strip")).toHaveCount(0);
    // curriculumSort (ma ≈ 0,18; a múlt ×1,5): m1 0,19 → 0,01; m3 0,05 → 0,195; m2 0,5 → 0,32.
    expect(await ids(page, '[data-subject="Matematika"]')).toEqual(["m1", "m3", "m2"]);
    await expect(page.getByTestId("home-subject-jumps")).toBeVisible();
    await noOverlapOrScroll(page, "tantárgyanként");
    await page.screenshot({ path: `tests/screenshots/home-views-subject-${viewport.width}.png`, fullPage: true });
    // A kártyákon content-visibility: auto van (review #297) — a teljes oldalas képen a képernyőn kívüliek helyőrzők; a képernyőre
    // görgetett szakasz kártyái valódi tartalommal jelennek meg.
    const math = page.locator('[data-subject="Matematika"]');
    await math.scrollIntoViewIfNeeded();
    await expect(math.locator(".home-card-title")).toHaveText(["Anyag m1", "Anyag m3", "Anyag m2"]);
    for (const title of await math.locator(".home-card-title").all()) await expect(title).toBeVisible();
    await math.screenshot({ path: `tests/screenshots/home-views-subject-math-${viewport.width}.png` });

    // A választás eszközönként megmarad.
    await page.reload();
    await page.getByTestId("button-filter-classroom-5").click();
    await expect(page.getByTestId("home-view-by-subject")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("home-view-newest")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("home-subject-section")).toHaveCount(6);
  });
}

test("évfolyamváltás és keresés minden nézetben szűr; ugrógomb a szakaszra visz", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByTestId("home-view-by-subject").click();
  await page.getByTestId("home-view-newest").click();
  await page.getByTestId("button-filter-classroom-8").click();
  expect(await ids(page, '[data-testid="home-newest-strip"]')).toEqual(["h1"]);
  await expect(page.getByTestId("home-subject-section")).toHaveCount(1);
  await expect(page.getByTestId("home-subject-jumps")).toHaveCount(0);
  await page.getByTestId("button-filter-all").click();
  await page.getByTestId("input-search").fill("Anyag m");
  expect(await ids(page, '[data-testid="home-newest-strip"]')).toEqual(["m2", "m1", "m3"]);
  await expect(page.getByTestId("home-subject-section")).toHaveCount(1);
  await page.getByTestId("input-search").fill("");
  await page.getByTestId("home-subject-jump-4").click();
  await expect(page.locator('[data-subject="Matematika"]')).toBeInViewport();
});

test("sérült tárolt nézet és tiltott tárhely: alapnézet, hiba nélkül", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("websuli:home-view", "{nem json"));
  await open(page);
  await expect(page.getByTestId("home-view-newest")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("list-files")).toBeVisible();
  expect(errors).toEqual([]);
});
