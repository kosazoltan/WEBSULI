# Tételgyár T5 — számolás programból (a kvíz számolós kulcsa) — terv (2026-10-15)

Szülőterv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (3. fejezet 4. pont, G6). Sorrend: tulajdonosi döntés 2026-10-15
(a T6.0 mérés után): **a T5 előre**, a T6 olcsó (MiniMax M3) előszűrővel utána.

## Mért helyzet (T6.0, `docs/measurements/2026-10-15-t6-kviz-vak.json`)
A mentett (nem publikált) leckékben rossz kulcsú számolós kvízek maradtak: „Melyik eredmény tartozik a -8-(-6) kifejezéshez?” — kulcs -14
(helyes: -2); „Melyik kifejezés megadott eredménye +6?” — kulcs -2-(+8) (= -10); „Mi a -5-(+8) kifejezéshez megadott eredmény?” — kulcs +3
(helyes: -13). Az Opus bank-ellenőr a lektor lépésnél jelezte őket; az olcsó modellek a tanítás szövegét követve átengedték.

## Kódból ellenőrzött ok
- `shared/single-choice-check.ts` `arithmeticProblems` csak a TISZTA számtani kérdést ismeri fel („Mennyi 12 · 3?”, „7 + 8 = ?”); a mondatba ágyazott
  kifejezést („Melyik eredmény tartozik a … kifejezéshez?”) és a fordított kérdést (opciók = kifejezések, a kérdésben az eredmény) nem.
- A kiértékelő (`shared/arithmetic-expression.ts`) zárójeles kifejezést nem értékel; az előjeles zárójel összevonása (`normalizeSignedParens`:
  `a-(-b)` → `a+b`) létezik, de ez az ág nem használja.
- A `lessonSingleChoiceProblems` a bankcsomag `validate`-jében fut (gyártáskor: javítókör / kivétel a tartalék terhére), és a kliens is ezzel
  szűri a nem játszható kérdést.

## Cél
A számolós kvíz kulcsát a program ellenőrzi kiszámolva — a beágyazott és a fordított kérdésformában is, előjeles zárójellel —, már gyártáskor.

## Nem-cél
- Szöveges / több feltételes kérdés megítélése (hallgat, ha nem biztosan kiszámolható); a nyílt feladatok (`typedAnswers`) a meglévő v2 úton.
- A pontozó és a gyerekfelület változtatása (a kliens szűrője ugyanazt a függvényt használja — a hibás kulcsú kérdést elrejti).

## Elfogadás (EARS)
- E1: HA a kérdés pontosan egy kiszámolható kifejezést tartalmaz és annak eredményére kérdez, a válaszok számok, AKKOR pontosan a kulcs
  egyezik a kiszámolt értékkel (különben lelet).
- E2: HA a válaszok kifejezések és a kérdés egy eredményre kérdez („melyik kifejezés … eredménye N”), AKKOR pontosan a kulcs kifejezése adja N-t.
- E3: HA a kérdés nem biztosan kiszámolható (több kifejezés, feltétel, szöveges szám), AKKOR nincs ítélet (hallgat).
- E4: A meglévő tesztek (régi formák) változatlanul zöldek; a mentett bankokon mért téves riasztás 0 a kézi átnézés szerint.
