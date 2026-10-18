import { useState } from "react";
import { Search } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AdminTabBar } from "@/components/AdminTabBar";

/**
 * Az admin menü és a fájlkereső mérőoldala (spec 2026-10-18-admin-korszerusites). Csak a teszt-buildben létezik
 * (VITE_ENABLE_RUNTIME_PROBE=1); a valódi `AdminTabBar`-t és a kereső osztályait rendereli bejelentkezés és adat nélkül.
 */
export default function AdminTabsProbe() {
  const [tab, setTab] = useState("files");
  return (
    <div className="container mx-auto px-2 py-2 max-w-full" data-testid="admin-panel">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <AdminTabBar />
      </Tabs>
      <div className="relative max-w-xl">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input data-testid="probe-admin-search" placeholder="Keresés..." className="pl-8 h-7 text-xs w-full border-orange-300 focus:border-orange-500 dark:border-orange-700" />
      </div>
      <p data-testid="probe-active-tab">{tab}</p>
    </div>
  );
}
