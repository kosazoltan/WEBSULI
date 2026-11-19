---
name: websuli-pr-elotti-kapu
description: WEBSULI PR előtti kapu (helyi, kötelező). Töltsd be automatikusan a gh pr create ELŐTT - a check-quality-gates hook zöld pre-pr bizonyíték nélkül megtagadja a PR megnyitását. Előfeltétel - a független fejlesztési ellenőr IGEN ítélete az aktuális fejre. Parancs - npm run gate:pr -- --body-file <leírás.md>.
---

# PR előtti kapu

Runbook: `docs/minosegkapuk.md`. A hook a `gh pr create` előtt a `pre-pr-<HEAD>.json` bizonyítékot nézi; nélküle DENY.

## Menet

1. Helyi kapuk zöldek: `npm run gate:stage`, `npm run gate:push`.
2. Független ellenőr (`websuli-fejlesztesi-ellenor` skill) → ítélet rögzítve:
   `node scripts/qa/gates/record-review.mjs --head <fej> --verdict IGEN --report <jelentés.md>`.
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

**Fail-fast (2026-11-19):** előbb az olcsó lépések — PR-leírás sablon → ítélet a fejre → külső sor → tiszta munkafa → `git fetch` →
háromfázisú rend → PR-méret; az ELSŐ bukásnál a kapu megáll (`pre-pr-<fej>` `ok: false`), a drága lépés nem indul. Utána a push előtti
kapu többi lépése → `npm run build` → játék- / UI-változásnál a CI-AZONOS böngészős
út: a kapu egy gitignore-olt csomagoló konfigot ír (`source/playwright.gate.local.mts`: SwiftShader szoftveres WebGL, `workers: 1`,
`.only` tiltva), és a meglévő harnesszel futtat (eldobható Postgres 17, migráció, seed, buildelt szerver saját szabad porton —
`WEBSULI_E2E_PORT`):

```bash
cd source && node --import tsx scripts/run-e2e-tests.ts --config playwright.gate.local.mts --workers=1 --grep "<játék-azonosító>" tests/game-mobile-quality.spec.ts
cd source && node --import tsx scripts/run-e2e-tests.ts --config playwright.gate.local.mts --workers=1 <a játék gameE2e spec-jei>
```

**Csak az érintett játék (tulajdonosi döntés 2026-11-19):** egy / néhány ismert játéknál a mobil mérő a játékra szűrve + a játék saját
spec-jei a `gates.config.json` `gameE2e` táblájából; a meta-mérő, a lejárt kupon és minden más spec a CI-ra marad — a kapu kiírja, mit
futtatott és mit hagyott a CI-ra. Közös / ismeretlen játékfájl (játékmotor, `Games.tsx`, hangmotor, mérő spec-ek, tesztsegédek, több
játékra illő fájl, a táblában nem szereplő játék-spec) → teljes helyi játék-kör (fail-safe). Új játék-spec → a `gameE2e` táblába is
(az őr-teszt különben bukik).

(a kapu a pontos parancsot kiírja; közös `game-engine/` változásnál minden játék fut) → DB-változásnál (`source/server/**`,
`source/shared/schema*`, `source/migrations/**`) `npm run test:learning-db` Dockerrel.

## A kimenet és ha bukik

- Zöld → `pre-pr-<fej>.json` ÉS `pre-push-<fej>.json` (a push is mehet).
- `PR-leírás sablon FAIL`: pótold a hiányzó részt (a hiba megnevezi).
- `független ellenőr ítélete FAIL`: nincs ítélet / NEM / más fejre szól — futtasd az ellenőrt, rögzítsd az új fejre.
- `böngészős út FAIL … nincs Docker`: a kötelező böngészős út nem hagyható ki csendben; indítsd a Dockert, vagy jelezd a tulajdonosnak
  (NOT DONE + ok + kockázat).
- `DB-integrációs teszt NOT RUN`: Docker nélkül; `--strict` mellett bukás. A CI DB-jobja futtatja, de a kockázatot a PR-ban jelezd.
- Új commit után az egész újra kell (fej-hash szerint kulcsolt bizonyíték).
