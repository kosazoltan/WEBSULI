# Napi tananyag-emlékeztető — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-napi-emlekezteto.md`. Munkakönyvtár: `source/`. Ág: `feat/napi-emlekezteto`.

## 1. Közös tiszta logika
- **`shared/curriculum-order.ts`:**
  - ide költözik a `client/src/lib/curriculum-order.ts` tartalma;
  - a kliensfájl `export * from "@shared/curriculum-order";` lesz (a meglévő importok változatlanok).
- **`shared/school-calendar.ts`:** `export function isSchoolDay(date: Date, years = SCHOOL_YEARS): boolean` — tanévben, tanítási
  napon igaz.
- **`shared/daily-reminder.ts`:**
  - `firstNameOf(full)`: magyar sorrend, a második tag; egytagú névnél maga a név;
  - `pickDailyMaterial(files, grade, today, recentIds)`: az évfolyam anyagai `curriculumSort` szerint, a `recentIds` kimarad;
    ha mind kimaradna, a legelső; anyag nélkül `null`;
  - `reminderSubject(first, title)`;
  - `reminderHtml({ first, title, topic, url, motivation })`: HTML-escape-elt mezők.
  - A lelkesítő mondatok a `shared/motivation.ts`-be költöznek, a `client/src/lib/learner.ts` innen importál.
- **Teszt:** `tests/daily-reminder.test.ts` — keresztnév, választás (tanmenet-sorrend, ismétlés kerülése, tartalék, évfolyam
  nélkül `null`), `isSchoolDay` (hétköznap, hétvége, őszi szünet, nyár), HTML-escape.

## 2. Adat
- **`migrations/0031_daily_reminders.sql`** (additív, idempotens):
  - `ALTER TABLE extra_email_addresses ADD COLUMN IF NOT EXISTS student_name varchar(80);`
  - `CREATE TABLE IF NOT EXISTS daily_reminder_emails` (`id`, `email`, `day date`, `material_id`, `status`, `attempts`, `error`,
    `sent_at`, `created_at`), egyedi index: `(email, day)`.
- **`shared/schema.ts`:** a `studentName` mező és a `dailyReminderEmails` tábla.
- **`server/storage.ts`:** `updateExtraEmailStudentName(id, name | null)`.

## 3. Küldés
- **`server/daily-reminder.ts`:**
  - `setReminderSender(fn)` a tesztekhez; alapértelmezésben Resend (`getResendClient` / `isResendConfigured`, `email_logs`);
  - `planDailyReminders(now)` → `[{ email, studentName, grade, material, url }]`:
    - címzettek: aktív cím, van név, van évfolyam;
    - anyagok: `storage.getAllHtmlFiles()` + `withCurriculum`;
    - az utolsó 14 naptári nap (kb. 10 tanítási nap) anyagai a `daily_reminder_emails`-ből;
  - `runDailyReminders(now)`:
    - nem tanítási napon `{ skipped }`;
    - címenként: `INSERT … ON CONFLICT (email, day) DO UPDATE … WHERE status = 'failed' AND attempts < 2 RETURNING`; ha nincs
      sor, kihagyás; majd küldés, és a státusz `sent` / `failed`;
  - `setupDailyReminders()`: `cron.schedule("45 6 * * 1-5", …, { timezone: "Europe/Budapest" })`, csak ha
    `NODE_ENV === "production"`.
- **`server/index.ts`:** a többi ütemező mellett `setupDailyReminders()`.

## 4. Admin
- **Végpontok** (`server/routes.ts`):
  - `GET /api/admin/daily-reminders/preview` → `planDailyReminders(new Date())`, az e-mail kitakarva;
  - `POST /api/admin/daily-reminders/run` → `runDailyReminders(new Date())`;
  - `PATCH /api/extra-emails/:id/student` (admin) `{ studentName: string | null }`: trim, legfeljebb 80 karakter, üres → `null`.
- **`client/src/components/ExtraEmailsManager.tsx`:**
  - soronként tanulónév (megjelenítés + szerkesztés);
  - „Mai emlékeztetők” kártya: előnézet (tanuló · évfolyam · anyag) és „Küldés most” gomb megerősítéssel.

## 5. Tesztek
- **`tests/daily-reminder.test.ts`:** az 1. pont esetei, és statikus őr: a cron `Europe/Budapest` időzónával, csak éles
  környezetben indul.
- **`tests/daily-reminder-db.integration.ts`** (eldobható Postgres, a `lesson-result-email-db.integration.ts` mintájára):
  - két futás egy napon → egy levél címenként;
  - név nélküli cím nem kap levelet;
  - hétvégén nincs levél;
  - ismétlés kerülése a következő napon;
  - `failed` → újrapróba.

## 6. Verifikáció
- `tsc`, `check:test`, `eslint`, `npm.cmd test`, `build`, integrációs teszt eldobható DB-n.
- **Deploy után:**
  - a migráció kész (oszlop és tábla megvan, csak olvasó lekérdezéssel ellenőrizve);
  - név-beállító szkript (6 cím, a tulajdonos kérésére);
  - admin előnézet: 6 tervezett levél, helyes évfolyammal.
