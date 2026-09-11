# Kiadás: közvetlen API és fogalomazonosító-javítás

További review-elfogadás: az OCR és scope a közös modellalapú kapcsolatot használja, saját kulcs hiányakor nem küld más szolgáltatónak kérést. OpenRouter reasoning mező csak OpenRouterhez kerül. A fallback nélküli author hiba is megőrzi a szolgáltatói okot. Render XAI deklarációt regressziós teszt védi. OCR-modellek nem változnak.

Review-kiegészítés: a célzott fogalomjavítás induláskor mind az author, mind a lektor konfigurációját ellenőrizze. Hiányzó kulcs esetén adatbázis-hozzáférés és fizetős modellhívás nélkül térjen vissza hibával. Érintett: step-runner.ts és lesson-pipeline-runner.test.ts; külön regresszió az author és a lektor hiányára.

Cél: a helyi javítások PR, zöld CI, merge és élesítés útján kerüljenek a websuli.vip szolgáltatásba. Nem-cél: tananyagok tömeges újragenerálása vagy migrációs változtatás.

Kiadás előtti alapverzió: 5b23efec23e7670745aa3afb9ca19ff6477329e1. A visszaállási pont ez a commit és a szolgáltató előző működő deployja. A Render ENV változtatás előtt a módosítandó kulcsok régi állapotát helyi, Gitből kizárt, Windows felhasználóhoz kötötten titkosított mentés őrzi. A többi ENV nem módosítható. Kulcsérték nem kerül naplóba. Aktív generálás esetén várni kell.

Elfogadás: verify PASS, PR CI PASS, merge SHA ismert; frontend Production success és backend health ugyanazon SHA; saját OpenAI/xAI kulcsok beállítva, modellhívások igazoltak. Nincs új adatbázis-migráció ebben a diffben. Éles teljes tananyaggyártás ettől külön bizonyíték.
