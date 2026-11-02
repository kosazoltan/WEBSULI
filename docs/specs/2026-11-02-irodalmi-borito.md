# Görög dráma borító a 9–10. sávnak

Tulajdonosi döntés 2026-11-02 (a `2026-11-02-maradek-kockazatok.md` 2. pontja): az Antigoné-lecke a sáv koncepcióképét (függőhíd,
„Digitális tudáslabor”) kapta, mert a katalógusban nincs 9–10. sávos irodalmi / drámai, kulcsszóval illeszthető borító.

## Mért tények
- `shared/design-assets.ts` `pickLessonArt`: kulcsszavas borító csak `topic` nélküli, azonos sávú, tantárgyra ÉS címre illő elem lehet
  (`coverFits`); különben a sáv hős-képe (`spec 2026-10-19-hos-kep-sav`).
- A 9–10. sáv (`laboratory`) topic nélküli borítói: `cover-sejt`, `cover-terkep` — irodalmi nincs.
- A lecke tárgya „Magyar nyelv és irodalom”: a `magyar-irodalom` tantárgykulcs NEM illeszkedik (`coverFits`), az `irodalom` igen.

## Cél
- Új `cover` elem: `cover-gorog-drama`, sáv `laboratory`, `subjects: ["irodalom", "Magyar nyelv és irodalom"]`, kulcsszavak
  `antigoné`, `szophoklész`, `oidipusz`, `görög dráma`; `topic` nincs.
- Folyamat (`docs/specs/2026-10-17-websuli-kepkeszlet.md`): `design-assets/prompts.json` elem → `scripts/design-assets/generate.ts`
  (3 jelölt, Seedream 5.0 Pro, ≈ 0,27 USD) → tulajdonosi kiválasztás (1. jelölt, tengerparti színház) → `scripts/design-assets/approve.ts`
  (WebP `client/public/design/laboratory/cover-gorog-drama.webp`, katalógusbejegyzés `approvedAt`-tel).

## Nem-cél
- A sávszabály és a sávnév („Digitális tudáslabor”) változatlan.
- Más irodalmi borítók; a „tragédia” kulcsszó szándékosan kimarad (*Az ember tragédiája* ne kapjon görög színházat).

## Edge case-ek
- Más sáv (pl. `studio`), más tantárgy (Történelem), más mű („Az ember tragédiája”) → nem ez a borító.
- A már mentett lecke a tárolt képet tartja (`resolveStoredArt` / `pictureFits`); az Antigoné az ugyanaznapi célzott javítás
  újramentésével (`withLessonArt`) kapja meg. A szerver induláskor szinkronizálja a katalógust a `design_assets` táblába.

## Elfogadás (EARS)
- HA `pickLessonArt({ subject: "Magyar nyelv és irodalom", title: "Szophoklész: Antigoné" }, "laboratory", katalógus)` fut, AKKOR a
  borító `cover-gorog-drama`, hős-kép nincs.
- HA a cím „Oidipusz király” vagy „A görög dráma születése”, AKKOR is ez; HA más sáv / tantárgy / „Az ember tragédiája”, AKKOR nem.
- HA a katalógus tesztjei futnak (`tests/design-assets.test.ts`), AKKOR a séma és a fájl megléte zöld.
- HA a lecke újramentődik élesben, AKKOR `/api/lessons/by-file/7900a871…` `lesson.art.picture` = `cover-gorog-drama`.
