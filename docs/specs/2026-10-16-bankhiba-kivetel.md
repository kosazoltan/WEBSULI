# Lektor bankhibái: kivétel a kapunál, nem csak-bank újragyártás (terv, 2026-10-16)

## Mért hiba (élő, job `61977256` „Medve Szabadtéri Csapatverseny”, 2026-10-16 09:27–09:42, napló)
- **Bankgyártás:** csomagonként 3 kísérlet, majd tartalékmodell, majd mentőkör. A válaszkulcs-teszt a fordított vagy tagadó hibás választ teljes pontra engedi: a szózsák-pontozó a sorrendet nem látja. A javítás ezt nem tudja megoldani.
- **Lektor:** „Bank-ellenőr: 171 tétel, 11 hiba” → „Bank-only lektor javító kör: 26 tétel”.
  - A teljes csomagok újragyártódnak.
  - Sémahibán buknak: „tasks: Array must contain at least 12 element(s)”, „quiz: … at least 20”.
  - Az idegen-tétel cseréje figyelmen kívül marad, a kötelező csoport törlését a program elutasítja.
  - Újabb tartalék- és mentőkörök következnek. A tulajdonos szerint az ellenőrzés „folyamatosan visszadobálja”.
- **A tulajdonos „mind a három elindult” észlelése:** a napló szerint csak EGY `continue` kérés volt (09:27:43). A másik két job `author/ok`, workflow `waiting`.
  A felület a tervre váró tételt „aktív” (forgó ikonos) szakaszjelzővel mutatta — ez félrevezető felületi hiba.

## Döntés (meglévő tulajdonosi döntés alkalmazása)
Tételgyár T1, D1: **„kivétel javítás helyett”.**
- A kapu ezt már tudja: a kivételre jelölt banktételt kiveszi (`resolveChoiceGate`), a padlót tartalékból vagy célzott javítással tartja.
- A kivett tételre mutató lektor-blokkolót megoldottnak tekinti (`removedItems`).
- A lektor utáni csak-bank újragyártás ezért felesleges és káros kör.

## Cél
1. Ha a lektor (bank-ellenőrrel együtt) MINDEN blokkolója kivehető banktétel (`splitLimitBlockers`: nincs tényhiba és nincs tanítási hiány):
   - a tételek `origin: "limit"` jelöléssel a `choiceFlags`-be kerülnek;
   - a futás a KAPUHOZ megy (nem csak-bank kör, nem szerzői újraírás).
2. A régi viselkedés a `STUDIO_BANK_ONLY_REPAIR=1` kapcsolóval visszakapcsolható (vészfék).
3. Felület: a tervre váró tétel szakaszjelzője „várakozik” (nem forgó, nem aktív).

## Nem-cél
- A bankgyártás csomagonkénti próbálkozásai nem változnak.
- A tanítási tényhiba útja nem változik: célzott szerzői javítás, és tényhiba soha nem publikálható.

## Elfogadás (EARS)
- K1: HA minden lektor-blokkoló kivehető banktétel, AKKOR a következő lépés a `gate`; a `choiceFlags` tartalmazza a tételeket, `bankReview` nincs.
- K2: HA van tanítási (nem banktétel) blokkoló, AKKOR a viselkedés változatlan.
- K3: `STUDIO_BANK_ONLY_REPAIR=1` mellett a régi csak-bank kör fut.
- K4: A tervre váró tétel szakaszjelzőjén nincs aktív (forgó) szakasz.
