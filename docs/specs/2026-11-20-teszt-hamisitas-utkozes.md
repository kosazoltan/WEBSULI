# Spec: a tesztek „hamisítása” mindig eltérő értéket adjon (1/1024 és 1/4096 eséllyel ingadozó tesztek)

> Dátum: 2026-11-20 · Szerző: Claude (orkesztrátori megbízás) · Állapot: JÓVÁHAGYVA (az orkesztrátor kérte, 2026-11-20)
> Végrehajtás: `docs/specs/2026-11-20-teszt-hamisitas-utkozes-vegrehajtas.md`.

## 1. Cél

Néhány teszt egy véletlen értéket (OAuth `state`, aláírás) úgy „hamisít”, hogy a végét egy rögzített szövegre cseréli. Ha a véletlen
érték véletlenül már így végződik, a „hamis” érték azonos az eredetivel, a szerver jogosan elfogadja, és a teszt hibásan bukik.
A cél: a hamisítás MINDIG eltérő (és aláírásnál a dekódolt bájtokban is eltérő) értéket adjon, így a teszt determinisztikus.

## 2. NEM cél

- Termékkód (szerver, kliens) módosítása — a szerver mindkét esetben helyesen viselkedik.
- A `learner-profile.test.ts:22` (`sig.slice(0, -1)` + `A`) javítása: az azonosító, a verzió ÉS a titok rögzített, ezért az
  aláírás minden futásban ugyanaz — nem ingadozik, csak jelentjük. (PONTOSÍTVA a vak ellenőr 1. köre után, L2: a korábban ide sorolt
  `player-account-db.integration.ts:306` NEM ilyen — a kulcs a harness futásonként véletlen `SESSION_SECRET`-je, ezért javítjuk.)

## 3. Érintett területek

- `source/tests/support/tamper.ts` (új): közös segéd.
- `source/tests/support/player-google-stub.ts:65` — `${state.slice(0, -2)}xx` (OAuth `state`, szöveges egyezés a munkamenet
  rekordjával) → bukás, ha a `state` „xx”-re végződik: 1/4096 (mérve: 200 000 próbából 55).
