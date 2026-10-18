import { FileText, Settings, Sparkles, Mail, type LucideIcon } from "lucide-react";
import { ADMIN_TAB_GROUPS } from "@/lib/admin-tabs";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface MobileBottomNavProps {
  onTabChange?: (tab: string) => void;
  activeTab?: string;
}

export function MobileBottomNav({ onTabChange, activeTab }: MobileBottomNavProps) {
  const [location, setLocation] = useLocation();
  const [openSheet, setOpenSheet] = useState<string | null>(null);

  // Admin kategóriák (4 fő csoport) — a közös admin-menüből (lib/admin-tabs.ts, spec 2026-10-18-admin-korszerusites).
  const CATEGORY_ICON: Record<string, LucideIcon> = { materials: FileText, authoring: Sparkles, communication: Mail, system: Settings };
  const SHORT_LABEL: Record<string, string> = { materials: "Anyagok", authoring: "Készítés", communication: "Üzenetek", system: "Rendszer" };
  const adminCategories = ADMIN_TAB_GROUPS.map(group => ({
    icon: CATEGORY_ICON[group.id] ?? Settings,
    label: SHORT_LABEL[group.id] ?? group.label,
    value: group.id,
    tabs: group.tabs,
  }));

  const handleCategoryClick = (category: typeof adminCategories[0]) => {
    // Ha nem az /admin oldalon vagyunk, átirányítunk oda
    if (!location.startsWith("/admin")) {
      setLocation(`/admin?tab=${category.tabs[0].value}`);
      return;
    }

    if (category.tabs.length === 1) {
      // Ha csak 1 tab van a kategóriában, egyből azt nyitjuk meg
      onTabChange?.(category.tabs[0].value);
    } else {
      // Ha több tab van, megnyitjuk a Sheet-et
      setOpenSheet(category.value);
    }
  };

  const handleTabSelect = (tabValue: string) => {
    // Ha nem az /admin oldalon vagyunk, átirányítunk oda
    if (!location.startsWith("/admin")) {
      setLocation(`/admin?tab=${tabValue}`);
      setOpenSheet(null);
      return;
    }

    onTabChange?.(tabValue);
    setOpenSheet(null);
  };

  // CRITICAL SECURITY: Admin navigation - ONLY for authenticated admin users
  return (
      <>
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border lg:hidden" aria-label="Admin navigáció">
          <div className="flex items-center justify-around h-16 px-1">
            {adminCategories.map((category) => {
              const isActive = category.tabs.some(tab => tab.value === activeTab);

              return (
                <button
                  key={category.value}
                  onClick={() => handleCategoryClick(category)}
                  aria-label={`${category.label} menü megnyitása`}
                  aria-current={isActive ? "page" : undefined}
                  className={`
                    flex flex-col items-center justify-center flex-1 min-h-[48px] gap-1
                    transition-colors hover-elevate active-elevate-2 rounded-lg
                    ${isActive
                      ? "text-orange-700 dark:text-orange-400"
                      : "text-muted-foreground"
                    }
                  `}
                  data-testid={`mobile-nav-${category.label.toLowerCase()}`}
                >
                  <category.icon className="w-5 h-5" />
                  <span className="text-xs font-medium leading-tight text-center">{category.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Sheet modals a több tabot tartalmazó kategóriákhoz */}
        {adminCategories.map((category) => (
          category.tabs.length > 1 && (
            <Sheet 
              key={category.value} 
              open={openSheet === category.value} 
              onOpenChange={(open) => setOpenSheet(open ? category.value : null)}
            >
              <SheetContent side="bottom" className="max-h-[80vh]">
                <SheetHeader>
                  <SheetTitle>{category.label}</SheetTitle>
                </SheetHeader>
                <div className="grid gap-2 py-4">
                  {category.tabs.map((tab) => (
                    <Button
                      key={tab.value}
                      variant={activeTab === tab.value ? "default" : "outline"}
                      className="w-full justify-start gap-2"
                      onClick={() => handleTabSelect(tab.value)}
                      data-testid={`sheet-tab-${tab.value}`}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )
        ))}
      </>
    );
}
