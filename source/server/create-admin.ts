import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./lib/logger";
import { isAllowlistedAdminEmail } from "./lib/admin-access";
import { maskEmail } from "./lib/mask-email";

// Read args
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    logger.error("Usage: npm run create-admin <email> <password>");
    process.exit(1);
}

async function createAdmin() {
    logger.info(`Creating admin user: ${email}`);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingUser.length > 0) {
        logger.info("User exists, updating password and admin status...");
        await db.update(users)
            .set({
                password: hashedPassword,
                isAdmin: true,
                updatedAt: new Date()
            })
            .where(eq(users.email, email));
    } else {
        logger.info("Creating new user...");
        await db.insert(users).values({
            email,
            password: hashedPassword,
            isAdmin: true,
            firstName: "Admin",
            lastName: "User",
            isBanned: false
        });
    }

    logger.info("✅ Admin user setup complete.");
    if (!isAllowlistedAdminEmail(email)) logger.warn(`FIGYELEM: ${maskEmail(email)} nincs az admin-engedélylistán (ADMIN_ALLOWLIST, alapból ADMIN_EMAIL): az admin-jelző beállt, de admin-jogot csak a listára vétel után ad (JM7c-1, terv 10.4a).`);
    process.exit(0);
}

createAdmin().catch((error: unknown) => logger.error(error));
