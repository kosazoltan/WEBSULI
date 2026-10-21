# Nyelvleckék kiejtésgyakorló — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-nyelvlecke-kiejtes.md`.

1. **`shared/pronunciation.ts` (új, tiszta):** `pronunciationVerdict(target, heard)` → `{ state: "ok" | "close" | "retry", similarity }`
   (normalizálás: kisbetű, ékezet megtartva, írásjel ki; szószintű + Levenshtein-arány; ok ≥ 0,92, close ≥ 0,7).
2. **`client/src/lesson-runtime/ExperienceSpeech.tsx`:** `pickVoice(lang)` (pontos, majd nyelvi előtag; `voiceschanged`); `SpeakButton`
   hangválasztással; `DictationButton` `language` paraméter (alap hu-HU) és támogatás hiányában útmutató; új `PronounceButton`
   (felismerés a lecke nyelvén, vagy beviteli mező; visszajelzés a `pronunciationVerdict` szerint).
3. **`client/src/lesson-runtime/LessonExperienceView.tsx`:** új „Kiejtés” fül (csak `e.language` esetén); a Tananyag tetején belépő;
   a régi alsó szószedet-blokk a fülbe költözik; a feladatok diktálása nyelvleckén nyelvválasztós.
4. **Gyártás:** `shared/lesson-experience.ts` `bankPacketContract` — nyelvleckén glossary legalább 12 (prompt-szerződés, nem séma);
   `shared/lesson-type-skills.ts` — a nyelvlecke kiejtésgyakorló követelménye.
5. **Teszt:** `tests/pronunciation.test.ts`; `tests/lesson-fusion.spec.ts` a fülre (dokumentált UI-változás) + kiejtésgyakorlás mock
   felismerővel és felismerő nélkül. Valódi böngészős ellenőrzés mobil és asztali nézetben.
6. **Review #360:** a főoldal csak a saját keret várt originjéről, FRISS gesztussal (`userActivation.isActive`) indít; a keret újratöltése
   leállít; a teljes eredménylista a natív `resultIndex`-szel; a konstruktor hibája is válasz; a keretbeli híd nyugta előtti leállítása
   a natív tartalékot törli, a munkamenet az `end` előtt törlődik, indításonként tiszta állapot; attribútumos `<head …>` is; a segéd
   hibaüzenete új próbánál / sikernél eltűnik; a kiejtés-gyakorló a rejtett fülön leáll, a leállítás `stop()` (a végső eredmény
   kiértékelődik); kihagyott szóval nincs ✅ (`allWordsSpoken`); hat fül 480 px alatt két sorban; szószedet-minimum 4 a promptban és
   a csomag-ellenőrzésben (`GLOSSARY_MIN_PER_PACKET`).
