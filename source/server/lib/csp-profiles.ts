/**
 * LS-4 — CSP profiles as pure data (master plan §4).
 *
 * The global profile is deliberately permissive for the LEGACY generated HTML
 * materials (inline event handlers are part of those documents). The lesson
 * runtime is the opposite: the lesson is DATA rendered by our own audited
 * bundle, so `/lesson/*` gets the strict profile — no inline script, no eval.
 * Keeping the directives in a pure module makes them testable without booting
 * the server, and the guard test pins that the strict profile never regains
 * `'unsafe-inline'` / `'unsafe-eval'` in its script sources.
 */

export type CspContext = {
  allowedOrigins: string[];
  isDevelopment: boolean;
  customDomain?: string;
};

export function globalCspDirectives(ctx: CspContext): Record<string, string[]> {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "https://fonts.googleapis.com",
      "'unsafe-inline'",
      "'unsafe-eval'",
    ],
    // Inline event handlers (onclick, oninput, …) inside user-uploaded HTML.
    scriptSrcAttr: ["'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    connectSrc: [
      "'self'",
      ...ctx.allowedOrigins,
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
      ...(ctx.isDevelopment ? ["ws:", "wss:"] : ["wss:"]),
    ],
    frameSrc: ["'self'"],
    frameAncestors: ["'self'", ...(ctx.customDomain ? [`https://${ctx.customDomain}`] : [])],
    objectSrc: ["'none'"],
  };
}

/**
 * The lesson page profile: the runtime bundle is the only script, the lesson is
 * data. Nothing inline, nothing evaluated — this is the machine-checkable half
 * of "a lesson is not a program".
 */
export function lessonCspDirectives(ctx: CspContext): Record<string, string[]> {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    connectSrc: [
      "'self'",
      ...ctx.allowedOrigins,
      ...(ctx.isDevelopment ? ["ws:", "wss:"] : []),
    ],
    frameSrc: ["'self'"],
    frameAncestors: ["'self'", ...(ctx.customDomain ? [`https://${ctx.customDomain}`] : [])],
    objectSrc: ["'none'"],
  };
}

/** The request paths that get the strict lesson profile. */
export function isLessonRoute(path: string): boolean {
  return path === "/lesson" || path.startsWith("/lesson/");
}
