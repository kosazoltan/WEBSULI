# Magyar tananyag-betűk

Engedélyezett családok: **Nunito**, **Source Sans 3**, **Source Serif 4**.

| Betűcsalád | Tananyagbeli szerep |
| --- | --- |
| Nunito | 1–4. osztály: szöveg, címsor, feladat és vezérlő |
| Source Sans 3 | 5. osztálytól: szöveg, feladat és vezérlő; általános címsor |
| Source Serif 4 | 5. osztálytól: irodalmi, történelmi és nyelvi címsor |

A családválasztást a `shared/lesson-typography.ts` szabályozza. Normál és valódi
dőlt változat, tananyagban 400–800 vastagság használható. Kötelező próbasor:
**Árvíztűrő tükörfúrógép · ÁÉÍÓÖŐÚÜŰ áéíóöőúüű**. Az ő/ű nem helyettesíthető
õ/û karakterrel. A helytelenül kódolt szöveg külön javítást igényel.

Mindegyik normál és dőlt változata helyben található. A teljes eredeti karakterkészlet
megmaradt: nincs kizárólag alap-latin kivonat, nincs Google/CDN futásidejű függőség.
A betűk SIL Open Font License szerint használhatók; a három eredeti licenc mellékelve.

`manifest.json`: rögzített upstream revízió, letöltési URL, eredeti és WOFF2 SHA-256,
cmap-ellenőrzés és tényleges súlytartomány. A build nem tölti le őket újra.
Újragyártás: `python scripts/prepare-lesson-fonts.py` (`fonttools[woff]` szükséges).
A script meglévő manifest esetén ugyanazt a rögzített revíziót használja.

A források a Google Fonts hivatalos repo-jának `ofl/nunito`, `ofl/sourcesans3`,
`ofl/sourceserif4` mappái. A Source családok Adobe-tervezésűek. A családok neve
nem általános garancia minden más letöltésre: az ellenőrzés ezekre a fájlokra szól.
