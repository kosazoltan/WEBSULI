# Kézi revízió-lelet lezárása (revizio.py `lelet-zar`)

## Probléma
A `revizio.py ellenoriz` csak az automatikus (`auto:`) leleteket zárja le („megszunt”), a `lelet-add`-dal felvett kézi leletek (`kezi:` kulcs) örökké nyitottak maradnak — akkor is, ha a javítás beolvadt és élesben van (pl. W1, D1-HIBRID, K-068). A nyitott-lelet összesítő ezért hamisan magas.

## Döntés
Új parancs: `lelet-zar <id> --evidence E [--status megoldva|elvetve]`.
- Csak nyitott lelet zárható; a bizonyíték kötelező, maszkolva fűződik a meglévő `evidence` mezőhöz („| lezárva: …”), a `last_seen` frissül.
- Alapértelmezett új állapot: `megoldva`; `elvetve` téves leletre.
- Nem létező vagy már zárt lelet → hibaüzenet, nincs írás (kilépési kód 1).

## Elfogadás
- [ ] nyitott kézi lelet lezárható, a bizonyíték maszkolva rögzül, az összesítőből kikerül;
- [ ] zárt / nem létező lelet nem módosul, a parancs hibával lép ki;
- [ ] bizonyíték nélkül az argparse elutasítja.
