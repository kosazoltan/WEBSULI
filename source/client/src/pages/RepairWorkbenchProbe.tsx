import LessonRepairWorkbench from "@/components/LessonRepairWorkbench";

/**
 * A Tananyagjavító mérőoldala (docs/specs/2026-10-19-javito-valaszto-mobil.md). Csak a teszt-buildben létezik
 * (VITE_ENABLE_RUNTIME_PROBE=1); a valódi `LessonRepairWorkbench`-et rendereli bejelentkezés nélkül — az adatot a teszt a hálózaton adja.
 */
export default function RepairWorkbenchProbe() {
  return (
    <div className="container mx-auto px-2 py-2 max-w-full">
      <LessonRepairWorkbench />
    </div>
  );
}
