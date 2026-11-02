# A szerver leáll, ha az adatbázis lezár egy tétlen kapcsolatot (Render „Exited with status 1”)

Állapot: tulajdonosi kérés 2026-11-01. A Render riasztást küldött: „server failure for websuli-api-eu: Exited with status 1”.

## Tény (lokálisan reprodukálva, 2026-11-01)
- A `source/server/db.ts` `pg` Pool-ján nincs `error`-figyelő. A `pg` a tétlen kliens hibáját (pl. a szerver bontja a
  kapcsolatot) a Pool `error` eseményén adja tovább. Figyelő nélkül a Node `EventEmitter` ezt eldobja, ebből
  elkapatlan kivétel lesz, és a folyamat 1-es kóddal kilép.
- Reprodukció: production build (`npm run build`), lokális Postgres 16, `node dist/index.js`, majd
  `pg_terminate_backend` a tétlen kapcsolatokra. Kimenet: `node:events … throw er; // Unhandled 'error' event` →
  `error: terminating connection due to administrator command` → `exit=1`.
- Ugyanezt az üzenetet kapja a szolgáltatás, amikor a Neon felfüggeszti vagy újraindítja a compute-ot, vagy hálózati
  hiba bontja a kapcsolatot. A pool tétlen kapcsolatai ilyenkor szakadnak meg.

## Feltételezés (NEM igazolt)
- Az éles Render-naplót nem láttuk (a munkamenetből az `api.render.com` nem érhető el). Az, hogy a 2026-11-01-i riasztás
  pontosan ebből az útból jött, következtetés. A javítás ettől függetlenül indokolt: igazoltan összeomlást okozó
  kódhibát zár be.

## Cél
- Egy tétlen pool-kapcsolat hibája NE állítsa le a folyamatot: a hibát naplózzuk, a `pg` a hibás klienst eldobja,
  a következő lekérdezés új kapcsolatot nyit.

## Nem-cél
- Globális `uncaughtException` / `unhandledRejection` elnyelés (az valódi hibákat takarna el).
- A pool-méret, időkorlát vagy SSL-beállítás módosítása.
- Újrapróbálás a folyamatban lévő lekérdezésekre (azok a saját hívójukban kapnak hibát, ahogy eddig is).

## Érintett fájlok
- `source/server/lib/pool-error-handler.ts` (új, tiszta segéd)
- `source/server/db.ts` (a segéd bekötése a pool létrehozása után)
- `source/tests/pool-error-handler.test.ts` (új teszt)

## Edge case-ek
- A hiba többször is jön (több tétlen kliens): minden alkalommal csak naplózunk.
- A hibaobjektum nem `Error`: a napló `String(err)`-t ír.
- A naplóba csak üzenet és kód kerül, kapcsolati sztring, jelszó vagy kliensobjektum nem.

## Elfogadás (EARS)
- E1: AMIKOR a Pool `error` eseményt bocsát ki, a rendszer NEM dob kivételt, és egy `[DB]` előtagú hibanaplót ír.
- E2: AMIKOR a tétlen kapcsolatokat a DB-szerver bontja, a futó szerver tovább fut, és a `/health` 200-at ad.
- E3: Az utána érkező DB-lekérdezés új kapcsolaton sikeres.
