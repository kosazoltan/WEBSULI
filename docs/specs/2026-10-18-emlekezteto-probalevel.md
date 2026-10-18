# Napi emlékeztető: tiszta tanmenet-téma és próbalevél az adminnak — terv

**Tulajdonosi kérés (2026-10-18, „Mindet kérem”):**
- a levél „Ezt tanuljátok most” sorából kerüljön ki a belső tanmenet-kód (pl. „(OH-MAT06TA)”);
- próbalevél a tulajdonos saját címére, hogy lássa, hogyan néz ki.

## Felmérés (kódból)
- **A téma** a tanmenet-illesztés címkéje (`server/curriculum/match.ts`): `"{terv címe}: {fejezet} — {óra}"`.
  - A terv címe tartalmazza az OH-kódot, pl. „Matematika 6. (OH-MAT06TA)”.
  - Az óra néha ponttal kezdődik, pl. „— . Anyagforgalom…”.
- **Resend:** a kulcs csak az éles szerveren van, helyből nem lehet levelet küldeni.

## Döntések
1. **`displayTopic(label)`** (`shared/daily-reminder.ts`):
   - kiveszi a zárójeles OH-kódot (`(OH-…)`);
   - összevonja a felesleges írásjeleket („— .”, kettős szóköz).
   - A levél, az admin előnézet és a nyilvános „Most tanuljuk” jelvény tooltipje is ezt használja.
2. **Próbalevél:** `POST /api/admin/daily-reminders/test` (admin).
   - A bejelentkezett admin saját címére küldi a mai terv első tételének levelét, „[Próba]” tárgyelőtaggal, bármely napon.
   - A tanulónak nem megy levél, és az ismétlésvédelmi táblába sem kerül.
   - Ha nincs terv, egy évfolyam nélküli mintaanyagot küld (a legújabb anyag).
   - Az admin kártyán „Próbalevél nekem” gomb indítja.

## Elfogadás (EARS)
- HA a téma OH-kódot tartalmaz, AKKOR a levélben és az előnézetben nem látszik.
- HA az admin a „Próbalevél nekem” gombot nyomja, AKKOR egy levél megy a saját címére, „[Próba]” előtaggal; a tanulók nem kapnak
  levelet, és a `daily_reminder_emails` tábla nem változik.
