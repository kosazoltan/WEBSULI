# P7C-ARANYJAVITAS — a gyakorlati bankjavítás a gyakorlati arányt is javítja (terv, 2026-11-27)

Szülő terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` (TG-P7). Forrás: tulajdonosi döntés 2026-11-27 („fokozatosan: először 10 lecke
próbának, mérés után döntök”).

## Mért hiba
A 10 leckés próbán (a legalacsonyabb gyakorlati arányú régi leckék, élő adat, alkalmazás nélkül) a „Gyakorlati bankjavítás” 6 leckében
SEMMIT nem változtatott: a csak-bank út (`keepLegacy`, P7B) a régi csomag kvóta-eltérését (`STUDIO_PRACTICE_QUOTA=on`, 60–75% alkalmazás)
szándékosan tűri (Review #635), így meta-hiba nélkül a csomag modellhívás nélkül átvett. A gomb célja (gyakorlatiasabb bank) így nem teljesül.

## Döntés
A csak-bank javításnál (`keepLegacy`) a kvóta ALATTI régi csomag célzott arányjavítást kap: a program kiválaszt annyi fogalmi
(felidéző) kvíz- és nyílt feladat-tételt, amennyi a célhoz (`practiceQuota(...).goal`) hiányzik, és ezekre ad tétel-szintű cserejogot
(„alakítsd át ugyanarra a fogalomra vonatkozó, konkrét példán végzett alkalmazó tételre”). Fogalmanként legalább egy felidéző tétel marad
(a fogalompár-kötelem). A többi tétel és azonosítója változatlan; a tanítás érintetlen. A kvóta FELETTI eltérés (túl gyakorlati) nem kap
cserét (tűrt örökség). Ha a célzott kör után is kvóta alatt marad, az örökségként tűrt (nincs teljes újragyártás).

A szerzői javítás és az új gyártás változatlan.

Végrehajtás: `docs/specs/2026-11-27-p7c-aranyjavitas-vegrehajtas.md`.
