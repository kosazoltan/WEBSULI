# „Mai felfedezés” hírlevél — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-mai-felfedezes-hirlevel.md`. Munkakönyvtár: `source/`.

## S1 — adat és admin (ág: `feat/hirlevel-s1`)
1. **`migrations/0034_learner_newsletter.sql`:**
   - `ALTER TABLE learners ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}'`;
   - `ALTER TABLE learners ADD COLUMN IF NOT EXISTS newsletter boolean NOT NULL DEFAULT false`;
   - a `meta/_journal.json` bejegyzése a meglévő minta szerint.
2. **`shared/schema.ts`:** a két mező a `learners`-ben.
3. **`shared/newsletter.ts` (új):**
   - `NEWSLETTER_LIMITS = { tags: 8, tagChars: 40 }`;
   - `normalizeInterests(input: unknown): string[] | null`: tömb; trim; üres elhagyva; kis-nagybetűtől független egyediség;
     ≤ 8 címke, ≤ 40 karakter; vezérlőkarakter → null.
4. **`server/routes.ts`:**
   - a `GET /learners` válasza kiegészül: `interests`, `newsletter` (a `buildLearnerReports` adatából vagy külön lekérdezésből);
   - **`PATCH /learners/:id`** (az `adminRouter`-en, így admin és CSRF):
     - a `{ interests?, newsletter? }` törzs validálva: hibás → 400, ismeretlen tanuló → 404;
     - frissítés + `updatedAt`, válasz: `{ interests, newsletter }`;
     - a naplóba név és címke nem kerül.
5. **`client/src/components/LearnersPanel.tsx`:**
   - tanulónként egy szövegmező (vesszővel elválasztott érdeklődés) + kapcsoló („Napi felfedezés-hírlevél 16:00-kor”) +
     „Mentés” gomb;
   - `apiRequest("PATCH", …)`;
   - siker → a lista frissül, és toast.
6. **Tesztek:**
   - `tests/newsletter-interests.test.ts`: a `normalizeInterests` határesetei;
   - a route forrás-őre: `adminRouter.patch("/learners/:id"`;
   - migráció ↔ séma (a meglévő séma-összhang teszt, ha van).
7. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`, `npm test`, `build`;
   - az eldobható DB-n: migráció, majd `PATCH` → `GET` (a `learning-db` integrációs mintával vagy célzott szkripttel).

## S2 — gyártás és küldés (ág: `feat/hirlevel-s2`, az S1 után)
1. **`migrations/0035_learner_newsletters.sql`:** `learner_newsletters` tábla.
   - Mezők: `id`, `learner_id` FK cascade, `day date`, `status` (`pending` / `sent` / `failed` / `skipped`),
     `attempts int`, `article_url`, `article_title`, `material_id`, `error`, `created_at`.
   - Egyediség: `UNIQUE(learner_id, day)`.
   - A Drizzle-séma ugyanígy.
2. **`shared/newsletter-sources.ts`:**
   - `NEWSLETTER_DOMAINS` (az ellenőrzött magyar domainek, ≤ 100);
   - `isAllowedArticleUrl(url)`: https, a host egyezik a domainnel vagy annak aldomainje.
3. **`server/newsletter.ts`:**
   - **`pickArticle({ interests, grade, recentUrls, materials })` — két GPT-hívás:**
     1. **Keresés:** Responses `web_search`, `filters.allowed_domains = NEWSLETTER_DOMAINS`, HU, medium effort.
        - Utána `candidateUrls` → `isAllowedArticleUrl` szűrés → a `recentUrls` kizárása → `fetchPublicPage` (legfeljebb 6, 3
          párhuzamosan).
        - Megtartás: magyar (ő/ű/á/é jelenléte) és legalább 600 karakter szöveg.
     2. **Választás:** JSON, eszköz nélkül.
        - Bemenet: az érdeklődés + az évfolyam, a letöltött cikkek rövid kivonata (cím, URL, az első ~1500 karakter, ADAT) és
          az anyaglista (`id`, cím, téma; legfeljebb 60, a tanuló évfolyamáról).
        - Kimenet:
          `{ url, title, teaser (≤ 450 karakter, 2–3 mondat a gyerek nyelvén), question (≤ 160), materialId | null, ageAppropriate: boolean, reason }`.
     - **Validálás:**
       - az `url` a letöltöttek közül való;
       - `ageAppropriate === true`, különben `skipped`;
       - a `materialId` a listából, különben `null`;
       - a hosszkorlátok betartva.
   - **`runNewsletters(now)`:**
     - **Címzett:** csak az a tanuló, akinél `newsletter = true` ÉS van érdeklődés, és van aktív nevesített címe.
     - **Foglalás:** a `learner_newsletters` (`learner_id`, `day`) a reggeli emlékeztető mintája szerint (a `failed` egyszer
       újrapróbálható).
     - **Küldés:** generálás → címenként a küldés (személyes anyaglink: `personalUrl`) → `sent`.
       - Hiba → `failed`; alkalmatlan cikk → `skipped`.
     - **Napló és hibakezelés:** a naplóba csak a foglalás azonosítója kerül; sosem dob.
   - **Cron:** `setupNewsletters()`: `0 16 * * *` és `30 16 * * *`, `timezone: Europe/Budapest`.
     - Az `index.ts`-ben a reggeli emlékeztető mellett, e2e-ben nem indul.
4. **`shared/newsletter.ts`:** `newsletterSubject(first, title)` és `newsletterHtml({ first, title, teaser, question, articleUrl, materialTitle?, materialUrl? })`.
   - Escape-elve, a reggeli levél stílusában.
   - Tárgy: „🔭 {Név}, mai felfedezésed: {cím}”.
5. **Tesztek:**
   - **`tests/newsletter.test.ts`**, álkereséssel, álletöltéssel és álmodellel:
     - nem engedélyezett domain → kiesik;
     - korábban küldött URL → kiesik;
     - `ageAppropriate: false` → `skipped`, nincs levél;
     - ismeretlen `materialId` → nincs híd, a cikk megy;
     - a modell bemenete nem tartalmazza a nevet és a címet;
     - a foglalás miatt két futás → egy levél.
   - **Sablon:** az escape működik, a link megfelel.
   - **Forrás-őr:** a cron budapesti, és e2e-ben nem indul.
6. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`, `npm test`, `build`;
   - eldobható DB-n integrációs próba álmodellel;
   - egy valódi, éles keresés-próba szkripttel, egy témára, levélküldés nélkül, az eredményt a konzolra (a tulajdonos
     döntése szerint mehet élesben).
