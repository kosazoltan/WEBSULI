import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_SKILLS } from "../server/studio/role-skills";

/* Spec 2026-10-05-s11/4 — egyező félreolvasás: szótár-őr + célzott erős olvasás (mért: map b6647e0c, „Kesia, Föld - Felt. térsége”). */

test("szerző- és bank-skill: OCR-zajból tényt kikövetkeztetni tilos", () => {
  assert.match(ROLE_SKILLS.author, /értelmetlen, nem létező szavaiból \(OCR-zaj\) tényt kikövetkeztetni tilos/);
  assert.match(ROLE_SKILLS.bank, /OCR-zajból kikövetkeztetett tény/);
});
