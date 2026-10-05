# Végrehajtás — S3 katalógus-bank
1. `migrations/0022_subject_catalog.sql` + `shared/schema.ts` táblák (drizzle), additív.
2. `server/catalog/verify.ts`: `verifyItem(item) → { ok, problems }` a meglévő őrökkel.
3. `server/catalog/bank-rows.ts`: `toBankRows(items, classifications) → rows` (öröklött tantárgy, státusz-szabály,
   lenyomat-összevonás, bizalmi szint), tiszta függvény.
4. `scripts/catalog/import.mts`: dry-run / write; tranzakció; upsert ON CONFLICT (subject, fingerprint) — az admin-státuszt
   (`rejected`, kézi `active`) nem írja felül.
5. `server/catalog/admin-routes.ts` + bekötés az admin routerbe (csak olvasó): summary, review.
6. Tesztek: verify (mért minták), bank-rows (öröklés, státusz, összevonás, bizalmi szint), admin-route forrás-ellenőrzés.
