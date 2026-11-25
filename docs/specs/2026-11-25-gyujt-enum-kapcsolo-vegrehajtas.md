# Végrehajtás: a gyűjtő a felsorolásos kapcsolót is mérje (2026-11-25)

Terv: `docs/specs/2026-11-25-gyujt-enum-kapcsolo.md`.

1. RED: `scripts/kovetelmeny/test_feladat.py` `GyujtFelsorolasosKapcsolo` — `live_value` a szabályban felsorolt értéket nyíltan, minden
   mást rejtve ad; `flag_state("send")` = be, `flag_state("dry-run")` = ki; nem felsorolt kulcs `send` értéke rejtett.
2. GREEN: `scripts/kovetelmeny/gyujt.py` — `live_value(key, raw)` (a Render-ciklus ezt hívja), `FLAG_RULES["ADVENT_RESULT_EMAIL_MODE"]`
   `values` készlettel, a `flag_state` a felsorolt értéket nem tekinti nem logikainak.
3. Próbahiba, kapulánc, PR; a beolvadás után `gyujt.py -q` és `feladat.py kapcsolo` → „egyezik”.
