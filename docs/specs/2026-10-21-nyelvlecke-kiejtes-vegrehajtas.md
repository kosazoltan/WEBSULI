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
