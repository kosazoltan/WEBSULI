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
- **Összetett szó utótagja:** a token (vagy egy toldalékkal levágott töve) `w`-re VÉGZŐDIK, és az előtag ≥ 3 betű. Az „alapos” így nem
  `lapos`, a „kalap” nem `alap` (4 betű, a szabály nem érvényes).
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
  - negatív esetek: fosztóképző, alap/kalap, lapos/alapos, szám, rövid szó, tagadószó;
  - tagadásőr: tilos ↔ nem, minta tagadás nélkül → továbbra is fél pont.
- **`tests/lesson-html-score.test.ts`:** új paritásesetek ugyanezekre (a meglévők változatlanok).
- **Teljes kör:** `tsc` (app + teszt), `eslint`, `npm test`. A bukó meglévő teszt kódhibát jelez: a tesztet átírni TILOS.
- **Mérés:** `.harness/live/matcher-proto.local.mts` és a végleges kóddal a vak készletek (tervezési, független, hibás), előtte–utána
  számokkal a PR-ban.

## 8. Kockázatok / visszavonás

- **Hamis elfogadás:** egy hosszabb, más jelentésű szó, amely a rubrikaszóval kezdődik (pl. `terem` → „teremt”). Csak ≥ 5 betűs
  szónál, és a többi kötelező csoport továbbra is kell. A hibás-válasz mérés számszerűsíti.
- **Bankgyártás:** a válaszkulcs-tesztek hibás próbái közül néhány most átmehet. Ekkor a kalibráció pontos alakra szigorít
  (`requiredPhrases`), a tűrés ott nem érvényes.
- **Visszavonás:** a merge commit revertje.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-pontozo-szoalak-vegrehajtas.md`
