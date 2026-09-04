// Augment Express Request and User types for Passport integration
import "express-session";

declare module "express-session" {
  interface SessionData {
    /**
     * LS-0a: sanitized same-origin relative path the user should return to after a
     * successful Google login. Written by `GET /auth/google`, consumed (and cleared)
     * by the OAuth callback.
     */
    oauthReturnTo?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
    interface User {
      id: string;
      googleId: string | null;
      email: string | null;
      password: string | null;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      isAdmin: boolean;
      isBanned: boolean;
      lastSeenAt: Date | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    }
  }
}

export {};
