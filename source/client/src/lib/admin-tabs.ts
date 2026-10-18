import type { LucideIcon } from "lucide-react";
import {
  Activity, Database, Eye, FileUp, FolderOpen, GraduationCap, HardDriveDownload, History, ListChecks, Mail, Sparkles, Tag, UserRound, Users, Wand2, Wrench,
} from "lucide-react";

/**
 * Az admin menü egyetlen forrása (docs/specs/2026-10-18-admin-korszerusites.md): az asztali fülsor és a mobil alsó menü is
 * ebből épül. A `value` a deep link (`/admin?tab=…`) és a `data-testid` (`tab-<value>`) alapja — nem változhat.
 */
export type AdminTab = { value: string; label: string; icon: LucideIcon };
export type AdminTabGroup = { id: string; label: string; tabs: AdminTab[] };

export const ADMIN_TAB_GROUPS: AdminTabGroup[] = [
  { id: "materials", label: "Tananyagok", tabs: [
    { value: "files", label: "Fájlok", icon: FolderOpen },
    { value: "pdf-upload", label: "PDF-feltöltés", icon: FileUp },
    { value: "tags", label: "Címkék", icon: Tag },
    { value: "material-views", label: "Megtekintések", icon: Eye },
  ] },
  { id: "authoring", label: "Készítés és javítás", tabs: [
    { value: "lesson-studio", label: "Tananyag készítése", icon: Sparkles },
    { value: "workflows", label: "Futások", icon: ListChecks },
    { value: "lesson-repair", label: "Tananyagjavító", icon: Wrench },
    { value: "improve-materials", label: "Régi anyag okosítása", icon: Wand2 },
  ] },
  { id: "communication", label: "Kommunikáció", tabs: [
    { value: "emails", label: "E-mail címzettek", icon: Mail },
    { value: "email-debug", label: "E-mail diagnosztika", icon: Activity },
    { value: "parent-dashboard", label: "Szülői összesítő", icon: GraduationCap },
    // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S4)
    { value: "learners", label: "Tanulók", icon: UserRound },
  ] },
  { id: "system", label: "Rendszer", tabs: [
    { value: "users", label: "Felhasználók", icon: Users },
    { value: "backup", label: "Mentés és visszaállítás", icon: HardDriveDownload },
    { value: "improvement-backups", label: "Javítási mentések", icon: History },
    { value: "database", label: "Adatbázis", icon: Database },
  ] },
];

export const ADMIN_TAB_VALUES: string[] = ADMIN_TAB_GROUPS.flatMap(g => g.tabs.map(t => t.value));

/** Megszűnt fülek régi deep linkjei: a tudástérkép (LS-8) és a duplikált „AI” fül a tananyagkészítésbe került. */
const LEGACY_TABS = new Map<string, string>([["knowledge-maps", "lesson-studio"], ["enhanced", "lesson-studio"]]);

export function resolveAdminTab(param: string | null | undefined): string {
  if (!param) return "files";
  // Review #287: Map — a `?tab=constructor` / `__proto__` nem örökölt prototípus-mezőt ad vissza.
  const legacy = LEGACY_TABS.get(param);
  if (legacy) return legacy;
  return ADMIN_TAB_VALUES.includes(param) ? param : "files";
}
