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
  // Review #297: a containment magán a kártyán (a burkolón levágná az árnyékot és a hover-emelést); a vizsgált tartomány a
  // tananyagkártya, a kezdőindextől keresve, és nem lehet üres.
  const start = src.indexOf("glass-card material-card-cell");
  assert.ok(start > 0, "a tananyagkártyán van content-visibility");
  const end = src.indexOf("</Card>", start);
  assert.ok(end > start, "megvan a tananyagkártya vége");
  const card = src.slice(src.lastIndexOf("<Card", start), end);
  assert.ok(card.length > 200);
  assert.doesNotMatch(card, /backdrop-blur/);
});

test("a dekoratív animációk végesek; a gombokon nincs alapértelmezett homályosítás", () => {
  const css = read("client/src/index.css");
  assert.match(css, /animation: rainbow-spectrum 5s ease-in-out 2;/);
  assert.match(read("client/src/components/HeroSection.tsx"), /animate-bounce \[animation-iteration-count:3\]/);
  assert.doesNotMatch(read("client/src/components/ui/button.tsx"), /backdrop-blur/);
});
