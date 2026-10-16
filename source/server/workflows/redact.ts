/**
 * Titok-kitakarás (docs/specs/2026-10-16-egy-futas.md, S4b: a kivezetett orkesztrátorból áthelyezve, változatlanul). A tantárgyi
 * memória és minden naplózott szöveg ezen megy át.
 */
/** Titok-szerű minta soha nem kerül promptba vagy naplóba (kulcs, token, jelszó). */
export function redactSecrets(text: string): string {
  // Review #190: a JSON-os/idézőjeles kulcs-érték és a szabványos „Authorization: Bearer …” is; nincs literál „$1”.
  return text
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\bxai-[A-Za-z0-9]{12,}\b/g, "[REDACTED]")
    .replace(/\bBearer\s*[:=]?\s*[A-Za-z0-9._~+/-]{8,}=*/g, "Bearer [REDACTED]")
    .replace(/(["']?(?:api[_-]?key|access[_-]?token|token|password|secret|jelszó)["']?\s*[:=]\s*)(["']?)[^\s"',}]+/giu, "$1$2[REDACTED]");
}
