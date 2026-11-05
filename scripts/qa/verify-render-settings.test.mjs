// docs/specs/2026-11-05-render-beallitas-ellenorzes.md — a Render-beállítás összevetése.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareRenderSettings, describeDiff, renderYamlBuildCommand } from './verify-render-settings.mjs';

const YAML_BUILD = 'npm ci --include=dev --legacy-peer-deps && npm run db:migrate && npm run build';

/** A Render MCP get_service válasza, 2026-11-05 (releváns mezők). */
function liveService(overrides = {}) {
  return {
    branch: 'main',
    autoDeploy: 'yes',
    rootDir: 'source',
    buildFilter: { ignoredPaths: ['docs/**', '**/*.md', 'source/tests/**', '.github/**'], paths: [] },
    serviceDetails: { envSpecificDetails: { buildCommand: YAML_BUILD } },
    ...overrides,
  };
}

test('a render.yaml build-parancsa kiolvasható', () => {
  assert.equal(renderYamlBuildCommand(readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8')), YAML_BUILD);
  assert.equal(renderYamlBuildCommand('services:\n  - buildCommand: "npm run build"\n'), 'npm run build');
  assert.equal(renderYamlBuildCommand('services: []\n'), '');
  // Review #402: sorvégi YAML-megjegyzés nem része az értéknek; idézett értékben a # megmarad.
  assert.equal(renderYamlBuildCommand('    buildCommand: npm run build # magyarázat\n'), 'npm run build');
  assert.equal(renderYamlBuildCommand("    buildCommand: 'npm run a#b' # m\n"), 'npm run a#b');
});

test('a build-parancs a tartalék mezőből is olvasható', () => {
  const flat = liveService({ serviceDetails: { buildCommand: YAML_BUILD } });
  assert.deepEqual(compareRenderSettings(flat, { buildCommand: YAML_BUILD }), []);
});

// Review #402: a build-parancs értéke (titkot tartalmazhat) nem kerül naplóba.
test('eltérés naplósora: a build-parancs értéke nem jelenik meg', () => {
  const line = describeDiff({ field: 'buildCommand', live: 'TOKEN=s3cret npm run build', expected: YAML_BUILD });
  assert.ok(!line.includes('s3cret') && !line.includes(YAML_BUILD), line);
  assert.match(describeDiff({ field: 'rootDir', live: '.', expected: 'source' }), /Render = \. \| repó = source/);
});

test('egyező beállítás: nincs eltérés; a kizárt útvonalak sorrendje nem számít', () => {
  assert.deepEqual(compareRenderSettings(liveService(), { buildCommand: YAML_BUILD }), []);
  const reordered = liveService({ buildFilter: { ignoredPaths: ['.github/**', 'docs/**', 'source/tests/**', '**/*.md'], paths: [] } });
  assert.deepEqual(compareRenderSettings(reordered, { buildCommand: YAML_BUILD }), []);
});

test('mezőnkénti eltérés', () => {
  const fields = (s) => compareRenderSettings(s, { buildCommand: YAML_BUILD }).map((d) => d.field);
  assert.deepEqual(fields(liveService({ rootDir: '.' })), ['rootDir']);
  assert.deepEqual(fields(liveService({ branch: 'develop', autoDeploy: 'no' })), ['branch', 'autoDeploy']);
  assert.deepEqual(fields(liveService({ buildFilter: { ignoredPaths: ['docs/**'], paths: ['source/**'] } })),
    ['buildFilter.ignoredPaths', 'buildFilter.paths']);
  assert.deepEqual(fields({}), ['branch', 'autoDeploy', 'rootDir', 'buildFilter.ignoredPaths', 'buildCommand']);
});

test('a 2026-11-05-i éles állapot: pontosan a build-parancs tér el', () => {
  const today = liveService({ serviceDetails: { envSpecificDetails: {
    buildCommand: 'npm install --include=dev --legacy-peer-deps && (npm run db:migrate || echo MIGRATE_SKIPPED) && npm run build',
  } } });
  assert.deepEqual(compareRenderSettings(today, { buildCommand: YAML_BUILD }).map((d) => d.field), ['buildCommand']);
});
