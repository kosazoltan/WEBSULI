// Augment Express Request and User types for Passport integration
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
