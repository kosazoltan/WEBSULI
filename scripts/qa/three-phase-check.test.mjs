import test from 'node:test';
import assert from 'node:assert/strict';
import { decideThreePhase } from './three-phase-check.mjs';

// docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md (E1–E4)

const PLAN = 'docs/specs/2026-10-15-x.md';
const EXEC = 'docs/specs/2026-10-15-x-vegrehajtas.md';
const code = (n) => Array.from({ length: n }, (_, i) => ({ path: `source/server/studio/f${i}.ts`, added: 10, deleted: 2 }));
const io = { readFile: (p) => (p === EXEC ? `Terv: \`${PLAN}\`.` : null), exists: (p) => p === PLAN };

test('E1: 3 kódfájl végrehajtási utasítás nélkül → bukás', () => {
  const r = decideThreePhase({ files: code(3), commits: [{ sha: 'a'.repeat(40), files: code(3).map((f) => f.path) }], ...io });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Nincs végrehajtási utasítás/);
});

test('E2: a végrehajtási utasítás a kód utáni commitban → bukás (sorrend)', () => {
  const files = [...code(3), { path: EXEC, added: 20, deleted: 0 }];
  const r = decideThreePhase({ files, commits: [{ sha: 'c'.repeat(40), files: code(3).map((f) => f.path) }, { sha: 'd'.repeat(40), files: [EXEC] }], ...io });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Sorrend: a kód \(ccccccc\)/);
});

test('E3: kis javítás (1 fájl, 12 sor) → átmegy figyelmeztetéssel', () => {
  const r = decideThreePhase({ files: code(1), commits: [{ sha: 'e'.repeat(40), files: code(1).map((f) => f.path) }], ...io });
  assert.equal(r.ok, true);
  assert.ok(r.warning);
});

test('a végrehajtási utasítás nem hivatkozik létező tervre → bukás', () => {
  const files = [...code(3), { path: EXEC, added: 20, deleted: 0 }];
  const r = decideThreePhase({ files, commits: [{ sha: 'f'.repeat(40), files: [EXEC, ...code(3).map((f) => f.path)] }], readFile: () => 'nincs hivatkozás', exists: () => false });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nem hivatkozik létező tervfájlra/);
});

test('csak dokumentum, teszt, szkript → átmegy', () => {
  const files = [{ path: 'docs/specs/a.md', added: 5, deleted: 0 }, { path: 'source/tests/a.test.ts', added: 50, deleted: 0 }, { path: 'source/server/studio/x.test.ts', added: 9, deleted: 0 }];
  assert.equal(decideThreePhase({ files, commits: [], ...io }).ok, true);
});

test('helyes PR: terv + végrehajtás az 1. commitban, kód a 2.-ban (vagy ugyanabban) → átmegy', () => {
  const files = [...code(3), { path: EXEC, added: 20, deleted: 0 }, { path: PLAN, added: 30, deleted: 0 }];
  const ok = decideThreePhase({ files, commits: [{ sha: '1'.repeat(40), files: [PLAN, EXEC] }, { sha: '2'.repeat(40), files: code(3).map((f) => f.path) }], ...io });
  assert.equal(ok.ok, true, ok.reason);
  const same = decideThreePhase({ files, commits: [{ sha: '3'.repeat(40), files: [PLAN, EXEC, ...code(3).map((f) => f.path)] }], ...io });
  assert.equal(same.ok, true);
});
