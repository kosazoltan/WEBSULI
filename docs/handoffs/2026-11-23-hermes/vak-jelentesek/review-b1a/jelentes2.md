# Független review — feat/eredmeny-b1-datum-korhatar (2. kör)
Fej: 966782178abc67ea6c60719bed78e98232c5f3e5
## Ítélet: IGEN, FELTÉTELLEL

Új blokkolót nem találtam. A javítás ugyanazt a tárolt időpontot használja az első küldéshez és a pótláshoz, **ha a kör sora már létrejött**. A megmaradt időpontpontatlanság, az őszi óraátállítás kétértelműsége és két tesztfedési rés jegyre menjen.

## Az előző kör leleteinek sorsa

Az előző körben nem volt blokkoló. A `712b3e66` javítás a küldő időforrását és a DB-tesztet változtatta; a `96678217` merge másik szülője a megadott base.

- **L1 – részben megszűnt.** Az első próbálkozás és a pótlás a kör ugyanazon `created_at` mezőjét olvassa (`source/server/lesson-result-email.ts:108–126`); meglévő sornál az újrapróba nem módosítja. Az eldobható PostgreSQL-tesztcsomag zöld, benne a tárolt idő visszaolvasását ellenőrző esettel. A POST és az első sikeres beszúrás közötti eltérés, illetve az egyenlőség elfogadása megmaradt.
- **L2 – nem szűnt meg.** A formázó nem változott; az őszi ismétlődő óra mindkét ideje UTC-eltolás nélkül látszik az álló és a fekvő mintán.
- **L3 – nem szűnt meg.** Az új DB-teszt közvetlenül a küldőt hívja, nem a POST-ot; nem visz át `startedAt`-ot a teljes láncon.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — közepes, jegyre: a „Beküldve” még mindig nem a kérés beérkezésének ideje
`source/server/lesson-result-email.ts:108–126,174–179,215–219`; `source/shared/lesson-result-email.ts:106–108`. A tanuló 20:41-kor beküldi a kvízt. Ha a háttérküldő első DB-írása átmenetileg meghiúsul, a már 202-vel visszaigazolt kör sora az egy perccel későbbi szerveres újrapróbán jöhet létre (`:151–156`); az admin ekkor 20:42-t olvas. Sikeres, de a perchatár utánra csúszó első beszúrásnál ugyanez megtörténhet. A dátumlogika leválasztott böngészős próbájában a 20:41-es referencia még kiszűrte a hozzá képest +10 s-os kezdést, a 20:42-es beszúrási referencia már kijelezte. A pótlások egymással stabilak maradtak. A `<=` az azonos ezredmásodpercet is kijelzi. Ez a korábbi L1 maradéka, nem új blokkoló; a próbában nem idéztem elő valódi DB-kiesést. **Javítás:** a szerver fogadási időpontját rögzíteni és az első beszúráskor azt menteni, konfliktuskor megtartani; szerveres gyakorlókörnél a küldést kiváltó esemény időpontját használni. A kezdés ennél szigorúan korábbi legyen.

### L2 — kicsi, jegyre: az őszi óraátállításkor a kör látszólag a beküldés után kezdődik
`source/shared/lesson-result-email.ts:101–104,132`. A tanuló `2026-10-25T00:50:00Z`-kor kezd és `2026-10-25T01:10:00Z`-kor küld be, azaz 20 perccel később. Az admin az álló és a fekvő levélmintán is a `Beküldve: 02:10` és `A kör kezdete: 02:50` helyi időket látja. Ezek külön-külön helyes órák, de az eltérő eltolások nem látszanak. **Javítás:** legalább az ismétlődő órában legyen az eltolás mindkét soron, és kerüljön be az óraátállítást közrefogó dátumpár a tesztbe.

### L3 — kicsi, jegyre: a `startedAt` útját a POST-tól a levélig nem védi teszt
`source/tests/lesson-result-email-date.test.ts:31`; `source/tests/lesson-result-email-db.integration.ts:67–84,114–131`. Ha egy refaktor törli a `meta` hozzárendelését (`source/server/lesson-result-email.ts:198`), a későbbi kliens továbbra is 202-t kap, de az admin nem látja a kezdéssort. Az egységteszt kézzel készíti a `meta`-t, a HTTP-s DB-teszt a régi alakot küldi, az új DB-teszt a küldőt közvetlenül hívja. **Javítás:** mindkét körtípusnál valódi POST után ellenőrizni a tesztküldőnek átadott HTML-t; a sémához külön negatív `lastAnsweredAt`-eseteket hozzáadni (hibás érték, illetve mező a feladatágon).

