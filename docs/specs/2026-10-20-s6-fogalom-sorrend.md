# S6 — a fogalmak sorrendje a nyílt feladat rubrikájában (sorrendi / műveleti sorrend feladatok)

Állapot: tulajdonosi döntés 2026-10-20 („Fogalmak sorrendje”, kérdés–javaslat kör a „Kéttagú kifejezések négyzete” futás után).

## Mérés (éles, 2026-10-20, „Kéttagú kifejezések négyzete – kifejezéskártyák”, job be3bd5d2)
- **A hiba:** „bankcsomag 2. fejezet, 3. kísérlet: s1-t1: válaszkulcs-teszt: a hibás (fordított irány) válasz »Először 4-gyel
  szorzunk, és csak utána emelünk négyzetre, mert a szorzás magasabb rangú művelet…« teljes pontot kap.”
- **A következmény:** a csomag mentőkörbe ment.
- **A jellege:** a szavak azonosak a helyes válaszéval, csak a sorrend fordított.

## Gyökérok
- **A pontozó sorrendvak:** `shared/lesson-experience-score.ts` `conceptHit` a fogalmat bárhol megtalálja, a sorrendet nem nézi.
- **A kifejezés magyarul törékeny:** a kifejezéses szabály (S5, `requiredPhrases`) pontos, egymás utáni szavakat kér, ami a szabad
  magyar szórendnél („először négyzetre emelünk” = „négyzetre emelünk először”) helyes választ is elutasítana. A gépi kifejezéses
  szigorítás ezért magyar leckén ki van kapcsolva (S5b).

## Cél
### S6a — sorrendi szabály a pontozóban és a szerződésben
- **Új, opcionális mező:** `requiredOrder: string[][]` — 2–4 fogalomcsoport (csoporton belül VAGY-alternatívák, mint a `required`).
- **A feltétel:** a válaszban mindegyik csoport megvan (a meglévő, tűrő fogalomillesztéssel), és az első előfordulásuk sorrendje
  szigorúan növekvő. A köztes szavak, a ragozás és a szórend máshol szabad.
- **Pontozás (v2):** a sorrend EGY kötelező feltételként számít a fele- és az összes-szabályba. Ha a sorrend nem teljesül, a válasz
  legfeljebb 0,5 pontot kap („Részben jó. A lépések / fogalmak sorrendje nem megfelelő.”).
- **Régi leckék:** mező nélkül változatlan (v1).
- **Pontozási verzió:** `ORDER_SCORING_VERSION = 5`, `LESSON_SCORING_VERSION = 5`. A csomagséma a sorrendi bankot 5 alatt elutasítja;
  a régi kliens frissítést kap.
- **Mindenhol, ahol a kifejezés (S5a) is megjelenik:**
  - J1: a megkülönböztethetetlen próba csak akkor nem blokkol, ha a sorrendet is teljesíti;
  - döntőbíró: kapja a sorrendet, a fordított sorrend nem lehet „ok”;
  - tesztíró: a sorrendi feladatnál fordított sorrendű hibás próbát is ír;
  - kulcsok (feltételesen): döntőbíró, `rubricHash`, tesztíró-gyorsítótár;
  - bank strict séma, javítási mezők, lektornézet, mezőleírás, a pontozó szerződése;
  - a minta-igazítás csoportpróbája;
  - a HTML-út a mezőt eltávolítja.
### S6b — gépi sorrend-szigorítás (minden nyelven)
- **Mikor fut:** ha a szó- (S3c) és a kifejezésalapú (S5b) szigorítás nem talál megkülönböztető elemet, a meglévő kötelező
  csoportokból keres egy párt.
- **A pár feltétele:**
  - a minta és MINDEN teljes pontos helyes válasz a két fogalmat ugyanabban a sorrendben tartalmazza;
  - a hibás válasz mindkettőt, de fordítva.
- **A felvétel:** `requiredOrder: [a, b]`, jelölés `tightenedOrder: true`; utána a minta / a helyesek ok, a hibás nem.
- **Csak ha a feladatnak még nincs sorrendi szabálya.**
- **S4-lánc:**
  - telemetria (`rubricTightened`), bankjavítás-öröklés;
  - a „csak a szigorítás miatt bukott” jel (ellenpróbával);
  - lazítás: a sorrendi feltétel fogalomcsoporttá alakul (a sorrendi csoportok és a többi kötelező fogalom tagjai) — a
    feltételszám változatlan, a pont nem csökken.

## Nem-cél
- Nyelvtani elemzés vagy modellalapú pontozás.
- A kifejezéses szabály (S5) magyar engedélyezése.

## Edge case-ek
- **Ismétlődő fogalom:** a válaszban az ELSŐ előfordulás számít.
- **Hiányzó csoport:** ha egy sorrendi csoport hiányzik, a feltétel nem teljesül (a hiányzó fogalmat a `required` amúgy is méri).
- **Helyes, fordított szórendű válasz** („a szorzás előtt négyzetre emelünk”): részpont.
  - A döntőbíró emelhet.
  - A gépi szabálynál az S4c mér és lazít.
  - A gépi szabály csak akkor kerül be, ha MINDEN tesztelt helyes válasz egyirányú.

## Elfogadás (EARS)
- HA `requiredOrder: [["négyzetre", "négyzet"], ["szoroz", "szorzunk"]]`, AKKOR az „Először négyzetre emelünk, utána szorzunk” teljes
  pont, az „Először 4-gyel szorzunk, utána emelünk négyzetre” legfeljebb 0,5.
- HA nincs `requiredOrder`, AKKOR a pontozás változatlan.
- HA a hibás próba csak sorrendben tér el, és minden helyes egyirányú, AKKOR az S6b felveszi a sorrendi szabályt, és nincs javítókör.
