import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import type { SafeInsets } from "./game-mobile-quality";

/**
 * A közös mobil mérő (`game-mobile-quality.ts`, M1–M12) testvére a játékok NEM játék közbeni („meta”) képernyőire:
 * garázs, bolt, pályaválasztó, beállítás, ranglista, statisztika, „hogyan játssz”, játéklista
 * (docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md, „Mérő”). A 2026-11-16-i tulajdonosi hibajelentés óta
 * (Vihargarázs: a járműszűrő és a járműlista egy rögzített magasságú, levágó dobozban tűnt el) ezeket is mérjük.
 *
 * Mérce (ugyanaz minden képernyőn; az M1–M12 mércéjét nem érinti):
 *  - X1 nincs vízszintes oldaltúlcsordulás (≤ 2 px);
 *  - X2 nincs görgő-a-görgőben: legfeljebb EGY függőlegesen görgethető terület (a lap maga VAGY egy belső doboz),
 *    vízszintes lapozósor megengedett;
 *  - X3 minden látható interaktív elem a nézetbe hozható (görgetéssel), ott TELJESEN látszik (egy ős sem vágja le,
 *    a biztonsági sáv sem takarja), és a közepére koppintva önmagát találjuk el (nincs rajta takaró réteg);
 *  - X4 a lap alja elérhető: a legalsó görgetés után az utolsó interaktív elem a biztonsági sáv fölött teljesen látszik;
 *  - X5 érintési cél ≥ 44 px (a rejtett / `aria-hidden` elemek kivételével; a letiltott gomb is mérendő, mert látszik);
 *  - X6 nincs üres kép-helykitöltő: 0 méretű kép / vászon, betöltetlen `<img>`, vagy ≥ 32 px-es, gyermek és szöveg
 *    nélküli színátmenetes doboz („üres színes négyzet”);
 *  - X7 minden látható szöveg ≥ 12 px;
 *  - X8 a belső (nem a lap) függőleges görgető jelzi a túlcsordulást, és az aljára érve a jelzés eltűnik
 *    (`scrollHintViolations`).
 * Szigorítás (#467 review): az X3 hibának veszi, ha az elem csak egy `overflow: hidden` ős programbeli elgörgetésével
 * hozható elő (a `scrollIntoView` azt is görgeti, a felhasználó nem); az X4 a legalsó SZÖVEGES elemet is nézi.
 */

export const META_MIN_TARGET = 44;

export type MetaViolation = { rule: "X1" | "X2" | "X3" | "X4" | "X5" | "X6" | "X7" | "X8"; detail: string };

/** Álló nézetben felül a kivágás / állapotsor, alul a kezelősáv; fekvőben oldalt (a közös mérő M4 értékei). */
export function insetsFor(viewport: { width: number; height: number }): SafeInsets {
  return viewport.width > viewport.height ? { top: 0, right: 44, bottom: 21, left: 44 } : { top: 44, right: 0, bottom: 34, left: 0 };
}

/**
 * Egy meta-képernyő mérése a `scope` szelektoron belül (alap: a játék gyökere). Visszaadja a szabálysértéseket;
 * üres tömb = megfelel. A mérés görget (ablak és belső dobozok), a végén a lap tetejére áll vissza.
 */
