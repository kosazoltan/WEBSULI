# Napi emlékeztető: tiszta téma és próbalevél — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-emlekezteto-probalevel.md`. Munkakönyvtár: `source/`.

1. **`shared/daily-reminder.ts`:** `export function displayTopic(label: string | null | undefined): string | null`:
   - `\s*\(OH-[A-Z0-9-]+\)` törlése;
   - `—\s*\.\s*` → `— `;
   - a vezető `. ` törlése;
   - szóközök összevonása, trim;
   - üresnél `null`.
2. **`server/daily-reminder.ts`:**
   - a `planDailyReminders` a `topic` mezőt `displayTopic`-kal tölti;
   - új `sendTestReminder(to: string, now: Date)`: a mai terv első tétele (ha nincs, a legújabb anyag „Próba” névvel);
     tárgy: `[Próba] ` + `reminderSubject`; címzett a paraméter; nem ír a `daily_reminder_emails`-be.
3. **`server/routes.ts`:** `POST /api/admin/daily-reminders/test` (`isAuthenticatedAdmin`).
   - A címzett: `req.user.email`; ha nincs, 400.
   - A válasz: `{ ok: true, studentName, title }`.
4. **`client/src/components/DailyReminderCard.tsx`:** „Próbalevél nekem” gomb (`button-daily-reminder-test`), sikerüzenet a
   címmel.
5. **`client/src/components/UserFileList.tsx`:** a „Most tanuljuk” jelvény `title`-je `displayTopic(file.curriculum?.label)`.
6. **Tesztek:**
   - `tests/daily-reminder.test.ts`: `displayTopic` esetei (OH-kód, „— .”, null);
   - `tests/daily-reminder-db.integration.ts`: a `sendTestReminder` egy levelet küld a megadott címre „[Próba]” tárggyal, a tábla
     sorszáma nem változik;
   - `tests/daily-reminder-admin.spec.ts`: a próbagomb POST-ot küld és sikert mutat.
7. **Ellenőrzés:** `tsc`, `check:test`, `eslint`, `npm.cmd test`, `test:learning-db`, `playwright test tests/daily-reminder-admin.spec.ts`.
