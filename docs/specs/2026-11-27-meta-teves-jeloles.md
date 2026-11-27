# META-TÉVES-JELÖLÉS — terv (2026-11-27)

Cél: a tananyagra kérdező tétel ne legyen meta. Forrás: a 11 meta-tételes lecke élő javítása (2026-11-27), szülő terv:
`docs/specs/2026-11-26-tananyag-gyakorlati.md` (a meta-szabály itt definiált).

Hatókör: `shared/practice-policy.ts` (`classifyText`: a „felépítés” csak önálló szóként, a „vizsgált” nem vizsga-környezet).
Nem cél: a valódi meta-kérdések (feladattípus, pontszám) besorolása változatlan.

Kockázat: a kliens-csomagban nincs regex-visszatekintés (`no-lookbehind-client`).
Végrehajtás: `docs/specs/2026-11-27-meta-teves-jeloles-vegrehajtas.md`.
