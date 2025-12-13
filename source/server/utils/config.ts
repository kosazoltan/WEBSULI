/**
 * Get the base URL for the application
 * Uses environment variable based on NODE_ENV
 */
export function getBaseUrl(): string {
  // In DEVELOPMENT: Always prefer REPLIT_DEV_DOMAIN over CUSTOM_DOMAIN
  // In PRODUCTION: Prefer CUSTOM_DOMAIN (published app domain)
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment && process.env.REPLIT_DEV_DOMAIN) {
    // Development: Use Replit preview URL (*.replit.dev)
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }

  if (process.env.CUSTOM_DOMAIN) {
    // Production: Use custom domain (websuli.vip)
    return `https://${process.env.CUSTOM_DOMAIN}`;
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    // Fallback: Use Replit dev domain
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }

  // Final fallback
  // For local development on non-Replit environment
  if (!process.env.CUSTOM_DOMAIN && !process.env.REPLIT_DEV_DOMAIN) {
    const port = process.env.PORT || '5000';
    return `http://localhost:${port}`;
  }

  return process.env.BASE_URL || 'https://websuli.vip';
}

/**
 * Get the full URL for a material preview
 */
export function getMaterialPreviewUrl(materialId: string): string {
  return `${getBaseUrl()}/preview/${materialId}`;
}
