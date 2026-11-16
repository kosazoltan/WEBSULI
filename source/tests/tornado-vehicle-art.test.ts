import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// A `tsconfig.json` `jsx: "preserve"`: a tsx-betöltő a klasszikus `React.createElement` alakra fordít (duel-components minta).
(globalThis as { React?: typeof React }).React = React;

import VehicleArt, { VEHICLE_SHAPES } from "../client/src/tornado/VehicleArt";
import { RARITY_COLOR, VEHICLES, categoryLabel } from "../client/src/lib/tornado/vehicles";

/**
 * Spec 2026-11-16-jatek-telefonos-reszponzivitas E4: a jármű képe helyén a sziluett-kategóriának megfelelő SVG áll
 * (5 eltérő forma), a jármű saját színeivel és a ritkaság színével — nem üres színátmenetes négyzet.
 */

const SILHOUETTES = ["pickup", "wedge", "tank", "van", "beast"] as const;

test("az öt sziluett mind külön formát rajzol (karosszéria, ablak és kerékszám alapján)", () => {
  const keys = SILHOUETTES.map((s) => {
    const sh = VEHICLE_SHAPES[s];
    return `${sh.body}|${sh.glass}|${sh.wheels.length}`;
  });
  assert.equal(new Set(keys).size, SILHOUETTES.length);
  assert.equal(new Set(SILHOUETTES.map((s) => VEHICLE_SHAPES[s].body)).size, SILHOUETTES.length, "a karosszéria-útvonalak is mind eltérők");
});

test("a katalógus minden sziluettje le van rajzolva, és minden kategóriának van formája", () => {
  for (const v of VEHICLES) assert.ok(VEHICLE_SHAPES[v.silhouette], `${v.name}: nincs forma a(z) ${v.silhouette} sziluetthez`);
  const byCategory = new Map<string, Set<string>>();
  for (const v of VEHICLES) (byCategory.get(v.category) ?? byCategory.set(v.category, new Set()).get(v.category)!).add(v.silhouette);
  assert.equal(byCategory.size, 5);
  // Kategóriánként egy forma, és az öt kategória öt KÜLÖNBÖZŐ formát kap — a forma így a kategóriát jelzi.
  for (const [cat, set] of byCategory) assert.equal(set.size, 1, `${cat}: több sziluett`);
  assert.equal(new Set([...byCategory.values()].map((s) => [...s][0])).size, 5);
});

test("renderelés: role=img, a név és a kategória az aria-labelben, a jármű színei és a ritkaság színe a rajzon", () => {
  for (const s of SILHOUETTES) {
    const v = VEHICLES.find((x) => x.silhouette === s)!;
    const html = renderToStaticMarkup(createElement(VehicleArt, { vehicle: v, className: "w-20" }));
    assert.match(html, /^<svg[^>]*role="img"/);
    assert.ok(html.includes(`data-silhouette="${s}"`));
    assert.ok(html.includes(`aria-label="${v.name} – ${categoryLabel(v.category)}`), `${v.name}: aria-label`);
    assert.ok(html.includes(`fill="${v.colors.body}"`), `${v.name}: karosszéria-szín`);
    assert.ok(html.includes(`fill="${v.colors.glass}"`), `${v.name}: ablak-szín`);
    assert.ok(html.includes(RARITY_COLOR[v.rarity]), `${v.name}: ritkaság-szín`);
    // Kerekek: a forma kerékszáma × 2 kör (abroncs + agy).
    assert.equal((html.match(/<circle /g) ?? []).length, VEHICLE_SHAPES[s].wheels.length * 2);
  }
});

test("a színátmenet azonosítója érvényes SVG-azonosító (a React useId kettőspontjai nélkül)", () => {
  const html = renderToStaticMarkup(createElement(VehicleArt, { vehicle: VEHICLES[0]! }));
  const id = /<radialGradient id="([^"]+)"/.exec(html)?.[1];
  assert.ok(id);
  assert.match(id!, /^[A-Za-z0-9_-]+$/);
  assert.ok(html.includes(`url(#${id})`));
});
