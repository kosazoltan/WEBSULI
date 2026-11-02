# Admin menü — a csoportnevek a bennük lévő funkciókat mondják (mobil és asztali)

Állapot: tulajdonosi kérés 2026-10-19:
> „az üzenetek helyett cseréld ki tanulókra, és mindenhol egyértelműsítsd a gombok neveit az alattuk lévő funkciókkal”

## Probléma
- **Rejtett fül:** a mobilos alsó menü „Üzenetek” gombja alatt van a „Tanulók” fül (és a címzettek, a szülői összesítő); a név
  nem utal rá, a tulajdonos nem találta.
- **Eltérő nevek:** az „Anyagok” (mobil) és a „Tananyagok” (asztali) ugyanazt jelenti, de két néven.

## Cél
A csoportok neve (`client/src/lib/admin-tabs.ts`, a mobil rövid név `MobileBottomNav.tsx`) a tartalmat mondja:

| id | asztali név | mobil gomb | alatta |
|---|---|---|---|
| materials | Tananyagok | Tananyagok | Fájlok, PDF-feltöltés, Címkék, Megtekintések |
| authoring | Készítés és javítás | Készítés | Tananyag készítése, Futások, Tananyagjavító, Régi anyag okosítása |
| communication | Tanulók és levelek | Tanulók | E-mail címzettek, E-mail diagnosztika, Szülői összesítő, Tanulók |
| system | Rendszer és mentések | Rendszer | Felhasználók, Mentés és visszaállítás, Javítási mentések, Adatbázis |

- A mobil gomb `data-testid`-je a csoport azonosítójából képződik (`mobile-nav-<id>`), nem a feliratból.

## Nem-cél
- A fülek (`value`) és a deep linkek (`/admin?tab=…`) nem változnak; a fülek sorrendje és csoportja sem.

## Elfogadás (EARS)
- **Mobil:** HA az admin mobilon megnyitja az alsó menüt, AKKOR a négy gomb: Tananyagok, Készítés, Tanulók, Rendszer, és a
  „Tanulók” alatt ott a „Tanulók” fül.
- **Asztali:** HA asztalon, AKKOR a csoportcímkék: Tananyagok, Készítés és javítás, Tanulók és levelek, Rendszer és mentések.
- **Valós render:** 375 px-en nincs vízszintes kilógás és levágott felirat.
- **Tesztek:** a menünévre épülő tesztek dokumentált spec-változásként igazodnak.
