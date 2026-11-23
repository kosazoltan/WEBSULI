Tulajdonosi kérés (szó szerint, dátummal):
- 2026-11-18: ÚJ játék: adventi naptár — minden tanuló kinyit egy kérdést a saját szintjén; 95%-nál: „Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.”
- 2026-11-18: klasszikus, szépen kidolgozott karácsonyi grafika; elhelyezés a Hero és a tananyagok közé, teljes szélességű, nem túl magas kártyán.
- Döntések: dec. 1–24. naponta egy ablak (kihagyottak pótolhatók; dec. 25–jan. 6. mind nyitva); hibás válasz új hasonló kérdéssel, ablakonként max 2×; főoldali kártya közvetlenül a Hero alatt (telefonon ≤ 132 px); a névtelen haladás párosításkor átkerül; bekapcsolás csak a tulajdonos előnézeti próbája után (D-11).

A változás célja a terv szerint:
A naptár felülete (naptároldal 24 ablakkal, kérdés, visszajelzés, javítás, összesítés a szó szerinti üzenettel; szezonális főoldali kártya) és az élesítés előtti javítások (terv 22. szakasz) a már beolvasztott adatmodellre és végpontokra (#523) épülve. Minden az `ADVENT_CALENDAR` kapcsoló mögött, alapból KI: kikapcsolt kapcsolóval sem az útvonal, sem a kártya (a buildben sem) nem jelenhet meg, és a meglévő főoldal / tananyagok viselkedése változatlan.

Feladat-specifikus hibakereső pontok:
8a. Adat- és állapotút: névtelen → párosított átvétel (évfolyamváltás, rögzítetlen évfolyam, két eszköz egyidejű első átvétele), alanyváltáskor törlődő kliensállapot, lezárt évadban mentett állás, átmeneti hálózati hiba; veszhet-e el vagy duplázódhat-e válasz, ismételt beküldésnél ugyanaz az eredmény jön-e?
8b. A terv (`docs/specs/2026-11-18-adventi-naptar.md`) 6., 12.5, 13.8, 14.6, 16.10 és 22. szakaszának elfogadási pontjai egyenként, különösen: 24/24 → szó szerinti üzenet; ablakonként max 2 javítás; dátumhatár és éjféli frissítés a szerver órája szerint (Europe/Budapest); szezon előtti és üres naptár zárószövege.
8c. Biztonság és adatvédelem: token / eszközazonosító nem kerülhet URL-be, naplóba; a helyes válasz csak a válasz után jut a klienshez; CSRF; az e2e-mód tesztidő-fejléce élesben hatástalan.
8d. Szerződés kliens és szerver között: mezőnevek, `question: null` / `correctIndex: -1` eltűnt kérdésnél, 409 `corrupt` / `pairing: invalid`, 429 `Retry-After`, a teljes ablaklista a válaszban.
8e. Regresszió: kikapcsolt kapcsolóval a főoldal, a Hero, a tananyaglista és a játékok érintetlenek (lusta darab, útvonal a kapcsoló mögött); akadálymentesség: fókusz a párbeszédablak nyitásakor és bezárásakor, Escape; telefonos elrendezés (360×640, 844×390) átfedés és levágás nélkül.
8f. Tesztminőség: a böngészős és DB-tesztek a viselkedést mérik-e, időfüggés (valós óra, fókusz-időzítés), valódi e-mail vagy külső hívás nem indulhat.
