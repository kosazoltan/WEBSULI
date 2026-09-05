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
  const scripts = trimmed.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of scripts) {
    const js = block.replace(/<\/?script[^>]*>/gi, "");
    if (js.trim().length < 10) continue;
    try {
      // Parse-only check: never executed.
      new Function(js);
    } catch (e) {
      problems.push(`JavaScript szintaktikai hiba a tananyagban: ${(e as Error).message} — a vezérlőgombok nem működnének.`);
      break;
    }
  }
  // Nyitott <script> záró nélkül = csonka.
  const openScripts = (trimmed.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) ?? []).length;
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
