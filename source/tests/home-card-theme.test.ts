import { test } from "node:test";
import assert from "node:assert/strict";
import { coverIdFor, homeCardTheme } from "../shared/home-card-theme";
import { DESIGN_THEMES } from "../shared/lesson-design";

// Spec 2026-11-03-fooldal-boritokartyak: a főoldali kártya az évfolyamsáv színét, formáját és ikonját viseli.
test("az öt évfolyamsáv saját formát és a lecke-lejátszó mért színeit kapja; a 0. évfolyam a studio sáv", () => {
  const expected: Array<[number, string, string, number]> = [
    [1, "explorer", "circle", 20], [2, "explorer", "circle", 20], [3, "adventure", "tilted", 20], [5, "adventure", "tilted", 20],
    [6, "studio", "hexagon", 18], [8, "studio", "hexagon", 18], [0, "studio", "hexagon", 18],
    [9, "laboratory", "square", 16], [10, "laboratory", "square", 16], [11, "future", "diamond", 16], [12, "future", "diamond", 16],
  ];
  for (const [classroom, band, shape, radius] of expected) {
    const t = homeCardTheme(classroom);
    assert.equal(t.band, band, `${classroom}. évfolyam`);
    assert.equal(t.shape, shape);
    assert.equal(t.radius, radius);
    const d = DESIGN_THEMES[t.band];
    assert.equal(t.accent, d.accent); assert.equal(t.strong, d.strong); assert.equal(t.strongInk, d.strongInk); assert.equal(t.panel, d.panel);
    assert.ok(t.radius >= 16 && t.radius <= 20, "szabályterv: kártyasarok 16–20 px");
  }
  assert.equal(new Set(["explorer", "adventure", "studio", "laboratory", "future"].map((b) => homeCardTheme(expected.find((e) => e[1] === b)![0]).shape)).size, 5, "minden sávnak más jelvényalakja van");
  assert.equal(homeCardTheme(11).ink, DESIGN_THEMES.future.ink, "a sötét (future) panelen a világos szövegszín");
  assert.equal(homeCardTheme(9).ink, DESIGN_THEMES.laboratory.deep, "a világos panelen a sáv mély szövegszíne");
});

test("a bélyegkép forrása a lecke borítója, ennek hiányában (vagy érvénytelen azonosítónál) a sáv hős-képe", () => {
  assert.equal(coverIdFor("cover-gorog-drama", 9), "cover-gorog-drama");
  assert.equal(coverIdFor(null, 9), "hero-laboratory");
  assert.equal(coverIdFor(undefined, 2), "hero-explorer");
  assert.equal(coverIdFor("../etc/passwd", 4), "hero-adventure");
  assert.equal(coverIdFor("", 0), "hero-studio");
});
