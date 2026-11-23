# Cél (tulajdonosi követelmény)

Arányos helyi kapuk (terv: `docs/specs/2026-11-23-aranyos-kapuk.md`, végrehajtás: `…-vegrehajtas.md`). A tulajdonos 2026-11-23-án: a
kis javítás (legfeljebb 30 sor ÉLES kód; teszt és dokumentáció nem számít) ne kérjen fizetős ellenőri kört; a helyi push-kapu csak a
kapcsolódó teszteket futtassa — a teljes készletet a GitHub CI lefuttatja. Az ítélet-átvitel (A7) az 1. kör után KIKERÜLT ebből a
szeletből (külön szelet lesz).

Blokkoló az, ami a kaput a szándékon TÚL GYENGÍTI vagy megkerülhetővé teszi:
- olyan változás minősül kis javításnak, amely kaput, CI-t, ügynök-beállítást, skillt, sémát / migrációt, `package.json`-t, `render.yaml`-t
  vagy bináris éles fájlt érint; a sorszámítás kijátszható (átnevezés, tabulátoros út, a teszt- / dokumentáció-kizárás túl tág mintája);
- a merge-kapu a helyi (hamisítható) adatra támaszkodik a GitHub adata helyett; egy `NEM` ítélet átvihető vagy figyelmen kívül marad;
- a push-kapu célzott módja olyan változásnál marad célzott, ahol a teljes készlet indokolt (közös modul, leképezetlen fájl), vagy nem
  futtatja az őr-teszteket;
- a PR-kapu egy RÉGI (más fejre szóló vagy bukott) push-bizonyítékra hivatkozva hagy ki lépést, vagy kihagyja a friss main (C-61) ellenőrzését;
- a DB-teszt szűkítése miatt olyan változás marad DB-teszt nélkül, amely a tárolási réteget érinti.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.
