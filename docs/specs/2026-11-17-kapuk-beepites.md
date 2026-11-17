# Spec: A minőségkapuk mély beépítése minden ügynökbe és környezetbe (+ a vezérlés-diéta 2. lépcsője)

> Dátum: 2026-11-17 · Szerző: Claude Code (alügynök) · Állapot: JÓVÁHAGYVA (tulajdonosi kérés 2026-11-17)
> Végrehajtás: `docs/specs/2026-11-17-kapuk-beepites-vegrehajtas.md`. Előzmény: `docs/specs/2026-11-17-vezerles-dieta.md`
> (1. lépcső: #488; a 2. lépcső terve ott a 10. pontban), `docs/specs/2026-11-17-minosegkapuk.md` (#489).

A tulajdonos (Kósa Zoltán, 2026-11-17), szó szerint:
1. „A teljes repóban, a teljes működésben mindenütt legyenek szkript-ellenőrző kapuk minden fázisra, hogy minél kevesebb
   API-hívást kelljen megvalósítani, és minél stabilabb legyen a munka folyamata. Mivel a szkriptek nem tudnak hazudni,
   félregondolni, túlgondolni, túlpolírozni vagy lost-in-the-middle hibát elkövetni … Így sokkal feszesebb vázát lehet
   építeni a teljes keretrendszernek.”
2. „Ezek használatáról skilleket, memóriákat, futtatókörnyezeket és az Agent MD, Soul MD-ket is tájékoztasd, hogy ezek
   használata valóban mélyen, használható módon beépüljenek a rendszerbe.”

## 1. Cél

Bármelyik ügynök (Claude Code, Codex, Cursor, Hermes), bármelyik környezetben (helyi gép, felhő, CI) az első percben
megtudja, hogy a kapuk léteznek, kötelezők, és pontosan melyik parancsot mikor futtassa. A szöveg rövid, ismétlésmentes;
egy szabály egy helyen, a többi helyen egysoros hivatkozás. A kapuk regisztere EGY hely: `docs/minosegkapuk.md` — új kapu
(pl. a `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` tervéből) csak ott kerül felvételre, a többi fájl hivatkozik.

## 2. NEM cél

- A `source/` alkalmazáskód, a játékok, a `scripts/qa/gates/` MEGLÉVŐ fájljainak módosítása (#490 és a szkriptkapuk-terv dolga).
- Szabály enyhítése; a kezelt `AGENTS.md`-blokkok kézi átírása; a `.cursorrules` (tulajdonosi döntésre vár).
- Git-hook telepítése bármely gépen (csak a telepítő szkript és a leírás készül, opt-in).

## 3. Érintett területek

**A) rész (ez a PR):**
- Futtatókörnyezetek: `scripts/qa/gates/ci-static-gate.mjs` (+ teszt) — a lint-kapu függőség nélküli, olcsó része (repó-szabályok +
  tiltott minták a diff hozzáadott soraiban) a CI `three-phase` jobjában; `.github/workflows/ci.yml` (egy új lépés);
  `scripts/qa/hooks/git-pre-push.mjs` + `scripts/qa/hooks/install-git-hooks.mjs` (+ teszt) — opt-in git `pre-push` hook, amely
  bármely kliensből a `gate:push` bizonyítékát nézi; `scripts/qa/codex-cloud-setup.sh` — a Codex-felhő telepítő a kapukhoz;
  `docs/codex-felhokornyezet.md` (kapuk a felhőben, kézi sorrend); `.cursor/rules/{websuli-core,haromfazisu-munka}.mdc` (egy-egy
  hivatkozó sor).
- `docs/minosegkapuk.md`: a fájl VÉGÉRE egy „Futtatókörnyezetek” szakasz (környezet × kapu tábla, `npm run verify` viszonya, CI-lépés,
  git-hook) — a #490 a fájl elejét / közepét módosítja, a hozzáfűzés nem ütközik.
- Skillek: `.agents/skills/{tananyag-javito,tananyag-keszito,websuli-internet-pipeline,websuli-studio-tools}/SKILL.md`,
  `.claude/skills/websuli-gyartas-analitika/SKILL.md` — egy-egy hivatkozó sor (gyártási lépés nem változik).

**Repón kívül (ugyanebben a futásban):** projekt-memória (`quality-gates-mandate` mint egyetlen kapu-belépő; 5 memória átfedő
része `[[quality-gates-mandate]]` hivatkozásra), globális `~/.claude/CLAUDE.md` („Szkriptkapuk” szakasz, ≤ 8 sor). Hermes-soulok:
leltár; módosítás csak bizonyíthatóan WEBSULI-n dolgozó vagy közös soulban (lásd 5.).

**B) rész (csak a #490 mainre kerülése után):** `AGENTS.md` (a diéta-spec 10. pontja + a „Minőségkapuk” előre, „fázis → parancs”
gyorstábla, az átfedő kézi szabályok hivatkozása a kapukra, „a csapda-katalógusnál elég az INDEXET olvasni”),
`docs/agent-haromfazisu-munka.md`, `docs/telepites-elotti-or.md`, `docs/kanban.md` — egy-egy hivatkozó bekezdés.

