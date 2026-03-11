/**
 * Universal Error Logger — error-mailer.ts
 * Websuli Réteg 1+2 implementáció
 */
import crypto from "crypto";
import nodemailer from "nodemailer";
import { db } from "../db";
import { errorLogs } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ============================================================
// CONSTANTS
// ============================================================
const APP_NAME = "Websuli";
const REPO_PATH = "D:\\repo\\WEBSULI";
const GITHUB_REPO = "kosazoltan/WEBSULI";
const FORBIDDEN_REPOS: string[] = [];
const HMAC_SECRET =
  process.env.ERRORLOG_HMAC_SECRET ?? "errorlog-hmac-s3cr3t-websuli-2026-kz";
const SENDER_EMAIL = "noraautomatizalas@gmail.com";
const RECIPIENT_EMAIL = "noraautomatizalas@gmail.com";

// ============================================================
// TYPES
// ============================================================
export interface ErrorReportPayload {
  errorType: string;
  message: string;
  stack?: string;
  url?: string;
  requestId?: string;
  requestMethod?: string;
  requestBody?: string;
  userId?: string;
  userEmail?: string;
  browser?: string;
  breadcrumbs?: unknown[];
  commitSha?: string;
  environment?: string;
}

// ============================================================
// generateFingerprint — MD5 of errorType+normalizedMessage
// ============================================================
export function generateFingerprint(errorType: string, message: string): string {
  const normalized = message.replace(/\d+/g, "N").substring(0, 200);
  return crypto
    .createHash("md5")
    .update(`${errorType}:${normalized}`)
    .digest("hex");
}

// ============================================================
// determineSeverity
// ============================================================
export function determineSeverity(errorType: string, message: string): string {
  const type = errorType.toLowerCase();
  const msg = message.toLowerCase();
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

// ============================================================
// sanitizeForEmail — remove sensitive data
// ============================================================
export function sanitizeForEmail(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/password[^\s]*/gi, "[REDACTED]")
    .replace(/token[^\s]*/gi, "[REDACTED]")
    .replace(/secret[^\s]*/gi, "[REDACTED]")
    .replace(/authorization:[^\n]*/gi, "authorization: [REDACTED]")
    .substring(0, 2000);
}

// ============================================================
// signEmailPayload — HMAC-SHA256
// ============================================================
export function signEmailPayload(payload: string): string {
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(payload)
    .digest("hex");
}

// ============================================================
// sendErrorReport — UPSERT to DB + Gmail notification
// ============================================================
export async function sendErrorReport(payload: ErrorReportPayload): Promise<void> {
  // Guard: forbidden repos should never call this
  if (FORBIDDEN_REPOS.some((r) => REPO_PATH.startsWith(r))) {
    console.warn("[ErrorLogger] Forbidden repo, skipping.");
    return;
  }

  const fingerprint = generateFingerprint(payload.errorType, payload.message);
  const severity = determineSeverity(payload.errorType, payload.message);
  const environment = payload.environment ?? process.env.NODE_ENV ?? "production";
  const commitSha =
    payload.commitSha ?? process.env.GIT_COMMIT_SHA ?? undefined;

  try {
    // UPSERT: insert or increment occurrence count
    const existing = await db
      .select()
      .from(errorLogs)
      .where(eq(errorLogs.fingerprint, fingerprint))
      .limit(1);

    let emailAlreadySent = false;

    if (existing.length > 0) {
      // Update occurrence count + lastSeenAt
      await db
        .update(errorLogs)
        .set({
          occurrenceCount: sql`${errorLogs.occurrenceCount} + 1`,
          lastSeenAt: new Date(),
          stack: payload.stack ?? existing[0].stack,
          url: payload.url ?? existing[0].url,
          requestId: payload.requestId ?? existing[0].requestId,
        })
        .where(eq(errorLogs.fingerprint, fingerprint));
      emailAlreadySent = existing[0].emailSent;
    } else {
      // Insert new error log
      await db.insert(errorLogs).values({
        fingerprint,
        errorType: payload.errorType,
        severity,
        message: payload.message.substring(0, 5000),
        stack: payload.stack ? payload.stack.substring(0, 10000) : undefined,
        commitSha,
        appName: APP_NAME,
        repoPath: REPO_PATH,
        environment,
        breadcrumbs: payload.breadcrumbs as object | undefined,
        url: payload.url?.substring(0, 500),
        requestId: payload.requestId?.substring(0, 100),
        requestMethod: payload.requestMethod?.substring(0, 10),
        requestBody: payload.requestBody
          ? sanitizeForEmail(payload.requestBody).substring(0, 2000)
          : undefined,
        userId: payload.userId?.substring(0, 100),
        userEmail: payload.userEmail?.substring(0, 200),
        browser: payload.browser?.substring(0, 300),
      });
    }

    // Only send email for new errors or CRITICAL re-occurrences
    if (
      !emailAlreadySent ||
      (severity === "CRITICAL" && existing.length > 0 && existing[0].occurrenceCount % 10 === 0)
    ) {
      await _sendEmail(fingerprint, severity, payload, commitSha);

      await db
        .update(errorLogs)
        .set({ emailSent: true, emailSentAt: new Date() })
        .where(eq(errorLogs.fingerprint, fingerprint));
    }
  } catch (dbErr) {
    // Never throw from error logger — just log
    console.error("[ErrorLogger] DB error:", dbErr);
  }
}

