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

/** Vak ellenőr J3: a kétoszlopos tábla fejlécének kettétört (több sorba került) szavai és a megjelenítő `data-head-fit` jelzője. */
async function headerWords(page: Page) {
  return page.locator('table.sv-table[data-cols="2"]').first().evaluate((table) => {
    const range = document.createRange();
    const broken: string[] = [];
    for (const th of Array.from(table.querySelectorAll("thead th"))) {
      const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const word of (node.textContent ?? "").matchAll(/\S+/g)) {
          range.setStart(node, word.index!);
          range.setEnd(node, word.index! + word[0].length);
          if (new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size > 1) broken.push(word[0]);
        }
      }
    }
    const scroller = table.closest<HTMLElement>(".sv-table-scroll")!;
    return { fit: table.getAttribute("data-head-fit"), broken, overflow: scroller.scrollWidth - scroller.clientWidth,
      headFont: parseFloat(getComputedStyle(table.querySelector("thead th")!).fontSize) };
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
        // Review J7: fókuszmegálló és nevesített régió csak a ténylegesen görgő táblán.
        expect(await scroller.getAttribute("tabindex"), "fókuszmegálló csak görgő táblán").toBe(state.wide ? "0" : null);
        expect(await scroller.getAttribute("role")).toBe(state.wide ? "region" : null);
        const hint = scroller.locator("xpath=following-sibling::p[@data-testid='sv-scroll-hint']");
        await expect(hint).toHaveCount(state.wide ? 1 : 0);
        if (!state.wide) continue;
        // Review J6: egérrel a semleges felirat látszik (a „Húzd oldalra” csak érintőképernyőn).
        await expect(hint.locator(".sv-hint-pointer")).toBeVisible();
        await expect(hint.locator(".sv-hint-pointer")).toHaveText("A táblázat oldalra görgethető");
        await expect(hint.locator(".sv-hint-touch")).toBeHidden();
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

      // Review J5: a KÉTOSZLOPOS tábla telefonon sem görög — törhetetlen szóval (a jelölőnek látszó cellák) és szóköz nélküli hosszú szöveggel sem.
      const twoColumn = page.locator('.sv-table-scroll:has(table[data-cols="2"])');
      expect(await twoColumn.count()).toBe(1);
      const fit = await twoColumn.first().evaluate((el) => ({ overflow: el.scrollWidth - el.clientWidth, cells: [...el.querySelectorAll("tbody tr:first-child > *")].map((c) => { const r = c.getBoundingClientRect(), f = el.getBoundingClientRect(); return r.left >= f.left - 1 && r.right <= f.right + 1 && r.width >= 60; }) }));
      expect(fit.overflow, "a kétoszlopos tábla görgetés nélkül elfér").toBeLessThanOrEqual(1);
      expect(fit.cells, "mindkét oszlop látszik a kereten belül").toEqual([true, true]);
      await expect(twoColumn.first()).not.toHaveAttribute("tabindex", /.*/);
      // Vak ellenőr J3: a fejléc szava („megszámlálható”, „megszámlálhatatlan”) nem törik ketté — a szűkebb térköz elég hozzá.
      const head = await headerWords(page);
      // A legnagyobb tartalom fejléce szóköz nélküli, a keretnél hosszabb szöveg is lehet: ott (és csak ott) a végső eset, a szótörés él.
      if (variant === "1") {
        expect(head.broken, `a kétoszlopos tábla fejlécének szavai épek (jelző: ${head.fit}, betű: ${head.headFont}px)`).toEqual([]);
        expect(head.fit, "a végső eset (szótörés) itt nem lép életbe").not.toBe("break");
      } else if (head.broken.length) expect(head.fit, `szó csak a végső esetben törik: ${head.broken.join(", ").slice(0, 80)}`).toBe("break");
      expect(head.overflow, "a szűkebb térközzel sem görög").toBeLessThanOrEqual(1);

      // Review J2: a tábla, a kártyák és a szabálydoboz ugyanahhoz a tartalomszélességhez igazodik (nincs féloldalas üres sáv).
      const edges = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("figure.sv-figure")].map((fig) => {
        const body = fig.querySelector<HTMLElement>(".sv-table-scroll, .sv-cards, .sv-rule")!.getBoundingClientRect();
        const block = fig.closest<HTMLElement>('[data-block="animate"]')!.getBoundingClientRect();
        return { kind: fig.dataset.anim, left: Math.round(body.left - block.left), right: Math.round(block.right - body.right) };
      }));
      for (const e of edges) expect(Math.abs(e.left - e.right), `${e.kind}: a tartalom a blokk teljes szélességét tölti ki (bal ${e.left}, jobb ${e.right})`).toBeLessThanOrEqual(6);
      expect(new Set(edges.filter((e) => e.kind !== "ruleBox").map((e) => e.right)).size, "a tábla és a kártyák jobb széle egy vonalban").toBe(1);

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
  await expect(first.getByRole("region")).toHaveCount(0);
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
  // Blokkfejléc a kódszótárból (6. évfolyam: teen sáv). Review J3: a szabálydoboznak NINCS külön blokkfejléce — a tónus felirata
  // egyszer áll, a doboz saját fejlécében (ikonnal); a modell címe alatta cím; a blokk felirata a kereten BELÜL (J4).
  const heads = await page.locator('[data-block="animate"] .lesson-block-head').allTextContents();
  expect(heads.map((h) => h.trim())).toEqual(["Táblázat", "Táblázat", "Hasonlítsd össze!", "Hasonlítsd össze!"]);
  const boxes = page.locator('figure[data-anim="ruleBox"]');
  await expect(boxes.locator(".sv-rule-tone")).toHaveText(["Szabály", "Figyelj!", "Tipp"]);
  await expect(boxes.locator(".sv-rule-title")).toHaveText(["A fő szabály", "Így jegyzed meg"]);
  await expect(boxes.nth(1).locator(".sv-rule-icon svg")).toHaveCount(1);
  await expect(boxes.nth(0).locator("li")).toHaveCount(6);
  await expect(boxes.nth(0).locator("figcaption")).toHaveCount(0);
  // A tónus szava a blokkban egyszer áll (a „Tipp” doboz saját blokkfelirata — „Tipp a tanuláshoz” — a második előfordulás).
  for (const [index, word, times] of [[0, "Szabály", 1], [1, "Figyelj!", 1], [2, "Tipp", 2]] as const) {
    const said = await boxes.nth(index).locator("xpath=ancestor::*[@data-block='animate'][1]").evaluate((el) => el.textContent ?? "");
    expect(said.split(word).length - 1, `„${word}” előfordulása a blokkban`).toBe(times);
  }
  await expect(boxes.nth(1).locator(".sv-rule > figcaption.sv-rule-note")).toHaveText("Gyakori hibák");
  expect(await boxes.nth(1).evaluate((fig) => { const note = fig.querySelector(".sv-rule-note")!.getBoundingClientRect(), box = fig.querySelector(".sv-rule")!.getBoundingClientRect(); return note.top >= box.top && note.bottom <= box.bottom; }), "a felirat a kereten belül áll").toBe(true);
  const tones = await boxes.evaluateAll((list) => list.map((fig) => getComputedStyle(fig.querySelector(".sv-rule")!).backgroundColor));
  expect(new Set(tones).size, "a három tónus három különböző háttér").toBe(3);
  await expect(page.locator(".sv-example-label").first()).toHaveText("Példa");
  // Felsorolás (E8): a magyarázat jelölt sorai valódi lista.
  await expect(page.locator('[data-block="explain"] ul.lesson-explain-list li')).toHaveText(["az alma megszámlálható", "a víz megszámlálhatatlan", "a kérdőszó ettől függ"]);
  // Billentyűzet: a görgethető tábla kerete fókuszálható.
  await expect(second.getByRole("region", { name: "A két kérdőszó használata." })).toHaveAttribute("tabindex", "0");
  await second.locator(".sv-table-scroll").focus();
  await expect(second.locator(".sv-table-scroll")).toBeFocused();
});

