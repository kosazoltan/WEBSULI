# Magyar tananyag-betűk

Engedélyezett családok: **Nunito**, **Source Sans 3**, **Source Serif 4**.
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
