import { parse } from "acorn";
/**
 * #159 — deterministic verification agent for improved HTML (end of pipeline).
 *
 * Measured root cause (hőtan, 2026-09-05): the improve run saved and applied a
 * TRUNCATED model output — no </html>, the tab-switch JS cut mid-line, so the
 * IIFE never executed, window.showTab never existed and every control button
 * was dead. The old gate only checked length>100 and '<html'.
 *
 * This module is the fail-closed gate: a result that fails here must NEVER be
 * saved as applicable. Deterministic on purpose — a checker that asks another
 * model whether the HTML "looks complete" can hallucinate a pass; parsing the
 * document and the script cannot.
 */

export type HtmlVerification = { ok: boolean; problems: string[] };

export function verifyImprovedHtml(html: string): HtmlVerification {
  const problems: string[] = [];
  const trimmed = html.trim();

  // 1. Teljes dokumentum — a csonka kimenet fő jele a hiányzó lezárás.
  if (!/<!DOCTYPE|<html/i.test(trimmed)) {
    problems.push("Nincs HTML-dokumentum kezdet (<!DOCTYPE vagy <html>) — a kimenet nem tananyag.");
  }
  if (!/<\/html>\s*$/i.test(trimmed)) {
    problems.push("A dokumentum nem </html>-lel zárul — a kimenet csonka (félbeszakadt generálás).");
  }
  if (!/<\/body>/i.test(trimmed)) {
    problems.push("Hiányzik a </body> záró tag — a kimenet csonka.");
  }

  // 2. Minden script-blokk szintaktikailag ép JS — egy SyntaxError az IIFE-ben
  //    minden window.* exportot megöl, az összes gomb halott lesz.
  let debugFound = false;
  const scripts = trimmed.match(/<script(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of scripts) {
    if (/type\s*=\s*["'](?:application\/(?:ld\+)?json|importmap)["']/i.test(block.slice(0, block.indexOf(">") + 1))) continue;
    const js = block.replace(/<\/?script[^>]*>/gi, "");
    if (js.trim().length < 10) continue;
    try {
      // Parse-only check: never executed.
      const ast = parse(js, { ecmaVersion: "latest", sourceType: /type\s*=\s*["']module["']/i.test(block) ? "module" : "script", allowReturnOutsideFunction: true });
      if (hasDebugCode(ast)) debugFound = true;
    } catch (e) {
      problems.push(`JavaScript szintaktikai hiba a tananyagban: ${(e as Error).message} — a vezérlőgombok nem működnének.`);
      break;
    }
  }
  // Nyitott <script> záró nélkül = csonka.
  const openScripts = (trimmed.match(/<script(?![^>]*\ssrc\s*=)[^>]*>/gi) ?? []).length;
  const closeScripts = (trimmed.match(/<\/script>/gi) ?? []).length;
  if (openScripts > closeScripts) {
    problems.push("Lezáratlan <script> blokk — a kimenet csonka.");
  }

  // 3. Minden onclick-ben hivatkozott függvénynek léteznie kell window.*-on
  //    (vagy globális function deklarációként) — különben a gomb halott.
  const onclickFns = new Set(
    (trimmed.match(/onclick="([A-Za-z_$][\w$]*)\s*\(/g) ?? []).map((m) =>
      m.replace(/onclick="|[(]/g, "").trim(),
    ),
  );
  for (const fn of onclickFns) {
    const exported =
      trimmed.includes(`window.${fn}`) || new RegExp(`function\\s+${fn}\\s*\\(`).test(trimmed);
    if (!exported) {
      problems.push(`A(z) ${fn} gomb-függvény nincs exportálva (window.${fn} hiányzik) — a gomb halott lenne.`);
    }
  }

  // 4. Tiltott natív dialógusok (a v7.1 prompt is tiltja; itt kikényszerítve).
  if (/\balert\s*\(|\bconfirm\s*\(|(?<![\w.])prompt\s*\(/.test(stripStrings(trimmed))) {
    problems.push("Natív alert()/confirm()/prompt() maradt a kódban — HTML modal kötelező.");
  }

  // 5. Debug-kód tilos (v7.5, tulajdonosi utasítás 2026-10-14): console.* és debugger.
  //    AST-alapú (a 2. pont parse-eredményéből): string, komment, regex-literál vagy
  //    <pre> kódpélda nem számít; console.x, console["x"], console?.x és debugger igen.
  if (debugFound) {
    problems.push("Debug-kód (console.* / debugger) maradt a tananyag JavaScriptjében — a kiadott HTML-ben tilos (v7.5).");
  }

  return { ok: problems.length === 0, problems };
}

/** Kommentek és string-literálok kiürítése, hogy a tiltott-hívás keresés ne kapjon álpozitívot. */
function stripStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/** Futtatható debug-kód az AST-ben: debugger utasítás vagy bármilyen console-tagelérés. */
function hasDebugCode(root: unknown): boolean {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    const n = node as { type?: unknown; object?: { type?: unknown; name?: unknown; property?: { name?: unknown } } };
    if (n.type === "DebuggerStatement") return true;
    if (n.type === "MemberExpression" && n.object) {
      if (n.object.type === "Identifier" && n.object.name === "console") return true;
      if (n.object.type === "MemberExpression" && n.object.property?.name === "console") return true;
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "range") continue;
      const v = (node as Record<string, unknown>)[key];
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return false;
}
