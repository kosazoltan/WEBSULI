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

  return email
    // SECURITY: strip control characters first. A bare CR/LF in a value that reaches an
    // e-mail recipient/header field or a log line is a header- or log-injection primitive.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>'"]/g, '')
    .trim();
}
