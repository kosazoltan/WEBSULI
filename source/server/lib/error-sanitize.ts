/**
 * Universal Error Logger — pure helpers.
 *
 * Extracted from error-mailer.ts so they can be unit-tested without pulling in the
 * database pool (importing error-mailer opens a pg Pool as a module side effect).
 * error-mailer.ts re-exports these, so existing import sites keep working.
 */
import crypto from "crypto";

/** Escapes the five HTML-significant characters for safe interpolation into markup. */
export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Redacts credential-looking values before an error report is e-mailed or persisted.
 *
 * The label and everything that follows it up to the end of the line is removed, so the
 * common `password: hunter2` / `Authorization: Bearer x` shapes cannot leak the value
 * across the separating whitespace.
 */
export function sanitizeForEmail(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(
      /\b(password|passwd|pwd|token|secret|api[_-]?key|apikey|authorization|auth|bearer|cookie|session[_-]?id)\b\s*[:=]?[^\n\r]*/gi,
      (_match, label: string) => `${label}: [REDACTED]`,
    )
    .substring(0, 2000);
}

/**
 * Stable identity for an error: type + message with digits normalised away, so that
 * "Timeout after 3000ms" and "Timeout after 5000ms" collapse into one log row.
 */
export function generateFingerprint(errorType: string, message: string): string {
  const normalized = String(message ?? "").replace(/\d+/g, "N").substring(0, 200);
  return crypto
    .createHash("md5")
    .update(`${errorType}:${normalized}`)
    .digest("hex");
}

export type Severity = "CRITICAL" | "ERROR" | "WARN";

/** Classifies an error report. Unknown shapes default to ERROR. */
export function determineSeverity(errorType: string, message: string): Severity {
  const type = String(errorType ?? "").toLowerCase();
  const msg = String(message ?? "").toLowerCase();
  if (
    type.includes("uncaught") ||
    type.includes("unhandled") ||
    msg.includes("database") ||
    msg.includes("cannot read") ||
    msg.includes("is not a function")
  ) {
    return "CRITICAL";
  }
  if (
    type.includes("error") ||
    msg.includes("failed") ||
    msg.includes("timeout")
  ) {
    return "ERROR";
  }
  if (type.includes("warn") || msg.includes("deprecated")) {
    return "WARN";
  }
  return "ERROR";
}

/** The fields the error e-mail renders. All values are treated as untrusted. */
export interface ErrorEmailFields {
  appName: string;
  repoPath: string;
  githubRepo: string;
  severity: string;
  fingerprint: string;
  signature: string;
  timestamp: string;
  errorType?: string;
  message?: string;
  commitSha?: string;
  environment?: string;
  url?: string;
  requestId?: string;
  user?: string;
  browser?: string;
  stack?: string;
  breadcrumbs?: unknown[];
}

/**
 * Builds the HTML body of an error report e-mail.
 *
 * SECURITY: every client-supplied field goes through escapeHtml(). /api/error-report is
 * public, so `environment` and `commitSha` are attacker-controlled too — they used to be
 * interpolated raw, which allowed HTML injection into the admin's inbox.
 */
export function buildErrorEmailHtml(fields: ErrorEmailFields): string {
  const row = (label: string, value: string) =>
    `  <tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`;

  const rows = [
    row("Severity", `<strong>${escapeHtml(fields.severity)}</strong>`),
    row("Error Type", escapeHtml(fields.errorType)),
    row("Message", escapeHtml(sanitizeForEmail(fields.message))),
    row("Fingerprint", escapeHtml(fields.fingerprint)),
    row("App", escapeHtml(fields.appName)),
    row("Repo", escapeHtml(fields.repoPath)),
    row(
      "GitHub",
      `<a href="https://github.com/${escapeHtml(fields.githubRepo)}">https://github.com/${escapeHtml(fields.githubRepo)}</a>`,
    ),
    row("Commit", escapeHtml(fields.commitSha ?? "N/A")),
    row("Environment", escapeHtml(fields.environment ?? "")),
    row("URL", escapeHtml(fields.url)),
    row("Request ID", escapeHtml(fields.requestId)),
    row("User", escapeHtml(fields.user)),
    row("Browser", escapeHtml(fields.browser)),
    row("Timestamp", escapeHtml(fields.timestamp)),
    row("HMAC Signature", `<code>${escapeHtml(fields.signature)}</code>`),
  ].join("\n");

  const stackBlock = fields.stack
    ? `<h3>Stack Trace</h3><pre>${escapeHtml(sanitizeForEmail(fields.stack))}</pre>`
    : "";
  const breadcrumbBlock = fields.breadcrumbs
    ? `<h3>Breadcrumbs</h3><pre>${escapeHtml(JSON.stringify(fields.breadcrumbs, null, 2))}</pre>`
    : "";

  return `
<h2>🚨 ${escapeHtml(fields.appName)} Error Report</h2>
<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:monospace">
  <tr><th>Field</th><th>Value</th></tr>
${rows}
</table>
${stackBlock}
${breadcrumbBlock}
`;
}
