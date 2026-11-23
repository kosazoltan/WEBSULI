---
name: maximize-prompt-cache
description: "A prompt- / KV-gyorsítótár maximális kihasználása a saját munkámban, az alügynökeimnél és a vak ellenőr futtatójában (tulajdonos, 2026-11-18)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-18T18:58:24.811Z
---

**KÖTELEZŐ BEÁLLÍTÁS (tulajdonos, 2026-11-23):** a prompt-gyorsítótár használatát FOLYAMATOSAN ellenőrizni kell, és a lehetőségeit
maximálisan ki kell használni az API-költség csökkentésére. Mérés 2026-11-23-án a vak futtató 32 körén (737 hívás, 23,44 USD): a
találati arány a 2. hívástól átlag 93,3%, a legrosszabb kör 85,8%, 80% alatti kör nincs. Teendők minden munkamenetben:
1. **Minden vak kör után** olvasd ki a naplóból a „gyorsítótár-találat a 2. hívástól” értéket; 80% alatt állj meg, és keresd az okot
   (változó előtag, 5 percnél hosszabb szünet két hívás között, újrarendezett eszközlista) — a hibajegyzékbe kerül.
2. **A legnagyobb megtakarítás a fölösleges kör elkerülése:** vak kör csak akkor, ha a közös fájlt érintő előző PR beolvadt és a botok
   leletei javítva vannak; követő körnél mindig `--previous`; összefésülés után bizonyíték-átvitel (főterv H3 K2), amint elkészül.
3. **Saját munkamenet:** meglévő alügynök folytatása (`SendMessage`) új indítása helyett; stabil megbízás-fejléc; célzott olvasás
   (grep / sorhatár), nagy fájl újraolvasása nélkül; a hosszú kimenetek fájlba, nem a beszélgetésbe.
4. **A termék (leckegyártás):** a `server/ai/prompt-cache.ts` és a `single-run/conversation.ts` gyorsítótárazza a stabil előtagot, a
   `single-run/telemetry.ts` méri (`cachedInput`); promptot érintő szeletnél a stabil rész maradjon elöl és bájtra változatlan — a
   kapcsoló mögötti (BE) szöveg a kérés VÉGÉRE kerüljön, ne a közös előtagba.

A tulajdonos 2026-11-18-án kétszer kérte: „figyelj oda, hogy a [KV-]cache használat maximálisan ki legyen használva” (a vak
ellenőr futtatójára), majd: „A saját környezetedben, a saját magad által futtatott ügynökök és a saját viselkedésedben is
maximalizáld a [KV-]cache használatát.”

**Why:** az ügynök-ciklusokban minden kör újraküldi az eddigi kontextust; a gyorsítótár-találat töredék áron megy, a
gyorsítótárat törő változtatás (új előtag, átírt korábbi üzenet, friss kontextus) teljes áron.

**How to apply:**
- Folytatásra, javításra, visszanézésre a MEGLÉVŐ alügynököt folytatom (SendMessage), nem indítok újat — az ő kontextusa már
  gyorsítótárban van. Új alügynök csak akkor, ha a függetlenség megköveteli (vak ellenőr) vagy a régi kontextusa megromlott
  (megakadt, túl hosszú, ismétlődő hibás irány).
- Az alügynök-megbízások stabil szerkezetűek: állandó, ismétlődő fejléc (szabályok, titokkezelés, tilalmak, jelentésformátum)
  elöl, ugyanabban a sorrendben és szövegezésben; a feladat-specifikus rész a végén. Ugyanazt a keretet újrahasznosítom
  (pl. vak ellenőr sablon), nem fogalmazom újra minden alkalommal.
- Nagy fájlt / jelentést nem olvasok újra feleslegesen; célzottan (sortartomány, Grep) olvasok; alügynök-átiratot soha.
  Párhuzamos, független eszközhívásokat egy üzenetben küldök.
- Nem várok a gyorsítótár élettartamánál (ebben a munkamenetben 1 óra) hosszabb csendben, ha utána ugyanazzal a kontextussal
  kell folytatni — de csak ezért nem ébredek fel feleslegesen.
- A vak ellenőr futtatóban (`gate:blind-review`) stabil előtag, csak hozzáfűzés, `cached_tokens` mérése és ≥ 80% cél a 2. körtől
  (lásd [[blind-bug-hunting-reviewer]]).
- A saját válaszaim tömörek; a hosszú háttér a fájlokban / jelentésekben marad, nem ismétlem.
