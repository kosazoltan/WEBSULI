import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supportsResultApi } from "@shared/result-compat";
import { resultBodyForServer } from "@shared/round-id";
import { logger } from "./logger";
import { LESSON_SCORING_VERSION } from "@shared/answer-value";
import { isRetryableRequestError } from "@shared/request-retry";

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

/** Eredmény-e-mail B2 (#510 R37): a CSRF-token lekérésének saját határideje (a válasz törzsének olvasásával együtt). */
const CSRF_TOKEN_TIMEOUT_MS = 15_000;

/** B4b: `ownerBinding` — a szerver hirdeti a kör-kilét kötését (a B4 kapcsolója, `resultOwnerBinding: true`). */
/** B5b: `partial` — a szerver fogadja és ütemezi a „félbehagyva” pillanatképet (`resultPartial: true`, a RESULT_PARTIAL_EMAIL kapcsoló). */
type TokenInfo = { token: string; resultApi: boolean; ownerBinding: boolean; partial: boolean; roundAlias: boolean };

// SECURITY: CSRF Token Manager
// Fetches and caches CSRF token for protecting mutating requests
class CSRFTokenManager {
  private token: TokenInfo | null = null;
  private fetchPromise: Promise<TokenInfo> | null = null;
  
  async getToken(): Promise<TokenInfo> {
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
  
  private async fetchTokenFromServer(): Promise<TokenInfo> {
    // B2 (#510 R37): a megakadt tokenlekérés nem tarthatja végtelenül a várakozó írást. Időzített AbortController (nem
    // `AbortSignal.timeout`): a határidő így a már kezelt, újrapróbálhatónak ismert `AbortError`-t adja, nem `TimeoutError`-t
    // (PR #556 review) — és a törzs olvasását is fedi.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CSRF_TOKEN_TIMEOUT_MS);
    try {
      const res = await fetch('/api/csrf-token', {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error('Failed to fetch CSRF token');
      }

      const data = await res.json();
      return { token: data.csrfToken, resultApi: supportsResultApi(data), ownerBinding: data.resultOwnerBinding === true, partial: data.resultPartial === true, roundAlias: data.resultRoundAlias === true };
    } finally {
      clearTimeout(timer);
    }
  }
  
  // Invalidate cached token (e.g., when CSRF error occurs)
  invalidate() {
    this.token = null;
  }
}

const csrfTokenManager = new CSRFTokenManager();

/**
 * B5b: a szerver hirdeti-e a pillanatkép képességét. Hiba (nincs token) → nem: ilyenkor pillanatkép nem megy (a régi viselkedés).
 * A token gyorsítótárazott, így a lap elhagyásakor a válasz azonnali (a tanuló első válaszakor előre betöltjük: `warmResultToken`).
 */
export async function resultPartialReady(): Promise<boolean> {
  try { return (await csrfTokenManager.getToken()).partial; } catch { return false; }
}
/** B8 (PR #613 review): a szerver hirdeti-e a régi kör-azonosító alias mezőjét. Hiba → nem: a mező nem megy ki. */
export async function resultRoundAliasReady(): Promise<boolean> {
  try { return (await csrfTokenManager.getToken()).roundAlias; } catch { return false; }
}
export function warmResultToken(): void {
  void csrfTokenManager.getToken().catch(() => undefined);
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
  /** B4b (PR #574 review): függvény is lehet — minden tényleges `fetch` előtt hívódik a token képességeivel (pl. kilét-szűrés). */
  data?: unknown | ((ctx: { ownerBinding: boolean }) => unknown) | undefined,
  options?: { retries?: number; timeout?: number; keepalive?: boolean; resultTimes?: { startedAt?: number; lastAnsweredAt?: number } }
): Promise<T> {
  const retries = options?.retries ?? 0; // No automatic retries for write operations (causes duplicates)
  const timeout = options?.timeout ?? 60000; // 60 second default timeout
  // Eredmény-e-mail B2 (#510 R8 / R4): `keepalive` — a kérés (és a 403 utáni ismétlése) a lap bezárása után is célba ér; csak kis
  // törzsű írásnál használható (64 KB a böngésző kerete).
  const keepalive = options?.keepalive ? { keepalive: true } : {};
  
  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        let ownerBinding = false;
        const body = (): unknown => (typeof data === "function" ? (data as (ctx: { ownerBinding: boolean }) => unknown)({ ownerBinding }) : data);
        debugLog(`[API REQUEST] ${method} ${url}`);
        
        // SECURITY: Fetch CSRF token for mutating requests (POST/PUT/PATCH/DELETE)
        // Spec 2026-09-30 (U1, §C-V/1): a kliens közli a támogatott pontozó-verziót; a kiszolgáló az újabb leckét 409-cel utasítja el.
        const addsFields = Boolean(options?.resultTimes && Object.keys(options.resultTimes).length && data && (typeof data === "object" || typeof data === "function"));
        let roundAlias = false;
        const serialize = (capable: boolean) => { const d = body(); const shaped = d && typeof d === "object" ? resultBodyForServer(d as Record<string, unknown>, roundAlias) : d; return shaped ? JSON.stringify(capable && addsFields ? { ...shaped, ...options!.resultTimes } : shaped) : undefined; };
        // #510 R10 / R12 (PR #564 review): ha a V2-t hirdető token után a kérés egy régi, szigorú sémájú példányhoz ér, az új mezőkre
        // 400 jön — ilyenkor EGY ismétlés a régi alakkal (ugyanazzal a tokennel). Jelzés vagy új mező nélkül változatlanul egy kérés.
        const sendOnce = async (capable: boolean, signal: AbortSignal) => {
          const init = { method, headers, credentials: "include" as const, signal, ...keepalive };
          const first = await fetch(url, { ...init, body: serialize(capable) });
          if (first.status !== 400 || !capable || !addsFields) return first;
          debugLog(`[API REQUEST] ${method} ${url} → 400 az új mezőkre, ismétlés a régi alakkal`);
          return fetch(url, { ...init, body: serialize(false) });
        };
        let capable = false;
        const headers: Record<string, string> = { "X-Websuli-Scoring": String(LESSON_SCORING_VERSION), ...(data ? { "Content-Type": "application/json" } : {}) };
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          try {
            const csrfToken = await csrfTokenManager.getToken();
            headers['X-CSRF-Token'] = csrfToken.token;
            capable = csrfToken.resultApi;
            ownerBinding = csrfToken.ownerBinding;
            roundAlias = csrfToken.roundAlias;
          } catch (error) {
            logger.warn('[CSRF] Failed to fetch CSRF token, continuing without it:', error);
            // Continue anyway - backend will reject if CSRF required
          }
        }
        
        const res = await sendOnce(capable, controller.signal);

        // B2 (#510 R37): az időzítő a válasz törzsének beolvasásáig él (a lenti `finally` törli) — a fejlécek után megakadó választest
        // sem vonja ki a kérést az időkorlát alól.
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
            const newCsrfToken = await csrfTokenManager.getToken();
            headers['X-CSRF-Token'] = newCsrfToken.token;
            ownerBinding = newCsrfToken.ownerBinding;
            roundAlias = newCsrfToken.roundAlias;
            
            const retryController = new AbortController();
            const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);
            
            try {
              const retryRes = await sendOnce(newCsrfToken.resultApi, retryController.signal);
              
              debugLog(`[API REQUEST RETRY] ${method} ${url} → ${retryRes.status} ${retryRes.statusText}`);
              // B2 (#510 R23): ha a friss token is 403-at kap, az sem marad a gyorsítótárban — a következő írás megint frisset kér.
              if (retryRes.status === 403) csrfTokenManager.invalidate();
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
