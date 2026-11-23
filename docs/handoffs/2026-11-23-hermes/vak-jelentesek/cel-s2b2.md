# Cél (tulajdonosi követelmény)

TGM S2b-2 (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 17. szakasz; végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`):
a forrás-ábrák megjelenítőinek (tábla, szabálydoboz, összehasonlító kártya; az S2b-1 óta döntési fa és képes kártya is) korábbi
vak-leleteinek javítása — görgetésjelző és táblacím helye, kontraszt a sávok tokenjeiből, a fejezet-kisfilm ne kínáljon / rajzoljon
forrás-ábrát, rövid tábla ne görögjön, nyomtatás, fejléc-illesztés újramérése. Megjelenítési változás, adatírás nélkül; a forrás-ábrák
élesben a `STUDIO_SOURCE_VISUALS` kapcsoló (KI) miatt nem keletkeznek.

Blokkoló az, ami a MÁR KIADOTT (forrás-ábra nélküli) leckék megjelenítését, a kisfilm lejátszását vagy gyártását megváltoztatja vagy
eltöri, illetve ami adatot ír / biztonsági határt sért. A forrás-ábrák megjelenítésének további szépítése jegyre megy.

Keress:
- a régi (nem forrás-ábra) `animate` blokkok megjelenítésének vagy kisfilm-ráúszásának változását;
- olyan CSS-változást, amely a forrás-ábrákon KÍVÜLI elemekre is hat (közös osztály, token, `@media print`);
- a kontraszt-őr olyan számítását, amely nem a tényleges CSS-értékekből dolgozik (a teszt saját magát igazolja);
- 360×640, 844×390, 1280×800 nézetben levágott szöveget, vízszintes oldalgörgetést;
- az S2b-1 új fajtáinál (döntési fa, képes kártya) a kisfilm-kizárás hiányát.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.
