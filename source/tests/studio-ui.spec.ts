import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Leckekészítő stúdió (docs/specs/2026-10-17-studio-ui.md) — mérőteszt valódi renderrel, mockolt API-val:
 * 6 méret × világos/sötét mód; nincs kilógás és levágott szöveg; 1024 px alatt minden interaktív elem ≥ 44 × 44 px;
 * a szövegkontraszt PIXELALAPÚ (a háttér a renderelt képből jön — a színátmenetes háttereket a CSS-mérés nem látja);
 * kész leckénél látszik a tárolt arculat („Arculat” sor).
 */
test.use({ serviceWorkers: "block" });
const SIZES = [[360, 740], [390, 844], [673, 841], [768, 1024], [1024, 768], [1440, 900]] as const;

async function mockStudio(page: Page, opts: { done?: boolean } = {}) {
  const polls: Record<string, number> = {};
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 7, classrooms: [7] };
    if (path === "/api/csrf-token") data = { csrfToken: "test" };
    if (path === "/api/config") data = { baseUrl: "http://localhost", materialOrigin: "" };
    if (path === "/api/studio/maps") data = { maps: [{ id: "map-1", title: "A víz körforgása", subject: "Környezetismeret", classroom: 4, status: "approved" }] };
    if (path === "/api/studio/lessons/from-map/map-1") return route.fulfill({ status: 202, json: { runId: "run-1" } });
    if (path.startsWith("/api/studio/lessons/one-step/")) { polls.run = (polls.run ?? 0) + 1; data = polls.run < 2 ? { phase: "extract", jobId: null, error: null } : { phase: "done", jobId: "job-done", error: null }; }
    if (path === "/api/studio/jobs/job-done") data = { job: { id: "job-done", step: "done", status: "ok", round: 0, error: null }, produced: { outline: null, approvedOutline: true, lessonId: "lesson-1" } };
    if (path === "/api/lessons/lesson-1/material") data = { htmlFileId: "file-1" };
    if (path === "/api/studio/lessons/lesson-1/learning-report") data = { questions: [] };
    if (path === "/api/studio/lessons/lesson-1/concept-stats") data = { stats: [] };
    if (path === "/api/studio/jobs/job-done/notes") data = { notes: [] };
    if (path === "/api/lessons/by-file/file-1") data = { lessonId: "lesson-1", version: 1, lesson: { ...compactFusionFixture(), subject: "Környezetismeret", classroom: 4, title: "A víz körforgása", art: { subjectIcon: "icon-kornyezetismeret-adventure", picture: "hero-adventure", mascot: "mascot-hello", topic: "viz" } } };
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: { message: "nincs" } });
    await route.fulfill({ json: data });
  });
  await page.goto(opts.done ? "/admin?tab=knowledge-maps" : "/admin?tab=lesson-studio");
  if (opts.done) {
    const advanced = page.getByTestId("studio-advanced-body");
    await expect(advanced).toBeVisible();
    await advanced.getByTestId("lesson-map-select").click();
    await page.getByRole("option", { name: /A víz körforgása/ }).click();
    await advanced.getByTestId("start-lesson").click();
  }
}

/** Pixelalapú kontraszt: a szöveg színe a számított `color`, a háttér a doboz szélének mediánja a képernyőképen. */
async function contrastProblems(page: Page): Promise<string[]> {
  const boxes = await page.evaluate(() => {
    const out: Array<{ x: number; y: number; w: number; h: number; color: string; big: boolean; label: string }> = [];
    const scope = document.querySelector("[data-testid=admin-header]")?.parentElement ?? document.body;
    for (const el of scope.querySelectorAll<HTMLElement>("*")) {
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim())) continue;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      if (r.width < 4 || r.height < 4 || s.visibility === "hidden" || r.bottom < 0 || r.top > innerHeight || el.closest("[aria-hidden=true]")) continue;
      let op = 1; for (let e: HTMLElement | null = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const fs = parseFloat(s.fontSize); const big = fs >= 24 || (fs >= 18.66 && Number(s.fontWeight) >= 700); // WCAG: 18 pt, illetve 14 pt félkövér
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, color: `${s.color}|${op}`, big, label: `${el.tagName} "${el.textContent!.trim().slice(0, 30)}"` });
    }
    return out;
  });
  const png = PNG.sync.read(await page.screenshot());
  const px = (x: number, y: number) => { const i = (Math.min(png.height - 1, Math.max(0, Math.round(y))) * png.width + Math.min(png.width - 1, Math.max(0, Math.round(x)))) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const lum = ([r, g, b]: number[]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const problems: string[] = [];
  for (const b of boxes) {
    const ring: number[][] = [];
    for (let t = 0; t <= 1; t += 0.125) { ring.push(px(b.x + t * b.w, b.y + 1), px(b.x + t * b.w, b.y + b.h - 2)); }
    for (let t = 0; t <= 1; t += 0.25) { ring.push(px(b.x + 1, b.y + t * b.h), px(b.x + b.w - 2, b.y + t * b.h)); }
    const ls = ring.map(lum).sort((a, z) => a - z);
    if (ls[ls.length - 1] - ls[0] > 0.5) continue; // kép vagy erős minta a szöveg mögött — nem mérhető megbízhatóan
    const bgL = ls[Math.floor(ls.length / 2)];
    const bgRgb = ring[ring.map(lum).indexOf(bgL)];
    const [cssColor, opS] = b.color.split("|");
    const m = (cssColor.match(/[\d.]+/g) ?? []).map(Number); const alpha = (m[3] ?? 1) * Number(opS);
    const fg = [0, 1, 2].map(k => m[k] * alpha + bgRgb[k] * (1 - alpha));
    const a = lum(fg); const cr = (Math.max(a, bgL) + 0.05) / (Math.min(a, bgL) + 0.05);
    if (cr < (b.big ? 3 : 4.5)) problems.push(`${cr.toFixed(2)} ${b.label}`);
  }
  return problems;
}

async function measure(page: Page, width: number) {
  return page.evaluate((narrow) => {
    const vw = document.documentElement.clientWidth;
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const small = narrow ? [...document.querySelectorAll("button, a[href], [role=tab], input:not([type=hidden]), textarea, select, summary, [role=combobox]")]
      .filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; })
      .map(el => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}"`; }) : [];
    const clipped = [...document.querySelectorAll<HTMLElement>("body *")].filter(el => {
      if (!visible(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim())) return false;
      const s = getComputedStyle(el); return (s.overflow !== "visible" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1;
    }).map(el => `${el.tagName} "${el.textContent!.trim().slice(0, 24)}"`);
    return { overflowX: document.documentElement.scrollWidth - vw, small, clipped };
  }, width < 1024);
}

