# Tételgyár — a bank és a lektor együttműködésének új módszertana (2026-10-15)

Tulajdonosi kérés (2026-10-15): „Keress egy új megközelítést a bank és a lektor együttműködéséről, mert folyamatosan ott buknak el a
tananyagkészítések … teljesen más nézőpontot, módszert … hogy ezt a folyamatosan ismétlődő hibát végleg a gyökérokok szintjén megszüntesd.”

Állapot: **1. fázis (terv), döntésre vár** — a módszertani irányt és a szeletek sorrendjét a tulajdonos hagyja jóvá; utána végrehajtási
utasítás szeletenként (2. fázis), majd kód (3. fázis).

## 1. Mért helyzet (élő adatbázis, csak olvasás, 2026-09-24 – 2026-10-15)

- **37 Studio-gyártásból 12 készült el (32%).** A bukások legnagyobb csoportja a bank–lektor–kapu láncon:
  7 × „Hibás banktétel maradt a limiten → a kivétel után a bank a padló alá esik”, 2 × „bankcsomag a javítókör után sem jó”,
  2 × „a megalapozatlan blokk kivétele után a bank nem felel meg”, 4 × lektori bankhiba (pl. „a 3. opció is helyes”, „a required…”),
  1 × lektor-bizonyíték eltérés (job `416ad01d`, ma).
- **911 blokkoló lektor-/bank-ellenőri jegyzet a banktételeken** (tasks 517, quiz 310, methods 84). Kulcsszavas besorolás:

  | Hibaosztály | db | arány |
  |---|---:|---:|
  | pontozó-rubrika: kötelező szócsoport, szinonima, ragozás, írásmód | 339 | 37% |
  | kvíz: több helyes / nem egyértelmű opció | 193 | 21% |
  | számolás / aritmetika | 111 | 12% |
  | mintaválasz ↔ rubrika / minWords ellentmondás | 110 | 12% |
  | egyéb (pl. a kérdés nem kéri a kötelező szót) | 91 | 10% |
  | tényhiba / forrásnak ellentmond | 37 | 4% |
  | tanításhoz / fogalomhoz kötés | 30 | 3% |

  (A besorolás kulcsszavas, durva — a nagyságrend a lényeg, nem a pontos arány.)
- **A ma élőben látott minta** (job `416ad01d`, Render-napló): a kapu javítóköre a `tasks[7]`-et két körben sem tudta javítani, mert
  „a pontozó a required ÉS-csoportokat sorrendtől függetlenül értékeli” — a feladat sorrendet kér, amit a pontozó elvből nem tud mérni.
  A bankmodell több tételt „szó szerint változatlanul visszaadott”, egy javításnál a `sourceHash`-t hibásan gépelte újra.
  A #224 részleges javítás után (3 javítva, 1 kivéve) a végkapu azért bukott, mert **a lektor-bizonyíték az egész leckéhez kötött**
  („a lektorált bemenet eltér a mostanitól”); a bizonyíték-lenyomat bemenetében a fogalmak lekérdezése `ORDER BY` nélküli
  (`createDrizzlePipelineStore().loadMap`, `loadBlockerNotes`) — mérve: a rendezett és rendezetlen sorrend eltér.

## 2. Gyökérokok (a tünetek mögött)

- **G1 — A modell programot ír, nem feladatot.** A nyílt feladat pontozója (`shared/lesson-experience-score.ts`, v1) szózsák-illesztő:
  a modellnek előre fel kell sorolnia minden elfogadható ragozott alakot, szinonimát és írásmódot (`required` ÉS-csoportok, `minWords`).
  Ez magyar nyelven nem írható meg hibátlanul egy lépésben → a hibák közel fele (339 + 110) nem tartalmi, hanem „pontozóprogram-hiba”.
- **G2 — A feladat formája meghaladja a pontozó képességét.** Sorrend (H31: a kódban dokumentált „sorrend- és törtvak illesztés”),
  osztályozás, párosítás szabad szövegben — ezek javíthatatlanok, a javítókör végtelenül pattog. A sorrendhez van strukturált forma
  (`methods` `sorting` / `timeline` / `causeEffect`), csak nincs kötelező útválasztás.
