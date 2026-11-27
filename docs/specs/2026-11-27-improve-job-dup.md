# IMPROVE-JOB-DUP — terv (2026-11-27)

Cél: egy tananyagra egyszerre legfeljebb egy javítás-job fusson. Forrás: review #640 (sourcery), feladat-DB `IMPROVE-JOB-DUP`.

Hatókör: `server/storage.ts` (`createImprovedHtmlFile` atomikus foglalás), `server/improveAsync.ts` (a hívó a foglalás eredményéből ad 409-et).
Nem cél: a job-futtatás, az előnézet és az alkalmazás változatlan.

Kockázat: a lejárt `processing` sor kezelése (15/60 perc) nem változhat — a zár alatt ugyanaz a szabály.
Végrehajtás: `docs/specs/2026-11-27-improve-job-dup-vegrehajtas.md`.
