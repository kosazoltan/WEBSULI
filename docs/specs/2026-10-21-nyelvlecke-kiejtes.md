# Nyelvleckék: kiejtésgyakorló fül, felolvasás minden eszközön, nyelvválasztós diktálás

**Tulajdonosi jelzés (2026-10-21):** a nyelvleckékből (angol, francia) „elmarad a TTS-szöveg- és szófelolvasás, valamint a
kiejtésgyakorlás”; a diktálás „mintha eltűnt volna”. Androidon (Chrome, Edge, a telefon saját böngészője) és iPhone Safariban is
működnie kell. A gyártásba rögzíteni: ha nyelvlecke, a kiejtésgyakorlás kötelező.

**Mért (élesben, 2026-10-21):** a 27 angol + 2 francia Stúdió-lecke mindegyikében van `experience.language` (en-GB / fr-FR) és
szószedet (9–65 elem, példamondattal). A felolvasás csak a Tananyag fül LEGALJÁN, a lapozó után (telefonon gyakorlatilag nem látszik);
kiejtésgyakorlás nincs; a diktálás csak magyar (`hu-HU`) felismerővel fut (angol válasz bediktálása értelmetlen); ha a böngésző nem ad
beszédfelismerést, a diktálás gomb nyom nélkül eltűnik; a felolvasás nem választ a nyelvhez illő hangot.

## Cél
1. Nyelvleckén új **„Kiejtés”** fül: sebesség-csúszka, szókártyák (szó + jelentés + példamondat), mindegyiken **Meghallgatás** és
   **Mondd ki!** (kiejtésgyakorlás: beszédfelismerés a lecke nyelvén, a hallott szöveg összevetése a céllal → ✅ / 🟡 / 🔁 visszajelzés,
   a hallott szöveg kiírásával). A Tananyag fül tetején feltűnő belépő a fülre (a régi alsó szószedet helyett).
2. **Minden eszközön működjön:** a felolvasás a nyelvhez illő hangot választja (a hangok későbbi betöltését is kezelve); ha nincs
   beszédfelismerés (pl. egyes gyártói böngészők), a gomb NEM tűnik el — egy beviteli mező jelenik meg „diktáld be a billentyűzet 🎤
   gombjával” útmutatással, és az összevetés ugyanúgy megtörténik (a telefonos billentyűzetek diktálása minden böngészőben működik).
3. **Diktálás a feladatoknál:** nyelvleckén nyelvválasztó (az idegen nyelv / magyar); támogatás hiányában útmutató szöveg a gomb helyett.
4. **Gyártás:** nyelvleckénél a szószedet a kiejtésgyakorló alapja — a bankszerződés, a csomag-prompt és a csomag-ellenőrzés fejezetenként legalább 4 elemet kér (minden tanított idegen
   szó / kifejezés, példamondattal); a lecke-típus skill rögzíti a kiejtésgyakorlást.

## Nem-cél
A tárolt leckék sémájának szigorítása (a régi, 9 elemes szószedetű lecke is érvényes marad); szerveroldali hangfelismerés.

## Edge case-ek
iOS Safari: a beszéd csak felhasználói gesztusra indul (a gombnyomás kezelőjében). Nincs hang a nyelvhez → az alapértelmezett hang a
`lang` beállítással. Mikrofon megtagadva → érthető üzenet + a beviteli mezős út. Egyszerre egy felismerés (a régi leáll).

## Elfogadás (EARS)
- HA a leckének van nyelve, AKKOR látszik a „Kiejtés” fül, benne szavanként Meghallgatás és Mondd ki!.
- HA a böngészőben nincs beszédfelismerés, AKKOR a Mondd ki! beviteli mezőt ad, és az összevetés működik.
- HA a felismert szöveg a céllal egyezik (kis-/nagybetű, írásjel nélkül), AKKOR ✅; ha közeli, AKKOR 🟡; különben 🔁.
