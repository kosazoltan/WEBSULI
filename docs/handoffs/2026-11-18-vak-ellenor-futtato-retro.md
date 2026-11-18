# Retro — a vak ellenőr futtatója (2026-11-18)

Terv: `docs/specs/2026-11-18-vak-ellenor-deepseek.md`. Ág: `chore/vak-ellenor-deepseek`. Mért tények; a csapdaszámokat a
beolvasztáskor kell kiosztani (`docs/agent-csapdak.md` — az ágon nem nyúltunk hozzá).

## Mi ment rosszul, és mennyibe került

1. **Héj-idézés tönkretett egy közös fájlt.** Egy `node -e "…"` parancsba írt, backtick-et és `${…}`-t tartalmazó szöveget a bash
   parancs-helyettesítésként értelmezett; a `scripts/qa/gates/lib.mjs` szintaktikailag hibás lett. Költség: ~5 perc (a fájl
   visszaállítása a saját, még nem commitolt módosítás eldobásával, majd újraírás). **Javítás ebben a futásban:** minden további
   többsoros szerkesztés szkript-FÁJLBÓL ment (a szerkesztő eszközzel megírva, `node <fájl>`-lal futtatva), soha nem héj-idézetből.
2. **A push-audit hook a parancs SZÖVEGÉRE illeszt.** Egy `git commit`, amelynek a heredocja a „push” szót tartalmazta, a hook
   tiltásába futott (a parancs egyetlen lépése sem futott le). Költség: ~3 perc. **Javítás:** a commit-üzenet fájlból megy
   (`git commit -F`), a dokumentum-szöveg a szerkesztő eszközzel — ez a meglévő memória-szabály megerősítése.
3. **Az almappába tett tesztek nem futottak volna a CI-ben.** A CI és a kapuk a `scripts/qa/gates/*.test.mjs` mintát futtatják; a
   `scripts/qa/gates/blind-review/*.test.mjs` kimaradt volna (a szakasz-kapu 19 fájlt jelzett — ebből derült ki). **Javítás ebben a
   futásban:** `scripts/qa/gates/blind-review-all.test.mjs` belépő (beolvassa az almappa tesztjeit, és őr-teszttel ellenőrzi, hogy
   minden tesztfájl be van kötve) — a workflow módosítása nélkül.
4. **Öt mutáns átcsúszott az első körben** (54-ből): a teszt zöld maradt, mert egy MÁSIK védelem fogta meg ugyanazt az esetet (pl. az
   integrációs teszt tiltását a „nincs telepítve” ág, a kulcs-maszkolást az ismert kulcsminta). **Javítás:** a tesztek az elutasítás
   OKÁT is ellenőrzik (hibaüzenet), ismeretlen alakú kulccsal és üres valódi mappával is mérnek; második kör: 54 / 54.
5. **A kapu tiltott mintája megfogott egy hamis teszt-URL-t** (jelszavas adatbázis-URL alakú tesztérték). Költség: egy ~8 perces
   szakasz-kapu-kör. **Javítás:** a hamis érték futásidőben áll össze. Tanulság: a tiltott-minta lépés az elején fusson le
   (olcsó), ne a 8 perces tesztkör után derüljön ki — jegyre.
6. **A terv két kiegészítése a kód KÖZBEN érkezett** (modellcsere + géppel ellenőrzött leletek; prompt-gyorsítótár). A
   gyorsítótár tervfejezete a megvalósítás UTÁN került a tervbe (a terv ezt ki is mondja) — a háromfázisú rend sorrendje ott nem
   teljesült.
7. **Az olcsó modell a második fejen nem adott le jelentést:** háromszor a teljes kimeneti keretet (16 000 token) gondolkodásra
   költötte, eszközhívás nélkül. **Javítás ebben a futásban:** a futtató a kimeneti korláton megállt válaszra célzott emlékeztetőt
   küld („gondolkodj rövidebben, azonnal hívj eszközt”) — teszttel.

## Mit mértünk (a legfontosabb tanulság)

- A „kapun átment” ≠ „a cél teljesült”: a futtató minden kapuja zöld, a mért alapvonal mégis azt mutatja, hogy a konfigurált modell
  a referencia 9 közepes leletéből 1-et talált meg teljesen és 1-et részben, és azt a fejet, amelyre a referencia NEM-et adott,
  IGEN, FELTÉTELLEL ítélettel átengedte volna (`docs/minosegkapuk.md`, „Mért alapvonal”).
- A géppel igazolt hivatkozás nem igazolt következtetés: egy „futtatással igazolt” közepes lelet téves volt (a próba a függvényt
  elszigetelve hívta).
- A prompt-gyorsítótár működik: 96–97% találat a 2. hívástól; a futás 0,6 USD körüli (nélküle 3,6–5,2 USD lenne).

## Kanbanba / tulajdonosi döntésre

- A futtató képessége a böngészős és az adatbázisos út nélkül korlátozott — döntés: engedélyezzük-e (és hogyan, e-mail- és
  DB-biztonsággal) az eldobható adatbázisos és a böngészős futtatást az ellenőrnek.
- CI-szelet (GitHub-titok, költési keret, workflow-job, a PR-szöveg résének zárása).
- A tiltott-minta lépés előrehozása a szakasz-kapuban.
- A `docs/agent-csapdak.md` bejegyzései (1–5. pont) a beolvasztáskor.
