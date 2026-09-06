import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * #182 — measured live (2026-09-06 05:27, admin /admin?tab=lesson-studio with a persisted
 * jobId): JobMonitor called `useRef`/`useEffect` AFTER two early `return`s, so the hook
 * count changed between renders and React threw a minified #310 — the whole admin page
 * went dark ("Váratlan hiba történt"). There is no eslint-plugin-react-hooks in this
 * repo, so this guard reads the studio components and refuses a hook call that appears
 * after an early `return` inside a component body. Rule: hooks first, returns after.
 */
const STUDIO_DIR = join(import.meta.dirname, "..", "client", "src", "components", "studio");

function violations(source: string): string[] {
  const out: string[] = [];
  // Split at top-level exported/function components; a coarse but stable heuristic:
  // within each function body, note the first `return (` / `return <` / `return null`
  // at indentation 2 (component-level), then flag any `use[A-Z]\w*(` after it.
  const lines = source.split(/\r?\n/);
  let inComponent = false;
  let sawReturn = false;
  let name = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fn = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/.exec(line);
    if (fn) {
      inComponent = true;
      sawReturn = false;
      name = fn[1];
      continue;
    }
    if (!inComponent) continue;
    if (/^}\s*$/.test(line)) {
      inComponent = false;
      continue;
    }
    // Component-level early return: `  return ...` at indent 2, or `    return ...` at indent 4
    // whose enclosing block opener (the previous non-blank line) is a component-level `  if (...) {`.
    // Returns inside callbacks (useMemo/useQuery option functions) are deeper or have a different opener.
    const prev = lines[i - 1] ?? "";
    const componentReturn =
      /^ {2}return\b/.test(line) || (/^ {4}return\b/.test(line) && /^ {2}if\s*\(.*\)\s*\{\s*$/.test(prev));
    if (componentReturn) {
      sawReturn = true;
      continue;
    }
    if (sawReturn && /^ {2}(?:const|let|var)?[^/]*\buse[A-Z]\w*(?:<[^>]*>)?\(/.test(line)) {
      out.push(`${name}:${i + 1}: ${line.trim()}`);
    }
  }
  return out;
}

test("studio components call every hook before any early return (#182)", () => {
  const files = readdirSync(STUDIO_DIR).filter((f) => f.endsWith(".tsx"));
  assert.ok(files.length > 0, "studio components found");
  const all = files.flatMap((f) => violations(readFileSync(join(STUDIO_DIR, f), "utf8")).map((v) => `${f} ${v}`));
  assert.deepEqual(all, [], `hook after early return:\n${all.join("\n")}`);
});

test("the guard itself detects a hook after an early return", () => {
  const bad = [
    "export function Bad({ x }: { x: number }) {",
    "  const q = useQuery();",
    "  if (!q) {",
    "    return null;",
    "  }",
    "  const ref = useRef(null);",
    "  return <div />;",
    "}",
  ].join("\n");
  assert.equal(violations(bad).length, 1);
  const good = bad.replace("  const ref = useRef(null);\n", "").replace("  const q = useQuery();", "  const q = useQuery();\n  const ref = useRef(null);");
  assert.deepEqual(violations(good), []);
});
