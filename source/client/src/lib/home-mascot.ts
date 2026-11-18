import { newestFirst } from "@/lib/home-views";

/**
 * A Websuli makija a főoldalon — tiszta logika (terv: docs/specs/2026-11-18-kabala-fooldal.md). Nincs benne React és DOM-írás:
 * a kapcsoló olvasása, a három legújabb tananyag kiválasztása, a feliratok kódszótára, az eszközön megjegyzett beállítás és az
 * állapotgép átmenetei. A megjelenítő (`client/src/mascot/HomeMascot.tsx`) csak ezeket hívja.
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

/** Az ajánlott tananyag címe — ugyanaz az út, mint a kártyáknál (client/src/pages/Home.tsx, handleViewFile). */
export function mascotHref(file: { id: string; contentType?: string }): string {
  return file.contentType === "pdf" ? `/materials/pdf/${file.id}` : `/preview/${file.id}`;
}

// ───────────────────────── feliratok (kódszótár) ─────────────────────────

export type PhraseGroup = "greeting" | "returning" | "pick" | "closing" | "rest" | "single";

/** A buborék mondatai. A `{title}` helyére a tananyag címe kerül. Rövid, kedves, tegező; csoportonként több változat. */
export const MASCOT_PHRASES: Record<PhraseGroup, readonly string[]> = {
  greeting: [
    "Szia! Én a Websuli makija vagyok. Nézd, mit hoztam!",
    "Hahó! Friss tananyagokat találtam neked!",
    "Szia! Gyere, megmutatom a legújabbakat!",
  ],
  returning: [
    "Szia újra! Van itt valami friss!",
    "Örülök, hogy megint itt vagy!",
    "Hahó! Nézzük, mi az újdonság ma!",
  ],
  pick: [
    "Ezt nézd: {title}",
    "Friss és ropogós: {title}",
    "Ezt neked hoztam: {title}",
    "Kipróbálod? {title}",
    "Szerintem tetszeni fog: {title}",
    "Ide ugorj velem: {title}",
  ],
  closing: [
    "Ennyit hoztam mára. Jó tanulást!",
    "Válassz egyet, és vágjunk bele!",
    "Melyik tetszik? Koppints rá!",
  ],
  rest: [
    "Koppints rám, mutatok másikat!",
    "Itt vagyok, ha kell egy ötlet. Koppints rám!",
    "Melyikkel kezded? Koppints rám a következőért!",
  ],
  single: [
    "Ez most a legfrissebb: {title}",
    "Egyet hoztam, de az nagyon jó: {title}",
    "Hopp! Ezt ne hagyd ki: {title}",
  ],
};

/** A buborékban a cím legfeljebb ennyi karakter; a teljes cím a sorban olvasható. */
export const MASCOT_TITLE_MAX = 60;

/**
 * Determinisztikus mondatválasztás: ugyanarra a magra ugyanaz a mondat; ha az megegyezne az előzővel, a következő változat jön
 * (egymás után kétszer ugyanaz a sablon nem hangzik el).
 */
export function pickPhrase(group: PhraseGroup, seed: number, previous?: string | null): string {
  const list = MASCOT_PHRASES[group];
  const start = ((Math.trunc(seed) % list.length) + list.length) % list.length;
  const chosen = list[start];
  return chosen === previous && list.length > 1 ? list[(start + 1) % list.length] : chosen;
}

/** A sablon kitöltése a címmel; a hosszú cím szóhatáron (ha van) levágva, „…”-tal. */
export function fillPhrase(template: string, title: string | null | undefined): string {
  const clean = (title ?? "").replace(/\s+/g, " ").trim();
  let shown = clean;
  if (clean.length > MASCOT_TITLE_MAX) {
    const cut = clean.slice(0, MASCOT_TITLE_MAX - 1);
    const space = cut.lastIndexOf(" ");
    shown = `${(space > MASCOT_TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
  }
  return template.replace("{title}", shown);
}

/** A nap sorszáma (helyi idő szerint) — a mondatválasztás magja, hogy naponta más köszönés jöjjön. */
export function daySeed(now: Date): number {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
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

// ───────────────────────── állapotgép ─────────────────────────

/**
 * `enter`: integet és köszön · `present`: az `index`-edik tananyagnál áll és rámutat (`auto`: a körbevezetés része) ·
 * `cheer`: örömugrás (a körbevezetés vége, vagy koppintás egyetlen tananyagnál) · `rest`: pihen, magától nem mozdul.
 */
export type MascotStep =
  | { kind: "enter" }
  | { kind: "present"; index: number; auto: boolean }
  | { kind: "cheer"; index: number; single: boolean }
  | { kind: "rest"; index: number };

/** `done`: az aktuális lépés ideje letelt · `tap`: a látogató a makira koppintott. */
export type MascotEvent = { type: "done" } | { type: "tap" };

/** Meddig tart egy lépés (ms), mielőtt a `done` esemény jön; `null`: nincs időzítés (pihenés). */
export const MASCOT_DWELL_MS = { enter: 1900, present: 5000, cheer: 1900 } as const;

export function stepIndex(step: MascotStep): number {
  return step.kind === "enter" ? 0 : step.index;
}

/**
 * Az állapotgép egyetlen átmenete. `count`: az ajánlott tananyagok száma (≥ 1); `returning`: járt-e már itt a látogató
 * (visszatérőnél nincs körbevezetés — az első ajánlás után pihen).
 */
export function nextStep(step: MascotStep, event: MascotEvent, ctx: { count: number; returning: boolean }): MascotStep {
  const count = Math.max(1, ctx.count);
  const index = Math.min(stepIndex(step), count - 1);
  if (event.type === "tap") {
    if (step.kind === "enter") return { kind: "present", index: 0, auto: false };
    if (count === 1) return { kind: "cheer", index: 0, single: true };
    return { kind: "present", index: (index + 1) % count, auto: false };
  }
  switch (step.kind) {
    case "enter":
      return { kind: "present", index: 0, auto: !ctx.returning && count > 1 };
    case "present":
      if (!step.auto) return { kind: "rest", index };
      return index + 1 < count ? { kind: "present", index: index + 1, auto: true } : { kind: "cheer", index, single: false };
    case "cheer":
    case "rest":
      return { kind: "rest", index };
  }
}

/** Melyik mondatcsoport tartozik a lépéshez. */
export function phraseGroupFor(step: MascotStep, returning: boolean): PhraseGroup {
  switch (step.kind) {
    case "enter":
      return returning ? "returning" : "greeting";
    case "present":
      return "pick";
    case "cheer":
      return step.single ? "single" : "closing";
    case "rest":
      return "rest";
  }
}

// ───────────────────────── a hely lefoglalása ─────────────────────────

/**
 * A sáv RÖGZÍTETT magassága tananyagszám szerint (telefon / ≥ 640 px) — a hely a lusta darab betöltése előtt le van foglalva,
 * így nincs elrendezés-ugrás. Statikus osztálynevek (a Tailwind csak így találja meg őket). A számok levezetése a tervben (4.6)
 * és a `client/src/mascot/home-mascot.css` változóiban; a böngészőteszt méri, hogy a tartalom pontosan belefér.
 */
export const MASCOT_BOX_CLASS: Record<1 | 2 | 3, string> = {
  1: "h-[246px] sm:h-[284px]",
  2: "h-[248px] sm:h-[284px]",
  3: "h-[322px] sm:h-[334px]",
};
/** Bezárt állapot: egyetlen 44 px-es visszahívó gomb. */
export const MASCOT_HIDDEN_CLASS = "h-11";
