# Végrehajtás: befejezési mandátum, önfejlesztés, ARM64 + x64 (terv: `docs/specs/2026-11-03-befejezes-onfejlesztes-dual-arch.md`)

Munkakönyvtár: repó gyökér, a Node-lépések `source/`-ban. Ág: `chore/befejezes-onfejlesztes-dual-arch`.

## T1: natív-architektúra ellenőrző — `source/scripts/check-native-arch.mjs`

- Export: `checkNativeArch()` → `{ target: "<platform>-<arch>", results: [{ name, ok, detail }] }`.
- Ellenőrzött modulok (mindegyik tényleges betöltéssel / futtatással):
  - `esbuild` (gyökér): `require("esbuild").transformSync("let a=1")`;
  - `tsx` beágyazott esbuild: `createRequire(require.resolve("tsx/package.json"))` → ugyanez, ha a
    `tsx/node_modules/esbuild` létezik;
  - `rollup`: `require("rollup/parseAst").parseAst("1")`;
  - `sharp`: `require("sharp").versions`;
  - `better-sqlite3`: `new (require("better-sqlite3"))(":memory:").prepare("select 1 as x").get()`.
- Hiba esetén a `detail` a hibaüzenet első sora.
- CLI-mód (`node scripts/check-native-arch.mjs`): soronként `OK|HIBA <név> — <detail>`; bármely hibánál
  `Javítás: npm ci` (win32-n `npm.cmd ci`) a `source/` mappában, exit 1; különben exit 0.
- **Ellenőrzés:** `cd source && node scripts/check-native-arch.mjs` → exit 0, 5 `OK` sor.

## T2: teszt — `source/tests/native-arch.test.ts`

- Importálja a `checkNativeArch`-ot (`../scripts/check-native-arch.mjs`), és minden eredményre
  `assert.ok(r.ok, \`${r.name} (${target}): ${r.detail}\`)`.
- **Ellenőrzés:** `cd source && npx.cmd tsx --test tests/native-arch.test.ts` → pass 1.

## T3: `source/package.json`

- `"doctor:arch": "node scripts/check-native-arch.mjs"`;
- `"verify": "npm run doctor:arch && npm run check && …"` (a meglévő lánc elé).

## T4: CI — `.github/workflows/ci.yml`

- Új job `native-arch` („Natív futás (Windows x64 + ARM64)”), `needs: lint-typecheck`,
  `strategy.fail-fast: false`, `matrix.os: [windows-latest, windows-11-arm]`, `runs-on: ${{ matrix.os }}`,
  `defaults.run.working-directory: source`.
- Lépések: checkout v4 → setup-node v4 (node 24, npm cache a `source/package-lock.json`-ra) → `npm ci` →
  `node -p "process.platform+'-'+process.arch"` → `npm run doctor:arch` → `npm test` → `npm run build`.

## T5: vezérlőfájlok és tudásanyag

1. `AGENTS.md` „Befejezési mandátum” szakasz végére: önfejlesztési hurok (minden hiba → csapda-bejegyzés
   a `docs/agent-csapdak.md`-ben + szükség szerint skill/runbook/memória javítás ugyanabban a körben;
   várakozás alatt ez a kitöltő munka) és ARM64 + x64 szabály (`doctor:arch`, nincs architektúra-
   függő node_modules másolás).
2. `docs/agent-csapdak.md`: C-01 arm64/x64 node_modules; C-02 elavult kanban-útvonal; C-03 commitolatlan
   félkész munka sessionök között; C-04 óriás `git pull` kimenet (`--stat` nélkül 250 KB); C-05 memória
   nélküli Claude-projektmappa.
3. `docs/kanban.md` „Hol van a tábla”: valós CLI-útvonal, `<repo>/.hermes/kanban.db`, futtatás a repó
   gyökeréből; a #6–#11 jegyek UNKNOWN.
4. `RUNBOOK.md` §11: „Megkezdett munkát félbehagyni”, „node_modules-t gépek/architektúrák között
   másolni”; §12: „esbuild for another platform” → `npm run doctor:arch` + `npm.cmd ci`.
5. `.agents/skills/{tananyag-keszito,tananyag-javito,websuli-internet-pipeline,websuli-studio-tools}/SKILL.md`:
   egy sor a mandátumról az AGENTS.md-re hivatkozva.
6. `.github/copilot-instructions.md`: review-szempont — félkész spec / `-vegrehajtas.md`, platform-
   függő útvonal vagy bináris.
7. `.gitignore`: `.hermes/`.
8. `memory/projects/websuli/LEDGER.md`: 2026-11-03 bejegyzés.
- **Ellenőrzés:** `grep -l "Befejezési mandátum\|befejezési mandátum"` a fenti fájlokon → mind találat.

## T6: repón kívül

- `~/.claude/CLAUDE.md`: „Befejezési mandátum és önfejlesztés” + ARM64/x64 szakasz.
- Claude projektmemória (`~/.claude/projects/C--Repo-WEBSULI/memory/`): feedback (mandátum,
  önfejlesztés), project (ARM64+x64, kanban hely), `MEMORY.md` index.

## T7: NAT 2020 6. évfolyam lezárása

- `cd source && npx.cmd tsx --test tests/nat2020-grade6-maps.test.ts` → pass 1.
- `curl -sS -o NUL -w "%{http_code}" https://websuli.vip/api/studio/maps` → 401 ⇒ Task 3 BLOCKED.
- Kanban: `kanban.mjs note 1 "<mért kimenet>"`; új STANDING jegy a mandátumra.

## T8: verifikáció

- `cd source && npm run doctor:arch`, `npx.cmd tsx --test tests/native-arch.test.ts`,
  `npm.cmd test`, `npm.cmd run check`, `npm.cmd run check:test`, `npm.cmd run build`.
- `node scripts/qa/three-phase-check.mjs --base main` a gyökérből.
- Diff visszamérése a spec EARS-pontjaihoz.
