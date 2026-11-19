#!/usr/bin/env node
// PR előtti kapu (docs/minosegkapuk.md; terv E7, E8, D11). A push előtti kapu minden lépése + build + CI-azonos böngészős út
// (játék / UI) + eldobható DB-teszt (DB-változás) + PR-leírás sablon + a független ellenőr ítélete az aktuális fejre.
// Zöld esetben `pre-pr-<fej>.json` ÉS `pre-push-<fej>.json` bizonyíték (a hook a `gh pr create` és a `git push` előtt olvassa).
//
// Használat: node scripts/qa/gates/pre-pr-gate.mjs --body-file <PR-leírás.md> [--base origin/main] [--slice] [--strict]
//   --body-file  a PR-leírás tervezete (ha az ághoz már van nyitott PR, annak leírása is elég)
//   --strict     a NOT RUN lépés (pl. Docker nélküli DB-teszt) is bukás

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  STATUS, argValue, cmdResult, createGate, externalResult, isMain, makeContext, readEvidence, resolveVerdict, verdictResult, writeEvidence, writeLog,
} from './lib.mjs';
import { cheapSteps, evidenceRecord, runPrePushSteps } from './pre-push-gate.mjs';
import { stemOf } from './stage-gate.mjs';

export const WRAPPER_CONFIG = 'playwright.gate.local.mts';

/**
 * Mi változott: UI, mely játékok, közös / ismeretlen játékfájl (→ teljes helyi játék-kör, fail-safe), adatbázis.
 * Közös: `sharedGamePatterns` + `sharedGameFiles`; ismeretlen: több játék mintájára illő fájl, vagy a `gameE2e` táblában nem szereplő
 * játék-spec (docs/specs/2026-11-19-gate-pr-celzott-e2e.md).
 */
export function classifyChanges(changed, cfg) {
  const src = changed.filter((f) => f.startsWith('source/'));
  const gameRes = Object.entries(cfg.games ?? {}).map(([id, k]) => [id, new RegExp(k, 'i')]);
  const owners = (f) => gameRes.filter(([, re]) => re.test(f)).map(([id]) => id);
  const games = gameRes.filter(([, re]) => src.some((f) => re.test(f))).map(([id]) => id);
  const sharedPrefixes = [...(cfg.sharedGamePatterns ?? []), ...(cfg.sharedGameFiles ?? [])];
  const listedSpecs = new Set(Object.values(cfg.gameE2e ?? {}).flatMap((g) => g.specs ?? []));
  const unknown = src.some((f) => {
    const o = owners(f);
    if (o.length > 1) return true;
    const spec = /^source\/tests\/([^/]+\.spec\.ts)$/.exec(f)?.[1];
    return Boolean(spec && o.length === 1 && !listedSpecs.has(spec));
  });
  return {
    games,
    allGames: unknown || src.some((f) => sharedPrefixes.some((p) => f.startsWith(p))),
    ui: src.some((f) => (cfg.uiPatterns ?? []).some((p) => f.startsWith(p))),
    db: src.some((f) => (cfg.dbPatterns ?? []).some((p) => f.startsWith(p))),
  };
}

/**
 * A futtatandó böngészős csomagok (docs/specs/2026-11-19-gate-pr-celzott-e2e.md). Egy / néhány ismert játék: a mobil mérő a játékok
 * `meterGrep`-jére szűrve (külön futás, mert a `--grep` minden spec-re hat) + a játékok `gameE2e` spec-jei; a meta-mérő, a lejárt
 * kupon és minden más spec a CI-ra marad (`leftToCi`). Közös / ismeretlen játékfájl: teljes helyi játék-kör (minden játék mérője +
 * minden játék-spec + `alwaysGameSpecs`). Más UI-nál: a változott komponens nevét említő spec-ek. A változott spec mindig fut.
 * @returns {{ runs: { label: string, specs: string[], grep?: string }[], warning?: string, leftToCi?: string[] }}
 */
