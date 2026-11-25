import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ANIMATE_REGISTRY } from "../client/src/lesson-runtime/blocks/animate-blocks";
import { sourceCoverageGate } from "../server/studio/gates/source-coverage-gate";
import { lektorLessonView } from "../server/studio/lektor-view";
import { SOURCE_VISUAL_HOSTILE, sourceVisualsFixture } from "../shared/fixtures/lesson-source-visuals";
import { blockLabel, SOURCE_VISUAL_TEXT } from "../shared/lesson-block-label";
import { ANIM_KINDS, dropUnknownAnimateBlocks, lessonSchema, type Block, type Lesson } from "../shared/lesson-schema";
import { parseVisualParams, renderedVisualTexts, SOURCE_TABLE_BLOCK_ROWS, visualParamProblems } from "../shared/lesson-visual-params";
import { compareCardsAsTable, readCompareCardsParams, readRuleBoxParams, readTableParams } from "../shared/source-visual-render";
import { SOURCE_VISUAL_TABLE, sourceVisualSchema, sourceVisualTexts, type SourceVisual } from "../shared/source-visuals";
import { hmInventory } from "./fixtures/source-coverage-hm";

// A `tsconfig.json` `jsx: "preserve"` (a Vite alakít): a node-os tesztben a .tsx komponenseknek a `React` globálisként kell.
(globalThis as { React?: typeof React }).React = React;

/**
 * Spec 2026-11-18 (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, S2a) — szkript-ellenőr: a táblázat, a szabálydoboz és az
 * összehasonlító kártyák paraméter-sémája (mutációs ellenpróbákkal), a megosztott megjelenítő-szerződéssel és a forrás-fedettségi
 * kapuval való egyezés, valamint a szövegkénti (jelölőként nem értelmezett) megjelenítés.
 */

const TABLE = { caption: "Kérdőszavak", headers: ["megszámlálható", "megszámlálhatatlan"], headerTones: ["a", "b"], rows: [["alma", "víz"], ["könyv", ""]] };
const RULE = { tone: "warning", heading: "Figyelj a többes számra", items: ["Az első pont.", "A második pont."] };
const CARDS = { cards: [{ title: "How many?", tone: "a", lines: ["darabszám"], example: "How many books?" }, { title: "How much?", lines: ["mennyiség", "ár"] }] };
const VALID = { table: TABLE, ruleBox: RULE, compareCards: CARDS } as const;
type Kind = keyof typeof VALID;
const clone = <T,>(v: T): T => structuredClone(v);
const text = (n: number) => "a".repeat(n);

test("a három új ábrafajta a sémában van, és az érvényes paraméter hibátlan", () => {
  for (const kind of Object.keys(VALID) as Kind[]) {
    assert.ok((ANIM_KINDS as readonly string[]).includes(kind), `${kind} az ANIM_KINDS-ben`);
    assert.deepEqual(visualParamProblems(kind, VALID[kind]), [], kind);
  }
});

