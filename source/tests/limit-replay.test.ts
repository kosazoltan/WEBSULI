import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { replayLimitGate, replayMatchesExpectation, type ReplayFixture } from "../server/studio/limit-replay";
import { lessonSchema } from "../shared/lesson-schema";

/* Spec 2026-10-01-gyokerok-egyben (2.1 + 2.4, E1): a rögzített, élesben BUKOTT futások a kapu körlimit-ágán — modell nélkül —
   publikálnak a publikálási padló szerint. Új kapu-/lazítási szabály csak rögzített fixture-rel együtt kerülhet be. */

const dir = new URL("./fixtures/replay/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

test("van rögzített bukott futás a visszajátszáshoz", () => {
  assert.ok(files.length >= 3, `legalább három rögzített futás kell, most: ${files.join(", ")}`);
});

// Az elvárt kimenet a fixture-ben rögzített (`expected`). A 602481ef (run 1a276e30) élesben a bank-zsákutcán bukott; a padlóval a
// bank átmegy, de a TANÍTÁS fedettsége a 95/80-as tulajdonosi szabály alatt marad (core 92%) — jogos, tartalmi nem-publikálás.
for (const file of files) {
  const fixture = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as ReplayFixture;
  const expected = fixture.expected ?? { publishable: true };
  test(`visszajátszás: ${file} — ${expected.publishable ? "a kapu limit-ágán publikál" : `nem publikál, de csak a(z) ${expected.stage} padlón`}`, () => {
    const result = replayLimitGate(fixture);
    assert.equal(replayMatchesExpectation(fixture, result), true, `${result.stage}: ${result.reason ?? ""}`);
    assert.notEqual(result.stage, "choice", `a limit-kivétel utáni bank-zsákutca megszűnt: ${result.reason ?? ""}`);
    assert.notEqual(result.stage, "bank", `a blokk-kivétel utáni bank-zsákutca megszűnt: ${result.reason ?? ""}`);
    if (!expected.publishable) { assert.equal(result.stage, expected.stage, result.reason ?? ""); return; }
    assert.equal(result.publishable, true, `${result.stage}: ${result.reason ?? ""}`);
    assert.equal(lessonSchema.safeParse(result.lesson).success, true, "a publikált jelölt sémahelyes");
    // a padló csak akkor aktív, ha a limiten kivétel történt; a kivétel nélkül átmenő fixture nem jelöl
    const removals = result.removed.length + result.removedItems.length;
    if (removals) assert.equal(result.limitRelaxed, true, "kivétel után a bank a padló szerint mér");
    assert.ok(result.lesson!.experience!.tasks.length >= 45 && result.lesson!.experience!.quiz.length >= 75, "a 45/75-ös padló áll");
  });
}
