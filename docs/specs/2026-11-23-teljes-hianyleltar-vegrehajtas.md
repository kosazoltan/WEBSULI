# Végrehajtás — teljes hiányleltár lezárása (terv: `docs/specs/2026-11-23-teljes-hianyleltar.md`)

Mester-nyilvántartás: `node D:/repo/Hermes-agent/scripts/feladat.mjs list --repo D:/repo/WEBSULI` (címben a tétel-azonosító).
A hullámok sorrendje a terv 4. pontja; egy szelet lépései a terv 5. pontja. Egyszerre egy kapusor fut (C-72).

1. Ez a PR: a pótlási leltár, a főterv és ez a terv a főágra (H-14).
2. Az SQL-nyilvántartás feltöltése a terv 3. táblázatából (`[P-0NN]` stb. előtaggal; már meglévő főterv-tételekhez hivatkozás).
3. H0 űrlap a tulajdonosnak; a válaszok az SQL-be és a TUDAS.md-be.
4. H1 → H8 szeletenként; minden beolvasztás után a 3. táblázat sora és az alábbi napló frissül.

## Végrehajtási napló

- 2026-11-23 — beolvasztva: #542 (e2e kapu időkorlát + memóriafüggetlen kisfilm-teszt; H-29, H-09). Nyitva: #541, #543;
  P-035 (PR-C) kapuja fut.
