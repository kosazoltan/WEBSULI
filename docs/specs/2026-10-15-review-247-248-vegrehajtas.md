# Review-követés #247/#248 — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-15-review-247-248.md`.

1. `server/studio/experience-builder.ts` `applyBankPacketRepair`: a jogosulatlan mezők (`extra`) visszaállnak az eredetire (hiányzó → törlés),
   a tétel nem kerül az `ignored` halmazba, és az `onIgnored` naplóz (R1).
2. `server/studio/lesson-pipeline-routes.ts`:
   - `HAS_NEWER_SAME_OWNER` SQL-töredék (az újabb job workflow-gazdája = `r.owner_id`), mindkét söprés lekérdezésében (R4).
   - `closeOrphanedOneStepRuns`: a nyitva hagyás feltétele `sweepDecision(row, now, true) !== "close"`, nem hibás/kész job, mentett és nem
     publikált lecke, nincs újabb saját gyártás (R2).
   - `applyResume`: az ORPHAN-ágon a `lessons.publishedAt` ellenőrzése, publikáltnál `WorkflowConflict` (R3).
   - `resumableDraftFor(mapId, instruction, owner)`: a kérés-egyezés és a gazda a lekérdezésben (R4);
     `supersedeDraftsOf(mapId, instruction, owner)`: csak `status = 'error'`, egyező kérés, saját gazda (R7).
   - `runOneStepCore(..., { offerDraft })`: piszkozatot csak a feltöltéses út (`runOneStep`) kínál; ott a `draft` → `WorkflowWaiting`;
     a `recordOneStepFailure` a `draft`-ot terminálisnak veszi (R5).
3. `client/src/components/studio/SourceUploadForm.tsx`: `remakeLock` szinkron zár; fájl nélkül a fájlválasztó nyílik, a választás végén
   (`picked`) magától indul a `forceNew` kérés (R6).
4. Tesztek:
   - `tests/bank-repair.test.ts`: azonos tétel, jogos és jogosulatlan mező együtt;
   - `tests/lesson-draft-db.integration.ts`: gazda, kérés-egyezés, félretevés hatóköre, újraindítás utáni nyitva hagyás (a fixtúrák a fájl végén törlődnek);
   - `tests/studio-generation-recovery.spec.ts`: fájl nélküli gombfelirat, dupla kattintás → 1 kérés.

## Review #250 (második kör)
5. A futásnézet (`oneStepRunView`) hiba- és draft-ágon visszaadja a job eredeti tanári kérését (`ownerInstruction`). Oldalfrissítés után a
   kliens ezt visszatölti az üres kérésmezőbe, így az újragyártás az eredeti kéréssel indul (R6 kiegészítés).
6. A függő újragyártás (`remakeAfterPick`) törlődik a fájlválasztó `cancel` eseményére, és akkor is, ha egy fájl sem olvasható be.
