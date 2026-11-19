---
name: websuli-merge-elotti-kapu
description: WEBSULI merge előtti kapu (az orkesztrátor futtatja, kötelező). Töltsd be automatikusan minden gh pr merge ELŐTT, közvetlenül előtte - a check-quality-gates hook a PR jelenlegi fejére szóló, legfeljebb 15 perces zöld merge-bizonyíték nélkül megtagadja a merge-et. Parancs - npm run gate:merge -- <PR-szám>.
---

# Merge előtti kapu

Runbook: `docs/minosegkapuk.md`, `docs/telepites-elotti-or.md`. A kapu CSAK ellenőriz; a `gh pr merge`-et nem hívja.

## Menet (PR-onként, közvetlenül a merge előtt)

```bash
npm run gate:merge -- <PR>        # = node scripts/qa/gates/pre-merge-gate.mjs <PR>
gh pr merge <PR> --squash         # csak zöld kapu után, 15 percen belül; a hook ellenőrzi
```

A `gh pr merge --auto` tilos (a hook megtagadja): az összevonás később, futásőr és `/api/rt/status` nélkül történne.

## Mit ellenőriz

1. A PR nyitott, nem piszkozat, `mergeStateStatus = CLEAN` (UNKNOWN: várd meg az újraszámolást, ne erőltesd).
2. Minden KÖTELEZŐ ellenőrzés (a főág védelméből: `gh api repos/{owner}/{repo}/branches/main/protection`) sikeres a PR JELENLEGI
   fejének check-runjai között (nem egy korábbi fejen).
3. Lezáratlan review-szál = 0 (GraphQL `reviewThreads`). Csak a megválaszolt szálat zárd le.
4. A main elmozdult-e a PR CI-ja óta (a CI-futás `base.sha` vs. a main csúcsa). Ha igen, és a PR repó-szintű őrt / ellenőrzést érint
   (`*-guard.test.ts`, `scripts/qa/**`, `.github/workflows/**`), a kapu a main elmozdulásának fájllistáját (GitHub compare) a
   `gates.config.json` `repoWideScopes` táblázatával veti össze. Ha a main az ellenőrzés által olvasott fájlt változtatott, vagy a
   lista nem olvasható / csonka / üres (C-61), a kapu ELSŐKÉNT a **gépi összefésült próbát** futtatja a PR feje + a rögzített main SHA
   állapotán (új CI és main-beolvasztás nélkül) — feltételei: azonos tárolóból jövő PR, zöld kötelező ellenőrzések és erre a fejre
   rögzített, megbízható helyi ítélet (`record-review`). Zöld próba → PASS; main-beolvasztás CSAK ütközés vagy piros próba esetén
   kell. Nincs metszet → figyelmeztetés. Részletek: `docs/minosegkapuk.md`.
5. A független ellenőr ítélete a JELENLEGI fejre IGEN / IGEN, FELTÉTELLEL (helyi `review-<fej>.json`, vagy a PR-leírás / komment
   `Független ellenőr ítélete: … (fej: <hash>)` sora).
6. Futásőr: `bash scripts/qa/active-runs-guard.sh` kilépési kódja 0 (1 = aktív gyártás → ne vonj össze; 2 = hiba → vakon tilos).
7. `source/` változás → „TELEPÍTÉST INDÍT” jelzés.
8. `GET https://websuli.vip/api/rt/status`: `mode = off`, vagy `activeMatches = 0`; hálózati hiba = bukás.

Zöld → `merge-<PR>-<fej>.json` (15 percig érvényes; új push után érvénytelen).

## Összevonási ablak (docs/telepites-elotti-or.md)

- A zöld PR-okat egy ablakban vond össze, egymás után; az ablakot előre jelezd a tulajdonosnak.
- MINDEN egyes merge előtt újra a kapu (a futásőr „közvetlenül előtte” szabálya). Az első merge után a többi PR állapota átmenetileg
  `UNKNOWN` / a main elmozdult: a kapu ezt jelzi, és repó-szintű őrt érintő PR-nél a gépi összefésült próbával dönt (fent, 4. pont);
  a PR-t csak ütközés vagy piros próba esetén frissítsd a mainnel (a csak-merge push újraindítja a kötelező E2E-t).
- Zöld CI után nincs push (C-62); a kötelező ellenőrzés nem alku tárgya (C-63).

## Ha bukik

A kapu megnevezi a lépést és a teendőt. Megkerülni tilos (vészkijárat nincs); ha a kapu hibás, a kaput kell javítani teszttel.
