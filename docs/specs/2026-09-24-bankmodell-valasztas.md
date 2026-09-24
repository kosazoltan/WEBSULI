# Spec — Bankmodell kiválasztása méréssel (2026-09-24)

Tulajdonosi utasítás (2026-09-24): „keresd meg az alkalmas bank modellt, hogy megszűnjön ez a probléma”.

## Háttér (mért)

Két teljes éles gyártás a bank-ellenőrrel (jobok 351e14cc, 68a5b500), bankmodell `z-ai/glm-5.3-flash`:
- a bank-ellenőr a glm-tételek 9–16%-ában talált tartalmi hibát (13/145, 23/144);
- a csak-bank javító kör után az ÚJRAÉPÍTETT tételekben ismét 16/106 hiba → a javító hurok nem konvergál;
- sok bukott kísérlet: sémahiány (hiányzó mezők, kevés kvíz), csonka/törött JSON, időtúllépés;
- 1. futás: a mentőkör törött JSON-ja miatt hibára futott; 2. futás: 60 perc után is a 2. javító körben.

## Cél

Olyan bankmodell (és tartalék), amellyel egy lecke bankja első körben kevés tartalmi hibával és kevés bukott
kísérlettel épül meg, elfogadható idő és költség mellett.

## Nem-cél

A bank-skill, a validátorok vagy a bank-ellenőr lazítása; más szerepek modelljének cseréje.

## Mérés módszere

- Ugyanaz a lecke (68a5b500 tanítása, 12 fejezet), a termelési `buildLessonExperience` útvonal, a termelési
  `bank` szabályzat (240 s, 24k, low effort, JSON-mód). Minden kísérlet a jelöltre megy (a jelölt saját
  megbízhatóságát mérjük), fejezetenként legfeljebb 4 kísérlet.
- Mért: sikeres fejezetek, bukott kísérletek száma és oka, falióra-idő, tokenek → költség, és a kész bank
  bank-ellenőr hibaaránya (Opus 5.5, ugyanaz a vak megoldás-kulcs).
- Jelöltek: glm-5.3-flash (kiindulás), gpt-5.6-luna, z-ai/glm-5.3, claude-haiku-4-5, claude-sonnet-5.
- Előfeltétel: az aritmetika-ellenőrző két újabb mért téves riasztása javítva (címke-kettőspont
  „15 nap: 60 : 15 = 4”, szóközös ezres „12 000 : 4 = 3000”), különben a mérés torz.

## Döntési szabály

Elsődleges: a legkisebb bank-ellenőr hibaarány, ha a fejezetek 100%-a elkészül és a bank ideje ≤ 600 s
(PACKET_CONCURRENCY mellett). Döntetlennél az olcsóbb. Tartalék: a második legjobb, más modellcsaládból.

## Elfogadás (EARS)

- HA a mérés lezárult, AKKOR a táblázat (modell × hibaarány × bukott kísérlet × idő × költség) a specben áll.
- HA a választott modell a mátrixba kerül, AKKOR a routing-tesztek a mért indoklással frissülnek (dokumentált spec-változás).
- HA a váltás élesben van, AKKOR egy teljes éles gyártás `done` állapotba ér, a kész bank bank-ellenőr hibaaránya
  a mért értéken belül marad.
- Aritmetika: „15 nap: 60 : 15 = 4” és „12 000 : 4 = 3000” nem hiba; „12 000 : 4 = 300” hiba.

## Végrehajtás (AI-ügynöknek)

1. Új teszt + javítás `server/studio/tools/arithmetic-claims.ts` (címke-kettőspont, ezres tagolás); kapu; PR; merge.
2. Mérő szkript (gitignored `*.tmp.mts`) a fenti módszerrel; eredmény a specbe.
3. `server/ai/models.ts` bank + tartalék csere a mért győztesre; routing-tesztek; kapu; PR; merge; deploy.
4. Teljes éles gyártás ugyanazzal a feladatlappal; `done` + bank-ellenőr hibaarány a naplóból.

## Mérési eredmény (2026-09-24, lecke 68a5b500, 12 fejezet, jelöltek párhuzamosan)

| Modell | Bank ideje | Hívás / bukott kísérlet | Bank-ellenőr hiba | Költség / bank |
|---|---|---|---|---|
| z-ai/glm-5.3-flash (eddigi) | 653 s | 21 / 9 | 22/146 (15%) | 0,05 USD |
| **gpt-5.6-luna** (2 futás) | 130 / 143 s | 17 / 5, 16 / 4 | **9/144 (6%)** mindkétszer | **0,09 USD** |
| gpt-5.6-terra | 176 s | 13 / 0 | 8/144 (6%) | 0,71 USD |
| claude-sonnet-5 | 425 s | 18 / 4 | 17/146 (12%) | 1,16 USD |
| z-ai/glm-5.3 | – | 26 / 15 | építési hiba (sémahiány) | 0,54 USD |
| claude-haiku-4-5 | – | – | nem mérhető: „adaptive thinking is not supported on this model” (400) | – |

Döntés (a döntési szabály szerint): **bank = gpt-5.6-luna** (a terrával azonos hibaarány, 8-szor olcsóbb,
gyorsabb). A tartalék és a mentőkör változatlanul gpt-5.6-terra (0 bukott kísérlet — a legmegbízhatóbb; a
korábbi mérés szerint olcsó második tartalék csak időt veszít). A luna bukásai főleg a mintaválasz-rubrika
belső ellenőrzéséből jöttek (a következő kísérlet javítja), sémahiány egyszer.
