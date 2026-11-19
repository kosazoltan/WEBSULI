# Hang-előmelegítés — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-11-19-hang-elomelegites.md`. Ág: `fix/hang-elomelegites` (a friss `origin/main`-ről), munkafa:
`.claude/worktrees/hang-elomelegites`. Push / PR: a koordinátor.

## Lépések
1. **Előtte-mérés:** build teszt-kampóval (`VITE_ENABLE_GAME_TEST_HOOKS=1`) a főágról; a Kockavadászon és a Brain Rotban a játék
   indítása után 4 mp-cel kérdés kényszerítése (`forceState`), majd jó válasz; a leghosszabb képkocka a kényszerítéstől a válasz
   utáni 1,5 mp-ig. Valódi GPU, 390×844, legalább 3 futás. Előtte `docker ps` (≥ 2 friss idegen e2e-konténernél várni).
2. `source/client/src/lib/audioEngine.ts`: a `prewarmAudio()` blokk BÁJTRA azonosan a Szökőár-ágéval; a fájl végére a
   `useAudioPrewarm()` horog.
3. Bekötés: `game-engine/play/useQuestionDirector.ts`, `pages/BlockCraftQuiz.tsx`, `pages/SpaceAsteroidQuiz.tsx`,
   `pages/TornadoHunter200.tsx`, `components/duel/useDuelFeedback.ts` — egy-egy `useAudioPrewarm()` hívás.
4. Tesztek: `tests/audio-engine-prewarm.test.ts` (a Szökőár-ággal azonos) és `tests/audio-engine-prewarm-hook.test.ts`.
5. `npm run gate:stage`.
6. Utána-mérés ugyanazzal a módszerrel.
7. Böngészős tesztek (sorompó után, `--workers=1`): a közös mobil mérő (`game-mobile-quality.spec.ts`) érintett játékai, a
   párbaj (`duel*.spec.ts`), a joystick-mérő.
8. `npm run gate:push`; jelentés: fej, mérés előtte / utána, tesztek.
