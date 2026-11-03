# Új leckék automatikus, tartalomhoz illő borítója (B)

Előzmény: `docs/specs/2026-11-03-leckeborito.md` (A — a meglévő leckék kézi, katalógusos borítója, PR #382).
**Tulajdonosi jóváhagyás (2026-11-03, a szülő munkameneten át, szó szerint):** „az új leckék automatikus borítójára engedélyezem az
ötcentes költséget képenként.” Keretek: Haiku-képterv, Seedream-kép, ≈ 0,05 USD/kép, azonos tartalomnál újrahasznosítás, napi plafon,
csak az `art.picture` írható, vészfék env-kapcsolóval, a `json` többi része változatlan (hash-ellenőrzés).

## Cél
- Az a **publikált** lecke, amelynek nincs saját (katalógusos vagy már gyártott) borítója, automatikusan kap egy tartalmához illő,
  évfolyamhoz hangolt képet — ugyanazon szabályokkal, mint az (A) kézi képtervei.

## Működés (`server/lesson-covers.ts`)
1. **Söprés** (háttérfolyamat, csak `NODE_ENV=production`, `OPENROUTER_API_KEY` mellett, nem E2E-ben): induláskor 2 perc múlva, majd
   10 percenként. Sorban, egyszerre egy kulcs.
2. **Célpont:** publikált lecke, amelyre a mentéskori szabály (`computeLessonArt`, a mostani `art.picture` mint kézi pin) a tartalomkulcs
   borítóját választaná, ha az létezne — tehát nincs kurált kulcsszavas borítója (Antigoné), nincs katalógusos vagy kézi leckeborítója.
   Az Antigoné-anyag (`7900a871…`) ezen felül is kimarad. Azonos tartalomkulcsú leckék egy képet kapnak.
3. **Képterv:** OpenRouter `anthropic/claude-haiku-5.5`, a lecke kivonatából (cím, tantárgy, évfolyam, ≤ 10 fejezetcím, a tanítószöveg
   eleje ≤ 450 karakter), az (A) képtervírási szabályaival (konkrét jelenet a lecke tárgyából, évfolyam-hangulat, felirat / szám / betű /
   valós arc / erőszak / márka tilos). JSON: angol jelenet + magyar `alt`.
4. **Kép:** Seedream 5.0 Pro, 1K, 3:2; a prompt a katalógussal azonos `KIND_COVER` + `BAND_*` + `COMMON` stílussorral (a teszt őrzi az
   egyezést a `design-assets/style.md`-vel).
5. **Minőségkapu:** ugyanaz a Haiku-modell a képpel: felirat / ijesztő elem / egyezés a tervvel. Bukásnál egy új kép; két bukás → a
   kulcs aznap kimarad (a lecke a mai képét tartja).
6. **Tárolás:** `design_assets` sor (`id` = tartalomkulcs, `kind: cover`, a lecke sávja, `mime: image/jpeg`, `origin` „MI-generált,
   saját (Seedream 5.0 Pro, automatikus leckeborító)”), ütközésnél nem ír felül. A verziókezelt katalógusba nem kerül.
7. **Összekötés — csak `art.picture`:** leckénként külön tranzakcióban `SELECT … FOR UPDATE`; ha a cím / tantárgy / évfolyam vagy a
   tárolt `art.picture` azóta változott, vagy a leckének nincs `art`-ja (review #382: csak `picture`-ös `art` mellett a lejátszó nem
   pótolná a kabalát és az ikont), kihagyja; `jsonb_set(json, '{art}', art || {"picture": id})`, majd az `art` nélküli kanonikus
   hash és az `art` többi mezőjének ellenőrzése (a kézi cseréjével közös `verifyPinned`); eltérés → ROLLBACK.

8. **Review #384:** a kör Postgres advisory lock alatt fut (`pg_try_advisory_lock`; foglalt zárnál — másik példány — kimarad), így a
   napi keret példányok között is pontos; a beolvasott lecke tartalomkulcsát a képterv előtt újra ellenőrzi (közben átnevezett lecke
   tartalma nem kerülhet a régi kulcs alá).
9. **Főoldali lista:** összekötés után a saját folyamatban üríti a `HtmlFilesCache`-t (5 perces TTL), hogy a `cover` mező azonnal
   frissüljön (a kézi szkriptes csere után a lista legkésőbb a TTL lejártával frissül).

## Megjelenítés és mentés
- `resolveStoredArt`: a katalógusban nem szereplő `cover-l-*` (adatbázisban gyártott) borítót akkor fogadja el, ha az a lecke mostani
  tartalomkulcsa; a kép a `/api/design-assets/<id>` végpontról jön, hibánál a katalógus szerinti kép statikus fájlja.
- `computeLessonArt`: kurált kulcsszavas borító híján a táblában meglévő tartalomkulcsú borító nyer (vázlatmásolat, újramentés);
  a gyártott kép kézi pinként is megmarad, amíg a tartalomkulcs ugyanaz.

## Költség és plafon
- Képenként ≈ 0,045 USD (1K) + 2 Haiku-hívás (≈ 0,001 USD) ≈ **0,05 USD**; újrahasznosításnál 0.
- **Napi plafon:** `LESSON_COVER_DAILY_LIMIT` (alap **20** kép/nap ≈ 1 USD/nap), a mai napon (UTC) beszúrt automatikus sorok
  száma alapján (újraindítás nem nullázza). A fizetős képhívások száma folyamatonként és naponta legfeljebb a plafon kétszerese
  (a minőségkapu újragenerálása miatt); a sikertelen kulcs aznap nem kerül újra sorra.
- **Vészfék:** `LESSON_COVERS=0` → a háttérfolyamat nem indul (újraindítás után). Kulcs nélkül sem fut.

## Nem-cél
- Vázlatok (nem publikált leckék) — publikálás után a következő söprés pótolja.
- A meglévő 210 kézi borító cseréje; a katalógus módosítása; WebP-konverzió a szerveren.

## Edge case-ek
- Átnevezett lecke gyártott borítóval: a tartalomkulcs változik → a régi kép nem illik, a söprés újat gyárt (új költség).
- Párhuzamos lecke-írás az összekötés közben: `FOR UPDATE` + feltétel + hash-ellenőrzés → a sor kimarad vagy ROLLBACK.
- Függőben lévő Tananyagjavító-javítás: az `art.picture` írása a javítás alapállapot-hash-ét érvényteleníti (a javítás „elavult”-ra
  fut, újra kell készíteni). Az összekötés publikálás után egyszer történik, így ritka; dokumentált kockázat.
- OpenRouter-hiba / 429 / üres válasz → a kulcs aznap kimarad, naplózva; a lecke a mai képét tartja.
- Több Render-példány: a beszúrás `ON CONFLICT DO NOTHING`, a plafon a táblából számol.

## Elfogadás (EARS)
- HA a lecke publikált, nincs saját borítója és a plafon nem fogyott el, AKKOR a söprés egy képet gyárt és CSAK az `art.picture`-t írja
  (az `art` nélküli hash egyezik).
- HA a minőségkapu kétszer bukik, AKKOR nincs beszúrás és nincs lecke-írás.
- HA a napi plafon elfogyott, vagy `LESSON_COVERS=0`, vagy nincs kulcs, AKKOR nincs fizetős hívás.
- HA a lecke kulcsszavas (Antigoné) vagy katalógusos / kézi leckeborítós, vagy vázlat, AKKOR nem célpont.
- HA két publikált lecke tartalomkulcsa azonos, AKKOR egy kép készül és mindkettő azt kapja.
- HA az összekötés közben a lecke címe vagy `art.picture`-je változott, AKKOR az a sor nem íródik.
- HA a lejátszó a gyártott (katalógusban nem szereplő) borítót kapja és az a lecke kulcsa, AKKOR azt mutatja; más kulcsnál nem.
- HA `npm test`, `tsc` (app + teszt), `eslint --max-warnings 0`, `npm run build`, AKKOR zöld; a védett-írás ellenőrzés engedélylistáján
  az új írás „scheduled” kategóriával, indoklással szerepel.
