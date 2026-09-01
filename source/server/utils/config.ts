/**
 * Get the base URL for the application
 * Uses environment variable based on NODE_ENV
 */
export function getBaseUrl(): string {
  // Production: Use custom domain (websuli.vip)
  if (process.env.CUSTOM_DOMAIN) {
    return stripTrailingSlash(`https://${process.env.CUSTOM_DOMAIN}`);
  }

  // Fallback to BASE_URL if set
  if (process.env.BASE_URL) {
    return stripTrailingSlash(process.env.BASE_URL);
  }

  // For local development
  const port = process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

/**
 * Callers join paths onto the base URL with a literal '/', so a configured value like
 * "https://websuli.org/" would produce "https://websuli.org//preview/<id>" — a doubled
 * separator that breaks the client router and canonical/QR links.
 */
function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Get the full URL for a material preview
 */
export function getMaterialPreviewUrl(materialId: string): string {
  return `${getBaseUrl()}/preview/${materialId}`;
}

/**
 * BACKLOG T4 (2026-09-02): a tananyag-iframe (/dev/:id) originje.
 * A tananyag-HTML admin által feltöltött, scriptet futtató tartalom; ha az app originjéről
 * (websuli.vip) szolgáljuk ki `allow-same-origin` sandboxban, a script az app sütijeit /
 * localStorage-át / session-jét éri el. Külön originről (a Render szolgáltatás saját URL-je,
 * amit a Render a RENDER_EXTERNAL_URL változóban ad) a sandbox a tananyag SAJÁT originjét
 * adja — a mikrofon-engedély (allow="microphone") így is működik.
 * Üres string = same-origin (dev, vagy MATERIAL_ORIGIN="" kényszerítés).
 */
export function getMaterialOrigin(): string {
  if (process.env.MATERIAL_ORIGIN !== undefined) {
    return stripTrailingSlash(process.env.MATERIAL_ORIGIN);
  }
  if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    return stripTrailingSlash(process.env.RENDER_EXTERNAL_URL);
  }
  return '';
}