- **G3 — Vélemény-alapú ellenőrzés, átírás-alapú javítás → nem konvergál.** A lektor és a bank-ellenőr modell „szimulálja” a pontozót
  és talál rést; a bankmodell újraírja a tételt, ami új rést nyit vagy változatlan marad. Nincs determinisztikus, megismételhető ítélet.
- **G4 — Fix padló tartalék nélkül.** A bank pontosan a padlóra (45 / 75) épül; minden javíthatatlan tétel kivétele a padló alá viszi
  → az egész lecke elbukik egy-két rossz tétel miatt.
- **G5 — Egész-lecke bizonyíték.** A lektori ítélet a teljes lecke lenyomatához kötött; bármely tétel javítása/kivétele érvényteleníti,
  és a lenyomat bemenete nem determinisztikus sorrendű.
- **G6 — Számot és egyértelműséget modell „becsül”.** Az aritmetikát (111) a modell számolja; a kvíz egyértelműségét (193) utólag,
  véleményből ítéli egy másik modell.

## 3. Új nézőpont: „Tételgyár” — generál → tesztel → válogat (a szoftvertesztelés módszertana a feladatbankra)

A bankot nem „megírjuk és addig javítjuk, míg a lektor elfogadja”, hanem **tételgyárként** kezeljük: minden tétel egy kis program,
amelynek **végrehajtható tesztjei** vannak, a gyár **túltermel**, és a kapu csak **zöld tesztű** tételt enged át. A modell véleménye
helyett a **valódi pontozó ítél** a modell által generált tesztválaszokon. Hét elem, a gyökérokokhoz rendelve:

1. **Rubrika-fordítás (G1).** A modell a nyílt feladathoz *kulcsgondolatokat* ír egyszerű nyelven (fogalom + a tanítás pontos szava),
   a program **fordítja** pontozóvá: szótövesítés a meglévő `STEM_SUFFIXES` szerint, ékezet-/kötőjel-/egybeírás-változatok, a tanítás
   saját szóalakjainak automatikus felvétele. A mintaválasz **konstrukció szerint** átmegy a saját rubrikáján (a fordító ellenőrzi).
2. **Válaszkulcs-tesztek (G3).** Tételenként egy *tesztíró* (olcsó modell) generál: 4–6 helyes parafrázist (eltérő ragozással,
   szórenddel, írásmóddal) és 3–5 rossz választ (a tévhit, a fordított irány, a hiányos válasz). A **valódi pontozó** futtatja őket;
   a tétel csak akkor elfogadott, ha minden helyes „ok” és minden rossz „fail/partial”. A bukó teszteset konkrét, megismételhető
   javítási bemenet (nem vélemény). A tesztek a tétel mellé mentődnek — a lektor és a kapu ugyanazt futtatja újra, modellhívás nélkül.
3. **Formátum-útválasztás (G2).** Típusrendszer a feladatformákra: „sorrend / idővonal / ok-okozat lánc” → `methods.sorting|timeline|causeEffect`;
   „párosítás / csoportosítás” → strukturált módszer; szabad szöveg csak egy-két kulcsgondolatos magyarázatra. A szerződés és egy
   determinisztikus őr tiltja a sorrendet kérő szabad szöveges feladatot (pl. „sorold fel … sorrendben” + nyílt `tasks`).
4. **Számolás programból (G6).** Számolós tételnél a modell a *műveletet* adja meg (kifejezés + bemenetek), az értéket egy kis
   kiértékelő számolja (`typedAnswers` a meglévő v2 pontozóval); a magyarázat számai a kiértékelt értékből töltődnek.
5. **Kvíz vak megoldása tételenként (G6).** Generáláskor egy független modell kulcs nélkül megoldja a kvízt és jelzi, ha két opciót is
   védhetőnek tart; eltérésnél a tétel nem kerül a bankba (nem javítjuk — van tartalék, lásd 6.).
