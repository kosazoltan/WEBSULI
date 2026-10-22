# Új-lecke értesítő + ismétlés-only reggeli levél — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-22-uj-lecke-ertesito.md`.

1. **`source/server/daily-reminder.ts`:**
   - `runDailyReminders(now, { pauseMs?, repeatOnly? })`: `repeatOnly` esetén a terv `repeatPercent !== undefined` tételei.
   - A cron (6:45, 7:15) `repeatOnly: true`-val hív.
   - Új: `notifyNewLesson({ htmlFileId, title, classroom })` — aktív, nevesített címek az évfolyamon, személyes link, a reggeli levél
     sablonja „ÚJ TANANYAG” címkével, Resend-kímélő szünet, címenkénti hibatűrés.
2. **`source/shared/daily-reminder.ts`:**
   - `reminderHtml` opcionális `label`;
   - `newLessonSubject(first, title)`;
   - tiszta `newLessonRecipients(rows, classroom)`.
3. **`source/server/routes.ts` (előnézet):** a terv az ismétlés-tételekre szűrve.
4. **`source/server/studio/pipeline-store.ts` `publishLesson`:** az új `html_files` ágon `created: true`. A commit után, ha `created` és
   `NODE_ENV === "production"`: `void notifyNewLesson(...)` (dinamikus import, hiba → napló).
5. **Tesztek:**
   - a tiszta címzett-szűrés (évfolyam, név, aktív);
   - az új tárgy és címke;
   - a `repeatOnly` szűrő (tiszta segédfüggvény `repeatOnlyPlan`).
