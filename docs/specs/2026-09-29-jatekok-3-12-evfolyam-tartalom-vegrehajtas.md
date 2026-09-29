# Végrehajtási utasítás — évfolyam-bank TARTALOM (3–12.), 2026-09-29

Terv: `docs/specs/2026-09-29-jatekok-3-12-evfolyam.md`, 1. és 5. döntés. Ág: `feat/evfolyam-bank-tartalom`
(alap: `origin/feat/evfolyam-bank-alap`). Hatókör KIZÁRÓLAG `source/client/src/data/gradeQuizBank/**` és az új
`source/tests/grade-quiz-bank.test.ts`. Játéklap, választó (`game-engine/gradeQuiz.ts`) NEM ennek a szeletnek a része.

## Lépések

1. **Bankfájlok** `source/client/src/data/gradeQuizBank/grade-03.ts … grade-12.ts`, mindegyik:
   ```ts
   import type { GradeQuizItem } from "./types";
   export const GRADE_07: readonly GradeQuizItem[] = [
     { id: "g07-math-001", grade: 7, subject: "math", tier: 1, prompt: "Számold ki: −3 + 8", options: ["5", "−5", "11", "−11"], correctIndex: 0, explanation: "…" },
   ];
   ```
   - Tárgyanként (math, english, hungarian, science, history) PONTOSAN 18 tétel: `001–006` tier 1, `007–012` tier 2,
     `013–018` tier 3. Egy tétel = egy sor. 4 különböző opció, pontosan egy helyes, `correctIndex` 0–3 változatosan.
   - Magyarázat 30–300 karakter, szó szerint tartalmazza a helyes opció egy ≥3 betűs szavát/számát; sorszámra
     („első válasz”, „A)”, „B válasz”) nem hivatkozik. Stringben nincs `[`/`]` és nincs `\"` — idézéshez „ ”.
   - Számolható matek-tétel (évfolyamonként a matek ≥ 40%-a, cél ≥ 50%) a tesztelhető alakok egyikében:
     `Számold ki: <kifejezés>` · `Mennyi <kifejezés>?` · `Oldd meg: <egyenlet x-re>` (opció: `x = 4` vagy `4`) ·
     `Melyik szám osztható N-nel?` · `Mennyi A-nak a P%-a?` · `Mennyi A és B legnagyobb közös osztója / legkisebb
     közös többszöröse?`. Kifejezésben: `+ − · : / ^ ² ³ √ ( ) ! π log₂ lg sin cos tg °`, tizedesvessző.
2. **Aggregálás** `index.ts`: a tíz fájl importja, `GRADE_QUIZ_ITEMS = [...GRADE_03, …, ...GRADE_12]`.
3. **Teszt** `source/tests/grade-quiz-bank.test.ts` (új): évfolyam×tárgy ≥ 18 és szintenként ≥ 6; azonosító-alak és
   egyediség; grade/subject egyezik az azonosítóval; prompt egyedi évfolyamon belül; opciók különbözők, nem üresek;
   `correctIndex` tartományban; magyarázat-szabályok; forrás-szinten minden tétel egy sorban; a matek-kiértékelő
   (kifejezés-elemző, egyenlet-behelyettesítés, oszthatóság, százalék, lnko/lkkt) szerint PONTOSAN egy opció egyezik
   a kiszámolt igazsággal, és ez a `correctIndex`; évfolyamonként a matek ≥ 40%-a ellenőrzött.
4. **Vak ellenőrzés** `source/grade-bank-blind.local.mts` (gitignore-olt `*.local.mts`): kulcsok a fő checkout
   `source/.env`-jéből `dotenv` `path`-szal, kiírás nélkül; `createStudioProvider("gpt-5.6-terra", …, { jsonMode: true })`
   (más modellcsalád, mint a szerző); 20 tétel/hívás, KULCS NÉLKÜL, opciónként igaz/hamis; jelzés, ha nem pontosan egy
   igaz, vagy az nem a kulcs. Kimenet: `tmp/grade-bank-blind/flags.json` + összesítő (hívások, tételek, jelzések).
   Minden jelzett tételt javítani/cserélni, majd a jelzett + módosított tételeket újrafuttatni, amíg 0 jelzés marad.
5. **Kapuk** (`source/`-ban): `npx tsc --noEmit` · `npx tsc --noEmit -p tsconfig.test.json` ·
   `npx eslint client/src server --max-warnings 0` · `node --import tsx --test tests/*.test.ts` · `npx vite build`.
   Várt: mind 0 hibával; a meglévő tesztek változatlanok és zöldek; az új teszt zöld.
6. **Commit** atomi (terv+teszt+index; tartalom; vak-ellenőrzés utáni javítások), üzenet vége
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push csak erre az ágra.

## Várt kimenet
- 10 fájl × 90 tétel = 900 tétel; minden évfolyam×tárgy 18 (6/6/6).
- `node --import tsx --test tests/grade-quiz-bank.test.ts` → pass, 0 fail.
- vak ellenőrzés utolsó köre: `flagged: 0`.
