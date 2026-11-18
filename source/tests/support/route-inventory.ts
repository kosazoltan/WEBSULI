/**
 * JM7a (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4 (a)/(d), G11): a futó Express-alkalmazás router-vermének
 * bejárása. Minden végpontról: metódus, teljes útvonal, és a végső kezelő ELŐTT ténylegesen lefutó köztes függvények
 * (alkalmazás-szintű, a tartalmazó routerek `use()`-ja és az útvonal saját köztes függvényei) — sorrendhelyesen.
 *
 * Szándékosan konzervatív: egy MÁSIK (testvér) router `use(isAuthenticatedAdmin)`-ja nem számít bele, mert a routerek
 * sorrendjének változása azt az őrt elvinné; minden adminvégpontnak a saját láncában kell őrt kapnia.
 * Express 4 belső szerkezetére épül (`app._router.stack`); ha a szerkezet nem értelmezhető, HIBÁT dob (nem csendes üres lista).
 */
import type { Express, RequestHandler } from "express";

type Layer = {
  name: string;
  handle: RequestHandler & { stack?: Layer[] };
  regexp: RegExp & { fast_slash?: boolean; fast_star?: boolean };
  keys: { name: string }[];
  route?: { path: string | string[]; methods: Record<string, boolean>; stack: Layer[] };
  match(path: string): boolean;
};

export type Endpoint = {
  method: string;
  /** Teljes útvonal Express-mintával (pl. `/api/admin/users/:id`). */
  path: string;
  /** A végső kezelő előtt lefutó függvények (név szerinti és azonosság szerinti vizsgálathoz). */
  chain: RequestHandler[];
  /** A végső (üzleti) kezelő rétege — a mátrix-teszt ezt csonkolja, hogy a lánc valódi maradjon, a munka ne fusson. */
  finalLayer: { handle: RequestHandler };
};

/** Express 4 felcsatolási regexpjéből az előtag(ok). Csak egyszerű, statikus előtagot fogad el. */
export function mountPrefixes(layer: Pick<Layer, "regexp" | "keys">): string[] {
  if (layer.regexp.fast_slash) return [""];
  if (layer.keys.length > 0) throw new Error(`Paraméteres felcsatolási útvonal nem támogatott: ${layer.regexp}`);
  const src = layer.regexp.source;
  // Tömbös felcsatolás: `^a\/?(?=\/|$)|^b\/?(?=\/|$)` — a lookahead belsejében is van `|`, ezért a `|^` mentén bontunk.
  return src.split("|^").map((part, idx) => (idx === 0 ? part : `^${part}`)).map((part) => {
    const m = /^\^(.*)\\\/\?\(\?=\\\/\|\$\)$/.exec(part);
    if (!m) throw new Error(`Nem értelmezhető felcsatolási regexp: ${src}`);
    const prefix = m[1]!.replace(/\\\//g, "/");
    if (/[\\()[\]{}*+?|^$]/.test(prefix)) throw new Error(`Nem statikus felcsatolási előtag: ${src}`);
    return prefix;
  });
}

function routePaths(path: string | string[]): string[] {
  return Array.isArray(path) ? path : [path];
}

function join(prefix: string, path: string): string {
  if (path === "/" || path === "") return prefix || "/";
  return `${prefix}${path}`;
}

/** Egy minta-útvonal kitöltése a kérésekhez: minden `:param` → `value`. */
export function samplePath(pattern: string, value = "authz-probe"): string {
  return pattern.replace(/:([A-Za-z0-9_]+)\??/g, value);
}

/** Egy ős-szint: a verem, a router rétegének indexe benne, és a szint előtagja (a teljes útból ennyit kell levágni). */
type Ancestor = { stack: Layer[]; index: number; prefix: string };

/** A szinten a megadott index ELŐTT álló, illeszkedő köztes rétegek (nem útvonal, nem router) — a szint relatív útjával. */
function precedingMiddleware(stack: Layer[], index: number, relativePath: string): RequestHandler[] {
  return stack.slice(0, index).filter((p) => !p.route && p.name !== "router" && p.match(relativePath)).map((p) => p.handle);
}

function relative(fullPath: string, prefix: string): string {
  const rest = fullPath.slice(prefix.length);
  return rest === "" ? "/" : rest;
}

function walk(stack: Layer[], prefix: string, ancestors: Ancestor[], out: Endpoint[]): void {
  for (let i = 0; i < stack.length; i++) {
    const layer = stack[i]!;
    if (layer.route) {
      for (const rp of routePaths(layer.route.path)) {
        const full = join(prefix, rp);
        // A minta-útvonallal illesztünk: a `:param` szegmens egy konkrét értékkel helyettesítve.
        const probe = samplePath(full);
        const chain: RequestHandler[] = [];
        for (const a of ancestors) chain.push(...precedingMiddleware(a.stack, a.index, relative(probe, a.prefix)));
        chain.push(...precedingMiddleware(stack, i, relative(probe, prefix)));
        const routeStack = layer.route.stack;
        if (routeStack.length === 0) throw new Error(`Üres útvonal-verem: ${full}`);
        const finalLayer = routeStack[routeStack.length - 1]!;
        chain.push(...routeStack.slice(0, -1).map((s) => s.handle));
        for (const method of Object.keys(layer.route.methods).filter((m) => layer.route!.methods[m])) {
          out.push({ method: method.toUpperCase(), path: full, chain: [...chain], finalLayer });
        }
      }
    } else if (layer.name === "router" && Array.isArray(layer.handle.stack)) {
      for (const mount of mountPrefixes(layer)) {
        walk(layer.handle.stack, prefix + mount, [...ancestors, { stack, index: i, prefix }], out);
      }
    }
  }
}

/** Az alkalmazás összes végpontja. Bukik, ha a router-verem nem érhető el (pl. Express-főverzió-váltás). */
export function routeInventory(app: Express): Endpoint[] {
  const router = (app as unknown as { _router?: { stack?: Layer[] } })._router;
  if (!router || !Array.isArray(router.stack)) throw new Error("Az Express router-verem (app._router.stack) nem érhető el");
  const out: Endpoint[] = [];
  walk(router.stack, "", [], out);
  if (out.length === 0) throw new Error("A router-verem bejárása nem talált végpontot");
  return out;
}

export const ADMIN_PREFIXES = ["/api/admin", "/api/studio"] as const;

export function isUnderAdminPrefix(path: string): boolean {
  return ADMIN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
