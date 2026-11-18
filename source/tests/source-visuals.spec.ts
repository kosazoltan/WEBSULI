import { expect, test, type Page } from "@playwright/test";

/**
 * Spec docs/specs/2026-11-18-tananyag-gyartas-minoseg.md (S2a) — a forrás ábráit újrarajzoló megjelenítők VALÓS renderben:
 * táblázat, szabálydoboz, összehasonlító kártyák a `?source-visuals=1` (szokásos) és `=max` (a séma legnagyobb megengedett tartalma)
 * mérőleckén. Állítások nézetenként: az oldal nem görög vízszintesen, az ábra a blokkján belül marad, szöveg nincs levágva, elemek
 * nem fedik egymást; a széles tábla a SAJÁT keretében görög; a jelölőnek látszó szöveg szövegként jelenik meg.
 * Képernyőképek: test-results/source-visuals/.
 */
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => { await page.route("**/api/design-assets/**", (route) => route.fulfill({ status: 404, json: { message: "teszt" } })); });

const VIEWPORTS = [
  { name: "allo-360", width: 360, height: 640 },
  { name: "allo-390", width: 390, height: 844 },
  { name: "fekvo-844", width: 844, height: 390 },
  { name: "asztali-1280", width: 1280, height: 800 },
] as const;
const KINDS = ["table", "ruleBox", "compareCards"] as const;
const SHOTS = "test-results/source-visuals";

