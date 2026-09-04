# LS-3a — Jutalom-politika, kupon és szerveroldali Próba-értékelés

- **Kanban**: #103
- **Ág**: `feat/ls-3a-rewards-coupons` (a `main` @ `5522680`-ból)
- **Master terv**: `docs/specs/lesson-studio-master-plan-2026-09-04.md` §4, §8 · runbook §6
- **Dátum**: 2026-09-04

## Cél

A gyerek a lecke egy szakaszának **Próbáját** kitölti, a **szerver** javítja ki (a
kliens pontszámát soha nem hisszük el), és ha jól ment, **játékidő-kupon** keletkezik,
amelynek az órája is a szerveren jár. Ez a D2 döntés gépi formája.

## Nem-cél (LS-3a-ban NEM készül el)

- A közös játékmotor (`useGameSession`), a HUD-visszaszámláló, a Tsunami/BrainRot
  átállítása → **LS-3b** (#104).
- A `CouponBanner` és a gyenge fogalmak automatikus kinyitása a futtatóban → LS-3b.
- Animációk, `try` blokkok, TTS, szigorú CSP → LS-4.
- Fogalom-statisztika a Stúdióban → LS-5.

## Érintett fájlok

| Fájl | Művelet |
|---|---|
| `shared/reward-policy.ts` | ÚJ — `RewardPolicy` típus + `computeCoupon` (tiszta függvény) |
| `shared/schema.ts` | BŐVÍT — `rewardPolicy`, `coupons`, `conceptResults` táblák |
| `migrations/0010_rewards_coupons.sql` | ÚJ — additív, idempotens |
| `server/rewards/grade.ts` | ÚJ — Próba javítása a lecke JSON-jából (tiszta) |
| `server/rewards/coupons.ts` | ÚJ — kupon-óra, bónusz, lejárat (tiszta számítás + DB) |
| `server/studio/lesson-routes.ts` | BŐVÍT — `/:id/proba`, `/coupons/*` végpontok |
| `server/index.ts` | BŐVÍT — rate limit a `/api/lessons/*/proba`-ra |
| `tests/reward-policy.test.ts` | ÚJ RED |
| `tests/proba-server-grading.test.ts` | ÚJ RED |
| `tests/coupon-clock.test.ts` | ÚJ RED |
| `docs/ls-3a-jutalom-hasznalat.md` | ÚJ — magyar tulajdonosi útmutató |

## Döntések

**D2 gépi formája.** A létra (`ladder`), a küszöbök, a bónusz-másodperc, a lejárat és a
szabad játék kapcsolója **mind a `reward_policy` táblából jön**, kódban egyetlen szám
sem szerepel. A `computeCoupon` a politikát paraméterként kapja — ha valaki beégetne egy
literált, a `reward-policy.test.ts` „politika objektumból, nem literálból" esete elbukik.

**A szerver javít.** A `POST /api/lessons/:id/proba` a **tárolt lecke JSON-jából** veszi
a helyes válaszokat; a kérésben küldött pontszámot figyelmen kívül hagyjuk (nincs is ilyen
mező). Ok: a kupon valódi jutalom (képernyőidő), tehát a kliens érdekelt a hazugságban.

**A kupon órája szerveroldali.** A `serverStartedAt` a szerveren íródik; a hátralévő idő
mindig `minutes*60 + bónuszok − (most − serverStartedAt)`. A kliens csak megjeleníti.
Egy elrejtett fül vagy egy átállított rendszeróra nem hosszabbítja meg a játékidőt.

**Bónusz csak kiszolgált kérdésre.** A `+30 s` csak akkor jár, ha a kérdés azonosítója
szerepel a kupon `served_items` listájában (a szerver tette oda), és még nem lett
beváltva. Egy kitalált `quizItemId` 400-at kap, egy megismételt 409-et.

**Létra-sorozat kulcsa (user|fingerprint, lessonId).** Két különböző lecke sorozata nem
adódik össze; a 4 perc a *ugyanabban a leckében* elért negyedik hibátlan szakaszért jár.

**A `freePlay` alapértéke `true`.** A master terv §9 két helyen mást mond (`false`
bejelentkezett gyereknek / `true` látogatónak). LS-3a a **runbook §6 értékét** veszi
(`freePlay=true`), mert ez a nem-regresszív default: a kupon nélküli játék ma is megy,
és egy jutalom-funkció nem zárhatja el a meglévő oldalt. A megszigorítás a tulajdonos
külön döntése, egy sor a `reward_policy` táblában.

## Elfogadási feltételek (EARS)

- **AC1** — Amikor a Próba pontszáma `< retry` (80), a rendszer **nem** ad kupont, a
  létra-sorozatot **0-ra állítja**, és visszaadja a gyenge fogalmak azonosítóit.
- **AC2** — Amikor a pontszám `retry ≤ score < perfect`, a rendszer az **aktuális**
  létrafokot adja kuponként, és a sorozatot **nem** lépteti.
- **AC3** — Amikor a pontszám `= perfect` (100), a rendszer a `ladder[min(streak, len-1)]`
  percet adja, és a sorozatot **eggyel lépteti**.
- **AC4** — Amikor a lecke **záró** Próbája 100 %, a rendszer `lessonPerfectMax` (10) percet ad.
- **AC5** — Amikor a kliens pontszámot vagy helyes választ küld a kérésben, a szerver azt
  figyelmen kívül hagyja, és a tárolt lecke JSON-ja alapján értékel.
- **AC6** — Amikor egy kupon `start` után lekérdezik, a hátralévő idő a szerveren tárolt
  `serverStartedAt`-ból számolódik, és lejárt kuponra `remainingSeconds = 0`.
- **AC7** — Amikor egy bónusz-kérés olyan `quizItemId`-t hoz, amelyet a szerver nem
  szolgált ki ehhez a kuponhoz, a rendszer elutasítja (400) és nem ad időt.
- **AC8** — Amikor ugyanazt a kiszolgált `quizItemId`-t másodszor váltják be, a rendszer
  elutasítja (409) és nem ad időt.
- **AC9** — Amikor a `reward_policy` sora hiányzik, a rendszer a kódbeli
  `DEFAULT_REWARD_POLICY`-vel dolgozik (nem hibázik el egy hiányzó seed miatt).

## Nevesített tesztek (RED előbb)

`tests/reward-policy.test.ts`
- `AC1 gyenge eredmény: nincs kupon, a sorozat nullázódik`
- `AC2 80–99 %: kupon jár, a létra nem lép`
- `AC3 négy egymást követő 100 %: 1, 2, 3, 4 perc`
- `AC3 a létra a legfelső fokon megáll`
- `AC4 záró próba 100 %-on lessonPerfectMax`
- `AC9 hiányzó politika-sor esetén a beépített alapérték érvényes`
- `a percértékek a politikából jönnek, nem literálból` (módosított politika → módosított kimenet)

`tests/proba-server-grading.test.ts`
- `AC5 a kérésben küldött pontszám nem befolyásolja az eredményt`
- `a rossz válaszok fogalmai kerülnek a weakConceptIds-be`
- `a szakaszon kívüli blokk nem számít bele`
- `hiányzó válasz = rossz válasz`
- `csak a check blokkok számítanak`

`tests/coupon-clock.test.ts`
- `AC6 a hátralévő idő a serverStartedAt-ból számolódik`
- `AC6 lejárt kupon: 0 másodperc`
- `el nem indított kupon: a teljes idő hátravan`
- `AC7 ki nem szolgált kérdés bónusza elutasítva`
- `AC8 kétszer beváltott kérdés elutasítva`
- `a bónusz nem növelheti a hátralévő időt a lejárat fölé`

## Verifikáció

```bash
cd source
node --import tsx --test tests/reward-policy.test.ts tests/proba-server-grading.test.ts tests/coupon-clock.test.ts
npx tsc --noEmit
npx eslint client/src server shared --max-warnings 989
node --import tsx --test "tests/*.test.ts"
npm run build
```

Plusz: DB-próba az élő sémán (beszúrás, UNIQUE/FK-viselkedés, cascade) és
reverz-mutáció legalább egy őrre.
