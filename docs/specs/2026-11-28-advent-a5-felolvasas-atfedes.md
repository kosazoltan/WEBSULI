# A-5 — Advent: elsős felolvasás és a koszorús tételek átfedése (#151, #153)

Állapot: tulajdonosi jóváhagyás 2026-11-28 (űrlap: „az adventi tételeket csináld meg”); forrás: `docs/specs/2026-11-19-websuli-potlasok-terv.md`
A-5 sor (P-039), végrehajtás: `docs/specs/2026-11-28-advent-a5-felolvasas-atfedes-vegrehajtas.md`. Határidő: december 1. előtt.

## Probléma
1. (#151) A koszorú gyertyáiról szóló hét 1–4. évfolyamos karácsonyi tétel elárulja egymás válaszát (pl. a „Mit gyújtunk meg a
   koszorún?” válasza, a „Gyertyát”, öt másik kérdésben áll; két tétel helyes válasza azonos: „Négy”). Az 1–2. évfolyam mind a 144
   tételt megkapja, így a gyerek szinte biztosan egymás mellett látja őket.
2. (#153) Az elsős még nem olvas folyékonyan: a kérdést és a válaszokat nem tudja elolvasni.

## Megoldás
- Témacsalád (`family`) a karácsonyi tételen; a validátor (`christmasAnswerLeaks`) a családon belül tiltja, hogy egy helyes válasz
  tartalmi szava másik tag kérdésében álljon, és hogy két tag helyes válasza azonos legyen. A hét koszorús tétel a család tagja; négy
  (xmas-016, -069, -090, -096) átírva.
- Felolvasó gomb a kérdésnézetben 1. évfolyamon: a kérdést és a négy választ olvassa fel a meglévő magyar felolvasóval
  (`client/src/lib/tts.ts`, LS-4 kapu: hang nélküli eszközön és csökkentett mozgásnál rejtett). A `speech-chain.ts` a nyelvleckék
  angol lánca, magyar kérdésre nem alkalmas — ezért az LS-4 felolvasó.

## Elfogadás
- A valódi készlet szivárgásmentes (teszt), a validátor a szivárgást és az azonos választ megfogja (bukó eset tesztben).
- A gomb csak 1. évfolyamon látszik; a felolvasott szöveg a kérdés + a válaszok sorszámmal; ablakváltáskor a felolvasás leáll.
