# Spec: a nyílt feladat pontozója ismerje fel a magyar szóalakokat

> Dátum: 2026-11-03 · Szerző: Claude (Kósa Zoltán kérésére: „A szigorú pontozást is javítsd”) · Állapot: JÓVÁHAGYVA

## Mért tények (Antigoné, 9. évf., vak diákválasz-próba)

- **Mérés:** a rubrikát nem látó ügynök kérdésenként 2 helyes diákválaszt írt a v1 (52) és a v2 (59) nyílt feladataira. A pontozás a
  valódi `evaluateOpenAnswer`-rel történt.
- **Eredmény:** a v1 bank 79,8%-ot, a v2 bank 65,0%-ot adott. A pontvesztés oka szinte mindig „Még N kötelező fogalom hiányzik”,
  három csoportban:
  1. **Szóalak (pontozó hibája):**
     - több toldalék: „lelkiismeretével” → `lelkiismeret`;
     - képzés: „makacsságában”, „makacskodjon” → `makacs`; „ellenállása” → `ellenáll`;
     - összeolvadt rag: „megkövezéssel”, „kötéllel”;
     - összetett szó utótagja: „sziklabarlangba” → `barlangba`.
     - Ma a pontozó szónként EGY toldalékot vág le (`STEM_SUFFIXES`), és ≥ 5 betűnél 1–2 elütést tűr, de csak a nyers szón.
  2. **Rokon értelmű szó** (fivér/testvér, sosem/soha, látnok/jós): a rubrika dolga. A gyártás `hu-lexicon` + `bank-packet-autofix` bővíti.
  3. **Túl sokat követelő rubrika** (pl. kötelező „Argosz”): a bankgyártás dolga (spec 2026-11-03-javitas-bank-megorzes kapui).
- **Tagadásőr:** a szakmai átnézés 6 esetet talált, ahol a „nem” csak fél pontot adott, mert a minta más szóval tagadott
  („tilos eltemetni” ↔ „nem szabad eltemetni”, „sosem hazudott” ↔ „nem hazudott”).

## 1. Cél

- A pontozó a magyar toldalékolt, képzett és összetett alakokat ugyanannak a szónak ismerje el. Az ellentétes jelentésű
  fosztóképzős alakot ne.
- A tagadásőr a mintában lévő magyar tagadó szavakat (tilos, soha, sem, nincs…) tagadásnak tekintse.
- A helyes válaszok átlagpontja nőjön. A hibás válaszok átlagpontja NE nőjön érdemben (≤ +2 százalékpont).

## 2. NEM cél

- Szinonimaszótár a pontozóban: ez a gyártás dolga.
- A rubrikák tömeges átírása vagy újragyártása.
- A pontos alakú kifejezés (`requiredPhrases`, tűrés nélkül): változatlan.
- A típusos (számolós) érték-összevetés: változatlan.
- A pontozási verzió (`LESSON_SCORING_VERSION`) emelése: nincs új feladattípus, a kliens és a szerver ugyanazt a közös modult futtatja.

## 3. Érintett területek

- `source/shared/lesson-experience-score.ts`:
  - `wordHit`: új szabályok;
  - `unexpectedNegation`: magyar gyenge tagadószók a mintában;
  - `OPEN_ANSWER_RULES_HU` 2. és 4. pont: a modellnek szóló szabályszöveg (B4: egy szabály egy helyen).
- `source/server/ai/lesson-html-spec.ts`: a HTML-leckék beágyazott pontozója (`ee_wordHit`, `ee_negKind` hívása) ugyanígy, paritás miatt.
- `source/tests/score-word-forms.test.ts` (új) és a `tests/lesson-html-score.test.ts` paritástesztjének új esetei (új tesztek; a régi
  esetek változatlanok).

## 4. Rögzített döntések

- **Kiinduló alak (`w`):** a rubrika szava, és ha ≥ 5 betű, az egy toldalékkal levágott töve is (`stem(w)`). Normalizált, ékezet
  nélküli alakkal számolunk.
- **Képzés vagy több toldalék:** a válasz-token `w`-vel KEZDŐDIK, hosszabb nála, és a maradék NEM fosztóképző
  (`talan|telen|tlan|tlen|atlan|etlen|lan|len|mentes`, pl. „lelkiismeret+len”). A „boldogtalan” tehát nem `boldog`.
