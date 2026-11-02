# S5 — sorrendérzékeny kifejezés a nyílt feladat rubrikájában (nyelvtani feladatok)

Állapot: tulajdonosi döntés 2026-10-20 („Sorrendérzékeny kifejezés”, kérdés–javaslat kör az első S3c/S4 utáni éles gyártás
mérése után).

## Mérés (éles, 2026-10-20, „Where I live – Ahol lakom”, angol, 5. évf., job 468d9f5f)
- **A futás:** 17,8 perc, elakadás nélkül.
- **Gyakorlóbank:** 14 hívás, ebből 6 javítókör (43 %).
- **Gépi szigorítás (S3c):** 3 feladat, mind értelmes.
- **A blokkoló válaszkulcs-bukások oka:** a hibás válasz ugyanazokat a szavakat tartalmazza, csak a nyelvtani ALAK vagy a SORREND
  hibás:
  - „There are a sofa… There is many chairs.”
  - „You don't must feed…”
  - „Does he must go now?”
  - „Her is in the kitchen. Can you see she?”

## Gyökérok (fájl:sor)
- **A pontozó sorrendvak.** `shared/lesson-experience-score.ts` `conceptHit`: egy alternatíva minden szava BÁRHOL lehet a válaszban,
  és tűrés is van (`wordHit`: szótő, elütés). A „there is a” és a „there are a” → azonos szavak más párosításban; az „is” / „are”
  kérdést a rubrika csak külön csoporttal tudná kérdezni, de akkor a sorrend és az egyeztetés (melyik főnévhez) továbbra sem mérhető.
- **A szigorítás sem segít.** A gépi szigorítás (S3c) ilyenkor sem talál megkülönböztető SZÓT — a különbség a szavak sorrendje és
  párosítása.

## Cél
### S5a — a pontozó és a szerződés
- **Új, opcionális mező:** `requiredPhrases: string[][]` a nyílt feladaton (szerkezet, mint a `required`).
  - A csoportok között ÉS, egy csoporton belül VAGY.
  - Egy alternatíva egy KIFEJEZÉS: normalizált tokenjei (`normalizeAnswerV2`) a válaszban EGYMÁS UTÁN, ebben a sorrendben, PONTOSAN
    (tűrés nélkül) szerepelnek.
  - Példák: `[["there is a sofa"], ["there are many chairs"]]`, `[["must he go"]]`, `[["mustn t feed", "must not feed"]]`.
- **A típusos (v2) útra kerül** (`isTypedTask`), mint a `requiredDistinct`. A régi leckék (mező nélkül) pontozása bitre azonos (v1).
- **Pontozás (v2):**
  - a kifejezéscsoport a `required` csoportokkal EGYÜTT számít a fele- és az összes-szabályba (`hits` / `total`);
  - a hiányzó kifejezéscsoport → legfeljebb 0,5 pont, az indoklás megnevezi („a helyes alak/szórend hiányzik”).
- **Pontozási verzió:**
  - új `PHRASE_SCORING_VERSION = 4`, `LESSON_SCORING_VERSION = 4`;
  - a `scoringVersionFor` kifejezéses feladatnál 4-et ad, így a régi (nyitva hagyott) kliens frissítést kap, és nem pontoz
    engedékenyen.
- **Modell-szerződés:**
  - A rubrika szabályai (`OPEN_ANSWER_RULES_HU`) és a bank-útmutató (experience-builder, role-skills) új szabályt kapnak:
    nyelvtani / idegen nyelvi alak- és szórend-feladatnál a helyes alakot `requiredPhrases` kéri (2–5 szavas kifejezés, a minta
    szövegéből), a `required` a tartalmat.
  - A szigorú bank-séma (`bank-schema.ts`), az `OPTIONAL_ARRAY_KEYS`, a lektor nézete, a bankjavítás rubrikamezői és a
    lektor/ellenőr útmutatója is ismeri.
- **J1 pontosítás:** a „megkülönböztethetetlen” hibás próba (egy teljes pontos helyes válasz minden szavát tartalmazza) csak akkor
  nem blokkol, ha a kifejezéscsoportokat is teljesíti. Kifejezésekkel a sorrend már mérhető, tehát blokkolhat.
