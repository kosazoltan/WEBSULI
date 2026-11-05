# Napi emlékeztető — a „review #292” integrációs teszt javítása (2026-11-05)

## Mért hiba

`source/tests/daily-reminder-db.integration.ts` „review #292: a sikertelen küldés anyaga nem számít ismétlésnek” teszt
minden futáskor bukik (`npm run test:learning-db`; a CI ezt a csomagot nem futtatja, ezért nem látszott).
Naplózással mérve a tanuló sorai: 10-19 rem-a sent, 10-20 rem-b sent, **10-21 rem-a sent**, 10-22 rem-a pending,
11-03 rem-a failed, 11-04 → rem-b. A 11-04-i futás 14 napos ismétlés-tiltó ablaka (`RECENT_DAYS`) 10-21-ig ér vissza,
így a fájl egy korábbi tesztjének valódi 10-21-i rem-a kiküldése jogosan ismétlésnek számít. A kód helyes
(csak a `sent` sor számít); a teszt napjai rosszak.

## Cél / nem-cél

- Cél: a teszt napjai (11-09 hétfő, 11-10 kedd, mindkettő tanítási nap) a korábbi kiküldések ablakán kívül esnek,
  így a teszt valóban azt méri, hogy a sikertelen küldés nem számít ismétlésnek.
- Nem-cél: a `server/daily-reminder.ts` logikája, a `RECENT_DAYS` és az elvárás (`a meg nem kapott anyag nem marad ki`)
  nem változik. Érintett fájl: csak a teszt.

<!-- acceptance-checklist -->
- [x] A1: `npm run test:learning-db` — a teszt PASS.
- [x] A2: ha a sikertelen sor is ismétlésnek számítana (a `status = 'sent'` szűrő nélkül), a teszt bukik.
