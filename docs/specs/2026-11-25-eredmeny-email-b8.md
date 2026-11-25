# B8 — nagy entrópiájú, tároló-kompatibilis körazonosító (eredménylevél-bontás)

> Dátum: 2026-11-25 · Tulajdonosi döntés (űrlap, 2026-11-25): B5b, utána B6–B8. · Előzmény: `docs/specs/2026-11-22-eredmeny-email-bontas.md`
> (B8 sor; 5. pont edge case-ek; 6. pont EARS), a #510 13. vak körének L1-e és a 14. kör L1–L2-je.

## Probléma
A körazonosító ma `round-<32 bites FNV-lenyomat(kérdéssor, kezdés)>`. A szerver a végleges kör jelzősorát leckénként, TANULÓTÓL
FÜGGETLENÜL a körazonosítóhoz köti — két tanuló ütköző azonosítója esetén a második kör levele „már elküldve” lesz (ismert korlát, 5. pont).

## Döntések
1. **Új azonosító:** a kör LÉTREHOZÁSAKOR (új / újrakezdett kör) 128 bites véletlen `nonce` (32 hexa jegy, `crypto.getRandomValues`)
   kerül a kör tárolt rekordjába; a körazonosító `r2-<nonce>` (35 karakter — a szerver mostani sémájába — `[a-z0-9-]{4,64}` — belefér,
   szerveroldali változás nincs).
2. **Tároló-kompatibilitás:** a régi kliens a kör rekordját sémával olvassa és visszaírja — az ismeretlen `nonce` mezőt ELDOBJA. Nonce
   nélküli (régi vagy a régi kliens által visszaírt) körnél a régi azonosító marad (`round-<lenyomat>`).
3. **Nincs második levél (EARS, 6. pont):** a „már elküldve” jelző mindkét azonosítóra vonatkozik: küldés előtt BÁRMELYIK jelző → nem
   megy; sikeres küldés után MINDKÉT jelző íródik. Így (a) a régi kliens a régi jelzőt látja és nem küld újra; (b) a régi kliens
   nonce-vesztése után az új kliens a régi azonosítóra vált, de a régi jelzőt is látja; (c) a B8 előtt elküldött (régi jelzős) kör a
   bevezetés után sem kap második levelet.
4. A tartós sor bejegyzése (B7) a kör összes jelzőjét viszi (`alsoFlags`); bármelyik megléte → küldés nélkül kikerül.
5. A pillanatkép (B5b) és a kilét-rekord (B4b) ugyanazt a körazonosítót használja (`roundIdOf`).

## Elfogadás
- AMIKOR új kör indul, A RENDSZER `r2-` + 32 hexa jegyű azonosítóval küld, és mindkét jelzőt beírja.
- AMIKOR a kör rekordjából a `nonce` eltűnik (régi kliens írása) a küldés után, A RENDSZER nem küld újra.
- AMIKOR egy kör a régi azonosítóval már elküldött (csak a régi jelző létezik), A RENDSZER nem küld újra.

## Visszavonás
Revert: a régi azonosító-képzés visszaáll; a tárolt `nonce` ártalmatlan (a séma eldobja).
