# A levágott modellválasz megszüntetése — előre megadott kimeneti keret

Állapot: tulajdonosi utasítás 2026-10-20: „javítsd a vágott modellválaszt is már most. Szabj keretet a modellnek előre, hogy ne
forduljon elő, ne legyenek felesleges API-költségek.”

## Mérés (éles, 2026-10-20, „Kéttagú kifejezések négyzete – kifejezéskártyák”, job be3bd5d2)
- **A jelenség:** 12:49:42 — „bankcsomag 2. fejezet, 1. kísérlet: A modellhívás hibázott: A bankcsomag válasza elérte a kimeneti
  keretet és levágódott.”
- **A költség:** a levágott válasz (legfeljebb 64 000 kimeneti token, a gondolkodással együtt) TELJESEN elveszett, és újra kellett
  generálni.
- **A csomag mérete:** a leckének 2 bankcsomagja volt, a tartalékkal együtt csomagonként kb. 29 feladat + 49 kvízkérdés + módszerek +
  szószedet. A fejezetek száma szerint osztódik a 45/75-ös bank, így kevés fejezetnél egy hívás nagyon nagy.

## Gyökérok (fájl:sor)
- **A korlát a modell maximuma alatt van:** `server/studio/single-run/conversation.ts` `SINGLE_RUN_MAX_TOKENS = 64_000` — minden
  fordulóra, holott mindkét gyártómodell kimeneti maximuma 128 000 (`server/ai/models.ts` `MAX_OUTPUT_BY_MODEL`). Csak a ténylegesen
  generált token fizetendő; a korlát nem spórol, de a levágás a már kifizetett kimenetet eldobja.
- **Nincs hosszkeret a promptban:** a bank szerződése (`shared/lesson-experience.ts` `bankPacketContract`) a tételenkénti hosszt nem
  korlátozza, és a modell gondolkodása is a keretből fogy.

## Cél
1. **Kemény korlát a modell maximuma:** `SINGLE_RUN_MAX_TOKENS = 128_000` (mindkét modellnél ennyi a plafon). A levágott válasz
   miatti teljes újragenerálás megszűnik; a ténylegesen kért kimenet nem nő.
2. **Előre megadott keret a modellnek** (a bank szerződésének új pontja): tömör tételek.
   - nyílt feladat: kérdés legfeljebb 2 mondat, sample legfeljebb 3 mondat;
   - kvíz: kérdés legfeljebb 2 mondat, opciónként legfeljebb 1 mondatos magyarázat;
   - módszer: legfeljebb 2 mondatos prompt / answer;
   - a gondolkodásban ne írja meg előre a teljes csomagot (csak a számolásokat és a kulcsokat ellenőrizze), a JSON-t egyszer írja le.
   - A szerződés a csomag méretét is megmondja („ez N tétel”), hogy a modell a keretet ehhez mérje.
3. **Mérés:** a futás telemetriája számolja a levágott válaszokat (`gates.outputTruncated`), a futás nézete mutatja.

## Review #345 (pontosítás)
- **Karakterkeret:** a tételenkénti mondatkeret karakterkerettel is kiegészül.
  - Kérdés ≤ 300, sample ≤ 400, opciónkénti magyarázat ≤ 200, módszer ≤ 300 karakter, és pontosan a kért darabszám.
  - A sémába NEM kerül kötelező hosszkorlát: az többletjavítóköröket okozna, vagyis épp fölösleges költséget.
- **Tartalékmodell:** a GPT `incomplete` válasza csak a kimeneti korlát miatt (`max_output_tokens`, illetve ismeretlen ok esetén)
  számít levágásnak; a tartalomszűrés nem torzítja a számlálót.
- **Hatókör:**
  - A 128 000-es korlát minden úton érvényes (a fogalomjavító és a szerkezeti javító út is ezt a beszélgetést használja).
  - Az `outputTruncated` számláló az egyfutásos gyártás telemetriája; a többi útnak nincs futás-telemetriája.
- **A mentett (folytatott) csomag:** változatlan. A már elfogadott csomag nem generálódik újra, így nem is vágódhat le; a módszerverzió
  emelése fölösleges újragyártást okozna.

## Nem-cél
- A csomagbeosztás (fejezetenként legfeljebb 6 fogalom) és a bankméret (45/75 + tartalék) nem változik.
- A modell és a gondolkodási szint (medium) nem változik.

## Elfogadás (EARS)
- HA egy forduló kimenete 64 000 és 128 000 token közé esik, AKKOR nem vágódik le.
- HA a bank szerződése elkészül, AKKOR tartalmazza a tételszámot és a tételenkénti hosszkeretet.
- HA egy válasz levágódik, AKKOR a telemetria `outputTruncated` számlálója nő.

## Kockázat
- **Hosszabb egyedi forduló:** egy egyedi forduló tovább tarthat; a 30 perces időkeret (`SINGLE_RUN_TIMEOUT_MS`) marad.
- **A tömörségi keret a magyarázatot rövidítheti:** a minőségkapuk (lektor, tesztek) változatlanul mérnek.
