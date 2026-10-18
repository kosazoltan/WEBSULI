# Tanulói profil — S3 Napi sorozat — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-tanuloi-profil.md` (4. döntés, „Napi sorozat”). Előfeltétel: S1–S2, a `learner_activity`.
Munkakönyvtár: `source/`.

## 1. `shared/learner-streak.ts` (tiszta + teszt)
- **`learningStreak(days, today)`:**
  - **Bemenet:** `days` a budapesti naptári napok (`YYYY-MM-DD`) halmaza, amelyeken a tanulónak volt tevékenysége; `today` a mai nap.
  - **Számítás:** az egymást követő napok száma, amely ma vagy tegnap végződik.
  - **Eredmény:** `{ days, today }`, ahol a `today` azt mondja meg, volt-e ma tevékenység.
  - **Megszakadt sorozat:** tegnap és ma sem volt tevékenység, az eredmény 0.
- **`streakMessage(streak)`:**
  - 0: `null`;
  - ma 1 nap: „Ma már tanultál — szuper!”;
  - N ≥ 2: „N napja tanulsz egymás után!”;
  - ha ma még nem volt tevékenység, de a sorozat él: „N napos sorozatod van — ma is folytasd!”.

## 2. Szerver
- **`server/learners.ts` `learnerStreak(id, now)`:** a `learner_activity` budapesti napjai az elmúlt 60 napból,
  `(created_at AT TIME ZONE 'Europe/Budapest')::date`, majd `learningStreak`.
- **`GET /api/learner/me`:** a válasz kiegészül: `streak: { days, today }`.

## 3. Kliens
- **`LearnerProfile` típus:** `streak?: { days: number; today: boolean }`.
- **`WelcomeCard`:** párosított profilnál a köszöntő alatt a `streakMessage` (🔥), ha nem `null`; a hozzáférhetőség miatt
  `role="status"` nélkül, sima szövegként.

## 4. Tesztek
- `tests/learner-streak.test.ts`: üres, csak ma, csak tegnap, megszakadt, hónap- és évváltás, ismétlődő nap, üzenetek.

## 5. Ellenőrzés
`check`, `check:test`, `lint`, `test`, `build`; élesítés után a `GET /api/learner/me` hamis tokenre továbbra is 401.
