# A `core.hooksPath` felülírásának tiltása (2026-11-05)

## Mért rés

Az AGENTS.md tiltja a QA-hookok megkerülését; az `enforce-repo-rules` hook a `git --no-verify`-t DENY-jal blokkolja, de a
`git -c core.hooksPath=/dev/null commit …` formát nem ismeri fel (visszajátszással mérve: nincs kimenet). Ez ugyanaz a
megkerülés; egy ügynök a #396-ban így commitolt (`docs/agent-csapdak.md` C-17).

## Cél / nem-cél

- Cél: a `git -c core.hooksPath=…` parancs DENY (idézőjeles formában is), valamint ugyanez `--config-env`-vel és
  `GIT_CONFIG_KEY_n` / `GIT_CONFIG_PARAMETERS` környezeti változóval (review #398).
- Review #398: WARN repo-szabály nincs — a kit hookja az első WARN-nál kilép, így elnyomná a későbbi DENY-t (pl.
  `git config --get core.hooksPath; git commit --no-verify`). A `git config core.hooksPath` ezért nem jelez.
- Nem-cél: a kezelt `agentic-qa-kit` hookkódja (`scripts/qa/hooks/enforce-repo-rules.mjs`) nem változik — a bővítés a kit
  saját, erre szolgáló `scripts/qa/repo-rules.json` fájljában van. Git hook nem kerül a repóba (a repó nem ír elő ilyet).

## Edge case-ek

- Szöveg, amely csak idézi a tiltott parancsot (pl. `echo` / `rg` minta): a kit nyers parancsszöveget vizsgál, ezért ezt is
  tiltja — ugyanígy viselkedik a meglévő `--no-verify` szabály is. Elfogadott kompromisszum: a hamis tiltás csak
  megerősítést kér, a hamis engedés megkerülést enged.
- Más kulcs `GIT_CONFIG_KEY_n`-ben (pl. `user.name`) és a `core.hooksPath` lekérdezése: nincs kimenet.

## Érintett fájlok

`scripts/qa/repo-rules.json` (új), `scripts/qa/repo-rules.test.mjs` (új), `.github/workflows/ci.yml` (a meglévő QA-teszt
lépés a új tesztet is futtatja).

<!-- acceptance-checklist -->
- [x] A1: `git -c core.hooksPath=… commit|push|merge` → DENY; a `--no-verify` tiltás megmarad.
- [x] A2: `git config --get core.hooksPath; git commit --no-verify …` → DENY; a szokásos `git commit` / `push` / `-c user.name=…`
  és a `core.hooksPath` lekérdezése → nincs kimenet.
- [x] A3: `node --test scripts/qa/three-phase-check.test.mjs scripts/qa/repo-rules.test.mjs` PASS, a CI is futtatja.
