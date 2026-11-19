# Terv (VÁZLAT): bizonyíték-átvitel főág-beolvasztás után — külön PR

> Tulajdonosi döntés (űrlap, 2026-11-19): „Carry kivétele, külön PR”. A kapu-gyorsítás PR-ból (`fix/kapu-gyorsitas`) a
> bizonyíték-átvitel kikerült; ez a terv a következő, önálló PR alapja. A korábbi megvalósítás a `fix/kapu-gyorsitas` ág
> `cc42ad3b` commitjában olvasható (`scripts/qa/gates/carry-over.mjs` + teszt) — kiindulópont, nem kész kód. Ez VÁZLAT: a
> végrehajtási utasítás (`-vegrehajtas.md`) és a kód csak a terv véglegesítése után.

## 1. Cél

Ha egy PR-ba a fejlesztő ütközésmentesen beolvasztja a friss maint, és a PR saját változása bájtra azonos maradt, a vak ítélet és a
push- / PR-kapu bizonyítéka gépi úton, ellenőrizhetően átvihető legyen az új fejre — új teljes vak kör és teljes CI nélkül —, a
biztonsági szint csökkenése nélkül.

## 2. Nem cél

- A merge-kapu C-61 összefésült próbája (a kapu-gyorsítás PR része marad).
- Halmozott PR-láncok (a másik szülő nem a main őse) — ott nincs átvitel.

## 3. Elfogadási pontok (a 3. és 4. vak kör átvitel-leletei, kötelező)

<!-- acceptance-checklist -->
- [ ] Az alap mindig a friss, GitHubbal egyeztetett main SHA (nincs választható `--base`, `--base=…` sem); a próba és minden
  feltétel a rögzített SHA-n fut (3. kör L4, L11).
- [ ] Közvetlenül a publikálás előtt újra a GitHub szerinti main — eltérés → nincs átvitel; a hook / kapu a carry main SHA-ját is
  ellenőrzi (4. kör L2).
- [ ] A célfejre már rögzített ítéletet / bizonyítékot az átvitel soha nem írja felül; a próba közben rögzített is megmarad
  (3. kör L2).
- [ ] A FORRÁS ítéletet a publikálás előtt újra be kell olvasni és egyeztetni (verzió / hash); a próba alatt visszavont (NEM-re
  módosított) forrás nem vihető át (4. kör L3).
- [ ] Atomi véglegesítés vagy minden olvasó (hook, ítélet-olvasó, kapuk) által ellenőrzött befejezési jelző: félbeszakadt átvitel
  rekordjából nem lehet engedély, és az ismétlés helyreállítható (4. kör L4).
- [ ] A próba hatókörének történeti alapja a régi, ellenőrzött fej (a már beolvasztott main-változás is a hatókörben) (3. kör L3).
- [ ] Az átvitt ítélet megbízhatósága a jelentés fejéhez kötött (a `record-review` fej-ellenőrzésével összhangban; 4. kör L1).
- [ ] A `merge-tree` nem 0 kilépési kódjára célzott teszt (3. kör 8f / M4).
- [ ] Minden pont bukó teszttel; mutációs ellenpróba; független vak ellenőr.

## 4. Átmeneti állapot (a kapu-gyorsítás PR után)

A kapuk és a hook fail-closed módon NEM fogadnak el átvitt (`carriedFrom` / `carry` mezős) rekordot; `gate:carry` parancs nincs.