/** Mutációs ellenpróba: az érvényes alapból egyetlen elrontott mező → a séma a VÁRT helyen jelez. */
const MUTATIONS: Array<[Kind, string, (p: any) => void, RegExp]> = [
  ["table", "eltérő sorhossz", (p) => { p.rows[1] = ["csak egy"]; }, /table\.rows\.1: a sor 1 cellás/],
  ["table", `${SOURCE_TABLE_BLOCK_ROWS + 1} sor`, (p) => { p.rows = Array.from({ length: SOURCE_TABLE_BLOCK_ROWS + 1 }, () => ["a", "b"]); }, /table\.rows:/],
  ["table", "9 oszlop", (p) => { p.headers = Array.from({ length: 9 }, (_, i) => `o${i}`); p.rows = [p.headers]; delete p.headerTones; }, /table\.headers:/],
  ["table", "121 karakteres cella", (p) => { p.rows[0][0] = text(121); }, /table\.rows\.0\.0:/],
  ["table", "81 karakteres fejléc", (p) => { p.headers[0] = text(81); }, /table\.headers\.0:/],
  ["table", "üres fejléc", (p) => { p.headers[1] = "  "; }, /table\.headers\.1:/],
  ["table", "rejtő kulcs: hidden", (p) => { p.hidden = true; }, /table\.params: .*hidden/],
  ["table", "rejtő kulcs: maxRows 0", (p) => { p.maxRows = 0; }, /table\.params: .*maxRows/],
  ["table", "tónusok száma ≠ oszlopok száma", (p) => { p.headerTones = ["a"]; }, /table\.headerTones:/],
  ["table", "ismeretlen tónus", (p) => { p.headerTones = ["a", "piros"]; }, /table\.headerTones\.1:/],
  ["table", "minden cella üres", (p) => { p.rows = [["", " "]]; }, /table\.rows: minden cella üres/],
  ["table", "nem szöveges cella", (p) => { p.rows[0][1] = { html: "<b>x</b>" }; }, /table\.rows\.0\.1:/],
  ["ruleBox", "ismeretlen tónus", (p) => { p.tone = "danger"; }, /ruleBox\.tone:/],
  ["ruleBox", "9 pont", (p) => { p.items = Array.from({ length: 9 }, (_, i) => `pont ${i}`); }, /ruleBox\.items:/],
  ["ruleBox", "241 karakteres pont", (p) => { p.items[0] = text(241); }, /ruleBox\.items\.0:/],
  ["ruleBox", "nincs pont", (p) => { p.items = []; }, /ruleBox\.items:/],
  ["ruleBox", "rejtő kulcs: collapsed", (p) => { p.collapsed = true; }, /ruleBox\.params: .*collapsed/],
  ["compareCards", "egy kártya", (p) => { p.cards.pop(); }, /compareCards\.cards:/],
  ["compareCards", "négy kártya", (p) => { p.cards = [...p.cards, ...p.cards]; }, /compareCards\.cards:/],
  ["compareCards", "9 sor egy kártyán", (p) => { p.cards[0].lines = Array.from({ length: 9 }, (_, i) => `sor ${i}`); }, /compareCards\.cards\.0\.lines:/],
  ["compareCards", "cím nélküli kártya", (p) => { delete p.cards[1].title; }, /compareCards\.cards\.1\.title:/],
  ["compareCards", "rejtő kulcs a kártyán", (p) => { p.cards[0].hidden = true; }, /compareCards\.cards\.0: .*hidden/],
  ["compareCards", "gyerekek helyett children", (p) => { p.children = p.cards; delete p.cards; }, /compareCards\./],
];
for (const [kind, name, mutate, expected] of MUTATIONS) {
  test(`mutáció — ${kind}: ${name} → elutasítva`, () => {
    const params = clone(VALID[kind]) as Record<string, unknown>;
    mutate(params);
    const problems = visualParamProblems(kind, params);
    assert.ok(problems.length > 0, "a séma elutasítja");
    assert.match(problems.join(" | "), expected);
    assert.equal(parseVisualParams(kind, params), null, "a rajzoló hibás paraméterből nem rajzol");
  });
}

test("a korlátok nem szűkebbek a forrásleltárénál (a leltár legnagyobb tétele megjeleníthető)", () => {
  const T = SOURCE_VISUAL_TABLE;
  const widest = { headers: Array.from({ length: T.columns }, (_, c) => `${c}${text(T.headerChars - 1)}`), rows: Array.from({ length: SOURCE_TABLE_BLOCK_ROWS }, () => Array.from({ length: T.columns }, () => text(T.cellChars))) };
  assert.ok(sourceVisualSchema.safeParse({ id: "t", kind: "table", sourceFile: "f.pdf", page: 1, role: "r", title: text(160), data: widest }).success, "a leltár elfogadja");
  assert.deepEqual(visualParamProblems("table", { ...widest, caption: text(160) }), []);
  const box = { tone: "rule", heading: text(80), items: Array.from({ length: 8 }, () => text(240)) };
  assert.ok(sourceVisualSchema.safeParse({ id: "r", kind: "ruleBox", sourceFile: "f.pdf", page: 1, role: "r", data: box }).success);
  assert.deepEqual(visualParamProblems("ruleBox", box), []);
  // A 2–3 oszlopos forrástábla kártyaként: a kártya címe a (80 karakteres) fejléc, a sora a (100 karakteres) cella.
  assert.deepEqual(visualParamProblems("compareCards", { cards: [0, 1, 2].map(() => ({ title: text(T.headerChars), lines: Array.from({ length: 8 }, () => text(T.cellChars)) })) }), []);
});

