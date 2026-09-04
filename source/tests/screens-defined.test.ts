import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LS-0b — regression guard for the "undefined breakpoint" bug class.
 *
 * Measured 2026-09-02: `xs:` was used in 7 places (`hidden xs:inline` on the hero CTA
 * labels) but never defined in tailwind.config.ts, so Tailwind emitted no rule and the
 * labels stayed hidden on EVERY screen — icon-only buttons for months, silently.
 * `tablet:` / `foldable:` / `uw:` were in the same state on 2026-09-04.
 *
 * A missing breakpoint produces no build error and no runtime error: the class simply
 * does nothing. This test is the only thing that makes the failure visible.
 */

const CLIENT_SRC = new URL("../client/src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TAILWIND_CONFIG = new URL("../tailwind.config.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** Tailwind variants that exist without being declared in `screens`. */
const BUILT_IN_VARIANTS = new Set([
  // responsive defaults
  "sm", "md", "lg", "xl", "2xl",
  // state
  "hover", "focus", "focus-visible", "focus-within", "active", "visited", "target",
  "disabled", "enabled", "checked", "indeterminate", "required", "valid", "invalid",
  "read-only", "placeholder-shown", "autofill", "default", "optional",
  // structural
  "first", "last", "only", "odd", "even", "first-of-type", "last-of-type",
  "empty", "before", "after", "placeholder", "file", "marker", "selection",
  "backdrop", "first-line", "first-letter",
  // group / peer
  "group", "peer",
  // media
  "dark", "motion-safe", "motion-reduce", "print", "portrait", "landscape",
  "contrast-more", "contrast-less", "forced-colors",
  // direction
  "rtl", "ltr", "open",
  // tailwind internals that appear in class strings
  "supports", "has", "aria", "data", "not",
]);

function collectTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, acc);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

/** Screen keys declared in tailwind.config.ts (both `theme.screens` and `extend.screens`). */
function declaredScreens(): Set<string> {
  const config = readFileSync(TAILWIND_CONFIG, "utf8");
  const keys = new Set<string>();
  // Brace-balanced scan: a value may itself be an object (`fold: { max: "320px" }`),
  // so a non-greedy `\{([^}]*)\}` would stop at the FIRST inner brace and silently
  // miss every key after it.
  for (const start of config.matchAll(/screens:\s*\{/g)) {
    const open = start.index! + start[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < config.length; i++) {
      if (config[i] === "{") depth++;
      else if (config[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = config.slice(open + 1, end);
    // Only top-level keys of this block: strip nested objects first.
    const topLevel = body.replace(/\{[^{}]*\}/g, '""');
    for (const entry of topLevel.matchAll(/["']?([A-Za-z0-9_-]+)["']?\s*:/g)) {
      keys.add(entry[1]);
    }
  }
  return keys;
}

test("every responsive variant prefix used in the client is a defined breakpoint", () => {
  const known = new Set([...BUILT_IN_VARIANTS, ...declaredScreens()]);
  const offenders = new Map<string, string[]>();

  for (const file of collectTsxFiles(CLIENT_SRC)) {
    const source = readFileSync(file, "utf8");
    // Only look inside className string literals — comments and URLs must not match.
    for (const classAttr of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
      const classes = classAttr[1] ?? classAttr[2] ?? classAttr[3] ?? "";
      for (const token of classes.split(/\s+/)) {
        // A variant prefix is `word:` before a utility; ignore arbitrary values `[...]`.
        const match = /^([a-z][a-z0-9-]{1,12}):/.exec(token);
        if (!match) continue;
        const prefix = match[1];
        if (known.has(prefix)) continue;
        // `aria-*` / `data-*` / `group-*` / `peer-*` / `supports-*` compound variants
        if (/^(aria|data|group|peer|supports|has|not|min|max)-/.test(prefix)) continue;
        const rel = file.slice(CLIENT_SRC.length + 1);
        offenders.set(prefix, [...(offenders.get(prefix) ?? []), rel]);
      }
    }
  }

  const summary = [...offenders.entries()]
    .map(([prefix, files]) => `${prefix}: (${files.length}) ${[...new Set(files)].join(", ")}`)
    .join("\n");

  assert.equal(
    offenders.size,
    0,
    `Undefined Tailwind breakpoint prefixes found — they silently emit no CSS.\n${summary}`,
  );
});

test("the breakpoints the app already relies on are declared", () => {
  const screens = declaredScreens();
  for (const required of ["xs", "fold", "tablet", "foldable", "uw"]) {
    assert.ok(screens.has(required), `missing screen definition: ${required}`);
  }
});
