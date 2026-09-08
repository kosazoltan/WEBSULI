# A tananyagkészítés didaktikai íve — mérés és terv (M-1…M-4)

*2026-09-07 · a `main` @ 5a947f9 kódjából mérve*

## 0. A tulajdonos észrevétele, szó szerint

> „a Kristóf összefoglaló és az utána következő tananyagban van magyarázat, van
> felvezetés, van fogalomtisztázás, addig a későbbiekben már csak a nyers
> számolgatás. Ez teljesen rossz, ilyen csak a tanítási elveknek a fele. Tehát
> először föl kell vezetni, hogy miről tanulunk, utána elmondjuk azt, hogy milyen
> számolható elemek vannak egy ilyen tananyagban, és csak utána kezdheted a
> kőkemény képleteket és visszakérdezéseket."

És külön:

> „nem mindegyik helyes válasz után mehessen játszani a gyerek, hanem mondjuk öt
> helyes válasz után, mert így végigjátszani fognak és nem tanulni."

## 1. Amit a kódból mértem

**A didaktikai ívet MA semmi nem írja elő.** Végigkövettem a gyártási láncot:

| Hol | Mit mond a sorrendről |
|---|---|
| `shared/lesson-schema.ts` | semmit — `blocks: z.array(blockSchema).min(1)`, tetszőleges sorrend |
| `buildPedagoguePrompt` (`step-io.ts:156`) | „tervezz blokkokat a megengedett típusokból: explain, example, check, recap, animate, try" — felsorolás, nem ív |
| `buildAuthorPrompt` (`step-io.ts:229`) | forráshűség, fogalom-címkék, séma — a sorrendről egy szó sincs |
| `checkCoverageGate` (`coverage.ts:81`) | fogalmi fedettséget és megalapozottságot mér; a blokkok sorrendjét nem nézi |

Következmény, pontosan: **egy szakasz állhat csupa `check` blokkból**, felvezetés,
fogalomtisztázás és levezetett példa nélkül, és a kapu `ok: true`-val átengedi. Ez nem
elméleti lehetőség — a tulajdonos ezt látja az újabb leckéken.

A `sectionSchema.probaEnabled` alapértéke `true`, a `SectionProba` pedig **egyetlen
`check` blokkból álló szakasz után is** beküldhető. A `computeCoupon`
(`shared/reward-policy.ts:130`) csak a SZÁZALÉKOT nézi (`thresholds.retry = 80`), a
helyes válaszok SZÁMÁT nem: **1/1 helyes válasz = 100% = játékidő.** Ez a
„végigjátsszák, nem tanulják" mechanikája, kódban.

## 2. A négylapos elrendezés, amit tükrözni kell

A négy hónapja készült tananyagok (és a Claude-oldali `tananyag-keszito` v7.3 skill)
szerkezete:

| Lap | Szerep | A WEBSULI blokk-nyelvén |
|---|---|---|
| 1 | elméleti tananyag | `explain` (`depth: core`, majd `deeper`/`why`) |
| 2 | figyelemfenntartó, magyarázó réteg | `animate`, `try` |
| 3 | szöveges feladatok | `example` (feladat + levezetés + eredmény) |
| 4 | kvíz | `check` |

A skill logikáját **nem másolom** (az önálló HTML-fájlt gyárt, a Studio strukturált
`Lesson`-t), de a sorrendje ugyanaz, és ez a sorrend a lényeg: **tanítás → megmutatás →
levezetés → visszakérdezés.**

## 3. Vezérlő elv

*A prompt tanács, a kapu szabály.* A repó saját mintája ez: a forráshűség (`sourceOnly`,
`coversConceptIds`) sem promptban él, hanem sémában és kapuban. A didaktikai ív ugyanígy
kerül gépi ellenőrzés alá — különben a következő modellváltásnál újra elcsúszik.

Amit ez a terv **nem** csinál: nem ír elő blokkszámot, nem tiltja a `check`-et, nem
szabja meg a tananyag hosszát, és nem nyúl a forráshűséghez.

