# Végrehajtás: Külső (Gemini) ellenőr

> Terv: `docs/specs/2026-11-17-kulso-ellenor.md` · Ág: `chore/kulso-ellenor` (a `chore/minosegkapuk`-ra épül) · **Állapot:** megvalósítva

1. Doksik (első commit). `node scripts/qa/three-phase-check.mjs --base origin/main` → OK.
2. `scripts/qa/gates/external-review.mjs` ← a kipróbált scratchpad-szkript (`kulso-ellenor.mjs`); változás: a log-előtag
   `[external-review]`; az engedélyezett címek futásidőben összerakva (K5); `--record` → `external-<fej>.json` a
   `lib.mjs` `evidenceDir`-jébe (K4). Teszt: `node --test scripts/qa/gates/external-review.test.mjs` → PASS.
3. Ellenőrzőlisták: `scripts/qa/gates/external-review/checklist-{game,general}.md`.
4. `lib.mjs`: `externalResult(evidence)` → `{status, note}` (hiány / KIHAGYVA → WARN, lefutott → PASS). `pre-pr-gate.mjs` és
   `pre-merge-gate.mjs`: „külső (Gemini) ellenőr — második vélemény” lépés. Tesztek.
5. Skill (`.agents` forrás → `skills-sync-check --fix`), `AGENTS.md` egy mondat, `docs/minosegkapuk.md` szakasz.
6. Kapuk: `gate:stage`, független ellenőr (Claude-alügynök), `record-review`, `gate:pr`; PR a `chore/minosegkapuk` bázisra.

## A #490 bot-leletei után

7. A repó-szkript a scratchpad működő (éles futásban mért) változatára alapozva újra (Interactions háttér-mód, stream-keret, nem
   ismételt időtúllépés, költségnapló, bank-adat kizárás), a korábbi repó-adaptációkkal (címek futásidőben, `--record`, teljes diff
   szűrése, rendszer-utasítás / cím szűrése, kvóta `--strict` → 2, `activeKey`). Új: `scanConnectionUrls` (URL-enként, fail-closed),
   `evaluateResponse` (siker csak kész, ítéletes jelentéssel), injektálható `transport` a tesztekhez. Táblázatos tesztek.

## Elfogadási ellenőrzőlista

- [ ] kulcs csak env / `--env-file`, soha kimenetben (teszt)
- [ ] kulcs nélkül KIHAGYVA, `--strict` → 2 (teszt)
- [ ] titok → 4, érték nélkül, hálózat nélkül (teszt)
- [ ] a kapuk csak figyelmeztetnek (teszt)
- [ ] skill, AGENTS.md, runbook


## C-61 pontosítása (kanban #92) — végrehajtás

1. Ez a doksi-commit (terv 10. szakasz + ez az alfejezet), a kód előtt.
2. `scripts/qa/gates/gates.config.json`: `repoWidePatterns` helyett `repoWideScopes` (`pattern`, `mainScope[]`, `why`), a terv táblázata szerint.
3. `scripts/qa/gates/pre-merge-gate.mjs`: `compareFiles` (a compare végpont `files[].filename`, csonka ≥ 300), `decideMerge` új
   paraméterei `mainFiles` (null = olvashatatlan) és `repoWideScopes`; a C-61 döntés a terv fail-closed szabályai szerint.
4. `scripts/qa/gates/pre-merge-gate.test.mjs`: C1–C5 táblázatos tesztek; a meglévő C-61 tesztek az új paraméterekkel.
5. `docs/minosegkapuk.md`: a C-61 új viselkedése (WARN / FAIL, mikor), és egy mondat: alügynökként a munkafa ágát a fő checkoutból,
   a feltöltés egyszerű parancsával, az ág nevével kell felküldeni.
6. `npm run gate:stage` zöld; mutációs ellenpróba commit után (egy-egy fail-closed ág kivétele → a teszt bukik); visszaállítás csak
   commitolt állapotra, `cmp`-pal ellenőrizve (C-70).

- [ ] C1–C5 teszt · [ ] runbook · [ ] mutációs ellenpróba · [ ] gate:stage zöld
