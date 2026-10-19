import LearnersPanel from "@/components/LearnersPanel";

/**
 * A „Tanulók” fül mérőoldala (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md, S1). Csak a teszt-buildben létezik
 * (VITE_ENABLE_RUNTIME_PROBE=1); a valódi `LearnersPanel`-t rendereli bejelentkezés nélkül — az adatot a teszt a hálózaton adja.
 */
export default function LearnersPanelProbe() {
  return (
    <div className="container mx-auto px-2 py-2 max-w-full">
      <LearnersPanel />
    </div>
  );
}
