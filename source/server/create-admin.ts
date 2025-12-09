import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Read args
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.error("Usage: npm run create-admin <email> <password>");
    process.exit(1);
}

async function createAdmin() {
    console.log(`Creating admin user: ${email}`);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingUser.length > 0) {
        console.log("User exists, updating password and admin status...");
        await db.update(users)
            .set({
                password: hashedPassword,
                isAdmin: true,
                updatedAt: new Date()
            })
            .where(eq(users.email, email));
    } else {
        console.log("Creating new user...");
        await db.insert(users).values({
            email,
            password: hashedPassword,
            isAdmin: true,
            firstName: "Admin",
            lastName: "User",
            isBanned: false
        });
    }

    console.log("✅ Admin user setup complete.");
    process.exit(0);
}

createAdmin().catch(console.error);
