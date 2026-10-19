# Algebrai referencia — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-algebrai-referencia.md`. Munkakönyvtár: `source/`. Ág: `fix/algebrai-referencia`.

1. **`shared/polynomial.ts` (új, import-szegény, kliens és szerver közös):**
   - **Bemenet:**
     - Tokenizálás: szám (tizedesvessző/-pont), egybetűs változó (latin kisbetű), `+ - − – · × * / : ( ) ^ ² ³`.
     - Implicit szorzás: szám/változó/`)` után szám, változó vagy `(`.
   - **Kimenet:** `parsePolynomial(text)` → `{ poly: Map<monomKulcs, együttható> | null, hasParens: boolean }`.
     - Osztás csak nem-nulla számmal; hatvány csak 0..6 egész kitevő.
   - **Segédfüggvények:**
     - `polyEquals` (1e-9 tűrés, nulla tagok nélkül);
     - `isExpandedText(text)`: nincs zárójel, és minden monom egyszer szerepel (összevont);
     - `polynomialCandidates(text)`: a válaszban a leghosszabb, polinomnak értelmezhető, betűt tartalmazó szakaszok
       (az `=` két oldalát külön);
     - `formatPolynomial` (hibaüzenethez).
2. **`shared/answer-value.ts`:**
   - **Típusok:**
     - `TypedAnswer.kind` kiegészül a `"polynomial"`-lel;
     - `AnswerForm` kiegészül az `"expanded" | "factored"` alakkal;
     - `TYPED_SCORING_VERSION = 2`, `POLYNOMIAL_SCORING_VERSION = 3`, `LESSON_SCORING_VERSION = 3`.
   - **`isValidReference(a)`:** polinomnál `parsePolynomial`, egyébként a mostani szabály. Ezt használja a séma, a
     `referenceValueProblems` és a pontozó.
   - **`gradeTypedAnswers`:** a polinom-rész a jelöltek között sorrendben keres egyezőt.
     - `expanded` / alapértelmezés: kifejtett jelölt kell.
     - `factored`: zárójeles jelölt kell.
   - **`referenceValueProblems`:**
     - polinom-rész referenciája nem értelmezhető → probléma;
     - a kérdés zárójeles, betűs jelöltjeinek száma = a polinom-részek száma → sorrendben egyezzen, különben probléma.
3. **Sémák:**
   - `shared/lesson-experience.ts`: `typedAnswerSchema` kind/form enum; a szuperellenőrzés `isValidReference` szerint; a
     polinomos lecke `scoringVersion` ≥ 3, a többi típusos ≥ 2.
   - `scoringVersionFor`: polinom → 3, típusos → 2.
   - `server/studio/bank-schema.ts`: `strictTypedAnswer` enumok.
4. **Utasítások** (rövid, a meglévő szabályok mellé):
   - `server/studio/experience-builder.ts:538`;
   - `server/studio/role-skills.ts` (lektor 6. pont, „Javítás iránya”);
   - `shared/lesson-experience-score.ts` 5. szabály;
   - `shared/lesson-experience.ts` 6. szabály.
   - A `bank-verifier` (`support-skills.ts`) és a bank-skill (`role-skills.ts` 3. pont) nem bővül, mert elérik a hosszkorlátot
     (2800 / 5200 karakter). A bank a mezőleírásból és a pontozási rendszerutasításból tudja az új szabályt, az ellenőr a
     „typedAnswers a mérce” szabályból.
5. **Tesztek:**
   - `tests/polynomial-answer.test.ts`: a terv EARS-esetei, a mért referenciák (`x² + 10x + 25`, `4x^2 - 4x + 1`,
     `2a² + 20a + 50`, `ab + 4b`, `10b + 5`), `expanded` / `factored`, a hibás kifejtés, a `scoringVersionFor`;
   - a teljes `npm test` (régi leckék).
6. **Ellenőrzés:** `check`, `check:test`, `eslint` (érintett fájlok), `npm test`, `build`.
