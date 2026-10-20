import { teachingHtml } from "./helpers/teaching-html";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { HTML_LESSON_DATA_CONTRACT, readHtmlLessonData, writeHtmlLessonData } from "../shared/lesson-html-data";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";
import { alignHtmlLessonBank } from "../server/improve/align-html-bank";

/* Spec 2026-10-19-okositas-bank-igazitas — mért: 1e169ace / a0d16870, a záró kapu a mintaválasz-pontozáson bukott. */

function htmlDocument() {
  const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "matematika", experience: fusionFixture().experience };
  return `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id = "websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`;
}

function withContradictingSample(): string {
  const html = htmlDocument();
  const data = readHtmlLessonData(html);
  // A minta helyes, de a rubrika mondatot kér, amit egy „4 cm²” válasz nem ad — a mintaválasz így csak fél pont.
  data.experience.tasks[0].needsSentence = true;
  return writeHtmlLessonData(html, data);
}

test("a mintájának ellentmondó rubrika a kapu előtt igazodik, és a kapu nem jelez mintaválasz-hibát", () => {
  const html = withContradictingSample();
  assert.match(verifyLessonMethodHtml(html).problems.join(" "), /t1: .*mintaválasz nem kap teljes pontot/);
  const result = alignHtmlLessonBank(html);
  assert.deepEqual(result.aligned, ["t1"]);
  assert.deepEqual(verifyLessonMethodHtml(result.html), { ok: true, problems: [] });
});

test("az igazítás a JSON-bankon kívül egy bájtot sem változtat", () => {
  const html = withContradictingSample();
  const out = alignHtmlLessonBank(html).html;
  const strip = (s: string) => s.replace(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>/, "");
  assert.equal(strip(out), strip(html));
  assert.notEqual(out, html);
});

test("helyes bank és olvashatatlan bank: semmi nem változik", () => {
  const ok = htmlDocument();
  assert.deepEqual(alignHtmlLessonBank(ok), { html: ok, aligned: [], narrowed: [], modeFlipped: [], dropped: [] });
  const broken = ok.replace(/("experience":)/, "$1 {");
  assert.deepEqual(alignHtmlLessonBank(broken), { html: broken, aligned: [], narrowed: [], modeFlipped: [], dropped: [] });
  const none = "<html><body>nincs bank</body></html>";
  assert.deepEqual(alignHtmlLessonBank(none), { html: none, aligned: [], narrowed: [], modeFlipped: [], dropped: [] });
});

test("a HTML-szerződés kimondja a csomagonkénti szóbeli/írásos szabályt", () => {
  assert.match(HTML_LESSON_DATA_CONTRACT, /MINDEN bankPlan-csomagban legalább max\(2,fogalomszám\) nyílt feladat, köztük legalább egy oral és egy written/);
});

test("az okosítás a kapu előtt igazít, és a tartalék próba megkapja az első kapu hibalistáját", () => {
  const src = fs.readFileSync("server/improveAsync.ts", "utf8");
  assert.ok(src.indexOf("alignHtmlLessonBank(improvedHtml)") < src.indexOf("verifyLessonMethodHtml(improvedHtml)"));
  assert.match(src, /previousProblems: error\.problems/);
  assert.match(src, /AZ ELŐZŐ PRÓBA ZÁRÓ ELLENŐRZÉSÉNEK HIBÁI/);
  assert.match(src, /verification\.problems\.join\(' '\)}`, verification\.problems\)/);
});

// Review #327: az alakhibás feladat (hiányos requiredDistinct) nem dob kivételt, és érintetlen marad — a sémakapu jelenti.
test("alakhibás feladat: nincs kivétel, a bank érintetlen, a kapu sémahibát jelez", () => {
  const html = htmlDocument();
  const data = readHtmlLessonData(html) as unknown as { experience: { tasks: Array<Record<string, unknown>> } };
  data.experience.tasks[0] = { ...data.experience.tasks[0], sample: "alma", minWords: 1, required: [["alma"]], requiredDistinct: [{ category: "gyümölcs", count: 1 }] };
  const broken = writeHtmlLessonData(html, data);
  const result = alignHtmlLessonBank(broken);
  assert.deepEqual(result, { html: broken, aligned: [], narrowed: [], modeFlipped: [], dropped: [] });
  assert.equal(verifyLessonMethodHtml(broken).ok, false);
});
