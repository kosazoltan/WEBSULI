import { useEffect, useState } from "react";
import { Menu, PanelLeftClose } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ADMIN_TAB_GROUPS } from "@/lib/admin-tabs";

/**
 * A `Tabs` szülő elrendezése (tulajdonosi kérés 2026-11-24, #1985): 1024 px-től a menü bal oldali, ragadós oszlop,
 * a mindenkori tartalompanel (role=tabpanel) mellette tölti ki a maradék szélességet; keskenyebb kijelzőn egymás alatt.
 */
export const ADMIN_TABS_LAYOUT = "w-full lg:flex lg:items-start lg:gap-3 [&>[role=tabpanel]]:min-w-0 lg:[&>[role=tabpanel]]:flex-1";

/** Az oldalmenü töréspontja (Tailwind `lg`): ettől a menü függőleges. */
const SIDE_NAV_QUERY = "(min-width: 1024px)";

/**
 * A `Tabs` gyökér orientációja a töréspont szerint (review #578): a Radix a gyökér `orientation`-jéből állítja a lista
 * `aria-orientation`-jét ÉS a nyílbillentyű-kezelést — függőleges menüben Fel/Le, a keskeny csoportsorban Bal/Jobb léptet.
 */
export function useAdminTabsOrientation(): "vertical" | "horizontal" {
  const read = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(SIDE_NAV_QUERY).matches ? "vertical" : "horizontal");
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(SIDE_NAV_QUERY);
    const on = () => setOrientation(mq.matches ? "vertical" : "horizontal");
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return orientation;
}

const COLLAPSED_KEY = "websuli.admin.nav.collapsed";

function readCollapsed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Az admin csoportos menüje (spec 2026-10-18-admin-korszerusites; oldalmenü: #1985); egy `Tabs` szülőn belül renderelendő.
 * Asztalon ragadós oldalsáv hamburger-kapcsolóval: összecsukva csak az ikonok látszanak (a fülek akadálymentes neve és
 * `title`-je megmarad), a tartalom kiszélesedik; az állapot a böngészőben megmarad. Keskeny kijelzőn tördelt csoportsor.
 */
export function AdminTabBar({ hidden = false }: { hidden?: boolean }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* privát mód: az állapot csak a munkamenetre szól */
    }
  }, [collapsed]);

  return (
    <aside
      className={`${hidden ? "hidden" : ""} mb-3 lg:mb-0 lg:sticky lg:top-2 lg:shrink-0 lg:self-start lg:max-h-[calc(100dvh-1rem)] lg:overflow-y-auto lg:overflow-x-hidden rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50/80 dark:bg-orange-950/30 transition-[width] duration-200 motion-reduce:transition-none ${collapsed ? "lg:w-14" : "lg:w-60"}`}
      aria-label="Admin menü"
      data-testid="admin-side-nav"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className={`hidden lg:flex items-center p-2 pb-0 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && <span className="px-1 text-xs font-bold text-orange-900 dark:text-orange-200">Menü</span>}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls="admin-tab-groups"
          aria-label={collapsed ? "Menü kinyitása" : "Menü összecsukása"}
          title={collapsed ? "Menü kinyitása" : "Menü összecsukása"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
          data-testid="admin-nav-toggle"
        >
          {collapsed ? <Menu className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      <TabsList
        id="admin-tab-groups"
        className="flex flex-wrap items-start justify-start gap-x-4 gap-y-2 h-auto w-full p-2 bg-transparent lg:flex-col lg:flex-nowrap lg:gap-3"
        data-testid="admin-tab-groups"
      >
        {ADMIN_TAB_GROUPS.map((group) => (
          <div key={group.id} role="presentation" className="flex flex-col gap-1 min-w-0 lg:w-full" data-testid={`admin-tab-group-${group.id}`}>
            <span className={`px-1 text-[11px] font-semibold uppercase tracking-wide text-orange-900 dark:text-orange-200 ${collapsed ? "lg:sr-only" : ""}`}>{group.label}</span>
            {collapsed && <span aria-hidden="true" className="hidden lg:block mx-2 border-t border-orange-200 dark:border-orange-900" />}
            <div className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
              {group.tabs.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  title={label}
                  className={`flex items-center gap-1.5 text-[13px] h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:bg-orange-100 dark:hover:bg-orange-900/40 data-[state=active]:bg-orange-700 data-[state=active]:text-white data-[state=active]:shadow-sm lg:w-full lg:h-9 ${collapsed ? "lg:justify-center lg:px-0" : "lg:justify-start"}`}
                  data-testid={`tab-${value}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={collapsed ? "lg:sr-only" : "truncate"}>{label}</span>
                </TabsTrigger>
              ))}
            </div>
          </div>
        ))}
      </TabsList>
    </aside>
  );
}
