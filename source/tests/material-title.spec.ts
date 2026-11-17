import { expect, test, type Page } from "@playwright/test";

/**
 * Osztály a tananyag címénél és a keresőben (docs/specs/2026-11-17-tananyag-cim-osztaly.md). A tulajdonos jelzése: a címeknél
 * nincs osztály, ezért nehéz a keresés. Valódi render; az API a hálózaton ál-adat (bejelentkezés nélkül).
 * `MATERIAL_TITLE_SHOTS_ONLY=1`: csak képernyőképek (az „előtte” állapot rögzítéséhez), `MATERIAL_TITLE_SHOTS_DIR` a célmappa.
 */
test.use({ serviceWorkers: "block" });

const SHOTS = process.env.MATERIAL_TITLE_SHOTS_DIR ?? "test-results/material-title";
const SHOTS_ONLY = process.env.MATERIAL_TITLE_SHOTS_ONLY === "1";

const now = new Date().toISOString();
const base = { userId: null, content: "", description: "Rövid leírás a tananyagról.", createdAt: now, contentType: "lesson" };
const LONG = "A törtek összeadása, kivonása, szorzása és osztása különböző nevezőkkel, vegyes számokkal és sok-sok gyakorló feladattal";
const FILES = [
  { ...base, id: "a4", title: "Törtek összeadása és kivonása", classroom: 4, subject: "matematika" },
  { ...base, id: "k4", title: "A víz körforgása", classroom: 4, subject: "kornyezetismeret" },
  { ...base, id: "b12", title: "Érettségi felkészítő: integrálszámítás", classroom: 12, subject: "matematika" },
  { ...base, id: "p0", title: "Python kezdőknek — változók és ciklusok", classroom: 0, subject: "informatika" },
  { ...base, id: "q0", title: "Programozási alapismeretek: elágazások", classroom: 0, subject: "informatika" },
  { ...base, id: "t8", title: "8. osztály - Fotoszintézis", classroom: 8, contentType: "html", subject: "biologia" },
  { ...base, id: "l5", title: LONG, classroom: 5, subject: "matematika" },
  // K2 (review): az 1. és a 11. osztály nem keveredhet az előtag miatt.
  { ...base, id: "e1", title: "Betűk és hangok", classroom: 1, subject: "magyar-nyelvtan" },
  { ...base, id: "e11", title: "Hangtan összefoglaló", classroom: 11, subject: "magyar-nyelvtan" },
  { ...base, id: "bad", title: "Hibás évfolyamú régi anyag", classroom: 13, contentType: "html", subject: null },
];
/** A cím előtti felirat a főoldalon; ahol nincs kulcs, ott előtag sincs. */
const PREFIX: Record<string, string> = { a4: "4. osztály", k4: "4. osztály", b12: "12. osztály", p0: "Programozás", l5: "5. osztály", e1: "1. osztály", e11: "11. osztály" };
const VIEWPORTS = [{ name: "360x640", width: 360, height: 640 }, { name: "390x844", width: 390, height: 844 }, { name: "asztali", width: 1280, height: 800 }];

async function mock(page: Page, admin: boolean) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: admin ? { id: "admin-fixture", isAdmin: true, firstName: "Admin" } : null });
    if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    if (path === "/api/html-files") return route.fulfill({ json: FILES });
    if (path === "/api/studio/workflows") return route.fulfill({ json: { runs: [] } });
    return route.fulfill({ json: path.includes("likes") ? {} : [] });
  });
}

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const homeIds = (page: Page) =>
  page.locator('[data-testid^="link-file-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("link-file-", "")).sort());
const adminIds = (page: Page) =>
  page.locator('[data-testid^="file-wrapper-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("file-wrapper-", "")).sort());

/** A címsor a saját kártyáján belül van, vízszintesen nincs levágva, az előtag az első sorban látszik, és nem takar gombot. */
async function headingProblems(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const card of document.querySelectorAll<HTMLElement>('[data-testid^="link-file-"]')) {
      const id = card.dataset.testid;
      const heading = card.querySelector<HTMLElement>(".home-card-heading");
      if (!heading) { out.push(`${id}: nincs címsor`); continue; }
      const hr = heading.getBoundingClientRect(), cr = card.getBoundingClientRect();
      if (hr.width < 40 || hr.height < 14) out.push(`${id}: a címsor összeesett`);
      if (hr.left < cr.left - 1 || hr.right > cr.right + 1 || hr.top < cr.top - 1 || hr.bottom > cr.bottom + 1) out.push(`${id}: a címsor kilóg a kártyából`);
      if (heading.scrollWidth > heading.clientWidth + 1) out.push(`${id}: a címsor vízszintesen le van vágva`);
      const grade = heading.querySelector<HTMLElement>(".home-card-title-grade");
      if (grade) {
        // A szövegdoboz magasabb a sorköznél (1.25), ezért a függőleges KÖZEPE a mérce: az a címsor első sorában van.
        const gr = grade.getClientRects()[0];
        const lineHeight = parseFloat(getComputedStyle(heading).lineHeight);
        const middle = gr ? (gr.top + gr.bottom) / 2 : -1;
        if (!gr || gr.width < 20 || middle < hr.top || middle > hr.top + lineHeight || gr.left < hr.left - 1 || gr.right > hr.right + 1) out.push(`${id}: az előtag nem látszik a címsor első sorában`);
      }
      for (const btn of card.querySelectorAll<HTMLElement>("button")) {
        if (btn.getBoundingClientRect().width < 4) continue;
        btn.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        const r = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && heading.contains(hit)) out.push(`${id}: a címsor takar egy gombot`);
      }
    }
    return out;
  });
}

