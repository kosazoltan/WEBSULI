import assert from "node:assert/strict";
import test from "node:test";

import {
  DIFFICULTY_FLOOR,
  nextDifficulty,
  startingDifficulty,
} from "../client/src/game-engine/difficulty";

/**
 * G-4 — egyetlen nehézség-szabály mind a hét játékra.
 *
 * Measured on 2026-09-07: BlockCraft carries fourteen references to its own
 * difficulty ramp, SpeedQuiz and BrainRot have none at all. So the same child meets
 * a game that adapts and a game that does not, and neither behaviour was chosen —
 * it is just where each file happened to stop.
 *
 * The rule below is deliberately asymmetric: it hardens slowly and softens quickly.
 * Boredom costs a session; frustration costs the child's willingness to come back.
 * Those are not equal, so the constants are not equal either.
 *
 * Pure, no seed, no clock: the same answer history always yields the same band, so
 * a bug report can be reproduced from the history alone.
 */

const up = (n: number) => Array.from({ length: n }, () => true);
const down = (n: number) => Array.from({ length: n }, () => false);

test("három egymás utáni helyes válasz nehezít", () => {
  const next = nextDifficulty({ recentCorrect: up(3), current: 0.5 });

  assert.ok(next > 0.5, `0.5-ről nőnie kellett volna, lett: ${next}`);
});

test("két egymás utáni rossz válasz könnyít", () => {
  const next = nextDifficulty({ recentCorrect: down(2), current: 0.5 });

  assert.ok(next < 0.5, `0.5-ről csökkennie kellett volna, lett: ${next}`);
});

test("a könnyítés gyorsabb, mint a nehezítés", () => {
  const harder = nextDifficulty({ recentCorrect: up(3), current: 0.5 }) - 0.5;
  const easier = 0.5 - nextDifficulty({ recentCorrect: down(2), current: 0.5 });

  assert.ok(
    easier > harder,
    `a frusztráció drágább az unalomnál: könnyítés ${easier}, nehezítés ${harder}`,
  );
});

test("két helyes válasz még nem nehezít — a szabály három", () => {
  assert.equal(nextDifficulty({ recentCorrect: up(2), current: 0.4 }), 0.4);
});

test("egy rossz válasz még nem könnyít — a szabály kettő", () => {
  assert.equal(nextDifficulty({ recentCorrect: down(1), current: 0.4 }), 0.4);
});

test("a sáv sosem lép ki a [padló, 1] tartományból", () => {
  let value = 0.9;
  for (let i = 0; i < 20; i += 1) {
    value = nextDifficulty({ recentCorrect: up(3), current: value });
  }
  assert.ok(value <= 1, `felső határ sérült: ${value}`);

  value = 0.2;
  for (let i = 0; i < 20; i += 1) {
    value = nextDifficulty({ recentCorrect: down(2), current: value });
  }
  assert.ok(value >= DIFFICULTY_FLOOR, `alsó határ sérült: ${value}`);
  assert.ok(DIFFICULTY_FLOOR > 0, "a nulla nehézség már nem játék");
});

test("váltakozó teljesítménynél nem ugrál a sáv", () => {
  let value = 0.5;
  const history: boolean[] = [];

  for (let i = 0; i < 12; i += 1) {
    history.push(i % 2 === 0);
    value = nextDifficulty({ recentCorrect: history, current: value });
  }

  assert.ok(
    Math.abs(value - 0.5) < 0.2,
    `a hullámzó gyerek ne kerüljön szélsőségbe, lett: ${value}`,
  );
});

test("üres előzmény nem mozdít", () => {
  assert.equal(nextDifficulty({ recentCorrect: [], current: 0.33 }), 0.33);
});

test("csak a sorozat vége számít, a régi válaszok nem húzzák vissza", () => {
  const mixed = [...down(5), ...up(3)];

  assert.ok(
    nextDifficulty({ recentCorrect: mixed, current: 0.5 }) > 0.5,
    "aki most három jót írt, annak most jár a nehezítés",
  );
});

test("a kezdő sáv az osztályhoz igazodik, de sosem szélsőséges", () => {
  const first = startingDifficulty(1);
  const eighth = startingDifficulty(8);

  assert.ok(first < eighth, "a nyolcadikos nem ott kezd, ahol az elsős");
  for (const classroom of [0, 1, 4, 8, 12]) {
    const value = startingDifficulty(classroom);
    assert.ok(value >= DIFFICULTY_FLOOR && value <= 1, `${classroom}. osztály: ${value}`);
  }
});
