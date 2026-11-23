# Cél (tulajdonosi követelmény)

Bontás B1a (`docs/specs/2026-11-22-eredmeny-email-bontas.md`, 4.1 táblázat): a szerver ELFOGADJA a kör kezdetét (`startedAt`, mindkét fajta)
és az utolsó kvízválasz idejét (`lastAnsweredAt`, kvíz) opcionális mezőként, és az eredménylevél dátumsort kap magyar idő szerint
(„Beküldve: …”; „A kör kezdete: …” csak hihető — múltbeli, legfeljebb 400 napos — értékkel). A régi kliens (a mezők nélkül) működése
bájtra változatlan maradjon, a séma szigorú maradjon. A kliens ebben a PR-ban NEM változik.

Keress:
- olyan bemenetet, amely a régi kliens kérését eddig elfogadta, most nem (regresszió), vagy amely a szigorúságot gyengíti;
- időzóna / nyári időszámítás / dátumhatár hibát a `formatBudapest`-ben;
- HTML-injekciót vagy hamis dátumot a levélben (kliens által küldött `startedAt`);
- a levél tárgyának vagy a meglévő sorainak (tanuló, évfolyam, eredmény) véletlen változását;
- hogy a `meta` átadása más folyamatot (gyakorlókör, `sendLessonResult` más hívói) érint-e.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.
