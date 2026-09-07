# Játékélmény master-terv — mind a 7 játék (2026-09-07)

> **Cél (tulajdonosi megfogalmazás):** „az összes játék logikáját, fizikáját,
> megjelenítését, vezérlését átnézni, feljavítani teljesen élvezhető
> játékélményre… hogy a gyerekek minél gamifikáltabb módon tudjanak tanulni,
> élvezzék, feledkezzenek bele a játékba, miközben jönnek a tesztkérdések,
> ezáltal tanulnak."
>
> A projekt fő célja a gyermekek oktatása. Ezért **minden döntés mércéje: növeli-e
> a tanulást**, nem az, hogy látványosabb lett-e.

## 0. Mérési alap (2026-09-07, `main` @ 84219e7)

Nem benyomás — a repóból mért adatok.

| Játék | sor | 3D | rAF | touch-kezelő | reduced-motion | adaptív nehézség | magyarázat rossz válasznál |
|---|---:|---|---:|---:|---:|---:|---:|
| SpeedQuizMath | 705 | – | 0 | 0 | **0** | **0** | **0** |
| WordLadderHuEn | 872 | – | 0 | 0 | 11 | 1 | **0** |
| BrainRotSteal | 1129 | – | 2 | **0** | **0** | **0** | **0** |
| TsunamiEscapeEnglish | 1708 | – | 2 | 12 | 2 | 4 | **0** |
| TornadoHunter200 | 1888 | ✔ | 2 | 4 | **0** | 4 | **0** |
| BlockCraftQuiz | 2427 | ✔ | 4 | 9 | **0** | 14 | **0** |
| SpaceAsteroidQuiz | 2442 | ✔ | 2 | 20 | **0** | 1 | **0** |

Kiindulási teszt-állapot: **743 unit-teszt zöld**, `npm run verify` lánc működik
(`check` → `lint` → `check:test` → `test` → `build`), Playwright E2E külön.

### A négy rendszerszintű hiány

1. **Nincs tanulási visszacsatolás.** Mind a 7 játékban a rossz válasz
   következménye kizárólag büntetés (élet, idő, víz, XP). Egyetlen játék sem
   mondja meg, **miért** rossz — pedig a `shared/lesson-schema.ts`
   `feedbackPerOption` mezője pont ezt tárolja, és a lecke-futtató használja is.
   Tanulás szempontjából ez a legnagyobb veszteség: a hibás fogalom megerősítve
   marad.
2. **Nincs mozgáscsökkentés a három 3D játékban.** A `prefers-reduced-motion`
   nulla helyen szerepel a Tornado / BlockCraft / SpaceAsteroid fájlokban.
   Gyerekeknél a kamerarázás és a részecske-özön rosszullétet okozhat, és ez
   kizárja a játékból az érzékeny tanulókat.
3. **Nincs egységes nehézség-szabályozás.** Ahol van (BlockCraft 14 hivatkozás),
   az a játékba égetett; ahol nincs (SpeedQuiz, BrainRot), ott a gyerek vagy
   unatkozik, vagy elveszíti a kedvét. Nincs közös, mérhető szabály.
4. **Nincs közös élmény-réteg.** Hét külön implementáció ugyanarra: kvíz-kártya,
   streak, XP-visszajelzés, szünet, hang. Ezért javul mindegyik külön ütemben, és
   ezért csúszik szét a minőség.

## 1. Vezérlő elv

**A kvíz nem szakítja meg a játékot — a kvíz a játék része.**

Ma minden játék így működik: `phase: "play" → "quiz" → "play"`. A játék megáll,
felugrik egy kártya, a gyerek kiválaszt egy betűt, a játék megy tovább. Ez
tesztlap játék-díszletben.

Amire cserélni kell: a válasz **a játéktérben legyen tett**, és a következménye
**a játékmenetben** jelenjen meg. A `phase` gépezetet nem dobjuk el (működik és
tesztelt) — a kvíz-fázist gazdagítjuk úgy, hogy a válasz után **mindig
történjen valami a játékvilágban**, és rossz válasznál **mindig legyen tanítás**.

## 2. Szeletek

Minden szelet önállóan mergelhető, saját teszttel, TDD sorrendben:
**előbb a bukó teszt, aztán a kód.**

---

### G-1 — Tanulási visszacsatolás motor (`client/src/game-engine/feedback.ts`)

**Ez a legfontosabb szelet.** Nélküle a többi csak fényezés.

