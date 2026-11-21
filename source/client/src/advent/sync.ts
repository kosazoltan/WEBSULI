/**
 * Adventi naptár — a kliens tiszta adat-segédei (docs/specs/2026-11-18-adventi-naptar.md 22.; a 3/3 PR GPT-vak L2, L4–L6). Vite-függés
 * nélkül, hogy node-tesztből is ellenőrizhető legyen.
 */
import type { QueryClient } from "@tanstack/react-query";

export const ADVENT_STATE_KEY = ["advent-state"] as const;

/**
 * L4 — a következő frissítés késleltetése: a szerver által számolt várakozás („nextOpensInMs”) mínusz a válasz ÓTA eltelt idő (mindkét
 * időpont a kliens órájából, így az eszköz eltérő órája kiesik), plusz 1 mp tartalék. Lekésett határnál 1 mp; nincs nyitás → null.
 */
export function refreshDelayMs(state: { nextOpensInMs?: number | null } | null | undefined, receivedAt: number, now: number): number | null {
  const wait = state?.nextOpensInMs;
  if (typeof wait !== "number" || !Number.isFinite(wait)) return null;
  const delay = Math.max(0, wait - Math.max(0, now - receivedAt)) + 1000;
  return delay > 2_147_000_000 ? null : delay;
}

/** L5 — a státusz HTTP-hibája HIBA (újrapróbálható), nem „kikapcsolt”: csak a sikeres válasz „enabled: false” értéke csukja össze a kártyát. */
export async function statusFromResponse<T>(res: { ok: boolean; status: number; json: () => Promise<unknown> }): Promise<T> {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

/**
 * L2 — alanyváltáskor (játékos be- / kilépés) az előző gyerek adventi állapota törlődik: előbb a függőben lévő kérés megszakad (a késve
 * érkező régi válasz nem töltheti vissza), utána a bejegyzés eltűnik.
 */
export async function clearAdventCache(queryClient: QueryClient): Promise<void> {
  // Új alany-generáció (PR-C vak L3): a lekérdezés új kulcsra vált, a régi generációval indult írás már nem kerül vissza.
  bumpAdventSubject();
  await queryClient.cancelQueries({ queryKey: ADVENT_STATE_KEY });
  queryClient.removeQueries({ queryKey: ADVENT_STATE_KEY });
}

/** L6 — a válasz alkalmazása: a teljes ablaklista (ha a szerver adja) az összesítéssel együtt cserélődik; régi válasznál a megválaszolt ablak. */
export function applyAnswerResult<D extends { day: number }, T extends { doors: D[]; summary: unknown; closing: unknown }>(
  state: T,
  result: { door: D; doors?: D[]; summary: T["summary"]; closing: T["closing"]; version?: number },
): T {
  const doors = Array.isArray(result.doors) && result.doors.length > 0 ? result.doors : state.doors.map((d) => (d.day === result.door.day ? result.door : d));
  // A válasz utáni szerververzió is átkerül (PR-C 3. vak L1): egy később kézbesített régebbi írás ehhez mérődik.
  return { ...state, doors, summary: result.summary, closing: result.closing, ...(typeof result.version === "number" ? { version: result.version } : {}) };
}

/**
 * PR-C 3. vak L1 — régebbi-e a bejövő állás a gyorsítótárban lévőnél: mindkettő szerververziója szám, és a bejövőé kisebb. (Verzió nélküli
 * — régi szervertől jövő — állásnál nincs összevetés.) A szerver a sor módosítási idejét adja, amely a soronkénti zár miatt az írások
 * sorrendjében nő; így egy korábban feldolgozott, de később kézbesített válasz (pl. az összesítés átvétele) nem festi vissza a már
 * megoldott ablakot.
 */
export function isOlderAdventState(next: unknown, current: unknown): boolean {
  const versionOf = (value: unknown): number | null => {
    const v = typeof value === "object" && value !== null ? (value as { version?: unknown }).version : undefined;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const a = versionOf(next);
  const b = versionOf(current);
  return a !== null && b !== null && a < b;
}

/**
 * PR-C vak L3 — az adventi állapot ALANY-GENERÁCIÓJA (nem titkos számláló): minden alanyváltás (játékos be- / kilépés, tanulói kapcsolat
 * kötése / bontása, a tanulói token eltárolása / törlése / elutasítása, másik lapon változott token) új generációt ad. A lekérdezés
 * kulcsa a generációt is hordozza, így a korábbi alany adata nem látszik, és a régi generációval indult írás eredménye nem kerül vissza.
 */
let subjectGeneration = 0;
const subjectListeners = new Set<() => void>();

export function adventSubjectGeneration(): number {
  return subjectGeneration;
}

export function subscribeAdventSubject(listener: () => void): () => void {
  subjectListeners.add(listener);
  return () => { subjectListeners.delete(listener); };
}

export function bumpAdventSubject(): number {
  subjectGeneration++;
  for (const listener of [...subjectListeners]) listener();
  return subjectGeneration;
}

/** Az állapot gyorsítótár-kulcsa egy generációhoz (a `clearAdventCache` és az érvénytelenítés az előtag szerint mindet eléri). */
export function adventStateKey(generation: number = subjectGeneration): readonly [typeof ADVENT_STATE_KEY[0], number] {
  return [ADVENT_STATE_KEY[0], generation] as const;
}

/** Írás a gyorsítótárba CSAK akkor, ha a kérés indításakori generáció még az aktuális (a késve érkező régi POST nem írhat). */
export function setAdventStateIfCurrent(queryClient: QueryClient, generation: number, next: unknown): boolean {
  if (generation !== subjectGeneration) return false;
  queryClient.setQueryData(adventStateKey(generation), next);
  return true;
}

/**
 * A tanulói token változásának figyelése: a másik lap `storage` eseménye (a token kulcsára, vagy teljes törlésnél `key: null`) és a
 * saját lap jelzése (`eventName`). Mindkettő új generációt ad. Visszaad egy leiratkozó függvényt.
 */
export function watchAdventSubject(target: EventTarget, tokenKey: string, eventName: string): () => void {
  const onStorage = (event: Event) => {
    const key = (event as Event & { key?: string | null }).key;
    if (key === tokenKey || key === null) bumpAdventSubject();
  };
  const onChanged = () => { bumpAdventSubject(); };
  target.addEventListener("storage", onStorage);
  target.addEventListener(eventName, onChanged);
  return () => {
    target.removeEventListener("storage", onStorage);
    target.removeEventListener(eventName, onChanged);
  };
}

/**
 * PR-C vak L4 — a szerveróra-minta horgonya: új minta (más `nextOpensInMs`) érkezésekor a minta érkezési ideje; a helyi állapotírás
 * (pl. `applyAnswerResult`, amely a várakozást változatlanul hagyja, de új `dataUpdatedAt`-et ad) NEM mozdítja el.
 */
export type RefreshAnchor = { wait: number | null; at: number };
export function nextRefreshAnchor(prev: RefreshAnchor | null, wait: number | null, receivedAt: number): RefreshAnchor {
  return prev && prev.wait === wait ? prev : { wait, at: receivedAt };
}

/**
 * PR-C vak L6 — minden író belépő SZINKRON őre: az érvénytelen párosítást a GET már jelezte (`pairing`), a munkameneti jelző már beállt
 * (`lost`: a profil-lekérdezés közben törölte a tokent), vagy a gyereknek még választania kell (`mustChoose`) — bármelyik tiltja az írást.
 */
export function adventWriteBlocked(input: { mustChoose: boolean; lost: boolean; pairing: string | null | undefined }): boolean {
  return input.mustChoose || input.lost || input.pairing === "invalid";
}

/**
 * PR-C vak L2 — mikor kell a függő átvételt kifejezetten menteni: párosított tanulónál, ha a nézet még nem mentett átvétel előnézete,
 * és a gyerek a megtekintési úton jár (összesítés), vagy a kör végigjátszott (akkor nincs más író kérés). Lejárt párosításnál soha.
 */
export function shouldAdopt(state: { adoptionPending?: boolean; identity: string | null }, ui: { summaryOpen: boolean; roundOver: boolean; blocked: boolean }): boolean {
  if (ui.blocked || state.identity !== "learner" || state.adoptionPending !== true) return false;
  return ui.summaryOpen || ui.roundOver;
}

/** PR-C vak L7 — az állapot-olvasás HTTP-hibája: a státusz és a szerver gépi `corrupt` jelzője megmarad (a törzs nem vész el). */
export async function adventStateError(res: { status: number; json: () => Promise<unknown> }): Promise<Error & { status: number; corrupt: boolean }> {
  const body: unknown = await res.json().catch(() => null);
  const corrupt = typeof body === "object" && body !== null && (body as { corrupt?: unknown }).corrupt === true;
  return Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, corrupt });
}

