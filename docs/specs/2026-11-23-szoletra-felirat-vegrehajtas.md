# Szólétra feliratok — végrehajtási utasítás (AI-ügynöknek)

**Terv:** [`docs/specs/2026-11-23-szoletra-felirat.md`](2026-11-23-szoletra-felirat.md). **Ág:** `fix/szoletra-felirat-targyrag`,
munkafa `.claude/worktrees/szoletra-felirat`. **Feladat:** P-011.

## Lépések

1. Docs-commit (terv + ez a fájl).
2. **RED:**
   - `source/tests/word-ladder-captions.test.ts`: a `captions.ts` függvényei (`overtakeCaption`, `winTitle`, `lossLine`,
     `leadCaption`) több névvel — a név után nem állhat betű; a pontos mondatok a „Villám” névre; forrás-őr a
     `WordLadderHuEn.tsx`-re: nincs `${RIVAL_NAME}` után közvetlen betű, és a lap a `captions.ts`-t használja.
   - `source/tests/word-ladder-caption-mobile.spec.ts` (Playwright, 360×640 és 390×844, `hasTouch`): `text-shadow: none` a
     fogás-feliraton és a verseny-soron; kontraszt ≥ 4,5 (fogás: a `background-image` színpontjai, alap- és jó-állapot;
     verseny-sor: háttérszín); címke-szín ≠ állás-szín; `forceState({ phase: "won" })` → a cím `🏁 Elérted a csúcsot Villám
     előtt!`; vereségnél az eredmény-sor; képernyőképek a teszt kimeneti mappájába.
   - Futtatás a javítás előtt: a bukás rögzítése.
3. **Javítás:** `source/client/src/lib/wordLadder/captions.ts` (új, tiszta függvények); `WordLadderHuEn.tsx`: a mondatok a
   függvényekből; stílus: `.wl-hold-label` és `.wl-race-text` árnyék nélkül; sötétebb fa- és jó-állapot színátmenet;
   `.wl-race-text` tömör háttér (`#0f172ae6`), a címkék a pöttyük világos színével (`#7dd3fc`, `#d8b4fe`).
4. **GREEN:** ugyanazok a tesztek zöldek; a régi mondatokra hivatkozó teszt nincs (`grep -rn "Legyőzted\|Megelőzted" source/tests`).
5. Kapuk: `npm run gate:stage` → `npm run gate:push` → `node scripts/qa/gates/local-review.mjs` → `npm run gate:pr -- --body-file`
   → push → PR (merge NÉLKÜL) → CI → bot-szálak → `node scripts/qa/gates/pre-merge-gate.mjs <PR>`.

## Mért számok

(a végrehajtás során töltendő ki: RED / GREEN kimenet, kontraszt-értékek)
