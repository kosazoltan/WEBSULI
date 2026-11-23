---
name: design-bank-decisions
description: "Tulajdonosi döntések az előre gyártott arculati bankról (2026-10-17): hatókör, feliratok, tárolás, jóváhagyás"
metadata:
  node_type: memory
  type: project
  modified: 2026-10-17T08:13:49.380Z
---

Tulajdonosi döntés 2026-10-17 (a tantárgyi ikonkészlet után következő munka, ötlet-szinten, még nincs terv):
- Első hullám: MINDEN díszítőelem előre gyártva — témaköri borítók (tantárgy × sáv × NAT-témakör), blokktípus-jelzők, kabalapózok blokktípusonként, fejezetelválasztók.
- Ismétlődő feliratok: verziókezelt kódszótár, a modell legfeljebb kulcsot választ; előbb token-mérés a mentett leckéken (csak olvasás).
- Tárolás: minden képbájt a DB-ben (design_assets tábla, 0028). Kockázat: Neon-keret — a terv előtt ellenőrizni a DB méretét/keretét.
- Mérés 2026-10-17 (withReadOnlyDb): az éles DB 93 MB (lesson_workflow_runs 30 MB, catalog_items 15 MB), 81 lecke; a 72 ikon WebP-ben 1,2 MB. A Neon-csomag kerete NEM ellenőrzött.
- Szöveg-mérés 2026-10-17 (24 publikált lecke, 2,53M kar.): az ismétlés szinte csak gépi adat (sourceHash, id-k, enumok); valódi felirat-ismétlés <1% (pl. „Helyes.” 324×) → a feliratszótár kicsi, a bank értéke az arculat. 11 leckében még ott a régi `flair` adat (a lejátszó nem használja).
- Stúdió UI (tulajdonosi döntés 2026-10-17): új dizájnra hozás + arculat látható a stúdióban + hibák felmérése és javítása (képbank-kezelő felület NEM kért).
- Stúdió nagyítás (tulajdonosi döntés 2026-10-17): a CREATOR_PAGE_SCALE 0.8 CSAK asztalon (≥1024 px); telefonon/tableten/összehajtható kijelzőn 100% (44 px érintés, olvasható betű).
- Jóváhagyás: Claude hagyja jóvá önellenőrzés után, a tulajdonos szúrópróbáz és visszadobhat.

**Why:** kevesebb token, gyorsabb készítés, egységes arculat; a tananyagkészítő a DB-ből olvas a lecke azonosítása után.
**How to apply:** háromfázisú munka (terv → végrehajtási utasítás → kód) új ágon; kulcsrendszer `<fajta>-<tantárgy>-<sáv>[-<témakör>]`, tartaléklánc, lefedettségi teszt. Kapcsolódik: [[websuli-push-audit-hook]], [[bank-model-opus-decision]].
