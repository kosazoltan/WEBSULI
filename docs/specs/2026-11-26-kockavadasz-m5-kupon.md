Terv: `docs/specs/2026-11-17-kockavadasz-telefon.md` (review #484 M5)

# Kockavadász M5 kupon-teszt: az első rúnazár a lecke betöltése előtt nyílt (FLAKE-BC-M5)

## Felmérés (2026-11-26, a kapu beállításával: SwiftShader, 1 worker, buildelt szerver)
A `blockcraft-play.spec.ts` „M5: kupon mód, N tételes lecke” (N = 3, 5, 8) a mainen helyben determinisztikusan bukik:
`csak a lecke tételei: grade:g05-math-002 | mat:e2e-lecke-0 | …` — mindig CSAK az első kérdés évfolyam-banki.

Ok (kódolvasás + a bukás alakja): a kupon-mód (`provider.couponOnly`) akkor él, ha a kupon aktív ÉS a bankban már van lecke-tétel
(`bankRef.current.some((q) => q.fromMaterial)`). A teszt a kupon-HUD megjelenése után azonnal nyit rúnazárat; a lecke-tételek
(`material-quizzes`) ekkor még nincsenek a bankban, így a játék — szándékosan — a rendes forrásból ad kérdést. A kupon-szabály
(csak a lecke tételei) a lecke BETÖLTÉSE után érvényes; a teszt ezt a pillanatot nem várta meg.

## Döntés
A játék viselkedése marad (betöltés előtt a gyerek nem áll kérdés nélkül). A teszt megvárja, hogy a kupon-mód éljen: a játék
mérő-kampója (`probe`) `couponOnly` mezőt kap (1 = kupon-mód él, a lecke a bankban), a teszt az első rúnazár előtt erre vár.

## Elfogadás
- A három M5 eset a kapu beállításával zöld; a lecke betöltése után minden rúnazár csak lecke-tételt ad (a teszt állítása változatlan).
