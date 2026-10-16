import test from 'node:test';
import assert from 'node:assert/strict';
import { decideThreePhase } from './three-phase-check.mjs';

// docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md (E1–E4), docs/specs/2026-10-15-review-236-237-javitas.md (E1–E2)

const PLAN = 'docs/specs/2026-10-15-x.md';
const EXEC = 'docs/specs/2026-10-15-x-vegrehajtas.md';
const code = (n) => Array.from({ length: n }, (_, i) => ({ path: `source/server/studio/f${i}.ts`, added: 10, deleted: 2 }));
const io = { readFileAt: (p) => (p === EXEC ? `Terv: \`${PLAN}\`.` : null), existsAt: (p) => p === PLAN };

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

// Dokumentált spec-változás (review #236): a kivétel a szabály szerinti egysoros javítás (korábban ≤ 20 sor).
test('E3: egysoros javítás (1 fájl, 1+1 sor) → átmegy figyelmeztetéssel', () => {
  const files = [{ path: 'source/server/studio/f0.ts', added: 1, deleted: 1 }];
  const r = decideThreePhase({ files, commits: [{ sha: 'e'.repeat(40), files: [files[0].path] }], ...io });
  assert.equal(r.ok, true);
  assert.ok(r.warning);
});

test('review #236: 1 fájl, 2 hozzáadott sor végrehajtási utasítás nélkül → bukás', () => {
  const files = [{ path: 'source/server/studio/f0.ts', added: 2, deleted: 0 }];
  const r = decideThreePhase({ files, commits: [{ sha: 'e'.repeat(40), files: [files[0].path] }], ...io });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Nincs végrehajtási utasítás/);
});

test('review #236: az első kódcommit idején üres utasítás (utólag kitöltve) → bukás', () => {
  const files = [...code(3), { path: EXEC, added: 20, deleted: 0 }, { path: PLAN, added: 30, deleted: 0 }];
  const commits = [{ sha: '5'.repeat(40), files: [EXEC] }, { sha: '6'.repeat(40), files: code(3).map((f) => f.path) }, { sha: '7'.repeat(40), files: [EXEC, PLAN] }];
  const filledLater = { readFileAt: (p, sha) => (p === EXEC ? (sha === '6'.repeat(40) ? '' : `Terv: \`${PLAN}\`.`) : null), existsAt: (p, sha) => p === PLAN && sha !== '6'.repeat(40) };
  const r = decideThreePhase({ files, commits, ...filledLater });
  assert.equal(r.ok, false);
  assert.match(r.reason, /első kódcommit \(6666666\) idején/);
});

test('a végrehajtási utasítás nem hivatkozik létező tervre → bukás', () => {
  const files = [...code(3), { path: EXEC, added: 20, deleted: 0 }];
  const r = decideThreePhase({ files, commits: [{ sha: 'f'.repeat(40), files: [EXEC, ...code(3).map((f) => f.path)] }], readFileAt: () => 'nincs hivatkozás', existsAt: () => false });
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