### L4 — kicsi, új jegy: az új DB-teszt nem ellenőrzi a címében ígért bájtazonosságot
`source/tests/lesson-result-email-db.integration.ts:114–130`. Az admin első sikertelen küldését a tesztküldő nem rögzíti, és a teszt csak **az első küldés után** írja át a `created_at`-ot. A két assert a pótlást és egy másik kört néz, az első próbálkozást nem. A két feltétel leválasztott ellenpróbája igaz maradt, amikor az első levél a futás idejét, csak a pótlás a tárolt dátumot használta; a két dátumsor közben eltért. Ez nem a követett DB-teszt mutált futtatása, hanem az ellenőrzéseinek ellenpéldája. **Javítás:** fix referencia az első próbálkozás előtt, utána a DB-idő átírása nélkül; a hibát dobó küldő is rögzítse a tárgyat, HTML-t és idempotenciakulcsot, a teszt pedig ugyanannál a címzettnél hasonlítsa össze a két próbát.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni.** A base erősen típusozott mezői és a `.strict()` változatlanok; a két opcionális pozitív egész csak a tervezett ágakon szerepel (`source/shared/lesson-result-email.ts:16–21`). A dátumteszt a régi és az új alakot elfogadta, az ismeretlen mezőt elutasította. A HTTP→HTML fedés külön hiányosság (L3).
2. **Biztonság és adatvédelem — új rést nem találtam.** A dátumhoz nem nyers kliensszöveg, hanem számból formázott érték kerül a HTML-be; a kliens által állított kezdés hihetőségi ellenőrzés, nem hiteles időbélyeg. Az időreferencia korlátja L1. A POST meglévő CSRF-védelme és a régi anyag külön origin-őre nem változott (`source/server/routes.ts:790–808,835–843,889–890`); nincs új GET-írás, URL- vagy naplómező.
3. **Regresszió — próbáltam, nem sikerült megtörni.** A régi vendég Stúdió-lecke kliensének feladat- és kvíz-beküldése átment a Playwright-speceken; a valós HTTP/DB és a szerveres gyakorlókvíz-küldés a DB-csomagban futott. A régi HTML-anyag külön `/api/material-result` útja nem hívja a módosított sablont (`source/server/routes.ts:285–296,1099`).
4. **Budapesti idő — talált hiba: L2.** A normál téli, nyári és évváltási eset zöld. Az őszi ismétlődő órában a kijelzett sorrend félreérthető; mindkét nézetben látszik.
5. **Migráció, indítás, cron, leállítás, e2e — a DB- és indítási út zöld; új cron/leállítási út nem alkalmazható.** A `created_at` meglévő `timestamptz NOT NULL DEFAULT now()` mező, megfelelő Drizzle-típussal (`source/migrations/0030_lesson_result_emails.sql:11`, `source/shared/schema.ts:1171`). A DB-futtató újraalkotta a táblát az SQL-ből; az e2e eldobható DB-n indult. A diff nem változtat az életcikluson.
6. **Párhuzamosság, ismétlés, időtúllépés — L1 részben megmaradt, L4 tesztfedési rés.** A DB-s párhuzamos foglalási, időtúllépési és pótlási esetek zöldek. A `created_at` visszaolvasása nem változtatja meg a címzett foglalását, de a sor létrejötte előtti hibát nem oldja meg.
7. **Tesztminőség — talált hiba: L3, L4.** A meglévő teszteket a diff nem gyengíti. A helyettesítő dátumlogikával kipróbáltam, hogy a két új DB-assert átenged egy nem bájtazonos első próbát; valódi kódmutáció nem futott. A DB-idő használatát a végrehajtási terv nem részletezi; nem találtam új tulajdonosi elfogadási feltételt a javító commitban.
8. **Levél és más hívók — új regressziót nem találtam.** A base-szel összevetve a tárgy, a tanuló, az évfolyam és az eredmény meglévő sablonsorai változatlanok (`source/shared/lesson-result-email.ts:129–141`), a dátumsor szándékos eltérés. A szerveres gyakorlat nem állít be `meta`-t (`source/server/lesson-result-email.ts:227–231`); az S4 mérés csak a pontozott sorokat kapja (`:206–212`).
9. **Egyéb — új blokkoló nem igazolódott.** Megnéztem a meglévő sorok újraolvasását és a telepítési sorrendet. A B1a kliensdiff nélkül elfogadja az új alakot; a B1b telepítési feltétele dokumentált. A két éles fájlban összesen 31 beszúrt és 7 törölt sor van a szűrt diffstat szerint, a szeletkereten belül.

