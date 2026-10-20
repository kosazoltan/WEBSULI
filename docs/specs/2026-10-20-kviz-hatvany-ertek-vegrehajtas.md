# Kvíz-kulcsellenőrzés: a hatványalak értéke — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-kviz-hatvany-ertek.md`. Munkakönyvtár: `source/`. Ág: `fix/kviz-hatvany-ertek`.

1. **`server/studio/experience-builder.ts` `quizCorrectIndexProblems`:**
   - a `numbersOf` előtt a szövegben a számjegyes alapú hatványalakot (`7²`, `7³`, `7^2`, `7 ^ 2`; a felső index ¹²³⁴⁵⁶⁷⁸⁹⁰ is)
     az értékére cseréli (`49`);
   - csak egész alap és legfeljebb kétjegyű kitevő; a nem véges / túl nagy érték kimarad;
   - betűs alapú (`a²`) nem változik.
2. **Teszt:** a meglévő `quizCorrectIndexProblems`-tesztek mellé:
   - a „(3 + 4)² = 7²” helyes magyarázat nem jelez;
   - a „7^2” sem;
   - a valódi ellentmondás továbbra is jelez.
3. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
