# Spec: a tesztek „hamisítása” mindig eltérő értéket adjon (1/1024 és 1/4096 eséllyel ingadozó tesztek)

> Dátum: 2026-11-20 · Szerző: Claude (orkesztrátori megbízás) · Állapot: JÓVÁHAGYVA (az orkesztrátor kérte, 2026-11-20)
> Végrehajtás: `docs/specs/2026-11-20-teszt-hamisitas-utkozes-vegrehajtas.md`.

## 1. Cél

Néhány teszt egy véletlen értéket (OAuth `state`, aláírás) úgy „hamisít”, hogy a végét egy rögzített szövegre cseréli. Ha a véletlen
érték véletlenül már így végződik, a „hamis” érték azonos az eredetivel, a szerver jogosan elfogadja, és a teszt hibásan bukik.
A cél: a hamisítás MINDIG eltérő (és aláírásnál a dekódolt bájtokban is eltérő) értéket adjon, így a teszt determinisztikus.

## 2. NEM cél

- Termékkód (szerver, kliens) módosítása — a szerver mindkét esetben helyesen viselkedik.
- A rögzített (determinisztikus) bemenetű, de ugyanilyen mintájú esetek javítása (`learner-profile.test.ts:22`,
  `player-account-db.integration.ts:306`): ezek nem ingadoznak, csak jelentjük őket.

## 3. Érintett területek

- `source/tests/support/tamper.ts` (új): közös segéd.
- `source/tests/support/player-google-stub.ts:65` — `${state.slice(0, -2)}xx` (OAuth `state`, szöveges egyezés a munkamenet
  rekordjával) → bukás, ha a `state` „xx”-re végződik: 1/4096 (mérve: 200 000 próbából 55).
- `source/tests/rt-ticket.test.ts:45` — `${sig.slice(0, -2)}AA` (HMAC-SHA256 base64url, a szerver a DEKÓDOLT bájtokat veti össze,
  `server/realtime/ticket.ts:83–84`) → bukás, ha az aláírás „AA”-ra végződik: ~1/1024 (mérve: 2 000 000 próbából 1976). A jegy
  `nonce`-a véletlen, ezért az aláírás futásonként más (kanban #209).
- `source/tests/support-tamper.test.ts` (új): a segéd egységtesztje és a bukó bizonyíték.

## 4. Rögzített döntések és kényszerek

- A segéd egy megadott pozíción álló karaktert cserél egy tőle KÜLÖNBÖZŐ base64url-karakterre (`A` → `B`, minden más → `A`).
- Aláírásnál a csere az aláírás ELSŐ karakterén történik: a base64url utolsó karakterének alsó bitjei nem számítanak (32 bájt =
  43 karakter, az utolsó karakter 2 bitje kitöltés), ezért az utolsó karakter cseréje mérten 1/16 eséllyel UGYANAZT a bájtsort adja.
  Az első karakter mind a 6 bitje érdemi.
- Az OAuth `state`-nél a csere az utolsó karakteren marad: így az érték alakja (`p.` + 32 karakter) változatlan, a közös visszahívás
  a játékos-ágra küldi, ahol a szöveges egyezés bukik.

## 5. Edge case-ek

- A cserélt karakter `A` → `B`; bármi más → `A` (a kimenet mindig a base64url ábécében marad, a hossz változatlan).
- Negatív index a végétől számít; tartományon kívüli index → kivétel (a teszt ne „hamisítson” csendben semmit).

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- [ ] A1 WHEN a segéd bármely bemenetet és érvényes pozíciót kap THEN SHALL a kimenet eltérjen a bemenettől, azonos hosszú legyen,
  és csak abban az egy pozícióban különbözzön.
- [ ] A2 WHEN egy base64url-aláírás első karakterét cseréli THEN SHALL a dekódolt bájtsor is eltérjen (minden első karakterre).
- [ ] A3 WHEN a véletlen `state` / aláírás teszt-szinten a régi rögzített végződésre (`…xx` / `…AA`) van kényszerítve THEN SHALL a
  régi hamisítás az eredetivel azonos értéket adjon (bukó bizonyíték), az új pedig eltérőt.
- [ ] A4 WHEN a `player-google-stub.ts` `tamperState` és az `rt-ticket.test.ts` hamisítása fut THEN SHALL mindkettő az új segédet
  használja, a régi `slice(0, -2)` + rögzített végződés minta nélkül.
- [ ] A5 WHEN `npm run gate:stage` és `npm run gate:push` fut THEN SHALL mindkettő zöld legyen.

## 7. Tesztterv

- `source/tests/support-tamper.test.ts`: A1 (véletlen bemenetek, minden pozíció), A2 (mind a 64 első karakter), A3 (kényszerített
  végződés a régi és az új hamisítással; az `rt-ticket` esetben a valódi `createTicketService` aláírásával).
- A meglévő `rt-ticket.test.ts` és (a DB-körben) `player-account-db.integration.ts` változatlan elvárásokkal fut.

## 8. Kockázatok / visszavonási terv

- Csak tesztkód; visszavonás: a commit revertje. Az elvárások (SIGNATURE, `/belepes?hiba=google`) nem változnak — nincs gyengítés.

## 9. Végrehajtási utasítás

`docs/specs/2026-11-20-teszt-hamisitas-utkozes-vegrehajtas.md`.