## Mit próbáltam megtörni, és nem sikerült

- Régi, időmező nélküli beküldés; ismeretlen mező és hamis pontszám; meglévő tárgyképzés és HTML-escape: a célzott tesztek zöldek.
- Párhuzamos azonos kör, lefagyó küldő és címzettenkénti pótlás eldobható PostgreSQL-en: a követett tesztek nem jeleztek dupla küldést vagy beragadt foglalást.
- Korhatár: a leválasztott próba pontosan 400 napot még engedett, 400 nap + 1 ms-ot és a referenciához képest +1 ms-ot már nem; az egyenlőségi kivétel L1.

## Mit NEM vizsgáltam

- Éles Resend, e-mail-kliensek és telepítésen átnyúló újrapróba: a szolgáltató azonos kulcsú, eltérő tartalomra adott reakciója **UNVERIFIED**. A képernyőképek helyi Chromium-minták, nem kézbesített levelek.
- Nem futott saját, teljes POST→DB→levél próba az új mezőkkel, DB-kiesés injektálása az első írás elé, illetve kódmutáció a valódi DB-csomagon. A saját Node-próbát a futtató hálózati sandbox-hiány miatt visszautasította. Ezért az L1 időmodelljét és az L4 assertjeit csak leválasztva mértem.
- Nem ellenőriztem a fej külső `gate:push` státuszát, az éles telepítési sorrendet, illetve a későbbi B1b–B8 szeleteket. Régi HTML-anyagon nem küldtem tényleges eredményt; a külön útvonalat kódban követtem.

## Megcáfolt gyanúk

- **Az új időformázó mindig az újrapróba percét használja.** Meglévő sornál nem: az `ON CONFLICT DO NOTHING` után ugyanaz a `created_at` kerül a sablonhoz. Ez nem bizonyítja a teljes levél változatlanságát eltérő bemenet vagy szerkesztett lecke esetén.
- **A DB-oszlop miatt új migráció kell.** Nem: a mező a base-ben is létezik, és a valós migrációból létrehozott eldobható DB-vel az integrációs futás zöld.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-result-email-date.test.ts` — 3/3; majd `npx tsx --test source/tests/lesson-result-email.test.ts source/tests/lesson-result-email-date.test.ts source/tests/learner-attribution.test.ts` — 15/15.
- `npx tsc --noEmit -p tsconfig.test.json` — exit 0.
- `run_db_tests` (`npm run test:learning-db`) — 259/259, PostgreSQL 17, eldobható DB.
- `run_e2e source/tests/lesson-result-email.spec.ts source/tests/lesson-result-email-quiz.spec.ts` — 3/3 Chromium; a specek elfogják az eredmény-POST-ot, nem ellenőrzik a levelet.
- `node .blind-review-tmp/b1a-date-review.mjs` — a futtató visszautasította, nem futott.
- `run_browser_scenario .blind-review-tmp/b1a-review-browser.json` — 2 eset; UTC-határok, késleltetett beszúrás időmodellje és a tesztfeltétel ellenpéldája. Megnéztem az álló `1-level-allo.jpg` és a fekvő `2-level-fekvo.jpg` mintát.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 1 | 1 | 0 | 1 | 0 |
| kicsi | 3 | 3 | 0 | 2 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) A „Beküldve” a sor létrejöttének ideje, nem a beküldésé — `source/server/lesson-result-email.ts:126` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 15 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2396
- tokenek: 917649 bemeneti (ebből gyorsítótárból: 822141, gyorsítótárba írva: 95463), 10221 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 90.6%; becsült megtakarítás: 3.0287 USD
- költség (a tényleges usage alapján): 0.4232 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