export function pickE2eSpecs({ classification, specFiles, readSpec, cfg, changed }) {
  const runs = [];
  const ids = classification.allGames ? Object.keys(cfg.games ?? {}) : classification.games;
  const changedSpecs = changed.filter((f) => /^source\/tests\/[^/]+\.spec\.ts$/.test(f)).map((f) => basename(f));
  const mobile = cfg.mobileQualitySpec;
  if (ids.length) {
    const table = cfg.gameE2e ?? {};
    runs.push({
      label: `mobil mérő (${classification.allGames ? 'minden játék' : ids.join(', ')})`, specs: [mobile],
      grep: classification.allGames ? undefined : ids.map((id) => table[id]?.meterGrep ?? id).sort().join('|'),
    });
    const own = ids.flatMap((id) => table[id]?.specs ?? []);
    const extra = classification.allGames ? (cfg.alwaysGameSpecs ?? []) : [];
    const rest = [...new Set([...own, ...extra, ...changedSpecs])].filter((s) => s !== mobile).sort();
    if (rest.length) runs.push({ label: classification.allGames ? 'teljes játék-kör: minden játék-spec + meta-mérő + lejárt kupon' : `a játék saját spec-jei (${ids.join(', ')})`, specs: rest });
    const local = new Set(runs.flatMap((r) => r.specs));
    return { runs, leftToCi: specFiles.filter((s) => !local.has(s)).sort() };
  }
  if (classification.ui || changedSpecs.length) {
    const stems = changed.filter((f) => /^source\/client\/src\/.+\.(?:tsx?|css)$/.test(f)).map(stemOf).filter((s) => s.length >= 4);
    const hit = specFiles.filter((s) => stems.some((st) => readSpec(s).includes(st)));
    const specs = [...new Set([...hit, ...changedSpecs])].sort();
    if (specs.length) runs.push({ label: 'UI-spec-ek (a változott komponenseket említők)', specs });
    else return { runs, warning: 'UI-változás, de egyetlen spec sem említi a változott komponenseket — írj böngészős próbát, vagy indokold a PR-ban' };
  }
  return { runs };
}

/** A PR-kapu olcsó, determinisztikus lépései, ebben a sorrendben (fail-fast; a lépésnevek eleje). */
export const CHEAP_PR_STEPS = Object.freeze(['PR-leírás sablon', 'független ellenőr ítélete a fejre', 'külső (Gemini) ellenőr — második vélemény', 'tiszta munkafa', 'git fetch', 'háromfázisú rend', 'PR-méret']);

/** Az olcsó lépések sorban; az első FAIL után megáll. @returns {Promise<boolean>} true, ha bukás miatt megállt. */
export async function cheapPhase(gate, steps) {
  for (const [name, fn] of steps) {
    const item = await gate.step(name, fn);
    if (item.status === STATUS.FAIL) return true;
  }
  return false;
}

/** A PR-leírás kötelező részei; a hiányzók listája. */
export function checkPrBody(body) {
  const b = String(body ?? '');
  const missing = [];
  if (!(/elfogad/i.test(b) && /^\s*[-*] \[[ xX]\]/m.test(b))) missing.push('elfogadási lista (`- [x]` tételek az „elfogadás” alatt)');
  if (!/futtatott ellenőrzés|ellenőrzések/i.test(b)) missing.push('„Futtatott ellenőrzések” szakasz (parancs + valós eredmény)');
  if (!/nem futtatott|NOT RUN/i.test(b)) missing.push('„Nem futtatott + ok” sor (NOT RUN + ok + kockázat, vagy „nincs”)');
  return missing;
}

export function wrapperConfigSource() {
  return `// A scripts/qa/gates/pre-pr-gate.mjs generálja (docs/minosegkapuk.md) — NEM commitolandó (*.local.mts a .gitignore-ban).
// CI-azonos böngészős út: szoftveres WebGL (SwiftShader), egy worker, .only tiltva; a szervert a harness buildeli és saját porton indítja.
import base from './playwright.config.ts';

const swiftshader = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default {
  ...base,
  workers: 1,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    ...base.use,
    launchOptions: { ...(base.use?.launchOptions ?? {}), args: [...(base.use?.launchOptions?.args ?? []), ...swiftshader] },
  },
};
`;
}

