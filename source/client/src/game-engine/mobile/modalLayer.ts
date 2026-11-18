import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * S13 / átfogó review K1 + K3 — a portálos játék-fedőrétegek (szünet menü, eredményképernyő) közös modális
 * viselkedése, a kupon-lejárati párbeszéd (`CouponHud.tsx` `CouponExpiredOverlay`) mintájára:
 *  - nyitva a `body` többi gyereke `inert` (a játék, a kvíz-réteg, a magyarázókártya, egy késve érkező réteg is):
 *    se mutató, se fókusz, se képernyőolvasó nem éri el a háttér gombjait;
 *  - a fókusz a párbeszédben marad (Tab / Shift+Tab körbe jár, a kiszökő fókusz visszajön);
 *  - bezáráskor a fókusz visszakerül oda, ahol a megnyitás előtt volt.
 * A kupon-lejárat (`--game-z-coupon-expired`) mindenek fölött marad: azt nem tesszük inertté, és ha az már nyitva
 * van, ez a réteg nem nyúl a többi elemhez (a kupon-réteg kezeli őket).
 */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isCouponLayer(el: Element): boolean {
  return el.classList.contains("game-coupon-expired") || el.querySelector(".game-coupon-expired") !== null;
}

/** A nyitott réteg modális viselkedése. `layerRef` a `body` közvetlen gyereke (a portál gyökere). */
export function useModalLayer(open: boolean, layerRef: RefObject<HTMLElement | null>, dialogRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inerted = new Set<HTMLElement>();

    const inertSiblings = () => {
      if (document.documentElement.dataset.gameCouponExpired === "true") return;
      const layer = layerRef.current;
      for (const el of Array.from(document.body.children)) {
        if (!(el instanceof HTMLElement) || el === layer || (layer && el.contains(layer))) continue;
        if (el.hasAttribute("inert") || isCouponLayer(el) || el.tagName === "SCRIPT") continue;
        el.setAttribute("inert", "");
        inerted.add(el);
      }
    };
    inertSiblings();
    // A megnyitás pillanatában a portál gyökere még nem biztos, hogy a DOM-ban van (animált belépés): a később
    // érkező testvérek (és a saját gyökér megjelenése) után újra lefut.
    const observer = new MutationObserver(inertSiblings);
    observer.observe(document.body, { childList: true });

    const keepFocus = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || document.documentElement.dataset.gameCouponExpired === "true") return;
      // A kupon-lejárati párbeszéd a jelzője beállítása ELŐTT már fókuszt kér: azt nem húzzuk vissza.
      if (e.target instanceof Element && e.target.closest(".game-coupon-expired")) return;
      if (e.target instanceof Node && !dialog.contains(e.target)) dialog.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocus, true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || document.documentElement.dataset.gameCouponExpired === "true") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", keepFocus, true);
      window.removeEventListener("keydown", onKey);
      for (const el of inerted) el.removeAttribute("inert");
      if (opener && opener.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
    };
  }, [open, layerRef, dialogRef]);
}

/* ---------------- a szünet menü nyitott állapota (a magyarázókártya ehhez igazodik, K3) ---------------- */

let pauseOpenCount = 0;
let resultOpenCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** A `ResultScreen` jelzi a nyitott állapotát (S13 / B6: a jelvény-toast ilyenkor nem jelenik meg). */
export function setResultScreenOpen(open: boolean): void {
  resultOpenCount = Math.max(0, resultOpenCount + (open ? 1 : -1));
  emit();
}

export function isResultScreenOpen(): boolean {
  return resultOpenCount > 0;
}

/**
 * Igaz, amíg az eredményképernyő nyitva van. S13 / B6: a futás új jelvényei az eredménykártya közös sorában
 * (`ResultScreen` `badges`) jelennek meg, ezért a jobb felső `AchievementToast` ilyenkor nem rajzol (korábban mobilon
 * az eredménykártya gombjaira lógott).
 */
export function useResultScreenOpen(): boolean {
  return useSyncExternalStore(subscribe, isResultScreenOpen, () => false);
}

/** A `PauseMenu` jelzi a nyitott állapotát (több példány esetén számlálóval). */
export function setPauseMenuOpen(open: boolean): void {
  pauseOpenCount = Math.max(0, pauseOpenCount + (open ? 1 : -1));
  if (typeof document !== "undefined") {
    if (pauseOpenCount > 0) document.documentElement.dataset.gamePaused = "true";
    else delete document.documentElement.dataset.gamePaused;
  }
  emit();
}

export function isPauseMenuOpen(): boolean {
  return pauseOpenCount > 0;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ---------------- a lejárt kupon (#58): a játék megáll, a szünet menü nem rajzol ---------------- */

/**
 * #58 (docs/specs/2026-11-16-e2e-ingadozok-2.md): a lejárt kupon a játékot a SAJÁT szünet-útján állítja meg (a
 * `GameShell` automatikus szünete, `GAME_HALT_EVENT`) — így minden játék hurka, órája és bemenete áll, hét külön
 * folt nélkül. A szünet menü ilyenkor nem rajzol: a lejárati párbeszéd az egyetlen réteg („Vissza a leckéhez”).
 */
export const GAME_HALT_EVENT = "websuli:game-halt";

let couponExpired = false;

export function setCouponExpired(expired: boolean): void {
  if (couponExpired === expired) return;
  couponExpired = expired;
  emit();
}

export function isCouponExpired(): boolean {
  return couponExpired;
}

export function useCouponExpired(): boolean {
  return useSyncExternalStore(subscribe, isCouponExpired, () => false);
}

/* A lejárt kupon alatt a játékok képkocka-hurka is áll (#58): `requestGameFrame` a `requestAnimationFrame` helyett. */

const parkedFrames = new Map<number, FrameRequestCallback>();
let nextParkedId = -1;

/**
 * Mint a `requestAnimationFrame`, de a lejárt kupon alatt a kérést félreteszi (nincs képkocka, nincs GPU-munka); ha a
 * kupon újra érvényes lenne, a félretett kérések a következő képkockában futnak. A hívó a visszakapott azonosítót a
 * `cancelGameFrame`-mel törli (a félretett kérésé negatív).
 */
export function requestGameFrame(cb: FrameRequestCallback): number {
  if (!couponExpired) return requestAnimationFrame(cb);
  const id = nextParkedId--;
  parkedFrames.set(id, cb);
  return id;
}

export function cancelGameFrame(id: number): void {
  if (id < 0) parkedFrames.delete(id);
  else cancelAnimationFrame(id);
}

subscribe(() => {
  if (couponExpired || parkedFrames.size === 0 || typeof requestAnimationFrame === "undefined") return;
  for (const [id, cb] of Array.from(parkedFrames)) {
    requestAnimationFrame((t) => {
      // A közben lecsatolt hívó (`cancelGameFrame`) kérése nem fut le.
      if (!parkedFrames.delete(id)) return;
      cb(t);
    });
  }
});

/**
 * Igaz, amíg a szünet menü nyitva van. A `QuizFeedbackCard` ezzel rejti el magát szünetben (K3): a kártya (z 90)
 * különben a szünet menü (z 80) fölé kerülne, a menü gombjai elérhetetlenek lennének, az Esc pedig a láthatatlan
 * menüt „folytatná”. A Tornado lapszintű `feedback && !paused` megoldásának közös változata, mind a 7 játékra.
 */
export function usePauseMenuOpen(): boolean {
  return useSyncExternalStore(subscribe, isPauseMenuOpen, () => false);
}
