# Kötelező WebSuli 7.4 minimum és tanulói használhatóság

## Cél és felhatalmazás

A tulajdonos 2026-09-12-i kötelező utasítása: a feltöltött Tananyag Készítő 7.4 tudása a minimum, webes forrásból érdemi oktatási többlet szükséges, az évfolyam a nyelvezetet, mélységet, feladatot és színintenzitást együtt vezérelje. A kisebbek színesebb, a nagyobbak visszafogottabb anyagot kapnak. Lint, push, merge és deploy ebben a sessionben engedélyezett. A külön végrehajtási utasítás után az implementáció indul.

## Mért előállapot

- `lesson-experience.ts` / `lesson-bank-plan.ts`: jelenleg fusion-7.4-3, 15/15 bankminimum, 3/5 vagy 5/10 kör; a referencia 45/75 bankot és 15/25 kört ír elő.
- `experience-builder.ts`: csomagonként pontosan két módszer, legfeljebb 30/30 kérdés. A tíz módszertípus nincs megkövetelve.
- `verify-lesson-method.ts`: HTML-szintaxis, bank, minta és négy panel jelenléte ellenőrzött; a tényleges tanítás tartalmi teljességét a HTML-út nem vizsgálja függetlenül.
- `lesson-experience.css`: a témák felülírják a korábbi korosztályos színeket. Az öt learning-age sáv főleg betűméretet szabályoz.
- A felhasználó nem tudta megjeleníteni a további szöveges kérdéseket. A konkrét HTML olvasható, helyi másolat: `tmp/lesson-quality-before.html`. A gyökérok a böngészős reprodukcióig UNKNOWN. Egy helyes válasz után négy kihagyásra adott elégtelen nem megfelelő figyelmeztetés nélküli lezárás.

## Hatókör, szeletek

1. HTML-kérdéslapozás reprodukciója és célzott javítása; hiányos kör lezárásának tudatos megerősítése HTML-ben és Studio-ban. Fájlok: `client/src/lesson-interactions.tsx`, `lesson-runtime/HtmlLessonTasks.tsx`, `HtmlLessonQuiz.tsx`, `LessonExperienceView.tsx`, a renderadapter szükség esetén `server/routes.ts`; célzott böngészőtesztek.
2. Verziózott 7.4 minimum: `shared/lesson-experience.ts`, `lesson-bank-plan.ts`, `lesson-experience-validation.ts`, `lesson-html-data.ts`, `lesson-skill.ts`, `runtime-knowledge.ts`; `server/studio/experience-builder.ts`, `server/improve/verify-lesson-method.ts`, `server/storage.ts` (alkalmazási kapu), `server/ai/lesson-html-spec.ts`. Új változat; a régi mentett anyagok továbbra is olvashatók, új publikáció nem használhat régi verziót a minimum megkerülésére. Csomagkvóták és módszerelosztás, a teljes bank tényleges validálásával.
3. Tanítási minőség: közös, konkrét ellenőrzési követelmények, HTML-tanítás és bank fejezet/fogalom összerendelése, a webes út független tartalmi ellenőrzése és korlátos javítóköre. Érintett: `server/studio/step-io.ts`, `web-research-agent.ts`, `web-research-runner.ts`, ellenőrző segéd és tesztek. A forrás, eredeti példák és összefüggések megtartandók; puszta szószám vagy modell által beírt PASS nem bizonyít minőséget.
4. Évfolyamhoz kötött vizuális profil: `shared/lesson-band.ts`, közös stílus, `lesson-runtime/lesson-experience.css`, HTML-adapter és HTML-prompt. Sávok 1–2, 3–4, 5–6, 7–8, 9+; helyi ékezetbiztos font, legalább 44 px vezérlő, természetes tananyaggörgetés. Minden tanítási fejezet alapból elérhető, összecsukás nélkül.
5. Közös készítő/javító skillek, futó runbook és `docs/lesson-improvement.md` összhangja; célzott és teljes ellenőrzés; kiadási napló, zöld CI, merge, deploy és éles visszaolvasás.

Az egyes lezárt szeletek önálló commitot kapnak. A közös tesztfixture-ök a dokumentált új szerződéshez igazíthatók; a régi verziók külön regressziói megmaradnak. Tesztgyengítés nincs.

## Nem-cél és korlát

Nincs auth-/adatbázisséma-változás, tömeges tananyagátírás vagy kitalált forrás. A korábbi jóváhagyott automatikus évfolyam-besorolás és helyi fontkiszolgálás megmarad. Az eredeti skill környezetfüggő Python/output-path utasítása nem az alkalmazás működési követelménye. A résztvevőkkel mért tanulási hatás külön vizsgálat; itt a működés és a tartalmi ellenőrzés bizonyítható. A már tárolt hiányos anyag a program kiadásától nem válik tartalmilag javítottá.