## 4. Szeletek

### M-1 — `shared/lesson-arc.ts`: az ív mérése tiszta függvényként

```ts
export type ArcCode =
  | "no_opening_explain"    // a szakasz nem vezeti fel, miről tanulunk
  | "drill_before_teaching" // kérdés/példa a magyarázat ELŐTT
  | "quiz_without_example"  // visszakérdez, de nem mutatott levezetést
  | "drill_heavy"           // a szakasz szinte csak számolás és kérdezés
  | "no_engagement_layer"   // az EGÉSZ leckében nincs animate/try (a „2. lap")
  | "no_recap";             // a lecke nem zárul összefoglalóval

export function checkLessonArc(lesson: Lesson): ArcReport;
```

Szabályok, szakaszonként:

1. **Felvezetés.** A szakasz ELSŐ blokkja `explain` legyen. (`no_opening_explain`)
2. **Tanítás a drill előtt.** Az első `explain` indexe kisebb legyen az első `check` és
   az első `example` indexénél. (`drill_before_teaching`)
3. **Levezetés a visszakérdezés előtt.** Ha a szakaszban van `check`, legyen előtte
   `example` — ez a „milyen számolható elemek vannak" lépés. (`quiz_without_example`)
4. **Ne legyen csupa drill.** A `check` + `example` aránya ne haladja meg a
   `MAX_DRILL_RATIO = 0.7`-et. (`drill_heavy`)

Lecke szinten:

5. **Figyelemfenntartó réteg.** Legalább egy `animate` vagy `try` az egész leckében.
   (`no_engagement_layer`)
6. **Zárás.** Az utolsó szakasz utolsó blokkja `recap`. (`no_recap`)

**Tesztek** (`tests/lesson-arc.test.ts`): mindegyik szabályra külön piros eset, plusz egy
„a jó ívű lecke átmegy" eset, plusz az egy-blokkos szakasz határesete.

### M-2 — a kapu bekötése

`checkCoverageGate` mellé `checkLessonArc` a `runGate`-ben (`step-runner.ts:584`). Az
ív-hiány ugyanúgy `reasons`-be kerül, mint a fedettségi hiány: **egy javító kör**, majd
a körlimit után figyelmeztetéssel publikál — a meglévő viselkedés, nem új.

**Teszt:** a csupa-`check` lecke NEM megy át a kapun; a jó ívű igen.

### M-3 — a prompt is tanítsa, ne csak a kapu büntesse

A pedagógus és a szerző prompt kapja meg ugyanazt a szerződést, a kapu szövegével
azonos szavakkal, hogy a modell ELSŐRE jót írjon, ne javító körben.

**Teszt:** a promptok tartalmazzák az ív-szerződést (statikus őr, #183 osztály).

### M-4 — játékidő öt helyes válasz után

`RewardPolicy.minCorrectForCoupon` (alapérték **5**), a `reward_policy` táblából
hangolható, mint minden más érték. A `computeCoupon` a százalék MELLETT a helyes
válaszok számát is nézi: kevesebb mint 5 helyes válasz → nincs kupon.

Fontos: ez **nem** nullázza a sorozatot. A gyerek nem hibázott, csak kevés kérdés volt a
szakaszban — büntetni ezért hibás lenne.

**Tesztek:** 1/1 helyes = nincs kupon; 5/5 = van; 4/5 = nincs; a régi, mező nélküli
`reward_policy` sor továbbra is beolvasható (visszafelé kompatibilitás).

## 5. Amit ez NEM old meg

A szárazság ellen a kapu csak a SZERKEZETET tudja kikényszeríteni. Hogy a felvezetés
érdekes-e, azt sem séma, sem teszt nem méri — az a prompt és a lektor dolga marad. Ezt a
korlátot itt kimondom, nehogy a zöld teszt minőségnek látsszon.

A már kiadott leckéket ez a terv nem írja át. Az újragyártás külön, a
`docs/lesson-improvement.md` visszaállítható menete szerint történik.
