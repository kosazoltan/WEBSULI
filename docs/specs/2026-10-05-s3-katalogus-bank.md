# S3 — Gépi ellenőrzés, bizalmi szint és tárolás: tantárgyi katalógus-bankok (2026-10-05)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` (S3). Tulajdonosi döntések: a régi anyag szülő-ellenőrzött (`parent_verified`),
a fúziós gép-ellenőrzött (`pipeline_verified`); a gépi ellenőrző JELÖL, nem dob ki; a jelölt (`flagged`) tétel admin-átnézésig
szó szerint NEM vehető át; minden tantárgy és ág külön bank.

## Cél
1. Migráció `0022_subject_catalog.sql` (additív, `IF NOT EXISTS`):
   - `catalog_lessons`: provenance (pk), cím, évfolyam, tantárgy, mellék-tantárgyak, témakör, téma, lecketípus,
     besorolás-státusz (`agreed` / `review` / `unclassified`), jelöltek, modellek, besorolva-időpont, admin-döntés.
   - `catalog_items`: id, `subject` (bank-kulcs), grade, topic_area, topic, lesson_type, kind, prompt, body, options,
     correct_index, accepted, keyword_groups, steps, pair, concept_ids, provenance, trust, `status` (`active` / `flagged` /
     `review` / `rejected`), checks, fingerprint; egyediség: (subject, fingerprint). A lecke besorolásától öröklik a tantárgyat.
2. `server/catalog/verify.ts` (determinisztikus, meglévő őrök): kvíz → `singleChoiceProblems` + szerkezet (kulcs-tartomány,
   opció-egyediség); minden szöveg (kérdés, opciók, minta, magyarázat, lépések) → `falseArithmeticClaims`; rövid válasz tiszta
   számtani kérdéssel → a kiszámolt érték az elfogadottak közt. Hiba → `status: flagged`, `checks` = a leletek.
3. Státusz-szabály: `agreed` besorolású lecke tételei `active` (vagy `flagged`); `review` / `unclassified` lecke tételei
   `review` (bank-tagság az admin döntéséig nincs).
4. `scripts/catalog/import.mts`: `.catalog/<dátum>-items.json` + `docs/measurements/<dátum>-classify-all.json` → DB, egy
   tranzakcióban, idempotens upsert (subject, fingerprint); `--dry-run` alapértelmezett (csak összesít), `--write` ír.
5. Admin-olvasó API (`GET /api/admin/catalog/summary`, `GET /api/admin/catalog/review`) — bankonkénti darab státusz szerint,
   az átnézendő leckék és jelölt tételek listája. (Az admin-döntő felület külön szelet.)

## Nem-cél
A katalógus felhasználása a gyártásban (S6); tantárgyi skillek (S4); admin-döntő UI.

## Edge case-ek
Ugyanaz a tétel több leckében → egy sor (subject, fingerprint), több provenance (`provenances` tömb); fúziós és régi tétel
azonos lenyomattal → a magasabb bizalmi szint marad (`parent_verified` > `pipeline_verified`); új futás → upsert, az admin
döntése (`rejected` / `active`) nem íródik felül.

## Elfogadás (EARS)
- A migráció additív és idempotens (kétszer futtatva hibátlan).
- A gépi ellenőrző a mért hibás mintákon jelöl (pl. „96 : 11 = ? (hányados)” helyes kulcsa 8; hamis egyenlőség a mintában), a
  helyes tételen hallgat; a szülő-ellenőrzött korpuszon a jelölt arány riportolva (várhatóan ~1%).
- `--dry-run` a teljes korpuszon: bankonkénti darab, jelölt, átnézendő; `--write` után a DB-számok egyeznek a dry-runnal.
- Teljes unit, tsc, lint zöld.
