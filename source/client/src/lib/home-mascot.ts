import { newestFirst } from "@/lib/home-views";

/**
 * A Websuli makija a főoldalon — tiszta logika (terv: docs/specs/2026-11-18-kabala-fooldal.md). Nincs benne React és DOM-írás:
 * a kapcsoló olvasása, a három legújabb tananyag kiválasztása, az eszközön megjegyzett beállítás és a hely lefoglalása — ez a
 * rész a főoldal fő JS-darabjába kerül, ezért szándékosan kicsi. A feliratok kódszótára és az állapotgép a lustán betöltött
 * darabban van: `client/src/mascot/mascot-script.ts`.
 */

/** A szerver ezt a meta-sort teszi az index.html-be, ha a `HOME_MASCOT` kapcsoló `on` (server/lib/home-flags.ts). */
export const HOME_MASCOT_META_NAME = "websuli-home-mascot";

/** A kapcsoló a kliensen: szinkron, hálózati kérés nélkül (az első rajzoláskor már ismert → nincs elrendezés-ugrás). */
export function homeMascotEnabled(doc: Pick<Document, "querySelector"> | undefined = typeof document === "undefined" ? undefined : document): boolean {
  if (!doc) return false;
  return doc.querySelector(`meta[name="${HOME_MASCOT_META_NAME}"]`)?.getAttribute("content") === "on";
}

export const MASCOT_PICK_LIMIT = 3;
/** Ennyi napnál frissebb tananyag kap „Új” jelvényt (ugyanaz az ablak, mint az üdvözlő kártyán: client/src/lib/learner.ts). */
export const MASCOT_NEW_DAYS = 30;

export type MascotMaterial = { id: string; title: string; classroom: number; createdAt: string; contentType?: string };

/**
 * A „legújabb három”: ha a tanuló évfolyama ismert ÉS azon az évfolyamon van tananyag, az évfolyam három legújabbja; különben
 * (ismeretlen évfolyam, anyag nélküli évfolyam, admin → `grade = null`) az összes tananyag három legújabbja. Rendezés: `createdAt`
 * csökkenő, holtversenynél azonosító szerint (stabil); érvénytelen dátum a legrégebbi. 0 / 1 / 2 tananyagnál ennyi elem jön vissza.
 */
export function mascotPicks<T extends { id: string; classroom: number; createdAt: string }>(
  files: readonly T[],
  grade: number | null,
  now: Date,
): { files: T[]; fromGrade: boolean; isNew: (file: T) => boolean } {
  const own = grade == null ? [] : files.filter((f) => (f.classroom ?? 1) === grade);
  const cutoff = now.getTime() - MASCOT_NEW_DAYS * 86_400_000;
  const isNew = (file: T) => {
    const t = Date.parse(file.createdAt);
    return !Number.isNaN(t) && t >= cutoff;
  };
  return { files: newestFirst(own.length ? own : files).slice(0, MASCOT_PICK_LIMIT), fromGrade: own.length > 0, isNew };
}

// ───────────────────────── az eszközön megjegyzett beállítás ─────────────────────────

export const MASCOT_PREFS_KEY = "websuli:home-mascot";
/** `on`: mozog · `quiet`: lecsendesítve (áll, nincs körbevezetés) · `hidden`: bezárva (csak a visszahívó gomb látszik). */
export type MascotMode = "on" | "quiet" | "hidden";
export type MascotPrefs = { v: 1; mode: MascotMode; seen: number };
export const DEFAULT_MASCOT_PREFS: MascotPrefs = { v: 1, mode: "on", seen: 0 };
const MODES: readonly MascotMode[] = ["on", "quiet", "hidden"];

/** Csak a pontos alak érvényes; minden más (sérült, régi, idegen) az alapállapot. */
export function parseMascotPrefs(raw: string | null | undefined): MascotPrefs {
  if (!raw) return DEFAULT_MASCOT_PREFS;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object") {
      const { v, mode, seen } = value as Record<string, unknown>;
      if (v === 1 && typeof mode === "string" && (MODES as readonly string[]).includes(mode) && typeof seen === "number" && Number.isInteger(seen) && seen >= 0) {
        return { v: 1, mode: mode as MascotMode, seen: Math.min(seen, 9999) };
      }
    }
  } catch {
    // sérült érték: alapállapot
  }
  return DEFAULT_MASCOT_PREFS;
}

export function serializeMascotPrefs(prefs: MascotPrefs): string {
  return JSON.stringify({ v: 1, mode: prefs.mode, seen: prefs.seen });
}

export function loadMascotPrefs(): MascotPrefs {
  try {
    return parseMascotPrefs(window.localStorage.getItem(MASCOT_PREFS_KEY));
  } catch {
    return DEFAULT_MASCOT_PREFS;
  }
}

export function saveMascotPrefs(prefs: MascotPrefs): void {
  try {
    window.localStorage.setItem(MASCOT_PREFS_KEY, serializeMascotPrefs(prefs));
  } catch {
    // privát mód / tiltott tárhely: a választás csak erre a megnyitásra szól
  }
}

// ───────────────────────── a hely lefoglalása ─────────────────────────

/**
 * A sáv RÖGZÍTETT magassága tananyagszám szerint (telefon / ≥ 640 px) — a hely a lusta darab betöltése előtt le van foglalva,
 * így nincs elrendezés-ugrás. Statikus osztálynevek (a Tailwind csak így találja meg őket). A számok levezetése a tervben (4.6)
 * és a `client/src/mascot/home-mascot.css` változóiban; a böngészőteszt méri, hogy a tartalom pontosan belefér.
 */
export const MASCOT_BOX_CLASS: Record<1 | 2 | 3, string> = {
  1: "h-[172px] sm:h-[286px]",
  2: "h-[172px] sm:h-[286px]",
  3: "h-[200px] sm:h-[336px]",
};
/** Bezárt állapot: egyetlen 44 px-es visszahívó gomb. */
export const MASCOT_HIDDEN_CLASS = "h-11";
