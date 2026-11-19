# Terv: a független ítélet rögzítése a jelentés ZÁRÓ `Fej:` sorához kötve

> Tulajdonosi döntés (űrlap, 2026-11-19): „Szétbontás két PR-ra” — ez a PR-1 (kis kockázatú rész). Ág: `fix/itelet-fej-egyeztetes`
> (a friss `origin/main`-ről). Végrehajtás: `docs/specs/2026-11-20-itelet-fej-egyeztetes-vegrehajtas.md`. A PR-2 (összefésült
> próba) terve: `docs/specs/2026-11-20-osszefesult-proba.md` (külön, később).

## 1. Probléma

A `record-review` (`scripts/qa/gates/record-review.mjs`) a `--head` argumentumból veszi a fejet, a jelentésből csak az ítéletet: a
jelentés fejét nem vizsgálja. Javító push után egy RÉGI fejről szóló jelentés tévedésből az új fejre rögzíthető (kapu-gyorsítás
4. vak kör L1). Egy szabad szövegbeli fej-említés sem köthet ítéletet (6. vak kör L2: „Az új fej <hash> még nincs ellenőrizve.”
megjegyzés nem válthat vizsgált fejet).

## 2. Cél

- A jelentés ZÁRÓ (utolsó) `Fej: <teljes, 40 jegyű hash>` sora (önálló sor) egyezzen a feloldott `--head` fejjel; hiány, rövid hash,
  eltérés → hiba, nincs rekord.
- Az utolsó `Ítélet:` sor a záró `Fej:` sor UTÁN álljon (a fej és az ítélet egy szakasz párja); ha az utolsó `Fej:` szakaszban nincs
  ítélet → hiba.
- Szabad szövegbeli hash-említés (nem `Fej:` sor) nem számít.
- A rekord `reportHead` mezőt kap (a jelentés záró fej-sora).
- A skill jelentés-sablonja (és a visszaellenőrzési szakasz) kötelező `Fej: <teljes hash>` sort ír; a runbook ezt rögzíti.

## 3. Nem cél

- A merge-kapu C-61 logikája, az összefésült próba, a merge-engedély és a hook main-ellenőrzése (PR-2).
- A merge-kapu próbájának egyszeri újrafuttatása (#205): a mai merge-kapuban nincs próba (C-61 → új CI), így önállóan nem
  értelmes — a PR-2-vel együtt jön.

## 4. Edge case-ek

- Több szakasz (review + visszaellenőrzés): a záró `Fej:` + az utolsó `Ítélet:` a döntő.
- `Fej:` sor markdown-díszítéssel (`**Fej:**`, backtick a hash körül) — elfogadott; a hash teljes 40 jegy.
- Régi `review-*.json` rekordok `reportHead` nélkül: a mai olvasók (pre-pr / pre-merge) változatlanul elfogadják (formátumváltás nincs
  az olvasó oldalon ebben a PR-ban).

## 5. Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] AMIKOR a jelentésben nincs önálló `Fej: <40 jegy>` sor, a `record-review` hibával megáll.
- [ ] AMIKOR a záró `Fej:` sor más fejre szól, mint a `--head`, hiba; szabad szövegbeli későbbi hash-említés nem írja felül.
- [ ] AMIKOR az utolsó `Ítélet:` a záró `Fej:` sor ELŐTT áll, hiba (a fej szakaszában nincs ítélet).
- [ ] A rekord `reportHead`-et tartalmaz; a skill-sablon és a runbook a `Fej:` sort kötelezőnek írja.
- [ ] Minden pont előbb bukó teszttel.
