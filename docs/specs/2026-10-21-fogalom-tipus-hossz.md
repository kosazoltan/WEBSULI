# A tudásbank fogalomtípusa nem lépheti túl az oszlophatárt

Állapot: a régi anyagok éjszakai átalakítása közben mért hiba (2026-10-21 03:15, „8. Osztály Ady endre tananyag teljes”, 2/2 kísérlet).

## Mérés
- **A hiba:** `Failed query: insert into "km_concepts" …` → a gyártás megállt.
- **Ok:** a kinyerő a fogalom típusát szabad magyar szövegként adta: „irodalomtörténeti esemény” (25 karakter). A
  `km_concepts.type` oszlop `varchar(24)`.
- **Azonos kockázat:** a `verbatim_reason` (`varchar(32)`) a helyesbítés szövegét kapja.
- **Gyakoriság:** 66 anyagból 1.

## Cél
- **Vágás az oszlophatárra:** `saveSingleRunMap` a `type`-ot 24, a `verbatim_reason`-t 32 karakterre vágja. A típus csak
  címke; a pontozást és a fedettséget nem befolyásolja.
- **Egyszeri újrasorolás:** a régi anyagok sorában az e hiba miatt `error`-ra zárt elemek egyszer újra sorba kerülnek
  (`payload.requeued`), a kísérletkeret újraindul.

## Nem-cél
- **A séma (oszlophossz) változtatása:** migráció nem kell.

## Elfogadás (EARS)
- HA a fogalom típusa 24 karakternél hosszabb, AKKOR a térkép mentése sikeres (a típus vágva).
- HA egy régi anyag sorelemének hibája a `km_concepts` beszúrás, AKKOR egyszer újra sorba kerül; másodszor nem.
