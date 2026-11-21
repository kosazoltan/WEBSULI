import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { logger } from "./logger";
import { LESSON_SCORING_VERSION } from "@shared/answer-value";
import { isRetryableRequestError } from "@shared/request-retry";
import { RESULT_API_VERSION } from "@shared/result-compat";

// A `preReadText` paraméter azért kell, mert a 403-as CSRF-ág már beolvasta
// a body-t (res.text()) — a Response body csak egyszer olvasható, ismételt
// res.text() hívás üres stringet/hibát adna.
async function throwIfResNotOk(res: Response, preReadText?: string) {
  if (!res.ok) {
    const text = preReadText !== undefined ? preReadText : await res.text();
    let message = text || res.statusText;
    try {
      const json = JSON.parse(text);
      if (json.message) {
        message = json.message;
      }
    } catch {
      // Response is not JSON, use raw text
    }
    const error = new Error(message) as Error & { status?: number; retryAfterSec?: number };
    error.status = res.status;
    // JM0: a 429-es válasz Retry-After értéke (másodperc), hogy a hívó az újrapróbát hozzá igazíthassa.
    const retryAfter = Number(res.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterSec = retryAfter;
    throw error;
  }
}

/** R37: a CSRF-token lekérésének határideje (a törzs olvasásával együtt). */
const CSRF_TOKEN_TIMEOUT_MS = 15_000;

/** R39: egy tokenválasz tartalma — a token, a képesség-jelzés (R12) és a kilét-címke (R31). */
export type CsrfTokenInfo = { token: string; resultApi: boolean; subject: string | null };

// SECURITY: CSRF Token Manager
// Fetches and caches CSRF token for protecting mutating requests
class CSRFTokenManager {
  private token: string | null = null;
  private fetchPromise: Promise<string> | null = null;
  /** Spec 2026-11-17-eredmeny-email-kviz (R12): a token mellett jött képesség-jelzés (a régi szerver nem küldi). */
  private resultApi = false;
  /** Terv R31: a munkamenet fiókjának álnevesített kilét-címkéje (a token mellett jön; a régi szerver nem küldi). */
  private subject: string | null = null;
  
  async getToken(): Promise<string> {
    // Return cached token if available
    if (this.token) {
      return this.token;
    }
    
    // If already fetching, wait for that promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }
    
    // Fetch new token
    this.fetchPromise = this.fetchTokenFromServer();
    try {
      this.token = await this.fetchPromise;
      return this.token;
    } finally {
      this.fetchPromise = null;
    }
  }
  
  private async fetchTokenFromServer(): Promise<string> {
    // R37 (6. kör L4): a tokenlekérésnek saját határideje van — a megakadt lekérés nem tarthatja végtelenül a várakozó beküldést.
    const res = await fetch('/api/csrf-token', {
      credentials: 'include',
      signal: AbortSignal.timeout(CSRF_TOKEN_TIMEOUT_MS),
    });
    
    if (!res.ok) {
      throw new Error('Failed to fetch CSRF token');
    }
    
    const data = await res.json();
    this.resultApi = data?.resultApi === RESULT_API_VERSION;
    this.subject = typeof data?.resultSubject === "string" ? data.resultSubject : null;
    return data.csrfToken;
  }
  
  /**
   * Terv R39 (7. vak kör L1): a token ÉS az ugyanabban a válaszban jött képesség-jelzés / kilét-címke együtt — a hívó a kérés törzsét
   * ebből építi, így a törzs és a ténylegesen elküldött token sosem két különböző tokenválaszból származik.
   */
  async getTokenInfo(): Promise<CsrfTokenInfo> {
    const token = await this.getToken();
    return { token, resultApi: this.resultApi, subject: this.subject };
  }

  // Invalidate cached token (e.g., when CSRF error occurs)
  invalidate() {
    this.token = null;
  }

  /** R12: a gyorsítótárazott token szervere jelezte-e az új eredmény-API-t (szinkron). */
  resultApiReady(): boolean {
    return this.token !== null && this.resultApi;
  }

  /** R31: a gyorsítótárazott token mellett jött kilét-címke (vagy null) — szinkron. */
  resultSubject(): string | null {
    return this.token !== null ? this.subject : null;
  }

  /** A már lekért token (vagy null) — szinkron, a lap elhagyásakor nincs idő hálózati körre. */
  peek(): string | null {
    return this.token;
  }
}

const csrfTokenManager = new CSRFTokenManager();

/** Spec 2026-11-17-eredmeny-email-kviz (S1b): a CSRF-token előzetes lekérése, hogy a lap elhagyásakor küldött kérésnek már legyen tokenje. */
export function warmCsrfToken(): void {
  void csrfTokenManager.getToken().catch(() => { /* A token nélküli pillanatkép egyszerűen nem megy el. */ });
}

/**
 * Spec 2026-11-17-eredmeny-email-kviz (R12): a szerver jelezte-e (a CSRF-token válaszában), hogy ismeri az új eredmény-API-t — a
 * pillanatkép és az új kérésmezők csak ekkor mennek. `resultApiReady` szinkron (a gyorsítótárazott tokenből), `ensureResultApi` szükség
 * esetén lekéri a tokent; hibánál hamis (a régi viselkedés marad).
 */
export function resultApiReady(): boolean { return csrfTokenManager.resultApiReady(); }
/**
 * Terv R31 (review 4642333188): a munkamenet fiókjának kilét-címkéje a gyorsítótárazott tokenből (szinkron), vagy null, ha még nincs
 * token / a szerver nem küldte. A kimenő eredmény-bejegyzés ezt viszi, hogy kilétváltás után ne a később bejelentkezett fiókhoz kerüljön.
 */
export function resultSubject(): string | null { return csrfTokenManager.resultSubject(); }
export async function ensureResultApi(): Promise<boolean> {
  try { await csrfTokenManager.getToken(); } catch { return false; }
  return csrfTokenManager.resultApiReady();
}

/**
 * S1b: írás a lap háttérbe kerülésekor / elhagyásakor — `fetch` + `keepalive` (a `sendBeacon` nem tud CSRF-fejlécet küldeni). Hibát nem
 * dob. PR #510: IGAZ csak akkor, ha a szerver ELFOGADTA (2xx) — token nélkül, hálózati hibánál, 429-nél és 5xx-nél hamis, hogy a hívó ne
 * jelölje elküldöttnek azt, ami nem ment át. Ha a lap közben bezárul, az ígéret nem teljesül (a kérés a `keepalive` miatt ettől még
 * célba érhet) — a hívó ilyenkor semmit nem rögzít.
 * Vak ellenőrzés K4 (terv R4): a gyorsítótárazott tokennel AZONNAL küld (a lap elhagyásakor nincs idő előzetes hálózati körre); ha
 * nincs token (a korábbi előtöltés elbukott), most kér egyet. 403 után (lejárt / kicserélt munkamenet: a token érvénytelen) a
 * gyorsítótár ürül, új token jön, és a kérés EGYSZER megismétlődik — különben a lap életében minden további pillanatkép 403 lenne. Ha az
 * ismétlésre nincs mód (a lap bezárult, a tokenkérés bukik), hamis: a következő betöltéskor a tárolt kör friss tokennel megy.
 */
export async function sendKeepalive(url: string, data: unknown): Promise<boolean> {
  const post = (csrfToken: string) => fetch(url, {
    method: "POST", keepalive: true, credentials: "include", body: JSON.stringify(data),
    headers: { "Content-Type": "application/json", "X-Websuli-Scoring": String(LESSON_SCORING_VERSION), "X-CSRF-Token": csrfToken },
  });
  const freshToken = () => csrfTokenManager.getToken().catch(() => null);
  try {
    let token = csrfTokenManager.peek() ?? await freshToken();
    if (!token) return false;
    let res = await post(token);
    if (res.status === 403) {
      csrfTokenManager.invalidate();
      token = await freshToken();
      if (!token) return false;
      // Terv R23 (gépi vak ellenőrzés L3): ha az új tokent egy régi (jelzés nélküli) példány adta, nem küldünk neki újra — a régi szerver
      // a pillanatképet nem ismeri (400), és a közös keretét fogyasztaná; a hívó nem rögzít elküldést.
      if (!csrfTokenManager.resultApiReady()) return false;
      res = await post(token);
      // Ha az új token is 403-at kap, az sem marad a gyorsítótárban (a következő alkalom megint frisset kér).
      if (res.status === 403) csrfTokenManager.invalidate();
    }
    return res.ok;
  } catch { return false; }
}

// Dev-only request logger — production buildben néma, hogy ne szemetelje
// tele a konzolt (167 tananyagnál kérésenként 2 sor volt).
const debugLog: (...args: unknown[]) => void = import.meta.env.DEV
  ? (...args: unknown[]) => logger.debug(...args)
  : () => {};

// Retry helper with exponential backoff for mobile network reliability
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  shouldRetry: (error: unknown) => boolean = () => true
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx) or if retry condition fails
      const status = typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: unknown }).status
        : undefined;
      if (!shouldRetry(error) || (typeof status === "number" && status >= 400 && status < 500)) {
        throw error;
      }

      // Last attempt - throw the error
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      const message = error instanceof Error ? error.message : String(error);
      debugLog(`[RETRY] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(delay)}ms...`, message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: {
    retries?: number; timeout?: number; keepalive?: boolean;
    /**
     * Terv R39 / R40 (7. vak kör L1 / L2): a törzs a CSRF-token MEGÉRKEZÉSE UTÁN, közvetlenül a küldés előtt áll össze — abból a
     * tokenválaszból, amelynek tokenjével a kérés ténylegesen megy (a 403 utáni frissítésnél is újra). Ha megadott, és a token nem kérhető
     * le, a kérés NEM megy el (a hiba a hívóhoz kerül: bizonytalan képességnél nincs vak küldés); a függvény dobása is megállítja a kérést.
     */
    prepare?: (token: CsrfTokenInfo) => unknown;
  }
): Promise<T> {
  const retries = options?.retries ?? 0; // No automatic retries for write operations (causes duplicates)
  const timeout = options?.timeout ?? 60000; // 60 second default timeout
  // Spec 2026-11-17-eredmeny-email-kviz (R8): `keepalive` — a kérés a lap bezárása után is célba ér (csak kis törzsű írásnál: 64 KB a keret).
  const keepalive = options?.keepalive ? { keepalive: true } : {};
  const prepare = options?.prepare;

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        // SECURITY: Fetch CSRF token for mutating requests (POST/PUT/PATCH/DELETE)
        // Spec 2026-09-30 (U1, §C-V/1): a kliens közli a támogatott pontozó-verziót; a kiszolgáló az újabb leckét 409-cel utasítja el.
        const headers: Record<string, string> = { "X-Websuli-Scoring": String(LESSON_SCORING_VERSION) };
        // R39: `prepare` mellett a törzs a token mellé épül (lent); egyébként a kapott adat.
        let payload = data;
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          try {
            const info = await csrfTokenManager.getTokenInfo();
            headers['X-CSRF-Token'] = info.token;
            if (prepare) payload = prepare(info);
          } catch (error) {
            // R39 / R40: a törzsét a tokenhez kötő kérés token nélkül (vagy ha a törzs nem állhat össze) nem megy el.
            if (prepare) throw error;
            logger.warn('[CSRF] Failed to fetch CSRF token, continuing without it:', error);
            // Continue anyway - backend will reject if CSRF required
          }
        }
        if (payload) headers["Content-Type"] = "application/json";
        debugLog(`[API REQUEST] ${method} ${url}, size: ${payload ? JSON.stringify(payload).length : 0} bytes`);

        const res = await fetch(url, {
          method,
          headers,
          body: payload ? JSON.stringify(payload) : undefined,
          credentials: "include",
          signal: controller.signal,
          ...keepalive,
        });

        // R37 (spec 2026-11-17-eredmeny-email-kviz, 6. kör L4): az időzítő a törzs beolvasásáig él (lent, a `finally` ágban törlődik) — a
        // fejlécek után megakadó választest sem vonja ki a kérést az időkorlát alól.
        debugLog(`[API REQUEST] ${method} ${url} → ${res.status} ${res.statusText}`);

        // SECURITY: If CSRF token invalid (403 Forbidden), refresh token and retry ONCE
        // A `text`-et itt olvassuk ki (body csak egyszer olvasható), és lent a
        // throwIfResNotOk(res, text) hívásnak adjuk tovább, ha nem CSRF-hiba.
        let forbiddenText: string | undefined;
        if (res.status === 403) {
          const text = await res.text();
          forbiddenText = text;
          if (text.includes('CSRF') || text.includes('csrf')) {
            logger.warn('[CSRF] Token invalid, refreshing and retrying...');
            csrfTokenManager.invalidate();
            
            // Retry with new token (fresh controller in case original timed out)
            const fresh = await csrfTokenManager.getTokenInfo();
            headers['X-CSRF-Token'] = fresh.token;
            // R39: az új tokenválaszhoz újraépített törzs (más munkamenet / példány más képességet és címkét adhat).
            if (prepare) payload = prepare(fresh);
            
            const retryController = new AbortController();
            const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);
            
            try {
              const retryRes = await fetch(url, {
                method,
                headers,
                body: payload ? JSON.stringify(payload) : undefined,
                credentials: "include",
                signal: retryController.signal,
                ...keepalive,
              });
              
              debugLog(`[API REQUEST RETRY] ${method} ${url} → ${retryRes.status} ${retryRes.statusText}`);
              await throwIfResNotOk(retryRes);
              
              if (retryRes.status === 204) {
                return undefined as T;
              }
              
              return await retryRes.json();
            } finally {
              clearTimeout(retryTimeoutId);
            }
          }
        }

        await throwIfResNotOk(res, forbiddenText);

        // Handle 204 No Content responses (e.g., DELETE operations)
        if (res.status === 204) {
          return undefined as T;
        }
        
        const result = await res.json();
        return result;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.error('[API REQUEST] Timeout after', timeout, 'ms');
          throw new Error(`A kérés túllépte az időkorlátot (${timeout / 1000}s). Kérlek ellenőrizd az internetkapcsolatot!`, { cause: error });
        }
        
        // A fetch minden TypeError-ja hálózati hiba — a szövege böngészőnként más (Chrome: „Failed to fetch”, Safari: „Load failed”).
        if (error instanceof TypeError) {
          logger.error('[API REQUEST] Network error:', error.message);
          throw new Error('Hálózati hiba: Nincs internetkapcsolat vagy a szerver nem érhető el.', { cause: error });
        }
        
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    retries,
    1000, // 1 second base delay
    // Hálózati hiba, időtúllépés és 5xx újrapróbálható; 4xx nem. A fenti ág a hálózati hibát és az időtúllépést magyar szövegű
    // Error-ba csomagolja — azt a `cause` alapján az isRetryableRequestError ismeri fel (J5: korábban épp ezek nem próbálkoztak újra).
    (error: unknown) => error instanceof TypeError || isRetryableRequestError(error)
  );
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 seconds - allows refetch after mutations
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
