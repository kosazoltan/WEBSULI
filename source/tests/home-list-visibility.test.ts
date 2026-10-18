import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/*
 * Spec 2026-09-20 — a főoldal tananyaglistája sosem tűnhet el.
 *
 * Mérve (tulajdonosi képernyőkép táblagépen, és a böngészőben reprodukálva): a lista konténerén
 * `style="opacity: 0"` maradt, a kártyák halványan vagy sehogy nem látszottak, és kézi újratöltés
 * sem mindig segített. Két úton állt elő ugyanaz: (a) a `lightMotion` döntés csak `useEffect`-ben
 * született, ezért az első renderelés még `initial="hidden"`-t kért (azonnali `opacity: 0`), majd a
 * könnyített módra váltás elvette az animációs CÉLT; (b) rejtett fülön a rAF szünetel, így a
 * Framer-animáció el sem indult. A javítás mindkettőt kizárja: a döntés szinkron, a beúszás pedig
 * CSS-ben, fill-mode nélkül — a nyugalmi állapot a látható lista.
 */

const componentPath = path.resolve("client/src/components/UserFileList.tsx");
const component = fs.readFileSync(componentPath, "utf8");
const css = fs.readFileSync(path.resolve("client/src/index.css"), "utf8");

// Spec 2026-10-18-nyilvanos-oldal-sebesseg (dokumentált spec-változás): a kártyákon nincs JS-animáció (framer-motion), így a
// „könnyített mozgás” döntése (lib/light-motion) és vele a félbehagyott animációs állapot lehetősége is megszűnt.
test("a listán nincs JS-animáció: sem framer-motion, sem utólag billenő mozgás-döntés", () => {
  assert.doesNotMatch(component, /from "framer-motion"/);
  assert.doesNotMatch(component, /motion\.div/);
  assert.doesNotMatch(component, /lightMotion/);
});

test("a lista láthatósága nem függ animációtól: nincs rejtett kezdőállapot a konténeren", () => {
  const container = /<div\s+([\s\S]*?)>\s*\{filteredFiles\.map/.exec(component);
  assert.ok(container, "megvan a lista konténere");
  const props = container![1];
  assert.match(props, /data-testid="list-files"/);
  assert.match(props, /list-enter/, "a beúszás a CSS-osztályé");
  assert.doesNotMatch(props, /initial=|animate=|variants=/, "a konténer nem kap animációs kezdőállapotot");
});

test("a beúszás díszítés: a nyugalmi állapot látható (nincs fill-mode), és tiszteli a csökkentett mozgást", () => {
  const frames = /@keyframes list-enter\s*\{([\s\S]*?)\n  \}/.exec(css);
  assert.ok(frames, "megvan a keyframe");
  assert.match(frames![1], /transform:\s*translateY/, "a beúszás mozgást animál");
  // Mérve: rejtett fülön a dokumentum idővonala megáll, és egy opacity-átmenet akár 0-nál is
  // befagyhat. Ezért az animáció SOHA nem nyúlhat az áttetszőséghez.
  assert.doesNotMatch(frames![1], /opacity/, "áttetszőséget nem animál: a tananyag nem tűnhet el");
  const rule = /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.list-enter\s*\{([\s\S]*?)\}/.exec(css);
  assert.ok(rule, "a szabály csökkentett mozgásnál nem fut");
  assert.match(rule![1], /animation:\s*list-enter\s+\d+ms/);
  assert.doesNotMatch(rule![1], /both|backwards|forwards|fill-mode/, "fill-mode nélkül: ha az animáció el sem indul, a lista LÁTSZIK");
});
