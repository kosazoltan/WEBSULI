# Websuli Design — csomag és minták

| Fájl | Mi ez | Állapot |
|---|---|---|
| `Websuli_Design_AI_Implementacios_Utasitas.md` | A mesterutasítás (öt évfolyamtéma, tipográfia, komponensek, ütemezés). | Forrás |
| `Websuli_Design.html` | A design-csomag vizuális referenciája (offline prototípus). | Forrás |
| `Websuli_Grafikai_Szabalyterv.md` | A jóváhagyott koncepciókép („Egy platform. Minden korosztálynak.”) részletes elemzése és a belőle levezetett grafikai szabályok: tokenek, tipográfia, képi nyelv, komponensek. | **Terv, jóváhagyásra vár** (2026-10-17) |
| `Websuli_Tanuloi_Keret_Minta.html` | A mesterutasítás tanulói keretének mintája: irányítópult, tantárgykártyák, tanulási terv, ismétlés, haladás; az öt témában, példaadattal. | **Minta, nem alkalmazott** (tulajdonosi döntés, 2026-10-17) |

## Ami az alkalmazásban él
- **Lecke-arculat:** öt évfolyamtéma és önhostolt fontok. Terv: `docs/specs/2026-10-16-websuli-design.md`.
- **Memóriakártya-ismétlés:** a fúziós lecke „Ismétlés” füle. Terv: `docs/specs/2026-10-16-websuli-ismetles.md`.

## Ami nem
A tanulói keret (AppShell, irányítópult, tantárgykártyák, `StudyPlan`, `LearningProgress`) a hatókörön kívül maradt. A minta emlékeztetőnek
került be, a bevezetés nincs elkezdve. Ha mégis sorra kerül, a háromfázisú rend szerint indul: terv, végrehajtási utasítás, kód.

Ehhez új adat is kell, mert ma nincs meg:
- a heti tanulási idő;
- az összesített kvízeredmények;
- a tantárgyankénti haladás.
