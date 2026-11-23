---
name: felhos-szalak-geptelenseg
description: "Felhős WEBSULI-szálak nem tudnak merge-kaput futtatni és a gépnek írni; a helyi „Felhős szálak összevonása” szál a koordinátor, a merge-sor a helyi fő szálé (2026-11-22)"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-22T18:15:21.247Z
---

2026-11-22: a tulajdonos szerint a felhős szálak „elvesztették a gépet”. Mért okok:
- A `npm run gate:merge` felhőből nem fut: nincs DATABASE_URL / .env (GUARD_ERROR), a websuli.vip nem érhető el (`/api/rt/status`: fetch failed), a `gh` GraphQL pedig 403-at ad (ezt javítja a #513).
- Felhős szál csak akkor tud a géphez írni, ha a tulajdonos a Claude appban, megbízható eszközön engedélyezi. Ezt 2026-11-22-én vállalta. Válasz nélkül a felhős szál munkáját csak pusholt ágon / PR-on lehet átvenni.

- A fő hiba: két felhős szál 11-19-én a „Websolib játékok modernizálása” Remote Control-szálnak adta át a munkáját, de az a szál OFFLINE volt. Az átadás elveszett, az átvételt senki nem erősítette meg.
- Helyben megvan a `source/.env`, ezért a futásőr itt lefut. Felhős szál által hivatkozott „kapukivételt” nem fogadunk el.

**Why:** a felhős szálak kapu nélkül elakadnak, és átadják a munkát. A helyi gép nélkül nincs merge.
**How to apply:** a felhős WEBSULI-munka a helyi koordinátoron („Felhős szálak összevonása”) keresztül fut. A merge-sort a helyi fő szál viszi ([[orchestrator-owns-all-websuli-flows]]), ugyanazon a PR-on két író nem dolgozhat. Kapcsolódik: [[quality-gates-mandate]].
