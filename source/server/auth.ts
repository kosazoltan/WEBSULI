import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import express, { Express, RequestHandler } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { User } from "@shared/schema";

import { Strategy as GoogleStrategy } from "passport-google-oauth20";

export function setupAuth(app: Express) {
    const sessionSecret = process.env.SESSION_SECRET;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    // Determine the base URL dynamically or fallback to localhost
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';


    if (!sessionSecret) {
        throw new Error("SESSION_SECRET must be set");
    }

    // Determine if we're in production (HTTPS) environment
    const isProduction = process.env.NODE_ENV === 'production';

    // Trust proxy for correct IP and protocol detection behind Nginx
    app.set('trust proxy', 1);

    app.use(session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        // CRITICAL: Proper cookie settings for Google OAuth
        cookie: {
            // SECURITY: secure=true in production (HTTPS now configured on Nginx)
            // Nginx redirects HTTP->HTTPS so all production traffic is HTTPS
            secure: isProduction,
            // Session duration: 24 hours
            maxAge: 1000 * 60 * 60 * 24,
            // CRITICAL for Google OAuth: 'lax' allows cookie to be sent on redirect from Google
            // 'strict' would block the cookie on the OAuth callback redirect
            sameSite: 'lax',
            // SECURITY: httpOnly prevents JavaScript access to session cookie
            httpOnly: true,
        },
        // CRITICAL: Required when behind a reverse proxy (Nginx, Hostinger)
        // This ensures session works correctly with X-Forwarded-Proto header
        proxy: isProduction,
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    passport.use(new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, done) => {
        try {
            console.log(`[AUTH] Login attempt for ${email}`);
            const user = await storage.getUserByEmail(email);

            if (!user || !user.password) {
                console.log(`[AUTH] User not found or no password`);
                return done(null, false, { message: "Hibás email vagy jelszó" });
            }

            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                console.log(`[AUTH] Invalid password`);
                return done(null, false, { message: "Hibás email vagy jelszó" });
            }

            console.log(`[AUTH] Login success for ${email}`);
            return done(null, user);
        } catch (err) {
            console.error(`[AUTH] Error during authentication:`, err);
            return done(err);
        }
    }));

    if (googleClientId && googleClientSecret) {
        console.log('[AUTH] Setting up Google OAuth Strategy...');
        console.log(`[AUTH] Callback URL: ${baseUrl}/auth/google/callback`);

        passport.use(new GoogleStrategy({
            clientID: googleClientId,
            clientSecret: googleClientSecret,
            callbackURL: `${baseUrl}/auth/google/callback`,
            scope: ['profile', 'email']
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                console.log(`[AUTH] Google login attempt for ${profile.emails?.[0]?.value}`);
                const email = profile.emails?.[0]?.value;

                if (!email) {
                    return done(new Error("No email found in Google profile"));
                }

                // Check if user already exists to preserve their admin status
                const existingUser = await storage.getUserByEmail(email);

                // Upsert user with Google ID
                const user = await storage.upsertUser({
                    googleId: profile.id,
                    email: email,
                    firstName: profile.name?.givenName || '',
                    lastName: profile.name?.familyName || '',
                    profileImageUrl: profile.photos?.[0]?.value,
                    // Only set isAdmin if: 1) new user AND matches ADMIN_EMAIL, or 2) existing user keeps their status
                    isAdmin: existingUser ? existingUser.isAdmin : (email === process.env.ADMIN_EMAIL)
                });

                return done(null, user);
            } catch (err) {
                console.error(`[AUTH] Error during Google authentication:`, err);
                return done(err);
            }
        }));

        // Google Auth Routes
        app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

        app.get('/auth/google/callback',
            passport.authenticate('google', { failureRedirect: '/login' }),
            (req, res) => {
                // Successful authentication, redirect home or admin
                console.log('[AUTH] Google auth successful, redirecting...');
                res.redirect('/admin');
            }
        );
    } else {
        console.warn('[AUTH] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing. Google Auth disabled.');
    }

    passport.serializeUser((user: any, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id: string, done) => {
        try {
            const user = await storage.getUser(id);
            done(null, user);
        } catch (err) {
            done(err);
        }
    });

    // Login route handling text/plain for robustness
    app.post("/api/login", express.text(), (req, res, next) => {
        // Manual parsing if body is string (text/plain workaround)
        if (typeof req.body === 'string') {
            try {
                req.body = JSON.parse(req.body);
            } catch (e) {
                console.error("[AUTH] JSON parse error:", e);
            }
        }

        if (!req.body.email || !req.body.password) {
            return res.status(400).json({ message: "Email és jelszó kötelező" });
        }

        passport.authenticate("local", (err: any, user: User, info: any) => {
            if (err) return next(err);
            if (!user) return res.status(401).json({ message: info?.message || "Authentication failed" });
            req.login(user, (err) => {
                if (err) return next(err);
                return res.json(user);
            });
        })(req, res, next);
    });

    app.post("/api/logout", (req, res, next) => {
        req.logout((err) => {
            if (err) return next(err);
            res.sendStatus(200);
        });
    });

    // NOTE: /api/auth/user is now handled in routes.ts to ensure
    // isAdmin is always fetched fresh from database (not stale session data)
}

// Middleware: Require authentication
export const isAuthenticated: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: "Unauthorized" });
};

// Middleware: Require admin authentication
export const isAuthenticatedAdmin: RequestHandler = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const user = req.user as any;
    // Check isAdmin flag from database user record
    if (!user.isAdmin) {
        return res.status(403).json({ message: "Forbidden - Admin access required" });
    }
    next();
};
