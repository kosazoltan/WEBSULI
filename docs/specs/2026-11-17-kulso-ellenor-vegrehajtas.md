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


## A hook fail-closed viselkedése időtúllépéskor (kanban #100) — végrehajtás

1. Ez a doksi-commit (terv 11. szakasz + ez az alfejezet), a kód előtt.
2. `scripts/qa/hooks/check-quality-gates.mjs`: befecskendezhető futtató (`exec`) és határidő; `noAnswer(e)` (`ETIMEDOUT`,
   `killed`, `signal`, `status == null`, `ENOENT` / `EPERM`) → kivétel → DENY; gyors nem nulla kilépés → más repó; WEBSULI-utalás
   (`cwd` / parancs) + nem repó → DENY; `currentBranch` és a ref-feloldás a „nem válaszolt” hibát továbbdobja.
3. `scripts/qa/gates/gates.config.json`: `hookGitTimeoutMs` 10 000, `hookGhTimeoutMs` 15 000, `hookBudgetMs` 45 000;
   `.claude/settings.json`: a `check-quality-gates` hook `timeout`-ja 60 s (a keret fölött).
4. Értelmező + szkriptfájl alak (`node|python|py|deno|bun|perl|ruby` + `*.mjs|*.js|*.cjs|*.ts|*.py|*.pl|*.rb`, kiértékelő kapcsoló
   nélkül) → nincs terv, ha a kapu-köteles szöveg csak idézett argumentumban áll.
5. `lint-gate.mjs` `classifyHookOutput`: értelmezhetetlen, nem üres hook-kimenet → WARN (nem csendes elnyelés). A többi `catch`
   kommentje (miért ártalmatlan).
6. Tesztek: időtúllépő / jelzéssel leállított / indítási hibás git → DENY; nem git-repó → nincs kimenet; WEBSULI-utalás + nem repó →
   DENY; keret kimerülése → DENY; T5. A valódi gites tesztek a konfigurált (hosszabb) korláttal; 20 egymás utáni futás.
7. Mutációs ellenpróba a fail-closed ágra (commit után); runbook és skill egy-egy mondata.


## A hook elérhetősége alkönyvtárból / a hook hibája = tiltás (kanban #100, 2. kör) — végrehajtás

1. Ez a doksi-commit (terv 11.1 + ez az alfejezet).
2. `.claude/settings.json`: minden hook-parancs `node "${CLAUDE_PROJECT_DIR:-.}/scripts/qa/hooks/<hook>.mjs"`.
3. `scripts/qa/hooks/settings-hooks.test.mjs` (új): a valódi settings minden hook-parancsa Git Bash-ben, `CLAUDE_PROJECT_DIR`-rel,
   négy könyvtárból, hookonként próba-bemenettel; őr: nincs relatív szkriptútvonal. Ellenpróba: a régi settings-szel bukik.
4. `check-quality-gates.mjs`: 55 s-os sapka a felülíráson; a nem egyértelmű idézés tiltása; a „soha” kommentek pontosítása.
   Tesztek: folyamat-szintű TILT git nélkül (H3), a maradék-keret sapka (`now` 40 000 → 4 500 ms), `node --eval=…`, útvonalas
   értelmező, a három idézés-alak TILT, a 11 szándék szerinti alak nem kapu-köteles; a `WEBSULI_QA_EVIDENCE_DIR` a tesztben törölve.
5. `pre-merge-gate.mjs`: `compareFiles(json)` (tiszta függvény, `previous_filename` is), teszt; `gates.config.json` hatókör.
6. Runbook és skill: a hook saját időtúllépése / indítási hibája a Claude Code-nál alapból nem tiltás — ezért projektgyökérhez kötött
   parancs, és (jóváhagyás esetén) `onFailure: "block"`; kiút elromlott hooknál.
7. Utolsó, KÜLÖN commit: `"onFailure": "block"` a kapu-hook két bejegyzésén + a hozzá tartozó teszt-állítás és runbook-sor.
