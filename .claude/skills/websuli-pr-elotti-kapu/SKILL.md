---
name: websuli-pr-elotti-kapu
description: WEBSULI PR előtti kapu (helyi, kötelező). Töltsd be automatikusan a gh pr create ELŐTT - a check-quality-gates hook zöld pre-pr bizonyíték nélkül megtagadja a PR megnyitását. Előfeltétel - a helyi GPU-ellenőr (local-review.mjs) lefutott az aktuális fejre (NEM ítélet: jelzés, a leleteket a PR-ben igazold / cáfold). Parancs - npm run gate:pr -- --body-file <leírás.md>.
---

> Felejthető lépés = szkript, automatikusan: ismétlődő kézi lépést szkriptbe + hookba/kapuba kötni; a futás végét a Stop hook (`loop.mjs auto` + `check`) zárja — lásd ~/.claude/CLAUDE.md.

# PR előtti kapu

Runbook: `docs/minosegkapuk.md`. A hook a `gh pr create` előtt a `pre-pr-<HEAD>.json` bizonyítékot nézi; nélküle DENY.

## Menet

1. Helyi kapuk zöldek: `npm run gate:stage`, `npm run gate:push`.
2. Helyi GPU-ellenőr (`websuli-fejlesztesi-ellenor` skill; a felhős vak kör 2026-11-23 óta kivezetve) → ítélet rögzítve:
   `node scripts/qa/gates/local-review.mjs` (a high leletet a kódból ellenőrizd; hamisnál `--refuted <id> --refuted-reason "..."`).
3. PR-leírás tervezete a scratchpadban (nem a repóban), benne:
   - elfogadási lista `- [x]` tételekkel (az „Elfogadás” alatt),
   - „Futtatott ellenőrzések” (parancs + valós eredmény),
   - „Nem futtatott” (NOT RUN + ok + kockázat, vagy „nincs”),
   - a `record-review` által kiírt sor: `Független ellenőr ítélete: IGEN (fej: <hash>)`,
   - a végén: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. A kapu (a munkafa gyökeréből):

```bash
npm run gate:pr -- --body-file <scratchpad>/pr-leiras.md        # --strict: a NOT RUN is bukás
```

5. Zöld → friss `.audit-ok` (munkafa + fő checkout, külön parancsban) → `git push -u origin <ág>` → `gh pr create --body-file …`.

Közvetlenül: `node scripts/qa/gates/pre-pr-gate.mjs --body-file <út> [--base origin/main] [--slice] [--strict]`.

## Mit futtat

PR-leírás sablon → ítélet a fejre → a push előtti kapu minden lépése → `npm run build` → játék- / UI-változásnál a CI-AZONOS böngészős
út: a kapu egy gitignore-olt csomagoló konfigot ír (`source/playwright.gate.local.mts`: SwiftShader szoftveres WebGL, `workers: 1`,
`.only` tiltva), és a meglévő harnesszel futtat (eldobható Postgres 17, migráció, seed, buildelt szerver saját szabad porton —
`WEBSULI_E2E_PORT`):

```bash
cd source && node --import tsx scripts/run-e2e-tests.ts --config playwright.gate.local.mts --workers=1 --grep "<játék-azonosító>" tests/game-mobile-quality.spec.ts
cd source && node --import tsx scripts/run-e2e-tests.ts --config playwright.gate.local.mts --workers=1 tests/<játék>-*.spec.ts tests/game-meta-quality.spec.ts tests/coupon-expired-all-games.spec.ts
```

(a kapu a pontos parancsot kiírja; közös `game-engine/` változásnál minden játék fut) → DB-változásnál (`source/server/**`,
`source/shared/schema*`, `source/migrations/**`) `npm run test:learning-db` Dockerrel.

## A kimenet és ha bukik

- Zöld → `pre-pr-<fej>.json` ÉS `pre-push-<fej>.json` (a push is mehet).
- `PR-leírás sablon FAIL`: pótold a hiányzó részt (a hiba megnevezi).
- `független ellenőr ítélete FAIL`: nincs ítélet / más fejre szól — futtasd újra a `local-review.mjs`-t az új fejre (ingyenes, helyi).
- `független ellenőr ítélete WARN` NEM ítélettel (KAPU-LR-JELZES, 2026-11-27): nem megállító — a high leleteket a PR-leírásban /
  -szálban igazold (javítás) vagy cáfold (kód / teszt hivatkozással); új ellenőrkör nem kötelező.
- `böngészős út FAIL … nincs Docker`: a kötelező böngészős út nem hagyható ki csendben; indítsd a Dockert, vagy jelezd a tulajdonosnak
  (NOT DONE + ok + kockázat).
- `DB-integrációs teszt NOT RUN`: Docker nélkül; `--strict` mellett bukás. A CI DB-jobja futtatja, de a kockázatot a PR-ban jelezd.
- Új commit után az egész újra kell (fej-hash szerint kulcsolt bizonyíték).
