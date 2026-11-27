# META-TÉVES-JELÖLÉS — a tananyagra kérdező tétel nem meta (végrehajtás, 2026-11-27)

Forrás: a 11 meta-tételes lecke javításakor mért (élő leltár, 2026-11-27). Két tétel a TANANYAGRA kérdez, a szabály mégis
meta-nak jelölte, mert a „feladattípus” és a „faj” szó a feladatlap-környezet mintájába esett:

- „… Melyik tudomány dolgozik ezen?” (emberré válás) — a „feladattípus” nincs a kérdésben, de az „ezen” + „tudomány”
  együtt a `META_CONTEXT` + `META_ASK` mintára illeszkedett.
- „… mind az öt vizsgált fajnak” (növényvilág) — a „faj” biológiai faj, nem feladattípus; a „vizsgált” a vizsga-mintára
  illeszkedett.

Terv: `docs/specs/2026-11-27-meta-teves-jeloles.md`.

## Döntés

A `classifyText` a „feladattípus” szót csak akkor kezeli meta-környezetnek, ha a kérdés a feladatlap feladattípusára
kérdez (a „melyik feladattípus” / „milyen feladattípus” alak megmarad). A „vizsgált” (melléknév) nem vizsga-környezet.
A biológiai „faj” nem feladattípus.

## Elfogadás

- RED: a két élő tétel a régi szabályon meta, az új szabályon nem.
- A meglevő meta-tesztek zöldek maradnak (a valódi meta-kérdés továbbra is meta).
