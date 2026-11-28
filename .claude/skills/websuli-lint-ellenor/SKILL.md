---
name: websuli-lint-ellenor
description: WEBSULI lint kapu és szakasz utáni kapu (helyi, gyors, ingyenes). Töltsd be automatikusan MINDEN szerkesztési szakasz után (mielőtt a következő lépésre lépsz), és bármilyen kibocsátás (commit-sorozat lezárása, push, PR, merge, telepítés) előtt. Parancsok - npm run gate:stage és npm run gate:lint.
---

> Felejthető lépés = szkript, automatikusan: ismétlődő kézi lépést szkriptbe + hookba/kapuba kötni; a futás végét a Stop hook (`loop.mjs auto` + `check`) zárja — lásd ~/.claude/CLAUDE.md.

# Lint ellenőr — szakasz utáni és kibocsátás előtti helyi kapu

Tulajdonosi utasítás (2026-11-17, kötelező): minden szakasz után előbb a helyi, gyors szkript-ellenőrzések és tesztek fussanak; csak
zöld után lehet továbblépni. Az API-keretet (független ellenőr, CI) nem olcsó hibákra költjük. Runbook: `docs/minosegkapuk.md`.

## Mikor

| Helyzet | Parancs (a munkafa gyökeréből) | Mért idő ezen a gépen |
|---|---|---|
| Egy fejlesztési szakasz (egy logikai lépés) kész | `npm run gate:stage` | lásd `docs/minosegkapuk.md` |
| Csak a lint / típus / minták kellenek | `npm run gate:lint -- --fast` | lásd `docs/minosegkapuk.md` |
| Kibocsátás előtt (a push-kapu is futtatja) | `npm run gate:lint` (= `--full`) | lásd `docs/minosegkapuk.md` |

Közvetlenül: `node scripts/qa/gates/stage-gate.mjs`, `node scripts/qa/gates/lint-gate.mjs --fast|--full [--base origin/main]`.

## Mit futtat

`lint-gate`: `git diff --check` → nem követett fájlok (figyelmeztetés) → ESLint a változott `source/client/src` + `source/server`
fájlokra (`--max-warnings 0`) → (`--full`) teljes `npm run lint` → `npm run check` → `npm run check:test` (gyors módban csak, ha
változott `.ts` / tesztfájl) → repó-szabályok a diffre (`scripts/qa/repo-rules.json` + az `enforce-repo-rules` hook a hozzáadott
sorokra) → tiltott minták a diffben (`.only(` / `.skip(` / `fixme` tesztben, `--no-verify` szkriptben, privát kulcs, AWS-kulcs,
token-előtag, jelszavas nem-loopback adatbázis-URL) → `no-real-emails-guard` → skill-tükör (ha skill változott).

`stage-gate`: a fenti gyors mód + a változott fájlokhoz leképezett egységtesztek (névtő, import-keresés, játék-csoport; a közös
`game-engine/` minden játékét hozza) + MINDEN `*-guard.test.ts` + a `scripts/qa` saját tesztjei, ha azok változtak.

## A kimenet

Minden lépés egy sor: `PASS` / `FAIL` / `WARN` / `SKIP` / `NOT RUN` / `KIVÉTEL`, a végén összesítő tábla és `ZÖLD` vagy `BUKOTT`.
Bukáskor a lépés alatt a kimenet utolsó ~40 sora (szűrve: e-mail, kapcsolati szöveg, token nem jelenik meg); a teljes szűrt napló:
`<git-common-dir>/websuli-qa-evidence/logs/`. Kilépési kód: 0 zöld, 1 bukás.

## Ha bukik

1. Javítsd az OKOT (nem a mércét): tesztet gyengíteni / kihagyni tilos, a kaput megkerülni tilos.
2. `WARN „nincs célzott teszt ehhez a fájlhoz”`: írj tesztet, vagy a PR-leírásban nevezd meg, mi bizonyítja a változást.
3. `WARN nem követett fájl`: `git add` (az e-mail-őr csak a követett fájlokat látja) vagy `.gitignore`.
4. `FAIL nincs source/node_modules`: `npm.cmd ci --prefix source --ignore-scripts` (C-38).
5. Futtasd újra ugyanazt a kaput, és csak zöld után lépj tovább. Ugyanazt a bukó parancsot változatlan bemenettel újrafuttatni
   tilos — előbb javíts.
6. Ha a kapu maga hibás (hamis riasztás): a kaput kell javítani (`scripts/qa/gates/`, teszttel), nem megkerülni.
