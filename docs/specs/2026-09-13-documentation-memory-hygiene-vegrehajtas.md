# Végrehajtási utasítás: dokumentáció-, memória-, skill- és fájlhigiénia

## Fázis 1 — inventory és biztonsági határ

1. Ellenőrizd a `git status --short`, aktuális ág, HEAD és remote állapotát.
2. Készíts explicit jelöltfájllistát: a WEBSULI-scope-ú untracked handoff/spec fájlok, a már követett `docs/`, `memory/`, `.agents/skills/` és az új exportfájlok.
3. Tartsd kizárva a globális session-transcriptet, `.codex/`-ot, `tmp/`-t, backupokat, `.env`-ket, OAuth-fájlokat, MCP-konfigurációt és más projektek memóriáját.
4. Futtass gitleaks inventoryt; a találatokból csak fájlútvonalat, sort és szabályazonosítót írj ki, titokértéket soha.

## Fázis 2 — secret-safe és memória-export

5. Az `add-mcp-config.ps1` fájlban szüntesd meg a beégetett API-token értékét. A script ellenőrizze, hogy a `HOSTINGER_API_TOKEN` környezeti változó jelen van, és abból írja a lokális Cursor-konfigurációt; a hiányzó változó adjon biztonságos, magyar hibaüzenetet.
6. Készíts `docs/security-secret-hygiene-2026-09-13.md` fájlt a talált típusokról és a szükséges rotációról, értékek nélkül.
7. Készíts `memory/projects/websuli/session-export-2026-09-13.md` fájlt a jelenlegi WebSuli-scope-ú sessionállapotról: pipeline, tesztek, nyitott Egervár-futás, admin-blokkoló, deploy-SHA, valamint a forrásfájlokra mutató hivatkozások.
8. Készíts `memory/projects/websuli/runtime-document-manifest.yaml` fájlt, amely felsorolja a QMD/IAM/COGNI/SOUL/RUNBOOK/MEMORY/KANBAN/SKILL dokumentumokat, az admin API forrását, az export állapotát és a 401-es hozzáférési korlátot. Élő tartalmat ne találj ki.
9. A memória-exportban ne szerepeljen személyes e-mail-cím, token, jelszó, session JSONL, nyers modellválasz vagy más projekt állapota.

## Fázis 3 — dokumentáció stage-elése és review

10. Stage-eld csak az explicit jelöltfájlokat: az új dokumentumokat, a korábban untracked WEBSULI-handoff/spec fájlokat és a script javítását. Ne stage-eld a `.codex/`, `tmp-e2e-*`, backup, `.env` vagy OAuth-fájlokat.
11. Nézd át a `git diff --cached --stat` és `git diff --cached` kimenetét; titokgyanús vagy más projekthez tartozó tartalom esetén állj meg és vedd ki a stagingből.
12. Futtasd: `git diff --cached --check`, célzott YAML/frontmatter-ellenőrzés, skill-validáció és gitleaks staged scan.
13. Futtasd a script statikus ellenőrzését úgy, hogy tokenérték ne legyen beállítva vagy kiírva; ellenőrizd a hiányzó változó hibáját és a hivatkozás meglétét.

## Fázis 4 — commit, push, PR/merge és visszaolvasás

14. Készíts egyetlen, leíró commitot a megtisztított dokumentációs és script-változásokról; ne használj `--no-verify` kapcsolót.
15. Pushold a feature ágat `origin`-ra, majd hozz létre PR-t a main felé a diff és a biztonsági határ összefoglalásával.
16. Várd meg és olvasd vissza a PR összes kötelező CI-ellenőrzését. Bukás esetén a konkrét okot javítsd, ne gyengítsd a tesztet.
17. Zöld CI után merge-eld a PR-t, frissítsd a lokális `main` ágat fast-forward módon, és olvasd vissza a merge-SHA-t.
18. Ellenőrizd az éles `/api/health` revízióját, de ne állítsd késznek az Egervár-tananyag futását: az külön adminos pipeline-feladat marad.
19. A záró handoffba írd bele: módosított fájlok, commit/PR/merge SHA, tesztek, gitleaks állapot, NOT RUN/BLOCKED pontok és a tokenrotáció nyitott kockázata.
