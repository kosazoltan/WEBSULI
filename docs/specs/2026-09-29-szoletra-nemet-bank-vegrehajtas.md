# Végrehajtás — Szólétra német bank (C szelet, 2026-09-29)

Terv: `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md` (4–5. döntés, E4). Ág: `feat/szoletra-nemet-bank`
(alap: `origin/feat/palyak-nyelvek-alap`). Parancsok a `source/`-ban. Csak az itt felsorolt három fájl változik.

## T1 — Teszt (a bank ELŐTT; a hiányzó modul miatt bukik)
- Új: `tests/word-ladder-de.test.ts` — `ladderBankProblems(WORD_LADDER_DE, "de")` → `[]` (szerkezet, egyediség,
  4 különböző opció, index, magyarázat 30–300 kar. + kulcsszó, sorrend-hivatkozás tilalma, szint- és kategória-minimumok).
- Kiegészítő állítások (ugyanitt, a spec 5. döntéséből): minden `id` `de<tier>-<nnn>`; a `correctIndex` mind a 4
  értéket felveszi; a prompt magyar (tartalmaz „németül” vagy „Mit jelent” / magyar kérdőszót — nincs pusztán német prompt).

## T2 — `client/src/data/wordLadder/de.ts`
- `export const WORD_LADDER_DE: LadderItem[]`, egy tétel egy sor, `import type { LadderItem } from "./types"`.
- Célszámok (tartalékkal a minimum fölött): szint 0/1/2/3/4 = 126/124/96/66/66 (478);
  kategória word 122, topic 100, phrase 68, irregular 56, regular 58, everyday 74.
- Szintek tartalma: 0 A1 könnyű (színek, számok, állatok, család, sein/haben jelen idő, köszönés); 1 A1–A2 (tőhangváltó
  jelen idő, umlautos többes szám, vásárlás, idő); 2 A2 (Perfekt, war/hatte, módbeli igék, gut–besser, étterem,
  útbaigazítás); 3 B1 (erős igék Präteritumja, sein-es Perfekt, Konjunktiv II, -ung/-heit képzés, szólások);
  4 B2 (Plusquamperfekt, passzív, Konjunktiv I/II múlt, ritkább erős igék, elvont szókincs, idiómák).
- Mindkét irány: „„X” németül:” és „Mit jelent: „Y”?”; főnév névelővel, nagybetűvel, helyes umlaut/ß.
- Tévesztő: hihető, de egyértelműen rossz (nincs szinonima, nincs másik elfogadható nyelvtani alak, pl. tárgyeset).
- A `correctIndex` változatos (0–3 körkörösen keverve).

## T3 — Vak ellenőrzés (`source/de-ladder-blind.local.mts`, gitignore-olt, nem commitolt)
- A `grade-bank-blind.local.mts` mintája: kulcsok `dotenv` `path`-szal a fő checkout `source/.env`-jéből, soha nem kiírva.
- Két modell: `gpt-5.6-terra` (`createStudioProvider(m, 240000, 16000, { jsonMode: true })`) és `grok-4.6` (xAI).
- Opciónként igaz/hamis ítélet, kulcs nélkül; jelzés, ha az igazak száma ≠ 1 vagy az igaz ≠ kulcs.
- Előpróba: 4 szándékosan hibás tétel (2 kétjó, 1 rossz kulcsú, 1 hibátlan kontroll) → mindkét modellnek jeleznie kell a 3 hibást.
- Minden jelzés kézi átnézése: valódi hiba → a tétel javítása, újrafuttatás (gyorsítótár tartalom-hash szerint);
  megoldói tévedés → dokumentálva a zárójelentésben. Cél: 0 nyitott jelzés mindkét modellnél.

### Eredmény (2026-09-29)
- Előpróba (Szombat: Samstag/Sonnabend, Narancs: Orange/Apfelsine kétjó; trinken rossz kulccsal; Macska kontroll):
  mindkét modell mind a 3 hibást jelezte, a kontroll átment.
- 1. kör (478 tétel, 24–24 hívás): Terra 2, Grok 2 jelzés.
  - de3-033 („Ich bin fix und fertig.”, Grok) — valódi kétértelműség (a Duden „teljesen kész” jelentése is): a két
    „kész” értelmű tévesztő cserélve.
  - de4-041 (schwimmen, Grok: „schwomm” regionális) — a vitatott tévesztő cserélve („schwammte”).
  - de0-103, de1-097 (Terra: ihr + „lachen/machen”) — megoldói tévedés (ihr lacht / ihr macht a sztenderd); a promptba
    egyértelműsítés került: „ihr = ti” (a nagybetűs Ihr / részes esetű ihr olvasat kizárása).
- 2. kör (a 4 módosított tétel): Grok 0; Terra 1 (de1-097 ismét „machen” kötegben). 3. kör: Terra egyedül ítélve
  helyesnek („macht”) fogadta el → megoldói tévedés, dokumentálva.
- Zárás: gpt-5.6-terra 478/478, grok-4.6 478/478, nyitott jelzés 0.

## T4 — Kapuk
`npx tsc --noEmit`; `npx tsc --noEmit -p tsconfig.test.json`; `npm run lint`; `node --import tsx --test tests/*.test.ts`;
`npm run build`. Elvárt: 0 hiba, minden teszt pass. Meglévő teszt nem módosul.

## T5 — Commit, push
Commit (`Co-Authored-By` sorral) → külön hívásban a sentinel (`.audit-ok` a munkafában és a fő checkoutban) →
`git push -u origin feat/szoletra-nemet-bank`. PR nincs, merge/deploy nincs. A `source/node_modules` csomópont
`rmdir`-rel bontva; a fő `node_modules` bejegyzésszáma ellenőrizve.
