/**
 * Adventi naptár — a „most sokan vagyunk” (429) válasz kezelése a kliensben (docs/specs/2026-11-18-adventi-naptar.md 16.1, 19.).
 * Import nélküli, tiszta modul: egységtesztből közvetlenül futtatható.
 */
/** Ennyit vár a kliens, mielőtt a „most sokan vagyunk” (429) választ EGYSZER újrapróbálja. */
export const ADVENT_BUSY_WAIT_MS = 4000;
export const ADVENT_BUSY_WAITING_TEXT = "Most nagyon sokan nyitják a naptárat. Várj egy kicsit — mindjárt újra megpróbáljuk!";
export const ADVENT_BUSY_FAILED_TEXT = "Most túl sokan vannak itt egyszerre. Próbáld meg pár perc múlva újra — a naptárad megvár!";

/** 429: a szerver kerete betelt (pl. `limit: "new-row"` — sok új naptár egy hálózatról). Ez nem a gyerek hibája, újrapróbálható. */
export function isAdventBusy(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { status?: unknown }).status === 429;
}

/**
 * Író hívás, amely a 429-es választ rövid várakozás után EGYSZER újrapróbálja (S2b 3. kör, M1). Az új-sor keret helye
 * visszajár, ha a másik kérés sora végül nem jött létre, ezért a rövid várakozás valóban segíthet. Más hibát azonnal továbbad;
 * a második 429-et is — a hívó ekkor a barátságos szöveget mutatja.
 */
export async function retryWhenBusy<T>(
  run: () => Promise<T>,
  opts: { onWait?: (waiting: boolean) => void; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isAdventBusy(error)) throw error;
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
    opts.onWait?.(true);
    try {
      await sleep(opts.delayMs ?? ADVENT_BUSY_WAIT_MS);
      return await run();
    } finally {
      opts.onWait?.(false);
    }
  }
}

/** A naptár saját, a gyereknek szóló magyar üzenetei ezekkel a státuszokkal jönnek (JSON `message` mezőben). */
const OWN_MESSAGE_STATUSES: readonly number[] = [400, 403, 409];

/**
 * Hibaszöveg a gyereknek — SOHA nem nyers szerverválasz (vak ellenőr K1). A szerver üzenete csak akkor megy ki, ha a naptár
 * saját 4xx válasza (400 / 403 / 409), és valóban mondat: nem HTML, nem JSON, nem túl hosszú. Minden másnál (5xx, proxy-hibaoldal,
 * üres vagy nem JSON törzs, időtúllépés, hálózati hiba, ismeretlen hiba) a megadott barátságos alapszöveg; 429-nél a „sokan
 * vagyunk” szöveg.
 */
export function adventErrorText(error: unknown, fallback: string): string {
  if (isAdventBusy(error)) return ADVENT_BUSY_FAILED_TEXT;
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  const message = error instanceof Error ? error.message.trim() : "";
  const own = typeof status === "number" && OWN_MESSAGE_STATUSES.includes(status);
  const sentence = message.length > 0 && message.length <= 200 && !/[<>{}[\]]/.test(message) && !/^(forbidden|bad request|conflict|not found|internal server error)$/i.test(message);
  return own && sentence ? message : fallback;
}
