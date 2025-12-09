import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import express, { Express, RequestHandler } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { User } from "@shared/schema";

export function setupAuth(app: Express) {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
        throw new Error("SESSION_SECRET must be set");
    }

    app.use(session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        // Secure false to prevent redirect loops behind proxy without proper headers
        cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
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

    app.get("/api/auth/user", (req, res) => {
        if (req.isAuthenticated()) {
            res.json(req.user);
        } else {
            res.sendStatus(401);
        }
    });
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
