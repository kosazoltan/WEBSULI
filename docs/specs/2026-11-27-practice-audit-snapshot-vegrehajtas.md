# PRACTICE-AUDIT-SNAPSHOT — egy pillanatkép a csak olvasó mérésekben (végrehajtás, 2026-11-27)

Forrás: review #640 (sourcery) — a `practice-audit.mts --db` a leckéket és a játékkvíz-sorokat két külön SELECT-tel olvassa
egy `BEGIN READ ONLY` (alapértelmezett READ COMMITTED) tranzakcióban; a két lekérdezés között közzétett lecke / bankfrissítés
miatt a jelentés régi leckeadatot új játéksorokkal keverhet.

## Döntés

A közös csak olvasó segéd (`source/scripts/lib/read-only-db.ts`, `withReadOnlyDb`) `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`
tranzakciót nyit: a tranzakció összes lekérdezése ugyanazt a pillanatképet látja. Ez minden mérő / kinyerő szkriptre érvényes
(nincs szkriptenkénti eltérés); írást továbbra sem enged, a végén ROLLBACK. PostgreSQL-ben a REPEATABLE READ csak olvasó
tranzakció nem kap sorosítási hibát.

## Elfogadás

- RED: a `read-only-db-snapshot` teszt a régi `BEGIN READ ONLY` nyitáson bukik.
- A `withReadOnlyDb` a közös `READ_ONLY_BEGIN` konstanssal nyit; a `withWriteTransaction` változatlan.
- Élő ellenőrzés: `practice-audit.mts --db` lefut (csak olvasó).
