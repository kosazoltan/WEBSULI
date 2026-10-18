# Tanulói profil — S5 Okos emlékeztető — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-tanuloi-profil.md` (6. döntés). Előfeltétel: S1–S4, a `learner_activity`. Munkakönyvtár: `source/`.

## 1. `shared/daily-reminder.ts` (tiszta + teszt)
- **`pickSmartMaterial(files, grade, today, recentIds, learner?)`:**
  - **Bemenet:** `learner = { seenIds: Set<string>, weak: Array<{ materialId, percent }> }`.
  - **Sorrend:**
    1. **Ismétlés:** a `weak` első olyan eleme, amelynek anyaga létezik, és nincs a `recentIds`-ben (az elmúlt 14 napban nem
       ment ki). Az eredmény `{ file, repeatPercent }`.
    2. **Tanmenet szerinti első, ami még nem ment ki és nem nyitotta meg:** `!recentIds && !seenIds`.
    3. **A régi viselkedés:** `pickDailyMaterial`.
  - **Tanuló nélkül:** változatlan (a régi viselkedés).
- **`reminderSubject(first, title, repeat?)`:** ismétlésnél `"<keresztnév>, ismételjük: <cím>"`.
- **`reminderHtml({ …, repeatPercent? })`:** ismétlésnél a címke „ISMÉTLÉS — MÚLTKOR N% LETT”, különben „A MAI TANANYAGOD”.

## 2. `server/daily-reminder.ts`
- **`planDailyReminders`:** a kapcsolt tanulók `learner_activity`-je egy lekérdezésben (az elmúlt 365 nap):
  - **`seenIds`:** a megtekintett és az eredményes anyagok;
  - **`weak`:** anyagonként a legutolsó eredmény, ha 70% alatti, és 7–30 napos, a legrégebbi elöl.
- **A `PlannedReminder`:** `repeatPercent?: number`.
- **A küldés:** a tárgy és a HTML ismétlésnél jelölt.
- **A címenkénti napi ismétlésvédelem** (`daily_reminder_emails`) változatlan.

## 3. Tesztek
- `tests/daily-reminder-smart.test.ts`:
  - az ismétlés elsőbbsége;
  - a nemrég kiküldött ismétlés kimarad;
  - a meg nem nyitott elsőbbsége;
  - minden látott → a régi viselkedés;
  - tanuló nélkül a régi viselkedés;
  - az ismétlés tárgya és címkéje (escape).

## 4. Ellenőrzés
- `check`, `check:test`, `lint`, `test`, `build`.
- Élesítés után az admin „napi emlékeztető előnézet” (`GET /api/admin/daily-reminders/preview`) olvasásos ellenőrzése; csak az
  admin munkamenetével, ha az nincs, NOT RUN.