6. **Túltermelés és válogatás (G4).** Fejezetenként ~130% tétel; a gyár a zöld tesztűekből választ a bankterv kvótái szerint.
   A bank-tételt a lektor és a kapu **nem javítja**, csak **kiveszi**; a tartalék miatt a padló nem sérül. A javítókörök
   (bank-only lektor kör, kapu-javítás) megszűnnek → kevesebb modellhívás, nincs pattogás.
7. **Tételszintű bizonyíték (G5).** A lektor a tanítást és tételmintát ítéli; az ítélet lenyomata tételenként (tétel-tartalom hash) és
   a tanításra külön készül, a lenyomat bemenete determinisztikusan rendezett. Tétel kivétele csak a saját bizonyítékát érinti.
   A lektor szerepe szűkül: tény- és tanításhelyesség; a bank-mechanikát (pontozhatóság) a gyár tesztjei viszik.

## 4. Nem-cél

- A gyerek felülete és a pontozó v1 viselkedése a **régi** leckéken nem változik (a régi leckék pontozása bájtra azonos marad).
- A publikálási mérce (45/75 padló, tényhelyesség, egyválasztósság) nem lazul — csak a hozzá vezető út változik.
- Nem cél a lektor teljes megszüntetése: a tanítás tényellenőrzése marad modellfeladat.

## 5. Szeletek (mindegyik önálló PR, mérés az alapvonalhoz)

| Szelet | Tartalom | Várt hatás (mért osztályok) | Kockázat |
|---|---|---|---|
| **T0 — Determinisztikus bizonyíték** | `ORDER BY` a lenyomat bemeneteiben; tételszintű bizonyíték (7.); a #224 kapu-javítás után nem bukik a végkapu | „lektor-bizonyíték eltérés” 1/37, a `416ad01d` publikálható | alacsony |
| **T1 — Túltermelés + válogatás** | 130%-os bank, kivétel javítás helyett; bank-only kör és kapu-javítás kikapcsolása kapcsolóval | „limit → padló alá” 7/37 + 2 + 2 | közepes (token +20–30%) |
| **T2 — Válaszkulcs-tesztek** | tesztíró + valódi pontozó tételenként; a lektor/kapu újrafuttatja | rubrika 339 + minta 110 jegyzet | közepes |
| **T3 — Rubrika-fordító** | kulcsgondolat → rubrika program; minta konstrukció szerint zöld | rubrika-osztály tovább csökken | közepes |
| **T4 — Formátum-útválasztás** | sorrend/párosítás → strukturált módszer; őr a szabad szövegre | a javíthatatlan „sorrend” osztály | alacsony |
| **T5 — Számolás programból** | kifejezés-kiértékelő, `typedAnswers` | aritmetika 111 | közepes |
| **T6 — Kvíz vak megoldás tételenként** | generáláskori vak ellenőrzés | kvíz-egyértelműség 193 | alacsony |

Ajánlott sorrend: **T0 → T1 → T4 → T2 → T6 → T5 → T3** (a gyors, biztos nyereség előre; a nagyobb átépítés mérés után).

## 6. Mérés és elfogadás (EARS)

- Alapvonal: 32% sikeres gyártás (12/37), 911 bank-blokkoló / 21 nap. Mérés: a `scripts/measure/lesson-trial.mts` próbaharness ugyanazon
  forráskészleten (≥ 6 forrás, vegyes tárgy, köztük matematika és környezetismeret), alapvonal vs. változat, szeletenként.
- E1: HA T0 élesben van, AKKOR a `416ad01d` a felületről folytatva publikál (vagy pontosan megnevezett, nem bizonyíték-eredetű okkal áll meg).
- E2: HA T0–T1 élesben van, AKKOR a próbakészleten a bank-eredetű megállás 0, a sikerarány ≥ 70%.
- E3: HA T0–T4 + T2 élesben van, AKKOR a bank-blokkoló jegyzetek száma gyártásonként ≥ 60%-kal csökken az alapvonalhoz képest.
- E4: Minden szeletnél a régi leckék pontozása változatlan (v1 paritás-tesztek zöldek), a gyerekfelület nem változik.

## 7. Tulajdonosi döntések (2026-10-15)

