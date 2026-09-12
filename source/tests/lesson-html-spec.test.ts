import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  lessonFontsLink,
  LESSON_HTML_SPEC_V74,
  LESSON_SPEC_VERSION,
  LESSON_THEMES,
  lessonHtmlSpecPrompt,
  lessonThemePrompt,
  pickLessonTheme,
} from "../server/ai/lesson-html-spec";
import { LESSON_HTML_REQUIREMENTS, webResearchSystemPrompt } from "../server/studio/web-research-agent";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

// ---------------------------------------------------------------- a spec tartalma

test("a v7.4 spec a skill kötelező elemeit tartalmazza", () => {
  assert.equal(LESSON_SPEC_VERSION, "7.4");
  const s = LESSON_HTML_SPEC_V74;
  // háromrétegű motor
  for (const marker of ["function ee_evaluate", "function ee_lev", "function ee_stem", "required:", "bonus:", "minWords:", "needsSentence:", "sample:"]) {
    assert.ok(s.includes(marker), `hiányzik: ${marker}`);
  }
  assert.match(s, /✅ Elfogadva/);
  assert.match(s, /🟡 Részben jó/);
  assert.match(s, /❌ Hiányos/);
  // TTS + diktálás
  assert.match(s, /data-tts/);
  assert.match(s, /SpeechSynthesisUtterance/);
  assert.match(s, /SpeechRecognition/);
  assert.match(s, /window\.self !== window\.top/);
  // ékezetek / Android
  assert.match(s, /fonts\/lesson-fonts\.css/);
  assert.match(s, /Nunito, Source Sans 3, Source Serif 4/);
  assert.match(s, /http-equiv="Content-Type"/);
  assert.match(s, /Ne tölts be Google Fonts vagy más külső fontot/);
  // mennyiségek és szerkezet
  // Approved v2 contract: coverage-based amounts and an optional full overview.
  assert.match(s, /bankPlan.taskRound/);
  assert.match(s, /bankPlan.quizRound/);
  assert.match(s, /teljes áttekintéssel/);
  assert.doesNotMatch(s, /külső függőség CSAK a Google Fonts/);
  assert.match(s, /alert\(\)\/confirm\(\)\/prompt\(\)/);
  assert.match(s, /'use strict'/);
});

test("a spec nem írja elő a régi, Androidon hibás font-stacket", () => {
  assert.doesNotMatch(LESSON_HTML_SPEC_V74, /Segoe UI, Noto Sans, system-ui/);
  assert.doesNotMatch(LESSON_HTML_SPEC_V74, /SOHA @font-face vagy Google Fonts/);
});

// ---------------------------------------------------------------- téma-választó

test("pickLessonTheme determinisztikus és változatos", () => {
  const a = pickLessonTheme("Törtek bevezetése", 5);
  const b = pickLessonTheme("Törtek bevezetése", 5);
  assert.equal(a.id, b.id);
  const seeds = [
    "Törtek bevezetése", "A víz körforgása", "Mátyás király", "Countable nouns", "Fotoszintézis",
    "Python ciklusok", "Petőfi Sándor", "Kerület és terület", "Az emberi test", "Halmazok",
    "Mesék", "Időjárás",
  ];
  const ids = new Set(seeds.map((s, i) => pickLessonTheme(s, (i % 8) + 1).id));
  assert.ok(ids.size >= 3, `túl kevés téma-variáció: ${[...ids].join(",")}`);
  for (const t of LESSON_THEMES) assert.ok(LESSON_THEMES.filter((x) => x.id === t.id).length === 1);
});

test("a tantárgy és a korosztály irányítja a téma-jelölteket", () => {
  assert.ok(["pergamen", "kreta"].includes(pickLessonTheme("Mátyás király és a reneszánsz", 6, "történelem").id));
  assert.ok(["ur", "labor"].includes(pickLessonTheme("Python ciklusok", 0, "informatika").id));
  assert.ok(["erdo", "tenger"].includes(pickLessonTheme("A víz körforgása a természetben", 4).id));
  assert.ok(["naplemente", "tenger"].includes(pickLessonTheme("Countable and uncountable nouns", 4, "angol").id));
  // alsó tagozat: a játékos téma mindig jelölt
  const small = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((s) => pickLessonTheme(s, 2).id));
  for (const id of small) assert.ok(["cukorka", "naplemente", "erdo", "kreta"].includes(id), id);
});

