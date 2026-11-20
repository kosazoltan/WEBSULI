// A vak ellenőr futtatójának tesztjei almappában vannak (scripts/qa/gates/blind-review/). A CI és a kapuk a
// `scripts/qa/gates/*.test.mjs` mintát futtatják — ez a belépő beolvassa az almappa tesztjeit, hogy a biztonsági és kizárólagossági
// őrök a CI-ben és a kapukban is fussanak (a workflow módosítása nélkül). Új tesztfájl az almappában → ide is fel kell venni
// (őr: lent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import './blind-review/blind-review.test.mjs';
import './blind-review/completeness.test.mjs';
import './blind-review/depth.test.mjs';
import './blind-review/evidence.test.mjs';
import './blind-review/exit-trace.test.mjs';
import './blind-review/findings.test.mjs';
import './blind-review/hardening.test.mjs';
import './blind-review/heavy.test.mjs';
import './blind-review/liveness.test.mjs';
import './blind-review/openrouter.test.mjs';
import './blind-review/rules-guard.test.mjs';
import './blind-review/tools.test.mjs';

const IMPORTED = ['blind-review.test.mjs', 'completeness.test.mjs', 'depth.test.mjs', 'evidence.test.mjs', 'exit-trace.test.mjs', 'findings.test.mjs', 'hardening.test.mjs', 'heavy.test.mjs', 'liveness.test.mjs', 'openrouter.test.mjs', 'rules-guard.test.mjs', 'tools.test.mjs'];

test('az almappa minden tesztfájlja be van kötve ebbe a belépőbe', () => {
  const found = readdirSync(fileURLToPath(new URL('./blind-review/', import.meta.url))).filter((f) => f.endsWith('.test.mjs')).sort();
  assert.deepEqual(found, IMPORTED);
});
