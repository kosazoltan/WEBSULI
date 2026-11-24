# Spec: az eredmény-e-mail S1b (#510) bontása kis, önállóan ellenőrizhető PR-okra

> Dátum: 2026-11-22 · Szerző: főszál (Claude) · Állapot: JÓVÁHAGYVA (tulajdonos, űrlap, 2026-11-22: „Jóváhagyom, így”)
> Szabály: 3+ fájlt érintő feladat csak spec + AI-olvasható végrehajtási utasítás után indul (`docs/agent-haromfazisu-munka.md`).
> Előzmény: `docs/specs/2026-11-17-eredmeny-email-kviz.md` (R1–R54), `docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`, PR #510.

## 1. Cél

A #510 (eredmény-e-mail a kvízekhez, S1b) 32 fájlt és +5579 sort érint, 54 követelményt (R1–R54) visz egyetlen PR-ban. 14 vak
ellenőri kör után sem konvergált: minden kör új felületet talált, és a 13. kör blokkolójának javítása (UUID-körazonosító) maga hozott két
új blokkolót. A tulajdonos döntése (űrlap, 2026-11-22): „UUID vissza + bontás”. A cél, hogy az S1b funkció kis (~400 sor alatti éles
kód), egyenként vak ellenőrrel zöldre vihető PR-okban kerüljön a főágra, és mindegyik PR egyedül is hagyja változatlanul az éles működést
(`memory: stacked-pr-standalone-neutral`), ha a hozzá tartozó kapcsoló KI.

## 2. NEM cél

- Új követelmény bevezetése: a bontás az R1–R54 TARTALMÁT nem változtatja (kivétel: a 6. pont körazonosítója, amelyet új szelet tervez).
- A #510 ágának további foltozása: a #510 nyitva marad hivatkozásként, új vak kört nem kap; a szeletek a főágról indulnak, és a #510
  kódját csak forrásként használják (válogatva, nem egészben).