test("a séma által elfogadott paramétert a szerződés olvasója veszteség nélkül olvassa; a kirajzolt szövegek teljesek", () => {
  const table = parseVisualParams("table", TABLE)!;
  assert.deepEqual(readTableParams(TABLE), { caption: table.caption, headers: table.headers, rows: table.rows });
  assert.deepEqual(renderedVisualTexts("table", TABLE), ["Kérdőszavak", "megszámlálható", "megszámlálhatatlan", "alma", "víz", "könyv"]);
  const rule = parseVisualParams("ruleBox", RULE)!;
  assert.deepEqual(readRuleBoxParams(RULE), rule);
  assert.deepEqual(renderedVisualTexts("ruleBox", RULE), [RULE.heading, ...RULE.items]);
  const cards = parseVisualParams("compareCards", CARDS)!;
  assert.deepEqual(readCompareCardsParams(CARDS).cards, cards.cards.map(({ tone: _tone, ...shown }) => shown));
  assert.deepEqual(renderedVisualTexts("compareCards", CARDS), ["How many?", "darabszám", "How many books?", "How much?", "mennyiség", "ár"]);
  assert.deepEqual(compareCardsAsTable(readCompareCardsParams(CARDS)), { headers: ["How many?", "How much?"], rows: [["darabszám", "mennyiség"], ["", "ár"]] });
  assert.deepEqual(renderedVisualTexts("table", { headers: "nem tömb", rows: [3, null] }), [], "hibás alakra sem dob");
});

test("olvasáskor az ismeretlen (jövőbeli) ábrafajta helyén frissítésre kérő magyarázat (V-kompat, review #598: az index nem csúszik), az új három megmarad; a mérőlecke érvényes", () => {
  const blocks = [{ kind: "animate", animKind: "jovoFajta", params: {} }, { kind: "animate", animKind: "table", params: TABLE },
    { kind: "animate", animKind: "ruleBox", params: RULE }, { kind: "animate", animKind: "compareCards", params: CARDS }];
  const out = dropUnknownAnimateBlocks({ sections: [{ blocks }] }) as { sections: Array<{ blocks: Array<{ kind: string; animKind?: string }> }> };
  assert.deepEqual(out.sections[0].blocks.map((b) => b.animKind ?? b.kind), ["explain", "table", "ruleBox", "compareCards"]);
  for (const variant of ["typical", "max"] as const) {
    const lesson = lessonSchema.parse(sourceVisualsFixture(variant));
    const animate = lesson.sections.flatMap((s) => s.blocks).filter((b): b is Extract<Block, { kind: "animate" }> => b.kind === "animate");
    assert.ok(animate.length >= 4);
    for (const block of animate) assert.deepEqual(visualParamProblems(block.animKind, block.params), [], `${variant} / ${block.animKind}`);
  }
});

test("blokkfejléc és lektor-nézet: a felirat a kódszótárból, a cellák / pontok / kártyasorok szövege a nézetben", () => {
  const block = (animKind: string, params: unknown) => ({ kind: "animate", animKind, params, caption: "Felirat", coversConceptIds: ["c1"] }) as unknown as Block;
  const blocks = [block("table", TABLE), block("ruleBox", RULE), block("ruleBox", { tone: "rule", items: ["x"] }), block("ruleBox", { tone: "tip", items: ["x"] }), block("compareCards", CARDS)];
  assert.deepEqual(blocks.map((_, i) => blockLabel(blocks, i, 0, "kid")), ["Táblázat", "Figyelj!", "Jegyezd meg!", "Tipp", "Hasonlítsd össze!"]);
  assert.deepEqual(blocks.map((_, i) => blockLabel(blocks, i, 0, "teen")), ["Táblázat", "Figyelj!", "Szabály", "Tipp", "Hasonlítsd össze!"]);
  assert.deepEqual(blocks.map((_, i) => blockLabel(blocks, i, 0, "senior")), ["Táblázat", "Figyelem", "Szabály", "Tipp", "Összehasonlítás"]);
  const view = lektorLessonView({ title: "t", subject: "s", classroom: 6, misconceptions: [], sections: [{ heading: "h", blocks }] } as unknown as Lesson);
  for (const shown of ["megszámlálhatatlan", "könyv", "A második pont.", "How many books?", "mennyiség"]) assert.ok(view.includes(shown), `a lektor látja: ${shown}`);
});

