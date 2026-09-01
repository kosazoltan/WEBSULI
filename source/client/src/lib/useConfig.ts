import { useQuery } from '@tanstack/react-query';

interface AppConfig {
  baseUrl: string;
  /** A tananyag-iframe (/dev/:id) originje; '' = same-origin (dev). BACKLOG T4. */
  materialOrigin?: string;
  environment: string;
}

/**
 * Hook to fetch application configuration from backend
 * Returns the correct base URL for iframe previews (CUSTOM_DOMAIN in prod, localhost in dev)
 * Falls back to window.location.origin if API call fails
 */
export function useConfig() {
  const { data, isLoading, error } = useQuery<AppConfig>({
    queryKey: ['/api/config'],
    // Fetch only once per app load - config rarely changes
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1, // Only retry once
  });

  // Fallback to window.location.origin if config fetch fails
  const baseUrl = data?.baseUrl || window.location.origin;
  
  return {
    baseUrl,
    // Amíg a config nem jött meg, üres (same-origin) — a Preview a betöltést megvárja
    materialOrigin: data?.materialOrigin || '',
    environment: data?.environment || 'development',
    isLoading,
    error,
  };
}
