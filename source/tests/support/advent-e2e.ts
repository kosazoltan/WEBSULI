import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";

import { GRADE_QUIZ_ITEMS } from "../../client/src/data/gradeQuizBank/index";
import { CHRISTMAS_ITEMS } from "../../shared/advent/christmasBank/index";

/**
 * Adventi naptár — közös böngészőteszt-segédek (docs/specs/2026-11-18-adventi-naptar.md 16.5).
 * Az e2e-szerveren a naptár CSAK az `X-Advent-Test-Now` fejléccel él; a kliens órája (a főoldali kártya helyfoglalása) a
 * Playwright órájával áll ugyanarra a pillanatra — a kliensben nincs külön tesztág.
 */
export const DEVICE_KEY = "websuli.advent.device";

const proxied = new WeakSet<BrowserContext>();

/**
 * Az e2e-szerver éles módban fut, ezért a munkamenet-süti Secure: a proxy mögötti https-t az `X-Forwarded-Proto` fejléc jelzi
 * (mint a többi munkamenetes böngészőtesztben) — enélkül a vendég nem kap munkamenetet, és a CSRF-token érvénytelen. A fejléc
 * CSAK az API-kérésekre kerül rá (a lap és a statikus fájlok kérése változatlan).
 */
async function proxyApi(context: BrowserContext): Promise<void> {
  if (proxied.has(context)) return;
  proxied.add(context);
  await context.route("**/api/**", (route) => route.fallback({ headers: proxyHeaders(route.request().headers()) }));
}

/**
 * A tesztkérés fejlécei „https-proxy mögött”: a szerver az Origin fejlécet a (proxy szerinti) https-hez méri — mint a
 * `jm0-game-score-privacy.spec.ts` és az `admin-allowlist.spec.ts`, az origin is https. Csak a TESZT kérésein él; a szerver és a
 * kliens kódja nem ismeri.
 */
export function proxyHeaders(original: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...original, "x-forwarded-proto": "https" };
  if (headers.origin?.startsWith("http://")) headers.origin = `https://${headers.origin.slice("http://".length)}`;
  return headers;
}

/** A szerver és a böngésző órája ugyanarra az időpontra (ISO, UTC). */
export async function setAdventTime(page: Page, iso: string): Promise<void> {
  await proxyApi(page.context());
  await page.context().setExtraHTTPHeaders({ "X-Advent-Test-Now": iso });
  await page.clock.setFixedTime(new Date(iso));
  await setClientAdventTime(page, iso);
}

/**
 * A KLIENS tesztideje (a főoldali kártya ebből számol szezont — terv 20.): teszt-kampós buildben a kártya csak akkor él, ha a
 * teszt a lap betöltése előtt beadja az időt. A null törli (a következő betöltéstől a kártya „kikapcsolt”). A szervertől függetlenül
 * állítható — így mérhető az elállított eszközóra.
 */
export async function setClientAdventTime(page: Page, iso: string | null): Promise<void> {
  await page.addInitScript((value) => { (window as unknown as { __websuliAdventTestNow?: string }).__websuliAdventTestNow = value ?? undefined; }, iso);
}

/** Tesztidő nélkül (e2e-módban ez a „naptár kikapcsolva” állapot); a böngésző órája marad, ahol volt. */
export async function clearAdventTime(page: Page): Promise<void> {
  await page.context().setExtraHTTPHeaders({});
  await setClientAdventTime(page, null);
}

/**
 * A véges (megnyíló, felragyogó) animációk végének megvárása, legfeljebb 2 mp-ig: a méret-mérés és a képernyőkép a kész
 * állapotot nézze, ne a 300 ms-os megnyílás közbeni (kicsinyített, áttűnő) képkockát.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.race([
    Promise.allSettled(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)),
    new Promise((done) => setTimeout(done, 2000)),
  ]));
}

/** Képernyőkép a tulajdonosnak: az `ADVENT_SHOT_DIR` mappába (ha meg van adva), teljes nézet. */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.ADVENT_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await settle(page);
  const size = page.viewportSize();
  await page.screenshot({ path: join(dir, `${name}-${size?.width ?? 0}x${size?.height ?? 0}.png`) });
}

const ALL = [...CHRISTMAS_ITEMS, ...GRADE_QUIZ_ITEMS];

/** A megnyitott kérdés helyes (vagy egy hibás) válaszának gombja — a teszt a bankból tudja, a kliens nem. */
export async function pickOption(page: Page, right: boolean, how: "tap" | "click" = "tap"): Promise<void> {
  // A válaszgombok a kérdés megjelenése után rövid ideig nem fogadnak bemenetet (élesítés) — a teszt megvárja, mint egy gyerek.
  await expect(page.locator('.advent-options[data-armed="true"]')).toBeVisible();
  const prompt = (await page.getByTestId("advent-question").innerText()).trim();
  const texts = await page.locator('[data-testid^="advent-option-"]').allInnerTexts();
  const options = texts.map((t) => t.trim());
  const item = ALL.find((q) => q.prompt === prompt && options.includes(q.options[q.correctIndex]!));
  if (!item) throw new Error(`a kérdés nincs a bankban: ${prompt}`);
  const correct = options.indexOf(item.options[item.correctIndex]!);
  const option = page.getByTestId(`advent-option-${right ? correct : (correct + 1) % 4}`);
  if (how === "tap") await option.tap(); else await option.click();
  await expect(page.getByTestId("advent-next")).toBeVisible();
}

/**
 * Évfolyamválasztás a felületen: koppintás az évfolyamra, majd a megerősítés („Igen, N. osztály”). A megerősítő lépés meglétét
 * külön teszt követeli meg; ez a segéd csak végigmegy rajta.
 */
