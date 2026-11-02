# Pontozó: az angol tagadás (n't) felismerése — a „Where I Live” lektor-megállás gyökéroka

Állapot: tulajdonosi kérés 2026-10-19/20 („figyeld a gyártást”). A gyártás e1f59f8d (Where I Live) a 3. lektorkörben megállt.

## Mérés (éles, csak olvasva + helyi próba a valódi pontozóval)
- **A lektor blokkolója mindhárom körben:**
  - tasks[28] „Write the rules at the swimming pool in English with mustn't.” — minta: „You mustn't run. You mustn't eat or
    drink.”;
  - tasks[31] „You mustn't touch the artwork.”;
  - a rossz „You must run. You must eat.” válasz teljes pontot kap.
- **Helyi próba:**
  - a lektor által javasolt rubrikával (`[["mustn't","mustn","mustnt"],["run"],["eat","drink"]]`, „must” NÉLKÜL) is
    `evaluateOpenAnswer("You must run. You must eat.") = 1`;
  - a modell tehát a rubrikával nem javíthatta — a hiba kijavíthatatlan volt, a lecke a 3. körben megállt.

## Gyökérok (fájl:sor)
- **A tagadás szétesése:** `shared/lesson-experience-score.ts` `normalizeAnswer` az aposztrófot elhagyja: „mustn't” → „mustn t”.
- **A téves egyezés:** a `wordHit` szótő-egyezése ≥ 4 betűnél levág EGY magyar toldalékot (`STEM_SUFFIXES`, benne „n” és „t”).
  Így `stem("mustn") = "must"` és `stem("mustnt") = "mustn"`, vagyis a „must” egyezik a „mustn” alternatívával.
- **A tagadásőr csak egy irányban figyel:** a `hasUnexpectedNegation` csak azt nézi, ha a VÁLASZBAN van „nem/not”, a mintában
  nincs. Az angol összevont tagadást (n't) egyik irányban sem ismeri fel. Ezért:
  - „You must run” ↔ minta „You mustn't run” → 1 pont (hamis);
  - „You mustn't buy a ticket” ↔ minta „You must buy a ticket” → szintén 1.
- **A HTML-oldali pár ugyanígy hibás:** a `server/ai/lesson-html-spec.ts` `ee_evaluate` referenciapontozója paritásban van
  (`tests/lesson-html-score.test.ts`).

## Cél
1. **Közös `hasNegation(tokens)`:**
   - „nem” vagy „not”;
   - VAGY angol összevont tagadás: „t” token közvetlenül egy „n”-re végződő token után („don t”, „can t”, „mustn t”, „isn t”);
   - VAGY aposztróf nélküli alak a zárt listából: dont, doesnt, didnt, cant, couldnt, wont, wouldnt, shouldnt, mustnt, isnt,
     arent, wasnt, werent, hasnt, havent, hadnt, neednt.
2. **Kétirányú tagadásőr** (v1 és v2):
   - a válaszban tagadás van, a mintában nincs → 0,5 (eddig is, most az n't is számít);
   - **ÚJ:** a mintában ANGOL tagadás (not / n't) van, a válaszban semmilyen tagadás nincs → 0,5.
   - A magyar „nem” fordított iránya nem változik: a magyar tagadás más szóval is kifejezhető („tilos”, „sosem”).
3. **`ee_evaluate` (HTML-referencia):** ugyanez, paritásban.
4. **`OPEN_ANSWER_RULES_HU` 4. pontja:** leírja a kétirányú szabályt. A bank és a lektor ugyanezt a szabályt látja.

## Nem-cél
- **A szótövezés és az elütéstűrés:** nem változik, mert a magyar pontozás erre épül.
- **Régi, beágyazott pontozójú HTML-leckék:** saját kódjuk van; nem nyúlunk hozzájuk.

## Edge case-ek
- **Teljes pont marad:**
  - „You must not run” ↔ minta „You mustn't run” (mindkettő tagadó);
  - „You can't swim” ↔ minta „You cannot swim” → „cannot” nincs a listán, a mintában így nincs tagadás, a válaszban van → 0,5.
    Ezért a „cannot” is a listára kerül.
- **Magyar szöveg:** önálló „t” token aposztrófos tagadás nélkül gyakorlatilag nem fordul elő.

## Elfogadás (EARS)
- **Hiányzó tagadás:** HA a minta „You mustn't run”, a válasz pedig „You must run”, AKKOR a pontszám 0,5 (nem 1).
- **Fölösleges tagadás:** HA a minta „You must buy a ticket”, a válasz pedig „You mustn't buy a ticket”, AKKOR 0,5.
- **Egyenértékű tagadás:** HA mindkettő tagadó (n't / not / cannot), AKKOR a pontszám változatlan.
- **Paritás:** a HTML-referencia (`ee_evaluate`) ugyanazt adja.
- **Régi viselkedés:** a meglévő tesztek zöldek.
