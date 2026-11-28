# P7C-LEKTOR-REGI — a lektor által kifogásolt megtartott régi tétel cseréje a csak-bank javításban

Állapot: terv (2026-11-28) · Feladat: P7C-LEKTOR-REGI (feladat-DB) · Szülő: TANANYAG-GYAKORLATI / P7C (#649)

## Probléma (mért)
A 10 leckés gyakorlati próbán (2026-11-28) a 9370eb25… lecke csak-bank javítása háromszor azonosan megállt:
`A lektor javítást kér, az eredeti érintetlen (Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg …
experience.quiz[10] … (kivétel után: gerincoszlop: hiányzó recall kvíz.))`.
A kifogásolt tétel a lecke RÉGI bankjából megtartott tétel (a „gerincvelő” a tanításban nem szerepel); a tétel a fogalom egyetlen
felidéző kvíze, ezért kivenni sem lehet (a bank fedése sérülne). A javítás így soha nem fut le, a lecke a régi, hibás tétellel marad.

## Döntés
A csak-bank javításban (`buildPracticeBankRepair`, `keepLegacy`) ha a lektor blokkoló jegyzetei MIND létező banktételre mutatnak, és a
kivétel a bank-szabályok miatt nem lehetséges, a javítás EGYSZER újrafut úgy, hogy a kifogásolt tételek fogalmai (`coversConceptIds`)
a nem átvehető (újragyártandó) fogalmak közé kerülnek (`staleConceptIds`). Így az egységük friss tételeket kap, a hibás régi tétel nem
kerül vissza. A második kör blokkolója már a régi megállás (az eredeti érintetlen) — nincs végtelen kör.

- Tanítási (nem banktétel) jegyzet, eltérő tanítási megoldás, nem létező tétel: változatlanul a régi megállás.
- A teljes javítás útja (`buildStructuredImprovement`) nem változik.

## Elfogadás
- L1: a fenti helyzetben a javítás lefut; a lektor kétszer hívódik; a második bankkör az érintett fogalmakat újragyártja.
- L2: ha a második kör lektora is blokkol, a hiba a régi üzenettel jön (egyetlen újrakör).
- L3: a hibaüzenet tartalmazza a kivétel okát és a jegyzetek útvonalát (diagnosztika).
