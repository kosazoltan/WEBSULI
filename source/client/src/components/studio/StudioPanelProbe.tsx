import LessonStudioPanel from "@/components/studio/LessonStudioPanel";

/**
 * LS-8 (#191) — böngészős mérőoldal a tananyagkészítés panelhez.
 *
 * Az admin oldal bejelentkezést kíván, amit az e2e nem tud kiállítani, ezért a
 * panelt izoláltan rendereljük ki. Ugyanaz a minta, mint a LS-2 lecke-futtató
 * mérőoldala: CSAK akkor létezik, ha a build kifejezetten bekapcsolta
 * (`VITE_ENABLE_RUNTIME_PROBE=1`) — az éles bundle-ben nincs benne.
 *
 * Amit mér: a feltöltés az elsődleges felület, a tudás-térkép választó
 * alapértelmezésben nincs a képernyőn, és a haladó blokk kinyitható.
 */
export default function StudioPanelProbe() {
  return (
    <div className="p-4" data-testid="studio-panel-probe">
      <LessonStudioPanel />
    </div>
  );
}
