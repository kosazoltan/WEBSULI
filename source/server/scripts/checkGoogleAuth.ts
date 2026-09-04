/**
 * Google OAuth Diagnostics Script
 * Run: npx tsx server/scripts/checkGoogleAuth.ts
 * 
 * Checks:
 * 1. Environment variables are set correctly
 * 2. BASE_URL is properly configured
 * 3. Callback URL matches Google Cloud Console
 */

import { config } from 'dotenv';
import { logger } from "../lib/logger";
config();

logger.info('\n🔍 Google OAuth Diagnostics\n' + '='.repeat(50));

// Check required environment variables
const vars = {
    'GOOGLE_CLIENT_ID': process.env.GOOGLE_CLIENT_ID,
    'GOOGLE_CLIENT_SECRET': process.env.GOOGLE_CLIENT_SECRET,
    'SESSION_SECRET': process.env.SESSION_SECRET,
    'BASE_URL': process.env.BASE_URL,
    'NODE_ENV': process.env.NODE_ENV,
    'ADMIN_EMAIL': process.env.ADMIN_EMAIL,
};

logger.info('\n📋 Environment Variables:');
for (const [key, value] of Object.entries(vars)) {
    if (value) {
        // Mask secrets
        if (key.includes('SECRET') || key.includes('CLIENT_ID')) {
            logger.info(`  ✅ ${key}: ${value.substring(0, 10)}...*** (set)`);
        } else {
            logger.info(`  ✅ ${key}: ${value}`);
        }
    } else {
        logger.info(`  ❌ ${key}: NOT SET`);
    }
}

// Determine base URL
const baseUrl = process.env.BASE_URL ||
    (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 'http://localhost:5000');

logger.info('\n🌐 OAuth Configuration:');
logger.info(`  Base URL: ${baseUrl}`);
logger.info(`  Callback URL: ${baseUrl}/auth/google/callback`);

// Check if production mode
const isProduction = process.env.NODE_ENV === 'production';
logger.info('\n🔒 Session Cookie Settings:');
logger.info(`  secure: ${isProduction}`);
logger.info(`  sameSite: lax`);
logger.info(`  httpOnly: true`);
logger.info(`  proxy: ${isProduction}`);

logger.info('\n⚠️  Google Cloud Console Checklist:');
logger.info('  1. Go to https://console.cloud.google.com/apis/credentials');
logger.info('  2. Select your OAuth 2.0 Client ID');
logger.info('  3. Verify "Authorized redirect URIs" includes:');
logger.info(`     ${baseUrl}/auth/google/callback`);
logger.info('  4. Verify "Authorized JavaScript origins" includes:');
logger.info(`     ${baseUrl.replace(/\/+$/, '')}`);

if (baseUrl.includes('websuli.vip')) {
    logger.info('\n  Also add these URIs if using multiple domains:');
    logger.info('     https://websuli.vip/auth/google/callback');
    logger.info('     https://www.websuli.vip/auth/google/callback');
    logger.info('     https://websuli.org/auth/google/callback');
    logger.info('     https://www.websuli.org/auth/google/callback');
}

logger.info('\n🔧 Common Issues:');
logger.info('  1. Callback URL mismatch - must match EXACTLY (including https vs http)');
logger.info('  2. Missing sameSite cookie attribute - causes session loss on redirect');
logger.info('  3. secure:true on HTTP - causes cookie not to be set');
logger.info('  4. Trust proxy not configured - wrong protocol detection behind Nginx');

logger.info('\n' + '='.repeat(50));
logger.info('✅ Diagnostics complete\n');
