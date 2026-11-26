# Szűkített PR-kapu böngészős útja (KAPU-SZUKITES)

Tulajdonosi döntés (2026-11-26, űrlap): a szelet kapuja csak az érintett teszteket futtassa, a teljes kör maradjon a CI-ben.
Mérés: nem-játék szeletnél a kapuk ~3–8 perc; játékszeletnél a böngészős út 12,5 perc (egy játék) – 62 perc (közös játékmotor,
JK: 2992 s + 719 s). A CI (`.github/workflows/ci.yml`) minden PR-on a TELJES e2e-készletet futtatja shardolva — a helyi kör ezt
duplikálja.

Elfogadás:
- Egy játék változásánál: a mobil mérő a játékra szűrve + a játék saját spec-jei + a változott spec-ek (a mindig futó
  meta-mérő / lejárt-kupon spec CSAK teljes módban).
- Közös játékmotor változásánál: a mobil mérő minden játékra + a változott komponenseket ÉMLÍTŐ játék-spec-ek + a változott
  spec-ek (nem minden játék összes spec-je).
- `GATE_E2E_FULL=1` (vagy `gates.config.json` `e2eFull: true`): a régi, teljes kiválasztás.
- A CI teljes köre változatlan (biztonsági háló a beolvadás előtt).

Végrehajtás: `docs/specs/2026-11-26-kapu-szukites-vegrehajtas.md`.
