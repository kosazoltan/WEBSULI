#!/usr/bin/env node
// agentic-qa-kit — PreToolUse hook: repo-specifikus szabály-kikényszerítő
// Az AGENTS.md "Mindig tilos" listájának HARNESS-szintű kikényszerítése + repo-szintű bővítés.
//
// Matcher: Bash | PowerShell | Edit | Write
// Bemenet (stdin JSON): { tool_name, tool_input: { command | file_path, content, new_string, edits[] } }
// Kimenet:
//   - DENY:  PreToolUse permissionDecision=deny + indok (git-integritás-sértés)
//   - WARN:  systemMessage (engedélyezett, de jelez — kód-minta határeset)
//   - egyébként: nincs kimenet (allow)
// Hibatűrés: FAIL-OPEN (bármilyen belső hiba → exit 0, nincs blokkolás).
//
// Repo-specifikus bővítés (opcionális): scripts/qa/repo-rules.json a repo-ban:
//   { "rules": [ { "tool": "Bash|PowerShell|Edit|Write", "pattern": "<regex>",
//                  "flags": "i", "level": "deny|warn", "message": "..." } ] }
// Így minden repo a saját AGENTS.md-tiltásait kódolhatja, a hook-kód módosítása nélkül.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function out(obj) { process.stdout.write(JSON.stringify(obj)); }

function deny(reason) {
  out({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `[agentic-qa-kit] REPO-SZABÁLY megsértve: ${reason}. `
        + 'Ha valóban szükséges, kérj rá kifejezett emberi megerősítést a következő üzenetben.',
    },
  });
  process.exit(0);
}

function warn(message) {
  out({ systemMessage: `[agentic-qa-kit] REPO-SZABÁLY figyelmeztetés: ${message}` });
  process.exit(0);
}

// repo-szintű extra szabályok betöltése (scripts/qa/repo-rules.json, a hook mappájához képest)
function loadRepoRules() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));   // scripts/qa/hooks
    const p = join(here, '..', 'repo-rules.json');          // scripts/qa/repo-rules.json
    if (!existsSync(p)) return [];
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(j.rules) ? j.rules : [];
  } catch { return []; }
}

try {
  const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const tool = payload.tool_name || '';
  const ti = payload.tool_input || {};

  // a vizsgált szöveg tool szerint
  const isCmd = tool === 'Bash' || tool === 'PowerShell';
  const isEdit = tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit';
  if (!isCmd && !isEdit) process.exit(0);

  const cmd = isCmd ? String(ti.command ?? '') : '';
  // Write: content; Edit: new_string; MultiEdit: edits[].new_string
  const content = isEdit
    ? [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])]
        .filter(Boolean).join('\n')
    : '';
  const fp = String(ti.file_path ?? '');

  // ---- 1) repo-specifikus szabályok (config-vezérelt) — elsőként ------------
  for (const r of loadRepoRules()) {
    try {
      const applies = !r.tool
        || (r.tool === 'Bash|PowerShell' && isCmd)
        || (r.tool === 'Edit|Write' && isEdit)
        || r.tool === tool;
      if (!applies) continue;
      const subject = isCmd ? cmd : content;
      if (!subject) continue;
      const re = new RegExp(r.pattern, r.flags || '');
      if (re.test(subject)) {
        if (r.level === 'deny') deny(r.message || `egyedi repo-szabály: ${r.pattern}`);
        else warn(r.message || `egyedi repo-szabály: ${r.pattern}`);
      }
    } catch { /* hibás egyedi szabály — kihagy, fail-open */ }
  }

  // ---- 2) univerzális "Mindig tilos" minták (AGENTS.md 4. szekció) ----------

  if (isCmd) {
    const c = cmd.toLowerCase().replace(/\s+/g, ' ').trim();
    // hook-megkerülés: --no-verify (a kit-integritás alapja)
    if (/\bgit\b[^|;&]*\b(?:commit|push|merge)\b[^|;&]*--no-verify\b/.test(c)
        || /\b--no-verify\b[^|;&]*\bgit\b/.test(c))
      deny('git --no-verify (a QA-hookok megkerülése)');
    // aláírás-/signoff-megkerülés és branch-protection gyengítés
    if (/\bgit\b[^|;&]*\bpush\b[^|;&]*--no-gpg-sign\b/.test(c))
      warn('git push --no-gpg-sign — aláírás kihagyása; csak ha a felhasználó kérte.');
    if (/\b(?:gh\s+api|curl)\b[^|;&]*branch[_-]?protection/.test(c))
      warn('branch protection módosítása API-n — emberi jóváhagyás kell.');
  }

  if (isEdit && content) {
    // a) hard-coded secret (magas konfidencia, placeholder/env kizárva)
    const secretAssign = /(password|passwd|secret|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token|token)\s*[:=]\s*["'`]([^"'`$\n]{8,})["'`]/i;
    const m = content.match(secretAssign);
    if (m && !/(\$\{|process\.env|os\.environ|getenv|<[^>]+>|example|placeholder|xxx+|\*{3,}|changeme|your[_-]?|dummy|sample)/i.test(m[2]))
      warn(`lehetséges hard-coded secret (${m[1]}=...) — titok kódba/commitba TILOS; használj env/secret-store-t, placeholderrel.`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(content))
      warn('beágyazott PRIVATE KEY blokk — titkos kulcs SOHA nem kerülhet kódba/commitba.');
    if (/\bAKIA[0-9A-Z]{16}\b/.test(content)) warn('AWS Access Key ID minta — titok kódba TILOS.');

    // b) unsafe végrehajtás / deszerializáció
    if (/\beval\s*\(/.test(content) || /\bnew\s+Function\s*\(/.test(content))
      warn('eval()/new Function() — kódinjekció-kockázat; kerüld vagy validáld szigorúan a bemenetet.');
    if (/\bpickle\.loads?\s*\(|\byaml\.load\s*\((?![^)]*Loader\s*=)/.test(content))
      warn('unsafe deszerializáció (pickle/yaml.load Loader nélkül) — RCE-kockázat.');

    // c) néma kivételnyelés
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /except[^\n:]*:\s*\n\s*pass\b/.test(content))
      warn('néma catch/except: pass — a hibát ne nyeld el némán; logolj vagy kezelj.');

    // d) tesztfájlban assertion-gyengítés/skip jelzők
    if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(fp) || /_test\.py$|test_.*\.py$/i.test(fp)) {
      if (/\b(?:it|test|describe)\.(?:skip|only)\b|@pytest\.mark\.skip|xit\(|xdescribe\(/.test(content))
        warn('teszt skip/only — tesztet a bukás elkerülésére kihagyni TILOS; az implementációt javítsd.');
    }
  }

  process.exit(0);
} catch {
  process.exit(0); // fail-open
}
