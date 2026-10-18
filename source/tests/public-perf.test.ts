import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Spec: docs/specs/2026-10-18-nyilvanos-oldal-sebesseg.md — a nyilvános lista ne rajzoljon folyamatosan újra.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a kártyák mintája statikus és nincs homályosítás (backdrop-filter) a .glass-card szabályokban", () => {
  const css = read("client/src/index.css");
  assert.doesNotMatch(css, /animation:\s*honeycomb-shift/);
  const rules = [...css.matchAll(/\.glass-card\s*\{([^}]*)\}/g)].map(m => m[1]);
  assert.ok(rules.length >= 2);
  for (const r of rules) assert.doesNotMatch(r, /backdrop-filter/);
  assert.match(css, /\.material-card-cell\s*\{\s*content-visibility:\s*auto;/);
});

test("a kártyák nem JS-animáltak és nincs rajtuk homályosítás", () => {
  const src = read("client/src/components/UserFileList.tsx");
  assert.doesNotMatch(src, /from "framer-motion"/);
  assert.match(src, /className="material-card-cell"/);
  const card = src.slice(src.indexOf('className="material-card-cell"'), src.indexOf("</Card>"));
  assert.doesNotMatch(card, /backdrop-blur/);
});

test("a dekoratív animációk végesek; a gombokon nincs alapértelmezett homályosítás", () => {
  const css = read("client/src/index.css");
  assert.match(css, /animation: rainbow-spectrum 5s ease-in-out 2;/);
  assert.match(read("client/src/components/HeroSection.tsx"), /animate-bounce \[animation-iteration-count:3\]/);
  assert.doesNotMatch(read("client/src/components/ui/button.tsx"), /backdrop-blur/);
});
