# P7B-TANITAS-MEGORZES — a gyakorlati bankjavítás csak a hibás tételt cseréli (terv, 2026-11-27)

Szülő terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` (TG-P7: „a hibátlan csomag átvéve, a csak meta-hibás csomagban kizárólag a
kifogásolt tétel cserélődik, a jó tételek tartalma és azonosítója marad”).

## Mért hiba (élő próba, 2026-11-27, 5b13de69 — nem alkalmazva)

A „Gyakorlati bankjavítás (a tanítás marad)” jelöltjében 0/95 kvíztétel maradt változatlan, pedig a 2 csomagból csak 1 volt
meta-hibás. Okok:

1. Élesben `STUDIO_LESSON_OPENER=on`: a nyitómese-szerződés előtt gyártott csomag (`bankPlan.units[].opener` hiányzik — 221/260
   közzétett lecke) nem vehető át (review #403 / C döntés) → a hibátlan csomag is újragyártódik.
2. A régi csomag a mai kapukon más (nem meta) hibát is adhat (új szabályok a gyártása óta) → a TG-P7a célzott alapja csak a
   „minden hiba meta / arány” esetben él, különben teljes újragyártás.

## Döntés

Csak a csak-bank (practice-bank) úton (`keepLegacy`), a szerzői javítás változatlan:

- a tanításában változatlan fejezet régi csomagja a nyitómese-verziótól függetlenül átvehető;
- a régi csomag tétel-szintű hibái (meta, érvénytelen kulcs stb.) célzott tételcserét kapnak; a régi csomag csomag-szintű hibái
  (régebbi szabály) tűrt örökség — a javítás után csak ÚJ hiba indít javítókört;
- hiba nélküli (csak örökölt csomag-szintű eltérésű) régi csomag modellhívás nélkül, azonosítóival átvéve.

Végrehajtás: `docs/specs/2026-11-27-p7b-tanitas-megorzes-vegrehajtas.md`.
