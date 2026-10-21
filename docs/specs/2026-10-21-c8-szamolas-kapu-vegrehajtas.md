# Ciklus 8 — számolás-ellenőrzők — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-c8-szamolas-kapu.md`.

1. **`source/server/studio/tools/arithmetic-claims.ts` `falseArithmeticClaims`:** a páronkénti összevetés előtt, ha `segments[0]`-ban
   `\d:\s` (tapadó, utána szóközös kettőspont) áll, a legutolsó ilyen kettőspont UTÁNI rész értéke is számít; ha az egyenlő a
   következő taggal, a lánc nem hamis.
2. **`source/shared/single-choice-check.ts` `embeddedArithmeticProblems`:** az eredmény után — egyetlen „a : b” (egész) kifejezés,
   nem egész eredmény, minden opció egész → várt érték: maradék-kérdésnél `a % b`, különben `Math.floor(a / b)`; az üzenet ezt nevezi meg.
3. **Tesztek:** a három mért címke-eset (nincs jelzés), egy valódi hamis állítás címkével (jelzés marad), a „12: 4 = 3”; a „95 : 4”
   hányados- és maradék-kérdés egész opciókkal (helyes → nincs jelzés; két jó / nincs jó → jelzés), a tizedes opciós eset változatlan.
