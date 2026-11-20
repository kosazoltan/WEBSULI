# Pontozó: polinom után álló pontsor / „…”, és két számeredmény műveleti jel után (#121, #122)

**Állapot:** megvalósítás alatt – 2026-11-20, ág `fix/pontozo-polinom-ket-szam`
Végrehajtási utasítás: [`2026-11-20-pontozo-polinom-ket-szam-vegrehajtas.md`](2026-11-20-pontozo-polinom-ket-szam-vegrehajtas.md)
Szülőterv: `docs/specs/2026-11-19-websuli-potlasok-terv.md`, 7.3 „T-1 — Pontozó: polinom végpont, két számeredmény”.

## Cél

- A betűs (polinomos) típusos feladatnál a helyes válasz akkor is pontot kapjon, ha utána pontsor vagy kipontozás áll
  („10x…”, „10x..”, „10x...”, „10x …”) — kanban #121, 54 éles feladat.
- A kért köztes lépés + végeredmény választ („30 · 7 210”) a pontozó két külön számnak olvassa, ha a feladat két részeredménye
  így teljesül — kanban #122 maradványesete, 13 éles feladat.

## Nem-cél

- A tizedespont („2.5x”, „12.5”) és a valódi szóközös ezres tagolás („12 000”, „35 + 64 − 12 000”) viselkedésének változása.
- A műveleti jel NÉLKÜL, önállóan álló „120 360” két számként olvasása: a „12 000” ezres tagolással azonos alakú, a szülőterv EARS-e
  csak a műveleti jel utáni esetet kéri. Maradvány, külön tulajdonosi döntés.
- A közös `NUM` minta (`shared/arithmetic-expression.ts`) módosítása: a bankszöveg-állításszűrő és a kliens `isPlayableQuestion`
  változatlan marad (a javítás csak a tanulói válasz oldalán, a `shared/answer-value.ts`-ben történik).
- Rossz eredményű válasz részpontja („30 · 7 211” → a lépés helyes): ma 0 / 2, ez a szelet nem változtatja.
- A v1 kulcsszó-pontozó és az `ee_evaluate` HTML-referencia (a korpusz meglévő esetei változatlanok).

## A felderítés tényei (2026-11-20, mérve a `d9d1e6c6` fejen; útvonalak a `source/` alatt)

- `shared/polynomial.ts` 203. sor: a határjelölő `\.(?=\s|$)` csak a pontsor UTOLSÓ pontját cseréli: a „10x..” jelöltje „10x.”, ami
  nem tokenizálható (a `tokenize` a `.`-ra null). A „…” (U+2026) nem határ; a „10x…” szót a próza-szűrő (nem ASCII karakter) dobja el.
  Mért: „10x…” 0, „10x..” 0, „10x...” 0, „Az eredmény 10x…” 0; „10x.” 1, „10x …” 1, „2.5x” 1.
- `shared/answer-value.ts` 184. sor `GAP_OR_NUMBER` és 192. sor `ATOM_RE` (a `NUM` ezres ága): a „30 · 7 210” „7 210” része ezres
  tagolású szám (7210), így sem a „30 · 7” lépés, sem a „210” nem található. Mért: „30 · 7 210” 0 / 2; „30 · 7 = 210” 2 / 2.
- A meglévő őr-esetek (`tests/scoring-v2.test.ts` 211–244. sor): „35 + 64 − 12 000” a „35 + 64 − 12” lépésre 0 (17 féle szóközzel),
  „12 000 : 4 3000” a „12 000 : 4” lépésre 1 — ezek változatlanok maradnak.
- A korpusz (`tests/scorer-corpus.test.ts`) ma csak a v1 / `ee_evaluate` paritást méri; típusos (v2) eset nincs benne.
- A kliensből elérhető forrásban lookbehind tilos (`tests/no-lookbehind-client.test.ts`).

## A helyes viselkedés

