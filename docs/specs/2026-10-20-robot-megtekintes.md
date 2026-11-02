# Robot-megtekintések kiszűrése a megtekintés-statisztikából

Állapot: a tulajdonos 2026-10-20-án a „Szerver-gyorsítótár (javasolt)” opciót választotta. A robotszűrés kérdésére nem válaszolt;
utána azt kérte: „fejezd be autonóm módon … minden nyitott pontot”. A javasolt változat: a robotok nem számítanak megtekintésnek.

## Mérés (éles, csak olvasva, 7 nap)
- **A robotok aránya:** a `material_views` 490 sorából 379 (77 %) robot.
  - 311 `meta-externalagent`, továbbá `facebookexternalhit` és `curl`.
- **A napi összesítő e-mail** (pl. „67 megtekintés”) ezeket valódi megtekintésként számolja.
- **Egyetlen rögzítési pont:** `server/routes.ts` `GET /dev/:id`, a `storage.createMaterialView`.

## Cél
1. **`server/lib/automated-agent.ts`:** `isAutomatedUserAgent(ua)` — ismert robot-, előnézet- és parancssori aláírások:
   bot / crawl / spider / facebookexternalhit / meta-externalagent / slurp / preview / headless / curl / wget / python-requests
   / node-fetch / go-http-client / okhttp / java.
   - Üres / hiányzó UA → robot (böngésző mindig küld UA-t).
2. **A rögzítés kihagyása:** a `GET /dev/:id` robotnál nem rögzít megtekintést (`createMaterialView`).
   - Az anyag kiszolgálása változatlan: a link-előnézet és a robotok továbbra is megkapják a tartalmat.
   - A párosított tanulói eszköz (`?lt=`) tevékenységnaplója változatlan.

## Nem-cél
- **Szerveroldali gyorsítótár:** most nem készül. A mérés szerint a Meta böngésző-UA-val futó, fej nélküli megjelenítője is lekéri
  az API-t (`57.141.x` címek, `Mozilla/5.0 …` UA), így a gyorsítótár az adatbázis elalvását nem biztosítaná, az admin
  szerkesztés után viszont elavult tartalmat mutathatna. Az elalvást a Neon 0,25 CU-s minimuma mellett nem tesszük feltétellé.
- **A régi robotsorok törlése:** a múltbeli statisztika nem változik.

## Elfogadás (EARS)
- **Robot:** HA a kérés UA-ja robot (pl. `meta-externalagent/1.1`), AKKOR a `/dev/:id` kiszolgál, de nem rögzít megtekintést.
- **Böngésző:** HA a kérés valódi böngészőből jön, AKKOR a rögzítés változatlan (az IP + anyag 1 órás ismétlésvédelemmel).