for (const vp of VIEWPORTS) {
  test(`főoldal ${vp.name}: a cím előtt az osztály, duplázás nélkül; a kereső az osztályra is talál`, async ({ page }) => {
    await page.setViewportSize(vp);
    await mock(page, false);
    await page.goto("/");
    await expect(page.getByTestId("link-file-a4")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("link-file-a4").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/fooldal-${vp.name}.png` });
    await page.screenshot({ path: `${SHOTS}/fooldal-${vp.name}-teljes.png`, fullPage: true });
    if (SHOTS_ONLY) {
      await page.getByTestId("input-search").fill("4. osztály");
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/fooldal-${vp.name}-kereses.png`, fullPage: true });
      return;
    }

    // E1–E3: előtag ott és csak ott, ahol érvényes az osztály és a cím nem nevezi meg.
    for (const f of FILES) {
      const card = page.getByTestId(`link-file-${f.id}`);
      await expect(card.locator(".home-card-title"), f.id).toHaveText(f.title);
      if (PREFIX[f.id]) {
        await expect(page.getByTestId(`title-grade-${f.id}`), f.id).toHaveText(`${PREFIX[f.id]} ·`);
        await expect(card.locator(".home-card-heading"), f.id).toHaveText(`${PREFIX[f.id]} · ${f.title}`);
      } else {
        await expect(page.getByTestId(`title-grade-${f.id}`), f.id).toHaveCount(0);
        await expect(card.locator(".home-card-heading"), f.id).toHaveText(f.title);
      }
    }
    // E10: nincs kilógás, levágás, gombtakarás, vízszintes görgetés.
    expect(await headingProblems(page)).toEqual([]);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);

    // E4–E6: keresés osztály-kifejezésekre.
    const search = page.getByTestId("input-search");
    const cases: Array<[string, string[]]> = [
      ["12.o", ["b12"]],
      ["1. osztály", ["e1"]],
      ["1.", ["e1"]],
      ["11. osztály", ["e11"]],
      ["XI. osztály", ["e11"]],
      ["4.b", ["a4", "k4"]],
      ["5-ösöknek", ["l5"]],
      ["negyedik", ["a4", "k4"]],
      ["4 osztaly", ["a4", "k4"]],
      ["4. osztály törtek", ["a4"]],
      ["8. osztály", ["t8"]],
      ["prog", ["p0", "q0"]],
      ["ötödikes", ["l5"]],
      ["Fotoszintézis", ["t8"]],
    ];
    for (const [query, ids] of cases) {
      await search.fill(query);
      await expect.poll(() => homeIds(page), { message: query }).toEqual([...ids].sort());
    }
    await search.fill("4. osztály");
    await expect.poll(() => homeIds(page)).toEqual(["a4", "k4"]);
    await page.screenshot({ path: `${SHOTS}/fooldal-${vp.name}-kereses.png`, fullPage: true });
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    await search.fill("7. osztály");
    await expect(page.getByText(/Nincs találat/)).toBeVisible();
  });

  // K1 (review): a tanuló mentett évfolyama alapból szűr; a MÁS osztályt megnevező keresés ettől még találjon.
  test(`főoldal ${vp.name}: mentett 4. osztály mellett az „5. osztály” keresés az 5. osztály anyagait mutatja`, async ({ page }) => {
    if (SHOTS_ONLY) return; // az „előtte” képekhez ez az eset nem kell
    await page.setViewportSize(vp);
    await mock(page, false);
    await page.addInitScript(() => window.localStorage.setItem("websuli.classroomGrade", "4"));
    await page.goto("/");
    await expect(page.getByTestId("link-file-a4")).toBeVisible({ timeout: 60_000 });
    const filter4 = page.getByTestId("button-filter-classroom-4");
    await expect(filter4).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => homeIds(page)).toEqual(["a4", "k4"]);
    const search = page.getByTestId("input-search");
    const notice = page.getByTestId("search-all-classrooms");
    await expect(notice).toHaveCount(0);

    await search.fill("5. osztály");
    await expect.poll(() => homeIds(page)).toEqual(["l5"]);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(/Keresés minden osztályban/);
    await expect(filter4, "a szűrő állapota nem íródik át").toHaveAttribute("aria-pressed", "true");
    const box = await notice.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/fooldal-${vp.name}-szuro-atlepes.png` });

    await search.fill("prog");
    await expect.poll(() => homeIds(page)).toEqual(["p0", "q0"]);
    await expect(notice).toBeVisible();

    // Üres osztály: a keresés minden osztályban futott, az üzenet nem a 4. osztályra hivatkozik.
    await search.fill("7. osztály");
    await expect(page.getByText(/Nincs találat a keresésre/)).toBeVisible();
    await expect(page.getByText(/4\. osztályban/)).toHaveCount(0);

    // Ugyanaz az osztály vagy osztály nélküli kifejezés: a szűrő érvényes marad (a korábbi viselkedés).
    await search.fill("4. osztály");
    await expect.poll(() => homeIds(page)).toEqual(["a4", "k4"]);
    await expect(notice).toHaveCount(0);
    await search.fill("törtek");
    await expect.poll(() => homeIds(page)).toEqual(["a4"]);
    await expect(notice).toHaveCount(0);

    // A keresés törlésekor a szűrő újra él.
    await search.fill("");
    await expect.poll(() => homeIds(page)).toEqual(["a4", "k4"]);
    await expect(filter4).toHaveAttribute("aria-pressed", "true");
  });

  test(`admin Tananyagok ${vp.name}: a kártya címe előtt az osztály; a kereső az osztályra is talál`, async ({ page }) => {
    await page.setViewportSize(vp);
    await mock(page, true);
    await page.goto("/admin?tab=files");
    // Hideg vite-indulásnál az admin oldal első fordítása lassú lehet.
    await expect(page.getByTestId("filter-classroom-all")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("file-wrapper-a4")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/admin-${vp.name}.png`, fullPage: true });
    if (SHOTS_ONLY) return;

    for (const f of FILES) {
      const expected = PREFIX[f.id] ? `${PREFIX[f.id]} · ${f.title}` : f.title;
      await expect(page.getByTestId(`file-wrapper-${f.id}`).locator("h3"), f.id).toHaveText(expected);
    }
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    const titleOverflow = await page.locator('[data-testid^="file-wrapper-"] h3').evaluateAll((els) =>
      els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    expect(titleOverflow).toEqual([]);

    // A cím eleje (az osztály száma) nincs a kijelölő / fogantyú rétege alatt.
    const covered = await page.locator('[data-testid^="file-wrapper-"]').evaluateAll((els) => els.filter((w) => {
      const h3 = w.querySelector("h3")!.getBoundingClientRect();
      const handle = w.querySelector('[data-testid^="drag-handle-"]')!.getBoundingClientRect();
      return h3.left < handle.right && h3.top < handle.bottom && h3.bottom > handle.top;
    }).map((w) => w.getAttribute("data-testid")));
    expect(covered).toEqual([]);

    const search = page.getByTestId("input-search");
    const cases: Array<[string, string[]]> = [
      ["12 osztaly", ["b12"]],
      ["1. osztály", ["e1"]],
      ["4.o", ["a4", "k4"]],
      ["negyedik törtek", ["a4"]],
      ["programozás", ["p0", "q0"]],
      ["Nincs osztály", ["bad"]],
    ];
    for (const [query, ids] of cases) {
      await search.fill(query);
      await expect.poll(() => adminIds(page), { message: query }).toEqual([...ids].sort());
    }

    // K1: aktív osztályszűrő mellett a más osztályt megnevező keresés minden osztályban fut, jelzéssel; törléskor a szűrő él.
    await search.fill("");
    await page.getByTestId("filter-classroom-4").click();
    await expect.poll(() => adminIds(page)).toEqual(["a4", "k4"]);
    await expect(page.getByTestId("search-all-classrooms")).toHaveCount(0);
    await search.fill("12. osztály");
    await expect.poll(() => adminIds(page)).toEqual(["b12"]);
    await expect(page.getByTestId("search-all-classrooms")).toBeVisible();
    await search.fill("törtek");
    await expect.poll(() => adminIds(page)).toEqual(["a4"]);
    await expect(page.getByTestId("search-all-classrooms")).toHaveCount(0);
    await search.fill("");
    await expect.poll(() => adminIds(page)).toEqual(["a4", "k4"]);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
  });
}