- **Összetett szó utótagja:** a token (vagy egy toldalékkal levágott töve) `w`-re VÉGZŐDIK, és az előtag ≥ 3 betű. A „kalap” nem `alap`
  (4 betű, a szabály nem érvényes). (Az „alapos” ↔ `lapos` a MEGLÉVŐ 1-elütés tűrés miatt ma is talál — nem e szabály hatása.)
- **Tő szintű elütés:** a két tő távolsága ≤ 1, illetve 8 betű fölött ≤ 2, ha mindkét tő ≥ 5 betű.
- **Változatlan kizárások:** szám, tagadószó (`nem`, `ne`, `not`, `no`) és a < 5 betűs szó: csak a régi szabályok.
- **Tagadásőr:** ha a válasz tagadó, a minta pedig a meglévő jelek szerint nem, de tartalmaz magyar gyenge tagadószót (`sem, se, soha,
  sosem, semmi, semmit, senki, senkit, sehol, nincs, nincsen, nincsenek, tilos, ne`), akkor nem váratlan a tagadás. A fordított, angol
  irány változatlan.

## 5. Edge case-ek

- **Fosztóképző:** „jogos” / „jogtalan”, „boldog” / „boldogtalan” → nem talál.
- **Rövid szó:** `sír`, `vér`, `ház`, `jós` → a régi szabály (pontos vagy egytoldalékos).
- **Irány-rag:** a `testéről` / `testére` már ma is talál (tő-egyezés). Nem rontunk rajta, nem is javítjuk (tudott, `hu-lexicon` teszt).
- **Szám:** „442” / „4420” → nem talál (szám csak pontosan).
- **Kifejezés (`requiredPhrases`)** és sorrend: a sorrendi pozíció a `wordHit`-et használja, így ott is érvényes a tűrés. Ez szándékos,
  a sorrendet nem gyengíti.

## 6. Elfogadás (EARS)

- WHEN a válasz a rubrika ≥ 5 betűs szavának képzett, többszörösen ragozott vagy összetett alakját tartalmazza, THEN a csoport
  teljesül.
- WHEN a válasz a szó fosztóképzős (ellentétes) alakját tartalmazza, THEN a csoport NEM teljesül.
- WHEN a minta „tilos/soha/sem/nincs…” szóval tagad, és a válasz „nem”-mel, THEN nincs tagadás miatti pontlevonás.
- WHEN a vak helyes válaszokat pontozzuk, THEN az átlag nő (a tervezési és a független készleten is).
- WHEN a vak HIBÁS válaszokat pontozzuk, THEN az átlag legfeljebb +2 százalékponttal nő.
- WHEN a HTML-pontozót és a közös pontozót az új esetekre futtatjuk, THEN az eredményük azonos.

## 7. Tesztterv

- **Új `tests/score-word-forms.test.ts`:**
  - pozitív esetek a mért alakokra;
  - negatív esetek: fosztóképző, alap/kalap, szám, rövid szó, tagadószó;
  - tagadásőr: tilos ↔ nem, minta tagadás nélkül → továbbra is fél pont.
- **`tests/lesson-html-score.test.ts`:** új paritásesetek ugyanezekre (a meglévők változatlanok).
- **Teljes kör:** `tsc` (app + teszt), `eslint`, `npm test`. A bukó meglévő teszt kódhibát jelez: a tesztet átírni TILOS.
- **Mérés:** `.harness/live/matcher-proto.local.mts` és a végleges kóddal a vak készletek (tervezési, független, hibás), előtte–utána
  számokkal a PR-ban.

### Dokumentált spec-változás miatt módosuló meglévő tesztek (a teljes kör első futása után, 2026-11-03)

- **`tests/fixtures/scorer-corpus.json`, „ismert korlát: összehasonuló -val/-vel (fotoszintézissel)”.** A korpusz ezt
  `knownGap: true, desired: 1, expected: 0` jelöléssel dokumentált hiányként tartotta nyilván. A 4. pont képzés/többtoldalék szabálya
  pontosan ezt oldja meg (`fotoszintezis` ≥ 5 betű, a „fotoszintézissel” vele kezdődik, a maradék nem fosztóképző). A korpusz szabálya
  szerint (`desired !== expected` csak hiánynál) az eset rendes esetté válik: `expected: 1`, a `knownGap`/`desired` kikerül.
  A review #334 negatív esetei (barrel/bar, reggel/rég) és a két másik ismert korlát (kulccsal: szószám, úttal: rövid szó) változatlanul
  0 pontot kapnak.
