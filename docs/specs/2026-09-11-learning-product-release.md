# Teljes tanulási folyamat kiadása

A tulajdonos 2026-09-11-én kifejezetten kérte a befejezést, lintet, push-t, merge-öt és deployt. A jóváhagyott `2026-09-10-lesson-learning-flow.md` folytatása; a korábbi részeredmények nem helyettesítik a kiadás ellenőrzését.

## Cél, hatókör

Forrásból készülő és javított, magyarul olvasható négylapos tananyag; forráshű interakció, rövid mentett gyakorlás, ellenőrzött játékjutalom és visszatérés. Az előző szerződés nyitott részei: játékbónusz és leckéhez kötött bank, dokumentumforrás és indokolt besorolás, döntési történet, a valós háromszög-jelölt forrásellentmondása, pedagógiai próbaterv, majd kiadás. Nem új platform vagy tömeges éles tartalomátírás; gyermekrésztvevős eredményt nem állítunk résztvevők nélkül.

Érintett csoportok: `source/server/rewards`, `server/studio`, `shared/schema.ts`, `shared/lesson-schema.ts`, kapcsolódó additív migrációk; öt kuponos játék, közös kérdés- és kuponadapterek; `lesson-runtime`, készítő/javító promptok, forrásfeldolgozók; célzott tesztek, közös módszer és két skill. A kiadás a repó GitHub CI, Vercel frontend, Render backend és Neon adatbázis meglévő útját követi, élő állapotellenőrzéssel.

## Elfogadás és szélső esetek

- Játékbónuszhoz a szerver kapja és ellenőrzi a választ; a hibás első válasz sem cserélhető később jutalomért. Párhuzamos kérés, idegen kupon, lejárat és bankcsere nem ad extra időt. A kiszolgált kérdésváltozat pillanatképe és az első válasz tárolt.
- A jutalomjáték az eredeti lecke teljes érvényes bankját eléri akkor is, ha nem a három legfrissebb anyag egyike. A kérdés témája, valamennyi 3–4 opciója és magyarázata megmarad. A szabad játék kupon nélkül működik; visszatérés az eredeti tananyaghoz.
- Dokumentum bináris/base64 adata nem idézetbizonyíték. A teljes kinyert szöveg és a forráshely megmarad; a bizonytalanság és vegyes besorolás látható. Az évfolyamot a program indokoltan állapítja meg.
- A döntési történet a tényleges tanításhoz kötött, validált adat; választásból következmény és magyarázat következik. Nincs generált végrehajtható kód vagy értelmetlen kör.
- A valós számpélda ellentmondása tanulói magyarázatban is megjelenik, az eredeti adatok megőrzésével. Alkalmazás csak mentett előállapot, tranzakció és visszaolvasás mellett.
- PASS célzott/DB tesztek, lint/typecheck/build, valódi Chrome álló/fekvő/asztali render és felhasználói út. GitHub PR, zöld kötelező CI, merge, egyező telepített commit, egészség- és anyaglekérdezés, éles böngészős visszaellenőrzés szükséges.

## Kockázat és visszaállás

A görgetésmentes vezérlés végső mérése 844×390-en négy menü indítógombját a képernyő alá helyezte: Matek sprint, Szólétra, Brain Rot, Aszteroida. A már jóváhagyott mobil cél részeként ezek menüje rövid fekvő nézetben kétoszlopos lesz. Érintett: négy oldal menüjelölése, közös `index.css`, meglévő hétjátékos viewport teszt. Elfogadás: indítás előtt nulla programozott görgetés, teljes indítógomb és legalább 44 px érintési méret; 390×844, 360×640, 844×390, 1366×768; a futó játék és lezáró képernyő nem változhat.

Push előtt rögzített kiadási alap és tiszta saját diff; az ismeretlen untracked fájlokat megőrizzük. Merge előtt a jelenlegi Vercel/Render verzió és adatbázis-visszaállási pont ellenőrzött. Additív sémát először eldobható PostgreSQL-en tesztelünk; rollbackkor a régi kód az új táblát/oszlopot érintetlenül hagyhatja. Régi szerverhez új kliens időleges eltérését nem fedjük el hamis mentési sikerrel. Titok nem kerül naplóba vagy commitba. Újabb szerkesztést helyreállítás sem írhat felül.
