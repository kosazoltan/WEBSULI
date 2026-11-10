import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIP_BAND_STYLE, CLIP_IMAGE_COMMON, clipBandFor, clipImagePrompt } from "../shared/clip-style";
import { DESIGN_THEME_IDS } from "../shared/lesson-design";
import { clip2ContentProblems, clip2Schema, clipMediaUrl, parseAnyClip, type Clip2 } from "../shared/lesson-clip";

// docs/specs/2026-11-10-fejezet-kisfilmek-v2.md — korosztályos profil és a v2 adatszerződés.

test("mind az öt évfolyamsávnak van profilja, és a sáv az évfolyamból jön", () => {
  assert.deepEqual(Object.keys(CLIP_BAND_STYLE).sort(), [...DESIGN_THEME_IDS].sort());
  assert.deepEqual([1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 0].map(clipBandFor), ["explorer", "explorer", "adventure", "adventure", "studio", "studio", "laboratory", "laboratory", "future", "future", "studio"]);
});

test("figura csak a kicsiknél van; 6. évfolyamtól nincs kabala, és a képi szabály tiltja a rajzfilmfigurát", () => {
  assert.ok(CLIP_BAND_STYLE.explorer.cast?.includes("hedgehog"));
  assert.ok(CLIP_BAND_STYLE.adventure.cast?.includes("child explorers"));
  for (const band of ["studio", "laboratory", "future"] as const) {
    assert.equal(CLIP_BAND_STYLE[band].cast, null, band);
    assert.match(CLIP_BAND_STYLE[band].imageRule, /No (mascots|cartoon characters)/, band);
  }
});

test("a mesélés a korral komolyodik: nő a mondathossz, más a hang, más a megjelenés", () => {
  const order = ["explorer", "adventure", "studio", "laboratory", "future"] as const;
  const sayMax = order.map((b) => CLIP_BAND_STYLE[b].narration.sayMax);
  assert.deepEqual(sayMax, [...sayMax].sort((a, b) => a - b));
  assert.ok(sayMax[0] < sayMax[4]);
  assert.equal(new Set(order.map((b) => CLIP_BAND_STYLE[b].voice.id)).size, 5, "sávonként más hang");
  assert.equal(new Set(order.map((b) => CLIP_BAND_STYLE[b].voice.instructions)).size, 5, "sávonként más hangnem");
  assert.ok(order.every((b) => /Hungarian/.test(CLIP_BAND_STYLE[b].voice.instructions)));
  const captions = order.map((b) => CLIP_BAND_STYLE[b].look.captionPx);
  assert.deepEqual(captions, [...captions].sort((a, b) => b - a), "a kisebbeknek nagyobb felirat");
  assert.ok(parseInt(CLIP_BAND_STYLE.explorer.look.radius) > parseInt(CLIP_BAND_STYLE.laboratory.look.radius), "a kicsiknél kerekebb, a nagyoknál mérnöki");
  assert.ok(order.every((b) => CLIP_BAND_STYLE[b].narration.rules.length >= 3));
});

test("a képbrief tartalmazza a helyzetet, a figurát (ahol van), a sáv stílusát és a közös tiltásokat", () => {
  const young = clipImagePrompt("  Two children look at a hill.  ", "adventure");
  assert.ok(young.startsWith("Two children look at a hill."));
  assert.ok(young.includes(CLIP_BAND_STYLE.adventure.cast!) && young.includes(CLIP_BAND_STYLE.adventure.imageStyle) && young.includes(CLIP_IMAGE_COMMON));
  const lab = clipImagePrompt("A running track.", "laboratory");
  assert.ok(!lab.includes("null") && lab.includes("No cartoon characters") && /no text, letters, digits/i.test(lab));
});

const ID = (n: number) => String(n).repeat(32);
const SAY = "Ez egy elég hosszú, elmondható mondat a jelenethez.";
const clip = (over: Partial<Clip2> = {}): Clip2 => ({ v: 2, band: "adventure", title: "Próba", shots: [{ image: ID(1), alt: "Első kép" }, { image: ID(2), alt: "Második kép" }],
  scenes: [{ say: SAY, shot: 0, camera: "in", overlay: { kind: "title", text: "Cím" } }, { say: SAY, shot: 1, camera: "left", audio: ID(3), ms: 4000 }, { say: SAY, shot: 1, camera: "still", overlay: { kind: "graph", xLabel: "t (s)", yLabel: "s (m)", points: [[0, 0], [60, 300]] } }], ...over });

test("v2 séma: érvényes minta; hibás beállítás-index, sáv feletti mondathossz, csökkenő grafikon, ismeretlen mező elutasítva", () => {
  assert.equal(clip2Schema.safeParse(clip()).success, true);
  const scenes = clip().scenes;
  assert.equal(clip2Schema.safeParse(clip({ scenes: [{ ...scenes[0], shot: 2 }, scenes[1], scenes[2]] })).success, false, "nem létező beállítás");
  const long = "a".repeat(CLIP_BAND_STYLE.adventure.narration.sayMax + 1);
  assert.equal(clip2Schema.safeParse(clip({ scenes: [{ ...scenes[0], say: long }, scenes[1], scenes[2]] })).success, false, "a 3–5. évfolyam plafonja fölött");
  assert.equal(clip2Schema.safeParse(clip({ band: "future", scenes: [{ ...scenes[0], say: long }, scenes[1], scenes[2]] })).success, true, "a nagyoknál ugyanez belefér");
  assert.equal(clip2Schema.safeParse(clip({ scenes: [scenes[0], scenes[1], { ...scenes[2], overlay: { kind: "graph", xLabel: "t", yLabel: "s", points: [[5, 1], [2, 3]] } }] })).success, false, "x szerint nem növekvő");
  assert.equal(clip2Schema.safeParse({ ...clip(), extra: 1 }).success, false);
  assert.equal(clip2Schema.safeParse(clip({ shots: [{ image: "nem-azonosito", alt: "x" }, { image: ID(2), alt: "y" }] })).success, false, "hibás médiaazonosító");
  assert.equal(parseAnyClip(clip())?.v, 2);
  assert.equal(parseAnyClip({ v: 3 }), null);
  assert.equal(clipMediaUrl(ID(4)), `/api/lesson-clips/media/${ID(4)}`);
});

test("v2 tartalmi kapuk: új szám nem születhet (az ábrán sem), a lessonVisual létező ábrablokkra mutat", () => {
  // A kapu szigorú: a grafikon origója (0) is csak akkor szerepelhet, ha a fejezet szövegében benne van.
  const source = "A kerékpáros t = 0-kor indul, és 60 s alatt 300 m-t tesz meg.";
  assert.deepEqual(clip2ContentProblems(clip(), source, "Sebesség", []), []);
  const invented = clip({ scenes: [clip().scenes[0], clip().scenes[1], { ...clip().scenes[2], overlay: { kind: "graph", xLabel: "t (s)", yLabel: "s (m)", points: [[0, 0], [60, 999]] } }] });
  assert.match(clip2ContentProblems(invented, source, "Sebesség", []).join(" "), /999/);
  const visual = clip({ scenes: [clip().scenes[0], clip().scenes[1], { say: SAY, shot: 1, camera: "still", overlay: { kind: "lessonVisual", blockIndex: 4 } }] });
  assert.deepEqual(clip2ContentProblems(visual, source, "x", [4]), []);
  assert.match(clip2ContentProblems(visual, source, "x", [2]).join(" "), /nem ábra/);
});
