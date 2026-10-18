# Codex felhőkörnyezet — WEBSULI

**Létrehozva:** 2026-10-18. **Környezet neve:** `WEBSULI`. **Repó:** `kosazoltan/WEBSULI` (kód: `source/`).

## Mit állít be
- **Node és adatbázis:** Node.js 24, PostgreSQL 17, az utóbbi elkülönített helyi adatbázisként (`postgresql://postgres@127.0.0.1:5432/websuli`).
- **Telepítés:** a zárolt függőségek, utána az adatbázis-migrációk; a helyi adatbázisba próba-tananyagok kerülnek.
- **Indítás:**
  - a szkript a `/workspace/.websuli-cloud/start.sh`, egy véletlen, helyi `SESSION_SECRET`-tel (`/workspace/.websuli-cloud/session-secret`, nem az éles);
  - `WEBSULI_E2E=1` mellett, így a szerver csak loopback adatbázishoz kapcsolódhat, és a háttérfeladatok (levelek, cron) nem futnak;
  - a webes felület a `/api/health` végponttal ellenőrizhető.
- **Böngészős tesztek:** külön Playwright-konfiguráció (`/workspace/.websuli-cloud/playwright.config.mjs`).

## Ellenőrzések
Mind a `source/` alatt:
- `npm run check`;
- `npm run check:test`;
- `npm run lint`;
- `npm test`;
- `npm run build`;
- `npm run test:learning-db`: eldobható Postgresen.
  - Ugyanabban az adatbázisban, ahol a próba-tananyagok vannak, a napi emlékeztető egy tesztje eltérő anyagot választhat. Helyben, saját eldobható adatbázison mind az 57 teszt zöld (2026-10-18).

**A beállításkor mért eredmény:**
- a build, a típusellenőrzés és a lint: PASS;
- 2151 unit teszt sikeres;
- 4 böngészős próba sikeres (főoldal, navigáció, tananyaglista, mobilnézet).

## Nem része
- **Külső integrációk:** az Anthropic / OpenAI AI-kulcsok, a Resend levelezés, a Google-belépés.
- **A teljes E2E-csomag:** az a GitHub CI-ben fut.

## Hol él, és mit kell tudni róla
(A működés a hivatalos Codex cloud environment dokumentáció szerint, ellenőrizve 2026-10-18.)

- **Hely:** a környezet a ChatGPT-fiókban él (Codex → Settings → Environments), nem a repóban. Bármelyik gépen elérhető,
  ha ugyanazzal a fiókkal jelentkezel be. Git pull ehhez nem kell.
- **Repó:** a beállítás a repó követett fájljait nem módosította.
- **Új konténer:**
  - a Codex a kiválasztott ágat vagy commitot veszi ki;
  - lefut a telepítőszkript a felhős gép munkaterületén (`/workspace/...`).
- **Gyorsítótár:**
  - a konténer állapota legfeljebb 12 óráig gyorsítótárazott, és a folytatott feladat ezt kapja (telepítőszkript nélkül,
    legfeljebb a karbantartó szkripttel);
  - a gyorsítótár akkor érvénytelenné válik, ha a telepítő- vagy karbantartó szkript, a környezeti változók vagy a titkok
    változnak.
  - Ha a lockfile vagy a generálási igény változik, és a gyorsítótár elavult, a környezet oldalán a „Reset cache” segít.
    Ilyenkor ne tekintsd a telepítési lépéseket lefutottnak, csak ha a feladatban újra lefutottak.
- **Folyamatok:** a futó szerverfolyamatok nem maradnak meg; az indítás a mentett indítókészség szerint történik.
- **Hálózat:**
  - A telepítőszkript a beállítástól függetlenül internet-hozzáféréssel fut.
  - A domainlista az ügynök fázisát szabályozza: a csomagkezelők („Csomagkezelők”), valamint a fenti „Mit állít be”
    részben külön felsorolt tartományok, ha vannak.
  - Újralétrehozáskor ezeket is engedélyezd, ha az ügynöknek feladat közben kell telepítenie vagy generálnia.
- **Adatvédelem:** „Csak én” — a környezetet csak a tulajdonos fiókja használhatja.
- **Titkok:**
  - Éles titok ebben a környezetben tilos, mert a környezeti változók értékét az ügynök is olvashatja.
  - A telepítéshez szükséges fejlesztői hitelesítő adat a „Titkok” (Secrets) mezőbe való, mert az csak a telepítőszkript
    alatt érhető el, az ügynök fázisa előtt törlődik.
  - Soha ne kerüljön a repóba vagy a chatbe.

## Újralétrehozás (ha törlődne, vagy új fiókban kell)
1. ChatGPT → Codex → „Környezet kiválasztása” → „Környezet létrehozása”.
2. Repó kiválasztása, majd „Beállítás indítása” (Cloud Environment Onboarding: Setup készség).
3. Kérés: „build, típusellenőrzés, tesztek; titkokat ne kérj kötelezőként, a szerverhez szükséges változókat csak opcionálisként
   írd le.”
4. A végén: „Környezet szerkesztése” → ellenőrzés → „Piszkozat mentése” → „Közzététel”.

## Mire jó
- **Cloud-feladatok:** a Codexben ezzel a környezettel indított feladatok le tudják futtatni a buildet és a teszteket, nem
  csak a kódot olvassák. Így egy változás hatása a program más részeire is ellenőrizhető.
- **PR-review:** a GitHubról indított Codex-review (`@codex review`, automatikus review) a Codex Code Review saját
  beállítása szerint fut, nem garantáltan ebben a környezetben. A review eredményét ezért ne tekintsd az itt felsorolt
  ellenőrzések lefuttatásának.