export async function measureMetaScreen(
  page: Page,
  opts: { scope?: string; insets: SafeInsets; minTarget?: number },
): Promise<MetaViolation[]> {
  return page.evaluate(
    ({ scopeSel, s, minTarget }) => {
      const out: Array<{ rule: string; detail: string }> = [];
      const scope = document.querySelector<HTMLElement>(scopeSel) ?? document.body;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const de = document.documentElement;
      const label = (el: Element) =>
        (el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}] ` : "") +
        ((el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50));

      // X1
      const ox = de.scrollWidth - de.clientWidth;
      if (ox > 2) out.push({ rule: "X1", detail: `vízszintes túlcsordulás ${ox}px` });

      // X2 — függőleges görgetők: egyik sem lehet egy másikon (vagy a görgő lapon) belül. Egymás melletti, nem görgő
      // lapon álló hasábok (fekvő kéthasábos elrendezés) megengedettek.
      const isScroller = (el: HTMLElement) => {
        const st = getComputedStyle(el);
        return (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight - el.clientHeight > 2 && el.clientHeight > 0;
      };
      const name = (el: HTMLElement) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} (${el.clientHeight}/${el.scrollHeight}px)`;
      // A lap csak akkor „görgő”, ha a felhasználó görgetheti (a modális ablak a body görgetését zárolja: overflow: hidden).
      const pageScrolls =
        de.scrollHeight - de.clientHeight > 2 &&
        getComputedStyle(document.body).overflowY !== "hidden" &&
        getComputedStyle(de).overflowY !== "hidden";
      for (const el of [scope, ...Array.from(scope.querySelectorAll<HTMLElement>("*"))]) {
        if (!isScroller(el)) continue;
        if (pageScrolls) {
          out.push({ rule: "X2", detail: `görgő-a-görgőben: a lap + ${name(el)}` });
          continue;
        }
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (isScroller(p)) {
            out.push({ rule: "X2", detail: `görgő-a-görgőben: ${name(p)} + ${name(el)}` });
            break;
          }
        }
      }

      const visible = (el: HTMLElement) => {
        if (el.closest('[aria-hidden="true"]')) return false;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none") return false;
        if (el.offsetParent === null && st.position !== "fixed") return false;
        // A csukott `<details>` tartalma (Chrome: `content-visibility: hidden`) nem látszik, de van doboza.
        if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      };
      /** Az elem doboza a nézetablak (biztonsági sávval szűkítve) és minden nem-látható túlcsordulású ős metszetében. */
      const clipped = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        let top = r.top;
        let left = r.left;
        let right = r.right;
        let bottom = r.bottom;
        for (let p = el.parentElement; p && p !== document.body && p !== de; p = p.parentElement) {
          const st = getComputedStyle(p);
          if (st.overflowX !== "visible" || st.overflowY !== "visible") {
            const pr = p.getBoundingClientRect();
            if (st.overflowY !== "visible") {
              top = Math.max(top, pr.top);
              bottom = Math.min(bottom, pr.bottom);
            }
            if (st.overflowX !== "visible") {
              left = Math.max(left, pr.left);
              right = Math.min(right, pr.right);
            }
          }
        }
        top = Math.max(top, s.top);
        left = Math.max(left, s.left);
        right = Math.min(right, vw - s.right);
        bottom = Math.min(bottom, vh - s.bottom);
        return { r, top, left, right, bottom, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
      };
      const hit = (el: HTMLElement, c: { top: number; left: number; w: number; h: number }) => {
        const x = c.left + c.w / 2;
        const y = c.top + c.h / 2;
        const at = document.elementFromPoint(x, y);
        // A letiltott gomb (`disabled:pointer-events-none`) nem található el — ilyenkor az a jó, ha a pont a saját ősére
        // esik (nincs rajta idegen réteg).
        const passThrough = getComputedStyle(el).pointerEvents === "none";
        return { ok: !!at && (at === el || el.contains(at) || (passThrough && at.contains(el))), at };
      };

      const nodes = Array.from(
        scope.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input:not([type="hidden"]), select, summary'),
      ).filter(visible);

      for (const el of nodes) {
        const r0 = el.getBoundingClientRect();
        // X5
        if (r0.width < minTarget || r0.height < minTarget) {
          out.push({ rule: "X5", detail: `${label(el)} ${Math.round(r0.width)}×${Math.round(r0.height)}px < ${minTarget}` });
        }
        // X3
        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
        // A `scrollIntoView` az `overflow: hidden` dobozt is elgörgeti — a felhasználó viszont nem tudja. Ha ilyen ős
        // elmozdult, az elem csak programból érhető el: hiba, és a dobozt visszaállítjuk (orkesztrátori review, #467).
        let hiddenScroll: string | null = null;
        for (let p = el.parentElement; p && p !== document.body && p !== de; p = p.parentElement) {
          const st = getComputedStyle(p);
          const hidY = st.overflowY === "hidden" || st.overflowY === "clip";
          const hidX = st.overflowX === "hidden" || st.overflowX === "clip";
          if ((hidY && p.scrollTop !== 0) || (hidX && p.scrollLeft !== 0)) {
            hiddenScroll ??= `${p.tagName.toLowerCase()}.${String(p.className).split(" ").slice(0, 3).join(".")}`;
            if (hidY) p.scrollTop = 0;
            if (hidX) p.scrollLeft = 0;
          }
        }
        if (hiddenScroll) {
          out.push({ rule: "X3", detail: `${label(el)} csak programból görgethető elő (overflow: hidden ős: ${hiddenScroll})` });
          continue;
        }
        const c = clipped(el);
        const area = c.r.width * c.r.height;
        if (area > 0 && (c.w * c.h) / area < 0.98) {
          out.push({ rule: "X3", detail: `${label(el)} levágva: látható ${Math.round(c.w)}×${Math.round(c.h)} / ${Math.round(c.r.width)}×${Math.round(c.r.height)}px` });
          continue;
        }
        const h = hit(el, c);
        if (!h.ok) out.push({ rule: "X3", detail: `${label(el)} takarva: ${h.at ? label(h.at) : "semmi"}` });
      }

      // X4 — a lap alja: minden görgető a végére, a LEGALSÓ interaktív elem (a lap tetejétől mért legnagyobb aljú, a lap
      // görgetésétől függetlenül) a biztonsági sáv fölött teljesen látszik.
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      let last: HTMLElement | undefined;
      let lastBottom = -Infinity;
      // Jelöltek: az interaktív elemek ÉS a szöveget hordozó elemek (a lap alján lévő statisztika-sor is elérhető kell legyen).
      const texty = Array.from(scope.querySelectorAll<HTMLElement>("*")).filter((el) => {
        if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "")) return false;
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      });
      for (const el of [...nodes, ...texty]) {
        const b = el.getBoundingClientRect().bottom + window.scrollY;
        if (b >= lastBottom) {
          lastBottom = b;
          last = el;
        }
      }
      // A lapot addig görgetjük, hogy az elem alja a biztonsági sáv fölé kerüljön — vagy amennyire lehet (a lap alja).
      const maxScroll = de.scrollHeight - de.clientHeight;
      window.scrollTo({ top: Math.min(maxScroll, Math.max(0, lastBottom - (vh - s.bottom) + 1)), behavior: "instant" as ScrollBehavior });
      for (const el of [scope, ...Array.from(scope.querySelectorAll<HTMLElement>("*"))]) {
        const st = getComputedStyle(el);
        if ((st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      }
      if (last) {
        const c = clipped(last);
        const area = c.r.width * c.r.height;
        if (area > 0 && (c.w * c.h) / area < 0.98) {
          out.push({ rule: "X4", detail: `a lap alján az utolsó elem (${label(last)}) nem látszik teljesen: alja ${Math.round(c.r.bottom)}px, a sáv fölötti határ ${vh - s.bottom}px` });
        }
      }

      // X6 — üres kép-helykitöltők
      for (const el of Array.from(scope.querySelectorAll<HTMLElement>("img, canvas, svg[role='img'], [role='img']"))) {
        if (!visible(el.parentElement ?? el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) out.push({ rule: "X6", detail: `0 méretű kép: ${label(el)}` });
        else if (el instanceof HTMLImageElement && el.complete && el.naturalWidth === 0) out.push({ rule: "X6", detail: `betöltetlen kép: ${el.src.slice(-60)}` });
      }
      for (const el of Array.from(scope.querySelectorAll<HTMLElement>("div, span"))) {
        if (el.children.length > 0 || (el.textContent ?? "").trim() !== "" || !visible(el)) continue;
        if (el.getAttribute("role") === "img" || el.getAttribute("aria-label")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 32 || r.height < 32) continue;
        if (/gradient/.test(getComputedStyle(el).backgroundImage)) {
          out.push({ rule: "X6", detail: `üres színátmenetes helykitöltő ${Math.round(r.width)}×${Math.round(r.height)}px` });
        }
      }

      // X7 — olvashatatlan szöveg
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent || "").trim();
        const parent = n.parentElement;
        if (!text || !parent || parent.closest('[aria-hidden="true"], script, style, noscript')) continue;
        if (!visible(parent)) continue;
        const px = parseFloat(getComputedStyle(parent).fontSize);
        if (px < 12) out.push({ rule: "X7", detail: `${px}px: ${text.slice(0, 40)}` });
      }

      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      // A megadott szelektor hiánya maga is hiba (rossz képernyőn mérnénk).
      if (!document.querySelector(scopeSel)) out.push({ rule: "X3", detail: `nincs ${scopeSel}` });
      return out;
    },
    { scopeSel: opts.scope ?? "[data-game]", s: opts.insets, minTarget: opts.minTarget ?? META_MIN_TARGET },
  ) as Promise<MetaViolation[]>;
}