- **Kulcsok:** a döntőbíró gyorsítótár-kulcsa és az S4 `rubricHash` a kifejezéseket is tartalmazza. Kifejezés nélkül a kulcs
  változatlan, így a meglévő ítéletek megmaradnak.

### S5b — gépi szigorítás kifejezéssel
- **Mikor fut:** ha a szóalapú szigorítás (S3c) nem talál megkülönböztető szót, a minta 2–3 szavas, egymás utáni kifejezései közül
  keres (a leghosszabbal kezdve, legalább egy nem kötőszó tokennel).
- **A feltétel:**
  - minden teljes pontos helyes válaszban EGYMÁS UTÁN megvan;
  - a hibás válaszban nincs;
  - felvétele után a minta és a helyesek `ok`-k, a hibás nem.
- **Jelölés és lazítás:**
  - a felvett kifejezés `requiredPhrases`-be kerül, jelölése `tightenedPhrases` (a S4 telemetria `rubricTightened` része);
  - az S4c lazítás a kifejezéscsoportot ugyanúgy hatástalanítja: a többi kötelező csoport tagjai is alternatívái lesznek.

## S5b pontosítás (megvalósítás)
- **Csak idegen nyelvi leckén:** a kifejezéses gépi szigorítás csak ott fut (`calibrateRubric(..., { phrases: Boolean(language) })`). A
  magyar szórend szabad („változatlan marad” = „marad változatlan”), ott a sorrend nem megkülönböztető jel. Mért: egy meglévő teszt
  ilyen hamis megkülönböztetést fogott.
- **Tagadás nem lehet a kifejezés része** (S3c-szerződés, review #338): a „mustn t run” egy helyes „must not run”-t is elutasítana. A
  tagadó összevonás „t” maradéka is tagadásjel. A tagadásos alakot a modell írja `requiredPhrases`-be, VAGY-alternatívákkal.
- **A J1-es (megkülönböztethetetlen) próba továbbra sem blokkol** — kifejezéses szigorítás csak a blokkoló próbára fut.

## Nem-cél
- A v1 pontozó (a régi leckék és a HTML-paritás, `ee_evaluate`) nem változik. A HTML-okosítás útja nem kap kifejezést: a HTML-bank
  promptja nem említi, és az ott bejövő kifejezéses feladatot az igazítás kihagyja.
- Nyelvtani elemzés vagy modellalapú pontozás.

## Edge case-ek
- **Aposztróf:** a „mustn't” a normalizálás után „mustn t” — a kifejezést is ugyanígy normalizáljuk, így egyezik.
- **Tűrés:** a kifejezés pontos; a „feed” ≠ „feeds”. A modell a szükséges alakváltozatokat VAGY-alternatívaként adja meg.
- **Üres vagy túl hosszú kifejezés:** a séma 1–8 csoportot és alternatívánként legfeljebb 80 karaktert enged.
- **Típusos feladat:** a `typedAnswers` / `requiredDistinct` mellett is használható; ugyanazon a v2 úton számít.

## Elfogadás (EARS)
- HA a feladatnak `requiredPhrases: [["there is a sofa"]]` mezője van, AKKOR a „There are a sofa” válasz nem kap teljes pontot, a
  „There is a sofa” igen.
- HA a feladatnak nincs `requiredPhrases` mezője, AKKOR a pontozás változatlan (v1, bitre azonos — a korpusz és a régi tesztek
  zöldek).
- HA a lecke kifejezéses feladatot tartalmaz, AKKOR a `scoringVersion` 4.
- HA a szó nem különböztet meg, de egy kétszavas kifejezés igen, AKKOR az S5b felveszi, és nincs javítókör.

## Kockázat
- **A modell túl szigorú kifejezést ír**, és egy helyes, más szórendű választ elutasít.
  - Mérséklés: a válaszkulcs-tesztek (3–5 helyes megfogalmazás) a valódi pontozón futnak; a helyes-eset bukás jelentésbe kerül.
  - A döntőbíró emelhet, az S4c téves elutasításként méri és lazíthat.
