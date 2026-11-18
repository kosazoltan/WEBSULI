import { expect, test, type Page } from "@playwright/test";

/**
 * Évfolyam-jelölés a tananyagkártyákon (docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md). A tulajdonos jelzése: a listában
 * nem tudni, melyik tananyag melyik osztályhoz tartozik. Valódi render; az API a hálózaton ál-adat (bejelentkezés nélkül).
 */
test.use({ serviceWorkers: "block" });

const now = new Date().toISOString();
const base = { userId: null, content: "", description: "Rövid leírás a tananyagról.", createdAt: now };
const FILES = [
  { ...base, id: "p0", title: "Python kezdőknek — változók és ciklusok", classroom: 0, contentType: "lesson", subject: "informatika" },
  { ...base, id: "g4", title: "Törtek összeadása és kivonása közös nevezővel, sok gyakorló feladattal", classroom: 4, contentType: "lesson", subject: "matematika" },
  { ...base, id: "g8", title: "8. osztály - Fotoszintézis", classroom: 8, contentType: "html", subject: "biologia" },
  { ...base, id: "g12", title: "Érettségi felkészítő: integrálszámítás", classroom: 12, contentType: "lesson", subject: "matematika" },
  { ...base, id: "bad", title: "Hibás évfolyamú régi anyag", classroom: 13, contentType: "html", subject: null },
];
const EXPECTED: Record<string, string> = { p0: "Programozás", g4: "4. osztály", g8: "8. osztály", g12: "12. osztály" };
const SHOTS = "test-results/classroom-badge";

async function mock(page: Page, admin: boolean) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: admin ? { id: "admin-fixture", isAdmin: true, firstName: "Admin" } : null });
    if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    if (path === "/api/html-files") return route.fulfill({ json: FILES });
    if (path === "/api/studio/workflows") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/studio/skills/tananyag-javito") return route.fulfill({ json: { snapshot: { version: "v1", rules: [] } } });
    if (path === "/api/studio/skills/tananyag-javito/roles") return route.fulfill({ json: { roles: [] } });
    return route.fulfill({ json: path.includes("likes") ? {} : [] });
  });
}

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** A jelvény a saját kártyáján belül van, és nem takar gombot (a kártya gombjainak közepén a gomb maga látszik). */
async function insideAndNotCovering(page: Page, badgeSel: string, cardSel: string) {
  return page.evaluate(([b, c]) => {
    const out: string[] = [];
    for (const card of document.querySelectorAll<HTMLElement>(c)) {
      const badge = card.querySelector<HTMLElement>(b);
      if (!badge) continue;
      const br = badge.getBoundingClientRect(), cr = card.getBoundingClientRect();
      if (br.left < cr.left - 1 || br.right > cr.right + 1 || br.top < cr.top - 1 || br.bottom > cr.bottom + 1) out.push(`${card.dataset.testid}: a jelvény kilóg a kártyából`);
      if (badge.scrollWidth > badge.clientWidth + 1) out.push(`${card.dataset.testid}: a felirat le van vágva`);
      for (const btn of card.querySelectorAll<HTMLElement>("button")) {
        const r = btn.getBoundingClientRect();
        if (r.width < 4) continue;
        btn.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        const r2 = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
        if (hit && badge.contains(hit)) out.push(`${card.dataset.testid}: a jelvény takar egy gombot`);
      }
    }
    return out;
  }, [badgeSel, cardSel] as const);
}

