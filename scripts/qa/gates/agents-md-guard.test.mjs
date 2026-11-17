// docs/specs/2026-11-17-kapuk-beepites.md: az AGENTS.md méret- és sorrend-őre (Hermes-vágás ellen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHARS, SECTION_WITHIN, checkAgentsMd } from './agents-md-guard.mjs';

const head = '# WEBSULI\n\n## Alapelvek\n\n- egy\n\n';
const gates = '## Minőségkapuk (kötelező)\n\n1. npm run gate:stage\n';

test('checkAgentsMd: rövid fájl, korai „Minőségkapuk” → rendben', () => {
  const r = checkAgentsMd(`${head}${gates}`);
  assert.equal(r.ok, true);
  assert.equal(r.sectionAt, head.length);
});

test('checkAgentsMd: túl hosszú fájl → bukás, az ok a Hermes-vágás', () => {
  const r = checkAgentsMd(`${head}${gates}${'x'.repeat(MAX_CHARS)}`);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('Hermes') && p.includes(String(MAX_CHARS))));
});

test('checkAgentsMd: késői „Minőségkapuk” → bukás; hiányzó szakasz → bukás', () => {
  const late = checkAgentsMd(`${head}${'y'.repeat(SECTION_WITHIN)}\n${gates}`);
  assert.equal(late.ok, false);
  assert.ok(late.problems.some((p) => p.includes('Alapelvek után')));
  const none = checkAgentsMd(head);
  assert.equal(none.ok, false);
  assert.ok(none.problems.some((p) => p.includes('nincs')));
});

test('checkAgentsMd: a CRLF nem számít bele (Windows-munkapéldány = CI)', () => {
  const lf = checkAgentsMd(`${head}${gates}`);
  const crlf = checkAgentsMd(`${head}${gates}`.replace(/\n/g, '\r\n'));
  assert.deepEqual([crlf.chars, crlf.sectionAt], [lf.chars, lf.sectionAt]);
});