## 4. Rögzített döntések

- A kapu-regiszter: `docs/minosegkapuk.md`. Az `AGENTS.md` csak a kötelező szabályt + a gyorstáblát tartalmazza.
- A CI-lépés csak a már exportált, tesztelt függvényeket hívja (`scanAddedLines`, `applyRepoRules`, `classifyHookOutput` a
  `lint-gate.mjs`-ből; `createGate`, `makeContext` a `lib.mjs`-ből) — logika-másolat nincs. Node-on kívül semmit nem igényel.
- A git-hook a meglévő bizonyítékot olvassa (`<git-common-dir>/websuli-qa-evidence/{pre-push,pre-pr}-<sha>.json`, `ok: true`),
  ugyanazzal a feltétellel, mint a `check-quality-gates` hook. Ág törlése (csupa nulla helyi sha) átengedve.
- A telepítő nem ír felül idegen hookot, és `core.hooksPath` mellett megáll; a régit archiválja (`.bak-<dátum>`), nem törli.
- Hermes: minden profil a SAJÁT `SOUL.md`-jét tölti (`agent/context_file_sources.py`: `home / "SOUL.md"`); közös alap-soul nincs.
  A projekt `AGENTS.md`-jét a Hermes is betölti munkakönyvtárból (`discover_context_files`), karakterkorláttal: a profil
  `context_file_max_chars` nélkül a dinamikus alsó határ 20 000 karakter — az `AGENTS.md` ma 21 410 karakter. Ezért a B) részben az
  `AGENTS.md` célmérete ≤ 20 000 karakter, és a „Minőségkapuk” az elejére kerül.

## 5. Edge case-ek

- Diff nélküli (push esemény) CI-futás: a `three-phase` job csak `pull_request`-en fut — a lépés ott van.
- Törölt fájl / bináris a diffben: a `SKIP_SCAN` és a hozzáadott-sor modell kezeli.
- Git-hook: worktree-ben a közös git-könyvtár `hooks/` mappája hat; leválasztott fej / több ref a stdin-en → minden kimenő sha-ra
  külön ellenőrzés; Windows: a hook `#!/bin/sh` szkript, a Git for Windows futtatja.
- Codex-felhő: nincs `gh` → a `gh`-t igénylő lépések `SKIP` (a kapuk már így kezelik); nincs Docker → a DB-teszt `NOT RUN`.
- Soul: ha nem bizonyítható a WEBSULI-kötődés → nincs módosítás, „TULAJDONOSI DÖNTÉS KELL”.

## 6. Elfogadási kritériumok (EARS)

- WHEN a PR hozzáadott sora tiltott mintát tartalmaz (pl. `.only(` tesztben, privát kulcs) THEN the CI `three-phase` job SHALL fail
  a `ci-static-gate` lépésben, az érték kiírása nélkül.
- WHEN a git `pre-push` hook telepítve van ÉS a kimenő commitra nincs zöld `pre-push` / `pre-pr` bizonyíték THEN the push SHALL be
  refused (kilépési kód 1) a teendő megnevezésével; zöld bizonyítéknál vagy ág törlésénél SHALL pass.
- WHEN az `install-git-hooks.mjs` idegen `pre-push` hookot vagy `core.hooksPath`-t talál THEN it SHALL NOT overwrite and exit 1.
- WHEN egy friss ügynök csak az automatikusan betöltött szöveget olvassa (AGENTS.md, globális CLAUDE.md, MEMORY.md, skill-leírások)
  THEN it SHALL learn: a kapuk léteznek, kötelezők, és a `npm run gate:stage|push|pr|merge` parancsokat.
- WHEN `npm run gate:push` fut a PR fején THEN it SHALL be green.

## 7. Tesztterv

- `node --test scripts/qa/gates/ci-static-gate.test.mjs scripts/qa/hooks/install-git-hooks.test.mjs` (új tesztek: tiszta és bukó
  diff, ág törlése, hiányzó / bukott / zöld bizonyíték, idegen hook, hooksPath).
- A CI-lépés időmérése: a `three-phase` job futásideje előtte / utána.
- `npm run gate:stage` szakaszonként; `npm run gate:push`; `npm run gate:pr -- --body-file <leírás.md>`.

## 8. Kockázatok / visszavonás

- A CI-lépés hamis riasztása → a kapu javítandó (teszttel); visszavonás: `git revert`.
- A `docs/minosegkapuk.md` hozzáfűzése ütközhet a #490-nel → a szakasz a fájl végén, önálló címmel.
- Memória / globális CLAUDE.md: mentés `memory/archive/2026-11-17b/` (SHA-256 lista) és `~/.claude/archive/CLAUDE.md.2026-11-17b.bak`.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-17-kapuk-beepites-vegrehajtas.md`
