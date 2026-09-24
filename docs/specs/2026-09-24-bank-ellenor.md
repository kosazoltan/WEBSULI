# Spec — Bank-ellenőr (Opus 5.5) a vak megoldókkal (2026-09-24)

Tulajdonosi jóváhagyás: 2026-09-24 („Jóváhagyom”) a `2026-09-24-lektor-tanitas.md` nyitott javaslatára.

## Háttér (mért)

Az új lecke élő gyártásánál (job d0731b46, lesson 38b1238d) a lektor 0 banktétel-hibát jelzett, két
független Opus-ellenőrző viszont ezeket találta: lehetetlen adatú kvíz, hamis/fordított visszajelzések,
igaz disztraktor, „3 és 5 szorzata 8”, hiányzó érték, ~19 rubrika végeredmény nélkül. A lektor egy
hívásban a teljes leckét (tanítás + ~144 banktétel) nézi — a banktételekre a figyelme (recall) alacsony.

## Cél

A lektor-lépés mellett egy külön, fejezetenként párhuzamos Opus 5.5 hívás („bank-ellenőr”) minden
banktételt (methods, tasks, quiz) önállóan megold és ellenőriz, a vak megoldásokat kulcsként használva.
A talált hibák `experience.*` blokkoló jegyzetként a MEGLÉVŐ csak-bank javító körbe mennek.

## Nem-cél

- A tanítás (sections) ellenőrzése — az a lektor dolga.
- A banképítő, a workflow-lépések vagy a körlimitek módosítása.
- Szójegyzék (glossary) ellenőrzése.

## Viselkedés

1. Csak akkor fut, ha a leckének van nem üres bankja ÉS van legalább egy vak megoldás.
2. Fejezetenként (sectionIndex) egy hívás, legfeljebb 4 párhuzamosan, a lektor-hívással egy időben.
3. A modell kimenete `{ "errors": [{ "path": "experience.quiz[12]", "message": "…" }] }`. Csak az adott
   darabban szereplő útvonal fogadható el (kitalált útvonal eldobva, naplózva).
4. A jegyzet: `source_conflict / contradicts_source`, `blockPath` = az útvonal, az üzenet
   „Bank-ellenőr: ” előtaggal. A lektor jegyzeteihez fűződik; ha a lektor ugyanarra az útvonalra már
   blokkolót adott, nem duplikálódik.
5. Ha csak-bank javító kör már nem jár (keret vagy látogatás elfogyott), a bank-ellenőr jegyzetei
   figyelmeztetésként (`subkind: bank_check_late`) tárolódnak — a leckét nem buktatják.
6. A hibátlannak talált tételek tartalom-hash-e a jobban tárolódik; a következő lektorkörben csak az
   új/változott tételek mennek ellenőrzésre.
7. Hívás- vagy alakhiba: az adott darab kimarad, naplózva; a lektor nélküle dönt (nem blokkol).
8. Napló: `Bank-ellenőr (job, kör): N tétel, M hiba`.

## Edge case-ek

- Nincs vak megoldás (nincs forrásszöveg / a megoldó elmaradt) → nincs hívás.
- A modell kitalált / más fejezetbeli útvonalat ad → eldobva.
- Minden tétel korábban hibátlan volt → nincs hívás.
- A lektor-hívás elbukik → a bank-ellenőr ígérete nem dob (nincs kezeletlen elutasítás).

## Elfogadás (EARS)

- HA a leckének van bankja és van vak megoldás, AKKOR a lektor-lépés fejezetenként egy bank-ellenőr
  hívást indít `claude-opus-5-5` modellel, a `bank-verifier` támogató skill-lel.
- HA a bank-ellenőr hibát jelez és csak-bank kör még jár, AKKOR a job `bankReview`-ja tartalmazza az
  útvonalat és a következő lépés az animátor (csak-bank javítás).
- HA csak-bank kör már nem jár, AKKOR a bank-ellenőr jegyzete nem blokkol és a lecke nem bukik miatta.
- HA nincs vak megoldás, AKKOR nincs bank-ellenőr hívás.
- HA a modell a darabon kívüli útvonalat ad, AKKOR az nem lesz jegyzet.
- A meglévő tesztek változatlanul zöldek; a teljes kapu (tsc, eslint, tesztek, build) zöld.

## Élő mérés (2026-09-24, lesson 38b1238d, 144 banktétel, 12 fejezet)

Kulcs: a két független Opus-ellenőrzés utáni kézi javítás (31 tétel: 10 tartalmi, 21 rubrika). A lektor
ugyanebből 0-t talált.

| Futás | Idő | Megtalált | Hamis riasztás |
|---|---|---|---|
| v1 skill, javítás előtti bank | 31 s | 23/31 (tartalom 6/10, rubrika 17/21) | 0 |
| v2 skill (disztraktor-átszámolás, kiírt művelet, rubrika-csoport) | 43 s | 29/31 (tartalom 10/10, rubrika 19/21) + 4 új valódi hiba | 0 |
| v2, a 4 új javítása után | 36 s | +3 új valódi hiba (kétértelmű réteg, „120 – 117 = 13”, igaz disztraktor) | 0 |
| v2, a 3 javítása után | 27 s | +1 („szórás jellege” a terjedelemre) | 0 |

Tanulság: a pontosság (precision) mind a négy futásban 100%; a találati arány futásonként ingadozik
(modell-nemdeterminizmus), ezért a hibátlannak talált tételek kihagyása (6. pont) költséget spórol, de egy
futás nem garantál teljes lefedést. A 8 további hibát a közzétett leckében javítottam (kvíz 10, 30, 46, 53,
55, 67, 71, 74), az élő API-n ellenőrizve.
