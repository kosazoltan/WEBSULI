# LS-3b — Közös játék-menet: kupon-óra, HUD és a lecke Próbája

- **Kanban**: #104
- **Ág**: `feat/ls-3b-game-engine` (a `feat/ls-3a-rewards-coupons` @ `34cfd5c`-ből — **stackelt**)
- **Master terv**: `docs/specs/lesson-studio-master-plan-2026-09-04.md` §9 · runbook §6
- **Dátum**: 2026-09-04

## Cél

A gyerek a lecke szakaszának Próbáját kitölti (LS-3a értékeli), kap egy kupont, és a
kuponnal átmegy a Tsunamiba vagy a BrainRotba: a HUD a **szerver által számolt**
hátralévő időt mutatja, a helyes játék közbeni válasz +30 s-ot ér, nulla időnél a
játék visszaküldi a leckéhez.

## Nem-cél (LS-3b-ben NEM készül el)

- Space, BlockCraft, SpeedQuiz, WordLadder átállítása → LS-4 és utána (D3 sorrend).
- A `QuizModal` egyesítése a futtató `CheckBlock`-jával: a két játék saját kvíz-UI-ja
  **változatlan marad**. Ok: az egyesítés két 1000+ soros játék belső átírása, ami
  önmagában egy szelet, és a kupon-hurok nélküle is teljes.
- Animációk, `try` blokkok, TTS, szigorú CSP → LS-4.
- `bestStreak` javítása: **nincs mit javítani** — a Tsunami `runBestStreakRef`-fel, a
  BrainRot `Math.max`-szal már a futáson belüli maximumot követi (mérve, nem feltételezve).
- **A +30 s bónusz bedrótozása a játékokba.** A szerveroldala kész és tesztelt
  (`POST /coupons/:id/bonus`, kiszolgált-tétel + egyszeri beváltás őrrel), és a hook is
  kínálja `claimBonus`-ként — de a kiszolgáló lépés (`served_items` feltöltése
  lecke-kötött kvíz-tételekkel) az LS-5 „publikáláskor minden `check` → `game_quiz_items`"
  munkája. A két játék saját kvíz-bankja nem hordoz szerver által kiadott azonosítót,
  ezért egy mostani bekötés minden hívásra 400-at kapna. Kitalált azonosítót küldeni
  hamis funkció lenne — inkább nincs bekötve, mint hogy úgy tűnjön, működik.

## Érintett fájlok

| Fájl | Művelet |
|---|---|
| `client/src/game-engine/coupon-clock.ts` | ÚJ — tiszta: szerver-szinkron + helyi tick, szünet |
| `client/src/game-engine/useCouponSession.ts` | ÚJ — React hook (lekérdezés, tick, bónusz) |
| `client/src/game-engine/CouponHud.tsx` | ÚJ — visszaszámláló + „idő lejárt" réteg |
| `client/src/lesson-runtime/SectionProba.tsx` | ÚJ — Próba-beküldés, kupon-szalag |
| `client/src/lesson-runtime/LessonRuntime.tsx` | BŐVÍT — szakaszonként Próba, gyenge fogalmak |
| `client/src/pages/TsunamiEscapeEnglish.tsx` | BŐVÍT — HUD + bónusz + lejárat |
| `client/src/pages/BrainRotSteal.tsx` | BŐVÍT — ugyanaz |
| `tests/game-engine.test.ts` | ÚJ RED |
| `docs/ls-3-jutalom-hasznalat.md` | ÚJ — magyar tulajdonosi útmutató (LS-3a+b) |

## Döntések

**A szerver az óra, a kliens a másodpercmutató.** A hook 15 másodpercenként lekérdezi a
`GET /api/lessons/coupons/active` értéket, és a két szinkron között helyben számol
tovább. Minden szinkron **felülírja** a helyi értéket — a helyi tick sosem kerülhet a
szerver fölé, csak alá. Ez a különbség a „kényelmes UI" és a „hamisítható jutalom"
között.

**Szünet elrejtett fülre.** `visibilitychange` / `blur` esetén a helyi tick megáll, de a
**szerver órája nem** — így az újbóli megjelenéskor a szinkron behozza a valóságot. A
szünet tehát nem időnyerés, hanem az, hogy a HUD ne hazudjon addig sem.

**A bónusz elutasítása néma.** A `409` (már beváltott) semmit nem jelenít meg: egy
duplán elküldött válasz nem hibaüzenetet érdemel, hanem csendet.

**Kupon nélkül minden változatlan.** `freePlay` alapértéke `true`, és kupon hiányában a
hook `null`-t ad: se HUD, se lejárat-réteg, se bónuszhívás. A két játék a mai
viselkedését hozza — ez a nem-regressziós határ.

## Elfogadási feltételek (EARS)

- **AC1** — Amikor a szerver szinkronja megérkezik, a rendszer a szerver hátralévő idejét
  veszi át, akkor is, ha a helyi számláló többet mutatna.
- **AC2** — Amikor az oldal háttérbe kerül, a helyi visszaszámlálás megáll, és a
  következő szinkron a szerver szerinti (kevesebb) időt állítja be.
- **AC3** — Amikor a hátralévő idő eléri a nullát, a rendszer `expired` állapotba megy, és
  nem megy negatívba.
- **AC4** — Amikor nincs aktív kupon, a rendszer `null` menetet ad, és a játék
  változatlanul, kupon nélkül működik.
- **AC5** — Amikor a gyerek egy szakasz Próbáját beküldi, a kliens **nem** küld pontszámot,
  csak a választott indexeket.
- **AC6** — Amikor a Próba kupont eredményez, a futtató megjeleníti a perceket és a
  játékra vezető gombot; amikor nem, a gyenge fogalmakat emeli ki.

## Nevesített tesztek (RED előbb)

`tests/game-engine.test.ts`
- `AC1 a szerver szinkronja felülírja a helyi számlálót`
- `AC1 a helyi tick nem mehet a szerver értéke fölé`
- `AC2 szünetben nem fogy a helyi idő`
- `AC2 szünet után a szinkron behozza a szerver szerinti időt`
- `AC3 a hátralévő idő nem megy negatívba`
- `AC3 nulla időnél a menet lejárt`
- `AC4 kupon nélkül nincs menet`
- `a másodperc-formázás m:ss alakú`

## Verifikáció

```bash
cd source
node --import tsx --test tests/game-engine.test.ts
npx tsc --noEmit
npx eslint client/src server shared --max-warnings 989
node --import tsx --test "tests/*.test.ts"
npm run build && npx playwright test
```

Plusz: Playwright render 360×740-en a HUD-ról és reverz-mutáció a szinkron-őrre.
