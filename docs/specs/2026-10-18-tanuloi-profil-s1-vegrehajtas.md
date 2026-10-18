# Tanulói profil — S1 Azonosítás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-tanuloi-profil.md`. Munkakönyvtár: `source/`.

## 1. Migráció `migrations/0032_learners.sql` (`--> statement-breakpoint` határokkal, idempotens)
- **`learners`:**
  - oszlopok: `id varchar PK default gen_random_uuid()`, `name varchar(80) not null`, `grade integer not null`,
    `token_version integer not null default 1`, `created_at` / `updated_at timestamptz default now()`;
  - egyedi index: `lower(name)`.
- **`extra_email_addresses.learner_id`:** `varchar REFERENCES learners(id) ON DELETE SET NULL`.
- **Visszatöltés:**
  - `INSERT … SELECT DISTINCT ON (lower(trim(student_name)))`, évfolyam: `classrooms[1]`, `ON CONFLICT DO NOTHING`;
  - utána `UPDATE … SET learner_id` név szerint.
- **`learner_activity`:**
  - oszlopok: `id`, `learner_id NOT NULL REFERENCES learners ON DELETE CASCADE`, `material_id varchar`, `kind varchar(16)`
    (`view` | `result`), `percent integer`, `summary text`, `created_at timestamptz default now()`;
  - index: `(learner_id, created_at DESC)`.
- **Drizzle:** `shared/schema.ts`: `learners`, `learnerActivity`, `extraEmailAddresses.learnerId`.

## 2. `server/lib/learner-token.ts` (tiszta + teszt)
- **`signLearnerToken(id, version, secret)`:** `${id}.${version}.${base64url(hmac-sha256(secret, id + "." + version)).slice(0, 22)}`.
- **`parseLearnerToken(token, secret)`:** formátum-ellenőrzés (`id`: `[A-Za-z0-9-]{8,64}`, verzió: pozitív egész), `timingSafeEqual`.
  Az eredmény `{ id, version } | null`.
- **`learnerLinkSecret()`:** `LEARNER_LINK_SECRET` vagy `SESSION_SECRET`. Élesben, ha egyik sincs, `null` (a funkció kikapcsol);
  fejlesztésben fix fejlesztői kulcs.

## 3. `server/learners.ts`
- **`syncLearners()`:** a nevesített aktív címekből upsert (név szerint, kisbetűsen; az évfolyam `classrooms[0]`), majd
  `learner_id`-kapcsolás. Futtatás:
  - induláskor;
  - az `extra-emails` minden módosító végpontja után: név, osztályok, aktiválás, létrehozás.
- **`resolveLearner(token)`:** token-ellenőrzés, DB-sor, verzió-egyezés. Az eredmény `{ id, name, firstName, grade } | null`.
- **`learnerTokenFor(id, version)`:** az aktuális verzióval aláírt token (vagy `null`, ha nincs titok).

## 4. Végpont `GET /api/learner/me`
- **Bemenet:** `X-Learner-Token` fejléc.
- **Válasz:**
  - érvényes tokenre 200: `{ firstName, grade }`;
  - érvénytelenre 401: `{ message }`.
- A teljes név nem megy ki, csak a keresztnév.

## 5. Napi emlékeztető
- **Személyes link:** a `planDailyReminders` a sor `learnerId`-jából tokent képez, és a link `?t=<token>` végződést kap.
- **Hiányzó kapcsolat:** ha nincs `learnerId` vagy titok, a link változatlan.
- **Próbalevél:** változatlan, token nélkül.

## 6. Kliens
- **`client/src/lib/learnerProfile.ts`:**
  - `LEARNER_TOKEN_KEY = "websuli.learnerToken"`;
  - `takeLearnerTokenFromUrl(href)`: tiszta függvény, a `t` paraméter és a tisztított URL;
  - `captureLearnerTokenFromUrl()`: eltárolás, és a címsor tisztítása (`history.replaceState`);
  - `getLearnerToken()` / `clearLearnerToken()`.
- **`App.tsx` indulása:** `captureLearnerTokenFromUrl()`.
- **`useLearnerProfile()`** (react-query, token esetén):
  - sikerre: ha a tárolt név eltér, `saveLearnerName(firstName)`, és ha a tárolt évfolyam eltér, `setGrade(grade)` (a profil
    az irányadó);
  - 401-re: `clearLearnerToken()`.
- **Bekötés:** a `WelcomeCard` hívja.

## 7. Tesztek
- `tests/learner-token.test.ts`: aláírás és ellenőrzés, hamisítás, rossz formátum, verzióváltás.
- `tests/learner-profile.test.ts`: `takeLearnerTokenFromUrl` (a többi paraméter és a hash megmarad).
- Emlékeztető-link: a `planDailyReminders` tesztje tokenes URL-lel.

## 8. Ellenőrzés
- `check`, `check:test`, `lint`, `test`, `build`.
- **Élesítés után** (csak olvasva):
  - a `learners` sorok száma 4, az e-mail-kapcsolatok 6;
  - a `GET /api/learner/me` hamis tokenre 401.
