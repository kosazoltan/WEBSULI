import { OTHER_SUBJECT, subjectLabel } from "@shared/subjects";

/**
 * Nyilvános főoldal: „Legfrissebb” és „Tantárgyanként” nézet, külön (VAGY) és együtt (ÉS) —
 * docs/specs/2026-11-03-fooldal-nezetek.md. Tiszta függvények; a komponens csak megjelenít.
 */
export type HomeView = { newest: boolean; bySubject: boolean };
export const DEFAULT_HOME_VIEW: HomeView = { newest: false, bySubject: false };
export const HOME_VIEW_STORAGE_KEY = "websuli:home-view";
/** Mindkét nézetnél ennyi legújabb anyag kerül a felső „Legfrissebb” sávba. */
export const NEWEST_STRIP = 8;

/** Csak a pontos `{newest: boolean, bySubject: boolean}` alak érvényes; minden más (sérült, régi, idegen) az alapnézet. */
export function parseHomeView(raw: string | null | undefined): HomeView {
  if (!raw) return DEFAULT_HOME_VIEW;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object") {
      const { newest, bySubject } = value as Record<string, unknown>;
      if (typeof newest === "boolean" && typeof bySubject === "boolean") return { newest, bySubject };
    }
  } catch {
    // sérült érték: alapnézet
  }
  return DEFAULT_HOME_VIEW;
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** A legújabb elkészült elöl (`createdAt` csökkenő); azonos időnél azonosító szerint, hogy a sorrend stabil legyen. */
export function newestFirst<T extends { id: string; createdAt: string }>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id));
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Főoldali keresés: cím, leírás ÉS a tantárgy neve, kis-nagybetűtől és ékezettől függetlenül. Tulajdonosi képernyőkép
 * (2026-11-03): 9. osztályban az „Irodalom” keresés semmit nem adott, pedig az Antigoné és az Íliász irodalom anyag.
 */
export function matchesHomeSearch(file: { title: string; description?: string | null; subject?: string | null }, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return [file.title, file.description ?? "", file.subject ? subjectLabel(file.subject) : ""].some((field) => fold(field).includes(q));
}

export type SubjectGroup<T> = { label: string; files: T[] };

/** Tantárgyi szakaszok a megjelenített név szerint (magyar ábécé), az „Egyéb” mindig utolsó; a belső sorrendet `order` adja. */
export function groupBySubject<T extends { subject?: string | null }>(
  files: readonly T[],
  order: (list: T[]) => T[],
): SubjectGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const file of files) {
    const label = subjectLabel(file.subject);
    const list = groups.get(label);
    if (list) list.push(file);
    else groups.set(label, [file]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === OTHER_SUBJECT ? 1 : b === OTHER_SUBJECT ? -1 : a.localeCompare(b, "hu")))
    .map(([label, list]) => ({ label, files: order(list) }));
}
