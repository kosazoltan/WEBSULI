# Ciklus 6b — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus6b-felirat-takaritas-hatokor.md`.

1. **`server/routes.ts` `/dev/:id`:** `webLessonQualityNotice` csak `req.user?.isAdmin` esetén (`showQualityNotice(user)` segéd).
2. **`server/studio/legacy-migration.ts`:** `discardSupersededDrafts(htmlFileId, keepJobId)` — a kész döntés után; a `legacyCandidates`
   és a jelölt-lekérdezés nem szűr a `LEGACY_CUTOFF`-ra (a konstans történeti, a teszt rögzíti).
3. **Teszt:** `tests/ciklus6b-felirat-takaritas.test.ts` (`showQualityNotice`); a `regi-anyag-studio` jelölt-tesztje a határnap utáni
   anyagot is jelöltnek várja (dokumentált spec-változás).
4. **Review #358:** `LEGACY_SCOPE_END` (2026-10-21 15:00 Budapest) — a később feltöltött HTML nem kerül a sorba (jelölt + lekérdezés);
   a takarítás minden körben fut (`supersededDraftCondition`, idempotens, újrapróbálható, a korábban kész elemekre is), az élő bérletű /
   újragyártott job érintetlen, a beragadt „running” job is elvetődik; a route döntése `qualityNoticeFor(user, html)`, a teszt ezt hívja.