Tiszta, DOM-mentes modul:

```ts
export type AnswerOutcome = "correct" | "wrong" | "timeout";
export type FeedbackCard = {
  outcome: AnswerOutcome;
  headline: string;        // rövid, korosztályhoz igazított
  why: string;             // MIÉRT — ez a tanítás
  correctAnswer: string;
  retryable: boolean;      // kaphat-e második esélyt
};
export function buildFeedback(input: {...}): FeedbackCard;
```

Szabályok:
- Rossz válasznál a `why` **kötelezően** kitöltött. Ha a kvízbankban nincs
  magyarázat, generált tartalék lép be (`"A helyes válasz: X."` önmagában nem
  elég — a tartalék a kérdés típusából épít mondatot).
- Timeout ugyanúgy tanít, mint a rossz válasz — ma csak büntet.
- `retryable`: az első rossz válasz után **egy** javítási esély, csökkentett XP-vel.
  Ez a „mastery learning" alapmintája: a gyerek ne bukott kérdéssel lépjen tovább.

**Tesztek** (`tests/game-feedback.test.ts`), a kód előtt:
1. rossz válasz → `why` nem üres, bármilyen bemenetre (property-teszt jellegű
   végigfuttatás az összes játék kvízbankján);
2. helyes válasz → `retryable === false`;
3. timeout → `outcome === "timeout"`, `why` kitöltött;
4. a `why` sosem tartalmazza a helyes válasz indexét („2. válasz") — mondat legyen;
5. determinisztikus: azonos bemenet → azonos kimenet (seed-elt).

**Kész, ha:** az 5 teszt zöld, és a motor egyetlen játékhoz sincs kötve.

---

### G-2 — Magyarázatok a kvízbankokba

A `why` csak akkor ér valamit, ha van tartalma. A kvízbankok ma
`{prompt, options, correctIndex}` alakúak — kiegészítjük opcionális
`explanation` mezővel, és **feltöltjük** a meglévő kérdésekhez.

- séma-bővítés: `client/src/types/gameQuiz.ts`, visszafelé kompatibilisen
  (opcionális mező, a régi bankok érvényesek maradnak);
- szerver-oldali generátor (`server/gameQuizGeneratorService.ts`) mostantól
  magyarázatot is kér a modelltől;
- a beégetett bankokhoz (Tsunami, BrainRot, SpeedQuiz, WordLadder) kézzel írt
  magyarázat — ezek véges, kis halmazok.

**Tesztek** (`tests/game-quiz-explanations.test.ts`):
1. minden beégetett kvíz-elemnek van `explanation`-je, és nem placeholder;
2. a generátor-séma megköveteli a mezőt;
3. régi, `explanation` nélküli bank továbbra is parse-olható (kompatibilitás).

---

### G-3 — Közös élmény-réteg (`client/src/game-engine/`)

Kiemeljük a hétszer megírt dolgokat:

| Modul | Mit vált ki |
|---|---|
| `QuizCard.tsx` | 7 külön kvíz-felugró, egységes kinézettel + a G-1 magyarázat-kártyával |
| `useReducedMotion.ts` | `prefers-reduced-motion` egy helyen, mind a 7 játéknak |
| `difficulty.ts` | egységes adaptív szabály (lásd G-4) |
| `useGameAudio.ts` | hang be/ki, hangerő, némítás — ma játékonként külön |

Fontos: **a meglévő játék-logikát nem írjuk át**, csak a közös felületet cseréljük.
Minden játék külön commitban vált át, hogy egy hiba egy játékot érintsen.

**Tesztek:** `tests/game-engine-shared.test.ts` — a tiszta modulokra
(`difficulty`, `feedback`); a React-komponensekre a meglévő
`*-wiring-guard.test.ts` mintát követő statikus kötés-ellenőrzés.

---

### G-4 — Adaptív nehézség (`client/src/game-engine/difficulty.ts`)

Egy szabály mind a 7 játékra, tiszta függvényként:

```ts
export function nextDifficulty(state: {
  recentCorrect: boolean[];   // utolsó N válasz
  current: number;            // 0..1
}): number;
```

Elv (mastery-alapú, nem véletlen):
- 3 egymás utáni helyes → nehezít (`+0.1`, felső határ 1);
- 2 egymás utáni rossz → könnyít (`-0.15`, alsó határ 0.15) — a könnyítés
  gyorsabb, mint a nehezítés, mert a frusztráció drágább, mint az unalom;
- a sáv soha nem esik 0 alá és nem ugrik 1 fölé;
- determinisztikus, tesztelhető, seed nélkül.

**Tesztek** (`tests/game-difficulty.test.ts`):
1. 3 helyes → nő; 2 rossz → csökken;
2. határok tartása szélsőséges sorozatokra;
3. váltakozó helyes/rossz → nem oszcillál vadul (a változás korlátos);
4. üres előzmény → a kiinduló érték változatlan.

---

### G-5 — Mozgás- és akadálymentesség a 3D játékokban

Tornado / BlockCraft / SpaceAsteroid:
- `useReducedMotion()` bekötése: kamerarázás ki, részecskeszám a felére,
  villogó effektek statikus jelzésre cserélve;
- a kvíz-kártya mindig fókuszálható, `Escape` = szünet, a válaszok
  billentyűzetről is elérhetők (1–4);
- kontraszt: a kvíz-szöveg a 3D háttér előtt is olvasható marad (a lecke-oldalon
  már megvolt ez a kör, #198 — ugyanazt a mércét hozzuk ide).

**Tesztek:** `tests/game-reduced-motion.test.ts` statikus kötés-ellenőrzés
(a három fájl importálja és használja a hookot), plusz Playwright
`tests/games-a11y.spec.ts` a billentyűzetes végigjátszásra.

---

### G-6 — Játékonkénti élmény-javítás

Csak a G-1…G-5 után, mert azok a közös alapot adják. Játékonként külön commit,
mindegyik előtt a saját mérése.

- **SpeedQuizMath** — a leggyengébb élmény: nincs rAF, nincs animáció, nincs
  érintés-optimalizált gomb. Kap tempó-visszajelzést (helyes válasz → látható
  lendület), és a `setTimeout`-alapú időzítés helyett monoton órát, hogy a
  háttérbe tett fül ne csaljon.
- **BrainRotSteal** — 0 touch-kezelő: mobilon a kattintás-célpontok pontatlanok.
  Pointer-eventre váltás, nagyobb találati zóna, spawn-ritmus a G-4 sávjából.
- **WordLadderHuEn** — a létra-animáció jó (#207 kör), de a kvíz és a mászás
  külön él; a válasz utáni lépés legyen a válasz **következménye**, ne külön fázis.
- **TsunamiEscapeEnglish** — a víz emelkedése ma büntetés-óra; kösd a
  streakhez, hogy a jó sorozat látható haladás legyen.
- **TornadoHunter200** — a legfrissebb (#200–#206), a vezérlés már javított; itt
  a reduced-motion és a kvíz-integráció a feladat.
- **BlockCraftQuiz** — a legtöbb adaptív logika itt van; ezt kell a közös
  `difficulty.ts`-re cserélni, hogy ne két rendszer legyen.
- **SpaceAsteroidQuiz** — 149 THREE-hivatkozás, a legnehezebb; utolsóként.

---

### G-7 — Visszaellenőrzés futó appon

Nem elég, hogy a teszt zöld. Minden szelet után:
1. `npm run verify` (típus + lint + unit + build);
2. Playwright E2E az érintett játékra, **képernyőképpel** — a képet meg is nézem,
   nem csak a „passed" sort;
3. deploy után ugyanez az éles URL-en.

**Ez a terv nem tekinti késznek azt a szeletet, aminek az eredményét nem láttam
futó appban.**

## 3. Amit ez a terv NEM csinál

- Nem ír új játékot. Hét van, az elég; a meglévők minőségét emeljük.
- Nem cseréli le a `phase` állapotgépeket — működnek és tesztelve vannak.
- Nem nyúl a kupon/XP gazdasági szabályokhoz (`shared/reward-policy.ts`)
  a mérési alap nélkül: az élő gyerek-progressziót érintené.
- Nem „polírozza túl" a grafikát: a 3D látvány ma is rendben van, a hiány a
  tanulási hurokban és a hozzáférhetőségben van.

## 4. Sorrend

```
G-1 (feedback motor)  →  G-2 (magyarázatok)  →  G-3 (közös réteg)
        →  G-4 (adaptív nehézség)  →  G-5 (a11y/reduced-motion)
        →  G-6 (játékonként, 7 commit)  →  G-7 (folyamatos visszaellenőrzés)
```

G-1 és G-2 önmagában is mérhető tanulási nyereség, ezért ezek mennek először.
