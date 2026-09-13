# Elavult internetes tananyag minőségjelzése

## Cél

A nyilvános HTML-előnézet egyértelműen különítse el a korábban eltárolt,
v7.4-4 előtti vagy szerkezetileg hibás internetes jelöltet az ellenőrzött új
kiadástól. A régi tartalom olvasható maradjon, de ne látszódjon kész,
ellenőrzött WebSuli-anyagként.

## Nem cél

- Nem írunk kézzel új Trója-tananyagot.
- Nem nyitunk meg vagy másolunk külső forrásszöveget.
- Nem törlünk régi tananyagot, eredményt vagy adatbázisrekordot.
- Nem lazítjuk a webes készítés 7.4-es kapuit.

## Ellenőrzött előállapot

- A vizsgált előnézeti jelölt `fusion-7.4-2`.
- A beágyazott bank 17 szöveges és 34 kvíztételű, a köre 5/10.
- A jelenlegi `verifyLessonMethodHtml` ezt elutasítja: hiányzik a 45/75 minimum,
  a `sorting` módszer, két kapukérdés és a 15/25-ös kör.

## Érintett fájlok

- `source/server/lib/web-lesson-quality-notice.ts`: determinisztikus státusz és
  statikus, biztonságos előnézeti jelzés.
- `source/server/routes.ts`: jelzés behelyezése a `/dev/:id` HTML-előnézetbe.
- `source/tests/web-lesson-quality-notice.test.ts`: régi, hibás és érvényes
  HTML-regressziók.

## Rögzített döntések és edge case-ek

1. Beágyazott WebSuli JSON nélküli régi HTML nem kap fúziós minőségjelzést.
2. `fusion-7.4-4` és sikeres teljes ellenőrzés esetén nincs jelzés.
3. Régi módszerverzió vagy bármely hibás fúziós jelölt esetén jelzés jelenik
   meg, de a tartalom és a tanulói eredmény változatlan marad.
4. A jelzés nem ír ki belső lektori diagnosztikát, URL-t, tokent vagy forrásszöveget.
5. Az új webes publikáció kapuja továbbra is a meglévő `checkedResearchArtifact`
   és `verifyLessonMethodHtml`; ez a változtatás nem kerülőút.

## EARS-elfogadás

- **Amikor** egy előnézet régi vagy hibás fúziós HTML-t tartalmaz, **akkor** a
  tananyag elején látható, magyar minőségjelzés közli, hogy az anyag nem
  ellenőrzött új kiadás.
- **Amikor** az előnézet `fusion-7.4-4` és minden kapu sikeres, **akkor** a
  tanulói tartalom változatlanul, figyelmeztetés nélkül jelenik meg.
- **Amikor** a tartalom nem fúziós HTML, **akkor** az eddigi megjelenítés marad.
- **Amikor** az új internetes publikáció hiányos bankot ad, **akkor** a
  publikáció továbbra is hibával áll meg, és nem hoz létre új anyagot.

