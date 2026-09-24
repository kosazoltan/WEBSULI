# Végrehajtási utasítás (AI-ügynöknek) — Bank-ellenőr

Spec: `docs/specs/2026-09-24-bank-ellenor.md`. Ág: `feat/bank-ellenor`.

1. `source/server/studio/support-skills.ts`: új `"bank-verifier"` támogató skill a kötelező
   szakaszokkal (≤ 2800 karakter): tételenként önálló megoldás, kvíz: pontosan egy igaz opció + igaz
   visszajelzések + lehetséges adatok; feladat: helyes minta, végeredmény külön kötelező csoport;
   csak számolással igazolt hibát jelent; Javítás iránya = teljes helyes érték.
2. `source/server/studio/bank-verifier.ts` (új):
   - `BANK_VERIFIER_MODEL = "claude-opus-5-5"`, `BANK_VERIFIER_CONCURRENCY = 4`.
   - `bankItemHash(item)`: sha256 a tétel tartalmából (id/sourceHash/coversConceptIds/sectionIndex nélkül).
   - `bankVerifierChunks(lesson, cleared)`: fejezetenkénti darabok `{ sectionIndex, items: { path, hash, item }[] }`,
     a `cleared` hash-ek kihagyva.
   - `buildBankVerifierPrompt(chunk, blind, lessonMeta)`: `withSupportSkill("bank-verifier", …)`.
   - `parseBankVerifierErrors(json, allowedPaths)`: zod, csak engedett útvonal, üzenet ≤ 600.
   - `runBankVerifier({ lesson, blind, cleared, call, onChunkError })` → `{ notes: RawNote[], cleared: string[], checked }`;
     soha nem dob.
3. `source/server/studio/step-runner.ts`:
   - lektor-ágban a `blind` eltárolása; a lektor-modellhívás ELŐTT a `runBankVerifier` ígéret indítása
     (csak ha van bank és vak megoldás), `providerFactory(BANK_VERIFIER_MODEL, "visuals")`, policy `visuals`.
   - A lektor eredmény-ágban: `await`, a jegyzetek összefésülése (duplikáció nélkül), a csak-bank kör
     elérhetőségétől függően blokkoló vagy `bank_check_late` figyelmeztetés; `bankVerifierCleared` a jobba;
     napló.
4. Tesztek (csak ÚJ tesztek): `tests/bank-verifier.test.ts` (darabolás, hash-kihagyás, útvonal-szűrés),
   `tests/lesson-pipeline-runner.test.ts` új tesztjei: hiba → csak-bank kör; keret elfogyott → nem bukik;
   nincs vak megoldás → nincs hívás.
5. Kapu: `npx tsc --noEmit`, `npx tsc -p tsconfig.test.json --noEmit`, `npx eslint client/src server --max-warnings 0`,
   `node --import tsx --test tests/*.test.ts`, `npm run build`. Utána sentinel, push, PR, CI, merge, deploy-ellenőrzés.