- `source/tests/rt-ticket.test.ts:45` — `${sig.slice(0, -2)}AA` (HMAC-SHA256 base64url, a szerver a DEKÓDOLT bájtokat veti össze,
  `server/realtime/ticket.ts:83–84`) → bukás, ha az aláírás „AA”-ra végződik: ~1/1024 (mérve: 2 000 000 próbából 1976). A jegy
  `nonce`-a véletlen, ezért az aláírás futásonként más (kanban #209).
- `source/tests/support-tamper.test.ts` (új): a segéd egységtesztje és a bukó bizonyíték — rögzített bemenetekkel (L1).
- `source/tests/player-account-db.integration.ts:306` (L2) — `${token.slice(0, -4)}AAAA` tanulói tokenen; a kulcs futásonként
  véletlen → 1/16,8 millió eséllyel azonos (offline keresés: az 5 188 597. kulcsnál találat, a régi hamisítást a szerver elfogadja).
- `source/tests/player-account-db.integration.ts` N3-eset (L3) — a fix „rossz” `00000000` kód 1/10^8 eséllyel épp a frissen
  kiadott (`generateCode`: `randomInt(0, 10^8)`). A kiadott kód levélből nem fogható meg (tesztben nincs levélküldő), ezért a
  „rossz” kód a cím kódrekordjainak lenyomatai alapján garantáltan eltérő nyolcjegyű.

## 4. Rögzített döntések és kényszerek

- A segéd egy megadott pozíción álló karaktert cserél egy tőle KÜLÖNBÖZŐ base64url-karakterre (`A` → `B`, minden más → `A`).
- Aláírásnál a csere az aláírás ELSŐ karakterén történik: a base64url utolsó karakterének alsó bitjei nem számítanak (32 bájt =
  43 karakter, az utolsó karakter 2 bitje kitöltés), ezért az utolsó karakter cseréje mérten 1/16 eséllyel UGYANAZT a bájtsort adja.
  Az első karakter mind a 6 bitje érdemi.
- Az OAuth `state`-nél a csere az utolsó karakteren marad: így az érték alakja (`p.` + 32 karakter) változatlan, a közös visszahívás
  a játékos-ágra küldi, ahol a szöveges egyezés bukik.

## 5. Edge case-ek

- A cserélt karakter `A` → `B`; bármi más → `A` (a kimenet mindig a base64url ábécében marad, a hossz változatlan).
- Negatív index a végétől számít; tartományon kívüli vagy nem egész index → kivétel (a teszt ne „hamisítson” csendben semmit); az
  egész voltát a normalizálás ELŐTT nézzük (L4: `32 + (-1 - ε)` lebegőpontosan 31).
- A segéd UTF-16 kódegységre mutat, és csak base64url / ASCII értékekre szól (hexa-dekódolásra nem általánosítható: `ab` → `Ab`).

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- [x] A1 WHEN a segéd bármely bemenetet és érvényes pozíciót kap THEN SHALL a kimenet eltérjen a bemenettől, azonos hosszú legyen,
  és csak abban az egy pozícióban különbözzön.
- [x] A2 WHEN egy base64url-aláírás első karakterét cseréli THEN SHALL a dekódolt bájtsor is eltérjen (minden első karakterre).
- [x] A3 WHEN rögzített (nem sorsolt, órafüggetlen) `…xx` state + illeszkedő munkamenet-rekord, illetve az eredeti szolgáltatással
  befagyasztott órával előállított rögzített `…AA` jegy kerül a valódi ellenőrzőbe THEN SHALL az eredeti és a régi hamisítás
  elfogadott legyen (bukó bizonyíték), az új pedig pontos okkal elutasított (`false`, illetve `SIGNATURE`).
- [x] A4 WHEN a `player-google-stub.ts` `tamperState` és az `rt-ticket.test.ts` hamisítása fut THEN SHALL mindkettő az új segédet
  használja, a régi `slice(0, -2)` + rögzített végződés minta nélkül.
- [x] A6 WHEN a `player-account-db.integration.ts` tanulói tokent hamisít THEN SHALL a segéddel garantáltan eltérő jelet
  küldjön (a 400-as elvárás marad); rögzített „…AAAA” tokenen a régi hamisítás elfogadott, az új null (egységteszt).
- [x] A7 WHEN az N3-eset „rossz” belépőkódot küld THEN SHALL az garantáltan egyik kiadott kóddal se egyezzen; ha a kiadott épp
  `00000000`, a választó másikat ad, és a régi fix kód beléptetne (DB-teszt).
- [ ] A5 WHEN `npm run gate:stage` és `npm run gate:push` fut THEN SHALL mindkettő zöld legyen.

## 7. Tesztterv

- `source/tests/support-tamper.test.ts`: A1 (rögzített minták, minden pozitív és negatív pozíció), A2 (mind a 64 első karakter),
  A3 (rögzített `…xx` state, rögzített `…AA` jegy befagyasztott órával), A6 (rögzített kulcsú „…AAAA” tanulói token), L4 (tört index).
- `source/tests/player-account-db.integration.ts`: A6 (a 400-as elvárás), A7 (új eset a „review #449” blokkban, és az N3-eset).
- A meglévő `rt-ticket.test.ts` és (a DB-körben) `player-account-db.integration.ts` változatlan elvárásokkal fut.

## 8. Kockázatok / visszavonási terv

- Csak tesztkód; visszavonás: a commit revertje. Az elvárások (SIGNATURE, `/belepes?hiba=google`) nem változnak — nincs gyengítés.

## 9. Végrehajtási utasítás

`docs/specs/2026-11-20-teszt-hamisitas-utkozes-vegrehajtas.md`.
