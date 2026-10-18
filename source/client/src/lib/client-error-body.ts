/**
 * A böngészős hibajelentés törzse (kanban #127, review #309).
 * A `keepalive` kérés törzse legfeljebb 64 KiB lehet; ennél nagyobbat a böngésző küldés nélkül elutasít. Ezért a mezők
 * kliensoldalon is a szerver korlátaira vágódnak, és a még mindig túl nagy törzs `keepalive` nélkül megy.
 */
export const CLIENT_ERROR_LIMITS = { errorType: 50, message: 5000, stack: 10000, url: 500, crumbMessage: 300 } as const;
/** A 64 KiB alatt, tartalékkal (a fejlécek nem számítanak bele, de a mérés UTF-8-bájtban történik). */
export const KEEPALIVE_MAX_BYTES = 60_000;

export interface ClientErrorInput {
  errorType: string;
  message: string;
  stack?: string;
  url: string;
  breadcrumbs: { type: string; message: string; timestamp?: string; data?: unknown }[];
}

export function buildClientErrorRequest(input: ClientErrorInput): { body: string; keepalive: boolean } {
  const body = JSON.stringify({
    errorType: input.errorType.slice(0, CLIENT_ERROR_LIMITS.errorType),
    message: input.message.slice(0, CLIENT_ERROR_LIMITS.message),
    stack: input.stack?.slice(0, CLIENT_ERROR_LIMITS.stack),
    url: input.url.slice(0, CLIENT_ERROR_LIMITS.url),
    breadcrumbs: input.breadcrumbs.map((c) => ({
      type: c.type,
      timestamp: c.timestamp,
      message: c.message.slice(0, CLIENT_ERROR_LIMITS.crumbMessage),
    })),
  });
  return { body, keepalive: new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES };
}
