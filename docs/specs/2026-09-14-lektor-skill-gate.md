# Lektor időkeret és 7.4 ellenőrző

## Cél és bizonyíték
- A helyi admin futásán 2026-09-14: lektor 541,9 s, `[xAI] Request timed out`, nincs tokenmérés. A Studio a createStudioProvider alapértékeit használja: 180 s / 24000 token / chat, explicit reasoning és SDK retry nélkül.
- Az OpenAI SDK dokumentációja szerint timeout után alapból két újrapróbálás van: ez magyarázza a közel 3 × 180 s időt. Az xAI dokumentáció szerint az alap reasoning high; low Responses beállítás támogatott. A szolgáltató belső késésének pontos oka UNKNOWN; bőbeszédű válaszra nincs bizonyíték.
- A web-teaching-review külön útvonal; annak beállítása nem javítja a Studio lektorát.

## Megvalósítás
- Lektorhoz közös, explicit provider-politika: 480 s teljes felső időkeret, 12000 output token, xAI Responses low, nulla rejtett SDK retry. A többi lépés maradjon változatlan.
- Rövid, kizárólag hibajegyes lektorválasz, teljes bemeneti tanítás és forrás megőrzésével. A minőségkövetelmények nem csökkenhetnek.
- Verziózott 7.4 ellenőrző: bankminimum/módszerek/körméret, saját minta=1, üres=0, nyelvi feltételek; a meglévő séma-, forrásfedettség-, felépítés- és HTML-ellenőrzőket nem helyettesíti, hanem kiegészíti. Studio végkapu és javítás, valamint HTML végellenőrzés ugyanazt a közös ellenőrzőt használja.
- A futási RUNBOOK felsorolja a kötelező ellenőrzéseket, elkülönítve a determinisztikus kaput, független lektort és böngészős kiadási bizonyítékot. Statikus ellenőrzés nem állíthat render-sikert.

## Nem-cél / kockázat
Nincs authmódosítás, forrás- vagy tesztgyengítés, éles deploy, korábbi adatok tömeges újraírása. Más munkafa-módosítás érintetlen. Megállt futás újrapróbálása előtt a mentett eredményt és folyamatállapotot ellenőrizni kell; nem indítunk vakon teljes újragyártást.

## Elfogadás (EARS)
- Ha a lektor hívást kap, explicit határidőt kap; lejárt/megszakított hívás nem eredményez publikálást.
- Ha a bank bármely 7.4 gépi követelményt sért, a közös ellenőrző hibát ad, a végkapu nem jelez PASS-t.
- Ha a lektor vagy kapu hibázik, a kész tanítás/bank és a konkrét hiba megmarad.
- Új regressziók, érintett tesztek, typecheck és lint PASS; külön jelölendő, ha a fizetős szolgáltatói vagy böngészős próba nem futott.

Forrás: https://github.com/openai/openai-node#retries és #timeouts; https://docs.x.ai/docs/guides/reasoning; docs/lesson-improvement.md; .agents/skills/tananyag-keszito/SKILL.md.

## Ellenőrzött kapcsolódó folytatási hiba
A fail() step=error állapotot ment, de a resume csak drive()-ot hív, amely terminális jobon nem dolgozik. Minimális korrekció: kizárólag explicit resume és a workflow tulajdonosi/lease ellenőrzése után, mentett leckés lektor-timeoutnál lektorra visszaállítás. Teljes output és korábbi hiba megőrzése; nincs új bankgenerálás. Blokkoló tartalmi hiba, más hibafajta, kész vagy futó job nem állítható át ezzel. Az upload progress valós kész/error eredményt kap, régi hiba a workflow előzményében megmarad.

Valós, adatbázisírás nélküli provider próba: 2026-09-14 14:27 UTC, mentett 45 feladat/80 kvíz, 22053 ms, 0 blokkoló, következő lépés gate, skill74=true, eredeti job változatlan. Mentés és teljes report a tmp/lektor-policy-probe alatt. A lektor-profile hatását ez igazolja, nem jelent még publikálást.

Review-kor igazolt szélső esetek: SDK AbortSignal timeoutját szabványos timeout okra normalizáljuk (kézi abortot nem); OpenRouter is kap maxRetries-t. DB-ről olvasott progress visszakerül a memóriatárba, különben újraindítás után a frissítés no-op. A lektor bizonyított infrastruktúra-timeoutja nem számít teljes tartalmi lektori körnek; a három tartalmi kör és négy explicit végrehajtás korlát változatlan. Minden hibás próbálkozás megmarad a naplóban.