// docs/specs/2026-11-17-kapuk-beepites.md 6. pont: a CI statikus kapu (repó-szabályok + tiltott minták a diffben).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS } from './lib.mjs';
import { runStaticSteps } from './ci-static-gate.mjs';
import { fakeCtx, statusOf } from './_fake.mjs';

// A minták futásidőben, darabokból — a saját kapunk ne bukjon a tesztfájl szövegén.
const dot = '.';
const ONLY = `it${dot}only("x", () => {});`;
const PK = `-----BEGIN RSA PRIVATE ${'KEY'}-----`;
const diffOf = (file, lines) => [`diff --git a/${file} b/${file}`, `+++ b/${file}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n');

test('runStaticSteps: tiszta diff → mindkét lépés PASS, nincs npm / ESLint hívás', async () => {
  const { ctx, gate, calls } = fakeCtx({ diff: diffOf('docs/x.md', ['egy ártalmatlan sor']) });
  await runStaticSteps({ gate, ctx });
  assert.equal(statusOf(gate, 'repó-szabályok'), STATUS.PASS);
  assert.equal(statusOf(gate, 'tiltott minták'), STATUS.PASS);
  assert.ok(!calls.some((c) => c.cmd === 'npm' || c.args.some((a) => String(a).includes('eslint'))), 'függőség nélkül fut');
  assert.equal(gate.finish(), 0);
});

test('runStaticSteps: .only tesztfájlban és privát kulcs → FAIL, a leletben nincs a sor értéke', async () => {
  const diff = `${diffOf('source/tests/a.test.ts', [ONLY])}\n${diffOf('scripts/b.mjs', [PK])}`;
  const { ctx, gate, lines } = fakeCtx({ diff });
  await runStaticSteps({ gate, ctx });
  assert.equal(statusOf(gate, 'tiltott minták'), STATUS.FAIL);
  const out = lines.join('\n');
  assert.ok(out.includes('source/tests/a.test.ts:1') && out.includes('scripts/b.mjs:1'));
  assert.ok(!out.includes('() => {}') && !out.includes('BEGIN RSA'), 'érték nem kerül a kimenetbe');
  assert.equal(gate.finish(), 1);
});
