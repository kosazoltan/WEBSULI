import { expect, test } from "@playwright/test";

/**
 * #197 — a lecke-nézet kontrasztja VALÓDI renderben, világos ÉS sötét módban.
 *
 * A tulajdonos panasza (2026-09-06): „Világos és sötét módban is egy csomó szöveg
 * rejtve marad, mert fekete alapon fekete betűkkel írja."
 *
 * GYÖKÉROK (mérve): az `index.css` body-szabálya hardkódolt SÖTÉT hátteret
 * (#0A0E27) párosított a VILÁGOS téma sötét `--foreground` szövegszínével
 * (`@apply text-foreground`). Minden kártyán KÍVÜLI szöveg — szakasz-címsorok,
 * magyarázó bekezdések — sötét betűvel került sötét háttérre: 67/115 elem
 * kontrasztja 1.00–1.05 volt, AZONOSAN mindkét módban (ezért nem segített a
 * téma váltása).
 *
 * A mérés PIXEL-alapú, mert három számított mérőm is hazudott korábban:
 * gradiens gombokat bukásnak jelentett, a valódi hibát átengedte, majd
 * percentilissel a tökéletesen olvasható címeket is bukásnak vette. A kirajzolt
 * képpont az egyetlen, ami azt látja, amit a gyerek lát.
 */

const srgb = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const lum = (r: number, g: number, b: number) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a: number, b: number) => {
  const [hi, lo] = [a, b].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// LS-9: a három korosztály három tokenkészletet kap, ezért mindhárom bandet külön mérjük.
for (const { classroom, band } of [
  { classroom: 2, band: "kid" },
  { classroom: 7, band: "teen" },
  { classroom: 11, band: "senior" },
] as const)
for (const mode of ["light", "dark"] as const) {
  test(`a lecke minden szövege olvasható ${mode} módban (WCAG AA) — ${band}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await page.goto(`/__lesson-runtime-probe?classroom=${classroom}`);
    await expect(page.locator(`[data-band="${band}"]`)).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const boxes = await page.evaluate(() => {
      const out: Array<{
        tag: string; cls: string; text: string; size: number; weight: number;
        x: number; y: number; w: number; h: number;
      }> = [];
      document.body.querySelectorAll("*").forEach((el) => {
        let txt = "";
        el.childNodes.forEach((n) => {
          if (n.nodeType === 3) txt += n.textContent ?? "";
        });
        txt = txt.trim();
        if (txt.length < 3) return;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none" || st.opacity === "0") return;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") ?? "").slice(0, 90),
          text: txt.slice(0, 60),
          size: parseFloat(st.fontSize),
          weight: Number(st.fontWeight) || 400,
          x: r.x, y: r.y, w: r.width, h: r.height,
        });
      });
      return out;
    });

    expect(boxes.length, "a mérőoldalnak renderelnie kell szöveget").toBeGreaterThan(10);

    const shot = await page.screenshot({ fullPage: true });
    const { PNG } = await import("pngjs");
    const png = PNG.sync.read(shot);

    const failures: string[] = [];
    for (const b of boxes) {
      const x0 = Math.max(0, Math.round(b.x));
      const y0 = Math.max(0, Math.round(b.y));
      const x1 = Math.min(png.width, Math.round(b.x + b.w));
      const y1 = Math.min(png.height, Math.round(b.y + b.h));
      if (x1 - x0 < 4 || y1 - y0 < 4) continue;

      // Luminancia-hisztogram. Percentilis NEM használható: a szöveg a doboz kis
      // részét fedi, így egy tág <h1>-ben az 5. és a 95. percentilis is háttér —
      // mérve, a tökéletesen olvasható „Fotoszintézis" címre 1.22-t adott.
      // Háttér = a leggyakoribb (módusz) luminancia; szöveg = a háttértől
      // legtávolabbi, amiből legalább 8 pixel van (az antialiasing szélső
      // pixelei így nem számítanak szövegnek).
      const hist = new Map<number, number>();
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (png.width * y + x) << 2;
          const k = Math.round(lum(png.data[i], png.data[i + 1], png.data[i + 2]) * 100);
          hist.set(k, (hist.get(k) ?? 0) + 1);
        }
      }
      if (hist.size === 0) continue;

      let bgKey = 0;
      let bgCount = -1;
      for (const [k, n] of hist) {
        if (n > bgCount) {
          bgCount = n;
          bgKey = k;
        }
      }
      const bgLum = bgKey / 100;

      let inkLum = bgLum;
      let bestDist = 0;
      for (const [k, n] of hist) {
        if (n < 8) continue;
        const dist = Math.abs(k / 100 - bgLum);
        if (dist > bestDist) {
          bestDist = dist;
          inkLum = k / 100;
        }
      }

      const cr = ratio(inkLum, bgLum);
      const large = b.size >= 24 || (b.size >= 18.66 && b.weight >= 700);
      const need = large ? 3 : 4.5;
      if (cr < need) {
        failures.push(`${cr.toFixed(2)}<${need} | <${b.tag}> "${b.text.slice(0, 40)}" [${b.cls.slice(0, 50)}]`);
      }
    }

    expect(failures, `olvashatatlan szövegek (${mode}):\n${failures.join("\n")}`).toEqual([]);
  });
}

/**
 * A body szöveg/háttér PÁROSÍTÁSA — ez fogja meg a gyökérokot.
 *
 * A fenti tesztek a lecke-futtatót mérik, ami saját `bg-card` felületet kap,
 * ezért elfedik az `index.css` body-hibáját. Ez a teszt közvetlenül a body
 * öröklött színeit méri, kártya nélkül: minden kártyán kívüli szöveg ezt kapja.
 */
test("a body háttere és öröklött szövegszíne kontrasztos párt alkot", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe");
  await page.waitForLoadState("networkidle");

  const { color, bg } = await page.evaluate(() => {
    const st = getComputedStyle(document.body);
    return { color: st.color, bg: st.backgroundColor };
  });

  const parse = (s: string): [number, number, number] => {
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) throw new Error(`nem értelmezhető szín: ${s}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const [fr, fg, fb] = parse(color);
  const [br, bgg, bb] = parse(bg);
  const cr = ratio(lum(fr, fg, fb), lum(br, bgg, bb));

  expect(
    cr,
    `a body szövegszíne (${color}) és háttere (${bg}) nem olvasható párt alkot ` +
      `(kontraszt ${cr.toFixed(2)}, kell >= 4.5). Aki hátteret ad, adja meg a rá szánt szövegszínt is.`,
  ).toBeGreaterThanOrEqual(4.5);
});
