import { test, expect, devices, type Page } from "@playwright/test";

/**
 * G-8 — a telefonos vezérlés E2E bizonyítéka.
 *
 * A statikus őr (`tests/game-touch-controls.test.ts`) azt méri, hogy a kódban
 * nincs `onPointerLeave`-elengedés és van `touch-action: none`. Ez a suite azt
 * méri, ami ebből a gyerek keze alatt lesz — a két hiba, amit élesben jeleztek:
 *
 *  1. „megáll az irányítás": a hüvelykujj lecsúszik a gombról, és a jármű
 *     megáll, pedig a gyerek nem engedte fel;
 *  2. „kijelöli az elemet": hosszú nyomásra a böngésző kijelöl és görget.
 *
 * MÉRÉSI TANULSÁG (2026-09-07): a HUD `km/h` értéke a TORNÁDÓ szélsebessége, nem
 * a járműé — az első mérésem ezért semmit nem bizonyított. A jármű mozgását a
 * tornádótól mért távolság (`hud.distanceKm`) mutatja. Mivel a tornádó maga is
 * mozog, abszolút küszöb helyett ÖSSZEHASONLÍTUNK: a gáz alatt megtett út
 * legyen érdemben nagyobb, mint tétlenül. Így a mérés a játék saját
 * mozgásától független.
 */

test.use({ ...devices["Pixel 7"], hasTouch: true, isMobile: true });

/**
 * A HUD-ban kiírt távolság a tornádótól, km-ben; NaN, ha nincs kiírva.
 *
 * A negatív előretekintés nem elhanyagolható: a HUD-ban a szélsebesség
 * („13 km/h") ELŐBB áll, mint a távolság („3.56 km"), és a `km\b` mintára a
 * „13 km/h" is illeszkedik — az első mérésem emiatt végig a szelet olvasta.
 */
async function distanceKm(page: Page): Promise<number> {
  const text = await page.locator("body").innerText();
  const match = text.match(/([\d.]+)\s*km(?!\/)/);
  return match ? Number(match[1]) : Number.NaN;
}

/** Mennyit változott a távolság `ms` alatt. */
async function travelled(page: Page, ms: number): Promise<number> {
  const before = await distanceKm(page);
  await page.waitForTimeout(ms);
  const after = await distanceKm(page);
  return Math.abs(after - before);
}

async function startFirstLevel(page: Page) {
  await page.goto("/games/tornado-hunter-200", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /vadászat|indítás|start|rajta/i }).first().click();
  await page.getByRole("button", { name: /^1$/ }).first().click();

  await expect(page.locator('[data-testid="tornado-touch-controls"]')).toBeVisible({
    timeout: 15_000,
  });

  // MÉRÉSI TANULSÁG (2026-09-20): a szint indulásakor a tornádó BELÉP a pályára, és a HUD távolsága
  // 0-ról a valódi értékre ugrik (mérve: 0.00 → 3.58 km egyetlen másodperc alatt). Az első mérés
  // ezt az ugrást kapta el, nem a sodródást, és a tétlen alapérték százszorosan túlbecsült lett.
  // Beállás után a tétlen sodródás mérve ~0,02 km/s (8 mintából, egyenletes).
  await page.waitForTimeout(3000);
}

/*
 * SPEC-VÁLTOZÁS 2026-09-20 (`docs/specs/2026-09-20-joystick-minden-jatekban.md`): a gyorsítás a
 * külön „Gáz" gombról a köralakú tárcsára került, mert az is IRÁNY. A mérés tárgya változatlan —
 * lecsúszó ujj, felengedés, gesztus-tiltás —, csak a vezérlő lett más.
 */
async function joystickBox(page: Page) {
  const joystick = page.locator('[data-testid="virtual-joystick"]').first();
  const box = await joystick.boundingBox();
  expect(box, "nincs köralakú tárcsa a képernyőn").not.toBeNull();
  return box!;
}

/** Lenyomás a tárca közepén, majd ELŐRE (fölfelé) húzás — a `dy` pixelben. */
async function pushForward(page: Page, box: { x: number; y: number; width: number; height: number }, dy: number) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - dy, { steps: 8 });
  return { cx, cy };
}

