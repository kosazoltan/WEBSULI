# Végrehajtás — `core.hooksPath` tiltás (2026-11-05)

Terv: `docs/specs/2026-11-05-hookspath-tiltas.md`.

1. `scripts/qa/repo-rules.json`: egyetlen DENY minta `\bgit\b[^|;&]*-c\s*['"]?core\.hookspath\s*=` (i); WARN szabály nincs
   (review #398: a WARN a hook korai kilépése miatt elnyomná a DENY-t).
2. `scripts/qa/repo-rules.test.mjs`: a hookot a valódi stdin-szerződéssel hívja. Ellenőrzés:
   `node --test scripts/qa/repo-rules.test.mjs` → `# pass 2`, `# fail 0` (az idézőjeles és az összetett `--no-verify` parancsra is).
3. `.github/workflows/ci.yml`: a „Háromfázisú rend” job tesztlépése a `scripts/qa/repo-rules.test.mjs`-t is futtatja.
   Ellenőrzés: `node --test scripts/qa/three-phase-check.test.mjs scripts/qa/repo-rules.test.mjs` → `# fail 0`.
