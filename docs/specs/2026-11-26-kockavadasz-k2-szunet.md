# Kockavadász — a rúnaréteg szünetgombja a megoldás-kijelzéskor (FLAKE-BC-K1K2)

Cél: a megoldás-kijelzéskor megnövő kérdéskártya egyetlen képkockáig se lógjon a látható rúnaréteg-szünetgombra — terhelt
gépen (lassú képkocka, késő időzítő) sem. Elfogadás: a „vak K2 360x640” teszt zöld, képkockánkénti
(requestAnimationFrame, a koppintás előtt induló, kerekítés nélküli) átfedésméréssel a kijelzés után 1,5 s-ig; a javítás előtt a
terhelt futás bukott (1973 px²). A 6× CPU-lassítás a hibát nem reprodukálta (végrehajtás 16–17. sor), ezért nem elfogadási feltétel. Végrehajtás: `docs/specs/2026-11-26-kockavadasz-k2-szunet-vegrehajtas.md`.
