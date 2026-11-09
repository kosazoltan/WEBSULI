# Magyar tananyag-betűk

Spec 2026-11-09-lecke-betucsere (a 2026-10-16-os Websuli Design fontválasztását váltja): a tananyagban
**Atkinson Hyperlegible Next** (1–5. osztály) és **Figtree** (0. és 6–12. osztály) — törzsszöveg, címsor, feladat és vezérlő
ugyanabból a családból; tartalék: Noto Sans, majd rendszer sans-serif. A Stúdió felülete is Figtree.

| Betűcsalád | Szerep |
| --- | --- |
| Atkinson Hyperlegible Next | tananyag, 1–5. osztály |
| Figtree | tananyag, 0. (programozás) és 6–12. osztály; Stúdió-felület |
| Nunito Sans, Inter | a 2026-11-09 előtti tananyagcsaládok; régi tartalom miatt helyben maradnak |
| Nunito, Source Sans 3, Source Serif 4 | korábbi családok; az alkalmazás más részei miatt helyben maradnak |

A családválasztást a `shared/lesson-typography.ts` szabályozza. Normál és valódi
dőlt változat, tananyagban 400–800 vastagság használható. Kötelező próbasor:
**Árvíztűrő tükörfúrógép · ÁÉÍÓÖŐÚÜŰ áéíóöőúüű**. Az ő/ű nem helyettesíthető
õ/û karakterrel. A helytelenül kódolt szöveg külön javítást igényel.

A teljes magyar ábécé előre összetett (NFC) alakja minden családban kötelezően ellenőrzött. A kombinálható
ékezetjelek (U+0301, U+0308, U+030B) fedettségét a manifest rögzíti (az Atkinson Hyperlegible Next és a Figtree
mindhármat tartalmazza); a régi Interből az U+030B hiányzik, ezért a lecke
szövege megjelenítéskor NFC-re normalizált (`nfcDeep`, `withLessonTypography`) — így az ő/ű mindig a saját font glifája.

Mindegyik normál és dőlt változata helyben található. A teljes eredeti karakterkészlet
megmaradt: nincs kizárólag alap-latin kivonat, nincs Google/CDN futásidejű függőség.
A betűk SIL Open Font License szerint használhatók; az eredeti licencek mellékelve.

`manifest.json`: rögzített upstream revízió, letöltési URL, eredeti és WOFF2 SHA-256,
cmap-ellenőrzés és tényleges súlytartomány. A build nem tölti le őket újra.
Újragyártás: `python scripts/prepare-lesson-fonts.py` (`fonttools[woff]` szükséges).
A script meglévő manifest esetén ugyanazt a rögzített revíziót használja.

A források a Google Fonts hivatalos repo-jának `ofl/nunito`, `ofl/sourcesans3`,
`ofl/sourceserif4`, `ofl/nunitosans`, `ofl/inter`, `ofl/atkinsonhyperlegiblenext` és `ofl/figtree` mappái. A script a manifest szerint már ellenőrzött,
bájtra egyező családot nem tölti le és nem kódolja újra. A Source családok Adobe-tervezésűek. A családok neve
nem általános garancia minden más letöltésre: az ellenőrzés ezekre a fájlokra szól.