/**
 * PR-C 2. vak L2 — írás eredményének alkalmazása versenyhelyzet ellen: a kérés indításakori generációra, és előtte a függő (az írás
 * ELŐTT indult, régi pillanatképet hozó) állapotolvasás megszakad, hogy ne írhassa vissza a régebbi állást. Ha olvasás futott, az írás
 * után egy friss olvasás indul (az már az írás utáni állapotot látja). Régi generációnál nem ír.
 */
export async function applyAdventWrite(queryClient: QueryClient, generation: number, update: (current: unknown) => unknown): Promise<boolean> {
  if (generation !== subjectGeneration) return false;
  const key = adventStateKey(generation);
  const reading = queryClient.isFetching({ queryKey: key }) > 0;
  await queryClient.cancelQueries({ queryKey: key });
  if (generation !== subjectGeneration) return false;
  const current = queryClient.getQueryData(key);
  const next = update(current);
  if (next === undefined || next === null) return false;
  // A régebbi szerververziójú állás eldobása (PR-C 3. vak L1): a később kézbesített régi válasz nem írja felül az újabbat.
  if (isOlderAdventState(next, current)) {
    if (reading) void queryClient.invalidateQueries({ queryKey: key });
    return false;
  }
  setAdventStateIfCurrent(queryClient, generation, next);
  if (reading) void queryClient.invalidateQueries({ queryKey: key });
  return true;
}

/**
 * PR-C 2. vak L4 — a lejárt link tiltásának feloldása: az aktuális generáció szervertől igazolt `pairing: ok` válasza (pl. a gyerek
 * másik lapon érvényes új linket nyitott). A névtelen („none”) válasz nem igazolás.
 */
export function pairingRecovered(input: { pairing: string | null | undefined; mustChoose: boolean }): boolean {
  return input.mustChoose && input.pairing === "ok";
}
