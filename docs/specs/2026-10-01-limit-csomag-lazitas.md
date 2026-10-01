# Limiten a hibás tétel kivétele után lazított fejezet-csomag (2026-10-01)

**Tulajdonosi döntés (2026-10-01, 1. opció).** Mért (öt egymást követő élő Egyiptom-futás, utolsó: run 1a276e30, job
602481ef): a bank javítása lassan konvergál; a limit végén 1–3 hibás tétel marad, és a fejezetenkénti minimális csomagból már
egy nyílt feladat kivétele is minimumsértés (szóbeli+írásbeli pár, `max(2, fogalomszám)` darab) → a lecke nem készül el.

**Szabály:** a limiten, a hibás (vagy tanítatlan fogalmú) tétel KIVÉTELE után az érintett fejezet csomagja lazított: a nyílt
feladatok darab- és szóbeli/írásbeli-pár követelménye nem kötelező, de a fejezet minden fogalmához marad legalább 1 nyílt
feladat; a módszer- és kvízminimum, valamint a teljes bank 45/75-ös minimuma VÁLTOZATLAN. A lazítás adatként tárolódik:
`bankPlan.trimmedSections` (a kapu állítja, csak kivételkor, csak az érintett fejezetekre); a séma csak ott lazít.

**Nem-cél:** a bankgyártás, a javítókörök, a 45/75-ös minimum, a nem-limites kivétel szabálya.

**Elfogadás (EARS):** HA a limiten tétel-kivétel után az egyetlen hiba az érintett fejezet nyílt-feladat darab/pár-követelménye,
AKKOR a lecke publikál, `trimmedSections` jelöléssel és minőségi jegyzettel; HA bármely fogalomnak nem marad nyílt feladata,
vagy más bankhiba van, AKKOR elutasítás (változatlan). Jelölés nélküli bankra a séma a régi szigorral érvényes.
