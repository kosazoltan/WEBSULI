import { useState, useEffect } from "react";

/**
 * Hook to detect if the user is on a mobile/tablet device based on viewport width
 * Breakpoint: 1024px (Tailwind's lg breakpoint) - includes foldable phones and tablets
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // Use matchMedia for proper breakpoint detection (handles zoom, orientation change)
    // Increased to 1023px to support foldable phones (e.g., Galaxy Z Fold ~884px)
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    
    // Set initial state
    setIsMobile(mediaQuery.matches);

    // Listen for changes using matchMedia event listener
    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return isMobile;
}
