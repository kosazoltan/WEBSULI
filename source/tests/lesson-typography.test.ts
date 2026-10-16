import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HUNGARIAN_FONT_PROBE, LESSON_FONT_CSS, LESSON_FONTS, lessonFontPair, nfcDeep, withLessonTypography } from "../shared/lesson-typography";
import { LESSON_THEMES } from "../server/ai/lesson-html-spec";
import { withLessonInteractions } from "../shared/lesson-interactions";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("rendered lessons replace the formerly immutable runtime URL without changing author scripts", () => {
  const author = '<script>const example="websuli-interactions";</script>';
  const old = `<html><head><script src="/lesson-interactions.js" type="module" id="websuli-interactions"></script>${author}</head><body><script id="websuli-lesson-data" type="application/json">{}</script></body></html>`;
  const rendered = withLessonInteractions(old);
  assert.match(rendered, /src="\/lesson-interactions\.js\?v=2"/);
  assert.equal((rendered.match(/id="websuli-interactions"/g) ?? []).length, 1);
  assert.ok(rendered.includes(author));
  assert.equal(withLessonInteractions(rendered), rendered);
  const comment = '<!-- <script id="websuli-interactions" src="/lesson-interactions.js"></script> -->';
  assert.ok(withLessonInteractions(old.replace(author, comment + author)).includes(comment));
});
test("every allowed font has the measured full Hungarian normal and italic artifact, unchanged since cmap verification", () => {
  const manifest = JSON.parse(read("client/public/fonts/manifest.json"));
  for (const family of LESSON_FONTS) for (const style of ["normal", "italic"]) {
    const face = manifest.fonts.find((f: { family: string; style: string }) => f.family === family && f.style === style);
    assert.ok(face, `${family} ${style}`);
    const bytes = readFileSync(new URL(`../client/public/fonts/${face.file}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), face.sha256, "changed font must repeat cmap verification");
    assert.equal(face.hungarianVerified, true);
    assert.ok(face.weight[0] <= 400 && face.weight[1] >= 800);
    for (const char of "ÁÉÍÓÖŐÚÜŰáéíóöőúüű") assert.ok(manifest.requiredCharacters.includes(char));
    // Websuli Design: a kombinálható ékezetjelek fedettsége a manifestben rögzített (az Interből az U+030B hiányzik; a megjelenítés
    // NFC-re normalizál, így előre összetett glifát kap) — más hiány nem lehet.
    assert.deepEqual(face.combiningMissing, family === "Inter" ? ["U+030B"] : []);
  }
  for (const char of "\u0301\u0308\u030b") assert.ok(manifest.combiningMarks.includes(char));
  assert.equal(manifest.fonts.length, 10);
});
// Websuli Design (dokumentált spec-változás, docs/specs/2026-10-16-websuli-design.md): 1–5. o. Nunito Sans, 0. és 6–12. o. Inter.
test("the lesson font comes from the grade band only (Nunito Sans 1–5, Inter 0 and 6–12); authoring themes stay bundled", () => {
  const bundled = new Set(JSON.parse(read("client/public/fonts/manifest.json")).fonts.map((f: { family: string }) => f.family));
  for (const theme of LESSON_THEMES) for (const font of [theme.bodyFont, theme.headingFont, theme.displayFont].filter(Boolean)) {
    assert.ok(bundled.has(font!), `${theme.id}: ${font}`);
  }
  for (const c of [1, 2, 3, 4, 5]) assert.deepEqual(lessonFontPair(c, "irodalom"), { body: "Nunito Sans", heading: "Nunito Sans" }, String(c));
  for (const c of [0, 6, 7, 8, 9, 10, 11, 12]) assert.deepEqual(lessonFontPair(c, "irodalom"), { body: "Inter", heading: "Inter" }, String(c));
});
// Review #266: a stíluslap URL-je verziózott (immutable gyorsítótár), és az index.html előtöltése ugyanezt kéri.
test("the lesson font stylesheet URL is versioned and the app shell preloads the same URL", () => {
  assert.match(LESSON_FONT_CSS, /^\/fonts\/lesson-fonts\.css\?v=hu-\d+$/);
  assert.ok(read("client/index.html").includes(`href="${LESSON_FONT_CSS}"`));
});
// Review #266: csak a megjelenített szöveg kerül NFC-be — az azonosítók, a szerzői szkriptek és a tag-attribútumok változatlanok.
test("NFC keeps machine references: ids, …Id(s), hashes and author scripts / attributes stay byte-identical", () => {
  const nfd = (s: string) => s.normalize("NFD");
  const lesson = { title: nfd("tűzoltó"), experience: { tasks: [{ id: nfd("tűz-1"), q: nfd("Mi az ő?"), coversConceptIds: [nfd("ő-fogalom")] }] }, mapId: nfd("ű"), sourceHash: nfd("ő") };
  const out = nfcDeep(lesson);
  assert.equal(out.title, "tűzoltó");
  assert.equal(out.experience.tasks[0].q, "Mi az ő?");
  assert.equal(out.experience.tasks[0].id, nfd("tűz-1"), "a feladat id-je változatlan (a döntőbíró pontos egyezéssel keresi)");
  assert.deepEqual(out.experience.tasks[0].coversConceptIds, [nfd("ő-fogalom")]);
  assert.equal(out.mapId, nfd("ű"));
  assert.equal(out.sourceHash, nfd("ő"));
  const script = `<script>var k="${nfd("ő")}"; document.getElementById("o\\u030b");</script>`;
  const html = `<html><head><style>.${nfd("ő")}{color:red}</style></head><body><p id="${nfd("ő")}" data-k="${nfd("ű")}">${nfd("tűzoltó")}</p>${script}</body></html>`;
  const rendered = withLessonTypography(html, 7);
  assert.ok(rendered.includes(script), "a szerzői szkript bájtra változatlan");
  assert.ok(rendered.includes(`id="${nfd("ő")}" data-k="${nfd("ű")}"`), "a tag-attribútumok változatlanok");
  assert.ok(rendered.includes(`.${nfd("ő")}{color:red}`), "a stílusblokk változatlan");
  assert.ok(rendered.includes(">tűzoltó<"), "a megjelenített szöveg NFC");
});
test("NFC: decomposed ő/ű become precomposed (the font's own glyph), nested lesson data included", () => {
  const nfd = "Árvíztűrő tükörfúrógép".normalize("NFD");
  assert.notEqual(nfd, "Árvíztűrő tükörfúrógép");
  assert.deepEqual(nfcDeep({ title: nfd, list: [nfd, 3, null], nested: { x: nfd } }), { title: "Árvíztűrő tükörfúrógép", list: ["Árvíztűrő tükörfúrógép", 3, null], nested: { x: "Árvíztűrő tükörfúrógép" } });
  assert.ok(withLessonTypography(`<p>${nfd}</p>`, 7).includes("<p>Árvíztűrő tükörfúrógép</p>"));
});
test("HTML typography is idempotent, same-origin and leaves lesson text and scripts unchanged", () => {
  const code = '<script>var result="őű"; var points=0;</script>';
  const original = `<!doctype html><html lang="hu"><head><link href="https://fonts.googleapis.com/css2?family=Poppins" rel="stylesheet"><style>p{color:navy}</style></head><body><h1>${HUNGARIAN_FONT_PROBE}</h1>${code}</body></html>`;
  const rendered = withLessonTypography(original);
  assert.equal(withLessonTypography(rendered), rendered);
  assert.ok(rendered.includes(code));
  assert.ok(rendered.includes(`<h1>${HUNGARIAN_FONT_PROBE}</h1>`));
  assert.ok(rendered.includes('href="/fonts/lesson-fonts.css?v=hu-2"'));
  assert.doesNotMatch(rendered, /fonts\.googleapis/);
  assert.equal((rendered.match(/<body>/g) ?? []).length, 1);
  assert.match(withLessonTypography("<p>Árvíz</p>", 2), /font-family:"Nunito Sans","Noto Sans", sans-serif!important/);
  assert.match(withLessonTypography("<p>Árvíz</p>", 9), /font-family:"Inter","Noto Sans", sans-serif!important/);
  assert.match(withLessonTypography("<p>ű</p>", 7, "", "https://websuli.vip/preview"), /href="https:\/\/websuli.vip\/fonts\/lesson-fonts.css\?v=hu-2"/);
  assert.throws(() => withLessonTypography("<p>ő</p>", 7, "", "javascript:alert(1)"));
});
