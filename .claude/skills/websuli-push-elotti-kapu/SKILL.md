---
name: websuli-push-elotti-kapu
description: WEBSULI push előtti kapu (helyi, kötelező). Töltsd be automatikusan minden git push ELŐTT a WEBSULI-repóban (munkafában is) - a check-quality-gates hook zöld pre-push bizonyíték nélkül megtagadja a pusht. Parancs - npm run gate:push.
---

# Push előtti kapu

Runbook: `docs/minosegkapuk.md`. A hook (`scripts/qa/hooks/check-quality-gates.mjs`) a `git push` előtt a
`<git-common-dir>/websuli-qa-evidence/pre-push-<HEAD>.json` bizonyítékot nézi; nélküle DENY. Távoli ág törlése
(`git push origin --delete <ág>`) kivétel.

## Menet

```bash
git status --short                      # 1. minden commitolva, nem követett fájl sincs (különben a kapu bukik)
git fetch origin && git merge origin/main   # 2. friss main beolvasztva (rebase / force-push TILOS)
npm run gate:push                       # 3. a kapu (a munkafa gyökeréből); --slice: a közös modulok érintése is figyelmeztet
touch .audit-ok                         # 4. KÜLÖN parancsban, közvetlenül a push előtt, a munkafa gyökerében …
touch /d/repo/WEBSULI/.audit-ok         #    … ÉS a fő checkout gyökerében (a check-audit-ok hook 10 percet enged)
git push -u origin <ág>                 # 5. egy push
```

Közvetlenül: `node scripts/qa/gates/pre-push-gate.mjs [--base origin/main] [--slice]`.

## Mit futtat

tiszta munkafa → `git fetch` → teljes lint kapu (`--full`) → teljes egységteszt (TAP-elemzéssel) → háromfázisú rend
(`three-phase-check.mjs`) → PR-méret (`pr-size-check.mjs`, túllépés = figyelmeztetés) → friss `origin/main` a HEAD őse? (ha nem: az
őr-tesztek az összefésült állapoton, ideiglenes munkafában — C-61) → közös / tiltott fájlok érintése → `.audit-ok` frissessége →
„zöld CI utáni push” figyelmeztetés (`gh`; nélküle kihagyva).

## A kimenet

- Összesítő tábla, `ZÖLD` / `BUKOTT`; zöld esetben bizonyíték a fej-commitra (`pre-push-<fej>.json`).
- `KIVÉTEL ismert helyi kivétel: native-arch (C-38)`: CSAK a `native-arch.test.ts` bukik, és a `doctor:arch` is bukik (friss
  munkafában a `better-sqlite3` natív kötése nem épült fel, `--ignore-scripts`). A CI `native-arch` jobja x64-en és ARM64-en futtatja.
  Ha más teszt is bukik, vagy a `doctor:arch` zöld: `FAIL`.
- `WARN A … TÁVOLI FEJÉNEK CI-JA ZÖLD — EZ A PUSH ÚJRAINDÍTJA AZ ~1 ÓRÁS PLAYWRIGHT E2E-T (C-62)`: zöld CI után nincs push (doksi sem);
  csak valódi javításért, egy pushban.

## Ha bukik

- `tiszta munkafa FAIL`: commitold (commit-üzenet fájlból: `git commit -F <fájl>`), a nem követett fájlt vedd fel / tedd .gitignore-ba /
  vidd a scratchpadba, és futtasd újra.
- A hook FAIL-CLOSED: a push CSAK önálló, egyszerű parancsként, a munkafa gyökeréből megy át — engedett: `git push`,
  `git push <remote>`, `git push [-u] <remote> <helyi ág>`, `git push <remote> HEAD`, `git push <remote> HEAD:<aktuális ág>`.
  Láncolás (`&&`, `;`, `|`), `cd` / `env` / `git -C`, átirányítás, `--force*`, `--all`, `--tags`, `:` / `+` refspec → DENY.
  Távoli ág törlése: `git push <remote> --delete <ág>` (kapu nélkül; a `:<ág>` alak DENY).
- A hook akkor is tilt, ha a git / gh nem válaszol időben („a repó állapota nem állapítható meg — próbáld újra”): néhány
  másodperc múlva add ki újra ugyanazt az egyszerű parancsot. Alügynökként a munkafa ágát a fő checkoutból, az ág nevével küldd fel.
- `háromfázisú rend FAIL`: hiányzik / későn jött a végrehajtási fájl (C-37) — pusholt ágon a sorrend nem javítható; ezért a legelső
  push ELŐTT kell zöldnek lennie.
- `friss main … FAIL`: `git merge origin/main`, oldd fel, javítsd a repó-szintű őrt, futtasd újra.
- Egyéb `FAIL`: javítsd az okot (lásd `websuli-lint-ellenor`), majd újra a kapu. Megkerülni tilos; vészkijárat nincs.

## Push-fegyelem (átmeneti kapu-szabály 5–8.)

1. Main-merge-et CSAK akkor pusholj, ha a PR ütközik a mainnel, vagy ha az orkesztrátor kéri (a csak-merge push is újraindítja
   az ~1 órás E2E-t; helyben beolvaszthatod a kapuhoz).
2. Lecserélt (régi) fej CI-bukására ne reagálj új pushsal: előbb a JELENLEGI fej CI-ja és az ismert ingadozók; gyanúnál jelentsd a
   teszt nevével és a hibaüzenettel, ne módosíts termékkódot találomra.
3. Push után EGY hosszú figyelő a CI végére, közbenső „még fut” jelentés nélkül.
4. Zöld CI-jú fejre csak blokkoló lelet javításáért pusholj — mindent egy pushban.

## Egy-push elv

A PR megnyitása után a javításokat egy kötegben, egy pushban küldd (minden push újraindítja az ~1 órás E2E-t). Minden érdemi javító
push előtt: vak visszaellenőrzés az új fejre — KIZÁRÓLAG a futtatóval (`npm run gate:blind-review`, `websuli-vak-ellenor` skill) —, utána ez a kapu.
