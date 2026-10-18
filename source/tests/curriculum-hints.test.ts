import { test } from "node:test";
import assert from "node:assert/strict";
import { hintsFromHtml, hintsFromLesson } from "../server/curriculum/hints";
import { buildIndex, matchMaterial, type TanmenetData } from "../server/curriculum/match";
import { withCurriculum } from "../server/curriculum/index";
import tanmenet from "../server/data/tanmenet-2020.json";

// Tanmenet-rendezés kiegészítése (docs/specs/2026-10-18-tanmenet-kiegeszites.md).
const index = buildIndex(tanmenet as TanmenetData);
// A valódi „8. osztály algebra” anyag címsorai (éles, 2026-10-18).
const ALGEBRA = ["Algebra – Témazáró Felkészítő", "1. A betűs kifejezések világa", "Mit jelent, ha a matematikában betűkkel számolunk?", "Helyettesítési érték",
  "2. Összeg, különbség, szorzat, hányados", "Egynemű és különnemű tagok", "3. Zárójelek és előjelek kezelése", "A szorzás összeadásra bontása (disztributív tulajdonság)",
  "4. Egyenletek megoldása", "Az egyenletmegoldás lépései"];

test("jelzők: HTML címsorok (szkript és stílus nélkül), lecke félkövér kulcsfogalmai", () => {
  const html = `<style>h1{}</style><h1>Algebra <b>alap</b></h1><script>"<h2>nem</h2>"</script><h2>Betűs kifejezések</h2><h4>kimarad</h4><h2>Betűs kifejezések</h2>`;
  assert.deepEqual(hintsFromHtml(html), ["Algebra alap", "Betűs kifejezések"]);
  const lesson = { sections: [{ blocks: [{ kind: "explain", text: "A **műveleti sorrend** és a **zárójel** szabálya." }, { kind: "check", title: "Ellenőrzés" }] }] };
  assert.deepEqual(hintsFromLesson(lesson), ["műveleti sorrend", "zárójel", "Ellenőrzés"]);
  assert.deepEqual(hintsFromLesson(null), []);
});

test("tartalom szerinti illesztés: az általános cím a tartalom alapján a helyére kerül; évfolyam nélküli anyag nem kap pozíciót", () => {
  assert.equal(matchMaterial({ title: "8. osztály algebra", classroom: 8 }, index), null, "a cím önmagában nem elég");
  const m = matchMaterial({ title: "8. osztály algebra", classroom: 8, hints: ALGEBRA }, index);
  assert.ok(m && /Betűs kifejezések/i.test(m.label), JSON.stringify(m));
  assert.equal(matchMaterial({ title: "Informatika - ChatGPT Használata Kezdőknek", classroom: 0, hints: ["Mi a ChatGPT?", "Prompt"] }, index), null);
});

test("review-mérés negatív esetei: két tartalmas címszónál a tartalom nem viheti el a címhez nem illő órához", () => {
  const nb = matchMaterial({ title: "Nagy-Britannia és Franciaország – 8. osztályos földrajz", classroom: 8, hints: ["Domborzat", "Éghajlat és vízrajz", "Népesség és városok", "Gazdaság", "Közlekedés"] }, index);
  assert.ok(!nb || !/Amerika/.test(nb.label), JSON.stringify(nb));
});

test("withCurriculum: a betöltő csak a cím alapján nem illeszthető, évfolyammal bíró anyagokra fut, és csak egyszer", async () => {
  let calls = 0; let asked: string[] = [];
  const load = async (items: readonly { id: string }[]) => { calls++; asked = items.map(i => i.id); return new Map([["alg", { html: ALGEBRA.map(h => `<h2>${h}</h2>`).join("") }]]); };
  const files = [
    { id: "romai", title: "5. osztály - A számírás fejlődése - Római számok", classroom: 5 },
    { id: "alg", title: "8. osztály algebra", classroom: 8 },
    { id: "it", title: "Informatika - ChatGPT Használata Kezdőknek", classroom: 0 },
  ];
  const out = await withCurriculum(files, load);
  assert.deepEqual(asked, ["alg"], "a cím alapján illeszthető és a 0. évfolyam nem töltődik");
  assert.ok(out[0].curriculum && out[1].curriculum && /Betűs/.test(out[1].curriculum.label));
  assert.equal(out[2].curriculum, null);
  await withCurriculum(files, load);
  assert.equal(calls, 1, "a második listázás a memóriából dolgozik");
});

test("review #284: bármely lista-invalidálás (Studio, javítás alkalmazása) üríti a tartalomjelzőket — az új tartalom újra beolvasódik", async () => {
  const { getHtmlFilesCache } = await import("../server/cache/HtmlFilesCache");
  let calls = 0;
  const load = async () => { calls++; return new Map([["alg2", { html: ALGEBRA.map(h => `<h2>${h}</h2>`).join("") }]]); };
  const files = [{ id: "alg2", title: "8. osztály algebra", classroom: 8 }];
  await withCurriculum(files, load);
  await withCurriculum(files, load);
  assert.equal(calls, 1);
  getHtmlFilesCache().invalidate();
  await withCurriculum(files, load);
  assert.equal(calls, 2, "a központi invalidate() után a memó üres");
});

test("tantárgy a hivatalos tanmenet szókincséből, ha a cím nem mondja ki; a „halmazállapot” nem matematika", async () => {
  const { subjectByVocabulary, subjectsOfTitle, normalizeTokens } = await import("../server/curriculum/match");
  assert.deepEqual(subjectByVocabulary(normalizeTokens("Fotoszintézis és sejtlégzés"), 9, index), ["biologia"]);
  assert.notDeepEqual(subjectsOfTitle("Halmazállapot-változások"), ["matematika"]);
  assert.deepEqual(subjectsOfTitle("Halmazok és halmazműveletek"), ["matematika"]);
});

test("nyelvi tanmenet (iskolai, forrással): az angol és a francia anyag a nyelvi tervhez illeszkedik, a nyelvi terv nem viszi el a magyar anyagot", async () => {
  const { curriculumOf, curriculumData } = await import("../server/curriculum/index");
  const plans = curriculumData().plans;
  assert.ok(plans.some(p => p.subject === "angol" && p.grade === 4 && /^https?:\/\//.test(p.source)), "forrás-URL-lel");
  assert.ok(!JSON.stringify(plans.filter(p => p.subject === "angol" || p.subject === "francia")).includes("UNVERIFIED"));
  const some = curriculumOf({ title: "Angol 6. osztály – a / an / some / any", classroom: 6 });
  assert.ok(some && /some, any/i.test(some.label), JSON.stringify(some));
  const fr = curriculumOf({ title: "🇫🇷 8. Osztályos Francia Témazáró", classroom: 8, hints: ["L'école", "Iskola és tantárgyak", "Francia nyelvtanulás"] });
  assert.ok(!fr || /Francia 8\./.test(fr.label), JSON.stringify(fr));
  const hu = curriculumOf({ title: "4. osztály - Tulajdonságot kifejező szavak", classroom: 4 });
  assert.ok(hu && /Magyar nyelv 4/.test(hu.label), JSON.stringify(hu));
});
