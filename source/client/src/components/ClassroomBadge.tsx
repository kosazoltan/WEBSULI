import { AlertTriangle, GraduationCap } from "lucide-react";
import { classroomDisplayLabel, normalizeClassroom } from "@shared/classrooms";

interface ClassroomBadgeProps {
  classroom: unknown;
  /** Adminban: a hiányzó / érvénytelen évfolyam figyelmeztető jelzést kap, hogy pótolható legyen. */
  warnMissing?: boolean;
  className?: string;
}

/**
 * Évfolyam-jelvény a tananyagkártyákon (docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md): a felirat a közös
 * `classroomDisplayLabel`-ből jön; a jelentést a szöveg és az ikon hordozza, nem csak a szín.
 */
export default function ClassroomBadge({ classroom, warnMissing = false, className = "" }: ClassroomBadgeProps) {
  const n = normalizeClassroom(classroom);
  const warn = n === null && warnMissing;
  const Icon = warn ? AlertTriangle : GraduationCap;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] sm:text-xs font-semibold leading-tight ${
        warn
          ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-400 dark:bg-amber-900/40 dark:text-amber-100"
          : "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-100"
      } ${className}`}
      title={warn ? "Az évfolyam hiányzik vagy érvénytelen — a szerkesztővel vagy az „Áthelyezés” művelettel pótolható" : undefined}
      data-testid="badge-classroom"
      data-classroom={n ?? "none"}
    >
      <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
      {classroomDisplayLabel(classroom)}
    </span>
  );
}
