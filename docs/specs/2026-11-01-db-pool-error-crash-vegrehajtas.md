# Végrehajtási utasítás: a pool-hiba ne állítsa le a szervert

Terv: `docs/specs/2026-11-01-db-pool-error-crash.md`. Ügynöknek szóló, lépésenkénti utasítás.

## 1. Új modul: `source/server/lib/pool-error-handler.ts`
- `export function attachPoolErrorHandler(pool: { on(event: "error", listener: (err: unknown) => void): unknown }, log: (msg: string) => void): void`
- A figyelő naplózza: `[DB] Idle pool client error (connection dropped; the pool replaces it): <message> (code=<code>)`.
  Ha nem `Error`, akkor `String(err)` kerül a naplóba. Kapcsolati sztringet és kliensobjektumot nem naplóz.
- Kivételt nem dob, és nem hív `process.exit`-et.

## 2. `source/server/db.ts`
- A `new Pool({...})` után: `attachPoolErrorHandler(pool, (msg) => logger.error(msg));`

## 3. Teszt: `source/tests/pool-error-handler.test.ts` (node:test)
- Kontroll: figyelő nélküli `EventEmitter` `emit("error")` dob (a hiba létezésének igazolása).
- E1: figyelővel nem dob, a napló `[DB]` előtagú és tartalmazza az üzenetet és a kódot.
- Edge case: nem `Error` hiba → `String(err)`; két egymás utáni hiba → két naplósor.

## 4. Ellenőrzés
- `npm run check:test`, `npm run lint`, `node --import tsx --test tests/pool-error-handler.test.ts`, `npm run build`.
- E2/E3: production build + lokális Postgres, `pg_terminate_backend` a tétlen kapcsolatokra, utána `/health` 200,
  és egy DB-t használó végpont is válaszol.