test("a vezérlés nem szakad meg, ha a hüvelykujj lecsúszik a tárcsáról", async ({ page }) => {
  await startFirstLevel(page);
  const box = await joystickBox(page);

  // 44 px az érintési minimum; ennél kisebb tárcsát a gyerek nem talál el.
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  const idle = await travelled(page, 2000);

  const { cx, cy } = await pushForward(page, box, 40);
  await page.waitForTimeout(400);
  // Jóval a tárcsán kívülre — pontosan az a mozdulat, ami eddig megállította a járművet.
  // A pointer capture miatt a vezérlésnek ilyenkor is élnie kell, teljes kitéréssel.
  await page.mouse.move(cx, cy - 260, { steps: 12 });

  const held = await travelled(page, 2000);
  await page.mouse.up();

  expect(
    held,
    `a jármű nem gyorsult a lecsúszott ujj alatt: tétlenül ${idle.toFixed(3)} km, ` +
      `tárcsával ${held.toFixed(3)} km`,
  ).toBeGreaterThan(idle * 1.5);
});

test("felengedés után a tárcsa tényleg elenged", async ({ page }) => {
  await startFirstLevel(page);
  const box = await joystickBox(page);

  await pushForward(page, box, 120);
  await page.waitForTimeout(400);
  const held = await travelled(page, 1200);
  await page.mouse.up();

  // A jármű tehetetlensége miatt lassan gurul ki, ezért hagyunk időt a lassulásra.
  await page.waitForTimeout(2500);
  const released = await travelled(page, 1200);

  expect(
    released,
    `beragadt gáz: nyomva ${held.toFixed(3)} km, felengedve ${released.toFixed(3)} km`,
  ).toBeLessThan(held);
});

test("a vezérlőfelület letiltja a böngésző kijelölését és gesztusait", async ({ page }) => {
  await startFirstLevel(page);

  const style = await page.evaluate(() => {
    const dial = document.querySelector('[data-testid="virtual-joystick"]');
    if (!dial) return null;
    const cs = getComputedStyle(dial);
    return { touchAction: cs.touchAction, userSelect: cs.userSelect };
  });

  expect(style, "nincs tárcsa a lapon").not.toBeNull();
  expect(style!.touchAction, "a böngésző görgetne és kijelölne").toBe("none");
  expect(style!.userSelect, "hosszú nyomásra kijelölne a tárcsán").toBe("none");
});

/* ------------------------ G-13: 44 px-es érintési cél ------------------------ */

/**
 * Mérve (2026-09-07, Pixel 7, éles build): mind a hét játék NYITÓ képernyőjén
 * a hangkapcsoló 32×32 px, a „Játékok" visszalépés 36 px magas, ötben pedig
 * maga az INDÍTÓ gomb — a lap legfontosabb gombja — 26 px magas volt, mert a
 * `Button size="lg"` osztálya (`h-13`) nem létező Tailwind-lépcsőre hivatkozott.
 * A festett pirula közben nagyobbnak látszott a valóban kattintható területnél,
 * ezért a hiba képernyőképen nem látszik — csak méréssel.
 *
 * A 44 px az iOS/Android akadálymentességi minimum; a leckefuttatóra a
 * `lesson-band-visual.spec.ts` már ugyanezt kéri. Ez a suite a játékokra kéri.
 */
const GAME_PATHS = [
  "/games/tornado-hunter-200",
  "/games/space-asteroid-quiz",
  "/games/speed-quiz-math",
  "/games/brain-rot-steal",
  "/games/block-craft-quiz",
  "/games/tsunami-english",
  "/games/word-ladder-hu-en",
];

for (const path of GAME_PATHS) {
  test(`${path}: minden látható vezérlő eléri a 44 px-t`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], [role="button"]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            t: (
              (el as HTMLElement).innerText ||
              el.getAttribute("aria-label") ||
              el.getAttribute("data-testid") ||
              el.tagName
            )
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 30),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        })
        // A 0 szélesség rejtett elem, nem érintési cél.
        .filter((x) => x.w > 0 && (x.w < 44 || x.h < 44)),
    );

    expect(small, `44 px alatti érintési célok: ${JSON.stringify(small)}`).toEqual([]);
  });
}
