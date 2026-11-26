Terv: `docs/specs/2026-11-26-kapu-windows-betu.md`

# Végrehajtás — KAPU-WIN

1. Bukó tesztek: `tornado-play.spec.ts` K3 a `answers: "medium"` mérő-tétellel (álló 360×640 és 390×844: a gombok nem lógnak a
   járműre, 2 oszlopban állnak); a mérőpanel meglévő L3 tesztje a kapu beállításával már bukik (mérve).
2. Kód: `perfOverlay.ts` (`getTopInset(reading)`, a nézetváltás újrahelyez), `BlockCraftQuiz.tsx` (olvasó nézetben a súgó nélküli
   HUD-alj), `TornadoHunter200.tsx` (mérő-tétel + álló gomb-módú 2 oszlop `data-option-fit="1"`-nél).
3. Mérés: a két spec teljesen a kapu beállításával, `npm test`.

Állapot: KAPU-WIN folyamatban.
