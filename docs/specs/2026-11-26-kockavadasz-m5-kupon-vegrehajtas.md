Terv: `docs/specs/2026-11-26-kockavadasz-m5-kupon.md`

# Végrehajtás — FLAKE-BC-M5

1. Teszt (`blockcraft-play.spec.ts` M5): a kupon-HUD után `probe().couponOnly === 1`-re vár, csak utána nyit rúnazárat.
2. Kód (`BlockCraftQuiz.tsx`, csak a teszt-kampós buildben élő `probe`): `couponOnly: provider.couponOnly ? 1 : 0`.
3. Mérés: az M5 három esete a kapu beállításával.

Állapot: FLAKE-BC-M5 folyamatban.
