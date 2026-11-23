---
name: lint-max-warnings
description: "A WEBSULI CI-lintje `--max-warnings 0` — push előtt `npm run lint` (nem csak a módosított fájlok eslintje)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-10-21T14:54:09.346Z
---

A CI „Lint & Typecheck” lépése `eslint client/src server --max-warnings 0`: egyetlen FIGYELMEZTETÉS (pl. használaton kívüli változó egy
refaktor után) is buktatja. A célzott `npx eslint <fájlok>` a figyelmeztetést nem jelzi hibaként.

**Why:** 2026-10-21, #361: a `dedupeOptions` saját kulcsa után a modulszintű `key` használaton kívül maradt → CI-bukás.
**How to apply:** a teljes `npm run lint` 2026-11-17 óta a `gate:lint` / `gate:push` része ([[quality-gates-mandate]]) — azt
futtasd; a célzott eslint (és a `gate:lint -- --fast`) csak szakaszközben elég. A `shared/` nincs a lint körében, ott a régi
`no-useless-escape` figyelmeztetések nem buktatnak.
