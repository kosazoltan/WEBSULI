Terv: `docs/specs/2026-11-26-kockavadasz-k2-szunet.md`

# Végrehajtás — FLAKE-BC-K1K2 (vak K2: a megoldás-kijelzés és a rúnaréteg szünetgombja)

Mért bukás (JK gate:pr, 2026-11-26, `D:/tmp/jk-pr.log`): `blockcraft-play.spec.ts` „vak K2 360x640 › a megoldás-kijelzéskor a
kérdéskártya nem lóg a látható rúnaréteg-szünetgombra” — „a kártya N px²-en lóg a látható szünetgombra”, 286 passed / 1 failed;
korábban is csak hosszú, terhelt futásban bukott.

Ok: a takarás-ellenőrzés (`quizPauseCovered`) csak a nyitott zár ~5 Hz-es (200 ms) mérőjében fut. A megoldás-kijelzés („Miért?”
sor) a kártyát azonnal megnöveli, a szünetgomb viszont csak a következő mérési ütemben rejtőzik el; terhelés alatt (lassú
képkocka, késő időzítő) ez a rés több száz ms — ennyi ideig a kártya a látható gombra lóg. A teszt nem hibás: a felhasználó is
látja a rálógó gombot.

1. Bukó teszt (szigorítás, nem gyengítés): a meglévő „vak K2” teszt a kijelzés első képkockájától sűrűn mintáz (azonnal, majd
   50 ms-onként 1,5 s-ig, korábban 250 ms-onként 6×). Mérés a javítás előtt (main): a régi teszt terhelés alatt 3 ismétlésből 2-szer
   bukott („1973 px²-en lóg”). A CPU-lassításos változatot kipróbáltam, de a javítás előtt sem bukott (a lassítás az 5 Hz-es
   időzítőt is lassítja) — elvetve.
2. Javítás: a mérő függvény ref-ben elérhető; a megoldás-kijelzés váltásakor (`q.bind.reveal`) `useLayoutEffect` azonnal,
   festés előtt újramér — a takarásállapot ugyanabban a képkockában frissül, amelyben a kártya megnő.

Állapot: FLAKE-BC-K1K2 1/3 egység kész — következő: bukó teszt