for (const vp of [{ name: "asztali", width: 1280, height: 800 }, { name: "mobil", width: 360, height: 640 }]) {
  test(`főoldal ${vp.name}: minden kártyán a teljes évfolyam-felirat, hibás értéknél nincs hamis évfolyam`, async ({ page }) => {
    await page.setViewportSize(vp);
    await mock(page, false);
    await page.goto("/");
    await expect(page.getByTestId("link-file-g4")).toBeVisible();
    for (const [id, label] of Object.entries(EXPECTED)) {
      await expect(page.getByTestId(`grade-file-${id}`), id).toHaveText(label);
      await expect(page.getByTestId(`grade-file-${id}`), id).toBeVisible();
    }
    await expect(page.getByTestId("link-file-bad")).toBeVisible();
    await expect(page.getByTestId("grade-file-bad")).toHaveCount(0);
    expect(await insideAndNotCovering(page, ".home-card-grade", '[data-testid^="link-file-"]')).toEqual([]);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    await page.getByTestId("link-file-p0").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/fooldal-${vp.name}.png` });
  });

  test(`admin Tananyagok ${vp.name}: „Összes” és szűrt nézetben minden kártyán évfolyam-jelvény, a hiányzó figyelmeztet`, async ({ page }) => {
    await page.setViewportSize(vp);
    await mock(page, true);
    await page.goto("/admin?tab=files");
    await expect(page.getByTestId("filter-classroom-all")).toBeVisible();
    for (const f of FILES) {
      const badge = page.getByTestId(`file-wrapper-${f.id}`).getByTestId("badge-classroom");
      await expect(badge, f.id).toHaveText(EXPECTED[f.id] ?? "Nincs osztály");
      await expect(badge, f.id).toHaveAttribute("data-classroom", f.id === "bad" ? "none" : String(f.classroom));
    }
    await expect(page.getByTestId("file-wrapper-bad").getByTestId("badge-classroom")).toHaveClass(/amber/);
    await expect(page.getByTestId("file-wrapper-g4").getByTestId("badge-classroom")).not.toHaveClass(/amber/);
    expect(await insideAndNotCovering(page, '[data-testid="badge-classroom"]', '[data-testid^="file-wrapper-"]')).toEqual([]);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
    await page.screenshot({ path: `${SHOTS}/admin-osszes-${vp.name}.png`, fullPage: true });

    await page.getByTestId("filter-classroom-4").click();
    await expect(page.locator('[data-testid^="file-wrapper-"]')).toHaveCount(1);
    await expect(page.getByTestId("file-wrapper-g4").getByTestId("badge-classroom")).toHaveText("4. osztály");
    // A hibás évfolyamú anyag nem jelenik meg hamisan az 1. osztálynál.
    await page.getByTestId("filter-classroom-1").click();
    await expect(page.locator('[data-testid^="file-wrapper-"]')).toHaveCount(0);
    // Keresés az évfolyam-feliratra.
    await page.getByTestId("filter-classroom-all").click();
    await page.getByTestId("input-search").fill("12. osztály");
    await expect(page.locator('[data-testid^="file-wrapper-"]')).toHaveCount(1);
    await expect(page.getByTestId("file-wrapper-g12")).toBeVisible();
  });
}

test("tananyagjavító választó: a programozás sora „Programozás”, nem tűnik el", async ({ page }) => {
  await mock(page, true);
  await page.goto("/admin?tab=lesson-repair");
  await expect(page.getByTestId("lesson-repair-option-p0")).toContainText("Lecke · Programozás");
  await expect(page.getByTestId("lesson-repair-option-g4")).toContainText("Lecke · 4. osztály");
  await page.screenshot({ path: `${SHOTS}/tananyagjavito-valaszto.png` });
});

// docs/specs/2026-11-16-tananyag-evfolyam-modositas.md (M8): az admin szerkesztőben átállított Studio-lecke oldala az új évfolyamot
// mutatja. Az ál-API a PATCH-et alkalmazza és a lecke-végpont abból válaszol; a szerveroldali következetességet (html_files,
// lessons.json, knowledge_maps) a tests/material-classroom-db.integration.ts bizonyítja valódi HTTP-n.
test("admin szerkesztő → a lecke oldala az új évfolyamot mutatja", async ({ page }) => {
  const { fusionFixture } = await import("../shared/fixtures/lesson-fusion");
  let classroom = 2;
  const patches: unknown[] = [];
  const material = () => ({ ...base, id: "arena", title: "Matek Aréna", classroom, contentType: "lesson", subject: "matematika" });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Admin" } });
    if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    if (path === "/api/html-files") return route.fulfill({ json: [material()] });
    if (path === "/api/html-files/arena" && req.method() === "PATCH") {
      const body = req.postDataJSON() as { classroom?: number };
      patches.push(body);
      if (typeof body.classroom === "number") classroom = body.classroom;
      return route.fulfill({ json: material() });
    }
    if (path === "/api/html-files/arena") return route.fulfill({ json: material() });
    if (path === "/api/lessons/by-file/arena") return route.fulfill({ json: { lesson: { ...fusionFixture(), classroom }, lessonId: "lesson-arena" } });
    return route.fulfill({ json: path.includes("likes") ? {} : [] });
  });
  await page.goto("/admin?tab=files");
  await page.getByTestId("file-wrapper-arena").getByTestId("button-edit-file").click();
  await page.getByTestId("select-edit-classroom").click();
  await page.getByRole("option", { name: "3. osztály", exact: true }).click();
  await page.getByTestId("button-save-edit").click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ classroom: 3 });
  await expect(page.getByTestId("file-wrapper-arena").getByTestId("badge-classroom")).toHaveText("3. osztály");
  await page.goto("/preview/arena");
  await expect(page.locator(".ws-grade")).toHaveText("3. osztály");
  await page.screenshot({ path: `${SHOTS}/lecke-oldal-atallitas-utan.png` });
});

// docs/specs/2026-11-16-tananyag-programozas-felirat.md (P1, P2): a programozási kategóriájú lecke oldala „Programozás”, a rendes
// lecke felirata változatlan. A lecke adata (tartalmi évfolyam) mindkét esetben más-más, a felirat a kategóriát követi.
for (const vp of [{ name: "asztali", width: 1280, height: 800 }, { name: "mobil", width: 360, height: 640 }]) {
  test(`lecke oldala ${vp.name}: programozási kategória → „Programozás”, rendes lecke → változatlan`, async ({ page }) => {
    const { fusionFixture } = await import("../shared/fixtures/lesson-fusion");
    const mats: Record<string, { category: number; lesson: number }> = { prog: { category: 0, lesson: 8 }, rendes: { category: 4, lesson: 4 } };
    await page.setViewportSize(vp);
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/user") return route.fulfill({ json: null });
      if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
      if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
      const list = Object.entries(mats).map(([id, m]) => ({ ...base, id, title: `Lecke ${id}`, classroom: m.category, contentType: "lesson" }));
      if (path === "/api/html-files") return route.fulfill({ json: list });
      const file = /^\/api\/html-files\/(\w+)$/.exec(path);
      if (file) return route.fulfill({ json: list.find((f) => f.id === file[1]) });
      const lesson = /^\/api\/lessons\/by-file\/(\w+)$/.exec(path);
      if (lesson) return route.fulfill({ json: { lesson: { ...fusionFixture(), classroom: mats[lesson[1]]!.lesson }, lessonId: `l-${lesson[1]}` } });
      return route.fulfill({ json: path.includes("likes") ? {} : [] });
    });
    for (const [id, label] of [["prog", "Programozás"], ["rendes", "4. osztály"]] as const) {
      await page.goto(`/preview/${id}`);
      await expect(page.locator(".ws-grade"), id).toHaveText(label);
      await expect(page.locator(".lesson-chip").nth(1), id).toHaveText(label); // az első csip a tantárgy
      expect(await overflowX(page), `${id}: vízszintes kilógás`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${SHOTS}/lecke-${id}-${vp.name}.png` });
    }
  });
}