/* ---------- megjelenítés: valódi táblázat, szöveg csak szövegként ---------- */

const render = (kind: Kind, params: unknown, caption = "Felirat") => renderToStaticMarkup(React.createElement(ANIMATE_REGISTRY[kind], { params: params as Record<string, unknown>, caption }));

test("a táblázat valódi <table>: felirat, oszlopfejléc (scope), sorfejléc 3+ oszlopnál, görgethető saját keret", () => {
  const two = render("table", TABLE, "Kérdőszavak");
  // Review J7: a keret csak GÖRGŐ táblánál fókuszmegálló / nevesített régió (méréshez böngésző kell — ott a spec igazolja); alapból nem az.
  assert.match(two, /<div class="sv-table-scroll">/);
  assert.ok(!/tabindex|role="region"/.test(two), "nem görgő tábla kerete nem fókuszmegálló");
  assert.match(two, /<table class="sv-table" data-cols="2"/);
  // S2b-2 (docs/specs/2026-11-20-tgm-valtozatossag-abrak.md 17. szakasz, vak J2 — dokumentált spec-változás): a látható cím a görgő
  // kereten KÍVÜL áll, a <caption> a képernyőolvasónak megmarad.
  assert.match(two, /<caption class="sr-only">Kérdőszavak<\/caption>/);
  assert.match(two, /<p class="sv-table-title" aria-hidden="true">Kérdőszavak<\/p>/);
  assert.equal((two.match(/<th scope="col"/g) ?? []).length, 2);
  assert.ok(!two.includes('scope="row"'), "kétoszlopos táblában nincs sorfejléc");
  assert.ok(!two.includes("<figcaption"), "a táblázat címével azonos blokkfelirat nem ismétlődik");
  assert.match(two, /data-tone="a"><span class="sv-tone-mark" aria-hidden="true">●<\/span>megszámlálható/, "a tónus mellett alakjel is áll");
  const three = render("table", { headers: ["szó", "jelentés", "példa"], rows: [["many", "sok", "many apples"], ["", "kevés", "few"]] });
  assert.equal((three.match(/<th scope="row"/g) ?? []).length, 1, "az üres első cella nem sorfejléc");
  assert.match(three, /<figcaption[^>]*>Felirat<\/figcaption>/);
  assert.equal(render("table", { ...TABLE, hidden: true }), "", "érvénytelen paraméterből nincs ábra");
});

test("a szabálydoboz tónusa ikon + felirat (nem csak szín); a kártyák példája kódszótári címkével", () => {
  const withHeading = render("ruleBox", RULE);
  assert.match(withHeading, /data-anim="ruleBox" data-tone="warning"/);
  // Review J3: a tónus felirata EGYSZER áll (a doboz saját jelzője), a modell címe alatta cím; képernyőolvasónak szóló ismétlés nincs.
  assert.match(withHeading, /<span class="sv-rule-tone">Figyelj!<\/span><\/p><p class="sv-rule-title"><strong>Figyelj a többes számra<\/strong>/);
  assert.equal(withHeading.split("Figyelj!").length - 1, 1, "a tónusfelirat egyszer szerepel");
  assert.ok(!withHeading.includes("sr-only"));
  // Review J4: a blokk felirata a kereten BELÜL áll (a doboz lábjegyzete), nem a keret után.
  assert.match(withHeading, /<\/ul><figcaption class="sv-rule-note">Felirat<\/figcaption><\/div><\/figure>$/);
  // A lejátszó a korosztály szerinti kódszótári feliratot adja át — a doboz azt mutatja (a `kid` sávban sincs eltérő dupla felirat).
  const kid = renderToStaticMarkup(React.createElement(ANIMATE_REGISTRY.ruleBox, { params: { tone: "rule", items: ["x"] }, caption: "Szabály", label: "Jegyezd meg!" }));
  assert.match(kid, /<span class="sv-rule-tone">Jegyezd meg!<\/span>/);
  assert.ok(!kid.includes("Szabály"), "a sávfüggetlen felirat nem jelenik meg mellette");
  assert.match(withHeading, /<span class="sv-rule-icon" aria-hidden="true"><svg/, "az ikon díszítő — a tónust a felirat mondja ki");
  assert.equal((withHeading.match(/<li>/g) ?? []).length, 2);
  const bare = render("ruleBox", { tone: "tip", items: ["Egy tipp."] }, "Tipp");
  assert.match(bare, new RegExp(`<span class="sv-rule-tone">${SOURCE_VISUAL_TEXT.ruleBoxTone.tip}</span>`));
  assert.ok(!bare.includes("sv-rule-title"), "cím nélküli doboznak nincs külön címsora");
  assert.ok(!bare.includes("<figcaption"), "a kódszótári felirattal azonos blokkfelirat nem ismétlődik");
  const cards = render("compareCards", CARDS);
  assert.match(cards, /class="sv-cards" data-count="2"/);
  assert.match(cards, /role="group" aria-label="How many\?"/);
  assert.match(cards, new RegExp(`<span class="sv-example-label">${SOURCE_VISUAL_TEXT.example}</span>How many books\\?`));
  assert.match(cards, /data-tone="b"[^>]*role="group" aria-label="How much\?"/, "tónus nélkül a kártya sorszáma ad tónust");
});

