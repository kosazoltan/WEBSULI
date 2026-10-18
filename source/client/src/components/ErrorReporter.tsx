/**
 * ErrorReporter — breadcrumb ring buffer (50) + error reporting
 * Universal Error Logger frontend Réteg 2
 */
import { useEffect } from "react";

import { buildClientErrorRequest } from "@/lib/client-error-body";

// ============================================================
// Breadcrumb ring buffer (max 50)
// ============================================================
interface Breadcrumb {
  timestamp: string;
  type: "click" | "navigation" | "xhr" | "console" | "error";
  message: string;
  data?: Record<string, unknown>;
}

const MAX_BREADCRUMBS = 50;
const breadcrumbs: Breadcrumb[] = [];

function addBreadcrumb(crumb: Omit<Breadcrumb, "timestamp">): void {
  if (breadcrumbs.length >= MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
  breadcrumbs.push({ ...crumb, timestamp: new Date().toISOString() });
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

// ============================================================
// Report error to backend
// ============================================================
export interface ErrorPayload {
  errorType: string;
  message: string;
  stack?: string;
  url?: string;
  userId?: string;
  userEmail?: string;
  requestBody?: string;
}

export async function reportError(payload: ErrorPayload): Promise<void> {
  try {
    // /api/client-error (kanban #127): a böngésző saját végpontja, titok nélkül — az eredet-allowlist, az IP-korlát és a
    // napi plafon őrzi. A HMAC-os /api/error-report a szerver–szerver út; annak titka nem kerülhet a böngészőbe.
    // Azonosság és környezet a szerverről jön, a kliens által küldöttet eldobja.
    // Review #309: a törzs a szerver korlátaira vágva; 64 KiB fölött keepalive nélkül (különben a böngésző eldobja).
    const { body, keepalive } = buildClientErrorRequest({
      errorType: payload.errorType,
      message: payload.message,
      stack: payload.stack,
      url: payload.url ?? window.location.href,
      breadcrumbs: getBreadcrumbs(),
    });
    await fetch("/api/client-error", {
      method: "POST",
      credentials: "same-origin",
      keepalive,
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    // Never throw from error reporter
  }
}

// ============================================================
// ErrorReporter component — sets up global listeners
// ============================================================
export function ErrorReporter(): null {
  useEffect(() => {
    // Track clicks as breadcrumbs
    const handleClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      addBreadcrumb({
        type: "click",
        message: `Click: ${target.tagName}${target.id ? "#" + target.id : ""}${target.className ? "." + String(target.className).split(" ")[0] : ""}`,
      });
    };

    // Track navigation
    const handlePopstate = (): void => {
      addBreadcrumb({ type: "navigation", message: `Navigate: ${window.location.pathname}` });
    };

    // Track unhandled errors
    const handleError = (e: ErrorEvent): void => {
      addBreadcrumb({ type: "error", message: `Error: ${e.message}` });
      reportError({
        errorType: "UnhandledError",
        message: e.message,
        stack: e.error?.stack,
        url: window.location.href,
      }).catch(() => {});
    };

    // Track unhandled promise rejections
    const handleUnhandledRejection = (e: PromiseRejectionEvent): void => {
      // String(...) never returns null/undefined, so the fallback has to sit inside it.
      const message = e.reason?.message ?? String(e.reason ?? "Unhandled rejection");
      addBreadcrumb({ type: "error", message: `UnhandledRejection: ${message}` });
      reportError({
        errorType: "UnhandledRejection",
        message,
        stack: e.reason?.stack,
        url: window.location.href,
      }).catch(() => {});
    };

    window.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopstate);
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    // Initial breadcrumb
    addBreadcrumb({ type: "navigation", message: `Init: ${window.location.pathname}` });

    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopstate);
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}

export default ErrorReporter;