/**
 * X8 — a belső (nem a lap) függőleges görgető JELZI a túlcsordulást (orkesztrátori review, #467): a lap tetején
 * `data-scroll-hint="more"` és látható `[data-scroll-fade]` jelzés a görgető keretében; az aljára görgetve
 * `data-scroll-hint="end"`, és a jelzés eltűnik. (A `client/src/tornado/ScrollPane.tsx` ezt adja.)
 */
export async function scrollHintViolations(page: Page, scope = "[data-game]"): Promise<MetaViolation[]> {
  const out: MetaViolation[] = [];
  const count = await page.evaluate((sel) => {
    const root = document.querySelector(sel) ?? document.body;
    let n = 0;
    for (const el of [root as HTMLElement, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
      const st = getComputedStyle(el);
      if ((st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight - el.clientHeight > 2 && el.clientHeight > 0) {
        el.setAttribute("data-meta-scroller", String(n++));
      }
    }
    return n;
  }, scope);
  for (let i = 0; i < count; i++) {
    const sel = `[data-meta-scroller="${i}"]`;
    const fadeVisible = () =>
      page.evaluate((s) => {
        const el = document.querySelector<HTMLElement>(s)!;
        const fade = el.parentElement?.querySelector<HTMLElement>("[data-scroll-fade]");
        if (!fade) return false;
        const r = fade.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(fade).visibility !== "hidden";
      }, sel);
    await page.evaluate((s) => {
      document.querySelector<HTMLElement>(s)!.scrollTop = 0;
    }, sel);
    const name = await page.evaluate((s) => {
      const el = document.querySelector<HTMLElement>(s)!;
      return `${el.getAttribute("data-testid") ?? el.tagName.toLowerCase()} (${el.clientHeight}/${el.scrollHeight}px)`;
    }, sel);
    const top = await page
      .waitForFunction((s) => document.querySelector(s)?.getAttribute("data-scroll-hint") === "more", sel, { timeout: 2_000 })
      .then(() => true, () => false);
    if (!top || !(await fadeVisible())) {
      out.push({ rule: "X8", detail: `${name}: a túlcsordulás nincs jelezve (data-scroll-hint="more" + látható [data-scroll-fade] kell)` });
      continue;
    }
    await page.evaluate((s) => {
      const el = document.querySelector<HTMLElement>(s)!;
      el.scrollTop = el.scrollHeight;
    }, sel);
    const end = await page
      .waitForFunction((s) => document.querySelector(s)?.getAttribute("data-scroll-hint") === "end", sel, { timeout: 2_000 })
      .then(() => true, () => false);
    if (!end || (await fadeVisible())) out.push({ rule: "X8", detail: `${name}: az aljára görgetve a jelzés nem tűnik el` });
    await page.evaluate((s) => {
      const el = document.querySelector<HTMLElement>(s)!;
      el.scrollTop = 0;
      el.removeAttribute("data-meta-scroller");
    }, sel);
  }
  return out;
}

/** Szigorú állítás: a képernyő minden X-szabálynak megfelel (X1–X8). */
export async function expectMetaScreenOk(page: Page, where: string, opts: { scope?: string; insets: SafeInsets }): Promise<void> {
  const v = [...(await measureMetaScreen(page, opts)), ...(await scrollHintViolations(page, opts.scope))];
  expect(v.map((x) => `${x.rule} ${x.detail}`), `${where}: meta-képernyő mérés`).toEqual([]);
}

/** Képernyőkép (CSS-pixeles JPEG 70) a `GAME_MOBILE_SHOT_DIR` mappába, ha meg van adva — a közös mérő mintája. */
export async function metaShot(page: Page, name: string, fullPage = false): Promise<void> {
  const dir = process.env.GAME_MOBILE_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const vp = page.viewportSize();
  await page.screenshot({ path: join(dir, `${name}-${vp?.width ?? 0}x${vp?.height ?? 0}.jpg`), type: "jpeg", quality: 70, scale: "css", fullPage });
}
