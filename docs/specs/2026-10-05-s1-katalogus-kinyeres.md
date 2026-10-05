# S1 — Determinisztikus katalógus-kinyerés mind a 201 leckéből (2026-10-05)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` (S1). Tulajdonosi döntés: a 177 régi HTML-lecke szülők által ellenőrzött
(~99%) tudásforrás; a 24 publikált fúziós lecke gépi kapun átment. Modellhívás NINCS — a kinyerés statikus elemzés.

## Mért formátumok (a 177 régi lecke szkriptjeiből, objektum-szignatúra / lecke)
`{q,a:[…]}` rövid válasz elfogadott változatokkal (46 lecke); `{q,opts|o|options,correct|c}` feleletválasztós (index);
`{q,a,b,c[,d],correct:"a"}` betűs feleletválasztós; `{q,keywords|keys|kw[,key]}` nyílt feladat kulcsszóval + mintával;
`{en,hu}` szókincs-pár; `{question,options,correct…}`; `{kerdes,valaszok,helyes}`; v7.4-es (`coversConceptIds`) tételek.
Futásidejű (nem literál) objektumok (`{question: item.q, …}`) NEM tudás → kihagyva.

## Cél
1. `server/catalog/legacy-extract.ts`: HTML → `{ sections: [{heading, text}], items: CatalogItemDraft[], stats }`.
   - A szkriptek AST-je (acorn, kódfuttatás NÉLKÜL); csak teljesen literál objektumok; osztályozás a fenti formátumokra
     (`quiz` / `short_answer` / `open_task` / `vocab`); a helyes kulcs indexre normalizálva; duplikátum-szűrés lenyomattal.
   - Szöveg: a script/style nélküli HTML h1–h3 szerinti szakaszai (≥ 40 karakter), tag-mentesítve.
2. `server/catalog/fusion-extract.ts`: a publikált fúziós `lessons.json` → ugyanaz a tétel-alak (fejezet-szöveg, kvíz
   helyes indexszel, nyílt feladat kulcsszó-csoportokkal + mintával, módszer).
3. `scripts/catalog/extract-all.mts` (CSAK OLVAS): mind a 201 lecke; összesítő `docs/measurements/2026-10-05-catalog-extract.json`
   (leckénként tétel-darab fajtánként, sikertelen szkript-elemzések), a teljes tétel-lista helyi fájlba (`source/.catalog/`,
   gitignored) — a DB-be írás az S3 (bizalmi szint + tárolás) dolga.

## Nem-cél
Tantárgy/téma/típus besorolás (S2), ellenőrzés és tárolás (S3), modellhívás.

## Edge case-ek
Szintaktikailag hibás szkript → kihagyva, számolva; `correct` betű („a”) → index; `correct` szöveg (az opció maga) → index;
hiányzó/érvénytelen kulcs → tétel `quiz` helyett `quiz_unkeyed` (nem kerül szó szerinti átvételre); üres/rövid lecke → 0 tétel.

## Elfogadás (EARS)
- A leckék ≥ 95%-ánál a szkript-elemzés sikeres; a kulcsos kvíz-literálok ≥ 95%-a helyes indexszel kinyerve (a regex-alapú
  előszámlálással összevetve, a script kiírja).
- Fúziós leckénél a kinyert kvíz/feladat/módszer darab = a `lessons.json` darabja.
- Unit-teszt a mért formátumokra; tsc, lint, teljes unit zöld.
