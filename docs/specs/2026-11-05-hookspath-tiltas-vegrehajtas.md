# Végrehajtás — `core.hooksPath` tiltás (2026-11-05)

Terv: `docs/specs/2026-11-05-hookspath-tiltas.md`.

1. `scripts/qa/repo-rules.json`: DENY minta `\bgit\b[^|;&]*-c\s*core\.hookspath\s*=` (i); WARN minta
   `\bgit\b[^|;&]*\bconfig\b[^|;&]*\bcore\.hookspath\b` (i).
2. `scripts/qa/repo-rules.test.mjs`: a hookot a valódi stdin-szerződéssel hívja. Ellenőrzés:
   `node --test scripts/qa/repo-rules.test.mjs` → `# pass 2`, `# fail 0`.
3. `.github/workflows/ci.yml`: a „Háromfázisú rend” job tesztlépése a `scripts/qa/repo-rules.test.mjs`-t is futtatja.
   Ellenőrzés: `node --test scripts/qa/three-phase-check.test.mjs scripts/qa/repo-rules.test.mjs` → `# fail 0`.
