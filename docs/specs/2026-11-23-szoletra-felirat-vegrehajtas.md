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

- **RED (javítás előtt, 2026-11-23):** `word-ladder-captions.test.ts` 0 / 3 zöld (a `captions.ts` hiányzik; a forrás-őr két
  `${RIVAL_NAME}t` sablont talál). `word-ladder-caption-mobile.spec.ts` 0 / 4 zöld: a győzelmi cím élőben
  „🏁 Elérted a csúcsot! Legyőzted Villámt!”; a fogás-felirat `text-shadow: rgba(0, 0, 0, 0.6) 0px 1px 2px`, a fehér felirat
  kontrasztja a legvilágosabb fa-színponthoz 2,99 : 1; a verseny-sor árnyékos, háttere átlátszó (alfa 0), a „Te”, a „Villám”
  és az állás-szöveg színe azonos (`rgb(248, 250, 252)`).
- **GREEN (javítás után):** egységteszt 3 / 3; e2e 4 / 4 (360×640 és 390×844): árnyék nincs; fogás-felirat ≥ 5,06 : 1 (alap),
  ≥ 5,02 : 1 (jó-állapot); verseny-sor háttér alfa 0,9, a címkék és az állás kontrasztja ≥ 10,1 : 1, színek: „Te”
  `rgb(125, 211, 252)`, „Villám” `rgb(216, 180, 254)`, állás `rgb(248, 250, 252)`; győzelmi cím „🏁 Elérted a csúcsot Villám
  előtt!”, vereség-sor „Villám most gyorsabb volt — a visszavágóban utolérheted!”.
- Képernyőképek (kézzel másolva a teszt kimeneti mappájából): `docs/measurements/jatekok-jatekelmeny/P011-felirat/`
  (kérdés-kártya + verseny-sor, győzelem, vereség; 360×640 és 390×844). A kérdés-kártya és a verseny-sor 360 px-en sem fed és
  nem vág (vizuálisan ellenőrizve; a geometriai mérést a `word-ladder-readability.spec.ts` végzi).
