/**
 * Spec 2026-09-24 — régi kliens + új adat. Egylapos alkalmazásként a telepítés előtt megnyitott fül a régi
 * kódot futtatja, amíg újra nem töltik. Ha egy lecke nem olvasható, megnézzük, van-e újabb build, és
 * egyszer (munkamenetenként) magunktól újratöltünk — a gyereknek nem kell tudnia a frissítésről.
 */
const RELOAD_KEY = "websuli.versionSkewReload";

/** True when the served index.html points at a different main bundle than the one this page loaded. */
export function newerBuildAvailable(html: string, loadedSrcs: string[]): boolean {
  const served = html.match(/assets\/main-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!served) return false;
  const loaded = loadedSrcs.map((src) => src.match(/assets\/main-[A-Za-z0-9_-]+\.js/)?.[0]).filter(Boolean);
  return loaded.length > 0 && !loaded.includes(served);
}

/** Reloads at most once per session when a newer build is live. Returns whether a reload was started. */
export async function reloadIfNewerBuild(): Promise<boolean> {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    const html = await (await fetch("/", { cache: "no-store" })).text();
    const loaded = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).map((s) => s.src);
    if (!newerBuildAvailable(html, loaded)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false; // offline or storage blocked: the manual „Frissítés” button remains.
  }
}
