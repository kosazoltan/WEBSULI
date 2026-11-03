import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptionAfterLessonChange, isPlaceholderDescription, lessonTeaser, LESSON_PLACEHOLDER_DESCRIPTION, teaserFromText, TEASER_MAX } from "../shared/lesson-teaser";

test("review #383: a számon, képleten, domainen belüli pont és a záró idézőjel nem mondathatár; az írásjelek változatlanok", () => {
  assert.equal(teaserFromText("A sorozat: 1.000 + 500 = 1.500."), "A sorozat: 1.000 + 500 = 1.500.");
  assert.equal(teaserFromText("Képlet: $3.14$ a pí."), "Képlet: $3.14$ a pí.");
  assert.equal(teaserFromText("A „Miért?” kérdésre válaszolunk. Második mondat."), "A „Miért?” kérdésre válaszolunk. Második mondat.");
  assert.equal(teaserFromText("Látogass el a websuli.vip oldalra. Ott vár a lecke."), "Látogass el a websuli.vip oldalra. Ott vár a lecke.");
  const long = `Az első mondat 1.500 forintról szól, és elég hosszú ahhoz, hogy a második mondat már ne férjen el a százhatvan karakteres keretben, ezt mérjük. A második „mondat” itt túllógna.`;
  assert.equal(teaserFromText(long), "Az első mondat 1.500 forintról szól, és elég hosszú ahhoz, hogy a második mondat már ne férjen el a százhatvan karakteres keretben, ezt mérjük.");
});

test("review #383: javításkor az automatikus leírás (helyőrző / az előző bevezető) frissül, a kézzel írt nem", () => {
  const before = { sections: [{ blocks: [{ kind: "explain", text: "Régi bevezető." }] }] };
  const after = { sections: [{ blocks: [{ kind: "explain", text: "Javított bevezető." }] }] };
  assert.equal(descriptionAfterLessonChange("Régi bevezető.", before, after), "Javított bevezető.");
  assert.equal(descriptionAfterLessonChange(LESSON_PLACEHOLDER_DESCRIPTION, before, after), "Javított bevezető.");
  assert.equal(descriptionAfterLessonChange(null, before, after), "Javított bevezető.");
  assert.equal(descriptionAfterLessonChange("Kézzel írt ajánló a tanártól.", before, after), undefined);
  assert.equal(descriptionAfterLessonChange("Régi bevezető.", before, { sections: [] }), LESSON_PLACEHOLDER_DESCRIPTION);
});

// Spec 2026-11-03-egyseges-kartya-leiras: a kártya leírása a lecke bevezetője (mérve: 217-ből 213 anyagon a közös helyőrző állt).
test("jelölés nélkül, egész mondatokra rövidítve, az első bekezdésből", () => {
  const text = "Az **Antigoné** egy ma is érvényes kérdést tesz fel: kinek engedelmeskedjünk, ha a király parancsa és a lelkiismeret ellentmond egymásnak? Ha ezt a konfliktust érted, a görög tragédia logikáját is érted.\n\nAz Antigoné című drámát Szophoklész írta.";
  const t = teaserFromText(text)!;
  assert.equal(t, "Az Antigoné egy ma is érvényes kérdést tesz fel: kinek engedelmeskedjünk, ha a király parancsa és a lelkiismeret ellentmond egymásnak?");
  assert.ok(t.length <= TEASER_MAX);
  assert.doesNotMatch(t, /\*\*|Szophoklész/);
});

test("az egyetlen hosszú mondat szóhatáron, „…”-tal vágódik; az üres vagy csak jelölésből álló szöveg null", () => {
  const long = `${"nagyon ".repeat(40)}hosszú mondat`;
  const t = teaserFromText(long)!;
  assert.ok(t.endsWith("…") && t.length <= TEASER_MAX, t);
  assert.doesNotMatch(t, / …$/);
  assert.equal(teaserFromText("   \n\n  "), null);
  assert.equal(teaserFromText("**"), null);
  assert.equal(teaserFromText(undefined), null);
  assert.equal(teaserFromText("## Cím\nA *víz* körforgása."), "Cím A víz körforgása.");
});

test("a lecke első fejezetének első magyarázó blokkja; hiányában az első szöveges blokk; hiányos lecke null", () => {
  const lesson = { sections: [{ blocks: [{ kind: "animate", title: "x" }, { kind: "example", text: "Példa." }, { kind: "explain", text: "A törtek a részek." }] }, { blocks: [{ kind: "explain", text: "Második." }] }] };
  assert.equal(lessonTeaser(lesson), "A törtek a részek.");
  assert.equal(lessonTeaser({ sections: [{ blocks: [{ kind: "example", text: "Csak példa." }] }] }), "Csak példa.");
  assert.equal(lessonTeaser({ sections: [] }), null);
  assert.equal(lessonTeaser(null), null);
});

test("a helyőrző és az üres leírás felismerése; a valódi leírás nem helyőrző", () => {
  assert.equal(isPlaceholderDescription(LESSON_PLACEHOLDER_DESCRIPTION), true);
  assert.equal(isPlaceholderDescription(`  ${LESSON_PLACEHOLDER_DESCRIPTION} `), true);
  assert.equal(isPlaceholderDescription(null), true);
  assert.equal(isPlaceholderDescription(""), true);
  assert.equal(isPlaceholderDescription("Görög dráma, a tragédia szerkezete."), false);
});
