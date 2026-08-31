/**
 * Shared classroom configuration for the entire application
 * Ensures consistency across backend validation, frontend selects, filters, and badges
 */

export interface ClassroomOption {
  value: number;
  label: string;
  shortLabel: string; // For mobile/compact views
}

/**
 * All available classrooms (0 = Programming Basics, 1-12 = Grades)
 */
export const CLASSROOMS: ClassroomOption[] = [
  { value: 0, label: "Programozási alapismeretek", shortLabel: "Prog." },
  { value: 1, label: "1. osztály", shortLabel: "1." },
  { value: 2, label: "2. osztály", shortLabel: "2." },
  { value: 3, label: "3. osztály", shortLabel: "3." },
  { value: 4, label: "4. osztály", shortLabel: "4." },
  { value: 5, label: "5. osztály", shortLabel: "5." },
  { value: 6, label: "6. osztály", shortLabel: "6." },
  { value: 7, label: "7. osztály", shortLabel: "7." },
  { value: 8, label: "8. osztály", shortLabel: "8." },
  { value: 9, label: "9. osztály", shortLabel: "9." },
  { value: 10, label: "10. osztály", shortLabel: "10." },
  { value: 11, label: "11. osztály", shortLabel: "11." },
  { value: 12, label: "12. osztály", shortLabel: "12." },
];

/**
 * Array of classroom numbers only (for validation and filtering)
 */
export const CLASSROOM_VALUES = CLASSROOMS.map(c => c.value);

/**
 * Min and max classroom values for validation
 */
export const MIN_CLASSROOM = 0;
export const MAX_CLASSROOM = 12;

/**
 * Default classroom for new materials
 */
export const DEFAULT_CLASSROOM = 1;

/**
 * Get classroom label by value
 */
export function getClassroomLabel(classroom: number, short: boolean = false): string {
  const option = CLASSROOMS.find(c => c.value === classroom);
  if (!option) return `${classroom}. osztály`; // Fallback
  return short ? option.shortLabel : option.label;
}

/**
 * Check if classroom is valid
 */
export function isValidClassroom(classroom: number): boolean {
  // Number.isInteger also rules out NaN and ±Infinity. The value backs an integer DB
  // column, so a fractional input would be silently truncated rather than rejected.
  return (
    Number.isInteger(classroom) &&
    classroom >= MIN_CLASSROOM &&
    classroom <= MAX_CLASSROOM
  );
}

/**
 * Extracts the classroom a material belongs to from its title.
 * Returns 0 for the "Programozási alapismeretek" track, 1-12 for a grade, and null when
 * the title carries no classroom marker.
 */
export function extractClassroomFromTitle(title: string): number | null {
  // Special case: "Programozási alapismeretek" - return 0 as special identifier
  if (/programoz[aá]si?\s+alapismeretek/i.test(title) || /programoz[aá]s\s+alapok/i.test(title)) {
    return 0;
  }

  // Match classrooms 1-12
  const patterns = [
    /\b([1-9]|1[0-2])\.\s*oszt[aá]ly/i,  // "5. osztály" or "12. osztály"
    /\boszt[aá]ly\s*([1-9]|1[0-2])\b/i,   // "osztály 5" or "osztály 12"
    /\b([1-9]|1[0-2])\s*oszt[aá]ly/i,     // "5 osztály" or "12 osztály"
    /\boszt[aá]ly:\s*([1-9]|1[0-2])\b/i,  // "osztály: 5" or "osztály: 12"
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}
