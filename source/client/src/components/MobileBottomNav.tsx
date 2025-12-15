import { Home, FileText, Wand2, Settings, Database, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Users, Tag, Eye, Mail, BarChart3 } from "lucide-react";

interface MobileBottomNavProps {
  onTabChange?: (tab: string) => void;
  activeTab?: string;
}

export function MobileBottomNav({ onTabChange, activeTab }: MobileBottomNavProps) {
  const [location, setLocation] = useLocation();
  const [openSheet, setOpenSheet] = useState<string | null>(null);

  // Admin category navigation (4 fő kategória)
  const adminCategories = [
    { 
      icon: Users, 
      label: "Felhasználók", 
      value: "users",
      tabs: [
        { value: "users", label: "Felhasználók listája", icon: Users },
      ]
    },
    { 
      icon: FileText, 
      label: "Anyagok", 
      value: "materials",
      tabs: [
        { value: "enhanced", label: "AI Készítő", icon: Wand2 },
        { value: "pdf-upload", label: "PDF Feltöltés", icon: FileText },
        { value: "improve-materials", label: "Okosítás", icon: Sparkles },
      ]
    },
    { 
      icon: Database, 
      label: "Kezelés", 
      value: "management",
      tabs: [
        { value: "tags", label: "Tag-ek", icon: Tag },
        { value: "backup", label: "Backup", icon: Database },
        { value: "improvement-backups", label: "Okosítás Backup", icon: Database },
      ]
    },
    { 
      icon: Settings, 
      label: "Beállítások", 
      value: "settings",
      tabs: [
        { value: "material-views", label: "Megtekintések", icon: Eye },
        { value: "emails", label: "Email címek", icon: Mail },
      ]
    },
  ];

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
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border lg:hidden">
          <div className="flex items-center justify-around h-16 px-1">
            {adminCategories.map((category) => {
              const isActive = category.tabs.some(tab => tab.value === activeTab);
              
              return (
                <button
                  key={category.value}
                  onClick={() => handleCategoryClick(category)}
                  className={`
                    flex flex-col items-center justify-center flex-1 h-full gap-1
                    transition-colors hover-elevate active-elevate-2 rounded-lg
                    ${isActive 
                      ? "text-primary" 
                      : "text-muted-foreground"
                    }
                  `}
                  data-testid={`mobile-nav-${category.label.toLowerCase()}`}
                >
                  <category.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-tight text-center">{category.label}</span>
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
