# Ciklus 7 — „pontos alak” a magyar nyelvtani feladatokra (toldalékcsere ne kapjon teljes pontot)

**Mért (2026-10-21, célzott újragyártás után is):** A főnév és Tulajdonságot kifejező szavak a lektoron 3×–3× elbukott. Ok: a magyar
pontozó toldaléktűrő (tövez), ezért a ragcsere teljes pontot kap — mért: `required [["anyával"]]` mellett az „anyának” → ok; ugyanez
`requiredPhrases [["anyával"]]`-lal → partial. A banképítő prompt (`experience-builder.ts:628`) és a lektor (`step-io.ts:639`) is a
`requiredPhrases`-t írja elő az alak-feladatra, a modell mégsem használja; a gépi kifejezés-szigorítás (S5b) magyar leckén ki van kapcsolva
(a szórend szabad).

## Cél
Magyar (nem idegen nyelvi) leckén, ha egy blokkoló hibás próba teljes pontot kap, és a helyes mintától CSAK toldalékban tér el (van a
mintában olyan szó, amelynek töve a hibásban megvan, de pontos alakja nincs), a gépi kalibráció a minta pontos szóalakját egyszavas
`requiredPhrases` csoportként felveszi (pontos egyezés; egy szónál a szórend nem számít) — ha a minta és minden teljes pontos helyes
próba továbbra is teljes pontot kap, a hibás pedig nem.

## Nem-cél
Többszavas kifejezés / sorrend magyar leckén (marad kikapcsolva); a pontozó tövezésének átírása; idegen nyelvi S5b változatlan.

## Edge case-ek
A lektor által kifogásolt feladat (ciklus 6): semmilyen gépi szigorítás. Ha a helyes próbák között is más alak szerepel (pl. „késsel”
és „anyával”), a csoport VAGY-alternatívákat kap (a helyes próbák pontos alakjai), különben nincs szigorítás. Gépi szigorításként jelölt
(`tightenedPhrases`, S4 lazíthat).

## Elfogadás (EARS)
- HA magyar leckén a blokkoló hibás próba csak toldalékban tér el, AKKOR a kalibráció egyszavas pontos-alak csoportot vesz fel, és a hibás
  próba nem kap teljes pontot, a minta és a helyesek igen.
- HA a különbség nem toldalék (más szó), AKKOR ez a lépés nem fut (a többi szigorítás a régi).
