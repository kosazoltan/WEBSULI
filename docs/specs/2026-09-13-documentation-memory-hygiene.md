# Dokumentáció-, memória-, skill- és fájlhigiénia

> Dátum: 2026-09-13 · Állapot: VÁZLAT → végrehajtás azonnal

## 1. Cél

A WebSuli repóban a tananyag-pipeline dokumentációja, handoffjai, projektmemóriája, skilljei és Kanban/memória-indexei legyenek GitHubon követhető, kereshető és titokmentes állapotban. A munkamenetből csak a WEBSULI projekthez tartozó, megtisztított összefoglaló kerülhet a repóba; globális session-transcript, más projekt vagy hitelesítő adat nem.

## 2. NEM cél

- Nem töltünk fel nyers `C:\Users\Kósa Zoltán\.codex\sessions` vagy globális memóriafájlokat.
- Nem töltünk fel `.env`, backup, token-, OAuth-, SSH- vagy MCP-konfigurációt.
- Nem írjuk át a Git teljes történetét és nem végzünk force-push-t ebben a munkában.
- Nem módosítunk tananyagot, éles adatot, jogosultságot vagy futó pipeline-t.
- Nem törlünk ismeretlen eredetű untracked fájlokat; azokat külön kategorizáljuk és érintetlenül hagyjuk.

## 3. Érintett területek

- `docs/handoffs/` és `docs/specs/` — előző munkamenetek átadási és végrehajtási dokumentumai.
- `memory/` — már követett projektmemória, index és séma.
- `.agents/skills/` — tananyag-készítő és -javító skillforrások.
- `add-mcp-config.ps1` — hard-coded API-token megszüntetése.
- `.gitignore` és egy új secret-higiéniai jegyzet.
- Új, megtisztított WEBSULI-session memória- és runtime-dokumentációs manifest.

## 4. Rögzített döntések és kényszerek

1. A repóba kerülő memória csak WEBSULI-scope-ú, titokmentes, ellenőrzött összefoglaló lehet.
2. A QMD/Cogni/IAM/SOUL/RUNBOOK/MEMORY/KANBAN/SKILL élő dokumentumai az alkalmazás admin API-jából származnak; admin-hozzáférés nélkül csak a forrást és exportállapotot dokumentáljuk, élő tartalmat nem találunk ki.
3. A hard-coded token helyére csak környezeti változó-hivatkozás kerülhet; a token értéke nem jelenhet meg diffben, logban vagy commitban.
4. A korábbi, különálló untracked handoff/spec fájlokat csak secret-scan után lehet stage-elni.
5. A GitHubra történő push és PR/merge csak a staged diff, secret-scan, tesztek és review után történhet.

## 5. Edge case-ek

- A gitleaks által jelzett fájl lehet példafájl vagy valódi titkot tartalmazó lokális fájl; a tartalmat nem írjuk ki, csak osztályozzuk.
- Git-ignore-olt fájlok nem kerülhetnek stage-be `git add -f` nélkül; ezt nem használjuk.
- A korábbi Git-történetben már szereplő token jelenlegi fájlból való eltávolítása nem bizonyítja a visszavonást; a token rotációja külön üzemeltetési feladat.
- A meglévő `.codex/`, `tmp-e2e-*`, backup és környezeti fájlok idegen vagy lokális artefaktumok; nem töröljük őket automatikusan.
- A nem adminos runtime API `401` válasza nem helyettesíti az élő QMD/Cogni exportot.

## 6. Elfogadási kritériumok (EARS)

- WHEN a staged fájlokat gitleaks ellenőrzi THEN a jelentésben nem lehet valódi secret-találat.
- WHEN `add-mcp-config.ps1` futtatási konfigurációt állít elő THEN az API-token kizárólag a `HOSTINGER_API_TOKEN` környezeti változóból származhat.
- WHEN a WEBSULI memória-export készül THEN csak a projekt-scope-ú, secret-safe összefoglaló és a runtime-dokumentumok exportmanifestje kerül bele.
- WHEN az admin runtime API admin nélkül érhető el THEN a dokumentum 401-et ad, és a handoff ezt NOT RUN/BLOCKED állapotként jelöli.
- WHEN a dokumentációs PR merge-előtt áll THEN a repo-teszt, diff-check, secret-scan és célzott script-ellenőrzés mind PASS.
- WHEN push és merge megtörténik THEN a GitHub commit SHA és a CI állapota visszaolvasható.

## 7. Tesztterv

- Secret-scan: gitleaks a staged tartalomra, redactelt jelentéssel.
- Script-ellenőrzés: `add-mcp-config.ps1` tokenértékének hiánya és környezeti változó-felvétele statikus ellenőrzéssel.
- Dokumentáció: fájlok, YAML-frontmatter és whitespace ellenőrzése.
- Repo-kapu: `npm.cmd run verify` csak akkor, ha a módosítás a futási kódot érinti; dokumentációs szeletnél célzott `git diff --check` és skill-validáció elegendő.
- GitHub: PR CI és merge utáni commit/állapot visszaolvasása.

## 8. Kockázatok / visszavonási terv

- Kockázat: a token korábbi Git-történetben vagy külső rendszerben már kompromittálódott. Teendő: külön rotáció, history-tisztítás csak külön jóváhagyással.
- Kockázat: dokumentációs fájlok túl széles stage-elése. Teendő: explicit fájllista és staged diff review.
- Visszavonás: az új dokumentációs commit revertelhető; a script környezeti változós módosítása egyetlen commitban legyen.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-09-13-documentation-memory-hygiene-vegrehajtas.md`
