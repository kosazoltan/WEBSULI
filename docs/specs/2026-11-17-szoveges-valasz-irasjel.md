# Szöveges válasz: a mondatvégi írásjel, a szóköz és a tipográfiai változat ne számítson hibának

**Állapot:** kész, PR előtt – 2026-11-17, ág `fix/szoveges-valasz-irasjel`
Végrehajtási utasítás: [`2026-11-17-szoveges-valasz-irasjel-vegrehajtas.md`](2026-11-17-szoveges-valasz-irasjel-vegrehajtas.md)

Tulajdonosi hibajelentés (2026-11-17, szó szerint): „Egy újabb hiba, hogy a szöveges feladatoknál ha rak pontot a tanuló, azt is
hibának veszi, ha nem rak pontot, azt is. Ezt is szüntesd meg.”

## Cél

A begépelt válasz összevetése ne bukjon el a mondatvégi írásjelen (`.` `!` `?` `…`), a szélső / többszörös szóközön, a kis- és
nagybetűn és a tipográfiai változaton (aposztróf, idézőjel, kötőjel, nem törő szóköz, Unicode-alak). Az ékezet továbbra is számít.
Egy közös, tiszta összehasonlító a `source/shared/` alatt; a pontos egyezést váró kiértékelő helyek erre épülnek.

## Nem-cél

- A nyílt feladatok kulcsszó-pontozójának (`evaluateOpenAnswerV1` / `V2`) szabályai: a mérés szerint az írásjelre nem érzékenyek.
- A gyártás promptjai és a `ee_evaluate` HTML-referencia (a paritástesztek változatlanok; a modell nem ír összehasonlítót).
- Éles lecke-adat módosítása; a két régi, saját szkriptes HTML-anyag átírása (csak felmérés és javaslat).
- A játékok fájljai (nyitott PR-ok módosítják); a kvíz (feleletválasztós, nincs begépelt válasz).
- A `needsSentence` szabály és a szóközzel elválasztott két számeredmény értelmezése (döntési pontok, lásd lent).

## A felderítés tényei (2026-11-17; útvonalak a `source/` alatt)

Mérés: az éles oldal nyilvános, csak olvasó végpontjairól (`GET /api/html-files`, `GET /api/lessons/by-file/:id`) letöltött
245 anyag (241 Stúdió-lecke, 3 régi HTML, 1 PDF), 14 027 nyílt feladat, 19 kitöltős blokk.