- A főágon már bent lévő S1a (#496) viselkedésének módosítása.
- A szerver kézbesítési infrastruktúrájának (`sendResultEmail`, Resend) cseréje.

## 3. Érintett területek

`source/server/lesson-result-email.ts`, `source/server/lesson-result-limits.ts`, `source/server/shutdown-flush.ts`, `source/server/index.ts`,
`source/server/routes.ts`, `source/shared/lesson-result-email.ts`, `source/shared/quiz-round.ts`, `source/shared/result-outbox.ts`,
`source/shared/result-compat.ts`, `source/client/src/lesson-runtime/resultReport.ts`, `source/client/src/lesson-runtime/useExperienceRound.ts`,
`source/client/src/lib/queryClient.ts`, `source/client/src/lib/resultOutboxFlag.ts`, `source/client/src/App.tsx`, és a hozzájuk tartozó
tesztek (`lesson-result-email*.ts`, `result-outbox.test.ts`, `result-report-complete.test.ts`, `shutdown-flush.test.ts`, …).

## 4. Rögzített döntések és kényszerek

1. **Szeletsorrend és tartalom** (a követelmények a #510 spec R-számai szerint):

   | Szelet | Tartalom | Követelmények | Kapcsoló |
   |---|---|---|---|
   | **B1a** | SZERVER: a kör kezdete / utolsó válasz ideje opcionális mezőként elfogadva; dátumsor a levélben (magyar idő) | R13 (teljes kör része), R2 szerverrésze | nincs (a régi kliens nélkülük küld) |
   | **B1b** | KLIENS: a mezők küldése, `lastAnsweredAt` rögzítése, a 7 napos korhatár az utolsó válaszhoz — csak a B1a TELEPÍTÉSE után (a szigorú séma miatt: új kliens + régi szerver = 400) | R2 | nincs |
   | **B2** | A végleges beküldés hálózati rétege: `keepalive`, CSRF-token érvénytelenítés 403 után, a kérés időkorlátja a törzs olvasásáig, nincs beágyazott újrapróba, eredménykeretek egy osztályra | R4, R8, R9, R23, R26, R37, R46 | nincs (a kliens–szerver viselkedés változatlan szerződéssel) |
   | **B3** | Kliens–szerver kompatibilitás a telepítési átmenethez (képesség-jelzés) | R10, R12 | — (a B4 előfeltétele) |
   | **B4** | Körönként egy végleges levél, kiléttől függetlenül; a kilét a kör LÉTREHOZÁSAKOR rögzül (tervezési szabály) | R27, R42, R47, R49, R50 (és a „Kilét-invariáns” szakasz) | `RESULT_PARTIAL_EMAIL` jellegű kapcsoló, alapból KI — a pontos név a végrehajtásban |
   | **B5a** | A „félbehagyva” pillanatkép — szerveroldali ütemezés, egyetlen indító út, elnyomás bármely véglegesítéskor | R1, R5, R6, R7, R11, R17, R15, R16, R18, R19, R21, R22, R25, R29, R34, R36, R38, R45, R48 | a B4 kapcsolója |
   | **B5b** | A pillanatkép kliensoldala (körcsere a kör közepén, lap elhagyásának határideje) | R3, R20, R44, R13 (részleges levél szövege) | a B4 kapcsolója |
   | **B6** | Leállításkori ürítés: a várakozó, a küldés alatt álló és a halasztott levelek, közös határidő | R14, R33, R41 | a B4 kapcsolója |
   | **B7** | Tartós kimenő sor a végleges beküldésekre (fülbiztos, korhatáros, kilétkötött) | R24, R28, R30, R31, R32, R35, R39, R40, R43; `2026-11-20-eredmenylevel-tartos-sor.md` | `resultOutboxFlag` — alapból KI (marad) |
   | **B8** | Nagy entrópiájú, TÁROLÓ-KOMPATIBILIS körazonosító (új terv, a vak kör 13 L1 és a 14. kör L1–L2 alapján) | új (lásd 5. pont) | a B4 kapcsolója |

   A sorrend kötött: B1a → B1b → B2 → B3 → B4 → B5a → B5b → B6 → B7 → B8 (a B1 két részre vált a megvalósításkor: a szigorú
   szerver-séma miatt a szerveroldali elfogadásnak a kliens küldése ELŐTT kell települnie). Egy szelet csak az előző beolvadása után indul (halmozott lánc
   tilos — ütközésforrás volt).
2. **Méret:** szeletenként az éles kód legfeljebb ~400 sor; a teszt és a dokumentáció ezen felül. Ha egy szelet a megvalósításkor
   400 sor fölé menne, a végrehajtásban tovább kell bontani, MIELŐTT kód készül.
3. **Vak ellenőr:** szeletenként a repó futtatója (`npm run gate:blind-review`); a konvergencia-őr (`vak-kor-konvergencia.py`) a futtatás
   ELŐTT, exit 1 esetén nincs új kör — ilyenkor tulajdonosi döntés. Szeletenként legfeljebb 3 kör (`memory: gate-speed-decisions`).
4. **E2E kötelező minden kliensoldali szeletnél** a vak kör ELŐTT (`tests/lesson-result-email*.spec.ts`) — a 14. kör L1-e éppen az
   egységtesztre szorítkozó ellenőrzés miatt jött.
5. **Forrás:** a #510 ágának kódja (fej `389ea8c3`) a szeletek forrása; minden átvett rész tesztjével együtt kerül át, és a szelet saját
   diffjét a vak ellenőr a FŐÁGHOZ mérve kapja.

## 5. Edge case-ek

- Régi és új kliens egyszerre ugyanazon a gépen (közös `localStorage`): a régi kliens tárolóírása nem okozhat újraküldést (B8, a 14. kör L2).
- Már elküldött, régi azonosítójú kör: az új azonosító bevezetése után sem kaphat második levelet (B8 migráció).
- Kliens (Vercel) és szerver (Render) eltérő ütemű telepítése: minden szelet a B3 képesség-jelzésére épít, ha a szerződést érinti.
- Leállítás (SIGTERM) a pillanatkép ütemezése / küldése közben (B6).
- Fiókváltás a kör közben: a kilét a létrehozáskor rögzül (B4); a fiókváltás teljes osztálya a tulajdonos 2026-11-22-i döntése szerint
  külön, követő munka („AZ EGÉSZ OSZTÁLY KÖVETŐ PR”).
- 32 bites azonosító-ütközés két tanuló között (B8): a B8 előtt fennálló, ismert korlát — a B1–B7 nem rontja.

## 6. Elfogadási kritériumok (EARS)

- WHEN egy szelet PR-ja megnyílik THEN the PR SHALL legfeljebb ~400 sor éles kódot tartalmazni, és a kapcsolója KI állásában a főág
  viselkedése bájtra azonos maradni (prompt- / viselkedés-lenyomat teszt, ahol alkalmazható).
- WHEN egy szelet a vak ellenőrhöz kerül THEN the szelet SHALL zöld `gate:push`-t és — kliensoldali szeletnél — zöld eredménylevél-e2e-t
  felmutatni.
- WHEN a B8 bevezeti az új körazonosítót THEN the system SHALL a régi azonosítójú, már elküldött körre nem küldeni második levelet, és
  régi + új kliens közös tárolója mellett sem.
- WHEN mind a 9 szelet beolvadt THEN the R1–R54 mindegyike SHALL egy beolvadt szelethez rendelve, teszttel lefedve lenni (a végrehajtás
  záró táblázata), és a #510 lezárható (merge nélkül, hivatkozással).

## 7. Tesztterv

Szeletenként a #510 megfelelő tesztjei (átvéve, a szelethez szűkítve) + a szelet saját új tesztjei; a B8-hoz új e2e: régi és új kliens
közös tárolóval, már elküldött kör, két külön kör azonos kérdéssorral.

## 8. Kockázatok / visszavonási terv

- Kockázat: a szeletek közti szerződés (mezőnevek) eltér a #510-étől — kezelés: a B3 képesség-jelzés és szeletenkénti adatszerződés-teszt.
- Kockázat: lassú átfutás (9 szelet × 1–3 kör × ~1 óra CI) — elfogadott; a párhuzamosítás tilos (ütközésforrás).
- Visszavonás: szeletenként revert; a B4–B8 kapcsoló mögött, alapból KI.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-22-eredmeny-email-bontas-vegrehajtas.md`

### B3 / B5a — a képesség hirdetésének feltétele

B3 csak olvassa a numerikus `resultApi: 2` jelzést; azt kizárólag tesztfixture adja. Jelzés nélkül a végleges kérés a régi alakban megy, új küldési út nélkül. B5a elfogadási feltétele: a szerver csak a teljes V2-törzs (a `partial` és `clientNow` mezőket is beleértve) tényleges feldolgozását igazoló integrációs teszt után hirdethet V2-t. Addig a teljes R12 nincs kész; a séma lazítása vagy a kérés feldolgozás nélküli nyugtázása nem teljesítés.
