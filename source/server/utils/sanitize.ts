import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitizes HTML content allowing only safe tags and attributes.
 * Used for rich text fields like descriptions where some HTML formatting is needed.
 * 
 * @param dirty - Raw HTML string that may contain malicious code
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'span', 'div'],
    ALLOWED_ATTR: ['class'],
    KEEP_CONTENT: true,
  });
}

/**
 * Escapes all HTML entities to prevent XSS attacks.
 * Used for plain text fields like titles, names, etc.
 * 
 * @param text - Plain text that may contain HTML characters
 * @returns HTML-escaped string safe for embedding in HTML
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitizes email addresses to prevent injection attacks.
 * 
 * @param email - Email address string
 * @returns Sanitized email safe for use in logs and emails
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  
  return email.replace(/[<>'"]/g, '');
}

/**
 * Sanitizes user agent strings to prevent log injection.
 * 
 * @param userAgent - User agent string from HTTP headers
 * @returns Sanitized user agent safe for logging and display
 */
export function sanitizeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return '';
  
  return userAgent
    .replace(/[<>'"]/g, '')
    .substring(0, 500);
}

/**
 * Sanitizes URLs to prevent injection attacks in HTML attributes.
 * Validates URL format and escapes dangerous characters.
 * 
 * @param url - URL string to sanitize
 * @returns Sanitized URL safe for use in HTML href attributes
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  try {
    // Parse URL to validate format
    const parsed = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    
    // Return the validated URL with HTML entities escaped
    return url
      .replace(/[<>'"]/g, (char) => {
        switch (char) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case "'": return '&#x27;';
          default: return char;
        }
      });
  } catch (error) {
    // Invalid URL format
    return '';
  }
}
