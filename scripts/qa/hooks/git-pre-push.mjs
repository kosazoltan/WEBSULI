#!/usr/bin/env node
// Git `pre-push` hook törzse (opt-in; telepítés: node scripts/qa/hooks/install-git-hooks.mjs — docs/minosegkapuk.md
// „Futtatókörnyezetek”). Bármely kliensből (Codex, Cursor, terminál, IDE) indított pushnál ugyanazt nézi, amit a Claude Code
// `check-quality-gates` hookja: a kimenő commitra zöld `pre-push-<sha>` vagy `pre-pr-<sha>` bizonyíték kell
// (`<git-common-dir>/websuli-qa-evidence/`, a `npm run gate:push` / `gate:pr` írja). Csak olvas.
//
// A git a stdin-en soronként adja: <helyi ref> <helyi sha> <távoli ref> <távoli sha>. Csupa nulla helyi sha = ág törlése → átengedve.
// Kilépési kód: 0 = mehet, 1 = nincs zöld bizonyíték (a git ilyenkor nem pushol).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { evidenceDir, isMain, readEvidence } from '../gates/lib.mjs';

const ZERO = /^0+$/;

/** A stdin sorai → a kimenő (nem törlő) commitok listája. */
export function parsePushLines(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const [localRef, localSha] = line.trim().split(/\s+/);
    if (!localRef || !localSha || ZERO.test(localSha)) continue;
    out.push({ ref: localRef, sha: localSha });
  }
  return out;
}

/**
 * @param {{ref:string, sha:string}[]} pushes
 * @param {(name: string) => any} read  bizonyíték-olvasó (név → JSON | null)
 * @returns {string[]} a hibaüzenetek (üres = mehet)
 */
export function checkPushes(pushes, read) {
  const errors = [];
  for (const { ref, sha } of pushes) {
    const ev = read(`pre-push-${sha}`);
    const pr = read(`pre-pr-${sha}`);
    if (ev?.ok === true || pr?.ok === true) continue;
    const why = ev ? `az utolsó futás erre a commitra BUKOTT (${ev.at ?? '?'})` : 'nincs zöld bizonyíték erre a commitra';
    errors.push(`[minőségkapu] ${ref} → ${sha.slice(0, 12)}: ${why}. Futtasd a munkafa gyökeréből: npm run gate:push — és ha zöld, pusholj újra.`);
  }
  return errors;
}

function commonDir(cwd) {
  const d = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim();
  return isAbsolute(d) ? d : resolve(cwd, d);
}

function main() {
  const cwd = process.cwd();
  let input = '';
  try { input = readFileSync(0, 'utf8'); } catch { input = ''; }
  const dir = evidenceDir(commonDir(cwd));
  const errors = checkPushes(parsePushLines(input), (name) => readEvidence(dir, name));
  for (const e of errors) process.stderr.write(`${e}\n`);
  process.exitCode = errors.length ? 1 : 0;
}

if (isMain(import.meta.url)) main();
