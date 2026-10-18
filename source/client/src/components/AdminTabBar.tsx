import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ADMIN_TAB_GROUPS } from "@/lib/admin-tabs";

/** Az admin csoportos fülsora (spec 2026-10-18-admin-korszerusites); egy `Tabs` szülőn belül renderelendő. */
export function AdminTabBar({ hidden = false }: { hidden?: boolean }) {
  return (
    <TabsList className={`flex flex-wrap items-start justify-start gap-x-4 gap-y-2 h-auto w-full p-2 mb-3 bg-orange-50/80 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg ${hidden ? "hidden" : ""}`} data-testid="admin-tab-groups">
      {ADMIN_TAB_GROUPS.map(group => (
        <div key={group.id} role="presentation" className="flex flex-col gap-1 min-w-0" data-testid={`admin-tab-group-${group.id}`}>
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-orange-900/70 dark:text-orange-200/70">{group.label}</span>
          <div className="flex flex-wrap gap-1">
            {group.tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex items-center gap-1.5 text-[13px] h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:bg-orange-100 dark:hover:bg-orange-900/40 data-[state=active]:bg-orange-700 data-[state=active]:text-white data-[state=active]:shadow-sm" data-testid={`tab-${value}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </div>
        </div>
      ))}
    </TabsList>
  );
}
