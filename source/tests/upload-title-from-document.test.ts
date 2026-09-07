import assert from "node:assert/strict";
import test from "node:test";

import { titleFromHtmlDocument } from "../client/src/lib/uploadTitle";

/**
 * T-5 — a tananyag CÍME a dokumentumból jöjjön, ne a fájlnévből.
 *
 * Mérve (2026-09-07, websuli.vip éles lista): a 168 tananyag között ilyen címek
 * állnak: „4. osztály - 25. Betegseg, gyogyulas - 4. osztaly tananyag" és
 * „5. osztály - Kornyezetunk anyagai - 5. osztaly tananyag" — ékezetek nélkül,
 * miközben a szomszédos kártyák („Az emberi test - Egészségünk") helyesek.
 *
 * A kód SEHOL nem szed le ékezetet (végigkövetve: a title a `createHtmlFile`-ig
 * érintetlenül megy). A forrás a feltöltő űrlap automatikus kitöltése volt: a
 * cím a FÁJLNÉVBŐL jött, a fájlnevek pedig „biztonságos", ékezet nélküli
 * alakban készültek. A dokumentum SAJÁT `<title>`-je viszont rendes magyar
 * szöveg — csak eddig senki nem nézte meg.
 *
 * A fájlnév marad a végső tartalék: ha a dokumentumban nincs használható cím,
 * a feltöltés ne akadjon el.
 */

test("a dokumentum <title>-je erősebb a fájlnévnél", () => {
  const html = `<!doctype html><html><head><title>Betegség, gyógyulás</title></head><body>x</body></html>`;

  assert.equal(titleFromHtmlDocument(html, "25. Betegseg, gyogyulas.html"), "Betegség, gyógyulás");
});

test("az ékezetek sértetlenül jönnek át", () => {
  const html = `<title>Környezetünk anyagai — mérés és megfigyelés</title>`;

  assert.equal(
    titleFromHtmlDocument(html, "Kornyezetunk anyagai.html"),
    "Környezetünk anyagai — mérés és megfigyelés",
  );
});

test("HTML-entitásokat feloldja", () => {
  const html = `<title>Matek &amp; nyelvtan &#8211; 4. oszt&aacute;ly</title>`;

  assert.equal(titleFromHtmlDocument(html, "x.html"), "Matek & nyelvtan – 4. osztály");
});

test("a sablon-címeket nem fogadja el, megy tovább a <h1>-re", () => {
  for (const boiler of ["Document", "Untitled", "Untitled Document", "index", "Új dokumentum"]) {
    const html = `<title>${boiler}</title><h1>A víz körforgása</h1>`;
    assert.equal(titleFromHtmlDocument(html, "viz.html"), "A víz körforgása", boiler);
  }
});

test("a <h1> belsejéből kiszedi a jelöléseket", () => {
  const html = `<h1 class="x">  <span>Az emberi <b>test</b></span> — Egészségünk  </h1>`;

  assert.equal(titleFromHtmlDocument(html, "test.html"), "Az emberi test — Egészségünk");
});

test("ha semmi használható nincs, a fájlnév marad — kiterjesztés nélkül", () => {
  assert.equal(titleFromHtmlDocument("<p>nincs cím</p>", "Kornyezetunk anyagai.html"), "Kornyezetunk anyagai");
  assert.equal(titleFromHtmlDocument("", "lecke.HTM"), "lecke");
});

test("kommentben álló cím nem számít", () => {
  const html = `<!-- <title>Régi cím</title> --><title>Igazi cím</title>`;

  assert.equal(titleFromHtmlDocument(html, "x.html"), "Igazi cím");
});

test("a script/style belsejéből nem olvas címet", () => {
  const html = `<script>const s = "<h1>Nem ez</h1>";</script><h1>Ez az</h1>`;

  assert.equal(titleFromHtmlDocument(html, "x.html"), "Ez az");
});

test("a túl rövid cím nem cím", () => {
  const html = `<title>ok</title><h1>A tizedes törtek</h1>`;

  assert.equal(titleFromHtmlDocument(html, "x.html"), "A tizedes törtek");
});

test("a hosszú címet levágja, de nem szó közepén", () => {
  const long = `<title>${"Nagyon hosszú fejezetcím ".repeat(20)}</title>`;
  const got = titleFromHtmlDocument(long, "x.html");

  assert.ok(got.length <= 200, `${got.length} karakter`);
  assert.doesNotMatch(got, /\s$/, "ne maradjon lógó szóköz");
});

test("sosem ad üres címet", () => {
  for (const [html, name] of [["", ""], ["<title>   </title>", ".html"], ["", "   "]] as const) {
    assert.ok(titleFromHtmlDocument(html, name).length > 0, `${html} | ${name}`);
  }
});

/* ------------------------- a bekötés őre (#183 osztály) ------------------------- */

test("a feltöltő űrlap tényleg a dokumentumból veszi a címet, nem a fájlnévből", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = fileURLToPath(new URL("../client/src/components/SimpleHtmlUpload.tsx", import.meta.url));
  const code = readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  assert.match(code, /titleFromHtmlDocument\s*\(/, "nincs bekötve a cím-kiolvasó");
  assert.doesNotMatch(
    code,
    /setTitle\(\s*file\.name\.replace/,
    "a fájlnév még mindig felülírja a dokumentum címét",
  );
});
