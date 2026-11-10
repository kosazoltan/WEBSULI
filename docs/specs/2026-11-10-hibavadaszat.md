# Spec: hibavadászat — megerősített hibák javítása (kliens, közös logika, szerver, régi Safari)

> Dátum: 2026-11-10 · Állapot: **JÓVÁHAGYVA (tulajdonosi utasítás, 2026-11-10: „bármilyen egyéb hibát találsz a programban,
> autonóm módon javítsd!”)**
> Végrehajtás: `docs/specs/2026-11-10-hibavadaszat-vegrehajtas.md`.

## Módszer
Három olvasó alügynök (szerver, leckefuttató kliens, közös logika) jelöltjeit a fő modell a forrásból egyenként ellenőrizte.
Ide csak a megerősített hiba került; a nem igazolható vagy eszközpróbát igénylő jelölt a „Nem cél” alatt áll, indokkal.

## Mért tények és javítások

### A szelet — kliens és közös logika
- **A1 · a tartalék hang fülváltás után is szól.** `LessonExperienceView.tsx:89` fülváltáskor közvetlenül
  `speechSynthesis.cancel()`-t hív; a szerver-MP3 (`activeFallback`) és a 3 mp-es őr él tovább → a hang a Kvíz fülön is szól,
  vagy ott indul el. Javítás: a `stopSpeech` exportálva, a takarítás azt hívja.
- **A2 · megszakítottnak jelzett ÚJ kimondás után csend.** `ExperienceSpeech.tsx:142`: ha a motor az új, még el nem indult,
  még aktív kimondásra `interrupted` / `canceled` hibát ad (Android Chrome, `cancel()` utáni azonnali `speak()`), a kód puha
  hibának veszi: se hang, se üzenet. Javítás: puha hiba csak akkor néma, ha a kimondás már elindult; különben tartalék.
  (A valódi megszakítás — új gomb, fülváltás — előbb `settled`-re állítja a régi kimondást, azt a hibaág nem éri el.)
- **A3 · a lassan induló hangot az őr levágja.** Az őr csak az `onstart` eseményt számolja indulásnak. Javítás: az
  `onboundary` is indulásnak számít; nem helyi (hálózati) hangnál (`voice.localService === false`) az őr 6 mp.
- **A4 · iOS-en a hálózati hiba nyers angol szöveg.** `lib/queryClient.ts:221, 236`: a hálózati hiba felismerése
  `TypeError` + `message.includes('fetch')`; a WebKit üzenete „Load failed”. Javítás: a `fetch` minden `TypeError`-ja hálózati hiba.
- **A5 · a párosító feladat két oszlopa azonos sorrendű.** `blocks/try-blocks.tsx:219–250`: a helyes pár mindig ugyanabban a
  sorban áll, a feladat gondolkodás nélkül megoldható. Javítás: a jobb oszlop megjelenítési sorrendje a párok szövegéből
  képzett maggal kevert (`optionOrder`), az azonosító az eredeti index marad (a mentett állapot változatlan). Ha a keverés az
  eredeti sorrendet adná (és 2-nél több pár van), eggyel elforgatva jelenik meg.
- **A6 · a mértékegység-ellenőrzés előtagra is igazat ad.** `shared/answer-value.ts` `unitPresent`: jobb oldali határ nélküli
  részlánc-keresés. Mérve: elvárt `5` + `m` → az „5 mm”, „5 másodperc”, „5 m²” helyesnek számít. Javítás: a mértékegység után
  nem állhat betű, számjegy vagy kitevő (`²`, `³`, `^`).
- **A7 · az értesítésre koppintás mindig új lapot nyit.** `client/public/service-worker.js:200`: az abszolút `client.url` a
  relatív `'/'` értékkel hasonlítódik össze. Javítás: a cél URL feloldása a `self.location.origin`-hez.
- **A8 · a hírlevél tárgya félbevágott emojit kaphat.** `shared/newsletter.ts:40`: `slice(0, 69)` szétvághat egy
  helyettesítő párt. Javítás: kódpont szerinti vágás.
- **A9 · az előnézet eszköztára vízszintes görgetősávot okoz (utólagos tétel, 2026-11-10, a Kanban #1 élesítésének
  böngészős próbáján mérve).** `client/src/pages/Preview.tsx:198`: a cím + három gomb csoportja `flex-1 min-w-0`, ezért a
  sortörés helyett a tartalma alá zsugorodik, és a `shrink-0` gombok kilógnak. Mérve élesben 847 px széles ablakban:
  `scrollWidth` 852 a 825 px `clientWidth` mellett, a „Másol” gomb jobb széle 852. Javítás: a csoportról lekerül a `min-w-0`,
  így ha nem fér ki, a `flex-wrap` új sorba teszi (élő DOM-próbán: `scrollWidth` 825, a csoport a második sorban 30–750).

### B szelet — szerver
- **B1 · kezeletlen aszinkron hiba leállítja a szervert.** Express 4 + Node 24: a `try` nélküli `async` kezelő elutasított
  ígérete kezeletlen marad, a folyamat kilép; `unhandledRejection` kezelő nincs. Érintett: `studio/lesson-routes.ts` nyilvános
  kezelői (44, 81, 104, 156, 248. sor körül), `routes.ts` `GET /api/learner/view/:materialId` és
  `POST /api/admin/daily-reminders/run`. Javítás: `asyncRoute` burkoló (hiba → `next(err)`), és végső védőhálóként
  `process.on('unhandledRejection')`, amely naplóz és nem lép ki.