- **`tests/studio-tools.test.ts`, bank-packet-autofix.** Az autofix csak a pontozó által NEM felismert mintaalakot adja a rubrikához
  (`missingAnswerConcepts`). Az „összeadásként” → `összeadás` az új szabállyal felismert, ezért nincs mit hozzáadni. Ugyanígy, ahogy a
  teszt 33. sora a „szorzást” → `szorzás` esetre már rögzíti. Az elvárás ehhez igazodik; a minta továbbra is 1 pontot ér a rubrikán
  (36. sor, változatlan). Ugyanebben a tesztben a `fixes.length >= 5` a megszűnt ötödik (mintaalak-) javítást számolta. Ehelyett a
  maradék négy javítás PONTOS listája az elvárás (szigorúbb). A mintaalak-hozzáadó út lefedettsége nem vész el: ÚJ teszt
  (`temetni` ← „temetés”, amit a szóalak-tűrés sem ismer fel) igazolja, hogy az autofix a fel nem ismert alakot továbbra is a
  rubrikába teszi.

### Review #380 (2026-11-03): javított rések és tudatos döntések

- **Javítva:**
  - **Fosztóképző a rövidebb tő után** („haszo|ntalan”, „oxige|nmentes”): a fosztóképzőt a teljes szó végéig vizsgáljuk
    (`privativeBetween`).
  - **Az angol `-less`/`-free` utótag**, valamint a jelentést megfordító előtag az összetétel-szabályban: `dis-`, `non-`, `mis-`,
    `anti-`, `counter-`, `mal-`, `nem-` (agree/disagree, honest/dishonest, dohányzó/nemdohányzó).
  - **A HTML-pontozó magyar tagadószó-keresése NFC-normalizál** (NFD-minta: „név” ≠ „ne”).
  - Mindegyikre új negatív teszt készült (közös pontozó és HTML-paritás).
- **Nem módosítva:**
  - **Pontozási verzió:** a régi kliens nyitva hagyott lapja a deploy után régi szabállyal adhat azonnali visszajelzést. Ezt
    tudatosan elfogadjuk, mert:
    - a mentett gyakorlókör pontszámát a szerver számolja;
    - a verzió emelése új feladattípus nélkül minden régi klienst kizárna;
    - a különbség csak a lazább, helyes alak elfogadása.
  - **Tűrés-lazítás statisztikája** (`maybeRelaxTightening`): a lazítás a pontos alakú kifejezések (`tightened`, `requiredPhrases`)
    téves elutasításait számolja. Ezek pontozása (`phraseHit`, tűrés nélkül) NEM változott, ezért a régi sorok továbbra is
    érvényesek.

### A mérés bizonyíthatósága

- **A repóból NEM reprodukálható (UNVERIFIED a repóból):** a vak válaszkészletek (2×111 helyes tervezési, 2×111 független helyes,
  2×111 hibás) és az Antigoné lecke két változata éles adatból készült. Ezek a munkamenet ideiglenes könyvtárában vannak, nem
  kerülnek a repóba (éles tananyag; a mérőszkriptek gitignore-olt harnessek: `.harness/live/final-measure.local.mts`,
  `blind-score.local.mts`).
- **Ami a repóból igazolható:** a viselkedés. A `tests/score-word-forms.test.ts` és a paritásteszt a mért szóalakokra és a
  negatív esetekre fut.
## 8. Kockázatok / visszavonás

- **Hamis elfogadás:** egy hosszabb, más jelentésű szó, amely a rubrikaszóval kezdődik (pl. `terem` → „teremt”). Csak ≥ 5 betűs
  szónál, és a többi kötelező csoport továbbra is kell. A hibás-válasz mérés számszerűsíti.
- **Bankgyártás:** a válaszkulcs-tesztek hibás próbái közül néhány most átmehet. Ekkor a kalibráció pontos alakra szigorít
  (`requiredPhrases`), a tűrés ott nem érvényes.
- **Visszavonás:** a merge commit revertje.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-pontozo-szoalak-vegrehajtas.md`
