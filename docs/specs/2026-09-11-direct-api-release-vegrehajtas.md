# Kiadási végrehajtás

További review-végrehajtás: ocr.ts és one-step.ts kapcsolódását studioConnection-re cserélni; normalizált modellel küldeni, nem-OpenRouter reasoning mezőt kihagyni. step-runner hibaágában a meglévő stepErrorMessage használata, konkrét Rate limit assertion visszaállítása. Render deklarációs teszt XAI kiegészítése, OCR/scope hiányzó saját kulcs regresszió, teljes verify és új CI.

Review-javítás: fixConceptOnLesson elején resolveDeps után feloldani az author/lektor modellt, mindkét keyConfigured eredményt ellenőrizni a lazy DB import előtt. A későbbi duplikált ellenőrzést/feloldást eltávolítani. Injektált függőségekkel tesztelni, hogy hiányzó kulcsnál providerFactory nem fut. Célzott teszt, típusellenőrzés, lint, majd új head CI.

1. git status/fetch; source/generation-release-preflight.local.mts olvasási próba. Aktív munka hiányának ellenőrzése.
2. Render API: kizárólag websuli-api-eu szolgáltatás beazonosítása repo és név alapján; OpenAI/xAI ENV régi érték titkosított helyi mentése, saját kulcsok beállítása egyenként, visszaolvasás összehasonlítással. Régi deploy ID mentése, titokmentesen.
3. npm.cmd run verify. Spec commit, feature push, PR létrehozása, CI ellenőrzése. Csak zöld kapuk után merge.
4. Main fast-forward; generation-deploy-watch.local.mts merge SHA argumentummal. Ha nem indul automatikusan backend deploy, a Render deploy API használható a pontos commitra.
5. Nyilvános egészségellenőrzés és verzióazonosság. Eredmények, maradó korlátok rögzítése. Éles adatállapotot kizárólag olvasni.
