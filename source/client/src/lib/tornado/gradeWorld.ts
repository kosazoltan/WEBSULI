/**
 * Tornádó: évfolyamonként 10 pálya → világszint (spec 2026-09-29-palyak-szoletra-nyelvek, 3. döntés; E szelet, D6).
 *
 * A kiválasztott évfolyam `AUTO_GRADE_TABLE`-sorának `from..to` tartományán 10 egyenletesen elosztott világszint:
 * az 1. pálya a tartomány eleje, a 10. a vége. A meglévő 200 szintes világ és a „Szintek” képernyő változatlan.
 */
import { GRADE_LEVEL_COUNT } from "../../game-engine/gradeLevels";
import { AUTO_GRADE_TABLE } from "./questions";

/** A pálya (1–10) világszintje az évfolyam AUTO-tartományában; érvénytelen évfolyamra `null`. */
export function tornadoWorldLevel(grade: number, level: number): number | null {
  if (!Number.isInteger(grade)) return null;
  const row = AUTO_GRADE_TABLE.find((r) => r.grades.length === 1 && r.grades[0] === grade);
  if (!row || grade < 3) return null;
  const l = Number.isFinite(level) ? Math.min(GRADE_LEVEL_COUNT, Math.max(1, Math.round(level))) : 1;
  return row.from + Math.round(((row.to - row.from) * (l - 1)) / (GRADE_LEVEL_COUNT - 1));
}

/**
 * Pályás futás időkeret-szorzója a sávból: `1,15 − 0,3·sáv` (1. pálya ×1,105; 10. pálya ×0,865). Mérsékelt, hogy a
 * 10. pálya szorosabb legyen, de teljesíthető maradjon. A „Szintek”-ből indított futás ezt nem kapja.
 */
export function tornadoLevelTimeScale(band: number): number {
  const b = Number.isFinite(band) ? Math.min(1, Math.max(0, band)) : 0;
  return 1.15 - 0.3 * b;
}