| # | Hely | Hogyan hasonlít | Érinti a hiba? |
|---|---|---|---|
| 1 | `client/src/lesson-runtime/blocks/try-blocks.tsx:139` — „Egészítsd ki” (`fillBlank`) | `trim().toLowerCase()` után PONTOS egyezés | **Igen.** „módhatározó.” ≠ „módhatározó”; „can’t” ≠ „can't”. Élesben 19 blokk, 15 leckében. |
| 2 | `shared/answer-value.ts:178-184` (`containsExpressionState`) — típusos feladat kért köztes lépése (`form: intermediate-step`) | a kért kifejezés a válaszban tokenhatáron; a szomszédos `.` számjegy-folytatásnak számít | **Igen.** „35 + 64 − 12.” → 0 találat. Élesben 9 részeredmény, 5 leckében. |
| 3 | `shared/lesson-experience-score.ts:67-73, 237-251` — nyílt feladat, v1 kulcsszó-pontozó (`LessonExperienceView.tsx:79`, `HtmlLessonTasks.tsx:27`, szerver: `shared/lesson-result-email.ts` `gradeTasks`) | tokenizál: csak betűsor és szám; kisbetű, ékezet nélkül | Nem. 14 020 éles mintaválasz × 6 írásjel-változat: 0 eltérés. |
| 4 | `shared/lesson-experience-score.ts:75-78, 258-294` + `shared/answer-value.ts:197-235` — típusos (v2) feladat: szám, tört, mértékegység, polinom | értékalapú; a szám utáni `.` nem része a számnak | Nem (a 2. sor kivételével). 1331 típusos feladat minimális válasza ponttal / felkiáltójellel / vesszővel: azonos pont. |
| 5 | `shared/pronunciation.ts:7-8` — kiejtésgyakorló | `normalizeSpoken`: írásjel, kis-nagybetű, szóköz nem számít, ékezet igen | Nem. |
| 6 | `client/src/lesson-runtime/CognitiveMethods.tsx:47`, `blocks/DecisionStory.tsx:25`, `blocks/TriangleAreaLab.tsx:61` — szabad szöveg | nincs kiértékelés (önellenőrzés, összevetés a magyarázattal) | Nem. |
| 7 | `server/ai/lesson-html-spec.ts:304-` (`ee_evaluate`) — a HTML-út referencia-pontozója | a v1 pontozó párja (paritástesztek) | Nem. |
| 8 | Szerver: `server/arbiter/` (döntőbíró, csak emelhet), `server/rewards/lesson-attempts.ts` (kvíz, index) | nincs szövegegyezés | Nem. |
| 9 | Játékok | feleletválasztós; begépelt válasz nincs (a `client/src/pages` szövegmezői fiók / belépés) | Nem (UNVERIFIED: a nyitott játék-PR-ok új bemenetei). |
| 10 | Régi HTML-anyag `2ae90d2b…` (2025-12-02, „Suno AI”) — saját szkript | `checkSpelling`: mondatvégi írásjel és nagy kezdőbetű HIÁNYA pontlevonás | **Igen** („ha nem rak pontot”). Éles adat, saját kód. |
| 11 | Régi HTML-anyag `baf280be…` (2026-02-28, angol nyelvtan) — saját szkript | `value.trim().toLowerCase() === ans` | **Igen** („ha rak pontot”). Éles adat, saját kód. |

Következtetés: a leckék 98%-a (241 / 245) Stúdió-lecke, a kiértékelés a közös futtatókörnyezetben van — az 1. és a 2. sor
közös helyen, minden leckére egyszerre javítható. A generátor nem ír összehasonlítót (`server/studio/step-io.ts:402` csak a
`fillBlank` adatalakját kéri), ezért prompt-módosítás nem kell. A 10–11. sor két régi anyaga saját kóddal értékel: javaslat a
Stúdió-átalakításuk (fizetős gyártás → tulajdonosi döntés).

Mellékleletek (nem írásjel; döntési pont): (a) a `needsSentence` feladat (6039 / 14 027) kötőszó nélkül fél pontot ad „fogalmazd
őket összefüggő mondattá” üzenettel — a tanuló ilyenkor hiába tesz pontot; (b) két számeredmény egyetlen szóközzel („120 360”)
ezres tagolásnak olvasódik (`shared/arithmetic-expression.ts:10`), ponttal / vesszővel elválasztva helyes; (c) dupla szóközös ezres
tagolás („50  000”) nem egy szám.

## A helyes viselkedés

Összehasonlítás előtt MINDKÉT oldalon (válasz és megoldókulcs):

1. Unicode NFC; nem törő és keskeny szóköz → szóköz; a szélső szóköz levágva; többszörös szóköz → egy.
2. Tipográfia: `’ ‘ ʼ ´` és a backtick → `'`; `„ ” “ « »` → `"`; `– — − ‐ ‑` → `-`.
3. Kis- és nagybetű nem számít (`toLocaleLowerCase("hu")`).
4. A VÉGÉRŐL a mondatvégi írásjelek (`.` `!` `?` `…`, ismételve, köztes szóközzel is) lemaradnak.
5. A válasz ELEJÉN és VÉGÉN a teljes választ közrefogó idézőjel-pár lemarad.
6. Az ékezet SZÁMÍT („kor” ≠ „kór”); a válasz BELSEJÉBEN lévő írásjel (vessző) SZÁMÍT.
7. Ha a megoldókulcs alakja szám (`[+-]szám[,.]tizedes`), a tizedesvessző és a tizedespont egyenértékű, a vezető `+` nem számít.
8. Az üres és a csak írásjelből álló válasz soha nem helyes — akkor sem, ha a kulcs normalizált alakja üres.
9. Több elfogadott válasznál bármelyik egyezése elég; mindegyikre ugyanez a szabály.

