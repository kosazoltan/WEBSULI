# P7B-TANITAS-MEGORZES — végrehajtás (2026-11-27)

Terv: `docs/specs/2026-11-27-p7b-tanitas-megorzes.md`.

## Lépések

1. RED (`tests/repair-bank-reuse.test.ts`): bekapcsolt nyitómesénél a `keepLegacy` a hibátlan régi csomagot modellhívás nélkül,
   azonosítóival átveszi; a meta-hibás csomagban csak a kifogásolt tétel cserélődik; meta + érvénytelen kulcs → egy célzott hívás
   mindkét tételre, a többi tétel és a másik fejezet változatlan.
2. Kód: `ExperienceBuildDeps.keepLegacy`; a `keptUnit` a `keepLegacy` mellett nem nézi a nyitómese-verziót; a régi csomag tétel-szintű
   hibái célzott alapot adnak, a csomag-szintűek tűrt örökség (`legacyIssues`); a `buildPracticeBankRepair` `keepLegacy: true`-val hív.
3. Ellenőrzés: célzott tesztek, `tsc`, próbahiba (`probe.sh`).

## Elfogadás

- A csak-bank javítás a hibátlan csomagok tételeit és azonosítóit érintetlenül hagyja (élesben bekapcsolt nyitómesénél is).
- A szerzői javítás (nem csak-bank) viselkedése változatlan (a meglévő tesztek zöldek).
