import { useEffect, useState } from "react";

/**
 * Igaz, amíg a görgető elem alja nincs elérve (van még lent tartalom). A túlcsordulás jelzéséhez (alsó átúszás + nyíl)
 * — docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md, mérő X8 (`data-scroll-hint="more" | "end"`).
 *
 * Az elemet callback-refből kapott állapotként kell átadni (`const [el, setEl] = useState<HTMLElement | null>(null)`,
 * `ref={setEl}`): a portálon (pl. Radix Dialog) át később csatolt elemnél egy sima `useRef` a hatás idején még üres.
 * A `content` (ha adott) méretváltozása is újraszámol (pl. szűrőváltás után más a lista hossza).
 */
export function useScrollHint(scroller: HTMLElement | null, content?: HTMLElement | null): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = scroller;
    if (!el) return;
    // 2 px tűrés — ugyanaz, mint a mérőé (`game-meta-quality` X2 / X8 görgető-feltétele).
    const update = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 2);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    if (content) ro?.observe(content);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [scroller, content]);
  return more;
}
