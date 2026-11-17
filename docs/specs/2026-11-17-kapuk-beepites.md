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
  `context_file_max_chars` nélkül a dinamikus alsó határ 20 000 karakter (a `coder`, `planner`, `ellenor1` profil nem állítja be) —
  az `AGENTS.md` ma 19 785 karakter (21 410 bájt), alig a határ alatt; túllépésnél a közepe vágódik (fej 70% / vég 20%). Ezért a B)
  részben az `AGENTS.md` célmérete ≤ 18 000 karakter, és a „Minőségkapuk” az elejére kerül.

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

## 10. A B) rész kész terve (a #490 összevonása után alkalmazandó)

Alap: a diéta-spec 10. pontja (`docs/specs/2026-11-17-vezerles-dieta.md`) — az ott felsorolt összevonások változatlanul. Kiegészítés:

1. **A „Minőségkapuk” szakasz az Alapelvek UTÁN** (a kezelt `agentic-qa-kit` blokk elé), a #490 által módosított szöveggel, és az
   elején ez a gyorstábla (a parancsok a kapu-regiszterből, `docs/minosegkapuk.md`):

   | Fázis | Parancs (a munkafa gyökeréből) |
   |---|---|
   | Terv | első commit: terv + `*-vegrehajtas.md`; `node scripts/qa/three-phase-check.mjs --base origin/main` |
   | Minden szakasz után | `npm run gate:stage` — csak zöld után tovább |
   | Push előtt | `npm run gate:push` → `.audit-ok` → `git push` önálló, egyszerű parancsként |
   | PR előtt | független ellenőr (`websuli-fejlesztesi-ellenor`) → `node scripts/qa/gates/record-review.mjs …` → `npm run gate:pr -- --body-file <leírás.md>` → `gh pr create --body-file …` |
   | Merge előtt (közvetlenül) | `npm run gate:merge -- <PR>` (benne a futásőr) → `gh pr merge` |
   | Telepítés után | a regiszterben felvett telepítés utáni kapu (a szkriptkapuk-terv füstpróbája, ha bekerült) |

2. **Átfedő kézi szabályok → hivatkozás, az erősség megtartásával:**
   - „Verifikáció” (repó-saját): a „legkisebb ellenőrzési kör” = `gate:stage`, a „teljes suite” = `gate:push`; a „bukó parancs
     változatlan újrafuttatása tilos” mondat marad.
   - „Git” (repó-saját): + „push / PR / merge csak zöld kapuval (hook: Claude Code; git-hook: bármely kliens)”.
   - „Zárás” (repó-saját): a futtatott ellenőrzések bizonyítéka a kapu összesítő táblája (PASS / FAIL / NOT RUN); a fájl- és
     kockázatlista marad.
   - Kezelt blokkok („Teszt-integritás”, „PR-méret”, „Review-evidencia”, „Evidence-before-completion”, Codex-protokoll, közös
     minőségkapu): kézzel NEM írjuk át; a „Minőségkapuk” szakasz egy sora mondja ki, hogy ezek közül a gépiesen ellenőrzött részt
     (tiltott `.only` / `.skip`, PR-méret figyelmeztetés, háromfázisú rend, zöld-állítás bizonyítéka) a kapu adja, a többi kézi
     szabály változatlanul érvényes.
3. **Csapda-katalógus:** az „Alapelvek”-be egy sor: „`docs/agent-csapdak.md`: elég az INDEXET olvasni; részlet csak a releváns
   azonosítónál.”
4. **Méret:** az `AGENTS.md` célmérete ≤ 18 000 karakter (a Hermes-profil dinamikus alsó korlátja 20 000; ma 19 785). Becsült megtakarítás a
   diéta-spec szerint ~3 500–4 000 karakter, a gyorstábla ~+900 karakter.
5. `docs/agent-haromfazisu-munka.md`: a 3. fázis mondatához „szakaszonként `npm run gate:stage`; a háromfázisú rendet a `gate:push`
   és a CI ellenőrzi”; a mandátum-bekezdés hivatkozásra. `docs/telepites-elotti-or.md`: „az őrt a `gate:merge` is futtatja”; a 6–7.
   pont hivatkozásra (C-62 / C-63, `docs/minosegkapuk.md` „Push-fegyelem”). `docs/kanban.md`: a munkafolyamat 3. pontjához „a lezáró
   jegyzet bizonyítéka a kapu-összesítő (gate:push / gate:pr)”.
6. A szabály-leltár folytatása (a B) rész tételei: AGENTS.md repó-saját részének minden pontja → új hely) a PR-leírásban.
