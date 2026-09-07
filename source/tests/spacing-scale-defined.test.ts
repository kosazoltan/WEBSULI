import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * G-13 — az „undefined utility" hibaosztály MÁSODIK esete.
 *
 * A `screens-defined.test.ts` ugyanezt a csendes hibát fogta breakpointokra: ha egy
 * Tailwind-osztály kulcsa nincs a skálán, a build NEM hibázik, a class egyszerűen
 * nem ad ki szabályt. Semmi nem pirosodik ki — a felület viszont más lesz.
 *
 * Mérve (2026-09-07, Pixel 7, éles build): a `Button size="lg"` osztálya `h-13`, de a
 * 13-as lépcső sem a Tailwind alapskáláján, sem a configban nincs — a lefordított
 * CSS-ben `.h-13` NULLA találat. Ezért minden `size="lg"` gomb a szöveg magasságára,
 * 26 px-re esett össze, holott a szándék 52 px volt. Öt játék INDÍTÓ gombja — a lap
 * legfontosabb gombja — így a 44 px-es érintési minimum ALATT volt telefonon, miközben
 * a festett pirula nagyobbnak látszott, mint a valóban kattintható terület.
 *
 * A teszt a használt számos térköz-osztályokat veti össze a tényleges skálával.
 */

const CLIENT_SRC = new URL("../client/src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TAILWIND_CONFIG = new URL("../tailwind.config.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** A Tailwind 3 alapértelmezett térköz-skálája (a `theme.spacing` kulcsai). */
const DEFAULT_SPACING = new Set([
  "0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "14", "16", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56",
  "60", "64", "72", "80", "96",
]);

/** Csak azok az utility-előtagok, amelyek TÉNYLEG a térköz-skálát használják. */
const SPACING_PREFIXES = [
  "h", "w", "min-h", "min-w", "size",
  "p", "px", "py", "pt", "pr", "pb", "pl",
  "m", "mx", "my", "mt", "mr", "mb", "ml",
  "gap", "gap-x", "gap-y",
  "top", "right", "bottom", "left", "inset", "inset-x", "inset-y",
];

const USE = new RegExp(
  `(?:^|[\\s"'\`])-?(${SPACING_PREFIXES.join("|")})-(\\d+(?:\\.5)?)\\b`,
  "g",
);

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSources(full, acc);
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

/** A configban `extend.spacing`-ként felvett saját lépcsők. */
function declaredSpacing(): Set<string> {
  const config = readFileSync(TAILWIND_CONFIG, "utf8");
  const start = config.indexOf("spacing:");
  if (start < 0) return new Set();
  const open = config.indexOf("{", start);
  if (open < 0) return new Set();
  let depth = 0;
  let end = open;
  for (let i = open; i < config.length; i += 1) {
    if (config[i] === "{") depth += 1;
    else if (config[i] === "}") {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = config.slice(open + 1, end);
  const keys = new Set<string>();
  for (const m of body.matchAll(/(?:^|[,{\s])["']?(\d+(?:\.5)?)["']?\s*:/g)) keys.add(m[1]!);
  return keys;
}

test("minden használt térköz-lépcső létezik a skálán", () => {
  const known = new Set([...DEFAULT_SPACING, ...declaredSpacing()]);
  const offenders: string[] = [];

  for (const file of collectSources(CLIENT_SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(USE)) {
      if (!known.has(m[2]!)) {
        offenders.push(`${file.slice(CLIENT_SRC.length + 1)}: ${m[1]}-${m[2]}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `nem létező térköz-lépcső — a Tailwind némán semmit nem ad ki:\n${offenders.join("\n")}`,
  );
});

test("a `lg` gombméret a 44 px-es érintési minimum FÖLÖTT van", () => {
  const button = readFileSync(join(CLIENT_SRC, "components/ui/button.tsx"), "utf8");
  const lg = /lg:\s*"([^"]+)"/.exec(button)?.[1] ?? "";
  const step = /\bh-(\d+(?:\.5)?)\b/.exec(lg)?.[1];

  assert.ok(step, `a lg méretnek explicit magassága legyen, most: "${lg}"`);

  const known = new Set([...DEFAULT_SPACING, ...declaredSpacing()]);
  assert.ok(known.has(step!), `h-${step} nincs a skálán — a gomb a szöveg magasságára esik össze`);

  // A Tailwind-lépcső 0,25rem = 4 px egységekben halad; 44 px = 11-es lépcső.
  assert.ok(
    Number(step) * 4 >= 44,
    `a lg gomb ${Number(step) * 4} px magas lenne, a minimum 44 px`,
  );
});

test("az önellenőrzés: a nem létező lépcsőt tényleg megtalálja", () => {
  const known = new Set([...DEFAULT_SPACING]);
  assert.equal(known.has("13"), false, "a 13 nincs a Tailwind alapskáláján — erre épül a teszt");
  assert.equal(known.has("12"), true);
});
