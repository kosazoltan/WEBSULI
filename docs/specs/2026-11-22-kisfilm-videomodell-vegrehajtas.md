# Végrehajtás — kisfilm-mozgókép: Seedance 2.0 Mini, beállítható modell és felbontás

Terv: `docs/specs/2026-11-22-kisfilm-videomodell.md`. Ág: `fix/kisfilm-videomodell` (a friss mainről).

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. `source/server/lesson-clips-providers.ts`:
   - `CLIP_VIDEO_MODEL` → `CLIP_VIDEO_MODEL_DEFAULT = "bytedance/seedance-2.0-mini"`, `CLIP_VIDEO_RESOLUTION_DEFAULT = "480p"`;
   - új tiszta függvények: `clipVideoModel(env)` (érvényes `szolgáltató/név` vagy alapérték) és `clipVideoResolution(env)`
     (`480p` | `720p` vagy alapérték);
   - `clipKeys(env)` a kettőt a kulcsok mellé teszi (`videoModel`, `videoResolution`), a `video()` beküldés ezeket használja;
     érvénytelen env-értékről egyszeri figyelmeztetés a naplóban.
3. `source/tests/lesson-clip-worker.test.ts`: alapérték, érvényes felülírás, érvénytelen / üres érték → alapérték; a beküldés
   törzsében a modell és a felbontás (hamis `fetch`-csel, ha a meglévő tesztstruktúra engedi; különben a tiszta függvények).
4. `docs/fejezet-kisfilmek-hasznalat.md`: a két új kapcsoló a táblában; költség a mért 480p-s árral.
5. `npm run gate:stage`, `gate:push`, független ellenőr, `gate:pr`, PR. Összevonás a fő szálnál (`gate:merge` futásőre a fejlesztői gépen fut).
6. Élesítés a terv szerint: az állóképes fejezet sorának törlése (tulajdonosi jóváhagyással), `LESSON_CLIPS_AUTO=on`, az első kör
   mérése (napló: „N mozgókép (0 nélkül)”, memória 450 MB alatt).

- [x] 1 · [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6
