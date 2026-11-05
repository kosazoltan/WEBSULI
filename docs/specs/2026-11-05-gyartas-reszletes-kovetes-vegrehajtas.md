# Végrehajtás — futó gyártás részletes követése (2026-11-05)

Terv: `2026-11-05-gyartas-reszletes-kovetes.md`.

1. Szerver: az `ownerDrafts` `osr` laterális lekérdezése adja vissza `r.id AS run_id`-t; `OwnerDraft.runId?: string`.
2. Szerver: `GET /lessons/one-step/active` a `/lessons/one-step/:runId` ELŐTT: a belépett admin legutóbbi, egy órán belül
   frissült, le nem zárt (`phase` nem done/error/parked/draft) egylépéses futása, amelynek workflow-sora az övé és
   `running`/`waiting`; válasz `{ runId: string | null }`.
3. Kliens `SourceUploadForm`: exportált `ONE_STEP_RUN_STORAGE_KEY`; `persistRun` módban, ha nincs követett futás,
   egyszer lekéri az aktív futást és rácsatlakozik.
4. Kliens `DraftLessons`: `onOpenStudio?: () => void` prop; tételenként „Teljes készítési sor” blokk
   (`WorkflowMonitor id={runId ?? jobId}`), futónál nyitva; futónál „Vissza a készítéshez” gomb (tárolóba írja a runId-t,
   majd `onOpenStudio`).
5. `admin.tsx`: `AdminFilesTab` → `DraftLessons onOpenStudio={() => setActiveTab("lesson-studio")}`.
6. Teszt: az e2e a futó tételen a folyamatábrát és a visszalépést ellenőrzi; a „futó tételen 0 gomb” állítás pontosítva
   „nincs folytatás/törlés gomb”-ra (dokumentált spec-változás: a futó tételen új navigációs gomb van).
7. Ellenőrzés: `npm run check`, célzott e2e, render 322/344/412/690/744/836/860 px.
