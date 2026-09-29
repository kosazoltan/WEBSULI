# Szólétra — francia bank (D szelet) · végrehajtási utasítás

Terv: `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md` (5. döntés, D szelet). Ág: `feat/szoletra-francia-bank`
(alap: `origin/feat/palyak-nyelvek-alap`). Csak az alábbi három fájl változik.

## 1. `source/client/src/data/wordLadder/fr.ts`
- `export const WORD_LADDER_FR: LadderItem[]` (`import type { LadderItem } from "./types"`), egy tétel egy sor.
- Terv szerinti darabszám (szint × kategória), összesen 490:

  | szint | word | topic | phrase | irregular | regular | everyday | össz. |
  |---|---|---|---|---|---|---|---|
  | 0 (A1) | 50 | 40 | 12 | 6 | 8 | 14 | 130 |
  | 1 (A1–A2) | 36 | 30 | 16 | 12 | 14 | 18 | 126 |
  | 2 (A2) | 18 | 16 | 14 | 16 | 14 | 20 | 98 |
  | 3 (B1) | 10 | 8 | 14 | 14 | 12 | 10 | 68 |
  | 4 (B2) | 8 | 6 | 12 | 12 | 12 | 18 | 68 |
  | össz. | 122 | 100 | 68 | 60 | 60 | 80 | 490 |

- `id`: `fr<szint>-<nnn>`, szintenként 001-től folyamatos. A `correctIndex` álvéletlen, mind a 4 érték előfordul.
- Szó- és szószedet-tételek: váltakozó irány: „„X” franciául:” és „Mit jelent: „Y”?”. A főnév névelővel (le/la/l'/les).
  A többértelmű magyar szót zárójeles pontosítás egyértelműsíti (pl. „hét (szám)”). A magyarázat megadja a
  helyes párt és a tévesztők jelentését.
- Nyelvtani és helyzeti tételek: a helyes alak vagy mondat, és három hihető, de egyértelműen hibás alak. Ahol
  több igeidő is nyelvtanos lenne, a prompt megnevezi az igeidőt.
- Francia írásjel: a `? ! : ;` előtt nem törő szóköz (`\u00a0`).
- Magyarázat: magyar, 30–300 karakter. Szó szerint tartalmazza a helyes opció egy szavát, és nem hivatkozik sorrendre.

## 2. `source/tests/word-ladder-fr.test.ts` (új teszt)
- `ladderBankProblems(WORD_LADDER_FR, "fr")` → `[]`.
- Francia opcióban nincs sima szóköz a `? ! : ;` előtt.
- Mind a 4 `correctIndex` érték előfordul, és egyik sem haladja meg a 40%-ot.
- Futtatás: `node --import tsx --test tests/word-ladder-fr.test.ts` (a `source/`-ból). Elvárt eredmény: `pass`, `fail 0`.

## 3. Vak ellenőrzés (gitignore-olt `source/fr-bank-blind.local.mts`, nem kerül commitba)
- A kulcsok a fő checkout `D:/repo/WEBSULI/source/.env` fájljából jönnek (`dotenv` `path`). A kulcs nem kerül kiírásra.
- Megoldók: `gpt-5.6-terra` (`createStudioProvider(…, 240000, 16000, { jsonMode: true })`) és `grok-4.6` (xAI, más család).
  A megoldó a kulcs nélkül, opciónként igaz/hamis ítéletet ad. Jelzés: ha nem pontosan egy opció igaz, vagy az nem a kulcs.
- Próba (`--probe`): 2 szándékosan kétjó tétel és 1 helyes kontroll. A megoldó akkor használható, ha mindkét kétjó
  tételt jelzi, a kontrollt pedig nem.
- Minden jelzést kézzel kell átnézni. Valódi hibánál a tételt javítani kell, majd újra kell ellenőrizni, amíg 0 nyitott
  jelzés marad. Ha a megoldó téved, azt a zárójelentés dokumentálja.

## 4. Kapuk (`source/`)
`npx tsc --noEmit` · `npx tsc --noEmit -p tsconfig.test.json` · `npm run lint` ·
`node --import tsx --test tests/*.test.ts` · `npm run build`. Mind zöld; meglévő tesztet nem módosítunk.

## 5. Lezárás
Commit a `Co-Authored-By` sorral. Push előtt külön hívásban írjuk az `.audit-ok` sentinelt, utána jöhet a
`git push -u origin feat/szoletra-francia-bank`. PR nem nyílik.
