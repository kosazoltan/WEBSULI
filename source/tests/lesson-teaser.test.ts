import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderDescription, lessonTeaser, LESSON_PLACEHOLDER_DESCRIPTION, teaserFromText, TEASER_MAX } from "../shared/lesson-teaser";

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
