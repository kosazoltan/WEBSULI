Terv: `docs/specs/2026-11-27-kockavadasz-k1-kosav.md` — feladat (SQL): `FLAKE-BC-K1-CI` (prio 1 — minden PR CI-jét blokkolta: #624, #628, #631)

# Végrehajtás — FLAKE-BC-K1-CI (vak K1: a rúnakövek nem ugranak el a koppintás elől)

Mért bukás (#631 CI, `blockcraft-play.spec.ts` „vak K1 390x844 › a látható 3D rúnakőre valódi érintéssel koppintva …”):
a teszt a C követ stabilnak mérte (`y 727–782`, a rúnagombok alatti sáv), a koppintáskor a játék „nincs-kő” választ adott,
mert a kövek addigra a kártya alatti sávban álltak (`y 325–450`).

Ok: a zár 200 ms-onként újraméri a két jelölt sávot (kártya alatti „main”, rúnagombok alatti „below”), és mindig a nagyobb
kőméretűt választja. Ha a kártya mérete a zár alatt változik (betűkészlet, a rúnagombok betűméret-lépcsője), a választás
átbillen, és a kövek a tanuló szeme előtt máshová ugranak — a már célzott koppintás üres helyre esik. Valós UX-hiba, nem tesztzaj.

1. Bukó teszt: `source/tests/blockcraft-stone-band.test.ts` — a sávválasztás tiszta függvényként (`pickStoneBand`), a régi
   „mindig a nagyobb” szabállyal 1 bukás (a második mérésnél átvált).
2. Javítás: `source/client/src/pages/blockcraft-stone-band.ts` — a zár alatt a sáv fajtája megmarad, amíg használható
   (kőméret ≥ 26 px); csak használhatatlanná váláskor vált a legnagyobbra. `BlockCraftQuiz.tsx` a mérőben ezt hívja, a
   választott fajtát a zár effektusa tartja (új zárnál nullázódik).
3. Ellenőrzés: unit 2/0; tsc, lint OK; E2E `rúnakő|vak K1|vak K2` ×3 → 36/36.

Állapot: kész — következő: kapulánc, merge (csak gyártásmentes állapotban).
