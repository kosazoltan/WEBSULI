# Spec: kupon-bónusz bekötés + react-hooks kapu

> Dátum: 2026-09-06 · Ág: `feat/coupon-claim-hooks-gate` · Kanban: WEBSULI #204
> Osztály: M (több játékoldal, közös helper, lint-kapu)

## Cél

A két ismert lyukat zárni:

1. **claimBonus** — a kupon-óra HUD ott van mind az 5 kupon-játékon, de a helyes
   válasz utáni `claimBonus(quizItemId)` hívás csak a Tornado Hunterben él. A
   gyerek a másik négy játékban helyesen válaszol, a szerver +30 s soha nem jár.
2. **eslint-plugin-react-hooks** — a #310 (hook early-return után) osztályú
   crash-t a lint-kapu nem látja; csak egy studio-parse guard van.

## Nem-cél

- WordLadder / SpeedQuiz (nincs a `COUPON_GAME_IDS`-ben).
- `react-hooks/exhaustive-deps` bekapcsolása (áradat a 0-warning kapun; a lyuk
  a `rules-of-hooks`).
- Kvíz-UI / játéklogika átírása.
- Hamis azonosító küldése a bónusz-végpontra (400/409 zaj).

## Érintett fájlok

| Fájl | Művelet |
|---|---|
| `client/src/game-engine/claimCouponBonus.ts` | ÚJ — tiszta: UUID-szűrés + hívás |
| `tests/claim-coupon-bonus.test.ts` | ÚJ RED |
| `tests/coupon-claim-wiring-guard.test.ts` | ÚJ RED — 5 játék + komment-szűrő |
| `tests/eslint-react-hooks-plugin-guard.test.ts` | ÚJ RED — a plugin be van kötve |
| `client/src/pages/{TsunamiEscapeEnglish,BrainRotSteal,SpaceAsteroidQuiz,BlockCraftQuiz,TornadoHunter200}.tsx` | kvíz-`id` megmarad, helyes válasznál helper |
| `eslint.config.js` + `package.json` | `eslint-plugin-react-hooks`, `rules-of-hooks: error` |

## Döntések

1. **Csak UUID.** A `game_quiz_items.id` `gen_random_uuid()`. A fallback bank
   (`"1"`, `"mat-0"`) NEM claimelhető — a szerver `served_items @>` elutasítja,
   és a kliens ne küldjön 400-at minden helyes fallback-válaszra.
2. **Egy helper.** `maybeClaimCouponBonus(coupon, id)` — `active` + UUID
   után `void claimBonus(id)`. A játékok nem inventálnak saját feltételt.
3. **`rules-of-hooks: error`.** `exhaustive-deps` ki van kapcsolva ebben a
   szeletben. A studio parse-guard megmarad (kettős háló).
4. **A kapu a plugin jelenlétét is méri**, ne csak a szabálynevet: a
   `eslint.config.js` importálja a plugint, a `package.json` listázza.

## Elfogadás (EARS)

- Amikor a kvíz-elem `id` UUID és a kupon `active`, a rendszer meghívja
  `claimBonus(id)`-t.
- Amikor az `id` hiányzik vagy nem UUID, a rendszer NEM hív.
- Amikor a kupon nem aktív, a rendszer NEM hív.
- A 5 kupon-játék forrása (kommentek nélkül) tartalmazza a
  `maybeClaimCouponBonus` hívást.
- Az eslint-konfig `react-hooks/rules-of-hooks` error, a plugin a
  `devDependencies`-ben van.
- Mutáció: a helper UUID-szűrőjét kiütve a teszt PIROS; a plugin-importot
  törölve a guard PIROS.

## Nevesített RED tesztek

```
node --import tsx --test tests/claim-coupon-bonus.test.ts tests/coupon-claim-wiring-guard.test.ts tests/eslint-react-hooks-plugin-guard.test.ts
```

- UUID → claim; `"1"` / `undefined` / inaktív kupon → 0 hívás
- 5 oldal: `maybeClaimCouponBonus(` kommentek nélkül
- `eslint.config.js` importálja az `eslint-plugin-react-hooks`-t
  és `rules-of-hooks` error