// ============================================================
// Internal: send Gmail notification
// ============================================================
async function _sendEmail(
  fingerprint: string,
  severity: string,
  payload: ErrorReportPayload,
  commitSha?: string
): Promise<void> {
  const password = process.env.JUNIOR_EMAIL_PASSWORD;
  if (!password) {
    console.warn("[ErrorLogger] JUNIOR_EMAIL_PASSWORD not set, skipping email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: SENDER_EMAIL,
      pass: password,
    },
  });

  const emailPayload = JSON.stringify({
    fingerprint,
    appName: APP_NAME,
    severity,
    errorType: payload.errorType,
    message: payload.message,
    timestamp: new Date().toISOString(),
  });
  const signature = signEmailPayload(emailPayload);

  const subject = `[${severity}] ${APP_NAME} — ${payload.errorType}: ${payload.message.substring(0, 80)}`;

  const htmlBody = `
<h2>🚨 ${APP_NAME} Error Report</h2>
<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:monospace">
  <tr><th>Field</th><th>Value</th></tr>
  <tr><td>Severity</td><td><strong>${severity}</strong></td></tr>
  <tr><td>Error Type</td><td>${escapeHtml(payload.errorType)}</td></tr>
  <tr><td>Message</td><td>${escapeHtml(sanitizeForEmail(payload.message))}</td></tr>
  <tr><td>Fingerprint</td><td>${fingerprint}</td></tr>
  <tr><td>App</td><td>${APP_NAME}</td></tr>
  <tr><td>Repo</td><td>${REPO_PATH}</td></tr>
  <tr><td>GitHub</td><td><a href="https://github.com/${GITHUB_REPO}">https://github.com/${GITHUB_REPO}</a></td></tr>
  <tr><td>Commit</td><td>${commitSha ?? "N/A"}</td></tr>
  <tr><td>Environment</td><td>${payload.environment ?? process.env.NODE_ENV}</td></tr>
  <tr><td>URL</td><td>${escapeHtml(payload.url ?? "")}</td></tr>
  <tr><td>Request ID</td><td>${escapeHtml(payload.requestId ?? "")}</td></tr>
  <tr><td>User</td><td>${escapeHtml(payload.userEmail ?? payload.userId ?? "")}</td></tr>
  <tr><td>Browser</td><td>${escapeHtml(payload.browser ?? "")}</td></tr>
  <tr><td>Timestamp</td><td>${new Date().toISOString()}</td></tr>
  <tr><td>HMAC Signature</td><td><code>${signature}</code></td></tr>
</table>
${payload.stack ? `<h3>Stack Trace</h3><pre>${escapeHtml(sanitizeForEmail(payload.stack))}</pre>` : ""}
${payload.breadcrumbs ? `<h3>Breadcrumbs</h3><pre>${escapeHtml(JSON.stringify(payload.breadcrumbs, null, 2))}</pre>` : ""}
`;

  try {
    await transporter.sendMail({
      from: SENDER_EMAIL,
      to: RECIPIENT_EMAIL,
      subject,
      html: htmlBody,
    });
    console.warn(`[ErrorLogger] Email sent for fingerprint ${fingerprint}`);
  } catch (emailErr) {
    console.error("[ErrorLogger] Email send failed:", emailErr);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
