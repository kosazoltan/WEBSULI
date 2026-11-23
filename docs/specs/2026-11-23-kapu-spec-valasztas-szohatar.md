# PR-kapu — a böngészős tesztek kiválasztása szóhatárral (2026-11-23)

## Cél

A `gate:pr` „UI-spec-ek (a változott komponenseket említők)” lépése csak azokat a böngészős teszteket futtassa, amelyek a változott
komponens nevét ÖNÁLLÓ azonosítóként említik.

## Felülvizsgálat (TÉNY)

- `scripts/qa/gates/pre-pr-gate.mjs` `pickE2eSpecs`: a változott kliensfájlok tövét (`stemOf`, legalább 4 karakter) részszóként keresi a
  teszt szövegében (`readSpec(s).includes(st)`).
- Az adventi PR-C (`feat/advent-c-felulet-es-elesites`) változott fájljai között van a `client/src/advent/sync.ts` és a `busy.ts`. A
  `sync` tő mind a 83 `tests/*.spec.ts` fájlban megtalálható — az `async` szó részeként. A kapu ezért mind a 83 tesztet kiválasztotta
  (a naplóban 86 név a parancssorban), egy szálon; a futás a `run-e2e-tests.ts` 60 perces keretén elbukott („Playwright timed out”,
  3603 s). A PR-kapu így ezen az ágon soha nem lehetett zöld (2026-11-22-én és 2026-11-23-án is ezen bukott).

## Döntés

A tő akkor „említett”, ha a teszt szövegében azonosító-határok között áll: előtte és utána nem betű, számjegy, aláhúzás vagy kötőjel (a fájlnevek kebab-case alakja miatt: `aria-busy` ≠ `busy`)
(`async` ≠ `sync`; `advent/sync`, `"sync.ts"`, `useAdvent(` egyezik). A játékszeletek kiválasztása, a változott spec-fájlok kötelező
futtatása és a „nincs egy spec sem” figyelmeztetés nem változik.

## Nem-cél

A `run-e2e-tests.ts` időkerete, a szálak száma, a játék-ág kiválasztása, a kapu többi lépése.

## Edge case-ek

- Rövid, köznyelvi tövek (`sync`, `busy`, `sort`, `list`): csak önálló azonosítóként egyeznek.
- A tő reguláris kifejezésbe kerül: a különleges karaktereket (pl. `.`, `-`, `$`) szó szerint kell venni.
- Kis- és nagybetű: megkülönböztetve marad (mint eddig).
- Ha a szigorúbb egyezés miatt egy teszt sem említi a változott komponenst: a meglévő figyelmeztetés él (nem bukás).

## Elfogadás (EARS)

- **K1** — WHEN a változott fájl töve csak egy másik szó részeként szerepel a tesztben, THE kapu SHALL NOT kiválasztani a tesztet.
- **K2** — WHEN a tő önálló azonosítóként (útvonalban, idézőjelben, hívásban) szerepel, THE kapu SHALL kiválasztani a tesztet.
- **K3** — THE változott spec-fájlok SHALL továbbra is mindig futni; a játék-ág kiválasztása SHALL változatlan maradni.
- **K4** — WHEN az adventi PR-C változott fájllistájára fut a kiválasztás a főág tesztjein, THE kiválasztott tesztek száma SHALL a
  korábbi 83 töredéke lenni (mérve 2026-11-23-án: 83 → 6 — a három adventi teszt, `lesson-contrast`, `studio-ui`, `websuli`).

<!-- acceptance-checklist -->
- [ ] K1 részszó nem egyezik
- [ ] K2 önálló azonosító egyezik
- [ ] K3 változott spec és játék-ág változatlan
- [ ] K4 mért szám az adventi fájllistára
