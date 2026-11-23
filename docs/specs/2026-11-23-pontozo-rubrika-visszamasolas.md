# Pontozó: „nem tudom”, ékezetes rövid szó, kérdés-visszamásolás (T-2, P-027, #130, #132)

**Állapot:** megvalósítás alatt – 2026-11-23, ág `fix/pontozo-polinom-ket-szam` (a T-1 ugyanezen az ágon, közös korpusz)
Végrehajtási utasítás: [`2026-11-23-pontozo-rubrika-visszamasolas-vegrehajtas.md`](2026-11-23-pontozo-rubrika-visszamasolas-vegrehajtas.md)
Szülőterv: `docs/specs/2026-11-19-websuli-potlasok-terv.md` (a `docs/hianyleltar-2026-11-23` ágon), 7.3 „T-2”; P-027.
Testvérszelet: [`2026-11-20-pontozo-polinom-ket-szam.md`](2026-11-20-pontozo-polinom-ket-szam.md) (T-1: polinom végpont, két szám).

## Cél

A pontozó ne adjon pontot (fél pontot sem) olyan válaszra, amely nem válasz:

- „nem tudom” → ma az igen/nem rubrikán (`required: [["nem"]]`) **1 pont**, kétcsoportos rubrikán **0,5**;
- „hát” a „hat” (szám) rubrikára → ma **1 pont** (az ékezet-összehajtás miatt `hát` = `hat`);
- a kérdés szövegének puszta visszamásolása → ma **0,5**, ha a kérdés tartalmaz rubrikaszót.

## Nem-cél

- A hosszú (≥ 5 betűs) rubrikaszavak ékezet-tűrése (elütés-tűrés úgyis van; a „fotoszintezis” helyes marad).
- Az ékezet NÉLKÜL író tanuló (a válaszban egyetlen ékezetes betű sincs) tűrése: a „hat” a „hát”-ra és a „kek” a „kék”-re
  továbbra is egyezik — nem tudni, hogy a tanuló billentyűzetén van-e ékezet.
- A kérdés-másolat + érdemi többlet: a többletet a pontozó a mai módon pontozza (a másolt szavak nem törlődnek); csak a CSAK
  másolatból álló válasz 0. Indok: az „Igaz, a víz 100 fokon forr” jellegű, az állítást megismétlő helyes válasz nem veszíthet pontot.
- A típusos (v2) részeredmény-ítélet (`gradeTypedAnswers`) és a T-1 viselkedése.

## A felderítés tényei (2026-11-23, mérve a `bc434929` fejen — a T-1 ág + `origin/main` merge; útvonalak a `source/` alatt)

- `shared/lesson-experience-score.ts:67–73` `normalizeAnswer`: NFD + `\p{M}` törlés → a „hát” tokenje `hat`; `wordHit` (96–103.) az
  azonos alakot elfogadja. Mért: `required [["hat","6"]]`, „hát” → `ok 1`.
- `evaluateOpenAnswerV1` (249–263.): a „nem tudom” tokenjei `nem`, `tudom`; a `nem` a `[["nem"]]` csoportot teljesíti. Mért: „nem tudom”
  → `[["nem"]]` 1 pont; `[["nem"],["szárny"]]` 0,5; „Hát nem tudom” a `[["hat","6"]]`-ra 0,5.
- A kérdés-másolat: „Miért fontos a fotoszintézis a növények számára?” válasz a `[["fotoszintézis"],["cukor","glükóz"]]` rubrikán → 0,5.
- A v1 pontozónak HTML-párja van (`server/ai/lesson-html-spec.ts` `ee_evaluate`, a generált HTML-leckék ezt másolják); a korpusz
  (`tests/scorer-corpus.test.ts`) mindkettőt ugyanarra a pontra köti → a javítás mindkét helyre kell.
- `OpenTask.q` a kérdés szövege (`shared/lesson-experience.ts:42`); a HTML-adatszerződésben is `q`.
- `normalizeAnswer` `.map(normalizeAnswer)` hívással is fut (`server/studio/experience-builder.ts:243`) → a szignatúrája nem bővülhet.
- Lookbehind tilos a kliensből elérhető forrásban (`tests/no-lookbehind-client.test.ts`).

## A helyes viselkedés

1. **Nem-válasz kifejezés** (`stripNonAnswer`): a „nem tudom / nem tudok / nem tudjuk / nem tudnám / nemtom / fogalmam sincs / I don't
   know / I do not know / idk” kifejezés szavai a rubrika-illesztés és a tagadás-vizsgálat előtt törlődnek. A „Nem, tudom …” (vesszővel)
   nem nem-válasz. Ha más nem marad, a válasz üres → a rövid ág 0 pontja.
