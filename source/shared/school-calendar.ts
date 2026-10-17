/**
 * A tanév rendje (docs/specs/2026-10-17-tanmenet-rendezes.md) — tiszta modul. Forrás: Nemzeti Jogszabálytár,
 * 2025/2026: 27/2025. (VII. 24.) BM rendelet; 2026/2027: 1/2026. (VII. 31.) OGYM rendelet (köznevelés, I. rész).
 * A szünetek a „szünet előtti utolsó” és „utáni első” tanítási nappal adottak; a hétvége nem tanítási nap. A munkaszüneti napok
 * (pl. október 23.) nincsenek külön levonva — a pozíció így legfeljebb egy-két napot téved.
 */
export type SchoolYear = { label: string; firstDay: string; lastDay: string; breaks: Array<{ name: string; lastBefore: string; firstAfter: string }> };

export const SCHOOL_YEARS: readonly SchoolYear[] = [
  {
    label: "2025/2026", firstDay: "2025-09-01", lastDay: "2026-06-19",
    breaks: [
      { name: "őszi", lastBefore: "2025-10-22", firstAfter: "2025-11-03" },
      { name: "téli", lastBefore: "2025-12-19", firstAfter: "2026-01-05" },
      { name: "tavaszi", lastBefore: "2026-04-01", firstAfter: "2026-04-13" },
    ],
  },
  {
    label: "2026/2027", firstDay: "2026-09-01", lastDay: "2027-06-18",
    breaks: [
      { name: "őszi", lastBefore: "2026-10-22", firstAfter: "2026-11-02" },
      { name: "téli", lastBefore: "2026-12-18", firstAfter: "2027-01-04" },
      { name: "tavaszi", lastBefore: "2027-03-24", firstAfter: "2027-04-05" },
    ],
  },
];

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

function isTeachingDay(t: number, y: SchoolYear): boolean {
  const wd = new Date(t).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !y.breaks.some(b => t > utc(b.lastBefore) && t < utc(b.firstAfter));
}

/** A tanév tanítási napjainak száma `from`-tól `to`-ig (mindkettő benne). */
function teachingDays(y: SchoolYear, from: number, to: number): number {
  let n = 0;
  for (let t = from; t <= to; t += DAY) if (isTeachingDay(t, y)) n++;
  return n;
}

/**
 * A nap helye a tanévben 0–1 között (a tanítási napok aránya). Szünetben és hétvégén az előző tanítási nap értéke; nyári szünetben
 * (és ismeretlen tanévben) 0 — a következő tanév eleje, így szeptemberi témák állnak elöl.
 */
export function schoolYearPosition(date: Date, years: readonly SchoolYear[] = SCHOOL_YEARS): number {
  const t = dayOf(date);
  const y = years.find(s => t >= utc(s.firstDay) && t <= utc(s.lastDay));
  if (!y) return 0;
  const total = teachingDays(y, utc(y.firstDay), utc(y.lastDay));
  const done = teachingDays(y, utc(y.firstDay), t);
  return total > 0 ? Math.min(1, Math.max(0, (done - 0.5) / total)) : 0;
}
