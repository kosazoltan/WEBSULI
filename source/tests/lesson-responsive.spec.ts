import { expect, test } from "@playwright/test";

/**
 * Websuli Design — eszközmátrix (tulajdonosi kérés 2026-10-17): a lecke-lejátszó minden évfolyamsávban helyesen jelenik meg
 * telefonon, összehajtható telefon belső kijelzőjén, tableten, laptopon és asztali gépen. Valódi render; nincs vízszintes
 * kilógás, a fejléc-, fül- és címkeszöveg nincs levágva, a kép betölt. Képernyőkép: test-results/websuli-responsive/.
 */
test.use({ serviceWorkers: "block" });
// Arculati bank S2: a lejátszó képei az /api/design-assets-ről jönnek. A teszt ne függjön a (helyben éles) adatbázistól: azonnali
// 404 → a lejátszó a katalógus statikus fájljára vált (ugyanaz a kép), így a mérés gyors és determinisztikus.
test.beforeEach(async ({ page }) => { await page.route("**/api/design-assets/**", route => route.fulfill({ status: 404, json: { message: "teszt" } })); });


const DEVICES = [
  { name: "telefon-kicsi", width: 360, height: 740 },
  { name: "telefon", width: 390, height: 844 },
  { name: "osszehajthato-belso", width: 673, height: 841 },
  { name: "osszehajthato-belso-szeles", width: 884, height: 1104 },
  { name: "tablet-allo", width: 768, height: 1024 },
  { name: "tablet-fekvo", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "asztali", width: 1920, height: 1080 },
] as const;
const CLASSROOMS = [1, 4, 7, 9, 11] as const;

for (const classroom of CLASSROOMS) {
  test(`${classroom}. évfolyam: helyes megjelenés minden eszközméreten`, async ({ page }) => {
    for (const d of DEVICES) {
      await page.setViewportSize({ width: d.width, height: d.height });
      await page.goto(`/__lesson-runtime-probe?fusion=1&classroom=${classroom}`);
      await expect(page.locator(".lesson-hero h1").first()).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => Promise.race([i.decode().catch(() => undefined), new Promise(r => setTimeout(r, 3000))]))); /* a nézeten kívüli lazy kép decode()-ja nem zárul le */ });
      const report = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const overflowX = document.documentElement.scrollWidth - vw;
        // Látható elem, amely a nézetablakon túllóg (a vízszintesen görgethető konténerek tartalma kivétel).
        const scrollable = (el: Element | null): boolean => { for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
        const outside = [...document.querySelectorAll<HTMLElement>("body *")].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && (r.right > vw + 1 || r.left < -1) && !scrollable(el.parentElement);
        }).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
        // Levágott szöveg: a fejléc, a fülek és a címkék szövege nem lóghat ki a dobozából.
        const clipped = [...document.querySelectorAll<HTMLElement>(".ws-bandhead *, .lesson-hero h1, .lesson-chip, [role=tab]")].filter(el => {
          const s = getComputedStyle(el);
          return (s.overflow !== "visible" || s.textOverflow === "ellipsis") && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) && el.clientWidth > 0;
        }).slice(0, 5).map(el => `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 24)}`);
        const images = [...document.querySelectorAll<HTMLImageElement>(".ws-art img, .ws-subject-ico")];
        const broken = images.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute("src"));
        // Látható méretű legyen a hős-kép és a kabala (ne nulla vagy a dobozán kívüli).
        const tiny = images.filter(i => { const r = i.getBoundingClientRect(); return r.width < 16 || r.height < 16; }).map(i => i.getAttribute("src"));
        // A fül felirata a gombján belül marad, a gombok nem fedik egymást (360 px-en a „Tananyag” kilógott a keretből).
        const tabs = [...document.querySelectorAll<HTMLElement>(".fusion-tabs button")];
        const tabIssues = tabs.flatMap((b, i) => {
          const r = b.getBoundingClientRect();
          const label = b.querySelector("span")?.getBoundingClientRect();
          const out: string[] = [];
          if (label && (label.left < r.left - 0.5 || label.right > r.right + 0.5)) out.push(`felirat kilóg: ${b.textContent?.trim()}`);
          const next = tabs[i + 1]?.getBoundingClientRect();
          if (next && next.left < r.right - 0.5) out.push(`átfedés: ${b.textContent?.trim()}`);
          return out;
        });
        return { overflowX, outside, clipped, broken, tiny, tabIssues };
      });
      await page.screenshot({ path: `test-results/websuli-responsive/${classroom}-${d.name}.png` });
      expect(report.overflowX, `${d.name}: vízszintes kilógás`).toBeLessThanOrEqual(1);
      expect(report.outside, `${d.name}: nézetablakon túllógó elem`).toEqual([]);
      expect(report.clipped, `${d.name}: levágott szöveg`).toEqual([]);
      expect(report.broken, `${d.name}: be nem töltött kép`).toEqual([]);
      expect(report.tiny, `${d.name}: láthatatlan méretű kép`).toEqual([]);
      expect(report.tabIssues, `${d.name}: fülsor`).toEqual([]);
    }
  });
}