- **B2 · a napi megtekintés-összesítő UTC szerint fut.** `dailyViewSummary.ts`: a cron időzóna nélküli, az ablak
  `setHours(0,0,0,0)` (a Renderen UTC) → a levél 21 / 22 órakor megy, és a 20:00 utáni megtekintések egyik levélbe sem kerülnek.
  Javítás: `timezone: "Europe/Budapest"`, az ablak a tervezett budapesti 20:00-hoz rögzítve (előző nap 20:00 → ma 20:00).
  Review #413: a határ nem a futás tényleges pillanata — a cron naponta eltérő késése így nem okoz hézagot vagy átfedést.
- **B3 · megmaradt `req.ip` kulcsok.** `routes.ts` (megtekintés-ismétlésvédelem, eredménybeküldés kulcsa és `ip` mezője),
  `lesson-result-email.ts:118, 126`: a C-25 szerint a `req.ip` váltakozó közbenső cím. Javítás: `clientIpKey(req)`.
- **B4 · nem létező anyaghoz írt hozzászólás 500.** `POST /api/materials/:id/comments`: nincs létezés-ellenőrzés → idegen kulcs
  hiba. Javítás: 404, mint a kedvelésnél.
- **B5 · tört osztályszám 500.** `routes.ts` feliratkozás és extra címek: `typeof c === 'number'` → `1.5` átmegy, az `integer[]`
  oszlop elutasítja. Javítás: `Number.isInteger`.
- **B6 · az átrendezés félig alkalmazódhat.** `routes.ts` reorder: a `displayOrder` csak `number`-ként ellenőrzött. Javítás:
  egész, int32 tartomány előre ellenőrizve (400); a gyorsítótár érvénytelenítése hiba esetén is (`finally`).
- **B7 · a döntőbíró napi kerete UTC nap szerint vált.** `arbiter/routes.ts:63` `CURRENT_DATE`. Javítás:
  `(now() AT TIME ZONE 'Europe/Budapest')::date`.

### C szelet — régi Safari (iOS 16.4 előtt)
- **C1 · a lecke be sem töltődik.** A visszatekintő (`(?<!…)`, `(?<=…)`) reguláris kifejezés literált a 16.4 előtti Safari
  szintaktikai hibának veszi; a hibás darab (chunk) egésze nem fut. Mérve a 2026-11-03-i buildben: `LessonRuntime-*.js` 3,
  `option-key-*.js` 1, `game-quiz-contract-*.js` 12 előfordulás. A repó ezt már ismeri (`lesson-experience-score.ts`, review #348).
  Javítás: a kliensből elérhető modulokban (`shared/option-order.ts`, `option-key.ts`, `lesson-block-label.ts`,
  `lesson-experience.ts`, `single-choice-check.ts`, `client/src/data/wordLadder/validate.ts`) azonos jelentésű, visszatekintés
  nélküli minta; forrásőr-teszt, amely a kliens importgráfját bejárva tiltja a visszatekintést.

## Nem cél (indokkal)
- **iOS hangfeloldás** (a tartalék `play()` a koppintáson kívül): valódi iPhone nélkül vakon nem módosítható úgy, hogy a működő
  böngészőhang ne sérülhessen. Eszközpróbát igényel.
- **Sok 3D-blokk → WebGL-kontextus kimerülése**: nem igazolt, eszközfüggő.
- **Az eredménybeküldés újrapróbálása hálózati hibánál**, **a sorozat 60 napos felső határa**: viselkedésbővítés, nem hiba.
- **A szerveroldali (kliensbe nem kerülő) visszatekintő minták**: a Node támogatja.
- Meglévő teszt gyengítése, átírása.

## Edge case-ek
- A5: 1 pár (nincs mit keverni), 2 pár (a csere megengedett, az elforgatás nem kötelező), visszaállított mentés (indexek).
- A6: „5 m.”, „5 m,” „5 m)” továbbra is helyes; „5m” helyes; „5 m/s” az `m` egységre nem helyes; a `m²` egységre az „5 m²” helyes.
- B2: óraátállítás napja (23 / 25 órás ablak, átfedés és hézag nélkül).
- C1: minden átírt minta a meglévő tesztekkel azonos eredményt ad; a találat szövegét használó helyeken (`matchAll`, `split`)
  a csoportindexek igazodnak.

## Elfogadási feltételek (EARS)
- **H1** Amikor a tanuló fület vált vagy elhagyja a leckét, a rendszer leállítja a böngészőhangot, a tartalék hangot és az őrt.
- **H2** Ha a motor az el nem indult, aktív kimondásra megszakítás-hibát ad, a rendszer a tartalék hangot játssza le.
- **H3** Amikor `fetch` hálózati hibát dob (bármely `TypeError`), a rendszer a magyar hálózati hibaüzenetet adja, és újrapróbálható hibának tekinti.
- **H4** Ahol a párosító feladatnak legalább 3 párja van, a jobb oszlop sorrendje eltér a bal oszlopétól; a párosítás és a mentés az eredeti indexekkel működik.
- **H5** Ha az elvárt mértékegység `m`, a rendszer az „5 mm”, „5 másodperc”, „5 m²” választ nem fogadja el, az „5 m”, „5m”, „5 m.” választ igen.
- **H6** Amikor a felsorolt kezelők adatbázis-hibát kapnak, a rendszer 500-as választ ad, és a folyamat fut tovább.
- **H7** A napi összesítő budapesti 20:00-kor fut, és az előző futás óta eltelt megtekintéseket tartalmazza.
- **H8** Nem létező anyaghoz küldött hozzászólásra a rendszer 404-et ad; tört osztályszámra és nem egész sorrendre 400-at.
- **H9** A kliens importgráfjából elérhető forrásfájl nem tartalmaz visszatekintő reguláris kifejezést (forrásőr-teszt).
- **H10** A teljes meglévő tesztkészlet változtatás nélkül zöld.
