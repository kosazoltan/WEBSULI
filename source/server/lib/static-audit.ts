/**
 * Static Audit — 6 checks
 * TSC, as any, Drizzle schema, env vars, console.log, error-mailer integration
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface AuditCheck {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  details: string;
}

const ROOT = path.resolve(process.cwd());

export async function runStaticAudit(): Promise<AuditCheck[]> {
  const results: AuditCheck[] = [];

  // 1. TSC check
  try {
    execSync("npx tsc --noEmit", { cwd: ROOT, stdio: "pipe", timeout: 60000 });
    results.push({ name: "TSC", status: "PASS", details: "0 TypeScript errors" });
  } catch (err: unknown) {
    const output = (err as { stdout?: Buffer; stderr?: Buffer }).stdout?.toString() ?? "";
    const errorCount = (output.match(/error TS/g) ?? []).length;
    results.push({ name: "TSC", status: "FAIL", details: `${errorCount} TypeScript error(s) found` });
  }

  // 2. as any usage
  try {
    const out = execSync(
      `git grep -r "as any" --include="*.ts" --include="*.tsx" -l`,
      { cwd: ROOT, stdio: "pipe", timeout: 30000 }
    ).toString().trim();
    const files = out ? out.split("\n").filter(Boolean) : [];
    results.push({
      name: "as any",
      status: files.length > 10 ? "WARN" : "PASS",
      details: files.length === 0 ? "No `as any` found" : `${files.length} file(s) contain \`as any\``,
    });
  } catch {
    results.push({ name: "as any", status: "PASS", details: "No `as any` found" });
  }

  // 3. Drizzle schema — check errorLogs table exists
  try {
    const schemaContent = fs.readFileSync(path.join(ROOT, "shared/schema.ts"), "utf-8");
    const hasErrorLogs = schemaContent.includes("errorLogs");
    results.push({
      name: "Drizzle schema",
      status: hasErrorLogs ? "PASS" : "FAIL",
      details: hasErrorLogs ? "errorLogs table found in schema" : "errorLogs table MISSING from schema",
    });
  } catch {
    results.push({ name: "Drizzle schema", status: "FAIL", details: "Could not read schema.ts" });
  }

  // 4. Env vars
  const requiredEnvVars = ["DATABASE_URL", "ERRORLOG_HMAC_SECRET", "JUNIOR_EMAIL_PASSWORD"];
  const missingEnv = requiredEnvVars.filter((v) => {
    if (v === "DATABASE_URL") {
      return !process.env["DATABASE_URL"] && !process.env["NEON_DATABASE_URL"];
    }
    return !process.env[v];
  });
  results.push({
    name: "Env vars",
    status: missingEnv.length === 0 ? "PASS" : "WARN",
    details: missingEnv.length === 0
      ? "All required env vars present"
      : `Missing: ${missingEnv.join(", ")}`,
  });

  // 5. console.log usage in server code
  try {
    const out = execSync(
      `git grep -r "console\\.log" --include="*.ts" -- server/`,
      { cwd: ROOT, stdio: "pipe", timeout: 30000 }
    ).toString().trim();
    const lines = out ? out.split("\n").filter(Boolean) : [];
    results.push({
      name: "console.log",
      status: lines.length > 20 ? "WARN" : "PASS",
      details: lines.length === 0 ? "No console.log in server" : `${lines.length} console.log occurrence(s) in server/`,
    });
  } catch {
    results.push({ name: "console.log", status: "PASS", details: "No console.log in server" });
  }

  // 6. error-mailer integration check
  try {
    const hasErrorMailer = fs.existsSync(path.join(ROOT, "server/lib/error-mailer.ts"));
    const hasErrorRoute = fs.existsSync(path.join(ROOT, "server/routes/error-report.ts"));
    results.push({
      name: "ErrorLogger integration",
      status: hasErrorMailer && hasErrorRoute ? "PASS" : "FAIL",
      details: `error-mailer.ts: ${hasErrorMailer ? "✓" : "✗"} | error-report route: ${hasErrorRoute ? "✓" : "✗"}`,
    });
  } catch {
    results.push({ name: "ErrorLogger integration", status: "FAIL", details: "Check failed" });
  }

  return results;
}
