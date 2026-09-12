# Végrehajtás: lektori hatókör és forrásváltozat-kezelés

1. `source/server/studio/web-teaching-review.ts`
   - Adj opcionális `requestedTopic` bemenetet a bizonyíték-grounding
     ellenőrzéséhez.
   - A kért összehasonlítás felismerését és a tananyag látható
     változatjelölését kis, tesztelhető segédfüggvényekkel valósítsd meg.
   - A jelöletlen `source_coverage`/`source_conflict` hibajegyet kért
     összehasonlítás hiányában utasítsd el korrekciós hibával.
   - Erősítsd meg a lektori rendszerpromptban és az inputban, hogy a forrás
     mellékváltozata nem automatikus kötelezettség.
   - A meglévő forrás-, idézet-, bank- és negatív döntési szabályokat ne lazítsd.

2. `source/tests/lesson-teaching-quality.test.ts`
   - Teszteld, hogy a kért összehasonlítás nélküli jelöletlen variáns-konfliktus
     elutasított bizonyíték.
   - Teszteld, hogy a megnevezett Homérosz/Apollodórosz-változat összehasonlítása
     elfogadott bizonyíték lehet.
   - Teszteld, hogy a belső ellentmondást jelölő `factual_error` nem esik ki.

3. Ellenőrzés
   - Futtasd a célzott lektori és javítókör-teszteket.
   - Futtasd a lint/typecheck/verify legszűkebb szükséges körét.
   - Ellenőrizd a diffet és a valós lektori mérés naplóját; negatív döntést ne
     fordíts át pozitívra pusztán a teszt kedvéért.
   - Siker esetén atomi commit, CI, merge és deploy, majd éles revision- és
     böngésző-visszamérés.
