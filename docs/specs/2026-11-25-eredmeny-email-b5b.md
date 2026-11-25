# B5b — a „félbehagyva” pillanatkép kliensoldala (eredménylevél-bontás)

> Dátum: 2026-11-25 · Állapot: tulajdonosi döntés (űrlap, 2026-11-25): „Elkészítem a B5b-t, utána B6–B8 is”.
> Előzmény: `docs/specs/2026-11-22-eredmeny-email-bontas.md` (B5b sor: R3, R20, R44, R13), `docs/specs/2026-11-17-eredmeny-email-kviz.md`
> (a #510 R-számai), forrás: a #510 ága (`389ea8c3`, `resultReport.ts` pillanatkép-effekt).

## Probléma (mérve)
A szerver (B5a-0 / B5a-1) `RESULT_PARTIAL_EMAIL=on` mellett ütemezi a „félbehagyva” levelet, a kapcsoló élesben BE — de a kliens
(`client/src/lesson-runtime/resultReport.ts`) soha nem küld `partial: true` pillanatképet, így a funkció élesben hatástalan.

## Döntések
1. **Képesség-jelzés (R12 szűkítve):** a szerver a `/api/csrf-token` válaszában `resultPartial: true`-t hirdet, ha a
   `RESULT_PARTIAL_EMAIL` BE. A kliens CSAK e jelzés mellett küld pillanatképet (régi szerver vagy KI kapcsoló: nincs kérés, nem fogy a
   20-as keret). A teljes V2 (`resultApi: 2`, `clientNow`, `subject`) NEM része a B5b-nek — a szerver sémája ezeket nem fogadja, a
   hirdetése valótlan volna (B3 / B5a feltétel).
2. **Mikor megy (R3):** a lap háttérbe kerülésekor (`visibilitychange` → hidden), `pagehide`-kor, a nézet lebontásakor (lecke
   elhagyása, alkalmazáson belüli navigáció) és a kör NÉZETEN BELÜLI cseréjekor („Új kvíz” → „Új kör indítása”) az ELHAGYOTT körről.
3. **Mi megy:** `{ kind: "quiz", roundId, partial: true, picks (a kör minden kérdése, a megválaszolatlan -1), fingerprint?, learner?,
   startedAt?, lastAnsweredAt }` — a szerver sémája szerint; a `lastAnsweredAt` a törzsben megy (a szerver ebből dönt a 7 napos
   korhatárról, nélküle `stale`). A kilét a B4b szerint (a kör rögzített párosítása, kötésnél).
4. **Mikor NEM megy:** lezárt vagy teljesen megválaszolt kör (azt a végleges beküldés viszi), 0 válasz, 7 napnál régebbi utolsó válasz,
   már elküldött kör (`…:sent:<kör>`), vagy ha a válaszok száma nem nagyobb a körre legutóbb ELFOGADOTT pillanatképénél (memória +
   `…:partial:<kör>` a tárolóban; „elfogadva” csak 2xx után).
5. **Határidő (R44):** kísérletenként 15 s (`SNAPSHOT_POST_TIMEOUT_MS`), `keepalive`, beágyazott újrapróba nélkül; a határidő után
   ugyanaz az állapot újra elküldhető (nem rögzül „elfogadottként”).
6. **R20 — körönkénti beküldés-állapot:** a végleges beküldés „úton van” őre a KÖR azonosítójához kötött (nem komponensszintű), így az
   előző kör függő beküldése mellett az új, teljesen megválaszolt kör is elmegy.
7. **R13:** a részleges levél szövege a szerveren kész (B5a-0); a kliens órája (`clientNow`) a teljes V2-vel jön, nem itt.
8. A végleges beküldés sikere után a `…:partial:<kör>` kulcs törlődik (R8 takarítás).

## Elfogadás (EARS)
- AMIKOR a szerver `resultPartial: true`-t hirdet ÉS a tanuló a kvíz egy részére válaszolt ÉS a lap háttérbe kerül, A RENDSZER egy
  `partial: true` kérést küld a sémának megfelelő törzzsel, `keepalive`-val.
- AMIKOR ugyanaz az állapot újra háttérbe kerül, A RENDSZER nem küld újra; egy további válasz után igen.
- AMIKOR a szerver nem hirdeti a jelzést, A RENDSZER nem küld pillanatképet.
- AMIKOR a kör a nézeten belül lecserélődik, A RENDSZER az elhagyott körről küld pillanatképet.
- AMIKOR a kör teljesen megválaszolt, A RENDSZER csak a végleges beküldést küldi (pillanatképet nem).
- AMIKOR az előző kör végleges beküldése függőben van, A RENDSZER az új, teljes kört is beküldi (R20).

## Kockázat / visszavonás
A kapcsoló KI állásában (vagy régi szervernél) a kliens viselkedése változatlan. Visszavonás: a `resultPartial` hirdetésének kivétele.