test("B1 — a hibás paraméterű ábrablokk teljes egészében kimarad: nincs fejléc üres törzzsel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__lesson-runtime-probe?source-visuals=broken");
  await expect(page.locator('figure[data-anim="ruleBox"]')).toHaveCount(1);
  await expect(page.locator(".sv-rule-items li")).toHaveText(["Ez az egyetlen érvényes doboz."]);
  await expect(page.locator('[data-block="animate"]')).toHaveCount(1);
  await expect(page.locator('[data-block="animate"] .lesson-block-head')).toHaveCount(0);
  await expect(page.getByText("Táblázat", { exact: true })).toHaveCount(0);
  const empty = await page.locator('[data-block="animate"]').evaluateAll((list) => list.filter((el) => !el.querySelector("figure")).length);
  expect(empty, "üres törzsű ábrablokk nincs").toBe(0);
  await expect(page.locator('[data-block="explain"]')).toHaveCount(1);
});

test("érintőképernyőn a görgő tábla jelzése húzásra biztat", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route("**/api/design-assets/**", (route) => route.fulfill({ status: 404, json: { message: "teszt" } }));
  await page.goto("/__lesson-runtime-probe?source-visuals=1");
  const hint = page.getByTestId("sv-scroll-hint").first();
  await expect(hint.locator(".sv-hint-touch")).toBeVisible();
  await expect(hint.locator(".sv-hint-touch")).toHaveText("Húzd oldalra a táblázatot");
  await expect(hint.locator(".sv-hint-pointer")).toBeHidden();
  await context.close();
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
    // Vak ellenőr J3: 360 px-en, a sáv betűméretével sem törik ketté a fejléc szava (a régi képeken „megszámlál / ható”).
    const head = await headerWords(page);
    expect(head.broken, `${band.id}: a fejléc szavai épek (jelző: ${head.fit}, betű: ${head.headFont}px)`).toEqual([]);
    expect(head.overflow, `${band.id}: a kétoszlopos tábla nem görög`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/sav-${band.id}-360.png`, fullPage: true });
  });
}

// Spec docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md (S2b-1; V32): döntési fa és képes kártyák három nézetben.
for (const viewport of [{ name: "allo-360", width: 360, height: 640 }, { name: "fekvo-844", width: 844, height: 390 }, { name: "asztali-1280", width: 1280, height: 800 }]) {
  test(`döntési fa és képes kártyák — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/__lesson-runtime-probe?source-visuals=tree&classroom=6");
    await page.locator('figure[data-anim="pictureCards"]').waitFor({ state: "visible", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // A HM-alakú Igen / Nem fa: a két levél UGYANANNAK a szülőnek két gyereke (nem nyíllal összekötött sor).
    const yesNo = page.locator('figure[data-anim="decisionTree"]').first();
    const siblings = await yesNo.evaluate((fig) => {
      const lists = [...fig.querySelectorAll("ul.sv-tree-children")];
      return lists.map((ul) => [...ul.children].filter((c) => c.tagName === "LI").length);
    });
    expect(siblings[0]).toBe(2);
    await expect(page.locator('figure[data-anim="decisionTree"]')).toHaveCount(3);
    // Vak kör 1 (L1, L3): a kis fa vízszintes (széles nézetben), a beágyazott fák listák; a vízszintes összekötő vonal folytonos
    // (a testvér-elemek között nincs rés).
    expect(await page.locator('figure[data-anim="decisionTree"] .sv-tree').evaluateAll((trees) => trees.map((t) => t.className.replace("sv-tree ", "")))).toEqual(["sv-tree--wide", "sv-tree--list", "sv-tree--list"]);
    if (viewport.width >= 640) {
      const gaps = await yesNo.evaluate((fig) => { const items = [...fig.querySelectorAll<HTMLElement>(".sv-tree-children > .sv-tree-item")].map((i) => i.getBoundingClientRect()); return items.slice(1).map((r, i) => Math.round(r.left - items[i].right)); });
      expect(gaps.every((g) => g <= 0), `a testvérágak között rés: ${gaps.join(", ")} px`).toBe(true);
    }
    await expect(page.locator('figure[data-anim="pictureCards"] .sv-pcard')).toHaveCount(8);
    for (const fig of await page.locator('figure[data-anim="decisionTree"], figure[data-anim="pictureCards"]').all()) {
      await fig.scrollIntoViewIfNeeded();
      const box = await fig.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= viewport.width + 0.5).toBe(true);
      // Szöveg nincs levágva a csomópontokban és a kártyákon.
      const clipped = await fig.evaluate((f) => [...f.querySelectorAll<HTMLElement>(".sv-tree-node, .sv-tree-branch, .sv-tree-text, .sv-pcard-label, .sv-pcard-example")]
        .filter((n) => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map((n) => n.textContent));
      expect(clipped).toEqual([]);
    }
    await page.screenshot({ path: `${SHOTS}/fa-kartya-${viewport.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