export async function chooseGrade(page: Page, grade: number): Promise<void> {
  await page.getByTestId("advent-grade-" + grade).tap();
  await expect(page.getByTestId("advent-grade-confirm")).toBeVisible();
  await page.getByTestId("advent-grade-yes").tap();
}

/**
 * Koppintás egy ablakra, ahogy egy gyerek teszi: a kérdés bezárása utáni rövid védőidő (data-guard) letelte után — a védőidő
 * szándékos (a „Tovább” dupla koppintása ne érje a mögöttes ablakot), külön teszt méri.
 */
export async function tapDoor(page: Page, day: number, opts: { force?: boolean } = {}): Promise<void> {
  await expect(page.locator('[data-testid="advent-grid"][data-guard="false"]')).toBeVisible();
  await page.getByTestId("advent-door-" + day).tap(opts);
}

/** Egy ablak megnyitása és megválaszolása a felületen, majd „Tovább”. */
export async function playDoor(page: Page, day: number, right: boolean): Promise<void> {
  await tapDoor(page, day);
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await pickOption(page, right);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
}

type Json = Record<string, unknown>;

/**
 * Gyors előkészítés a szerveren át (a lap munkamenetével és eszközazonosítójával): évfolyam, majd a megadott napok
 * megválaszolása — `wrong` napokon minden próbával hibásan. A felület ezután a kész állapotból indul.
 */
export async function seedProgress(page: Page, iso: string, opts: { grade: number; days: number[]; wrong?: number[]; attempts?: number }): Promise<void> {
  // A kérések a LAPBÓL mennek (a böngésző sütijével és a környezet fejléceivel), így ugyanaz a munkamenet és eszköz játszik.
  await setAdventTime(page, iso);
  const post = (path: string, data: Json) => page.evaluate(async ({ path, data, key }) => {
    const device = window.localStorage.getItem(key);
    if (!device) throw new Error("nincs eszközazonosító — előbb nyisd meg az oldalt");
    const w = window as unknown as { __adventCsrf?: string };
    w.__adventCsrf ??= ((await (await fetch("/api/csrf-token", { credentials: "include" })).json()) as { csrfToken: string }).csrfToken;
    const res = await fetch(`/api/advent${path}`, {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": w.__adventCsrf },
      body: JSON.stringify({ device, ...data }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path}: ${res.status} ${text.slice(0, 160)}`);
    return JSON.parse(text) as Record<string, unknown>;
  }, { path, data, key: DEVICE_KEY });
  await post("/grade", { grade: opts.grade });
  for (const day of opts.days) {
    const isWrong = opts.wrong?.includes(day) ?? false;
    for (let attempt = 0; attempt < (isWrong ? opts.attempts ?? 1 : 1); attempt++) {
      const opened = (await post(`/doors/${day}/open`, {})) as { question: { id: string; options: string[] } };
      const item = ALL.find((q) => q.id === opened.question.id)!;
      const correct = opened.question.options.indexOf(item.options[item.correctIndex]!);
      await post(`/doors/${day}/answer`, { questionId: opened.question.id, pick: isWrong ? (correct + 1) % 4 : correct });
    }
  }
}

/**
 * Szöveg–háttér kontraszt a SZÁMÍTOTT színekből (WCAG 2 relatív fénysűrűség): az elem szövegszíne a tényleges háttér fölött.
 * A háttér az elemtől felfelé az első átlátszatlan színig összegződik (az áttetsző rétegek rákeverve). Így a teszt azt méri,
 * amit a gyerek lát — nem azt, hogy a CSS-ben szerepel-e egy szabály (review S3 B1).
 */
export async function contrastOf(page: Page, selector: string, what: "text" | "outline" = "text"): Promise<{ ratio: number; fg: string; bg: string; outlineStyle: string; outlineWidth: number }> {
  return page.locator(selector).first().evaluate((el, what) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (!m) return [0, 0, 0, 0];
      const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const backgroundFrom = (start: Element | null): Rgba => {
      const layers: Rgba[] = [];
      for (let node = start; node; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let bg: Rgba = [255, 255, 255, 1];
      for (const layer of layers.reverse()) bg = over(layer, bg);
      return bg;
    };
    // Az outline az elem KÖRÜL van: a háttere a szülő háttere.
    const bg = backgroundFrom(what === "outline" ? el.parentElement : el);
    const style = getComputedStyle(el);
    // Áttetszőség: az elem és ősei opacity-szorzata; a legfelső áttetsző ős MÖGÖTTI szín üt át a szövegen és a háttéren is.
    let alpha = 1;
    let topFaded: Element | null = null;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const o = parseFloat(getComputedStyle(node).opacity);
      if (Number.isFinite(o) && o < 1) { alpha *= o; topFaded = node; }
    }
    const behind = topFaded ? backgroundFrom(topFaded.parentElement) : bg;
    const fade = (c: Rgba): Rgba => over([c[0], c[1], c[2], alpha], behind);
    const fgSolid = over(parse(what === "outline" ? style.outlineColor : style.color), bg);
    const fg = alpha < 1 ? fade(fgSolid) : fgSolid;
    const bgSeen = alpha < 1 ? fade(bg) : bg;
    const lum = (c: Rgba) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const [hi, lo] = [lum(fg), lum(bgSeen)].sort((a, b) => b - a) as [number, number];
    const show = (c: Rgba) => "rgb(" + Math.round(c[0]) + ", " + Math.round(c[1]) + ", " + Math.round(c[2]) + ")";
    return { ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, fg: show(fg), bg: show(bgSeen), outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) || 0 };
  }, what);
}
