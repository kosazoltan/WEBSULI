import type { Page } from "@playwright/test";

/* Az adminfelület reszponzivitás-revíziójának közös segédei (docs/specs/2026-10-19-admin-reszponzivitas.md). */

export const DEVICES = [
  { name: "magicv6-kulso", width: 393, height: 780 },
  { name: "magicv6-kulso-nagybetu", width: 360, height: 700 },
  { name: "magicv6-belso", width: 835, height: 810 },
  { name: "magicv6-belso-fekvo", width: 904, height: 740 },
] as const;

const now = new Date().toISOString();
const files = [
  { id: "f-lesson", title: "Kéttagú kifejezések négyzete – azonos kifejezések párosítása", contentType: "lesson", classroom: 9, createdAt: now, userId: "admin-fixture" },
  { id: "f-html", title: "4. osztály - Angol nyelvtan - Countable & Uncountable nouns", contentType: "html", classroom: 4, createdAt: now, userId: "admin-fixture" },
];
const draft = { jobId: "job-1", title: "Kéttagú kifejezések négyzete – azonos kifejezések párosítása", subject: "Matematika", classroom: 9, state: "error",
  stage: "gate", saved: { sections: 3, banks: 7 }, canResume: true, error: "Megállt: lektorálás: experience.tasks[29]: Mi hamis: a rubrikák továbbra sem követelik a teljes eredményt | Bizonyíték: 28-nál „ab + 4b” 1 pont | Javítás iránya: required + 7 [12x]; 17 [9]; 21 [2a²]", createdAt: now, updatedAt: now };

export async function mockAdmin(page: Page) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/user") return route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Kósa", email: "admin@example.test" } });
    if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "probe" } });
    if (path === "/api/html-files") return route.fulfill({ json: files });
    if (path === "/api/studio/drafts") return route.fulfill({ json: [draft] });
    // A szerver válaszalakja: { runs: [...] } (WorkflowMonitor) — a puszta [] ál-adat a komponenst összeomlasztaná.
    if (path === "/api/studio/workflows") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/studio/skills/tananyag-javito") return route.fulfill({ json: { snapshot: { version: "v1", rules: [] } } });
    if (path === "/api/studio/skills/tananyag-javito/roles") return route.fulfill({ json: { roles: [{ role: "repair", version: "1", text: "Szabály" }] } });
    return route.fulfill({ json: [] });
  });
}

/** A látható, kattintható elemek elérhetősége: görgetés után teljesen a nézetben, és felül nem takarja más (pl. az alsó menü). */
export async function unreachable(page: Page, scope = "body") {
  return page.evaluate(async (scopeSel) => {
    const root = document.querySelector(scopeSel) ?? document.body;
    const nav = document.querySelector('nav[aria-label="Admin navigáció"]');
    const els = [...root.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]):not([type=file]), textarea, select, [role=tab]")]
      .filter((el) => !nav?.contains(el) && !el.closest("[aria-hidden=true]"));
    const out: string[] = [];
    for (const el of els) {
      const st = getComputedStyle(el);
      let r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
      // A letiltott gomb `pointer-events: none` — az elementFromPoint a szülőt adná; a takarást a látható dobozán mérjük.
      const disabled = (el as HTMLButtonElement).disabled || st.pointerEvents === "none";
      // Azonnali görgetés: az oldal `scroll-behavior: smooth` — animáció közben mérve hamis „kilóg” jönne.
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null))));
      r = el.getBoundingClientRect();
      const label = `${el.tagName.toLowerCase()} „${(el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("placeholder") ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}”`;
      const inView = r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
      if (!inView && r.height < innerHeight * 0.9 && r.width < innerWidth) { out.push(`${label}: kilóg a nézetből (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`); continue; }
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2), cy = Math.min(Math.max(r.top + Math.min(r.height, 40) / 2, 1), innerHeight - 2);
      const hit = document.elementFromPoint(cx, cy);
      if (disabled) { if (hit && nav?.contains(hit)) out.push(`${label}: takarja az ALSÓ MENÜ`); continue; }
      if (hit && hit !== el && !el.contains(hit) && !(el as HTMLInputElement).labels?.length && !hit.closest("label")?.contains(el)) {
        out.push(`${label}: takarja: ${hit.tagName.toLowerCase()}.${String(hit.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}${nav?.contains(hit) ? " (ALSÓ MENÜ)" : ""}`);
      }
    }
    return [...new Set(out)];
  }, scope);
}

export const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);


/** Egy elem elérhetősége (a teljes revízió egyedi lépéseihez): görgetés után a nézetben van, és felül ő látszik. */
export async function reachableProblem(page: Page, selector: string): Promise<string | null> {
  return page.evaluate(async (sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return `${sel}: nincs ilyen elem`;
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null))));
    const r = el.getBoundingClientRect();
    if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) return `${sel}: kilóg a nézetből (${Math.round(r.top)}–${Math.round(r.bottom)} / ${innerHeight})`;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const nav = document.querySelector('nav[aria-label="Admin navigáció"]');
    if (hit && hit !== el && !el.contains(hit)) return `${sel}: takarja ${nav?.contains(hit) ? "az ALSÓ MENÜ" : hit.tagName.toLowerCase()}`;
    return null;
  }, selector);
}
