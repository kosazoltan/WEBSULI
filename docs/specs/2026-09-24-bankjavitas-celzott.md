# Spec — Célzott bankjavítás közös fogalmú fejezeteknél (2026-09-24)

## Háttér (mért, élő futás 67a05970, bankmodell gpt-5.6-luna)

A bank-ellenőr 9 hibát jelzett; a csak-bank javító kör után 91 (!) tétel volt új, bennük 13 új hiba; a 2. kör
után 101 új tétel, 7 hiba — a hurok nem konvergált, a lecke 7 ismert hibával, figyelmeztetéssel jelent meg.
Visszajátszás a job checkpointjával és a futás skill-pillanatképével (`withPreparationSkill`): a `validate()`
minden előző csomagon hibátlan, de a 0., 2., 4. fejezet csomagja olyan kifogást is kapott, amelynek tétele nem
benne van (`idsKnown=false`) — a kifogás FOGALOM szerint jutott el minden olyan csomaghoz, amely ugyanazt a
fogalmat tanítja. Ilyenkor a célzott javítómód (`reviewBase`) kiesik, és a teljes csomag újraépül.

## Cél

A kifogás csak ahhoz a csomaghoz menjen, amelyben a kifogásolt tétel ténylegesen van; ott célzott (ID szerinti)
javítás történjen, a többi tétel változatlan maradjon.

## Nem-cél

A csomagépítés, a validátorok, a javítási körök számának módosítása.

## Viselkedés / elfogadás (EARS)

- HA egy kifogás tétele egy csomag előző változatában szerepel, AKKOR csak az a csomag kapja meg, célzott
  javítómódban; a többi csomag tétele (azonosító és hash nélkül) változatlan.
- HA a tétel egyik csomagban sem szerepel, AKKOR a korábbi fogalom szerinti szétosztás érvényes.
- HA a kifogás fogalma sehol nem tanított, AKKOR minden csomag megkapja (a meglévő „nem veszhet el” szabály).
- Új teszt: `tests/lesson-experience.test.ts` („élő futás 67a05970 …”) — előbb bukott, a javítás után zöld;
  a valódi leckén a visszajátszás 5/5 célzott módot mutat (előtte 2/5).