test("BIZTONSÁG: a jelölőnek látszó szöveg (szkript, eseménykezelő, javascript-hivatkozás) csak szövegként jelenik meg", () => {
  const hostile = Object.values(SOURCE_VISUAL_HOSTILE);
  const outputs = [
    render("table", { caption: hostile[0], headers: [hostile[1], hostile[2]], rows: [[hostile[0], hostile[1]], [hostile[2], ""]] }, hostile[0]),
    render("ruleBox", { tone: "rule", heading: hostile[0], items: hostile }, hostile[2]),
    render("compareCards", { cards: [{ title: hostile[0], lines: hostile, example: hostile[1] }, { title: hostile[2], lines: [hostile[0]] }] }, hostile[1]),
  ];
  for (const html of outputs) {
    assert.ok(html.length > 0);
    // A szöveg kódolva áll (`&lt;`, `&quot;`), ezért minden VALÓDI elem és attribútumnév kiolvasható: csak a megjelenítő saját elemei lehetnek ott.
    const tags = [...html.matchAll(/<([a-zA-Z][\w-]*)((?:\s[^<>]*)?)>/g)];
    const allowed = new Set(["figure", "figcaption", "div", "table", "caption", "thead", "tbody", "tr", "th", "td", "span", "p", "strong", "ul", "li", "svg", "path", "circle", "line", "polyline", "rect"]);
    assert.deepEqual([...new Set(tags.map((t) => t[1].toLowerCase()))].filter((name) => !allowed.has(name)), [], "idegen elem (script, img, a …) nincs a kimenetben");
    const attributeNames = tags.flatMap((t) => [...t[2].replace(/"[^"]*"/g, '""').matchAll(/\s([^\s=]+)=/g)].map((m) => m[1].toLowerCase()));
    assert.deepEqual(attributeNames.filter((name) => /^on|^(?:href|src|srcdoc|action|formaction|xlink:href)$/.test(name)), [], "eseménykezelő vagy hivatkozás attribútum nincs");
    assert.ok(html.includes("&lt;script&gt;window.__svPwned = 1&lt;/script&gt;"), "a szöveg kódolva, olvashatóan megjelenik");
  }
  const source = readFileSync(new URL("../client/src/lesson-runtime/blocks/source-visuals.tsx", import.meta.url), "utf8");
  assert.ok(!/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML/.test(source.replace(/\/\*[\s\S]*?\*\//g, "")), "a megjelenítő nem illeszt be nyers HTML-t");
  const css = readFileSync(new URL("../client/src/lesson-runtime/lesson-design.css", import.meta.url), "utf8");
  const own = css.slice(css.indexOf("Spec 2026-11-18 (tananyaggyártás minősége, S2a)"));
  assert.ok(own.length > 500 && !/#[0-9a-fA-F]{3,8}\b/.test(own), "az új stílus csak a sáv tokenjeit használja (rögzített színkód nélkül)");
});

/* ---------- a megjelenítő alakja és a forrás-fedettségi kapu szerződése egybevág ---------- */

type RawBlock = Record<string, unknown>;
const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const pad = (row: string[], width: number) => Array.from({ length: width }, (_, c) => row[c] ?? "");
/** A forrástételből az ÚJ megjelenítők paraméterei — úgy, ahogy a gyártónak (S3) elő kell állítania: a hosszú tábla több blokkra bontva. */
function rendererBlocks(visual: SourceVisual, tableAs: "table" | "compareCards" = "table"): RawBlock[] {
  const ref = { kind: "animate", coversConceptIds: ["mennyiseg"], sourceVisualId: visual.id };
  if (visual.kind === "ruleBox") return [{ ...ref, animKind: "ruleBox", caption: visual.data.heading ?? "Szabály", params: { tone: visual.data.tone, ...(visual.data.heading ? { heading: visual.data.heading } : {}), items: visual.data.items } }];
  if (visual.kind === "diagram") return [{ ...ref, animKind: "compareCards", caption: visual.data.description, params: { cards: visual.data.parts.map((p) => ({ title: p.label, lines: [p.meaning] })) } }];
  if (visual.kind !== "table") return [];
  const { headers, rows } = visual.data;
  if (tableAs === "compareCards") return [{ ...ref, animKind: "compareCards", caption: visual.title ?? "Táblázat", params: { cards: headers.map((title, c) => ({ title, lines: rows.map((r) => r[c]) })) } }];
  return chunk(rows, SOURCE_TABLE_BLOCK_ROWS).map((part, i) => ({ ...ref, animKind: "table", caption: visual.title ?? "Táblázat",
    params: { ...(visual.title && i === 0 ? { caption: visual.title } : {}), headers, rows: part.map((r) => pad(r, headers.length)), ...(visual.data.headerTones?.length === headers.length ? { headerTones: visual.data.headerTones } : {}) } }));
}
const stateOf = (visuals: SourceVisual[], blocks: RawBlock[]) => Object.fromEntries(sourceCoverageGate({ sections: [{ blocks }] }, visuals, []).items.map((i) => [i.id, i.state]));
const allValid = (blocks: RawBlock[]) => blocks.flatMap((b) => visualParamProblems(String(b.animKind), b.params));

test("a mintafixtúra táblázatai, szabálydobozai és páros dobozai az új megjelenítőkkel: séma szerint érvényes ÉS a kapun megjelent", () => {
  const inventory = hmInventory().filter((v) => v.kind === "table" || v.kind === "ruleBox" || v.kind === "diagram");
  assert.equal(inventory.filter((v) => v.kind === "table").length, 9, "a minta 9 táblázata");
  const blocks = inventory.flatMap((v) => rendererBlocks(v));
  assert.equal(blocks.length, inventory.length);
  assert.deepEqual(allValid(blocks), [], "minden előállított paraméter átmegy a szigorú sémán");
  const states = stateOf(inventory, blocks);
  assert.deepEqual(Object.values(states).filter((s) => s !== "shown"), [], JSON.stringify(states));
  // A kétoszlopos táblázat összehasonlító kártyaként is megjelenés (a kártya egy oszlop).
  const tables = inventory.filter((v) => v.kind === "table");
  const asCards = tables.flatMap((v) => rendererBlocks(v, "compareCards"));
  assert.deepEqual(allValid(asCards), []);
  assert.deepEqual(Object.values(stateOf(tables, asCards)).filter((s) => s !== "shown"), []);
  // A megjelenítő kirajzolt szövegei a forrástétel minden szövegét tartalmazzák (a cím a blokk felirata).
  for (const visual of tables) {
    const drawn = new Set(rendererBlocks(visual).flatMap((b) => [String(b.caption), ...renderedVisualTexts("table", b.params)]));
    for (const source of sourceVisualTexts(visual)) assert.ok(drawn.has(source), `${visual.id}: „${source}” kirajzolva`);
  }
});

test("a leltár legnagyobb táblázata (8 oszlop × 40 sor) két blokkra bontva érvényes, és a kapun összeadódva megjelent", () => {
  const T = SOURCE_VISUAL_TABLE;
  const big = sourceVisualSchema.parse({ id: "big", kind: "table", sourceFile: "f.pdf", page: 1, role: "Nagy tábla.", conceptIds: [], title: "Nagy tábla",
    data: { headers: Array.from({ length: T.columns }, (_, c) => `fejléc ${c}`), headerTones: ["a", "b", "c", "neutral", "a", "b", "c", "neutral"],
      rows: Array.from({ length: T.rows }, (_, r) => Array.from({ length: T.columns }, (_, c) => `${r}/${c} ${text(T.cellChars - 8)}`)) } });
  const blocks = rendererBlocks(big);
  assert.equal(blocks.length, 2, "40 sor = két 20 soros blokk");
  assert.deepEqual(allValid(blocks), []);
  assert.equal(stateOf([big], blocks).big, "shown");
  // Ellenpróbák: fél tábla nem megjelenés; a csonka (rövidebb) sorú forrás kitöltve érvényes.
  assert.equal(stateOf([big], blocks.slice(0, 1)).big, "missing");
  const ragged = sourceVisualSchema.parse({ id: "rag", kind: "table", sourceFile: "f.pdf", page: 1, role: "r", data: { headers: ["a", "b", "c"], rows: [["1", "2", "3"], ["4"]] } });
  assert.deepEqual(allValid(rendererBlocks(ragged)), []);
  assert.equal(stateOf([ragged], rendererBlocks(ragged)).rag, "shown");
});

test("mutáció — a kapu és a séma együtt: elhagyott sor, átírt pont, rejtő kulcs nem megy át", () => {
  const [table] = hmInventory().filter((v) => v.kind === "table");
  const [rule] = hmInventory().filter((v) => v.kind === "ruleBox");
  const lost = rendererBlocks(table);
  (lost[0].params as { rows: string[][] }).rows.splice(1);
  assert.equal(stateOf([table], lost)[table.id], "missing", "a sorok háromnegyede nélkül a tábla hiány");
  const rewritten = rendererBlocks(rule);
  (rewritten[0].params as { items: string[] }).items = ["egészen más szöveg", "második más", "harmadik más"];
  assert.equal(stateOf([rule], rewritten)[rule.id], "missing", "átírt pontokkal a szabálydoboz hiány");
  const hiding = rendererBlocks(table);
  (hiding[0].params as Record<string, unknown>).hidden = true;
  assert.match(allValid(hiding).join(" "), /hidden/, "a rejtő kulcsot a séma megfogja (a rajzoló ilyen blokkot nem rajzol)");
});

/* ---------- független review B1: kirajzolhatatlan blokk nem kerülhet a tanuló elé ---------- */

test("B1 — a hibás paraméterű új fajtájú blokk determinisztikusan kiesik; az érvényes és a régi fajták érintetlenek", async () => {
  const { dropUndrawableSourceVisuals, sourceVisualProblems } = await import("../shared/lesson-visual-params");
  const { withoutUndrawableVisuals } = await import("../server/studio/single-run/engine");
  const animate = (animKind: string, params: unknown) => ({ kind: "animate", animKind, params, caption: "Felirat", coversConceptIds: ["c1"] });
  const explain = { kind: "explain", text: "Szöveg.", depth: "core", readAloud: false, coversConceptIds: ["c1"] };
  // A „gyártó-tipp” alakok: a lecke sémája elfogadja (`params: z.record`), a rajzoló viszont semmit nem rajzolna belőlük.
  const guessed = [animate("table", { title: "T", headers: ["a"], rows: [["1"]] }), animate("table", { columns: ["a", "b"], rows: [{ a: 1 }] }),
    animate("ruleBox", { heading: "Cím", items: ["pont"] }), animate("ruleBox", { title: "Cím", text: "pont" }), animate("compareCards", { left: {}, right: {} })];
  const kept = [explain, animate("table", TABLE), animate("ruleBox", RULE), animate("compareCards", CARDS), animate("process", {}), animate("geometry", {}), animate("cycle", { phases: [] })];
  const lesson = lessonSchema.parse({ title: "t", subject: "s", classroom: 6, mapId: "m", sourceOnly: true, misconceptions: [],
    sections: [{ heading: "Első", probaEnabled: false, blocks: [kept[0], guessed[0], kept[1], guessed[1], kept[2]] }, { heading: "Második", probaEnabled: false, blocks: [guessed[2], kept[3], guessed[3], kept[4], guessed[4], kept[5], kept[6]] }] });
  for (const block of guessed) assert.ok(sourceVisualProblems(block)?.length, "a kitalált alak hibás");
  for (const block of kept) assert.equal(sourceVisualProblems(block), null, "érvényes új fajta és bármely régi fajta nem érintett (a hibás paraméterű régi sem)");
  for (const block of guessed) assert.equal(render((block as { animKind: Kind }).animKind, block.params), "", "a rajzoló az ilyen blokkból semmit nem rajzol");

  const result = dropUndrawableSourceVisuals(lesson);
  assert.deepEqual(result.dropped.map((d) => `${d.path} ${d.animKind}`), ["sections[0].blocks[1] table", "sections[0].blocks[3] table", "sections[1].blocks[0] ruleBox", "sections[1].blocks[2] ruleBox", "sections[1].blocks[4] compareCards"]);
  assert.deepEqual(result.lesson.sections.map((s) => s.blocks.map((b) => (b.kind === "animate" ? b.animKind : b.kind))), [["explain", "table", "ruleBox"], ["compareCards", "process", "geometry", "cycle"]]);
  assert.ok(lessonSchema.safeParse(result.lesson).success, "a megmaradt lecke érvényes");
  assert.equal(dropUndrawableSourceVisuals(result.lesson).lesson, result.lesson, "ismételve nincs több változás (ugyanaz az objektum)");

  // A gyártásban: számlálva és naplózva, javítókör indítása nélkül (a függvény nem ad vissza hibát, csak a megtisztított leckét).
  const log: string[] = [];
  const telemetry = { gates: {} as { undrawableVisualsDropped?: number } };
  const cleaned = withoutUndrawableVisuals(lesson, (line) => log.push(line), telemetry);
  assert.equal(telemetry.gates.undrawableVisualsDropped, 5);
  assert.equal(log.length, 5);
  assert.match(log[0], /Kirajzolhatatlan ábrablokk kivéve: sections\[0\]\.blocks\[1\] \(table\) — table\./);
  assert.deepEqual(cleaned, result.lesson);
  assert.equal(withoutUndrawableVisuals(cleaned, (line) => log.push(line), telemetry), cleaned);
  assert.equal(telemetry.gates.undrawableVisualsDropped, 5, "hibátlan leckén a számláló nem nő");
  // Mutációs ellenpróba: egyetlen rejtő kulcs az érvényes táblán → pontosan az az egy blokk esik ki.
  const mutated = structuredClone(cleaned);
  (mutated.sections[0].blocks[1] as { params: Record<string, unknown> }).params.hidden = true;
  assert.deepEqual(dropUndrawableSourceVisuals(mutated).dropped.map((d) => d.path), ["sections[0].blocks[1]"]);
});

/* Vak ellenőr J9 (F7): a LEJÁTSZÓ szűrőjének bekötése (`LessonBlock`, `animate` ág). A modul stíluslapot és Vite-környezetet importál,
   ezért itt nem rajzolható ki — a bekötést a forrás szerkezete őrzi (a kirajzolt eredményt a böngészős `source-visuals.spec.ts` B1 esete
   méri): a szűrő az ág ELSŐ kilépése, a fejléc és a rajzoló kirajzolása ELŐTT áll. */
test("B1 — a lejátszó `animate` ágában a hibás paraméterű forrás-ábra szűrője a fejléc és a rajzoló ELŐTT lép ki (a bekötés nem köthető ki)", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/LessonRuntime.tsx", import.meta.url), "utf8");
  const start = source.indexOf('case "animate": {');
  const end = source.indexOf('case "try": {', start);
  assert.ok(start > 0 && end > start, "az animate ág megvan");
  const branch = source.slice(start, end);
  const guard = branch.indexOf("if (sourceVisualProblems(block)) return null;");
  assert.ok(guard > 0, "a szűrő az animate ágban van");
  assert.equal(branch.slice(0, guard).includes("return"), false, "a szűrő előtt nincs másik kilépés");
  for (const rendered of ["<BlockHead", "<Anim "]) assert.ok(branch.indexOf(rendered) > guard, `${rendered} a szűrő után`);
  assert.match(source, /import \{ sourceVisualProblems \} from "@shared\/lesson-visual-params";/, "ugyanaz a függvény, mint a szerveren");
});
