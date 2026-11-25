# Végrehajtás: revizio.py `lelet-zar`

Terv: `docs/specs/2026-11-25-revizio-lelet-zar.md`.

1. Bukó tesztek: `scripts/kovetelmeny/test_revizio.py` (ideiglenes DB a gyujt.SCHEMA-val; zárás, kettős zárás, hiányzó azonosító).
2. Zöldre hozás: `cmd_lelet_zar` + argparse-bekötés + a docstring parancslistája.
3. Próbahiba: a státuszfrissítés kikommentezésére a zárási teszt bukik.
4. Kapulánc, PR.
