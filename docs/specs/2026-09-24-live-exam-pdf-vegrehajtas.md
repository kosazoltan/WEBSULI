# Végrehajtás — élő PDF-próba javításai (ügynöknek)

1. `source/server/studio/tools/arithmetic-claims.ts` `falseArithmeticClaims`: a lánc előtti (szóköz nélküli) utolsó jel `(`/`)` → kihagy; műveleti jel vagy `=` → csak akkor kihagy, ha előtte szám vagy `)` áll. Két tagú lánc, ahol a bal tag `a/b`, a jobb egyszerű szám és utána betű/`%` jön → kihagy.
2. `source/server/studio/extractor.ts`: `export function foreignScriptLetters(text, sourceText)` — `\p{L}` nem latin, nem görög betűk, amelyek nem szerepelnek a forrásban. `completeExtractionConcepts` `inspect`: term/definition mezőre mezőhiba.
3. `shared/lesson-workflow.ts` `workflowVisitsLeft(run, id)` (az `assertWorkflowStep` is ezt használja); `server/workflows/engine.ts` `workflowStepVisitsLeft(id)` (kontextuson kívül Infinity); `step-runner.ts` csak-bank feltétele: animator és lektor keret > 0. Lektor skill 5. pont bővítése ≤ 4800 karakteren belül.
4. Új teszt: `source/tests/live-exam-pdf-2026-09-24.test.ts` a mért bemenetekkel. Meglévő tesztet NEM módosítani.
5. Kapuk: `npx tsc --noEmit`, `npx tsc -p tsconfig.test.json --noEmit`, eslint `--max-warnings 1166`, `node --import tsx --test tests/*.test.ts`, `npm run build`.
6. Ág `fix/live-exam-pdf` → PR → CI → merge → Render `/api/health` revízió + Vercel hash ellenőrzés → LEDGER.
