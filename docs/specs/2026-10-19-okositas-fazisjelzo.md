# Okosítás és javítás: állandóan látható fázisjelző, elárvult futások azonnali lezárása

Állapot: tulajdonosi hibajelzés 2026-10-19.
> „a tananyagok okosítása … fut, de az állapotjelzés nem működik, csak az látszik, hogy az AI készíti … van három hibás tétel …
> a javításnál és az okosításnál mindegyik adminfunkciónál kell futnia az állapotjelzőnek, pedig kérek egy állandóan látható,
> fázissorrendet jelző kijelzést.”

## Mérés (Render-napló, 2026-10-19)
- **Okosítás `1e169ace` („Who's vs Whose”, 15:42):**
  - a felület 5 mp-enként kérdezte az `/improve-material/status`-t, amely futás közben csak `{ status: "processing", elapsed }`-ot
    ad, fázist nem;
  - a munkafolyamat-napló (`/api/studio/workflows/1e169ace`) létezett (200), a fázisok tehát rögzültek;
  - a záró ellenőrzés kétszer elutasította (15:51 szószedet / TTS-nyelv, 15:57 mintaválaszok + JS-szintaxis) → hiba.
- **Okosítás `c74c38f9` („Week 6 – angol szókincs”, 09:48):**
  - a 09:56-os kitelepítés újraindította a szervert, a futás elveszett;
  - a rekord 2 órán át `processing` maradt, és csak a 60 perces időkorlát utáni lekérdezés zárta hibára (11:48);
  - az újrapróbálás (`7a91413c`, 11:49) sikeres jelöltet adott (12:01).
- **Okosítás `a6e17518` („Where I Live”, 15:41):** 400-as válasz, rekord nem keletkezett.

## Gyökérokok
1. **A fázisjelző csak oldalon belüli állapotból él.**
   - `MaterialImprover` a `WorkflowMonitor`-t az indításkor beállított `workflowId`-vel mutatja; újratöltés vagy visszatérés után
     ez `null`, a sorban csak „AI dolgozik…” címke marad.
   - A jelző a lap tetején, a fájlválasztó fölött áll (mobilon 70%-os nagyításon), görgetéskor nem látszik.
   - `LessonRepairPanel` (Tananyagjavító és a lecke alatti javítás) csak „A javítás fut (N perc)…” szöveget mutat, fázist nem.
2. **Az okosítás és a javítás elárvult futását semmi nem zárja le újraindításkor.**
   - A stúdió `studio_jobs` / `one_step_runs` sorait a boot-söprés zárja (#168, #183), az `improved_html_files` `processing` sorát
     nem.
   - A rekord csak a 15 / 60 perces időkorlát utáni első lekérdezéskor vált hibára.

## Cél
1. **`WorkflowPhaseBar`** (új, közös komponens, `client/src/components/studio/WorkflowPhaseBar.tsx`):
   - **Megjelenés:** a futás definíciójának MINDEN lépése sorrendben, számozva, állapotjellel (✓ kész, forgó jel fut, ✕ megállt,
     ↻ új kör, ○ még nem indult); mellette az aktuális lépés neve, a kör és az eltelt idő.
   - **Hiba:** a hibaüzenet teljes szövege kinyitható.
   - **Frissítés:** a meglévő `/api/studio/workflows/:id`-ből, 2,5 mp-enként, amíg a futás `running` / `waiting`.
   - **Láthatóság:** `sticky` (az admin fejléc alatt marad görgetéskor), mobilon törő, vízszintesen nem lóg ki.
2. **Okosítás (`MaterialImprover`):**
   - **Felül, ragadósan:** a táblázat MINDEN `processing` sora fölé, a rekord azonosítójával (újratöltés után is), valamint az
     épp indított futás fölé.
   - **Hibás sor:** a hibaüzenet és a megállás lépése a fázissávval („Megállt: Ellenőrzések és közzététel”).
3. **Javítás (`LessonRepairPanel`):** futás közben és hiba esetén a fázissáv a `jobId`-val. A `jobId` már ma is megmarad
   újratöltés után (localStorage).
4. **Elárvult futások (`server/improve-orphans.ts`):** indításkor és utána 2 percenként lezárja azokat a `processing`
   okosítási / javítási rekordokat, amelyeknek:
   - a munkafolyamat-futása nem él (nincs futás és a rekord > 5 perces), vagy
   - a futás bérlete lejárt (`lease_until` < most − 30 mp), vagy
   - a futás már végállapotban van.
   - Pontos üzenet: „A szerver újraindult az okosítás közben — töröld, és indítsd újra.”
   - Élő bérletű futáshoz nem nyúl (a deploykor még futó régi példány befejezheti).
   - A döntés tiszta függvény (egységteszt), az I/O a hívóé.
   - E2E-módban nem fut (indításkori írás tiltva).

## Nem-cél
- Az okosítás minőségkapuinak módosítása (a „Who's vs Whose” elutasítása helyes volt).
- A hibás tételek törlése: tulajdonosi felületi művelet. Az éles adatbázist nem írjuk; a rekordokat a jelentés név szerint
  sorolja fel.

## Elfogadás (EARS)
- **Okosítás fut:** HA egy okosítás fut, AKKOR az Okosítás lap tetején ragadósan látszik a „HTML-okosítás” fázissora
  (Forrás → Írás → Ellenőrzések és közzététel → Mentés → Visszaolvasás), az aktuális lépéssel és az eltelt idővel —
  újratöltés után is.
- **Javítás fut:** HA egy javítás fut, AKKOR a Tananyagjavítóban a „Teljes lecke javítása” fázissora látszik.
- **Megállás:** HA a futás megállt, AKKOR a fázissáv a megállás lépését és a teljes hibaüzenetet mutatja.
- **Elárvult rekord:** HA egy `processing` okosítási rekord futásának bérlete lejárt (szerver-újraindulás), AKKOR legkésőbb a
  következő söprésnél (≤ 2 perc) hibára zárul a pontos üzenettel; élő bérletű futás érintetlen.
- **Megjelenítés:** 393 × 780 és 835 × 810 nézetben a fázissáv nem lóg ki, és nem takarja az alsó menü.