## Edge case-ek

- „Budapest.” = „Budapest” = „ budapest ” = „BUDAPEST!!”; „kor” ≠ „kór”; „alma, körte” ≠ „alma körte”.
- Kulcs „can't”, válasz „can’t” → helyes. Kulcs „szén-dioxid”, válasz „szén–dioxid” → helyes.
- Kulcs „3,5”, válasz „3.5” / „3,5.” → helyes; kulcs „12”, válasz „12.” → helyes; kulcs „12”, válasz „120” → hibás.
- Kulcs „Dr.”, válasz „dr” → helyes (a záró pont mindkét oldalon lemarad). Kulcs „stb.”, válasz „stb” → helyes.
- Válasz „.” / „?!” / „  ” → hibás. Kulcs „?” (írásjel a megoldás) → a normalizált kulcs üres: a NYERS, szóköztelenített alak
  pontos egyezése dönt („?” = „?”, „.” ≠ „?”).
- Köztes lépés: „35 + 64 − 12.” és „35+64-12!” → szerepel; „35 + 64 − 12.5” és „35 + 64 − 120” → nem szerepel; „3 · 7. 21.” →
  a lépés szerepel, a 21 külön részeredmény.

## Elfogadás (EARS)

- E1. AMIKOR a tanuló a `fillBlank` blokkban a megoldókulccsal a fenti szabályok szerint egyező választ ad (ponttal vagy pont
  nélkül), A RENDSZER „Helyes!” visszajelzést ad.
- E2. AMIKOR a válasz ékezetben, belső írásjelben vagy szóban tér el, A RENDSZER a hibás visszajelzést adja.
- E3. AMIKOR a válasz üres vagy csak írásjel, A RENDSZER nem fogadja el.
- E4. AMIKOR a típusos feladat kért köztes lépése után a tanuló mondatvégi írásjelet tesz, A RENDSZER a lépést megtalálja; a
  tizedes folytatás („12.5”) és a hosszabb szám („120”) továbbra sem egyezik.
- E5. A nyílt feladatok pontozója (v1 / v2) és a `ee_evaluate` paritás változatlan: a meglévő tesztek módosítás nélkül zöldek.
- E6. Böngészőben, valódi (helyi) leckén: a kitöltős feladat pont nélkül és ponttal is „Helyes!”.

## Tulajdonosi döntést igénylő pontok

1. Kis- és nagybetű a helyesírási feladatoknál — a `fillBlank` adatában nincs feladattípus-jelölés; ma sem számít. Javaslat: marad
   (nem számít); ha kell, új opcionális `caseSensitive` mező külön szeletben.
2. Belső vessző — javaslat: számít (helyesírás), a mérésben nem okozott panaszt.
3. Számformátum — javaslat: szám alakú kulcsnál a tizedesvessző = tizedespont (megvalósítva); az ezres tagolás külön döntés.
4. A két régi HTML-anyag — javaslat: Stúdió-átalakítás a meglévő úton (fizetős), vagy levétel.
5. `needsSentence` üzenet és két eredmény szóközzel — javaslat: külön jegy (pontozó-szerződés, HTML-paritás).

<!-- acceptance-checklist -->
- [x] E1 – fillBlank ponttal / pont nélkül helyes (egységteszt + böngésző)
- [x] E2 – ékezet / belső írásjel / más szó hibás
- [x] E3 – üres és csak írásjel hibás
- [x] E4 – köztes lépés mondatvégi írásjellel
- [x] E5 – a meglévő pontozó- és paritástesztek változatlanul zöldek
- [x] E6 – böngészős próba helyi leckén
