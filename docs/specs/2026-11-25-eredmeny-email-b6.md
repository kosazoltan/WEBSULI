# B6 — leállításkori ürítés az eredménylevelekre (eredménylevél-bontás)

> Dátum: 2026-11-25 · Tulajdonosi döntés (űrlap, 2026-11-25): B5b, utána B6–B8. · Előzmény: `docs/specs/2026-11-22-eredmeny-email-bontas.md`
> (B6 sor: R14, R33, R41), a #510 terve (`docs/specs/2026-11-17-eredmeny-email-kviz.md`, a `fix/eredmeny-email-kviz` ágon).

## Probléma
A „félbehagyva” pillanatkép 15 percig memóriában vár; a bukott küldés 60 s-os halasztott újrapróbája szintén csak időzítő. A Render minden
telepítéskor (naponta többször) SIGTERM-mel állítja le a példányt: a várakozó és a halasztott levél ilyenkor nyomtalanul elvész, a küldés
alatt álló pedig a pool lezárásakor szakad meg. A leállítás ürítései (régi anyagok eredményei 10 s, új-lecke értesítők 15 s) ráadásul
egymás után futnak.

## Döntések
1. **R14:** leállításkor a várakozó pillanatképek a késleltetés kivárása nélkül, a szokott kapun (kör-zár + véglegesítés-ellenőrzés +
   változat) át azonnal küldődnek. Ára (vállalt, #510 R14): a 15 percnél korábbi „félbehagyva” levél — ha a tanuló mégis befejezi, a
   végleges levél a felülíró mondattal megy (R1).
2. **R41:** a küldés alatt álló kísérletek (végleges és „félbehagyva”) nyilvántartottak; a halasztott újrapróbák (60 s) időzítője
   törlődik, és azonnal lefutnak — ugyanazon a kapun. Az ürítés alatt keletkező újrapróba és pillanatkép azonnal fut (nincs új várakozás).
3. **Határidő:** az eredménylevél-ürítés legfeljebb 15 s; utána a leállás folytatódik, a még függő levél száma naplózva (elvész).
4. **R33:** a pool lezárása előtti ürítések (régi anyagok eredményei 10 s, új-lecke értesítők 15 s, eredménylevelek 15 s) PÁRHUZAMOSAN
   indulnak (`server/shutdown-flush.ts`, `runShutdownFlushes`), mindegyik a saját korlátja és a 295 s-os kényszerleállításig hátralévő
   idő (10 s tartalékkal) közül a kisebbikig vár; egyik hibája nem akasztja meg a többit.
5. Több példány közti kizárás továbbra is példányon belüli (kanban #135, változatlan vállalt korlát).

## Elfogadás (EARS)
- AMIKOR leállítás indul ÉS pillanatkép vár, A RENDSZER a pool lezárása előtt elküldi a „félbehagyva” levelet (E29).
- AMIKOR leállítás indul ÉS halasztott újrapróba vár, A RENDSZER azonnal lefuttatja (véglegesített körre nem küld).
- AMIKOR leállításkor küldés van folyamatban, A RENDSZER a határidőig megvárja.
- AMIKOR a küldés a határidőn túl is függ, A RENDSZER a határidő után visszatér (a függők számával).
- AMIKOR az egyik ürítés hibázik, A RENDSZER a többit nem akasztja meg (E49).

## Visszavonás
Revert; a kapcsolók (RESULT_PARTIAL_EMAIL) változatlanok.
