# Végrehajtás — napi emlékeztető teszt (2026-11-05)

Terv: `docs/specs/2026-11-05-napi-emlekezteto-teszt.md`.

1. `source/tests/daily-reminder-db.integration.ts`: a „review #292: a sikertelen küldés…” teszt `day1` / `day2`
   dátuma `2026-11-09T06:00:00Z` / `2026-11-10T06:00:00Z`; a `failedRow` keresése `day === "2026-11-09"`.
   Ellenőrzés: `npm run test:learning-db` → a teszt `ok`.
2. Ellenpróba: a `server/daily-reminder.ts` `eq(dailyReminderEmails.status, "sent")` szűrőjét ideiglenesen eltávolítva
   a teszt `not ok`; utána visszaállítva. Ellenőrzés: `git diff --stat` csak a tesztfájlt és a két docot mutatja.