## Edge case-ek és EARS-elfogadás

- Amikor új tananyag készül vagy javítást alkalmaznak, legalább 45 egyedi szöveges feladat, 75 egyedi kvíz, mind a tíz módszertípus és legalább két kapukérdés legyen; a 15/25 kör minden kérdése megnyitható. Kevés forrás esetén a kapu hibát jelezzen, ne gyártson tanítatlan tölteléket.
- Amikor régi bankot olvas a program, őrizze meg a tartalmat és a mentett eredményt; új publikálási kapu ne minősítse azt automatikusan megfelelőnek.
- Ha a tanuló kérdést lapoz, a látható kérdés és a számláló együtt váltson; visszalépés, áttekintés, fülváltás és újratöltés ne veszítsen választ. Üres kérdés a lezárás előtt jól látható darabszámmal és folytatás/lelezárás választással jelenjen meg.
- Ha a HTML-ben hiányzik tanítás, fejezet vagy fogalomkapcsolat, a bank puszta megléte ne engedjen publikálást. A webes ellenőr a tényleges szolgáltatói forráskontextust és teljes jelöltet kapja; blokkoló hiba és ellenőrzési hiba után nincs sikeres mentés.
- Amikor az évfolyam nő, a háttér és dekoráció színessége csökkenjen; szemantikus jelölések és informatív ábrák maradjanak. 320/390 px mobil, fekvő és asztali nézetben ne legyen levágás, átfedés, vízszintes túlcsordulás vagy nem elérhető vezérlő.
- Az önkorrekció a konkrét mért hibát rögzítse, az alapkövetelményt nem csökkentheti; új módszerverzióhoz régi checkpoint nem használható.

## Kiadás és visszaállás

A korábbi éles Git-revízió, egészségválasz és tananyag-állapot rögzítendő. Visszaállításkor az új módszerverzió olvasóját meg kell őrizni, ha már készült ilyen tananyag; a régi kód önmagában nem tudja olvasni az új verziót. Éles adat alkalmazásakor külön mentés és feltételes visszaolvasás kell. A nyitott, korábbi untracked munkákat változatlanul megőrizzük.

## Valódi generálási próba alapján szükséges javítás

Az első teljes webes jelölt 1045,674 másodperc alatt, 103001 karakterrel elkészült. Két fejezethez hiányzott a második különböző módszer. Az egész HTML újragenerálása a 20 perces keretben megszakadt. Ez mért működési hiba, a minimum nem csökkenthető.

- Bankhiba esetén legfeljebb két célzott JSON-javítás engedett: elemazonosító szerinti csere vagy hozzáadás, törlés és más gyökérmező átírása nélkül. Az inert bankon kívüli HTML változatlan; a teljes kapu minden javítás után lefut. Szemantikai ellenőrzést a bankjavítás nem helyettesít.
- A kész szolgáltatói kör és ténylegesen letöltött forrásai szerveroldali workflow-checkpointba kerüljenek a minőségellenőrzés előtt. Folytatáskor a kész kör nem generálódik újra, a kapuk viszont megmaradnak. A nyilvános állapot nem tartalmazhat nyers szolgáltatói választ vagy forrásszöveget.
- A stream tétlenségi/időkorlátja a szerzői szakaszra vonatkozik; a célzott javító és lektor saját korlátos szolgáltatói időkeretet használ. Félbeszakadt javítás nem publikálható.
- Érintett: web-research-runner/jobs, új web-bank-repair segéd, célzott bank- és folytatási tesztek. A mentett kvízkör v4 esetén 25 elem; korábbi rövid kör eredménye megmarad, frissítés után új kör indul. A kapukérdések normalizált szövege is különböző legyen.
- A következő teljes ellenőrzés két téves szerkezeti követelményt is megmutatott: a feliratozott, több lépésből álló div-kártyasort a vizuális kapu nem ismerte fel; a bank közös program általi beolvasása mellett külön szerzői JSON.parse hívást várt. A szerzői JavaScript elhagyható, mert a routes → withLessonTypography → lesson-interactions.js út végzi a tényleges olvasást és renderelést (a teljes bank böngészőtesztje már ilyen, inline olvasó nélküli HTML-t vizsgál). A vizuális kapu SVG/kép/lista mellett felirattal ellátott, legalább két címkézett kártyából álló sort is fogadjon; puszta szöveg vagy üres figure továbbra sem elég. Az összes feltárható hiba egy ellenőrzésben jelenjen meg, a hibás bankfedettség ne rejtse el a mintaválasz és tanítás hibáit.
