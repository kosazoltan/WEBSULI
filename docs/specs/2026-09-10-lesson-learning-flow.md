# Egységes tanulási folyamat és magyar tipográfia

Állapot: jóváhagyott irány, megvalósítás alatt. A tulajdonos a döntési javaslat minden elemét elfogadta; a grafika és a magyar betűk javítását külön megerősítette.

## Cél és szerződés

A `2026-09-10-lesson-simplification-decision.md` B és C csomagja: forráshű, egyszerűbben előálló, változatos, mért és játékokhoz kapcsolt tanulás. A feltöltés, internetes készítés és javítás ugyanazt a módszert használja. A korábbi tananyag és bank olvashatósága megmarad.

Nem cél: új LMS, gráfadatbázis, válaszonkénti AI-hívás, önkényes éles tartalomtörlés, nem mért pedagógiai hatásosság ígérete. A gyermekes, késleltetett hatásvizsgálat protokollját elkészítjük; tényleges eredménye csak résztvevőkkel később mérhető.

## Szeletek, érintett fájlok

1. **Magyar tipográfia és látvány alapja:** `source/shared/lesson-typography.ts`, `source/client/public/fonts/`, `source/client/index.html`, `source/client/src/index.css`, `source/client/src/lesson-runtime/lesson-theme.css`, `lesson-experience.css`, `source/server/ai/lesson-html-spec.ts`, HTML megjelenítő és készítési/javítási szabályok. Csak a ténylegesen ellenőrzött Nunito, Source Sans 3 és Source Serif 4 engedélyezett. Saját kiszolgálás, teljes magyar karakterkészlet, normál és dőlt változat; a fontcsaládok változatossága nem helyettesíti a tartalmi ábrát.
2. **Közös bank:** `source/shared/lesson-experience.ts`, `source/server/gameQuizBankService.ts`, `source/server/studio/quiz-export.ts`, öt érintett játék és `useMaterialQuizzes`. Három és négy válasz, megfelelő index és magyarázat; másolatok helyett közös tételazonosság, régi rekordok kompatibilitása.
3. **Gyártás egyszerűsítése:** `experience-builder.ts`, `structured-improvement.ts`, `step-runner.ts`, `extractor.ts`, `auto-approve.ts`, `one-step.ts`, `lesson-pipeline-routes.ts`, közös promptok és admin Studio. Verziózott, fedettségi terv szerinti bank; célhoz illő módszerek; részenkénti újrahasználat és javítás; tartalomazonosság; forrásbizonytalanság látható. A tanítás teljessége nem azonos a kurált részlista fedettségével.
4. **Mérés, ismétlés, jutalom:** `source/shared/schema.ts`, `source/server/rewards/`, `source/server/studio/lesson-routes.ts`, `source/client/src/lesson-runtime/`, admin riport. Verzióhoz és tanulóhoz kötött szerveres kvízpróba; első válasz, újrapróba- és kuponkorlát; fogalmi hibák és esedékes ismétlés; vendégek helyi folytatása. Heurisztikus szóbeli pont nem hivatalos jegy vagy egyedüli jutalomalap.
5. **Tanulói élmény:** négy lap megőrzése, vezetett könyv és teljes áttekintés; szakaszhoz kötött módszer és próba; korosztályos (1–2 / 3–4 / 5–6 / 7–8) tipográfia és szerkesztés; csendes nézet; háromszög-labor és témához illő döntési történet; szabadon választható jutalomjáték és visszatérés.
6. **Tartós módszer és bizonyíték:** `docs/lesson-improvement.md`, `.agents/skills/tananyag-keszito/SKILL.md`, `.agents/skills/tananyag-javito/SKILL.md`, célzott és teljes tesztek, böngészőképek, végrehajtási napló.

## Edge case-ek

- A `latin-ext` URL-paraméter és egy tetszőleges fallback-lista nem bizonyítja a font karaktereit. A fájl cmap-ja, a valódi betöltés és a render is ellenőrzendő. NFC és bontott ékezetes Unicode, ő/Ő/ű/Ű, félkövér/dőlt, számok és matematikai jelek külön próbát kapnak. Sérült szövegkódolás nem javítható pusztán fontcserével.
- Blokkolt Google Fonts, lassú hálózat, zoom, hosszú cím, 320 px, álló/fekvő telefon: szöveg és vezérlő nem vágható le. Normál helyzetben lapozható feladat; nagyításnál szükséges függőleges görgetés megengedett.
- Régi módszerverzió, hiányzó experience, újragenerálás közben megnyitott lecke, ismételt beküldés, manipulált pontszám, megváltozott tétel, üres és kis forrás, vegyes évfolyam, olvashatatlan kulcsrész.
- Hasonló cím vagy más fotó nem automatikus azonosság. A módszer- és forrásverzió a cache szerződésének része.

## EARS elfogadás

- Amikor a fontellenőrző fut, minden engedélyezett normál/dőlt fájl lefedi az összes magyar kis- és nagybetűt, és a böngésző a csomagolt fontot használja Google nélkül is.
- Amikor három- vagy négyválaszos banktétel érkezik, a játék a teljes eredeti kérdést és válaszokat teszi játszhatóvá; nincs kitalált pótlóválasz.
- Amikor forrásból tananyag készül, a bank a tanított kulcsfogalmakat felidézéssel és alkalmazással ellenőrzi, a forráshiány pedig nem tűnik el automatikus elutasítással.
- Amikor egy lecke része javul, csak az érintett részek újragyártása szükséges; a felhasználás mérhető és dokumentált.
- Amikor a tanuló válaszol, a mentett mérés az adott verzióhoz kötött; újrajátszás nem ad többszörös jutalmat. A következő kör a még nem mért, hibás és esedékes fogalmakat előnyben részesíti.
- Amikor vezetett módban tanulnak, a magyarázat, releváns interakció és következő lépés elérhető, minden tudás megmarad a teljes áttekintésben.
- Valós böngészőben mobil álló/fekvő és asztali nézet: nincs vízszintes túlcsordulás, levágott ékezet, egymásra csúszó szöveg vagy elérhetetlen vezérlő.

## Kiadás és visszaállítás

Szeletenként helyi commit. Meglévő éles adatot nem írunk át tömegesen. Esetleges új táblák migrációját először izolált adatbázison és tranzakciós integrációs próbával ellenőrizzük; éles alkalmazás előtt mentés és verziós visszaállási terv. Push/deploy állapotot csak tényleges eredmény alapján jelentünk.
