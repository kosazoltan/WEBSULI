# Tanulói profil — S4 Admin — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-tanuloi-profil.md` (5. döntés). Előfeltétel: S1–S3. Munkakönyvtár: `source/`.

## 1. Migráció `migrations/0033_learner_alerts.sql`
`ALTER TABLE learners ADD COLUMN IF NOT EXISTS inactivity_alerted_at timestamptz` (egy inaktivitási időszakra egy riasztás).
A Drizzle `learners.inactivityAlertedAt`.

## 2. `shared/learner-report.ts` (tiszta + teszt)
- **`LearnerReport`:** `{ name, grade, lastActive, activeDays7, views7, results }`, ahol a `results` legfeljebb 10 elem:
  `{ title, percent, at }`.
- **`isInactive(lastActive, now, isSchoolDay)`:** igaz, ha az utolsó 3 tanítási napon (a mait is beleértve, budapesti naptár szerint)
  nem volt tevékenység.
  - Tanítási nap nélküli időszak (szünet) nem számít.
  - Ha soha nem volt tevékenység, `lastActive = null`, igaz.
- **`shouldAlert(lastActive, alertedAt, inactive)`:** inaktív, és még nem riasztottunk ennek az időszaknak a kezdete óta.
  Az időszak kezdete az `alertedAt > lastActive`, vagy nincs aktivitás és van `alertedAt`.
- **`weeklySummaryHtml(reports, weekLabel)` / `inactivityAlertHtml(report)`:** minden szöveg escape-elve, a tárgy névvel.

## 3. Szerver
- **`server/learner-reports.ts`:**
  - **`buildLearnerReports(now)`:** tanulónként a `learner_activity` aggregálása (utolsó aktivitás, 7 napos aktív napok,
    megtekintések, az utolsó 10 eredmény).
  - **`runWeeklySummary()`:** egy levél az adminoknak (`resolveAdminRecipients`, `sendAdminNotification` csendes módban).
  - **`runInactivityAlerts()`:** tanítási napon tanulónként `shouldAlert`, egy levél, majd `inactivity_alerted_at = now`.
  - **`pruneLearnerActivity()`:** a 365 napnál régebbi sorok törlése.
  - **`setupLearnerReports()`:** csak élesben.
    - `0 18 * * 0`: heti összefoglaló;
    - `0 18 * * 1-5`: riasztás és törlés.
    - Időzóna: Europe/Budapest.
    - Hívás: `index.ts`, a `setupDailyReminders` mellől (e2e-ben nem).
- **Admin végpontok** (`isAuthenticatedAdmin`):
  - **`GET /api/admin/learners`:** tanulónként `{ id, name, grade, emails, report, pairLink }`. A `pairLink` a `getBaseUrl()/?t=<token>`.
  - **`POST /api/admin/learners/:id/rotate`:** `rotateLearnerToken`, és az új `pairLink`.
  - **`POST /api/admin/learners/weekly-summary`:** a heti összefoglaló azonnali próbája az adminoknak.

## 4. Kliens
- **`client/src/lib/admin-tabs.ts`:** új fül a „Kommunikáció” csoportban: `{ value: "learners", label: "Tanulók", icon: UserRound }`.
  - **Dokumentált spec-változás:** a `tests/admin-korszerusites.test.ts` fülszáma 15-ről 16-ra módosul.
- **`client/src/components/LearnersPanel.tsx`:** tanulónként egy kártya.
  - **Tartalom:** név, évfolyam, utolsó aktivitás, 7 napos aktív napok, megtekintések, az utolsó eredmények (cím, %, dátum).
  - **Gombok:**
    - „Párosító link másolása” (vágólap);
    - „Párosítás visszavonása” (megerősítés után rotate);
    - a panel tetején „Heti összefoglaló most”.
- **`admin.tsx`:** `<TabsContent value="learners">`.

## 5. Tesztek
- **`tests/learner-report.test.ts`:**
  - `isInactive`: hétvégén átívelő 3 tanítási nap, szünet, soha nem aktív;
  - `shouldAlert`: egyszer, új aktivitás után újra élesedik;
  - HTML-escape a nevekben és a címekben.
- **`tests/admin-korszerusites.test.ts`:** 16 fül (spec-változás, lásd fent).

## 6. Ellenőrzés
- `check`, `check:test`, `lint`, `test`, `build`.
- A migráció eldobható Postgresen.
- **Élesítés után:**
  - a „Tanulók” fül böngészőben megjelenik (admin munkamenet nélkül csak a 401 / 403 ellenőrizhető: `GET /api/admin/learners`);
  - a heti összefoglaló próbája nem futtatható engedély nélkül (levél) — NOT RUN, ha nincs kifejezett kérés.
