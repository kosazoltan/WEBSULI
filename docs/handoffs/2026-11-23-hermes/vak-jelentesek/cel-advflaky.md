# Cél (tulajdonosi követelmény)

Az adventi végpontok DB-integrációs tesztjének („legrosszabb eset egy alanytól …”) véletlenszerű bukása megszűnjön úgy, hogy a teszt
mércéje NEM gyengül: a végleg hibás (3 rossz válasz) ablakra küldött ÚJ válasz továbbra is 409. A bukás oka: a rögzített „g09-math-001”
néha éppen az ablak egyik kérdése volt, amelyre a szerver idempotens ismétlésként 200-at ad.

Keress:
- hogy a változás gyengíti-e a mércét (pl. olyan kérdést küld, amelyre a 409 más okból jön, és így a „végleg hibás ablak” szabálya nem
  mérődik);
- maradt-e más sorsolásfüggő (nem determinisztikus) állítás ugyanebben a tesztfájlban, ugyanebből a hibaosztályból;
- hogy a választott kérdés biztosan nem a kör része-e (a `seen` halmaz teljessége);
- hogy a szerver idempotens ismétlése valóban szándékos viselkedés-e (a terv / meglévő tesztek szerint).

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.