for (const scheme of ["light", "dark"] as const) {
  test(`stúdió (OS ${scheme} preferencia — az appnak nincs .dark témája): érintés ≥ 44 px 1024 alatt, pixelalapú AA kontraszt, nincs kilógás — üres állapot`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await mockStudio(page);
      await expect(page.getByPlaceholder("Cím (nem kötelező)")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const m = await measure(page, w);
      const low = await contrastProblems(page);
      await page.screenshot({ path: test.info().outputPath(`studio-${scheme}-${w}.png`), fullPage: true });
      expect(m.overflowX, `${w}: kilógás`).toBeLessThanOrEqual(1);
      expect(m.clipped, `${w}: levágott szöveg`).toEqual([]);
      expect(m.small, `${w}: 44 px alatti érintési célpont`).toEqual([]);
      expect(low, `${w}: AA alatti kontraszt`).toEqual([]);
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("kész lecke: a stúdió mutatja a tárolt arculatot (ikon, kép, kabala, témakör), az adatbázisból", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e.message} @ ${(e.stack ?? "").split(String.fromCharCode(10)).slice(1, 4).join(" | ")}`));
  // A szándékos 404-es képválasz (katalógus-tartalék próbája) erőforrás-hibát naplóz — az nem alkalmazáshiba.
  page.on("console", m => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 400)}`); });
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await mockStudio(page, { done: true });
    const summary = page.getByTestId("lesson-art-summary");
    await expect(summary).toBeVisible({ timeout: 15000 }).catch(e => { throw new Error(`${e.message} OLDALHIBA: ${errors.join(" || ")}`); });
    await expect(summary).toContainText("Tudás kalandjai");
    await expect(summary).toContainText("viz");
    await expect(summary.locator("img")).toHaveCount(3);
    const m = await measure(page, w);
    expect(m.overflowX).toBeLessThanOrEqual(1);
    // A kártya a nézetben (az alsó menü fölött) is olvasható: pixelalapú kontraszt a valódi, látható állapotban.
    await summary.evaluate(el => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(400);
    expect(await contrastProblems(page), `${w}: AA alatti kontraszt a kész állapotban`).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`studio-done-${w}.png`) });
    await page.unrouteAll({ behavior: "wait" });
  }
  expect(errors, "oldalhiba").toEqual([]);
});

test("review #278: a fő feltöltési útvonal kész futásánál is látszik az arculat (nem csak a haladó ágon)", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("websuli.studio.oneStepRunId", "done-run"));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt" };
    if (path === "/api/studio/maps") data = { maps: [] };
    if (path === "/api/studio/lessons/one-step/done-run") data = { phase: "done", error: null, detail: null, mapId: "m", lessonId: "lesson-1", htmlFileId: "file-1" };
    if (path === "/api/lessons/by-file/file-1") data = { lessonId: "lesson-1", version: 1, lesson: { ...compactFusionFixture(), subject: "Környezetismeret", classroom: 4, title: "A víz körforgása", art: { subjectIcon: "icon-kornyezetismeret-adventure", picture: "hero-adventure", mascot: "mascot-hello", topic: "viz" } } };
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: { message: "nincs" } });
    await route.fulfill({ json: data });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin?tab=lesson-studio");
  const summary = page.getByTestId("lesson-art-summary");
  await expect(summary).toBeVisible({ timeout: 15000 });
  await expect(summary).toContainText("Tudás kalandjai");
  await expect(summary.locator("img")).toHaveCount(3);
});

test("review #278: a portálban nyíló legördülő opciói is ≥ 44 px-esek 1024 px alatt (internetes készítés)", async ({ page }) => {
  await mockStudio(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin?tab=lesson-studio");
  await page.getByRole("button", { name: /Internetes keresés/ }).click();
  const combo = page.getByRole("combobox").first();
  await expect(combo).toBeVisible();
  await combo.click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  // Elrendezési magasság (offsetHeight): a menü `zoom-in-95` animációval nyílik, a getBoundingClientRect közben 0,95-ös méretet adna.
  const heights = await options.evaluateAll(els => els.map(e => (e as HTMLElement).offsetHeight));
  expect(heights.length).toBeGreaterThan(0);
  expect(heights.filter(h => h < 44), "44 px alatti opció").toEqual([]);
});

