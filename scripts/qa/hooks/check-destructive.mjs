#!/usr/bin/env node
// agentic-qa-kit — PreToolUse hook: destruktív parancs őr (TECH-014)
// Globális (user-szintű) és repo-szintű settings.json-ból is hívható.
// Bemenet: stdin JSON { tool_name, tool_input: { command, ... } }
// Kimenet:
//   - DENY:  PreToolUse JSON permissionDecision=deny + indok
//   - WARN:  systemMessage (a hívás engedélyezett, de az ügynök figyelmeztetést kap)
//   - egyébként: nincs kimenet (allow)
// Hibatűrés: bármilyen belső hiba esetén FAIL-OPEN (exit 0, nincs blokkolás).

import { readFileSync } from 'node:fs';

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function deny(reason) {
  out({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[agentic-qa-kit] TILTOTT destruktív parancs: ${reason}`,
    },
  });
  process.exit(0);
}

function warn(message) {
  out({ systemMessage: `[agentic-qa-kit] FIGYELEM (destruktív határeset): ${message}` });
  process.exit(0);
}

try {
  const raw = readFileSync(0, 'utf8');
  const payload = JSON.parse(raw || '{}');
  const tool = payload.tool_name || '';
  if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);

  const cmdRaw = String(payload.tool_input?.command ?? '');
  // normalizálás: kisbetű, whitespace-összevonás
  const cmd = cmdRaw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cmd) process.exit(0);

  // ---- DENY: egyértelműen katasztrofális minták ----------------------------

  // rm -rf / vagy meghajtó-gyökér (rm -rf c:\ , rm -rf /, rm -rf c:/ , rm -rf /*)
  if (/\brm\s+-[a-z]*(?:rf|fr)[a-z]*\s+["']?(?:[a-z]:[\\\/]?|\/)\*?["']?(?:\s|$)/.test(cmd))
    deny('rm -rf meghajtó-gyökérre vagy /-re');

  // rd|rmdir /s meghajtó-gyökérre
  if (/\b(?:rd|rmdir)\s+\/s(?:\s+\/q)?\s+["']?[a-z]:[\\\/]?["']?\s*$/.test(cmd))
    deny('rd /s meghajtó-gyökérre');
  if (/\b(?:rd|rmdir)\s+\/s(?:\s+\/q)?\s+["']?[a-z]:[\\\/]?["']?\s/.test(cmd))
    deny('rd /s meghajtó-gyökérre');

  // Remove-Item / ri rekurzív meghajtó-gyökérre vagy felhasználói profil gyökerére
  if (/\b(?:remove-item|ri|del|erase)\b[^|;]*["']?[a-z]:[\\\/]?["']?\s*(?:-recurse|-force|\s|$)/.test(cmd)
      && /[a-z]:[\\\/]?["']?\s*(?:-recurse|-force|$)/.test(cmd)
      && !/[a-z]:[\\\/][\w.~$-]/.test(cmd))
    deny('rekurzív törlés meghajtó-gyökérre');

  // teljes Windows / Users mappa törlése
  if (/\b(?:rd|rmdir|rm|remove-item|del)\b[^|;]*[a-z]:[\\\/](?:windows|users)["'\\\/ ]*(?:\s|$)/.test(cmd)
      && !/[a-z]:[\\\/](?:windows|users)[\\\/][\w.~$-]/.test(cmd))
    deny('Windows/Users rendszermappa törlése');

  // formázás / partíciózás
  if (/\bformat(?:-volume)?\b\s+(?:-driveletter\s+)?["']?[a-z]:?\b/.test(cmd)) deny('meghajtó formázása');
  if (/\bmkfs(?:\.|\s)/.test(cmd)) deny('fájlrendszer-formázás (mkfs)');
  if (/\bdiskpart\b/.test(cmd)) deny('diskpart particionáló');
  if (/\bclear-disk\b/.test(cmd)) deny('Clear-Disk');

  // adatbázis-struktúra megsemmisítés
  if (/\bdrop\s+(?:table|database|schema)\b/.test(cmd)) deny('DROP TABLE/DATABASE/SCHEMA — void/reversal elv sérülne');
  if (/\bprisma\s+migrate\s+reset\b/.test(cmd)) deny('prisma migrate reset — teljes DB-újrahúzás; emberi döntést igényel');

  // git push --force védett ágra (a --force-with-lease nem esik bele)
  const hasForce = /\bgit\b[^|;&]*\bpush\b[^|;&]*(?:--force(?!-with-lease)|\s-f\b)/.test(cmd);
  if (hasForce && /\b(main|master)\b/.test(cmd))
    deny('git push --force main/master ágra');

  // ---- WARN: határesetek (engedélyezett, de jelez) --------------------------

  if (hasForce) warn('git push --force (nem védett ágra) — győződj meg róla, hogy senki más nem dolgozik az ágon.');
  if (/\bgit\s+reset\s+--hard\b/.test(cmd))
    warn('git reset --hard — nem commitolt munka elveszhet; ellenőrizd a git status-t előtte.');
  if (/\bgit\s+clean\s+-[a-z]*f/.test(cmd))
    warn('git clean -f — nem követett fájlok véglegesen törlődnek.');
  if (/\bgit\s+checkout\s+--\s+\./.test(cmd) || /\bgit\s+restore\s+\.\s*$/.test(cmd))
    warn('teljes working tree visszaállítás — nem commitolt módosítások elvesznek.');
  if (/\btruncate\s+table\b/.test(cmd))
    warn('TRUNCATE TABLE — auditálhatatlan tömeges törlés; a repo-elv a void/reversal.');
  if (/\brm\s+-[a-z]*(?:rf|fr)[a-z]*\s+/.test(cmd))
    warn('rm -rf — rekurzív törlés; ellenőrizd kétszer a cél-útvonalat.');
  if (/\b(?:rd|rmdir)\s+\/s\b/.test(cmd))
    warn('rd /s — rekurzív törlés; ellenőrizd kétszer a cél-útvonalat.');
  if (/\bremove-item\b[^|;]*-recurse\b/.test(cmd))
    warn('Remove-Item -Recurse — ellenőrizd kétszer a cél-útvonalat.');
  if (/\[system\.io\.directory\]::delete\(/.test(cmd))
    warn('Directory.Delete — rekurzív .NET törlés; ellenőrizd kétszer a cél-útvonalat.');

  process.exit(0);
} catch {
  // fail-open: a hook hibája SOHA nem akadályozhatja a munkát
  process.exit(0);
}