test("a téma-prompt csak a mért helyi magyar fontokat kéri (jóváhagyott tipográfiai szerződésváltás)", () => {
  for (const theme of LESSON_THEMES) {
    const link = lessonFontsLink();
    assert.equal(link, "/fonts/lesson-fonts.css");
    const p = lessonThemePrompt(theme, 5);
    assert.ok(p.includes(link));
    assert.match(p, /Source Sans 3/);
    assert.doesNotMatch(p, /system-ui/);
    assert.match(p, new RegExp(`\\\`${theme.prefix}-\\\``));
  }
  assert.match(lessonThemePrompt(LESSON_THEMES[0], 2), /1–2\. évfolyam/);
  assert.match(lessonThemePrompt(LESSON_THEMES[0], 4), /3–4\. évfolyam/);
  for (const theme of LESSON_THEMES) {
    assert.match(lessonThemePrompt(theme, 2), /font-family címsor: 'Nunito',sans-serif/);
    assert.match(lessonThemePrompt(theme, 4), /font-family törzs: 'Nunito',sans-serif/);
    assert.match(lessonThemePrompt(theme, 7), /font-family törzs: 'Source Sans 3',sans-serif/);
  }
  assert.match(lessonThemePrompt(LESSON_THEMES[0], 0), /programozási alapismeretek/);
});

test("lessonHtmlSpecPrompt = téma + teljes spec", () => {
  const p = lessonHtmlSpecPrompt({ classroom: 7, seed: "Kerület és terület", subjectHint: "matematika" });
  assert.match(p, /## MEGJELENÍTÉSI TÉMA/);
  // Spec change: the current fusion contract follows the historical v7.4 reference.
  assert.ok(p.includes(LESSON_HTML_SPEC_V74));
  assert.ok(p.indexOf("HTML-fúzió adatszerződés") > p.indexOf(LESSON_HTML_SPEC_V74));
  assert.match(p, /websuli-lesson-data/);
});

// ---------------------------------------------------------------- bekötés a 4 HTML-gyártó helyre

test("a webes ügynök promptja a v7.4 specet és a témát hordozza", () => {
  assert.equal(LESSON_HTML_REQUIREMENTS, LESSON_HTML_SPEC_V74);
  const p = webResearchSystemPrompt(5, "Törtek — 5. osztály", "Keress törtes tananyagot");
  assert.ok(p.includes(LESSON_HTML_SPEC_V74));
  assert.match(p, /## MEGJELENÍTÉSI TÉMA/);
  assert.match(p, /fonts\/lesson-fonts\.css/);
});

test("routes.ts mindkét készítő promptja és az Okosítás a közös specet fűzi be", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /import \{ lessonHtmlSpecPrompt \} from "\.\/ai\/lesson-html-spec"/);
  assert.ok((routes.match(/lessonHtmlSpecPrompt\(\{/g) ?? []).length >= 2, "két készítő route");
  assert.match(routes, /\$\{customPrompt\.prompt\}\\n\\n\$\{specBlock\}/, "a DB-s egyedi prompt mellé is hozzáfűződik");
  assert.doesNotMatch(routes, /SOHA @font-face vagy Google Fonts/);
  assert.doesNotMatch(routes, /Segoe UI, Noto Sans, system-ui/);
  const improve = read("server/improveAsync.ts");
  assert.match(improve, /lessonHtmlSpecPrompt\(\{/);
  assert.match(improve, /\$\{specBlock\}/);
  assert.doesNotMatch(improve, /TILOS\*\*: @font-face, Google Fonts/);
  // a régi kötelező font-sor eltűnt (a „Segoe UI” csak a cserére utasító prioritásban maradhat)
  assert.doesNotMatch(improve, /Font: font-family: Segoe UI/);
  assert.doesNotMatch(improve, /UTF-8 \+ Segoe UI font/);
  assert.doesNotMatch(improve, /Google Fonts latin-ext \+|Cél: 75 kérdés|Cél: 45 feladat/);
});

test("a készítő route-on nincs 60 s-os abszolút korlát, és 64K a kimenet", () => {
  const routes = read("server/routes.ts");
  assert.doesNotMatch(routes, /Request timeout \(60s\)/);
  assert.match(routes, /touchClaude\(\)/);
  assert.match(routes, /max_tokens: 64000/);
  assert.match(read("server/studio/web-research-runner.ts"), /MAX_TOKENS = 64_000/);
});

test("a webes ügynök route-ja hibánál visszatartja a HTML-t", () => {
  const src = read("server/studio/web-research-runner.ts");
  assert.match(src, /verifyLessonMethodHtml\(html\)/);
  // Gate result is now handled before the artifact event, including automatic repair.
  assert.match(src, /decideWebResearchResult\(\{ stopReason, fullContent, repairAttempts, sources \}, html => verifyLessonMethodHtml\(html\)\)/);
  assert.match(src, /if \(result\.type === "error"\) throw new WebResearchFailure\(result.message\)/);
  assert.match(src, /sources: \[\.\.\.fetched\.values\(\)\]/);
  assert.match(src, /cache_control: \{ type: "ephemeral" \}/);
  const panel = read("client/src/components/studio/WebResearchAgentPanel.tsx");
  assert.match(panel, /web-research-error/);
});
