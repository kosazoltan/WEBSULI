# Végrehajtás: Állapot-ellenőrző szkriptek

Terv: `docs/specs/2026-11-17-allapot-ellenorok.md`
**Állapot:** folyamatban (ág: `chore/allapot-ellenorok`). Munkafa: `D:\repo\WEBSULI\.claude\worktrees\allapot-ellenorok`.
Minden feladat után `npm run gate:stage`.

## 1. Közös alap
- `scripts/qa/checks/lib.mjs`: `createReport(name)` → `{ add(level, code, where, msg), summary(), print({ json }), exitCode() }`;
  szintek FAIL / WARN / INFO / SKIP; `redact()` (e-mail, kapcsolati szöveg, token-előtag); `runMain(fn)` → kivételre 2-es kilépés.
- `scripts/qa/checks/checks.config.json`: keretek (memória-méret, index-sorhossz, ragadt-napok), időhöz kötött minták, ideiglenes-fájl minták.
- Ellenőrzés: `node --test scripts/qa/checks/lib.test.mjs` → pass.

## 2. memory-check.mjs
- Index ↔ fájlok, duplikált slug, sorhossz; frontmatter (name = slug, description, metadata.type ∈ user|feedback|project|reference);
  `[[slug]]` → WARN, ha hiányzik; repó-útvonalak (`docs/`, `scripts/`, `source/`, `.agents/`, `.claude/`) és `npm run <x>` (gyökér +
  `source/package.json`) létezése → FAIL; időhöz kötött minták → WARN; méret és az index token-becslése → INFO / WARN a keret fölött.
- Kapcsolók: `--dir <út>` (vagy `WEBSULI_MEMORY_DIR`), `--repo <út>`, `--json`.
- Teszt: `scripts/qa/checks/memory-check.test.mjs` — ép könyvtár → 0; hiányzó indexsor, nem létező fájl, rossz frontmatter, elavult útvonal → 1;
  hiányzó könyvtár → 2; titok-alakú szöveg nem kerül a kimenetbe.

## 3. kanban-check.mjs
- `node:sqlite` csak olvasva; (a) aktív jegy MERGED / CLOSED PR-ral → „lezárandó” (gh nélkül SKIP); (b) `in_progress` N napja → „ragadt”;
  (c) `in_review` ragadt; (d) nyitott PR jegy nélkül, MERGED PR `todo` jeggyel; (e) duplikált cím.
- Kapcsolók: `--db <út>`, `--no-gh`, `--json`, `--now <ISO>` (teszthez).
- Teszt: `scripts/qa/checks/kanban-check.test.mjs` — ideiglenes DB-vel minden ág; hiányzó DB → 2.

## 4. env-doctor.mjs
- Node vs. `engines`, npm, git, gh (bejelentkezés igen / nem), Docker; `.claude/settings.json` hookjai léteznek és `node --check`-en átmennek;
  skill-tükör (`skills-sync-check.mjs`); `node_modules` a gyökérben / `source/`-ban + `doctor:arch` hivatkozás; a `source/.env.example`
  változóneveinek megléte (csak név, van / nincs); a bizonyíték-könyvtár írható; munkafák (árva, MERGED ágú → „takarítható”); a mainbe
  olvadt helyi ágak; ideiglenes fájlok a repó gyökerében; `git status` ideje.
- Kapcsolók: `--json`, `--skip-slow`.
- Teszt: `scripts/qa/checks/env-doctor.test.mjs` — hamis futtatóval: hiányzó eszköz → FAIL, nem létező hook → FAIL, titok-érték nem kerül ki.

## 5. Keresés-pontosság
- `source/tests/search-accuracy.test.ts`: aranykészlet (a 2026-11-17-i publikus `/api/html-files` válaszból választott valódi tételek,
  csak cím / rövid leírás / tantárgy) → `matchesHomeSearch`: elvárt találat az első N-ben, ékezet nélkül, nagybetűvel; pontosság-ellenpróbák.
- `scripts/qa/checks/search-accuracy.mjs --url <alap>`: ugyanaz az aranykészlet az élő publikus végpontokon (csak GET); a hiányosságok
  (elgépelés, szerveres ékezetfüggés, téves besorolás) jelentésként, FAIL nélkül, ha a ma vállalt elvárás teljesül.

## 6. Bekötés
- Gyökér `package.json`: `check:memory`, `check:kanban`, `check:env`, `check:search`, `check:all`.
- `scripts/qa/checks.test.mjs` (gyökér-tesztlista); `.github/workflows/ci.yml` `three-phase`: `node --test scripts/qa/checks/*.test.mjs`.
- `docs/minosegkapuk.md` „Állapot-ellenőrzők”; skill `websuli-allapot-ellenor` (forrás + tükör, `skills-sync-check` a `mirroredSkills`-be
  a #490 után kerül, mert a `gates.config.json` most nem módosítható).
- `docs/kanban.md`: a session eleji kézi söprés helyére `npm run check:kanban`.

## 7. Első futtatás
- `npm run check:memory`, `check:kanban`, `check:env`, `check:search -- --url https://websuli.vip` a valós állapoton; a leletek a PR-leírásba.
- Biztonságosan javítható memória-lelet javítása (mentés `memory\archive\2026-11-17c\`); kanbant és munkafát NEM módosítunk.

## 8. Kibocsátás
- `npm run gate:push` → ZÖLD → jelzés az orkesztrátornak (független ellenőr) → `gate:pr` → egy push a #485 és a #490 után.
