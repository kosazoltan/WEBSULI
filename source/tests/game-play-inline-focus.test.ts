import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { focusSegments, splitPromptFocus } from "../client/src/game-engine/play/promptFocus";

/**
 * Szólétra olvashatóság (docs/specs/2026-11-17-szoletra-olvashatosag.md D, SZ-5, SZ-6): az `InlineQuestion` ÚJ opcionális
 * `promptFocus` propja. A felbontás tiszta segéd (`GE/play/promptFocus.ts`); a komponens node-ban nem renderelhető (az
 * `import.meta.env`-et olvasó teszt-kampó miatt), ezért a „prop nélkül változatlan” állítást a forrás őrzi itt, a
 * megjelenést pedig a böngészős mérés (`T/word-ladder-readability.spec.ts`, a közös mobil mérő és a többi játék e2e-je).
 */

test("splitPromptFocus: keretsor a célrész helyén „…”-val, mondat-jelzés, leghosszabb szó", () => {
  assert.deepEqual(splitPromptFocus("„Kutya” angolul:", "Kutya"), { frame: "„…” angolul:", focus: "Kutya", sentence: false, longest: 5 });
  assert.deepEqual(splitPromptFocus("Mit jelent: Sit down!", "Sit down!"), { frame: "Mit jelent: …", focus: "Sit down!", sentence: false, longest: 5 });
  assert.deepEqual(splitPromptFocus("Mit jelent magyarul: environment?", "environment"), { frame: "Mit jelent magyarul: …?", focus: "environment", sentence: false, longest: 11 });
  assert.deepEqual(splitPromptFocus("Egészítsd ki a sein igével: „Ich ___ müde.”", "Ich ___ müde."), { frame: "Egészítsd ki a sein igével: „…”", focus: "Ich ___ müde.", sentence: true, longest: 5 });
  const cloze = splitPromptFocus("Our _____ is on the first floor.", "Our _____ is on the first floor.")!;
  assert.equal(cloze.frame, "", "játék-alakú hiányos mondatnál nincs keretszöveg");
  assert.equal(cloze.sentence, true);
  assert.equal(splitPromptFocus("Mit jelent: a b c d?", "a b c d")!.sentence, true);
});

test("splitPromptFocus: nincs kiemelés, ha nincs célrész, üres, vagy nem rész-szövege a promptnak (biztonsági háló)", () => {
  assert.equal(splitPromptFocus("„Kutya” angolul:", undefined), null);
  assert.equal(splitPromptFocus("„Kutya” angolul:", null), null);
  assert.equal(splitPromptFocus("„Kutya” angolul:", "   "), null);
  assert.equal(splitPromptFocus("„Kutya” angolul:", "Macska"), null);
});

test("focusSegments: a hiány (___) külön darab, a szöveg sértetlen", () => {
  assert.deepEqual(focusSegments("Our _____ is on the first floor."), [
    { text: "Our ", blank: false },
    { text: "_____", blank: true },
    { text: " is on the first floor.", blank: false },
  ]);
  assert.deepEqual(focusSegments("___ is your birthday?"), [{ text: "___", blank: true }, { text: " is your birthday?", blank: false }]);
  assert.deepEqual(focusSegments("Kutya"), [{ text: "Kutya", blank: false }]);
});

test("SZ-6: prop nélkül a prompt-elem a régi szerkezet — a forrásban a célrész nélküli ág szó szerint a régi <p>", () => {
  const src = readFileSync(new URL("../client/src/game-engine/play/InlineQuestion.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const OLD = [
    "          <p",
    "            ref={promptRef}",
    '            className="play-question-prompt"',
    "            data-testid={promptTestId}",
    '            data-long={longPrompt ? "true" : "false"}',
    '            aria-live="polite"',
    "          >",
    "            {quiz.prompt}",
    "          </p>",
  ].join("\n");
  assert.ok(src.includes(OLD), "a célrész nélküli ág változatlan (csak behúzás)");
  assert.match(src, /\{focusParts \? \(/, "a kiemelés csak célrésszel");
  assert.match(src, /const focusParts = splitPromptFocus\(quiz\.prompt, promptFocus\);/);
  assert.match(src, /promptFocus\?: string \| null;/, "a prop opcionális");
  // A közös CSS-szabályok csak a data-focus mellett hatnak (a többi játék promptját nem érintik).
  const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
  for (const sel of [".play-question-frame", ".play-question-focus", ".play-question-blank"]) assert.ok(css.includes(sel), sel);
  assert.ok(css.includes('.play-question-prompt[data-focus="true"]'));
  assert.ok(!/\.play-question-prompt\s*\{[^}]*container-type/u.test(css), "a sima prompt-szabály nem változott");
});
