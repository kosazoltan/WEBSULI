# Terv: a PR-kapu böngészős köre csak az érintett játékra, és olcsó lépések előre (fail-fast)

> Tulajdonosi döntés (2026-11-19): „Csak az érintett játék tesztjei”. Ág: `fix/gate-pr-celzott-e2e` (a friss `origin/main`-ről, a
> kapu-gyorsítás után). Végrehajtás: `docs/specs/2026-11-19-gate-pr-celzott-e2e-vegrehajtas.md`.

## 1. Probléma

- A `gate:pr` (`scripts/qa/gates/pre-pr-gate.mjs`) játékváltozásnál a játék spec-jei mellett MINDIG futtatja a `game-meta-quality` és a
  `coupon-expired-all-games` spec-et (`alwaysGameSpecs`), amelyek minden játékot bejárnak — egyetlen játék javításánál is ez a kör
  viszi el az időt (a teljes helyi böngészős kör ~1 óra; cél: 5–15 perc).
- A játék ↔ spec megfeleltetés a spec FÁJLNEVÉRE illesztett regexen múlik (`games` tábla): pl. a `block-art.spec.ts` a `block-?craft`
  mintára nem illik, és új spec csendben kimaradhat.
- A közös, de nem a `game-engine/` alatti fájlok (hangmotor: `client/src/lib/audioEngine.ts`; a mérő spec-ek; a tesztsegédek) ma UI-
  változásnak számítanak (spec-említés alapú választás) — a teljes kör helyett.
- Az olcsó, determinisztikus lépések (tiszta munkafa, háromfázisú rend, PR-méret) a drága `npm test` UTÁN futnak; a PR-leírás és az
  ítélet hibája sem állítja meg a kaput — a drága kör akkor is lefut, ha a kapu biztosan bukik.

## 2. Cél

1. Játékváltozásnál a helyi böngészős kör CSAK az érintett játék saját spec-jeit és a közös mobil mérőt (a játékra szűrve) futtatja.
2. A játék ↔ spec ↔ mérő-szűrő megfeleltetés **konfigtábla** (`gates.config.json` `gameE2e`), őr-teszttel: minden játék-spec pontosan
   egy játékhoz tartozik vagy a közös listán van, minden felsorolt spec létezik.
3. **Fail-safe:** közös vagy ismeretlen játékfájl (játékmotor, `Games.tsx`, hangmotor, mérő spec-ek, tesztsegédek, több játékra illő
   fájl) → a teljes helyi játék-kör (minden játék mobil mérője + minden játék-spec + meta-mérő + lejárt kupon) — a mai `allGames` út.
4. A kapu kiírja, mit futtatott helyben, és mit hagyott a CI-ra (a játék nélküli spec-ek, a többi játék, a meta-mérő, a lejárt kupon).
5. **Fail-fast sorrend** a `gate:pr`-ben: PR-leírás sablon → független ítélet a fejre → tiszta munkafa → `git fetch` → háromfázisú rend →
   PR-méret; az első bukásnál a kapu azonnal megáll (a bizonyíték `ok: false`), a drága lépés (lint, `npm test`, build, böngésző) nem
   indul. A sorrendet teszt rögzíti.

## 3. Nem cél

- A CI böngészős köre nem változik (a #518 szeletei mindent futtatnak).
- A UI-ág (nem játék) választása nem változik.
- A push-kapu lépéskészlete nem változik (csak a sorrendje: az olcsó lépések előre).

## 4. Megoldás

- `gates.config.json`: `gameE2e: { "<játék-id>": { "specs": [...], "meterGrep": "<id>" } }`, `sharedGameFiles` (előtag-lista: a mai
  `sharedGamePatterns` + `source/client/src/lib/audioEngine.ts` + a mérő spec-ek + a `source/tests/` `helpers/`, `fixtures/`,
  `support/`, `game-mobile-cases/`, `game-win-cases/` mappái és az `e2e-seed.ts`),
  `gameAreaPatterns` (ahol játékfájl lehet; ami itt van, de egyetlen játékra sem illik → ismeretlen → teljes kör).
- `pickE2eSpecs`: (a) közös / ismeretlen / több játékra illő fájl → teljes kör (a mai `allGames`); (b) csak ismert játékok → játékonként
  a `gameE2e` spec-jei + a mobil mérő a `meterGrep`-pel; az `alwaysGameSpecs` a CI-ra marad; (c) UI → változatlan. Visszaadja a
  `leftToCi` listát is, a kapu kiírja.
- `pre-push-gate.mjs`: `runCheapSteps({ gate, ctx })` (tiszta munkafa, fetch, háromfázisú rend, PR-méret) — a `runPrePushSteps` ezzel
  kezd; `stopOnFail` mellett az első FAIL után nem fut tovább.
- `pre-pr-gate.mjs`: `cheapPhase(steps)` — a PR-leírás, az ítélet és a `runCheapSteps` lépései sorban; az első FAIL után
  `gate.finish()`, a `pre-pr-<fej>` bizonyíték `ok: false`, kilépés 1; a drága fázis a `runPrePushSteps({ skipCheap: true })`.

## 5. Edge case-ek

- Játékfájl + UI-fájl együtt → a játék-kör (a UI-spec-ek a CI-ra; kiírva).
- Két játék egyszerre → mindkettő saját köre (két mérő-szűrő `|`-vel).
- A változott spec-fájl mindig fut (a mai szabály), a `gameE2e`-ben nem szereplő változott spec → ismeretlen → teljes kör.
- Törölt játék-spec: a táblából is törölni kell (az őr-teszt bukik).
- A külső (Gemini) sor WARN / SKIP — nem állít meg.

## 6. Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] AMIKOR csak egy ismert játék fájljai változnak, a böngészős kör a játék `gameE2e` spec-jeit és a mobil mérőt (a játékra szűrve)
  futtatja, a meta-mérőt és a lejárt kupont NEM; a kapu kiírja a CI-ra hagyott spec-eket.
- [ ] AMIKOR közös / ismeretlen / több játékra illő játékfájl változik (hangmotor, mérő, tesztsegéd is), a teljes helyi játék-kör fut.
- [ ] A `gameE2e` tábla őr-teszttel: minden játék-spec besorolt, minden felsorolt spec létezik.
- [ ] A `gate:pr` olcsó lépései (PR-leírás, ítélet, tiszta munkafa, fetch, háromfázisú rend, PR-méret) futnak előbb; az első bukásnál
  a kapu megáll, drága lépés nem indul; teszt rögzíti a sorrendet és a megállást.
- [ ] Egy játékra szabott helyi kör futásideje mérve (cél 5–15 perc).
