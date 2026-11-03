import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Spec 2026-11-03-udvozlo-jatekkartyak-szulo: az üdvözlő kártya és a játékkártyák a fejléc üvegnyelvén (minta nélkül); az admin
// (szülő) mindig az összes tananyaggal nyit.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("az üdvözlő kártya és a játékrács nem a régi cikcakkos glass-card stílusú", () => {
  const welcome = read("client/src/components/WelcomeCard.tsx");
  const games = read("client/src/components/HomePracticeGames.tsx");
  assert.doesNotMatch(welcome, /glass-card/);
  assert.doesNotMatch(games, /glass-card/);
  assert.match(welcome, /className="home-panel welcome-panel/);
  // mind a 7 játék közös game-card kártyán
  assert.equal(games.match(/className="game-card"/g)?.length, 7);
  assert.equal(games.match(/className="game-diff game-diff--/g)?.length, 3);
  const css = read("client/src/index.css");
  assert.match(css, /\.game-diff \{[^}]*min-height: 40px;/);
  assert.match(css, /\.welcome-edit-btn \{[^}]*min-height: 44px;/);
});

test("admin: a lista „Mind”-del nyit, az üdvözlés a fiók nevével, az ajánló évfolyam nélkül, sorozat és évfolyamválasztó nélkül", () => {
  const list = read("client/src/components/UserFileList.tsx");
  assert.match(list, /useState<number \| null>\(\(\) => \(!isAdmin && hasGrade\(learnerGrade\)/);
  assert.match(list, /if \(isAdmin\) \{[\s\S]*?setSelectedClassroom\(null\);/);
  const welcome = read("client/src/components/WelcomeCard.tsx");
  // review #389: adminnál a böngészőben tárolt (gyerek)név sem tartalék; a bélyegkép sikeres újratöltéskor újra látszik
  assert.match(welcome, /const name = isAdmin \? resolveLearnerName\(account, null, override\) : profile\?\.firstName \?\? accountName;/);
  assert.match(welcome, /onLoad=\{\(e\) => \{ e\.currentTarget\.style\.visibility = ""; \}\}/);
  assert.match(welcome, /const pickGrade = isAdmin \? null : grade;/);
  assert.match(welcome, /const streakText = isAdmin \? null :/);
  assert.match(welcome, /\{!isAdmin && \(\s*<select/);
});
