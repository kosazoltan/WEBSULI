import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HUNGARIAN_FONT_PROBE, LESSON_FONTS, lessonFontPair, withLessonTypography } from "../shared/lesson-typography";
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
    for (const char of "ÁÉÍÓÖŐÚÜŰáéíóöőúüű\u0301\u0308\u030b") assert.ok(manifest.requiredCharacters.includes(char));
  }
  assert.equal(manifest.fonts.length, 6);
});
test("all authoring themes use only the measured whitelist", () => {
  for (const theme of LESSON_THEMES) for (const font of [theme.bodyFont, theme.headingFont, theme.displayFont].filter(Boolean)) {
    assert.ok(LESSON_FONTS.includes(font!), `${theme.id}: ${font}`);
  }
  assert.equal(lessonFontPair(2).body, "Nunito");
  assert.equal(lessonFontPair(7).body, "Source Sans 3");
  assert.equal(lessonFontPair(7, "irodalom").heading, "Source Serif 4");
});
test("HTML typography is idempotent, same-origin and leaves lesson text and scripts unchanged", () => {
  const code = '<script>var result="őű"; var points=0;</script>';
  const original = `<!doctype html><html lang="hu"><head><link href="https://fonts.googleapis.com/css2?family=Poppins" rel="stylesheet"><style>p{color:navy}</style></head><body><h1>${HUNGARIAN_FONT_PROBE}</h1>${code}</body></html>`;
  const rendered = withLessonTypography(original);
  assert.equal(withLessonTypography(rendered), rendered);
  assert.ok(rendered.includes(code));
  assert.ok(rendered.includes(`<h1>${HUNGARIAN_FONT_PROBE}</h1>`));
  assert.ok(rendered.includes('href="/fonts/lesson-fonts.css"'));
  assert.doesNotMatch(rendered, /fonts\.googleapis/);
  assert.equal((rendered.match(/<body>/g) ?? []).length, 1);
  assert.match(withLessonTypography("<p>Árvíz</p>", 2), /font-family:"Nunito"/);
  assert.match(withLessonTypography("<p>ű</p>", 7, "", "https://websuli.vip/preview"), /href="https:\/\/websuli.vip\/fonts\/lesson-fonts.css"/);
  assert.throws(() => withLessonTypography("<p>ő</p>", 7, "", "javascript:alert(1)"));
});
