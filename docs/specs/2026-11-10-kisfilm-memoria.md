# Spec: a kisfilm-gyártás memóriabarát átkódolása (éles hiba javítása)

> Dátum: 2026-11-10 · Szerző: Claude Code · Állapot: JÓVÁHAGYVA (éles hiba; a tulajdonos a gyártás bekapcsolását kérte)
> Előzmény: `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md`. Végrehajtás: `docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md`

## 1. Mi történt (mérve)

A `LESSON_CLIPS_AUTO=on` bekapcsolása után (2026-11-10 19:40 UTC) a `websuli-api-eu` példány négyszer újraindult, 3–4 percenként
(19:40, 19:43, 19:47, 19:51). A Render memóriamérése: alapállapot 208 MB, a gyártás alatt 286 MB, 19:47:00-kor 526 MB az 512 MB-os
korlát mellett — a rendszer kilőtte a folyamatot (hibanapló nélkül). A gyártást 19:53-kor kikapcsoltam (`LESSON_CLIPS_AUTO=off`).

**Ok:** a gyártósor két fejezetet és fejezetenként négy jelenetet futtatott párhuzamosan, vagyis egyszerre akár nyolc `ffmpeg`
átkódolást. Egy átkódolás mért csúcsmemóriája 171 MB; a nyers (4–17 MB-os) klipek ráadásul a Node-folyamat memóriájában álltak.
A helyi próba ezt nem mutatta ki, mert ott nincs 512 MB-os korlát. Következmény: négy megszakadt kör képei és mozgóképei kifizetve,
de elveszve (becslés: néhány USD); kisfilm nem tárolódott.

Jó hír a naplóból: a szerveren VAN `ffmpeg` (nem jelent meg a hiányát jelző sor a kilövés előtt — UNVERIFIED, a javított futás
igazolja), a hang ElevenLabs, a kép OpenAI.

## 2. Cél

A gyártás soha ne dönthesse be a szervert: a memóriaigénye maradjon jóval a példány korlátja alatt.

## 3. NEM cél

A gyártósor tartalmi lépései, a lejátszó, a séma, a plafonok (napi lecke, tárkeret) — változatlanok.

## 4. Rögzített döntések

- **Egy átkódolás egyszerre, egy szálon, előretekintés nélkül** (közös sor): mérve 75 MB (alapbeállítással 171 MB), a kimenet mérete azonos.
- **A nyers mozgókép lemezre töltődik** (adatfolyamként), soha nem kerül a folyamat memóriájába; a szolgáltató a már átkódolt, kicsi klipet adja vissza.
- **Egyszerre egy fejezet** készül (a jelenetek kép- és hanglépései párhuzamosak maradnak, a mozgóképek gyártása a szolgáltatónál is).
- **Memóriaőr:** ha a folyamat saját memóriája 360 MB fölött van, a kör kimarad (naplózva).
- Mérés a javított gyártósorral (valódi szolgáltatók, egy fejezet): a próbafolyamat csúcsmemóriája 144 MB, a fejezet 132 mp alatt kész.

## 5. Edge case-ek

- `ffmpeg` hiánya / hibája: a jelenet állóképes (változatlan).
- A letöltés megszakad: a jelenet állóképes, az ideiglenes mappa törlődik.
- Több fejezet vár: egymás után készülnek; a körök 3 percenként indulnak, futó kör alatt új nem indul (változatlan).

## 6. Elfogadás (EARS)

- WHEN a gyártás fut THEN egyszerre legfeljebb egy átkódolás SHALL futni, egy szálon.
- WHEN a folyamat memóriája a határ fölött van THEN a kör SHALL kimaradni, modellhívás és költés nélkül.
- WHEN a gyártás élesben újra bekapcsol THEN a példány memóriája SHALL a korlát alatt maradni, és a szerver SHALL NOT újraindulni (élő mérés a bekapcsolás után).

## 7. Tesztterv

`tests/lesson-clip.test.ts` (az átkódolás paraméterei), `tests/lesson-clip-worker.test.ts` (egy fejezet egyszerre, memóriaőr, a
mozgókép hibaágai az új felülettel); élő próba a `source/scripts/clip-trial.ts`-sel; bekapcsolás után Render memória- és eseménymérés.

## 8. Kockázat / visszavonás

A tartalék kicsi marad (alap ~210–290 MB + ~50 MB gyártás + 75 MB átkódolás az 512 MB-ból): a bekapcsolás utáni első kört mérni
kell. Visszavonás: `LESSON_CLIPS_AUTO=off` (azonnal).

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md`