1. Polinomjelölt-határ: a szóköz vagy szövegvég előtti pontsor és „…” (bármilyen keverékben, `[.…]+`) határ, a jelölés
   hosszmegtartó marad (minden jel helyére egy sortörés). A tizedespont (szám előtt) nem határ.
2. Két szám műveleti jel után: a válasz egy MÁSODIK olvasatában a `szám/záró zárójel · műveleti jel · 1–3 jegy · egy vízszintes
   szóköz · 3 jegy` alakú helyen a szóköz elválasztó (sortörés), ha a 3 jegy nem 0-val kezdődik, és nem folytatódik számjeggyel,
   tizedesrésszel vagy újabb ezres csoporttal. Hosszmegtartó csere (a pozíciók nem tolódnak).
3. A második olvasat csak akkor számít, ha az első (mai) olvasat nem teljes, a második TÖBB részeredményt ad, és MINDEN leválasztott
   szám egy számos részeredmény találata lett (különben a leválasztás hamis elfogadás lenne: „35 + 64 − 12 345” egy lépéssel).

## Edge case-ek

| Bemenet | Referencia | Elvárt |
|---|---|---|
| „10x…”, „10x..”, „10x...”, „10x …”, „10x.”, „Az eredmény 10x…” | 10x | helyes |
| „10x + 1…”, „11x..” | 10x | hibás |
| „2.5x”, „2.5x..” | 2.5x | helyes (tizedes) |
| „30 · 7 210” | lépés „30 · 7” + szám 210 | 2 / 2 |
| „30 · 7 211” | lépés „30 · 7” + szám 210 | 0 / 2 (mint ma) |
| „35 + 64 − 12 000”, „35 + 64 − 12 345” | lépés „35 + 64 − 12” | 0 |
| „12 000 : 4 3000” | lépés „12 000 : 4” | 1 |
| „12 000” | szám 12000 | helyes (egy szám) |
| „35 + 64 − 12 000” | lépés „35 + 64 − 12” + szám 0 | 0 / 2 (a 0-val kezdődő csoport nem válik le) |

## Elfogadás (EARS)

- E1: WHEN a válasz a helyes polinom, utána 1–3 pont vagy „…” (szóközzel vagy anélkül) THEN a pontozó a teljes pontot adja.
- E2: WHEN a válasz rossz polinom ponttal / „…”-tal THEN 0 pont marad.
- E3: WHEN két szám egy szóközzel áll műveleti jel után, és a feladat két részeredménye így teljesül THEN két számként pontoz.
- E4: WHEN „12 000” áll (önállóan vagy kifejezés elején) THEN egy szám marad; a „35 + 64 − 12 000” a „35 + 64 − 12” lépésre 0.
- E5: WHEN „2.5x” vagy mondatzáró egy pont („10x.”) áll THEN a viselkedés a mai.
- E6: a meglévő pontozó-, paritás- és `single-choice-check` tesztek változatlanul zöldek; mutációs ellenpróba: a 2. / 3. lépés
  visszavonására az új korpuszesetek buknak.

## Tulajdonosi döntést igénylő pontok

- A műveleti jel nélküli „120 360” (két számeredmény vagy ezres tagolás?) — ebben a szeletben nem változik (nem-cél).

<!-- acceptance-checklist -->
- [x] E1 – polinom + pontsor / „…” helyes (korpusz)
- [x] E2 – rossz polinom ponttal hibás (korpusz)
- [x] E3 – „30 · 7 210” 2 / 2 (korpusz)
- [x] E4 – „12 000” egy szám, „35 + 64 − 12 000” 0 (korpusz + scoring-v2)
- [x] E5 – „2.5x”, „10x.” változatlan (korpusz)
- [ ] E6 – meglévő tesztek zöldek (célzott kör 127 / 127 zöld; a teljes `npm test` a gépi záras nehéz körben); mutációs ellenpróba
  megfogva (M1–M4)
