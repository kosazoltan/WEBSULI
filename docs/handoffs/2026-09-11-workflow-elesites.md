# Átadás — közös tananyag-folyamat élesben

Ez a jegyzet a `2026-09-11-web-research-javitas.md` korábbi kiadási állapotát frissíti. A PR #56 és a PR #57 is merge-ölve és élesítve van. A korábbi angolleckét nem kell újragenerálni.

## Ellenőrzött kiadás

- [PR #57](https://github.com/kosazoltan/WEBSULI/pull/57), merge: `5b23efec23e7670745aa3afb9ca19ff6477329e1`, 2026-09-11 18:47:11 UTC.
- Frontend és backend egyaránt ezen a verzión: 18:48:56 UTC, `tmp/generation-diagnosis/deployment-evidence.json`.
- Éles visszaolvasás: 18:49:21 UTC, `tmp/workflow-production/release-readback.json`.
- Az 0019 migráció, a futásnapló tíz oszlopa, tulajdonosi indexe és kaszkád idegen kulcsa, valamint az új HTML baseline mező ellenőrizve. 177 tárolt tananyag. Az ellenőrzés nem írt éles adatot.
- Nyilvános főoldal és health: HTTP 200. Névtelen futásnapló-lekérés: HTTP 401.
- Helyi main a merge commiton; ismeretlen `.codex/` és `tmp-e2e-b7c2d*.txt` fájlok megőrizve. A handoffok helyi, untracked dokumentumok.

## Használat

[Admin → Futások](https://websuli.vip/admin?tab=workflows), mobilon az Anyagok menüből is elérhető. A készítő és javító felületeken ugyanaz a futásnézet látható.

A hét mód: forrásfeltöltés, Studio-készítés, internetes készítés, teljes leckejavítás, célzott fogalomjavítás, HTML-okosítás, javítás alkalmazása. A gépi lépésvédelmek és az ábra közös verziózott leírást használnak. A lépésre kattintva a tényleges idő, próbálkozás, hiba, elérhető tokenmérés és mentett eredmény felhasználása látható. A saját utolsó 50 futás újratöltés után is visszanézhető.

A kész javítójelölt alkalmazásra vár; csak a visszaolvasott tananyag jelölhető közzétettnek. Sikertelen webes futás teljes, ellenőrzött mentett eredményénél a „Folytatás a mentett eredményből” gomb új AI-hívás nélkül folytat. Hiányzó vagy hibás mentett eredményre ez nem ajánlható fel.

## Módosítások helye

- Szerződés: `source/shared/lesson-workflow.ts`.
- Végrehajtás, tulajdonosi napló és API: `source/server/workflows/`.
- Ábra: `source/client/src/components/studio/WorkflowGraph.tsx`, `WorkflowMonitor.tsx`.
- Bekötések: Studio-útvonalak, `improveAsync.ts`, `storage.ts`, admin és készítő/javító panelek.
- Migráció: `source/migrations/0019_lesson_workflow_runs.sql`; közös HTML baseline: `source/server/improve/html-baseline.ts`, `source/shared/schema.ts`.
- Módszer: `docs/lesson-improvement.md`; terv és végrehajtás: `docs/specs/2026-09-11-lesson-workflow*.md`.

## Ellenőrzések

- PASS: `npm.cmd run verify` — typecheck, lint, teszt-typecheck, 1151 unit teszt, build.
- PASS: `npm.cmd run test:learning-db` — 15 eset eldobható PostgreSQL 17-en; migráció kétszeri futtatása, konkurencia, elavult/lejárt végrehajtó írásának visszagörgetése, valós mentés, egyszeri alkalmazás, tulajdonos törlése, változott eredeti HTML megóvása.
- PASS: célzott Playwright — 9 eset valódi Chrome és React felület, szintetikus API-válaszokkal; 320/390/844/1440 px, hét mód, kontraszt, túlcsordulás, újratöltés, jelöltváltás és mentett webes eredmény folytatása.
- PASS: PR #57 végleges CI, [34634279093](https://github.com/kosazoltan/WEBSULI/actions/runs/34634279093), 150 böngészős teszt.
- PASS: az új éles felületen a meglévő nyilvános angollecke négy lapja 390×844, 844×390 és 1440×900 méretben; nulla JavaScript-hiba és nulla vízszintes túlcsordulás. Bizonyíték: `tmp/web-research-diagnosis/live/render-evidence.json` és képernyőképek.
- PASS: merge utáni főági CI [34635244954](https://github.com/kosazoltan/WEBSULI/actions/runs/34635244954), 151 böngészős teszt (5,2 perc), lint/typecheck és unit is sikeres.
- PASS: a tulajdonos belépése után az éles admin és a valódi feltöltés Computer Use-zal, a Codex beépített böngészőjében. Szándékosan hibás PDF: csak a forráslépés futott és megállt, későbbi lépések nem indultak, nincs publikált eredmény. Újratöltés után ugyanaz a napló és hiba látható. Három vizsgált ablakméret (390×844, 844×390, 1440×900) DOM-mérése: nulla vízszintes túlcsordulás; az eredeti nézet visszaállítva. Az IAB méretfelülírásos képkimenete hibás skálázást mutatott, ezért a vizuális bizonyíték az eredeti IAB nézet és a külön Chrome-tesztek, a méretfelülírásos képekre nem alapozunk grafikai állítást.
- PASS: ugyanezen valódi futás közvetlen, csak olvasási adatbázis-ellenőrzése 18:57:09 UTC-kor. Egy hibás source-lépés, nincs mentett AI-válasz, 177 tananyag, nulla új tananyag. `tmp/workflow-production/authenticated-readback.json`.

## Korlát és folytatási pont

A tulajdonos belépett, így az éles adminpróba elkészült. Normál böngészőmunkamenetet használtunk; nincs létrehozott vagy jogosultságot megkerülő tesztmunkamenet. A legutóbbi hibás PDF-futás szándékos tesztadat, nem egy valódi tananyag gyártási kudarca. Mind a hét mód fizetős éles gyártása NOT RUN; a módok regressziója izolált szolgáltatói válaszokkal futott.

Ez nem automatikus munkasor. A megölt, még be nem fejezett AI-kérés nem indul újra magától; kész részeredménye és naplója megmarad. A kiadás előtti napló nélküli futásokra nem készül kitalált történet. Régi, baseline nélküli HTML-javítójelöltek történeti frissessége nem bizonyítható.

A következő rendes tananyaggyártásnál az új Futások nézetből követhető a teljes készítés és az eredmény. Előbb friss Git/verzió/futásállapot szükséges; a már elkészült leckét ne generáld újra csak tesztelés miatt.

## Visszaállás

Kiadás előtti kód: `ec994674fbbf73cde409435c8944fd61243367f7`. Ellenőrzött pg_dump archívum: `tmp/generation-diagnosis/before-generation-2026-09-11T18-37-19-526Z.dump`, 6341085 bájt, 37 tábla; `pg_restore --list` PASS. Ez archívum-olvashatósági ellenőrzés, nem új teljes restore-próba. Kódvisszaállításkor az additív tábla és baseline oszlop megmaradhat; adatot nem törlünk. Éles `.env` mellett a teljes helyi szervert ne indítsd diagnózis céljából, mert az induló feladatkezelők éles állapotot módosíthatnak.
