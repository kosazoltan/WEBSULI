# Befejezési mandátum, önfejlesztési hurok és ARM64 + x64 futás

**Dátum:** 2026-11-03 · **Tier:** M · **Ág:** `chore/befejezes-onfejlesztes-dual-arch`
**Forrás:** tulajdonosi utasítás (2026-11-03, chat): félbehagyás tilos, minden session végén
teljességellenőrzés; minden hibából csapda/memória/runbook/skill-javítás; „mind ARM64-en, mind
x64-en futnia kell a programnak és a fejlesztéseknek is”.

## Mért kiinduló állapot (2026-11-03)

- A befejezési mandátum a #372-vel (2026-11-01) bekerült: `AGENTS.md:123–135`,
  `docs/agent-haromfazisu-munka.md`, `docs/kanban.md`, `.cursor/rules/haromfazisu-munka.mdc`,
  `.claude/skills/websuli-gyartas-analitika/SKILL.md`. **Hiányzik:** `.agents/skills/*` (4 skill),
  `.github/copilot-instructions.md`, `RUNBOOK.md`, a globális `~/.claude/CLAUDE.md` és a Claude Code
  projektmemória (a `memory/` mappa üres, `MEMORY.md` nincs).
- Az önfejlesztési hurok (minden hibából csapda-bejegyzés) sehol nincs rögzítve; csapdakatalógus nincs.
- **Félbehagyott munka:** a `docs/specs/2026-09-29-nat2020-grade6-knowledge(.md, -vegrehajtas.md)`,
  `docs/knowledge/nat2020-6/` és `source/tests/nat2020-grade6-maps.test.ts` 2026-09-29 óta
  commitolatlan; a kanbanon `#1 [review]`.
- **Architektúra-csapda:** az x64-es gépen (`PROCESSOR_ARCHITECTURE=AMD64`, `node` `x64`) a
  `source/node_modules` csak `@esbuild/win32-arm64`-et tartalmazott → minden `tsx`-teszt
  „You installed esbuild for another platform” hibával állt meg. `npm.cmd ci` után x64-en zöld.
  A `package-lock.json` mindkét Windows-architektúra csomagját tartalmazza (esbuild, rollup, sharp).
  Natív modulok: esbuild (gyökér + `tsx/node_modules`), `@rollup/rollup-*`, `sharp`, `better-sqlite3`;
  a `bufferutil` opcionális (JS fallback).
- **Kanban-csapda:** a `docs/kanban.md` CLI-útvonala (`D:\repo\Hermes-agent\…`) nem létezik; a CLI
  ténylegesen egy gépenként eltérő helyen lévő `hermes-kanban-workflow/scripts/kanban.mjs`, a tábla a
  repóban: `<git toplevel>/.hermes/kanban.db` (a CLI a `HERMES_HOME` alatti táblát elutasítja). A
  `.hermes/` nincs gitignore-olva. A doksiban említett #6–#11 jegyek (köztük a #11 STANDING) az új
  táblán nincsenek — UNKNOWN, hová kerültek.
- CI: minden job `ubuntu-latest`; Windows ARM64/x64 nincs mérve. A repó PUBLIC → a `windows-11-arm`
  és `windows-latest` futtatók elérhetők.

## Cél

1. A befejezési mandátum és az önfejlesztési hurok minden ügynök-belépési ponton (globális és repó
   vezérlőfájlok, skillek, runbook, Copilot-review, Claude-memória) egységesen szerepeljen.
2. Csapdakatalógus (`docs/agent-csapdak.md`): tünet → gyökérok → megelőzés, a mai mért csapdákkal.
3. ARM64 + x64: gyors, egyértelmű natív-függőség ellenőrzés (`npm run doctor:arch`), amely hibánál
   pontos javítási parancsot ad; unit teszt, ami a `npm test`-ben is elkapja; CI-mátrix Windows x64 +
   Windows ARM64 futtatóval.
4. A NAT 2020 6. évfolyamos munka lezárása a saját specje szerint (Task 1–4), a commitolatlan fájlok
   bekerülése.

## Nem cél

- A NAT-anyag éles publikálása admin-munkamenet nélkül (401 → BLOCKED, a saját spec szerint).
- A `bufferutil` ARM64 prebuild pótlása (opcionális, JS fallback van).
- Függőségverzió-emelés, lockfile-újragenerálás.

## Érintett fájlok

| Fájl | Változás |
|---|---|
| `source/scripts/check-native-arch.mjs` | új: natív modulok betöltése az aktuális `platform-arch`-ra |
| `source/tests/native-arch.test.ts` | új: a checker minden modulra OK |
| `source/package.json` | `doctor:arch` script, a `verify` elején |
| `.github/workflows/ci.yml` | új `native-arch` job: `windows-latest` + `windows-11-arm` mátrix |
| `AGENTS.md` | mandátum-szakasz: önfejlesztési hurok + ARM64/x64 szabály |
| `docs/agent-csapdak.md` | új csapdakatalógus |
| `docs/kanban.md` | valós CLI-útvonal és tábla-hely |
| `RUNBOOK.md` | §11 és §12 kiegészítés |
| `.agents/skills/*/SKILL.md` (4) | mandátum-hivatkozás |
| `.github/copilot-instructions.md` | review-szempont: félkész spec, arch |
| `.gitignore` | `.hermes/` |
| `memory/projects/websuli/LEDGER.md` | napi bejegyzés |
| NAT 2020 fájlok | commit (meglévő, zöld) |
| repón kívül: `~/.claude/CLAUDE.md`, Claude projektmemória | mandátum + csapdák |

## Edge case-ek

- Hiányzó opcionális natív modul (pl. `sharp` nem települt) → a checker „hiányzik” hibát ad, nem
  csendes sikert.
- A checker nem tölthet le és nem telepíthet semmit; csak diagnosztizál és parancsot javasol.
- `tsx` beágyazott esbuildja külön ellenőrzendő (ma pont az bukott).
- ARM64 Windows-on a `better-sqlite3` prebuild hiányában forrásból fordulna; ha a CI ezt nem tudja,
  az objektív blokkoló, NOT DONE-ként jelentendő, nem rejthető el.

## Elfogadás (EARS)

- WHEN `npm run doctor:arch` fut olyan `node_modules`-szal, amely az aktuális architektúrához
  települt, THEN 0-val lép ki, és modulonként `OK` sort ír.
- WHEN egy natív modul más architektúrára települt vagy hiányzik, THEN 1-gyel lép ki, megnevezi a
  modult, az elvárt `platform-arch`-ot, és kiírja: `npm ci` (Windows-on `npm.cmd ci`).
- WHEN `npm test` fut, THEN a `native-arch` teszt ugyanezt ellenőrzi.
- WHEN PR nyílik `main`-re, THEN a CI `native-arch` jobja `windows-latest` (x64) és `windows-11-arm`
  (ARM64) futtatón is `npm ci` + `doctor:arch` + `npm test` + `npm run build` lépést futtat.
- WHEN egy ügynök bármely belépési fájlt olvas (AGENTS.md, skill, RUNBOOK, Copilot, globális CLAUDE.md),
  THEN megtalálja a befejezési mandátumot és a csapdakatalógus hivatkozását.
- WHEN a `nat2020-grade6-maps` teszt fut, THEN zöld; a kanban #1 jegyen a mért bizonyíték áll.

## Unverified / kockázat

- A `windows-11-arm` CI-futás eredménye csak push után mérhető (push tulajdonosi döntés).
- Helyben csak x64 mérhető; ARM64-es helyi gépen a `doctor:arch` ad bizonyítékot.