export function e2eArgs(run) {
  return ['--import', 'tsx', 'scripts/run-e2e-tests.ts', '--config', WRAPPER_CONFIG, '--workers=1',
    ...(run.grep ? ['--grep', run.grep] : []), ...run.specs.map((s) => `tests/${s}`)];
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const ctx = makeContext({ base: argValue(args, '--base') });
  const { exec, git, root, src, cfg, node } = ctx;
  const gate = createGate('pre-pr-gate', { strict });
  const head = git.head();
  const bodyFile = argValue(args, '--body-file');

  // 1) Olcsó, gyors lépések előre: PR-leírás, ítélet, tiszta munkafa, fetch, háromfázisú rend, PR-méret.
  let prBody = null;
  let prTexts = [];
  const gh = exec('gh', ['--version'], { cwd: root, timeoutMs: 15_000 }).code === 0;
  if (gh) {
    const l = exec('gh', ['pr', 'list', '--head', git.branch(), '--state', 'open', '--json', 'number', '--limit', '1'], { cwd: root, timeoutMs: 30_000 });
    const n = l.code === 0 ? JSON.parse(l.stdout || '[]')[0]?.number : undefined;
    if (n) {
      const v = exec('gh', ['pr', 'view', String(n), '--json', 'body,comments'], { cwd: root, timeoutMs: 30_000 });
      if (v.code === 0) { const j = JSON.parse(v.stdout); prBody = j.body ?? ''; prTexts = [prBody, ...(j.comments ?? []).map((c) => c.body)]; }
    }
  }

  // Fail-fast (docs/specs/2026-11-19-gate-pr-celzott-e2e.md): az olcsó lépések előre, az első bukásnál a kapu megáll.
  const prBodyStep = () => {
    let body = prBody;
    let from = 'a nyitott PR leírása';
    if (bodyFile) {
      if (!existsSync(bodyFile)) return { status: STATUS.FAIL, note: `a --body-file nem létezik: ${bodyFile}` };
      body = readFileSync(bodyFile, 'utf8');
      from = basename(bodyFile);
      prTexts = [body, ...prTexts.slice(1)];
    }
    if (body == null) return { status: STATUS.FAIL, note: 'nincs PR-leírás — add meg a tervezetet: --body-file <út> (elfogadási lista, futtatott ellenőrzések, nem futtatott + ok)' };
    const missing = checkPrBody(body);
    return missing.length ? { status: STATUS.FAIL, note: `hiányzik (${from}): ${missing.join('; ')}` } : { status: STATUS.PASS, note: from };
  };
  const stopped = await cheapPhase(gate, [
    ['PR-leírás sablon', prBodyStep],
    ['független ellenőr ítélete a fejre', () => verdictResult(resolveVerdict({ head, evidence: readEvidence(ctx.evDir, `review-${head}`), texts: prTexts }), head)],
    ['külső (Gemini) ellenőr — második vélemény', () => externalResult(readEvidence(ctx.evDir, `external-${head}`), head)],
    ...cheapSteps(ctx),
  ]);
  if (stopped) {
    gate.log('[pre-pr-gate] FAIL-FAST: egy olcsó lépés bukott — a drága lépések (lint, npm test, build, böngésző) nem indultak.');
    const code = gate.finish();
    writeEvidence(ctx.evDir, `pre-pr-${head}`, evidenceRecord('pre-pr', head, gate));
    process.exit(code || 1);
  }

  // 2) A push előtti kapu többi (drága) lépése.
  const { changed } = await runPrePushSteps({ gate, ctx, slice: args.includes('--slice'), skipCheap: true });

  await gate.step('npm run build', () => {
    const r = exec('npm', ['run', 'build'], { cwd: src, timeoutMs: 20 * 60_000 });
    writeLog(ctx.evDir, 'pre-pr-gate', 'build', `${r.stdout}\n${r.stderr}`);
    return cmdResult(r);
  });

  const cls = classifyChanges(changed, cfg);
  const dockerOk = () => exec('docker', ['version', '--format', '{{.Server.Version}}'], { cwd: root, timeoutMs: 30_000 }).code === 0;
  const specFiles = readdirSync(join(src, 'tests')).filter((f) => f.endsWith('.spec.ts')).sort();
  const { runs, warning, leftToCi } = pickE2eSpecs({ classification: cls, specFiles, readSpec: (s) => { /* olvashatatlan spec → '' → legfeljebb kevesebb UI-spec + WARN (ártalmatlan) */ try { return readFileSync(join(src, 'tests', s), 'utf8'); } catch { return ''; } }, cfg, changed });

  if (warning) gate.add('böngészős út (UI)', STATUS.WARN, warning);
  if (!runs.length && !warning) gate.add('böngészős út (CI-azonos)', STATUS.SKIP, 'nincs játék- / UI-változás');
  if (runs.length) {
    gate.log(`[pre-pr-gate] böngészős kör helyben: ${runs.map((r) => `${r.label}: ${r.specs.join(', ')}${r.grep ? ` (--grep ${r.grep})` : ''}`).join(' | ')}`);
    if (leftToCi) gate.log(`[pre-pr-gate] a CI-ra marad: ${leftToCi.length} spec${leftToCi.length ? ` (${leftToCi.join(', ')})` : ''}`);
    writeFileSync(join(src, WRAPPER_CONFIG), wrapperConfigSource());
    const docker = dockerOk();
    for (const run of runs) {
      await gate.step(`böngészős út: ${run.label}`, () => {
        if (!docker) return { status: STATUS.FAIL, note: `NOT RUN → bukás: nincs Docker (az eldobható Postgres kell). Parancs: (cd source && node ${e2eArgs(run).join(' ')})` };
        gate.log(`[pre-pr-gate] futtatás: (cd source && node ${e2eArgs(run).join(' ')})`);
        const r = exec(node, e2eArgs(run), { cwd: src, timeoutMs: 90 * 60_000 });
        writeLog(ctx.evDir, 'pre-pr-gate', `e2e-${run.label}`, `${r.stdout}\n${r.stderr}`);
        return cmdResult(r, `${run.specs.length} spec, szoftveres WebGL, buildelt szerver, workers=1`);
      });
    }
  }

  await gate.step('DB-integrációs teszt (test:learning-db)', () => {
    if (!cls.db) return { status: STATUS.SKIP, note: 'nincs szerver / séma / migráció változás' };
    if (!dockerOk()) return { status: STATUS.NOT_RUN, note: 'nincs Docker — az eldobható Postgres nem indítható; kockázat: a DB-út csak a CI-ban fut' };
    const r = exec('npm', ['run', 'test:learning-db'], { cwd: src, timeoutMs: 30 * 60_000 });
    writeLog(ctx.evDir, 'pre-pr-gate', 'learning-db', `${r.stdout}\n${r.stderr}`);
    return cmdResult(r);
  });

  const code = gate.finish();
  const rec = evidenceRecord('pre-pr', head, gate);
  writeEvidence(ctx.evDir, `pre-pr-${head}`, rec);
  // A pre-push bizonyítékot csak zöld esetben írjuk felül (egy korábbi zöld push-kaput egy bukott PR-kapu ne töröljön).
  if (code === 0) writeEvidence(ctx.evDir, `pre-push-${head}`, { ...rec, kind: 'pre-push', via: 'pre-pr-gate' });
  gate.log(`[pre-pr-gate] bizonyíték: pre-pr-${head.slice(0, 12)}${code === 0 ? ` + pre-push-${head.slice(0, 12)}` : ''} (ok=${code === 0})`);
  process.exit(code);
}

if (isMain(import.meta.url)) main();