async function open(page: Page, viewport: { width: number; height: number }, variant: "1" | "max", classroom = 6) {
  await page.setViewportSize(viewport);
  await page.goto(`/__lesson-runtime-probe?source-visuals=${variant}&classroom=${classroom}`);
  await page.locator('figure[data-anim="compareCards"]').last().waitFor({ state: "visible", timeout: 30_000 });
  // A görgetésjelző mérés után jelenik meg; a betűk betöltése az elrendezést még mozgathatja.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

/** Az oldal és az ábrák geometriája: kilógás, levágás, átfedés, betűméret. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const problems: string[] = [];
    const cut = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const overlap = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const figures = [...document.querySelectorAll<HTMLElement>("figure.sv-figure")];
    let minFont = Infinity;
    for (const fig of figures) {
      const kind = fig.dataset.anim;
      const box = fig.getBoundingClientRect();
      const parent = fig.closest<HTMLElement>('[data-block="animate"]')!.getBoundingClientRect();
      if (box.left < -0.5 || box.right > window.innerWidth + 0.5) problems.push(`${kind}: az ábra kilóg a nézetből (${Math.round(box.left)}–${Math.round(box.right)})`);
      if (box.left < parent.left - 0.5 || box.right > parent.right + 0.5) problems.push(`${kind}: az ábra kilóg a blokkjából`);
      if (box.height < 20) problems.push(`${kind}: üres ábra`);
      const scroller = fig.querySelector<HTMLElement>(".sv-table-scroll");
      if (scroller) {
        const s = scroller.getBoundingClientRect();
        if (s.left < box.left - 0.5 || s.right > box.right + 0.5) problems.push("table: a görgető keret kilóg az ábrából");
      }
      // Szöveg nincs levágva: a szöveget hordozó elem tartalma elfér benne (szándékos belső görgetés csak a tábla keretén van).
      for (const el of fig.querySelectorAll<HTMLElement>("th, td, li, p, caption, figcaption, strong")) {
        if (!el.textContent?.trim()) continue;
        const style = getComputedStyle(el);
        if (style.position === "absolute") continue; // csak képernyőolvasónak szóló felirat
        minFont = Math.min(minFont, parseFloat(style.fontSize));
        if (el.scrollWidth > el.clientWidth + 1 && style.display !== "inline") problems.push(`${kind}: vízszintesen levágott szöveg — „${cut(el.textContent)}”`);
        if (el.scrollHeight > el.clientHeight + 1 && style.display !== "inline") problems.push(`${kind}: függőlegesen levágott szöveg — „${cut(el.textContent)}”`);
        if (!scroller || !scroller.contains(el)) {
          const r = el.getBoundingClientRect();
          if (r.left < box.left - 0.5 || r.right > box.right + 0.5) problems.push(`${kind}: a szöveg kilóg az ábrából — „${cut(el.textContent)}”`);
        }
      }
      // Átfedés: egy sor cellái, egy lista pontjai, a kártyák egymással.
      const groups: Element[][] = [
        ...[...fig.querySelectorAll("tr")].map((tr) => [...tr.children]),
        ...[...fig.querySelectorAll("ul")].map((ul) => [...ul.children]),
        [...fig.querySelectorAll(".sv-card")],
        [...fig.querySelectorAll("tbody tr")],
      ];
      for (const group of groups) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        if (overlap(group[i].getBoundingClientRect(), group[j].getBoundingClientRect())) problems.push(`${kind}: átfedés — „${cut(group[i].textContent)}” × „${cut(group[j].textContent)}”`);
      }
    }
    return {
      pageOverflow: doc.scrollWidth - doc.clientWidth,
      kinds: figures.map((f) => f.dataset.anim),
      problems: [...new Set(problems)],
      minFont,
      pwned: (window as unknown as { __svPwned?: number }).__svPwned ?? null,
      foreign: document.querySelectorAll("figure.sv-figure :is(script, img, a, iframe, object, embed)").length,
    };
  });
}

for (const viewport of VIEWPORTS) {
  for (const variant of ["1", "max"] as const) {
    test(`forrás-ábrák (${variant === "max" ? "legnagyobb tartalom" : "szokásos"}) — ${viewport.name}: nincs kilógás, levágás, átfedés, oldalgörgetés`, async ({ page }) => {
      await open(page, viewport, variant);
      const report = await measure(page);
      expect(report.kinds).toEqual(variant === "max" ? ["table", "table", "ruleBox", "compareCards"] : ["table", "table", "ruleBox", "ruleBox", "ruleBox", "compareCards", "compareCards"]);
      expect(report.pageOverflow, "az oldal nem görög vízszintesen").toBeLessThanOrEqual(0);
      expect(report.problems).toEqual([]);
      expect(report.minFont, "legkisebb betű").toBeGreaterThanOrEqual(14);
      expect(report.pwned, "a jelölőnek látszó szöveg nem futott le").toBeNull();
      expect(report.foreign, "idegen elem nincs az ábrákban").toBe(0);

      // A széles tábla a SAJÁT keretében görög (jelzéssel), az első oszlop görgetéskor a helyén marad; a keskeny tábla nem görög.
      const scrollers = page.locator(".sv-table-scroll");
      for (let i = 0; i < await scrollers.count(); i++) {
        const scroller = scrollers.nth(i);
        const state = await scroller.evaluate((el) => ({ wide: el.scrollWidth > el.clientWidth + 1, overflowX: getComputedStyle(el).overflowX, flagged: el.hasAttribute("data-overflowing"), sticky: !!el.querySelector("table[data-row-headers]") }));
        expect(state.overflowX).toBe("auto");
        expect(state.flagged, "a görgethetőség jelzése a méréssel egyezik").toBe(state.wide);
        const hint = scroller.locator("xpath=following-sibling::p[@data-testid='sv-scroll-hint']");
        await expect(hint).toHaveCount(state.wide ? 1 : 0);
        if (!state.wide) continue;
        await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
        const after = await scroller.evaluate((el) => {
          const first = el.querySelector<HTMLElement>("tbody tr > :first-child")!.getBoundingClientRect();
          return { scrolled: el.scrollLeft > 0, firstLeft: Math.round(first.left - el.getBoundingClientRect().left), page: document.documentElement.scrollWidth - document.documentElement.clientWidth, pageX: window.scrollX };
        });
        expect(after.scrolled, "a tábla a saját keretében görög").toBe(true);
        expect(after.page, "közben az oldal nem görög").toBeLessThanOrEqual(0);
        expect(after.pageX).toBe(0);
        if (state.sticky) expect(Math.abs(after.firstLeft), "az első oszlop a helyén marad").toBeLessThanOrEqual(2);
        await scroller.evaluate((el) => { el.scrollLeft = 0; });
      }
      if (variant === "max" && viewport.width <= 844) expect(await scrollers.first().evaluate((el) => el.scrollWidth > el.clientWidth + 1), "a 8 oszlopos tábla szélesebb a keretnél").toBe(true);

      // Kártyák: 640 px alatt egymás alatt, fölötte egymás mellett.
      const tops = await page.locator(".sv-cards").first().evaluate((el) => [...el.children].map((c) => Math.round(c.getBoundingClientRect().top)));
      if (viewport.width < 640) expect(new Set(tops).size, "keskeny nézetben a kártyák egymás alatt").toBe(tops.length);
      else expect(new Set(tops).size, "széles nézetben a kártyák egymás mellett").toBe(1);

      await page.screenshot({ path: `${SHOTS}/${variant === "max" ? "max" : "szokasos"}-${viewport.name}.png`, fullPage: true });
      // Közeli kép a szemrevételezéshez: a nézet teteje a táblákkal, a dobozokkal és a kártyákkal.
      for (const [name, selector] of [["tabla", 'figure[data-anim="table"]'], ["doboz", 'figure[data-anim="ruleBox"]'], ["kartyak", 'figure[data-anim="compareCards"]']] as const) {
        await page.locator(selector).last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/kozeli-${variant === "max" ? "max" : "szokasos"}-${name}-${viewport.name}.png` });
      }
    });
  }
}

test("szemantika és szöveg: valódi táblázat fejléccel, kódszótári feliratok, a jelölő szövegként, felsorolás listaként", async ({ page }) => {
  await open(page, { width: 390, height: 844 }, "1");
  const first = page.locator('figure[data-anim="table"]').first();
  await expect(first.locator("table caption")).toHaveText("Megszámlálható vagy megszámlálhatatlan?");
  await expect(first.locator('thead th[scope="col"]')).toHaveCount(2);
  await expect(first.getByRole("region", { name: "Megszámlálható vagy megszámlálhatatlan?" })).toHaveAttribute("tabindex", "0");
  await expect(first.locator("tbody tr")).toHaveCount(12);
  await expect(first.locator("figcaption")).toHaveCount(0);
  const second = page.locator('figure[data-anim="table"]').nth(1);
  await expect(second.locator('tbody th[scope="row"]')).toHaveText(["How many", "How much"]);
  await expect(second.getByRole("columnheader")).toHaveCount(4);
  // A jelölőnek látszó cella betűre ugyanaz a szöveg, és nem lett belőle elem.
  await expect(first.locator("tbody tr").nth(10).locator("td").first()).toHaveText("<script>window.__svPwned = 1</script>");
  await expect(first.locator("tbody tr").nth(10).locator("td").nth(1)).toHaveText('<img src=x onerror="window.__svPwned = 1">');
  await expect(first.locator("tbody tr").nth(11).locator("td").first()).toHaveText('<a href="javascript:window.__svPwned = 1">kattints</a>');
  expect(await page.evaluate(() => (window as unknown as { __svPwned?: number }).__svPwned ?? null)).toBeNull();
  // Blokkfejlécek a kódszótárból (6. évfolyam: teen sáv), a tónus a dobozban felirattal és ikonnal is.
  const heads = await page.locator('[data-block="animate"] .lesson-block-head').allTextContents();
  expect(heads.map((h) => h.trim())).toEqual(["Táblázat", "Táblázat", "Szabály", "Figyelj!", "Tipp", "Hasonlítsd össze!", "Hasonlítsd össze!"]);
  const boxes = page.locator('figure[data-anim="ruleBox"]');
  await expect(boxes.nth(1).locator(".sv-rule-head strong")).toHaveText("Figyelj!");
  await expect(boxes.nth(1).locator(".sv-rule-icon svg")).toHaveCount(1);
  await expect(boxes.nth(0).locator("li")).toHaveCount(6);
  await expect(boxes.nth(0).locator("figcaption")).toHaveCount(0);
  const tones = await boxes.evaluateAll((list) => list.map((fig) => getComputedStyle(fig.querySelector(".sv-rule")!).backgroundColor));
  expect(new Set(tones).size, "a három tónus három különböző háttér").toBe(3);
  await expect(page.locator(".sv-example-label").first()).toHaveText("Példa");
  // Felsorolás (E8): a magyarázat jelölt sorai valódi lista.
  await expect(page.locator('[data-block="explain"] ul.lesson-explain-list li')).toHaveText(["az alma megszámlálható", "a víz megszámlálhatatlan", "a kérdőszó ettől függ"]);
  // Billentyűzet: a görgethető tábla kerete fókuszálható.
  await second.locator(".sv-table-scroll").focus();
  await expect(second.locator(".sv-table-scroll")).toBeFocused();
});

for (const band of [{ classroom: 2, id: "explorer" }, { classroom: 4, id: "adventure" }, { classroom: 8, id: "studio" }, { classroom: 11, id: "future" }] as const) {
  test(`évfolyamsáv (${band.id}): a megjelenítők a sáv arculatát követik, 360 px-en is rendben`, async ({ page }) => {
    await open(page, { width: 360, height: 640 }, "1", band.classroom);
    await expect(page.locator("[data-ws-theme]")).toHaveAttribute("data-ws-theme", band.id);
    const report = await measure(page);
    expect(report.pageOverflow).toBeLessThanOrEqual(0);
    expect(report.problems).toEqual([]);
    // A fejléc tónusa a sáv tokenjéből jön: az „a” tónusú oszlopfej alsó szegélye a sáv főszíne.
    const tone = await page.locator('figure[data-anim="table"] thead th[data-tone="a"]').first().evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--ws-accent)";
      el.appendChild(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return { border: getComputedStyle(el).borderBottomColor, accent };
    });
    expect(tone.border).toBe(tone.accent);
    await page.screenshot({ path: `${SHOTS}/sav-${band.id}-360.png`, fullPage: true });
  });
}
