# Témafókusz — a résztéma-döntés pontosítása (2026-09-30)

## Cél
A felsoroló tanári kérés („pontosan ezeket tanítsd, és csak ezeket”, egy füzetlap pontjai) mindig résztéma-kérésnek
számítson, ha a tudástárban ennél több fogalom van. Ne fusson széles, 55 fogalmas lecke.

## Mért hiba (a #148 utáni ellenőrző mérés, a Mezopotámia-térkép 55 fogalmával, az éles úton)
- A glm-5.3-flash (#148 óta az első fókuszmodell) 8 döntésből 4-szer `narrow:false`-t adott, 3–6 s alatt. A `narrow:false`
  döntésnek számít, ezért a tartalék modellt nem kérdezzük, és a teljes térkép marad.
- Gyökérok: a prompt szerint „a forrás egészét kéri → NEM résztéma”. A tanári kérés szerint „a füzetlap a KÖTELEZŐ
  tartalom”, és a modell ezt „a forrás egészé”-nek olvassa. A tudástár viszont a webes oldalak fogalmait is tartalmazza.

## Döntés
A `TOPIC_FOCUS_SYSTEM` a résztémát a TUDÁSTÁR fogalmaihoz méri. Résztéma-kérés az is, ha a kérés felsorolja, mely
pontokat tanítsa, és a tudástárban ennél több fogalom van. NEM résztéma: terjedelem, évfolyam, nehézség, stílus vagy
elírás-javítás, illetve ha a kérés kifejezetten minden fogalmat kér. A választó rész és a JSON-alak nem változik.

## Nem-cél
A modellsorrend, a határidő, a `decideTopicFocus` láncolási logikája, és élő újragyártás.

## Edge case-ek
- A széles stíluskérés és az elírás-javítás továbbra is `narrow:false`.
- A klasszikus altéma-kérés (oszthatóság 4-gyel és 25-tel) továbbra is `narrow:true`.

## Elfogadás (EARS)
- **E1** WHEN a kérés felsorolja a tanítandó pontokat, és a térképen több fogalom van, a modell SHALL `narrow:true`-t adni
  (mérés: glm, a Mezopotámia-kérés, ≥ 9/10).
- **E2** WHEN a kérés csak stílusról vagy elírásról szól, SHALL `narrow:false` (mérés: 10/10).
- **E3** Az oszthatósági altéma-kérés SHALL `narrow:true` maradni (6/6).
- **E4** Új szerződésteszt: a prompt a felsoroló kérést résztémának nevezi. A régi kódon bukik; a meglévő tesztek zöldek.

## Előzetes mérés (a prompt változata a próbaszkriptben, glm-5.3-flash)
- Mezopotámia-kérés: régi prompt 4/8 `narrow:true`, új prompt 10/10 `narrow:true` (12–14 fogalom, 2–7 s).
- Stíluskérés 6/6 és elírás-kérés 4/4 `narrow:false` (új prompt).
- Oszthatóság 4-gyel és 25-tel: régi 6/6, új 6/6 `narrow:true` (10–12 fogalom).

## Utána-mérés (kész kód, glm-5.3-flash, éles út, a DB-t csak olvasva)
- Mezopotámia-kérés: 10/10 `narrow:true` (12–17 fogalom, 1,9–21 s).
- Stíluskérés: 5/5 `narrow:false`. Oszthatóság 4-gyel és 25-tel: 5/5 `narrow:true` (10 fogalom).
- A teljes lánc (`decideTopicFocus` + `topicFocusModels()`): 8,2 / 6,6 / 6,3 s, mindig az első modellel, 14–16 fogalom.
- Kapuk: tsc (app + teszt) OK, lint OK, `tests/*.test.ts` 1742/1742.
