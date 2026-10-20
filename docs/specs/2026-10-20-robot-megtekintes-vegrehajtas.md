# Robot-megtekintések kiszűrése — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-robot-megtekintes.md`. Munkakönyvtár: `source/`. Ág: `fix/robot-megtekintes`.

1. **Új `server/lib/automated-agent.ts`:** `export function isAutomatedUserAgent(ua: string | undefined): boolean`.
   - Kis- és nagybetű-független regex a terv listájával; üres UA → igaz.
2. **`server/routes.ts` `GET /dev/:id`:** a `materialViewDedup.shouldRecord(...)` feltétele elé `!isAutomatedUserAgent(userAgent)`.
   - Ha robot: debug-napló, rögzítés nincs.
3. **Teszt — `tests/automated-agent.test.ts`:**
   - a 7 napos éles UA-minták (meta-externalagent, facebookexternalhit, curl, HeadlessChrome) → robot;
   - Android Chrome, Windows Chrome, iPhone Safari → nem;
   - üres → robot;
   - forrásszintű ellenőrzés: a `/dev/:id` rögzítése az `isAutomatedUserAgent` mögött van.
4. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
5. **Kitelepítés:** az aktív-futás őr = 0.
