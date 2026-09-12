# Futó Websuli saját tudásrendszere

## Cél és ellenőrzött alap
Az előző munkamenet PR #60 kiadásának folytatása; a futó tanulási rendszer saját identitása, runbookja, kereshető módszertára, bizonyítékos memóriája és javítási táblája. A jelenlegi kód már DB-ben tárolja az auditot és a tulajdonosonkénti tapasztalatot, de a két éles tábla a mostani csak olvasási ellenőrzéskor még hiányzik. A keresett fiók egyértelműen azonosítva, admin=true, banned=false; jogosultságírás nem szükséges.

## Hatókör
`source/shared/lesson-skill.ts`, új `source/shared/runtime-knowledge.ts`, `source/server/workflows/{learning,engine,routes}.ts`, célzott unit és DB/HTTP tesztek, működési dokumentáció. A meglévő 0020 migráció használható; új tábla nem szükséges. A runtime saját DB-tárából épülnek a dokumentumok, nem a fejlesztő gépének memóriájából.

## Döntések és nem-célok
QMD: alkalmazáson belüli kereshető módszerindex; IAM: identitás és hozzáférési határ; Cogni: mért megfigyelések és korlátozott következtetések. Ezek belső modulok, nem ellenőrizetlen külső termékintegrációk. Kanban: a tartós megfigyelésekből származtatott javítási munkalista. SOUL.md, IAM.md, RUNBOOK.md, QMD.md, COGNI.md, MEMORY.md, KANBAN.md és SKILL.md lekérhető a futó alkalmazásból. Új futás a verziózott alaputasítást és tanult szabályokat automatikusan használja; régi folytatás változatlan prompttal fut.

Nincs modell-súlytanítás, szabad programkód-generálás/telepítés vagy jogosultságváltoztatás a tanuló workerből. Ismeretlen hiba nem válik bizonyíték nélkül végrehajtandó utasítássá. A promptinjekció felismerése védekező jelzés, nem teljes biztonsági garancia. Nem újrajavítjuk a korábban már lezárt kvízperzisztencia-fejlesztést.

## Edge case-ek és elfogadás
- WHEN új futás indul THEN identitást, az adott mód kötelező lépéssorát és forrás/utasítás határt kap a tényleges modellpromptban.
- WHEN régi snapshot folytatódik THEN nem kap új runtime-utasítást és cache-azonosítót.
- WHEN admin lekéri saját tudástárát THEN saját bizonyítékos tapasztalatait, kereshető indexét és determinisztikus dokumentumait kapja; más tulajdonos adata nem jelenhet meg.
- WHEN nincs tapasztalat THEN az alapmódszer és runbook akkor is rendelkezésre áll.
- WHEN ismert promptinjekciós hibajelzés érkezik THEN csak karbantartott védekező szabály és ujjlenyomat tárolódik; nyers támadó szöveg nem.
- WHEN számlálóban sikeres futás szerepel THEN azt nem nevezzük bizonyított hibaarány-csökkenésnek vagy lezárt javításnak.
- PASS célzott tesztek, típusok, teljes verify és izolált DB/HTTP teszt; kiadás előtt visszaállási pont és aktív futások ellenőrzése, utána éles visszaolvasás.

## Kiadási kockázat
Az előző kiadás additív táblákat és auditpótló workert aktivál. Biztonsági mentés és korábbi revision rögzítése szükséges. Nem írunk át meglévő tananyagot. A teljes feltöltési böngészőpróba korábbi fájlátadási akadálya külön fennmaradó elfogadási pont.
