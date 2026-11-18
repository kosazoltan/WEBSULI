/**
 * A Websuli makija a főoldalon — a „forgatókönyv”: a feliratok kódszótára, a mondatválasztás és az állapotgép átmenetei
 * (terv: docs/specs/2026-11-18-kabala-fooldal.md, 4.5). Tiszta függvények, React és DOM nélkül. A lustán betöltött darab része
 * (a főoldal fő JS-darabjába nem kerül be) — a fő darab logikája: `client/src/lib/home-mascot.ts`.
 */

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
