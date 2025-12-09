export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export function isForbiddenError(error: Error): boolean {
  return /^403: .*Forbidden/.test(error.message);
}
