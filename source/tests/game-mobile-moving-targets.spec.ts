import { expect, test } from "@playwright/test";

import { waitForStable, waitForTargetsInView } from "./support/game-mobile-quality";

/**
 * Közös utójavítás d (kanban #51): a mobil mérő „mozgó cél” módja. Folyamatosan mozgó válaszcélnál a stabil doboz sosem áll
 * be (`waitForStable` időtúllépés), a `waitForTargetsInView` viszont a mérhető feltételt nézi: érintési méret + a képernyőn
 * belül, egymást követő mintákon. Szerver nélkül (`setContent`), hogy a mérő maga legyen a vizsgált egység.
 */

const PAGE = (size: number) => `<!doctype html><html><body style="margin:0;width:360px;height:640px">
  <div id="scope"><button data-correct="true" id="t" style="position:absolute;top:200px;left:40px;width:${size}px;height:${size}px">7</button></div>
  <script>
    const el = document.getElementById("t");
    const t0 = performance.now();
    function tick(now) { el.style.transform = "translateX(" + (Math.sin((now - t0) / 300) * 100 + 100).toFixed(1) + "px)"; requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  </script></body></html>`;

test.use({ viewport: { width: 360, height: 640 } });

test("mozgó, érintési méretű cél: a stabil-doboz várakozás nem áll be, a mozgó-cél mód igen", async ({ page }) => {
  await page.setContent(PAGE(60));
  await expect(waitForStable(page, "#scope [data-correct]", 1_500)).rejects.toThrow();
  await waitForTargetsInView(page, "#scope [data-correct]", 3_000);
  // A jó válasz kattintása a pillanatnyi helyre (force) működik.
  await page.locator("#scope [data-correct='true']").click({ force: true });
});

test("mozgó, de túl kicsi cél (30 px): a mozgó-cél mód is bukik (a mérce nem lazul)", async ({ page }) => {
  await page.setContent(PAGE(30));
  await expect(waitForTargetsInView(page, "#scope [data-correct]", 1_500)).rejects.toThrow();
});
