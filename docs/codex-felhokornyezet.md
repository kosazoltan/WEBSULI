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
- **Hely:** a környezet a ChatGPT-fiókban él (Codex → Settings → Environments), nem a repóban. Bármelyik gépen elérhető, ha ugyanazzal a
  fiókkal jelentkezel be. Git pull ehhez nem kell.
- **Repó:** a beállítás a repó követett fájljait nem módosította. A telepítő- és indítószkript a felhős gép munkaterületén
  (`/workspace/...`) fut, minden feladatnál a GitHubról frissen klónozott kódon.
- **Folyamatok:** a közzététel / visszaállítás után nem maradnak meg; az indítás a mentett indítókészség szerint történik.
- **Hálózat:** internet-hozzáférés a csomagkezelők felé („Csomagkezelők” domainlista), valamint a fenti „Mit állít be”
  részben külön felsorolt további tartományok felé, ha vannak. Újralétrehozáskor ezeket is engedélyezni kell, különben a
  telepítés elakad.
- **Adatvédelem:** „Csak én” — a környezetet csak a tulajdonos fiókja használhatja.
- **Titkok:** egyetlen éles titok sincs a környezetben. Ha mégis kell (pl. teljes szerverindításhoz), a környezet beállításainál a
  „Környezeti változók → Kezelés” alatt add meg, soha ne a repóban vagy a chatben.

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
