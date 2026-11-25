# V5c — sorozatjelvény a lecke végén (12 tengely, 11. pont)

> Dátum: 2026-11-25 · Tulajdonosi döntés (űrlap, 2026-11-25): „Egyszerű, csak megjelenítő jelvény a lecke végén (nincs új pont / XP),
> alapból KI kapcsolóval.” · Előzmény: `docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md` (11. tengely: boss-kérdés —
> V5b —, sorozatjelvény).

## Cél
A tanuló a helyi kvíz végén lássa, hány jó leckét teljesített egymás után, és 3 / 5 / 10 egymást követő jó leckénél jelvényt kapjon
(Bronz / Ezüst / Arany). Csak megjelenítés: nincs pont, XP, szerverhívás, profil-mező.

## Szabályok
1. „Jó lecke”: a helyi kvízkör eredménye ≥ 80 % (a kör lezárásakor vagy az utolsó kérdés megválaszolásakor — ugyanaz a „kész”
   feltétel, mint az eredménylevélnél).
2. Egy kör csak egyszer számít (körkulcs: tároló-kulcs + kezdés + kérdéssor; az utolsó 50 kör kulcsa megmarad).
3. Ugyanannak a leckének egy újabb jó köre nem növeli a sorozatot (a sorozat KÜLÖNBÖZŐ leckékből áll); egy 80 % alatti kör nullázza.
4. Tárolás: `localStorage` (`websuli:lesson-streak:v1`), sérült érték → üres állapot; írási hiba → a megjelenítés a memóriából.
5. Megjelenítés: a kvíz eredménye alatt egy `role="status"` sáv: „Sorozat: N jó lecke egymás után” + elért jelvény (ha van) + a következő
   szint („Még K a(z) <név> jelvényig”). 80 % alatti körnél: „A sorozat újraindul — a következő jó leckével kezdődik.”
6. **Kapcsoló:** a kliens-buildbe égetett `VITE_LESSON_STREAK_BADGE=on`; nélküle semmi nem rögzül és nem jelenik meg. Teszt-kampós
   buildben (`VITE_ENABLE_GAME_TEST_HOOKS=1`) a `window.__websuliStreakBadge === true` kapcsolja be.

## Elfogadás
- KI kapcsolónál a lap DOM-ja és a tároló változatlan (nincs sáv, nincs kulcs).
- BE kapcsolónál a 2 jó lecke utáni harmadik jó lecke Bronz jelvényt mutat; 80 % alatt a sorozat nullázódik és a szöveg ezt mondja.
- Ugyanaz a kör újratöltés után sem számít kétszer; ugyanaz a lecke újra nem növel.

## Visszavonás
A kapcsoló kikapcsolása (Vercel env) — a tárolt kulcs ártalmatlan.

## Review #606 (2026-11-25)
- A sorozat a beszámított leckék listáját (`lessons`) is tárolja: a sorozatban már szereplő lecke (nem csak a legutóbbi) újra nem növel (A → B → A = 2); nullázáskor a lista üres. Régi tárolt érték: a legutóbbi lecke beszámítottnak számít.
- Tárolás memóriabeli tartalékkal (`createStreakStore`): íráshiba után a következő betöltés a memóriából folytat, sikeres mentés után újra a tárolóból.
- A rögzítés a `LocalStreak` komponensben, amely csak a helyi kvíz ágában (PracticeAccess children) renderelődik: bejelentkezve, illetve az azonosítás betöltése / hibája alatt nem rögzül vendégkör.
