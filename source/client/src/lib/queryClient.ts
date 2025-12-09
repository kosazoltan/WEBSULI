import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.message || text || res.statusText);
    } catch {
      throw new Error(text || res.statusText);
    }
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

// Retry helper with exponential backoff for mobile network reliability
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  shouldRetry: (error: any) => boolean = () => true
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors (4xx) or if retry condition fails
      if (!shouldRetry(error) || error.status >= 400 && error.status < 500) {
        throw error;
      }
      
      // Last attempt - throw the error
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff + jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(delay)}ms...`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { retries?: number; timeout?: number }
): Promise<T> {
  const retries = options?.retries ?? (method === 'POST' || method === 'PUT' ? 3 : 0); // Retry on write operations
  const timeout = options?.timeout ?? 60000; // 60 second default timeout
  
  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        console.log(`[API REQUEST] ${method} ${url}, size: ${data ? JSON.stringify(data).length : 0} bytes`);
        
        // SECURITY: Fetch CSRF token for mutating requests (POST/PUT/PATCH/DELETE)
        const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          try {
            const csrfToken = await csrfTokenManager.getToken();
            headers['X-CSRF-Token'] = csrfToken;
          } catch (error) {
            console.warn('[CSRF] Failed to fetch CSRF token, continuing without it:', error);
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
        console.log(`[API REQUEST] ${method} ${url} → ${res.status} ${res.statusText}`);

        // SECURITY: If CSRF token invalid (403 Forbidden), refresh token and retry ONCE
        if (res.status === 403) {
          const text = await res.text();
          if (text.includes('CSRF') || text.includes('csrf')) {
            console.warn('[CSRF] Token invalid, refreshing and retrying...');
            csrfTokenManager.invalidate();
            
            // Retry with new token
            const newCsrfToken = await csrfTokenManager.getToken();
            headers['X-CSRF-Token'] = newCsrfToken;
            
            const retryRes = await fetch(url, {
              method,
              headers,
              body: data ? JSON.stringify(data) : undefined,
              credentials: "include",
              signal: controller.signal,
            });
            
            console.log(`[API REQUEST RETRY] ${method} ${url} → ${retryRes.status} ${retryRes.statusText}`);
            await throwIfResNotOk(retryRes);
            
            if (retryRes.status === 204) {
              return undefined as T;
            }
            
            return await retryRes.json();
          }
        }

        await throwIfResNotOk(res);
        
        // Handle 204 No Content responses (e.g., DELETE operations)
        if (res.status === 204) {
          return undefined as T;
        }
        
        const result = await res.json();
        return result;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          console.error('[API REQUEST] Timeout after', timeout, 'ms');
          throw new Error(`A kérés túllépte az időkorlátot (${timeout / 1000}s). Kérlek ellenőrizd az internetkapcsolatot!`);
        }
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.error('[API REQUEST] Network error:', error.message);
          throw new Error('Hálózati hiba: Nincs internetkapcsolat vagy a szerver nem érhető el.');
        }
        
        throw error;
      }
    },
    retries,
    1000, // 1 second base delay
    (error: any) => {
      // Retry on network errors and server errors (5xx), but not on client errors (4xx)
      return error.name === 'AbortError' || 
             (error instanceof TypeError && error.message.includes('fetch')) ||
             (error.status && error.status >= 500);
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