- **D1 — Túltermelés: 130%** (a bank lépés +20–30% tokenköltsége elfogadva a javítókörök megszűnéséért).
- **D2 — A szabad szöveges feladat MARAD** (a sorrend/párosítás nem kötelezően strukturált). Helyette két új elem (tulajdonosi javaslat):
  - **T4′ — Magyar rokonértelmű-szó és kifejezés adatbank („nyelvi memória”):** előre programozott szinonimák, rokon értelmű
    kifejezések, ragozott és írásmód-változatok, amelyekkel a pontozó a nem szó szerint egyező, de helyes választ is elfogadja.
    A rubrika-fordító (T3) és a pontozó ugyanazt az adatbankot használja; bővítése mért eseteken (a válaszkulcs-tesztek
    bukott helyes parafrázisai) történik.
  - **T7 — Döntőbíró a szöveges feladatokra: GPT-6.1 Sol API-n.** Ha a determinisztikus pontozó nem „ok”-t ad, a döntőbíró a
    feladat, a tanítás kulcsgondolatai és a mintaválasz alapján dönt (a sorrendet is meg tudja ítélni, ami a G2 osztályt kezeli).
    Rögzítendő a 2. fázisban: mikor hívódik (csak nem-„ok” választ), gyorsítótár (azonos feladat + normalizált válasz),
    költség- és sebességkorlát, kiesésnél a determinisztikus ítélet marad, adatminimalizálás (csak a válasz szövege, azonosító nélkül).
  - A T4 (formátum-útválasztás) ezzel **kikerül** a kötelező szeletek közül; a strukturált módszer ajánlás marad, tiltás nincs.
- **D3 — Sorrend: az ajánlott**, a D2 szerint módosítva: **T0 → T1 → T4′ → T2 → T7 → T6 → T5 → T3**.
- **D4 — T8: a lektor nyelvi memóriája és szemléletváltása** (tulajdonosi javaslat, 2026-10-15):
  - **Lektor-memória:** ugyanaz a magyar nyelvi adatbank (T4′), kiegészítve azzal, amit a lektor a futásokból *tanul*: szinonimák,
    rokon értelmű és azonos hangzású szavak, körülírások, és a valós tananyagszövegek megfogalmazási változatai. A lektor így nem
    jelöl hibásnak egy helyes, de nem az ő szóhasználatával írt szöveget vagy választ. Tanulási forrás: azok az esetek, ahol a lektor
    megfogalmazás miatt jelzett, de a válaszkulcs-teszt (T2) vagy a döntőbíró (T7) a szöveget helyesnek ítélte → egyenértékűségi
    bejegyzés. Meglévő alap: a tantárgyi memória (`server/memory/store`, `recordSubjectMemory`, spec 2026-10-06-s5) és a tanult
    szabályok (`lesson_skill_lessons`); a bejegyzések tantárgyhoz és évfolyamhoz kötöttek, forrás-bizonyítékkal.
  - **Lektor-skill és „lélek”** (`server/studio/role-skills.ts`, a szerep `soul` része): kis mértékű kiterjesztés egy jófej, megengedő
    pedagógus szemléletére — **a megfogalmazásban toleráns, a tényekben szigorú**. Blokkoló csak tényhiba, a forrásnak ellentmondó
    állítás, félrevezető feladat vagy pontozhatatlan tétel lehet; stílus, szóválasztás, szinonima, körülírás legfeljebb figyelmeztetés.
    A gondolkodási eljárás bővül: döntés előtt az egyenértékűség kérdése („a gyerek / a szöveg ugyanazt mondja-e más szavakkal?”),
    a nyelvi memória és a tanítás saját szóalakjainak ellenőrzése.
  - **Mérés:** promptváltozás csak a próbaharnessel (alapvonal vs. változat): a lektor blokkolóinak száma, a hamis blokkolók aránya
    (amit a T2/T7 helyesnek ítél), és a tényhibák kiszűrése nem romolhat (a meglévő tényhiba-esetek visszajátszása).
- **Módosított sorrend:** **T0 → T1 → T4′ → T8 → T2 → T7 → T6 → T5 → T3** (a nyelvi adatbank és a lektor-memória egymásra épül).