2. **Ékezetes rövid szó**: ha a válaszban VAN ékezetes betű, a rövid (normalizálva < 5 betűs) rubrikaszó csak akkor egyezik, ha a
   közös tő (a toldalék nélküli rész) ékezete is azonos („hát” ≠ „hat”, „kór” ≠ „kor”); a toldalék ékezete nem számít („szívről” =
   „szív”). Ékezet nélküli válasznál a mai tűrés marad.
3. **Kérdés-visszamásolás**: ha a válasz minden szava a kérdés szövegének legalább 3 szavas, folytonos szakaszaiból áll, és ezek a
   kérdés szavainak legalább felét lefedik (a kérdés ≥ 4, a válasz ≥ 3 szó), a válasz 0 pont („A válasz a kérdést ismétli …”).
4. Mindhárom szabály a v1-ben, a v2-ben és az `ee_evaluate`-ben azonos; a modellnek szóló `OPEN_ANSWER_RULES_HU` leírja.

## Edge case-ek (pozitív ÉS negatív pár)

| Rubrika | Válasz | Elvárt |
|---|---|---|
| `[["nem"]]`, minWords 1 | „nem tudom” / „Nem tudom.” / „I don't know” | 0 |
| `[["nem"]]`, minWords 1 | „Nem.” / „nem” | 1 (valódi rövid nem) |
| `[["igen"]]`, minWords 1 | „igen” | 1 |
| `[["nem"],["szárny"]]` | „nem tudom” | 0 |
| `[["nem"],["szárny"]]` | „Nem, tudom, hogy kicsi a szárnya” | 1 (vessző: nem nem-válasz) |
| `[["hat","6"]]` | „hát” / „Hát nem tudom” | 0 |
| `[["hat","6"]]` | „hat” / „6” / „Hat lába van.” (ékezetes mondatban is „hat”) | 1 |
| `[["hát"]]` | „hat” (ékezet nélküli válasz) | 1 (nem-cél: tűrés) |
| `[["szív"]]` | „A szívről van szó.” | 1 (a toldalék ékezete nem számít) |
| `[["kór"]]` | „A kor számít.” (ékezetes válasz) | 0 |
| fotoszintézis-kérdés | a kérdés szó szerinti másolata | 0 |
| fotoszintézis-kérdés | másolat + „A fotoszintézis során cukrot állít elő.” | 1 (új információ) |
| „Igaz-e, hogy a víz 100 fokon forr?” | „Igaz, a víz 100 fokon forr.” | a mai pont (nem csak másolat) |
| „Forr vagy fagy a víz 100 fokon?” | „forr” | a mai pont |

## Elfogadás (EARS)

- E1: WHEN a válasz „nem tudom” (vagy a felsorolt változat) és más érdemi szót nem tartalmaz THEN 0 pont, igen/nem és kétcsoportos
  rubrikán is.
- E2: WHEN a válasz ékezettel íródott és a rövid rubrikaszó ékezete eltér („hát” a „hat”-ra) THEN nincs találat; WHEN a válasz ékezet
  nélküli THEN a mai tűrés marad.
- E3: WHEN a válasz csak a kérdés szövegét ismétli THEN 0 pont; WHEN új információt is ad THEN a mai pont.
- E4: WHEN valódi rövid igen / nem / szám válasz érkezik THEN a mai pont (a #509 rövid-válasz tesztjei zöldek).
- E5: a v1 és az `ee_evaluate` a korpusz minden esetén azonos pontot ad; a meglévő pontozó-tesztek változatlanul zöldek.
- E6: mutációs ellenpróba — bármelyik szabály kikapcsolására legalább egy új korpuszeset bukik.

## Tulajdonosi döntést igénylő pontok

- Az ékezet nélkül író tanuló „hat” válasza a „hát” rubrikára (és fordítva, ha a rubrika ékezet nélküli): marad a tűrés (nem-cél).
- A másolat + érdemi többlet válasznál a másolt rubrikaszavak számítanak-e (ma: igen). Maradvány.

<!-- acceptance-checklist -->
- [ ] E1 – „nem tudom” 0 (korpusz)
- [ ] E2 – „hát” ≠ „hat” ékezetes válaszban; ékezet nélkül tűrés (korpusz)
- [ ] E3 – kérdés-másolat 0, új információval a mai pont (korpusz)
- [ ] E4 – valódi rövid igen / nem / szám a mai pont (korpusz + `open-answer-short.test.ts`)
- [ ] E5 – v1 = `ee_evaluate` a korpuszon; meglévő tesztek zöldek
- [ ] E6 – mutációs ellenpróba
