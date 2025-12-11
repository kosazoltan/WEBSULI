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
config();

console.log('\n🔍 Google OAuth Diagnostics\n' + '='.repeat(50));

// Check required environment variables
const vars = {
    'GOOGLE_CLIENT_ID': process.env.GOOGLE_CLIENT_ID,
    'GOOGLE_CLIENT_SECRET': process.env.GOOGLE_CLIENT_SECRET,
    'SESSION_SECRET': process.env.SESSION_SECRET,
    'BASE_URL': process.env.BASE_URL,
    'NODE_ENV': process.env.NODE_ENV,
    'ADMIN_EMAIL': process.env.ADMIN_EMAIL,
};

console.log('\n📋 Environment Variables:');
for (const [key, value] of Object.entries(vars)) {
    if (value) {
        // Mask secrets
        if (key.includes('SECRET') || key.includes('CLIENT_ID')) {
            console.log(`  ✅ ${key}: ${value.substring(0, 10)}...*** (set)`);
        } else {
            console.log(`  ✅ ${key}: ${value}`);
        }
    } else {
        console.log(`  ❌ ${key}: NOT SET`);
    }
}

// Determine base URL
const baseUrl = process.env.BASE_URL ||
    (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 'http://localhost:5000');

console.log('\n🌐 OAuth Configuration:');
console.log(`  Base URL: ${baseUrl}`);
console.log(`  Callback URL: ${baseUrl}/auth/google/callback`);

// Check if production mode
const isProduction = process.env.NODE_ENV === 'production';
console.log('\n🔒 Session Cookie Settings:');
console.log(`  secure: ${isProduction}`);
console.log(`  sameSite: lax`);
console.log(`  httpOnly: true`);
console.log(`  proxy: ${isProduction}`);

console.log('\n⚠️  Google Cloud Console Checklist:');
console.log('  1. Go to https://console.cloud.google.com/apis/credentials');
console.log('  2. Select your OAuth 2.0 Client ID');
console.log('  3. Verify "Authorized redirect URIs" includes:');
console.log(`     ${baseUrl}/auth/google/callback`);
console.log('  4. Verify "Authorized JavaScript origins" includes:');
console.log(`     ${baseUrl.replace(/\/+$/, '')}`);

if (baseUrl.includes('websuli.vip')) {
    console.log('\n  Also add these URIs if using multiple domains:');
    console.log('     https://websuli.vip/auth/google/callback');
    console.log('     https://www.websuli.vip/auth/google/callback');
    console.log('     https://websuli.org/auth/google/callback');
    console.log('     https://www.websuli.org/auth/google/callback');
}

console.log('\n🔧 Common Issues:');
console.log('  1. Callback URL mismatch - must match EXACTLY (including https vs http)');
console.log('  2. Missing sameSite cookie attribute - causes session loss on redirect');
console.log('  3. secure:true on HTTP - causes cookie not to be set');
console.log('  4. Trust proxy not configured - wrong protocol detection behind Nginx');

console.log('\n' + '='.repeat(50));
console.log('✅ Diagnostics complete\n');
