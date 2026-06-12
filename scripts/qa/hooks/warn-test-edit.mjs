#!/usr/bin/env node
// agentic-qa-kit — PreToolUse hook: tesztfájl-szerkesztés figyelmeztető (TECH-061 soft)
// Matcher: Edit|Write. SOHA nem blokkol — csak emlékezteti az ügynököt a szabályra:
// "a tesztet nem gyengítjük, hogy átmenjen; az implementációt javítjuk".
// Fail-open minden hibára.

import { readFileSync } from 'node:fs';

try {
  const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const fp = String(payload.tool_input?.file_path ?? '');
  const isTest =
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(fp) ||
    /[\\\/]__tests__[\\\/]/i.test(fp) ||
    /[\\\/]tests?[\\\/].*\.(test|spec)\./i.test(fp) ||
    /_test\.py$|test_.*\.py$/i.test(fp);

  if (isTest) {
    process.stdout.write(JSON.stringify({
      systemMessage:
        '[agentic-qa-kit] Tesztfájlt szerkesztesz. Szabály (TECH-061): tesztet a bukás ' +
        'elkerülésére gyengíteni/törölni TILOS — ilyenkor az implementációt javítsd. ' +
        'Jogos teszt-szerkesztés (új teszt, tesztfeladat, valódi spec-változás) természetesen mehet.',
    }));
  }
  process.exit(0);
} catch {
  process.exit(0);
}
