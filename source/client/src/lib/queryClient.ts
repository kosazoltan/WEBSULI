import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { logger } from "./logger";

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
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
}

// SECURITY: CSRF Token Manager
// Fetches and caches CSRF token for protecting mutating requests
class CSRFTokenManager {
  private token: string | null = null;
  private fetchPromise: Promise<string> | null = null;
  
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
    const res = await fetch('/api/csrf-token', {
      credentials: 'include',
    });
    
    if (!res.ok) {
      throw new Error('Failed to fetch CSRF token');
    }
    
    const data = await res.json();
    return data.csrfToken;
  }
  
  // Invalidate cached token (e.g., when CSRF error occurs)
  invalidate() {
    this.token = null;
  }
}

const csrfTokenManager = new CSRFTokenManager();

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
  options?: { retries?: number; timeout?: number }
): Promise<T> {
  const retries = options?.retries ?? 0; // No automatic retries for write operations (causes duplicates)
  const timeout = options?.timeout ?? 60000; // 60 second default timeout
  
  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        debugLog(`[API REQUEST] ${method} ${url}, size: ${data ? JSON.stringify(data).length : 0} bytes`);
        
        // SECURITY: Fetch CSRF token for mutating requests (POST/PUT/PATCH/DELETE)
        const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          try {
            const csrfToken = await csrfTokenManager.getToken();
            headers['X-CSRF-Token'] = csrfToken;
          } catch (error) {
            logger.warn('[CSRF] Failed to fetch CSRF token, continuing without it:', error);
            // Continue anyway - backend will reject if CSRF required
          }
        }
        
        const res = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined,
          credentials: "include",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
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
            headers['X-CSRF-Token'] = newCsrfToken;
            
            const retryController = new AbortController();
            const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);
            
            try {
              const retryRes = await fetch(url, {
                method,
                headers,
                body: data ? JSON.stringify(data) : undefined,
                credentials: "include",
                signal: retryController.signal,
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
        clearTimeout(timeoutId);
        
        if (error instanceof Error && error.name === 'AbortError') {
          logger.error('[API REQUEST] Timeout after', timeout, 'ms');
          throw new Error(`A kérés túllépte az időkorlátot (${timeout / 1000}s). Kérlek ellenőrizd az internetkapcsolatot!`, { cause: error });
        }
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
          logger.error('[API REQUEST] Network error:', error.message);
          throw new Error('Hálózati hiba: Nincs internetkapcsolat vagy a szerver nem érhető el.', { cause: error });
        }
        
        throw error;
      }
    },
    retries,
    1000, // 1 second base delay
    (error: unknown) => {
      // Retry on network errors and server errors (5xx), but not on client errors (4xx)
      const status = typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: unknown }).status
        : undefined;
      return (error instanceof Error && error.name === 'AbortError') ||
             (error instanceof TypeError && error.message.includes('fetch')) ||
             (typeof status === "number" && status >= 500);
    }
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
