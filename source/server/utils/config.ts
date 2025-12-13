/**
 * Get the base URL for the application
 * Uses environment variable based on NODE_ENV
 */
export function getBaseUrl(): string {
  // Production: Use custom domain (websuli.vip)
  if (process.env.CUSTOM_DOMAIN) {
    return `https://${process.env.CUSTOM_DOMAIN}`;
  }

  // Fallback to BASE_URL if set
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // For local development
  const port = process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

/**
 * Get the full URL for a material preview
 */
export function getMaterialPreviewUrl(materialId: string): string {
  return `${getBaseUrl()}/preview/${materialId}`;
}
